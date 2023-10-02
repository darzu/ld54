import { DBG_ASSERT } from "../flags.js";
import { vec3, vec4 } from "../matrix/sprig-matrix.js";
import { assert, assertDbg, range } from "../utils/util.js";
function checkHEdge(e, i) {
    assert(e.next, `HEdge #${i} missing .next`);
    assert(e.prev, `HEdge #${i} missing .prev`);
    assert(e.orig, `HEdge #${i} missing .orig`);
    assert(e.twin, `HEdge #${i} missing .twin`);
}
function dbgCheckHEdges(es) {
    if (DBG_ASSERT)
        es.forEach(checkHEdge);
}
function checkHVert(v, i) {
    assert(v.edg, `HVert #${i} missing .edg`);
    assert(v.vi !== undefined && v.vi >= 0);
}
function dbgCheckHVerts(es) {
    if (DBG_ASSERT)
        es.forEach(checkHVert);
}
function checkHFace(f) {
    assert(f.edg);
    assert(f.fi !== undefined && f.fi >= 0);
}
function dbgCheckHFaces(es) {
    if (DBG_ASSERT)
        es.forEach(checkHFace);
}
function dbgCheckHPoly(h) {
    if (DBG_ASSERT) {
        dbgCheckHEdges(h.edges);
        dbgCheckHVerts(h.verts);
        dbgCheckHFaces(h.faces);
    }
}
export function meshToHalfEdgePoly(m) {
    const numFaces = m.tri.length + m.quad.length;
    const verts = range(m.pos.length).map((vi) => ({
        vi,
        edg: undefined,
    }));
    const faces = range(numFaces).map((fi) => ({
        fi,
        edg: undefined,
    }));
    const edges = range(m.tri.length * 3 + m.quad.length * 4).map((ei) => ({
        hi: ei,
        next: undefined,
        prev: undefined,
        twin: undefined,
        orig: undefined,
        face: undefined,
    }));
    const hpoly = {
        mesh: m,
        verts,
        faces,
        edges,
    };
    // add face data
    // NOTE: this doesn't set twins
    for (let qi = 0; qi < m.quad.length; qi++)
        addQuad(qi);
    for (let ti = 0; ti < m.tri.length; ti++)
        addTri(ti);
    // find edges by origin
    const hedgesByOrig = new Map();
    for (let e of hpoly.edges) {
        if (!hedgesByOrig.has(e.orig.vi))
            hedgesByOrig.set(e.orig.vi, [e]);
        else
            hedgesByOrig.get(e.orig.vi).push(e);
    }
    // add twin data
    let outerHEdgesByOrig = new Map();
    for (let e of hpoly.edges) {
        if (e.twin)
            continue;
        let twinCanidates = hedgesByOrig.get(e.next.orig.vi);
        let twin = twinCanidates.find((t) => t.next.orig.vi === e.orig.vi);
        if (!twin) {
            // outside the surface, so create a NEW twin HEdge
            // NOTE: we need to connect up these outside surface HEdges later
            const idx = edges.length;
            twin = {
                hi: idx,
                next: undefined,
                prev: undefined,
                twin: e,
                orig: e.next?.orig,
                face: undefined,
            };
            edges.push(twin);
            outerHEdgesByOrig.set(twin.orig.vi, twin);
        }
        e.twin = twin;
        twin.twin = e;
    }
    // patch up outside HEdges
    for (let e of outerHEdgesByOrig.values()) {
        let next = outerHEdgesByOrig.get(e.twin.orig.vi);
        assertDbg(!!next);
        e.next = next;
        next.prev = e;
    }
    dbgCheckHPoly(hpoly);
    return hpoly;
    function addQuad(qi) {
        // NOTE: HalfEdge.twin isn't set here!
        // collect references
        const hf = hpoly.faces[qi];
        const vis = m.quad[qi];
        const v0 = hpoly.verts[vis[0]];
        const v1 = hpoly.verts[vis[1]];
        const v2 = hpoly.verts[vis[2]];
        const v3 = hpoly.verts[vis[3]];
        const ei0 = qi * 4;
        const e0 = hpoly.edges[ei0 + 0];
        const e1 = hpoly.edges[ei0 + 1];
        const e2 = hpoly.edges[ei0 + 2];
        const e3 = hpoly.edges[ei0 + 3];
        // patch up face
        hf.edg = e0;
        // patch up verts
        v0.edg = e0;
        v0.vi = vis[0];
        v1.edg = e1;
        v1.vi = vis[1];
        v2.edg = e2;
        v2.vi = vis[2];
        v3.edg = e3;
        v3.vi = vis[3];
        // patch up edges
        e0.face = hf;
        e0.orig = v0;
        e0.next = e1;
        e0.prev = e3;
        e1.face = hf;
        e1.orig = v1;
        e1.next = e2;
        e1.prev = e0;
        e2.face = hf;
        e2.orig = v2;
        e2.next = e3;
        e2.prev = e1;
        e3.face = hf;
        e3.orig = v3;
        e3.next = e0;
        e3.prev = e2;
    }
    function addTri(ti) {
        // NOTE: HalfEdge.twin isn't set here!
        // collect references
        const hf = hpoly.faces[m.quad.length + ti];
        const vis = m.tri[ti];
        const v0 = hpoly.verts[vis[0]];
        const v1 = hpoly.verts[vis[1]];
        const v2 = hpoly.verts[vis[2]];
        const ei0 = m.quad.length * 4 + ti * 3;
        const e0 = hpoly.edges[ei0 + 0];
        const e1 = hpoly.edges[ei0 + 1];
        const e2 = hpoly.edges[ei0 + 2];
        // patch up face
        hf.edg = e0;
        // patch up verts
        v0.edg = e0;
        v0.vi = vis[0];
        v1.edg = e1;
        v1.vi = vis[1];
        v2.edg = e2;
        v2.vi = vis[2];
        // patch up edges
        e0.face = hf;
        e0.orig = v0;
        e0.next = e1;
        e0.prev = e2;
        e1.face = hf;
        e1.orig = v1;
        e1.next = e2;
        e1.prev = e0;
        e2.face = hf;
        e2.orig = v2;
        e2.next = e0;
        e2.prev = e1;
    }
}
export function extrudeQuad(hp, he) {
    assertDbg(!he.face, `can only extrude from an outside HEdge (no face)`);
    // NEW: 2 verts, 3 inner-hedge, 3 outer-hedge, 1 face
    // first, determine our new vert positions by projecting twin's face edges
    const p0 = vec3.create();
    const v0a = he.twin.orig;
    const vi0a = v0a.vi;
    const p0b = hp.mesh.pos[he.twin.prev.orig.vi];
    const p0a = hp.mesh.pos[vi0a];
    vec3.sub(p0a, p0b, p0);
    vec3.add(p0, p0a, p0);
    const p1 = vec3.create();
    const v1a = he.twin.next.orig;
    const vi1a = v1a.vi;
    const p1b = hp.mesh.pos[he.twin.next.next.orig.vi];
    const p1a = hp.mesh.pos[vi1a];
    vec3.sub(p1a, p1b, p1);
    vec3.add(p1, p1a, p1);
    // move positions so they're the same length as the original edge
    const len = vec3.dist(p0a, p1a);
    const p01 = vec3.sub(p0, p1);
    const len2 = vec3.length(p01);
    const lenScale = (len2 - len) / (2 * len2);
    vec3.scale(p01, lenScale, p01);
    vec3.sub(p0, p01, p0);
    vec3.add(p1, p01, p1);
    // start verts
    const vi0 = hp.mesh.pos.push(p0) - 1;
    const v0 = { vi: vi0 };
    const vi1 = hp.mesh.pos.push(p1) - 1;
    const v1 = { vi: vi1 };
    // create face
    const qi = hp.mesh.quad.push(vec4.clone([vi0, vi1, vi1a, vi0a])) - 1;
    const f = {
        fi: qi,
        edg: he,
    };
    // init new hedges
    let hIdx = hp.edges.length;
    const hi0 = { face: f, orig: v0a, prev: he, hi: hIdx++ };
    const hi01 = { face: f, orig: v0, prev: hi0, hi: hIdx++ };
    const hi1 = { face: f, orig: v1, prev: hi01, hi: hIdx++ };
    const ho1 = { face: undefined, orig: v1a, hi: hIdx++ };
    const ho01 = { face: undefined, orig: v1, prev: ho1, hi: hIdx++ };
    const ho0 = { face: undefined, orig: v0, prev: ho01, hi: hIdx++ };
    // patch up outer connections
    ho1.prev = he.prev;
    ho1.prev.next = ho1;
    ho0.next = he.next;
    ho0.next.prev = ho0;
    // patch up orignal he
    const he_ = he;
    he_.prev = hi1;
    he_.next = hi0;
    he_.face = f;
    // patch up .next ptrs
    [he_, hi0, hi01, hi1, ho1, ho01, ho0].forEach((h) => {
        h.prev.next = h;
    });
    // patch up twin ptrs
    hi0.twin = ho0;
    hi01.twin = ho01;
    hi1.twin = ho1;
    [hi0, hi01, hi1].forEach((hi) => {
        hi.twin.twin = hi;
    });
    // patch up verts
    v0.edg = hi01;
    v1.edg = hi1;
    // patch up required mesh properties
    // TODO(@darzu): i don't like having to do this here..
    hp.mesh.surfaceIds?.push(hp.mesh.surfaceIds[hp.mesh.surfaceIds.length - 1] + 1);
    // TODO(@darzu): DBG colors
    // hp.mesh.colors?.push(randNormalPosVec3(vec3.create()));
    hp.mesh.colors?.push(vec3.create());
    // we're done! Verify and append to HPoly
    const newHs = [hi0, hi01, hi1, ho1, ho01, ho0];
    dbgCheckHEdges(newHs);
    newHs.forEach((h) => {
        assertDbg(hp.edges.length === h.hi);
        hp.edges.push(h);
    });
    const newVs = [v0, v1];
    dbgCheckHVerts(newVs);
    newVs.forEach((v) => hp.verts.push(v));
    hp.faces.push(f);
    return {
        face: f,
        verts: newVs,
        edges: newHs,
    };
}
//# sourceMappingURL=half-edge.js.map