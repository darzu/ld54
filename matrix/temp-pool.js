import { vec2, vec3, vec4, quat, mat4 } from "./sprig-matrix.js";
import { range } from "../utils/util.js";
class _TempPool {
    vec2s;
    nextVec2 = 0;
    vec3s;
    nextVec3 = 0;
    vec4s;
    nextVec4 = 0;
    quats;
    nextQuat = 0;
    mat4s;
    nextMat4 = 0;
    constructor(maxVecs, maxQuats, maxMat4s) {
        this.vec2s = range(maxVecs).map(() => vec2.create());
        this.vec3s = range(maxVecs).map(() => vec3.create());
        this.vec4s = range(maxVecs).map(() => vec4.create());
        this.quats = range(maxQuats).map(() => quat.create());
        this.mat4s = range(maxMat4s).map(() => mat4.create());
    }
    vec2() {
        if (this.nextVec2 >= this.vec2s.length)
            this.nextVec2 = 0;
        return this.vec2s[this.nextVec2++];
    }
    vec3() {
        if (this.nextVec3 >= this.vec3s.length)
            this.nextVec3 = 0;
        return this.vec3s[this.nextVec3++];
    }
    vec4() {
        if (this.nextVec4 >= this.vec4s.length)
            this.nextVec4 = 0;
        return this.vec4s[this.nextVec4++];
    }
    quat() {
        if (this.nextQuat >= this.quats.length)
            this.nextQuat = 0;
        return this.quats[this.nextQuat++];
    }
    mat4() {
        if (this.nextMat4 >= this.mat4s.length)
            this.nextMat4 = 0;
        return this.mat4s[this.nextMat4++];
    }
}
const pool = new _TempPool(1000, 1000, 1000);
// TODO(@darzu): for debugging temp vec problems
// export const tempVec = () => vec3.create();
export const tempVec2 = pool.vec2.bind(pool);
export const tempVec3 = pool.vec3.bind(pool);
export const tempVec4 = pool.vec4.bind(pool);
export const tempQuat = pool.quat.bind(pool);
export const tempMat4 = pool.mat4.bind(pool);
//# sourceMappingURL=temp-pool.js.map