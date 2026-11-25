// Formula for Victory: the far distance. Everything you see beyond the end of the scenery is one drawing: a photographed
// sky (free CC0 sky photos from Poly Haven, see SKIES) with a painted horizon in front of it (hills, woods, fields, a town
// on a hillside, the sea), all the way round. Each circuit describes its own horizon and its own light in its data file
// ('backdrop' in circuits/monza.js and the others), so a new circuit only has to add that.
//
// How it stays cheap on a tablet:
//  - the sky and the horizon are drawn together, as ONE thing, after everything else, so only the part of the screen
//    where sky really shows is ever filled in;
//  - the horizon is painted once (when a circuit loads or the weather changes) onto a long thin picture;
//  - Low graphics uses pictures half the size.
// The haze colour is shared: the bottom of the sky, the foot of every painted hill and the fog that distant scenery fades
// into are all exactly the same colour, so there is no line where the scenery ends.
import * as THREE from './lib/three.module.min.js';

// =====================================================================
//  THE SKY PHOTOS (made by tools/bake_sky.py, which also prints sunU and sunEl)
//  'half' pictures hold the sky from the horizon up to straight overhead; the three older ones are whole panoramas.
// =====================================================================
export const SKIES = {
    riviera:  { file: 'skies/riviera',  half: true, sunU: 0.6003, sunEl: 42.9 },   // Kloofendal 43d Clear (Pure Sky)
    airfield: { file: 'skies/airfield', half: true, sunU: 0.6013, sunEl: 50.9 },   // Farm Field (Pure Sky)
    park:     { file: 'skies/park',     half: true, sunU: 0.6001, sunEl: 19.1 },   // Qwantani Late Afternoon (Pure Sky)
    overcast: { file: 'skies/overcast', half: true, sunU: 0.5820, sunEl: 23.1 },   // Kloofendal Overcast (Pure Sky)
    day:      { file: 'skies/day' }, sunset: { file: 'skies/sunset' }, night: { file: 'skies/night' }
};
const loader = new THREE.TextureLoader(), loaded = {}, waiters = [];
// the picture for a sky, or null while it is still on its way (f is then called once, when it arrives)
function skyTexture(key, low, f) {
    const S = SKIES[key], url = S.file + (low && S.half ? '_low' : '') + '.webp';
    let e = loaded[url];
    if (!e) {
        e = loaded[url] = { tex: null, sunU: S.sunU ?? 0.25, failed: false };
        loader.load(url, tex => {
            tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
            if (S.sunU == null) e.sunU = brightestU(tex.image);
            e.tex = tex; waiters.splice(0).forEach(g => g());
        }, undefined, () => { e.failed = true; });
    }
    if (!e.tex && !e.failed && f) waiters.push(f);
    return e;
}
// (the older panoramas were not measured when they were made: find the sun, the brightest spot, once)
function brightestU(img) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 256, 128);
    const d = x.getImageData(0, 0, 256, 64).data; let best = -1, bu = 0.25;
    for (let j = 16; j < 62; j++) for (let i = 0; i < 256; i++) { const k = (j * 256 + i) * 4, l = d[k] + d[k + 1] + d[k + 2]; if (l > best) { best = l; bu = i / 256; } }
    return bu;
}
// only the sky in use stays in the tablet's memory
function forgetOtherSkies(keepUrl) { for (const [url, e] of Object.entries(loaded)) if (url !== keepUrl && e.tex) { e.tex.dispose(); delete loaded[url]; } }

