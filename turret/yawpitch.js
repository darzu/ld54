import { defineSerializableComponent } from "../ecs/em-helpers.js";
import { quat } from "../matrix/sprig-matrix.js";
export const YawPitchDef = defineSerializableComponent("yawpitch", () => {
    return {
        yaw: 0,
        pitch: 0,
    };
}, (p, yaw, pitch) => {
    if (yaw !== undefined)
        p.yaw = yaw;
    if (pitch !== undefined)
        p.pitch = pitch;
    return p;
}, (o, buf) => {
    buf.writeFloat32(o.yaw);
    buf.writeFloat32(o.pitch);
}, (o, buf) => {
    o.yaw = buf.readFloat32();
    o.pitch = buf.readFloat32();
});
export function yawpitchToQuat(out, yp) {
    quat.copy(out, quat.IDENTITY);
    quat.rotateY(out, yp.yaw, out);
    quat.rotateX(out, yp.pitch, out);
    return out;
}
//# sourceMappingURL=yawpitch.js.map