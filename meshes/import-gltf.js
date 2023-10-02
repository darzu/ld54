import { vec3, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { isString } from "../utils/util.js";
function isParseError(m) {
    return isString(m);
}
const MAGIC_VALUE = 0x46546c67;
const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;
function typedBufferView(gltf, buffers, bufferViewIdx, componentType) {
    const bufferView = gltf.bufferViews[bufferViewIdx];
    switch (componentType) {
        case 5121: // GL_UNSIGNED_BYTE
            return new Uint8Array(buffers[bufferView.buffer], bufferView.byteOffset, bufferView.byteLength / Uint8Array.BYTES_PER_ELEMENT);
        case 5123: // GL_UNSIGNED_SHORT
            return new Uint16Array(buffers[bufferView.buffer], bufferView.byteOffset, bufferView.byteLength / Uint16Array.BYTES_PER_ELEMENT);
        case 5126: // GL_FLOAT
            return new Float32Array(buffers[bufferView.buffer], bufferView.byteOffset, bufferView.byteLength / Float32Array.BYTES_PER_ELEMENT);
    }
    return `Array constructor not found for component type ${componentType}`;
}
function isAccessorFor(accessor, type) {
    return accessor.type === type;
}
function readArray(gltf, buffers, accessor) {
    const arr = typedBufferView(gltf, buffers, accessor.bufferView, accessor.componentType);
    if (isParseError(arr)) {
        return arr;
    }
    switch (accessor.type) {
        case "SCALAR": {
            const res = [];
            for (let i = 0; i < accessor.count; i++) {
                res.push(arr[i]);
            }
            return res;
        }
        case "VEC3": {
            const res = [];
            for (let i = 0; i < accessor.count; i++) {
                res.push(V(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));
            }
            return res;
        }
        case "VEC4": {
            const res = [];
            for (let i = 0; i < accessor.count; i++) {
                res.push(V(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]));
            }
            return res;
        }
        case "MAT4": {
            const res = [];
            for (let i = 0; i < accessor.count; i++) {
                const m = mat4.create();
                res.push(m);
                for (let j = 0; j < m.length; j++) {
                    m[j] = arr[i * m.length + j];
                }
            }
            return res;
        }
    }
}
// all numbers are little-endian
export function importGltf(buf) {
    const bytesView = new DataView(buf);
    const magic = bytesView.getUint32(0, true);
    if (magic !== MAGIC_VALUE) {
        return "Bad magic value";
    }
    // byte 1 is the version, we ignore it
    const totalLength = bytesView.getUint32(2 * Uint32Array.BYTES_PER_ELEMENT, true);
    // now we're into the chunked data. chunk 0 is always json
    const jsonLength = bytesView.getUint32(3 * Uint32Array.BYTES_PER_ELEMENT, true);
    const chunk0Type = bytesView.getUint32(4 * Uint32Array.BYTES_PER_ELEMENT, true);
    if (chunk0Type != JSON_TYPE) {
        return "Chunk 0 not JSON";
    }
    const jsonBuf = new Uint8Array(buf, 5 * Uint32Array.BYTES_PER_ELEMENT, jsonLength);
    const jsonStr = new TextDecoder("utf-8").decode(jsonBuf);
    const gltf = JSON.parse(jsonStr);
    console.dir(gltf);
    const buffers = [];
    let nextChunkStart = 5 * Uint32Array.BYTES_PER_ELEMENT + jsonLength;
    let chunksFound = 0;
    while (nextChunkStart < totalLength) {
        chunksFound++;
        const chunkLength = bytesView.getUint32(nextChunkStart, true);
        const chunkType = bytesView.getUint32(nextChunkStart + Uint32Array.BYTES_PER_ELEMENT, true);
        if (chunkType != BIN_TYPE) {
            return `Non-bin chunk ${chunksFound} found (length ${chunkLength}`;
        }
        // TODO: this does a copy, which is needlessly inefficient
        buffers.push(buf.slice(nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT, nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT + chunkLength));
        nextChunkStart =
            nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT + chunkLength;
    }
    window.buffers = buffers;
    if (gltf.meshes.length !== 1) {
        return `Found ${gltf.meshes.length} meshes in gltf file, expected 1`;
    }
    const mesh = gltf.meshes[0];
    if (mesh.primitives.length !== 1) {
        return `Found ${mesh.primitives.length} primitives in gltf mesh, expected 1`;
    }
    const posAccessor = gltf.accessors[mesh.primitives[0].attributes.POSITION];
    if (!isAccessorFor(posAccessor, "VEC3")) {
        return `Unexpected position type ${posAccessor.type}`;
    }
    const pos = readArray(gltf, buffers, posAccessor);
    if (isParseError(pos)) {
        return pos;
    }
    const normalAccessor = gltf.accessors[mesh.primitives[0].attributes.NORMAL];
    if (!isAccessorFor(normalAccessor, "VEC3")) {
        return `Unexpected normal type ${normalAccessor.type}`;
    }
    const normals = readArray(gltf, buffers, normalAccessor);
    if (isParseError(normals)) {
        return normals;
    }
    const indexAccessor = gltf.accessors[mesh.primitives[0].indices];
    // hack--we actually want vec3s even though these are listed as scalars
    if (!isAccessorFor(indexAccessor, "SCALAR")) {
        return `Unexpected index type ${indexAccessor.type}`;
    }
    const ind = readArray(gltf, buffers, indexAccessor);
    if (isParseError(ind)) {
        return ind;
    }
    const tri = [];
    for (let i = 0; i < ind.length / 3; i++) {
        tri.push(V(ind[i * 3], ind[i * 3 + 1], ind[i * 3 + 2]));
    }
    let colors;
    if (mesh.primitives[0].attributes.COLOR_0 !== undefined) {
        //console.log("loading colors");
        const colorAccessor = gltf.accessors[mesh.primitives[0].attributes.COLOR_0];
        // hack--we actually want vec3s even though these are listed as scalars
        if (!isAccessorFor(colorAccessor, "VEC4")) {
            return `Unexpected color type ${colorAccessor.type}`;
        }
        const maybeColors = readArray(gltf, buffers, colorAccessor);
        if (isParseError(maybeColors)) {
            return maybeColors;
        }
        // console.log(
        //   `got ${maybeColors.length} colors for ${tri.length} triangles and ${pos.length} pos`
        // );
        colors = [];
        for (let i = 0; i < tri.length; i++) {
            // just grab the color for the 0th vertex
            const color = maybeColors[tri[i][0]];
            colors.push(V(color[0] / 65535, color[1] / 65535, color[2] / 65535));
        }
    }
    else {
        //console.log("setting colors to default");
        colors = tri.map(() => V(0.1, 0.1, 0.1));
    }
    let rigging = undefined;
    // joints
    if (gltf.skins !== undefined && gltf.skins.length > 0) {
        if (gltf.skins.length !== 1) {
            return `Got ${gltf.skins.length} skins, expected 0 or 1`;
        }
        const jointIdsAccessor = gltf.accessors[mesh.primitives[0].attributes.JOINTS_0];
        if (!isAccessorFor(jointIdsAccessor, "VEC4")) {
            return `Unexpected index type ${jointIdsAccessor.type}`;
        }
        const jointIds = readArray(gltf, buffers, jointIdsAccessor);
        if (isParseError(jointIds)) {
            return jointIds;
        }
        const jointWeightsAccessor = gltf.accessors[mesh.primitives[0].attributes.WEIGHTS_0];
        if (!isAccessorFor(jointWeightsAccessor, "VEC4")) {
            return `Unexpected index type ${jointWeightsAccessor.type}`;
        }
        const jointWeights = readArray(gltf, buffers, jointWeightsAccessor);
        if (isParseError(jointWeights)) {
            return jointWeights;
        }
        const inverseBindMatricesAccessor = gltf.accessors[gltf.skins[0].inverseBindMatrices];
        if (!isAccessorFor(inverseBindMatricesAccessor, "MAT4")) {
            return `Unexpected index type ${inverseBindMatricesAccessor.type}`;
        }
        const inverseBindMatrices = readArray(gltf, buffers, inverseBindMatricesAccessor);
        if (isParseError(inverseBindMatrices)) {
            return inverseBindMatrices;
        }
        const jointPos = [];
        const jointRot = [];
        const jointScale = [];
        const parents = [];
        // by default, parent every joint to itself
        for (let i = 0; i < gltf.skins[0].joints.length; i++) {
            parents.push(i);
        }
        const jointNodeIdxToJointIdx = new Map();
        gltf.skins[0].joints.forEach((jointNodeIdx, jointIdx) => jointNodeIdxToJointIdx.set(jointNodeIdx, jointIdx));
        let i = 0;
        for (let jointNodeIdx of gltf.skins[0].joints) {
            const jointNode = gltf.nodes[jointNodeIdx];
            jointPos.push(vec3.clone(jointNode.translation ? jointNode.translation : V(0, 0, 0)));
            jointRot.push(jointNode.rotation ? quat.clone(jointNode.rotation) : quat.create());
            jointScale.push(jointNode.scale ? vec3.clone(jointNode.scale) : V(1, 1, 1));
            if (jointNode.children) {
                for (let childNodeIdx of jointNode.children) {
                    if (jointNodeIdxToJointIdx.has(childNodeIdx)) {
                        parents[jointNodeIdxToJointIdx.get(childNodeIdx)] = i;
                    }
                }
            }
            i++;
        }
        // check to see that this is in topo order
        if (parents.some((value, index) => value > index)) {
            return `Joints expected to be in topological order`;
        }
        const poseRot = [];
        // We have joints and initial values now. Now we'll find poses. We
        // get these from a single animation, and we ignore keyframe
        // times--we just care about the actual pose in each keyframe.
        if (gltf.animations) {
            if (gltf.animations.length !== 1)
                return `Got more than 1 animation`;
            const animation = gltf.animations[0];
            // for now, we want exactly one channel and sampler for each joint
            // TODO: set default rotations or something in order to avoid this
            if (animation.channels.length !== parents.length)
                return `Have ${parents.length} joints but got ${animation.channels.length} animation channels`;
            if (animation.samplers.length !== parents.length)
                return `Have ${parents.length} joints but got ${animation.samplers.length} animation samplers`;
            // also, expect every sampler to have the same "input". this
            // defines the keyframes; we don't actually care about the times
            // listed, just how many of them there are (bc those are our
            // poses)
            if (animation.samplers.some((sampler) => sampler.input !== animation.samplers[0].input))
                return `Got samplers with two different inputs`;
            // finally, we only support rotation animations for now
            if (animation.channels.some((channel) => channel.target.path !== "rotation"))
                return `Got non-rotation animation`;
            const inputAccessor = gltf.accessors[animation.samplers[0].input];
            const nPoses = inputAccessor.count;
            // fill out poseRot with identity quats for now
            for (let i = 0; i < nPoses; i++) {
                poseRot.push([]);
                for (let j = 0; j < parents.length; j++) {
                    poseRot[i].push(quat.create());
                }
            }
            // now, get the actual rotations from the channels and samplers
            for (let channel of animation.channels) {
                let jointIdx = jointNodeIdxToJointIdx.get(channel.target.node);
                if (jointIdx === undefined) {
                    return `Animation targeting non-joint node ${jointIdx}`;
                }
                const sampler = animation.samplers[channel.sampler];
                const outputAccessor = gltf.accessors[sampler.output];
                if (!isAccessorFor(outputAccessor, "VEC4")) {
                    return `Got bad accessor type for animation sampler`;
                }
                const rotations = readArray(gltf, buffers, outputAccessor);
                if (isParseError(rotations)) {
                    return rotations;
                }
                for (let pose = 0; pose < nPoses; pose++) {
                    // in the CUBICSPLINE interpolation mode we get tangent
                    // values. These always seem to be all zeroes, so we ignore
                    // them.
                    if (sampler.interpolation == "CUBICSPLINE") {
                        poseRot[pose][jointIdx] = rotations[pose * 3 + 1];
                    }
                    else {
                        poseRot[pose][jointIdx] = rotations[pose];
                    }
                }
            }
        }
        rigging = {
            jointIds,
            jointWeights,
            inverseBindMatrices,
            jointPos,
            jointRot,
            jointScale,
            parents,
            poseRot,
        };
        console.log(rigging);
    }
    const quad = [];
    const dbgName = mesh.name;
    // TODO: include normals
    return { pos, tri, normals, quad, colors, dbgName, rigging };
}
//# sourceMappingURL=import-gltf.js.map