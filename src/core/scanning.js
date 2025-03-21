import { createTaggedHash, serialiseUint32 } from './utility.js';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
const handleLabels = (output, tweakedPublicKey, tweak, labels) => {
    const negatedPublicKey = secp256k1.publicKeyNegate(tweakedPublicKey, true);
    let mG = secp256k1.publicKeyCombine([output, negatedPublicKey], true);
    let labelHex = labels[Buffer.from(mG).toString('hex')];
    if (!labelHex) {
        mG = secp256k1.publicKeyCombine([secp256k1.publicKeyNegate(output, true), negatedPublicKey], true);
        labelHex = labels[Buffer.from(mG).toString('hex')];
    }
    if (labelHex) {
        return secp256k1.privateKeyTweakAdd(tweak, Buffer.from(labelHex, 'hex'));
    }
    return null;
};
const processTweak = (spendPublicKey, tweak, outputs, matches, labels) => {
    const tweakedPublicKey = secp256k1.publicKeyTweakAdd(spendPublicKey, tweak, true);
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        if (output.subarray(1).equals(tweakedPublicKey.subarray(1))) {
            matches.set(output.toString('hex'), tweak);
            outputs.splice(i, 1);
            return 1;
        }
        else if (labels) {
            const privateKeyTweak = handleLabels(output, tweakedPublicKey, tweak, labels);
            if (privateKeyTweak) {
                matches.set(output.toString('hex'), Buffer.from(privateKeyTweak));
                return 1;
            }
        }
    }
    return 0;
};
function scanOutputsUsingSecret(ecdhSecret, spendPublicKey, outputs, labels) {
    const matches = new Map();
    let n = 0;
    let counterIncrement = 0;
    do {
        const tweak = createTaggedHash('BIP0352/SharedSecret', Buffer.concat([ecdhSecret, serialiseUint32(n)]));
        counterIncrement = processTweak(spendPublicKey, tweak, outputs, matches, labels);
        n += counterIncrement;
    } while (counterIncrement > 0 && outputs.length > 0);
    return matches;
}
export const scanOutputs = (scanPrivateKey, spendPublicKey, sumOfInputPublicKeys, inputHash, outputs, labels) => {
    const ecdhSecret = secp256k1.publicKeyTweakMul(sumOfInputPublicKeys, secp256k1.privateKeyTweakMul(scanPrivateKey, inputHash), true);
    return scanOutputsUsingSecret(ecdhSecret, spendPublicKey, outputs, labels);
};
export const scanOutputsWithTweak = (scanPrivateKey, spendPublicKey, scanTweak, outputs, labels) => {
    if (scanTweak.length === 33) {
        const ecdhSecret = secp256k1.publicKeyTweakMul(scanTweak, scanPrivateKey, true);
        return scanOutputsUsingSecret(ecdhSecret, spendPublicKey, outputs, labels);
    }
    else {
        throw new Error(`Expected scanTweak to be either 33-byte compressed public key, got ${scanTweak.length}`);
    }
};
//# sourceMappingURL=scanning.js.map