import { EM } from "../ecs/entity-manager.js";
import { vec3, mat4 } from "../matrix/sprig-matrix.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";
// const MAX_POINT_LIGHTS = 1;
const MAX_POINT_LIGHTS = 3;
export const PointLightStruct = createCyStruct({
    // TODO(@darzu): 1 per cascade; better way to do this?
    viewProjAll: "mat4x4<f32>",
    viewProj0: "mat4x4<f32>",
    viewProj1: "mat4x4<f32>",
    position: "vec3<f32>",
    ambient: "vec3<f32>",
    diffuse: "vec3<f32>",
    specular: "vec3<f32>",
    constant: "f32",
    linear: "f32",
    quadratic: "f32",
    // TODO(@darzu): for cascades, need better generalization
    depth0: "f32",
    depth1: "f32",
}, 
// TODO(@darzu): HACK:
{ isUniform: true, hackArray: true });
function createDefaultPointLight() {
    return {
        viewProjAll: mat4.create(),
        viewProj0: mat4.create(),
        viewProj1: mat4.create(),
        position: vec3.create(),
        ambient: vec3.create(),
        diffuse: vec3.create(),
        specular: vec3.create(),
        constant: 1.0,
        linear: 0.0,
        quadratic: 0.0,
        depth0: 0.0,
        depth1: 0.0,
    };
}
export const PointLightDef = EM.defineComponent("pointLight", createDefaultPointLight);
export const pointLightsPtr = CY.createArray("pointLight", {
    struct: PointLightStruct,
    init: MAX_POINT_LIGHTS,
    forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});
//# sourceMappingURL=lights.js.map