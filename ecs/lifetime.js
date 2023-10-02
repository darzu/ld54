import { DeadDef } from "./delete.js";
import { EM } from "./entity-manager.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "./sys-phase.js";
export const LifetimeDef = EM.defineComponent("lifetime", () => {
    return { startMs: 1000, ms: 1000 };
}, (p, ms = 1000) => {
    p.startMs = ms;
    p.ms = ms;
    return p;
});
EM.addSystem("updateLifetimes", Phase.PRE_GAME_WORLD, [LifetimeDef], [TimeDef, MeDef], (objs, res) => {
    for (let o of objs) {
        if (EM.hasComponents(o, [AuthorityDef]))
            if (o.authority.pid !== res.me.pid)
                continue;
        o.lifetime.ms -= res.time.dt;
        if (o.lifetime.ms < 0) {
            // TODO(@darzu): dead or deleted?
            EM.set(o, DeadDef);
            // TODO(@darzu): note needed?
            // EM.addComponent(o.id, DeletedDef);
        }
    }
});
//# sourceMappingURL=lifetime.js.map