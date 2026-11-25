// Formula for Victory: what stands around the Monaco circuit. All made in code (plus the shared grandstand parts and tree
// pictures): a harbour town on a steep hillside. The ground follows the road up the hill and back down to the sea; the
// streets are lined with apartment blocks behind a strip of pavement; the casino stands in its square at the top with
// gardens and palm trees; the big hotel sits over the tunnel by the hairpin; and along the quay there is the harbour
// with its yachts, and the swimming pool that the track swerves round.
// Everything is baked into a few big pieces (one picture for every building's walls, one plain-coloured piece each for
// the palms, the yachts and the rest), so a tablet has very little to draw.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';
import { Geo, sweep } from '../track.js';
import { seaFogColour } from '../backdrop.js';
import { Quads, smooth, wrapD, inZone, buildStands, onStand, boards, ribbon } from './common.js';

const PAVE = 3, QUAY = 4;                       // how wide the pavement behind the barrier is, and the quay beside the water
// grandstands: [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall]
const STANDS = [[3175, 1, 90, 10, 2.6], [3270, 1, 60, 7, 2.6], [2225, -1, 80, 7, 3], [2315, -1, 50, 7, 3], [2462, -1, 60, 7, 3], [118, 1, 50, 7, 2.6]];
const BRAKING = [198, 1113, 2079];
const CASINO = { from: 846, to: 948, at: 896, back: 19 };      // the square in front of the casino, on the left
const GARDEN = { from: 866, to: 962 };                         // the gardens across the road from it, on the right
const POOL = { at: 2632, len: 50, wide: 21, out: 27 };         // the swimming pool, on the right of the two fast flicks
const PITS = { from: 3214, to: 3302, out: 15.5, deep: 7 };     // the pit garages, on the right of the start straight
const HOTEL = { from: 1532, to: 1716, floors: 8 };             // the hotel built over the tunnel

