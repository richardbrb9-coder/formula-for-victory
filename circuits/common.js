// Formula for Victory: scenery parts that more than one circuit uses (Silverstone and Monaco; Monza keeps its own
// copies in monza-scenery.js). Everything here follows the road's own height, so it works on a hilly circuit too.
import * as THREE from '../lib/three.module.min.js';
import * as SC from '../scenery.js';

export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const wrapD = (d, L) => { d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };
export const inZone = (d, a, b) => a <= b ? d >= a && d <= b : d >= a || d <= b;

// collects four-cornered faces for one mesh (optionally each with its own colour, or a colour for each of its corners:
// that is how soft shading is 'baked in' at no cost, darker at the foot of a wall or under a roof)
export class Quads {
    constructor(colours = false) { this.pos = []; this.uv = []; this.idx = []; this.col = colours ? [] : null; }
    add(a, b, c, d, uv = [0, 0, 1, 0, 0, 1, 1, 1], colour = null) {
        const k = this.pos.length / 3; this.pos.push(...a, ...b, ...c, ...d); this.uv.push(...uv); this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        if (this.col) for (let i = 0; i < 4; i++) this.col.push(...(colour ? (Array.isArray(colour[0]) ? colour[i] : colour) : [1, 1, 1]));
    }
    // an upright box standing on (or sunk below) the ground: centre (x, z), turned by 'heading', from y0 up to y1.
    // uvFor(face, width, height) gives each face's part of the picture as [u0, v0, u1, v1]: faces 0 to 3 are the walls
    // (front first: the one facing local -z), 4 is the top. shade: [bottom, top, sides] darkens the walls' bottom and top
    // edges and the two side walls by those amounts (1 = not at all).
    box(x, z, heading, w, dp, y0, y1, uvFor, colour = null, top = true, shade = null) {
        const c = Math.cos(heading), s = Math.sin(heading), P = (lx, lz, y) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
        const h = w / 2, e = dp / 2, corners = [[-h, -e], [h, -e], [h, e], [-h, e]];
        for (let f = 0; f < 4; f++) {
            const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
            const [u0, v0, u1, v1] = uvFor(f, f % 2 ? dp : w, y1 - y0);
            let col = colour;
            if (shade && this.col) { const c = colour || [1, 1, 1], k = f % 2 ? shade[2] : 1, lo = c.map(v => v * shade[0] * k), hi = c.map(v => v * shade[1] * k); col = [lo, lo, hi, hi]; }
            this.add(P(bx, bz, y0), P(ax, az, y0), P(bx, bz, y1), P(ax, az, y1), [u0, v0, u1, v0, u0, v1, u1, v1], col);
        }
        if (top) { const [u0, v0, u1, v1] = uvFor(4, w, dp); this.add(P(-h, -e, y1), P(h, -e, y1), P(-h, e, y1), P(h, e, y1), [u0, v0, u1, v0, u0, v1, u1, v1], colour); }
    }
    get empty() { return !this.idx.length; }
    mesh(mat, opts = {}) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.setIndex(this.idx); g.computeVertexNormals(); return Object.assign(new THREE.Mesh(g, mat), opts);
    }
}