// =====================================================================
//  COLOUR: the game draws through a 'film' tone curve (the same one for everything). Colours in a circuit's backdrop are
//  written as they should LOOK on screen; these work out what to draw so that they come out that way.
// =====================================================================
const A_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const A_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const A_IN_BACK = A_IN.clone().invert(), A_OUT_BACK = A_OUT.clone().invert(), v3 = new THREE.Vector3();
const curve = v => Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081));
const uncurve = d => { const A = 1 - 0.983729 * d, B = 0.0245786 - 0.432951 * d, C = -(0.000090537 + 0.238081 * d); return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// a colour as it should look on screen (like 0xdfe3e0) -> the colour to draw in the 3D scene
export function toScene(look, exposure = 1.05) {
    const c = look.isColor ? look.clone() : new THREE.Color(look);
    v3.set(Math.min(c.r, 0.8), Math.min(c.g, 0.8), Math.min(c.b, 0.8)).applyMatrix3(A_OUT_BACK);
    v3.set(uncurve(clamp(v3.x, 0, 0.95)), uncurve(clamp(v3.y, 0, 0.95)), uncurve(clamp(v3.z, 0, 0.95))).applyMatrix3(A_IN_BACK).multiplyScalar(0.6 / exposure);
    return c.setRGB(Math.max(0, v3.x), Math.max(0, v3.y), Math.max(0, v3.z));
}
// a colour in the 3D scene -> how it comes out on screen (as plain numbers, ready for the screen)
function toScreen(scene, exposure) {
    v3.set(scene.r, scene.g, scene.b).multiplyScalar(exposure / 0.6).applyMatrix3(A_IN);
    v3.set(curve(v3.x), curve(v3.y), curve(v3.z)).applyMatrix3(A_OUT);
    return new THREE.Color().setRGB(clamp(v3.x), clamp(v3.y), clamp(v3.z)).convertLinearToSRGB();
}
// The colour to give the fog. With the film effects on (Medium and High) the whole picture goes through the tone curve
// at the end, fog and all; without them (Low) the fog is mixed in after the curve, so it must already be a screen colour.
export function fogColour(look, direct) { return direct ? toScreen(look.haze, look.light.exposure) : look.haze.clone(); }
export function seaFogColour(look, direct) { return direct ? toScreen(look.seaHaze, look.light.exposure) : look.seaHaze.clone(); }

// =====================================================================
//  THE LOOK: sky, haze, light and colour grade for a circuit in a given weather and time of day.
//  t: the plain look from scenery.js (lookFor) with the weather applied (weatherLook). circuit.backdrop adds:
//    sky      which photo on a sunny day (a name from SKIES)
//    haze     the colour of the horizon on a sunny day, as it should look on screen
//    looks    { sunny, cloudy, rain, snow, sunset, night }: anything below, set just for that weather
//  Each look can set: sky, tint (the photo's colour, [r, g, b]), haze, seaHaze, hazeTop (degrees: how high the haze
//  reaches up the sky), fog [near, far], sunEl (degrees), sun, sunColor, hemi, hemiSky, hemiGround, env, exposure,
//  sunTint (the photo's colour towards the sun, [r, g, b]: a golden glow there, say), grade ([r, g, b] for the final
//  picture), sat (how colourful) and skySat (how colourful the sky photo is: above 1 turns
//  its pale blue patches a clearer blue, while white and grey clouds stay as they are).
// =====================================================================
const GREY = { cloudy: { haze: 0xc6ccd1, tint: [0.96, 0.97, 1.0], mix: 0.3 }, rain: { haze: 0xa9b0b8, tint: [0.72, 0.74, 0.78], mix: 0.2 }, snow: { haze: 0xe2e6ea, tint: [1.12, 1.13, 1.16], mix: 0.1 } };
export function lookFor(circuit, t) {
    const B = (circuit && circuit.backdrop) || {}, kind = t.weather || (t.time === 'day' ? 'sunny' : t.time), own = (B.looks && B.looks[kind]) || {}, day = (B.looks && B.looks.sunny) || {};
    const L = { ...t, kind, light: { ...t.light, hemiSky: 0xcfe8ff, hemiGround: 0x4a5a3a }, tint: [1, 1, 1], hazeTop: 7, grade: [1, 1, 1], sat: 1.08, skySat: 1, ringLight: [1, 1, 1], ringHaze: 0, backdrop: B };
    let haze, hazeIsScreen = true;
    if (kind === 'sunny') { L.sky = B.sky || 'day'; haze = B.haze ?? t.horizon; if (B.haze == null) hazeIsScreen = false; }
    else if (GREY[kind] && t.time === 'day') {
        // grey weather: one overcast photo for every circuit, with a little of the circuit's own colour left in the haze
        const G = GREY[kind]; L.sky = 'overcast'; L.tint = G.tint; L.hazeTop = 12; L.sat = kind === 'rain' ? 0.94 : 1;
        haze = new THREE.Color(G.haze).lerp(new THREE.Color(B.haze ?? G.haze), G.mix);
        L.ringLight = kind === 'snow' ? [1.25, 1.27, 1.32] : kind === 'rain' ? [0.6, 0.63, 0.68] : [0.78, 0.8, 0.84]; L.ringHaze = kind === 'cloudy' ? 0.12 : 0.3;
        L.light.hemiSky = 0xdde3ea; L.light.hemiGround = 0x54584f;
    } else {
        // sunset and night (and bad weather then): the older whole-sky photos, or the plain drawn sky under cloud
        L.sky = t.weather ? null : t.time; haze = t.horizon; hazeIsScreen = false; L.hazeTop = t.time === 'night' ? 10 : 14;
        L.ringLight = t.time === 'night' ? [0.05, 0.06, 0.1] : [0.5, 0.36, 0.32]; L.ringHaze = t.time === 'night' ? 0.1 : 0.2; L.night = t.time === 'night';
        if (t.time === 'sunset') { L.light.hemiSky = 0xffd2b0; L.light.hemiGround = 0x4a4038; L.grade = [1.05, 0.98, 0.92]; }
        if (t.time === 'night') { L.light.hemiSky = 0x8aa0d8; L.light.hemiGround = 0x20242c; }
    }
    // the circuit's own choices (a little of its sunny-day colour carries over to the other weathers)
    if (kind !== 'sunny' && t.time === 'day' && day.grade) L.grade = day.grade.map(v => 1 + (v - 1) * 0.4);
    for (const [k, v] of Object.entries(own)) {
        if (k === 'haze') { haze = v; hazeIsScreen = true; }
        else if (['sun', 'sunColor', 'hemi', 'hemiSky', 'hemiGround', 'env', 'exposure'].includes(k)) L.light[k] = v;
        else L[k] = v;
    }
    if (kind !== 'sunny' && day.fog && !own.fog && t.baseFog) L.fog = [day.fog[0] * t.fog[0] / t.baseFog[0], day.fog[1] * t.fog[1] / t.baseFog[1]];   // (as much nearer as the weather brings it)
    L.haze = hazeIsScreen ? toScene(haze, L.light.exposure) : new THREE.Color(haze);
    L.seaHaze = own.seaHaze != null ? toScene(own.seaHaze, L.light.exposure)
        : kind === 'sunny' && B.seaHaze != null ? toScene(B.seaHaze, L.light.exposure) : L.haze.clone().multiply(new THREE.Color(0.62, 0.78, 0.9));
    // the sunlight comes from where the theme says (so shadows fall the same way), at the height the look asks for
    if (L.sunEl != null) { const [x, , z] = t.sun, h = Math.hypot(x, z) || 1, e = L.sunEl * Math.PI / 180; L.sun = [x / h * Math.cos(e), Math.sin(e), z / h * Math.cos(e)]; }
    return L;
}

// =====================================================================
//  PAINTING THE HORIZON: a long thin picture, once round the compass (north at the left edge, turning clockwise) and
//  from a little below the horizon up to 'top' degrees. Layers are painted from the furthest to the nearest:
//    ridge   hills or mountains: { from, to, base, height, freq, seed, colour, haze, snow, sharp, floor, facets, scrub }
//            (scrub: how much dark scrub and pine grows in patches on the slopes, 0 to 1)
//    trees   the top of a wood: the same, with a bumpy leafy edge
//    fields  farmland rising gently: patchwork fields with hedges between them and a few trees
//    town    buildings on a hillside: { ..., count, cover, colours } (lit windows at night)
//    clouds  low clouds hanging on the hills: { from, to, base, height, count }
//    sea     open water out to the horizon: { from, to }
//  from, to: compass bearings in degrees (0 north, 90 east), clockwise from 'from' to 'to'; leave both out for all the
//  way round. base, height: degrees above the horizon. haze: how far it has faded into the haze (0 none, 1 gone; it is mixed
//  as light, so a dark slope is already quite pale by 0.2: the nearer layers usually want less).
// =====================================================================
const DEG = Math.PI / 180;
const rng = seed => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod360 = b => ((b % 360) + 360) % 360;
// how much of a layer shows at this bearing: 1 inside its stretch, fading out over 'fade' degrees at each end
function span(L, b) {
    if (L.from == null || L.to == null) return 1;
    const len = mod360(L.to - L.from) || 360, rel = mod360(b - L.from), fade = L.fade ?? 12;
    return rel > len ? 0 : smooth(0, fade, rel) * smooth(0, fade, len - rel);
}
// the skyline of a layer: degrees above the horizon at each bearing (it joins up with itself after a full turn)
function skyline(L) {
    const r = rng(L.seed || 1), f0 = L.freq || 3, terms = []; let sum = 0;
    for (const k of [1, 2, 3, 5, 8, 13, 21]) { const a = 1 / Math.pow(k, L.rough ?? 0.85); terms.push([Math.max(1, Math.round(f0 * k)), r() * 6.2832, a]); sum += a; }
    const floor = L.floor ?? 0.35, sharp = L.sharp ?? 1;
    return b => {
        let t = 0; for (const [f, p, a] of terms) t += a * Math.sin(b * DEG * f + p);
        t = clamp(0.5 + 0.62 * t / sum * 1.6);
        return (L.base || 0) + L.height * span(L, b) * (floor + (1 - floor) * Math.pow(t, sharp));
    };
}
let ringCache = null;
function horizonTexture(look, low) {
    const B = look.backdrop, H = B.horizon || { layers: [] }, id = [B.id || '', look.kind, look.time, low ? 1 : 0, look.haze.getHexString(), look.seaHaze.getHexString()].join('|');
    if (ringCache && ringCache.id === id) return ringCache;
    if (ringCache) ringCache.tex.dispose();
    const W = low ? 2048 : 4096, Hh = low ? 128 : 256, e0 = H.bottom ?? -3, e1 = H.top ?? 12, px = W / 360, py = Hh / (e1 - e0);
    const c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
    const X = b => b * px, Y = e => (e1 - e) * py, haze = look.haze, light = new THREE.Color(...look.ringLight), ex = look.light.exposure;
    // (the picture is saved as square roots of the light levels: the drawing code squares them again, which is cheap)
    const css = (col, a = 1) => `rgba(${Math.round(Math.sqrt(clamp(col.r)) * 255)},${Math.round(Math.sqrt(clamp(col.g)) * 255)},${Math.round(Math.sqrt(clamp(col.b)) * 255)},${a})`;
    const shade = (colour, hazed, k = 1) => toScene(colour, ex).multiply(light).multiplyScalar(k).lerp(haze, clamp(hazed + look.ringHaze * (1 - hazed)));
    const sunB = mod360(Math.atan2(look.sun[0], -look.sun[2]) / DEG);
    const STEP = 360 / W * 2;
    const trace = (line, lift = 0) => { x.beginPath(); x.moveTo(X(-1), Y(e0) + 2); for (let b = -1; b <= 361; b += STEP) x.lineTo(X(b), Y(Math.min(e1 - 0.4, line(b)) + lift)); x.lineTo(X(361), Y(e0) + 2); x.closePath(); };
    const fillDown = (L, line, top, bottom) => { const g = x.createLinearGradient(0, Y((L.base || 0) + L.height), 0, Y(0)); g.addColorStop(0, css(top)); g.addColorStop(1, css(bottom)); x.fillStyle = g; trace(line); x.fill(); };
    // draw something at a bearing, and again a full turn away if it hangs over the picture's edge (so the join never shows)
    const wrap = (b, wDeg, draw) => { draw(b); if (b - wDeg < 0) draw(b + 360); if (b + wDeg > 360) draw(b - 360); };
    const inSpan = (L, r) => L.from == null ? r() * 360 : mod360(L.from + r() * (mod360(L.to - L.from) || 360));

    for (const L of H.layers) {
        if (L.kind === 'sea' || L.only && L.only !== look.kind) continue;
        const r = rng((L.seed || 1) + 77), hz = L.haze ?? 0.5;
        if (L.kind === 'clouds') {
            if (look.kind !== 'sunny' && look.time === 'day') continue;      // (lost in the overcast)
            const white = shade(0xffffff, 0.2), grey = shade(0xb9c0c8, 0.3);
            for (let i = 0; i < (L.count || 8); i++) {
                const b0 = inSpan(L, r), eC = (L.base || 0) + r() * L.height, size = (0.8 + r() * 1.6) * (L.size || 1);
                for (let k = 0; k < 7; k++) {
                    const b = b0 + (r() - 0.5) * size * 5, e = eC + (r() - 0.5) * size * 0.5, rad = size * (0.5 + r() * 0.7);
                    wrap(mod360(b), rad * 2, bb => { for (const [col, dy, a] of [[grey, -0.18, 0.5], [white, 0.1, 0.85]]) {
                        x.save(); x.translate(X(bb), Y(e + dy * rad)); x.scale(rad * px * 1.7, rad * py * 0.75);
                        const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, css(col, a)); g.addColorStop(0.55, css(col, a * 0.7)); g.addColorStop(1, css(col, 0));
                        x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); } });
                }
            }
            continue;
        }
        const line = skyline(L), top = shade(L.colour ?? 0x808080, hz), bottom = shade(L.colour ?? 0x808080, Math.min(1, hz + (L.sink ?? 0.3)));
        if (L.kind === 'ridge' || L.kind === 'town') {
            fillDown(L, line, top, bottom);
            x.save(); trace(line); x.clip();
            // the side of each peak away from the sun is in shade
            if (L.facets !== 0) {
                const dark = shade(L.colour, hz, 0.7), stepB = 0.5;
                for (let b = 0; b < 360; b += stepB) {
                    const e = line(b), lo = (L.base || 0) + L.height * 0.2; if (e < lo || e < line(b - stepB) || e <= line(b + stepB)) continue;
                    const away = mod360(b - sunB) < 180 ? 1 : -1, wDeg = (e - (L.base || 0)) * py / px * (0.9 + r() * 0.8);
                    wrap(b, wDeg * 1.2, bb => { x.fillStyle = css(dark, 0.5 * (L.facets ?? 1)); x.beginPath(); x.moveTo(X(bb), Y(e)); x.lineTo(X(bb + away * wDeg), Y(L.base || 0)); x.lineTo(X(bb + away * wDeg * 0.12), Y(L.base || 0)); x.closePath(); x.fill(); });
                }
            }
            if (L.scrub) {
                // dark scrub and pines in patches over the rock: thick low down, thinning out to bare rock at the tops
                const base = L.base || 0, greens = [shade(L.scrubColour ?? 0x34502e, hz * 0.6), shade(L.scrubColour ?? 0x34502e, hz * 0.6, 0.7), shade(0x4f6a3c, hz * 0.6)];
                for (let i = 0, n = Math.round(L.scrub * 4200 * (low ? 0.6 : 1)); i < n; i++) {
                    const b = r() * 360, hill = line(b) - base, t = r(); if (hill < L.height * 0.08 || r() < t * t * 1.15) continue;
                    const e = base + hill * t, col = greens[Math.floor(r() * 3)];
                    for (let k = 0, m = 3 + Math.floor(r() * 5); k < m; k++) {   // (a clump of a few bushes)
                        const bb0 = b + (r() - 0.5) * 0.7, ee = e + (r() - 0.5) * 0.4, rad = (0.08 + r() * 0.16) * (L.scrubSize || 1);
                        wrap(mod360(bb0), rad, bb => { x.fillStyle = css(col, 0.9); x.beginPath(); x.ellipse(X(bb), Y(ee), rad * px, rad * px * 0.7, 0, 0, 7); x.fill(); });
                    }
                }
            }
            if (L.snow) {   // snow on the tops
                const g = x.createLinearGradient(0, Y((L.base || 0) + L.height), 0, Y((L.base || 0) + L.height * (1 - L.snow))); g.addColorStop(0, css(shade(0xffffff, hz * 0.8), 0.95)); g.addColorStop(1, css(shade(0xffffff, hz), 0));
                x.fillStyle = g; x.fillRect(0, 0, W, Hh);
            }
            if (L.kind === 'town') {
                // buildings up the slope: the highest (furthest) first, so nearer ones overlap them
                const list = [], cols = L.colours || [0xf2ead8, 0xf6d9b8, 0xfaf6ee, 0xe9c9a4, 0xf3d6cf, 0xdfe4e8];
                for (let i = 0; i < (L.count || 200) * (low ? 0.6 : 1); i++) { const b = inSpan(L, r), t = Math.pow(r(), 1.2) * (L.cover ?? 0.7); list.push([b, t, r(), r(), r()]); }
                list.sort((p, q) => q[1] - p[1]);
                for (const [b, t, r1, r2, r3] of list) {
                    const hill = line(b) - (L.base || 0); if (hill < L.height * 0.12) continue;
                    const e = (L.base || 0) + hill * t, wDeg = (0.32 + r1 * 0.45) * (1.25 - 0.7 * t) * (L.size || 1), hDeg = wDeg * (r2 < 0.12 ? 2.6 : 0.6 + r2 * 1.5) * px / py * 0.9, far = hz * 0.6 + 0.3 * t;
                    const wall = look.night ? shade(0x30343c, far * 0.5) : shade(cols[Math.floor(r3 * cols.length)], far), side = wall.clone().multiplyScalar(0.72), roof = look.night ? wall : shade(r3 < 0.5 ? 0xc97a55 : 0xd9d4c8, far);
                    wrap(b, wDeg, bb => {
                        const u = X(bb), v = Y(e + hDeg), w = Math.max(2, wDeg * px), h = hDeg * py + 1;
                        x.fillStyle = css(wall); x.fillRect(u, v, w, h); x.fillStyle = css(side); x.fillRect(u + (mod360(b - sunB) < 180 ? w * 0.62 : 0), v, w * 0.38, h);
                        x.fillStyle = css(roof); x.fillRect(u, v - 1, w, 1.5);
                        if (look.night) { x.fillStyle = 'rgba(255,238,170,0.95)'; for (let k = 0; k < 3; k++) if (((r1 * 97 + k * 31) % 1) < 0.6) x.fillRect(u + 1 + ((r2 * 53 + k * 17) % 1) * (w - 2), v + 1 + ((r3 * 71 + k * 29) % 1) * (h - 2), 1.2, 1.2); }
                        else if (h > 5) { x.fillStyle = css(side, 0.55); for (let yy = v + 2; yy < v + h - 1; yy += 2.6) x.fillRect(u + 1, yy, w - 2, 0.8); }
                    });
                }
            }
            x.restore();
        }
        if (L.kind === 'trees') {
            // a wood seen from far off: a leafy edge of round crowns along its top, darker underneath
            const crown = L.crown ?? 0.22, under = shade(L.colour, hz, 0.62);
            x.fillStyle = css(top);
            for (let b = 0; b < 360; b += crown * 0.9) { if (span(L, b) < 0.05) continue; const rad = crown * (0.6 + r() * 0.9), e = line(b) - rad * 0.25 * px / py;
                wrap(b, rad, bb => { x.beginPath(); x.ellipse(X(bb), Y(e), rad * px, rad * px * 0.85, 0, 0, 7); x.fill(); }); }
            fillDown(L, line, top, bottom);
            x.save(); trace(line); x.clip();
            for (let b = 0; b < 360; b += crown * 1.7) { const rad = crown * (0.7 + r() * 1.1), e = line(b) - rad * (0.9 + r() * 1.5) * px / py;
                wrap(b, rad, bb => { x.fillStyle = css(under, 0.3 + r() * 0.25); x.beginPath(); x.ellipse(X(bb), Y(e), rad * px, rad * px * 0.6, 0, 0, 7); x.fill(); }); }
            x.restore();
        }
        if (L.kind === 'fields') {
            // patchwork fields on gently rising ground, row behind row, with hedges and the odd tree between them
            const rows = L.rows || 4, crops = L.colours || [0x7fae55, 0x93b85c, 0x6f9c4c, 0xb9bf6a, 0xcdbf78, 0x86a860, 0xa58f5e];
            for (let k = rows - 1; k >= 0; k--) {
                const part = (k + 1) / rows, rowL = { ...L, seed: (L.seed || 1) + k * 13, height: L.height * part, freq: (L.freq || 5) + k * 2 }, rowLine = skyline(rowL), far = hz + 0.22 * part;
                x.save(); trace(rowLine); x.clip();
                for (let b = -r() * 6; b < 360;) { const w = 2.5 + r() * 8; x.fillStyle = css(shade(crops[Math.floor(r() * crops.length)], far)); x.fillRect(X(b), 0, X(w) + 1, Hh); b += w; }
                x.restore();
                const hedge = shade(L.hedge || 0x3f6238, far * 0.9), rad0 = (L.crown ?? 0.12);
                x.strokeStyle = css(hedge); x.lineWidth = Math.max(1, py * 0.07); x.beginPath(); for (let b = -1; b <= 361; b += STEP) x.lineTo(X(b), Y(rowLine(b))); x.stroke();
                x.fillStyle = css(hedge);
                for (let b = r() * 2; b < 360; b += 0.25 + r() * (2.2 - part)) { if (span(L, b) < 0.1) continue; const clump = r() < 0.12 ? 5 : 1;
                    for (let q = 0; q < clump; q++) { const bb0 = b + q * rad0 * 1.1, rad = rad0 * (0.6 + r() * 1.1) * (1.2 - 0.5 * part);
                        wrap(mod360(bb0), rad, bb => { x.beginPath(); x.ellipse(X(bb), Y(rowLine(bb0)) - rad * px * 0.5, rad * px, rad * px * 0.9, 0, 0, 7); x.fill(); }); } }
            }
        }
    }
    // the haze: thickest along the horizon, thinning out upwards; everything below the horizon is lost in it
    { const up = H.hazeTop ?? 2.5, g = x.createLinearGradient(0, Y(up), 0, Y(0)); g.addColorStop(0, css(haze, 0)); g.addColorStop(1, css(haze, H.hazeStrength ?? 0.85)); x.fillStyle = g; x.fillRect(0, Y(up), W, Y(0) - Y(up));
      x.fillStyle = css(haze); x.fillRect(0, Y(0), W, Hh - Y(0)); }
    // the sea: its own colour right out to the horizon
    for (const L of H.layers) {
        if (L.kind !== 'sea') continue;
        const len = mod360(L.to - L.from) || 360, fade = L.fade ?? 6, sea = look.seaHaze, pale = look.seaHaze.clone().lerp(haze, 0.45);
        for (const off of [0, 360, -360]) {
            const g = x.createLinearGradient(X(L.from + off), 0, X(L.from + len + off), 0);
            g.addColorStop(0, css(sea, 0)); g.addColorStop(Math.min(0.49, fade / len), css(sea, 1)); g.addColorStop(Math.max(0.51, 1 - fade / len), css(sea, 1)); g.addColorStop(1, css(sea, 0));
            x.fillStyle = g; x.fillRect(X(L.from + off), Y(0), X(len), Hh - Y(0));
            x.globalCompositeOperation = 'source-atop'; const v = x.createLinearGradient(0, Y(0), 0, Y(-0.5)); v.addColorStop(0, css(pale, 0.9)); v.addColorStop(1, css(pale, 0));
            x.fillStyle = v; x.fillRect(X(L.from + off), Y(0), X(len), Y(-0.5) - Y(0)); x.globalCompositeOperation = 'source-over';
        }
    }
    x.clearRect(0, 0, W, 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.premultiplyAlpha = true;
    return (ringCache = { id, tex, e0, e1 });
}

