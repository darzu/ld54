import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { DeletedDef } from "../ecs/delete.js";
import { EM } from "../ecs/entity-manager.js";
import { vec3, quat, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { jitter } from "../utils/math.js";
import { ColliderDef } from "./collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsParentDef, PositionDef, ScaleDef } from "./transform.js";
import { RenderableDef, RenderableConstructDef, } from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { TimeDef } from "../time/time.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
// import { ENEMY_SHIP_COLOR } from "./enemy-ship.js";
// import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
// import { ForceDef, SpringGridDef } from "./spring.js";
import { TextDef } from "../gui/ui.js";
import { createGhost } from "../debug/ghost.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
// TODO(@darzu): BROKEN. camera is in a wonky place?
export async function initReboundSandbox(hosting) {
    let tableId = -1;
    const res = await EM.whenResources(AllMeshesDef, GlobalCursor3dDef, RendererDef, TextDef, CameraDef);
    res.camera.fov = Math.PI * 0.5;
    res.renderer.pipelines = [
        ...shadowPipelines,
        stdRenderPipeline,
        outlineRender,
        deferredPipeline,
        postProcess,
    ];
    const g = createGhost();
    vec3.copy(g.position, [-6.5, 3.06, 22.51]);
    quat.copy(g.rotation, [0.0, -0.08, 0.0, 1.0]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = 0.145;
    const c = res.globalCursor3d.cursor();
    assert(RenderableDef.isOn(c));
    c.renderable.enabled = false;
    const p = EM.new();
    EM.set(p, RenderableConstructDef, res.allMeshes.plane.proto);
    EM.set(p, ColorDef, V(0.2, 0.3, 0.2));
    EM.set(p, PositionDef, V(0, -10, 0));
    EM.set(p, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.allMeshes.plane.aabb,
    });
    const t = EM.new();
    EM.set(t, RenderableConstructDef, res.allMeshes.gridPlane.proto);
    EM.set(t, ColorDef, V(0.2, 0.2, 0.9));
    EM.set(t, PositionDef, V(0, 0, 0));
    EM.set(t, AngularVelocityDef, V(0, 0.0002, 0.0002));
    EM.set(t, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.allMeshes.gridPlane.aabb,
    });
    tableId = t.id;
    res.text.lowerText = `spawner (p) stack (l) clear (backspace)`;
    const cubeDef = EM.defineComponent("cube", () => true);
    function spawn(m, pos) {
        const e = EM.new();
        EM.set(e, RenderableConstructDef, m.proto);
        const [r, g, b] = [jitter(0.1) + 0.2, jitter(0.1) + 0.2, jitter(0.1) + 0.2];
        EM.set(e, ColorDef, V(r, g, b));
        EM.set(e, PositionDef, pos);
        EM.set(e, ScaleDef, V(0.5, 0.5, 0.5));
        // EM.set(b, RotationDef);
        // EM.set(b, AngularVelocityDef, [0, 0.001, 0.001]);
        EM.set(e, LinearVelocityDef, V(0, -0.02, 0));
        EM.set(e, PhysicsParentDef, tableId);
        EM.set(e, ColliderDef, {
            shape: "AABB",
            solid: true,
            aabb: m.aabb,
        });
        EM.set(e, cubeDef);
    }
    let nextSpawnAccu = 0;
    let paused = true;
    EM.addSystem("sandboxSpawnBoxes", Phase.GAME_WORLD, null, [AllMeshesDef, TimeDef, InputsDef], (_, res) => {
        // pause/unpause
        if (res.inputs.keyClicks["p"])
            paused = !paused;
        // spawner
        if (!paused) {
            nextSpawnAccu += res.time.dt;
            if (nextSpawnAccu > 100) {
                nextSpawnAccu = 0;
                const x = jitter(5);
                const z = jitter(5);
                spawn(res.allMeshes.cube, V(x, 20, z));
            }
        }
        // stack spawn
        if (res.inputs.keyClicks["l"]) {
            const NUM = 1;
            const SPC = 2;
            for (let i = 0; i < NUM; i++)
                spawn(res.allMeshes.cube, V(0, 10 + i * SPC, 0));
        }
        if (res.inputs.keyClicks["backspace"]) {
            const es = EM.filterEntities([cubeDef]);
            for (let e of es)
                EM.set(e, DeletedDef);
        }
    });
}
//# sourceMappingURL=game-rebound.js.map