export function monacoScenery(ctx) {
    const { T, group } = ctx, { samples, N, trackLen: L } = T, dens = ctx.quality.density;
    const at = d => T.sampleAt(d), wallOf = (s, side) => side > 0 ? s.wl : s.wr;
    const R = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
    const [t0, t1] = ctx.circuit.tunnels[0], TH = ctx.circuit.tunnelHeight;
    const seaFog = { value: new THREE.Color(0x8fb9d0) };

    // =================================================================
    //  THE LIE OF THE LAND
    // =================================================================
    // the water: everything to the left of the road from Portier, past the tunnel and the chicane, along the quay to
    // La Rascasse, and out to sea
    const coast = [];
    for (let d = 1446; d <= 2894; d += 6) { const s = at(d), off = s.wl + (s.roofed ? 7 : QUAY); coast.push([s.p.x + s.n.x * off, s.p.z + s.n.z * off]); }
    { const a = coast[coast.length - 1], b = coast[0]; coast.push([a[0] + 500, a[1] + 110], [a[0] + 3200, a[1] + 110], [a[0] + 3200, b[1] - 3200], [b[0] + 2300, b[1] - 2000]); }
    const inWater = (x, z) => { let inside = false; for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) { const a = coast[i], b = coast[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
    // every third sample, for working out the height of the land between the roads; and all of them in a grid, for
    // finding the roads near a spot
    const ix = [], CELLS = new Map(), CS = 26, ck = (cx, cz) => cx * 100003 + cz;
    for (let i = 0; i < N; i += 3) ix.push(i);
    samples.forEach((s, i) => { const k = ck(Math.floor(s.p.x / CS), Math.floor(s.p.z / CS)); if (!CELLS.has(k)) CELLS.set(k, []); CELLS.get(k).push(i); });
    const roadsNear = (x, z, f) => { const cx = Math.floor(x / CS), cz = Math.floor(z / CS); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = CELLS.get(ck(cx + a, cz + b)); if (l) for (const i of l) f(samples[i], i); } };
    // The height of the ground at any spot: between the roads it slopes from one road's height to the next; behind the
    // town it climbs towards the mountains; south of the harbour stands the Rock; and close to a road it is always a
    // little below the road, so nothing ever pokes up through the pavement.
    // (flat places that are dug level into the slope: the swimming pool's terrace)
    const spot = (d, side, out) => { const p = T.pathAt(d, side * out, 0); return { x: p.x, y: p.y, z: p.z, heading: p.heading + (side > 0 ? Math.PI : 0) }; };
    const pads = [{ ...spot(POOL.at, -1, at(POOL.at).wr + POOL.out), w: POOL.len + 14, dp: POOL.wide + 12 }];
    // (the ground is built out to LM metres beyond the track; over the last stretch it comes down to the level of the
    // country beyond, so it never ends in a cliff)
    // how far each spot is from the water (worked out once on a grid): close to the shore the land comes down to the sea
    const TB = T.box, LM = 230, SG = 8, sx0 = TB.minX - LM - SG, sz0 = TB.minZ - LM - SG, snx = Math.ceil((TB.maxX - TB.minX + 2 * LM) / SG) + 3, snz = Math.ceil((TB.maxZ - TB.minZ + 2 * LM) / SG) + 3, shoreD = new Float32Array(snx * snz);
    {
        for (let j = 0; j < snz; j++) for (let i = 0; i < snx; i++) shoreD[j * snx + i] = inWater(sx0 + i * SG, sz0 + j * SG) ? 0 : 1e4;
        const relax = (i, j, di, dj, w) => { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < snx && b < snz) { const v = shoreD[b * snx + a] + w; if (v < shoreD[j * snx + i]) shoreD[j * snx + i] = v; } };
        for (let j = 0; j < snz; j++) for (let i = 0; i < snx; i++) { relax(i, j, -1, 0, SG); relax(i, j, 0, -1, SG); relax(i, j, -1, -1, SG * 1.414); relax(i, j, 1, -1, SG * 1.414); }
        for (let j = snz - 1; j >= 0; j--) for (let i = snx - 1; i >= 0; i--) { relax(i, j, 1, 0, SG); relax(i, j, 0, 1, SG); relax(i, j, 1, 1, SG * 1.414); relax(i, j, -1, 1, SG * 1.414); }
    }
    const toShore = (x, z) => { const i = Math.round((x - sx0) / SG), j = Math.round((z - sz0) / SG); return i < 0 || j < 0 || i >= snx || j >= snz ? 1e4 : shoreD[j * snx + i]; };
    const fromEdge = (x, z) => Math.min(x - TB.minX + LM, TB.maxX + LM - x, z - TB.minZ + LM, TB.maxZ + LM - z);
    function land(x, z, info) {
        let sw = 0, sy = 0, best = -1, bd = Infinity;
        for (const i of ix) { const p = samples[i].p, dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz, w = 1 / ((d2 + 90) * (d2 + 90)); sw += w; sy += w * p.y; if (d2 < bd) { bd = d2; best = i; } }
        const s = samples[best], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z, dist = Math.sqrt(bd);
        if (info) { info.s = s; info.lat = lat; info.dist = dist; }
        if (inWater(x, z)) return -4;
        let y = sy / sw;
        if (lat > 0 && (s.d > 3040 || s.d < 1190)) y += Math.min(120, 0.2 * Math.max(0, dist - 42));     // the hillside behind the town
        if (lat > 0 && s.d > 2850 && s.d <= 3040) y += 46 * smooth(34, 120, dist);                      // the Rock
        y = 0.6 + (y - 0.6) * smooth(0, 150, fromEdge(x, z));
        y = Math.min(y, 1.5 + 0.75 * toShore(x, z));                                                    // a rocky bank down to the sea, not a wall
        for (const p of pads) { const c = Math.cos(p.heading), sn = Math.sin(p.heading), lx = (x - p.x) * c - (z - p.z) * sn, lz = (x - p.x) * sn + (z - p.z) * c; if (Math.abs(lx) < p.w / 2 + 6 && Math.abs(lz) < p.dp / 2 + 6) y = Math.min(y, p.y - 0.2); }
        roadsNear(x, z, r => { const dx = x - r.p.x, dz = z - r.p.z, reach = Math.max(r.wl, r.wr) + PAVE + 12; if (dx * dx + dz * dz < reach * reach) y = Math.min(y, r.p.y - 0.4); });
        return y;
    }
    // where a spot is beside the track: which part of the lap, which side, and how far beyond the wall
    const beside = (x, z) => { const nr = T.near(x, z); if (nr.i < 0) return null; const s = samples[nr.i], lat = (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z; return { s, lat, side: lat > 0 ? 1 : -1, clear: Math.abs(lat) - (lat > 0 ? s.wl : s.wr) }; };

    // --- the sea ---
    {
        const b = T.box, sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshStandardMaterial({ color: 0x1d6f9c, roughness: 0.16, metalness: 0.25, map: SC.canvasTex(256, 256, (x, w, h) => {
            x.fillStyle = '#9fc4d8'; x.fillRect(0, 0, w, h);
            for (let i = 0; i < 520; i++) { x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,90,120'},${0.05 + Math.random() * 0.13})`; x.lineWidth = 1 + Math.random(); const u = Math.random() * w, v = Math.random() * h, len = 8 + Math.random() * 26; x.beginPath(); x.moveTo(u, v); x.quadraticCurveTo(u + len / 2, v - 2 - Math.random() * 2, u + len, v); x.stroke(); }
        }) }));
        sea.material.map.repeat.set(260, 260);
        sea.rotation.x = -Math.PI / 2; sea.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2); sea.receiveShadow = true; group.add(sea);
        // far out, the sea fades into its own hazy blue (not the pale haze of the sky), so there is a sea horizon; the
        // painted horizon carries on in the same colour beyond the end of this sheet of water (see 'sea' in monaco.js)
        sea.material.onBeforeCompile = sh => {
            sh.uniforms.seaFog = seaFog;
            sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 seaFog;')
                .replace('#include <fog_fragment>', '#ifdef USE_FOG\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, seaFog, smoothstep( fogNear, fogFar, vFogDepth ) );\n#endif');
        };
    }
    // --- the land: a mesh of ground following the roads' heights, rising at its inland edges into the mountains behind the town ---
    {
        const b = T.box, M = LM, CELL = 8, x0 = b.minX - M, z0 = b.minZ - M, nx = Math.ceil((b.maxX - b.minX + 2 * M) / CELL), nz = Math.ceil((b.maxZ - b.minZ + 2 * M) / CELL);
        const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), idx = [], info = {}, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        const c = new THREE.Color(), paving = new THREE.Color(0x77726a), town = new THREE.Color(0x746f66), scrub = new THREE.Color(0x5f7048), rock = new THREE.Color(0x8b8c87), seabed = new THREE.Color(0x35657c);
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
            const x = x0 + i * CELL, z = z0 + j * CELL, y = land(x, z, info), k = (j * (nx + 1) + i) * 3;
            if (y < 0) c.copy(seabed);
            else {
                c.copy(info.dist < 70 ? paving : town).lerp(scrub, smooth(150, 300, info.dist)).lerp(rock, smooth(30, 60, y - info.s.p.y) * 0.8);
                if (info.dist > 40) c.lerp(rock, 0.7 * smooth(34, 6, toShore(x, z)));   // pale rock along the shore
                c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
            }
            pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
            if (i < nx && j < nz) { const q = j * (nx + 1) + i; idx.push(q, q + nx + 1, q + 1, q + 1, q + nx + 1, q + nx + 2); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); m.receiveShadow = true; group.add(m);
        // beyond the edge of that mesh the land carries on, flat and far below the mountains (seen only from the air)
        {
            const q = new Quads(), far = 3200, z1 = z0 + nz * CELL, x1 = x0 + nx * CELL, cb = coast[0], xn = cb[0] + 2300 * (cb[1] - z0) / 2000, y = 0.6;
            q.add([x0 - far, y, z0 - far], [x0 + 12, y, z0 - far], [x0 - far, y, z1 + far], [x0 + 12, y, z1 + far]);                      // inland, to the west
            q.add([x0, y, z0 - far], [xn + 2300 * far / 2000, y, z0 - far], [x0, y, z0 + 12], [xn, y, z0 + 12]);                        // along the coast to the north
            q.add([x0, y, z1 - 12], [x1, y, z1 - 12], [x0, y, z1 + far], [x1, y, z1 + far]);                                            // beyond the Rock, to the south
            const fm = q.mesh(new THREE.MeshStandardMaterial({ color: 0x6f7a5c, roughness: 1, side: THREE.DoubleSide })); fm.userData.always = true; group.add(fm);
        }
        // The hills behind the town: a long smooth slope round the landward side, climbing away into the haze. (The real
        // mountains above it, the cliffs and the upper town are painted on the horizon: see 'backdrop' in monaco.js.)
        const seg = 96, rings = [[470, 0], [760, 0.5], [1080, 0.85], [1500, 1], [1950, 0.5]], mp = [], mc = [], mi = [], lowC = new THREE.Color(0x6f7654), midC = new THREE.Color(0x5d7048), highC = new THREE.Color(0x7d8468);
        for (let i = 0; i <= seg; i++) {
            const u = i / seg, a = 2.35 + u * 2.9, fade = smooth(0, 0.16, u) * smooth(0, 0.16, 1 - u);   // from the south-west, round by the north-west, to the north
            const h = (150 + 46 * Math.sin(a * 3 + 1) + 26 * Math.sin(a * 7 + 2) + 12 * Math.sin(a * 13)) * fade;
            rings.forEach(([r, k], j) => {
                const rr = r + 40 * Math.sin(a * 5 + j);
                mp.push(cx + Math.cos(a) * rr, j ? h * k - 9 * (1 - fade) : -9, cz + Math.sin(a) * rr);   // (its two ends sink out of sight, below the sea)
                c.copy(j < 2 ? lowC : j < 3 ? midC : highC).offsetHSL(0, 0, 0.03 * Math.sin(a * 17 + j * 2)); mc.push(c.r, c.g, c.b);
                if (i < seg && j < rings.length - 1) { const q = i * rings.length + j; mi.push(q, q + 1, q + rings.length, q + 1, q + rings.length + 1, q + rings.length); }
            });
        }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3)); mg.setIndex(mi); mg.computeVertexNormals();
        const mm = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })); mm.userData.always = true; mm.userData.backdrop = true; group.add(mm);
    }

    // =================================================================
    //  THE STREETS: pavements, retaining walls and the quay
    // =================================================================
    // how far out the pavement's edge is on each side (on the inside of a tight corner there is only room for a little)
    const kMax = i => { let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(samples[(i + j + N) % N].k)); return k; };
    const paveEdge = (s, i, side) => {
        const wall = wallOf(s, side), water = side > 0 && inZone(s.d, 1446, 2894);
        let out = wall + (water ? QUAY : PAVE);
        if (Math.sign(s.ks) === side) out = Math.min(out, Math.max(wall + 0.35, 0.82 / Math.max(kMax(i), 1e-4)));
        return out;
    };
    const stone = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: SC.canvasTex(128, 128, (x, w, h) => {
        x.fillStyle = '#8a857b'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 700; i++) { const g = 108 + Math.random() * 50; x.fillStyle = `rgba(${g},${g - 4},${g - 14},0.4)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        x.strokeStyle = 'rgba(70,66,58,0.35)'; x.lineWidth = 1; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke(); }
    }) });
    {
        const g = new Geo();
        sweep(T, g, 0, N, 1, (s, i) => { if (s.roofed) return null; const o = paveEdge(s, i % N, 1); return [[o, -9], [o, 0.12], [o, 0.12], [s.wl + 0.2, 0.12]]; }, (q, d, off, h) => [(off + h) / 2.4, d / 2.4]);
        sweep(T, g, 0, N, 1, (s, i) => { if (s.roofed) return null; const o = paveEdge(s, i % N, -1); return [[-s.wr - 0.2, 0.12], [-o, 0.12], [-o, 0.12], [-o, -9]]; }, (q, d, off, h) => [(off - h) / 2.4, d / 2.4]);
        const m = g.mesh(stone); m.receiveShadow = true; m.userData.always = true; group.add(m);
    }

    // =================================================================
    //  THE TUNNEL: a concrete box over the road, lit by its own lamps, with the hotel built on top
    // =================================================================
    const i0 = T.indexAt(t0), i1 = T.indexAt(t1), glare = [];
    {
        const inside = new Geo(), shell = new Geo(), IN = 0.55, OUT = 1.7, TOP = TH + 1.0;
        sweep(T, inside, i0, i1, 2, s => [[-(s.wr + IN), 0], [-(s.wr + IN), TH], [-(s.wr + IN), TH], [s.wl + IN, TH], [s.wl + IN, TH], [s.wl + IN, 0]], (q, d) => [d / 9, [0, 0.36, 0.38, 0.62, 0.64, 1][q]]);
        sweep(T, shell, i0, i1, 2, s => [[-(s.wr + OUT), -9], [-(s.wr + OUT), TOP], [-(s.wr + OUT), TOP], [s.wl + OUT, TOP], [s.wl + OUT, TOP], [s.wl + OUT, -9]], (q, d, off, h) => [d / 5, (off + h) / 5], true);
        // each mouth: the wall round the opening, and a sheet of white light across it (see update below)
        const concrete = new THREE.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.95, side: THREE.DoubleSide, map: stone.map });
        const mouths = new Quads();
        for (const [i, sign] of [[i0, 1], [i1, -1]]) {
            const s = samples[i], P = (off, h) => [s.p.x + s.n.x * off, s.p.y + h, s.p.z + s.n.z * off];
            mouths.add(P(-(s.wr + OUT), -3), P(-(s.wr + IN), -3), P(-(s.wr + OUT), TOP), P(-(s.wr + IN), TOP));
            mouths.add(P(s.wl + IN, -3), P(s.wl + OUT, -3), P(s.wl + IN, TOP), P(s.wl + OUT, TOP));
            mouths.add(P(-(s.wr + IN), TH), P(s.wl + IN, TH), P(-(s.wr + IN), TOP), P(s.wl + IN, TOP));
            const sheet = new THREE.Mesh(new THREE.PlaneGeometry(s.wl + s.wr + IN * 2, TH), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide }));
            const mid = P((s.wl - s.wr) / 2, TH / 2); sheet.position.set(mid[0], mid[1], mid[2]); sheet.rotation.y = s.heading + Math.PI / 2; sheet.visible = false; sheet.userData.always = true; sheet.renderOrder = 3;
            glare.push({ sheet, s, sign }); group.add(sheet);
        }
        const lamps = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide, map: SC.canvasTex(256, 256, (x, w, h) => {
            // top to bottom down the picture: one wall, the ceiling (with a lamp), the other wall
            const wallBand = (y0, y1, flip) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(flip ? 1 : 0, '#3a3c40'); g.addColorStop(flip ? 0.25 : 0.75, '#8d8f8c'); g.addColorStop(flip ? 0 : 1, '#5d5f5f'); x.fillStyle = g; x.fillRect(0, y0, w, y1 - y0);
                x.fillStyle = '#d7d2c2'; x.fillRect(0, flip ? y0 + (y1 - y0) * 0.62 : y0 + (y1 - y0) * 0.3, w, (y1 - y0) * 0.08); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, y0, 3, y1 - y0); };
            wallBand(0, h * 0.37, true); wallBand(h * 0.63, h, false);
            x.fillStyle = '#26282c'; x.fillRect(0, h * 0.37, w, h * 0.26);
            const glow = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, 90); glow.addColorStop(0, 'rgba(255,236,190,0.9)'); glow.addColorStop(1, 'rgba(255,236,190,0)'); x.fillStyle = glow; x.fillRect(0, h * 0.37, w, h * 0.26);
            x.fillStyle = '#fff6dc'; x.fillRect(w / 2 - 46, h / 2 - 9, 92, 18);
        }) });
        const im = inside.mesh(lamps); im.userData.always = true; group.add(im);
        const sm = shell.mesh(concrete); sm.castShadow = true; sm.userData.always = true; group.add(sm);
        const mm = mouths.mesh(concrete); mm.castShadow = true; mm.userData.always = true; group.add(mm);
    }

    // =================================================================
    //  BUILDINGS: every wall of every building is drawn from one picture, a row of it for each kind of floor
    // =================================================================
    const BANDS = 8, V0 = b => 1 - (b + 1) / BANDS + 0.004, V1 = b => 1 - b / BANDS - 0.004;
    const SHOP = 0, SHUTTER = 1, BALCONY = 2, MODERN = 3, GRAND = 4, PLAIN = 5, ROOF = 6, GARAGE = 7;
    const facade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide, map: SC.canvasTex(512, 1024, paintFacades) });
    facade.map.wrapT = THREE.ClampToEdgeWrapping;
    const chunks = new Map(), chunk = key => { if (!chunks.has(key)) chunks.set(key, new Quads(true)); return chunks.get(key); };
    const CLASSIC = [[1, 0.96, 0.86], [1, 0.87, 0.74], [0.98, 0.85, 0.62], [1, 0.85, 0.8], [1, 1, 0.97], [1, 0.93, 0.72], [0.97, 0.79, 0.67], [0.93, 0.9, 0.82]];
    const PALE = [[1, 1, 1], [0.94, 0.95, 0.96], [0.96, 0.93, 0.86], [0.9, 0.93, 0.95]], TILE = [0.8, 0.4, 0.27], FLAT = [0.6, 0.6, 0.58];
    // one building: a box of floors standing on the ground, with whatever is needed underneath to reach down to it
    // Soft shading is baked into the walls' colours (it costs nothing to draw): down in the street, between tall
    // buildings, less of the sky's light arrives, so walls darken towards the pavement; the narrow gaps between
    // neighbours are darker still; and the top floor is shaded a little under the edge of the roof.
    function building(q, b) {
        const fh = b.fh || 3.2, bay = b.bay || 4, u0 = Math.floor(Math.random() * 4) / 4, uv = band => (f, w) => [u0, V0(band), u0 + Math.max(1, Math.round(w / bay)) / 4, V1(band)];
        const deep = b.deep ?? 0.66, light = h => deep + (1 - deep) * smooth(0, b.reach || 13, h), side = b.sides ?? 1;
        if (b.base < b.ground - 0.05) q.box(b.x, b.z, b.heading, b.w, b.dp, b.base, b.ground, uv(PLAIN), b.tint, false, [deep * 0.8, deep, side]);
        for (let f = 0; f < b.floors; f++) q.box(b.x, b.z, b.heading, b.w, b.dp, b.ground + f * fh, b.ground + (f + 1) * fh, uv(f === 0 ? b.groundFloor ?? SHOP : f === b.floors - 1 && b.top != null ? b.top : b.style), b.tint, false,
            [light(f * fh), light((f + 1) * fh) * (f === b.floors - 1 ? 0.86 : 1), side]);
        const top = b.ground + b.floors * fh, c = Math.cos(b.heading), s = Math.sin(b.heading), P = (lx, lz, y) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c], h = b.w / 2, e = b.dp / 2;
        q.add(P(-h, -e, top), P(h, -e, top), P(-h, e, top), P(h, e, top), [0, V0(ROOF), b.w / 8, V0(ROOF), 0, V1(ROOF), b.w / 8, V1(ROOF)], b.roof || TILE);
        return top;
    }
    // a pointed roof on a tower (four triangles)
    function spire(q, x, z, heading, w, y, h, colour) {
        const c = Math.cos(heading), s = Math.sin(heading), P = (lx, lz, yy) => [x + lx * c + lz * s, yy, z - lx * s + lz * c], k = w / 2, tip = P(0, 0, y + h), uv = [0, V0(PLAIN), 0.2, V0(PLAIN), 0, V1(PLAIN), 0.2, V1(PLAIN)];
        [[-k, -k, k, -k], [k, -k, k, k], [k, k, -k, k], [-k, k, -k, -k]].forEach(([ax, az, bx, bz]) => q.add(P(ax, az, y), P(bx, bz, y), tip, tip, uv, colour));
    }
    // which ground is already taken (3 m squares), so nothing is built on top of anything else
    const taken = new Set(), tk = (x, z) => Math.floor(x / 3) * 100003 + Math.floor(z / 3);
    const footprint = (x, z, heading, w, dp, pad = 0) => { const c = Math.cos(heading), s = Math.sin(heading), pts = []; for (let lx = -w / 2 - pad; lx <= w / 2 + pad + 0.01; lx += Math.min(2.6, (w + pad * 2) / 2)) for (let lz = -dp / 2 - pad; lz <= dp / 2 + pad + 0.01; lz += Math.min(2.6, (dp + pad * 2) / 2)) pts.push([x + lx * c + lz * s, z - lx * s + lz * c]); return pts; };
    const mark = pts => pts.forEach(([x, z]) => taken.add(tk(x, z)));
    const isFree = (pts, minClear) => pts.every(([x, z]) => { if (taken.has(tk(x, z)) || inWater(x, z)) return false; const b = beside(x, z); return !b || b.clear >= minClear; });

    // --- things with a place of their own are put down first, so the ordinary buildings keep clear of them ---
    buildStands(ctx, STANDS, 0xCE1126, 800);
    for (const [d, side, len, rows, gap] of STANDS) { const s = at(d), deep = rows * 0.9 + 6, p = spot(d, side, wallOf(s, side) + gap + deep / 2); mark(footprint(p.x, p.z, p.heading, len + 6, deep, 1)); }
    const props = new Quads(true);       // plain-coloured things: palms, the pool, the fountain, lawns, quays, the pit garages' details
    const boats = new Quads(true);
    const flat = (pts, y, colour) => props.add([pts[0][0], y, pts[0][1]], [pts[1][0], y, pts[1][1]], [pts[3][0], y, pts[3][1]], [pts[2][0], y, pts[2][1]], undefined, colour);   // (corners in order round the shape)
    const rect = (x, z, heading, w, dp) => { const c = Math.cos(heading), s = Math.sin(heading); return [[-w / 2, -dp / 2], [w / 2, -dp / 2], [w / 2, dp / 2], [-w / 2, dp / 2]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]); };
    const palms = [];
    const noUv = () => [0, 0, 0, 0];

    // the casino: a grand building with two towers, set back behind its square on the outside of the Casino corner
    {
        const s = at(CASINO.at), out = s.wl + PAVE + CASINO.back, W = 52, D = 24, p = spot(CASINO.at, 1, out + D / 2), q = chunk('casino'), cream = [1, 0.95, 0.84], copper = [0.45, 0.68, 0.6];
        const y = s.p.y, base = Math.min(land(p.x, p.z), y) - 2, body = { x: p.x, z: p.z, heading: p.heading, w: W, dp: D, base, ground: y + 0.1, floors: 3, fh: 5.2, bay: 5.2, style: GRAND, groundFloor: GRAND, tint: cream, roof: [0.55, 0.6, 0.58] };
        const top = building(q, body), c = Math.cos(p.heading), sn = Math.sin(p.heading), local = (lx, lz) => [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
        for (const sx of [-1, 1]) {   // the towers at the front corners, with green copper roofs
            const [tx, tz] = local(sx * (W / 2 - 4), -D / 2 - 1.5);
            building(q, { x: tx, z: tz, heading: p.heading, w: 8, dp: 8, base, ground: y + 0.1, floors: 5, fh: 5.2, bay: 4, style: GRAND, groundFloor: GRAND, tint: cream, roof: copper });
            spire(q, tx, tz, p.heading, 8.6, y + 0.1 + 26, 7, copper);
        }
        { const [mx, mz] = local(0, -D / 2 - 2.2); building(q, { x: mx, z: mz, heading: p.heading, w: 16, dp: 4.4, base, ground: y + 0.1, floors: 4, fh: 5.2, bay: 5.3, style: GRAND, groundFloor: GRAND, tint: [1, 0.97, 0.9], roof: copper }); spire(q, mx, mz, p.heading, 9, top + 5.2, 5, copper); }
        mark(footprint(p.x, p.z, p.heading, W + 6, D + 8, 2));
        // the square: pale paving from the pavement to the casino's steps, with a fountain in the middle and palms round the edge
        const n0 = Math.round((CASINO.to - CASINO.from) / 6);
        let prev = null;
        for (let k = 0; k <= n0; k++) {
            const d = CASINO.from + k * 6, sm = at(d), a = T.pathAt(d, sm.wl + PAVE - 0.1, 0), b = T.pathAt(d, sm.wl + PAVE + CASINO.back + 6, 0), row = { a: [a.x, a.y + 0.1, a.z], b: [b.x, a.y + 0.1, b.z] };
            if (prev) props.add(prev.b, prev.a, row.b, row.a, undefined, [0.52, 0.49, 0.43]);
            mark([[a.x, a.z], [b.x, b.z], [(a.x + b.x) / 2, (a.z + b.z) / 2], [a.x * 0.75 + b.x * 0.25, a.z * 0.75 + b.z * 0.25], [a.x * 0.25 + b.x * 0.75, a.z * 0.25 + b.z * 0.75]]);
            if (k % 3 === 0 && (k < n0 * 0.3 || k > n0 * 0.7)) { const pp = T.pathAt(d, sm.wl + PAVE + 2.4, 0); palms.push([pp.x, pp.y + 0.1, pp.z, R(8, 10)]); }
            prev = row;
        }
        const f = spot(CASINO.at, 1, s.wl + PAVE + 9.5);
        props.box(f.x, f.z, f.heading, 9, 9, y, y + 0.75, noUv, [0.75, 0.73, 0.68]); flat(rect(f.x, f.z, f.heading, 7.6, 7.6), y + 0.78, [0.35, 0.7, 0.85]);
        props.box(f.x, f.z, f.heading, 1.6, 1.6, y, y + 2.6, noUv, [0.9, 0.88, 0.82]);
    }
    // the gardens across the road: lawns, flower beds and palm trees
    const lawnTrees = [];
    {
        let prev = null;
        for (let d = GARDEN.from; d <= GARDEN.to; d += 6) {
            const sm = at(d), i = T.indexAt(d), reach = Math.min(sm.wr + PAVE + 20, 0.8 / Math.max(kMax(i), 1e-4)), a = T.pathAt(d, -(sm.wr + PAVE - 0.1), 0), b = T.pathAt(d, -reach, 0), row = { a: [a.x, a.y + 0.14, a.z], b: [b.x, a.y + 0.14, b.z] };
            if (prev) props.add(prev.a, prev.b, row.a, row.b, undefined, [0.36, 0.6, 0.3]);
            for (const t of [0.15, 0.5, 0.85]) mark([[a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]]);
            mark([[a.x, a.z], [b.x, b.z]]);
            if (Math.random() < 0.8) { const t = R(0.15, 0.9); (Math.random() < 0.6 ? palms : lawnTrees).push([a.x + (b.x - a.x) * t, a.y + 0.14, a.z + (b.z - a.z) * t, R(7, 10)]); }
            if (prev && Math.random() < 0.6) { const t = R(0.2, 0.8), fx = a.x + (b.x - a.x) * t, fz = a.z + (b.z - a.z) * t; props.box(fx, fz, Math.random() * 3, R(2, 4), R(1.5, 3), a.y, a.y + 0.45, noUv, pick([[0.9, 0.3, 0.35], [0.95, 0.75, 0.2], [0.85, 0.4, 0.7], [0.95, 0.5, 0.2]])); }
            prev = row;
        }
    }
    // the swimming pool, with its paved surround, on the right of the two fast flicks
    {
        const s = at(POOL.at), p = spot(POOL.at, -1, s.wr + POOL.out), y = s.p.y + 0.14, base = land(p.x, p.z) - 1;
        props.box(p.x, p.z, p.heading, POOL.len + 14, POOL.wide + 12, base, y, noUv, [0.58, 0.55, 0.49]);
        flat(rect(p.x, p.z, p.heading, POOL.len, POOL.wide), y + 0.03, [0.2, 0.72, 0.9]);
        const c = Math.cos(p.heading), sn = Math.sin(p.heading);
        for (let k = 1; k < 8; k++) { const lz = -POOL.wide / 2 + k * POOL.wide / 8; flat(rect(p.x + lz * sn, p.z + lz * c, p.heading, POOL.len - 1, 0.22), y + 0.05, [0.95, 0.97, 1]); }   // the lane ropes
        props.box(p.x + (POOL.len / 2 + 3.5) * c, p.z - (POOL.len / 2 + 3.5) * sn, p.heading, 2.4, 5, y, y + 5, noUv, [0.95, 0.95, 0.95]);                      // the diving tower
        for (const lx of [-POOL.len / 2 - 5, -8, 8, POOL.len / 2 + 5]) palms.push([p.x + lx * c + (POOL.wide / 2 + 4) * sn, y, p.z - lx * sn + (POOL.wide / 2 + 4) * c, R(7, 9)]);
        mark(footprint(p.x, p.z, p.heading, POOL.len + 16, POOL.wide + 14, 1));
    }
    // the pits: the pit lane (from the map) and a low row of garages between it and the start straight
    {
        const lane = ctx.circuit.geo.extras.pitlane[0], laneMat = SC.photoMat('asphalt_02', 1, 1, 0xc4c8ce, 0.9); laneMat.side = THREE.DoubleSide;
        const lm = ribbon(lane, 8, laneMat, (x, z) => land(x, z), 0.42); lm.userData.always = true; group.add(lm);
        for (let i = 0; i < lane.length; i += 2) mark(footprint(lane[i], lane[i + 1], 0, 9, 9));
        const q = chunk('pits'), len = PITS.to - PITS.from, mid = PITS.from + len / 2, sm = at(mid), p = spot(mid, -1, PITS.out);
        building(q, { x: p.x, z: p.z, heading: p.heading + Math.PI, w: len, dp: PITS.deep, base: land(p.x, p.z) - 2, ground: sm.p.y - 0.3, floors: 2, fh: 3.6, bay: 6, style: MODERN, groundFloor: GARAGE, tint: [0.97, 0.97, 0.97], roof: [0.8, 0.12, 0.15] });
        mark(footprint(p.x, p.z, p.heading, len + 4, PITS.deep + 3, 1));
        for (let d = 3066; d < PITS.from - 8; d += 15) { const s = at(d), pp = T.pathAt(d, -(s.wr + 2.1), 0); palms.push([pp.x, pp.y + 0.12, pp.z, R(7, 9)]); }
    }
    // the paddock, between the pit lane and the pool: the teams' trucks and awnings, and a few palms
    {
        const a = at(3250), b = at(2640), cols = [[0.95, 0.95, 0.95], [0.12, 0.23, 0.54], [0.88, 0.1, 0.1], [0.16, 0.18, 0.22], [1, 0.7, 0], [0, 0.66, 0.42]];
        for (let k = 0, n = 0; k < 500 && n < 26; k++) {
            const t = R(0.3, 0.75), u = R(-70, 80), x = a.p.x + (b.p.x - a.p.x) * t + a.t.x * u, z = a.p.z + (b.p.z - a.p.z) * t + a.t.z * u, heading = a.heading + (Math.random() < 0.5 ? 0 : Math.PI / 2);
            const truck = n % 3 !== 2, w = truck ? R(12, 16) : 1.2, dp = truck ? 3 : 1.2, pts = footprint(x, z, heading, w + 3, dp + 3);
            if (!isFree(pts, 5)) continue;
            mark(pts); n++;
            const y = land(x, z);
            if (truck) props.box(x, z, heading, w, dp, y - 0.5, y + R(3.2, 4.1), noUv, pick(cols)); else palms.push([x, y, z, R(7, 9.5)]);
        }
    }
    // the hotel over the tunnel: eight floors of balconies looking out to sea, curving with the road beneath
    {
        const q = chunk('hotel'), ia = T.indexAt(HOTEL.from), n = Math.round((HOTEL.to - HOTEL.from) / T.ds), y0 = TH + 1.0, fh = 3.3, white = [1, 1, 1];
        const landSide = s => { for (let o = 22; o >= 4; o -= 3) { const x = s.p.x - s.n.x * (s.wr + o + 4), z = s.p.z - s.n.z * (s.wr + o + 4); let ok = true; roadsNear(x, z, r => { if (Math.abs(wrapD(r.d - s.d, L)) > 70 && (x - r.p.x) ** 2 + (z - r.p.z) ** 2 < (Math.max(r.wl, r.wr) + PAVE + 2) ** 2) ok = false; }); if (ok) return -(s.wr + o); } return -(s.wr + 2); };
        let prev = null;
        for (let k = 0; k <= n; k += 4) {
            const s = samples[(ia + k) % N], lo = landSide(s), hi = s.wl + 1.7, P = (off, h) => [s.p.x + s.n.x * off, s.p.y + h, s.p.z + s.n.z * off], row = { s, lo, hi, u: k * T.ds / 16 };
            if (prev) {
                const A = prev, B = row, PA = (off, h) => [A.s.p.x + A.s.n.x * off, A.s.p.y + h, A.s.p.z + A.s.n.z * off];
                for (let f = 0; f < HOTEL.floors; f++) {
                    const ya = y0 + f * fh, yb = ya + fh, uv = [A.u, V0(MODERN), B.u, V0(MODERN), A.u, V1(MODERN), B.u, V1(MODERN)];
                    q.add(PA(A.hi, ya), P(B.hi, ya), PA(A.hi, yb), P(B.hi, yb), uv, white);        // the sea side
                    q.add(P(B.lo, ya), PA(A.lo, ya), P(B.lo, yb), PA(A.lo, yb), uv, white);        // the land side
                }
                const top = y0 + HOTEL.floors * fh;
                q.add(PA(A.lo, top), PA(A.hi, top), P(B.lo, top), P(B.hi, top), [0, V0(ROOF), 3, V0(ROOF), 0, V1(ROOF), 3, V1(ROOF)], FLAT);
                q.add(PA(A.lo, y0), PA(A.hi, y0), P(B.lo, y0), P(B.hi, y0), [0, V0(PLAIN), 1, V0(PLAIN), 0, V1(PLAIN), 1, V1(PLAIN)], [0.7, 0.7, 0.68]);   // the underside, where it overhangs
                if (k === 4 || k + 4 > n) { const E = k === 4 ? A : B, PE = k === 4 ? PA : P; for (let f = 0; f < HOTEL.floors; f++) q.add(PE(E.lo, y0 + f * fh), PE(E.hi, y0 + f * fh), PE(E.lo, y0 + (f + 1) * fh), PE(E.hi, y0 + (f + 1) * fh), [0, V0(BALCONY), 1.5, V0(BALCONY), 0, V1(BALCONY), 1.5, V1(BALCONY)], white); }
                for (let o = lo; o <= -(s.wr + 1.7); o += 3) mark([[s.p.x + s.n.x * o, s.p.z + s.n.z * o]]);
            }
            prev = row;
        }
    }

    // --- the buildings along the streets: side by side behind the pavement, standing level while the road climbs past ---
    const street = d => inZone(d, 640, 960) ? { style: [GRAND, BALCONY], floors: [4, 6], tints: CLASSIC }
        : inZone(d, 1180, 1480) || inZone(d, 1880, 2100) ? { style: [MODERN, MODERN, BALCONY], floors: [7, 12], tints: PALE, roof: FLAT }
        : inZone(d, 2850, 3060) ? { style: [SHUTTER, BALCONY], floors: [3, 5], tints: CLASSIC }
        : { style: [SHUTTER, BALCONY, BALCONY, MODERN], floors: [5, 9], tints: CLASSIC };
    const keepOut = (d, side) => side > 0 && inZone(d, 1440, 2900) || inZone(d, t0 - 14, t1 + 10)
        || side < 0 && inZone(d, 2380, 3050) || side < 0 && inZone(d, 3050, 3210) || side < 0 && inZone(d, 3300, 150);
    for (const side of [1, -1]) {
        for (let d = R(0, 8); d < L - 6;) {
            if (keepOut(d, side)) { d += 8; continue; }
            const zone = street(d), w = R(13, 26), dp = R(12, 19), mid = d + w / 2, s = at(mid), i = T.indexAt(mid);
            const out = Math.max(paveEdge(s, i, side), paveEdge(at(d), T.indexAt(d), side), paveEdge(at(d + w), T.indexAt(d + w), side)) + R(0.3, 1.1) + dp / 2, p = spot(mid, side, out);
            const pts = footprint(p.x, p.z, p.heading, w, dp);
            if (!isFree(pts, PAVE + 0.15)) { d += 5; continue; }
            mark(footprint(p.x, p.z, p.heading, w, dp, 0.8));
            const floors = Math.round(R(zone.floors[0], zone.floors[1])), modern = zone.roof === FLAT || Math.random() < 0.2, style = pick(zone.style);
            let lo = Infinity; for (const [x, z] of pts) lo = Math.min(lo, land(x, z));
            building(chunk('s' + Math.floor(mid / 420)), { x: p.x, z: p.z, heading: p.heading, w, dp, base: lo - 1, ground: Math.max(at(d).p.y, at(d + w).p.y) + 0.12, floors, style, sides: 0.6,
                top: style === SHUTTER && Math.random() < 0.5 ? BALCONY : null, tint: pick(style === MODERN ? PALE : zone.tints), roof: style === MODERN || modern ? FLAT : TILE });
            d += w + (Math.random() < 0.14 ? R(4, 9) : R(0.2, 0.6));
        }
    }
    // --- the town behind: blocks scattered up the hillside, taller further back ---
    {
        const step = 31 / Math.sqrt(dens / 0.75), b = T.box, info = {};
        for (let x = b.minX - 150; x < b.maxX + 150; x += step) for (let z = b.minZ - 150; z < b.maxZ + 150; z += step) {
            const px = x + R(0, step - 6), pz = z + R(0, step - 6), y = land(px, pz, info);
            if (y < 1 || info.dist > 290 || info.dist < 14) continue;
            if (info.lat > 0 && info.s.d > 2850 && info.s.d <= 3040 && info.dist > 34 && info.dist < 118) continue;       // (the cliffs of the Rock)
            const w = R(15, 24), dp = R(13, 19), heading = info.s.heading + (Math.random() < 0.5 ? 0 : Math.PI / 2) + R(-0.12, 0.12), pts = footprint(px, pz, heading, w, dp);
            if (!isFree(pts, PAVE + 6)) continue;
            mark(footprint(px, pz, heading, w, dp, 1.5));
            let lo = Infinity, hi = -Infinity; for (const [fx, fz] of pts) { const h = land(fx, fz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
            if (lo < 0.5) continue;
            const onRock = info.lat > 0 && info.s.d > 2850 && info.s.d <= 3040, style = onRock ? SHUTTER : pick([SHUTTER, BALCONY, MODERN, MODERN, BALCONY]);
            const floors = onRock ? Math.round(R(3, 4)) : Math.round(R(5, 9) + Math.min(8, info.dist / 34));
            building(chunk('f' + Math.floor(px / 520) + '_' + Math.floor(pz / 520)), { x: px, z: pz, heading, w, dp, base: lo - 1, ground: hi + 0.1, floors, style, groundFloor: style === MODERN ? MODERN : PLAIN, deep: 0.5, reach: 18,
                tint: pick(style === MODERN ? PALE : CLASSIC), roof: style === MODERN ? FLAT : TILE });
        }
    }
    for (const [key, q] of chunks) { if (q.empty) continue; const m = q.mesh(facade); m.receiveShadow = true; m.userData.far = 900; m.userData.noProbe = key !== 'casino'; group.add(m); }

    // =================================================================
    //  THE HARBOUR: yachts moored stern-on to the quay, bigger ones out in the middle, and two harbour walls
    // =================================================================
    {
        const white = [0.97, 0.97, 0.96], navy = [0.1, 0.16, 0.3], teak = [0.74, 0.58, 0.4], glass = [0.09, 0.13, 0.19];
        const yacht = (x, z, heading, len) => {
            const beam = len * 0.23, free = len * 0.075 + 0.6, c = Math.cos(heading), s = Math.sin(heading), P = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c], hull = Math.random() < 0.2 ? navy : white;
            const sec = [[-0.5, 0.5], [-0.1, 0.5], [0.27, 0.36], [0.5, 0.02]].map(([u, hb]) => ({ x: u * len, hb: hb * beam }));
            for (let k = 0; k < 3; k++) for (const sd of [1, -1]) {
                const a = sec[k], b = sec[k + 1], rise = k === 2 ? len * 0.03 : 0;
                boats.add(P(a.x, -0.5, sd * a.hb * 0.72), P(b.x, -0.5, sd * b.hb * 0.72), P(a.x, free, sd * a.hb), P(b.x, free + rise, sd * b.hb), undefined, hull);
                if (sd > 0) boats.add(P(a.x, free, -a.hb), P(a.x, free, a.hb), P(b.x, free + rise, -b.hb), P(b.x, free + rise, b.hb), undefined, k === 0 ? teak : white);
            }
            boats.add(P(sec[0].x, -0.5, -sec[0].hb * 0.72), P(sec[0].x, -0.5, sec[0].hb * 0.72), P(sec[0].x, free, -sec[0].hb), P(sec[0].x, free, sec[0].hb), undefined, hull);
            // the decks above: each a little shorter and narrower than the one below, with a dark band of windows
            const decks = len > 40 ? 3 : len > 22 ? 2 : 1; let y = free, l = len * 0.52, w = beam * 0.78, cx = -len * 0.06;
            for (let k = 0; k < decks; k++) {
                const [bx, , bz] = P(cx, 0, 0), h = 1.5 + len * 0.02;
                boats.box(bx, bz, heading, l, w, y, y + h, noUv, white); boats.box(bx, bz, heading, l * 0.96, w * 1.02, y + h * 0.38, y + h * 0.78, noUv, glass, false);
                y += h; l *= 0.68; w *= 0.84; cx -= len * 0.03;
            }
        };
        // along the quay, bows pointing out
        for (const [from, to] of [[2186, 2350], [2412, 2866]]) for (let d = from + R(0, 6); d < to;) {
            const len = Math.random() < 0.12 ? R(38, 52) : R(13, 30), s = at(d), p = T.pathAt(d, s.wl + QUAY + 2.5 + len / 2, 0);
            if (inWater(p.x, p.z) && Math.abs(s.ks) < 0.02) yacht(p.x, p.z, s.heading + Math.PI / 2 + R(-0.03, 0.03), len);
            d += len * 0.23 + R(2.2, 5);
        }
        // the two harbour walls reach out from either shore, leaving a gap between their ends (each has a little lighthouse)
        const n0 = T.pathAt(1996, at(1996).wl + 5, 0), q0 = coast[Math.round((2894 - 1446) / 6)];
        const walls = [[n0.x, n0.z, n0.x + 70, n0.z + 215, [0.2, 0.6, 0.3]], [q0[0] + 520, q0[1] + 112, q0[0] + 560, q0[1] - 120, [0.8, 0.15, 0.15]]];
        for (const [x0, z0, x1, z1] of walls) mark(footprint((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), Math.hypot(x1 - x0, z1 - z0) + 30, 40));
        // out in the harbour and off the coast: a few of the really big ones, at anchor
        const mid = T.pathAt(2500, 170, 0);
        for (let k = 0, n = 0; k < 400 && n < 11; k++) {
            const x = mid.x + R(-190, 600), z = mid.z + R(-460, 190); if (!inWater(x, z)) continue;
            const far = T.near(x, z); if (far.i >= 0 && far.dist < 95) continue;
            const len = R(34, 78), pts = footprint(x, z, 0, len + 30, len + 30); if (!pts.every(([fx, fz]) => inWater(fx, fz) && !taken.has(tk(fx, fz)))) continue;
            mark(pts); yacht(x, z, R(0, 6.28), len); n++;
        }
        // the harbour walls, each with a little lighthouse on the end
        for (const [x0, z0, x1, z1, lamp] of walls) {
            const len = Math.hypot(x1 - x0, z1 - z0), heading = Math.atan2(-(z1 - z0), x1 - x0), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
            props.box(x, z, heading, len, 9, -3, 2.4, noUv, [0.62, 0.6, 0.55]);
            props.box(x1, z1, heading, 3, 3, 2.4, 10, noUv, [0.9, 0.9, 0.88]); props.box(x1, z1, heading, 3.6, 3.6, 10, 11.6, noUv, lamp);
        }
        // pontoons between the moored boats
        for (const d of [2240, 2300, 2470, 2560, 2660, 2760, 2840]) { const s = at(d), p = T.pathAt(d, s.wl + QUAY + 22, 0); if (inWater(p.x, p.z)) props.box(p.x, p.z, s.heading + Math.PI / 2, 44, 2.2, -1, 0.7, noUv, [0.6, 0.58, 0.53]); }
    }

    // =================================================================
    //  PALM TREES (and a few shady trees): along the sea front, the start straight, the squares and the pool
    // =================================================================
    {
        for (const [from, to, side, every] of [[1894, 2060, -1, 17], [2182, 2350, 1, 21], [2420, 2860, 1, 26], [244, 420, -1, 22], [1340, 1440, -1, 19], [2900, 3030, 1, 24], [3320, 100, 1, 23], [1000, 1100, 1, 21]])
            for (let d = from, n = (((to - from) % L + L) % L); d < from + n; d += every) {
                const s = at(d), i = T.indexAt(d), edge = paveEdge(s, i, side), wall = wallOf(s, side); if (edge - wall < 2.2 || onStand(STANDS, L, s.d, side, 0)) continue;
                const p = T.pathAt(d, side * (wall + (side > 0 && inZone(s.d, 1446, 2894) ? 2.6 : 1.9)), 0); palms.push([p.x, p.y + 0.12, p.z, R(6.5, 9.5)]);
            }
        const trunk = [0.5, 0.4, 0.3], greens = [[0.24, 0.46, 0.2], [0.3, 0.52, 0.22], [0.2, 0.4, 0.2]];
        for (const [x, y, z, h] of palms) {
            const lean = R(0, 6.28), lx = Math.cos(lean) * h * 0.07, lz = Math.sin(lean) * h * 0.07, ring = (t, r) => { const out = []; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; out.push([x + lx * t * t + Math.cos(a) * r, y + h * t, z + lz * t * t + Math.sin(a) * r]); } return out; };
            const rings = [ring(0, 0.32), ring(0.5, 0.24), ring(1, 0.19)];
            for (let j = 0; j < 2; j++) for (let k = 0; k < 5; k++) props.add(rings[j][k], rings[j][(k + 1) % 5], rings[j + 1][k], rings[j + 1][(k + 1) % 5], undefined, trunk);
            const tx = x + lx, ty = y + h, tz = z + lz, fronds = 9, turn = R(0, 6.28);
            for (let k = 0; k < fronds; k++) {
                const a = turn + k / fronds * 6.283 + R(-0.2, 0.2), dx = Math.cos(a), dz = Math.sin(a), len = R(2.6, 3.4), droop = R(0.5, 1.3), col = pick(greens);
                const p1 = [tx + dx * len * 0.5, ty + 0.75, tz + dz * len * 0.5], p2 = [tx + dx * len, ty - droop, tz + dz * len], wd = 0.55;
                props.add([tx - dz * 0.12, ty, tz + dx * 0.12], [tx + dz * 0.12, ty, tz - dx * 0.12], [p1[0] - dz * wd, p1[1], p1[2] + dx * wd], [p1[0] + dz * wd, p1[1], p1[2] - dx * wd], undefined, col);
                props.add([p1[0] - dz * wd, p1[1], p1[2] + dx * wd], [p1[0] + dz * wd, p1[1], p1[2] - dx * wd], [p2[0] - dz * 0.08, p2[1], p2[2] + dx * 0.08], [p2[0] + dz * 0.08, p2[1], p2[2] - dx * 0.08], undefined, col);
            }
        }
        if (lawnTrees.length) SC.plantTrees(ctx, lawnTrees.map(([x, y, z]) => ({ x, y, z, size: R(1.1, 1.6), shadow: true })), SC.TREE_MIX.city);
        ctx.treeCount = palms.length + lawnTrees.length;
    }
    const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    { const m = props.mesh(plain); m.castShadow = m.receiveShadow = true; m.userData.always = true; group.add(m); }
    { const m = boats.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })); m.userData.far = 1100; m.userData.noProbe = true; group.add(m); }

    // --- advertising boards on the straights, braking boards before the three big stops ---
    boards(ctx, { braking: BRAKING, every: 64, gap: 0.75, maxBend: 0.004, skip: (d, side) => at(d).roofed || inZone(d, t0 - 30, t1 + 30) || onStand(STANDS, L, d, side, 0) || inZone(d, 3040, 60) });

    return {
        setLook(look, direct) { seaFog.value.copy(seaFogColour(look, direct)); },   // (the sea's haze changes with the weather)
        // the white light across the tunnel's mouths: from inside, the daylight outside is dazzling; it clears as you reach it
        update(dt, state) {
            for (const g of glare) {
                const on = state && state.tunnel > 0.02 && ((state.cam.x - g.sheet.position.x) * g.s.t.x + (state.cam.z - g.sheet.position.z) * g.s.t.z) * g.sign > 0;
                g.sheet.visible = !!on; if (on) g.sheet.material.opacity = 0.9 * state.tunnel;
            }
        }
    };
}

// The picture every building's walls are drawn from: 4 bays across (it repeats sideways), and a row for each kind of
// floor. Drawn nearly white, so each building can be tinted its own colour.
function paintFacades(x, W, H) {
    const B = 128, wall = '#f5f1e8';
    const row = (k, draw) => { for (let b = 0; b < 4; b++) { x.save(); x.translate(b * B, k * B); x.beginPath(); x.rect(0, 0, B, B); x.clip(); x.fillStyle = wall; x.fillRect(0, 0, B, B); draw(b); x.restore(); } };
    const glassFill = (u, v, w, h, lit = 0) => { const g = x.createLinearGradient(0, v, 0, v + h); g.addColorStop(0, lit ? '#6f8597' : '#4a5c6b'); g.addColorStop(1, '#27323c'); x.fillStyle = g; x.fillRect(u, v, w, h); x.fillStyle = 'rgba(200,225,240,0.22)'; x.beginPath(); x.moveTo(u, v); x.lineTo(u + w * 0.6, v); x.lineTo(u, v + h * 0.7); x.fill(); };
    const course = () => { x.fillStyle = 'rgba(120,105,85,0.28)'; x.fillRect(0, B - 5, B, 5); x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, B - 7, B, 2); };
    // 0: the ground floor: shop windows under awnings
    row(0, b => {
        x.fillStyle = '#d9d2c4'; x.fillRect(0, 0, B, B); x.fillStyle = '#8f887b'; x.fillRect(0, B - 12, B, 12);
        glassFill(10, 34, B - 20, B - 46, b % 2); x.fillStyle = '#2b2f36'; x.fillRect(B / 2 - 2, 34, 4, B - 46);
        const aw = ['#b8323a', '#274a7a', '#3f7a52', '#c98a2b'][b]; x.fillStyle = aw; x.beginPath(); x.moveTo(4, 14); x.lineTo(B - 4, 14); x.lineTo(B, 40); x.lineTo(0, 40); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 6; i++) x.fillRect(8 + i * 20, 14, 8, 26);
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 40, B, 4);
    });
    // 1: tall windows with louvred shutters
    row(1, b => {
        glassFill(46, 26, 36, 78, b === 1); x.fillStyle = '#fbfaf6'; x.fillRect(63, 26, 2, 78); x.fillRect(46, 62, 36, 2);
        const sh = ['#6d8a76', '#6d8a76', '#7b8fa6', '#6d8a76'][b]; x.fillStyle = sh;
        if (b === 2) { x.fillRect(46, 26, 36, 78); x.fillStyle = 'rgba(0,0,0,0.18)'; for (let v = 30; v < 104; v += 5) x.fillRect(46, v, 36, 1.5); x.fillRect(63, 26, 2, 78); }
        else { x.fillRect(28, 26, 17, 78); x.fillRect(83, 26, 17, 78); x.fillStyle = 'rgba(0,0,0,0.18)'; for (let v = 30; v < 104; v += 5) { x.fillRect(28, v, 17, 1.5); x.fillRect(83, v, 17, 1.5); } }
        x.fillStyle = '#e4ddcf'; x.fillRect(40, 104, 48, 5); course();
    });
    // 2: french windows opening onto iron balconies
    row(2, b => {
        glassFill(40, 18, 48, 96, b === 3); x.fillStyle = '#fbfaf6'; x.fillRect(63, 18, 2, 96); x.fillRect(40, 48, 48, 2);
        if (b === 0) { x.fillStyle = '#d98a3c'; x.beginPath(); x.moveTo(34, 12); x.lineTo(94, 12); x.lineTo(100, 34); x.lineTo(28, 34); x.fill(); x.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 4; i++) x.fillRect(38 + i * 16, 12, 6, 22); }
        x.fillStyle = '#d6cfc0'; x.fillRect(14, 112, 100, 7); x.strokeStyle = '#2d3138'; x.lineWidth = 2; x.strokeRect(16, 84, 96, 28); x.lineWidth = 1.2; for (let u = 22; u < 112; u += 7) { x.beginPath(); x.moveTo(u, 84); x.lineTo(u, 112); x.stroke(); }
        x.fillStyle = 'rgba(120,105,85,0.2)'; x.fillRect(0, B - 3, B, 3);
    });
    // 3: a modern block: a wide band of glass behind a long white balcony
    row(3, b => {
        x.fillStyle = '#eef0f1'; x.fillRect(0, 0, B, B); glassFill(0, 16, B, 74, b % 2); x.fillStyle = '#dfe3e6'; x.fillRect(B - 5, 16, 5, 74); x.fillRect(B / 2 - 1, 16, 2, 74);
        x.fillStyle = 'rgba(190,225,240,0.55)'; x.fillRect(0, 76, B, 34); x.fillStyle = '#ffffff'; x.fillRect(0, 106, B, 22); x.fillRect(0, 74, B, 3); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 10, B, 6);
    });
    // 4: the grand style: tall arched windows between columns, under a carved cornice
    row(4, b => {
        x.fillStyle = '#efe7d6'; x.fillRect(0, 0, B, B); x.fillStyle = '#fffaf0'; x.fillRect(4, 14, 16, B - 24); x.fillRect(B - 20, 14, 16, B - 24);
        x.fillStyle = 'rgba(120,100,70,0.25)'; x.fillRect(18, 14, 2, B - 24); x.fillRect(B - 6, 14, 2, B - 24);
        x.save(); x.beginPath(); x.moveTo(34, 112); x.lineTo(34, 54); x.arc(64, 54, 30, Math.PI, 0); x.lineTo(94, 112); x.closePath(); x.clip(); glassFill(34, 22, 60, 92, b % 2); x.fillStyle = '#fffaf0'; x.fillRect(63, 22, 2, 92); x.fillRect(34, 56, 60, 2); x.fillRect(34, 86, 60, 2); x.restore();
        x.strokeStyle = '#fffaf0'; x.lineWidth = 4; x.beginPath(); x.moveTo(34, 112); x.lineTo(34, 54); x.arc(64, 54, 30, Math.PI, 0); x.lineTo(94, 112); x.stroke();
        x.fillStyle = '#fffaf0'; x.fillRect(0, 0, B, 12); x.fillStyle = 'rgba(120,100,70,0.35)'; x.fillRect(0, 12, B, 3); for (let u = 4; u < B; u += 10) x.fillRect(u, 3, 5, 6);
        x.fillStyle = '#e0d6c0'; x.fillRect(0, B - 10, B, 10);
    });
    // 5: plain wall (the backs and the parts below street level)
    row(5, () => { for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(110,100,85,${0.03 + Math.random() * 0.05})`; x.fillRect(Math.random() * B, 0, 3 + Math.random() * 10, B); } x.fillStyle = 'rgba(110,100,85,0.18)'; x.fillRect(0, B - 3, B, 3); });
    // 6: the roof
    row(6, () => { x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, B, B); x.fillStyle = 'rgba(0,0,0,0.13)'; for (let v = 0; v < B; v += 8) x.fillRect(0, v, B, 2); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; x.fillRect(Math.random() * B, Math.random() * B, 12, 8); } });
    // 7: a pit garage: a wide door, half of them open
    row(7, b => { x.fillStyle = '#e6e8ea'; x.fillRect(0, 0, B, B); x.fillStyle = b % 2 ? '#22262c' : '#9aa1ab'; x.fillRect(8, 22, B - 16, B - 22); if (!(b % 2)) { x.fillStyle = 'rgba(0,0,0,0.2)'; for (let v = 30; v < B; v += 10) x.fillRect(8, v, B - 16, 2); } else { x.fillStyle = '#c8222a'; x.fillRect(20, 84, 40, 30); x.fillStyle = '#15171a'; x.fillRect(70, 70, 40, 46); }
        x.fillStyle = ['#c8222a', '#1E3A8A', '#FFB300', '#00A86B'][b]; x.fillRect(0, 8, B, 10); });
}
