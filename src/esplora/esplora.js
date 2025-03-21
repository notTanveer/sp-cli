import { Coin } from '../wallet/index.js';
import { URL } from 'url';
import axios, { AxiosError } from 'axios';
import { regtest, testnet, bitcoin } from 'bitcoinjs-lib/src/networks.js';
export class EsploraClient {
    url;
    _network;
    constructor(config) {
        let pathPrefix;
        switch (config.network) {
            case 'testnet':
                pathPrefix = '/testnet/api';
                break;
            case 'regtest':
                pathPrefix = '/regtest/api';
                break;
            case 'main':
            default:
                pathPrefix = '/api';
        }
        this._network = config.network;
        this.url = new URL(`${config.protocol}://${config.host}${pathPrefix}`).toString();
    }
    get network() {
        switch (this._network) {
            case 'testnet':
                return testnet;
            case 'regtest':
                return regtest;
            case 'main':
            default:
                return bitcoin;
        }
    }
    async request(config) {
        try {
            const response = await axios(config);
            return response.data;
        }
        catch (error) {
            if (error instanceof AxiosError) {
                if (error.response?.data?.title) {
                    console.error(`${config.method} Error: ${config.url}\n${JSON.stringify(error.response.data)}`);
                }
            }
            else
                throw error;
        }
    }
    async getLatestBlockHeight() {
        return await this.request({
            method: 'GET',
            url: `${this.url}/blocks/tip/height`,
        });
    }
    async getLatestBlockHash() {
        return await this.request({
            method: 'GET',
            url: `${this.url}/blocks/tip/hash`,
        });
    }
    async getBlockHash(height) {
        return await this.request({
            method: 'GET',
            url: `${this.url}//block-height/${height}`,
        });
    }
    async getUTXOs(address) {
        return (await this.request({
            method: 'GET',
            url: `${this.url}/address/${address}/utxo`,
        })).map((utxo) => new Coin({ ...utxo, address }));
    }
    async getFeeRate() {
        return (await this.request({
            method: 'GET',
            url: `${this.url}/fee-estimates`,
        }))[1];
    }
    async broadcast(txHex) {
        await this.request({
            method: 'POST',
            url: `${this.url}/tx`,
            data: txHex,
        });
    }
}
//# sourceMappingURL=esplora.js.map