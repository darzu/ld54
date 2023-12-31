import { EM } from "../ecs/entity-manager.js";
import { PredictDef } from "./components.js";
import { vec3, quat } from "../matrix/sprig-matrix.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { Phase } from "../ecs/sys-phase.js";
export function initNetPredictSystems() {
    EM.addSystem("netPredict", Phase.NETWORK, [PredictDef, PositionDef, LinearVelocityDef], [], (entities) => {
        for (let entity of entities) {
            if (entity.predict.dt > 0) {
                // TODO: non-ballistic prediction?
                let deltaV = vec3.scale(entity.linearVelocity, entity.predict.dt);
                vec3.add(entity.position, deltaV, entity.position);
                if (AngularVelocityDef.isOn(entity) && RotationDef.isOn(entity)) {
                    let normalizedVelocity = vec3.normalize(entity.angularVelocity);
                    let angle = vec3.length(entity.angularVelocity) * entity.predict.dt;
                    let deltaRotation = quat.setAxisAngle(normalizedVelocity, angle);
                    quat.normalize(deltaRotation, deltaRotation);
                    // note--quat multiplication is not commutative, need to multiply on the left
                    // note--quat multiplication is not commutative, need to multiply on the left
                    quat.mul(deltaRotation, entity.rotation, entity.rotation);
                }
            }
            entity.predict.dt = 0;
        }
    });
}
//# sourceMappingURL=predict.js.map