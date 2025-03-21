import { calculateSumOfPrivateKeys, createInputHash, createTaggedHash, serialiseUint32, } from './utility.js';
import { decodeSilentPaymentAddress } from './encoding.js';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
export const createOutputs = (inputPrivateKeys, smallestOutpoint, recipientAddresses, network = bitcoin) => {
    const sumOfPrivateKeys = calculateSumOfPrivateKeys(inputPrivateKeys);
    const inputHash = createInputHash(Buffer.from(secp256k1.publicKeyCreate(sumOfPrivateKeys)), smallestOutpoint);
    const paymentGroups = new Map();
    for (const { address, amount } of recipientAddresses) {
        const { scanKey, spendKey } = decodeSilentPaymentAddress(address, network);
        if (paymentGroups.has(scanKey.toString('hex'))) {
            paymentGroups
                .get(scanKey.toString('hex'))
                ?.push({ spendKey, amount });
        }
        else {
            paymentGroups.set(scanKey.toString('hex'), [{ spendKey, amount }]);
        }
    }
    const outputs = [];
    for (const [scanKeyHex, paymentGroup] of paymentGroups.entries()) {
        const scanKey = Buffer.from(scanKeyHex, 'hex');
        const ecdhSecret = secp256k1.publicKeyTweakMul(secp256k1.publicKeyTweakMul(scanKey, inputHash, true), sumOfPrivateKeys);
        let n = 0;
        for (const { spendKey, amount } of paymentGroup) {
            const tweak = createTaggedHash('BIP0352/SharedSecret', Buffer.concat([Buffer.from(ecdhSecret), serialiseUint32(n)]));
            const publicKey = secp256k1.publicKeyTweakAdd(spendKey, tweak, true);
            outputs.push({
                script: Buffer.from(publicKey),
                value: amount,
            });
            n++;
        }
    }
    return outputs;
};
//# sourceMappingURL=outputs.js.map