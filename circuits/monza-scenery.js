// Formula for Victory: what stands around the Monza circuit. All made in code (plus the shared tree pictures, grandstand
// and pit building parts): the royal park's tall trees, the pit building with the podium out over the pit lane, the
// grandstands on the start straight and round the Parabolica, the old banked oval curving through the trees and
// crossing over the track on its bridge, advertising boards for made-up brands, and braking boards before the chicanes.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [
    [5642, 1, 240, 10, 3.5], [112, 1, 240, 10, 3.5],                              // the main straight, opposite the pits
    [4880, 1, 70, 7, 4], [4962, 1, 70, 7, 4], [5044, 1, 70, 7, 4], [5126, 1, 70, 7, 4],   // round the outside of the Parabolica (close together, so the gaps between them are small)
    [800, 1, 60, 7, 4], [1150, 1, 50, 7, 4], [1300, 1, 50, 7, 4], [1838, -1, 60, 7, 4], [2262, 1, 60, 7, 4], [2590, 1, 40, 7, 4], [3728, -1, 60, 7, 4]
];
const PIT = { from: 5300, to: 150, d: 5690, sections: 30, front: 27, deep: 82 };   // the pit building's front is 27 m from the middle of the road
const BRAKING = [622, 1840, 2199, 3712, 4818];                                     // where the big stops are: boards at 300, 200 and 100 m before

class Quads {
    constructor() { this.pos = []; this.uv = []; this.idx = []; }
    add(a, b, c, d, uv = [0, 0, 1, 0, 0, 1, 1, 1]) { const k = this.pos.length / 3; this.pos.push(...a, ...b, ...c, ...d); this.uv.push(...uv); this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    mesh(mat) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setIndex(this.idx); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
    }
}

