// Formula for Victory: what stands around Suzuka. All made in code (plus the shared tree pictures, grandstand and pit
// building parts): rolling wooded hills that the road climbs and dips through, the concrete bridge where the track
// crosses over itself, wide gravel traps, the main grandstand and the pits, and beside the circuit an amusement park
// with a big wheel (made-up rides: no real park's name or signs).
// The ground is one mesh that follows the road's heights; close to the road it is always a little below it, and a strip
// of grass verge along both sides of the road covers the join.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';
import { Geo, sweep } from '../track.js';
import { Quads, smooth, wrapD, inZone, buildStands, onStand, boards, ribbon, podiumStand, shareMaterials } from './common.js';

// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [
    [5600, 1, 70, 10, 3.5], [5675, 1, 70, 10, 3.5], [5750, 1, 70, 10, 3.5], [22, 1, 70, 10, 3.5], [97, 1, 70, 10, 3.5], [172, 1, 70, 10, 3.5], [247, 1, 70, 10, 3.5], [322, 1, 60, 10, 3.5],   // the main grandstand, opposite the pits
    [560, 1, 60, 7, 4], [690, 1, 60, 7, 4],                                       // the First Curve
    [1062, 1, 50, 7, 4], [1400, 1, 60, 7, 4],                                     // the S Curves and the Reverse Bank
    [2764, -1, 50, 7, 4],                                                         // the Hairpin
    [3760, -1, 60, 7, 4],                                                         // Spoon
    [4880, -1, 50, 7, 4],                                                         // 130R
    [5200, 1, 60, 7, 4], [5410, 1, 60, 10, 4]                                     // the chicane and the last curve
];
const BRAKING = [470, 2100, 2700, 3600, 5190];                                    // the big stops: First Curve, Degner, Hairpin, Spoon, the chicane
const PITS = { from: 5440, to: 440, front: 27, deep: 78, groups: [5650, 5700, 5750, -4], sections: 5 };   // the pit building: four blocks of five garages, stepping down the hill
const PARK = { d: 5690, out: 150, w: 250, dp: 150 };                              // the amusement park, behind the main grandstand
const WHEEL = { x: 35, z: -38, r: 30, hub: 35 };                                  // the big wheel: where it stands in the park (metres along it, and from its middle towards the track)
const CELL = 12, MARGIN = 320, VERGE = 2, FAR_Y = 17, DROP = 0.14;

