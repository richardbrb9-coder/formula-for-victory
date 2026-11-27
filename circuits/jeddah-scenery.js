// Formula for Victory: what stands around the Jeddah circuit, which is always raced at night. All made in code (plus the
// shared grandstand and pit building parts): the sea all down one side, a lagoon with a marina in the middle of the
// southern loop, pale sand under the floodlights, palm trees, sand-coloured modern buildings with glowing windows along
// the land side, and the city's giant fountain: a tall, glowing jet of water out at sea, on the skyline.
// EVERY NAME ON EVERY BOARD IS MADE UP. No real company or building is named or copied.
// The night is made the same cheap way as Las Vegas (see lasvegas-scenery.js): no extra lights. The pools of light
// under the floodlights are one see-through layer over the road; windows and lamps simply glow. The sand is bright
// beside the road and fades into the dark a few metres out (painted into its corners' colours, not worked out).
// Everything is baked into a few big pieces, cut up by area so a tablet only draws what is in view.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';
import { Geo } from '../track.js';
import { seaFogColour } from '../backdrop.js';
import { Quads, wrapD, inZone, buildStands, onStand, boards, ribbon, podiumStand, shareMaterials } from './common.js';

const PAVE = 3.2, VERGE = 12;                                           // the pavement behind the wall, and the lit sand beyond it
// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [[5950, -1, 70, 10, 3], [6025, -1, 70, 10, 3], [6100, -1, 70, 10, 3], [11, -1, 70, 10, 3],     // the pit straight, opposite the pits
    [600, -1, 70, 7, 3], [1800, -1, 70, 7, 3], [1875, -1, 70, 7, 3], [3500, -1, 60, 7, 3], [5500, 1, 60, 7, 3.5]];
const BRAKING = [215, 720, 4005, 5245];                                 // the big stops: the first chicane, turn four, turn twenty-two, the last hairpin
const PITS = { from: 5990, to: 110, front: 21, back: 5975, sections: 5 };   // the pit building, on the left of the pit straight (its five blocks are set out from the start line below)
const LAGOON = { west: [4440, 5180], east: [5420, 6090] };              // the lagoon lies inside the southern loop, between these two stretches of road
const FOUNTAIN = { x: -170, z: 2160, h: 290, w: 96 };                   // the giant fountain, out at sea beyond the last hairpin
const WATER = -0.85, LAND = -0.12;
const LAMP_EVERY = 44;

