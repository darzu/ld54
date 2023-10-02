import { PERF_DBG_F32S, PERF_DBG_F32S_BLAME, PERF_DBG_F32S_TEMP_BLAME, } from "../flags.js";
import * as GLM from "./gl-matrix.js";
import { dbgAddBlame, dbgClearBlame } from "../utils/util.js";
const EPSILON = 0.000001;
// TODO(@darzu): All cases of:
//    vec*.clone([...])
//  should be
//    vec*.fromValues(...)
//  or something simpler (v3(), vc3(), ...)
// TODO(@darzu): CONSIDER "forever", "readonly", and literals with something like:
/*
interface ReadonlyFloat32ArrayOfLength<N extends number>
  extends Omit<
    Float32ArrayOfLength<N>,
    "copyWithin" | "fill" | "reverse" | "set" | "sort"
  > {
  readonly [n: number]: number;
}

declare const _forever: unique symbol;

// a vec3 "forever", means it isn't temp
export type vec3f =
  | [number, number, number]
  | (Float32ArrayOfLength<3> & { [_forever]: true });
// a vec3 "readonly", means the vec won't be modified through that alias
export type vec3r =
  | readonly [number, number, number]
  | ReadonlyFloat32ArrayOfLength<3>;
// a vec3 is either forever or temp, but it can't be
export type vec3 = vec3f | Float32ArrayOfLength<3>;

let eg_vec3f: vec3f = [0, 0, 0] as vec3f;
let eg_vec3r: vec3r = [0, 0, 0] as vec3r;
let eg_vec3: vec3 = vec3.create() as vec3;

// eg_vec3 = eg_vec3r; // illegal (weakens "readonly")
// eg_vec3 = eg_vec3f; // legal (unspecified if its temp or forever)
// eg_vec3r = eg_vec3; // legal (strengthens alias promise)
// eg_vec3r = eg_vec3f; // legal (strengthens alias promise)
// eg_vec3f = eg_vec3; // illegal (could be temp)
// eg_vec3f = eg_vec3r; // illegal (could be temp)
// eg_vec3fr = eg_vec3; // illegal (could be temp)
// eg_vec3fr = eg_vec3f; // legal (strengthening w/ readonly promise)
// eg_vec3fr = eg_vec3r; // illegal (could be temp)
*/
export let _f32sCount = 0; // TODO(@darzu): PERF DBG!
// TODO(@darzu): perhaps all non-temp (and temp) vecs should be suballocations on bigger Float32Arrays
//    this might give some perf wins w/ cache hits
function float32ArrayOfLength(n) {
    if (PERF_DBG_F32S)
        _f32sCount += n; // TODO(@darzu): PERF. very inner-loop. does this have a perf cost even when the flag is disabled?
    // console.log(new Error().stack!);
    if (PERF_DBG_F32S_BLAME) {
        dbgAddBlame("f32s", n);
    }
    return new Float32Array(n);
}
const BUFFER_SIZE = 8000;
const buffer = new ArrayBuffer(BUFFER_SIZE);
let bufferIndex = 0;
function tmpArray(n) {
    if (bufferIndex + n * Float32Array.BYTES_PER_ELEMENT > BUFFER_SIZE) {
        if (PERF_DBG_F32S_TEMP_BLAME) {
            if (window.dbg) {
                // TODO(@darzu): HACK debugging
                window.dbg.tempf32sBlame();
            }
        }
        throw `Too many temp Float32Arrays allocated! Use PERF_DBG_F32S_TEMP_BLAME to find culprit. Or if you must, try increasing BUFFER_SIZE (currently ${(Float32Array.BYTES_PER_ELEMENT * BUFFER_SIZE) / 1024}kb)`;
    }
    if (PERF_DBG_F32S_TEMP_BLAME) {
        dbgAddBlame("temp_f32s", n);
    }
    const arr = new Float32Array(buffer, bufferIndex, n);
    bufferIndex += arr.byteLength;
    return arr;
}
export function resetTempMatrixBuffer() {
    bufferIndex = 0;
    if (PERF_DBG_F32S_TEMP_BLAME) {
        dbgClearBlame("temp_f32s");
    }
}
export function isTmpVec(v) {
    return v.buffer === buffer;
}
// TODO(@darzu): generalize and put in util.ts?
export function findAnyTmpVec(obj, maxDepth = 100, path = "") {
    if (maxDepth <= 0) {
        return null;
    }
    else if (!obj) {
        return null;
    }
    else if (obj instanceof Float32Array) {
        return isTmpVec(obj) ? path : null;
    }
    else if (obj instanceof Array) {
        return obj.reduce((p, n, i) => p ? p : findAnyTmpVec(n, maxDepth - 1, `${path}[${i}]`), null);
    }
    else if (obj instanceof Map) {
        for (let [k, v] of obj.entries()) {
            const found = findAnyTmpVec(v, maxDepth - 1, `${path}.get(${k})`);
            if (found)
                return found;
        }
        return null;
    }
    // NOTE: primatives (string, bool, number) and functions all return empty list for Object.keys
    return Object.keys(obj).reduce((p, n, i) => p ? p : findAnyTmpVec(obj[n], maxDepth - 1, `${path}.${n}`), null);
}
export var vec2;
(function (vec2) {
    const GL = GLM.vec2;
    function tmp() {
        return tmpArray(2);
    }
    vec2.tmp = tmp;
    function create() {
        return float32ArrayOfLength(2);
    }
    vec2.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    vec2.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    vec2.copy = copy;
    function zero(out) {
        return GL.zero(out ?? tmp());
    }
    vec2.zero = zero;
    function set(n0, n1, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        return out;
    }
    vec2.set = set;
    function fromValues(n0, n1) {
        const out = create();
        out[0] = n0;
        out[1] = n1;
        return out;
    }
    vec2.fromValues = fromValues;
    // NOTE: output is normalized
    function fromRadians(radians, out) {
        return set(Math.cos(radians), Math.sin(radians), out);
    }
    vec2.fromRadians = fromRadians;
    vec2.ZEROS = fromValues(0, 0);
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    vec2.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    vec2.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    vec2.add = add;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    vec2.sub = sub;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    vec2.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    vec2.div = div;
    function normalize(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    vec2.normalize = normalize;
    function length(v1) {
        return GL.length(v1);
    }
    vec2.length = length;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    vec2.dot = dot;
    function cross(v1, v2, out) {
        return GL.cross(out ?? vec3.tmp(), v1, v2);
    }
    vec2.cross = cross;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    vec2.scale = scale;
    function negate(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    vec2.negate = negate;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    vec2.dist = dist;
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    vec2.sqrDist = sqrDist;
    function rotate(v1, v2, rad, out) {
        return GL.rotate(out ?? tmp(), v1, v2, rad);
    }
    vec2.rotate = rotate;
})(vec2 || (vec2 = {}));
export function V(...xs) {
    if (xs.length === 4)
        return vec4.fromValues(xs[0], xs[1], xs[2], xs[3]);
    else if (xs.length === 3)
        return vec3.fromValues(xs[0], xs[1], xs[2]);
    else if (xs.length === 2)
        return vec2.fromValues(xs[0], xs[1]);
    else
        throw new Error(`Unsupported vec size: ${xs.length}`);
}
export function tV(...xs) {
    if (xs.length === 4)
        return vec4.set(xs[0], xs[1], xs[2], xs[3]);
    else if (xs.length === 3)
        return vec3.set(xs[0], xs[1], xs[2]);
    else if (xs.length === 2)
        return vec2.set(xs[0], xs[1]);
    else
        throw new Error(`Unsupported vec size: ${xs.length}`);
}
// TODO(@darzu): use "namespace" keyword instead of "module" (re: https://www.typescriptlang.org/docs/handbook/namespaces.html)
export var vec3;
(function (vec3) {
    const GL = GLM.vec3;
    // export default = fromValues;
    function tmp() {
        return tmpArray(3);
    }
    vec3.tmp = tmp;
    function create() {
        return float32ArrayOfLength(3);
    }
    vec3.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    vec3.clone = clone;
    // TODO(@darzu): maybe copy should have an optional out param?
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    vec3.copy = copy;
    // TODO(@darzu): "set" should probably follow copy and have the out param first and required
    function set(n0, n1, n2, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        return out;
    }
    vec3.set = set;
    function fromValues(n0, n1, n2) {
        const out = create();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        return out;
    }
    vec3.fromValues = fromValues;
    vec3.ZEROS = fromValues(0, 0, 0);
    vec3.ONES = fromValues(1, 1, 1);
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    vec3.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    vec3.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    vec3.add = add;
    function sum(out, ...vs) {
        out[0] = vs.reduce((p, n) => p + n[0], 0);
        out[1] = vs.reduce((p, n) => p + n[1], 0);
        out[2] = vs.reduce((p, n) => p + n[2], 0);
        return out;
    }
    vec3.sum = sum;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    vec3.sub = sub;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    vec3.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    vec3.div = div;
    function normalize(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    vec3.normalize = normalize;
    function length(v1) {
        return GL.length(v1);
    }
    vec3.length = length;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    vec3.dot = dot;
    function cross(v1, v2, out) {
        return GL.cross(out ?? tmp(), v1, v2);
    }
    vec3.cross = cross;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    vec3.scale = scale;
    function negate(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    vec3.negate = negate;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    vec3.dist = dist;
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    vec3.sqrDist = sqrDist;
    function sqrLen(v) {
        return GL.sqrLen(v);
    }
    vec3.sqrLen = sqrLen;
    function lerp(v1, v2, n, out) {
        return GL.lerp(out ?? tmp(), v1, v2, n);
    }
    vec3.lerp = lerp;
    function transformQuat(v1, v2, out) {
        return GL.transformQuat(out ?? tmp(), v1, v2);
    }
    vec3.transformQuat = transformQuat;
    function transformMat4(v1, v2, out) {
        return GL.transformMat4(out ?? tmp(), v1, v2);
    }
    vec3.transformMat4 = transformMat4;
    function transformMat3(v1, v2, out) {
        return GL.transformMat3(out ?? tmp(), v1, v2);
    }
    vec3.transformMat3 = transformMat3;
    function zero(out) {
        return GL.zero(out ?? tmp());
    }
    vec3.zero = zero;
    function rotateY(point, origin, rad, out) {
        return GL.rotateY(out ?? tmp(), point, origin, rad);
    }
    vec3.rotateY = rotateY;
    function reverse(v, out) {
        return set(v[2], v[1], v[0], out);
    }
    vec3.reverse = reverse;
})(vec3 || (vec3 = {}));
export var vec4;
(function (vec4) {
    const GL = GLM.vec4;
    function tmp() {
        return tmpArray(4);
    }
    vec4.tmp = tmp;
    function create() {
        return float32ArrayOfLength(4);
    }
    vec4.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    vec4.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    vec4.copy = copy;
    function set(n0, n1, n2, n3, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        out[3] = n3;
        return out;
    }
    vec4.set = set;
    function fromValues(n0, n1, n2, n3) {
        const out = create();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        out[3] = n3;
        return out;
    }
    vec4.fromValues = fromValues;
    vec4.ZEROS = fromValues(0, 0, 0, 0);
    vec4.ONES = fromValues(1, 1, 1, 1);
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    vec4.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    vec4.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    vec4.add = add;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    vec4.sub = sub;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    vec4.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    vec4.div = div;
    function normalize(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    vec4.normalize = normalize;
    function length(v1) {
        return GL.length(v1);
    }
    vec4.length = length;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    vec4.dot = dot;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    vec4.scale = scale;
    function negate(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    vec4.negate = negate;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    vec4.dist = dist;
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    vec4.sqrDist = sqrDist;
    function lerp(v1, v2, n, out) {
        return GL.lerp(out ?? tmp(), v1, v2, n);
    }
    vec4.lerp = lerp;
    function transformQuat(v1, v2, out) {
        return GL.transformQuat(out ?? tmp(), v1, v2);
    }
    vec4.transformQuat = transformQuat;
    function transformMat4(v1, v2, out) {
        return GL.transformMat4(out ?? tmp(), v1, v2);
    }
    vec4.transformMat4 = transformMat4;
    function zero(out) {
        return GL.zero(out ?? tmp());
    }
    vec4.zero = zero;
    function reverse(v, out) {
        return set(v[3], v[2], v[1], v[0], out);
    }
    vec4.reverse = reverse;
})(vec4 || (vec4 = {}));
export var quat;
(function (quat) {
    const GL = GLM.quat;
    function tmp() {
        return tmpArray(4);
    }
    quat.tmp = tmp;
    function create() {
        const out = float32ArrayOfLength(4);
        out[3] = 1;
        return out;
    }
    quat.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    quat.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    quat.copy = copy;
    function set(x, y, z, w, out) {
        return GL.set(out ?? tmp(), x, y, z, w);
    }
    quat.set = set;
    quat.IDENTITY = identity(create());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    quat.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    quat.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    quat.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    quat.mul = mul;
    function slerp(v1, v2, n, out) {
        return GL.slerp(out ?? tmp(), v1, v2, n);
    }
    quat.slerp = slerp;
    function normalize(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    quat.normalize = normalize;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    quat.identity = identity;
    function conjugate(v1, out) {
        return GL.conjugate(out ?? tmp(), v1);
    }
    quat.conjugate = conjugate;
    function invert(v1, out) {
        return GL.invert(out ?? tmp(), v1);
    }
    quat.invert = invert;
    function setAxisAngle(axis, rad, out) {
        return GL.setAxisAngle(out ?? tmp(), axis, rad);
    }
    quat.setAxisAngle = setAxisAngle;
    function getAxisAngle(q, out) {
        return GL.getAxisAngle(out ?? tmp(), q);
    }
    quat.getAxisAngle = getAxisAngle;
    function getAngle(q1, q2) {
        return GL.getAngle(q1, q2);
    }
    quat.getAngle = getAngle;
    function rotateX(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    quat.rotateX = rotateX;
    function rotateY(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    quat.rotateY = rotateY;
    function rotateZ(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, n);
    }
    quat.rotateZ = rotateZ;
    // export function rotateMat3(v1: InputT, m: mat3, out?: T) {
    //   // TODO(@darzu): IMPL!
    // }
    function fromEuler(x, y, z, out) {
        return GL.fromEuler(out ?? tmp(), x, y, z);
    }
    quat.fromEuler = fromEuler;
    function fromMat3(m, out) {
        return GL.fromMat3(out ?? tmp(), m);
    }
    quat.fromMat3 = fromMat3;
})(quat || (quat = {}));
export var mat4;
(function (mat4) {
    const GL = GLM.mat4;
    function tmp() {
        return tmpArray(16);
    }
    mat4.tmp = tmp;
    function create() {
        const out = float32ArrayOfLength(16);
        out[0] = 1;
        out[5] = 1;
        out[10] = 1;
        out[15] = 1;
        return out;
    }
    mat4.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    mat4.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    mat4.copy = copy;
    mat4.IDENTITY = identity(create());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    mat4.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    mat4.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    mat4.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    mat4.mul = mul;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    mat4.identity = identity;
    function invert(v1, out) {
        return GL.invert(out ?? tmp(), v1);
    }
    mat4.invert = invert;
    function scale(a, v, out) {
        return GL.scale(out ?? tmp(), a, v);
    }
    mat4.scale = scale;
    function fromRotationTranslation(q, v, out) {
        return GL.fromRotationTranslation(out ?? tmp(), q, v);
    }
    mat4.fromRotationTranslation = fromRotationTranslation;
    function fromRotationTranslationScale(q, v, s, out) {
        return GL.fromRotationTranslationScale(out ?? tmp(), q, v, s);
    }
    mat4.fromRotationTranslationScale = fromRotationTranslationScale;
    function fromRotationTranslationScaleOrigin(q, v, s, o, out) {
        return GL.fromRotationTranslationScaleOrigin(out ?? tmp(), q, v, s, o);
    }
    mat4.fromRotationTranslationScaleOrigin = fromRotationTranslationScaleOrigin;
    function fromScaling(v, out) {
        return GL.fromScaling(out ?? tmp(), v);
    }
    mat4.fromScaling = fromScaling;
    function fromTranslation(v, out) {
        return GL.fromTranslation(out ?? tmp(), v);
    }
    mat4.fromTranslation = fromTranslation;
    function fromXRotation(rad, out) {
        return GL.fromXRotation(out ?? tmp(), rad);
    }
    mat4.fromXRotation = fromXRotation;
    function fromYRotation(rad, out) {
        return GL.fromYRotation(out ?? tmp(), rad);
    }
    mat4.fromYRotation = fromYRotation;
    function fromZRotation(rad, out) {
        return GL.fromZRotation(out ?? tmp(), rad);
    }
    mat4.fromZRotation = fromZRotation;
    function fromQuat(q, out) {
        return GL.fromQuat(out ?? tmp(), q);
    }
    mat4.fromQuat = fromQuat;
    function getRotation(m, out) {
        return GL.getRotation(out ?? quat.tmp(), m);
    }
    mat4.getRotation = getRotation;
    function getTranslation(m, out) {
        return GL.getTranslation(out ?? vec3.tmp(), m);
    }
    mat4.getTranslation = getTranslation;
    function getScaling(m, out) {
        return GL.getScaling(out ?? vec3.tmp(), m);
    }
    mat4.getScaling = getScaling;
    function rotateX(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    mat4.rotateX = rotateX;
    function rotateY(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    mat4.rotateY = rotateY;
    function rotateZ(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, n);
    }
    mat4.rotateZ = rotateZ;
    function frustum(left, right, bottom, top, near, far, out) {
        return GL.frustum(out ?? tmp(), left, right, bottom, top, near, far);
    }
    mat4.frustum = frustum;
    /*
    Generates a orthogonal projection matrix with the given bounds
  
    It's a scale and translation matrix.
    Smooshes left/right/top/bottom/near/far
    from y-up, right-handed into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)
    */
    function ortho(left, right, bottom, top, near, far, out) {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        const _out = out ?? mat4.tmp();
        _out[0] = -2 * lr;
        _out[1] = 0;
        _out[2] = 0;
        _out[3] = 0;
        _out[4] = 0;
        _out[5] = -2 * bt;
        _out[6] = 0;
        _out[7] = 0;
        _out[8] = 0;
        _out[9] = 0;
        // _out[10] = 2 * nf; // For WebGL NDC
        _out[10] = nf; // For WebGPU NDC
        _out[11] = 0;
        _out[12] = (left + right) * lr;
        _out[13] = (top + bottom) * bt;
        // _out[14] = (far + near) * nf; // For WebGL NDC
        _out[14] = near * nf; // For WebGPU NDC
        _out[15] = 1;
        return _out;
    }
    mat4.ortho = ortho;
    /**
    Generates a perspective projection matrix with the given bounds.
    Passing null/undefined/no value for far will generate infinite projection matrix.
    
    Seems to output into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)
  
    @param {number} fovy Vertical field of view in radians
    @param {number} aspect Aspect ratio. typically viewport width/height
    @param {number} near Near bound of the frustum, must be >0
    @param {number} far Far bound of the frustum, can be null or Infinity
    @param {mat4} out mat4 frustum matrix will be written into
    @returns {mat4} out
    */
    function perspective(fovy, aspect, near, far, out) {
        out = out ?? tmp();
        const f = 1.0 / Math.tan(fovy / 2);
        out[0] = f / aspect;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = f;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[11] = -1;
        out[12] = 0;
        out[13] = 0;
        out[15] = 0;
        if (far != null && far !== Infinity) {
            const nf = 1 / (near - far);
            out[10] = (far + near) * nf;
            out[14] = 2 * far * near * nf;
        }
        else {
            out[10] = -1;
            out[14] = -2 * near;
        }
        return out;
    }
    mat4.perspective = perspective;
    /*
    Generates a look-at matrix with the given eye position, focal point, and up axis.
    If you want a matrix that actually makes an object look at another object, you should use targetTo instead.
  
    This is an optimized version of:
    - translate the eye to (0,0,0)
    - rotate to the camera's view:
        create an orthonormalized set of basis vectors from camera forward, up, right
    */
    // TODO(@darzu): extract orthonormalization / Gram–Schmidt process?
    function lookAt(eye, center, up, out) {
        const eyex = eye[0];
        const eyey = eye[1];
        const eyez = eye[2];
        const upx = up[0];
        const upy = up[1];
        const upz = up[2];
        const centerx = center[0];
        const centery = center[1];
        const centerz = center[2];
        if (Math.abs(eyex - centerx) < EPSILON &&
            Math.abs(eyey - centery) < EPSILON &&
            Math.abs(eyez - centerz) < EPSILON) {
            return identity(out);
        }
        let z0 = eyex - centerx;
        let z1 = eyey - centery;
        let z2 = eyez - centerz;
        let len = 1 / Math.hypot(z0, z1, z2);
        z0 *= len;
        z1 *= len;
        z2 *= len;
        let x0 = upy * z2 - upz * z1;
        let x1 = upz * z0 - upx * z2;
        let x2 = upx * z1 - upy * z0;
        len = Math.hypot(x0, x1, x2);
        if (!len) {
            x0 = 0;
            x1 = 0;
            x2 = 0;
        }
        else {
            len = 1 / len;
            x0 *= len;
            x1 *= len;
            x2 *= len;
        }
        let y0 = z1 * x2 - z2 * x1;
        let y1 = z2 * x0 - z0 * x2;
        let y2 = z0 * x1 - z1 * x0;
        len = Math.hypot(y0, y1, y2);
        if (!len) {
            y0 = 0;
            y1 = 0;
            y2 = 0;
        }
        else {
            len = 1 / len;
            y0 *= len;
            y1 *= len;
            y2 *= len;
        }
        const _out = out ?? mat4.tmp();
        _out[0] = x0;
        _out[1] = y0;
        _out[2] = z0;
        _out[3] = 0;
        _out[4] = x1;
        _out[5] = y1;
        _out[6] = z1;
        _out[7] = 0;
        _out[8] = x2;
        _out[9] = y2;
        _out[10] = z2;
        _out[11] = 0;
        _out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        _out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        _out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        _out[15] = 1;
        return _out;
    }
    mat4.lookAt = lookAt;
    function translate(m, v, out) {
        return GL.translate(out ?? tmp(), m, v);
    }
    mat4.translate = translate;
})(mat4 || (mat4 = {}));
export var mat3;
(function (mat3) {
    const GL = GLM.mat3;
    function tmp() {
        return tmpArray(9);
    }
    mat3.tmp = tmp;
    /* creates identity matrix */
    function create() {
        const out = float32ArrayOfLength(9);
        out[0] = 1;
        out[4] = 1;
        out[8] = 1;
        return out;
    }
    mat3.create = create;
    function fromValues(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
        var out = float32ArrayOfLength(9);
        out[0] = m00;
        out[1] = m01;
        out[2] = m02;
        out[3] = m10;
        out[4] = m11;
        out[5] = m12;
        out[6] = m20;
        out[7] = m21;
        out[8] = m22;
        return out;
    }
    mat3.fromValues = fromValues;
    function clone(v) {
        return GL.clone(v);
    }
    mat3.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    mat3.copy = copy;
    mat3.IDENTITY = identity(create());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    mat3.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    mat3.exactEquals = exactEquals;
    function set(m00, m01, m02, m10, m11, m12, m20, m21, m22, out) {
        return GL.set(out ?? tmp(), m00, m01, m02, m10, m11, m12, m20, m21, m22);
    }
    mat3.set = set;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    mat3.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    mat3.mul = mul;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    mat3.identity = identity;
    function invert(v1, out) {
        return GL.invert(out ?? tmp(), v1);
    }
    mat3.invert = invert;
    function scale(a, v, out) {
        return GL.scale(out ?? tmp(), a, v);
    }
    mat3.scale = scale;
    function fromScaling(v, out) {
        return GL.fromScaling(out ?? tmp(), v);
    }
    mat3.fromScaling = fromScaling;
    function fromQuat(q, out) {
        return GL.fromQuat(out ?? tmp(), q);
    }
    mat3.fromQuat = fromQuat;
    function fromMat4(q, out) {
        return GL.fromMat4(out ?? tmp(), q);
    }
    mat3.fromMat4 = fromMat4;
})(mat3 || (mat3 = {}));
//# sourceMappingURL=sprig-matrix.js.map