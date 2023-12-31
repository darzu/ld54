import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { BallMesh } from "../meshes/mesh-list.js";
import { cloneMesh, mergeMeshes, } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, ScaleDef, } from "../physics/transform.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { randFloat, sphereRadiusFromVolume, sphereVolumeFromRadius, } from "../utils/math.js";
import { assert } from "../utils/util.js";
import { randNormalVec3, randQuat } from "../utils/utils-3d.js";
import { LD54GameStateDef, FUEL_PER_ORE, OXYGEN_PER_ORE, FUEL_CONSUMPTION_RATE, SHIP_SPEED, OXYGEN_CONSUMPTION_RATE, STARTING_FUEL, STARTING_OXYGEN, SWORD_SWING_DURATION, } from "./gamestate.js";
import { SpaceSuitDef } from "./space-suit-controller.js";
let _t1 = vec3.create();
let _t2 = quat.create();
function createFuelOreMesh() {
    const meshes = [];
    let numCubes = 5;
    for (let i = 0; i < numCubes; i++) {
        // TODO(@darzu):
        const c = mkCubeMesh();
        const randTrans = vec3.scale(randNormalVec3(_t1), 2, _t1);
        vec3.add(randTrans, [0, 0, 1 * i], randTrans);
        const randRot = randQuat(_t2);
        const randScale = randFloat(1, 2);
        c.pos.forEach((p) => {
            vec3.transformQuat(p, randRot, p);
            vec3.scale(p, randScale, p);
            vec3.add(p, randTrans, p);
        });
        // const randColorIdx = randInt(0, 2);
        const randColor = [
            ENDESGA16.lightGreen,
            ENDESGA16.darkGreen,
            ENDESGA16.deepGreen,
        ][i % 3];
        c.colors.forEach((c) => {
            vec3.copy(c, randColor);
        });
        meshes.push(c);
    }
    const result = mergeMeshes(...meshes);
    result.usesProvoking = true;
    result.surfaceIds = result.colors.map((_, i) => i);
    return result;
}
function createOxygenOreMesh(mkBallMesh) {
    const meshes = [];
    let numCubes = 5;
    for (let i = 0; i < numCubes; i++) {
        // TODO(@darzu):
        // const c = cloneMesh(TETRA_MESH);
        // const c = HEX_MESH();
        const c = mkBallMesh();
        const randTrans = vec3.scale(randNormalVec3(_t1), 2, _t1);
        vec3.add(randTrans, [0, 0, 1 * i], randTrans);
        const randRot = randQuat(_t2);
        const randScale = randFloat(1, 2);
        c.pos.forEach((p) => {
            vec3.transformQuat(p, randRot, p);
            vec3.scale(p, randScale, p);
            vec3.add(p, randTrans, p);
        });
        // const randColorIdx = randInt(0, 2);
        const randColor = [ENDESGA16.white, ENDESGA16.lightBlue, ENDESGA16.blue][i % 3];
        c.colors.forEach((c) => {
            vec3.copy(c, randColor);
        });
        meshes.push(c);
    }
    const result = mergeMeshes(...meshes);
    result.usesProvoking = true;
    result.surfaceIds = result.colors.map((_, i) => i);
    return result;
}
export const OreDef = EM.defineComponent("ore", () => ({
    carried: false,
    type: "fuel",
}));
export const OreCarrierDef = EM.defineNonupdatableComponent("oreCarrier", (colliderId) => ({
    carrying: undefined,
    colliderId: colliderId ?? 0,
}));
export const OreStoreDef = EM.defineComponent("oreStore", () => ({
    fuelOres: [],
    oxygenOres: [],
}));
export async function initOre(spacePath) {
    const ballGameMesh = await EM.whenResources(BallMesh.def);
    const mkBallMesh = () => cloneMesh(ballGameMesh.mesh_ball.mesh);
    const store = await EM.whenSingleEntity(OreStoreDef);
    // fuel slot locations
    const spc = 8;
    const fuelSlots = [
        V(0, 5, -16),
        V(spc, 5, -16),
        V(-spc, 5, -16),
        V(0, 5, -16 - spc),
        V(spc, 5, -16 - spc),
        V(-spc, 5, -16 - spc),
        V(0, 5 + spc, -16),
        V(spc, 5 + spc, -16),
        V(-spc, 5 + spc, -16),
        V(0, 5 + spc, -16 - spc),
        V(spc, 5 + spc, -16 - spc),
        V(-spc, 5 + spc, -16 - spc),
    ];
    const oxygenSlots = [
        V(0, 5, 10),
        V(spc, 5, 10),
        V(-spc, 5, 10),
        V(0, 5, 10 + spc),
        V(spc, 5, 10 + spc),
        V(-spc, 5, 10 + spc),
        V(0, 5, 10),
        V(spc, 5 + spc, 10),
        V(-spc, 5 + spc, 10),
        V(0, 5 + spc, 10 + spc),
        V(spc, 5 + spc, 10 + spc),
        V(-spc, 5 + spc, 10 + spc),
    ];
    function fuelOreToTravelDist(ore) {
        return (ore * SHIP_SPEED) / FUEL_CONSUMPTION_RATE;
    }
    function oxygenOreToTravelDist(ore) {
        return (ore * SHIP_SPEED) / OXYGEN_CONSUMPTION_RATE;
    }
    function getFuelMargin() {
        return 0.0;
    }
    function getOxygenMargin() {
        return 0.0;
    }
    // ore parameters
    const oxyOreTravelDist = oxygenOreToTravelDist(OXYGEN_PER_ORE);
    const fuelOreTravelDist = fuelOreToTravelDist(FUEL_PER_ORE);
    // console.log(`fuelOreTravelDist: ${fuelOreTravelDist}`);
    const pathDistances = []; // cumulative distance
    {
        // path distances
        let prevPos = spacePath[0].pos;
        let lastDist = 0;
        for (let i = 0; i < spacePath.length; i++) {
            const newTravel = vec3.dist(spacePath[i].pos, prevPos);
            const dist = lastDist + newTravel;
            prevPos = spacePath[i].pos;
            lastDist = dist;
            pathDistances.push(dist);
        }
    }
    const totalDistance = pathDistances.at(-1);
    console.log(`total path distance: ${totalDistance}`);
    // place fuel
    {
        let numFuelSpawned = 0;
        let totalFuelTravel = fuelOreToTravelDist(STARTING_FUEL);
        while (totalFuelTravel < totalDistance) {
            const nextOreStop = totalFuelTravel - fuelOreTravelDist * getFuelMargin();
            const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
            const seg = spacePath[segIdx];
            const randDistFromTrack = randFloat(20, 100);
            const pos = vec3.scale(randNormalVec3(), randDistFromTrack, vec3.create());
            pos[2] = seg.pos[2];
            createFuelOre(pos);
            numFuelSpawned++;
            totalFuelTravel = nextOreStop + fuelOreTravelDist;
        }
        console.log(`spawned ${numFuelSpawned} fuel, for ${fuelOreTravelDist * numFuelSpawned} travel`);
        // place starter fuel onboard
        const numStarterFuel = Math.ceil(STARTING_FUEL / FUEL_PER_ORE);
        // console.log(`CREATING ${numStarterFuel} starter fuel`);
        for (let i = 0; i < numStarterFuel; i++) {
            const ore = createFuelOre(vec3.clone(fuelSlots[i]));
            ore.ore.carried = true;
            vec3.zero(ore.angularVelocity);
            EM.set(ore, PhysicsParentDef, store.id);
            EM.whenEntityHas(ore, OreDef, PositionDef, RenderableDef).then((ore) => {
                store.oreStore.fuelOres.push(ore);
            });
        }
    }
    // place oxygen
    {
        let totalOxygenTravel = oxygenOreToTravelDist(STARTING_OXYGEN);
        while (totalOxygenTravel < totalDistance) {
            const nextOreStop = totalOxygenTravel - oxyOreTravelDist * getOxygenMargin();
            const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
            const seg = spacePath[segIdx];
            const randDistFromTrack = randFloat(20, 100);
            const pos = vec3.scale(randNormalVec3(), randDistFromTrack, vec3.create());
            pos[2] = seg.pos[2];
            createOxygenOre(pos);
            totalOxygenTravel = nextOreStop + oxyOreTravelDist;
        }
        // place starter oxygen onboard
        const numStarterOxygen = Math.ceil(STARTING_OXYGEN / OXYGEN_PER_ORE);
        for (let i = 0; i < numStarterOxygen; i++) {
            const ore = createOxygenOre(vec3.clone(oxygenSlots[i]));
            ore.ore.carried = true;
            vec3.zero(ore.angularVelocity);
            EM.set(ore, PhysicsParentDef, store.id);
            EM.whenEntityHas(ore, OreDef, PositionDef, RenderableDef).then((ore) => {
                store.oreStore.oxygenOres.push(ore);
            });
        }
    }
    EM.addSystem("interactWithOre", Phase.GAME_PLAYERS, [OreCarrierDef, PositionDef, SpaceSuitDef], [PhysicsResultsDef, LD54GameStateDef], (es, res) => {
        if (!es.length)
            return;
        assert(es.length === 1);
        const carrier = es[0];
        // collisions?
        const otherIds = res.physicsResults.collidesWith.get(carrier.oreCarrier.colliderId);
        if (!otherIds)
            return;
        if (carrier.oreCarrier.carrying) {
            // we're carying ore
            const stores = otherIds
                .map((id) => EM.findEntity(id, [OreStoreDef, PositionDef]))
                .filter((e) => e !== undefined);
            if (!stores.length)
                return; // didn't reach the store
            assert(stores.length === 1);
            const store = stores[0];
            // transfer to store
            const ore = carrier.oreCarrier.carrying;
            ore.ore.carried = true;
            carrier.oreCarrier.carrying = undefined;
            if (ore.ore.type === "fuel") {
                const idx = store.oreStore.fuelOres.length;
                store.oreStore.fuelOres.push(ore);
                const pos = fuelSlots[idx % fuelSlots.length];
                vec3.copy(ore.position, pos);
            }
            else {
                const idx = store.oreStore.oxygenOres.length;
                store.oreStore.oxygenOres.push(ore);
                const pos = oxygenSlots[idx % oxygenSlots.length];
                vec3.copy(ore.position, pos);
            }
            EM.set(ore, PhysicsParentDef, store.id);
            // update game state
            switch (ore.ore.type) {
                case "fuel":
                    res.ld54GameState.fuel += FUEL_PER_ORE;
                    break;
                case "oxygen":
                    res.ld54GameState.oxygen += OXYGEN_PER_ORE;
                    break;
            }
        }
        else {
            // we're not carying ore
            const ores = otherIds
                .map((id) => EM.findEntity(id, [
                OreDef,
                PositionDef,
                AngularVelocityDef,
                RenderableDef,
            ]))
                .filter((e) => e !== undefined && !e.ore.carried);
            if (!ores.length)
                return; // didn't reach any new ore
            // only collect if we are swingin
            if (carrier.spaceSuit.swingingSword &&
                carrier.spaceSuit.swordSwingT > 0.7 * SWORD_SWING_DURATION) {
                // transfer to carrier
                const ore = ores[0];
                carrier.oreCarrier.carrying = ore;
                ore.ore.carried = true;
                vec3.zero(ore.angularVelocity); // stop spinning
                EM.set(ore, PhysicsParentDef, carrier.id);
                vec3.set(0, 0, -5, ore.position);
            }
        }
    });
    const oreFullVolume = sphereVolumeFromRadius(1);
    // const oreFullRadius = sphereRadiusFromVolume(oreFullVolume);
    // console.log(`oreFullVolume: ${oreFullVolume}, rad: ${oreFullRadius}`);
    EM.addSystem("manageOreSlots", Phase.GAME_PLAYERS, [OreStoreDef, PositionDef], [PhysicsResultsDef, LD54GameStateDef], (es, res) => {
        if (!es.length)
            return;
        assert(es.length === 1);
        const store = es[0];
        // adjust ore fuel in slots based on fuel left
        const numFuelShouldHave = Math.ceil(res.ld54GameState.fuel / FUEL_PER_ORE);
        if (numFuelShouldHave < store.oreStore.fuelOres.length) {
            const deadOre = store.oreStore.fuelOres.pop();
            deadOre.renderable.hidden = true;
        }
        const fuelFrac = (res.ld54GameState.fuel % FUEL_PER_ORE) / FUEL_PER_ORE;
        const fuelRad = sphereRadiusFromVolume(fuelFrac * oreFullVolume);
        store.oreStore.fuelOres.forEach((o, i) => {
            if (i === store.oreStore.fuelOres.length - 1)
                EM.set(o, ScaleDef, [fuelRad, fuelRad, fuelRad]);
            else
                EM.set(o, ScaleDef, [1, 1, 1]);
        });
        // adjust ore oxygen in slots based on oxygen left
        const numOxygenShouldHave = Math.ceil(res.ld54GameState.oxygen / OXYGEN_PER_ORE);
        if (numOxygenShouldHave < store.oreStore.oxygenOres.length) {
            const deadOre = store.oreStore.oxygenOres.pop();
            deadOre.renderable.hidden = true;
        }
        const oxygenFrac = (res.ld54GameState.oxygen % OXYGEN_PER_ORE) / OXYGEN_PER_ORE;
        const oxygenRad = sphereRadiusFromVolume(oxygenFrac * oreFullVolume);
        store.oreStore.oxygenOres.forEach((o, i) => {
            if (i === store.oreStore.oxygenOres.length - 1)
                EM.set(o, ScaleDef, [oxygenRad, oxygenRad, oxygenRad]);
            else
                EM.set(o, ScaleDef, [1, 1, 1]);
        });
    });
    function createOxygenOre(pos) {
        const ore = EM.new();
        EM.set(ore, OreDef);
        ore.ore.type = "oxygen";
        // mesh
        const mesh = createOxygenOreMesh(mkBallMesh);
        EM.set(ore, RenderableConstructDef, mesh);
        // collider
        const S = -3;
        EM.set(ore, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
        });
        // pos
        EM.set(ore, PositionDef, pos);
        // spin
        EM.set(ore, AngularVelocityDef);
        randNormalVec3(ore.angularVelocity);
        vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);
        return ore;
    }
    function createFuelOre(pos) {
        const ore = EM.new();
        EM.set(ore, OreDef);
        ore.ore.type = "fuel";
        // mesh
        const mesh = createFuelOreMesh();
        EM.set(ore, RenderableConstructDef, mesh);
        EM.set(ore, PositionDef, pos);
        // collider
        const S = -3;
        EM.set(ore, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
        });
        // pos
        EM.set(ore, AngularVelocityDef);
        // spin
        randNormalVec3(ore.angularVelocity);
        vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);
        return ore;
    }
}
//# sourceMappingURL=ore.js.map