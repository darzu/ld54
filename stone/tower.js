export const StoneTowerDef = EM.defineNonupdatableComponent("stoneTower", (cannon, stone, fireRate = 1500, projectileSpeed = 0.2, firingRadius = Math.PI / 8) => ({
    stone,
    cannon: createRef(cannon),
    lastFired: 0,
    fireRate,
    projectileSpeed,
    firingRadius,
    alive: true,
}));
//# sourceMappingURL=tower.js.map