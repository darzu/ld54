// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?
import { EM } from "../ecs/entity-manager.js";
import { quat, mat4 } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { RiggedRenderableDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
// initializes dest if it is empty; otherwise, assumes it has the right length
function copyPoseRot(dest, src) {
    if (dest.length === 0) {
        src.forEach((rot) => dest.push(quat.copy(quat.create(), rot)));
    }
    else {
        src.forEach((rot, i) => quat.copy(dest[i], rot));
    }
}
// set a pose now, deciding what to do with the queue
export function setPose(e, pose, preserveQueue) {
    if (!preserveQueue) {
        e.pose.queue = [];
    }
    e.pose.t = 0;
    e.pose.queue.unshift({ pose, t: 0 });
}
// start tweening to a pose now, deciding what to do with the rest of the queue
export function tweenToPose(e, pose, t, preserveQueue) {
    // if we are already tweening towards this pose, ignore this request
    if (e.pose.queue.length > 0 && e.pose.queue[0].pose == pose) {
        return;
    }
    if (!preserveQueue) {
        e.pose.queue = [];
    }
    e.pose.queue.unshift({ pose, t });
    copyPoseRot(e.pose.prev, e.pose.curr);
    e.pose.t = 0;
}
// cycle through these poses ad infinitum
export function repeatPoses(e, ...poses) {
    e.pose.repeat = poses.map(([pose, t]) => ({
        pose,
        t,
    }));
}
// clear out any queued animations, including repeats
export function clearAnimationQueue(e) {
    e.pose.queue = [];
}
// add a pose to the queue, to be executed after any current
// animations (but before any repeat)
export function queuePose(e, pose, t) {
    e.pose.queue.push({ pose, t });
}
export const PoseDef = EM.defineNonupdatableComponent("pose", (rigging) => {
    // assume that the 0th pose is bind pose
    const prev = [];
    const curr = [];
    copyPoseRot(prev, rigging.poseRot[0]);
    copyPoseRot(curr, rigging.poseRot[0]);
    return {
        prev,
        curr,
        t: 0,
        queue: [],
        repeat: [],
    };
});
EM.addEagerInit([PoseDef], [], [], () => {
    EM.addSystem("skeletalPose", Phase.RENDER_PRE_DRAW, [PoseDef, RiggedRenderableDef], [TimeDef], (es, res) => {
        for (let e of es) {
            const rigging = e.riggedRenderable.rigging;
            if (e.pose.queue.length > 0 && e.pose.t >= e.pose.queue[0].t) {
                const finishedQueuedAnimation = e.pose.queue.shift();
                // we finished our animation. set both curr and prev to this pose
                const pose = typeof finishedQueuedAnimation.pose === "number"
                    ? rigging.poseRot[finishedQueuedAnimation.pose]
                    : finishedQueuedAnimation.pose;
                copyPoseRot(e.pose.curr, pose);
                copyPoseRot(e.pose.prev, pose);
                e.pose.t = e.pose.t - finishedQueuedAnimation.t;
            }
            if (e.pose.repeat && e.pose.queue.length == 0) {
                for (let qa of e.pose.repeat) {
                    e.pose.queue.push(qa);
                }
            }
            if (e.pose.queue.length !== 0) {
                const next = typeof e.pose.queue[0].pose === "number"
                    ? rigging.poseRot[e.pose.queue[0].pose]
                    : e.pose.queue[0].pose;
                const r = e.pose.t / e.pose.queue[0].t;
                next.forEach((rotation, i) => {
                    quat.slerp(e.pose.prev[i], rotation, r, e.pose.curr[i]);
                });
                e.pose.t += res.time.dt;
            }
            const mats = e.riggedRenderable.jointMatrices;
            // first, compute a global transform for each joint
            for (let j = 0; j < rigging.parents.length; j++) {
                assert(rigging.parents[j] <= j, "Non-topo-sorted parents list");
                mat4.fromRotationTranslationScale(e.pose.curr[j], rigging.jointPos[j], rigging.jointScale[j], mats[j]);
                if (rigging.parents[j] < j) {
                    mat4.mul(mats[rigging.parents[j]], mats[j], mats[j]);
                }
            }
            // now, multiply by the inverse bind matrices
            for (let j = 0; j < rigging.parents.length; j++) {
                mat4.mul(mats[j], rigging.inverseBindMatrices[j], mats[j]);
            }
        }
    });
});
//# sourceMappingURL=skeletal.js.map