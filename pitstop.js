// Formula for Victory: the pit stop. Two things live here:
//   1. the PIT BOX painted on the road beside the start straight (and the bays the rivals use, and a PIT sign), and
//   2. the wheel-changing game that opens when you stop in the box.
// The circuits have no pit lane you can drive down (the pit lanes in the scenery are only pictures beyond the wall),
// so the pit box is a painted place at the edge of the road itself, on the side where the pit buildings stand, a little
// way past the start line: clear of the starting grid (which is behind the line), the lights gantry (on the line) and
// the podium (12 m past it). Everything is drawn in code.
// When a pit stop is allowed, who stops and for how long is decided in race.js.
import * as THREE from './lib/three.module.min.js';

// Where the box is on this circuit. A circuit can say for itself (pit: { side, at } in its data: side 1 = the driver's
// left, -1 = the right; at = metres past the start line to the middle of your box); otherwise the right, 56 m past it.
export const BOX_LEN = 13, BOX_W = 3.5, BAY_GAP = 14, BAYS = 3, BAY_AFTER = 10;   // your box (metres long and wide); the rivals' bays: how far apart, how many, and how far past your box the first begins
export function pitLayout(T, C) {
    const side = C.pit && C.pit.side > 0 ? 1 : -1, d = (C.pit && Number.isFinite(C.pit.at) ? C.pit.at : 56), s = T.sampleAt(d);
    const lat = side * (s.hw - BOX_W / 2 - 0.35);   // (the middle of the box: its outer edge is 35 cm in from the edge of the road)
    // the rivals' bays: further along, in a row, at the same distance from the edge
    const bays = Array.from({ length: BAYS }, (_, k) => d + BOX_LEN / 2 + BAY_AFTER + BAY_GAP / 2 + k * BAY_GAP);
    return { side, d, lat, len: BOX_LEN, w: BOX_W, bays, from: d - BOX_LEN / 2, to: bays[BAYS - 1] + BAY_GAP / 2 };
}

