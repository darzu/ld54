import { EM } from "../ecs/entity-manager.js";
import { vec3, quat, V } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { Phase } from "../ecs/sys-phase.js";
export const LinearVelocityDef = EM.defineComponent("linearVelocity", () => V(0, 0, 0), (p, v) => (v ? vec3.copy(p, v) : p));
EM.registerSerializerPair(LinearVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
export const AngularVelocityDef = EM.defineComponent("angularVelocity", () => V(0, 0, 0), (p, v) => (v ? vec3.copy(p, v) : p));
EM.registerSerializerPair(AngularVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
let _linVelDelta = vec3.create();
let _normalizedVelocity = vec3.create();
let _deltaRotation = quat.create();
export function registerPhysicsApplyLinearVelocity() {
    EM.addSystem("registerPhysicsApplyLinearVelocity", Phase.PHYSICS_MOTION, [LinearVelocityDef, PositionDef], [TimeDef], (objs, res) => {
        for (let o of objs) {
            // translate position and AABB according to linear velocity
            _linVelDelta = vec3.scale(o.linearVelocity, res.time.dt, _linVelDelta);
            vec3.add(o.position, _linVelDelta, o.position);
        }
    });
}
export function registerPhysicsApplyAngularVelocity() {
    EM.addSystem("physicsApplyAngularVelocity", Phase.PHYSICS_MOTION, [AngularVelocityDef, RotationDef], [TimeDef], (objs, res) => {
        for (let o of objs) {
            // change rotation according to angular velocity
            // change rotation according to angular velocity
            vec3.normalize(o.angularVelocity, _normalizedVelocity);
            let angle = vec3.length(o.angularVelocity) * res.time.dt;
            _deltaRotation = quat.setAxisAngle(_normalizedVelocity, angle, _deltaRotation);
            quat.normalize(_deltaRotation, _deltaRotation);
            // note--quat multiplication is not commutative, need to multiply on the left
            // note--quat multiplication is not commutative, need to multiply on the left
            quat.mul(_deltaRotation, o.rotation, o.rotation);
        }
    });
}
//# sourceMappingURL=velocity.js.map