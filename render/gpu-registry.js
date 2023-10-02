import { assert } from "../utils/util.js";
export const linearSamplerPtr = {
    kind: "sampler",
    name: "linearSampler",
};
// // TODO(@darzu): not the right way to specify samplers!
// // TODO(@darzu): wait, unfiltering sampler might make zero sense....
// export const linearUnfilterSamplerPtr = {
//   kind: "sampler",
//   name: "linearUnfilterSampler",
// } as const;
export const nearestSamplerPtr = {
    kind: "sampler",
    name: "nearestSampler",
};
export const comparisonSamplerPtr = {
    kind: "sampler",
    name: "comparison",
};
export function isResourcePtr(p) {
    return p && p.kind;
}
export function getTexFromAttachment(t) {
    return isResourcePtr(t) ? t : t.ptr;
}
// HELPERS
export function isRenderPipelinePtr(p) {
    return p.kind === "renderPipeline";
}
export const CY = createCytochromeRegistry();
globalThis.CY = CY; // for debugging only
// TODO(@darzu): kinda hacky?
CY.kindToPtrs.sampler.push(linearSamplerPtr);
CY.kindToPtrs.sampler.push(nearestSamplerPtr);
CY.kindToPtrs.sampler.push(comparisonSamplerPtr);
function emptyCyKindToPtrSet() {
    return {
        array: [],
        singleton: [],
        idxBuffer: [],
        texture: [],
        depthTexture: [],
        compPipeline: [],
        renderPipeline: [],
        meshPool: [],
        sampler: [],
    };
}
// GPU resource manager named "Cytochrome"
//    Cytochrome in plants contribute to their color
export function createCytochromeRegistry() {
    let nameToPtr = {};
    // TODO(@darzu): impl multi-flight registry & instantiation; see createCyResources comments
    // // TODO(@darzu): IMPL fill from instantiator
    // let kindToNameToRes: {
    //   [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
    // };
    // let flight = 1; // TODO(@darzu): IMPL!
    let nextFlightPtrs = emptyCyKindToPtrSet();
    function registerCyResource(ptr) {
        assert(!nameToPtr[ptr.name], `already registered Cy resource with name: ${ptr.name}`);
        nameToPtr[ptr.name] = ptr;
        nextFlightPtrs[ptr.kind].push(ptr);
        return ptr;
    }
    // Note: we define individual register functions instead of a generic like
    //   register.kind() because some descriptions have custom type parameters
    //   we want to provide good typing for.
    // TODO(@darzu): rename all "createX" to "mkX" for brevity?
    return {
        // TODO(@darzu): HACK. We want to support multiple instantiation points!
        _hasBeenInstantiated: false,
        nameToPtr,
        kindToPtrs: nextFlightPtrs,
        createSingleton: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "singleton",
                name,
            });
        },
        createArray: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "array",
                name,
            });
        },
        createIdxBuf: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "idxBuffer",
                name,
            });
        },
        createTexture: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "texture",
                name,
            });
        },
        createDepthTexture: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "depthTexture",
                name,
            });
        },
        createComputePipeline: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "compPipeline",
                name,
            });
        },
        createRenderPipeline: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "renderPipeline",
                name,
            });
        },
        createMeshPool: (name, desc) => {
            return registerCyResource({
                ...desc,
                kind: "meshPool",
                name,
            });
        },
    };
}
//# sourceMappingURL=gpu-registry.js.map