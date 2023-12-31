import { CubeMesh, LD53CannonMesh } from "../meshes/mesh-list.js";
import { AudioDef } from "../audio/audio.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { BulletDef, fireBullet } from "../cannons/bullet.js";
import { GravityDef } from "../motion/gravity.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { PartyDef } from "../camera/party.js";
import { jitter } from "../utils/math.js";
import { copyAABB, createAABB, doesOverlapAABB, mergeAABBs, pointInAABB, transformAABB, updateAABBWithPoint, } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsResultsDef, WorldFrameDef, } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, ScaleDef, } from "../physics/transform.js";
import { createEmptyMesh } from "../meshes/mesh.js";
import { RenderableConstructDef, RenderableDef, RendererDef, } from "../render/renderer-ecs.js";
import { mat4, V, vec3, quat } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { assert } from "../utils/util.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
const GRAVITY = 6.0 * 0.00001;
const MIN_BRICK_PERCENT = 0.6;
function createEmptyStoneState() {
    return {
        mesh: createEmptyMesh("tower"),
        rows: [],
        totalBricks: 0,
        currentBricks: 0,
        aabb: createAABB(),
    };
}
export const StoneTowerDef = EM.defineNonupdatableComponent("stoneTower", (cannon, stone, fireRate = 1500, projectileSpeed = 0.2, firingRadius = Math.PI / 8) => ({
    stone,
    cannon: createRef(cannon),
    lastFired: 0,
    fireRate,
    projectileSpeed,
    firingRadius,
    alive: true,
}));
function knockOutBrickAtIndex(stone, index) {
    for (let i = 0; i < 8; i++) {
        vec3.set(0, 0, 0, stone.mesh.pos[index + i]);
    }
}
let towardsAttractorTmp = vec3.tmp();
let testAABBTmp = vec3.tmp();
function shrinkBrickAtIndex(stone, baseIndex, aabb) {
    // is right face entirely outside AABB?
    const rightFace = [0, 2, 4, 6];
    const leftFace = [1, 3, 5, 7];
    let face;
    if (rightFace.every((index) => !pointInAABB(aabb, stone.mesh.pos[baseIndex + index]))) {
        //console.log(`right face out of AABB at index ${baseIndex}`);
        face = rightFace;
    }
    else if (leftFace.every((index) => !pointInAABB(aabb, stone.mesh.pos[baseIndex + index]))) {
        //console.log(`left face out of AABB at index ${baseIndex}`);
        face = leftFace;
    }
    if (!face) {
        // neither face is entirely outside the AABB
        return false;
    }
    for (let index of face) {
        // each point can attract a point across from it along x
        let attractedIndex = index % 2 === 0 ? index + 1 : index - 1;
        let attractor = stone.mesh.pos[baseIndex + index];
        let attracted = stone.mesh.pos[baseIndex + attractedIndex];
        if (pointInAABB(aabb, attractor)) {
            console.log("should never happen");
        }
        if (pointInAABB(aabb, attracted)) {
            let towardsAttractor = vec3.sub(attractor, attracted, towardsAttractorTmp);
            let min = 0;
            let max = 0.8; // don't want to shrink bricks too much
            if (pointInAABB(aabb, vec3.add(attracted, vec3.scale(towardsAttractor, max, testAABBTmp), testAABBTmp))) {
                //console.log(`unshrinkable point at ${baseIndex} + ${attractedIndex}`);
                // can't shrink this point enough, giving up
                return false;
            }
            // we can shrink along this axis!
            // iterate for 10 rounds
            for (let i = 0; i < 10; i++) {
                //console.log(`iteration ${i}, min=${min}, max=${max}`);
                const half = (min + max) / 2;
                if (pointInAABB(aabb, vec3.add(attracted, vec3.scale(towardsAttractor, half, testAABBTmp), testAABBTmp))) {
                    min = half;
                }
                else {
                    max = half;
                }
            }
            //console.log(`done with iterations, max is ${max}`);
            vec3.add(attracted, vec3.scale(towardsAttractor, max), attracted);
        }
    }
    return true;
}
// takes a tower-space AABB--not world space!
function knockOutBricks(stone, aabb, shrink = false) {
    let bricksKnockedOut = 0;
    for (let row of stone.rows) {
        if (doesOverlapAABB(row.aabb, aabb)) {
            for (let brick of row.bricks) {
                if (doesOverlapAABB(brick.aabb, aabb)) {
                    if (shrink) {
                        if (!shrinkBrickAtIndex(stone, brick.index, aabb)) {
                            row.totalBricks--;
                            knockOutBrickAtIndex(stone, brick.index);
                        }
                    }
                    else {
                        knockOutBrickAtIndex(stone, brick.index);
                        if (!brick.knockedOut) {
                            brick.knockedOut = true;
                            bricksKnockedOut++;
                            row.bricksKnockedOut++;
                        }
                    }
                }
            }
        }
    }
    return bricksKnockedOut;
}
// takes a tower-space AABB--not world space!
function knockOutBricksByBullet(tower, aabb, bullet) {
    // [bricks knocked out, updated health]
    let bricksKnockedOut = 0;
    for (let row of tower.stoneTower.stone.rows) {
        if (doesOverlapAABB(row.aabb, aabb)) {
            for (let brick of row.bricks) {
                if (bullet.health <= 0) {
                    return bricksKnockedOut;
                }
                if (doesOverlapAABB(brick.aabb, aabb) && !brick.knockedOut) {
                    const dmg = Math.min(brick.health, bullet.health) + 0.001;
                    bullet.health -= dmg;
                    brick.health -= dmg;
                    if (brick.health <= 0) {
                        row.bricksKnockedOut++;
                        knockOutBrickAtIndex(tower.stoneTower.stone, brick.index);
                        brick.knockedOut = true;
                        bricksKnockedOut++;
                        flyingBrickPool.spawn().then((flyingBrick) => {
                            flyingBrick.physicsParent.id = tower.id;
                            //console.log(brick.pos[0]);
                            vec3.copy(flyingBrick.position, brick.pos[0]);
                            vec3.copy(flyingBrick.color, brick.color);
                        });
                    }
                }
            }
        }
    }
    return bricksKnockedOut;
}
function restoreBrick(tower, brick) {
    brick.health = startingBrickHealth;
    if (brick.knockedOut) {
        for (let i = 0; i < 8; i++) {
            vec3.copy(tower.stone.mesh.pos[brick.index + i], brick.pos[i]);
        }
        brick.knockedOut = false;
        return true;
    }
    return false;
}
function restoreAllBricks(tower) {
    let bricksRestored = 0;
    for (let row of tower.stone.rows) {
        row.bricksKnockedOut = 0;
        for (let brick of row.bricks) {
            if (restoreBrick(tower, brick)) {
                bricksRestored++;
            }
        }
    }
    return bricksRestored;
}
const maxStoneTowers = 10;
const height = 70;
const baseRadius = 20;
const approxBrickWidth = 5;
const approxBrickHeight = 2;
const brickDepth = 2.5;
const coolMode = false;
const startingBrickHealth = 1;
export function calculateNAndBrickWidth(radius, approxBrickWidth) {
    const n = Math.floor(Math.PI / Math.asin(approxBrickWidth / (2 * radius)));
    const brickWidth = radius * 2 * Math.sin(Math.PI / n);
    return [n, brickWidth];
}
const baseColor = ENDESGA16.lightGray;
const TowerMeshes = XY.defineMeshSetResource("towerMeshes", LD53CannonMesh, CubeMesh);
function createTowerState() {
    const state = createEmptyStoneState();
    const mesh = state.mesh;
    const rows = Math.floor(height / approxBrickHeight);
    const brickHeight = height / rows;
    const cursor = mat4.create();
    function applyCursor(v, distort = false) {
        vec3.transformMat4(v, cursor, v);
        if (distort)
            vec3.add(v, [
                jitter(approxBrickWidth / 10),
                jitter(brickHeight / 10),
                jitter(brickDepth / 10),
            ], v);
        return v;
    }
    function appendBrick(brickWidth, brickDepth) {
        const index = mesh.pos.length;
        const aabb = createAABB();
        // base
        const pos = [];
        function addPos(p) {
            pos.push(vec3.clone(p));
            mesh.pos.push(p);
            updateAABBWithPoint(aabb, p);
        }
        addPos(applyCursor(V(0, 0, 0)));
        addPos(applyCursor(V(0 + brickWidth, 0, 0)));
        addPos(applyCursor(V(0, 0, 0 + brickDepth), true));
        addPos(applyCursor(V(0 + brickWidth, 0, 0 + brickDepth), true));
        //top
        addPos(applyCursor(V(0, 0 + brickHeight, 0)));
        addPos(applyCursor(V(0 + brickWidth, 0 + brickHeight, 0)));
        addPos(applyCursor(V(0, 0 + brickHeight, 0 + brickDepth), true));
        addPos(applyCursor(V(0 + brickWidth, 0 + brickHeight, 0 + brickDepth), true));
        // base
        mesh.quad.push(V(index, index + 1, index + 3, index + 2));
        // top
        mesh.quad.push(V(index + 4, index + 2 + 4, index + 3 + 4, index + 1 + 4));
        // sides
        mesh.quad.push(V(index, index + 4, index + 1 + 4, index + 1));
        mesh.quad.push(V(index, index + 2, index + 2 + 4, index + 4));
        mesh.quad.push(V(index + 2, index + 3, index + 3 + 4, index + 2 + 4));
        mesh.quad.push(V(index + 1, index + 1 + 4, index + 3 + 4, index + 3));
        //
        const brightness = Math.random() * 0.05;
        const color = V(brightness, brightness, brightness);
        vec3.add(color, baseColor, color);
        for (let i = 0; i < 6; i++) {
            mesh.colors.push(color);
        }
        return {
            aabb,
            index,
            knockedOut: false,
            health: startingBrickHealth,
            pos,
            color,
        };
    }
    let rotation = 0;
    let towerAABB = createAABB();
    let totalBricks = 0;
    for (let r = 0; r < rows; r++) {
        const row = {
            aabb: createAABB(),
            bricks: [],
            totalBricks: 0,
            bricksKnockedOut: 0,
        };
        state.rows.push(row);
        const radius = baseRadius * (1 - r / (rows * 2));
        const [n, brickWidth] = calculateNAndBrickWidth(radius, approxBrickWidth);
        const angle = (2 * Math.PI) / n;
        mat4.identity(cursor);
        mat4.translate(cursor, [0, r * brickHeight, 0], cursor);
        rotation += angle / 2;
        rotation += jitter(angle / 4);
        mat4.rotateY(cursor, rotation, cursor);
        mat4.translate(cursor, [0, 0, radius], cursor);
        mat4.rotateY(cursor, coolMode ? -angle / 2 : angle / 2, cursor);
        for (let i = 0; i < n; i++) {
            totalBricks++;
            row.totalBricks++;
            const brick = appendBrick(brickWidth, brickDepth + jitter(brickDepth / 10));
            mergeAABBs(row.aabb, row.aabb, brick.aabb);
            row.bricks.push(brick);
            if (coolMode) {
                mat4.rotateY(cursor, angle, cursor);
                mat4.translate(cursor, [brickWidth, 0, 0], cursor);
            }
            else {
                mat4.translate(cursor, [brickWidth, 0, 0], cursor);
                mat4.rotateY(cursor, angle, cursor);
            }
        }
        mergeAABBs(towerAABB, towerAABB, row.aabb);
    }
    //mesh.quad.forEach(() => mesh.colors.push(V(0, 0, 0)));
    mesh.quad.forEach((_, i) => mesh.surfaceIds.push(i + 1));
    const windowHeight = 0.7 * height;
    const windowAABB = {
        min: V(baseRadius - 4 * brickDepth, windowHeight - 2 * brickHeight, -approxBrickWidth),
        max: V(baseRadius + 2 * brickDepth, windowHeight + 2 * brickHeight, approxBrickWidth),
    };
    knockOutBricks(state, windowAABB, true);
    state.totalBricks = totalBricks;
    state.currentBricks = totalBricks;
    state.aabb = towerAABB;
    return state;
}
export const towerPool = createEntityPool({
    max: maxStoneTowers,
    maxBehavior: "crash",
    create: async () => {
        const res = await EM.whenResources(TowerMeshes);
        const tower = EM.new();
        const cannon = EM.new();
        EM.set(cannon, RenderableConstructDef, res.towerMeshes.ld53_cannon.proto);
        EM.set(cannon, PositionDef);
        EM.set(cannon, ColorDef, V(0.05, 0.05, 0.05));
        EM.set(cannon, RotationDef);
        EM.set(cannon, PhysicsParentDef, tower.id);
        EM.set(cannon, WorldFrameDef);
        vec3.set(baseRadius - 2, height * 0.7, 0, cannon.position);
        const stone = createTowerState();
        EM.set(tower, StoneTowerDef, cannon, stone);
        EM.set(tower, PositionDef);
        EM.set(tower, RotationDef);
        EM.set(tower, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: stone.aabb,
        });
        EM.set(tower, RenderableConstructDef, tower.stoneTower.stone.mesh);
        return tower;
    },
    onSpawn: async (p) => {
        const cannon = p.stoneTower.cannon();
        EM.tryRemoveComponent(p.id, DeadDef);
        EM.tryRemoveComponent(cannon.id, DeadDef);
        if (RenderableDef.isOn(p))
            p.renderable.hidden = false;
        if (RenderableDef.isOn(cannon))
            cannon.renderable.hidden = false;
        // platform.towerPlatform.tiltPeriod = tiltPeriod;
        // platform.towerPlatform.tiltTimer = tiltTimer;
        p.stoneTower.lastFired = 0;
        if (restoreAllBricks(p.stoneTower)) {
            const res = await EM.whenResources(RendererDef);
            const meshHandle = (await EM.whenEntityHas(p, RenderableDef)).renderable
                .meshHandle;
            res.renderer.renderer.stdPool.updateMeshVertices(meshHandle, p.stoneTower.stone.mesh);
        }
        p.stoneTower.stone.currentBricks = p.stoneTower.stone.totalBricks;
        p.stoneTower.alive = true;
    },
    onDespawn: (e) => {
        // tower
        if (!DeadDef.isOn(e)) {
            // dead platform
            EM.set(e, DeadDef);
            if (RenderableDef.isOn(e))
                e.renderable.hidden = true;
            e.dead.processed = true;
            // dead cannon
            if (e.stoneTower.cannon()) {
                const c = e.stoneTower.cannon();
                EM.set(c, DeadDef);
                if (RenderableDef.isOn(c))
                    c.renderable.hidden = true;
                c.dead.processed = true;
            }
        }
    },
});
export async function spawnStoneTower() {
    return towerPool.spawn();
}
export const FlyingBrickDef = EM.defineComponent("flyingBrick", () => true);
const maxFlyingBricks = 50;
export const flyingBrickPool = createEntityPool({
    max: maxFlyingBricks,
    maxBehavior: "rand-despawn",
    create: async () => {
        const res = await EM.whenResources(TowerMeshes);
        const brick = EM.new();
        EM.set(brick, FlyingBrickDef);
        EM.set(brick, PositionDef);
        EM.set(brick, RotationDef);
        EM.set(brick, LinearVelocityDef);
        EM.set(brick, AngularVelocityDef);
        EM.set(brick, ColorDef);
        EM.set(brick, LifetimeDef);
        EM.set(brick, RenderableConstructDef, res.towerMeshes.cube.proto);
        EM.set(brick, GravityDef, V(0, -GRAVITY, 0));
        EM.set(brick, ScaleDef, V(approxBrickWidth / 2, approxBrickHeight / 2, brickDepth / 2));
        EM.set(brick, PhysicsParentDef);
        return brick;
    },
    onSpawn: async (e) => {
        EM.tryRemoveComponent(e.id, DeadDef);
        if (RenderableDef.isOn(e))
            e.renderable.hidden = false;
        // set random rotation and angular velocity
        quat.identity(e.rotation);
        quat.rotateX(e.rotation, Math.PI * 0.5, e.rotation);
        quat.rotateY(e.rotation, Math.PI * Math.random(), e.rotation);
        quat.rotateZ(e.rotation, Math.PI * Math.random(), e.rotation);
        vec3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, e.angularVelocity);
        vec3.scale(e.angularVelocity, 0.01, e.angularVelocity);
        vec3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, e.linearVelocity);
        vec3.scale(e.linearVelocity, 0.1, e.linearVelocity);
        e.lifetime.startMs = 8000;
        e.lifetime.ms = e.lifetime.startMs;
    },
    onDespawn: (e) => {
        EM.set(e, DeadDef);
        if (RenderableDef.isOn(e))
            e.renderable.hidden = true;
        e.dead.processed = true;
    },
});
EM.addSystem("despawnFlyingBricks", Phase.GAME_WORLD, [FlyingBrickDef, DeadDef], [], (es, _) => es.forEach((e) => {
    if (!e.dead.processed) {
        //console.log("despawning brick");
        flyingBrickPool.despawn(e);
    }
}));
const __previousPartyPos = vec3.create();
let __prevTime = 0;
const MAX_THETA = Math.PI / 2 - Math.PI / 16;
const MIN_THETA = -MAX_THETA;
const THETA_JITTER = 0; //Math.PI / 256;
const PHI_JITTER = 0; //Math.PI / 64;
const TARGET_WIDTH = 12;
const TARGET_LENGTH = 30;
const MISS_TARGET_LENGTH = 55;
const MISS_TARGET_WIDTH = 22;
const MISS_BY_MAX = 10;
const MISS_PROBABILITY = 0.25;
const MAX_RANGE = 300;
EM.addSystem("stoneTowerAttack", Phase.GAME_WORLD, [StoneTowerDef, WorldFrameDef], [TimeDef, PartyDef], (es, res) => {
    // pick a random spot on the ship to aim for
    if (!res.party.pos)
        return;
    for (let tower of es) {
        if (!tower.stoneTower.alive)
            continue;
        const invertedTransform = mat4.invert(tower.world.transform);
        const towerSpacePos = vec3.transformMat4(res.party.pos, invertedTransform);
        const prevTowerSpacePos = vec3.transformMat4(__previousPartyPos, invertedTransform);
        const targetVelocity = vec3.scale(vec3.sub(towerSpacePos, prevTowerSpacePos), 1 / (res.time.time - __prevTime));
        let zBasis = vec3.copy(vec3.tmp(), res.party.dir);
        let xBasis = vec3.cross(res.party.dir, [0, 1, 0]);
        let missed = false;
        // pick an actual target to aim for on the ship
        if (Math.random() < MISS_PROBABILITY) {
            missed = true;
            let xMul = 0;
            let zMul = 0;
            if (Math.random() < 0.5) {
                // miss width-wise
                xMul = 1;
            }
            else {
                // miss length-wise
                zMul = 1;
            }
            if (Math.random() < 0.5) {
                xMul *= -1;
                zMul *= -1;
            }
            vec3.scale(zBasis, zMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_LENGTH), zBasis);
            vec3.scale(xBasis, xMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_WIDTH), xBasis);
            xBasis[1] += 5;
        }
        else {
            vec3.scale(zBasis, (Math.random() - 0.5) * TARGET_LENGTH, zBasis);
            vec3.scale(xBasis, (Math.random() - 0.5) * TARGET_WIDTH, xBasis);
        }
        const target = vec3.add(res.party.pos, vec3.add(zBasis, xBasis, xBasis));
        //target[1] *= 0.75;
        //console.log(`adjusted target is ${vec3Dbg(target)}`);
        const towerSpaceTarget = vec3.transformMat4(target, invertedTransform, target);
        /*
        const zvelocity = targetVelocity[2];
  
        const timeToZZero = -(towerSpaceTarget[2] / zvelocity);
        if (timeToZZero < 0) {
          // it's moving away, don't worry about it
          continue;
        }
  
        // what will the x position be, relative to the cannon, when z = 0?
        const x =
          towerSpaceTarget[0] +
          targetVelocity[0] * timeToZZero -
          tower.stoneTower.cannon()!.position[0];
        // y is probably constant, but calculate it just for fun
        const y =
          towerSpaceTarget[1] +
          targetVelocity[1] * timeToZZero -
          tower.stoneTower.cannon()!.position[1];
        console.log(`timeToZZero=${timeToZZero}`);
        */
        const v = tower.stoneTower.projectileSpeed;
        const g = GRAVITY;
        let x = towerSpaceTarget[0] - tower.stoneTower.cannon().position[0];
        const y = towerSpaceTarget[1] - tower.stoneTower.cannon().position[1];
        let z = towerSpaceTarget[2];
        // try to lead the target a bit using an approximation of flight
        // time. this will not be exact.
        const flightTime = x / (v * Math.cos(Math.PI / 4));
        z = z + targetVelocity[2] * flightTime * 0.5;
        x = x + targetVelocity[0] * flightTime * 0.5;
        if (x < 0) {
            // target is behind us, don't worry about it
            continue;
        }
        if (x > MAX_RANGE) {
            // target is too far away, don't worry about it
            continue;
        }
        let phi = -Math.atan(z / x);
        if (Math.abs(phi) > tower.stoneTower.firingRadius) {
            continue;
        }
        x = Math.sqrt(x * x + z * z);
        // now, find the angle from our cannon.
        // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
        let theta1 = Math.atan((v * v + Math.sqrt(v * v * v * v - g * (g * x * x + 2 * y * v * v))) /
            (g * x));
        let theta2 = Math.atan((v * v - Math.sqrt(v * v * v * v - g * (g * x * x + 2 * y * v * v))) /
            (g * x));
        // prefer smaller theta
        if (theta2 > theta1) {
            let temp = theta1;
            theta1 = theta2;
            theta2 = temp;
        }
        let theta = theta2;
        if (isNaN(theta) || theta > MAX_THETA || theta < MIN_THETA) {
            theta = theta1;
        }
        if (isNaN(theta) || theta > MAX_THETA || theta < MIN_THETA) {
            // no firing solution--target is too far or too close
            continue;
        }
        // console.log(
        //   `Firing solution found, theta1 is ${theta1} theta2 is ${theta2} x=${x} y=${y} v=${v} sqrt is ${Math.sqrt(
        //     v * v * v * v - g * (g * x * x + 2 * y * v * v)
        //   )}`
        // );
        // ok, we have a firing solution. rotate to the right angle
        // fire if we are within a couple of frames
        /*
        console.log(`flightTime=${flightTime} timeToZZero=${timeToZZero}`);
        if (Math.abs(flightTime - timeToZZero) > 32) {
          continue;
        }*/
        // maybe we can't actually fire yet?
        if (tower.stoneTower.lastFired + tower.stoneTower.fireRate >
            res.time.time) {
            continue;
        }
        const rot = tower.stoneTower.cannon().rotation;
        quat.identity(rot);
        quat.rotateZ(rot, theta, rot);
        quat.rotateY(rot, phi, rot);
        // when we fire, add some jitter to both theta and phi
        quat.rotateZ(rot, jitter(THETA_JITTER), rot);
        quat.rotateZ(rot, jitter(PHI_JITTER), rot);
        const worldRot = quat.create();
        mat4.getRotation(mat4.mul(tower.world.transform, mat4.fromQuat(rot)), worldRot);
        const b = fireBullet(2, tower.stoneTower.cannon().world.position, worldRot, v, 0.02, g, 
        // 2.0,
        20.0, [1, 0, 0]);
        EM.whenResources(AudioDef, SoundSetDef).then((res) => {
            res.music.playSound("cannonL", res.soundSet["cannonL.mp3"], 0.1);
        });
        b.then((b) => {
            if (missed) {
                //vec3.set(0.8, 0.2, 0.2, b.color);
            }
        });
        tower.stoneTower.lastFired = res.time.time;
    }
    vec3.copy(__previousPartyPos, res.party.pos);
    __prevTime = res.time.time;
});
function destroyTower(tower) {
    let knockedOut = 0;
    let i = 0;
    while (knockedOut < maxFlyingBricks / 2 && i < 200) {
        i++;
        const rowIndex = Math.floor(Math.random() * tower.stoneTower.stone.rows.length);
        const brickIndex = Math.floor(Math.random() * tower.stoneTower.stone.rows[rowIndex].bricks.length);
        const brick = tower.stoneTower.stone.rows[rowIndex].bricks[brickIndex];
        if (!brick.knockedOut) {
            knockedOut++;
            knockOutBrickAtIndex(tower.stoneTower.stone, brick.index);
            brick.knockedOut = true;
            flyingBrickPool.spawn().then((flyingBrick) => {
                flyingBrick.physicsParent.id = tower.id;
                vec3.copy(flyingBrick.position, brick.pos[0]);
                vec3.copy(flyingBrick.color, brick.color);
                vec3.set(0, 0.01, 0, flyingBrick.linearVelocity);
            });
        }
    }
    tower.renderable.hidden = true;
    tower.stoneTower.alive = false;
    const cannon = tower.stoneTower.cannon();
    EM.whenEntityHas(cannon, RenderableDef).then((c) => (c.renderable.hidden = true));
}
EM.addSystem("stoneTowerDamage", Phase.GAME_WORLD, [StoneTowerDef, RenderableDef, WorldFrameDef], [PhysicsResultsDef, RendererDef], (es, res) => {
    const ballAABB = createAABB();
    for (let tower of es) {
        const hits = res.physicsResults.collidesWith.get(tower.id);
        if (hits) {
            const balls = hits
                .map((h) => EM.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef]))
                .filter((b) => {
                // TODO(@darzu): check authority and team
                return b && b.bullet.health > 0;
            })
                .map((b) => b);
            const invertedTransform = mat4.invert(tower.world.transform);
            let totalKnockedOut = 0;
            for (let ball of balls) {
                assert(ball.collider.shape === "AABB");
                copyAABB(ballAABB, ball.collider.aabb);
                transformAABB(ballAABB, ball.world.transform);
                transformAABB(ballAABB, invertedTransform);
                totalKnockedOut += knockOutBricksByBullet(tower, ballAABB, ball.bullet);
            }
            if (totalKnockedOut) {
                EM.whenResources(AudioDef, SoundSetDef).then((res) => {
                    res.music.playSound("stonebreak", res.soundSet["stonebreak.wav"], 0.1);
                });
                tower.stoneTower.stone.currentBricks -= totalKnockedOut;
                if (tower.stoneTower.stone.currentBricks /
                    tower.stoneTower.stone.totalBricks <
                    MIN_BRICK_PERCENT) {
                    destroyTower(tower);
                }
                else {
                    for (let row of tower.stoneTower.stone.rows) {
                        if (row.bricksKnockedOut === row.totalBricks) {
                            destroyTower(tower);
                        }
                    }
                }
                res.renderer.renderer.stdPool.updateMeshVertices(tower.renderable.meshHandle, tower.stoneTower.stone.mesh);
            }
        }
    }
});
//# sourceMappingURL=stone.js.map