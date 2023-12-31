import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { BallMesh, CubeMesh, GizmoMesh, PirateMesh, } from "../meshes/mesh-list.js";
import { ControllableDef } from "../input/controllable.js";
import { createGhost, GhostDef } from "../debug/ghost.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, ScaleDef, } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh } from "../meshes/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowDepthTextures, shadowPipelines, } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RenderableDef, RendererDef, } from "../render/renderer-ecs.js";
import { mat3, quat, tV, V, vec3 } from "../matrix/sprig-matrix.js";
import { quatFromUpForward } from "../utils/utils-3d.js";
import { DevConsoleDef } from "../debug/console.js";
import { clamp, jitter, max } from "../utils/math.js";
import { assert, dbgLogMilestone } from "../utils/util.js";
import { PartyDef } from "../camera/party.js";
import { copyAABB, createAABB, getSizeFromAABB, updateAABBWithPoint, } from "../physics/aabb.js";
import { InputsDef } from "../input/inputs.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { TextDef } from "../gui/ui.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { initOcean, OceanDef, UVPosDef } from "../ocean/ocean.js";
import { renderOceanPipe } from "../render/pipelines/std-ocean.js";
import { SKY_MASK } from "../render/pipeline-masks.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import { createFlatQuadMesh, makeDome, resetFlatQuadMesh, } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { ScoreDef } from "./score.js";
import { LandMapTexPtr, LevelMapDef, setMap } from "../levels/level-map.js";
import { setWindAngle, WindDef } from "../wind/wind.js";
import { ShipDef, cannonDefaultPitch, createLd53ShipAsync, } from "./ship.js";
import { SAIL_FURL_RATE } from "../wind/sail.js";
import { spawnStoneTower, StoneTowerDef, towerPool } from "../stone/stone.js";
import { LandDef } from "./land-collision.js";
import { DeadDef } from "../ecs/delete.js";
import { BulletDef, breakBullet } from "../cannons/bullet.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { DockDef, createDock } from "./dock.js";
import { ShipHealthDef } from "./ship-health.js";
import { FinishedDef, createRef, defineNetEntityHelper, } from "../ecs/em-helpers.js";
import { resetWoodHealth, resetWoodState, WoodHealthDef, WoodStateDef, } from "../wood/wood.js";
import { MapPaths } from "../levels/map-loader.js";
import { stdRiggedRenderPipeline } from "../render/pipelines/std-rigged.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import { TeleportDef } from "../physics/teleport.js";
import { eventWizard } from "../net/events.js";
/*
NOTES:
- Cut grass by updating a texture that has cut/not cut or maybe cut-height

TODO:
Shading and appearance
[ ] fix shadow mapping
[ ] shading from skybox
[ ] cooler and warmer shading from "sun" and skybox
[ ] bring back some gradient on terrain
PERF:
[ ] reduce triangles on terrain
[ ] reduce triangles on ocean
*/
const DBG_PLAYER = false;
const DBG_HIDE_LAND = false;
// const SHIP_START_POS = V(100, 0, -100);
// world map is centered around 0,0
const WORLD_WIDTH = 1024; // width runs +z
const WORLD_HEIGHT = 512; // height runs +x
const MOTORBOAT_MODE = false;
// const RED_DAMAGE_CUTTING = 10;
// const RED_DAMAGE_PER_FRAME = 40;
// const GREEN_HEALING = 1;
// const SHIP_START_POS: vec3 = V(0, 2, -WORLD_WIDTH * 0.5 * 0.8);
// const WORLD_HEIGHT = 1024;
const worldXToTexY = (x) => Math.floor(x + WORLD_HEIGHT / 2);
const worldZToTexX = (z) => Math.floor(z + WORLD_WIDTH / 2);
const texXToWorldZ = (x) => x - WORLD_WIDTH / 2 + 0.5;
const texYToWorldX = (y) => y - WORLD_HEIGHT / 2 + 0.5;
const level2DtoWorld3D = (levelPos, y, out) => vec3.set(texYToWorldX(WORLD_HEIGHT - 1 - levelPos[1]), y, texXToWorldZ(levelPos[0]), out);
export const mapJfa = createJfaPipelines(LandMapTexPtr, "exterior");
const STONE_TOWER_HEIGHT = 10;
export const LD53MeshesDef = XY.defineMeshSetResource("ld53Meshes", BallMesh, PirateMesh, CubeMesh);
const dbgGrid = [
    //
    [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
    //
    // [mapJfa.voronoiTex, mapJfa.sdfTex],
    // TODO(@darzu): FIX FOR CSM & texture arrays
    [
        { ptr: shadowDepthTextures, idx: 0 },
        { ptr: shadowDepthTextures, idx: 1 },
    ],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);
// TODO(@darzu): MULTIPLAYER. Fully test this..
const raiseSetLevel = eventWizard("ld53-set-level", [], async (_, levelIdx) => setLevelLocal(levelIdx), {
    legalEvent: (_, levelIdx) => {
        assert(0 <= levelIdx && levelIdx <= 3, `invalid level: ${levelIdx}`);
        return true;
    },
    serializeExtra: (buf, levelIdx) => {
        buf.writeUint8(levelIdx);
    },
    deserializeExtra: (buf) => {
        const levelIdx = buf.readUint8();
        return levelIdx;
    },
});
// TODO(@darzu): MULTIPLAYER. Fully test this..
async function hostResetLevel(levelIdx) {
    raiseSetLevel(levelIdx);
    // TODO(@darzu): this is erroring out
    const ship = await EM.whenSingleEntity(PositionDef, RotationDef, ShipDef, LinearVelocityDef, ShipHealthDef, WoodHealthDef, WoodStateDef);
    // TODO(@darzu): MULTIPLAYER: which are needed on client?
    // worldCutData.fill(0.0);
    // grassCutTex.queueUpdate(worldCutData);
    // vec3.set(0, 0, 0, ship.position);
    // vec3.copy(ship.position, SHIP_START_POS);
    const { levelMap, wind, renderer } = await EM.whenResources(LevelMapDef, WindDef, RendererDef);
    // move ship to map start pos
    level2DtoWorld3D(levelMap.startPos, 8, ship.position);
    quat.identity(ship.rotation);
    vec3.set(0, 0, 0, ship.linearVelocity);
    // reset ship sails and rudder
    const sail = ship.ld52ship.mast().mast.sail().sail;
    sail.unfurledAmount = sail.minFurl;
    ship.ld52ship.cuttingEnabled = true;
    ship.ld52ship.rudder().yawpitch.yaw = 0;
    // set map wind angle
    setWindAngle(wind, Math.atan2(-levelMap.windDir[0], -levelMap.windDir[1]) + Math.PI / 2);
    // reset cannon orientations
    ship.ld52ship.cannonR().yawpitch.pitch = cannonDefaultPitch;
    ship.ld52ship.cannonR().yawpitch.yaw = Math.PI * 0.5;
    ship.ld52ship.cannonL().yawpitch.pitch = cannonDefaultPitch;
    ship.ld52ship.cannonL().yawpitch.yaw = Math.PI * 1.5;
    // reset ship health
    resetWoodHealth(ship.woodHealth);
    ship.shipHealth.health = 1;
    resetWoodState(ship.woodState);
    EM.whenEntityHas(ship, RenderableDef, WoodStateDef).then((ship) => renderer.renderer.stdPool.updateMeshQuads(ship.renderable.meshHandle, ship.woodState.mesh, 0, ship.woodState.mesh.quad.length));
    // reset dock
    // console.log("resetting dock position");
    // TODO(@darzu): MULTIPLAYER: dock health
    const dock = await EM.whenSingleEntity(DockDef, PositionDef, WoodHealthDef, WoodStateDef);
    const endZonePos = level2DtoWorld3D(levelMap.endZonePos, 5, vec3.tmp());
    vec3.copy(dock.position, endZonePos);
    resetWoodHealth(dock.woodHealth);
    resetWoodState(dock.woodState);
    EM.whenEntityHas(dock, RenderableDef, WoodStateDef).then((dock) => renderer.renderer.stdPool.updateMeshQuads(dock.renderable.meshHandle, dock.woodState.mesh, 0, dock.woodState.mesh.quad.length));
}
async function setLevelLocal(levelIdx) {
    // TODO(@darzu): MULTIPLAYER: dock
    // if (dock) {
    //   // TODO(@darzu): this isn't right.. where do we repair the dock?
    //   // splinter the dock
    //   for (let b of dock.woodHealth.boards) {
    //     for (let s of b) {
    //       s.health = 0;
    //     }
    //   }
    // }
    // console.log(`SET LEVEL: ${levelIdx}`);
    await setMap(MapPaths[levelIdx]);
    await resetLand();
    const { levelMap } = await EM.whenResources(LevelMapDef);
    // TODO(@darzu): MULTIPLAYER towers!
    const towers = EM.filterEntities([StoneTowerDef]);
    for (let tower of towers) {
        towerPool.despawn(tower);
    }
    // spawn towers
    const tower3dPosesAndDirs = levelMap.towers.map(([tPos, tDir]) => [
        level2DtoWorld3D(tPos, STONE_TOWER_HEIGHT, vec3.create()),
        Math.atan2(-tDir[0], -tDir[1]),
    ]);
    for (let [pos, angle] of tower3dPosesAndDirs) {
        const stoneTower = await spawnStoneTower();
        vec3.copy(stoneTower.position, pos);
        quat.setAxisAngle([0, 1, 0], angle, stoneTower.rotation);
    }
    dbgLogMilestone("Game playable");
    // const { me } = await EM.whenResources(MeDef);
}
export async function initLD53(hosting) {
    const res = await EM.whenResources(LD53MeshesDef, 
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef, CameraDef, DevConsoleDef, MeDef);
    // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
    outlineRender.fragOverrides.lineWidth = 1.0;
    res.camera.fov = Math.PI * 0.5;
    copyAABB(res.camera.maxWorldAABB, createAABB(V(-WORLD_HEIGHT * 1.1, -100, -WORLD_WIDTH * 1.1), V(WORLD_HEIGHT * 1.1, 100, WORLD_WIDTH * 1.1)));
    // console.dir(mapJfa);
    // console.dir(dbgGridCompose);
    // renderer
    // EM.addEagerInit([], [RendererDef, DevConsoleDef], [], (res) => {
    EM.addSystem("ld53GamePipelines", Phase.GAME_WORLD, null, [RendererDef, DevConsoleDef], (_, res) => {
        res.renderer.pipelines = [
            ...shadowPipelines,
            stdRenderPipeline,
            stdRiggedRenderPipeline,
            // renderGrassPipe,
            renderOceanPipe,
            outlineRender,
            deferredPipeline,
            skyPipeline,
            postProcess,
            ...(res.dev.showConsole ? dbgGridCompose : []),
        ];
    });
    // Sun
    const sunlight = EM.new();
    EM.set(sunlight, PointLightDef);
    // sunlight.pointLight.constant = 1.0;
    sunlight.pointLight.constant = 1.0;
    sunlight.pointLight.linear = 0.0;
    sunlight.pointLight.quadratic = 0.0;
    vec3.copy(sunlight.pointLight.ambient, [0.2, 0.2, 0.2]);
    vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
    EM.set(sunlight, PositionDef, V(50, 300, 10));
    EM.set(sunlight, RenderableConstructDef, res.ld53Meshes.ball.proto);
    // // pirate test
    // const PirateDef = EM.defineComponent("pirate", () => true);
    // const pirate = EM.new();
    // EM.set(
    //   pirate,
    //   RiggedRenderableConstructDef,
    //   res.ld53Meshes.pirate.mesh as RiggedMesh
    // );
    // EM.set(pirate, PositionDef, V(50, 80, 10));
    // EM.set(pirate, PirateDef);
    // EM.set(pirate, PoseDef, 0);
    // pirate.pose.repeat = [
    //   { pose: 1, t: 500 },
    //   { pose: 0, t: 500 },
    //   { pose: 3, t: 500 },
    //   { pose: 0, t: 500 },
    // ];
    // score
    const score = EM.addResource(ScoreDef);
    // start map
    // TODO(@darzu): MULTIPLAYER:
    if (res.me.host) {
        raiseSetLevel(0);
    }
    // const landPromise = setLevelLocal(0);
    // await setMap(MapPaths[0]);
    // const landPromise = resetLand();
    // sky dome?
    const SKY_HALFSIZE = 1000;
    const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
    const sky = EM.new();
    EM.set(sky, PositionDef, V(0, -100, 0));
    // const skyMesh = cloneMesh(res.allMeshes.cube.mesh);
    // skyMesh.pos.forEach((p) => vec3.scale(p, SKY_HALFSIZE, p));
    // skyMesh.quad.forEach((f) => vec4.reverse(f, f));
    // skyMesh.tri.forEach((f) => vec3.reverse(f, f));
    const skyMesh = domeMesh;
    EM.set(sky, RenderableConstructDef, skyMesh, undefined, undefined, SKY_MASK);
    // EM.set(sky, ColorDef, V(0.9, 0.9, 0.9));
    // ocean
    // const oceanVertsPerWorldUnit = 0.02;
    const oceanVertsPerWorldUnit = 0.25;
    const worldUnitPerOceanVerts = 1 / oceanVertsPerWorldUnit;
    const oceanZCount = Math.floor(WORLD_WIDTH * oceanVertsPerWorldUnit);
    const oceanXCount = Math.floor(WORLD_HEIGHT * oceanVertsPerWorldUnit);
    const oceanMesh = createFlatQuadMesh(oceanZCount, oceanXCount);
    const maxSurfId = max(oceanMesh.surfaceIds);
    // console.log("maxSurfId");
    // console.log(maxSurfId);
    const oceanAABB = createAABB();
    oceanMesh.pos.forEach((p, i) => {
        const x = p[0] * worldUnitPerOceanVerts - WORLD_HEIGHT * 0.5;
        const z = p[2] * worldUnitPerOceanVerts - WORLD_WIDTH * 0.5;
        const y = 0.0;
        p[0] = x;
        p[1] = y;
        p[2] = z;
        updateAABBWithPoint(oceanAABB, p);
    });
    const oceanSize = getSizeFromAABB(oceanAABB, vec3.create());
    function uvToPos([u, v], out) {
        // console.log(u + " " + v);
        out[0] = v * oceanSize[0] + oceanAABB.min[0];
        out[1] = 0;
        out[2] = u * oceanSize[2] + oceanAABB.min[2];
        // if (dbgOnce("uvToPos")) {
        //   console.log("uvToPos");
        //   console.dir(oceanSize);
        //   console.dir(oceanAABB);
        //   console.dir([u, v]);
        // }
        return out;
    }
    // TODO(@darzu): I don't think the PBR-ness of this color is right
    // initOcean(oceanMesh, V(0.1, 0.3, 0.8));
    initOcean(oceanMesh, ENDESGA16.blue);
    const ocean = await EM.whenResources(OceanDef); // TODO(@darzu): need to wait?
    const wind = EM.addResource(WindDef);
    // registerChangeWindSystems();
    // load level
    const level = await EM.whenResources(LevelMapDef);
    setWindAngle(wind, Math.atan2(-level.levelMap.windDir[0], -level.levelMap.windDir[1]) +
        Math.PI / 2);
    /*
    MULTIPLAYER LEVEL SYNCING
    state machine that is synchronized, someone has authority
      could be via events
    aside: maybe all events should describe their log strategy: play all, play last "N", play last
      Doug thinks we should view this as log compaction. I agree.
    */
    if (res.me.host) {
        const ship = await createLd53ShipAsync();
        // move down
        // ship.position[2] = -WORLD_SIZE * 0.5 * 0.6;
        level2DtoWorld3D(level.levelMap.startPos, 8, ship.position);
        //vec3.copy(ship.position, SHIP_START_POS);
        // TODO(@darzu): MULTIPLAYER: sync level
        score.onLevelEnd.push(async () => {
            // console.log("score.onLevelEnd");
            // TODO(@darzu): MULTIPLAYER: dock
            // await setLevelLocal(score.levelNumber, dock);
            await hostResetLevel(score.levelNumber);
        });
        EM.addSystem("furlUnfurl", Phase.GAME_PLAYERS, null, [InputsDef, PartyDef], (_, res) => {
            const mast = ship.ld52ship.mast();
            const rudder = ship.ld52ship.rudder();
            // furl/unfurl
            if (rudder.turret.mannedId) {
                if (MOTORBOAT_MODE) {
                    // console.log("here");
                    if (res.inputs.keyDowns["w"]) {
                        vec3.add(ship.linearVelocity, vec3.scale(res.party.dir, 0.1), ship.linearVelocity);
                    }
                }
                else {
                    const sail = mast.mast.sail().sail;
                    if (res.inputs.keyDowns["w"])
                        sail.unfurledAmount += SAIL_FURL_RATE;
                    if (res.inputs.keyDowns["s"])
                        sail.unfurledAmount -= SAIL_FURL_RATE;
                    sail.unfurledAmount = clamp(sail.unfurledAmount, sail.minFurl, 1.0);
                }
            }
        });
        const shipWorld = await EM.whenEntityHas(ship, WorldFrameDef);
        EM.addSystem("turnMast", Phase.GAME_PLAYERS, null, [InputsDef, WindDef], (_, res) => {
            const mast = ship.ld52ship.mast();
            // const rudder = ship.ld52ship.rudder()!;
            // const shipDir = vec3.transformQuat(V(0, 0, 1), shipWorld.world.rotation);
            const invShip = mat3.invert(mat3.fromMat4(shipWorld.world.transform));
            const windLocalDir = vec3.transformMat3(res.wind.dir, invShip);
            const shipLocalDir = V(0, 0, 1);
            const optimalSailLocalDir = vec3.normalize(vec3.add(windLocalDir, shipLocalDir));
            // console.log(`ship to wind: ${vec3.dot(windLocalDir, shipLocalDir)}`);
            // const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
            // e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
            // sail.force * vec3.dot(AHEAD_DIR, normal);
            // const currSailForce =
            // need to maximize: dot(wind, sail) * dot(sail, ship)
            // TODO(@darzu): ANIMATE SAIL TOWARD WIND
            if (vec3.dot(optimalSailLocalDir, shipLocalDir) > 0.01)
                quatFromUpForward(mast.rotation, V(0, 1, 0), optimalSailLocalDir);
        });
        // end zone
        const dock = createDock();
        EM.set(dock, AuthorityDef, res.me.pid);
        const endZonePos = level2DtoWorld3D(level.levelMap.endZonePos, 5, vec3.tmp());
        vec3.copy(dock.position, endZonePos);
        // drawBall(endZonePos, 4, ENDESGA16.deepGreen);
        EM.whenEntityHas(dock, PhysicsStateDef).then((dock) => (score.endZone = createRef(dock)));
    }
    // bouyancy
    if (!"true") {
        const bouyDef = EM.defineComponent("bouy", () => true);
        const buoys = [];
        for (let u = 0.4; u <= 0.6; u += 0.02) {
            for (let v = 0.4; v <= 0.6; v += 0.02) {
                const bouy = EM.new();
                EM.set(bouy, PositionDef, V(0, 0, 0));
                EM.set(bouy, UVPosDef, V(u + jitter(0.01), v + jitter(0.01)));
                // EM.set(bouy, ScaleDef, V(5, 5, 5));
                EM.set(bouy, bouyDef);
                EM.set(bouy, RenderableConstructDef, res.ld53Meshes.ball.proto);
                EM.set(bouy, ColorDef, ENDESGA16.lightGreen);
                buoys.push(bouy);
            }
        }
        // console.dir(buoys);
        const _t1 = vec3.create();
        const _t2 = vec3.create();
        EM.addSystem("shipBouyancy", Phase.GAME_WORLD, [bouyDef, PositionDef, UVPosDef], [OceanDef], (es, res) => {
            // TODO(@darzu): unify with UV ship stuff?
            if (!es.length)
                return;
            // const [ship] = es;
            const { ocean } = res;
            // console.log("running bouyancy");
            let i = 0;
            for (let bouy of es) {
                // const uv = V(0.5, 0.5);
                const uv = bouy.uvPos;
                uvToPos(uv, bouy.position);
                // console.log(`uv ${vec2Dbg(uv)} -> xyz ${vec3Dbg(bouy.position)}`);
                // const p = ocean.uvToPos(bouy.position, uv);
                // p[0] = p[0] * worldUnitPerOceanVerts - WORLD_HEIGHT * 0.5;
                // p[2] = p[2] * worldUnitPerOceanVerts - WORLD_WIDTH * 0.5;
                let disp = _t1;
                ocean.uvToGerstnerDispAndNorm(disp, _t2, uv);
                vec3.add(bouy.position, disp, bouy.position);
                // console.log(vec3Dbg(bouy.position));
                i++;
            }
        });
    }
    // wait for the ship either locally or from the network
    EM.whenSingleEntity(ShipDef, FinishedDef).then(async (ship) => {
        // player
        if (!DBG_PLAYER) {
            const color = res.me.host ? tV(0.1, 0.1, 0.1) : ENDESGA16.darkBrown;
            const player = await createLd53PlayerAsync(ship.id, color);
            // player.physicsParent.id = ship.id;
            // teleporting player to rudder
            const rudder = ship.ld52ship.rudder();
            vec3.copy(player.position, rudder.position);
            player.position[1] = 1.45;
            if (!res.me.host) {
                player.position[2] += 4 * res.me.pid;
            }
            EM.set(player, TeleportDef);
            if (res.me.host) {
                // vec3.set(0, 3, -1, player.position);
                assert(CameraFollowDef.isOn(rudder));
                raiseManTurret(player, rudder);
            }
            else {
                player.position[2] += 5;
            }
        }
    });
    if (DBG_PLAYER) {
        const g = createGhost();
        // vec3.copy(g.position, [0, 1, -1.2]);
        // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
        // g.cameraFollow.positionOffset = V(0, 0, 5);
        g.controllable.speed *= 2.0;
        g.controllable.sprintMul = 15;
        const sphereMesh = cloneMesh(res.ld53Meshes.ball.mesh);
        const visible = false;
        EM.set(g, RenderableConstructDef, sphereMesh, visible);
        EM.set(g, ColorDef, V(0.1, 0.1, 0.1));
        // EM.set(g, PositionDef, V(0, 0, 0));
        // EM.set(b2, PositionDef, [0, 0, -1.2]);
        EM.set(g, WorldFrameDef);
        // EM.set(b2, PhysicsParentDef, g.id);
        EM.set(g, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: res.ld53Meshes.ball.aabb,
        });
        // high up:
        // vec3.copy(g.position, [-140.25, 226.5, -366.78]);
        // quat.copy(g.rotation, [0.0, -0.99, 0.0, 0.15]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -1.009;
        // vec3.copy(g.position, [2.47, 46.5, -22.78]);
        // quat.copy(g.rotation, [0.0, -0.98, 0.0, -0.21]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.623;
        // vec3.copy(g.position, [77.68, 62.5, -370.74]);
        // quat.copy(g.rotation, [0.0, 0.01, 0.0, -1.0]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -1.001;
        // vec3.copy(g.position, [63.61, 22.83, -503.91]);
        // quat.copy(g.rotation, [0.0, 0.89, 0.0, -0.45]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.615;
        // vec3.copy(g.position, [63.88, 42.83, -53.13]);
        // quat.copy(g.rotation, [0.0, 0.83, 0.0, 0.56]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.738;
        vec3.copy(g.position, [57.26, 21.33, -499.14]);
        quat.copy(g.rotation, [0.0, -0.92, 0.0, 0.4]);
        vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
        g.cameraFollow.yawOffset = 0.0;
        g.cameraFollow.pitchOffset = -0.627;
        EM.addSystem("smolGhost", Phase.GAME_WORLD, [GhostDef, WorldFrameDef, ColliderDef], [InputsDef, HasFirstInteractionDef], async (ps, { inputs }) => {
            if (!ps.length)
                return;
            const ghost = ps[0];
        });
    }
    const { text } = await EM.whenResources(TextDef);
    text.lowerText = "W/S: unfurl/furl sail, A/D: turn, E: drop rudder";
    if (DBG_PLAYER)
        text.lowerText = "";
    // Spawn towers
    // {
    //   const tower3DPoses = level.levelMap.towers.map((tPos) =>
    //     level2DtoWorld3D(
    //       tPos,
    //       20, // TODO(@darzu): lookup from heightmap?
    //       vec3.screate()
    //     )
    //   );
    //   await startTowers(tower3DPoses);
    // }
    if (DBG_PLAYER) {
        // world gizmo
        const gizmoMesh = await GizmoMesh.gameMesh();
        const worldGizmo = EM.new();
        EM.set(worldGizmo, PositionDef, V(-WORLD_HEIGHT / 2, 0, -WORLD_WIDTH / 2));
        EM.set(worldGizmo, ScaleDef, V(100, 100, 100));
        EM.set(worldGizmo, RenderableConstructDef, gizmoMesh.proto);
    }
    // // debugging createGraph3D
    // let data: vec3[][] = [];
    // for (let x = 0; x < 12; x++) {
    //   data[x] = [];
    //   for (let z = 0; z < 7; z++) {
    //     data[x][z] = V(x, x + z, z);
    //   }
    // }
    // createGraph3D(vec3.add(worldGizmo.position, [50, 10, 50], V(0, 0, 0)), data);
    // BULLET STUFF
    EM.addSystem("breakBullets", Phase.GAME_WORLD, [
        BulletDef,
        ColorDef,
        WorldFrameDef,
        // LinearVelocityDef
        ParametricDef,
    ], [], (es, res) => {
        for (let b of es) {
            if (b.bullet.health <= 0) {
                breakBullet(b);
            }
        }
    });
    // dead bullet maintenance
    // NOTE: this must be called after any system that can create dead bullets but
    //   before the rendering systems.
    EM.addSystem("deadBullets", Phase.GAME_WORLD, [BulletDef, PositionDef, DeadDef, RenderableDef], [], (es, _) => {
        for (let e of es) {
            if (e.dead.processed)
                continue;
            e.bullet.health = 10;
            vec3.set(0, -100, 0, e.position);
            e.renderable.hidden = true;
            e.dead.processed = true;
        }
    });
    // await landPromise;
    // TODO(@darzu): MULTIPLAYER. add this milestone back in.
    // dbgLogMilestone("Game playable");
}
const { Ld53PlayerPropsDef, Ld53PlayerLocalDef, createLd53PlayerAsync } = defineNetEntityHelper({
    name: "ld53Player",
    defaultProps: () => ({ parentId: 0, color: V(0, 0, 0) }),
    updateProps: (p, parentId, color) => {
        p.parentId = parentId;
        vec3.copy(p.color, color);
        return p;
    },
    serializeProps: (o, buf) => {
        buf.writeUint32(o.parentId);
        buf.writeVec3(o.color);
    },
    deserializeProps: (o, buf) => {
        o.parentId = buf.readUint32();
        buf.readVec3(o.color);
    },
    defaultLocal: () => { },
    dynamicComponents: [PositionDef, RotationDef],
    buildResources: [LD53MeshesDef, MeDef],
    build: (p, res) => {
        if (p.authority.pid === res.me.pid) {
            EM.set(p, ControllableDef);
            p.controllable.modes.canFall = false;
            p.controllable.modes.canJump = false;
            // g.controllable.modes.canYaw = true;
            // g.controllable.modes.canPitch = true;
            EM.set(p, CameraFollowDef, 1);
            // setCameraFollowPosition(p, "firstPerson");
            // setCameraFollowPosition(p, "thirdPerson");
            p.cameraFollow.positionOffset = V(0, 0, 5);
            p.controllable.speed *= 0.5;
            p.controllable.sprintMul = 10;
            vec3.copy(p.position, [0, 1, -1.2]);
            vec3.copy(p.position, [-28.11, 26.0, -28.39]);
            quat.copy(p.rotation, [0.0, -0.94, 0.0, 0.34]);
            vec3.copy(p.cameraFollow.positionOffset, [0.0, 2.0, 5.0]);
            p.cameraFollow.yawOffset = 0.0;
            p.cameraFollow.pitchOffset = -0.593;
            EM.ensureResource(LocalPlayerEntityDef, p.id);
            // TODO(@darzu): REFACTOR. dont use HsPlayerDef?
            // EM.set(p, HsPlayerDef);
        }
        EM.set(p, MotionSmoothingDef);
        // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
        // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
        EM.set(p, LinearVelocityDef);
        quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, p.rotation);
        const sphereMesh = cloneMesh(res.ld53Meshes.ball.mesh);
        const visible = true;
        EM.set(p, RenderableConstructDef, sphereMesh, visible);
        EM.set(p, ColorDef, p.ld53PlayerProps.color);
        // EM.set(b2, PositionDef, [0, 0, -1.2]);
        EM.set(p, WorldFrameDef);
        // EM.set(b2, PhysicsParentDef, g.id);
        EM.set(p, ColliderDef, {
            shape: "AABB",
            solid: true,
            aabb: res.ld53Meshes.ball.aabb,
        });
        EM.set(p, PhysicsParentDef, p.ld53PlayerProps.parentId);
        EM.set(p, CanManDef);
        return p;
    },
});
EM.addEagerInit([Ld53PlayerPropsDef], [], [], () => {
    // EM.addSystem(
    //   "playerDbg",
    //   Phase.GAME_PLAYERS,
    //   [Ld53PlayerPropsDef, WorldFrameDef, PhysicsParentDef],
    //   [],
    //   (players) => {
    //     for (let p of players) {
    //       // TODO(@darzu): DEBUGGING!
    //       if (dbgOnce(`playerDbg${p.id}-parent${p.physicsParent.id}`)) {
    //         console.log(`player ${p.id} at: ${vec3Dbg(p.world.position)}`);
    //         console.log(`player ${p.id} parent: ${p.physicsParent.id}`);
    //       }
    //     }
    //   }
    // );
    EM.addSystem("ld53PlayerControl", Phase.GAME_PLAYERS, [ControllableDef], [InputsDef], (players, { inputs }) => {
        const cheat = !!EM.getResource(DevConsoleDef)?.showConsole;
        for (let p of players) {
            // determine modes
            p.controllable.modes.canSprint = true;
            if (CanManDef.isOn(p) && p.canMan.manning) {
                p.controllable.modes.canMove = false;
                p.controllable.modes.canPitch = false;
                p.controllable.modes.canYaw = false;
            }
            else {
                p.controllable.modes.canMove = true;
                p.controllable.modes.canPitch = true;
                p.controllable.modes.canYaw = true;
            }
            if (!cheat) {
                p.controllable.modes.canFall = true;
                p.controllable.modes.canFly = false;
                p.controllable.modes.canJump = false;
            }
            if (cheat && inputs.keyClicks["f"]) {
                p.controllable.modes.canFly = !p.controllable.modes.canFly;
            }
            if (p.controllable.modes.canFly) {
                p.controllable.modes.canFall = false;
                p.controllable.modes.canJump = false;
            }
            else if (cheat) {
                p.controllable.modes.canFall = true;
                p.controllable.modes.canJump = true;
            }
        }
    });
});
const terraVertsPerWorldUnit = 0.25;
const worldUnitPerTerraVerts = 1 / terraVertsPerWorldUnit;
const terraZCount = Math.floor(WORLD_WIDTH * terraVertsPerWorldUnit);
const terraXCount = Math.floor(WORLD_HEIGHT * terraVertsPerWorldUnit);
let terraMesh = undefined;
let terraEnt = undefined;
async function resetLand() {
    const res = await EM.whenResources(RendererDef);
    // once the map is loaded, we can run JFA
    res.renderer.renderer.submitPipelines([], [...mapJfa.allPipes()]);
    // TODO(@darzu): simplify this pattern
    const terraTex = await res.renderer.renderer.readTexture(mapJfa.sdfTex);
    const terraReader = createTextureReader(terraTex, mapJfa.sdfTex.size, 1, mapJfa.sdfTex.format);
    function sampleTerra(worldX, worldZ) {
        let xi = ((worldZ + WORLD_WIDTH * 0.5) / WORLD_WIDTH) * terraReader.size[0];
        let yi = ((worldX + WORLD_HEIGHT * 0.5) / WORLD_HEIGHT) * terraReader.size[1];
        // xi = clamp(xi, 0, terraReader.size[0]);
        // yi = clamp(yi, 0, terraReader.size[1]);
        const height = terraReader.sample(xi, yi) / 256;
        // console.log(`xi: ${xi}, yi: ${yi} => ${height}`);
        return height;
    }
    // height map
    if (!terraMesh) {
        terraMesh = createFlatQuadMesh(terraZCount, terraXCount);
        // TODO(@darzu): seperate chunks of land
        // console.log(`heightmap minY: ${minY}`);
        const hm = EM.new();
        EM.set(hm, RenderableConstructDef, terraMesh, !DBG_HIDE_LAND);
        EM.set(hm, PositionDef);
        // TODO(@darzu): maybe do a sable-like gradient accross the terrain, based on view dist or just uv?
        // EM.set(hm, ColorDef, V(0.4, 0.2, 0.2));
        EM.set(hm, ColorDef, ENDESGA16.lightGray);
        const hm2 = await EM.whenEntityHas(hm, RenderableDef);
        terraEnt = hm2;
    }
    else {
        resetFlatQuadMesh(terraZCount, terraXCount, terraMesh);
    }
    // let minY = Infinity;
    terraMesh.pos.forEach((p, i) => {
        // console.log("i: " + vec3Dbg(p));
        // vec3.zero(p);
        // TODO(@darzu): very weird to read from mesh x/z here
        const x = p[0] * worldUnitPerTerraVerts - WORLD_HEIGHT * 0.5;
        const z = p[2] * worldUnitPerTerraVerts - WORLD_WIDTH * 0.5;
        let y = sampleTerra(x, z) * 100.0;
        // minY = Math.min(minY, y);
        // TODO(@darzu): wierd hack for shorline:
        if (y <= 1.0)
            y = -30;
        y += Math.random() * 2.0; // TODO(@darzu): jitter for less uniform look?
        p[0] = x;
        p[1] = y;
        p[2] = z;
        // console.log("o: " + vec3Dbg(p));
        // if (i > 10) throw "stop";
    });
    // submit verts to GPU
    res.renderer.renderer.stdPool.updateMeshVertices(terraEnt.renderable.meshHandle, terraMesh);
    const landRes = EM.ensureResource(LandDef);
    landRes.sample = sampleTerra;
}
//# sourceMappingURL=game-ld53.js.map