// Grandstands from a list [metres round the lap, side (1 left, -1 right), length, rows, gap behind the wall, roof colour].
// Neighbouring stands are baked together and drawn as one.
export function buildStands(ctx, STANDS, roof = 0x1E3A8A, far = 950) {
    const { T, group } = ctx, L = T.trackLen, stands = [];
    for (const [d, side, len, rows, gap, colour] of STANDS) {
        const s = T.sampleAt(d);
        const st = SC.grandstand(ctx, d, side * ((side > 0 ? s.wl : s.wr) + gap), len, rows, colour || roof);
        st.userData.far = far; st.userData.noProbe = true;
        st.children.forEach((part, i) => { if (part.isInstancedMesh && i < 2) part.castShadow = false; });   // only the roof casts a shadow
        // fewer separate things to draw: one crowd picture for the whole stand, the end walls with the concrete, no glass
        let crowd = null, concrete = null;
        for (const part of [...st.children]) {
            const m = part.material;
            if (m.transparent) st.remove(part);
            else if (m.alphaTest) { crowd = crowd || m; part.material = crowd; }
            else if (m.vertexColors && !m.metalness && !m.userData.snowRoof) concrete = concrete || m;
        }
        for (const part of st.children) if (!part.isInstancedMesh && concrete) part.material = concrete;
        stands.push({ st, d });
    }
    while (stands.length) {
        const first = stands.shift(), near = [first.st];
        for (let i = stands.length - 1; i >= 0; i--) if (Math.abs(wrapD(stands[i].d - first.d, L)) < 420) near.push(stands.splice(i, 1)[0].st);
        group.add(SC.mergeStatic(near));
    }
}
// is this spot (which side of the track, how far round, how far beyond the wall) taken up by a grandstand?
export const onStand = (STANDS, L, d, side, clear) => STANDS.some(([sd, ss, len, rows, gap]) => side === ss && Math.abs(wrapD(d - sd, L)) < len / 2 + 8 && clear < gap + rows * 0.9 + 9);

// Advertising boards for made-up brands behind the barrier on the straights, and 300/200/100 boards before the big stops.
// skip(d, side): leave a board out here. All the boards are three drawings (faces, backs, numbers).
export function boards(ctx, { skip = () => false, braking = [], every = 78, gap = 0.9, maxBend = 0.003 }) {
    const { T, group } = ctx, L = T.trackLen, faces = new Quads(), backs = new Quads(), nums = new Quads(), NB = SC.BRANDS.length;
    const wallAt = (s, side) => side > 0 ? s.wl : s.wr;
    const board = (q, d, lat, w, y0, y1, uv, backToo = true) => {
        const c = T.pathAt(d, lat, 0), ax = Math.cos(c.heading) * w / 2, az = -Math.sin(c.heading) * w / 2, sg = Math.sign(lat);
        const p = (k, y) => [c.x + ax * k * sg, c.y + y, c.z + az * k * sg];
        q.add(p(-1, y0), p(1, y0), p(-1, y1), p(1, y1), uv || [0, 0, 1, 0, 0, 1, 1, 1]);
        if (backToo) { const n = T.sampleAt(d).n, o = 0.07 * sg, b = (k, y) => [c.x + ax * k * sg + n.x * o, c.y + y, c.z + az * k * sg + n.z * o]; backs.add(b(1, y0 - 0.7), b(-1, y0 - 0.7), b(1, y1 + 0.05), b(-1, y1 + 0.05)); }
    };
    let k = 0;
    for (let d = 40; d < L - 20; d += every) {
        const s = T.sampleAt(d); if (Math.abs(s.ks) > maxBend) continue;
        const side = k % 2 ? 1 : -1; k++;
        if (skip(d, side)) continue;
        const b = k % NB, v0 = 1 - (b + 1) / NB, v1 = 1 - b / NB;
        board(faces, d, side * (wallAt(s, side) + gap), 7, 0.75, 2.05, [0, v0, 1, v0, 0, v1, 1, v1]);
    }
    if (!faces.empty) {
        const fm = faces.mesh(new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, map: SC.canvasTex(512, 96 * NB, (x, w) => {
            SC.BRANDS.forEach(([text, bg, fg], i) => {
                const y = i * 96; x.fillStyle = bg; x.fillRect(0, y, w, 96); x.fillStyle = fg; x.font = '900 54px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
                const tw = x.measureText(text).width; if (tw > w - 24) x.font = `900 ${Math.floor(54 * (w - 24) / tw)}px Arial Black, Arial`; x.fillText(text, w / 2, y + 48 + 3);
            });
        }, false) }));
        fm.castShadow = true; group.add(fm);
    }
    for (const at of braking) [300, 200, 100].forEach((m, j) => {
        const d = at - m, s = T.sampleAt(d);
        for (const side of [1, -1]) board(nums, d, side * (wallAt(s, side) + Math.min(0.7, gap)), 1.5, 0.9, 2.5, [j / 3, 0, (j + 1) / 3, 0, j / 3, 1, (j + 1) / 3, 1]);
    });
    if (!nums.empty) group.add(nums.mesh(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: SC.canvasTex(384, 128, (x, w, h) => {
        x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h);
        ['300', '200', '100'].forEach((t, j) => { x.fillStyle = '#111'; x.fillRect(j * 128, 0, 4, h); x.font = '900 60px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, j * 128 + 66, h / 2 + 4); });
    }, false) })));
    if (!backs.empty) { const bm = backs.mesh(new THREE.MeshStandardMaterial({ color: 0x2a2f39, roughness: 0.8, side: THREE.DoubleSide })); bm.castShadow = true; group.add(bm); }
}

