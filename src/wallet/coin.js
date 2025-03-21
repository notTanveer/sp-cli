import { toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { WITNESS_SCALE_FACTOR } from './consensus.js';
export class Coin {
    txid;
    vout;
    value;
    address;
    status;
    constructor(partial) {
        Object.assign(this, partial);
    }
    static fromJSON(json) {
        return new Coin(JSON.parse(json));
    }
    toJSON() {
        return JSON.stringify({
            txid: this.txid,
            vout: this.vout,
            value: this.value,
            address: this.address,
            status: this.status,
        });
    }
    toInput(network) {
        return {
            hash: this.txid,
            index: this.vout,
            witnessUtxo: {
                script: toOutputScript(this.address, network),
                value: this.value,
            },
        };
    }
    estimateSpendingSize() {
        let total = 0;
        total += 32 + 4 + 4;
        total += 1;
        let size = 0;
        size += 1;
        size += 1 + 73;
        size += 1 + 33;
        size = ((size + WITNESS_SCALE_FACTOR - 1) / WITNESS_SCALE_FACTOR) | 0;
        total += size;
        return total;
    }
    estimateSpendingFee(feeRate) {
        return this.estimateSpendingSize() * feeRate;
    }
}
//# sourceMappingURL=coin.js.map