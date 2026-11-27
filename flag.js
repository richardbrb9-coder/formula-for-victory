// Formula for Victory: the chequered flag. A marshal in a helmet stands on a small raised platform just behind the
// barrier, a few metres before the finish line, holding a big chequered flag on a pole. From the moment the leader
// starts the last lap until the race is over, the pole swings in a figure of eight and the cloth streams behind it;
// at any other time the pole is held upright and the cloth hangs still.
// Everything is made in code. It is three things to draw: the platform and the marshal (one shape), the arms and the
// pole (one shape, which swings), and the cloth (one shape, 104 points moved by a few sums each frame while it waves).
// When the flag waves is decided in race.js.
import * as THREE from './lib/three.module.min.js';
import * as SC from './scenery.js';

// Where the marshal stands on this circuit. A circuit can say for itself (marshal: { side, at } in its data: side 1 = the
// driver's left, -1 = the right; at = metres past the start line, so a minus number is before it). Otherwise: on the
// pit wall's side, 6 m before the line. That is clear of the gantry (on the line), the pit box and its sign (well past
// the line), the podium (12 m past it) and the grid (on the road itself: the marshal is behind the barrier).
// If that side has a tall catch fence there and the other side has none, the marshal stands on the other side.
const BEHIND = 0.95, STAND = 1.5;   // metres behind the barrier to the middle of the platform; how high the platform is
export function flagLayout(T, C, pitSide = -1) {
    const F = C.marshal || {}, d = Number.isFinite(F.at) ? F.at : -6, s = T.sampleAt(d);
    let side = F.side > 0 ? 1 : F.side < 0 ? -1 : pitSide > 0 ? 1 : -1;
    if (!F.side && (side > 0 ? s.L : s.R).fence && !(side > 0 ? s.R : s.L).fence) side = -side;
    const wall = side > 0 ? s.wl : s.wr, base = T.pathAt(d, side * (wall + BEHIND), 0);
    // the trackside camera for a winner's finish: across the road from the marshal, a little further along, just inside
    // the barrier and above the cars. From there the gantry is out of the way, and the cars pass in front of the flag.
    const s2 = T.sampleAt(d + 10), cam = T.pathAt(d + 10, -side * ((side > 0 ? s2.wr : s2.wl) - 0.5), 0), over = T.pathAt(d, side * (wall - 0.9), 0);
    const L = { d, side, wall, base, heading: s.heading, cam: new THREE.Vector3(cam.x, cam.y + 1.6, cam.z), look: new THREE.Vector3(over.x, over.y + STAND + 2.9, over.z) };
    L.fov = Math.max(30, Math.min(54, Math.atan(8 / L.cam.distanceTo(L.look)) * 360 / Math.PI));   // (a longer lens where the road is wider, so the flag is always about the same size)
    return L;
}

// the cloth: a chequered picture, 8 squares by 6
function chequer() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 192; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#101114' : '#f6f6f2'; x.fillRect(i * 32, j * 32, 32, 32); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const COLS = 12, ROWS = 7, FLY = 2.7, HOIST = 1.9, TIP = 3.6;   // the cloth's grid; its length and height (metres); how far up the pole its top corner is
const SPEED = 4.3, SWING = 0.4, LEAN = 0.44, REST = 0.1, NOD = 0.2, LAG = 0.17;   // the swing: how fast, how far, the lean over the track; the lean at rest; the swing along the road; how far behind the pole the cloth's far edge follows (seconds)