export function suzukaScenery(ctx) {
    const { T, group } = ctx, { samples, N, trackLen: L } = T, dens = ctx.quality.density, X = ctx.circuit.crossover;
    const at = d => T.sampleAt(d), wallOf = (s, side) => side > 0 ? s.wl : s.wr, R = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
    const spot = (d, side, out) => { const p = T.pathAt(d, side * out, 0); return { x: p.x, y: p.y, z: p.z, heading: p.heading + (side > 0 ? Math.PI : 0) }; };

    // =================================================================
    //  THE CROSSOVER: where the two roads cross, and which way the lower one runs
    // =================================================================
    let lower = null, upperI = 0;
    { const il = T.indexAt((X.under[0] + X.under[1]) / 2), iu = T.indexAt((X.over[0] + X.over[1]) / 2); let bd = Infinity;
      for (let i = il - 40; i <= il + 40; i++) for (let j = iu - 40; j <= iu + 40; j++) { const a = samples[(i + N) % N].p, b = samples[(j + N) % N].p, d2 = (a.x - b.x) ** 2 + (a.z - b.z) ** 2; if (d2 < bd) { bd = d2; lower = samples[(i + N) % N]; upperI = (j + N) % N; } } }
    const OPEN = Math.max(lower.wl, lower.wr) + 2;                      // the opening under the bridge: this far each side of the middle of the lower road
    const latLower = (x, z) => (x - lower.p.x) * lower.n.x + (z - lower.p.z) * lower.n.z;
    const RAMP = 46;                                                    // samples each side of the crossing where the upper road runs between concrete walls
    const onRamp = i => { let k = Math.abs(i - upperI); k = Math.min(k, N - k); return k <= RAMP; };
    const nearCrossing = (x, z, r) => (x - lower.p.x) ** 2 + (z - lower.p.z) ** 2 < r * r;

    // =================================================================
    //  THE LIE OF THE LAND
    // =================================================================
    const TB = T.box, x0 = TB.minX - MARGIN, z0 = TB.minZ - MARGIN, nx = Math.ceil((TB.maxX - TB.minX + 2 * MARGIN) / CELL), nz = Math.ceil((TB.maxZ - TB.minZ + 2 * MARGIN) / CELL), x1 = x0 + nx * CELL, z1 = z0 + nz * CELL;
    const fromEdge = (x, z) => Math.min(x - x0, x1 - x, z - z0, z1 - z);
    // (for the height of the land between the roads: every fifth sample, leaving out the lower road near the crossing,
    // which runs in a cutting below the level of the land round it)
    const ix = []; for (let i = 0; i < N; i += 5) { const s = samples[i]; if (!s.deck && !(Math.abs(wrapD(s.d - lower.d, L)) < 80)) ix.push(i); }
    const CELLS = new Map(), CS = 110, ck = (cx, cz) => cx * 100003 + cz;
    samples.forEach((s, i) => { if (i % 2 || s.deck) return; const k = ck(Math.floor(s.p.x / CS), Math.floor(s.p.z / CS)); if (!CELLS.has(k)) CELLS.set(k, []); CELLS.get(k).push(i); });
    const roadsNear = (x, z, f) => { const cx = Math.floor(x / CS), cz = Math.floor(z / CS); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = CELLS.get(ck(cx + a, cz + b)); if (l) for (const i of l) f(samples[i], i); } };
    // how far beyond its wall the ground beside the road is kept level with it: further behind the grandstands, and
    // right across the paddock
    const standAt = (d, side) => STANDS.find(([sd, ss, len]) => ss === side && Math.abs(wrapD(d - sd, L)) < len / 2 + 10);
    const flatBeyond = (s, side) => {
        if (side < 0 && inZone(s.d, PITS.from, PITS.to)) return Math.max(VERGE + 17, PITS.deep - s.wr + 17);
        const st = standAt(s.d, side); return st ? st[4] + st[3] * 0.9 + 16 : VERGE + 17;
    };
    // flat places dug level into the hills: the amusement park
    const park = spot(PARK.d, 1, PARK.out); park.y -= DROP;
    const pads = [{ ...park, w: PARK.w, dp: PARK.dp }];
    const inPad = (p, x, z, margin = 0) => { const c = Math.cos(p.heading), sn = Math.sin(p.heading), lx = (x - p.x) * c - (z - p.z) * sn, lz = (x - p.x) * sn + (z - p.z) * c; return Math.max(Math.abs(lx) - p.w / 2, Math.abs(lz) - p.dp / 2) - margin; };
    const hills = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.0061 + 1.3) * Math.cos(z * 0.0073 + 0.4) + 0.2 * Math.sin(x * 0.013 + z * 0.011 + 2);
    // The height of the ground at any spot: between the roads it slopes from one road's height to the next; away from
    // them it rolls up into low hills; beside a road it is level with that road (a touch below it); and where one road
    // runs lower than another close by, the lower one wins, so it sits in a cutting.
    function land(x, z, info) {
        let sw = 0, sy = 0, bd = Infinity;
        for (const i of ix) { const p = samples[i].p, dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz, w = 1 / ((d2 + 160) * (d2 + 160)); sw += w; sy += w * p.y; if (d2 < bd) bd = d2; }
        const dist = Math.sqrt(bd);
        let y = sy / sw + 52 * hills(x, z) * smooth(70, 300, dist);
        y = FAR_Y + (y - FAR_Y) * smooth(0, 170, fromEdge(x, z));
        for (const p of pads) { const o = inPad(p, x, z); if (o < 26) y = p.y + (y - p.y) * smooth(0, 26, o); }
        // beside the roads
        let near = null, nd = Infinity, low = Infinity;
        roadsNear(x, z, r => {
            const dx = x - r.p.x, dz = z - r.p.z, d = Math.sqrt(dx * dx + dz * dz), side = dx * r.n.x + dz * r.n.z > 0 ? 1 : -1, over = d - wallOf(r, side) - flatBeyond(r, side);
            if (over < nd) { nd = over; near = r; }
            if (over < 0 && r.p.y < low) low = r.p.y;
        });
        if (near && nd < 30) y = near.p.y - DROP + (y - near.p.y + DROP) * smooth(0, 30, nd);
        if (low - DROP < y) y = low - DROP;
        if (info) { info.dist = dist; info.road = nd; }
        return y;
    }
    // where a spot is beside the track: which part of the lap, which side, and how far beyond the wall
    const beside = (x, z) => { const nr = T.near(x, z); if (nr.i < 0) return null; const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z; return { s, lat, side: lat > 0 ? 1 : -1, clear: Math.abs(lat) - (lat > 0 ? s.wl : s.wr), dist: nr.dist }; };

    // --- the land itself: one mesh, grass coloured, darker where the woods stand ---
    const woods = (x, z) => smooth(0.38, 0.62, 0.5 + 0.5 * Math.sin(x * 0.011 + 0.7) * Math.sin(z * 0.013 + 2.1) + 0.25 * Math.sin((x + z) * 0.023));   // (0 open grass, 1 thick wood)
    {
        const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = new Uint32Array(nx * nz * 6), info = {};
        const c = new THREE.Color(), grass = new THREE.Color(0.84, 0.95, 0.72), wood = new THREE.Color(0.4, 0.55, 0.36);
        let n = 0;
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
            const x = x0 + i * CELL, z = z0 + j * CELL, y = land(x, z, info), k = j * (nx + 1) + i;
            c.copy(grass).lerp(wood, Math.max(woods(x, z), smooth(170, 300, info.dist)) * smooth(20, 70, info.road)).offsetHSL(0, 0, (Math.random() - 0.5) * 0.03);
            pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
            if (i < nx && j < nz) { idx[n++] = k; idx[n++] = k + nx + 1; idx[n++] = k + 1; idx[n++] = k + 1; idx[n++] = k + nx + 1; idx[n++] = k + nx + 2; }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
        const mat = SC.photoMat('leafy_grass', 1, 1, 0x9ad070); mat.vertexColors = true;
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.always = true; group.add(m);
        // beyond the edge of that mesh the country carries on, level and wooded, out into the haze
        const q = new Quads(), far = 3600, y = FAR_Y;
        q.add([x0 - far, y, z0 - far], [x1 + far, y, z0 - far], [x0 - far, y, z0 + 6], [x1 + far, y, z0 + 6]);
        q.add([x0 - far, y, z1 - 6], [x1 + far, y, z1 - 6], [x0 - far, y, z1 + far], [x1 + far, y, z1 + far]);
        q.add([x0 - far, y, z0], [x0 + 6, y, z0], [x0 - far, y, z1], [x0 + 6, y, z1]);
        q.add([x1 - 6, y, z0], [x1 + far, y, z0], [x1 - 6, y, z1], [x1 + far, y, z1]);
        const fm = q.mesh(new THREE.MeshStandardMaterial({ color: 0x4f7a42, roughness: 1, side: THREE.DoubleSide })); fm.userData.always = true; group.add(fm);
    }

    // --- the grass verge along both sides of the road, and the bank down from it to the land beyond ---
    {
        const kMax = i => { let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(samples[(i + j + N) % N].k)); return k; };
        const vergeMat = SC.photoMat('leafy_grass', 1, 1, 0x86c462); vergeMat.side = THREE.DoubleSide;
        const prof = (s, i, side) => {
            if (s.deck || onRamp(i % N)) return null;
            const wall = wallOf(s, side); let a = wall + VERGE, b = a + 3, c = a + 9;
            if (Math.sign(s.ks) === side) { const cap = Math.max(wall + 0.4, 0.85 / Math.max(kMax(i % N), 1e-4)); a = Math.min(a, cap); b = Math.min(b, cap + 0.2); c = Math.min(c, cap + 0.4); }   // (the inside of a tight corner: no room for more)
            const pts = [[side * c, -7], [side * b, -1.3], [side * a, -0.07], [side * s.hw, -0.07]];
            return side > 0 ? pts : pts.reverse();
        };
        for (let i0 = 0; i0 < N; i0 += 500) {   // (in six long pieces: fewer separate things for a tablet to draw)
            const g = new Geo(), i1 = Math.min(N, i0 + 500);
            for (const side of [1, -1]) sweep(T, g, i0, i1, 2, (s, i) => prof(s, i, side), (q, d, off) => [off / 6, d / 6]);
            const m = g.mesh(vergeMat); if (m) { m.receiveShadow = true; m.userData.always = true; m.userData.noProbe = true; group.add(m); }   // (left out of the cars' reflections: the land just beneath it is the same green)
        }
    }

    // =================================================================
    //  THE BRIDGE: a concrete deck on its abutments, with the upper road running up to it between walls
    // =================================================================
    {
        const concrete = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide, map: SC.canvasTex(256, 256, (x, w, h) => {
            x.fillStyle = '#a9a8a2'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 2600; i++) { const g = 140 + Math.random() * 60; x.fillStyle = `rgba(${g},${g - 2},${g - 8},0.3)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
            for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(60,62,60,${0.05 + Math.random() * 0.08})`; x.fillRect(Math.random() * w, 0, 3 + Math.random() * 10, h); }   // streaks of weather down the face
            x.strokeStyle = 'rgba(60,60,56,0.45)'; x.lineWidth = 2; for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(0, i * 128); x.lineTo(w, i * 128); x.moveTo(i * 128, 0); x.lineTo(i * 128, h); x.stroke(); }   // the joints between the pours
        }) });
        const H = 11, THICK = 1.3, q = new Quads(), g = new Geo(), j0 = upperI - RAMP, j1 = upperI + RAMP, S = j => samples[(j + N) % N];
        const edgeOff = (s, side) => side > 0 ? s.wl + 0.6 : -(s.wr + 0.6), edgePt = (s, side) => { const o = edgeOff(s, side); return [s.p.x + s.n.x * o, s.p.y, s.p.z + s.n.z * o]; };
        const openAt = (s, side) => { const p = edgePt(s, side); return Math.abs(latLower(p[0], p[2])) < OPEN; };
        const uvw = (q, d, off, h) => [d / 6, (off + h) / 6];
        // the deck: a slab under the road for the whole span, with a ledge outside each barrier
        const span = s => s.deck || openAt(s, 1) || openAt(s, -1), under = new Geo();
        sweep(T, g, j0 + N, j1 + N, 1, s => span(s) ? [[s.wl - 0.25, 0.01], [s.wl + 0.6, 0.01], [s.wl + 0.6, 0.01], [s.wl + 0.6, -THICK]] : null, uvw);
        sweep(T, g, j0 + N, j1 + N, 1, s => span(s) ? [[-(s.wr + 0.6), -THICK], [-(s.wr + 0.6), 0.01], [-(s.wr + 0.6), 0.01], [-(s.wr - 0.25), 0.01]] : null, uvw);
        // (its underside is in shade: drawn in its own plain grey, or the light off the grass below would turn it green)
        sweep(T, under, j0 + N, j1 + N, 1, s => span(s) ? [[s.wl + 0.6, -THICK], [-(s.wr + 0.6), -THICK]] : null, uvw);
        { const um = under.mesh(new THREE.MeshBasicMaterial({ color: 0x4d4f52, side: THREE.DoubleSide })); um.userData.always = true; group.add(um); }
        // the walls of the approach on each side, wherever that side is not over the opening
        const ends = [];
        for (const side of [1, -1]) {
            sweep(T, g, j0 + N, j1 + N, 1, s => openAt(s, side) ? null : (side > 0 ? [[s.wl - 0.25, 0.01], [s.wl + 0.6, 0.01], [s.wl + 0.6, 0.01], [s.wl + 0.6, -H]] : [[-(s.wr + 0.6), -H], [-(s.wr + 0.6), 0.01], [-(s.wr + 0.6), 0.01], [-(s.wr - 0.25), 0.01]]), uvw);
            // exactly where each wall meets the edge of the opening (between two samples)
            for (let j = j0; j < j1; j++) {
                const a = S(j), b = S(j + 1), oa = openAt(a, side), ob = openAt(b, side); if (oa === ob) continue;
                const pa = edgePt(a, side), pb = edgePt(b, side), la = latLower(pa[0], pa[2]), lb = latLower(pb[0], pb[2]), target = OPEN * Math.sign(oa ? lb : la), t = (target - la) / (lb - la);
                const px = pa.map((v, k) => v + (pb[k] - v) * t), out = oa ? pb : pa;
                q.add([out[0], out[1] - H, out[2]], [px[0], px[1] - H, px[2]], [out[0], out[1] + 0.01, out[2]], [px[0], px[1] + 0.01, px[2]], [0, 0, 0.4, 0, 0, H / 6, 0.4, H / 6]);
                ends.push({ sign: Math.sign(target), p: px });
            }
        }
        // the abutments: the two faces of the opening, each with a row of columns in front of it
        for (const sign of [1, -1]) {
            const e = ends.filter(v => v.sign === sign); if (e.length < 2) continue;
            const [a, b] = e, top = Math.min(a.p[1], b.p[1]) - THICK + 0.05, bot = lower.p.y - 2, len = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]), heading = Math.atan2(-(b.p[2] - a.p[2]), b.p[0] - a.p[0]);
            q.add([a.p[0], bot, a.p[2]], [b.p[0], bot, b.p[2]], [a.p[0], top, a.p[2]], [b.p[0], top, b.p[2]], [0, 0, len / 6, 0, 0, (top - bot) / 6, len / 6, (top - bot) / 6]);
            for (let k = 0; k < 5; k++) { const t = 0.06 + 0.88 * k / 4, cx = a.p[0] + (b.p[0] - a.p[0]) * t - lower.n.x * sign * 0.75, cz = a.p[2] + (b.p[2] - a.p[2]) * t - lower.n.z * sign * 0.75;
                q.box(cx, cz, heading, 1.1, 1.1, bot, top - 0.7, (f, w, h) => [0, 0, w / 6, h / 6]); q.box(cx, cz, heading, 1.7, 1.5, top - 0.7, top, (f, w, h) => [0, 0, w / 6, h / 6]); }
        }
        const dm = g.mesh(concrete); dm.castShadow = dm.receiveShadow = true; dm.userData.always = true; group.add(dm);
        const am = q.mesh(concrete); am.castShadow = am.receiveShadow = true; am.userData.always = true; group.add(am);
    }

    // =================================================================
    //  THE PITS, THE PODIUM AND THE GRANDSTANDS
    // =================================================================
    const lane = ctx.circuit.geo.extras.pitlane[0];
    const roadY = (x, z) => { const nr = T.near(x, z); return nr.i < 0 ? 0 : samples[nr.i].p.y; };
    {
        // the paddock: asphalt from the pit wall right across to behind the garages, narrowing to nothing at each end
        const g = new Geo(), ia = T.indexAt(PITS.from), n = Math.round((((PITS.to - PITS.from) % L + L) % L) / T.ds);
        sweep(T, g, ia, ia + n, 4, (s, i) => { const ramp = Math.min(1, (i - ia) / 45, (ia + n - i) / 45); return [[-(s.wr + 0.25), -0.04], [-(s.wr + 0.25 + (PITS.deep - s.wr) * ramp), -0.04]]; }, (q, d, off) => [off / 6, d / 6]);
        const apronMat = SC.photoMat('asphalt_02', 1, 1, 0xc9ccd2, 0.9); apronMat.side = THREE.DoubleSide;
        const am = g.mesh(apronMat); am.receiveShadow = true; am.userData.always = true; group.add(am);
        const laneMat = SC.photoMat('asphalt_02', 1, 1, 0xb4b8be, 0.9); laneMat.side = THREE.DoubleSide;
        const lm = ribbon(lane, 9, laneMat, roadY, 0.012); lm.userData.always = true; group.add(lm);
        // the pit building, in blocks that step down the hill with the road
        const blocks = [];
        for (const d of PITS.groups) { const b = SC.pitBuilding(PITS.sections); SC.placeBeside(ctx, b, d, -PITS.front); b.position.y -= 0.05; b.userData.far = 950; b.userData.noProbe = true; blocks.push(b); }
        shareMaterials(blocks); group.add(SC.mergeStatic(blocks));   // (the four blocks are then drawn as one building)
        const pod = podiumStand('SUZUKA', ['#f4f4f0', '#BC002D', '#f4f4f0']);
        SC.placeBeside(ctx, pod, -9, -PITS.front); group.add(SC.mergeStatic([pod]));
    }
    buildStands(ctx, STANDS, 0xA3142A, 1100, 700);   // (baked together in bigger groups than usual: this circuit folds back on itself, so many stands are in view at once)

    // =================================================================
    //  THE AMUSEMENT PARK: a big wheel that turns, a roller coaster, a carousel, a drop tower, tents and stalls
    // =================================================================
    const props = new Quads(true), noUv = () => [0, 0, 0, 0];
    let wheel = null;
    {
        const pc = Math.cos(park.heading), ps = Math.sin(park.heading), local = (lx, lz) => [park.x + lx * pc + lz * ps, park.z - lx * ps + lz * pc], y = park.y;
        // paths of pale paving across the park
        const flat = (lx, lz, w, dp, colour, lift = 0.04) => { const c = [[-w / 2, -dp / 2], [w / 2, -dp / 2], [-w / 2, dp / 2], [w / 2, dp / 2]].map(([a, b]) => { const [x, z] = local(lx + a, lz + b); return [x, y + lift, z]; }); props.add(c[0], c[1], c[2], c[3], undefined, colour); };
        flat(0, 0, PARK.w - 16, 9, [0.74, 0.7, 0.62]); flat(-60, 0, 9, PARK.dp - 20, [0.74, 0.7, 0.62]); flat(55, 0, 9, PARK.dp - 20, [0.74, 0.7, 0.62]);
        // the big wheel: rims, spokes and round cabins (drums lying along the axle, so they look right all the way round)
        {
            const [wx, wz] = local(WHEEL.x, WHEEL.z), w = { x: wx, z: wz }, mount = new THREE.Group(), parts = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.5, metalness: 0.2 });
            mount.position.set(w.x, park.y + WHEEL.hub, w.z); mount.rotation.y = park.heading + 0.6;
            wheel = new THREE.Group(); mount.add(wheel); wheel.add(parts);
            for (const z of [-1.5, 1.5]) {
                const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.r, 0.28, 5, 56), white); rim.position.z = z; parts.add(rim);
                const inner = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.r * 0.55, 0.16, 4, 40), white); inner.position.z = z; parts.add(inner);
            }
            const SP = 24, spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(WHEEL.r, 0.16, 0.16).translate(WHEEL.r / 2, 0, 0), white, SP * 2), cabins = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.45 }), SP);
            const m = new THREE.Matrix4(), e = new THREE.Euler(), qn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), col = new THREE.Color(), bright = [0xE10600, 0xFFB300, 0x00B8D9, 0x7E57C2, 0x00A86B, 0xFF6D00];
            for (let k = 0; k < SP; k++) {
                const a = k / SP * Math.PI * 2; e.set(0, 0, a); qn.setFromEuler(e);
                for (const [n, z] of [[0, -1.5], [1, 1.5]]) { m.compose(v.set(0, 0, z), qn, one); spokes.setMatrixAt(k * 2 + n, m); }
                m.makeTranslation(Math.cos(a) * (WHEEL.r + 0.1), Math.sin(a) * (WHEEL.r + 0.1), 0); cabins.setMatrixAt(k, m); cabins.setColorAt(k, col.set(bright[k % bright.length]));
            }
            parts.add(spokes, cabins);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 4.2, 14).rotateX(Math.PI / 2), white); parts.add(hub);
            const merged = SC.mergeStatic([parts]); merged.children.forEach(o => { o.castShadow = false; }); wheel.add(merged);
            mount.userData.far = 1500; mount.userData.noProbe = true; group.add(mount);
            // its legs: two A-frames, one each side of the wheel
            const c = Math.cos(mount.rotation.y), s = Math.sin(mount.rotation.y), P = (lx, ly, lz) => [w.x + lx * c + lz * s, park.y + ly, w.z - lx * s + lz * c];
            for (const z of [-3.2, 3.2]) for (const foot of [-15, 15]) { const a = P(foot - 0.6, 0, z * 1.6), b = P(foot + 0.6, 0, z * 1.6), t0 = P(-0.6, WHEEL.hub, z * 0.75), t1 = P(0.6, WHEEL.hub, z * 0.75); props.add(a, b, t0, t1, undefined, [0.85, 0.86, 0.9]); }
            props.box(w.x, w.z, mount.rotation.y, 22, 12, park.y, park.y + 1.2, noUv, [0.6, 0.62, 0.66]);   // the boarding platform
        }
        // the roller coaster: a red track looping up and down on white legs
        {
            const [cx, cz] = local(-62, 22), n = 120, pts = [];
            for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, r = 1 + 0.18 * Math.sin(a * 3); pts.push([cx + Math.cos(a) * 46 * r * pc + Math.sin(a) * 30 * r * ps, y + 7 + 9 * (0.5 + 0.5 * Math.sin(a * 4 + 0.6)) + 5 * (0.5 + 0.5 * Math.sin(a * 2)), cz - Math.cos(a) * 46 * r * ps + Math.sin(a) * 30 * r * pc]); }
            for (let k = 0; k < n; k++) {
                const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1, ox = -dz / len * 0.75, oz = dx / len * 0.75;
                props.add([a[0] - ox, a[1], a[2] - oz], [a[0] + ox, a[1], a[2] + oz], [b[0] - ox, b[1], b[2] - oz], [b[0] + ox, b[1], b[2] + oz], undefined, [0.86, 0.1, 0.1]);
                props.add([a[0] + ox, a[1] - 0.5, a[2] + oz], [a[0] - ox, a[1] - 0.5, a[2] - oz], [b[0] + ox, b[1] - 0.5, b[2] + oz], [b[0] - ox, b[1] - 0.5, b[2] - oz], undefined, [0.55, 0.06, 0.06]);
                if (k % 4 === 0) props.box(a[0], a[2], 0, 0.35, 0.35, y, a[1] - 0.4, noUv, [0.92, 0.92, 0.94], false);
            }
        }
        // a cone-shaped roof in coloured stripes (the carousel, tents)
        const cone = (x, z, r, y0, h, cols, sides = 12) => { for (let k = 0; k < sides; k++) { const a0 = k / sides * 6.2832, a1 = (k + 1) / sides * 6.2832, tip = [x, y0 + h, z]; props.add([x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], tip, tip, undefined, cols[k % cols.length]); } };
        const drum = (x, z, r, y0, y1, colour, sides = 12) => { for (let k = 0; k < sides; k++) { const a0 = k / sides * 6.2832, a1 = (k + 1) / sides * 6.2832; props.add([x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y1, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y1, z + Math.sin(a0) * r], undefined, colour); } };
        { const [x, z] = local(30, 28); drum(x, z, 7.5, y, y + 0.6, [0.8, 0.78, 0.7]); drum(x, z, 1, y, y + 5, [0.95, 0.85, 0.3]); cone(x, z, 8.6, y + 4.6, 3.6, [[0.9, 0.15, 0.2], [0.98, 0.96, 0.9]]); }          // the carousel
        { const [x, z] = local(92, 30); props.box(x, z, park.heading, 3, 3, y, y + 42, noUv, [0.93, 0.93, 0.95], true, null); props.box(x, z, park.heading, 7.5, 7.5, y + 24, y + 26.4, noUv, [0.1, 0.55, 0.85]); props.box(x, z, park.heading, 4.4, 4.4, y + 42, y + 45, noUv, [0.95, 0.7, 0.05]); }   // the drop tower
        { const [x, z] = local(100, -38); drum(x, z, 0.8, y, y + 16, [0.9, 0.9, 0.92]); cone(x, z, 9, y + 13.5, 3, [[0.2, 0.65, 0.9], [0.98, 0.9, 0.2]]); }   // the swing ride
        for (const [lx, lz, r] of [[-25, -38, 8], [-62, -46, 6.5], [70, 50, 7], [-100, -42, 7.5], [-10, 48, 6]]) { const [x, z] = local(lx, lz); drum(x, z, r, y, y + 3, [0.96, 0.94, 0.88], 10); cone(x, z, r + 0.8, y + 3, r * 0.75, [pick([[0.9, 0.2, 0.2], [0.15, 0.5, 0.85], [0.95, 0.65, 0.1], [0.3, 0.7, 0.35]]), [0.98, 0.96, 0.9]], 10); }   // big tents
        for (let k = 0; k < 16; k++) { const [x, z] = local(-112 + k * 15 + R(-2, 2), k % 2 ? 9 : -9); props.box(x, z, park.heading, 5, 4, y, y + 2.8, noUv, [0.95, 0.94, 0.9]); props.box(x, z, park.heading, 5.8, 4.8, y + 2.8, y + 3.3, noUv, pick([[0.9, 0.2, 0.2], [0.15, 0.5, 0.85], [0.95, 0.65, 0.1], [0.3, 0.7, 0.35], [0.6, 0.35, 0.8]])); }   // stalls along the main path
    }
    // a concrete footing under every grandstand (the road slopes, and a stand is level: this fills the gap at its lower end)
    for (const [d, side, len, rows, gap] of STANDS) { const sm = at(d), deep = rows * 0.9 + 1.6, p = spot(d, side, wallOf(sm, side) + gap + deep / 2 - 0.3); props.box(p.x, p.z, p.heading, len + 0.8, deep, p.y - 3, p.y - 0.02, noUv, [0.62, 0.63, 0.65], false); }
    // the teams' trucks in the paddock, behind the garages
    {
        const cols = [[0.95, 0.95, 0.95], [0.12, 0.23, 0.54], [0.88, 0.1, 0.1], [0.16, 0.18, 0.22], [1, 0.7, 0], [0, 0.66, 0.42]];
        for (let d = 5610; d < 5610 + 215; d += R(12, 17)) { const big = Math.random() < 0.6, p = spot(d, -1, PITS.front + 14.3 + (big ? 20 : 14) + R(-1, 1)); props.box(p.x, p.z, p.heading + (big ? Math.PI / 2 : 0), big ? 16 : 7, big ? 3 : 9, p.y - 0.4, p.y + (big ? 4.1 : 3.2), noUv, pick(cols)); }
    }
    { const m = props.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; m.userData.far = 1500; m.userData.noProbe = true; group.add(m); }

    // --- advertising and braking boards ---
    boards(ctx, { braking: BRAKING, skip: (d, side) => inZone(d, 5440, 450) || Math.abs(wrapD(d - samples[upperI].d, L)) < 110 || Math.abs(wrapD(d - lower.d, L)) < 70 || onStand(STANDS, L, d, side, 0) });

    // =================================================================
    //  THE WOODS: trees all over the hills, thinner inside the circuit, with clearings
    // =================================================================
    {
        const trees = [], bushes = [], want = Math.round(12500 * dens / 0.75), nearLane = (x, z) => { for (let i = 0; i < lane.length; i += 4) if ((lane[i] - x) ** 2 + (lane[i + 1] - z) ** 2 < 14 * 14) return true; return false; };
        const free = (x, z, gap) => {
            const b = beside(x, z); if (!b) return true;
            if (b.clear < gap || nearCrossing(x, z, 48) && b.clear < 30) return false;
            if (onStand(STANDS, L, b.s.d, b.side, b.clear - 6)) return false;
            if (b.side < 0 && inZone(b.s.d, PITS.from - 20, PITS.to + 20) && b.clear < PITS.deep + 8) return false;
            return inPad(pads[0], x, z) > 5 && !nearLane(x, z);
        };
        for (let tries = 0; trees.length < want && tries < want * 40; tries++) {
            const x = R(x0 + 30, x1 - 30), z = R(z0 + 30, z1 - 30), w = woods(x, z);
            if (w < 0.5 && Math.random() > 0.035) continue;                        // (thick woods with open grass between them, and the odd tree standing alone)
            const b = beside(x, z), close = b && b.dist < 95;
            if (b && Math.random() > smooth(360, 210, b.dist) || !free(x, z, 11)) continue;   // (planted where they are seen from the road; the far hills are painted darker instead)
            trees.push({ x, z, y: land(x, z) - 0.1, size: R(1.25, 2.3), shadow: close, shade: 0.8 + 0.2 * (1 - w) });
        }
        // a row of low bushes here and there behind the barriers
        for (let d = 0; d < L; d += 7) { const s = at(d); if (Math.random() > 0.2 * dens) continue; for (const side of [1, -1]) { const p = T.pathAt(d, side * (wallOf(s, side) + R(8, 13)), 0); if (free(p.x, p.z, 7)) bushes.push({ x: p.x, z: p.z, y: land(p.x, p.z) - 0.05, size: R(0.8, 1.2), shadow: false }); } }
        SC.plantTrees(ctx, trees, [['round', 0.55], ['slim', 0.37], ['bush_a', 0.08]]);
        const before = group.children.length;
        SC.plantTrees(ctx, bushes, SC.TREE_MIX.hedge, false);
        for (let i = before; i < group.children.length; i++) group.children[i].userData.noProbe = true;        // (the bushes and the trees' shadows are left out of the cars' reflections)
        for (const o of group.children) if (o.userData.treeShadows) o.userData.noProbe = true;
        ctx.treeCount = trees.length + bushes.length;
    }
    return { update(dt) { if (wheel) wheel.rotation.z += dt * 0.09; } };
}
