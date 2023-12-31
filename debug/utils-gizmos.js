import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { createGraph3DAxesMesh, createGraph3DDataMesh, } from "./gizmos.js";
import { createAABB, updateAABBWithPoint, getSizeFromAABB, } from "../physics/aabb.js";
import { PositionDef, PhysicsParentDef, ScaleDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
export function getDataDomain(data) {
    const aabb = createAABB(V(Infinity, Infinity, Infinity), V(-Infinity, -Infinity, -Infinity));
    for (let row of data)
        for (let d of row)
            updateAABBWithPoint(aabb, d);
    return aabb;
}
// TODO(@darzu): take in data
export function createGraph3D(pos, data, color, domain) {
    color = color ?? ENDESGA16.lightGreen;
    domain = domain ?? getDataDomain(data);
    const domainSize = getSizeFromAABB(domain);
    // console.log("domain");
    // console.dir(domain);
    const opts = {
        intervalDomainLength: vec3.scale(domainSize, 0.1),
        domainSize: domain,
        // {
        //   min: V(0, 0, 0),
        //   max: V(100, 100, 100),
        // },
        worldSize: {
            min: V(0, 0, 0),
            max: V(50, 50, 50),
        },
        axisWidth: 0.8,
        intervalGap: 0.4,
    };
    const worldSize = getSizeFromAABB(opts.worldSize);
    // TODO(@darzu): maybe everything should be created with a scale
    const graphMesh = createGraph3DAxesMesh(opts);
    const graph = EM.new();
    EM.set(graph, RenderableConstructDef, graphMesh);
    EM.set(graph, PositionDef, pos);
    const surfScale = vec3.div(worldSize, domainSize, vec3.create());
    // console.log(`surfScale: ${vec3Dbg(surfScale)}`);
    const graphSurf = EM.new();
    const graphSurfMesh = createGraph3DDataMesh(data);
    EM.set(graphSurf, RenderableConstructDef, graphSurfMesh);
    EM.set(graphSurf, PositionDef, vec3.mul(vec3.negate(domain.min), surfScale, vec3.create())
    // vec3.add(worldGizmo.position, [50, 10, 50], V(0, 0, 0))
    );
    EM.set(graphSurf, PhysicsParentDef, graph.id);
    EM.set(graphSurf, ColorDef, color);
    EM.set(graphSurf, ScaleDef, surfScale);
    return graph;
}
//# sourceMappingURL=utils-gizmos.js.map