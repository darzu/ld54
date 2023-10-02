import { EM } from "../ecs/entity-manager.js";
import { Serializer } from "../utils/serialize.js";
import { AuthorityDef, claimAuthority, PredictDef, RemoteUpdatesDef, } from "./components.js";
export var MessageType;
(function (MessageType) {
    // Join a game in progress
    MessageType[MessageType["Join"] = 0] = "Join";
    MessageType[MessageType["Rejoin"] = 1] = "Rejoin";
    MessageType[MessageType["JoinResponse"] = 2] = "JoinResponse";
    // Events
    MessageType[MessageType["Events"] = 3] = "Events";
    MessageType[MessageType["AckEvents"] = 4] = "AckEvents";
    MessageType[MessageType["EventRequests"] = 5] = "EventRequests";
    MessageType[MessageType["AckEventRequests"] = 6] = "AckEventRequests";
    // State update
    MessageType[MessageType["StateUpdate"] = 7] = "StateUpdate";
    MessageType[MessageType["StateUpdateResponse"] = 8] = "StateUpdateResponse";
    // Reserve unique object IDs
    MessageType[MessageType["ReserveIDs"] = 9] = "ReserveIDs";
    MessageType[MessageType["ReserveIDsResponse"] = 10] = "ReserveIDsResponse";
    // Estimate clock skew
    MessageType[MessageType["Ping"] = 11] = "Ping";
    MessageType[MessageType["Pong"] = 12] = "Pong";
})(MessageType || (MessageType = {}));
export var EntityUpdateType;
(function (EntityUpdateType) {
    EntityUpdateType[EntityUpdateType["Full"] = 0] = "Full";
    EntityUpdateType[EntityUpdateType["Dynamic"] = 1] = "Dynamic";
})(EntityUpdateType || (EntityUpdateType = {}));
export const MAX_MESSAGE_SIZE = 1024;
export function serializeEntity(ent, message, type, components) {
    message.writeUint8(type);
    message.writeUint32(ent.id);
    message.writeUint8(ent.authority.pid);
    message.writeUint32(ent.authority.seq);
    message.writeUint8(components.length);
    for (let componentId of components) {
        message.writeUint32(componentId);
        EM.serialize(ent.id, componentId, message);
    }
}
export function deserializeEntity(updateSeq, message, dt) {
    let type = message.readUint8();
    let id = message.readUint32();
    let authorityPid = message.readUint8();
    let authoritySeq = message.readUint32();
    let haveEnt = EM.hasEntity(id);
    if (!haveEnt && type === EntityUpdateType.Dynamic) {
        throw `Got non-full update for unknown entity ${id}`;
    }
    let authority;
    if (!haveEnt) {
        EM.registerEntity(id);
        // TODO(@darzu): dbg
        // console.log(`registering ${id}`);
        authority = EM.addComponent(id, AuthorityDef, authorityPid);
        authority.seq = authoritySeq;
    }
    else {
        authority = EM.findEntity(id, [AuthorityDef])?.authority;
    }
    // We want to set message.dummy if either:
    //
    // - There's no authority component. This means we have this entity but its
    //   authority got deleted, which means the entity is no more
    //
    // - There's an authority component but our authority claim fails, meaning
    //   this message is out of date
    if (!authority ||
        !claimAuthority(authority, authorityPid, authoritySeq, updateSeq)) {
        console.log("failed authority check");
        message.dummy = true;
    }
    let numComponents = message.readUint8();
    for (let i = 0; i < numComponents; i++) {
        let componentId = message.readUint32();
        EM.deserialize(id, componentId, message);
    }
    if (!message.dummy) {
        let predict = EM.findEntity(id, [PredictDef])?.predict;
        if (predict) {
            predict.dt += dt;
        }
        EM.ensureComponent(id, RemoteUpdatesDef);
    }
}
export function Ack(seq) {
    let message = new Serializer(8);
    message.writeUint8(MessageType.StateUpdateResponse);
    message.writeUint32(seq);
    return message;
}
//# sourceMappingURL=message.js.map