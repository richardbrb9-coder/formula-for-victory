// Formula for Victory: the track system. Every circuit is a data module (see circuits/): a centre line traced from
// OpenStreetMap, plus how wide the road is, where the run-off areas, kerbs, walls and fences go, and (for circuits with
// hills or a bridge) how high the road is. This file turns that data into
//   1. 'samples': a point every 2 m round the lap that the driving, the rivals, the camera and the map all use, and
//   2. the 3D road itself, cut into 200 m sections so a tablet only draws the parts in view.
// Nothing here assumes the track is flat or never crosses itself: cars find their place on the lap by searching near
// where they were a moment ago, and every sample carries its own height.
import * as THREE from './lib/three.module.min.js';
import * as SC from './scenery.js';
import { streakTexture, kerbTextures, steelTexture, blockTexture, wireTexture } from './trackdetail.js';

export const KERB_KS = 0.004;     // corners sharper than this get kerbs
export const KERB_W = 1.3;        // how wide a kerb is (metres)
const SPACING = 2;                // metres between samples
const CHUNK = 200;                // samples per section of road (400 m: fewer, longer pieces are quicker for a tablet to draw)

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// how far inside a stretch of track (from..to metres, which may wrap past the start line) the distance d is:
// 1 inside, fading to 0 over 'blend' metres either side
function zoneFactor(d, from, to, L, blend) {
    const len = ((to - from) % L + L) % L, rel = ((d - from) % L + L) % L;
    if (rel <= len) return 1;
    const gap = Math.min(L - rel, rel - len);
    return gap >= blend ? 0 : smooth(0, 1, 1 - gap / blend);
}

