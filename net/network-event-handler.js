import { EM } from "../ecs/entity-manager.js";
import { NetworkEventType, } from "./network-events.js";
import { PeerDef, InboxDef, OutboxDef, NetworkReadyDef, EventsFromNetworkDef, EventsToNetworkDef, } from "./components.js";
import { Phase } from "../ecs/sys-phase.js";
export function initNetStateEventSystems() {
    let _peerIDs = {};
    function handleNetworkEvents([], { eventsFromNetwork }) {
        while (eventsFromNetwork.length > 0) {
            const event = eventsFromNetwork.shift();
            switch (event.type) {
                case NetworkEventType.Ready:
                    console.log(`localhost:4321/?server=${event.address}&user=2`);
                    EM.addResource(NetworkReadyDef);
                    break;
                case NetworkEventType.NewConnection: {
                    console.log("new connection");
                    let { id } = EM.new();
                    let peer = EM.addComponent(id, PeerDef);
                    peer.address = event.address;
                    EM.addComponent(id, InboxDef);
                    EM.addComponent(id, OutboxDef);
                    _peerIDs[peer.address] = id;
                    break;
                }
                case NetworkEventType.MessageRecv: {
                    let id = _peerIDs[event.from];
                    let { inbox } = EM.findEntity(id, [InboxDef]);
                    let message = event.message;
                    if (!inbox.has(message.type))
                        inbox.set(message.type, []);
                    inbox.get(message.type).push(message.deserializer);
                }
            }
        }
    }
    EM.addSystem("handleNetworkEvents", Phase.NETWORK, null, [EventsFromNetworkDef], handleNetworkEvents);
}
export function initNetSendOutboxes() {
    function sendOutboxes(peers, { eventsToNetwork }) {
        for (let { peer: { address }, outbox, } of peers) {
            while (outbox.length > 0) {
                const message = outbox.shift();
                eventsToNetwork.push({
                    type: NetworkEventType.MessageSend,
                    to: address,
                    buf: message,
                });
            }
        }
    }
    EM.addSystem("sendOutboxes", Phase.NETWORK, [OutboxDef, PeerDef], [EventsToNetworkDef], sendOutboxes);
}
//# sourceMappingURL=network-event-handler.js.map