export function jeddahScenery(ctx) {
    const { T, group } = ctx, { samples, N, trackLen: L } = T, dens = ctx.quality.density;
    const at = d => T.sampleAt(d), wallOf = (s, side) => side > 0 ? s.wl : s.wr, R = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
    const spot = (d, side, out) => { const p = T.pathAt(d, side * out, 0); return { x: p.x, y: p.y, z: p.z, heading: p.heading + (side > 0 ? Math.PI : 0) }; };
    const beside = (x, z) => { const nr = T.near(x, z); if (nr.i < 0) return null; const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z; return { s, lat, side: lat > 0 ? 1 : -1, clear: Math.abs(lat) - (lat > 0 ? s.wl : s.wr), dist: nr.dist }; };
    const noUv = () => [0, 0, 0, 0];
    const props = new Quads(true), glow = new Quads(true);              // (props: plain-coloured things, lit like everything else; glow: things that shine)

    // =================================================================
    //  THE SHAPE OF THE LAND: the sea to the west, and the lagoon inside the southern loop
    // =================================================================
    // the shore of the sea: for every 12 m going south, a little way west of the most westerly piece of road there
    const Z0 = Math.floor((T.box.minZ - 160) / 12) * 12, ZN = Math.ceil((T.box.maxZ + 160 - Z0) / 12) + 1, shore = new Float32Array(ZN).fill(1e9);
    for (let i = 0; i < N; i += 2) {
        const s = samples[i], x = s.p.x - Math.max(s.wl, s.wr) - 25, k = Math.round((s.p.z - Z0) / 12);
        for (let j = Math.max(0, k - 5); j <= Math.min(ZN - 1, k + 5); j++) shore[j] = Math.min(shore[j], x + Math.abs(j - k) * 2.2);
    }
    for (let j = 1; j < ZN; j++) if (shore[j] > 1e8) shore[j] = shore[j - 1];
    for (let j = ZN - 2; j >= 0; j--) if (shore[j] > 1e8) shore[j] = shore[j + 1];
    for (let pass = 0; pass < 3; pass++) { const c = shore.slice(); for (let j = 1; j < ZN - 1; j++) shore[j] = Math.min(c[j], (c[j - 1] + c[j] * 2 + c[j + 1]) / 4); }   // (rounded off, but never nearer the road)
    // ... and the same for the land side: the most easterly piece of road for every 12 m going south
    const inland = new Float32Array(ZN).fill(-1e9);
    for (let i = 0; i < N; i += 2) { const s = samples[i], k = Math.round((s.p.z - Z0) / 12); for (let j = Math.max(0, k - 5); j <= Math.min(ZN - 1, k + 5); j++) inland[j] = Math.max(inland[j], s.p.x); }
    for (let j = 1; j < ZN; j++) if (inland[j] < -1e8) inland[j] = inland[j - 1];
    for (let j = ZN - 2; j >= 0; j--) if (inland[j] < -1e8) inland[j] = inland[j + 1];
    const inlandX = z => inland[Math.max(0, Math.min(ZN - 1, Math.round((z - Z0) / 12)))];
    const coastX = z => { const f = Math.max(0, Math.min(ZN - 1.001, (z - Z0) / 12)), j = Math.floor(f); return shore[j] + (shore[j + 1] - shore[j]) * (f - j); };
    // the lagoon's edge: set back from the road down its west side, and behind the pits and the paddock on its east side
    const lagoon = [];
    {
        const east = d => { const k = wrapD(d - 5870, L); return 34 + (86 - 34) * Math.max(0, Math.min(1, (k + 40) / 80)); };   // (further back behind the paddock)
        for (let d = LAGOON.west[0]; d <= LAGOON.west[1]; d += 20) { const s = at(d), p = T.pathAt(d, s.wl + 22, 0); lagoon.push([p.x, p.z]); }
        for (let d = LAGOON.east[0]; d <= LAGOON.east[1]; d += 20) { const s = at(d), p = T.pathAt(d, s.wl + east(d), 0); lagoon.push([p.x, p.z]); }
    }
    // (the lagoon is then kept as its west and east edges on each of the same 12 m lines as the shore, so that the land
    // can be laid in strips between them; 'lagoon' becomes the ring of points round its edge, 12 m apart)
    const lagL = new Float32Array(ZN).fill(NaN), lagR = new Float32Array(ZN).fill(NaN); let ja = -1, jb = -1;
    for (let j = 0; j < ZN; j++) {
        const z = Z0 + j * 12; let lo = Infinity, hi = -Infinity;
        for (let i = 0, k = lagoon.length - 1; i < lagoon.length; k = i++) { const [xi, zi] = lagoon[i], [xk, zk] = lagoon[k]; if ((zi > z) !== (zk > z)) { const x = (xk - xi) * (z - zi) / (zk - zi) + xi; lo = Math.min(lo, x); hi = Math.max(hi, x); } }
        if (hi - lo > 10) { lagL[j] = lo; lagR[j] = hi; if (ja < 0) ja = j; jb = j; }
    }
    lagoon.length = 0;
    for (let j = ja; j <= jb; j++) lagoon.push([lagL[j], Z0 + j * 12]);
    for (let j = jb; j >= ja; j--) lagoon.push([lagR[j], Z0 + j * 12]);
    const inLagoon = (x, z) => { const f = (z - Z0) / 12, j = Math.floor(f); if (j < ja || j >= jb) return false; const t = f - j; return x > lagL[j] + (lagL[j + 1] - lagL[j]) * t && x < lagR[j] + (lagR[j + 1] - lagR[j]) * t; };
    const isWater = (x, z, pad = 0) => x < coastX(z) + pad || inLagoon(x, z) || (pad > 0 && [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([a, b]) => inLagoon(x + a, z + b)));
    // how far the nearest OTHER piece of road is on the driver's left (the two halves of the lap run close together)
    const gapL = new Float32Array(N).fill(400);
    for (let i = 0; i < N; i += 2) {
        const s = samples[i]; let best = 400;
        for (let j = 0; j < N; j += 2) {
            if (Math.abs(wrapD((j - i) * T.ds, L)) < 160) continue;
            const q = samples[j].p, dx = q.x - s.p.x, dz = q.z - s.p.z; if (Math.abs(dx) > best || Math.abs(dz) > best) continue;
            if (dx * s.n.x + dz * s.n.z > 0) best = Math.min(best, Math.hypot(dx, dz));
        }
        gapL[i] = gapL[(i + 1) % N] = best;
    }

    // --- the land (dark beyond the lights), with the lagoon cut out of it, and the water under everything ---
    let seaFog = { value: new THREE.Color(0x141c2c) };
    {
        const b = T.box, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, FAR = 5200;
        // the land is laid in strips 12 m wide from the shore inland, each cut into pieces about 110 m long and broken where
        // the lagoon is. (One big flat shape with a hole in it made long thin slivers, which flickered through the road
        // when seen from high above in replays.)
        const X1 = cx + FAR, G = []; for (let x = b.minX - 60; x < b.maxX + 520; x += 110) G.push(x); G.push(b.maxX + 1100);
        const pos = [], idx = [];
        const quad = (x0a, x1a, za, x0b, x1b, zb) => { const k = pos.length / 3; pos.push(x0a, LAND, za, x1a, LAND, za, x0b, LAND, zb, x1b, LAND, zb); idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); };
        const strip = (la, ra, za, lb, rb, zb) => {   // from (la..ra) on one line to (lb..rb) on the next
            const mid = G.filter(x => x > Math.max(la, lb) + 8 && x < Math.min(ra, rb) - 8), A = [la, ...mid, ra], B = [lb, ...mid, rb];
            for (let k = 0; k < A.length - 1; k++) quad(A[k], A[k + 1], za, B[k], B[k + 1], zb);
        };
        for (let j = 0; j < ZN - 1; j++) {
            const za = Z0 + j * 12, zb = za + 12;
            if (j >= ja && j < jb) { strip(shore[j], lagL[j], za, shore[j + 1], lagL[j + 1], zb); strip(lagR[j], X1, za, lagR[j + 1], X1, zb); }
            else strip(shore[j], X1, za, shore[j + 1], X1, zb);
        }
        quad(shore[0], X1, cz - FAR, shore[0], X1, Z0); quad(shore[ZN - 1], X1, Z0 + (ZN - 1) * 12, shore[ZN - 1], X1, cz + FAR);   // and on to the north and the south
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.95 })); land.receiveShadow = true; land.userData.always = true; land.userData.noProbe = true; group.add(land);
        // the quay walls: down from the land to the water, along the shore and round the lagoon
        const stone = [0.34, 0.31, 0.27], wall = (ring, closed) => { for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; props.add([p[0], WATER - 0.3, p[1]], [q[0], WATER - 0.3, q[1]], [p[0], LAND, p[1]], [q[0], LAND, q[1]], undefined, stone); } };
        wall(Array.from(shore, (x, j) => [x, Z0 + j * 12]), false); wall(lagoon, true);
        // the water: dark and glassy, fading into its own colour far out (not the glow of the sky), as at Monaco
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(FAR * 2, FAR * 2), new THREE.MeshStandardMaterial({ color: 0x0c2230, roughness: 0.22, metalness: 0.35, map: SC.canvasTex(256, 256, (x, w, h) => {
            x.fillStyle = '#9fb4c0'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 900; i++) { const u = Math.random() * w, v = Math.random() * h, l = 6 + Math.random() * 22; x.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(20,40,60,0.22)'; x.lineWidth = 1; x.beginPath(); x.moveTo(u, v); x.lineTo(u + l, v + (Math.random() - 0.5) * 2); x.stroke(); }
        }) }));
        sea.material.map.repeat.set(FAR / 9, FAR / 9);
        sea.rotation.x = -Math.PI / 2; sea.position.set(cx, WATER, cz); sea.userData.always = true; sea.userData.noProbe = true; group.add(sea);
        sea.material.onBeforeCompile = sh => {
            sh.uniforms.seaFog = seaFog;
            sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 seaFog;')
                .replace('#include <fog_fragment>', '#ifdef USE_FOG\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, seaFog, smoothstep( fogNear, fogFar, vFogDepth ) );\n#endif');
        };
    }

    // --- the pavement behind each wall and the lit sand beyond it, all the way round ---
    {
        const sand = SC.photoMat('coast_sand_01', 1, 1, 0xffffff); sand.vertexColors = true;
        const kMax = i => { let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(samples[(i + j + N) % N].k)); return k; };
        const paved = [0.5, 0.48, 0.45], lit = [0.92, 0.84, 0.7], dark = [0.04, 0.034, 0.028];
        // (how far out each strip may reach: not over the middle of the gap to the other half of the lap, and little on the inside of a tight corner)
        const reach = (s, i, side) => {
            const wall = wallOf(s, side); let out = wall + PAVE + VERGE;
            if (side > 0) out = Math.min(out, gapL[i] / 2 - 0.2);
            if (Math.sign(s.ks) === side) out = Math.min(out, Math.max(wall + 0.6, 0.82 / Math.max(kMax(i), 1e-4)));
            return Math.max(out, wall + 0.6);
        };
        for (let i0 = 0; i0 < N; i0 += 400) {
            const g = new Geo(3), i1 = Math.min(N, i0 + 400);
            for (const side of [1, -1]) {
                let prev = -1;
                for (let i = i0; i <= i1; i += 2) {
                    const s = samples[i % N], wall = wallOf(s, side), out = reach(s, i % N, side), pv = Math.min(out, wall + PAVE), base = g.count, fade = Math.min(1, (out - pv) / VERGE);
                    const end = lit.map((v, k) => v + (dark[k] - v) * fade);
                    // across: the pavement, its kerb, then the sand running out into the dark
                    for (const [off, h, col] of [[wall + 0.2, 0.13, paved], [pv, 0.13, paved], [pv, LAND + 0.05, lit], [out, LAND + 0.03, end]]) {
                        const x = s.p.x + s.n.x * off * side, z = s.p.z + s.n.z * off * side; g.pos.push(x, s.p.y + h, z); g.uv.push(x / 5, z / 5); g.col.push(...col);
                    }
                    if (prev >= 0) g.quadRow(prev, base, 4, side > 0);
                    prev = base;
                }
            }
            const m = g.mesh(sand); m.receiveShadow = true; m.userData.far = 560; m.userData.noProbe = true; group.add(m);
        }
    }

    // =================================================================
    //  THE FLOODLIGHTS: a pole every 44 m, on alternate sides, and the pool of light under each one
    // =================================================================
    const lampAt = [];   // [metres round the lap, side]
    for (let d = 20, k = 0; d < L - 20; d += LAMP_EVERY, k++) lampAt.push([d, k % 2 ? 1 : -1]);
    {
        const steel = [0.2, 0.21, 0.24], white = [3.2, 3.0, 2.6];
        for (const [d, side] of lampAt) {
            const s = at(d), out = wallOf(s, side) + 1.3, p = T.pathAt(d, side * out, 0), q = T.pathAt(d, side * (out - 3.6), 0), H = 12.5;
            props.box(p.x, p.z, p.heading, 0.32, 0.32, 0, H, noUv, steel, false);
            // the arm reaching out over the road, and the lamp at its end (two glowing faces: underneath and towards the road)
            const a = [p.x, H - 0.2, p.z], b = [q.x, H + 0.5, q.z], w = 0.16, tx = s.t.x * w, tz = s.t.z * w;
            props.add([a[0] - tx, a[1], a[2] - tz], [a[0] + tx, a[1], a[2] + tz], [b[0] - tx, b[1], b[2] - tz], [b[0] + tx, b[1], b[2] + tz], undefined, steel);
            const lx = s.t.x * 1.5, lz = s.t.z * 1.5, nx = s.n.x * side * 0.55, nz = s.n.z * side * 0.55, y = H + 0.42;
            glow.add([q.x - lx - nx, y, q.z - lz - nz], [q.x + lx - nx, y, q.z + lz - nz], [q.x - lx + nx, y + 0.12, q.z - lz + nz], [q.x + lx + nx, y + 0.12, q.z + lz + nz], undefined, white);
            glow.add([q.x - lx - nx, y, q.z - lz - nz], [q.x + lx - nx, y, q.z + lz - nz], [q.x - lx - nx, y + 0.5, q.z - lz - nz], [q.x + lx - nx, y + 0.5, q.z + lz - nz], undefined, white);
        }
        // the pools of light: one see-through layer over the road and its edges, brightest under each lamp
        const pools = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        pools.userData.lightPools = true;
        const COLS = 6, nearLamps = d => { const k = Math.round((d - 20) / LAMP_EVERY); return [k - 1, k, k + 1].map(j => lampAt[(j + lampAt.length) % lampAt.length]); };
        for (let i0 = 0; i0 < N; i0 += 200) {
            const g = new Geo(4), i1 = Math.min(N, i0 + 200);
            for (let i = i0; i <= i1; i += 2) {
                const s = samples[i % N], base = g.count, lamps = nearLamps(s.d);
                for (let j = 0; j <= COLS; j++) {
                    const lat = -s.wr + (s.wl + s.wr) * j / COLS; let a = 0.02;
                    for (const [ld, side] of lamps) { const dd = wrapD(s.d - ld, L), c = side * s.hw * 0.4; a += 0.52 * Math.exp(-(dd * dd) / 170) * (0.45 + 0.55 * Math.exp(-((lat - c) ** 2) / (s.hw * s.hw * 1.3))); }
                    g.pos.push(s.p.x + s.n.x * lat, s.p.y + 0.05, s.p.z + s.n.z * lat); g.col.push(0.25, 0.235, 0.2, Math.min(0.6, a)); g.uv.push(0, 0);
                }
                if (i > i0) g.quadRow(base - COLS - 1, base, COLS + 1, false);
            }
            const m = g.mesh(pools, { renderOrder: 2 }); m.userData.far = 460; m.raycast = () => {}; group.add(m);
        }
    }

    // =================================================================
    //  BUILDINGS: every wall is drawn from one picture (and one more for the light its windows give out): eight
    //  kinds of wall side by side across it, each eight floors high and repeated up the building
    // =================================================================
    const SANDSTONE = 0, CREAM = 1, GLASS = 2, LATTICE = 3, ARCADE = 4, PLAIN = 5, FINS = 6, OFFICE = 7, KINDS = 8, FLOORS = 8;
    const [wallPic, lightPic] = paintWalls(KINDS, FLOORS);
    const facade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, map: wallPic, emissiveMap: lightPic, emissive: 0xffffff, emissiveIntensity: 1, side: THREE.DoubleSide });
    const chunks = new Map(), chunkAt = (x, z) => { const key = Math.floor(x / 520) + ':' + Math.floor(z / 520); if (!chunks.has(key)) chunks.set(key, new Quads(true)); return chunks.get(key); };
    // one block: a box standing on the ground, 'floors' high. Each wall is cut into strips one picture wide, and is
    // brightest near the street (lit from below by the lamps), darker towards the roof.
    function block(b) {
        const q = chunkAt(b.x, b.z), fh = b.fh || 3.4, c = Math.cos(b.heading), s = Math.sin(b.heading), P = (lx, lz, y) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c];
        const h = b.w / 2, e = b.dp / 2, y0 = b.y0 || 0, y1 = y0 + b.floors * fh, corners = [[-h, -e], [h, -e], [h, e], [-h, e]], tint = b.tint || [1, 1, 1], G = 0.012, dim = Math.max(0.3, 1 - b.floors * 0.045);
        for (let f = 0; f < 4; f++) {
            const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4], len = f % 2 ? b.dp : b.w, n = Math.max(1, Math.round(len / (b.tile || 13))), shade = f % 2 ? 0.8 : 1;
            for (let k = 0; k < n; k++) {
                const t0 = k / n, t1 = (k + 1) / n, flip = Math.random() < 0.5, v0 = Math.floor(Math.random() * FLOORS) / FLOORS, v1 = v0 + b.floors / FLOORS;
                const u0 = (b.kind + (flip ? 1 - G : G)) / KINDS, u1 = (b.kind + (flip ? G : 1 - G)) / KINDS, lo = tint.map(v => v * shade), hi = lo.map(v => v * dim);
                q.add(P(ax + (bx - ax) * t0, az + (bz - az) * t0, y0), P(ax + (bx - ax) * t1, az + (bz - az) * t1, y0), P(ax + (bx - ax) * t0, az + (bz - az) * t0, y1), P(ax + (bx - ax) * t1, az + (bz - az) * t1, y1), [u0, v0, u1, v0, u0, v1, u1, v1], [lo, lo, hi, hi]);
            }
        }
        const u = (b.kind + 0.004) / KINDS; q.add(P(-h, -e, y1), P(h, -e, y1), P(-h, e, y1), P(h, e, y1), [u, 0.5, u, 0.5, u, 0.5, u, 0.5], [0.3, 0.28, 0.25]);   // the roof (a plain part of the picture)
        return { P, top: y1 };
    }
    // a line of warm light round a tower's top, and a red lamp on its roof for aeroplanes
    function crown(b, top, colour) {
        const c = Math.cos(b.heading), s = Math.sin(b.heading), P = (lx, lz, y) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c], h = b.w / 2 + 0.15, e = b.dp / 2 + 0.15;
        const cs = [[-h, -e], [h, -e], [h, e], [-h, e]]; for (let f = 0; f < 4; f++) { const [ax, az] = cs[f], [bx, bz] = cs[(f + 1) % 4]; glow.add(P(ax, az, top - 1.1), P(bx, bz, top - 1.1), P(ax, az, top), P(bx, bz, top), undefined, colour); }
        glow.box(b.x, b.z, b.heading, 0.9, 0.9, top + 2.2, top + 3.1, noUv, [2.6, 0.25, 0.2]); props.box(b.x, b.z, b.heading, 0.3, 0.3, top, top + 2.2, noUv, [0.2, 0.2, 0.22], false);
    }
    // which ground is already taken (4 m squares), so nothing is built on top of anything else
    const taken = new Set(), tk = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
    const footprint = (x, z, heading, w, dp, pad = 0) => { const c = Math.cos(heading), s = Math.sin(heading), pts = []; for (let lx = -w / 2 - pad; lx <= w / 2 + pad + 0.01; lx += Math.min(3.5, (w + pad * 2) / 2)) for (let lz = -dp / 2 - pad; lz <= dp / 2 + pad + 0.01; lz += Math.min(3.5, (dp + pad * 2) / 2)) pts.push([x + lx * c + lz * s, z - lx * s + lz * c]); return pts; };
    const mark = pts => pts.forEach(([x, z]) => taken.add(tk(x, z)));
    const isFree = (pts, minClear) => pts.every(([x, z]) => { if (taken.has(tk(x, z)) || isWater(x, z, 6)) return false; const b = beside(x, z); return !b || b.clear >= minClear; });
    // the land side: to the right of the road on the way north (and round the outside of the last hairpin)
    const landSide = b => b.side < 0 && (b.s.d > 5180 || b.s.d < 2140);

    // --- things with a place of their own go down first ---
    buildStands(ctx, STANDS, 0x1F7A5A, 900);
    for (const [d, side, len, rows, gap] of STANDS) { const s = at(d), deep = rows * 0.9 + 6, p = spot(d, side, wallOf(s, side) + gap + deep / 2); mark(footprint(p.x, p.z, p.heading, len + 6, deep, 2)); }
    // the pits: the pit lane (from the map, as far as it runs beside the pit straight), the pit building and the podium
    {
        const whole = ctx.circuit.geo.extras.pitlane[0], lane = [];
        for (let i = 0; i < whole.length; i += 2) {
            const b = beside(whole[i], whole[i + 1]), on = b && b.side > 0 && b.clear > 1.6 && (b.s.d > 5600 || b.s.d < 170);
            if (on) lane.push(whole[i], whole[i + 1]); else if (lane.length) break;
        }
        const laneMat = SC.photoMat('asphalt_02', 1, 1, 0xb4b8be, 0.9); laneMat.side = THREE.DoubleSide;
        if (lane.length >= 4) { const lm = ribbon(lane, 8, laneMat, () => 0, 0.012); lm.userData.always = true; group.add(lm); }
        for (let i = 0; i < lane.length; i += 2) mark(footprint(lane[i], lane[i + 1], 0, 12, 12));
        const blocks = [];
        for (const k of [-126, -76, -26, 24, 74]) { const d = k < 0 ? L + k : k, b = SC.pitBuilding(PITS.sections); SC.placeBeside(ctx, b, d, PITS.front); b.userData.far = 950; b.userData.noProbe = true; blocks.push(b); const p = spot(d, 1, PITS.front + 7); mark(footprint(p.x, p.z, p.heading, 54, 20, 3)); }
        shareMaterials(blocks); group.add(SC.mergeStatic(blocks));   // (the five blocks are then drawn as one building)
        const pod = podiumStand('JEDDAH', ['#0B6B3A', '#f4f4f0', '#0B6B3A']);
        SC.placeBeside(ctx, pod, -9, PITS.front); group.add(SC.mergeStatic([pod]));
        // the paddock behind: pale asphalt, and the teams' trucks
        const g = new Geo(), ia = T.indexAt(PITS.back), n = Math.round(300 / T.ds);
        for (let i = ia, prev = -1; i <= ia + n; i += 4) {
            const s = samples[i % N], base = g.count;
            for (const off of [PITS.front + 52, s.wl + 0.2]) { const x = s.p.x + s.n.x * off, z = s.p.z + s.n.z * off; g.pos.push(x, -0.03, z); g.uv.push(off / 6, i * T.ds / 6); }
            if (prev >= 0) g.quadRow(prev, base, 2, false); prev = base;
        }
        const am = g.mesh(SC.photoMat('asphalt_02', 1, 1, 0x8f9298, 0.9)); am.receiveShadow = true; am.userData.always = true; group.add(am);
        const cols = [[0.95, 0.95, 0.95], [0.12, 0.23, 0.54], [0.88, 0.1, 0.1], [0.16, 0.18, 0.22], [1, 0.7, 0], [0, 0.66, 0.42]];
        for (let d = PITS.back + 10; d < PITS.back + 280; d += R(12, 17)) { const big = Math.random() < 0.6, p = spot(d, 1, PITS.front + 14.3 + (big ? 20 : 14) + R(-1, 1)); props.box(p.x, p.z, p.heading + (big ? Math.PI / 2 : 0), big ? 16 : 7, big ? 3 : 9, 0, big ? 4.1 : 3.2, noUv, pick(cols)); }
        for (let d = PITS.back; d < PITS.back + 300; d += 8) { const p = spot(d, 1, PITS.front + 30); mark(footprint(p.x, p.z, p.heading, 10, 50, 0)); }
    }

    // --- along the land side of the road: hotels and flats in the colours of the desert, a few of them tall ---
    const GOLD = [[2.0, 1.5, 0.7], [1.9, 1.7, 1.2], [1.2, 1.7, 1.8]];
    const TINTS = [[1, 1, 1], [1, 0.94, 0.84], [0.92, 0.9, 0.86], [1, 0.9, 0.78]];
    for (let d = 5390 + R(0, 12); d < L + 2130;) {
        const w = R(26, 54), dp = R(18, 30), mid = d + w / 2, s = at(mid);
        if (Math.abs(s.ks) > 0.012 || Math.abs(at(d).ks) > 0.012 || Math.abs(at(d + w).ks) > 0.012) { d += 14; continue; }      // (not round the corners: the walls of a long block would cut across the road)
        const tall = Math.random() < 0.22;                                                                                    // (a tall one stands further back, clear of the helicopter camera in replays)
        const out = Math.max(wallOf(s, -1), wallOf(at(d), -1), wallOf(at(d + w), -1)) + PAVE + R(3, 8) + (tall ? 13 : 0) + dp / 2, p = spot(mid, -1, out), pts = footprint(p.x, p.z, p.heading, w, dp);
        if (onStand(STANDS, L, mid % L, -1, out - dp / 2 - wallOf(s, -1)) || !isFree(pts, PAVE + 0.6)) { d += 9; continue; }
        mark(footprint(p.x, p.z, p.heading, w, dp, 2));
        const floors = tall ? Math.round(R(14, 28)) : Math.round(R(2, 9)), kind = floors <= 3 ? pick([ARCADE, ARCADE, PLAIN]) : tall ? pick([GLASS, FINS, CREAM, LATTICE, OFFICE]) : pick([SANDSTONE, SANDSTONE, CREAM, LATTICE, PLAIN]);
        const b = { ...p, w, dp, floors, kind, tint: pick(TINTS) }, { top } = block(b);
        if (tall) crown(b, top, pick(GOLD));
        d += w + R(4, 14);
    }
    // --- the city behind: blocks scattered over the plain inland, a few of them tall ---
    {
        const step = 64 / Math.sqrt(dens / 0.75), b = T.box;
        for (let x = b.minX; x < b.maxX + 380; x += step) for (let z = b.minZ - 260; z < b.maxZ + 300; z += step) {
            const px = x + R(0, step - 20), pz = z + R(0, step - 20), nr = beside(px, pz);
            if (nr ? (!landSide(nr) || nr.clear < 34) : px < inlandX(pz) + 60) continue;   // (only on the land side, and not far beyond the lights)
            const tall = Math.random() < 0.15, w = R(22, 44), dp = R(18, 32), heading = Math.round(R(0, 1)) * Math.PI / 2 + R(-0.06, 0.06) + 0.33, pts = footprint(px, pz, heading, w, dp);
            if (!isFree(pts, 12)) continue;
            mark(footprint(px, pz, heading, w, dp, 3));
            const floors = tall ? Math.round(R(16, 34)) : Math.round(R(2, 10)), blockAt = { x: px, z: pz, heading, w, dp, floors, kind: floors <= 3 ? pick([PLAIN, ARCADE, SANDSTONE]) : pick([SANDSTONE, CREAM, LATTICE, GLASS, FINS, OFFICE, PLAIN]), tint: pick(TINTS) };
            const { top } = block(blockAt); if (tall && Math.random() < 0.7) crown(blockAt, top, pick(GOLD));
        }
    }
    for (const q of chunks.values()) { if (q.empty) continue; const m = q.mesh(facade); m.userData.far = 1150; m.userData.noProbe = true; group.add(m); }

    // =================================================================
    //  PALM TREES: along the sea front, round the lagoon, behind the pits and in the sand between the two halves of the lap
    // =================================================================
    {
        const trunk = [0.36, 0.28, 0.2], fronds = [[0.2, 0.36, 0.16], [0.16, 0.3, 0.14], [0.24, 0.38, 0.15]];
        const palm = (x, z, h) => {
            const lean = R(0, 6.283), lx = Math.cos(lean) * h * 0.06, lz = Math.sin(lean) * h * 0.06, tx = x + lx, tz = z + lz;
            for (const [a, b2] of [[[x, 0, z], [tx, h, tz]]]) for (const [wx, wz] of [[0.22, 0], [0, 0.22]]) props.add([a[0] - wx, LAND, a[2] - wz], [a[0] + wx, LAND, a[2] + wz], [b2[0] - wx * 0.7, h, b2[2] - wz * 0.7], [b2[0] + wx * 0.7, h, b2[2] + wz * 0.7], undefined, trunk);
            const n = 8, col = pick(fronds);
            for (let k = 0; k < n; k++) { const a = k / n * 6.283 + R(-0.25, 0.25), len = R(3.0, 4.2), dx = Math.cos(a), dz = Math.sin(a), wx = -dz * 0.62, wz = dx * 0.62, up = R(0.5, 1.1);
                const m1 = [tx + dx * len * 0.55, h + up, tz + dz * len * 0.55];
                props.add([tx - wx * 0.5, h, tz - wz * 0.5], [tx + wx * 0.5, h, tz + wz * 0.5], [m1[0] - wx, m1[1], m1[2] - wz], [m1[0] + wx, m1[1], m1[2] + wz], undefined, col);
                props.add([m1[0] - wx, m1[1], m1[2] - wz], [m1[0] + wx, m1[1], m1[2] + wz], [tx + dx * len, h - 0.9, tz + dz * len], [tx + dx * len, h - 0.9, tz + dz * len], undefined, col.map(v => v * 0.8)); }
            glow.box(x + 0.7, z + 0.5, 0, 0.3, 0.3, LAND, 0.22, noUv, [1.7, 1.3, 0.7]);   // a little lamp in the sand, shining up the trunk
        };
        const free = (x, z) => !taken.has(tk(x, z)) && !isWater(x, z, 2);
        // the sea front: a row along the promenade, all the way down the coast
        for (let d = 2420; d < 5130; d += 19) { const s = at(d); if (onStand(STANDS, L, d, -1, 0)) continue; const p = T.pathAt(d, -(s.wr + PAVE + 2.2), 0); if (free(p.x, p.z)) palm(p.x, p.z, R(8, 11)); }
        // the land side of the pit straight and the way north, between the pavement and the buildings
        for (let d = 5400; d < L + 2040; d += 31) { const s = at(d); if (onStand(STANDS, L, d % L, -1, 0) || Math.abs(s.ks) > 0.01) continue; const p = T.pathAt(d, -(s.wr + PAVE - 1), 0); if (free(p.x, p.z)) palm(p.x, p.z, R(7, 10)); }
        // the sand between the two halves of the lap, wherever there is room
        for (let d = 300; d < 4420; d += 26) { const i = T.indexAt(d), s = samples[i]; if (gapL[i] < 46 || d > 2060 && d < 2420) continue; const p = T.pathAt(d, Math.min(gapL[i] / 2, s.wl + PAVE + R(4, 9)), 0); if (free(p.x, p.z)) palm(p.x, p.z, R(7, 10)); }
        for (let k = 0; k < 26; k++) { const d = R(2090, 2390), s = at(d), p = T.pathAt(d, s.wl + R(14, 60), 0), b = beside(p.x, p.z); if (b && b.clear > 9 && free(p.x, p.z)) palm(p.x, p.z, R(7, 11)); }   // (a grove inside the banked turn)
        // round the lagoon
        for (let i = 0; i < lagoon.length; i++) { const [x, z] = lagoon[i], [x2, z2] = lagoon[(i + 1) % lagoon.length], len = Math.hypot(x2 - x, z2 - z) || 1, ox = (z2 - z) / len * 3.2, oz = -(x2 - x) / len * 3.2;
            for (const sg of [1, -1]) { const px = x + ox * sg, pz = z + oz * sg; if (!inLagoon(px, pz) && free(px, pz) && i % 2 === 0) { const b = beside(px, pz); if (!b || b.clear > PAVE + 2) palm(px, pz, R(7, 10)); } } }
        for (let d = PITS.back + 20; d < PITS.back + 280; d += 26) { const p = spot(d, 1, PITS.front + 16); palm(p.x, p.z, R(7, 9)); }
    }

    // =================================================================
    //  THE WATER'S EDGE: little lamps along the quays, pontoons and boats in the lagoon, and a few boats out at sea
    // =================================================================
    {
        const warm = [1.8, 1.35, 0.7];
        const lamp = (x, z) => { props.box(x, z, 0, 0.16, 0.16, LAND, 0.75, noUv, [0.2, 0.2, 0.22], false); glow.box(x, z, 0, 0.34, 0.34, 0.75, 1.0, noUv, warm); };
        for (let i = 0; i < lagoon.length; i++) { const [x, z] = lagoon[i], [x2, z2] = lagoon[(i + 1) % lagoon.length], n = Math.max(1, Math.round(Math.hypot(x2 - x, z2 - z) / 10)), len = Math.hypot(x2 - x, z2 - z) || 1;
            for (let k = 0; k < n; k++) { const t = k / n; let px = x + (x2 - x) * t, pz = z + (z2 - z) * t; const ox = (z2 - z) / len * 0.6, oz = -(x2 - x) / len * 0.6; if (inLagoon(px + ox, pz + oz)) { px -= ox; pz -= oz; } else { px += ox; pz += oz; } lamp(px, pz); } }
        for (let j = 0; j < ZN; j++) { const z = Z0 + j * 12; if (z > T.box.minZ - 40 && z < T.box.maxZ + 60) lamp(shore[j] + 0.7, z); }

        // one boat, built in its own measurements [along (bow +), up, across] and baked into the one piece all the boats share
        const boats = new Quads(true), white = [0.62, 0.62, 0.6], shade = [0.4, 0.4, 0.4], navy = [0.07, 0.1, 0.18], teak = [0.4, 0.28, 0.16], windows = [1.9, 1.5, 0.85];
        const boat = (x, z, heading, len, sail = false) => {
            const c = Math.cos(heading), s = Math.sin(heading), P = ([a, y, b]) => [x + a * c + b * s, WATER + y, z - a * s + b * c], q = (a, b, e, f, col) => boats.add(P(a), P(b), P(e), P(f), undefined, col);
            const bm = len * 0.15, dk = len * 0.085 + 0.45, hull = Math.random() < 0.25 ? navy : white;
            // (each station: how far along, half-width, how high the deck is there)
            const st = [[-len / 2, bm * 0.86, dk], [-len * 0.1, bm, dk], [len * 0.24, bm * 0.8, dk + len * 0.012], [len / 2, 0.05, dk + len * 0.035]];
            for (let i = 0; i < st.length - 1; i++) { const [a0, w0, h0] = st[i], [a1, w1, h1] = st[i + 1];
                for (const sg of [1, -1]) q([a0, 0, sg * w0 * 0.78], [a1, 0, sg * w1 * 0.78], [a0, h0, sg * w0], [a1, h1, sg * w1], sg > 0 ? hull : hull.map(v => v * 0.8));
                q([a0, h0, -w0], [a0, h0, w0], [a1, h1, -w1], [a1, h1, w1], i === 0 ? teak : shade); }
            q([st[0][0], 0, -st[0][1] * 0.78], [st[0][0], 0, st[0][1] * 0.78], [st[0][0], dk, -st[0][1]], [st[0][0], dk, st[0][1]], hull.map(v => v * 0.7));   // the stern
            const box = (a0, a1, w, y0, y1, col) => boats.box(x + (a0 + a1) / 2 * c, z - (a0 + a1) / 2 * s, heading, a1 - a0, w * 2, WATER + y0, WATER + y1, noUv, col);
            if (sail) {   // a sailing boat: a low cabin, a tall mast with a lamp at its top, the sail stowed along the boom
                box(-len * 0.12, len * 0.16, bm * 0.5, dk, dk + 0.55, white); box(len * 0.05, len * 0.05 + 0.16, 0.08, dk, dk + len * 1.15, [0.5, 0.5, 0.52]); box(-len * 0.3, len * 0.05, 0.14, dk + 1.3, dk + 1.6, [0.14, 0.2, 0.34]);
                glow.box(x + len * 0.05 * c, z - len * 0.05 * s, 0, 0.3, 0.3, WATER + dk + len * 1.15, WATER + dk + len * 1.15 + 0.3, noUv, [2.2, 2.2, 2.0]);
            } else {      // a motor yacht: a cabin with a band of lit windows, and a smaller deck on top
                const a0 = -len * 0.2, a1 = len * 0.2, w = bm * 0.66, y0 = dk, y1 = dk + len * 0.075 + 0.5;
                box(a0, a1, w, y0, y1, white);
                for (const sg of [1, -1]) glow.add(P([a0 + 0.3, y0 + (y1 - y0) * 0.42, sg * (w + 0.03)]), P([a1 - 0.3, y0 + (y1 - y0) * 0.42, sg * (w + 0.03)]), P([a0 + 0.3, y1 - 0.14, sg * (w + 0.03)]), P([a1 - 0.3, y1 - 0.14, sg * (w + 0.03)]), undefined, windows);
                glow.add(P([a1 + 0.03, y0 + (y1 - y0) * 0.42, -w + 0.2]), P([a1 + 0.03, y0 + (y1 - y0) * 0.42, w - 0.2]), P([a1 + 0.03, y1 - 0.14, -w + 0.2]), P([a1 + 0.03, y1 - 0.14, w - 0.2]), undefined, windows);
                if (len > 13) { box(a0 + len * 0.02, a1 - len * 0.1, w * 0.72, y1, y1 + len * 0.05 + 0.4, white); box(a0, a1 - len * 0.04, w * 0.95, y1 + len * 0.05 + 0.4, y1 + len * 0.05 + 0.52, shade); }
                glow.add(P([-len / 2 - 0.03, dk * 0.25, -bm * 0.5]), P([-len / 2 - 0.03, dk * 0.25, bm * 0.5]), P([-len / 2 - 0.03, dk * 0.45, -bm * 0.5]), P([-len / 2 - 0.03, dk * 0.45, bm * 0.5]), undefined, [0.5, 1.4, 1.9]);   // blue light under the swim deck
            }
        };
        // the marina: pontoons reaching out from the lagoon's east side (behind the grandstand), boats moored both sides
        const deck = [0.42, 0.36, 0.28];
        for (const d of [5470, 5560, 5650, 5740]) {
            const s = at(d), a = T.pathAt(d, s.wl + 34, 0), dirx = s.n.x, dirz = s.n.z, len = 50, hd = Math.atan2(-dirz, dirx);
            if (!inLagoon(a.x + dirx * (len + 8), a.z + dirz * (len + 8)) || !inLagoon(a.x + dirx * 3, a.z + dirz * 3)) continue;
            boats.box(a.x + dirx * len / 2, a.z + dirz * len / 2, hd, len, 2.4, WATER, WATER + 0.55, noUv, deck);
            for (let o = 7; o < len - 3; o += 7.5) {
                for (const sg of [1, -1]) { if (Math.random() < 0.18) continue; const bl = R(9, 16), off = 1.2 + 0.6 + bl / 2;
                    boat(a.x + dirx * o + s.t.x * sg * off, a.z + dirz * o + s.t.z * sg * off, s.heading + (sg > 0 ? 0 : Math.PI), bl, Math.random() < 0.22); }
                lamp(a.x + dirx * o, a.z + dirz * o);
            }
        }
        // a few big ones at anchor in the middle of the lagoon, and out at sea off the sea front
        let n = 0; for (let tries = 0; tries < 200 && n < 4; tries++) { const d = R(4560, 5100), s = at(d), p = T.pathAt(d, s.wl + R(60, 120), 0); if ([0, 14, -14].every(o => inLagoon(p.x + o, p.z) && inLagoon(p.x, p.z + o) && !taken.has(tk(p.x + o, p.z)))) { boat(p.x, p.z, 0.9 + R(-0.3, 0.3), R(20, 30)); mark(footprint(p.x, p.z, 0, 44, 44)); n++; } }
        for (const d of [2700, 3150, 3600, 4050, 4500, 4900]) { const s = at(d), p = T.pathAt(d, -(s.wr + R(110, 190)), 0); if (p.x < coastX(p.z) - 40) boat(p.x, p.z, 0.9 + R(-0.3, 0.3), R(18, 34), Math.random() < 0.3); }
        const m = boats.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide })); m.userData.always = true; m.userData.noProbe = true; group.add(m);
    }
    { const m = props.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })); m.castShadow = false; m.receiveShadow = true; m.userData.always = true; m.userData.noProbe = true; group.add(m); }
    { const m = glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.userData.always = true; m.userData.noProbe = true; group.add(m); }

    // =================================================================
    //  THE FOUNTAIN: one tall jet of water out at sea, lit from below. A single upright picture that always turns to face
    //  you: its shape is one small picture, and the water streaming up it is another, sliding upwards.
    // =================================================================
    let jet = null, jetT = 0;
    {
        const shape = SC.canvasTex(128, 512, (x, w, h) => {
            x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
            const band = (cx, half, y, a) => { const g = x.createLinearGradient(cx - half, 0, cx + half, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - half, y, half * 2, 1.5); };
            x.globalCompositeOperation = 'lighter';
            for (let y = 0; y < h; y++) {
                const t = 1 - y / h;                                    // 0 at the sea, 1 at the top
                band(w / 2 + t * t * 5, 4.5 + t * 9, y, (0.95 - t * 0.35) * Math.min(1, (1 - t) * 14));                       // the jet itself: thin and bright at the foot, wider and softer towards the top
                if (t > 0.22) band(w / 2 + 8 + (1 - t) * 26, 10 + (1 - t) * 30, y, 0.2 * Math.sin(Math.min(1, (t - 0.22) / 0.7) * Math.PI) ** 0.7);   // the spray drifting down on the wind
                if (t < 0.06) band(w / 2, 26, y, 0.5 * (1 - t / 0.06));                                                      // and the mist where it lands
            }
        }, false);
        const stream = SC.canvasTex(64, 256, (x, w, h) => {
            x.fillStyle = '#b9c6d2'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 260; i++) { const u = Math.random() * w, v = Math.random() * h, l = 14 + Math.random() * 46; x.fillStyle = Math.random() < 0.6 ? 'rgba(255,255,255,0.5)' : 'rgba(80,100,130,0.45)'; x.fillRect(u, v, 1 + Math.random() * 2.5, l); if (v + l > h) x.fillRect(u, v - h, 2, l); }
        });
        stream.repeat.set(1, 2.2);
        const g = new THREE.PlaneGeometry(FOUNTAIN.w, FOUNTAIN.h).translate(0, FOUNTAIN.h / 2, 0);
        jet = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: stream, alphaMap: shape, color: new THREE.Color(2.5, 2.65, 2.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        jet.position.set(FOUNTAIN.x, WATER, FOUNTAIN.z); jet.frustumCulled = false; jet.userData.always = true; jet.userData.noProbe = true; jet.raycast = () => {}; group.add(jet);
    }

    // --- advertising and braking boards ---
    boards(ctx, { braking: BRAKING, gap: 0.7, skip: (d, side) => side > 0 && (inZone(d, PITS.from - 30, PITS.to + 30) || gapL[T.indexAt(d)] < 60) || onStand(STANDS, L, d, side, 0) });

    return {
        // the fountain: its water streams upwards, it sways a little in the wind, and it turns to face the camera. It
        // is so far away that it is drawn nearer and smaller, in the same line of sight, to stay inside what is drawn.
        update(dt, view) {
            if (!jet) return;
            jetT += dt; jet.material.map.offset.y = -(jetT * 0.55) % 1;
            const cam = view && view.cam; if (!cam) return;
            const dx = FOUNTAIN.x - cam.x, dz = FOUNTAIN.z - cam.z, dist = Math.hypot(dx, dz) || 1, k = Math.min(1, 1700 / dist);
            jet.position.set(cam.x + dx * k, cam.y + (WATER - cam.y) * k, cam.z + dz * k); jet.scale.setScalar(k);
            jet.rotation.set(0, Math.atan2(-dx, -dz), Math.sin(jetT * 0.4) * 0.012);
            jet.material.opacity = Math.max(0.5, Math.min(1, 1.5 - dist / 3600));   // (fainter from the far end of the circuit)
        },
        setLook(look, direct) { seaFog.value.copy(seaFogColour(look, direct)); }   // (the sea's haze changes with the weather)
    };
}