// =====================================================================
//  1. THE SAMPLES
// =====================================================================
export function buildTrackData(C) {
    const P = C.geo.pts, M = P.length / 2;
    // a smooth curve through the mapped points (Catmull-Rom), drawn finely, then cut into even 2 m steps
    const fine = [], SUB = 8;
    for (let i = 0; i < M; i++) {
        const g = k => { const j = ((i + k) % M + M) % M; return [P[j * 2], P[j * 2 + 1]]; };
        const [p0, p1, p2, p3] = [g(-1), g(0), g(1), g(2)];
        for (let u = 0; u < SUB; u++) {
            const t = u / SUB, t2 = t * t, t3 = t2 * t, out = [0, 0];
            for (const a of [0, 1]) out[a] = 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
            fine.push(out);
        }
    }
    const F = fine.length, cum = [0];
    for (let i = 0; i < F; i++) { const a = fine[i], b = fine[(i + 1) % F]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const trackLen = cum[F], N = Math.round(trackLen / SPACING), ds = trackLen / N;
    // the road's height round the lap (flat unless the circuit says otherwise): [[metres, height], ...] joined smoothly
    const E = C.elevation && C.elevation.length ? C.elevation.slice().sort((a, b) => a[0] - b[0]) : null;
    const heightAt = d => {
        if (!E) return 0;
        let k = E.findIndex(e => e[0] > d); if (k < 0) k = E.length;
        const a = E[(k - 1 + E.length) % E.length], b = E[k % E.length];
        const span = ((b[0] - a[0]) % trackLen + trackLen) % trackLen || trackLen, t = (((d - a[0]) % trackLen + trackLen) % trackLen) / span;
        return a[1] + (b[1] - a[1]) * (t * t * (3 - 2 * t));
    };
    const pts = []; let seg = 0;
    for (let i = 0; i < N; i++) {
        const d = i * ds; while (cum[seg + 1] < d) seg++;
        const a = fine[seg], b = fine[(seg + 1) % F], t = (d - cum[seg]) / ((cum[seg + 1] - cum[seg]) || 1);
        pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, heightAt(d), a[1] + (b[1] - a[1]) * t));
    }
    const samples = pts.map((p, i) => {
        const nx = pts[(i + 1) % N], pv = pts[(i - 1 + N) % N];
        const t = new THREE.Vector3(nx.x - pv.x, 0, nx.z - pv.z).normalize();
        return { p, t, n: new THREE.Vector3(t.z, 0, -t.x), heading: Math.atan2(-t.z, t.x), d: i * ds, slope: (nx.y - pv.y) / (2 * ds) };
    });
    // signed curvature (left turns positive), measured over about 16 m, then smoothed for the racing line
    const W = 4;
    samples.forEach((s, i) => { s.k = wrapAngle(samples[(i + W) % N].heading - samples[(i - W + N) % N].heading) / (2 * W * ds); });
    const k2 = samples.map((s, i) => { let sum = 0; for (let j = -6; j <= 6; j++) sum += samples[(i + j + N) % N].k; return sum / 13; });
    // road width, run-off and barriers at every sample
    const R0 = { w: 7, surface: 'grass', barrier: 'steel', fence: false, tyres: false, ...(C.runoff || {}) };
    samples.forEach((s, i) => {
        s.ks = k2[i];
        let w = C.width || 13;
        for (const [from, to, zw] of C.widths || []) { const f = zoneFactor(s.d, from, to, trackLen, 40); w += (zw - w) * f; }
        s.hw = w / 2;
        s.L = { ...R0 }; s.R = { ...R0 };
        for (const z of C.zones || []) {
            const f = zoneFactor(s.d, z.from, z.to, trackLen, z.blend || 30); if (f <= 0) continue;
            for (const side of z.side === 'B' ? ['L', 'R'] : [z.side]) {
                const o = s[side];
                if (z.w != null) o.w += (z.w - o.w) * f;
                if (z.surface && f > 0.02) o.surface = z.surface;
                if (f > 0.5) { if (z.barrier) o.barrier = z.barrier; if (z.fence != null) o.fence = z.fence; if (z.tyres != null) o.tyres = z.tyres; }
            }
        }
        s.wl = s.hw + s.L.w; s.wr = s.hw + s.R.w;        // how far each wall is from the middle of the road
        s.line = Math.sign(k2[i]) * Math.min(s.hw * 0.6, Math.abs(k2[i]) * 900);   // the racing line: towards the inside of each corner
    });
    // kerbs: on every corner, sloping down into the ground at each end
    const on = i => Math.abs(samples[(i % N + N) % N].ks) >= KERB_KS;
    samples.forEach((s, i) => { let r = 0; if (on(i)) { r = 1; if (!on(i - 1) || !on(i + 1)) r = 0; else if (!on(i - 2) || !on(i + 2)) r = 0.5; } s.kerb = r; });

    const fAt = d => ((d / trackLen * N) % N + N) % N;
    const T = {
        C, samples, N, trackLen, ds,
        sampleAt: d => samples[Math.floor(fAt(d)) % N],
        indexAt: d => Math.floor(fAt(d)) % N,
        lineAt(d) { const f = fAt(d), i = Math.floor(f) % N, t = f - Math.floor(f); return samples[i].line + (samples[(i + 1) % N].line - samples[i].line) * t; },
        // a smooth point along the track, 'extraOffset' metres to the left (+) or right (-) of the racing line (or of the
        // middle of the road when lineScale is 0)
        pathAt(d, extraOffset = 0, lineScale = 0.9) {
            const f = fAt(d), i = Math.floor(f) % N, t = f - Math.floor(f), a = samples[i], b = samples[(i + 1) % N];
            const nx = a.n.x + (b.n.x - a.n.x) * t, nz = a.n.z + (b.n.z - a.n.z) * t;
            const off = (a.line + (b.line - a.line) * t) * lineScale + extraOffset;
            return { x: a.p.x + (b.p.x - a.p.x) * t + nx * off, y: a.p.y + (b.p.y - a.p.y) * t, z: a.p.z + (b.p.z - a.p.z) * t + nz * off,
                     heading: a.heading + wrapAngle(b.heading - a.heading) * t };
        }
    };
    // a quick way to ask "how far is this spot from the track, and which part?" (used when placing scenery)
    const CELL = 120, grid = new Map(), key = (cx, cz) => cx * 100003 + cz;
    samples.forEach((s, i) => { if (i % 2) return; const k = key(Math.floor(s.p.x / CELL), Math.floor(s.p.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    T.near = (x, z) => {
        const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); let bd = Infinity, bi = -1;
        for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
            const list = grid.get(key(cx + ax, cz + az)); if (!list) continue;
            for (const i of list) { const p = samples[i].p, dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        }
        return bi < 0 ? { dist: 999, i: -1 } : { dist: Math.sqrt(bd), i: bi };
    };
    T.nearTrack = (x, z) => T.near(x, z).dist;
    const xs = samples.map(s => s.p.x), zs = samples.map(s => s.p.z);
    T.box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    return T;
}

// =====================================================================
//  2. THE ROAD IN 3D
// =====================================================================
// collects triangles for one mesh
class Geo {
    constructor(colours = 0) { this.pos = []; this.uv = []; this.idx = []; this.col = colours ? [] : null; this.cs = colours; }
    get count() { return this.pos.length / 3; }
    quadRow(prev, cur, n, flip) {   // join two rows of n points
        for (let q = 0; q < n - 1; q++) { const a = prev + q, b = cur + q; if (flip) this.idx.push(a, b, a + 1, a + 1, b, b + 1); else this.idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    mesh(mat, opts = {}) {
        if (!this.idx.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.cs));
        g.setIndex(this.idx); g.computeVertexNormals();
        return Object.assign(new THREE.Mesh(g, mat), opts);
    }
}
// Push a shape (points across: [metres out to the left of the middle of the road, height above it]) along part of the track.
// prof(s, i) gives the points at each sample (or null for a gap). Faces point up when the points run from left to right.
function sweep(T, geo, i0, i1, step, prof, uv, flip = false) {
    let prev = -1, n = 0;
    for (let i = i0; i <= i1; i += step) {
        const s = T.samples[i % T.N], pr = prof(s, i);
        if (!pr) { prev = -1; continue; }
        const base = geo.count; n = pr.length;
        for (let q = 0; q < n; q++) { const [off, h] = pr[q]; geo.pos.push(s.p.x + s.n.x * off, s.p.y + h, s.p.z + s.n.z * off); const [u, v] = uv(q, i * T.ds, off, h); geo.uv.push(u, v); }
        if (prev >= 0) geo.quadRow(prev, base, n, flip);
        prev = base;
    }
}

export function buildTrackMeshes(T, GRID) {
    const { samples, N, trackLen, ds, C } = T, group = new THREE.Group(), lod = [];
    // --- materials (shared by every section) ---
    const roadMat = SC.photoMat('asphalt_02', 1, 1, 0xb8bcc4, 0.85);
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    const { map: kerbMap, nor: kerbNor } = kerbTextures();
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbMap, normalMap: kerbNor, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.62 });
    const gravelMat = SC.photoMat('coast_sand_01', 1, 1, 0xe6d8b4);
    const apronMat = SC.photoMat('asphalt_02', 1, 1, 0xd2d5da, 0.9);        // asphalt run-off: paler than the road
    const marksMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, userData: { roadMarks: true }, depthWrite: false, alphaMap: streakTexture(), side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const steelMat = new THREE.MeshStandardMaterial({ map: steelTexture(), metalness: 0.7, roughness: 0.38, side: THREE.DoubleSide });
    const blockMat = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.8 });
    const wireMat = new THREE.MeshStandardMaterial({ map: wireTexture(), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
    const tyreMat = new THREE.MeshStandardMaterial({ map: tyreWallTexture(), roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.6, roughness: 0.5 });
    const fpostMat = new THREE.MeshStandardMaterial({ color: 0x5d636b, metalness: 0.6, roughness: 0.45 });
    const postGeo = new THREE.BoxGeometry(0.1, 1.08, 0.14), fpostGeo = new THREE.CylinderGeometry(0.045, 0.05, 3.8, 5).translate(0, 1.9, 0);

    // how hard drivers brake at each point (for the rubber marks): a corner coming up, but not here yet
    const ks = i => Math.abs(samples[((i % N) + N) % N].ks);
    const brake = new Float32Array(N), exitK = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        let ahead = 0; for (let k = 8; k <= 40; k += 4) ahead = Math.max(ahead, ks(i + k));
        brake[i] = smooth(0.006, 0.02, ahead) * (1 - smooth(0.004, 0.014, ks(i)));
        let behind = 0; for (let k = 2; k <= 12; k += 2) behind = Math.max(behind, ks(i - k));
        exitK[i] = smooth(0.008, 0.02, behind) * (1 - smooth(0.006, 0.016, ks(i)));
    }
    const kerbProf = [[-0.03, 0.025], [0.06, 0.05], [0.25, 0.062], [1.1, 0.062], [KERB_W, 0.04]];
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();

    for (let i0 = 0; i0 < N; i0 += CHUNK) {
        const i1 = Math.min(N, i0 + CHUNK), mid = samples[Math.floor((i0 + i1) / 2) % N].p;
        // (a section's far-away details are switched off by how far the NEAREST part of it is, measured every 40 m)
        const along = []; for (let i = i0; i <= i1; i += 20) along.push(samples[i % N].p);
        const add = (mesh, far) => { if (!mesh) return; group.add(mesh); if (far) lod.push({ o: mesh, c: mid, pts: along, far }); return mesh; };
        // the road, with a white line along each edge
        const road = new Geo();
        sweep(T, road, i0, i1, 1, s => [[s.hw, 0.02], [-s.hw, 0.02]], (q, d, off) => [off / 6, d / 6]);
        add(road.mesh(roadMat, { receiveShadow: true }));
        const paint = new Geo();
        sweep(T, paint, i0, i1, 1, s => [[s.hw - 0.15, 0.03], [s.hw - 0.45, 0.03]], q => [q, 0]);
        sweep(T, paint, i0, i1, 1, s => [[-s.hw + 0.45, 0.03], [-s.hw + 0.15, 0.03]], q => [q, 0]);
        add(paint.mesh(paintMat, { receiveShadow: true }), 700);
        // rubber on the racing line, darker where the cars brake and where they put the power down
        const marks = new Geo(4), cols = 8;
        for (let i = i0; i <= i1; i++) {
            const s = samples[i % N], line = s.line * 0.9, base = marks.count;
            for (let j = 0; j <= cols; j++) {
                const lat = -s.hw + 2 * s.hw * j / cols, dl = lat - line, g = w => Math.exp(-(dl * dl) / (w * w));
                let a = 0.3 * g(1.5) + 0.55 * brake[i % N] * g(1.9) + 0.3 * exitK[i % N] * g(1.7);
                a *= smooth(s.hw, s.hw - 0.6, Math.abs(lat));
                marks.pos.push(s.p.x + s.n.x * lat, s.p.y + 0.024, s.p.z + s.n.z * lat); marks.col.push(0.02, 0.02, 0.025, Math.min(0.75, a)); marks.uv.push(lat / 2.6, i * ds / 9);
            }
            if (i > i0) marks.quadRow(base - cols - 1, base, cols + 1, false);
        }
        add(marks.mesh(marksMat, { renderOrder: 1, name: 'roadMarks' }), 420);
        // kerbs on both sides of the corners
        const kerb = new Geo();
        for (const side of [1, -1]) sweep(T, kerb, i0, i1, 1, s => Math.abs(s.ks) >= KERB_KS ? kerbProf.map(([off, h]) => [side * (s.hw + off), 0.02 + (h - 0.02) * s.kerb]) : null,
            (q, d) => [q / (kerbProf.length - 1), d / 3], side > 0);
        add(kerb.mesh(kerbMat, { receiveShadow: true, name: 'kerbs' }), 900);
        // run-off areas: gravel traps and asphalt aprons between the road and the wall (grass needs nothing: it's the ground)
        for (const [name, mat] of [['gravel', gravelMat], ['asphalt', apronMat]]) {
            const g = new Geo();
            sweep(T, g, i0, i1, 1, s => s.L.surface === name ? [[s.wl, 0], [s.hw, 0]] : null, (q, d, off) => [off / 5, d / 5]);
            sweep(T, g, i0, i1, 1, s => s.R.surface === name ? [[-s.hw, 0], [-s.wr, 0]] : null, (q, d, off) => [off / 5, d / 5]);
            add(g.mesh(mat, { receiveShadow: true }));
        }
        // barriers along both walls: steel rails, or concrete blocks, with tyres in front and a catch fence behind where asked
        const steel = new Geo(), block = new Geo(), wire = new Geo(), tyres = new Geo(), posts = [], fposts = [];
        const rail = (y, sg) => [[sg * 0.05, y], [sg * 0.13, y + 0.125], [sg * 0.05, y + 0.25]];
        for (const [side, sg] of [['L', 1], ['R', -1]]) {
            const wall = s => sg * (side === 'L' ? s.wl : s.wr), o = s => s[side];
            // (profiles are written out from the wall line; "-sg" is towards the track)
            for (const y of [0.42, 0.78]) sweep(T, steel, i0, i1, 2, s => o(s).barrier === 'steel' ? rail(y, -sg).map(([off, h]) => [wall(s) + off, h]) : null, (q, d) => [d / 4, q / 2], sg < 0);
            sweep(T, block, i0, i1, 2, s => o(s).barrier === 'concrete' ? [[-0.32, 0], [-0.14, 0.95], [-0.1, 1.05], [0.12, 1.05], [0.2, 0]].map(([off, h]) => [wall(s) + sg * off, h]) : null,
                (q, d) => [d / 4, [0, 0.88, 0.98, 1, 0.1][q]], sg > 0);
            sweep(T, tyres, i0, i1, 2, s => o(s).tyres ? [[-0.85, 0], [-0.85, 0.82], [-0.18, 0.82]].map(([off, h]) => [wall(s) + sg * off, h]) : null, (q, d) => [d / 2.2, [0, 0.8, 1][q]], sg > 0);
            sweep(T, wire, i0, i1, 2, s => o(s).fence ? [[0.45, 0.2], [0.45, 3.4], [0.1, 3.75]].map(([off, h]) => [wall(s) + sg * off, h]) : null, (q, d, off, h) => [d / 0.3, h / 0.3], sg > 0);
            for (let i = i0; i < i1; i += 2) {
                const s = samples[i % N];
                if (o(s).barrier === 'steel') posts.push([s.p.x + s.n.x * wall(s), s.p.y + 0.54, s.p.z + s.n.z * wall(s), s.heading]);
                if (o(s).fence && i % 4 === 0) fposts.push([s.p.x + s.n.x * (wall(s) + sg * 0.48), s.p.y, s.p.z + s.n.z * (wall(s) + sg * 0.48), 0]);
            }
        }
        add(steel.mesh(steelMat, { receiveShadow: true, userData: { seeThrough: true } }), 900);
        add(block.mesh(blockMat, { castShadow: true, receiveShadow: true }));
        add(tyres.mesh(tyreMat, { castShadow: true, receiveShadow: true }), 900);
        add(wire.mesh(wireMat, { userData: { seeThrough: true } }), 500);
        for (const [list, geo, mat, far] of [[posts, postGeo, postMat, 220], [fposts, fpostGeo, fpostMat, 320]]) {
            if (!list.length) continue;
            const im = new THREE.InstancedMesh(geo, mat, list.length);
            list.forEach(([x, y, z, h], k) => { e4.set(0, h, 0); q4.setFromEuler(e4); m4.compose(v3.set(x, y, z), q4, one); im.setMatrixAt(k, m4); });
            im.castShadow = true; im.userData.seeThrough = true; im.raycast = () => {}; add(im, far);
        }
    }

    // --- the start: grid boxes, the chequered line and the gantry with its five lights ---
    {
        const g = new Geo();
        const quad = (d0, d1, l0, l1) => {
            const a = T.pathAt(d0, l0, 0), b = T.pathAt(d0, l1, 0), c = T.pathAt(d1, l0, 0), e = T.pathAt(d1, l1, 0), k = g.count;
            g.pos.push(a.x, a.y + 0.036, a.z, b.x, b.y + 0.036, b.z, c.x, c.y + 0.036, c.z, e.x, e.y + 0.036, e.z); g.uv.push(0, 0, 1, 0, 0, 1, 1, 1); g.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        };
        for (const [back, side] of GRID) {
            const front = trackLen + back + 2.9;
            quad(front - 0.25, front, side - 1.25, side + 1.25);                 // the bar across the front
            quad(front - 1.6, front - 0.25, side - 1.25, side - 1.05);           // the legs
            quad(front - 1.6, front - 0.25, side + 1.05, side + 1.25);
        }
        group.add(g.mesh(new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })));
    }
    const s0 = samples[0], W0 = s0.hw * 2;
    const cc = document.createElement('canvas'); cc.width = 64; cc.height = 8; const cx = cc.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cx.fillRect(i * 4, j * 4, 4, 4); }
    const ct = new THREE.CanvasTexture(cc); ct.magFilter = THREE.NearestFilter;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W0, 2), new THREE.MeshBasicMaterial({ map: ct }));
    line.rotation.x = -Math.PI / 2; line.rotation.z = s0.heading + Math.PI / 2; line.position.set(s0.p.x, s0.p.y + 0.04, s0.p.z); group.add(line);
    const gantry = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x2a2f39, metalness: 0.6, roughness: 0.4 });
    const reachL = s0.wl + 0.8, reachR = s0.wr + 0.8;
    for (const z of [reachL, -reachR]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.7, 0.6), dark); post.position.set(0, 3.85, z); post.castShadow = true; gantry.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, reachL + reachR + 0.6), dark); beam.position.set(0, 7, (reachL - reachR) / 2); beam.castShadow = true; gantry.add(beam);
    const lightMats = [];
    for (let i = 0; i < 5; i++) {
        const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 0 }); lightMats.push(m);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), m); l.position.set(-0.55, 7, (i - 2) * 1.3); gantry.add(l);
    }
    gantry.position.set(s0.p.x, s0.p.y, s0.p.z); gantry.rotation.y = s0.heading; group.add(gantry);

    // far-away details are switched off (rubber marks, posts, fences): checked a few times a second
    let tick = 0;
    const update = cam => {
        if (tick++ % 12) return;
        for (const l of lod) {
            let d2 = Infinity;
            for (const p of l.pts || [l.c]) { const dx = p.x - cam.x, dz = p.z - cam.z; d2 = Math.min(d2, dx * dx + dz * dz); }
            l.o.visible = d2 < l.far * l.far;
        }
    };
    return { group, lightMats, update, lod };
}
// a wall of old tyres bolted together, with a white belt round the middle (one picture, repeated along the wall)
function tyreWallTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#0c0d0f'; x.fillRect(0, 0, 128, 64);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
        const u = k * 32 + (row % 2 ? 16 : 0), v = 4 + row * 20;
        for (const du of [0, -128]) { x.fillStyle = '#1b1c20'; x.fillRect(u + du + 1, v, 30, 17); x.fillStyle = '#2b2d33'; x.fillRect(u + du + 3, v + 2, 26, 3); x.fillStyle = '#060607'; x.fillRect(u + du + 3, v + 12, 26, 3); }
    }
    x.fillStyle = 'rgba(240,240,236,0.9)'; x.fillRect(0, 27, 128, 7);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
