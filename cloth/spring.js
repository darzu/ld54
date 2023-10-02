import { vec3, V } from "../matrix/sprig-matrix.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { EM } from "../ecs/entity-manager.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";
const EPSILON = 0.0000000000000000001;
const VELOCITY_CAP = 1;
let DEBUG = false;
function log(s) {
    if (DEBUG)
        console.log(s);
}
export var SpringType;
(function (SpringType) {
    SpringType[SpringType["DesiredLocation"] = 0] = "DesiredLocation";
    SpringType[SpringType["SimpleDistance"] = 1] = "SimpleDistance";
})(SpringType || (SpringType = {}));
export const SpringGridDef = EM.defineNonupdatableComponent("springGrid", (springType, rows, columns, fixed, distance, kOnAxis, kOffAxis) => {
    springType = springType || SpringType.SimpleDistance;
    rows = rows || 0;
    columns = columns || 0;
    fixed = fixed || [];
    distance = distance || 1;
    kOnAxis = kOnAxis || 5000;
    kOffAxis = kOffAxis || kOnAxis;
    const positions = [];
    const prevPositions = [];
    const nextPositions = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            let pos = V(x * distance, y * distance, 0);
            positions.push(pos);
            prevPositions.push(vec3.clone(pos));
            nextPositions.push(vec3.create());
        }
    }
    const externalForce = vec3.create();
    const fixedSet = new Set(fixed);
    return {
        rows,
        columns,
        positions,
        prevPositions,
        nextPositions,
        fixed: fixedSet,
        distance,
        kOnAxis,
        kOffAxis,
        externalForce,
        springType,
    };
});
export const ForceDef = EM.defineComponent("force", () => V(0, 0, 0), (p, v) => (v ? vec3.copy(p, v) : p));
EM.registerSerializerPair(ForceDef, (f, buf) => buf.writeVec3(f), (f, buf) => buf.readVec3(f));
var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 0] = "Up";
    Direction[Direction["Down"] = 1] = "Down";
    Direction[Direction["Left"] = 2] = "Left";
    Direction[Direction["Right"] = 3] = "Right";
})(Direction || (Direction = {}));
function neighbor(g, point, direction) {
    let x = point % g.columns;
    let y = (point - x) / g.columns;
    switch (direction) {
        case Direction.Up:
            y = y + 1;
            break;
        case Direction.Down:
            y = y - 1;
            break;
        case Direction.Left:
            x = x - 1;
            break;
        case Direction.Right:
            x = x + 1;
            break;
    }
    if (x >= 0 && x < g.columns && y >= 0 && y < g.rows) {
        return y * g.columns + x;
    }
    return null;
}
function targetLocation(g, neighbor, inDirection, out) {
    vec3.copy(out, g.positions[neighbor]);
    switch (inDirection) {
        case Direction.Up:
            out[1] = out[1] - g.distance;
            break;
        case Direction.Down:
            out[1] = out[1] + g.distance;
            break;
        case Direction.Left:
            out[0] = out[0] + g.distance;
            break;
        case Direction.Right:
            out[0] = out[0] - g.distance;
            break;
    }
}
function addSpringForce(g, point, force) {
    const distanceVec = tempVec3();
    let directions = [
        Direction.Up,
        Direction.Down,
        Direction.Left,
        Direction.Right,
    ];
    let neighbors = directions
        .map((d) => [d, neighbor(g, point, d)])
        .filter(([d, o]) => o !== null);
    for (let [direction, o] of neighbors) {
        log(`spring force on ${point}`);
        switch (g.springType) {
            case SpringType.SimpleDistance:
                vec3.sub(g.positions[point], g.positions[o], distanceVec);
                let distance = vec3.length(distanceVec);
                vec3.normalize(distanceVec, distanceVec);
                vec3.scale(distanceVec, g.kOnAxis * (g.distance - distance), distanceVec);
                break;
            case SpringType.DesiredLocation:
                targetLocation(g, o, direction, distanceVec);
                log("vectors");
                log(distanceVec);
                log(g.positions[point]);
                vec3.sub(distanceVec, g.positions[point], distanceVec);
                // distanceVec now stores the vector between this point and
                // where it "should" be as far as this neighbor is concerned.  We
                // want to apply a restoring force to try to get it back to that
                // position.
                switch (direction) {
                    case Direction.Up:
                    case Direction.Down:
                        distanceVec[0] = distanceVec[0] * g.kOffAxis;
                        distanceVec[1] = distanceVec[1] * g.kOnAxis;
                        break;
                    case Direction.Left:
                    case Direction.Right:
                        distanceVec[0] = distanceVec[0] * g.kOnAxis;
                        distanceVec[1] = distanceVec[1] * g.kOffAxis;
                }
                distanceVec[2] = distanceVec[2] * g.kOffAxis;
        }
        vec3.scale(distanceVec, 1.0 / neighbors.length, distanceVec);
        vec3.add(force, distanceVec, force);
    }
}
export function stepSprings(g, dt) {
    dt = dt / 1000;
    const forceVec = tempVec3();
    const velocityVec = tempVec3();
    for (let point = 0; point < g.rows * g.columns; point++) {
        vec3.copy(g.nextPositions[point], g.positions[point]);
        if (g.fixed.has(point)) {
            log(`${point} fixed`);
            continue;
        }
        vec3.sub(g.positions[point], g.prevPositions[point], velocityVec);
        vec3.scale(velocityVec, dt, velocityVec);
        //console.log("applying a force");
        vec3.copy(forceVec, g.externalForce);
        // console.log(`externalForce: ${vec3Dbg(forceVec)}`); // TODO(@darzu):
        addSpringForce(g, point, forceVec);
        vec3.scale(forceVec, dt * dt, forceVec);
        if (vec3.length(velocityVec) > EPSILON) {
            vec3.add(g.nextPositions[point], velocityVec, g.nextPositions[point]);
        }
        if (vec3.length(forceVec) > EPSILON) {
            vec3.add(g.nextPositions[point], forceVec, g.nextPositions[point]);
        }
        // vec3.add(g.velocities[point], g.velocities[point], forceVec);
        // const speed = vec3.length(g.velocities[point]);
        // if (speed > VELOCITY_CAP) {
        //   console.log("scaling velocity");
        //   vec3.scale(
        //     g.velocities[point],
        //     g.velocities[point],
        //     VELOCITY_CAP / speed
        //   );
    }
    for (let point = 0; point < g.rows * g.columns; point++) {
        vec3.copy(g.prevPositions[point], g.positions[point]);
        vec3.copy(g.positions[point], g.nextPositions[point]);
    }
}
EM.addEagerInit([SpringGridDef], [], [], () => {
    EM.addSystem("spring", Phase.PRE_PHYSICS, [SpringGridDef, ForceDef], [TimeDef], (springs, res) => {
        for (let { springGrid, force } of springs) {
            vec3.copy(springGrid.externalForce, force);
            stepSprings(springGrid, res.time.dt);
        }
    });
});
//# sourceMappingURL=spring.js.map