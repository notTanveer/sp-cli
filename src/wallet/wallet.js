import { mnemonicToSeedSync, generateMnemonic } from 'bip39';
import { initEccLib, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import {BIP32Factory} from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Buffer } from 'buffer';
import { fromOutputScript, toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { ECPairFactory } from 'ecpair';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { encrypt, decrypt } from 'bip38';
import { createOutputs, encodeSilentPaymentAddress, scanOutputsWithTweak, } from '../core/index.js';
import { Coin, CoinSelector } from './index.js';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const DEFAULT_ENCRYPTION_PASSWORD = '12345678';
const DEFAULT_LOOKAHEAD = 10;
export class Wallet {
    db;
    network;
    masterKey;
    receiveDepth = 0;
    changeDepth = 0;
    lookahead;
    constructor(config) {
        this.db = config.db;
        this.network = config.networkClient;
        this.lookahead = config.lookahead ?? DEFAULT_LOOKAHEAD;
    }
    async init(params) {
        const { mnemonic, password } = params;
        await this.db.open();
        if (!mnemonic) {
            const freshMnemonic = generateMnemonic();
            const seed = mnemonicToSeedSync(freshMnemonic).toString('hex');
            this.masterKey = bip32.fromSeed(Buffer.from(seed, 'hex'));
            await this.setPassword(password ?? DEFAULT_ENCRYPTION_PASSWORD);
            for (let i = 0; i < this.lookahead; i++) {
                await this.deriveAddress(`m/84'/0'/0'/0/${i}`);
            }
        } else {
            const seed = mnemonicToSeedSync(mnemonic).toString('hex');
            this.masterKey = bip32.fromSeed(Buffer.from(seed, 'hex'));
            this.setPassword(password ?? DEFAULT_ENCRYPTION_PASSWORD);
            for (let i = 0; i < this.lookahead; i++) {
                await this.deriveAddress(`m/84'/0'/0'/0/${i}`);
            }
        }
    }
    async close() {
        await this.db.setReceiveDepth(this.receiveDepth);
        await this.db.setChangeDepth(this.changeDepth);
        await this.db.close();
    }
    async setPassword(newPassword) {
        if (!this.masterKey) {
            throw new Error('Wallet not initialized. Please call src.init()');
        }
        else {
            const encryptedPrivateKey = encrypt(this.masterKey.privateKey, false, newPassword);
            const encryptedChainCode = encrypt(this.masterKey.chainCode, false, newPassword);
            await this.db.setMasterKey(encryptedPrivateKey, encryptedChainCode);
        }
    }
    async deriveAddress(path) {
        const child = this.masterKey.derivePath(path);
        const { address } = payments.p2wpkh({
            pubkey: child.publicKey,
            network: this.network.network,
        });
        await this.db.saveAddress(address, path);
        return address;
    }
    async deriveReceiveAddress() {
        const nextPath = `m/84'/0'/0'/0/${this.receiveDepth + this.lookahead}`;
        await this.deriveAddress(nextPath);
        const address = await this.db.getAddressFromPath(`m/84'/0'/0'/0/${this.receiveDepth}`);
        this.receiveDepth++;
        return address;
    }
    async deriveChangeAddress() {
        const path = `m/84'/0'/0'/1/${this.changeDepth}`;
        const address = await this.deriveAddress(path);
        this.changeDepth++;
        return address;
    }
    async scan() {
        const addresses = await this.db.getAllAddresses();
        const coins = (await Promise.all(addresses.map((address) => this.network.getUTXOs(address)))).reduce((acc, utxos) => [...acc, ...utxos], []);
        await this.db.saveUnspentCoins(coins);
    }
    async getBalance() {
        const coins = await this.db.getUnspentCoins();
        return coins.reduce((acc, coin) => acc + coin.value, 0);
    }
    async signTransaction(psbt, coins) {
        for (let index = 0; index < coins.length; index++) {
            const path = await this.db.getPathFromAddress(coins[index].address);
            const privateKey = this.masterKey.derivePath(path);
            psbt.signInput(index, privateKey);
        }
    }
    async createAndSignTransaction(addresses) {
        const totalAmount = addresses.reduce((acc, address) => acc + address.amount, 0);
        const coins = await this.db.getUnspentCoins();
        const totalBalance = coins.reduce((acc, coin) => acc + coin.value, 0);
        if (totalAmount > totalBalance) {
            throw new Error(`Insufficient funds. Available: ${totalBalance} sats, Requested: ${totalAmount} sats`);
        }
        const tx = new Transaction();
        const psbt = new Psbt({ network: this.network.network });
        addresses.forEach(({ address, amount }) => {
            tx.addOutput(toOutputScript(address, this.network.network), amount);
            psbt.addOutput({
                address,
                value: amount,
            });
        });
        const coinSelector = new CoinSelector(await this.network.getFeeRate());
        const { coins: selectedCoins, change } = coinSelector.select(coins, tx);
        if (change > 0) {
            const changeAddress = await this.deriveChangeAddress();
            psbt.addOutput({
                address: changeAddress,
                value: change,
            });
        }
        for (const coin of selectedCoins) {
            psbt.addInput(coin.toInput(this.network.network));
        }
        await this.signTransaction(psbt, selectedCoins);
        if (!psbt.validateSignaturesOfAllInputs((pubkey, msghash, signature) => ECPair.fromPublicKey(pubkey).verify(msghash, signature))) {
            throw new Error('Invalid signature');
        }
        psbt.finalizeAllInputs();
        return psbt.extractTransaction();
    }
    async send(address, amount) {
        const tx = await this.createAndSignTransaction([{ address, amount }]);
        await this.network.broadcast(tx.toHex());
        return tx.getId();
    }
    async sendToSilentAddress(address, amount) {
        const coins = await this.db.getUnspentCoins();
        const totalBalance = coins.reduce((acc, coin) => acc + coin.value, 0);
        if (amount > totalBalance) {
            throw new Error(`Insufficient funds. Available: ${totalBalance} sats, Requested: ${amount} sats`);
        }
        const dummyOutputScript = Buffer.from('512030d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c', 'hex');
        const dummyTx = new Transaction();
        const dummyPsbt = new Psbt({ network: this.network.network });
        dummyTx.addOutput(dummyOutputScript, amount);
        dummyPsbt.addOutput({
            address: fromOutputScript(dummyOutputScript, this.network.network),
            value: amount,
        });
        const coinSelector = new CoinSelector(await this.network.getFeeRate());
        const { coins: selectedCoins, change } = coinSelector.select(coins, dummyTx);
        const privateKeys = (await Promise.all(selectedCoins.map((coin) => this.db.getPathFromAddress(coin.address)))).map((path) => this.masterKey.derivePath(path));
        const smallestOutpointCoin = selectedCoins.reduce((acc, coin) => {
            const comp = Buffer.from(coin.txid, 'hex')
                .reverse()
                .compare(Buffer.from(acc.txid, 'hex').reverse());
            if (comp < 0 || (comp === 0 && coin.vout < acc.vout))
                return coin;
            return acc;
        }, selectedCoins[0]);
        const [{ script: internalPubKey }] = createOutputs(privateKeys.map((key) => ({
            key: key.privateKey.toString('hex'),
            isXOnly: false,
        })), {
            txid: smallestOutpointCoin.txid,
            vout: smallestOutpointCoin.vout,
        }, [{ address, amount }], this.network.network);
        const psbt = new Psbt({ network: this.network.network });
        psbt.addOutput({
            address: payments.p2tr({
                pubkey: toXOnly(internalPubKey),
                network: this.network.network,
            }).address,
            value: amount,
        });
        if (change > 0) {
            const changeAddress = await this.deriveChangeAddress();
            psbt.addOutput({
                address: changeAddress,
                value: change,
            });
        }
        for (let index = 0; index < selectedCoins.length; index++) {
            psbt.addInput(selectedCoins[index].toInput(this.network.network));
            psbt.signInput(index, privateKeys[index]);
        }
        if (!psbt.validateSignaturesOfAllInputs((pubkey, msghash, signature) => ECPair.fromPublicKey(pubkey).verify(msghash, signature))) {
            throw new Error('Invalid signature');
        }
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        await this.network.broadcast(tx.toHex());
        return tx.getId();
    }
    getCoinType() {
        return this.network.network.bech32 === bitcoin.bech32 ? 0 : 1;
    }
    async generateSilentPaymentAddress() {
        let address = await this.db.getSilentPaymentAddress();
        if (address)
            return address;
        const spendKey = this.masterKey.derivePath(`m/352'/${this.getCoinType()}'/0'/0'/0`);
        const scanKey = this.masterKey.derivePath(`m/352'/${this.getCoinType()}'/0'/1'/0`);
        address = encodeSilentPaymentAddress(scanKey.publicKey, spendKey.publicKey, this.network.network);
        await this.db.saveSilentPaymentAddress(address);
        return address;
    }
    matchSilentBlockOutputs(silentBlock, scanPrivateKey, spendPublicKey) {
        const matchedUTXOs = [];
        for (const transaction of silentBlock.transactions) {
            const outputs = transaction.outputs;
            if (outputs.length === 0)
                continue;
            const outputPubKeys = outputs.map((output) => Buffer.from('02' + output.pubKey, 'hex'));
            const scanTweak = Buffer.from(transaction.scanTweak, 'hex');
            const matchedOutputs = scanOutputsWithTweak(scanPrivateKey, spendPublicKey, scanTweak, outputPubKeys);
            if (matchedOutputs.size === 0)
                continue;
            for (const pubKeyHex of matchedOutputs.keys()) {
                const output = outputs.find((output) => output.pubKey === pubKeyHex.slice(2));
                if (output) {
                    matchedUTXOs.push(new Coin({
                        txid: transaction.txid,
                        vout: output.vout,
                        value: output.value,
                        address: payments.p2tr({
                            pubkey: toXOnly(Buffer.from('02' + output.pubKey, 'hex')),
                            network: this.network.network,
                        }).address,
                        status: {
                            isConfirmed: true,
                        },
                    }));
                }
            }
        }
        return matchedUTXOs;
    }
    async scanSilentBlock(silentBlock) {
        const scanKey = this.masterKey.derivePath(`m/352'/${this.getCoinType()}'/0'/1'/0`);
        const spendKey = this.masterKey.derivePath(`m/352'/${this.getCoinType()}'/0'/0'/0`);
        const matchedUTXOs = this.matchSilentBlockOutputs(silentBlock, scanKey.privateKey, spendKey.publicKey);
        if (matchedUTXOs.length) {
            await this.db.saveUnspentCoins(matchedUTXOs);
        }
    }
}
//# sourceMappingURL=wallet.js.map