// A ribbon of road along a mapped line (a pit lane): flat pairs of x, z; 'height' gives the ground's height at a spot.
export function ribbon(flat, width, mat, height = () => 0, lift = 0.012) {
    const P = []; for (let i = 0; i < flat.length; i += 2) P.push([flat[i], flat[i + 1]]);
    const q = new Quads(); let prev = null, run = 0;
    P.forEach((p, i) => {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
        if (i) run += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]);
        const y = height(p[0], p[1]) + lift, row = { l: [p[0] + nx * width / 2, y, p[1] + nz * width / 2], r: [p[0] - nx * width / 2, y, p[1] - nz * width / 2], v: run / 6 };
        if (prev) q.add(prev.l, prev.r, row.l, row.r, [0, prev.v, width / 6, prev.v, 0, row.v, width / 6, row.v]);
        prev = row;
    });
    const m = q.mesh(mat); m.receiveShadow = true; return m;
}

// The podium by the pits: steps for the top three in front of a board with the circuit's name and its flag's colours
export function podiumStand(name, stripes) {
    const pod = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: 0x232831, roughness: 0.6, metalness: 0.3 });
    const box = (w, h, dp, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; pod.add(m); return m; };
    box(18, 0.5, 11, 0, 5.6, -5.5, white);
    box(18, 0.9, 0.12, 0, 6.3, -10.95, dark);
    for (const x of [-8.6, 8.6]) { box(0.5, 5.4, 0.5, x, 2.7, -10.4, dark); box(0.12, 0.9, 11, x * 1.045, 6.3, -5.5, dark); }
    const gold = new THREE.MeshStandardMaterial({ color: 0xFFB300, roughness: 0.5 }), silver = new THREE.MeshStandardMaterial({ color: 0xC9CED6, roughness: 0.5 }), bronze = new THREE.MeshStandardMaterial({ color: 0xC98A4B, roughness: 0.5 });
    box(2.4, 1.3, 2.2, 0, 6.5, -5, gold); box(2.4, 0.95, 2.2, -2.5, 6.3, -5, silver); box(2.4, 0.65, 2.2, 2.5, 6.17, -5, bronze);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.6), new THREE.MeshStandardMaterial({ roughness: 0.7, map: SC.canvasTex(1024, 256, (x, w, h) => {
        x.fillStyle = '#12151b'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#f4f4f0' : '#12151b'; x.fillRect(i * 32, j * 16, 32, 16); x.fillRect(i * 32, h - 32 + j * 16, 32, 16); }
        stripes.forEach((c, i) => { x.fillStyle = c; x.fillRect(w * i / stripes.length, 40, w / stripes.length + 1, 10); });
        x.fillStyle = '#f4f4f0'; x.font = '900 104px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const tw = x.measureText(name).width; if (tw > w - 60) x.font = `900 ${Math.floor(104 * (w - 60) / tw)}px Orbitron, Arial Black, sans-serif`;
        x.fillText(name, w / 2, h / 2 + 4);
        x.font = '700 30px Orbitron, Arial Black, sans-serif'; x.fillStyle = '#FFB300'; x.fillText('FORMULA FOR VICTORY  ·  GRAND PRIX', w / 2, h - 58);
    }, false) }));
    back.rotation.y = Math.PI; back.position.set(0, 8.15, -1.2); pod.add(back);
    box(18.2, 4.8, 0.2, 0, 8.15, -1.08, dark);
    return pod;
}