export function monzaScenery(ctx) {
    const { T, group } = ctx, { samples, N, trackLen } = T, L = trackLen;
    const inZone = (d, a, b) => a <= b ? d >= a && d <= b : d >= a || d <= b;
    const wallAt = (s, side) => side > 0 ? s.wl : s.wr;

    // --- the ground, and the Alps far away to the north ---
    // (the grass carries on well past where the haze swallows it; the far woods and the Alps are painted on the horizon:
    // see 'backdrop' in monza.js)
    const { bounds } = ctx, gw = bounds.maxX - bounds.minX + 5200, gd = bounds.maxZ - bounds.minZ + 5200;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), SC.photoMat('leafy_grass', gw / 9, gd / 9, 0x8fd06a));
    grass.rotation.x = -Math.PI / 2; grass.position.set((bounds.minX + bounds.maxX) / 2, -0.06, (bounds.minZ + bounds.maxZ) / 2); grass.receiveShadow = true; group.add(grass);

    // --- the pits and paddock: a wide apron of asphalt, the pit lane's lines, the pit building and the podium ---
    {
        const apron = new Quads(), lines = new Quads(), plen = ((PIT.to - PIT.from) % L + L) % L;
        let prev = null;
        for (let k = 0; k <= plen; k += 10) {
            const d = PIT.from + k, s = T.sampleAt(d), ramp = Math.min(1, k / 90, (plen - k) / 90);
            const a = T.pathAt(d, -(s.wr + 0.35), 0), b = T.pathAt(d, -(s.wr + 0.35 + (PIT.deep - s.wr) * ramp), 0);
            const row = { a: [a.x, 0.0, a.z], b: [b.x, 0.0, b.z], k };
            if (prev) apron.add(prev.a, prev.b, row.a, row.b, [0, prev.k / 6, 12, prev.k / 6, 0, k / 6, 12, k / 6]);
            // the pit lane: a white line each side, where the lane runs level with the road
            if (prev && k > 100 && k < plen - 110) for (const lat of [-13.2, -23.4]) {
                const p0 = T.pathAt(d - 10, lat, 0), p1 = T.pathAt(d - 10, lat - 0.18, 0), p2 = T.pathAt(d, lat, 0), p3 = T.pathAt(d, lat - 0.18, 0);
                lines.add([p0.x, 0.012, p0.z], [p1.x, 0.012, p1.z], [p2.x, 0.012, p2.z], [p3.x, 0.012, p3.z]);
            }
            prev = row;
        }
        const apronMat = SC.photoMat('asphalt_02', 1, 1, 0xc9ccd2, 0.9); apronMat.side = THREE.DoubleSide;
        const am = apron.mesh(apronMat); am.receiveShadow = true; group.add(am);
        group.add(lines.mesh(new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })));
        const pits = SC.pitBuilding(PIT.sections);
        SC.placeBeside(ctx, pits, PIT.d, -PIT.front); pits.userData.far = 950; pits.userData.noProbe = true;
        group.add(SC.mergeStatic([pits]));          // (about thirty pieces drawn as ten)
        // the podium: Monza's stands out from the pit building, high over the pit lane
        const pod = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: 0x232831, roughness: 0.6, metalness: 0.3 });
        const box = (w, h, dp, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; pod.add(m); return m; };
        box(18, 0.5, 11, 0, 5.6, -5.5, white);                                             // the deck (local -z is towards the track)
        box(18, 0.9, 0.12, 0, 6.3, -10.95, dark);                                          // the front rail
        for (const x of [-8.6, 8.6]) { box(0.5, 5.4, 0.5, x, 2.7, -10.4, dark); box(0.12, 0.9, 11, x * 1.045, 6.3, -5.5, dark); }
        const gold = new THREE.MeshStandardMaterial({ color: 0xFFB300, roughness: 0.5 }), silver = new THREE.MeshStandardMaterial({ color: 0xC9CED6, roughness: 0.5 }), bronze = new THREE.MeshStandardMaterial({ color: 0xC98A4B, roughness: 0.5 });
        box(2.4, 1.3, 2.2, 0, 6.5, -5, gold); box(2.4, 0.95, 2.2, -2.5, 6.3, -5, silver); box(2.4, 0.65, 2.2, 2.5, 6.17, -5, bronze);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.6), new THREE.MeshStandardMaterial({ roughness: 0.7, map: SC.canvasTex(1024, 256, (x, w, h) => {
            x.fillStyle = '#12151b'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#f4f4f0' : '#12151b'; x.fillRect(i * 32, j * 16, 32, 16); x.fillRect(i * 32, h - 32 + j * 16, 32, 16); }
            x.fillStyle = '#009246'; x.fillRect(0, 40, w / 3, 10); x.fillStyle = '#f4f4f0'; x.fillRect(w / 3, 40, w / 3, 10); x.fillStyle = '#CE2B37'; x.fillRect(w * 2 / 3, 40, w / 3, 10);
            x.fillStyle = '#f4f4f0'; x.font = '900 104px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MONZA', w / 2, h / 2 + 4);
            x.font = '700 30px Orbitron, Arial Black, sans-serif'; x.fillStyle = '#FFB300'; x.fillText('FORMULA FOR VICTORY  ·  GRAND PRIX', w / 2, h - 58);
        }, false) }));
        back.rotation.y = Math.PI; back.position.set(0, 8.15, -1.2); pod.add(back);
        box(18.2, 4.8, 0.2, 0, 8.15, -1.08, dark);
        SC.placeBeside(ctx, pod, -9, -PIT.front);
        group.add(SC.mergeStatic([pod]));
    }

    // --- grandstands (neighbouring stands are then drawn together, as one) ---
    const stands = [];
    for (const [d, side, len, rows, gap] of STANDS) {
        const s = T.sampleAt(d);
        const st = SC.grandstand(ctx, d, side * (wallAt(s, side) + gap), len, rows, rows >= 9 ? 0x1f6b45 : [0xCE2B37, 0xf1f1ec, 0x1f6b45][Math.round(d / 80) % 3]);
        st.userData.far = 950;   // (not drawn from further away than this: by then the trees hide it)
        st.userData.noProbe = true;
        st.children.forEach((part, i) => { if (part.isInstancedMesh && i < 2) part.castShadow = false; });   // only the roof casts a shadow (the terraces and steelwork are a lot of triangles to draw twice)
        stands.push({ st, d });
    }
    while (stands.length) {
        const first = stands.shift(), near = [first.st];
        for (let i = stands.length - 1; i >= 0; i--) if (Math.abs(wrapD(stands[i].d - first.d, L)) < 420) near.push(stands.splice(i, 1)[0].st);
        group.add(SC.mergeStatic(near));
    }

    // --- the old banked oval (the 'Sopraelevata'), from the map ---
    const ovalNear = oldBanking(ctx);

    // --- a footbridge with a banner, on the run down to the first chicane ---
    {
        const bd = 395, s = T.sampleAt(bd), span = s.wl + s.wr + 6, bridge = new THREE.Group();
        SC.footbridge(bridge, span, 'FORMULA FOR VICTORY');
        const bp = T.pathAt(bd, (s.wl - s.wr) / 2, 0); bridge.position.set(bp.x, 0, bp.z); bridge.rotation.y = bp.heading + Math.PI / 2; group.add(bridge);
        group.add(SC.mergeStatic([bridge]));
    }

    // --- advertising boards for made-up brands, behind the barrier on the straights; braking boards before the big stops ---
    {
        const faces = new Quads(), backs = new Quads(), nums = new Quads(), NB = SC.BRANDS.length;
        const board = (q, d, lat, w, y0, y1, uv, backToo = true) => {
            const c = T.pathAt(d, lat, 0), ax = Math.cos(c.heading) * w / 2, az = -Math.sin(c.heading) * w / 2, sg = Math.sign(lat);
            // (written so the picture reads the right way round from the track)
            const p = (k, y) => [c.x + ax * k * sg, y, c.z + az * k * sg];
            q.add(p(-1, y0), p(1, y0), p(-1, y1), p(1, y1), uv || [0, 0, 1, 0, 0, 1, 1, 1]);
            if (backToo) { const n = T.sampleAt(d).n, o = 0.07 * sg, b = (k, y) => [c.x + ax * k * sg + n.x * o, y, c.z + az * k * sg + n.z * o]; backs.add(b(1, y0 - 0.7), b(-1, y0 - 0.7), b(1, y1 + 0.05), b(-1, y1 + 0.05)); }
        };
        let k = 0;
        for (let d = 40; d < L - 20; d += 78) {
            const s = T.sampleAt(d); if (Math.abs(s.ks) > 0.003) continue;
            const side = k % 2 ? 1 : -1; k++;
            if (inZone(d, 5200, 600) || STANDS.some(([sd, ss, len]) => ss === side && Math.abs(wrapD(d - sd, L)) < len / 2 + 12)) continue;
            if (side < 0 && inZone(d, 3270, 3350) || side > 0 && inZone(d, 3270, 3350)) continue;
            const b = k % NB, v0 = 1 - (b + 1) / NB, v1 = 1 - b / NB;   // (every brand's picture is one strip of the same picture)
            board(faces, d, side * (wallAt(s, side) + 0.9), 7, 0.75, 2.05, [0, v0, 1, v0, 0, v1, 1, v1]);
        }
        const fm = faces.mesh(new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, map: SC.canvasTex(512, 96 * NB, (x, w) => {
            SC.BRANDS.forEach(([text, bg, fg], i) => {
                const y = i * 96; x.fillStyle = bg; x.fillRect(0, y, w, 96); x.fillStyle = fg; x.font = '900 54px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
                const tw = x.measureText(text).width; if (tw > w - 24) x.font = `900 ${Math.floor(54 * (w - 24) / tw)}px Arial Black, Arial`; x.fillText(text, w / 2, y + 48 + 3);
            });
        }, false) }));
        fm.castShadow = true; group.add(fm);
        // braking boards: 300, 200, 100
        for (const at of BRAKING) [300, 200, 100].forEach((m, j) => {
            const d = at - m, s = T.sampleAt(d);
            for (const side of [1, -1]) board(nums, d, side * (wallAt(s, side) + 0.7), 1.5, 0.9, 2.5, [j / 3, 0, (j + 1) / 3, 0, j / 3, 1, (j + 1) / 3, 1]);
        });
        const nm = nums.mesh(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: SC.canvasTex(384, 128, (x, w, h) => {
            x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h);
            ['300', '200', '100'].forEach((t, j) => { x.fillStyle = '#111'; x.fillRect(j * 128, 0, 4, h); x.font = '900 60px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, j * 128 + 66, h / 2 + 4); });
        }, false) }));
        group.add(nm);
        const bm = backs.mesh(new THREE.MeshStandardMaterial({ color: 0x2a2f39, roughness: 0.8, side: THREE.DoubleSide })); bm.castShadow = true; group.add(bm);
    }

    // --- the park: tall trees close round the track, thinning out further away ---
    {
        const dens = ctx.quality.density, cell = 10, spots = [];
        const blocked = (x, z) => {
            const nr = T.near(x, z);
            if (nr.i < 0) return Math.random() > 0.08 * dens / 0.75;                // far from the track: only a few
            const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z, clear = Math.abs(lat) - (lat > 0 ? s.wl : s.wr);
            if (clear < 5) return true;
            const d = s.d;
            if (lat < 0 && lat > -(PIT.deep + 8) && inZone(d, PIT.from - 20, PIT.to + 20)) return true;      // the pits and paddock
            for (const [sd, ss, len, rows, gap] of STANDS) if (Math.sign(lat) === ss && Math.abs(wrapD(d - sd, L)) < len / 2 + 8 && clear < gap + rows * 0.9 + 9) return true;
            if (ovalNear(x, z)) return true;
            const keep = clear < 60 ? 0.8 : clear < 160 ? 0.25 : 0.1;
            return Math.random() > keep * dens / 0.75;
        };
        for (let x = bounds.minX - 60; x < bounds.maxX + 60; x += cell) for (let z = bounds.minZ - 60; z < bounds.maxZ + 60; z += cell) {
            const px = x + Math.random() * cell, pz = z + Math.random() * cell;
            if (blocked(px, pz)) continue;
            const close = T.near(px, pz).dist < 70;
            spots.push({ x: px, z: pz, size: SC.rand(1.7, 2.7), shadow: close, shade: close ? 1 : SC.rand(0.66, 0.84) });   // (trees deeper in the wood are in each other's shade)
        }
        // all planted at once: one drawing for each kind of tree (each tree is only a flat picture, so the thousands out of
        // sight cost far less than asking the tablet to draw dozens of separate patches of wood)
        SC.plantTrees(ctx, spots, SC.TREE_MIX.park);
        ctx.treeCount = spots.length;
    }
    return { update() {} };
}
const wrapD = (d, L) => { d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };

