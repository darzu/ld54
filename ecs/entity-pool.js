import { createIdxPool } from "../utils/idx-pool.js";
import { assert, never } from "../utils/util.js";
export function createEntityPool(params) {
    const ents = [];
    const entIdToIdx = new Map();
    const idxPool = createIdxPool(params.max);
    async function spawn() {
        if (idxPool.numFree() === 0) {
            if (params.maxBehavior === "crash")
                throw `Entity pool full!`;
            else if (params.maxBehavior === "rand-despawn") {
                let toDespawnIdx = idxPool._cursor();
                let toDespawn = ents[toDespawnIdx];
                params.onDespawn(toDespawn);
                idxPool.free(toDespawnIdx);
            }
            else
                never(params.maxBehavior);
        }
        const idx = idxPool.next();
        let ent;
        if (!ents[idx]) {
            // new entity
            ent = await params.create();
            ents[idx] = ent;
            entIdToIdx.set(ent.id, idx);
        }
        // take existing
        else
            ent = ents[idx];
        // spawn
        await params.onSpawn(ent);
        return ent;
    }
    function despawn(e) {
        const idx = entIdToIdx.get(e.id);
        // if (!(idx !== undefined && ents[idx] === e)) {
        //   console.dir(entIdToIdx);
        //   console.dir(ents);
        //   console.dir(e);
        //   console.log(idx);
        // }
        assert(idx !== undefined && ents[idx] === e, `despawning entity that isnt in pool: ${e.id}`);
        params.onDespawn(e);
        idxPool.free(idx); // TODO(@darzu): ignore double free param?
    }
    return {
        params,
        spawn,
        despawn,
    };
}
//# sourceMappingURL=entity-pool.js.map