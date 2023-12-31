import { EM } from "../ecs/entity-manager.js";
export const DefaultLayer = 0;
let _nextLayer = 1;
export function DefineLayer() {
    if (_nextLayer >= 16)
        throw `Can't define another layer; already 16!`;
    return _nextLayer++;
}
// TODO(@darzu): ensure we support swapping colliders?
export const ColliderDef = EM.defineNonupdatableComponent("collider", (c) => {
    return (c ??
        {
            shape: "Empty",
            solid: false,
        });
});
const __COLLIDER_ASSERT = true;
//# sourceMappingURL=collider.js.map