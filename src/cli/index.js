#!/usr/bin/env node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { Wallet } from '../wallet/index.js';
import { WalletDB } from '../level/index.js';
import { EsploraClient } from '../esplora/index.js';
import { BitcoinRpcClient } from '../helpers/bitcoin-rpc.helper.js';

const DEFAULT_WALLET_PATH = path.join(os.homedir(), '.sp');
const program = new Command();
let wallet;
let walletDB;
program
    .name('sp')
    .description('CLI for managing Bitcoin silent payments')
    .version('0.0.1');
const ensureWalletDir = (walletPath) => {
    if (!fs.existsSync(walletPath)) {
        fs.mkdirSync(walletPath, { recursive: true });
    }
    return walletPath;
};
const initWallet = async (options) => {
    const walletPath = ensureWalletDir(options.path || DEFAULT_WALLET_PATH);
    walletDB = new WalletDB({
        location: walletPath,
    });
    const network = options.network || 'testnet';
    let esploraUrl;
    switch (network) {
        case 'main':
            esploraUrl = 'https://blockstream.info/api';
            break;
        case 'testnet':
            esploraUrl = 'https://blockstream.info/testnet/api';
            break;
        case 'regtest':
            esploraUrl = 'http://127.0.0.1:8094/regtest/api';
            break;
        default:
            throw new Error(`Unsupported network: ${network}`);
    }
    const networkClient = new EsploraClient({
        protocol: esploraUrl.startsWith('https') ? 'https' : 'http',
        host: new URL(esploraUrl).host,
        network,
    });
    wallet = new Wallet({
        db: walletDB,
        networkClient,
    });
    return wallet;
};
program
    .command('create')
    .description('Create a new wallet')
    .option('-p, --path <path>', 'Path to store the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'regtest')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            mnemonic: undefined,
        });
        console.log(chalk.green('Wallet created successfully!'));
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to create wallet: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to create wallet: Unknown error.'));
        }
    }
});
program
    .command('import')
    .description('Import a wallet using mnemonic')
    .option('-p, --path <path>', 'Path to store the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'testnet')
    .option('-m, --mnemonic <mnemonic>', 'Mnemonic seed phrase')
    .action(async (options) => {
    try {
        if (!options.mnemonic) {
            console.error(chalk.red('Mnemonic is required'));
            return;
        }
        const wallet = await initWallet(options);
        await wallet.init({
            mnemonic: options.mnemonic,
        });
        console.log(chalk.green('Wallet imported successfully!'));
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to import wallet: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to import wallet: Unknown error.'));
        }
    }
});
program
    .command('open')
    .description('Open an existing wallet')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'testnet')
    .option('--password <password>', 'Wallet password')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        console.log(chalk.green('Wallet opened successfully!'));
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to open wallet: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to open wallet: Unknown error.'));
        }
    }
});
program
    .command('balance')
    .description('Get wallet balance')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('--password <password>', 'Wallet password')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        const balance = await wallet.getBalance();
        console.log(chalk.green(`Balance: ${balance / 100000000} BTC (${balance} satoshis)`));
        await wallet.close();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to get balance: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to get balance: Unknown error.'));
        }
    }
});

program
    .command('address')
    .description('Generate a new receive address')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'regtest')
    .option('--password <password>', 'Wallet password')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        const address = await wallet.deriveReceiveAddress();
        console.log(chalk.green(`Receive address: ${address}`));
        await wallet.close();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to generate address: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to generate address: Unknown error.'));
        }
    }
});
program
    .command('silent-address')
    .description('Generate a silent payment address')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'regtest')
    .option('--password <password>', 'Wallet password')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        const address = await wallet.generateSilentPaymentAddress();
        console.log(chalk.green(`Silent payment address: ${address}`));
        await wallet.close();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to generate silent address: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to generate silent address: Unknown error.'));
        }
    }
});
program
    .command('send')
    .description('Send bitcoin')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'regtest')
    .option('--password <password>', 'Wallet password')
    .option('-a, --address <address>', 'Destination address')
    .option('-s, --amount <amount>', 'Amount in BTC')
    .action(async (options) => {
    try {
        if (!options.address || !options.amount) {
            console.error(chalk.red('Address and amount are required'));
            return;
        }
        
        // Verify address prefix matches network
        const isSilentPayment = options.address.startsWith('sp1') || options.address.startsWith('tsp1');
        if (!isSilentPayment) {
            const isMainnet = options.address.startsWith('bc1') || options.address.startsWith('1') || options.address.startsWith('3');
            const isTestnet = options.address.startsWith('tb1') || options.address.startsWith('m') || options.address.startsWith('n') || options.address.startsWith('2');
            const isRegtest = options.address.startsWith('bcrt1');
            
            // Check for network mismatch
            if ((options.network === 'regtest' && !isRegtest) || 
                (options.network === 'testnet' && !isTestnet) || 
                (options.network === 'main' && !isMainnet)) {
                console.error(chalk.red(`Address prefix doesn't match the selected network (${options.network})`));
                return;
            }
        }
        
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        const amount = Math.round(parseFloat(options.amount) * 100000000);
        let txid;
        if (isSilentPayment) {
            txid = await wallet.sendToSilentAddress(options.address, amount);
        }
        else {
            txid = await wallet.send(options.address, amount);
        }
        console.log(chalk.green(`Transaction sent successfully! TXID: ${txid}`));
        await wallet.close();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to send: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to send: Unknown error.'));
        }
    }
});
program
    .command('scan')
    .description('Scan for transactions')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'testnet')
    .option('--password <password>', 'Wallet password')
    .action(async (options) => {
    try {
        const wallet = await initWallet(options);
        await wallet.init({
            password: options.password,
        });
        console.log(chalk.yellow('Scanning for transactions...'));
        await wallet.scan();
        console.log(chalk.green('Scan completed!'));
        console.log("Wallet balance: ", await wallet.getBalance());
        await wallet.close();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Failed to scan: ${error.message}`));
        }
        else {
            console.error(chalk.red('Failed to scan: Unknown error.'));
        }
    }
});
program
    .command('mine')
    .description('Mine some blocks for regtest to fund the wallet')
    .option('-p, --path <path>', 'Path to the wallet data')
    .option('-n, --network <network>', 'Bitcoin network (main, testnet, regtest)', 'regtest')
    .option('--password <password>', 'Wallet password')
    .option('-b, --blocks <blocks>', 'Number of blocks to mine', '150')
    .action(async (options) => {
        try {
            const blocks = parseInt(options.blocks, 10);
            const wallet = await initWallet(options);
            await wallet.init({ password: options.password });
            const newAddress = await wallet.deriveReceiveAddress();
            console.log(chalk.yellow(`Mining ${blocks} blocks to address: ${newAddress}`));
            
            // Pass the network option to the BitcoinRpcClient
            const rpc = new BitcoinRpcClient(options.network);
            
            const result = await rpc.mineToAddress(blocks, newAddress);
            console.log(chalk.green(`Mined ${blocks} blocks: ${result.join(', ')}`));
            await wallet.scan();
            const balance = await wallet.getBalance();
            console.log(chalk.green(`Balance after mining: ${balance / 1e8} BTC (${balance} satoshis)`));
            await wallet.close();
        } catch (error) {
            if (error instanceof Error) {
                console.error(chalk.red(`Failed to mine: ${error.message}`));
            } else {
                console.error(chalk.red('Failed to mine: Unknown error.'));
            }
        }
    });

program.parse(process.argv);