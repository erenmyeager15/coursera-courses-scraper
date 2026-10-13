// Decimal cross-multiplication for boundary decisions, avoiding false 5% misses
// such as (9.45 - 9) / 9 * 100 === 4.999999999999992. Display remains numeric.
interface Decimal { value: bigint; scale: number; }
function decimal(value: number): Decimal {
    if (!Number.isFinite(value)) throw new Error('Non-finite internal arithmetic input.');
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value))!;
    const fraction = match[3] ?? '';
    let scale = fraction.length - Number(match[4] ?? 0);
    let coefficient = BigInt(match[2] + fraction) * (match[1] ? -1n : 1n);
    if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
    return { value: coefficient, scale };
}
function add(values: Decimal[]): Decimal {
    const scale = Math.max(0, ...values.map((value) => value.scale));
    return { value: values.reduce((sum, value) => sum + value.value * 10n ** BigInt(scale - value.scale), 0n), scale };
}
const negative = (value: Decimal): Decimal => ({ ...value, value: -value.value });
const multiply = (a: Decimal, b: Decimal): Decimal => ({ value: a.value * b.value, scale: a.scale + b.scale });
function atLeast(a: Decimal, b: Decimal): boolean { return add([a, negative(b)]).value >= 0n; }

export function exactSum(...values: number[]): number {
    const total = add(values.map(decimal));
    return Number(`${total.value}e-${total.scale}`);
}

export function exactProduct(a: number, b: number): number {
    const total = multiply(decimal(a), decimal(b));
    return Number(`${total.value}e-${total.scale}`);
}

export function changeMeetsThreshold(current: number, previous: number, thresholdPercent: number, absolute = false): boolean {
    if (previous <= 0) return false;
    let delta = add([decimal(current), negative(decimal(previous))]);
    if (absolute && delta.value < 0n) delta = negative(delta);
    return atLeast(multiply(delta, decimal(100)), multiply(decimal(previous), decimal(thresholdPercent)));
}
