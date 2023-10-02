import { assert, enumAsList, enumNamesAsList, toMap } from "../utils/util.js";
export var Phase;
(function (Phase) {
    Phase[Phase["NETWORK"] = 0] = "NETWORK";
    Phase[Phase["PRE_GAME_WORLD"] = 1] = "PRE_GAME_WORLD";
    Phase[Phase["GAME_WORLD"] = 2] = "GAME_WORLD";
    Phase[Phase["POST_GAME_WORLD"] = 3] = "POST_GAME_WORLD";
    Phase[Phase["AUDIO"] = 4] = "AUDIO";
    Phase[Phase["PRE_READ_INPUT"] = 5] = "PRE_READ_INPUT";
    Phase[Phase["READ_INPUTS"] = 6] = "READ_INPUTS";
    Phase[Phase["PRE_GAME_PLAYERS"] = 7] = "PRE_GAME_PLAYERS";
    Phase[Phase["GAME_PLAYERS"] = 8] = "GAME_PLAYERS";
    Phase[Phase["POST_GAME_PLAYERS"] = 9] = "POST_GAME_PLAYERS";
    Phase[Phase["PRE_PHYSICS"] = 10] = "PRE_PHYSICS";
    Phase[Phase["PHYSICS_MOTION"] = 11] = "PHYSICS_MOTION";
    Phase[Phase["PHYSICS_FINISH_LOCAL"] = 12] = "PHYSICS_FINISH_LOCAL";
    Phase[Phase["PHYSICS_WORLD_FROM_LOCAL"] = 13] = "PHYSICS_WORLD_FROM_LOCAL";
    Phase[Phase["PHYSICS_CONTACT"] = 14] = "PHYSICS_CONTACT";
    Phase[Phase["PHYSICS_FINISH_WORLD"] = 15] = "PHYSICS_FINISH_WORLD";
    Phase[Phase["POST_PHYSICS"] = 16] = "POST_PHYSICS";
    Phase[Phase["PRE_RENDER"] = 17] = "PRE_RENDER";
    Phase[Phase["RENDER_WORLDFRAMES"] = 18] = "RENDER_WORLDFRAMES";
    Phase[Phase["RENDER_PRE_DRAW"] = 19] = "RENDER_PRE_DRAW";
    Phase[Phase["RENDER_DRAW"] = 20] = "RENDER_DRAW";
})(Phase || (Phase = {}));
export const PhaseFromName = (n) => Phase[n];
export const NameFromPhase = (v) => Phase[v];
export const PhaseNameList = enumNamesAsList(Phase);
export const PhaseValueList = enumAsList(Phase);
export const MetaPhases = [
    "NETWORK",
    "GAME_WORLD",
    "AUDIO",
    "INPUT",
    "GAME_PLAYERS",
    "PHYSICS",
    "RENDER",
]; // for debugging / stats
export const PhaseNameToMetaPhase = toMap(PhaseNameList, (n) => n, (n) => {
    for (let m of MetaPhases)
        if (n.includes(m))
            return m;
    assert(false, `Phase ${n} doesnt belong to a meta phase`);
});
//# sourceMappingURL=sys-phase.js.map