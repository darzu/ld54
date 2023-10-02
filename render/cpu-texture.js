import { vec2, vec3, vec4 } from "../matrix/sprig-matrix.js";
import { clamp } from "../utils/math.js";
import { tempVec2, tempVec3, tempVec4 } from "../matrix/temp-pool.js";
import { assert } from "../utils/util.js";
import { never } from "../utils/util.js";
// TODO(@darzu): we want a whole CPU-side texture library including
//  sampling, loading, comparison, derivatives, etc.
export function createTextureReader(data, size, outArity, format) {
    // TODO(@darzu): make generic?
    let tData;
    let stride;
    if (format === "rgba32float") {
        stride = 4;
        tData = new Float32Array(data);
    }
    else if (format === "r8unorm") {
        stride = 1;
        tData = new Uint8Array(data);
    }
    else {
        throw new Error(`unimplemented texture format: ${format} in TextureReader`);
    }
    assert(outArity <= stride, "outArity <= stride");
    return {
        size,
        data,
        format,
        outArity,
        read: read,
        sample: sample,
    };
    function getIdx(xi, yi) {
        return (xi + yi * size[0]) * stride;
    }
    function read(x, y, out) {
        // TODO(@darzu): share code with sample
        const xi = clamp(Math.round(x), 0, size[0] - 1);
        const yi = clamp(Math.round(y), 0, size[1] - 1);
        const idx = getIdx(xi, yi);
        assert(typeof out === "number" || !out || out.length === outArity);
        if (outArity === 1) {
            return tData[idx];
        }
        else if (outArity === 2) {
            return vec2.set(tData[idx], tData[idx + 1], (out ?? vec2.tmp()));
        }
        else if (outArity === 3) {
            return vec3.set(tData[idx], tData[idx + 1], tData[idx + 2], (out ?? vec3.tmp()));
        }
        else if (outArity === 4) {
            return vec4.set(tData[idx + 0], tData[idx + 1], tData[idx + 2], tData[idx + 3], (out ?? vec4.tmp()));
        }
        else {
            never(outArity);
        }
    }
    // TODO(@darzu): probably inefficient way to do bounds checking
    function isDefault(xi, yi) {
        if (outArity === 1) {
            return read(0, xi, yi) === 0;
        }
        else if (outArity === 2) {
            return vec2.equals(read(xi, yi, tempVec2()), vec2.ZEROS);
        }
        else if (outArity === 3) {
            return vec3.equals(read(xi, yi, tempVec3()), vec3.ZEROS);
        }
        else if (outArity === 4) {
            return vec4.equals(read(xi, yi, tempVec4()), vec4.ZEROS);
        }
        else {
            never(outArity);
        }
    }
    function sample(x, y, out) {
        x = clamp(x, 0, size[0] - 1);
        y = clamp(y, 0, size[1] - 1);
        const xi0 = Math.floor(x);
        const xi1 = Math.ceil(x);
        const yi0 = Math.floor(y);
        const yi1 = Math.ceil(y);
        const dx = x % 1.0;
        const dy = y % 1.0;
        let ix0y0 = getIdx(xi0, yi0);
        let ix1y0 = getIdx(xi1, yi0);
        let ix0y1 = getIdx(xi0, yi1);
        let ix1y1 = getIdx(xi1, yi1);
        // bounds check
        // TODO(@darzu): this is hacky and inefficient. At minimum we shouldn't
        //  need to read texture values twice.
        // TODO(@darzu): actually this might not be necessary at all. we should
        //  probably have an SDF texture from the edge anyway for pushing the
        //  player back.
        const def00 = isDefault(xi0, yi0);
        const def10 = isDefault(xi1, yi0);
        const def01 = isDefault(xi0, yi1);
        const def11 = isDefault(xi1, yi1);
        if (def00)
            ix0y0 = ix1y0;
        if (def10)
            ix1y0 = ix0y0;
        if (def01)
            ix0y1 = ix1y1;
        if (def11)
            ix1y1 = ix0y1;
        if (def00 && def10) {
            ix0y0 = ix0y1;
            ix1y0 = ix1y1;
        }
        if (def01 && def11) {
            ix0y1 = ix0y0;
            ix1y1 = ix1y0;
        }
        function _sample(offset) {
            const outAy0 = tData[ix0y0 + offset] * (1 - dx) + tData[ix1y0 + offset] * dx;
            const outAy1 = tData[ix0y1 + offset] * (1 - dx) + tData[ix1y1 + offset] * dx;
            const outA = outAy0 * (1 - dy) + outAy1 * dy;
            return outA;
        }
        assert(typeof out === "number" || !out || out.length === outArity);
        if (outArity === 1) {
            return _sample(0);
        }
        else if (outArity === 2) {
            return vec2.set(_sample(0), _sample(1), (out ?? vec2.tmp()));
        }
        else if (outArity === 3) {
            return vec3.set(_sample(0), _sample(1), _sample(2), (out ?? vec3.tmp()));
        }
        else if (outArity === 4) {
            return vec4.set(_sample(0), _sample(1), _sample(2), _sample(3), (out ?? vec4.tmp()));
        }
        else {
            never(outArity);
        }
    }
}
//# sourceMappingURL=cpu-texture.js.map