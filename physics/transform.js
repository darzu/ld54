import { EM } from "../ecs/entity-manager.js";
import { vec3, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { WorldFrameDef } from "./nonintersection.js";
import { Phase } from "../ecs/sys-phase.js";
export const IDENTITY_FRAME = {
    transform: mat4.IDENTITY,
    position: vec3.ZEROS,
    rotation: quat.IDENTITY,
    scale: vec3.ONES,
};
export function updateFrameFromTransform(f) {
    f.position = mat4.getTranslation(f.transform, f.position);
    f.rotation = mat4.getRotation(f.transform, f.rotation);
    f.scale = mat4.getScaling(f.transform, f.scale);
}
export function updateFrameFromPosRotScale(f) {
    f.transform = mat4.fromRotationTranslationScale(f.rotation, f.position, f.scale, f.transform);
}
export function createFrame() {
    return {
        position: vec3.create(),
        rotation: quat.create(),
        scale: V(1, 1, 1),
        transform: mat4.create(),
    };
}
export function copyFrame(out, frame) {
    vec3.copy(out.position, frame.position);
    vec3.copy(out.scale, frame.scale);
    quat.copy(out.rotation, frame.rotation);
    mat4.copy(out.transform, frame.transform);
}
export function identityFrame(out) {
    vec3.zero(out.position);
    vec3.copy(out.scale, vec3.ONES);
    quat.identity(out.rotation);
    mat4.identity(out.transform);
}
// TRANSFORM
export const TransformDef = EM.defineComponent("transform", () => mat4.create(), (p, t) => (t ? mat4.copy(p, t) : p));
// POSITION
export const PositionDef = EM.defineComponent("position", () => V(0, 0, 0), (p, v) => (v ? vec3.copy(p, v) : p));
EM.registerSerializerPair(PositionDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
// ROTATION
export const RotationDef = EM.defineComponent("rotation", () => quat.create(), (p, r) => (r ? quat.copy(p, r) : p));
EM.registerSerializerPair(RotationDef, (o, buf) => buf.writeQuat(o), (o, buf) => buf.readQuat(o));
// SCALE
export const ScaleDef = EM.defineComponent("scale", () => V(1, 1, 1), (p, by) => (by ? vec3.copy(p, by) : p));
EM.registerSerializerPair(ScaleDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
// LOCAL FRAME HELPER
export const LocalFrameDefs = [
    PositionDef,
    RotationDef,
    ScaleDef,
    TransformDef,
];
// PARENT
export const PhysicsParentDef = EM.defineComponent("physicsParent", () => {
    return { id: 0 };
}, (p, parentId) => {
    if (parentId)
        p.id = parentId;
    return p;
});
EM.registerSerializerPair(PhysicsParentDef, (o, buf) => buf.writeUint32(o.id), (o, buf) => (o.id = buf.readUint32()));
const _transformables = new Map();
const _hasTransformed = new Set();
function updateWorldFromLocalAndParent(o) {
    if (_hasTransformed.has(o.id))
        return;
    // logOnce(`first updateWorldFromLocalAndParent for ${o.id}`);
    if (PhysicsParentDef.isOn(o) && _transformables.has(o.physicsParent.id)) {
        const parent = _transformables.get(o.physicsParent.id);
        // update parent first
        if (!_hasTransformed.has(o.physicsParent.id)) {
            updateWorldFromLocalAndParent(parent);
        }
        // update relative to parent
        // update relative to parent
        mat4.mul(parent.world.transform, o.transform, o.world.transform);
        updateFrameFromTransform(o.world);
    }
    else {
        // no parent
        copyFrame(o.world, o);
    }
    _hasTransformed.add(o.id);
}
export function registerInitTransforms() {
    // TODO(@darzu): WorldFrame should be optional, only needed
    //  for parented objs (which is maybe the uncommon case).
    EM.addSystem("ensureWorldFrame", Phase.PRE_PHYSICS, [...LocalFrameDefs], [], (objs) => {
        for (let o of objs) {
            if (!WorldFrameDef.isOn(o)) {
                EM.set(o, WorldFrameDef);
                copyFrame(o.world, o);
            }
        }
    });
}
export function registerUpdateLocalFromPosRotScale() {
    EM.addSystem("ensureFillOutLocalFrame", Phase.PRE_PHYSICS, null, [], (objs) => {
        // TODO(@darzu): PERF. Hacky custom query! Not cached n stuff.
        for (let o of EM.entities.values()) {
            if (!o.id)
                continue;
            // TODO(@darzu): do we really want these on every entity?
            if (PositionDef.isOn(o) ||
                RotationDef.isOn(o) ||
                ScaleDef.isOn(o) ||
                TransformDef.isOn(o)) {
                EM.set(o, PositionDef);
                EM.set(o, RotationDef);
                EM.set(o, ScaleDef);
                EM.set(o, TransformDef);
            }
        }
    });
    // calculate the world transform
    EM.addSystem("updateLocalFromPosRotScale", Phase.PHYSICS_FINISH_LOCAL, [...LocalFrameDefs], [], (objs) => {
        for (let o of objs)
            updateFrameFromPosRotScale(o);
    });
}
export function registerUpdateWorldFromLocalAndParent(suffix, phase) {
    // calculate the world transform
    EM.addSystem("updateWorldFromLocalAndParent" + suffix, phase, [WorldFrameDef, ...LocalFrameDefs], [], (objs) => {
        _transformables.clear();
        _hasTransformed.clear();
        for (let o of objs) {
            _transformables.set(o.id, o);
        }
        for (let o of objs) {
            updateWorldFromLocalAndParent(o);
        }
    });
}
//# sourceMappingURL=transform.js.map