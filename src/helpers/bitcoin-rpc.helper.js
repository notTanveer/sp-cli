import axios, { AxiosError } from 'axios';

export class BitcoinRpcClient {
    url;
    config;

    constructor(network = 'regtest') {
        let user = process.env.BITCOIN_RPC_USER;
        let password = process.env.BITCOIN_RPC_PASSWORD;
        let host = process.env.BITCOIN_RPC_HOST;
        
        // Set defaults based on network if env vars not provided
        if (!user || !password || !host) {
            if (network === 'regtest') {
                user = 'alice';
                password = 'password';
                host = 'localhost:18443';
            } else if (network === 'testnet') {
                // Testnet defaults if needed
                user = 'user';
                password = 'password';
                host = 'localhost:18332';
            } else if (network === 'main') {
                // Mainnet defaults if needed
                user = 'user';
                password = 'password';
                host = 'localhost:8332';
            }
        }
        
        this.url = `http://${user}:${password}@${host}`;
        this.config = {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
        };
    }

    async init() {
        let loadWallet = false;
        try {
            await this.createWallet('default');
        } catch (e) {
            if (e.message?.includes('Database already exists.')) {
                loadWallet = true;
            } else {
                throw e;
            }
        }
        
        try {
            const result = await this.getWalletInfo();
            if (result['walletname'] === 'default') {
                loadWallet = false;
            }
        } catch (e) {
            if (!e.message?.includes('No wallet is loaded.')) {
                throw e;
            }
        }
        
        try {
            if (loadWallet) {
                await this.loadWallet('default');
                const address = await this.getNewAddress();
                await this.mineToAddress(150, address);
            }
        } catch (e) {
            if (!e.message?.includes('Unable to obtain an exclusive lock on the database')) {
                throw e;
            }
        }
    }

    async request(config) {
        try {
            const response = await axios.request({
                ...this.config,
                ...config,
            });
            return response.data?.result;
        } catch (e) {
            if (e instanceof AxiosError) {
                if (e.response?.data?.error) {
                    throw new Error(e.response.data.error.message);
                } else {
                    throw new Error(e.message);
                }
            } else {
                throw e;
            }
        }
    }

    async createWallet(walletName) {
        return await this.request({
            url: this.url,
            data: {
                method: 'createwallet',
                params: [walletName],
            },
        });
    }

    async getWalletInfo() {
        return await this.request({
            url: this.url,
            data: {
                method: 'getwalletinfo',
                params: [],
            },
        });
    }

    async loadWallet(walletName) {
        return await this.request({
            url: this.url,
            data: {
                method: 'loadwallet',
                params: [walletName],
            },
        });
    }

    async getNewAddress() {
        return await this.request({
            url: this.url,
            data: {
                method: 'getnewaddress',
                params: [],
            },
        });
    }

    async mineToAddress(numBlocks, address) {
        try {
            // Generate the blocks
            const blockHashes = await this.request({
                url: this.url,
                data: {
                    method: 'generatetoaddress',
                    params: [numBlocks, address],
                },
            });
            
            // If successful, wait a moment for processing
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Return the array of block hashes
            return blockHashes || [];
        } catch (error) {
            console.error('Error mining blocks:', error);
            throw error;
        }
    }

    async sendToAddress(address, amount) {
        return await this.request({
            url: this.url,
            data: {
                method: 'sendtoaddress',
                params: [address, amount],
            },
        });
    }

    async getMempoolEntry(txid) {
        return await this.request({
            url: this.url,
            data: {
                method: 'getmempoolentry',
                params: [txid],
            },
        });
    }
    
    async getBlockHash(height) {
        return await this.request({
            url: this.url,
            data: {
                method: 'getblockhash',
                params: [height],
            },
        });
    }
    
    async getBlock(hash) {
        return await this.request({
            url: this.url,
            data: {
                method: 'getblock',
                params: [hash],
            },
        });
    }
}