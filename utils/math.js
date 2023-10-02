import { mat3, vec3 } from "../matrix/sprig-matrix.js";
import { assert } from "./util.js";
// functions
export function sum(ns) {
    return ns.reduce((p, n) => p + n, 0);
}
export function max(ns) {
    return ns.reduce((p, n) => (p > n ? p : n), -Infinity);
}
export function avg(ns) {
    return sum(ns) / ns.length;
}
export function clamp(n, min, max) {
    if (n < min)
        return min;
    else if (n > max)
        return max;
    return n;
}
export function min(ns) {
    return ns.reduce((p, n) => (p < n ? p : n), Infinity);
}
export function even(n) {
    return n % 2 == 0;
}
export const radToDeg = 180 / Math.PI;
export function jitter(radius) {
    return (Math.random() - 0.5) * radius * 2;
}
export function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}
export function align(x, size) {
    return Math.ceil(x / size) * size;
}
export function alignDown(x, size) {
    return Math.floor(x / size) * size;
}
export function chance(zeroToOne) {
    return Math.random() < zeroToOne;
}
// maps a number from [inMin, inMax] to [outMin, outMax]
export function mathMap(n, inMin, inMax, outMin, outMax) {
    // TODO(@darzu): actually, this works even if inMin > inMax, and/or outMin > outMax. idk why
    // assert(inMin < inMax, "must be: inMin < inMax");
    // assert(outMin <= outMax, "must be: outMin <= outMax");
    // assert(inMin <= n && n <= inMax, "must be: inMin <= n && n <= inMax");
    const progress = (n - inMin) / (inMax - inMin);
    return progress * (outMax - outMin) + outMin;
}
export function mathMapNEase(n, inMin, inMax, outMin, outMax, easeFn) {
    assert(inMin < inMax, "must be: inMin < inMax");
    assert(outMin <= outMax, "must be: outMin <= outMax");
    n = Math.max(n, inMin);
    n = Math.min(n, inMax);
    let progress = (n - inMin) / (inMax - inMin);
    if (easeFn)
        progress = easeFn(progress);
    return progress * (outMax - outMin) + outMin;
}
// returns [a,b,c] from y = a*x^2 + b*x + c
// given [x0, y0], [x1, y1], [x2, y2]
export function parabolaFromPoints(x0, y0, x1, y1, x2, y2) {
    const inv = mat3.invert([
        // column 1
        x0 ** 2,
        x1 ** 2,
        x2 ** 2,
        // column 2
        x0,
        x1,
        x2,
        // column 3
        1,
        1,
        1,
    ]);
    const abc = vec3.transformMat3([y0, y1, y2], inv, vec3.create());
    return abc;
    // // parabola test:
    // // y = x**2 + 1 from [0,1], [-2, 5], [1,2]
    // console.log(`parabolaFromPoints test: `);
    // console.log(vec3Dbg(parabolaFromPoints(0, 1, -2, 5, 1, 2)));
    // // y = 1.2x**2 -1x+ 2.3
    // console.log(
    //   vec3Dbg(parabolaFromPoints(1, 2.5, -0.48, 3.056, 3, 10.1))
    // );
}
export function sphereRadiusFromVolume(v) {
    return Math.pow(((3 / 4) * v) / Math.PI, 1 / 3);
}
export function sphereVolumeFromRadius(r) {
    return (4 / 3) * Math.PI * Math.pow(r, 3);
}
//# sourceMappingURL=math.js.map