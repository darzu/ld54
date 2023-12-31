import { getAABBCornersTemp } from "../physics/aabb.js";
import { createFlatQuadMesh } from "../meshes/primatives.js";
import { mergeMeshes } from "../meshes/mesh.js";
import { vec3, V, tV } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util.js";
import { orthonormalize } from "../utils/utils-3d.js";
import { createEmptyMesh } from "../wood/wood.js";
const _UP = V(0, 1, 0);
const _t1 = vec3.create();
const _t2 = vec3.create();
const _t3 = vec3.create();
const _t4 = vec3.create();
const _t5 = vec3.create();
export function createLineMesh(width, start, end, up) {
    // TODO(@darzu): PERF!! So many temps
    // TODO(@darzu): I'm dissatisfied with how we do mesh building. Should be a
    //    better way. Maybe it's just the stupid vec stuff.
    // TODO(@darzu): consider building straight into the serialize buffers?
    up = vec3.copy(_t1, up ?? _UP);
    // TODO(@darzu): IMPL
    const fwd = vec3.sub(end, start, _t2);
    const len = vec3.length(fwd);
    const right = _t3;
    orthonormalize(fwd, up, right);
    // console.log(vec3Dbg(fwd));
    // console.log(vec3Dbg(up));
    // console.log(vec3Dbg(right));
    vec3.scale(fwd, len, fwd);
    vec3.scale(right, width * 0.5, right);
    vec3.scale(up, width * 0.5, up);
    const left = vec3.negate(right, _t4);
    const down = vec3.negate(up, _t5);
    const mesh = createEmptyMesh("line");
    const tr = vec3.add(up, right, vec3.create());
    const tl = vec3.add(up, left, vec3.create());
    const bl = vec3.add(down, left, vec3.create());
    const br = vec3.add(down, right, vec3.create());
    vec3.add(tr, start, tr);
    vec3.add(tl, start, tl);
    vec3.add(bl, start, bl);
    vec3.add(br, start, br);
    mesh.pos.push(tr, tl, bl, br);
    mesh.quad.push(V(0, 1, 2, 3));
    const ftr = vec3.add(tr, fwd, vec3.create());
    const ftl = vec3.add(tl, fwd, vec3.create());
    const fbl = vec3.add(bl, fwd, vec3.create());
    const fbr = vec3.add(br, fwd, vec3.create());
    mesh.pos.push(ftr, ftl, fbl, fbr);
    mesh.quad.push(V(7, 6, 5, 4));
    mesh.quad.push(V(1, 0, 4, 5)); // top
    mesh.quad.push(V(4, 0, 3, 7)); // right
    mesh.quad.push(V(2, 1, 5, 6)); // left
    mesh.quad.push(V(3, 2, 6, 7)); // bottom
    mesh.colors = mesh.quad.map((_) => V(0, 0, 0));
    mesh.surfaceIds = mesh.colors.map((_, i) => i + 1);
    mesh.usesProvoking = true;
    return mesh;
}
export function createGizmoMesh() {
    const mesh = mergeMeshes(createLineMesh(0.1, [0.05, 0, 0], [1, 0, 0]), createLineMesh(0.1, [0, 0.05, 0], [0, 1, 0], [1, 0, 0]), createLineMesh(0.1, [0, 0, 0.05], [0, 0, 1]));
    // const mesh = createLineMesh(1, V(0, 0, 0), V(10, 0, 0));
    mesh.colors.forEach((c, i) => {
        if (i < 6)
            c[0] = 1.0; // x -> red
        else if (i < 12)
            c[1] = 1.0; // y -> green
        else
            c[2] = 1.0; // z -> blue
    });
    mesh.usesProvoking = true;
    // console.dir(mesh);
    return mesh;
}
export function createGraph3DAxesMesh(opts) {
    let axes = [];
    // const gap = opts.axisWidth * 0.2; // TODO(@darzu): tweak
    const halfWidth = opts.axisWidth * 0.5;
    const ups = [tV(0, 1, 0), tV(0, 0, 1), tV(1, 0, 0)];
    for (let i of [0, 1, 2]) {
        const domainLength = opts.domainSize.max[i] - opts.domainSize.min[i];
        const numIntervals = Math.ceil(domainLength / opts.intervalDomainLength[i]);
        const worldLength = opts.worldSize.max[i] - opts.worldSize.min[i];
        const worldIntLength = worldLength / numIntervals;
        let _start = vec3.tmp();
        let _end = vec3.tmp();
        for (let j = 0; j < numIntervals; j++) {
            vec3.set(-halfWidth, -halfWidth, -halfWidth, _start);
            vec3.set(-halfWidth, -halfWidth, -halfWidth, _end);
            _start[i] = j * worldIntLength + opts.intervalGap;
            _end[i] = (j + 1) * worldIntLength - opts.intervalGap;
            // TODO(@darzu): TEST world min
            vec3.add(_start, opts.worldSize.min, _start);
            vec3.add(_end, opts.worldSize.min, _end);
            // console.log(`${vec3Dbg(_start)} -> ${vec3Dbg(_end)}`);
            const ln = createLineMesh(opts.axisWidth, _start, _end, ups[i]);
            ln.colors.forEach((c) => (c[i] = 1.0)); // set R, G, or B
            axes.push(ln);
        }
    }
    const mesh = mergeMeshes(...axes);
    mesh.usesProvoking = true;
    return mesh;
}
export function createGraph3DDataMesh(data) {
    assert(data.length > 1 && data[0].length > 1);
    const xLen = data.length;
    const zLen = data[0].length;
    const mesh = createFlatQuadMesh(zLen, xLen, true);
    // mesh.surfaceIds.fill(1);
    for (let x = 0; x < xLen; x++) {
        assert(data[x].length === zLen);
        for (let z = 0; z < zLen; z++) {
            const idx = z + x * zLen;
            const pos = data[x][z];
            vec3.copy(mesh.pos[idx], pos);
        }
    }
    return mesh;
}
export function createGizmoForAABB(aabb, width) {
    // TODO(@darzu): this doesn't look right yet..
    const lns = [];
    const corners = getAABBCornersTemp(aabb);
    for (let i = 0; i < corners.length - 1; i++) {
        for (let j = i + 1; j < corners.length; j++) {
            const u = corners[i];
            const v = corners[j];
            const numSame = (u[0] === v[0] ? 1 : 0) +
                (u[1] === v[1] ? 1 : 0) +
                (u[2] === v[2] ? 1 : 0);
            if (numSame === 2) {
                const ln = createLineMesh(width, u, v);
                const r = u[0] > 0 && v[0] > 0 ? 1 : 0;
                const g = u[1] > 0 && v[1] > 0 ? 1 : 0;
                const b = u[2] > 0 && v[2] > 0 ? 1 : 0;
                ln.colors.forEach((c) => {
                    vec3.set(r, g, b, c);
                });
                lns.push(ln);
            }
        }
    }
    const result = mergeMeshes(...lns);
    result.usesProvoking = true;
    return result;
}
//# sourceMappingURL=gizmos.js.map