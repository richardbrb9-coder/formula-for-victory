// Formula for Victory: what stands around the Las Vegas circuit, which is always raced at night. All made in code (plus
// the shared grandstand and pit building parts): a flat city of dark buildings with glowing windows, tall resort towers
// along the Strip outlined in coloured light, neon signs, a giant glowing globe, palm trees, and floodlight poles all the
// way round the track.
// EVERY NAME ON EVERY SIGN IS MADE UP. No real hotel, casino, company or building is named or copied.
// How the night is made cheaply: there are no extra lights. The road is lit by the same two lights as every circuit
// (turned into a soft white floodlight glow from above); the pools of light under each floodlight are one see-through
// layer laid over the road, brighter under each lamp; windows, signs and lamps simply glow (and the film effects on
// Medium and High graphics add the bloom round them). Buildings are dark, so they stay dark under that glow.
// Everything is baked into a few big pieces, cut up by area so a tablet only draws what is in view.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';
import { Geo, sweep } from '../track.js';
import { Quads, smooth, wrapD, inZone, buildStands, onStand, boards, ribbon, podiumStand } from './common.js';

const PAVE = 4;                                                         // how wide the pavement behind the wall is
// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [[6050, -1, 70, 10, 3], [6125, -1, 70, 10, 3], [8, -1, 70, 10, 3], [83, -1, 70, 10, 3],      // the start straight, opposite the pits
    [470, 1, 60, 7, 3.5], [1640, -1, 70, 7, 3], [2330, -1, 70, 7, 3], [3260, 1, 60, 7, 3], [3900, -1, 70, 7, 3], [4500, 1, 70, 7, 3], [5150, 1, 50, 7, 3.5]];
const BRAKING = [165, 1492, 3138, 5066];                                // the big stops: the first hairpin, turn five, turn twelve, the end of the Strip
const PITS = { from: 5950, to: 290, front: 21, groups: [6066, 6116, 6166, 24, 74], sections: 5 };   // the pit building, on the left of the start straight
const STRIP = [3200, 5060];                                             // the long straight down the Strip
const GLOBE = { x: 408, z: -446, r: 66, lift: 34 };                     // the giant globe, inside the loop of the track
const LAMP_EVERY = 44;
// made-up names for the signs: [words, colour of the letters, colour of the border]
const SIGNS = [['GOLDEN GECKO', '#ffd23a', '#ff3bd0'], ['MOONBEAM TOWERS', '#7ee8ff', '#b07cff'], ['JOLLY CACTUS', '#7dff8a', '#ffd23a'], ['COMET CASTLE', '#ff6a3a', '#7ee8ff'],
    ['NEON LLAMA', '#ff3bd0', '#7ee8ff'], ['ZIGZAG ARCADE', '#ffe84a', '#ff6a3a'], ['COSMIC CAROUSEL', '#b07cff', '#ffd23a'], ['DESERT DAZZLE', '#ff9a3a', '#ff3bd0'],
    ['TWINKLE TOWER', '#ffffff', '#7ee8ff'], ['WHIZZ-BANG THEATRE', '#ff4a5a', '#ffe84a'], ['SUNDAE SKY DINER', '#ff8ad8', '#7dff8a'], ['ROCKET REGENT', '#7ee8ff', '#ff4a5a'],
    ['OPEN ALL NIGHT', '#7dff8a', '#7dff8a'], ['SHOWTIME TONIGHT', '#ffd23a', '#ff4a5a'], ['WELCOME RACERS', '#ffffff', '#ff3bd0'], ['PIZZA · SHAKES · FRIES', '#ff9a3a', '#7ee8ff']];

