import { EM } from "../ecs/entity-manager.js";
import { vec3, V, mat3 } from "../matrix/sprig-matrix.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color/color-ecs.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
import { assert } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
export const SockDef = EM.defineComponent("sock", () => ({
    scale: 1,
}));
function sockMesh() {
    const pos = [V(0, 0, 0), V(0, 2, 0), V(0, 1, 2)];
    const tri = [V(0, 1, 2), V(2, 1, 0)];
    const colors = tri.map((_) => V(0, 0, 0));
    const lines = [];
    return {
        pos,
        tri,
        quad: [],
        colors,
        lines,
        usesProvoking: true,
        surfaceIds: tri.map((_, ti) => ti + 1),
        dbgName: "windsock",
    };
}
export function createSock(scale) {
    const ent = EM.new();
    EM.set(ent, SockDef);
    ent.sock.scale = scale;
    const mesh = sockMesh();
    // scaleMesh(mesh, scale);
    EM.set(ent, ScaleDef, V(scale, scale, scale));
    EM.set(ent, RenderableConstructDef, mesh);
    EM.set(ent, PositionDef);
    EM.set(ent, RotationDef);
    EM.set(ent, ColorDef, V(0.9, 0.9, 0.9));
    return ent;
}
let lastWinAngle = NaN;
EM.addSystem("billowSock", Phase.GAME_WORLD, [SockDef, RenderableDef, WorldFrameDef], [RendererDef, WindDef], (es, { renderer, wind }) => {
    assert(es.length <= 1);
    const e = es[0];
    if (!e)
        return;
    if (wind.angle === lastWinAngle)
        return;
    const invShip = mat3.invert(mat3.fromMat4(e.world.transform));
    const windLocalDir = vec3.transformMat3(wind.dir, invShip);
    // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
    const m = e.renderable.meshHandle.mesh;
    m.pos[2][0] = windLocalDir[0] * 4.0 * e.sock.scale;
    m.pos[2][2] = windLocalDir[2] * 4.0 * e.sock.scale;
    // console.log("billow sock: " + vec3Dbg(m.pos[2]));
    // TODO: perf: detect when we actually need to update this
    renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
    lastWinAngle = wind.angle;
});
//# sourceMappingURL=windsock.js.map