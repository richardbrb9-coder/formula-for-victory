// Formula for Victory: what stands around Silverstone. All made in code (plus the shared tree pictures and grandstand
// parts): a wide, open old airfield with its runways still showing in the grass, the long modern pit building with its
// wing-shaped roof, big grandstands at the famous corners, grass banks for the crowds, hedges and clumps of trees in
// the fields beyond, advertising boards for made-up brands, and braking boards before the big stops.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';
import { Geo, sweep } from '../track.js';
import { Quads, smooth, wrapD, inZone, buildStands, onStand, boards, ribbon, podiumStand } from './common.js';

// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [
    [5795, 1, 150, 10, 3.5], [70, 1, 150, 10, 3.5],                               // the Hamilton Straight, opposite the Wing
    [335, 1, 80, 10, 4], [425, 1, 60, 7, 4],                                      // Abbey
    [790, 1, 70, 7, 4], [960, -1, 60, 7, 4],                                      // Village and the Loop
    [1880, -1, 80, 7, 4], [2070, 1, 70, 10, 4], [2150, 1, 70, 7, 4],              // Brooklands and Luffield
    [2440, 1, 90, 10, 4], [2730, 1, 140, 10, 3.5],                                // Woodcote and the old pit straight
    [2985, 1, 80, 10, 4], [3070, 1, 60, 7, 4],                                    // Copse
    [3630, 1, 70, 7, 4], [3790, -1, 80, 10, 4], [3940, 1, 70, 7, 4],              // Maggotts, Becketts, Chapel
    [4560, -1, 110, 7, 5],                                                        // the Hangar Straight
    [4945, 1, 90, 10, 4], [5035, 1, 70, 7, 4],                                    // Stowe
    [5535, 1, 70, 7, 4], [5615, 1, 80, 10, 4], [5695, 1, 50, 10, 4]               // Club
];
const BRAKING = [770, 1810, 4880, 5390];                                          // the big stops: Village, Brooklands, Stowe, Vale
// grass banks for the crowds, behind the barrier: [from, to, side]
const BANKS = [[1260, 1740, 1], [1260, 1700, -1], [3160, 3540, 1], [3160, 3460, -1], [4200, 4480, -1], [4640, 4800, -1], [4190, 4800, 1], [5120, 5290, 1], [1050, 1090, 1]];
const WING = { len: 330, deep: 20, front: 15 };                                   // the pit building: its front is 15 m beyond the middle of the pit lane