export function lasVegasScenery(ctx) {
    const { T, group } = ctx, { samples, N, trackLen: L } = T, dens = ctx.quality.density;
    const at = d => T.sampleAt(d), wallOf = (s, side) => side > 0 ? s.wl : s.wr, R = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
    const spot = (d, side, out) => { const p = T.pathAt(d, side * out, 0); return { x: p.x, y: p.y, z: p.z, heading: p.heading + (side > 0 ? Math.PI : 0) }; };
    const beside = (x, z) => { const nr = T.near(x, z); if (nr.i < 0) return null; const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z; return { s, lat, side: lat > 0 ? 1 : -1, clear: Math.abs(lat) - (lat > 0 ? s.wl : s.wr), dist: nr.dist }; };
    const onStrip = d => inZone(d, STRIP[0], STRIP[1]);

    // --- the ground: dark city asphalt as far as you can see ---
    {
        const b = T.box, ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.95 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set((b.minX + b.maxX) / 2, -0.06, (b.minZ + b.maxZ) / 2); ground.receiveShadow = true; ground.userData.always = true; group.add(ground);
    }
    // --- the pavements behind the walls, all the way round ---
    {
        const paving = new THREE.MeshStandardMaterial({ roughness: 0.9, map: SC.canvasTex(128, 128, (x, w, h) => {
            x.fillStyle = '#5d5b58'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 600; i++) { const g = 70 + Math.random() * 50; x.fillStyle = `rgba(${g},${g},${g - 4},0.4)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
            x.strokeStyle = 'rgba(30,30,28,0.45)'; x.lineWidth = 1; for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.stroke(); }
        }) });
        const kMax = i => { let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(samples[(i + j + N) % N].k)); return k; };
        const edge = (s, i, side) => { const wall = wallOf(s, side); return Math.sign(s.ks) === side ? Math.min(wall + PAVE, Math.max(wall + 0.5, 0.82 / Math.max(kMax(i), 1e-4))) : wall + PAVE; };   // (little room on the inside of a tight corner)
        for (let i0 = 0; i0 < N; i0 += 400) {
            const g = new Geo(), i1 = Math.min(N, i0 + 400);
            sweep(T, g, i0, i1, 2, (s, i) => { const o = edge(s, i % N, 1); return [[o, -0.06], [o, 0.13], [o, 0.13], [s.wl + 0.2, 0.13]]; }, (q, d, off) => [off / 2.4, d / 2.4]);
            sweep(T, g, i0, i1, 2, (s, i) => { const o = edge(s, i % N, -1); return [[-s.wr - 0.2, 0.13], [-o, 0.13], [-o, 0.13], [-o, -0.06]]; }, (q, d, off) => [off / 2.4, d / 2.4]);
            const m = g.mesh(paving); m.receiveShadow = true; m.userData.far = 520; group.add(m);
        }
    }

    // =================================================================
    //  THE FLOODLIGHTS: a pole every 44 m, on alternate sides, and the pool of light under each one
    // =================================================================
    const lampAt = [];   // [metres round the lap, side]
    for (let d = 20, k = 0; d < L - 20; d += LAMP_EVERY, k++) lampAt.push([d, k % 2 ? 1 : -1]);
    const props = new Quads(true), glow = new Quads(true), noUv = () => [0, 0, 0, 0];   // (props: plain-coloured things, lit like everything else; glow: things that shine)
    {
        const steel = [0.2, 0.21, 0.24], white = [3.2, 3.1, 2.7];
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
                    g.pos.push(s.p.x + s.n.x * lat, s.p.y + 0.05, s.p.z + s.n.z * lat); g.col.push(0.25, 0.235, 0.2, Math.min(0.6, a));   // (measured: with the film effects and without, the road comes out the same) g.uv.push(0, 0);
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
    const HOTEL = 0, GLASS = 1, NEON = 2, GOLD = 3, GARAGE = 4, SHOP = 5, VIOLET = 6, SCREEN = 7, KINDS = 8, FLOORS = 8;
    const [wallPic, lightPic] = paintWalls(KINDS, FLOORS);
    const facade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, map: wallPic, emissiveMap: lightPic, emissive: 0xffffff, emissiveIntensity: 1, side: THREE.DoubleSide });
    const chunks = new Map(), chunkAt = (x, z) => { const key = Math.floor(x / 520) + ':' + Math.floor(z / 520); if (!chunks.has(key)) chunks.set(key, new Quads(true)); return chunks.get(key); };
    const signs = new Quads(true);
    // one block: a box standing on the ground, 'floors' high. Each wall is cut into strips one picture wide.
    function block(b) {
        const q = chunkAt(b.x, b.z), fh = b.fh || 3.4, c = Math.cos(b.heading), s = Math.sin(b.heading), P = (lx, lz, y) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c];
        const h = b.w / 2, e = b.dp / 2, y0 = b.y0 || 0, y1 = y0 + b.floors * fh, corners = [[-h, -e], [h, -e], [h, e], [-h, e]], tint = b.tint || [1, 1, 1], G = 0.012;
        for (let f = 0; f < 4; f++) {
            const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4], len = f % 2 ? b.dp : b.w, n = Math.max(1, Math.round(len / (b.tile || 13))), shade = f % 2 ? 0.8 : 1;
            for (let k = 0; k < n; k++) {
                const t0 = k / n, t1 = (k + 1) / n, flip = Math.random() < 0.5, v0 = Math.floor(Math.random() * FLOORS) / FLOORS, v1 = v0 + b.floors / FLOORS;
                const u0 = (b.kind + (flip ? 1 - G : G)) / KINDS, u1 = (b.kind + (flip ? G : 1 - G)) / KINDS, col = tint.map(v => v * shade);
                q.add(P(ax + (bx - ax) * t0, az + (bz - az) * t0, y0), P(ax + (bx - ax) * t1, az + (bz - az) * t1, y0), P(ax + (bx - ax) * t0, az + (bz - az) * t0, y1), P(ax + (bx - ax) * t1, az + (bz - az) * t1, y1), [u0, v0, u1, v0, u0, v1, u1, v1], col);
            }
        }
        const u = (b.kind + 0.004) / KINDS; q.add(P(-h, -e, y1), P(h, -e, y1), P(-h, e, y1), P(h, e, y1), [u, 0.5, u, 0.5, u, 0.5, u, 0.5], [0.5, 0.5, 0.55]);   // the roof (a dark part of the picture)
        return { P, top: y1 };
    }
    // lines of coloured light up a tower's corners and round its top
    function outline(b, top, colour) {
        const c = Math.cos(b.heading), s = Math.sin(b.heading), P = (lx, lz, y) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c], h = b.w / 2 + 0.15, e = b.dp / 2 + 0.15, y0 = b.y0 || 0, w = 0.5;
        for (const [x, z] of [[-h, -e], [h, -e], [h, e], [-h, e]]) { glow.add(P(x - w, z, y0), P(x + w, z, y0), P(x - w, z, top), P(x + w, z, top), undefined, colour); glow.add(P(x, z - w, y0), P(x, z + w, y0), P(x, z - w, top), P(x, z + w, top), undefined, colour); }
        const cs = [[-h, -e], [h, -e], [h, e], [-h, e]]; for (let f = 0; f < 4; f++) { const [ax, az] = cs[f], [bx, bz] = cs[(f + 1) % 4]; glow.add(P(ax, az, top - 1.4), P(bx, bz, top - 1.4), P(ax, az, top), P(bx, bz, top), undefined, colour); }
    }
    // a sign: a board facing local -z (the road) at a spot; which: its number in SIGNS
    function signBoard(x, z, heading, w, hgt, y, which, bright = 1.7) {
        const c = Math.cos(heading), s = Math.sin(heading), P = (lx, yy) => [x + lx * c, yy, z - lx * s], col = which % 2, row = Math.floor(which / 2), u0 = col / 2, v0 = 1 - (row + 1) / 8;
        signs.add(P(w / 2, y), P(-w / 2, y), P(w / 2, y + hgt), P(-w / 2, y + hgt), [u0 + 0.004, v0 + 0.004, u0 + 0.496, v0 + 0.004, u0 + 0.004, v0 + 0.121, u0 + 0.496, v0 + 0.121], [bright, bright, bright]);
    }
    // which ground is already taken (4 m squares), so nothing is built on top of anything else
    const taken = new Set(), tk = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
    const footprint = (x, z, heading, w, dp, pad = 0) => { const c = Math.cos(heading), s = Math.sin(heading), pts = []; for (let lx = -w / 2 - pad; lx <= w / 2 + pad + 0.01; lx += Math.min(3.5, (w + pad * 2) / 2)) for (let lz = -dp / 2 - pad; lz <= dp / 2 + pad + 0.01; lz += Math.min(3.5, (dp + pad * 2) / 2)) pts.push([x + lx * c + lz * s, z - lx * s + lz * c]); return pts; };
    const mark = pts => pts.forEach(([x, z]) => taken.add(tk(x, z)));
    const inGlobe = (x, z, pad) => (x - GLOBE.x) ** 2 + (z - GLOBE.z) ** 2 < (GLOBE.r + pad) ** 2;
    const globeSide = (x, z) => inGlobe(x, z, 150) && x < 600 && z < -230 && z > -640 && x > 215 || x > 246 && x < 440 && z > -262 && z < -90;   // (the open ground the globe stands on, inside the loop of the track)
    const isFree = (pts, minClear) => pts.every(([x, z]) => { if (taken.has(tk(x, z)) || inGlobe(x, z, 26) || globeSide(x, z)) return false; const b = beside(x, z); return !b || b.clear >= minClear; });

    // --- things with a place of their own go down first ---
    buildStands(ctx, STANDS, 0x7E57C2, 900);
    for (const [d, side, len, rows, gap] of STANDS) { const s = at(d), deep = rows * 0.9 + 6, p = spot(d, side, wallOf(s, side) + gap + deep / 2); mark(footprint(p.x, p.z, p.heading, len + 6, deep, 2)); }
    // the pits: the pit lane (from the map), the pit building on the left of the start straight, and the podium
    {
        const lane = ctx.circuit.geo.extras.pitlane[0], laneMat = SC.photoMat('asphalt_02', 1, 1, 0xb4b8be, 0.9); laneMat.side = THREE.DoubleSide;
        const lm = ribbon(lane, 8, laneMat, () => 0, 0.012); lm.userData.always = true; group.add(lm);
        for (let i = 0; i < lane.length; i += 2) mark(footprint(lane[i], lane[i + 1], 0, 12, 12));
        const blocks = [];
        for (const d of PITS.groups) { const b = SC.pitBuilding(PITS.sections); SC.placeBeside(ctx, b, d, PITS.front); b.userData.far = 950; b.userData.noProbe = true; blocks.push(b); const p = spot(d, 1, PITS.front + 7); mark(footprint(p.x, p.z, p.heading, 54, 20, 3)); }
        group.add(SC.mergeStatic(blocks));
        { const d = PITS.groups[0] - 25.6, s = at(d), c = T.pathAt(d, PITS.front + 7.2, 0); signBoard(c.x, c.z, Math.atan2(-s.n.z, s.n.x), 13, 13 / 4.1, 4.4, 14); }   // (on its blank end wall, facing the cars as they arrive)
        const pod = podiumStand('LAS VEGAS', ['#B22234', '#f4f4f0', '#3C3B6E']);
        SC.placeBeside(ctx, pod, -9, PITS.front); group.add(SC.mergeStatic([pod]));
        // the paddock behind: pale asphalt, and the teams' trucks
        const g = new Geo(), ia = T.indexAt(6030), n = Math.round(290 / T.ds);
        sweep(T, g, ia, ia + n, 4, s => [[PITS.front + 52, -0.03], [s.wl + 0.2, -0.03]], (q, d, off) => [off / 6, d / 6]);
        const am = g.mesh(SC.photoMat('asphalt_02', 1, 1, 0x8f9298, 0.9)); am.receiveShadow = true; am.userData.always = true; group.add(am);
        const cols = [[0.95, 0.95, 0.95], [0.12, 0.23, 0.54], [0.88, 0.1, 0.1], [0.16, 0.18, 0.22], [1, 0.7, 0], [0, 0.66, 0.42]];
        for (let d = 6040; d < 6040 + 270; d += R(12, 17)) { const big = Math.random() < 0.6, p = spot(d, 1, PITS.front + 14.3 + (big ? 20 : 14) + R(-1, 1)); props.box(p.x, p.z, p.heading + (big ? Math.PI / 2 : 0), big ? 16 : 7, big ? 3 : 9, 0, big ? 4.1 : 3.2, noUv, pick(cols)); }
        for (let d = 6030; d < 6030 + 290; d += 8) { const p = spot(d, 1, PITS.front + 30); mark(footprint(p.x, p.z, p.heading, 10, 50, 0)); }
    }
    // the giant globe: a huge ball covered in lights, standing in a ring of low buildings
    let globe = null;
    {
        const pic = SC.canvasTex(1024, 512, (x, w, h) => {
            // bands of colour swirling round it like a planet, with brighter spots, all made of little dots of light
            const g = x.createLinearGradient(0, 0, 0, h); [[0, '#2a1a6e'], [0.18, '#7a2bd0'], [0.34, '#ff3bb0'], [0.5, '#ff9a3a'], [0.64, '#ffe07a'], [0.8, '#2ac8e8'], [1, '#143a9a']].forEach(([t, c]) => g.addColorStop(t, c));
            x.fillStyle = g; x.fillRect(0, 0, w, h);
            for (let k = 0; k < 7; k++) { x.strokeStyle = ['rgba(255,255,255,0.22)', 'rgba(40,10,90,0.3)', 'rgba(255,220,120,0.25)'][k % 3]; x.lineWidth = 14 + k * 5; x.beginPath(); for (let u = -20; u <= w + 20; u += 16) { const v = h * (0.12 + 0.11 * k) + Math.sin(u / w * Math.PI * 2 * (1 + k % 3) + k) * 26; u < 0 ? x.moveTo(u, v) : x.lineTo(u, v); } x.stroke(); }
            for (let k = 0; k < 16; k++) { const u = Math.random() * w, v = h * (0.15 + Math.random() * 0.7), r = 14 + Math.random() * 34, gr = x.createRadialGradient(u, v, 0, u, v, r); gr.addColorStop(0, 'rgba(255,255,230,0.75)'); gr.addColorStop(1, 'rgba(255,255,230,0)'); x.fillStyle = gr; for (const o of [0, w, -w]) x.fillRect(u - r + o, v - r, r * 2, r * 2); }
            x.fillStyle = 'rgba(6,6,14,0.5)'; for (let u = 0; u < w; u += 6) x.fillRect(u, 0, 1.5, h); for (let v = 0; v < h; v += 6) x.fillRect(0, v, w, 1.5);   // the gaps between the lights
        });
        pic.wrapS = THREE.RepeatWrapping; pic.wrapT = THREE.ClampToEdgeWrapping;
        globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.r, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.78), new THREE.MeshBasicMaterial({ map: pic, color: new THREE.Color(1.35, 1.35, 1.35) }));
        globe.position.set(GLOBE.x, GLOBE.lift, GLOBE.z); globe.userData.far = 2600; globe.userData.noProbe = true; group.add(globe);
        for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = GLOBE.r + 7; block({ x: GLOBE.x + Math.cos(a) * r, z: GLOBE.z + Math.sin(a) * r, heading: -a + Math.PI / 2, w: 30, dp: 10, floors: 2, fh: 4.5, kind: k % 2 ? NEON : SHOP, tile: 15 }); }
        for (let a = 0; a < 6.28; a += 0.2) mark([[GLOBE.x + Math.cos(a) * (GLOBE.r + 16), GLOBE.z + Math.sin(a) * (GLOBE.r + 16)]]);
    }

    // --- along the streets: resort towers down both sides of the Strip, smaller blocks everywhere else ---
    const NEONS = [[1.9, 0.35, 1.6], [0.35, 1.6, 2.0], [2.0, 1.4, 0.35], [1.2, 0.6, 2.1], [0.4, 2.0, 0.95], [2.1, 0.65, 0.4]];
    const TINTS = [[1, 1, 1], [0.8, 0.85, 1], [1, 0.9, 0.8], [0.85, 1, 0.95]];
    let signNo = 0;
    for (const side of [1, -1]) {
        for (let d = R(0, 12); d < L - 12;) {
            const strip = onStrip(d + 30), w = strip ? R(60, 110) : R(22, 46), dp = strip ? R(34, 46) : R(18, 30), mid = d + w / 2, s = at(mid);
            if (Math.abs(s.ks) > 0.012 || Math.abs(at(d).ks) > 0.012 || Math.abs(at(d + w).ks) > 0.012) { d += 14; continue; }      // (not round the corners: the walls of a long block would cut across the road)
            if (side > 0 && inZone(mid, PITS.from - 60, PITS.to + 120)) { d += 20; continue; }                                         // (the pits and the paddock)
            if (side > 0 && inZone(mid, 1520, 2480) || side < 0 && inZone(mid, 1130, 1720)) { d += 20; continue; }                      // (nothing between the road and the globe)
            const tall = !strip && Math.random() < 0.16;                                                                              // (a tall one stands further back, clear of the helicopter camera in replays)
            const out = Math.max(wallOf(s, side), wallOf(at(d), side), wallOf(at(d + w), side)) + PAVE + R(1.5, strip ? 9 : 5) + (tall ? 13 : 0) + dp / 2, p = spot(mid, side, out), pts = footprint(p.x, p.z, p.heading, w, dp);
            if (!isFree(pts, PAVE + 0.6)) { d += 9; continue; }
            mark(footprint(p.x, p.z, p.heading, w, dp, 2));
            if (strip) {
                // a resort: a low, bright front along the pavement, a tall tower rising out of it, a sign on the roof
                const neon = NEONS[signNo % NEONS.length], kind = pick([HOTEL, GLASS, GOLD, VIOLET, SCREEN, HOTEL]), floors = Math.round(R(24, 46)), tw = w * R(0.55, 0.85), tdp = R(18, 24);
                block({ ...p, w, dp, floors: 3, fh: 5, kind: Math.random() < 0.5 ? NEON : SHOP, tile: 15 });
                const c = Math.cos(p.heading), sn = Math.sin(p.heading), back = dp / 2 - tdp / 2 - R(0, 4), tower = { x: p.x + back * sn, z: p.z + back * c, heading: p.heading, w: tw, dp: tdp, y0: 15, floors, kind, tint: pick(TINTS) };
                const { top } = block(tower); outline(tower, top, neon);
                if (Math.random() < 0.4) { const sg = Math.random() < 0.5 ? 1 : -1, wing = { ...tower, x: tower.x + (tw / 2 + 9) * c * sg, z: tower.z - (tw / 2 + 9) * sn * sg, w: 18, floors: Math.round(floors * R(0.5, 0.8)) }; const made = block(wing); outline(wing, made.top, neon); }
                const sw = Math.min(tw * 0.8, 46); signBoard(tower.x - (tdp / 2 + 0.4) * sn, tower.z - (tdp / 2 + 0.4) * c, p.heading, sw, sw / 4.1, top + 1.5, signNo % 12, 2.0);
                signBoard(p.x - (dp / 2 + 0.3) * sn, p.z - (dp / 2 + 0.3) * c, p.heading, Math.min(w * 0.5, 34), Math.min(w * 0.5, 34) / 4.1, 8, (signNo + 5) % SIGNS.length);
                signNo++;
            } else {
                const floors = tall ? Math.round(R(14, 26)) : Math.round(R(2, 9)), kind = floors <= 3 ? pick([SHOP, NEON, GARAGE]) : pick([HOTEL, HOTEL, GLASS, GARAGE, GOLD, VIOLET]);
                const b = { ...p, w, dp, floors, kind, tint: pick(TINTS) }, { top } = block(b);
                if (tall) outline(b, top, pick(NEONS));
                if (floors <= 3 && Math.random() < 0.5 || tall) { const sn = Math.sin(p.heading), c = Math.cos(p.heading), sw = Math.min(w * 0.7, 20); signBoard(p.x - (dp / 2 + 0.3) * sn, p.z - (dp / 2 + 0.3) * c, p.heading, sw, sw / 4.1, tall ? top + 1 : Math.max(4.5, top - sw / 4.1 - 0.5), signNo++ % SIGNS.length); }
            }
            d += w + (strip ? R(8, 26) : R(3, 12));
        }
    }
    // tall signs on posts beside the road, facing the cars as they come: all down the Strip, and here and there elsewhere
    for (let d = 60, k = 0; d < L - 40; d += onStrip(d) ? 150 : 330, k++) {
        const s = at(d); if (Math.abs(s.ks) > 0.006) continue;
        const side = k % 2 ? 1 : -1; if (side > 0 && inZone(d, PITS.from - 60, PITS.to + 60) || onStand(STANDS, L, d, side, 0)) continue;
        const out = wallOf(s, side) + 2.2, c = T.pathAt(d, side * (out + 3.5), 0), W = 7, H = W / 4.1 * 1.6, y = 9.5;
        const P = (k2, yy) => [c.x + s.n.x * k2 * W / 2, yy, c.z + s.n.z * k2 * W / 2], which = k % SIGNS.length, col = which % 2, row = Math.floor(which / 2), u0 = col / 2, v0 = 1 - (row + 1) / 8;
        signs.add(P(1, y), P(-1, y), P(1, y + H), P(-1, y + H), [u0 + 0.004, v0 + 0.004, u0 + 0.496, v0 + 0.004, u0 + 0.004, v0 + 0.121, u0 + 0.496, v0 + 0.121], [1.7, 1.7, 1.7]);
        for (const k2 of [-0.8, 0.8]) { const q = P(k2, 0); props.box(q[0], q[2], s.heading, 0.4, 0.4, 0, y, noUv, [0.16, 0.17, 0.2], false); }
        glow.add(P(1.04, y - 0.25), P(-1.04, y - 0.25), P(1.04, y), P(-1.04, y), undefined, NEONS[k % NEONS.length]); glow.add(P(1.04, y + H), P(-1.04, y + H), P(1.04, y + H + 0.25), P(-1.04, y + H + 0.25), undefined, NEONS[k % NEONS.length]);
    }
    // --- the city behind: blocks scattered over the plain, a few of them tall ---
    {
        const step = 62 / Math.sqrt(dens / 0.75), b = T.box;
        for (let x = b.minX - 330; x < b.maxX + 330; x += step) for (let z = b.minZ - 330; z < b.maxZ + 330; z += step) {
            const px = x + R(0, step - 20), pz = z + R(0, step - 20), nr = beside(px, pz); if (!nr || nr.clear < 34 || nr.dist > 380) continue;
            const tall = Math.random() < 0.13, w = R(22, 44), dp = R(18, 32), heading = Math.round(R(0, 1)) * Math.PI / 2 + R(-0.06, 0.06), pts = footprint(px, pz, heading, w, dp);
            if (!isFree(pts, 12)) continue;
            mark(footprint(px, pz, heading, w, dp, 3));
            const floors = tall ? Math.round(R(16, 36)) : Math.round(R(2, 10)), blockAt = { x: px, z: pz, heading, w, dp, floors, kind: floors <= 3 ? pick([GARAGE, SHOP, HOTEL]) : pick([HOTEL, HOTEL, GLASS, GOLD, VIOLET, GARAGE, SCREEN]), tint: pick(TINTS) };
            const { top } = block(blockAt); if (tall && Math.random() < 0.7) outline(blockAt, top, pick(NEONS));
        }
    }
    for (const q of chunks.values()) { if (q.empty) continue; const m = q.mesh(facade); m.userData.far = 1500; m.userData.noProbe = true; group.add(m); }
    // the signs: one picture with all sixteen on it
    if (!signs.empty) {
        const m = signs.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: SC.canvasTex(1024, 1024, (x, w, h) => {
            x.fillStyle = '#07070c'; x.fillRect(0, 0, w, h);
            SIGNS.forEach(([text, fg, edge], i) => {
                const u = (i % 2) * 512, v = Math.floor(i / 2) * 128;
                x.fillStyle = '#0d0d16'; x.fillRect(u + 4, v + 4, 504, 120);
                x.shadowColor = edge; x.shadowBlur = 12; x.strokeStyle = edge; x.lineWidth = 5; x.strokeRect(u + 12, v + 12, 488, 104);
                x.fillStyle = edge; for (let k = 0; k < 24; k++) { x.beginPath(); x.arc(u + 22 + k * 20.3, v + 22, 2.6, 0, 7); x.arc(u + 22 + k * 20.3, v + 106, 2.6, 0, 7); x.fill(); }   // rows of bulbs
                x.shadowColor = fg; x.shadowBlur = 16; x.fillStyle = fg; x.font = '900 58px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
                const tw = x.measureText(text).width; if (tw > 440) x.font = `900 ${Math.floor(58 * 440 / tw)}px Orbitron, Arial Black, sans-serif`;
                x.fillText(text, u + 256, v + 66); x.fillText(text, u + 256, v + 66); x.shadowBlur = 0;
            });
        }, false) }));
        m.userData.far = 1500; m.userData.noProbe = true; group.add(m);
    }

    // --- palm trees along the Strip, and a few round the pits ---
    {
        const trunk = [0.3, 0.24, 0.18], frond = [0.16, 0.3, 0.14];
        const palm = (x, z, h) => {
            props.box(x, z, R(0, 3), 0.42, 0.42, 0, h, noUv, trunk, false);
            for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + R(-0.2, 0.2), len = R(2.6, 3.6), dx = Math.cos(a), dz = Math.sin(a), wx = -dz * 0.5, wz = dx * 0.5;
                props.add([x - wx, h, z - wz], [x + wx, h, z + wz], [x + dx * len * 0.6 - wx, h + 0.7, z + dz * len * 0.6 - wz], [x + dx * len * 0.6 + wx, h + 0.7, z + dz * len * 0.6 + wz], undefined, frond);
                props.add([x + dx * len * 0.6 - wx, h + 0.7, z + dz * len * 0.6 - wz], [x + dx * len * 0.6 + wx, h + 0.7, z + dz * len * 0.6 + wz], [x + dx * len, h - 0.5, z + dz * len], [x + dx * len, h - 0.5, z + dz * len], undefined, frond); }
            glow.add([x - 0.26, 1, z], [x + 0.26, 1, z], [x - 0.26, h - 0.4, z], [x + 0.26, h - 0.4, z], undefined, [1.5, 1.2, 0.6]);   // a string of fairy lights up the trunk
        };
        for (let d = STRIP[0] + 12; d < STRIP[1]; d += 22) for (const side of [1, -1]) { const s = at(d); if (onStand(STANDS, L, d, side, 0)) continue; const p = T.pathAt(d, side * (wallOf(s, side) + 2.6), 0); palm(p.x, p.z, R(8, 11)); }
        for (let d = 6040; d < 6040 + 260; d += 26) { const p = spot(d, 1, PITS.front + 16); palm(p.x, p.z, R(7, 9)); }
    }
    { const m = props.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })); m.castShadow = false; m.receiveShadow = true; m.userData.always = true; m.userData.noProbe = true; group.add(m); }
    { const m = glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.userData.always = true; m.userData.noProbe = true; group.add(m); }

    // --- advertising and braking boards ---
    boards(ctx, { braking: BRAKING, gap: 0.7, skip: (d, side) => side > 0 && inZone(d, PITS.from - 30, PITS.to + 30) || onStand(STANDS, L, d, side, 0) });

    return { update(dt) { if (globe) globe.material.map.offset.x += dt * 0.012; } };   // (the globe's lights drift slowly round it)
}

// The picture every building's walls are cut from, and its twin: the light the windows, shop fronts and strips of neon
// give out. Across: eight kinds of wall. Down: eight floors, which repeat up a tall building.
function paintWalls(KINDS, FLOORS) {
    const W = 1024, H = 512, bw = W / KINDS, fh = H / FLOORS, rnd = Math.random;
    const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const wall = make(), light = make(), a = wall.getContext('2d'), e = light.getContext('2d');
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    const base = ['#2a2623', '#0d1a26', '#16121c', '#2e2410', '#3a3b3e', '#1b1a1d', '#171226', '#0c1420'];
    for (let k = 0; k < KINDS; k++) {
        const x0 = k * bw; a.fillStyle = base[k]; a.fillRect(x0, 0, bw, H);
        for (let f = 0; f < FLOORS; f++) {
            const y0 = f * fh;
            if (k === 0) for (let i = 0; i < 4; i++) {            // a hotel: rows of windows, about half of them lit
                const x = x0 + 8 + i * 30, lit = rnd() < 0.52; a.fillStyle = '#10161f'; a.fillRect(x, y0 + 14, 20, 36);
                if (lit) { e.fillStyle = pickFrom(['#ffd98a', '#ffe7b0', '#ffcf7a', '#dfe9ff', '#ffdca0']); e.globalAlpha = 0.55 + rnd() * 0.45; e.fillRect(x + 1, y0 + 15, 18, 34); e.globalAlpha = 1; }
            }
            if (k === 1) {                                         // a glass tower: dark glass with a thin line of blue light at every floor
                a.fillStyle = '#12283a'; a.fillRect(x0 + 3, y0 + 6, bw - 6, fh - 10); a.fillStyle = '#0a141d'; for (let i = 1; i < 6; i++) a.fillRect(x0 + i * bw / 6 - 1, y0, 2, fh);
                e.fillStyle = '#2ab8ff'; e.fillRect(x0 + 2, y0 + 2, bw - 4, 2.5);
                for (let i = 0; i < 6; i++) if (rnd() < 0.2) { e.fillStyle = 'rgba(190,225,255,0.75)'; e.fillRect(x0 + i * bw / 6 + 3, y0 + 9, bw / 6 - 6, fh - 16); }
            }
            if (k === 2) {                                         // a low, bright front: bands of pink and blue neon over glowing glass
                for (let i = 0; i < 3; i++) { const x = x0 + 8 + i * 39; a.fillStyle = '#2a2420'; a.fillRect(x, y0 + 22, 32, fh - 28); e.fillStyle = '#ffdca0'; e.globalAlpha = 0.16 + rnd() * 0.3; e.fillRect(x, y0 + 22, 32, fh - 28); e.globalAlpha = 1; e.fillStyle = '#000'; e.fillRect(x + 15, y0 + 22, 2, fh - 28); }
                e.fillStyle = f % 2 ? '#ff2bd6' : '#22e0ff'; e.fillRect(x0 + 2, y0 + 4, bw - 4, 5); e.fillStyle = f % 2 ? '#ffd23a' : '#ff2bd6'; e.fillRect(x0 + 2, y0 + 12, bw - 4, 3);
            }
            if (k === 3) for (let i = 0; i < 5; i++) {            // a golden tower: every window glowing gold, some brighter
                const x = x0 + 5 + i * 24.5; a.fillStyle = '#5a4416'; a.fillRect(x, y0 + 8, 19, fh - 14);
                e.fillStyle = '#ffb83a'; e.globalAlpha = rnd() < 0.25 ? 0.06 : 0.25 + rnd() * 0.55; e.fillRect(x, y0 + 8, 19, fh - 14); e.globalAlpha = 1;
            }
            if (k === 4) {                                         // a car park: open decks with a dim light inside
                a.fillStyle = '#17181a'; a.fillRect(x0 + 4, y0 + 20, bw - 8, fh - 30);
                e.fillStyle = 'rgba(205,230,210,0.3)'; e.fillRect(x0 + 4, y0 + 20, bw - 8, 9); if (rnd() < 0.6) { e.fillStyle = 'rgba(235,245,235,0.9)'; e.fillRect(x0 + 20 + rnd() * 70, y0 + 21, 16, 3); }
            }
            if (k === 5) {                                         // shops: wide bright windows with a coloured blind over each
                for (let i = 0; i < 2; i++) { const x = x0 + 6 + i * 61; a.fillStyle = '#40382c'; a.fillRect(x, y0 + 16, 55, fh - 20); e.fillStyle = pickFrom(['#fff0c8', '#ffe2a8', '#e6f1ff']); e.globalAlpha = 0.22 + rnd() * 0.36; e.fillRect(x, y0 + 16, 55, fh - 20); e.globalAlpha = 1; e.fillStyle = '#000'; e.fillRect(x + 17, y0 + 16, 2, fh - 20); e.fillRect(x + 36, y0 + 16, 2, fh - 20);
                    e.fillStyle = pickFrom(['#ff4a5a', '#22e0ff', '#7dff8a', '#ffd23a', '#b07cff']); e.fillRect(x, y0 + 8, 55, 5); }
            }
            if (k === 6) {                                         // a tower with strips of violet light running up it, and a few lit rooms
                e.fillStyle = '#a04cff'; e.fillRect(x0 + 3, y0, 4, fh); e.fillRect(x0 + bw - 7, y0, 4, fh); e.fillStyle = '#ff5ad8'; e.fillRect(x0 + bw / 2 - 1.5, y0, 3, fh);
                for (let i = 0; i < 4; i++) { const x = x0 + 14 + i * 27; a.fillStyle = '#0e0b18'; a.fillRect(x, y0 + 14, 18, 36); if (rnd() < 0.3) { e.fillStyle = 'rgba(255,222,160,0.8)'; e.fillRect(x + 1, y0 + 15, 16, 34); } }
            }
            if (k === 7) for (let i = 0; i < 6; i++) {            // a wall of lights like a giant screen: squares of blue and green
                if (rnd() < 0.7) { e.fillStyle = pickFrom(['#1aa0ff', '#19d4c8', '#3a6bff', '#22e0ff', '#7dffb0']); e.globalAlpha = 0.3 + rnd() * 0.6; e.fillRect(x0 + 4 + i * 20.4, y0 + 4, 17, fh - 8); e.globalAlpha = 1; }
            }
        }
        // (a dark gap down each edge of every kind of wall, so neighbours never bleed into each other, and the roofs have somewhere dark to be cut from)
        a.fillStyle = base[k]; a.fillRect(x0, 0, 1.5, H); a.fillRect(x0 + bw - 1.5, 0, 1.5, H); e.fillStyle = '#000'; e.fillRect(x0, 0, 1.5, H); e.fillRect(x0 + bw - 1.5, 0, 1.5, H);
    }
    return [wall, light].map(c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; });
}
const pickFrom = list => list[Math.floor(Math.random() * list.length)];
