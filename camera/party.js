import { EM } from "../ecs/entity-manager.js";
import { vec3 } from "../matrix/sprig-matrix.js";
export const PartyDef = EM.defineResource("party", () => ({
    pos: vec3.create(),
    dir: vec3.create(),
}));
EM.addLazyInit([], [PartyDef], () => {
    EM.addResource(PartyDef);
});
//# sourceMappingURL=party.js.map