export function buildFlag(T, C, pitSide) {
    const L = flagLayout(T, C, pitSide), group = new THREE.Group(), face = L.side > 0 ? 1 : -1;   // (face: which way along the group's own z the cars come from)
    // (the group's own x points in over the track, y is up)
    const paint = new THREE.MeshLambertMaterial({ vertexColors: true }), tint = new THREE.Color();
    const coloured = (g, colour) => { const n = g.attributes.position.count, cols = new Float32Array(n * 3); tint.set(colour); for (let i = 0; i < n; i++) { cols[i * 3] = tint.r; cols[i * 3 + 1] = tint.g; cols[i * 3 + 2] = tint.b; } g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); return g; };
    const bake = (parent, list) => {   // several small parts become one shape
        const parts = list.map(([g, x, y, z, colour]) => { const m = new THREE.Mesh(coloured(g, colour), paint); m.position.set(x, y, z); parent.add(m); return m; });
        const done = SC.mergeStatic(parts); for (const m of parts) { parent.remove(m); m.geometry.dispose(); }
        done.traverse(o => { o.castShadow = false; o.userData.seeThrough = true; }); parent.add(done); return done;
    };
    const box = (w, h, dp) => new THREE.BoxGeometry(w, h, dp);
    const ORANGE = 0xF26A1B, DARK = 0x262b33, WHITE = 0xf2f2ee, YELLOW = 0xFFC400, H = STAND;
    bake(group, [
        [box(1.7, H + 1.5, 1.7), 0, (H - 1.5) / 2, 0, DARK],                       // the platform (its foot goes down below the road's height, for sloping ground)
        [box(1.78, 0.1, 1.78), 0, H, 0, WHITE],
        [box(0.07, 1.0, 0.07), 0.82, H + 0.5, 0.82, YELLOW], [box(0.07, 1.0, 0.07), 0.82, H + 0.5, -0.82, YELLOW],   // a rail along the track's side
        [box(0.07, 0.07, 1.7), 0.82, H + 1.0, 0, YELLOW], [box(0.07, 0.07, 1.7), 0.82, H + 0.55, 0, YELLOW],
        [box(0.2, 0.84, 0.2), 0.15, H + 0.42, 0.14, ORANGE], [box(0.2, 0.84, 0.2), 0.15, H + 0.42, -0.14, ORANGE],   // the marshal: orange overalls,
        [box(0.3, 0.64, 0.5), 0.15, H + 1.16, 0, ORANGE], [box(0.31, 0.09, 0.51), 0.15, H + 1.22, 0, WHITE],
        [new THREE.SphereGeometry(0.17, 10, 8), 0.15, H + 1.66, 0, WHITE],                                          // a white helmet
        [box(0.25, 0.09, 0.1), 0.15, H + 1.67, face * 0.13, DARK]                                                   // with a dark visor (no face)
    ]);
    // the arms and the pole swing together, about the shoulders
    const arm = new THREE.Group(); arm.position.set(0.3, H + 1.36, 0); group.add(arm);
    bake(arm, [
        [new THREE.CylinderGeometry(0.035, 0.035, TIP + 0.4, 6), 0, (TIP - 0.4) / 2, 0, 0xd8d0bc],
        [box(0.12, 0.62, 0.12), -0.06, 0.2, 0.2, ORANGE], [box(0.12, 0.62, 0.12), -0.06, 0.2, -0.2, ORANGE],
        [box(0.13, 0.13, 0.13), -0.02, 0.5, 0.17, DARK], [box(0.13, 0.13, 0.13), -0.02, 0.5, -0.17, DARK]
    ]);
    // the cloth: its points are moved every frame it waves (see update)
    const n = (COLS + 1) * (ROWS + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) { const k = j * (COLS + 1) + i; uv[k * 2] = i / COLS; uv[k * 2 + 1] = 1 - j / ROWS; }
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1; idx.push(a, c, b, b, c, c + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, TIP - HOIST / 2, 0), FLY + HOIST);   // (wherever it streams: never worked out again)
    const tex = chequer();
    // (the squares give off a little light of their own after dark, so the flag can be seen on any night circuit)
    const cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x4a4a4a, emissiveMap: tex, emissiveIntensity: 0 }));
    cloth.userData.seeThrough = true; arm.add(cloth);
    group.position.set(L.base.x, L.base.y, L.base.z); group.rotation.y = L.heading - L.side * Math.PI / 2;
    group.userData.always = true;

    let w = 0, phase = 0, kick = 0, still = false;   // how much it is waving (0 to 1); where in the swing; a livelier wave for a car taking the flag; nothing to do
    const dx = new Float32Array(COLS + 1), dy = new Float32Array(COLS + 1), dz = new Float32Array(COLS + 1);
    const shape = () => {
        const A = SWING * (1 + 0.2 * kick), lean = REST + (LEAN - REST) * w + w * A * Math.sin(phase), nod = w * NOD * Math.sin(phase * 2);
        arm.rotation.z = -lean; arm.rotation.x = nod; arm.position.y = H + 1.36 + w * 0.1 * Math.sin(phase * 2 + 0.9);
        // each strip of cloth, from the pole outwards, follows where the pole was going a moment before: so the cloth
        // streams out behind the pole, and whips over to the other side as the swing turns round
        let x = 0, y = 0, z = 0; const step = FLY / COLS;
        for (let i = 0; i <= COLS; i++) {
            const u = i / COLS, p = phase - SPEED * LAG * u;
            const a = w * 1.38 * Math.tanh(1.5 * A * SPEED * Math.cos(p)) - (1 - w) * 0.36, b = w * 0.85 * Math.tanh(1.1 * NOD * 2 * SPEED * Math.cos(p * 2));
            if (i) { x -= Math.sin(a) * Math.cos(b) * step; y -= Math.cos(a) * Math.cos(b) * step; z -= Math.sin(b) * step; }
            dx[i] = x; dy[i] = y; dz[i] = z;
        }
        for (let j = 0, k = 0; j <= ROWS; j++) {
            const v = j / ROWS, top = TIP - v * HOIST;
            for (let i = 0; i <= COLS; i++, k += 3) {
                const u = i / COLS, r = u * (0.05 + 0.2 * w) * Math.sin(8.5 * u - phase * 2.7 + v * 2.1);   // the ripples running along the cloth
                pos[k] = dx[i] + r * 0.35; pos[k + 1] = top + dy[i] - u * v * 0.12 * (1 - w); pos[k + 2] = dz[i] + r + (1 - w) * u * 0.1 * Math.sin(v * 3 + u * 5);
            }
        }
        geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    };
    shape();
    return {
        group, layout: L, get waving() { return w; },   // (waving: 0 held still to 1 in full swing, for testing)
        night(on) { cloth.material.emissiveIntensity = on ? 0.55 : 0; },   // (after dark the white squares glow a little)
        // wave: should it be waving now; boost: a car is taking the flag (a livelier wave for a moment); cam: the camera's
        // place (the flag is not moved, or drawn, when it is far away)
        update(dt, wave, boost, cam) {
            if (!group.visible) return;
            const far = (cam.x - L.base.x) ** 2 + (cam.z - L.base.z) ** 2 > 450 * 450;
            cloth.visible = !far;
            const want = wave ? 1 : 0;
            if (far) { w = want; still = false; return; }
            if (!want && w === 0 && still) return;                    // (held still: nothing to work out)
            w += Math.sign(want - w) * Math.min(Math.abs(want - w), dt * 1.6);
            kick += ((boost ? 1 : 0) - kick) * Math.min(1, dt * 4);
            if (w > 0) phase += dt * SPEED * (1 + 0.45 * kick); else phase = 0;
            shape(); still = w === 0;
        }
    };
}

// The flag on the results screen for a winner: a row of thin upright strips of one chequered picture, each bobbing a
// moment after the one before it, so a wave runs along the cloth. The moving is done by style.css (.win-flag).
const STRIPS = 12;
export const winFlag = (flip = false) => `<span class="win-flag${flip ? ' flip' : ''}" aria-hidden="true"><i class="wf-pole"></i>${Array.from({ length: STRIPS }, (_, i) => `<i class="wf-s" style="--i:${i};--p:${(i % 4) * 100 / 3}%"></i>`).join('')}</span>`;