// =====================================================================
//  DRAWING IT: a dome round the camera. It is drawn last and at the very back, wherever nothing else has been drawn.
// =====================================================================
let domeGeo = null;
function dome() {
    if (domeGeo) return domeGeo;
    // rings of points at these heights (degrees): close together near the horizon, where the painted hills are
    const els = [-90, -30, -10, -5, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 22, 26, 30, 36, 44, 54, 66, 78, 90], n = 48, pos = [], uv = [], idx = [];
    els.forEach((el, j) => { for (let i = 0; i <= n; i++) { const b = i / n * 360 * DEG, e = el * DEG; pos.push(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)); uv.push(i / n, el); }
        if (j) for (let i = 0; i < n; i++) { const a = (j - 1) * (n + 1) + i, c = j * (n + 1) + i; idx.push(a, c, a + 1, a + 1, c, c + 1); } });
    domeGeo = new THREE.BufferGeometry(); domeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); domeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); domeGeo.setIndex(idx);
    return domeGeo;
}
const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position.z = gl_Position.w; }`;   // (turns with the camera but never moves: always at the very back)
const FRAG = `uniform sampler2D sky; uniform sampler2D ring; uniform vec3 haze; uniform vec3 tint; uniform vec3 top; uniform float skySat;
uniform vec3 sunTint; uniform vec3 sunDir;   // the photo's colour towards the sun (it fades into 'tint' away from it)
uniform vec4 skyMap;    // how far the photo is turned, the heights (degrees) of its bottom and top edges, and whether there is one
uniform vec3 ringMap;   // the painted horizon's bottom edge (degrees), 1 / its height, and whether there is one
uniform vec2 hazeBand;  // the haze reaches from just below the horizon up to here (degrees)
varying vec2 vUv;
void main() {
  float el = vUv.y;
  vec3 c = mix(haze, top, pow(clamp(el / 90.0, 0.0, 1.0), 0.55));
  if (skyMap.w > 0.5) { float b = vUv.x * 6.2831853, e = el * 0.0174533; float toSun = pow(max(0.0, dot(vec3(sin(b) * cos(e), sin(e), -cos(b) * cos(e)), sunDir)), 3.0);
    c = texture2D(sky, vec2(vUv.x + skyMap.x, (el - skyMap.y) / (skyMap.z - skyMap.y))).rgb * mix(tint, sunTint, toSun); c = max(mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, skySat), 0.0); }
  c = mix(haze, c, smoothstep(hazeBand.x, hazeBand.y, el));
  if (ringMap.z > 0.5) { vec4 r = texture2D(ring, vec2(vUv.x, (el - ringMap.x) * ringMap.y)); vec3 e = r.rgb / max(r.a, 0.004); c = mix(c, e * e, r.a); }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// look: from lookFor. low: Low graphics (smaller pictures). onLoad: called if the sky photo arrives later (make the sky again).