// The old banked oval. It follows the mapped line, tilting up to about 35 degrees in its two long curves, and it is
// lifted onto a bridge where it crosses over the Grand Prix track (after the Serraglio kink). Where the old track runs
// right beside today's start straight it is left out. Returns a test: is this spot on or right beside the banking?
function oldBanking(ctx) {
    const { T, group } = ctx, HALF = 4.6, mark = new Map(), key = (x, z) => Math.floor(x / 14) * 100003 + Math.floor(z / 14);
    // old, weathered concrete: cast in slabs, streaked by sixty years of rain
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, map: SC.canvasTex(256, 256, (x, w, h) => {
        x.fillStyle = '#a9a496'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) { const g = 120 + Math.random() * 70; x.fillStyle = `rgba(${g},${g - 4},${g - 16},0.35)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
        for (let i = 0; i < 26; i++) { const u = Math.random() * w, len = 40 + Math.random() * 200; const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(40,38,30,0.32)'); g.addColorStop(1, 'rgba(40,38,30,0)'); x.fillStyle = g; x.fillRect(u, 0, 3 + Math.random() * 9, len); }
        for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(70,84,50,${0.08 + Math.random() * 0.12})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 10 + Math.random() * 30, 0, 0, 7); x.fill(); }   // moss
        x.fillStyle = 'rgba(30,30,28,0.55)'; x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h);                     // the joints between slabs
    }) });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.85, side: THREE.DoubleSide });
    for (const flat of ctx.circuit.geo.extras.oval || []) {
        const P = []; for (let i = 0; i < flat.length; i += 2) P.push([flat[i], flat[i + 1]]);
        const n = P.length, head = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; return Math.atan2(-(b[1] - a[1]), b[0] - a[0]); });
        const kRaw = head.map((h, i) => { const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3); return wrapAngle(head[b] - head[a]) / ((b - a) * 6 || 1); });
        const k = kRaw.map((v, i) => { let sum = 0, c = 0; for (let j = -4; j <= 4; j++) if (kRaw[i + j] !== undefined) { sum += kRaw[i + j]; c++; } return sum / c; });
        // where it crosses the track: the nearest point of the oval to the track, away from the oval's two ends
        let ic = -1, best = 30;
        for (let i = Math.floor(n * 0.15); i < n * 0.85; i++) { const dd = T.nearTrack(P[i][0], P[i][1]); if (dd < best) { best = dd; ic = i; } }
        const surf = new Quads(), rail = new Quads(), under = new Quads(); let prev = null;
        for (let i = 0; i < n; i++) {
            const [x, z] = P[i], nx = -Math.sin(head[i]), nz = -Math.cos(head[i]);           // to the left of the old track's direction
            const nr = T.near(x, z), s = nr.i >= 0 ? T.samples[nr.i] : null, lift = ic < 0 ? 0 : 6.8 * smooth(0, 1, 1 - Math.abs(i - ic) * 6 / 190);
            const lat = s ? Math.abs((x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z) : 999, wall = s ? Math.max(s.wl, s.wr) : 0;
            if (s && lat < wall + 9 && lift < 6) { prev = null; continue; }               // beside today's track: nothing left of it here
            const rise = 2 * HALF * Math.tan(0.62 * smooth(0.0006, 0.0026, Math.abs(k[i])));
            const hl = 0.12 + lift + (k[i] < 0 ? rise : 0), hr = 0.12 + lift + (k[i] > 0 ? rise : 0), over = s && lat < wall + 1.2;   // 'over': the bridge itself
            const row = { l: [x + nx * HALF, hl, z + nz * HALF], r: [x - nx * HALF, hr, z - nz * HALF], hl, hr, over, v: i * 6 / 4 };
            mark.set(key(x, z), 1);
            if (prev) {
                const uv = (u0, u1) => [u0, prev.v, u1, prev.v, u0, row.v, u1, row.v], down = (p, y) => [p[0], y, p[2]];
                surf.add(prev.l, prev.r, row.l, row.r, uv(0, 2.3));
                for (const e of ['l', 'r']) {
                    const h0 = prev['h' + e], h1 = row['h' + e];
                    // the wall down to the ground under each edge (on the bridge: just the deck's own depth)
                    if (Math.max(h0, h1) > 0.4) { const b0 = prev.over || row.over ? h0 - 0.9 : -0.1, b1 = prev.over || row.over ? h1 - 0.9 : -0.1; surf.add(down(prev[e], b0), prev[e], down(row[e], b1), row[e], uv(0, Math.max(h0, h1) / 4)); }
                    if (Math.max(h0, h1) > 1.2) rail.add(prev[e], down(prev[e], h0 + 0.75), row[e], down(row[e], h1 + 0.75));   // the old guard wall along a high edge
                }
                if (prev.over || row.over) under.add(down(prev.l, prev.hl - 0.9), down(prev.r, prev.hr - 0.9), down(row.l, row.hl - 0.9), down(row.r, row.hr - 0.9), uv(0, 2.3));   // the underside
            }
            prev = row;
        }
        const m = surf.mesh(mat); m.castShadow = m.receiveShadow = true; group.add(m);
        const r = rail.mesh(railMat); r.castShadow = true; group.add(r);
        // the underside of the bridge: in its own shade, a dark stained grey (not lit green by the grass below)
        if (under.idx.length) group.add(under.mesh(new THREE.MeshStandardMaterial({ map: mat.map, color: 0x6a665e, roughness: 1, side: THREE.DoubleSide })));
    }
    return (x, z) => { for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) if (mark.has(key(x + ax * 14, z + az * 14))) return true; return false; };
}
