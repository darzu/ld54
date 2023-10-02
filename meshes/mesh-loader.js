import { EM } from "../ecs/entity-manager.js";
import { vec3, findAnyTmpVec } from "../matrix/sprig-matrix.js";
import { importObj, isParseError } from "./import-obj.js";
import { getAABBFromMesh, mergeMeshes, normalizeMesh, transformMesh, validateMesh, } from "./mesh.js";
import { getCenterFromAABB, getHalfsizeFromAABB, } from "../physics/aabb.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert, isString, toRecord } from "../utils/util.js";
import { getBytes, getText } from "../fetch/webget.js";
import { farthestPointInDir } from "../utils/utils-3d.js";
import { importGltf } from "./import-gltf.js";
import { DBG_CHECK_FOR_TMPS_IN_XY } from "../flags.js";
// TODO: load these via streaming
// TODO(@darzu): it's really bad that all these assets are loaded for each game
// TODO(@darzu): perhaps the way to handle individualized asset loading is to
//   have a concept of "AssetSet"s that a game can define and await. So u can
//   either await each asset individually or u can declare an asset set custom
//   to ur game and then await that whole set (and probably stick it in a resource)
//   and once the whole thing is loaded u can then access the assets synchronously.
//   This is basically how it works now except that all assets are in one big set.
// TODO(@darzu): plan:
//    [ ] rename AssetsDef -> EverySingleAssetDef, implying shame
//    [ ] need a cache for all allMeshes. So individual loads or overlapping sets dont duplicate work
//    [ ] restructure it so each mesh has its path and transforms together
const DEFAULT_ASSET_PATH = "assets/";
const BACKUP_ASSET_PATH = "https://sprig.land/assets/";
function isMultiMeshDesc(desc) {
    return desc.multi;
}
// TODO(@darzu): PERF. "ocean" and "ship_fangs" are expensive to load and aren't needed in all games.
// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const blackoutColor = (m) => {
    m.colors.map((c) => vec3.zero(c));
    return m;
};
export const XY = createXylemRegistry();
globalThis.XY = XY; // for debugging only
function createXylemRegistry() {
    const loadedMeshes = new Map();
    const loadingMeshes = new Map();
    async function cachedLoadMeshDesc(desc, renderer) {
        let result = loadingMeshes.get(desc.name);
        if (result)
            return result;
        result = new Promise(async (resolve) => {
            if (!renderer) {
                // TODO(@darzu): track these? Better to load stuff through mesh sets?
                renderer = (await EM.whenResources(RendererDef)).renderer.renderer;
            }
            const done = await internalLoadMeshDesc(desc, renderer);
            loadedMeshes.set(desc.name, done);
            resolve(done);
        });
        loadingMeshes.set(desc.name, result);
        return result;
    }
    function registerMesh(desc) {
        const def = EM.defineResource(`mesh_${desc.name}`, (gm) => gm);
        EM.addLazyInit([RendererDef], [def], async ({ renderer }) => {
            const gm = await cachedLoadMeshDesc(desc, renderer.renderer);
            EM.addResource(def, gm);
        });
        if (isMultiMeshDesc(desc)) {
            let reg = {
                desc,
                def: def,
                gameMeshes: () => cachedLoadMeshDesc(desc),
                gameMeshesNow: () => loadedMeshes.get(desc.name),
            };
            return reg;
        }
        else {
            let reg = {
                desc,
                def: def,
                gameMesh: () => cachedLoadMeshDesc(desc),
                gameMeshNow: () => loadedMeshes.get(desc.name),
            };
            return reg;
        }
    }
    async function loadMeshSet(meshes, renderer) {
        if (DBG_CHECK_FOR_TMPS_IN_XY) {
            let found = findAnyTmpVec(meshes);
            if (found) {
                console.error(`Found temp vec(s) in mesh registrations! Path:\nmeshes${found}`);
                console.log("meshes:");
                console.dir(meshes);
            }
        }
        let promises = meshes.map((m) => {
            return cachedLoadMeshDesc(m.desc, renderer);
        });
        const done = await Promise.all(promises);
        const result = toRecord(meshes, (m) => m.desc.name, (_, i) => done[i]);
        return result;
    }
    function defineMeshSetResource(name, ...meshes) {
        const def = EM.defineResource(name, (mr) => mr);
        let initReg = EM.addLazyInit([RendererDef], [def], async ({ renderer }) => {
            const before = performance.now();
            const gameMeshes = await loadMeshSet(meshes, renderer.renderer);
            EM.addResource(def, gameMeshes);
            console.log(`loading mesh set '${def.name}' took ${(performance.now() - before).toFixed(2)}ms`);
        });
        // TODO(@darzu): DBG
        if (def.name === "allMeshes") {
            console.log(`allMeshes init: #${initReg.id}`);
        }
        return def;
    }
    return {
        registerMesh,
        defineMeshSetResource,
    };
}
async function internalLoadMeshDesc(desc, renderer) {
    if (isMultiMeshDesc(desc)) {
        assert(isString(desc.data), `TODO: support local multi-meshes`);
        const raw = await loadMeshSetInternal(desc.data);
        const processed = raw.map((m) => processMesh(desc, m));
        const game = processed.map((m) => gameMeshFromMesh(m, renderer));
        return game;
    }
    else {
        let raw;
        if (isString(desc.data)) {
            raw = await loadMeshInternal(desc.data);
        }
        else {
            raw = desc.data();
        }
        const processed = processMesh(desc, raw);
        const game = gameMeshFromMesh(processed, renderer);
        return game;
    }
}
function processMesh(desc, m) {
    if (desc.transform)
        m = transformMesh(m, desc.transform);
    if (desc.modify)
        m = desc.modify(m);
    if (!m.dbgName)
        m.dbgName = desc.name;
    return m;
}
async function loadTxtInternal(relPath) {
    // download
    // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
    let txt;
    try {
        txt = await getText(DEFAULT_ASSET_PATH + relPath);
    }
    catch (_) {
        console.warn(`Asset path ${DEFAULT_ASSET_PATH + relPath} failed; trying ${BACKUP_ASSET_PATH + relPath}`);
        txt = await getText(BACKUP_ASSET_PATH + relPath);
    }
    return txt;
}
async function loadBytesInternal(relPath) {
    // download
    // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
    let bytes;
    try {
        bytes = await getBytes(DEFAULT_ASSET_PATH + relPath);
    }
    catch (_) {
        console.warn(`Asset path ${DEFAULT_ASSET_PATH + relPath} failed; trying ${BACKUP_ASSET_PATH + relPath}`);
        bytes = await getBytes(BACKUP_ASSET_PATH + relPath);
    }
    return bytes;
}
async function loadMeshInternal(relPath) {
    const res = await loadMeshSetInternal(relPath);
    return mergeMeshes(...res);
}
async function loadMeshSetInternal(relPath) {
    // download
    if (relPath.endsWith(".glb")) {
        let bytes = await loadBytesInternal(relPath);
        const res = importGltf(bytes);
        // console.dir(res);
        assert(!!res && !isParseError(res), `unable to parse asset set (${relPath}):\n${res}`);
        return [res];
    }
    let txt = await loadTxtInternal(relPath);
    // parse
    // console.log(txt);
    const opt = importObj(txt);
    // console.log("importMultiObj");
    // console.dir(opt);
    assert(!!opt && !isParseError(opt), `unable to parse asset set (${relPath}):\n${opt}`);
    return opt;
}
export function gameMeshFromMesh(rawMesh, renderer, reserve) {
    validateMesh(rawMesh);
    const mesh = normalizeMesh(rawMesh);
    const aabb = getAABBFromMesh(mesh);
    const center = getCenterFromAABB(aabb);
    const halfsize = getHalfsizeFromAABB(aabb, vec3.create());
    const proto = renderer.stdPool.addMesh(mesh, reserve);
    const uniqueVerts = getUniqueVerts(mesh);
    const support = (d) => farthestPointInDir(uniqueVerts, d);
    const aabbCollider = (solid) => ({
        shape: "AABB",
        solid,
        aabb,
    });
    return {
        mesh,
        aabb,
        center,
        halfsize,
        proto,
        uniqueVerts,
        support,
        mkAabbCollider: aabbCollider,
    };
}
function getUniqueVerts(mesh) {
    const res = [];
    const seen = new Set();
    // TODO(@darzu): might we want to do approx equals?
    for (let v1 of mesh.pos) {
        const key = `${v1[0]}${v1[1]}${v1[2]}`;
        if (!seen.has(key)) {
            res.push(v1);
            seen.add(key);
        }
    }
    return res;
}
//# sourceMappingURL=mesh-loader.js.map