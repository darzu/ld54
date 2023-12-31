import { clamp } from "../utils/math.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
import { range } from "../utils/util.js";
import { vec3Dbg2, vec3Mid } from "../utils/utils-3d.js";
export function __resetAABBDbgCounters() {
    _doesOverlapAABBs = 0;
    _enclosedBys = 0;
}
export let _doesOverlapAABBs = 0;
export function doesOverlapAABB(a, b) {
    _doesOverlapAABBs++; // TODO(@darzu): debugging
    // TODO(@darzu): less then or less then and equal?
    return (true &&
        b.min[0] < a.max[0] &&
        b.min[1] < a.max[1] &&
        b.min[2] < a.max[2] &&
        a.min[0] < b.max[0] &&
        a.min[1] < b.max[1] &&
        a.min[2] < b.max[2]);
}
export let _enclosedBys = 0;
export function enclosedBy(inner, outer) {
    _enclosedBys++; // TODO(@darzu): debugging
    return (true &&
        inner.max[0] < outer.max[0] &&
        inner.max[1] < outer.max[1] &&
        inner.max[2] < outer.max[2] &&
        outer.min[0] < inner.min[0] &&
        outer.min[1] < inner.min[1] &&
        outer.min[2] < inner.min[2]);
}
export function doesTouchAABB(a, b, threshold) {
    _doesOverlapAABBs++; // TODO(@darzu): debugging
    return (true &&
        b.min[0] < a.max[0] + threshold &&
        b.min[1] < a.max[1] + threshold &&
        b.min[2] < a.max[2] + threshold &&
        a.min[0] < b.max[0] + threshold &&
        a.min[1] < b.max[1] + threshold &&
        a.min[2] < b.max[2] + threshold);
}
export function createAABB(min, max) {
    return {
        min: min ?? V(Infinity, Infinity, Infinity),
        max: max ?? V(-Infinity, -Infinity, -Infinity),
    };
}
export function copyAABB(out, a) {
    vec3.copy(out.min, a.min);
    vec3.copy(out.max, a.max);
    return out;
}
export function clampToAABB(v, aabb, out) {
    out = out ?? vec3.tmp();
    out[0] = clamp(v[0], aabb.min[0], aabb.max[0]);
    out[1] = clamp(v[1], aabb.min[1], aabb.max[1]);
    out[2] = clamp(v[2], aabb.min[2], aabb.max[2]);
    return out;
}
export function pointInAABB(aabb, p) {
    return (true &&
        aabb.min[0] < p[0] &&
        aabb.min[1] < p[1] &&
        aabb.min[2] < p[2] &&
        p[0] < aabb.max[0] &&
        p[1] < aabb.max[1] &&
        p[2] < aabb.max[2]);
}
// TODO(@darzu): too much alloc
// export function getAABBCorners(aabb: AABB): vec3[] {
//   const points: vec3[] = [
//     V(aabb.max[0], aabb.max[1], aabb.max[2]),
//     V(aabb.max[0], aabb.max[1], aabb.min[2]),
//     V(aabb.max[0], aabb.min[1], aabb.max[2]),
//     V(aabb.max[0], aabb.min[1], aabb.min[2]),
//     V(aabb.min[0], aabb.max[1], aabb.max[2]),
//     V(aabb.min[0], aabb.max[1], aabb.min[2]),
//     V(aabb.min[0], aabb.min[1], aabb.max[2]),
//     V(aabb.min[0], aabb.min[1], aabb.min[2]),
//   ];
//   return points;
// }
const tempAabbCorners = range(8).map((_) => vec3.create());
export function getAABBCornersTemp(aabb) {
    vec3.set(aabb.max[0], aabb.max[1], aabb.max[2], tempAabbCorners[0]);
    vec3.set(aabb.max[0], aabb.max[1], aabb.min[2], tempAabbCorners[1]);
    vec3.set(aabb.max[0], aabb.min[1], aabb.max[2], tempAabbCorners[2]);
    vec3.set(aabb.max[0], aabb.min[1], aabb.min[2], tempAabbCorners[3]);
    vec3.set(aabb.min[0], aabb.max[1], aabb.max[2], tempAabbCorners[4]);
    vec3.set(aabb.min[0], aabb.max[1], aabb.min[2], tempAabbCorners[5]);
    vec3.set(aabb.min[0], aabb.min[1], aabb.max[2], tempAabbCorners[6]);
    vec3.set(aabb.min[0], aabb.min[1], aabb.min[2], tempAabbCorners[7]);
    return tempAabbCorners;
}
// const tempAabbXZCorners = range(4).map((_) => vec2.create()) as [
//   vec2,
//   vec2,
//   vec2,
//   vec2
// ];
// export function getAabbXZCornersTemp(aabb: AABB): [vec2, vec2, vec2, vec2] {
//   vec2.set(aabb.max[0], aabb.max[2], tempAabbXZCorners[0]);
//   vec2.set(aabb.max[0], aabb.min[2], tempAabbXZCorners[1]);
//   vec2.set(aabb.min[0], aabb.max[2], tempAabbXZCorners[2]);
//   vec2.set(aabb.min[0], aabb.min[2], tempAabbXZCorners[3]);
//   return tempAabbXZCorners;
// }
export function transformAABB(out, t) {
    const wCorners = getAABBCornersTemp(out);
    wCorners.forEach((p) => vec3.transformMat4(p, t, p));
    getAABBFromPositions(out, wCorners);
}
export function aabbCenter(out, a) {
    out[0] = (a.min[0] + a.max[0]) * 0.5;
    out[1] = (a.min[1] + a.max[1]) * 0.5;
    out[2] = (a.min[2] + a.max[2]) * 0.5;
    return out;
}
export function updateAABBWithPoint(aabb, pos) {
    return updateAABBWithPoint_(aabb, pos[0], pos[1], pos[2]);
}
export function updateAABBWithPoint_(aabb, x, y, z) {
    aabb.min[0] = Math.min(x, aabb.min[0]);
    aabb.min[1] = Math.min(y, aabb.min[1]);
    aabb.min[2] = Math.min(z, aabb.min[2]);
    aabb.max[0] = Math.max(x, aabb.max[0]);
    aabb.max[1] = Math.max(y, aabb.max[1]);
    aabb.max[2] = Math.max(z, aabb.max[2]);
    return aabb;
}
export function mergeAABBs(out, a, b) {
    out.min[0] = Math.min(a.min[0], b.min[0]);
    out.min[1] = Math.min(a.min[1], b.min[1]);
    out.min[2] = Math.min(a.min[2], b.min[2]);
    out.max[0] = Math.max(a.max[0], b.max[0]);
    out.max[1] = Math.max(a.max[1], b.max[1]);
    out.max[2] = Math.max(a.max[2], b.max[2]);
    return out;
}
export function getAABBFromPositions(out, positions) {
    vec3.set(Infinity, Infinity, Infinity, out.min);
    vec3.set(-Infinity, -Infinity, -Infinity, out.max);
    for (let pos of positions) {
        updateAABBWithPoint(out, pos);
    }
    return out;
}
export function updateAABBWithPoint2(aabb, pos) {
    return updateAABBWithPoint2_(aabb, pos[0], pos[1]);
}
export function updateAABBWithPoint2_(aabb, x, y) {
    aabb.min[0] = Math.min(x, aabb.min[0]);
    aabb.min[1] = Math.min(y, aabb.min[1]);
    aabb.max[0] = Math.max(x, aabb.max[0]);
    aabb.max[1] = Math.max(y, aabb.max[1]);
    return aabb;
}
export function aabbCenter2(out, a) {
    out[0] = (a.min[0] + a.max[0]) * 0.5;
    out[1] = (a.min[1] + a.max[1]) * 0.5;
    return out;
}
// TODO(@darzu): add out param
export function getCenterFromAABB(aabb) {
    return vec3Mid(vec3.create(), aabb.min, aabb.max);
}
export function getSizeFromAABB(aabb, out) {
    out = out ?? vec3.tmp();
    out[0] = aabb.max[0] - aabb.min[0];
    out[1] = aabb.max[1] - aabb.min[1];
    out[2] = aabb.max[2] - aabb.min[2];
    return out;
}
export function getHalfsizeFromAABB(aabb, out) {
    out = out ?? vec3.tmp();
    out[0] = (aabb.max[0] - aabb.min[0]) * 0.5;
    out[1] = (aabb.max[1] - aabb.min[1]) * 0.5;
    out[2] = (aabb.max[2] - aabb.min[2]) * 0.5;
    return out;
}
export function aabbListToStr(aabbs) {
    let resStr = "";
    resStr += `const aabbs: AABB[] = [`;
    for (let aabb of aabbs) {
        resStr += `{min: ${vec3Dbg2(aabb.min)}, max: ${vec3Dbg2(aabb.max)}},`;
    }
    resStr += `];`;
    return resStr;
}
//# sourceMappingURL=aabb.js.map