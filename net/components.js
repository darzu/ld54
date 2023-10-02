import { EM } from "../ecs/entity-manager.js";
export const SyncDef = EM.defineComponent("sync", () => ({
    priorityIncrementFull: 1000,
    priorityIncrementDynamic: 10,
    fullComponents: [],
    dynamicComponents: [],
}), (p, dynamic) => {
    if (dynamic)
        p.dynamicComponents = dynamic;
    return p;
});
export const PeerDef = EM.defineComponent("peer", () => ({
    address: "",
    // TODO: consider moving this state to another component
    joined: false,
    pid: 0,
    updateSeq: 0,
    entityPriorities: new Map(),
    entitiesKnown: new Set(),
    entitiesInUpdate: new Map(),
}));
// TODO(@darzu): BUG!! We have two versions of host, resource and component!
export const HostDef = EM.defineResource("host", () => true);
export const HostCompDef = EM.defineComponent("host", () => true);
export const AuthorityDef = EM.defineComponent("authority", () => ({
    pid: 0,
    seq: 0,
    updateSeq: 0,
}), (p, pid) => {
    if (pid !== undefined)
        p.pid = pid;
    return p;
});
export function claimAuthority(authority, pid, seq, updateSeq) {
    if ((authority.updateSeq <= updateSeq &&
        authority.seq <= seq &&
        authority.pid === pid) ||
        authority.seq < seq ||
        (authority.seq === seq && pid < authority.pid)) {
        authority.pid = pid;
        authority.seq = seq;
        authority.updateSeq = updateSeq;
        return true;
    }
    return false;
}
export const PeerNameDef = EM.defineResource("peerName", (name) => ({
    name: name || "",
}));
export const MeDef = EM.defineResource("me", (pid, host) => ({
    pid: pid || 1,
    host: host || false,
}));
export const InboxDef = EM.defineComponent("inbox", () => new Map());
export const OutboxDef = EM.defineComponent("outbox", () => []);
export function send(outbox, buffer) {
    outbox.push(buffer);
}
export const NetStatsDef = EM.defineResource("netStats", () => ({
    skewEstimate: {},
    pingEstimate: {},
}));
export const EventsFromNetworkDef = EM.defineResource("eventsFromNetwork", () => []);
export const EventsToNetworkDef = EM.defineResource("eventsToNetwork", () => []);
export const NetworkReadyDef = EM.defineResource("networkReady", () => true);
export const JoinDef = EM.defineResource("join", (address) => ({
    address,
    state: "start",
    lastSendTime: 0,
}));
// This component should be present on entities that want to participate in the
// prediction system
export const PredictDef = EM.defineComponent("predict", () => ({
    dt: 0,
}));
// Marker component for entities that have just been updated by the sync system
export const RemoteUpdatesDef = EM.defineComponent("remoteUpdates", () => true);
//# sourceMappingURL=components.js.map