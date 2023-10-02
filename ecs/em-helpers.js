import { EM, } from "./entity-manager.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { assert } from "../utils/util.js";
import { capitalize } from "../utils/util.js";
import { Phase } from "./sys-phase.js";
export function defineSerializableComponent(name, 
// TODO(@darzu): change to use update/make
// construct: (...args: Pargs) => P,
make, update, serialize, deserialize) {
    const def = EM.defineComponent(name, make, update);
    EM.registerSerializerPair(def, serialize, deserialize);
    return def;
}
function registerConstructorSystem(def, rs, callback) {
    EM.addSystem(`${def.name}Build`, Phase.PRE_GAME_WORLD, [def], rs, (es, res) => {
        for (let e of es) {
            if (FinishedDef.isOn(e))
                continue;
            callback(e, res);
            EM.set(e, FinishedDef);
        }
    });
    return callback;
    // console.log(`reg ${def.name}Build`);
}
// TODO(@darzu): what happens if build() is async???!
// TODO(@darzu): I think i'd prefer this to be a struct, not a function call
//                also this might need to be merged with entity pool helper?
export function defineNetEntityHelper(opts) {
    const propsDef = defineSerializableComponent(`${opts.name}Props`, opts.defaultProps, opts.updateProps, opts.serializeProps, opts.deserializeProps);
    const localDef = EM.defineComponent(`${opts.name}Local`, opts.defaultLocal, (p) => p);
    const constructFn = registerConstructorSystem(propsDef, [...opts.buildResources, MeDef], (e, res) => {
        const me = res.me; // TYPE HACK
        EM.setOnce(e, AuthorityDef, me.pid);
        // console.log(
        //   `making ent ${e.id} w/ pid ${me.pid}; actual: ${e.authority.pid}`
        // );
        EM.setOnce(e, localDef);
        EM.setOnce(e, SyncDef);
        e.sync.fullComponents = [propsDef.id];
        e.sync.dynamicComponents = opts.dynamicComponents.map((d) => d.id);
        for (let d of opts.dynamicComponents)
            EM.setOnce(e, d); // TODO(@darzu): this makes me nervous, calling .set without parameters
        // TYPE HACK
        const _e = e;
        opts.build(_e, res);
    });
    const createNew = (...args) => {
        const e = EM.new();
        EM.set(e, propsDef, ...args);
        return e;
    };
    const createNewNow = (res, ...args) => {
        const e = EM.new();
        EM.set(e, propsDef, ...args);
        // TODO(@darzu): maybe we should force users to give us the MeDef? it's probably always there tho..
        // TODO(@darzu): Think about what if buid() is async...
        constructFn(e, res);
        EM.set(e, FinishedDef);
        return e;
    };
    const createNewAsync = async (...args) => {
        const e = EM.new();
        EM.set(e, propsDef, ...args);
        await EM.whenEntityHas(e, FinishedDef);
        return e;
    };
    const capitalizedN = capitalize(opts.name);
    const result = {
        [`${capitalizedN}PropsDef`]: propsDef,
        [`${capitalizedN}LocalDef`]: localDef,
        [`create${capitalizedN}`]: createNew,
        [`create${capitalizedN}Now`]: createNewNow,
        [`create${capitalizedN}Async`]: createNewAsync,
    };
    // TYPE HACK: idk how to make Typscript accept this...
    // TODO(@darzu): would be nice to have proper type checking on these fns
    return result;
}
export function createRef(idOrE, cs) {
    if (typeof idOrE === "number") {
        if (idOrE <= 0) {
            const thunk = () => undefined;
            thunk.id = idOrE;
            return thunk;
        }
        else {
            let found;
            assert(!!cs, "Ref must be given ComponentDef witnesses w/ id");
            const thunk = () => {
                if (!found)
                    found = EM.findEntity(idOrE, cs);
                return found;
            };
            thunk.id = idOrE;
            return thunk;
        }
    }
    else {
        const thunk = () => idOrE;
        thunk.id = idOrE.id;
        return thunk;
    }
}
export const FinishedDef = EM.defineComponent("finished", () => true, (p) => p);
//# sourceMappingURL=em-helpers.js.map