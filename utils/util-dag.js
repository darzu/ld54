// DAG solver
export function createDag() {
    const solver = {
        addRoot,
        addEdge,
        getWalk,
        version: 1,
    };
    const roots = new Set(); // top-level
    const edges = new Map(); // key depends on values
    let lastWalkVersion = -1;
    let lastWalk = [];
    return solver;
    function addRoot(r) {
        if (roots.has(r))
            return;
        roots.add(r);
        solver.version++;
    }
    function addEdge(a, b) {
        // a = dependant, b = dependee
        if (edges.has(a)) {
            let dependees = edges.get(a);
            if (dependees.has(b))
                return;
            dependees.add(b);
        }
        else {
            edges.set(a, new Set().add(b));
        }
        solver.version++;
    }
    function doTopologicalSort() {
        // TODO(@darzu): we might want a more stable sort, i recommend:
        //    determine longest depth from roots for each node
        //    sort within each depth-layer
        //    walk from farthest cohorts backward toward roots
        const walk = [];
        const want = new Set();
        const done = new Set();
        for (let r of roots)
            visit(r);
        return walk;
        // when visit returns, n will be done
        function visit(n) {
            if (done.has(n))
                return;
            if (want.has(n))
                throw "DAG cycle";
            want.add(n);
            for (let d of edges.get(n) ?? [])
                visit(d);
            done.add(n);
            walk.push(n);
            want.delete(n);
        }
    }
    function getWalk() {
        if (lastWalkVersion < solver.version) {
            lastWalk = doTopologicalSort();
            lastWalkVersion = solver.version;
        }
        return lastWalk;
    }
}
//# sourceMappingURL=util-dag.js.map