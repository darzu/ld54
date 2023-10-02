export function createDisjointSet() {
    const res = {
        add,
        get,
        union,
    };
    const idToSet = new Map();
    const setToIds = new Map();
    return res;
    function add(id) {
        idToSet.set(id, id);
        setToIds.set(id, new Set().add(id));
    }
    function get(id) {
        throw "todo";
    }
    function union(a, b) {
        // TODO(@darzu): also handle if a and b r new
        throw "todo";
    }
}
//# sourceMappingURL=util-disjointset.js.map