// the paint for your box: yellow edges, PIT in tall road-marking letters, and arrows pointing the way you drive.
// (The picture's top is the far end of the box; its left is the driver's left.)
function boxTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const x = c.getContext('2d');
    x.fillStyle = 'rgba(20,22,26,.55)'; x.fillRect(0, 0, 256, 1024);
    x.save(); x.beginPath(); x.rect(0, 0, 256, 1024); x.clip(); x.strokeStyle = 'rgba(255,196,0,.34)'; x.lineWidth = 26;
    for (let y = -256; y < 1280; y += 96) { x.beginPath(); x.moveTo(-10, y + 266); x.lineTo(266, y); x.stroke(); }
    x.restore();
    x.strokeStyle = '#FFC400'; x.lineWidth = 22; x.strokeRect(11, 11, 234, 1002);
    x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(27, 27, 202, 970);
    // the stop line across the far end, where the car's nose comes to rest
    x.fillStyle = '#ffffff'; x.fillRect(27, 118, 202, 22);
    // PIT, stretched along the road so it reads from the driver's seat (road paint is always drawn long like this)
    x.save(); x.translate(128, 520); x.scale(1, 3.3); x.font = '900 104px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText('PIT', 0, 0); x.fillStyle = '#FFC400'; x.fillText('PIT', 0, 0); x.restore();
    // two arrows at the near end, pointing forwards
    x.fillStyle = '#ffffff';
    for (const y of [800, 900]) { x.beginPath(); x.moveTo(128, y - 44); x.lineTo(204, y + 34); x.lineTo(168, y + 34); x.lineTo(128, y - 6); x.lineTo(88, y + 34); x.lineTo(52, y + 34); x.closePath(); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signTexture(side) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#FFC400'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#15171b'; x.fillRect(8, 8, 240, 112);
    x.fillStyle = '#FFC400'; x.font = '900 78px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    // (seen by a driver coming towards it: the arrow points down at the box, on the track's side of the post)
    const arrowX = side > 0 ? 212 : 44; x.fillText('PIT', side > 0 ? 104 : 152, 68);
    x.beginPath(); x.moveTo(arrowX, 108); x.lineTo(arrowX - 30, 62); x.lineTo(arrowX - 11, 62); x.lineTo(arrowX - 11, 22); x.lineTo(arrowX + 11, 22); x.lineTo(arrowX + 11, 62); x.lineTo(arrowX + 30, 62); x.closePath(); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Build the paint and the sign: three small things to draw (your box, the white lines of the rivals' bays and the
// sign's post, and the sign's board). They follow the road's own bends and slopes, a hair above its surface.
export function buildPitMarks(T, P) {
    const group = new THREE.Group(), LIFT = 0.04;
    const strip = (d0, d1, l0, l1, pos, uv, idx, v0 = 0, v1 = 1) => {
        const n = Math.max(1, Math.ceil((d1 - d0) / 2));
        for (let i = 0; i <= n; i++) {
            const u = i / n, d = d0 + (d1 - d0) * u, a = T.pathAt(d, l0, 0), b = T.pathAt(d, l1, 0), k = pos.length / 3;
            pos.push(a.x, a.y + LIFT, a.z, b.x, b.y + LIFT, b.z); uv.push(0, v0 + (v1 - v0) * u, 1, v0 + (v1 - v0) * u);
            if (i < n) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
    };
    const mesh = (pos, uv, idx, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); const m = new THREE.Mesh(g, mat); m.userData.always = true; m.renderOrder = 1; return m; };
    const flat = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    // your box (the picture's left edge is the driver's left, so the strip runs from the left edge to the right)
    { const pos = [], uv = [], idx = []; strip(P.d - P.len / 2, P.d + P.len / 2, P.lat + P.w / 2, P.lat - P.w / 2, pos, uv, idx);
      group.add(mesh(pos, uv, idx, new THREE.MeshBasicMaterial({ map: boxTexture(), transparent: true, depthWrite: false, ...flat }))); }
    // the rivals' bays: plain white outlines, and the sign's post
    const pos = [], uv = [], idx = [], line = 0.16;
    for (const d of P.bays) {
        const a = d - BAY_GAP / 2 + 1.4, b = d + BAY_GAP / 2 - 1.4, l0 = P.lat + P.w / 2, l1 = P.lat - P.w / 2;
        strip(a, b, l0, l0 - line, pos, uv, idx); strip(a, b, l1 + line, l1, pos, uv, idx);
        strip(b - line, b, l0, l1, pos, uv, idx); strip(a, a + line, l0, l1, pos, uv, idx);
    }
    // the PIT sign: a post standing just behind the barrier, a little before your box, with its board held out over
    // the edge of the road, high enough (4.3 m and up) for the chase camera to pass beneath it
    const sd = P.from - 5, s = T.sampleAt(sd), wall = P.side > 0 ? s.wl : s.wr, post = T.pathAt(sd, P.side * (wall + 0.3), 0), TOP = 5.7, LOW = 4.3, REACH = 2.8;
    const tx = Math.cos(post.heading), tz = -Math.sin(post.heading), nx = s.n.x * P.side, nz = s.n.z * P.side;   // (along the road; out towards the wall)
    { const hw = 0.09;
      for (const [ox, oz] of [[nx, nz], [tx, tz]]) { const q = pos.length / 3;
          pos.push(post.x - ox * hw, post.y, post.z - oz * hw, post.x + ox * hw, post.y, post.z + oz * hw, post.x - ox * hw, post.y + TOP, post.z - oz * hw, post.x + ox * hw, post.y + TOP, post.z + oz * hw);
          uv.push(0, 0, 1, 0, 0, 1, 1, 1); idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    group.add(mesh(pos, uv, idx, new THREE.MeshBasicMaterial({ color: 0xf2f2f2, ...flat })));
    { const g = new THREE.BufferGeometry(), a = [post.x, post.z], b = [post.x - nx * REACH, post.z - nz * REACH];   // (from the post, in over the road)
      // (its face looks back down the road, at the cars coming: left and right are as the driver sees them)
      const L = P.side > 0 ? a : b, R = P.side > 0 ? b : a;
      g.setAttribute('position', new THREE.Float32BufferAttribute([L[0], post.y + LOW, L[1], R[0], post.y + LOW, R[1], L[0], post.y + TOP, L[1], R[0], post.y + TOP, R[1]], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); g.setIndex([0, 1, 2, 1, 3, 2]);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: signTexture(P.side), side: THREE.DoubleSide, fog: true })); m.userData.always = true; group.add(m); }
    group.userData.always = true; group.userData.pitMarks = true;
    return group;
}

// =====================================================================
//  THE WHEEL-CHANGING GAME
// =====================================================================
// The car is seen from above, nose up, with a big round button at each wheel (1 front left, 2 front right, 3 rear
// left, 4 rear right: the same numbers as the keys on a laptop). Each wheel takes two taps: the old one comes off,
// the new one goes on. The clock runs from the moment the car stops until the fourth new wheel is on.
// race.js owns the rules and the clock; this only draws the panel and passes the taps on.
export class PitPanel {
    constructor(wrap, before, onTap, onLeave) {
        const el = this.el = document.createElement('div'); el.className = 'pit-panel'; el.id = 'race-pit'; el.hidden = true;
        el.innerHTML = `<div class="pit-box"><span class="kicker">Pit stop</span>
            <div class="pit-clock" id="pit-clock" aria-live="off">0.0<small>s</small></div>
            <p class="pit-how" id="pit-how"></p>
            <div class="pit-car" aria-label="Your car, seen from above">
                <span class="pit-body" aria-hidden="true"><i class="pit-nose"></i><i class="pit-wingf"></i><i class="pit-tub"></i><i class="pit-wingr"></i></span>
                ${[['fl', 'front left'], ['fr', 'front right'], ['rl', 'rear left'], ['rr', 'rear right']].map(([c, name], i) => `<button class="pit-wheel ${c}" data-wheel="${i}" aria-label="Wheel ${i + 1}, ${name}"><i aria-hidden="true"></i><b>${i + 1}</b></button>`).join('')}
            </div>
            <button class="act-btn ghost pit-leave" id="pit-leave">Drive on: no new wheels</button></div>`;
        wrap.insertBefore(el, before);   // (under the pause box, which must still cover it)
        this.clock = el.querySelector('#pit-clock'); this.how = el.querySelector('#pit-how'); this.wheels = [...el.querySelectorAll('.pit-wheel')]; this.leave = el.querySelector('#pit-leave');
        // (pointerdown, not click: the tap counts the moment the finger lands)
        el.addEventListener('pointerdown', e => { const b = e.target.closest('.pit-wheel'); if (b) { e.preventDefault(); onTap(+b.dataset.wheel); } });
        this.leave.addEventListener('click', () => onLeave());
        el.addEventListener('contextmenu', e => e.preventDefault());
    }
    // keys: also say which keys to press (a laptop); side: which side of the screen the panel sits (the pit wall's side,
    // so the road, and the rivals going by, stay in view); design: the car's colours
    open(keys, side = -1, design = null) {
        this.el.classList.toggle('left', side > 0);
        if (design) { this.el.style.setProperty('--c1', design.paint); this.el.style.setProperty('--c2', design.stripeColour || '#F4F6F8'); }
        this.wheels.forEach(w => { w.className = w.className.replace(/ (off|new)\b/g, ''); w.disabled = false; });
        this.how.textContent = `Change all four wheels! Tap each wheel twice: old one off, new one on.${keys ? ' Or press 1, 2, 3 and 4.' : ''}`;
        this.how.classList.remove('done'); this.leave.hidden = false; this.shown = ''; this.time(0);
        this.el.hidden = false;
    }
    // a wheel's taps so far: 1 = the old wheel is off, 2 = the new one is on
    wheel(i, taps) { const w = this.wheels[i]; if (!w) return; w.classList.toggle('off', taps === 1); w.classList.toggle('new', taps >= 2); if (taps >= 2) w.disabled = true; }
    time(t) { const s = t.toFixed(1); if (s !== this.shown) { this.shown = s; this.clock.firstChild.nodeValue = s; } }
    result(text) { this.how.textContent = text; this.how.classList.add('done'); this.leave.hidden = true; }
    close() { this.el.hidden = true; }
}