export function silverstoneScenery(ctx) {
    const { T, group, bounds } = ctx, { samples, trackLen } = T, L = trackLen;

    // --- the ground: one wide plain of grass, with low wooded country far away ---
    const gw = bounds.maxX - bounds.minX + 2600, gd = bounds.maxZ - bounds.minZ + 2600;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), SC.photoMat('leafy_grass', gw / 9, gd / 9, 0x9ad070));
    grass.rotation.x = -Math.PI / 2; grass.position.set((bounds.minX + bounds.maxX) / 2, -0.06, (bounds.minZ + bounds.maxZ) / 2); grass.receiveShadow = true; group.add(grass);
    SC.hills(ctx, SC.THEMES.airfield.hills, 26);

    // --- the old airfield: three runways still cross the middle of the circuit, pale cracked concrete in the grass ---
    const concrete = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, map: SC.canvasTex(256, 256, (x, w, h) => {
        x.fillStyle = '#8f8d84'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 2400; i++) { const g = 115 + Math.random() * 60; x.fillStyle = `rgba(${g},${g - 2},${g - 12},0.35)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
        for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(90,110,70,${0.06 + Math.random() * 0.1})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, 7); x.fill(); }
        x.strokeStyle = 'rgba(40,40,36,0.5)'; x.lineWidth = 2; x.strokeRect(0, 0, w, h); x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();   // the joints between the slabs
    }) });
    const runways = [];   // each: { a, b, half } for the trees to keep clear of
    {
        const q = new Quads(), spot = (d, off) => { const p = T.pathAt(d, -off, 0); return [p.x, p.z]; };
        for (const [d0, o0, d1, o1, half] of [[2650, 60, 4700, 70, 23], [1450, 90, 3300, 70, 23], [300, 130, 4350, 60, 18]]) {
            const a = spot(d0, o0), b = spot(d1, o1), len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / len * half, nz = -(b[0] - a[0]) / len * half;
            q.add([a[0] + nx, -0.03, a[1] + nz], [a[0] - nx, -0.03, a[1] - nz], [b[0] + nx, -0.03, b[1] + nz], [b[0] - nx, -0.03, b[1] - nz], [0, 0, half / 6, 0, 0, len / 12, half / 6, len / 12]);
            runways.push({ a, b, half, len });
        }
        const m = q.mesh(concrete); m.receiveShadow = true; m.userData.always = true; group.add(m);
    }
    const onRunway = (x, z, margin = 6) => runways.some(({ a, b, half, len }) => {
        const t = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len / len; if (t < -0.02 || t > 1.02) return false;
        return Math.abs((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len < half + margin;
    });

    // --- the pits: the pit lane (from the map), the paddock, and the Wing ---
    const lane = ctx.circuit.geo.extras.pitlane[0], wing = { x: 0, z: 0, heading: 0 };
    {
        const laneMat = SC.photoMat('asphalt_02', 1, 1, 0xc4c8ce, 0.9); laneMat.side = THREE.DoubleSide;
        const lm = ribbon(lane, 11, laneMat); lm.userData.always = true; group.add(lm);
        // where the pit lane runs beside the Hamilton Straight: from just after Club to just before Abbey
        const P = []; for (let i = 0; i < lane.length; i += 2) { const nr = T.near(lane[i], lane[i + 1]); if (nr.i >= 0 && inZone(samples[nr.i].d, 5805, 235)) P.push([lane[i], lane[i + 1]]); }
        const a = P[0], b = P[P.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        wing.heading = Math.atan2(-dz, dx);
        wing.x = (a[0] + b[0]) / 2 - dz * WING.front; wing.z = (a[1] + b[1]) / 2 + dx * WING.front;   // (to the right of the pit lane)
        const g = new THREE.Group(); buildWing(g, concrete); g.position.set(wing.x, 0, wing.z); g.rotation.y = wing.heading; group.add(g);
        g.userData.far = 1500; g.userData.noProbe = true;
        group.add(SC.mergeStatic([g]));
        // the podium, out over the pit lane at the start line
        const pod = podiumStand('SILVERSTONE', ['#012169', '#f4f4f0', '#C8102E']);
        const s0 = samples[0].p, along = (s0.x - wing.x) * dx + (s0.z - wing.z) * dz - 9;   // (level with the start line)
        pod.position.set(wing.x + dx * along, 0, wing.z + dz * along); pod.rotation.y = wing.heading; group.add(pod);
        group.add(SC.mergeStatic([pod]));
    }
    const inPaddock = (x, z) => {   // the Wing, the pit lane in front of it and the paddock behind
        const c = Math.cos(wing.heading), s = Math.sin(wing.heading), lx = (x - wing.x) * c - (z - wing.z) * s, lz = (x - wing.x) * s + (z - wing.z) * c;
        return Math.abs(lx) < WING.len / 2 + 60 && lz > -30 && lz < WING.deep + 75;
    };
    const nearLane = (x, z) => { for (let i = 0; i < lane.length; i += 4) if ((lane[i] - x) ** 2 + (lane[i + 1] - z) ** 2 < 15 * 15) return true; return false; };

    // --- grandstands ---
    buildStands(ctx, STANDS, 0x1E3A8A);

    // --- grass banks for the crowds, behind the barriers on the straights ---
    {
        const g = new Geo(), prof = [[18, 0], [12.5, 2.5], [7, 2.5], [2, 0]];
        for (const [from, to, side] of BANKS) {
            const i0 = T.indexAt(from), n = Math.round((((to - from) % L + L) % L) / T.ds);
            sweep(T, g, i0, i0 + n, 4, (s, i) => { const ramp = Math.min(1, (i - i0) / 12, (i0 + n - i) / 12), wall = side > 0 ? s.wl : s.wr;
                return (side > 0 ? prof : prof.slice().reverse()).map(([off, h]) => [side * (wall + off), h * ramp - 0.02]); }, (q, d, off) => [off / 6, d / 6]);
        }
        const m = g.mesh(SC.photoMat('leafy_grass', 1, 1, 0x86c060)); m.material.side = THREE.DoubleSide; m.receiveShadow = true; m.castShadow = true; group.add(m);
    }
    const onBank = (d, side, clear) => clear < 20 && BANKS.some(([from, to, s]) => s === side && inZone(d, from - 6, to + 6));

    // --- a footbridge over the Wellington Straight ---
    {
        const bd = 1520, s = T.sampleAt(bd), span = s.wl + s.wr + 6, bridge = new THREE.Group();
        SC.footbridge(bridge, span, 'FORMULA FOR VICTORY');
        const bp = T.pathAt(bd, (s.wl - s.wr) / 2, 0); bridge.position.set(bp.x, 0, bp.z); bridge.rotation.y = bp.heading + Math.PI / 2; group.add(bridge);
        group.add(SC.mergeStatic([bridge]));
    }

    // --- advertising and braking boards ---
    boards(ctx, { braking: BRAKING, skip: (d, side) => inZone(d, 5700, 280) || Math.abs(wrapD(d - 1520, L)) < 30 || onStand(STANDS, L, d, side, 0) });

    // --- the country round about: hedges along the field edges, clumps of trees, and a few inside the circuit ---
    {
        const dens = ctx.quality.density / 0.75, trees = [], hedge = [];
        const free = (x, z, gap) => {
            const nr = T.near(x, z);
            if (nr.i >= 0) {
                const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z, clear = Math.abs(lat) - (lat > 0 ? s.wl : s.wr);
                if (clear < gap) return false;
                if (onStand(STANDS, L, s.d, Math.sign(lat), clear) || onBank(s.d, Math.sign(lat), clear)) return false;
            }
            return !inPaddock(x, z) && !onRunway(x, z) && !nearLane(x, z);
        };
        // clumps of trees (copses), mostly outside the circuit
        const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2, rx = (bounds.maxX - bounds.minX) / 2, rz = (bounds.maxZ - bounds.minZ) / 2;
        for (let k = 0; k < 90; k++) {
            const x0 = cx + SC.rand(-rx, rx), z0 = cz + SC.rand(-rz, rz), r = SC.rand(25, 70), far = T.near(x0, z0).dist > 110;
            const count = Math.round(r * r / (far ? 55 : 140) * dens);
            for (let i = 0; i < count; i++) { const a = Math.random() * 6.283, q = Math.sqrt(Math.random()) * r, x = x0 + Math.cos(a) * q, z = z0 + Math.sin(a) * q; if (free(x, z, 14)) trees.push({ x, z, size: SC.rand(1.3, 2.2), shadow: T.near(x, z).dist < 80 }); }
        }
        // hedges: long straight lines of bushes with a tree here and there, like the edges of fields
        for (let k = 0; k < 46; k++) {
            const x0 = cx + SC.rand(-rx, rx), z0 = cz + SC.rand(-rz, rz), a = (Math.floor(Math.random() * 4) * Math.PI / 4) + SC.rand(-0.2, 0.2) + 0.5, len = SC.rand(180, 520);
            for (let t = 0; t < len; t += 3.4 / Math.min(1, dens)) {
                const x = x0 + Math.cos(a) * t + SC.rand(-0.6, 0.6), z = z0 + Math.sin(a) * t + SC.rand(-0.6, 0.6); if (!free(x, z, 10)) continue;
                hedge.push({ x, z, size: SC.rand(0.75, 1.05), shadow: false });
                if (Math.random() < 0.05) trees.push({ x: x + SC.rand(-1, 1), z: z + SC.rand(-1, 1), size: SC.rand(1.5, 2.3), shadow: T.near(x, z).dist < 80 });
            }
        }
        // a line of trees behind the big stands and banks softens the horizon
        for (let d = 0; d < L; d += 16) {
            const s = T.sampleAt(d); if (Math.random() > 0.3 * dens) continue;
            for (const side of [1, -1]) { const off = (side > 0 ? s.wl : s.wr) + SC.rand(45, 80), p = T.pathAt(d, side * off, 0); if (T.near(p.x, p.z).dist > off - 12 && free(p.x, p.z, 26)) trees.push({ x: p.x, z: p.z, size: SC.rand(1.4, 2.2), shadow: false }); }
        }
        SC.plantTrees(ctx, trees, SC.TREE_MIX.airfield);
        SC.plantTrees(ctx, hedge, SC.TREE_MIX.hedge, false);
        ctx.treeCount = trees.length + hedge.length;
    }
    return { update() {} };
}

// The Wing: a long modern pit building. Garages along the bottom, two floors of dark glass above, and a thin white roof
// shaped like an aircraft's wing that sweeps up to a point at one end. Built facing local -z, standing on the ground.
function buildWing(g, concrete) {
    const { len, deep } = WING, H = 11, BAY = 10;
    const front = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide, map: SC.canvasTex(256, 512, (x, w, h) => {
        // one 10 m bay, 11 m tall: the top two floors are glass, the bottom is a garage door
        x.fillStyle = '#e9ebee'; x.fillRect(0, 0, w, h);
        const glass = x.createLinearGradient(0, 0, 0, h * 0.6); glass.addColorStop(0, '#31506e'); glass.addColorStop(0.5, '#1b2f45'); glass.addColorStop(1, '#27425c');
        x.fillStyle = glass; x.fillRect(6, 22, w - 12, h * 0.6 - 30);
        x.fillStyle = 'rgba(190,220,245,0.22)'; x.beginPath(); x.moveTo(20, 22); x.lineTo(110, 22); x.lineTo(40, h * 0.6 - 8); x.lineTo(6, h * 0.6 - 8); x.fill();   // sky in the glass
        x.fillStyle = '#e9ebee'; for (let i = 1; i < 4; i++) x.fillRect(i * w / 4 - 2, 22, 4, h * 0.6 - 30); x.fillRect(0, h * 0.3 + 4, w, 9);
        x.fillStyle = '#c7cbd1'; x.fillRect(0, h * 0.6 - 10, w, 14);                                     // the balcony over the garages
        x.fillStyle = '#1E3A8A'; x.fillRect(0, h * 0.6 + 4, w, 12);                                      // a coloured band over the doors
        x.fillStyle = '#3b4048'; x.fillRect(14, h * 0.6 + 22, w - 28, h * 0.4 - 22);                     // the garage door
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; for (let y = h * 0.6 + 34; y < h; y += 14) { x.beginPath(); x.moveTo(14, y); x.lineTo(w - 14, y); x.stroke(); }
    }) });
    const panel = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.8, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.6, metalness: 0, emissive: 0xdfe3e8, emissiveIntensity: 0.28, side: THREE.DoubleSide });   // (a little of its own light, so its edges are never tinted green by the grass) roofMat.userData.snowRoof = true;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f39, roughness: 0.6, metalness: 0.4 });
    const f = new Quads(), p = new Quads(), r = new Quads(), ru = new Quads(), a = new Quads(), x0 = -len / 2, x1 = len / 2;
    f.add([x1, 0, 0], [x0, 0, 0], [x1, H, 0], [x0, H, 0], [0, 0, len / BAY, 0, 0, 1, len / BAY, 1]);                      // the front, bay after bay
    p.add([x0, 0, deep], [x1, 0, deep], [x0, H, deep], [x1, H, deep]);                                                  // the back
    p.add([x0, 0, 0], [x0, 0, deep], [x0, H, 0], [x0, H, deep]); p.add([x1, 0, deep], [x1, 0, 0], [x1, H, deep], [x1, H, 0]);   // the ends
    p.add([x0, H, 0], [x1, H, 0], [x0, H, deep], [x1, H, deep]);                                                        // the flat roof under the wing
    // the wing: a thin shell on legs, over the whole building and out over the pit lane
    const station = u => {   // u: 0 at one end, 1 at the other, up to 1.16 for the upswept tip
        const tip = smooth(1, 1.16, u), x = x0 + u * len, h = 13 + 0.7 * Math.sin(u * 9.4) + 9.5 * smooth(0.5, 1.16, u) ** 2;
        const zf = -8.5 + 15.5 * tip, zb = deep + 4 - 11 * tip;
        return { x, top: [[zf, h - 0.3], [zf + (zb - zf) * 0.15, h + 0.45], [zf + (zb - zf) * 0.5, h + 0.85], [zb, h + 0.1]], under: [[zf, h - 0.55], [zb, h - 0.25]] };
    };
    let prev = null;
    for (let k = 0; k <= 58; k++) {
        const st = station(k / 50);
        if (prev) {
            for (let j = 0; j < 3; j++) r.add([prev.x, prev.top[j][1], prev.top[j][0]], [st.x, st.top[j][1], st.top[j][0]], [prev.x, prev.top[j + 1][1], prev.top[j + 1][0]], [st.x, st.top[j + 1][1], st.top[j + 1][0]]);
            ru.add([st.x, st.under[0][1], st.under[0][0]], [prev.x, prev.under[0][1], prev.under[0][0]], [st.x, st.under[1][1], st.under[1][0]], [prev.x, prev.under[1][1], prev.under[1][0]]);
            r.add([prev.x, prev.under[0][1], prev.under[0][0]], [st.x, st.under[0][1], st.under[0][0]], [prev.x, prev.top[0][1], prev.top[0][0]], [st.x, st.top[0][1], st.top[0][0]]);   // the front edge
            r.add([st.x, st.under[1][1], st.under[1][0]], [prev.x, prev.under[1][1], prev.under[1][0]], [st.x, st.top[3][1], st.top[3][0]], [prev.x, prev.top[3][1], prev.top[3][0]]);   // the back edge
        }
        prev = st;
    }
    g.add(f.mesh(front, { castShadow: true }), p.mesh(panel, { castShadow: true }), r.mesh(roofMat, { castShadow: true }));
    g.add(ru.mesh(new THREE.MeshBasicMaterial({ color: 0xb9bec6, side: THREE.DoubleSide })));   // the underside, in its own shade (not lit green by the grass below)
    // the legs that carry the wing, along the front of the pit lane canopy
    const leg = new THREE.CylinderGeometry(0.22, 0.22, 1, 6), legs = new THREE.InstancedMesh(leg, dark, 2 * Math.floor(len / 30) + 2), m = new THREE.Matrix4(); let n = 0;
    for (let x = x0 + 10; x < x1; x += 30) for (const z of [-0.4, deep + 0.4]) { const h = station((x - x0) / len).under[0][1]; m.makeScale(1, h, 1).setPosition(x, h / 2, z); legs.setMatrixAt(n++, m); }
    legs.count = n; g.add(legs);
    // the pit lane's apron in front and the paddock behind
    a.add([x0 - 25, 0.006, -26], [x1 + 25, 0.006, -26], [x0 - 25, 0.006, 0], [x1 + 25, 0.006, 0], [0, 0, 4, 0, 0, 62, 4, 62]);
    a.add([x0 - 40, 0.006, deep], [x1 + 40, 0.006, deep], [x0 - 40, 0.006, deep + 62], [x1 + 40, 0.006, deep + 62], [0, 0, 10, 0, 0, 66, 10, 66]);
    g.add(a.mesh(concrete, { receiveShadow: true }));
    // the teams' trucks and tents in the paddock: plain boxes in a row
    const truck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 40), col = new THREE.Color(), cols = [0xf4f6f8, 0x1E3A8A, 0xE10600, 0x2a2f39, 0xFFB300, 0x00A86B, 0xf4f6f8];
    n = 0;
    for (let x = x0 + 12; x < x1 - 8 && n < 40; x += SC.rand(13, 19)) { const big = Math.random() < 0.6; m.makeScale(big ? 3 : 7, big ? 4.1 : 3.2, big ? 16 : 9).setPosition(x, 0, deep + (big ? 24 : 20) + SC.rand(-1, 1)); truck.setMatrixAt(n, m); truck.setColorAt(n++, col.set(cols[Math.floor(Math.random() * cols.length)])); }
    truck.count = n; truck.castShadow = true; g.add(truck);
}
