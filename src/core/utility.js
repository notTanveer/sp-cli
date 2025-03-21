import secp256k1 from 'secp256k1';
import createHash from 'create-hash';
import { Buffer } from 'buffer';
export const createInputHash = (sumOfInputPublicKeys, outpoint) => {
    return createTaggedHash('BIP0352/Inputs', Buffer.concat([
        Buffer.concat([
            Buffer.from(outpoint.txid, 'hex').reverse(),
            serialiseUint32LE(outpoint.vout),
        ]),
        sumOfInputPublicKeys,
    ]));
};
export const createTaggedHash = (tag, buffer) => {
    const tagHash = createHash('sha256').update(tag, 'utf8').digest();
    return createHash('sha256')
        .update(tagHash)
        .update(tagHash)
        .update(buffer)
        .digest();
};
export const calculateSumOfPrivateKeys = (keys) => {
    const negatedKeys = keys.map((key) => {
        const privateKey = Buffer.from(key.key, 'hex');
        if (key.isXOnly &&
            secp256k1.publicKeyCreate(privateKey, true)[0] === 0x03) {
            return secp256k1.privateKeyNegate(privateKey);
        }
        return privateKey;
    });
    return Buffer.from(negatedKeys.slice(1).reduce((acc, key) => {
        return secp256k1.privateKeyTweakAdd(acc, key);
    }, negatedKeys[0]));
};
export const serialiseUint32 = (n) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(n);
    return buf;
};
const serialiseUint32LE = (n) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(n);
    return buf;
};
export const readVarInt = (buffer, offset = 0) => {
    const first = buffer.readUInt8(offset);
    if (first < 0xfd)
        return first;
    else if (first === 0xfd)
        return buffer.readUInt16LE(offset + 1);
    else if (first === 0xfe)
        return buffer.readUInt32LE(offset + 1);
    else {
        const lo = buffer.readUInt32LE(offset + 1);
        const hi = buffer.readUInt32LE(offset + 5);
        return hi * 0x0100000000 + lo;
    }
};
export const encodingLength = (n) => {
    return n < 0xfd ? 1 : n <= 0xffff ? 3 : n <= 0xffffffff ? 5 : 9;
};
export const isPubKey = (testVector) => {
    return ((testVector.length == 33 || testVector.length == 65) &&
        secp256k1.publicKeyVerify(testVector));
};
//# sourceMappingURL=utility.js.map