export function makeSky(look, low = false, onLoad = null) {
    const S = look.sky ? SKIES[look.sky] : null, e = S ? skyTexture(look.sky, low, onLoad) : null, ring = horizonTexture(look, low);
    if (e && e.tex) forgetOtherSkies(S.file + (low && S.half ? '_low' : '') + '.webp');
    // turn the photo so that its sun sits where the scene's sunlight comes from
    const sunTurn = e ? e.sunU - mod360(Math.atan2(look.sun[0], -look.sun[2]) / DEG) / 360 : 0;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthWrite: false, fog: false, uniforms: {
        sky: { value: e ? e.tex : null }, ring: { value: ring.tex }, haze: { value: look.haze.clone() }, tint: { value: new THREE.Color(...look.tint) }, top: { value: new THREE.Color(look.top) }, skySat: { value: look.skySat }, sunTint: { value: new THREE.Color(...(look.sunTint || look.tint)) }, sunDir: { value: new THREE.Vector3(...look.sun).normalize() },
        skyMap: { value: new THREE.Vector4(sunTurn, S && S.half ? 0 : -90, 90, e && e.tex ? 1 : 0) }, ringMap: { value: new THREE.Vector3(ring.e0, 1 / (ring.e1 - ring.e0), 1) },
        hazeBand: { value: new THREE.Vector2(-1, look.hazeTop) } } });
    const sky = new THREE.Mesh(dome(), mat); sky.frustumCulled = false; sky.renderOrder = 10; sky.userData.ready = !e || !!e.tex || e.failed;
    return sky;
}