// The picture every building's walls are cut from, and its twin: the light the windows and doorways give out.
// Across: eight kinds of wall. Down: eight floors, which repeat up a tall building. Pale stone and sand colours.
function paintWalls(KINDS, FLOORS) {
    const W = 1024, H = 512, bw = W / KINDS, fh = H / FLOORS, rnd = Math.random;
    const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const wall = make(), light = make(), a = wall.getContext('2d'), e = light.getContext('2d');
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    const base = ['#a08a68', '#b3a58c', '#1b3038', '#b9b2a4', '#a89274', '#ab9878', '#8e8474', '#27333a'];
    const WARM = ['#ffd98a', '#ffe7b0', '#ffcf7a', '#fff0d0', '#ffdca0'];
    for (let k = 0; k < KINDS; k++) {
        const x0 = k * bw; a.fillStyle = base[k]; a.fillRect(x0, 0, bw, H);
        for (let i = 0; i < 260; i++) { a.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; a.fillRect(x0 + rnd() * bw, rnd() * H, 2 + rnd() * 5, 2 + rnd() * 3); }   // (the grain of the stone)
        for (let f = 0; f < FLOORS; f++) {
            const y0 = f * fh;
            if (k === 0) for (let i = 0; i < 4; i++) {            // sandstone flats: rows of windows with rounded tops, about half of them lit
                const x = x0 + 9 + i * 30, lit = rnd() < 0.5; a.fillStyle = '#2a2620'; a.beginPath(); a.moveTo(x, y0 + 52); a.lineTo(x, y0 + 24); a.arc(x + 9, y0 + 24, 9, Math.PI, 0); a.lineTo(x + 18, y0 + 52); a.fill();
                if (lit) { e.fillStyle = pickFrom(WARM); e.globalAlpha = 0.5 + rnd() * 0.45; e.beginPath(); e.moveTo(x + 1, y0 + 51); e.lineTo(x + 1, y0 + 24); e.arc(x + 9, y0 + 24, 8, Math.PI, 0); e.lineTo(x + 17, y0 + 51); e.fill(); e.globalAlpha = 1; }
                a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(x0, y0 + 58, bw, 2);
            }
            if (k === 1) {                                         // a cream hotel: a balcony along every floor, and wide windows behind
                for (let i = 0; i < 3; i++) { const x = x0 + 8 + i * 39; a.fillStyle = '#2c2a26'; a.fillRect(x, y0 + 10, 32, 36); if (rnd() < 0.55) { e.fillStyle = pickFrom(WARM); e.globalAlpha = 0.4 + rnd() * 0.5; e.fillRect(x + 1, y0 + 11, 30, 34); e.globalAlpha = 1; e.fillStyle = '#000'; e.fillRect(x + 15, y0 + 11, 2, 34); } }
                a.fillStyle = '#d2c8b4'; a.fillRect(x0, y0 + 46, bw, 9); a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(x0, y0 + 55, bw, 3);
            }
            if (k === 2) {                                         // a glass tower: dark blue-green glass, a thin line of gold light at every floor
                a.fillStyle = '#15303a'; a.fillRect(x0 + 3, y0 + 6, bw - 6, fh - 10); a.fillStyle = '#0c1c22'; for (let i = 1; i < 6; i++) a.fillRect(x0 + i * bw / 6 - 1, y0, 2, fh);
                e.fillStyle = '#ffc860'; e.fillRect(x0 + 2, y0 + 2, bw - 4, 2);
                for (let i = 0; i < 6; i++) if (rnd() < 0.22) { e.fillStyle = 'rgba(255,236,200,0.7)'; e.fillRect(x0 + i * bw / 6 + 3, y0 + 9, bw / 6 - 6, fh - 16); }
            }
            if (k === 3) {                                         // pale stone with carved screens over the windows: light shows through the pattern
                for (let i = 0; i < 3; i++) { const x = x0 + 10 + i * 38; a.fillStyle = '#6e6456'; a.fillRect(x, y0 + 8, 30, 46); const lit = rnd() < 0.6, al = 0.45 + rnd() * 0.5;
                    for (let u = 0; u < 5; u++) for (let v = 0; v < 7; v++) { a.fillStyle = '#2a2520'; a.fillRect(x + 2 + u * 5.6, y0 + 10 + v * 6.2, 3.6, 4.2); if (lit) { e.fillStyle = '#ffcf80'; e.globalAlpha = al; e.fillRect(x + 2 + u * 5.6, y0 + 10 + v * 6.2, 3.6, 4.2); e.globalAlpha = 1; } } }
            }
            if (k === 4) {                                         // an arcade of shops: arched doorways full of warm light, an awning over each
                for (let i = 0; i < 3; i++) { const x = x0 + 7 + i * 40; a.fillStyle = '#3a3026'; a.beginPath(); a.moveTo(x, y0 + 64); a.lineTo(x, y0 + 30); a.arc(x + 17, y0 + 30, 17, Math.PI, 0); a.lineTo(x + 34, y0 + 64); a.fill();
                    e.fillStyle = pickFrom(['#ffd590', '#ffe2a8', '#ffc870']); e.globalAlpha = 0.35 + rnd() * 0.4; e.beginPath(); e.moveTo(x + 2, y0 + 64); e.lineTo(x + 2, y0 + 30); e.arc(x + 17, y0 + 30, 15, Math.PI, 0); e.lineTo(x + 32, y0 + 64); e.fill(); e.globalAlpha = 1; }
                a.fillStyle = pickFrom(['#7a3b2a', '#2f5d4e', '#31496b']); a.fillRect(x0, y0 + 4, bw, 6);
            }
            if (k === 5) {                                         // a plain sand-coloured wall with a few small windows
                for (let i = 0; i < 3; i++) if (rnd() < 0.7) { const x = x0 + 16 + i * 38; a.fillStyle = '#2c2822'; a.fillRect(x, y0 + 20, 14, 22); if (rnd() < 0.4) { e.fillStyle = pickFrom(WARM); e.globalAlpha = 0.5 + rnd() * 0.4; e.fillRect(x + 1, y0 + 21, 12, 20); e.globalAlpha = 1; } }
            }
            if (k === 6) {                                         // a tower with fins of warm light running up it, and a few lit rooms
                e.fillStyle = '#ffb648'; e.fillRect(x0 + 3, y0, 3, fh); e.fillRect(x0 + bw - 6, y0, 3, fh); e.fillStyle = '#ffe2a0'; e.fillRect(x0 + bw / 2 - 1, y0, 2, fh);
                for (let i = 0; i < 4; i++) { const x = x0 + 14 + i * 27; if (i === 2) continue; a.fillStyle = '#2a2824'; a.fillRect(x, y0 + 12, 18, 40); if (rnd() < 0.35) { e.fillStyle = 'rgba(255,226,170,0.8)'; e.fillRect(x + 1, y0 + 13, 16, 38); } }
            }
            if (k === 7) for (let i = 0; i < 6; i++) {            // offices: a grid of glass, a few floors still at work
                a.fillStyle = '#16222a'; a.fillRect(x0 + 4 + i * 20.4, y0 + 6, 17, fh - 12);
                if (rnd() < 0.3) { e.fillStyle = pickFrom(['#e8f2ff', '#fff2d8', '#d6ecff']); e.globalAlpha = 0.35 + rnd() * 0.5; e.fillRect(x0 + 4 + i * 20.4, y0 + 6, 17, fh - 12); e.globalAlpha = 1; }
            }
        }
        // (a plain gap down each edge of every kind of wall, so neighbours never bleed into each other, and the roofs have somewhere plain to be cut from)
        a.fillStyle = base[k]; a.fillRect(x0, 0, 1.5, H); a.fillRect(x0 + bw - 1.5, 0, 1.5, H); e.fillStyle = '#000'; e.fillRect(x0, 0, 1.5, H); e.fillRect(x0 + bw - 1.5, 0, 1.5, H);
    }
    return [wall, light].map(c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; });
}
const pickFrom = list => list[Math.floor(Math.random() * list.length)];
