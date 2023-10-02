import { EM } from "../ecs/entity-manager.js";
import { getText } from "../fetch/webget.js";
const DEFAULT_SHADER_PATH = "shaders/";
export const ShaderPaths = [
    "std-mesh",
    "std-rigged",
    "std-ocean",
    "std-gerstner",
    "std-outline",
    "std-blur",
    "std-post",
    "xp-boid-render",
    "xp-boid-update",
    "std-jump-flood",
    "xp-cloth-update",
    "std-screen-quad-vert",
    "std-rand",
    "std-stars",
    "xp-alpha",
    "std-grass",
    "std-sky",
    "std-deferred",
    "xp-bubble",
];
export const ShadersDef = EM.defineResource("shaders", (shaders) => shaders);
async function loadShaders() {
    const codePromises = ShaderPaths.map((name) => getText(`${DEFAULT_SHADER_PATH}${name}.wgsl`));
    const codes = await Promise.all(codePromises);
    const set = {};
    for (let i = 0; i < ShaderPaths.length; i++) {
        set[ShaderPaths[i]] = {
            code: codes[i],
        };
    }
    // TODO(@darzu): should this submit to webgpu for parsing?
    return set;
}
EM.addLazyInit([], [ShadersDef], async () => {
    EM.addResource(ShadersDef, await loadShaders());
});
//# sourceMappingURL=shader-loader.js.map