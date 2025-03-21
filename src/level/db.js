import { Level } from 'level';
import { wdb } from './layout.js';
import { Coin } from '../wallet/coin.js';
export class WalletDB {
    db;
    constructor(config) {
        this.db = new Level(config.location, {
            valueEncoding: 'json',
            keyEncoding: 'utf-8',
            createIfMissing: true,
        });
    }
    async open() {
        await this.db.open();
    }
    async close() {
        await this.db.close();
    }
    getStatus() {
        return this.db.status;
    }
    async getVersion() {
        return parseInt(await this.db.get(wdb.V));
    }
    async setVersion(version) {
        await this.db.put(wdb.V, version.toString());
    }
    async getMasterKey() {
        const masterKey = await this.db.get(wdb.M);
        const [encryptedPrivateKey, encryptedChainCode] = masterKey.split(':');
        return { encryptedPrivateKey, encryptedChainCode };
    }
    async setMasterKey(encryptedPrivateKey, encryptedChainCode) {
        await this.db.put(wdb.M, `${encryptedPrivateKey}:${encryptedChainCode}`);
    }
    async saveAddress(address, path) {
        await Promise.all([
            this.db.sublevel(wdb.A).put(address, path),
            this.db.sublevel(wdb.P).put(path, address),
        ]);
    }
    async getPathFromAddress(address) {
        return await this.db.sublevel(wdb.A).get(address);
    }
    async getAddressFromPath(path) {
        return await this.db.sublevel(wdb.P).get(path);
    }
    async hasAddress(address) {
        return (await this.db.sublevel(wdb.A).get(address)) !== undefined;
    }
    async getReceiveDepth() {
        return parseInt(await this.db.sublevel(wdb.D).get('receiveDepth'));
    }
    async setReceiveDepth(depth) {
        await this.db.sublevel(wdb.D).put('receiveDepth', depth.toString());
    }
    async getChangeDepth() {
        return parseInt(await this.db.sublevel(wdb.D).get('changeDepth'));
    }
    async setChangeDepth(depth) {
        await this.db.sublevel(wdb.D).put('changeDepth', depth.toString());
    }
    async getAllAddresses() {
        return await this.db.sublevel(wdb.A).keys().all();
    }
    async saveUnspentCoins(coins) {
        await this.db.sublevel(wdb.C).put('unspent', JSON.stringify(coins));
    }
    async getUnspentCoins() {
        try {
            const coins = JSON.parse(await this.db.sublevel(wdb.C).get('unspent'));
            return coins.map((coin) => Coin.fromJSON(coin));
        } catch (e) {
            if (e.code === 'LEVEL_NOT_FOUND') {
                return [];
            }
            throw e;
        }
    }
    async saveSilentPaymentAddress(address) {
        await this.db.put(wdb.SP, address);
    }
    async getSilentPaymentAddress() {
        try {
            return await this.db.get(wdb.SP);
        }
        catch (e) {
            if (e.code === 'LEVEL_NOT_FOUND') {
                return undefined;
            }
            throw e;
        }
    }
}
//# sourceMappingURL=db.js.map