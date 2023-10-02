import { DBG_ASSERT, DBG_VERBOSE_ENTITY_PROMISE_CALLSITES, DBG_VERBOSE_INIT_CALLSITES, DBG_INIT_CAUSATION, DBG_VERBOSE_INIT_SEQ, DBG_SYSTEM_ORDER, DBG_ENITITY_10017_POSITION_CHANGES, } from "../flags.js";
import { assert, assertDbg, dbgOnce, getCallStack, hashCode, isPromise, toMap, } from "../utils/util.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { Phase, PhaseValueList } from "./sys-phase.js";
export const componentsToString = (cs) => `(${cs.map((c) => c.name).join(", ")})`;
export function initFnToString(init) {
    return `${init.name ?? `#${init.id}`}:${componentsToString(init.requireRs)} -> ${componentsToString(init.provideRs)}`;
}
function nameToId(name) {
    return hashCode(name);
}
// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)
export class EntityManager {
    entities = new Map();
    allSystemsByName = new Map();
    activeSystemsById = new Map();
    phases = toMap(PhaseValueList, (n) => n, (_) => []);
    entityPromises = new Map();
    resourcePromises = [];
    componentDefs = new Map(); // TODO(@darzu): rename to componentDefs ?
    resourceDefs = new Map();
    resources = {};
    serializers = new Map();
    ranges = {};
    defaultRange = "";
    sysStats = {};
    initFnMsStats = new Map();
    emStats = {
        queryTime: 0,
    };
    // TODO(@darzu): move elsewhere
    dbgLoops = 0;
    // QUERY SYSTEM
    // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
    //    would make certain scan operations (like updating them on component add/remove)
    //    cheaper. And perhaps better gameplay code too.
    _systemsToEntities = new Map();
    // NOTE: _entitiesToSystems is only needed because of DeadDef
    _entitiesToSystems = new Map();
    _systemsToComponents = new Map();
    _componentToSystems = new Map();
    constructor() {
        // dummy ent 0
        // const ent0 = Object.create(null); // no prototype
        // ent0.id = 0;
        // this.entities.set(0, ent0);
    }
    defineResource(name, construct) {
        const id = nameToId(name);
        if (this.resourceDefs.has(id)) {
            throw `Resource with name ${name} already defined--hash collision?`;
        }
        const def = {
            _brand: "resourceDef",
            name,
            construct,
            id,
        };
        this.resourceDefs.set(id, def);
        return def;
    }
    defineComponent(name, construct, update = (p, ..._) => p) {
        const id = nameToId(name);
        if (this.componentDefs.has(id)) {
            throw `Component with name ${name} already defined--hash collision?`;
        }
        const component = {
            _brand: "componentDef",
            updatable: true,
            name,
            construct,
            update,
            id,
            isOn: (e) => 
            // (e as Object).hasOwn(name),
            name in e,
        };
        // TODO(@darzu): I don't love this cast. feels like it should be possible without..
        this.componentDefs.set(id, component);
        return component;
    }
    defineNonupdatableComponent(name, construct) {
        const id = nameToId(name);
        if (this.componentDefs.has(id)) {
            throw `Component with name ${name} already defined--hash collision?`;
        }
        const component = {
            _brand: "componentDef",
            updatable: false,
            name,
            construct,
            update: (p) => p,
            // make,
            // update,
            id,
            isOn: (e) => 
            // (e as Object).hasOwn(name),
            name in e,
        };
        this.componentDefs.set(id, component);
        return component;
    }
    checkComponent(def) {
        if (!this.componentDefs.has(def.id))
            throw `Component ${def.name} (id ${def.id}) not found`;
        if (this.componentDefs.get(def.id).name !== def.name)
            throw `Component id ${def.id} has name ${this.componentDefs.get(def.id).name}, not ${def.name}`;
    }
    registerSerializerPair(def, serialize, deserialize) {
        assert(def.updatable, `Can't attach serializers to non-updatable component '${def.name}'`);
        this.serializers.set(def.id, { serialize, deserialize });
    }
    serialize(id, componentId, buf) {
        const def = this.componentDefs.get(componentId);
        if (!def)
            throw `Trying to serialize unknown component id ${componentId}`;
        const entity = this.findEntity(id, [def]);
        if (!entity)
            throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No serializer for component ${def.name} (for entity ${id})`;
        // TODO(@darzu): DBG
        // if (componentId === 1867295084) {
        //   console.log(`serializing 1867295084`);
        // }
        serializerPair.serialize(entity[def.name], buf);
    }
    deserialize(id, componentId, buf) {
        const def = this.componentDefs.get(componentId);
        if (!def)
            throw `Trying to deserialize unknown component id ${componentId}`;
        if (!this.hasEntity(id)) {
            throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
        }
        let entity = this.findEntity(id, [def]);
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No deserializer for component ${def.name} (for entity ${id})`;
        const deserialize = (p) => {
            serializerPair.deserialize(p, buf);
            return p;
        };
        // TODO: because of this usage of dummy, deserializers don't
        // actually need to read buf.dummy
        if (buf.dummy) {
            deserialize({});
        }
        else if (!entity) {
            assert(def.updatable, `Trying to deserialize into non-updatable component '${def.name}'!`);
            this.addComponentInternal(id, def, deserialize, ...[]);
        }
        else {
            deserialize(entity[def.name]);
        }
        // TODO(@darzu): DBG
        // if (componentId === 1867295084) {
        //   console.log(`deserializing 1867295084, dummy: ${buf.dummy}`);
        // }
    }
    setDefaultRange(rangeName) {
        this.defaultRange = rangeName;
    }
    setIdRange(rangeName, nextId, maxId) {
        this.ranges[rangeName] = { nextId, maxId };
    }
    // TODO(@darzu): dont return the entity!
    new(rangeName) {
        if (rangeName === undefined)
            rangeName = this.defaultRange;
        const range = this.ranges[rangeName];
        if (!range) {
            throw `Entity manager has no ID range (range specifier is ${rangeName})`;
        }
        if (range.nextId >= range.maxId)
            throw `EntityManager has exceeded its id range!`;
        // TODO(@darzu): does it matter using Object.create(null) here? It's kinda cleaner
        //  to not have a prototype (toString etc).
        // const e = { id: range.nextId++ };
        const e = Object.create(null);
        e.id = range.nextId++;
        if (e.id > 2 ** 15)
            console.warn(`We're halfway through our local entity ID space! Physics assumes IDs are < 2^16`);
        this.entities.set(e.id, e);
        this._entitiesToSystems.set(e.id, []);
        return e;
    }
    registerEntity(id) {
        assert(!this.entities.has(id), `EntityManager already has id ${id}!`);
        /* TODO: should we do the check below but for all ranges?
        if (this.nextId <= id && id < this.maxId)
        throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
        */
        // const e = { id: id };
        const e = Object.create(null); // no prototype
        e.id = id;
        this.entities.set(e.id, e);
        this._entitiesToSystems.set(e.id, []);
        return e;
    }
    // TODO(@darzu): hacky, special components
    isDeletedE(e) {
        return "deleted" in e;
    }
    isDeadE(e) {
        return "dead" in e;
    }
    isDeadC(e) {
        return "dead" === e.name;
    }
    addComponent(id, def, ...args) {
        return this.addComponentInternal(id, def, undefined, ...args);
    }
    addComponentInternal(id, def, customUpdate, ...args) {
        this.checkComponent(def);
        if (id === 0)
            throw `hey, use addResource!`;
        const e = this.entities.get(id);
        // TODO: this is hacky--EM shouldn't know about "deleted"
        if (DBG_ASSERT && this.isDeletedE(e)) {
            console.error(`Trying to add component ${def.name} to deleted entity ${id}`);
        }
        if (def.name in e)
            throw `double defining component ${def.name} on ${e.id}!`;
        let c;
        if (def.updatable) {
            c = def.construct();
            c = customUpdate ? customUpdate(c, ...args) : def.update(c, ...args);
        }
        else {
            c = def.construct(...args);
        }
        e[def.name] = c;
        // update query caches
        {
            let _beforeQueryCache = performance.now();
            this.seenComponents.add(def.id);
            const eSystems = this._entitiesToSystems.get(e.id);
            if (this.isDeadC(def)) {
                // remove from every current system
                eSystems.forEach((s) => {
                    const es = this._systemsToEntities.get(s);
                    // TODO(@darzu): perf. sorted removal
                    const indx = es.findIndex((v) => v.id === id);
                    if (indx >= 0)
                        es.splice(indx, 1);
                });
                eSystems.length = 0;
            }
            const systems = this._componentToSystems.get(def.name);
            for (let sysId of systems ?? []) {
                const allNeededCs = this._systemsToComponents.get(sysId);
                if (allNeededCs?.every((n) => n in e)) {
                    // TODO(@darzu): perf. sorted insert
                    this._systemsToEntities.get(sysId).push(e);
                    eSystems.push(sysId);
                }
            }
            this.emStats.queryTime += performance.now() - _beforeQueryCache;
        }
        // track changes for entity promises
        // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
        this._changedEntities.add(e.id);
        return c;
    }
    addComponentByName(id, name, ...args) {
        console.log("addComponentByName called, should only be called for debugging");
        let component = this.componentDefs.get(nameToId(name));
        if (!component) {
            throw `no component named ${name}`;
        }
        return this.addComponent(id, component, ...args);
    }
    ensureComponent(id, def, ...args) {
        this.checkComponent(def);
        const e = this.entities.get(id);
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            return this.addComponent(id, def, ...args);
        }
        else {
            return e[def.name];
        }
    }
    set(e, def, ...args) {
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            this.addComponent(e.id, def, ...args);
        }
        else {
            assert(def.updatable, `Trying to double set non-updatable component '${def.name}' on '${e.id}'`);
            // if (def.name === "authority") throw new Error(`double-set authority`);
            // dbgLogOnce(`double-set: ${e.id}.${def.name}`);
            e[def.name] = def.update(e[def.name], ...args);
        }
    }
    setOnce(e, def, ...args) {
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            this.addComponent(e.id, def, ...args);
        }
    }
    addResource(def, ...args) {
        assert(this.resourceDefs.has(def.id), `Resource ${def.name} (id ${def.id}) not found`);
        assert(this.resourceDefs.get(def.id).name === def.name, `Resource id ${def.id} has name ${this.resourceDefs.get(def.id).name}, not ${def.name}`);
        assert(!(def.name in this.resources), `double defining resource ${def.name}!`);
        const c = def.construct(...args);
        this.resources[def.name] = c;
        this._changedEntities.add(0); // TODO(@darzu): seperate Resources from Entities
        this.seenResources.add(def.id);
        return c;
    }
    ensureResource(def, ...args) {
        const alreadyHas = def.name in this.resources;
        if (!alreadyHas) {
            return this.addResource(def, ...args);
        }
        else {
            return this.resources[def.name];
        }
    }
    removeResource(def) {
        if (def.name in this.resources) {
            delete this.resources[def.name];
        }
        else {
            throw `Tried to remove absent resource ${def.name}`;
        }
    }
    // TODO(@darzu): should this be public??
    // TODO(@darzu): rename to findResource
    getResource(c) {
        return this.resources[c.name];
    }
    // TODO(@darzu): remove? we should probably be using "whenResources"
    getResources(rs) {
        if (rs.every((r) => r.name in this.resources))
            return this.resources;
        return undefined;
    }
    _dbgLastSystemLen = 0;
    _dbgLastActiveSystemLen = 0;
    callSystems() {
        if (DBG_SYSTEM_ORDER) {
            let newTotalSystemLen = 0;
            let newActiveSystemLen = 0;
            let res = "";
            for (let phase of PhaseValueList) {
                const phaseName = Phase[phase];
                res += phaseName + "\n";
                for (let sysName of this.phases.get(phase)) {
                    let sys = this.allSystemsByName.get(sysName);
                    if (this.activeSystemsById.has(sys.id)) {
                        res += "  " + sysName + "\n";
                        newActiveSystemLen++;
                    }
                    else {
                        res += "  (" + sysName + ")\n";
                    }
                    newTotalSystemLen++;
                }
            }
            if (this._dbgLastSystemLen !== newTotalSystemLen ||
                this._dbgLastActiveSystemLen !== newActiveSystemLen) {
                console.log(res);
                this._dbgLastSystemLen = newTotalSystemLen;
                this._dbgLastActiveSystemLen = newActiveSystemLen;
            }
        }
        for (let phase of PhaseValueList) {
            for (let s of this.phases.get(phase)) {
                this.tryCallSystem(s);
                if (DBG_ENITITY_10017_POSITION_CHANGES) {
                    // TODO(@darzu): GENERALIZE THIS
                    const player = this.entities.get(10017);
                    if (player && "position" in player) {
                        const pos = vec3Dbg(player.position);
                        if (dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`)) {
                            console.log(`10017 pos ${pos} after ${s} on loop ${this.dbgLoops}`);
                            this._dbgChangesToEnt10017 += 1;
                            dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`);
                        }
                    }
                }
            }
        }
    }
    // see DBG_ENITITY_10017_POSITION_CHANGES
    _dbgChangesToEnt10017 = 0;
    hasEntity(id) {
        return this.entities.has(id);
    }
    removeComponent(id, def) {
        if (!this.tryRemoveComponent(id, def))
            throw `Tried to remove absent component ${def.name} from entity ${id}`;
    }
    tryRemoveComponent(id, def) {
        const e = this.entities.get(id);
        if (def.name in e) {
            delete e[def.name];
        }
        else {
            return false;
        }
        // update query cache
        const systems = this._componentToSystems.get(def.name);
        for (let name of systems ?? []) {
            const es = this._systemsToEntities.get(name);
            if (es) {
                // TODO(@darzu): perf. sorted removal
                const indx = es.findIndex((v) => v.id === id);
                if (indx >= 0) {
                    es.splice(indx, 1);
                }
            }
        }
        if (this.isDeadC(def)) {
            const eSystems = this._entitiesToSystems.get(id);
            eSystems.length = 0;
            for (let sysId of this.activeSystemsById.keys()) {
                const allNeededCs = this._systemsToComponents.get(sysId);
                if (allNeededCs?.every((n) => n in e)) {
                    // TODO(@darzu): perf. sorted insert
                    this._systemsToEntities.get(sysId).push(e);
                    eSystems.push(sysId);
                }
            }
        }
        return true;
    }
    keepOnlyComponents(id, cs) {
        let ent = this.entities.get(id);
        if (!ent)
            throw `Tried to delete non-existent entity ${id}`;
        for (let component of this.componentDefs.values()) {
            if (!cs.includes(component) && ent[component.name]) {
                this.removeComponent(id, component);
            }
        }
    }
    hasComponents(e, cs) {
        return cs.every((c) => c.name in e);
    }
    findEntity(id, cs) {
        const e = this.entities.get(id);
        if (!e || !cs.every((c) => c.name in e)) {
            return undefined;
        }
        return e;
    }
    // TODO(@darzu): remove? i think this is unused
    findEntitySet(es) {
        const res = [];
        for (let [id, ...cs] of es) {
            res.push(this.findEntity(id, cs));
        }
        return res;
    }
    // TODO(@darzu): PERF. cache these responses like we do systems?
    // TODO(@darzu): PERF. evaluate all per-frame uses of this
    filterEntities(cs) {
        const res = [];
        if (cs === null)
            return res;
        const inclDead = cs.some((c) => this.isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
        for (let e of this.entities.values()) {
            if (!inclDead && this.isDeadE(e))
                continue;
            if (e.id === 0)
                continue; // TODO(@darzu): Remove ent 0, make first-class Resources
            if (cs.every((c) => c.name in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    dbgFilterEntitiesByKey(cs) {
        // TODO(@darzu): respect "DeadDef" comp ?
        console.log("filterEntitiesByKey called--should only be called from console");
        const res = [];
        if (typeof cs === "string")
            cs = [cs];
        for (let e of this.entities.values()) {
            if (cs.every((c) => c in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    _nextInitFnId = 1;
    addLazyInit(requireRs, provideRs, callback, name // TODO(@darzu): make required?
    ) {
        const id = this._nextInitFnId++;
        const reg = {
            requireRs,
            provideRs,
            fn: callback,
            eager: false,
            id,
            name,
        };
        this.addInit(reg);
        return reg;
    }
    addEagerInit(requireCompSet, requireRs, provideRs, callback, name // TODO(@darzu): make required?
    ) {
        const id = this._nextInitFnId++;
        const reg = {
            requireCompSet,
            requireRs,
            provideRs,
            fn: callback,
            eager: true,
            id,
            name,
        };
        this.addInit(reg);
        return reg;
    }
    _nextSystemId = 1;
    addSystem(name, phase, cs, rs, callback) {
        name = name || callback.name;
        if (name === "") {
            throw new Error(`To define a system with an anonymous function, pass an explicit name`);
        }
        if (this.allSystemsByName.has(name))
            throw `System named ${name} already defined. Try explicitly passing a name`;
        const id = this._nextSystemId;
        this._nextSystemId += 1;
        const sys = {
            cs,
            rs,
            callback,
            name,
            phase,
            id,
        };
        this.allSystemsByName.set(name, sys);
        // NOTE: even though we might not active the system right away, we want to respect the
        //  order in which it was added to the phase.
        this.phases.get(phase).push(name);
        const seenAllCmps = (sys.cs ?? []).every((c) => this.seenComponents.has(c.id));
        const seenAllRes = sys.rs.every((c) => this.seenResources.has(c.id));
        if (seenAllCmps && seenAllRes) {
            this.activateSystem(sys);
        }
        else {
            // NOTE: we delay activating the system b/c each active system incurs
            //  a cost to maintain its query accelerators on each entity and component
            //  added/removed
            this.addEagerInit(sys.cs ?? [], sys.rs, [], () => {
                this.activateSystem(sys);
            }, `sysinit_${sys.name}`);
        }
    }
    activateSystem(sys) {
        const { cs, id, name, phase } = sys;
        this.activeSystemsById.set(id, sys);
        this.sysStats[name] = {
            calls: 0,
            queries: 0,
            callTime: 0,
            maxCallTime: 0,
        };
        // update query cache:
        //  pre-compute entities for this system for quicker queries; these caches will be maintained
        //  by add/remove/ensure component calls
        // TODO(@darzu): ability to toggle this optimization on/off for better debugging
        const es = this.filterEntities(cs);
        this._systemsToEntities.set(id, [...es]);
        if (cs) {
            for (let c of cs) {
                if (!this._componentToSystems.has(c.name))
                    this._componentToSystems.set(c.name, [id]);
                else
                    this._componentToSystems.get(c.name).push(id);
            }
            this._systemsToComponents.set(id, cs.map((c) => c.name));
        }
        for (let e of es) {
            const ss = this._entitiesToSystems.get(e.id);
            assertDbg(ss);
            ss.push(id);
        }
    }
    whenResources(...rs) {
        // short circuit if we already have the components
        if (rs.every((c) => c.name in this.resources))
            return Promise.resolve(this.resources);
        const promiseId = this._nextEntityPromiseId++;
        if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
            // if (dbgOnce("getCallStack")) console.dir(getCallStack());
            let line = getCallStack().find((s) => !s.includes("entity-manager") && //
                !s.includes("em-helpers"));
            if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
                console.log(`promise #${promiseId}: ${componentsToString(rs)} from: ${line}`);
            this._dbgEntityPromiseCallsites.set(promiseId, line);
        }
        return new Promise((resolve, reject) => {
            const sys = {
                id: promiseId,
                rs,
                callback: resolve,
            };
            this.resourcePromises.push(sys);
        });
    }
    hasSystem(name) {
        return this.allSystemsByName.has(name);
    }
    tryCallSystem(name) {
        // TODO(@darzu):
        // if (name.endsWith("Build")) console.log(`calling ${name}`);
        // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");
        const s = this.allSystemsByName.get(name);
        assert(s, `Can't find system with name: ${name}`);
        if (!this.activeSystemsById.has(s.id)) {
            return false;
        }
        let start = performance.now();
        // try looking up in the query cache
        let es;
        if (s.cs) {
            assertDbg(this._systemsToEntities.has(s.id), `System ${s.name} doesn't have a query cache!`);
            es = this._systemsToEntities.get(s.id);
        }
        else {
            es = [];
        }
        // TODO(@darzu): uncomment to debug query cache issues
        // es = this.filterEntities(s.cs);
        const rs = this.getResources(s.rs); // TODO(@darzu): remove allocs here
        let afterQuery = performance.now();
        this.sysStats[s.name].queries++;
        this.emStats.queryTime += afterQuery - start;
        if (!rs) {
            // we don't yet have the resources, check if we can init any
            s.rs.forEach((r) => {
                const forced = this.tryForceResourceInit(r);
                if (DBG_INIT_CAUSATION && forced) {
                    console.log(`${performance.now().toFixed(0)}ms: '${r.name}' force by system ${s.name}`);
                }
            });
            return true;
        }
        // we have the resources
        s.callback(es, rs);
        // // TODO(@darzu): DEBUG. Promote to a dbg flag? Maybe pre-post system watch predicate
        // if (es.length && es[0].id === 10001) {
        //   const doesHave = "rendererWorldFrame" in es[0];
        //   const isUndefined =
        //     doesHave && (es[0] as any)["rendererWorldFrame"] === undefined;
        //   console.log(
        //     `after ${s.name}: ${es[0].id} ${
        //       doesHave ? "HAS" : "NOT"
        //     } .rendererWorldFrame ${isUndefined ? "===" : "!=="} undefined`
        //   );
        // }
        let afterCall = performance.now();
        this.sysStats[s.name].calls++;
        const thisCallTime = afterCall - afterQuery;
        this.sysStats[s.name].callTime += thisCallTime;
        this.sysStats[s.name].maxCallTime = Math.max(this.sysStats[s.name].maxCallTime, thisCallTime);
        return true;
    }
    // private _callSystem(name: string) {
    //   if (!this.maybeRequireSystem(name)) throw `No system named ${name}`;
    // }
    // TODO(@darzu): use version numbers instead of dirty flag?
    _changedEntities = new Set();
    // _dbgFirstXFrames = 10;
    // dbgStrEntityPromises() {
    //   let res = "";
    //   res += `changed ents: ${[...this._changedEntities.values()].join(",")}\n`;
    //   this.entityPromises.forEach((promises, id) => {
    //     for (let s of promises) {
    //       const unmet = s.cs.filter((c) => !c.isOn(s.e)).map((c) => c.name);
    //       res += `#${id} is waiting for ${unmet.join(",")}\n`;
    //     }
    //   });
    //   return res;
    // }
    dbgEntityPromises() {
        let res = "";
        for (let [id, prom] of this.entityPromises.entries()) {
            const ent = EM.entities.get(id) || { id };
            const unmet = prom
                .flatMap((p) => p.cs.map((c) => c.name))
                .filter((n) => !(n in ent));
            res += `ent waiting: ${id} <- (${unmet.join(",")})\n`;
        }
        for (let prom of this.resourcePromises) {
            // if (prom.rs.some((r) => !(r.name in this.resources)))
            res += `resources waiting: (${prom.rs.map((r) => r.name).join(",")})\n`;
        }
        return res;
    }
    // TODO(@darzu): PERF TRACKING. Thinking:
    /*
    goal: understand what's happening between 0 and first-playable
  
    could use "milestone" event trackers
  
    perhaps we have frame phases:
    executing systems,
    executing inits,
    waiting for next draw
  
    attribute system time to systems
      are systems every async?
  
    perhaps entity promises could check to see if they're being created in System, Init, or Other
      What would "Other" be?
    And then they'd resume themselves in the appropriate system's scheduled time?
  
    How do we track time on vanilla init functions?
  
    I could always resume entity promises in the same phase as what requested them so
    either init time or GAME_WORLD etc
  
      if we did that i think we could accurately measure self-time for systems
      but that might not capture other time like file downloading
    */
    // TODO(@darzu): can this consolidate with the InitFn system?
    // TODO(@darzu): PERF TRACKING. Need to rethink how this interacts with system and init fn perf tracking
    // TODO(@darzu): EXPERIMENT: returns madeProgress
    checkEntityPromises() {
        let madeProgress = false;
        // console.dir(this.entityPromises);
        // console.log(this.dbgStrEntityPromises());
        // this._dbgFirstXFrames--;
        // if (this._dbgFirstXFrames <= 0) throw "STOP";
        const beforeOneShots = performance.now();
        // check resource promises
        // TODO(@darzu): also check and call init functions for systems!!
        for (
        // run backwards so we can remove as we go
        let idx = this.resourcePromises.length - 1; idx >= 0; idx--) {
            const p = this.resourcePromises[idx];
            let finished = p.rs.every((r) => r.name in this.resources);
            if (finished) {
                this.resourcePromises.splice(idx, 1);
                // TODO(@darzu): record time?
                // TODO(@darzu): how to handle async callbacks and their timing?
                p.callback(this.resources);
                madeProgress = true;
                continue;
            }
            // if it's not ready to run, try to push the required resources along
            p.rs.forEach((r) => {
                const forced = this.tryForceResourceInit(r);
                madeProgress ||= forced;
                if (DBG_INIT_CAUSATION && forced) {
                    const line = this._dbgEntityPromiseCallsites.get(p.id);
                    console.log(`${performance.now().toFixed(0)}ms: '${r.name}' force by promise #${p.id} from: ${line}`);
                }
            });
        }
        // check entity promises
        let finishedEntities = new Set();
        this.entityPromises.forEach((promises, id) => {
            // no change
            if (!this._changedEntities.has(id)) {
                // console.log(`no change on: ${id}`);
                return;
            }
            // check each promise (reverse so we can remove)
            for (let idx = promises.length - 1; idx >= 0; idx--) {
                const s = promises[idx];
                // promise full filled?
                if (!s.cs.every((c) => c.name in s.e)) {
                    // console.log(`still doesn't match: ${id}`);
                    continue;
                }
                // call callback
                const afterOneShotQuery = performance.now();
                const stats = this.sysStats["__oneShots"];
                stats.queries += 1;
                this.emStats.queryTime += afterOneShotQuery - beforeOneShots;
                promises.splice(idx, 1);
                // TODO(@darzu): how to handle async callbacks and their timing?
                // TODO(@darzu): one idea: only call the callback in the same phase or system
                //    timing location that originally asked for the promise
                s.callback(s.e);
                madeProgress = true;
                const afterOneShotCall = performance.now();
                stats.calls += 1;
                const thisCallTime = afterOneShotCall - afterOneShotQuery;
                stats.callTime += thisCallTime;
                stats.maxCallTime = Math.max(stats.maxCallTime, thisCallTime);
            }
            // clean up
            if (promises.length === 0)
                finishedEntities.add(id);
        });
        // clean up
        for (let id of finishedEntities) {
            this.entityPromises.delete(id);
        }
        this._changedEntities.clear();
        if (DBG_ENITITY_10017_POSITION_CHANGES) {
            // TODO(@darzu): GENERALIZE THIS
            const player = this.entities.get(10017);
            if (player && "position" in player) {
                const pos = vec3Dbg(player.position);
                if (dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`)) {
                    console.log(`10017 pos ${pos} after 'entity promises' on loop ${this.dbgLoops}`);
                    this._dbgChangesToEnt10017 += 1;
                    dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`);
                }
            }
        }
        return madeProgress;
    }
    // TODO(@darzu): good or terrible name?
    // TODO(@darzu): another version for checking entity promises?
    // TODO(@darzu): update with new init system
    whyIsntSystemBeingCalled(name) {
        // TODO(@darzu): more features like check against a specific set of entities
        const sys = this.allSystemsByName.get(name);
        if (!sys) {
            console.warn(`No systems found with name: '${name}'`);
            return;
        }
        let haveAllResources = true;
        for (let _r of sys.rs) {
            let r = _r;
            if (!this.getResource(r)) {
                console.warn(`System '${name}' missing resource: ${r.name}`);
                haveAllResources = false;
            }
        }
        const es = this.filterEntities(sys.cs);
        console.warn(`System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`);
    }
    _nextEntityPromiseId = 0;
    _dbgEntityPromiseCallsites = new Map();
    // TODO(@darzu): Rethink naming here
    // NOTE: if you're gonna change the types, change registerSystem first and just copy
    //  them down to here
    whenEntityHas(e, ...cs) {
        // short circuit if we already have the components
        if (cs.every((c) => c.name in e))
            return Promise.resolve(e);
        // TODO(@darzu): this is too copy-pasted from registerSystem
        // TODO(@darzu): need unified query maybe?
        // let _name = "oneShot" + this.++;
        // if (this.entityPromises.has(_name))
        //   throw `One-shot single system named ${_name} already defined.`;
        // use one bucket for all one shots. Change this if we want more granularity
        this.sysStats["__oneShots"] = this.sysStats["__oneShots"] ?? {
            calls: 0,
            queries: 0,
            callTime: 0,
            maxCallTime: 0,
            queryTime: 0,
        };
        const promiseId = this._nextEntityPromiseId++;
        if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
            // if (dbgOnce("getCallStack")) console.dir(getCallStack());
            let line = getCallStack().find((s) => !s.includes("entity-manager") && //
                !s.includes("em-helpers"));
            if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
                console.log(`promise #${promiseId}: ${componentsToString(cs)} from: ${line}`);
            this._dbgEntityPromiseCallsites.set(promiseId, line);
        }
        return new Promise((resolve, reject) => {
            const sys = {
                id: promiseId,
                e,
                cs,
                callback: resolve,
                // name: _name,
            };
            if (this.entityPromises.has(e.id))
                this.entityPromises.get(e.id).push(sys);
            else
                this.entityPromises.set(e.id, [sys]);
        });
    }
    // TODO(@darzu): feels a bit hacky; lets track usages and see if we can make this
    //  feel natural.
    // TODO(@darzu): PERF. resolve this instantly w/o init if entity exists?
    whenSingleEntity(...cs) {
        return new Promise((resolve) => {
            EM.addEagerInit(cs, [], [], () => {
                const ents = EM.filterEntities(cs);
                if (!ents || ents.length !== 1)
                    assert(false, `Invalid 'whenSingleEntity' call; found ${ents.length} matching entities for '${cs.map((c) => c.name).join(",")}'`);
                resolve(ents[0]);
            });
        });
    }
    // INIT SYSTEM
    // TODO(@darzu): [ ] split entity-manager ?
    // TODO(@darzu): [ ] consolidate entity promises into init system?
    // TODO(@darzu): [ ] addLazyInit, addEagerInit require debug name
    seenComponents = new Set();
    seenResources = new Set();
    pendingLazyInitsByProvides = new Map();
    pendingEagerInits = [];
    startedInits = new Map();
    allInits = new Map();
    // TODO(@darzu): how can i tell if the event loop is running dry?
    // TODO(@darzu): EXPERIMENT: returns madeProgress
    progressInitFns() {
        let madeProgress = false;
        this.pendingEagerInits.forEach((e, i) => {
            let hasAll = true;
            // has component set?
            // TODO(@darzu): more precise component set tracking:
            //               not just one of each component, but some entity that has all
            let hasCompSet = true;
            if (e.requireCompSet)
                for (let c of e.requireCompSet)
                    hasCompSet &&= this.seenComponents.has(c.id);
            hasAll &&= hasCompSet;
            // has resources?
            for (let r of e.requireRs) {
                if (!this.seenResources.has(r.id)) {
                    if (hasCompSet) {
                        // NOTE: we don't force resources into existance until the components are met
                        //    this is (probably) the behavior we want when there's a system that is
                        //    waiting on some components to exist.
                        // lazy -> eager
                        const forced = this.tryForceResourceInit(r);
                        madeProgress ||= forced;
                        if (DBG_INIT_CAUSATION && forced) {
                            const line = this._dbgInitBlameLn.get(e.id);
                            console.log(`${performance.now().toFixed(0)}ms: '${r.name}' force by init #${e.id} from: ${line}`);
                        }
                    }
                    hasAll = false;
                }
            }
            // run?
            if (hasAll) {
                // TODO(@darzu): BUG. this won't work if a resource is added then removed e.g. flags
                //    need to think if we really want to allow resource removal. should we
                //    have a seperate concept for flags?
                // eager -> run
                this.runInitFn(e);
                this.pendingEagerInits.splice(i, 1);
                madeProgress = true;
            }
        });
        if (DBG_ENITITY_10017_POSITION_CHANGES) {
            // TODO(@darzu): GENERALIZE THIS
            const player = this.entities.get(10017);
            if (player && "position" in player) {
                const pos = vec3Dbg(player.position);
                if (dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`)) {
                    console.log(`10017 pos ${pos} after 'init fns' on loop ${this.dbgLoops}`);
                    this._dbgChangesToEnt10017 += 1;
                    dbgOnce(`${this._dbgChangesToEnt10017}-${pos}`);
                }
            }
        }
        return madeProgress;
    }
    _dbgInitBlameLn = new Map();
    addInit(reg) {
        if (DBG_VERBOSE_INIT_CALLSITES || DBG_INIT_CAUSATION) {
            // if (dbgOnce("getCallStack")) console.dir(getCallStack());
            let line = getCallStack().find((s) => !s.includes("entity-manager") && //
                !s.includes("em-helpers"));
            // trim "http://localhost:4321/"
            // const hostIdx = line.indexOf(window.location.host);
            // if (hostIdx >= 0)
            //   line = line.slice(hostIdx + window.location.host.length);
            if (DBG_VERBOSE_INIT_CALLSITES)
                console.log(`init ${initFnToString(reg)} from: ${line}`);
            this._dbgInitBlameLn.set(reg.id, line);
        }
        assert(!this.allInits.has(reg.id), `Double registering ${initFnToString(reg)}`);
        this.allInits.set(reg.id, reg);
        if (reg.eager) {
            this.pendingEagerInits.push(reg);
            if (DBG_VERBOSE_INIT_SEQ)
                console.log(`new eager: ${initFnToString(reg)}`);
        }
        else {
            assert(reg.provideRs.length > 0, `addLazyInit must specify at least 1 provideRs`);
            for (let p of reg.provideRs) {
                assert(!this.pendingLazyInitsByProvides.has(p.id), `Resource: '${p.name}' already has an init fn!`);
                this.pendingLazyInitsByProvides.set(p.id, reg);
            }
            if (DBG_VERBOSE_INIT_SEQ)
                console.log(`new lazy: ${initFnToString(reg)}`);
        }
    }
    tryForceResourceInit(r) {
        const lazy = this.pendingLazyInitsByProvides.get(r.id);
        if (!lazy)
            return false;
        // remove from all lazy
        for (let r of lazy.provideRs)
            this.pendingLazyInitsByProvides.delete(r.id);
        // add to eager
        this.pendingEagerInits.push(lazy);
        if (DBG_VERBOSE_INIT_SEQ)
            console.log(`lazy => eager: ${initFnToString(lazy)}`);
        return true; // was forced
    }
    _runningInitStack = [];
    _lastInitTimestamp = -1;
    async runInitFn(init) {
        // TODO(@darzu): attribute time spent to specific init functions
        // update init fn stats before
        {
            assert(!this.initFnMsStats.has(init.id));
            this.initFnMsStats.set(init.id, 0);
            const before = performance.now();
            if (this._runningInitStack.length) {
                assert(this._lastInitTimestamp >= 0);
                let elapsed = before - this._lastInitTimestamp;
                let prev = this._runningInitStack.at(-1);
                assert(this.initFnMsStats.has(prev.id));
                this.initFnMsStats.set(prev.id, this.initFnMsStats.get(prev.id) + elapsed);
            }
            this._lastInitTimestamp = before;
            this._runningInitStack.push(init);
        }
        const promise = init.fn(this.resources);
        this.startedInits.set(init.id, promise);
        if (DBG_VERBOSE_INIT_SEQ)
            console.log(`eager => started: ${initFnToString(init)}`);
        if (isPromise(promise))
            await promise;
        // assert resources were added
        // TODO(@darzu): verify that init fn doesn't add any resources not mentioned in provides
        for (let res of init.provideRs)
            assert(res.name in this.resources, `Init fn failed to provide: ${res.name}`);
        // update init fn stats after
        {
            const after = performance.now();
            let popped = this._runningInitStack.pop();
            // TODO(@darzu): WAIT. why should the below be true? U should be able to have
            //   A-start, B-start, A-end, B-end
            // if A and B are unrelated
            // assert(popped && popped.id === init.id, `Daryl doesnt understand stacks`);
            // TODO(@darzu): all this init tracking might be lying.
            assert(this._lastInitTimestamp >= 0);
            const elapsed = after - this._lastInitTimestamp;
            this.initFnMsStats.set(init.id, this.initFnMsStats.get(init.id) + elapsed);
            if (this._runningInitStack.length)
                this._lastInitTimestamp = after;
            else
                this._lastInitTimestamp = -1;
        }
        if (DBG_VERBOSE_INIT_SEQ)
            console.log(`finished: ${initFnToString(init)}`);
    }
    update() {
        // TODO(@darzu): can EM.update() be a system?
        let madeProgress;
        do {
            madeProgress = false;
            madeProgress ||= this.progressInitFns();
            madeProgress ||= this.checkEntityPromises();
        } while (madeProgress);
        this.callSystems();
        this.dbgLoops++;
    }
}
// TODO(@darzu): where to put this?
export const EM = new EntityManager();
//# sourceMappingURL=entity-manager.js.map