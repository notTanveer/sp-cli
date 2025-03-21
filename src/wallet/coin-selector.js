class CoinPointer {
    coin;
    effectiveValue;
    constructor(coin, feeRate) {
        this.coin = coin;
        this.effectiveValue = coin.value - coin.estimateSpendingFee(feeRate);
    }
}
export class CoinSelector {
    feeRate = 1;
    static LONG_TERM_FEERATE = 5;
    constructor(feeRate) {
        this.feeRate = feeRate;
    }
    select(coins, tx) {
        let target = tx.outs.reduce((acc, out) => acc + out.value, 0);
        target += tx.virtualSize() * this.feeRate;
        const changeOutputFee = 31 * this.feeRate;
        target += changeOutputFee;
        const pointers = coins.map((coin) => new CoinPointer(coin, this.feeRate));
        pointers.sort((a, b) => b.effectiveValue - a.effectiveValue);
        const selected = this.selectCoins(pointers, target);
        let change = selected.reduce((acc, index) => acc + pointers[index].effectiveValue, 0) - target;
        const costOfChange = this.costOfChange;
        if (change <= costOfChange) {
            change = 0;
        }
        return {
            coins: selected.map((index) => pointers[index].coin),
            change,
        };
    }
    get costOfChange() {
        const outputSize = 31;
        const inputSizeOfChangeUTXO = 68;
        const costOfChangeOutput = outputSize * this.feeRate;
        const costOfSpendingChange = inputSizeOfChangeUTXO * CoinSelector.LONG_TERM_FEERATE;
        return costOfChangeOutput + costOfSpendingChange;
    }
    selectCoins(pointers, target) {
        const selected = this.selectLowestLarger(pointers, target);
        if (selected.length > 0)
            return selected;
        throw new Error('Insufficient funds');
    }
    selectLowestLarger(pointers, amount) {
        let index = 0;
        const selected = [];
        let effectiveValue = pointers[index].effectiveValue;
        while (amount >= effectiveValue) {
            selected.push(index);
            amount -= effectiveValue;
            index++;
            if (index === pointers.length)
                break;
            effectiveValue = pointers[index].effectiveValue;
        }
        if (amount > 0 && index !== pointers.length) {
            const lowestLargerIndex = this.findLowestLarger(pointers, amount, index);
            amount -= pointers[lowestLargerIndex].effectiveValue;
            selected.push(lowestLargerIndex);
        }
        return amount > 0 ? [] : selected;
    }
    findLowestLarger(pointers, amount, index) {
        let i = index;
        let j = pointers.length - 1;
        let lowestLargerIndex = 0;
        let mid = 0;
        while (i <= j) {
            mid = Math.floor((i + j) / 2);
            const effectiveValue = pointers[mid].effectiveValue;
            if (amount <= effectiveValue) {
                lowestLargerIndex = mid;
                i = mid + 1;
            }
            else {
                j = mid - 1;
            }
        }
        return lowestLargerIndex;
    }
}
//# sourceMappingURL=coin-selector.js.map