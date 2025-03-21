import { bech32m } from 'bech32';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
import { createTaggedHash, encodingLength, readVarInt, serialiseUint32, } from './utility.js';
export const encodeSilentPaymentAddress = (scanPubKey, spendPubKey, network = bitcoin, version = 0) => {
    const data = bech32m.toWords(Buffer.concat([scanPubKey, spendPubKey]));
    data.unshift(version);
    return bech32m.encode(hrpFromNetwork(network), data, 1023);
};
export const decodeSilentPaymentAddress = (address, network = bitcoin) => {
    const { prefix, words } = bech32m.decode(address, 1023);
    if (prefix != hrpFromNetwork(network))
        throw new Error('Invalid prefix!');
    const version = words.shift();
    if (version != 0)
        throw new Error('Invalid version!');
    const key = Buffer.from(bech32m.fromWords(words));
    return {
        scanKey: key.slice(0, 33),
        spendKey: key.slice(33),
    };
};
export const createLabeledSilentPaymentAddress = (scanPrivKey, spendPubKey, m, network = bitcoin, version = 0) => {
    const label = createTaggedHash('BIP0352/Label', Buffer.concat([scanPrivKey, serialiseUint32(m)]));
    const scanPubKey = secp256k1.publicKeyCreate(scanPrivKey);
    const tweakedSpendPubKey = secp256k1.publicKeyTweakAdd(spendPubKey, label, true);
    return encodeSilentPaymentAddress(scanPubKey, tweakedSpendPubKey, network, version);
};
const hrpFromNetwork = (network) => {
    return network.bech32 === 'bc' ? 'sp' : 'tsp';
};
export const parseSilentBlock = (data) => {
    const type = data.readUInt8(0);
    const transactions = [];
    let cursor = 1;
    const count = readVarInt(data, cursor);
    cursor += encodingLength(count);
    for (let i = 0; i < count; i++) {
        const txid = data.subarray(cursor, cursor + 32).toString('hex');
        cursor += 32;
        const outputs = [];
        const outputCount = readVarInt(data, cursor);
        cursor += encodingLength(outputCount);
        for (let j = 0; j < outputCount; j++) {
            const value = Number(data.readBigUInt64BE(cursor));
            cursor += 8;
            const pubKey = data.subarray(cursor, cursor + 32).toString('hex');
            cursor += 32;
            const vout = data.readUint32BE(cursor);
            cursor += 4;
            outputs.push({ value, pubKey, vout });
        }
        const scanTweak = data.subarray(cursor, cursor + 33).toString('hex');
        cursor += 33;
        transactions.push({ txid, outputs, scanTweak });
    }
    return { type, transactions };
};
//# sourceMappingURL=encoding.js.map