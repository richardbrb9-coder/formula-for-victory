// Formula for Victory: the racing (grown from the driving part of Supercar Legends).
// Arcade driving, not a simulator. Eleven single-seaters, real circuits traced from OpenStreetMap (see track.js and circuits/).
import * as THREE from './lib/three.module.min.js';
import * as SC from './scenery.js';
import { Effects } from './effects.js';
import { Damage } from './damage.js';
import { buildCockpit } from './cockpit.js';
import { fitSuspension, updateSuspension, jolt } from './suspension.js';
import { ReflectionProbe, reflectiveMaterials } from './reflections.js';
import { kerbHeight } from './trackdetail.js';
import { buildTrackData, buildTrackMeshes, KERB_KS, KERB_W } from './track.js';
import { RaceSound } from './soundfx.js';
import { Weather, WEATHERS, weatherLook } from './weather.js';
import * as BD from './backdrop.js';
import { Post } from './post.js';
import { createCar, carStats } from './carmodel.js';
import { teamDesign } from './teamdesign.js';
import { pitLayout, buildPitMarks, PitPanel, BAY_GAP } from './pitstop.js';

// =====================================================================
//  THE TRACK (built by track.js from the circuit's data; everything else is placed along it)
// =====================================================================
let TRACK = null, T = null;            // the circuit's data, and its samples (a point every 2 m round the lap)
let N = 0, samples = null, trackLen = 0;
const sampleAt = d => T.sampleAt(d);
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const lineAt = d => T.lineAt(d);
const pathAt = (d, extraOffset = 0, lineScale = 0.9) => T.pathAt(d, extraOffset, lineScale);
// the starting grid: two staggered columns behind the line [metres behind the line, metres from the middle of the road]
const GRID = Array.from({ length: window.FFV.TEAMS.length }, (_, k) => [-12 - k * 8, k % 2 ? -3.2 : 3.2]);
function buildTrack(scene) {
    const made = buildTrackMeshes(T, GRID), group = made.group, b = T.box;
    const bounds = { minX: b.minX - 260, maxX: b.maxX + 260, minZ: b.minZ - 260, maxZ: b.maxZ + 260 };
    // scenery for this circuit (see circuits/): ground, trees, stands, pits and landmarks
    const ctx = { group, T, circuit: TRACK, samples, N, trackLen, pathAt, nearTrack: T.nearTrack, bounds, theme: TRACK.theme, quality: SC.QUALITY[quality] };
    SC.tyreMarks(ctx);
    const extra = SC.decorate(ctx);
    group.traverse(o => { if (o.isMesh && !o.receiveShadow && o.material && !o.material.transparent) o.receiveShadow = true; });
    // Distance culling: anything lost in the haze isn't drawn at all (big buildings give up a little sooner). Each piece of
    // scenery is measured once here; track.js then switches them on and off a few times a second.
    const listed = new Set(made.lod.map(l => l.o)), box = new THREE.Box3(), ball = new THREE.Sphere(), ownLooks = (TRACK.backdrop && TRACK.backdrop.looks) || {}, ownLook = ownLooks[TRACK.time] || ownLooks.sunny, hazeEnd = ((ownLook && ownLook.fog) || SC.THEMES[TRACK.theme].fog)[1];   // (where this circuit's haze is complete)
    for (const o of group.children) {
        if (listed.has(o) || o.userData.always) continue;
        box.setFromObject(o); if (box.isEmpty()) continue;
        box.getBoundingSphere(ball); if (ball.radius > 700) continue;        // (the ground, the far hills)
        made.lod.push({ o, c: ball.center.clone(), far: Math.min(o.userData.far || 1e9, hazeEnd) + ball.radius });
    }
    scene.add(group);
    return { lightMats: made.lightMats, group, trees: ctx.treeCount || 0, lod: made.lod, noProbe: group.children.filter(o => o.userData.noProbe), setLook: extra.setLook, update: dt => { made.update(camera.position); extra.update(dt, { tunnel: tunnelNow, cam: camera.position }); } };
}

// =====================================================================
//  CARS: every car is the Formula racer (formula.js), in its team's colours
// =====================================================================
const G = 9.81;
// Arcade numbers for a Grand Prix car: huge grip and brakes, so it feels like one, but forgiving
function perf(stats, factor = 1) {
    const vmax = stats.mph * 0.44704 * factor;
    const a0 = 27.78 / stats.z62 / (1 - 0.5 * 27.78 / (stats.mph * 0.44704)) * factor;
    return { vmax, a0, grip: G * 2.1 * factor, brake: 21 };
}
function blobShadow() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.075;   // (just above the kerb tops)
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2;
    return m;
}
// throw away a car's contact shadow (each car has its own little picture for it)
function dropBlob(m) { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
function makeRacer(design, factor, isPlayer) {
    const model = createCar(design, { merge: true, lite: !isPlayer }), stats = carStats(design);   // rivals use the lighter build
    const holder = new THREE.Group(), blob = blobShadow(); holder.add(model.group, blob);
    // The car's shadow on the road is cast by ONE simple copy of its shape (see farModel) instead of its forty parts.
    // The copy is only seen by the sun's shadow camera (layer 1), never by the camera you watch through.
    model.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
    // a soft contact shadow right under the car (with the sun's shadows on, a lighter one, so the car sits on the road)
    blob.material.opacity = renderer && renderer.shadowMap.enabled ? 0.55 : 1;
    const racer = { design, model, holder, blob, stats, perf: perf(stats, factor), isPlayer, x: 0, y: 0, z: 0, heading: 0, v: 0, steer: 0, d: 0, idx: 0, lap: 0,
             lapStart: 0, lastLat: 0, finished: null, best: null, half: false, wheelSpin: 0, lineOffset: 0, lat: 0, latV: 0,
             laps: [], lineStart: 0, hitAt: -9 };   // (laps: every lap time; lineStart: when it first crossed the line after the start; hitAt: its last bump)
    // the red lights on the back (brake light): found once, then lit brighter while the car brakes (see brakeLights)
    racer.tails = []; model.group.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData.brakeLight && !racer.tails.includes(m)) racer.tails.push(m); });
    // and a soft glow round it, so the brake light can be seen from behind (the lamp itself is only a few centimetres)
    if (model.group.userData.rainLight) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        glow.geometry.userData.shared = true; glow.position.copy(model.group.userData.rainLight); glow.visible = false; glow.renderOrder = 2;
        model.group.add(glow); racer.glow = glow;
    }
    racer.far = farModel(model); holder.add(racer.far);   // (made before the springs go in, while every part is in its resting place)
    racer.shadowCaster = new THREE.Mesh(racer.far.geometry, racer.far.material); racer.shadowCaster.position.copy(racer.far.position); racer.shadowCaster.quaternion.copy(racer.far.quaternion);
    racer.shadowCaster.layers.set(1); racer.shadowCaster.castShadow = true; holder.add(racer.shadowCaster);
    fitSuspension(racer, isPlayer && quality !== 'low');     // the body rides on springs; your own car shows its suspension parts
    return racer;
}
// A rival seen from a distance: the whole car as ONE simple shape, each part in its own plain colour. A full car is about
// forty separate pieces for the tablet to draw; with ten rivals that adds up, so only the cars near you are drawn in full.
const mapColours = new Map(), pix = document.createElement('canvas'); pix.width = pix.height = 1;
function averageColour(tex) {
    if (mapColours.has(tex.uuid)) return mapColours.get(tex.uuid);
    const c = new THREE.Color(1, 1, 1);
    try { const x = pix.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.drawImage(tex.image, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; if (d[3] > 8) c.setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace); } catch (e) { /* keeps white */ }
    mapColours.set(tex.uuid, c); return c;
}
// a picture's pixels (shrunk to at most 256 across), to read colours from by texture position (u, v)
const pixelCache = new Map();
function pixelsOf(tex) {
    if (pixelCache.has(tex.uuid)) return pixelCache.get(tex.uuid);
    let out = null;
    try {
        const img = tex.image, iw = img.width || img.videoWidth, ih = img.height || img.videoHeight;
        if (iw && ih) {
            const k = Math.min(1, 256 / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
            const d = x.getImageData(0, 0, w, h).data, rep = tex.repeat, off = tex.offset, flip = tex.flipY;
            out = { at(u, v, c) {
                u = u * rep.x + off.x; v = v * rep.y + off.y; u -= Math.floor(u); v -= Math.floor(v);
                const px = Math.min(w - 1, Math.floor(u * w)), py = Math.min(h - 1, Math.floor((flip ? 1 - v : v) * h)), k4 = (py * w + px) * 4;
                return d[k4 + 3] < 8 ? c.setRGB(1, 1, 1) : c.setRGB(d[k4] / 255, d[k4 + 1] / 255, d[k4 + 2] / 255, THREE.SRGBColorSpace);
            } };
        }
    } catch (e) { out = null; }
    pixelCache.set(tex.uuid, out); return out;
}
function farModel(model) {
    const pos = [], nor = [], col = [], idx = [], v = new THREE.Vector3(), c = new THREE.Color(), m = new THREE.Matrix4(), n3 = new THREE.Matrix3();
    model.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.group.matrixWorld).invert();
    model.group.traverse(o => {
        const mat = o.material;
        if (!o.isMesh || !o.visible || !mat || Array.isArray(mat) || mat === model.mats.spinBlur || (mat.transparent && mat.opacity < 0.6) || !o.geometry.attributes.normal) return;
        const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, base = pos.length / 3;
        m.multiplyMatrices(inv, o.matrixWorld); n3.getNormalMatrix(m);
        c.copy(mat.color || c.set(0xffffff));
        // a painted picture (the livery: stripes, number, sponsors) is copied onto the corners of the triangles, so the
        // simple car still shows its team's colours in the right places; other pictures just give their average colour
        const pic = mat.map && mat.map.image && g.attributes.uv ? pixelsOf(mat.map) : null, U = g.attributes.uv, tc = new THREE.Color();
        if (mat.map && mat.map.image && !pic) c.multiply(averageColour(mat.map));
        if (mat.metalness > 0.6) c.multiplyScalar(0.75);             // (bare metal reads a little darker without its reflections)
        for (let i = 0; i < P.count; i++) {
            v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
            v.fromBufferAttribute(Nn, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z);
            if (pic) { pic.at(U.getX(i), U.getY(i), tc); col.push(c.r * tc.r, c.g * tc.g, c.b * tc.b); } else col.push(c.r, c.g, c.b);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15 }));
    mesh.position.copy(model.group.position); mesh.quaternion.copy(model.group.quaternion); mesh.visible = false;
    return mesh;
}
// how close a rival must be to be drawn in full (a full car is about forty pieces to draw; the simple one is one)
const fullDetailAt = () => quality === 'high' ? 60 : quality === 'medium' ? 24 : 16;
// show a rival in full, or as its simple far-away shape
function showDetail(r, full) {
    if (!r.far || r.fullOn === full) return;
    r.fullOn = full; r.far.visible = !full;
    r.model.group.visible = full;
}
// The eleven made-up teams and their drivers live in teams.js (the one place their names, colours and numbers are kept).
export const TEAMS = window.FFV.TEAMS, YOU_TAG = window.FFV.youTag;   // (you are shown by your driver's own name, with a small YOU tag)
// (each team's car and helmet colours are put together in teamdesign.js, which the Driver Cards' pictures use too)
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');

// =====================================================================
//  STATE
// =====================================================================
let renderer, scene, camera, raf = null, started = false, lastT = 0;
let sky = null, sun = null, hemi = null, efx = null, dmg = null, headlight = null, carGlow = null, look = null, elapsed = 0, puffT = 0;
let timeOfDay = 'day';
let weatherKind = Object.keys(WEATHERS).includes(store('raceWeather', 'sunny')) ? store('raceWeather', 'sunny') : 'sunny', weather = null;
// graphics quality: 'auto' picks a level and steps down if the frame rate drops
let qualitySetting = store('raceQuality', 'auto'), quality = qualitySetting === 'auto' ? autoQuality() : qualitySetting;
// 'auto': the level this device settled on last time, or a first guess
function autoQuality() { const q = store('autoLevel', null); return SC.QUALITY[q] ? q : SC.guessQuality(); }
let world = null, player = null, rivals = [], ghost = null, mode = 'race', difficulty = 'medium';   // mode: 'race', 'trial', or 'quali' (qualifying: alone on the track, before a race)
let gridOrder = null, quali = null;               // the starting grid (team numbers, pole first) once it is known; this qualifying session (see QUALIFYING)
const fieldSize = TEAMS.length - 1;                // ten rivals: a grid of eleven
let lapsChosen = 3, playerTeam = 5, onExit = null; // set by the menus (see start)
let onGrid = null;                                // told the grid as soon as qualifying has set it (the championship saves it)
let champ = null;                                 // a championship race: { round, of, field, points, onFinish } (see start)
let race = null;                                  // { phase: 'grid'|'lights'|'go'|'done', t, lightsT, results }
// OVERTAKE BOOSTS (races only): three a race, each a few seconds of extra top speed and push. Speed only: a boost never
// changes the grip or the steering. A pit stop gives them back. On Medium and Hard the rivals have some too.
const BOOSTS = 3, BOOST_TIME = 3, BOOST_TOP = 1.07, BOOST_PUSH = 1.45, RIVAL_BOOSTS = { easy: 0, medium: 2, hard: 3 }, RIVAL_BOOST_TOP = 1.06, RIVAL_BOOST_PUSH = 1.35;
// PIT STOPS (5-lap races only, and never forced): see pitstop.js for the painted box and the wheel-changing game.
// PIT: where this circuit's box and bays are; PIT_SPEED: the quickest you can be going for the crew to catch the car.
let PIT = null, pitMarks = null, pitPanel = null;
const PIT_SPEED = 21, PIT_SHOW = 1.4;             // metres a second (about 47 mph); seconds your stop time stays on screen before you are let go
const pitsOpen = () => mode === 'race' && (raceLaps() >= 5 || !!window.__pits);   // (__pits: testing only, pit stops in a shorter race)
const input = { left: false, right: false, gas: false, brake: false, tilt: 0 };
// camera views: 0 chase, 1 close chase, 2 bonnet, 3 cockpit (from the driver's seat)
const CAM_NAMES = ['Chase camera', 'Close chase camera', 'Bonnet camera', 'Cockpit view'];
let camMode = [0, 1, 2, 3].includes(store('raceCam', 0)) ? store('raceCam', 0) : 0, help = store('raceHelp', true);
function nextCamera() {
    if (race && (race.replay || race.podium)) return;
    if (race && race.grid) { const m = (race.grid.saveCam + 1) % 4; race.grid.saveCam = m; storeSet('raceCam', m); endGridCam(); flash(CAM_NAMES[m], 1100); return; }   // (during the grid flyover: straight to the new view)
    camMode = (camMode + 1) % 4; storeSet('raceCam', camMode); applyCameraView(); flash(CAM_NAMES[camMode], 1100);
}
// show the cockpit (and hide the car's own cabin shell) only in the cockpit view
function applyCameraView() {
    if (!player) return;
    const inside = camMode === 3;
    player.model.group.traverse(o => { if (o.isMesh && (o.material === player.model.mats.cabin || o.material === player.model.mats.interior || o.material.userData.cabinPart)) o.visible = !inside; });   // (and the seats, driver, wiper and door mirrors, which the cockpit model replaces)
    camera.near = camMode === 2 || (inside && player.cockpit && player.cockpit.openTop) ? 0.06 : 0.5; camera.updateProjectionMatrix();   // (an open cockpit shows the car's own nose and halo close up)
    const st = document.getElementById('race-stage'); if (st) st.classList.toggle('in-cockpit', inside);   // the dash has its own speedometer
}
// The cockpit is drawn in a second pass over the outside world, so the car's own body (whose top runs under the cabin)
// can never poke through the dashboard. It has its own copies of the lights, kept in step with the sun and sky.
let cockpitScene = null, ckHemi = null, ckSun = null;
let post = null; const postSize = new THREE.Vector2();
// the cockpit mirrors: a small, low-detail picture looking backwards, refreshed every third frame (cheap on tablets)
let mirrorRT = null, mirrorCam = null, mirrorTick = 0;
function drawMirror() {
    if (mirrorTick++ % 3) return;
    if (!mirrorRT) {
        mirrorRT = new THREE.WebGLRenderTarget(256, 96); mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
        mirrorRT.texture.repeat.x = -1; mirrorRT.texture.offset.x = 1;                 // a mirror swaps left and right
        mirrorCam = new THREE.PerspectiveCamera(32, 256 / 96, 0.5, 600);
    }
    // (from just above the driver's head, looking level, so it sees over your own tail to the cars behind)
    const r = player, eye = r.cockpit.eye.clone().add(r.cockpit.mirrorFrom || new THREE.Vector3(-0.2, 0.22, 0)); r.holder.updateMatrixWorld(); r.holder.localToWorld(eye);
    const back = new THREE.Vector3(r.cockpit.eye.x - 12, r.cockpit.eye.y + 0.05, r.cockpit.eye.z); r.holder.localToWorld(back);
    mirrorCam.position.copy(eye); mirrorCam.lookAt(back);
    const was = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(mirrorRT); renderer.render(scene, mirrorCam); renderer.setRenderTarget(was); renderer.shadowMap.autoUpdate = sh;
    r.cockpit.setMirror(mirrorRT.texture);
}
// Live reflections (Medium and High graphics): the cars' paint, glass and chrome reflect the real surroundings.
// Low graphics, or a device that can't, keeps the simple sky-and-ground reflections.
let probe = null;
function updateReflections() {
    const want = quality !== 'low' && !window.__noProbe && player;
    if (want && probe === null) { try { probe = new ReflectionProbe(renderer, quality === 'high' ? 128 : 48, quality === 'high' ? 1 : 3); } catch (e) { probe = false; } }
    const tex = want && probe ? probe.texture : null;
    for (const r of [player, ...rivals]) {
        if (!r) continue;
        if (r.envTex !== tex) { r.envTex = tex; for (const m of reflectiveMaterials(r.model)) { m.envMap = tex; m.needsUpdate = true; } }
        // (the real surroundings are darker than the old plain sky, so a little brighter; each material keeps its own
        // strength from carmodel.js, e.g. the darker see-through glass, as a multiplier)
        if (tex) for (const m of reflectiveMaterials(r.model)) { if (m.userData.envBase === undefined) m.userData.envBase = m.envMapIntensity; m.envMapIntensity = scene.environmentIntensity * 1.35 * m.userData.envBase; }
    }
    if (tex) probe.update(scene, race.podium && !race.replay ? podium.group.position : player.holder.position, [player.holder, weather && weather.group, ...(quality === 'high' ? [] : [...world.noProbe, ...rivals.map(r => r.holder)])].filter(Boolean), sky);   // (below High graphics the big buildings and the other cars are left out of the reflections)
}
// where the sun is in the picture, and how strongly its lens flare shows (sunny days and sunsets only)
const sunTmp = new THREE.Vector3(), sunUV = new THREE.Vector2(), SUN_SUNSET = new THREE.Color(1, 0.62, 0.32), SUN_DAY = new THREE.Color(1, 0.93, 0.8);
function sunOnScreen() {
    if (!sun || !sun.userData.dir || weatherKind !== 'sunny' || timeOfDay === 'night' || tunnelNow > 0.2) return null;
    sunTmp.copy(sun.userData.dir).multiplyScalar(1000).add(camera.position).project(camera);
    if (sunTmp.z > 1 || Math.abs(sunTmp.x) > 1.3 || Math.abs(sunTmp.y) > 1.3) return null;
    const edge = Math.max(Math.abs(sunTmp.x), Math.abs(sunTmp.y)), vis = Math.max(0, Math.min(1, (1.3 - edge) / 0.4)) * (timeOfDay === 'sunset' ? 1 : 0.8);
    sunUV.set(sunTmp.x * 0.5 + 0.5, sunTmp.y * 0.5 + 0.5);
    return { uv: sunUV, vis, colour: timeOfDay === 'sunset' ? SUN_SUNSET : SUN_DAY };
}
// Medium and High graphics: the picture goes through the film-camera effects (glow, motion blur, grade); Low draws directly
const filmEffects = () => quality !== 'low' && !window.__noPost && post !== false;
function drawFrame() {
    const usePost = filmEffects();
    if (race) updateReflections();
    if (camMode === 3 && player && player.cockpit && quality !== 'low' && !(race && race.replay)) drawMirror();
    if (usePost) {
        if (!post) { try { post = new Post(renderer); } catch (e) { post = false; if (world && TRACK) setAtmosphere(TRACK.theme); } }   // (without the effects the haze colour is worked out differently)
        if (post) { renderer.getDrawingBufferSize(postSize); post.setSize(postSize.x, postSize.y); post.begin(); }
    }
    drawScenes();
    if (usePost && post) {
        const glow = (timeOfDay === 'night' ? 0.85 : timeOfDay === 'sunset' ? 0.65 : 0.45) * (quality === 'high' ? 1 : 0.8);
        // (no motion blur from the driver's seat: the dashboard and the drops on the glass stay sharp)
        post.finish(player && camMode !== 3 && !(race && race.replay) ? Math.abs(player.v) / player.perf.vmax : 0, glow, { grade: look && look.grade, sat: look && look.sat, ...(camMode === 3 ? { camera } : { camera, sun: sunOnScreen(), focus: race && race.replay && player ? camera.position.distanceTo(player.holder.position) : 0 }) });   // (not from the cockpit: its second pass replaces the depth picture)
    }
}
function drawScenes() {
    renderer.render(scene, camera);
    if (camMode !== 3 || !player || !player.cockpit) return;
    if (!cockpitScene) {
        cockpitScene = new THREE.Scene(); ckHemi = new THREE.HemisphereLight(); ckSun = new THREE.DirectionalLight(); cockpitScene.add(ckHemi, ckSun, ckSun.target);
    }
    const ck = player.cockpit.group;
    if (ck.parent !== cockpitScene) { cockpitScene.add(ck); ck.matrixAutoUpdate = false; }
    ck.visible = true; ck.matrix.copy((player.susp ? player.susp.sprung : player.model.group).matrixWorld); ck.matrixWorldNeedsUpdate = true;
    ckHemi.color.copy(hemi.color); ckHemi.groundColor.set(0x2a2b2e); ckHemi.intensity = hemi.intensity;
    ckSun.color.copy(sun.color); ckSun.intensity = sun.intensity * 0.6;
    ckSun.position.copy(camera.position).addScaledVector(sun.userData.dir || new THREE.Vector3(0.5, 0.8, 0.3), 50); ckSun.target.position.copy(camera.position);
    cockpitScene.environment = scene.environment; cockpitScene.environmentIntensity = scene.environmentIntensity;
    const near = camera.near; camera.near = 0.04; camera.updateProjectionMatrix();
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(cockpitScene, camera); renderer.autoClear = true;
    camera.near = near; camera.updateProjectionMatrix();
}
// the gear and engine speed the sounds and dials share (six imaginary gears)
function gearState(r) {
    const v = Math.abs(r.v), vmax = r.perf.vmax, gearW = vmax / 6, gear = Math.min(5, Math.floor(v / gearW));
    return { gear: gear + 1, inGear: gear === 5 ? Math.min(1, (v - gearW * 5) / gearW) : (v % gearW) / gearW };
}
const DIFF = { easy: 0.8, medium: 0.88, hard: 0.96 };
const fmtTenths = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const fmtTime = t => t == null ? '–' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function store(key, fallback) { try { const v = JSON.parse(localStorage.getItem('ffv_' + key)); return v ?? fallback; } catch (e) { return fallback; } }
function storeSet(key, v) { try { localStorage.setItem('ffv_' + key, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

function setupRace() {
    // remove old cars
    leavePodium(); endGridCam(true);
    if (ghost) ghost.model.group.traverse(o => { if (o.isMesh && o.material && o.material.userData.ghostCopy) o.material.dispose(); });   // (the see-through copies)
    [player, ...rivals, ghost].forEach(r => { if (r) { scene.remove(r.holder); dmg.unfit(r); r.model.dispose(); dropBlob(r.blob); if (r.glow) r.glow.material.dispose(); if (r.far) { r.far.geometry.dispose(); r.far.material.dispose(); } if (r.cockpit) { if (r.cockpit.group.parent) r.cockpit.group.parent.remove(r.cockpit.group); r.cockpit.dispose(); } } });
    rivals = []; ghost = null; pixelCache.clear(); mapColours.clear();   // (each race's cars have their own pictures)
    player = makeRacer(teamDesign(playerTeam), 1, true);
    scene.add(player.holder);
    player.cockpit = buildCockpit(player.design, window.getUnits ? window.getUnits() : 'mph');   // drawn by drawFrame, in its own pass
    applyCameraView();
    // grid: two staggered columns behind the start line, like a real Grand Prix; you start at the back in a race
    const slots = GRID; let startSlot = null;
    const place = (r, [back, side]) => {
        const s = sampleAt(trackLen + back);
        r.x = s.p.x + s.n.x * side; r.y = s.p.y; r.z = s.p.z + s.n.z * side; r.heading = s.heading; r.d = back; r.lap = -1; r.half = true;
        r.idx = ((Math.floor(((back % trackLen) + trackLen) / trackLen * N) % N) + N) % N; r.v = 0;
        r.lat = side; r.latV = 0;                       // rivals start in their own grid box and ease across to the racing line
    };
    if (mode === 'race') {
        // the rivals spread from quickest (at the front) to slowest, and you start at the back
        // (a single race: the rivals in any order. A championship race: in the order the season gives them, see season.js)
        const anyOrder = TEAMS.map((_, i) => i).filter(i => i !== playerTeam).sort(() => Math.random() - 0.5), given = champ && champ.field;
        const others = Array.isArray(given) && given.length === fieldSize && new Set(given).size === fieldSize && given.every(i => Number.isInteger(i) && TEAMS[i] && i !== playerTeam) ? given : anyOrder;
        // after qualifying (or with a grid the season saved): everyone starts where they qualified
        const set = validGrid(gridOrder) ? gridOrder : null, order = set ? set.filter(i => i !== playerTeam) : others;
        const mine = set ? set.indexOf(playerTeam) : Number.isInteger(window.__gridSlot) ? Math.max(0, Math.min(fieldSize, window.__gridSlot)) : fieldSize, free = slots.filter((_, k) => k !== mine);   // (__gridSlot: testing only, start from another grid box)
        for (let i = 0; i < fieldSize; i++) {
            const r = makeRacer(teamDesign(order[i]), DIFF[difficulty] * (1 - i * 0.06 / fieldSize), false);
            r.lineOffset = ((i % 3) - 1) * 1.6;
            rivals.push(r); scene.add(r.holder); place(r, free[i]);
        }
        place(player, slots[mine]); startSlot = mine;
    } else {
        // a time trial starts just behind the line; qualifying a good way back, so you cross the line at speed
        place(player, [mode === 'quali' ? -QUALI_RUN : -12, 0]);
        const g = store('ghost_' + TRACK.id, null);
        if (g && g.frames && g.frames.length) {
            ghost = makeRacer(teamDesign(playerTeam), 1, false);
            ghost.frames = g.frames; ghost.time = g.time;
            ghost.model.group.traverse(o => { if (o.material === ghost.model.mats.spinBlur) { o.visible = false; return; } if (o === ghost.glow) return; if (o.material) { o.material = o.material.clone(); o.material.userData.ghostCopy = true; o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; } });
            ghost.holder.visible = false; ghost.shadowCaster.visible = false; scene.add(ghost.holder);
        }
    }
    if (efx) efx.clear();
    // crash damage (looks only, never how the car drives): every car starts each race as good as new
    dmg.clearPieces();
    for (const r of [player, ...rivals]) dmg.fit(r);
    try { for (const o of dmg.warmUp(player)) { const was = o.visible; o.visible = true; renderer.compile(o, camera, scene); o.visible = was; } } catch (e) { /* made ready at the first bump instead */ }
    race = { phase: 'lights', t: 0, lightsT: 0, raceTime: 0, results: null, recording: [], lapTimes: [], tape: [], tapeTimes: [], hits: [],
        startSlot, pit: null, crashed: false, newLap: null };   // (startSlot: your grid box, 0 = pole; pit: a pit stop in progress; crashed: you have hit something; newLap: a lap record set in this race)
    // boosts and pit stops: everyone starts with a full set of boosts; in a 5-lap race each rival plans one stop, on
    // its second, third or fourth lap, shared out so that they don't all come in together
    const pits = pitsOpen(), span = Math.max(1, raceLaps() - 2), turn = rivals.map((_, i) => i).sort(() => Math.random() - 0.5);
    Object.assign(player, { boosts: mode === 'race' ? BOOSTS : 0, boostT: 0, boostsUsed: 0, boostOn: false, pitStops: 0, pitLap: -1, lapBoosted: false, lapPitted: false });
    rivals.forEach((r, i) => Object.assign(r, { boosts: RIVAL_BOOSTS[difficulty] || 0, boostT: 0, boostOn: false, boostWait: 8 + Math.random() * 14,
        ps: pits ? { plan: 1 + turn[i] % span, hold: 2.6 + Math.random() * 1.8, state: null, bay: -1, target: 0, until: 0, out: 0, done: false } : null }));
    if (pitMarks) pitMarks.visible = pits;
    closePit(); lastBoostHud = ''; lastPitHint = null;
    { const st = document.getElementById('race-stage'); st.classList.toggle('boost-on', mode === 'race'); st.classList.remove('pitting'); }
    updateCars(0); placeCamera(true);
    if (mode === 'quali') startQuali(); else quali = null;
    startGridCam();
    hud();
}
const validGrid = g => Array.isArray(g) && g.length === TEAMS.length && new Set(g).size === TEAMS.length && g.every(i => Number.isInteger(i) && TEAMS[i]);

// =====================================================================
//  QUALIFYING (only if it is switched on in the set-up): before the race you drive alone. A short run up to the line,
//  then one timed flying lap; you may have one more go, and your quicker lap counts. The rivals' laps are worked out
//  from how quick each car is at this level of rivals, with a little luck, so a good lap can win pole position.
//  Skipping it puts you at the back of the grid, exactly as if qualifying were switched off.
// =====================================================================
const QUALI_RUN = 220, QUALI_TRIES = 2;   // metres before the line that you set off from; how many flying laps you may have
// How quick the rivals are in qualifying. On Medium and Hard, exactly as quick as they race. On Easy they race gently
// (0.8), and their qualifying laps at that pace were 10 to 15 seconds slower than a child's: nobody would believe the
// table. So in qualifying the Easy rivals push harder than they race: a decent lap still wins pole, a scruffy one won't.
const QUALI_PACE = { easy: 0.865 };
// One flying lap by a rival with nobody in the way: the very same sums that drive the rivals in a race (see driveRival),
// run quickly round two laps. The second lap, started at full speed, is the one that is timed.
function simLap(factor) {
    const P = perf(player.stats, factor), h = 0.02; let v = 0, d = 0, t = 0, t1 = null;
    while (d < trackLen * 2 && t < 1200) {
        let target = P.vmax;
        for (let ahead = 0, far = v * v / (2 * P.brake * 0.8) + 40; ahead <= far; ahead += 8) { const k = Math.abs(sampleAt(d + ahead).ks), vc = k > 1e-4 ? Math.sqrt(P.grip * 0.92 / k) : P.vmax; target = Math.min(target, Math.sqrt(vc * vc + 2 * P.brake * 0.8 * ahead)); }
        v = Math.max(0, v + ((v < target ? P.a0 * Math.max(0.1, 1 - (v / P.vmax) ** 2) : -P.brake * Math.min(1, (v - target) / 3)) - 0.25) * h); d += v * h; t += h;
        if (t1 == null && d >= trackLen) t1 = t - (d - trackLen) / Math.max(1, v);
    }
    return t - (d - trackLen * 2) / Math.max(1, v) - (t1 || 0);
}
function startQuali() {
    // the quickest and slowest a rival can be at this level (the same spread of speeds as the cars on a race's grid)
    const pace = QUALI_PACE[difficulty] || DIFF[difficulty], quick = simLap(pace), slow = simLap(pace * (1 - 0.06 * (fieldSize - 1) / fieldSize)), rand = window.__qualiRand || Math.random;
    // each driver's lap: nearer the quick end the more 'pace' they have (teams.js), with some luck either way
    const times = TEAMS.map((t, i) => ({ team: i, time: i === playerTeam ? null : quick + (slow - quick) * Math.max(-0.08, Math.min(1.08, 1 - t.pace + (rand() - 0.5) * 0.5)) + (rand() - 0.5) * 0.12 }));
    quali = { times, best: null, tries: 0, skipped: false, counted: false, record: false };
    race.phase = 'qintro'; qualiPanel();
}
// the order after qualifying: quickest first; anyone without a time (you, if you skipped it) at the back
function qualiOrder() {
    const rows = quali.times.map(r => ({ ...r, time: r.team === playerTeam ? quali.best : r.time }));
    return rows.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}
function qualiPanel() {
    const el = document.getElementById('race-result'), Q = quali, kick = `Qualifying · ${escapeHtml(TRACK.name)}${champ ? ` · round ${champ.round} of ${champ.of}` : ''}`;
    el.className = 'race-panel'; el.classList.remove('has-podium', 'podium');
    if (race.phase === 'qintro') {
        el.innerHTML = `<div class="rr-box quali-box"><span class="kicker">${kick}</span><h2>One flying lap</h2>
            <p class="q-how">Drive up to the start line. The clock starts as you cross it: then it is <b>one lap, as fast as you can</b>. Your lap time decides where you start the race. The quickest driver starts at the front, on <b>pole position</b>.</p>
            <p class="small">You are on the track on your own. You can have one more go afterwards, and your quicker lap counts.</p>
            <div class="rr-actions"><button class="big-btn" data-race="qgo">⏱ Start qualifying</button><button class="act-btn ghost" data-race="qskip">Skip qualifying</button></div>
            <p class="small q-skipnote">Skip: you start the race at the back of the grid, like a race with qualifying switched off.</p></div>`;
    } else {
        const rows = qualiOrder(), pole = rows[0].time, pos = rows.findIndex(r => r.team === playerTeam) + 1, left = QUALI_TRIES - Q.tries;
        const body = rows.map((r, i) => { const t = TEAMS[r.team], me = r.team === playerTeam;
            return `<tr class="${me ? 'me' : ''}"><td>${i + 1}</td><td>${badge({ teamIdx: r.team, colour: t.paint })}${escapeHtml(t.driver)}${me ? YOU_TAG : ''} <small>${escapeHtml(t.team)}</small></td><td>${r.time == null ? 'no time' : fmtTime(r.time)}</td><td>${r.time == null ? '' : i === 0 ? 'POLE' : '+' + (r.time - pole).toFixed(2)}</td></tr>`; }).join('');
        const title = Q.skipped && Q.best == null ? `You start ${ordinal(pos)}, at the back` : pos === 1 ? 'Pole position!' : `You qualified ${ordinal(pos)}`;
        const note = Q.skipped && Q.best == null ? 'You skipped qualifying, so you start behind everyone who set a time.' : pos === 1 ? `Your lap of ${fmtTime(Q.best)} was the quickest of all. You start at the very front.` : `Your best lap was ${fmtTime(Q.best)}, ${(Q.best - pole).toFixed(2)} seconds off pole.`;
        el.innerHTML = `<div class="rr-box champ-box quali-box"><span class="kicker">${kick}</span><h2>${title}</h2><p class="q-how">${note}</p>${Q.record ? `<p class="rr-record">⭐ New record! Your best qualifying lap at ${escapeHtml(TRACK.name)}.</p>` : ''}
            <table class="champ-table quali-table"><thead><tr><th></th><th>Driver</th><th>Lap time</th><th>Gap</th></tr></thead><tbody>${body}</tbody></table>
            <div class="rr-actions"><button class="big-btn" data-race="qrace">🏁 Start the race from ${ordinal(pos)}</button>${left > 0 && !Q.skipped ? `<button class="act-btn" data-race="qretry">🔁 One more go</button>` : ''}<button class="act-btn ghost" data-race="menu">${champ ? 'Save and quit' : 'Menu'}</button></div>
            <p class="small q-skipnote">This is the starting grid for the race.${champ ? ' It is saved with your season.' : ''}</p></div>`;
    }
    el.hidden = false;
}
// off you go (again): from the run-up, with the clock waiting for you at the line
function qualiGo() {
    if (!quali || (race.phase !== 'qintro' && race.phase !== 'qdone')) return;
    const s = sampleAt(trackLen - QUALI_RUN), r = player;
    Object.assign(r, { x: s.p.x, y: s.p.y, z: s.p.z, heading: s.heading, d: -QUALI_RUN, lap: -1, half: true, v: 0, steer: 0, lat: 0, latV: 0, laps: [], lapStart: race.raceTime, idx: T.indexAt(trackLen - QUALI_RUN) });
    race.lapTimes = []; race.recording = []; race.cornerShown = null; if (ghost) { ghost.lapT0 = null; ghost.holder.visible = false; }
    document.getElementById('race-result').hidden = true;
    const skip = document.getElementById('race-qskip'); if (skip) skip.textContent = quali.tries ? 'Stop: keep my first lap' : 'Skip qualifying';   // (on a second go, stopping keeps the lap you already have)
    race.phase = 'go'; updateCars(0); placeCamera(true); lastHud = '';
    countdown('GO!', 4); startEngine();
}
// your flying lap is done (or you skipped): work out the grid, tell the season, and show everyone's times
function qualiDone(lapTime, skipped = false) {
    const Q = quali; if (!Q) return;
    if (lapTime != null) { Q.tries++; if (Q.best == null || lapTime < Q.best) Q.best = lapTime; }
    if (skipped) Q.skipped = true;
    race.phase = 'qdone'; player.v = 0; Object.keys(input).forEach(k => { if (k !== 'tilt') input[k] = false; });
    race.paused = false; document.getElementById('race-pause-panel').hidden = true;
    stopEngine(); clearTimeout(flashTimer); document.getElementById('race-flash').classList.remove('show');
    const order = qualiOrder(), pos = order.findIndex(r => r.team === playerTeam) + 1;
    gridOrder = order.map(r => r.team);
    if (onGrid) { try { onGrid(gridOrder.slice(), { pos, time: Q.best, skipped: Q.skipped && Q.best == null }); } catch (e) { console.error(e); } }
    if (lapTime != null && window.playSound) { window.playSound(pos === 1 ? 'win' : 'go'); if (pos <= 3) window.playSound('cheer'); }
    if (pos === 1 && Q.best != null && !Q.counted) { Q.counted = true; window.FFV.myStats.add('poles'); window.FFV.trophies.award('pole'); }   // (pole position: one for your own Driver Card, counted once, and a trophy)
    qualiPanel();
}
// from the grid's table into the race itself
function qualiToRace() {
    if (!quali || race.phase !== 'qdone' || !validGrid(gridOrder)) return;
    mode = 'race'; showStage();
}

// =====================================================================
//  DRIVING
// =====================================================================
function nearestIndex(r) {
    let best = r.idx, bd = Infinity;
    for (let j = -40; j <= 40; j++) {
        const i = (r.idx + j + N) % N, s = samples[i], dx = r.x - s.p.x, dz = r.z - s.p.z, dd = dx * dx + dz * dz;
        if (dd < bd) { bd = dd; best = i; }
    }
    return best;
}
const raceLaps = () => window.__laps || lapsChosen;   // (__laps: testing only, a shorter race)
function lapCrossing(r, prevIdx) {
    if (prevIdx > N * 0.4 && prevIdx < N * 0.6) r.half = true;
    if (prevIdx > N * 0.9 && r.idx < N * 0.1) {
        if (r.half) {
            r.lap++; r.half = false;
            const now = race.raceTime, lapTime = r.lap >= 1 ? now - r.lapStart : null;
            if (lapTime == null) r.lineStart = now; else r.laps.push(lapTime);     // every car's lap times are kept, for the podium
            // (in a race the first lap is timed from the green light, the same as the clock on screen and the podium's sheet)
            const timed = lapTime != null && mode === 'race' && r.lap === 1 ? now : lapTime;
            if (timed != null && (r.best == null || timed < r.best)) r.best = timed;
            if (r.isPlayer) onPlayerLap(timed);
            r.lapStart = now;
            if (mode === 'race' && r.lap >= raceLaps() && r.finished == null) { r.finished = now; if (r.isPlayer) finishRace(); }
        }
    }
    if (prevIdx < N * 0.1 && r.idx > N * 0.9) r.half = false;   // reversing over the line doesn't count
}
function drivePlayer(dt) {
    const r = player, P = r.perf, go = race.phase === 'go' || race.phase === 'done';
    if (race.pit) {   // in the pit box: the car stands still, on its jacks, until the wheels are changed (the race clock runs on)
        r.v = 0; r.steer *= Math.max(0, 1 - dt * 10); r.brakeLamp = 1; holdLamp(r); r.throttle = false; r.slip = r.sliding = r.onGrass = r.boostOn = false;
        return;
    }
    // steering: keys/buttons or tilt
    let steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (Math.abs(input.tilt) > 0.05) steerIn = Math.max(-1, Math.min(1, input.tilt));
    let gas = input.gas, brake = input.brake, lamp = 0;
    const auto = window.__autopilot && window.__autopilot !== 'steer';   // (testing: 'steer' only steers and holds GO down, like a child relying on the driving help)
    if (window.__kidbot) {                    // test driver: flat out, steers late with a slow reaction, never brakes
        const tgt = sampleAt(samples[r.idx].d + 10 + r.v * 0.25);
        let want = Math.atan2(-(tgt.p.z - r.z), tgt.p.x - r.x) - r.heading; while (want > Math.PI) want -= Math.PI * 2; while (want < -Math.PI) want += Math.PI * 2;
        r.botSteer = r.botSteer ?? 0; r.botT = (r.botT ?? 0) + dt;
        if (r.botT > 0.25) { r.botT = 0; r.botSteer = Math.abs(want) > 0.06 ? Math.sign(want) : 0; }
        steerIn = r.botSteer; gas = true; brake = false;
    }
    if (window.__autopilot) {                 // test driver: follow the racing line like a rival
        const here = samples[r.idx].d, tgt = sampleAt(here + (TRACK.tightWalls ? 7 + r.v * 0.16 : 14 + r.v * 0.3)), off = tgt.line * (TRACK.tightWalls ? 0.5 : 0.9);   // (between close walls: look less far ahead, cut the corners less)
        const tx = tgt.p.x + tgt.n.x * off, tz = tgt.p.z + tgt.n.z * off;
        let want = Math.atan2(-(tz - r.z), tx - r.x) - r.heading; while (want > Math.PI) want -= Math.PI * 2; while (want < -Math.PI) want += Math.PI * 2;
        steerIn = Math.max(-1, Math.min(1, want * 3));
        let target = P.vmax;
        for (let ahead = 0, far = r.v * r.v / (2 * P.brake * 0.7) + 40; ahead <= far; ahead += 8) { const k = Math.abs(sampleAt(here + ahead).ks); const vc = k > 1e-4 ? Math.sqrt(P.grip * 0.85 / k) : P.vmax; target = Math.min(target, Math.sqrt(vc * vc + 2 * P.brake * 0.7 * ahead)); }
        // (__pitBot: testing only, the test driver comes in for a pit stop: once, or as many times as the number says)
        if (window.__pitBot && pitsOpen() && race.phase === 'go' && r.pitStops < (window.__pitBot === true ? 1 : window.__pitBot)) {
            const lapAtBox = here > PIT.to ? r.lap + 1 : r.lap, ahead = (((PIT.d - here) % trackLen) + trackLen) % trackLen;
            if (lapAtBox >= 1 && lapAtBox < raceLaps() && r.pitLap !== lapAtBox && ahead < 320) {
                const aim = pathAt(here + Math.min(ahead, 8 + r.v * 0.25), PIT.lat, 0); want = wrapAngle(Math.atan2(-(aim.z - r.z), aim.x - r.x) - r.heading); steerIn = Math.max(-1, Math.min(1, want * 3));
                target = Math.min(target, Math.sqrt(14 * 14 + 2 * P.brake * 0.6 * Math.max(0, ahead - 10)));
            }
        }
        gas = r.v < target; brake = r.v > target + 2;
        if (!auto) { gas = true; brake = false; }
    }
    const s = samples[r.idx], lat = (r.x - s.p.x) * s.n.x + (r.z - s.p.z) * s.n.z;
    const playerGrip = P.grip * 1.3;                        // arcade grip: more forgiving than the rivals
    if (help && !auto && go) {
        // driving help 1: ease off before a corner you're going too fast for
        const here = samples[r.idx].d; let target = P.vmax;
        for (let ahead = 0, far = r.v * r.v / (2 * P.brake * 0.6) + 30; ahead <= far; ahead += 8) { const k = Math.abs(sampleAt(here + ahead).ks); const vc = k > 1e-4 ? Math.sqrt(playerGrip * (TRACK.tightWalls ? 0.76 : 0.9) / k) : P.vmax; target = Math.min(target, Math.sqrt(vc * vc + 2 * P.brake * 0.6 * ahead)); }   // (a little more careful between close walls)
        if (r.v > target + 1) { gas = false; r.v -= P.brake * 0.75 * dt; lamp = 2; }   // (the brake light shows amber: the help is braking, not you)
        // driving help 2: a gentle nudge back towards the road near the edge (sooner and firmer where the edge is a wall)
        const edge = s.hw - (TRACK.tightWalls ? 2.1 : 1.5);
        if (Math.abs(lat) > edge) steerIn -= Math.sign(lat) * (TRACK.tightWalls ? 0.7 : 0.45) * Math.min(1, (Math.abs(lat) - edge) / (TRACK.tightWalls ? 2 : 3));
        steerIn = Math.max(-1, Math.min(1, steerIn));
    }
    const maxSteer = 0.62 / (1 + r.v / 30);
    r.steer += (steerIn * maxSteer - r.steer) * Math.min(1, dt * 16);   // steering responds quickly
    // grass slows you down (but not too much)
    // off the road: grass and gravel slow you down, an asphalt run-off doesn't
    const off = Math.abs(lat) > s.hw + KERB_W, surface = off ? (lat > 0 ? s.L : s.R).surface : 'road', gravel = surface === 'gravel';
    const onGrass = off && surface !== 'asphalt';
    r.onGrass = onGrass;
    // slipstream: tucked in close behind another car, the air is easier to push through
    r.slip = false;
    if (go && r.v > 20) for (const o of rivals) {
        const dx = o.x - r.x, dz = o.z - r.z, fx2 = Math.cos(r.heading), fz2 = -Math.sin(r.heading);
        const ahead = dx * fx2 + dz * fz2, side = Math.abs(-dx * fz2 + dz * fx2);
        if (ahead > 3 && ahead < 22 && side < 2.6 && Math.abs(o.y - r.y) < 3) { r.slip = true; break; }   // (not a car on a bridge above you)
    }
    if (go) { r.driveTime = (r.driveTime || 0) + dt; if (onGrass) r.grassTime = (r.grassTime || 0) + dt; }
    const vmax = onGrass ? Math.min(P.vmax, gravel ? 24 : 30) : P.vmax;
    r.throttle = go && gas;                                  // (for the sounds: pops when you lift off, the turbo)
    let a = 0;
    // an overtake boost: for a few seconds a higher top speed and a stronger push. Only those two: the grip, the steering
    // and the braking are exactly as always (and off the road it does nothing at all)
    const boosting = r.boostT > 0 && race.phase === 'go'; if (r.boostT > 0) r.boostT -= dt; r.boostOn = boosting;
    const vTop = (r.slip ? vmax * 1.05 : vmax) * (boosting && !onGrass ? BOOST_TOP : 1);
    if (go && gas) a += P.a0 * Math.max(0.1, 1 - (r.v / vTop) ** 2) * (r.slip ? 1.15 : 1) * (boosting && !onGrass ? BOOST_PUSH : 1);
    if (brake) a -= r.v > 0.5 ? P.brake : 3;           // brake, then gently reverse
    if (brake && r.v > 0.5) lamp = 1;                   // (your own braking shows red, even if the help is braking too)
    r.brakeLamp = go ? lamp : 0; holdLamp(r);
    a -= 0.25 + r.v * r.v * 0.0004 + (onGrass ? r.v * (gravel ? 0.1 : 0.06) : 0);  // rolling and air drag
    if (!gas && !brake && Math.abs(r.v) < 0.3) r.v = 0;
    r.v = go ? Math.max(-6, r.v + a * dt) : 0;
    if (r.v > vmax && onGrass) r.v -= (r.v - vmax) * Math.min(1, dt * 2);
    // turning, limited by grip: too fast into a corner and the car slides wide
    const wb = r.design.L * 0.6;
    // driving help 3: on the straights the steering is gentler, so a tap on the arrow at 200 mph doesn't throw the car
    // sideways; it sharpens up by itself as a corner arrives
    const bend = Math.max(Math.abs(s.ks), Math.abs(samples[(r.idx + 12) % N].ks), Math.abs(samples[(r.idx + 24) % N].ks));
    const assisted = help && !auto;
    const calm = assisted ? Math.min(1, 0.36 + bend / 0.006) : 1;
    const grip = playerGrip * (onGrass ? 0.7 : 1) * calm;
    // driving help 4: the front wheels never turn further than the tyres can grip at this speed, so holding an arrow
    // down through a corner carries the car round it cleanly (no sliding, no squeal, no smoke), like a real driver
    // feeding in just enough lock. Without the help, too much steering slides the car and scrubs off speed.
    if (assisted && Math.abs(r.v) > 1) { const lim = Math.atan(grip * wb / (r.v * r.v)); if (Math.abs(r.steer) > lim) r.steer = Math.sign(r.steer) * lim; }
    let yawRate = r.v * Math.tan(r.steer) / wb;
    const latAcc = Math.abs(yawRate * r.v);
    // (holding the steering hard over scrubs off a little speed, but never much: with buttons you can only steer all or nothing)
    if (latAcc > grip * 1.001) { yawRate *= grip / latAcc; if (calm > 0.9) r.v -= Math.min((latAcc - grip) * 0.08, 5) * dt * Math.sign(r.v); r.sliding = !assisted && latAcc > grip * 1.6; } else r.sliding = false;
    if (r.sliding && r.v > 12 && go) r.slideTime = (r.slideTime || 0) + dt;      // (for testing)
    r.heading += yawRate * dt;
    r.x += Math.cos(r.heading) * r.v * dt; r.z -= Math.sin(r.heading) * r.v * dt;
    // barriers
    const prevIdx = r.idx; r.idx = nearestIndex(r);
    const s2 = samples[r.idx], lat2 = (r.x - s2.p.x) * s2.n.x + (r.z - s2.p.z) * s2.n.z, wall = (lat2 > 0 ? s2.wl : s2.wr) - 1.1;
    const touching = Math.abs(lat2) > wall;
    if (touching && !r.onWall && r.v > 8 && go) r.wallHits = (r.wallHits || 0) + 1;   // (counted for testing: each new touch of a barrier)
    r.onWall = touching;
    if (touching) {
        const push = Math.abs(lat2) - wall;
        r.x -= s2.n.x * push * Math.sign(lat2); r.z -= s2.n.z * push * Math.sign(lat2);
        let rel = r.heading - s2.heading; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) < Math.PI / 2) r.heading -= rel * 0.6; else r.heading -= (rel - Math.sign(rel) * Math.PI) * 0.6;
        if (r.v > 8) {
            bump(0.35); jolt(r, Math.min(0.6, r.v / 60));
            const sg = Math.sign(lat2);   // sparks where the car scrapes the barrier
            efx.sparksAt(r.x + s2.n.x * sg * 1.0, r.y + 0.4, r.z + s2.n.z * sg * 1.0, Math.cos(r.heading), -Math.sin(r.heading), Math.min(40, 8 + r.v));
            efx.bump(Math.min(0.8, r.v / 60));
            carHit(r, s2.n.x * sg, s2.n.z * sg, Math.min(0.7, r.v / 60), null, r.v < 30);   // a scuff from the barrier (a hard hit can leave a dent)
            if (race.phase === 'go') race.crashed = true;   // (no "clean race" trophy this time)
        }
        r.v *= 0.82;
    }
    r.lastLat = lat2;
    if (go) lapCrossing(r, prevIdx);
    if (race.phase === 'go' && PIT && pitsOpen()) pitCheck(r, lat2);
}

// =====================================================================
//  PIT STOPS (yours). Drive slowly into the painted box and the crew catch the car: it stops, the four wheels come up
//  on screen, and each one takes two taps (old wheel off, new wheel on; or keys 1 to 4). The race clock never stops,
//  so the rivals keep racing. Your reward: a full set of boosts, and a car that looks like new again.
// =====================================================================
function pitCheck(r, lat) {
    const s = samples[r.idx], rel = s.d + (r.x - s.p.x) * s.t.x + (r.z - s.p.z) * s.t.z - PIT.d;
    const inside = Math.abs(rel) < PIT.len / 2 - 0.4 && Math.abs(lat - PIT.lat) < PIT.w / 2 + 0.3;
    if (!inside) { r.inBox = false; return; }
    const first = !r.inBox; r.inBox = true;
    if (r.finished != null || r.pitLap === r.lap || r.v < 0) return;            // (already stopped on this lap)
    if (r.lap < 1) { if (first && r.v < 45) flash('The pit box opens on lap 2', 1600); return; }
    if (r.v > PIT_SPEED) { if (first && r.v < 45) flash('Too fast for the pit box! Slow right down', 1800); return; }
    startPit();
}
function startPit() {
    const r = player, at = pathAt(PIT.d + 1.2, PIT.lat, 0);                      // (rolled up to the stop line)
    Object.assign(r, { x: at.x, z: at.z, heading: at.heading, v: 0, steer: 0, idx: T.indexAt(PIT.d + 1.2), boostT: 0, boostOn: false, pitLap: r.lap, lapPitted: true });
    Object.keys(input).forEach(k => { if (k !== 'tilt') input[k] = false; });
    // which of the car's wheels is which: 0 front left, 1 front right, 2 rear left, 3 rear right (as on the panel)
    const c = Math.cos(r.heading), sn = Math.sin(r.heading), v3 = new THREE.Vector3(), wheels = [];
    r.holder.position.set(r.x, r.y, r.z); r.holder.rotation.y = r.heading; r.holder.updateMatrixWorld(true);
    for (const w of r.model.wheels) { w.getWorldPosition(v3); const dx = v3.x - r.x, dz = v3.z - r.z; wheels[(dx * c - dz * sn > 0 ? 0 : 2) + (dx * sn + dz * c > 0 ? 1 : 0)] = w; }
    race.pit = { t0: race.raceTime, taps: [0, 0, 0, 0], time: null, leaveAt: 0, wheels };
    if (!pitPanel) pitPanel = new PitPanel(document.getElementById('race-canvas-wrap'), document.getElementById('race-pause-panel'), pitTap, () => endPit(false));
    pitPanel.open(!(window.matchMedia && matchMedia('(pointer: coarse)').matches), PIT.side, r.design);
    document.getElementById('race-stage').classList.add('pitting');
    clearTimeout(flashTimer); document.getElementById('race-flash').classList.remove('show');
    if (soundOn && window.playSound) window.playSound('pit');
}
// one tap on wheel i (0 to 3): the first takes the old wheel off, the second puts the new one on
function pitTap(i) {
    const P = race && race.pit; if (!P || P.time != null || race.paused || !(i >= 0 && i < 4) || P.taps[i] >= 2) return;
    P.taps[i]++; pitPanel.wheel(i, P.taps[i]); if (P.wheels[i]) P.wheels[i].visible = P.taps[i] !== 1;
    if (soundOn && window.playSound) window.playSound('gun');
    if (!P.taps.every(n => n >= 2)) return;
    // all four are on: the stop is timed, and the reward is yours
    P.time = race.raceTime - P.t0; P.leaveAt = race.raceTime + PIT_SHOW;
    const t = P.time, word = t < 3 ? 'lightning stop!' : t < 4.5 ? 'great stop!' : t < 7 ? 'good stop!' : 'wheels on. Off you go!';
    pitPanel.time(t); pitPanel.result(`${t.toFixed(1)} s, ${word}`);
    player.boosts = BOOSTS; player.pitStops++; freshen(player);
    if (soundOn && window.playSound) window.playSound('pitdone');
    if (t < 3) window.FFV.trophies.award('pit_fast');
}
// let the car go again (done: the wheels were changed; otherwise the driver chose to drive on, with no reward)
function endPit(done) {
    const P = race && race.pit; if (!P) return;
    if (!done && P.time != null) return;
    for (const w of P.wheels) if (w) w.visible = true;
    race.pit = null; closePit(); lastHud = '';
    flash(done ? 'GO! GO! GO!' : 'Back on track', 1200);
}
function closePit() { if (pitPanel) pitPanel.close(); const st = document.getElementById('race-stage'); if (st) st.classList.remove('pitting'); }
// the pit crew have been over a car: it looks as good as new (remembered, so a replay cleans it at the same moment)
function freshen(r) {
    if (race.ff) return;
    dmg.reset(r); r.hitAt = -9;
    race.hits.push({ t: race.raceTime, k: r.isPlayer ? 0 : rivals.indexOf(r) + 1, fresh: true });
}
// each frame of a stop: the big clock, and off you go once your time has been shown
function pitFrame() {
    const P = race.pit;
    pitPanel.time(P.time != null ? P.time : race.raceTime - P.t0);
    if (P.time != null && race.raceTime >= P.leaveAt) endPit(true);
}
// "PIT": a hint on screen as you come up to the box, while a stop would do you some good
let lastPitHint = null;
function pitHint() {
    const el = document.getElementById('race-pit-hint'); if (!el) return;
    let text = '';
    const r = player;
    if (PIT && pitsOpen() && race.phase === 'go' && !race.pit && r.finished == null && (r.pitStops === 0 || r.boosts < BOOSTS)) {
        const here = samples[r.idx].d, lapAtBox = here > PIT.to ? r.lap + 1 : r.lap, ahead = (((PIT.d - here) % trackLen) + trackLen) % trackLen;
        if (lapAtBox >= 1 && lapAtBox < raceLaps() - 1 && r.pitLap !== lapAtBox && ahead < 430 && ahead > 6) text = r.v > PIT_SPEED + 4 ? 'slow' : 'in';
    }
    if (text === lastPitHint) return; lastPitHint = text;
    el.hidden = !text; if (!text) return;
    const left = PIT.side > 0;
    el.className = 'race-pit-hint ' + (left ? 'left ' : 'right ') + text;
    el.innerHTML = `<b>${left ? '◀ PIT' : 'PIT ▶'}</b><span>${text === 'slow' ? `Brake! Stop in the yellow box on the ${left ? 'left' : 'right'}` : `Roll into the yellow box on the ${left ? 'left' : 'right'}`}</span>`;
}

// =====================================================================
//  OVERTAKE BOOSTS
// =====================================================================
function useBoost() {
    const r = player; if (!race || mode !== 'race' || race.phase !== 'go' || race.paused || race.pit || !r || r.finished != null || r.boostT > 0) return;
    if (r.boosts <= 0) { flash(pitsOpen() ? 'No boosts left. A pit stop gives them back' : 'No boosts left', 1400); return; }
    r.boosts--; r.boostsUsed++; r.boostT = BOOST_TIME; r.lapBoosted = true;
    getAudioStart(); if (soundOn && window.playSound) window.playSound('whoosh');
}
// the big button: how many are left, lit while one is firing
let lastBoostHud = '';
function showBoosts() {
    const r = player, key = mode !== 'race' ? '' : r.boosts + (r.boostT > 0 ? 'f' : '');
    if (key === lastBoostHud) return; lastBoostHud = key;
    const b = document.getElementById('race-boost'), n = document.getElementById('race-boost-n'); if (!b || !n) return;
    n.textContent = r.boosts; b.classList.toggle('empty', r.boosts <= 0 && !(r.boostT > 0)); b.classList.toggle('firing', r.boostT > 0);
    b.setAttribute('aria-label', `Overtake boost: ${r.boosts} left`);
}
// The glowing streak behind a boosting car: two crossed sheets of light, shared by every car (one picture, one shape),
// stretched and flickered a little each frame. Made the first time anyone boosts.
let trailGeo = null, trailMat = null;
function trailOf(r) {
    if (r.trail) return r.trail;
    if (!trailGeo) {
        trailGeo = new THREE.BufferGeometry();   // (from the car's tail, at x = 0, back to x = -1; one sheet lying flat, one standing up)
        trailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 0, 0, 0.5, -1, 0, -0.5, -1, 0, 0.5, 0, -0.5, 0, 0, 0.5, 0, -1, -0.5, 0, -1, 0.5, 0], 3));
        trailGeo.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1], 2)); trailGeo.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
        trailGeo.userData.shared = true;
        const tex = canvasTex(256, 64, (x, w, h) => {
            x.clearRect(0, 0, w, h);
            const along = x.createLinearGradient(0, 0, w, 0); along.addColorStop(0, 'rgba(0,140,255,0)'); along.addColorStop(0.45, 'rgba(0,200,255,.5)'); along.addColorStop(0.85, 'rgba(120,240,255,.95)'); along.addColorStop(1, 'rgba(255,255,255,1)');
            x.fillStyle = along; x.fillRect(0, 0, w, h);
            // (soft top and bottom edges, and a few brighter streaks through the middle)
            x.globalCompositeOperation = 'destination-in'; const across = x.createLinearGradient(0, 0, 0, h); across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.5, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = across; x.fillRect(0, 0, w, h);
            x.globalCompositeOperation = 'lighter'; for (const [y, a] of [[22, 0.5], [32, 0.8], [41, 0.45]]) { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,236,170,${a})`); x.fillStyle = g; x.fillRect(0, y, w, 2.5); }
            x.globalCompositeOperation = 'source-over';
        });
        trailMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    }
    const m = new THREE.Mesh(trailGeo, trailMat); m.position.set(-r.design.L * 0.47, 0.45, 0); m.visible = false; m.frustumCulled = false; m.renderOrder = 3;
    r.holder.add(m); r.trail = m; r.trailK = 0;
    return m;
}
function showTrail(r, dt) {
    if (!r.boostOn && !r.trail) return;
    const m = trailOf(r); r.trailK = Math.max(0, Math.min(1, r.trailK + (r.boostOn ? dt * 7 : -dt * 3.5)));
    m.visible = r.trailK > 0.02;
    if (m.visible) m.scale.set((4 + Math.min(1, Math.abs(r.v) / 80) * 6) * r.trailK * (0.88 + Math.random() * 0.24), 0.55 + 0.35 * r.trailK, 1.7);
}
function driveRival(r, dt) {
    const go = race.phase === 'go' || race.phase === 'done';
    const P = r.perf;
    // a rival's own overtake boost (Medium and Hard): a little more top speed and push for a few seconds, nothing else
    const boosting = r.boostT > 0, vm = P.vmax * (boosting ? RIVAL_BOOST_TOP : 1); if (boosting) r.boostT -= dt; r.boostOn = boosting && go;
    // look ahead and slow down in time for the next corner
    let target = vm;
    for (let ahead = 0, far = r.v * r.v / (2 * P.brake * 0.8) + 40; ahead <= far; ahead += 8) {
        const s = sampleAt(r.d + ahead), k = Math.abs(s.ks);
        const vc = k > 1e-4 ? Math.sqrt(P.grip * 0.92 / k) : vm;
        target = Math.min(target, Math.sqrt(vc * vc + 2 * P.brake * 0.8 * ahead));
    }
    const straight = target >= P.vmax * 0.999;   // (nothing to brake for yet)
    // Its pit stop (5-lap races): once, on the lap it planned, in one of the bays painted past your box. It brakes down
    // the straight, eases over to the pit side (keeping a car's width clear of your box, in case you are in it), stops
    // for a few seconds, and goes. If every bay is taken it tries again next lap.
    const ps = r.ps; let pitLat = null, stopped = false;
    if (ps && !ps.done && r.finished == null) {
        if (!ps.state && r.lap === ps.plan - 1) {
            const pos = ((r.d % trackLen) + trackLen) % trackLen;
            if (pos > trackLen - 420 && pos < trackLen - 330) {
                const taken = rivals.filter(o => o !== r && o.ps && o.ps.state).map(o => o.ps.bay), bay = [2, 1, 0].find(k => !taken.includes(k));   // (the furthest free bay, so nobody has to drive through a stopped car)
                if (bay == null) { ps.plan++; if (ps.plan > raceLaps() - 2) ps.done = true; }   // (nobody pits on the last lap: with no bay free by then, it does without)
                else { ps.state = 'in'; ps.bay = bay; ps.target = (Math.floor(r.d / trackLen) + 1) * trackLen + PIT.bays[bay]; }
            }
        }
        if (ps.state === 'in') {
            const dist = ps.target - r.d;
            target = Math.min(target, Math.sqrt(Math.max(0, 2 * P.brake * 0.7 * (dist - 0.4))) + 0.6);
            if (dist < 300) pitLat = dist > BAY_GAP + 1 ? PIT.lat - PIT.side * 2.8 : PIT.lat;
            if (dist < 0.8) { ps.state = 'stop'; ps.until = race.raceTime + ps.hold; }
        }
        if (ps.state === 'stop') {
            stopped = true; pitLat = PIT.lat;
            if (race.raceTime >= ps.until) { ps.state = null; ps.done = true; ps.bay = -1; ps.out = race.raceTime + 1.6; r.boosts = RIVAL_BOOSTS[difficulty] || 0; freshen(r); stopped = false; }
        }
    }
    if (ps && ps.done && race.raceTime < ps.out) pitLat = PIT.lat - PIT.side * 2.8;   // (pulling out: round any car in the bay ahead)
    const pitting = pitLat != null;
    // On a street circuit there is no room to barge through: a rival slows for the car in front of it, and when it comes
    // up behind you it waits its turn, then goes round you on whichever side has room.
    let dodge = null;
    if (TRACK.tightWalls && !stopped) {
        for (const o of rivals) {
            if (o === r) continue;
            const gap = (((o.d - r.d) % trackLen) + trackLen) % trackLen;
            if (gap > 0.01 && gap < 18 && Math.abs(o.lat - r.lat) < 2.6) target = Math.min(target, o.v + Math.max(-5, (gap - 7.5 - 40 * Math.abs(samples[r.idx].ks)) * 1.2));   // (a longer gap round a tight corner, where the inside line is shorter)
        }
        if (!race.ff) {
            const gap = (((samples[player.idx].d - r.d) % trackLen) + trackLen) % trackLen;
            if (gap < 22 && player.v < r.v + 4) {
                dodge = player.lastLat;
                if (gap > 0.5 && Math.abs(player.lastLat - r.lat) < 2.6) target = Math.min(target, Math.max(0, player.v) + Math.max(-5, (gap - 8) * 1.2));
            }
        }
    }
    let a = 0;
    if (go) a = r.v < target ? P.a0 * (boosting ? RIVAL_BOOST_PUSH : 1) * Math.max(0.1, 1 - (r.v / vm) ** 2) : -P.brake * Math.min(1, (r.v - target) / 3);
    r.brakeLamp = go && (stopped || r.v > target + 0.5) ? 1 : 0; holdLamp(r);   // (rivals' brake lights come on as they slow for a corner)
    a -= 0.25;
    r.v = stopped ? 0 : Math.max(0, r.v + a * dt);
    r.d += r.v * dt;
    // when to boost: on a straight, at speed, with a car close ahead to catch (looked at once a second, and not every time)
    if (go && r.boosts > 0 && !boosting && !pitting && straight && r.v > 45 && r.lap >= 0 && r.finished == null && race.raceTime > r.boostWait) {
        r.boostWait = race.raceTime + 1;
        const gapTo = d => (((d - r.d) % trackLen) + trackLen) % trackLen, near = g => g > 4 && g < 45;
        if ((near(gapTo(samples[player.idx].d)) || rivals.some(o => o !== r && near(gapTo(o.d)))) && Math.random() < 0.3) { r.boosts--; r.boostT = BOOST_TIME; r.boostWait = race.raceTime + 14 + Math.random() * 16; }
    }
    // a car standing in the pits ahead (you in your box, or a rival in a bay or on its way in or out): go round it
    if (PIT && !pitting && r.ps) {
        let nearest = 110;
        const see = (d, lat) => { const gap = (((d - r.d) % trackLen) + trackLen) % trackLen; if (gap > 0.5 && gap < nearest) { nearest = gap; dodge = lat; } };
        if (race.pit && !race.ff) see(samples[player.idx].d, player.lastLat);
        for (const o of rivals) if (o !== r && o.ps && (o.ps.state || race.raceTime < o.ps.out) && o.v < r.v - 6) see(o.d, o.lat);
    }
    // follow the racing line like a real driver: the car can only move sideways gradually (faster when going faster),
    // easing in and out of each move, so it never darts across the road
    const hwR = sampleAt(r.d + r.v * 0.4).hw; let latTarget = Math.max(-hwR + 1.3, Math.min(hwR - 1.3, lineAt(r.d + r.v * 0.4) * 0.9 + r.lineOffset));
    if (dodge != null && (TRACK.tightWalls || Math.abs(latTarget - dodge) < 2.9)) { let side = r.lat >= dodge ? 1 : -1; if (Math.abs(dodge + side * 2.9) > hwR - 1.2) side = -side; latTarget = Math.max(-hwR + 1.2, Math.min(hwR - 1.2, dodge + side * 2.9)); }
    if (pitting) latTarget = pitLat;
    // (a car coming into or out of its bay may move across a little more briskly than its speed would normally allow)
    const maxLatV = stopped ? 0 : Math.max(pitting && r.v > 2 ? 2.2 : 0, Math.min(4.5, r.v * 0.09)), wantV = Math.max(-maxLatV, Math.min(maxLatV, (latTarget - r.lat) * 1.2));
    r.latV += Math.max(-5 * dt, Math.min(5 * dt, wantV - r.latV));
    r.lat += r.latV * dt;
    const here = pathAt(r.d, r.lat, 0), ahead = pathAt(r.d + 3, r.lat + r.latV * 3 / Math.max(4, r.v), 0);
    r.x = here.x; r.z = here.z;
    const want = Math.atan2(-(ahead.z - here.z), ahead.x - here.x);
    const dh = wrapAngle(want - r.heading);
    r.heading += dh * Math.min(1, dt * 12);
    r.steer += (Math.max(-0.4, Math.min(0.4, dh * 6 + wrapAngle(pathAt(r.d + 10, r.lat, 0).heading - want) * 2)) - r.steer) * Math.min(1, dt * 6);
    const prevIdx = r.idx; r.idx = ((Math.floor(r.d / trackLen * N) % N) + N) % N;
    if (go) lapCrossing(r, prevIdx);
}
// Crash damage, which only changes how the cars look (see damage.js). (nx, nz) points from this car towards what it hit.
// Bumps are spaced out, so two cars rubbing along each other pick up a scuff now and then, not one every moment.
function carHit(r, nx, nz, sev, colour, light) {
    if (!r.damage || race.ff || race.raceTime - r.hitAt < (sev < 0.35 ? 2.5 : 0.45)) return;
    r.hitAt = race.raceTime;
    const c = Math.cos(r.heading), s = Math.sin(r.heading);
    const ev = dmg.hit(r, nx * c - nz * s, nx * s + nz * c, sev, colour, light);
    if (ev) { ev.t = race.raceTime; ev.k = r.isPlayer ? 0 : rivals.indexOf(r) + 1; race.hits.push(ev); }   // (kept for the replay)
}
function crash(a, b, nx, nz, dv) {
    const sev = Math.max(0.2, Math.min(1, dv / 12));
    carHit(a, nx, nz, sev, b.design.paint, false); carHit(b, -nx, -nz, sev, a.design.paint, false);
}
// keep cars from driving through each other
function collisions() {
    const all = race.ff ? rivals : [player, ...rivals];   // (ff: the rivals finishing their race quickly, see classify)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j], dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = 2.6;
        if (dist < min && dist > 0.01 && Math.abs(a.y - b.y) < 2) {   // (not a car on a bridge above another)
            const push = (min - dist) / 2, nx = dx / dist, nz = dz / dist;
            if (a.isPlayer) { a.x -= nx * push * 2; a.z -= nz * push * 2; a.v *= 0.97; if (Math.abs(a.v - b.v) > 4) { bump(0.2); jolt(a, 0.25); efx.sparksAt((a.x + b.x) / 2, a.y + 0.5, (a.z + b.z) / 2, -nx, -nz, 14); if (race.phase === 'go' && !race.pit) race.crashed = true; } crash(a, b, nx, nz, Math.abs(a.v - b.v)); }   // (crashed: no "clean race" trophy; a rival nudging you while you stand in the pit box is not your crash)
            else if (b.isPlayer) { b.x += nx * push * 2; b.z += nz * push * 2; b.v *= 0.97; crash(a, b, nx, nz, Math.abs(a.v - b.v)); }
            else { a.v *= 0.995; if (dist < 2.1) crash(a, b, nx, nz, Math.min(5, Math.abs(a.v - b.v) * 0.5)); }   // (rivals only mark each other when really close, and never hard enough to lose a part)
        }
    }
}
function progressOf(r) { return r.lap * trackLen + samples[r.idx].d; }
const raceOrder = () => [player, ...rivals].sort((a, b) => (a.finished ?? Infinity) - (b.finished ?? Infinity) || progressOf(b) - progressOf(a));
function positionOf(r) {
    if (mode !== 'race') return 1;
    return raceOrder().indexOf(r) + 1;
}
// Which rivals are drawn in full: only the few nearest the camera, and only within fullDetailAt() metres (a car already
// drawn in full gets a few metres' head start, so two cars side by side don't keep swapping). In a bunched-up pack at
// the first chicane this keeps a tablet from having to draw eleven full cars at once.
const MAX_FULL = { low: 2, medium: 3, high: 10 };
let detailOrder = [];
function chooseDetail() {
    if (!camera) return;
    const lim = fullDetailAt();
    detailOrder = rivals.map(r => { const dx = r.x - camera.position.x, dz = r.z - camera.position.z; return { r, d: Math.sqrt(dx * dx + dz * dz) - (r.fullOn ? 4 : 0) }; }).sort((a, b) => a.d - b.d);
    detailOrder.forEach((e, k) => { e.full = k < MAX_FULL[quality] && e.d < lim; });
}
// Brake lights: dim red as normal, bright red while braking, and amber on your car while the driving help brakes for you
const LAMP = [[0xff1a10, 1.4, 0], [0xff1a10, 7, 0.95], [0xffa020, 6, 0.95]];   // (colour, lamp brightness, glow size in metres)
let glowTex = null;
function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.85)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
// (the replay films ten times a second, so a quick dab of the brake between two samples is kept until the next one:
// your own braking beats the help's)
function holdLamp(r) { const h = r.lampHeld || 0, s = r.brakeLamp || 0; r.lampHeld = h === 1 || s === 1 ? 1 : Math.max(h, s); }
function takeLamp(c) { const h = c.lampHeld || 0; c.lampHeld = c.brakeLamp || 0; return h; }
function brakeLights(r) {
    const s = r.brakeLamp || 0; if (s === r.lampShown || !r.tails) return; r.lampShown = s;
    for (const m of r.tails) { m.emissive.setHex(LAMP[s][0]); m.emissiveIntensity = LAMP[s][1]; }
    if (r.glow) { r.glow.visible = s > 0; r.glow.material.color.setHex(LAMP[s][0]); r.glow.scale.setScalar(LAMP[s][2] || 1); }
}
function updateCars(dt) {
    if (!(race && race.podium)) chooseDetail();
    for (const r of [player, ...rivals]) {
        const sy = samples[r.idx]; r.y = sy.p.y + sy.slope * ((r.x - sy.p.x) * sy.t.x + (r.z - sy.p.z) * sy.t.z);   // the road's height here
        r.holder.position.set(r.x, r.y + (r.isPlayer && race && race.pit ? 0.09 : 0), r.z);   // (up on its jacks in the pit box)
        r.holder.rotation.y = r.heading;
        brakeLights(r); showTrail(r, dt);
        r.holder.rotation.z = sy.slope ? Math.atan(sy.slope * Math.cos(r.heading - sy.heading)) : 0;   // nose up on a climb, down on a descent
        if (!r.isPlayer && camera) {
            // rivals far up the road aren't drawn, and only those close by are drawn in full detail (with a margin, so a
            // car just at the edge doesn't keep swapping)
            const dx = r.x - camera.position.x, dz = r.z - camera.position.z, d2 = dx * dx + dz * dz, e = detailOrder.find(o => o.r === r);
            if (!(race && race.podium)) r.holder.visible = d2 < 420 * 420;
            showDetail(r, !!(e && e.full) || !!(race && (race.podium && !race.replay || race.grid && race.grid.warm > 0)));   // (and all of them for the flyover's very first frames: see startGridCam)
        }
        r.wheelSpin += r.v * dt / r.design.wheel;
        for (const w of r.model.wheels) {
            const { front, side } = w.userData;
            w.userData.spin.rotation.z = side > 0 ? -r.wheelSpin : r.wheelSpin;
            w.rotation.y = (side < 0 ? Math.PI : 0) + (front ? r.steer : 0);
        }
        updateSuspension(r, dt, race && race.replay ? null : roadHeight);   // (replays: the body still leans and dips, without road bumps)
    }
}
// How high the ground is under a wheel: flat road with the faintest ripple, ridged kerbs on the corners, bumpy grass
function roadHeight(wx, wz, r) {
    const s = samples[r.idx], dx = wx - s.p.x, dz = wz - s.p.z, lat = Math.abs(dx * s.n.x + dz * s.n.z), d = s.d + dx * s.t.x + dz * s.t.z, HW = s.hw;
    if (lat < HW) return 0.003 + 0.003 * Math.sin(d * 0.9) * Math.sin(lat * 0.7 + d * 0.37);
    if (lat < HW + KERB_W) {
        if (Math.abs(s.ks) < KERB_KS || !(dx * s.n.x + dz * s.n.z > 0 ? s.kerbL : s.kerbR)) return 0;
        return kerbHeight(lat - HW, d);   // the kerb's sloped edge and ridged top: a quick rumble
    }
    return 0.008 + 0.008 * (Math.sin(d * 1.7 + lat * 2.3) * 0.6 + Math.sin(d * 4.1 - lat * 1.1) * 0.4);   // grass: a gentle jiggle
}

// =====================================================================
//  LAPS, GHOST AND RESULTS
// =====================================================================
function onPlayerLap(lapTime) {
    const r = player, REC = window.FFV.records;
    // Does this lap count for the lap record (and so for the ghost)? Only a proper flying lap: from the line to the line
    // (a race's first lap starts from the grid), with no boost and no pit stop in it. See records.js.
    const counts = !r.lapBoosted && !r.lapPitted && (mode !== 'race' || r.lap >= 2), tape = race.recording;
    race.recording = []; r.lapBoosted = r.boostT > 0; r.lapPitted = false;
    // lapTime is null when crossing the line for the first time, which starts lap 1
    if (lapTime == null) { if (mode !== 'race') setupGhostFromStore(); if (mode === 'quali') flash('Flying lap: go, go, go!', 1500); return; }
    race.lapTimes.push(lapTime);
    const before = REC.get(TRACK.id).lap, record = counts && REC.set(TRACK.id, 'lap', lapTime);
    if (record) race.newLap = lapTime;
    // The ghost is your best lap: this lap's own recording is kept whenever it is a new record (or quicker than the
    // ghost there is), whether it was driven in a time trial, in qualifying or in a race.
    if (counts && tape.length > 40) {
        const g = store('ghost_' + TRACK.id, null);
        if (record || !g || !(g.time <= lapTime)) storeSet('ghost_' + TRACK.id, { time: lapTime, frames: tape, design: { ...r.design, logo: null } });
    }
    if (mode === 'quali') { if (REC.set(TRACK.id, 'quali', lapTime)) quali.record = true; qualiDone(lapTime); return; }
    let msg = `Lap ${fmtTime(lapTime)}`;
    if (record) { msg += ' · New best lap!'; window.playSound && window.playSound('win'); if (mode === 'trial' && before) window.FFV.trophies.award('trial_record'); }
    if (mode === 'trial') setupGhostFromStore();   // (the best lap's ghost sets off again with you)
    flash(msg);
}
function setupGhostFromStore() {
    const g = store('ghost_' + TRACK.id, null); if (!g) return;
    if (!ghost) {
        ghost = makeRacer(teamDesign(playerTeam), 1, false);
        ghost.model.group.traverse(o => { if (o.material === ghost.model.mats.spinBlur) { o.visible = false; return; } if (o === ghost.glow) return; if (o.material) { o.material = o.material.clone(); o.material.userData.ghostCopy = true; o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; } });
        ghost.shadowCaster.visible = false; scene.add(ghost.holder);
    }
    ghost.frames = g.frames; ghost.time = g.time; ghost.lapT0 = race.raceTime;
}
function updateGhost() {
    if (!ghost || !ghost.frames) return;
    if (ghost.lapT0 == null) { ghost.holder.visible = false; return; }
    const t = race.raceTime - ghost.lapT0, i = Math.floor(t / 0.05);
    if (i >= ghost.frames.length) { ghost.holder.visible = false; return; }
    const [x, z, h, y = 0] = ghost.frames[i], nx = ghost.frames[i + 2];
    ghost.holder.visible = true; ghost.holder.position.set(x, y, z); ghost.holder.rotation.y = h;
    // nose up on a climb, down on a descent, worked out from where the ghost is a moment later
    if (nx) { const run = Math.hypot(nx[0] - x, nx[1] - z); if (run > 0.5) ghost.holder.rotation.z = Math.atan(((nx[3] || 0) - y) / run); }
}
// The finishing order of the whole field, worked out the moment you cross the line. Rivals who are still racing are
// driven on to the finish straight away, at high speed and out of sight, by the very same driving code (in the same
// small time steps) that was racing them a moment ago. So every time on the podium is a real one, never a guess. The
// cars you can see are then put back exactly where they were, and carry on round the track as before.
function classify() {
    const before = [player, ...rivals].map(progressOf);
    const keep = rivals.map(r => ({ x: r.x, z: r.z, heading: r.heading, v: r.v, steer: r.steer, d: r.d, idx: r.idx, lap: r.lap, lapStart: r.lapStart, finished: r.finished,
        best: r.best, half: r.half, lat: r.lat, latV: r.latV, lineStart: r.lineStart, nLaps: r.laps.length,
        boosts: r.boosts, boostT: r.boostT, boostOn: r.boostOn, boostWait: r.boostWait, ps: r.ps ? { ...r.ps } : null }));   // (and where each has got to with its boosts and its pit stop)
    const t0 = race.raceTime, clock = performance.now(); race.ff = true;
    for (let i = 0; i < 40000; i++) {                           // (at most 400 more seconds of racing)
        let racing = false; for (const r of rivals) if (r.finished == null) { racing = true; break; }
        if (!racing) break;
        for (const r of rivals) driveRival(r, 0.01);
        collisions(); race.raceTime += 0.01;
    }
    const rows = [player, ...rivals].map((c, k) => ({ k, c, name: c.design.driver, team: c.design.name, teamIdx: c.design.teamIdx, colour: c.design.paint, total: c.finished,
        // lap 1 is timed from the green light (like a real race), so the laps add up to the race time
        laps: c.finished == null ? [] : c.laps.slice(0, raceLaps()).map((t, i) => i === 0 ? t + c.lineStart : t), best: c.best, far: progressOf(c) }));
    rows.sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity) || before[b.k] - before[a.k] || b.far - a.far);
    rivals.forEach((r, i) => { const { nLaps, ...was } = keep[i]; Object.assign(r, was); r.laps.length = nLaps; });
    race.raceTime = t0; race.ff = false; race.ffMs = performance.now() - clock;   // (how long the working-out took: for testing)
    return rows;
}
// a team's mark beside its name: its colour dot, or a family's own logo for it (see myteams.js)
const badge = row => window.FFV.badge ? window.FFV.badge(TEAMS[row.teamIdx].id) : `<span class="champ-dot" style="background:${row.colour}"></span>`;
const PODIUM_BTN = '<button class="act-btn ghost pod-only" data-race="podium">🏁 Podium</button>';
function finishRace() {
    race.phase = 'done'; race.tapeEnd = race.raceTime + 3;     // keep filming for a few seconds after the line
    player.boostT = 0; lastPitHint = null; { const h = document.getElementById('race-pit-hint'); if (h) h.hidden = true; }
    race.podiumAt = race.t + 3;                                // ... and then the top three go up on the podium
    clearTimeout(flashTimer); document.getElementById('race-flash').classList.remove('show');
    race.results = classify();
    const pos = race.results.findIndex(row => row.k === 0) + 1;
    const medal = ['🥇 Gold', '🥈 Silver', '🥉 Bronze'][pos - 1] || '';
    const medals = store('medals', {}), key = TRACK.id + '_' + difficulty, prev = medals[key];
    if (pos <= 3 && (!prev || pos < prev)) { medals[key] = pos; storeSet('medals', medals); }
    { const mine = window.FFV.myStats; mine.add('races'); if (pos === 1) mine.add('wins'); if (pos <= 3) mine.add('podiums'); }   // (what you have done in this game: shown on your Driver Card)
    // the records board: your race time over this many laps, and any lap record set on the way
    const REC = window.FFV.records, kind = REC.raceKind(raceLaps()), total = race.results[pos - 1].total;
    const records = [kind && total != null && REC.set(TRACK.id, kind, total) ? `New record! Race time ${fmtTime(total)}` : '', race.newLap != null ? `New record! Best lap ${fmtTime(race.newLap)}` : ''].filter(Boolean);
    // trophies (each is only ever given once: see trophies.js)
    { const TR = window.FFV.trophies; TR.award('first_race');
      if (!race.crashed) TR.award('clean');
      if (timeOfDay === 'night') TR.award('night');
      if (weatherKind === 'rain') TR.award('rain');
      if (pos === 1) { TR.award('first_win'); TR.award('win_' + TRACK.id); if (race.startSlot === fieldSize) TR.award('last_first'); if (player.boostsUsed >= BOOSTS) TR.award('boost_win'); if (difficulty === 'hard') TR.award('hard_win'); } }
    if (window.playSound) { window.playSound(pos === 1 ? 'win' : pos > 3 ? 'lose' : 'go'); window.playSound(pos <= 3 ? 'bigcheer' : 'cheer'); }   // the crowd cheers every finisher, loudest for the top three
    // a championship race: the season is told the finishing order straight away, so nothing is lost if the app is closed now
    const C = champ;
    if (C && C.onFinish && !race.reported) { race.reported = true; try { C.onFinish(race.results.map(row => ({ team: row.teamIdx, total: row.total, best: row.best }))); } catch (e) { console.error(e); } }
    const el = document.getElementById('race-result'); el.className = 'race-panel';
    const laps = `${raceLaps()} lap${raceLaps() === 1 ? "" : "s"}`, gained = C && C.points ? C.points[pos - 1] || 0 : 0;
    const kicker = C ? `Round ${C.round} of ${C.of} · ${TRACK.name} · ${laps}` : `${TRACK.name} · ${laps} · ${difficulty}`, title = pos === 1 ? 'You win!' : `You finished ${ordinal(pos)}`;
    const actions = C ? '<button class="big-btn" data-race="next">🏆 Standings</button><button class="act-btn" data-race="replay">🎬 Watch replay</button>'
        : '<button class="big-btn" data-race="again">Race again</button><button class="act-btn" data-race="replay">🎬 Watch replay</button><button class="act-btn ghost" data-race="menu">Menu</button>';
    const extra = (medal ? `<p class="rr-medal">${medal}</p>` : '') + (C ? `<p class="rr-points">${gained ? `+${gained} point${gained === 1 ? '' : 's'}` : 'No points this time'}</p>` : '')
        + records.map(t => `<p class="rr-record">⭐ ${t}</p>`).join('');
    race.sheet = { kicker, title, extra, actions, more: '📋 Results' };
    const rows = race.results.map((row, i) => `<tr class="${row.k === 0 ? 'me' : ''}"><td>${i + 1}</td><td>${badge(row)}${escapeHtml(row.name)}${row.k === 0 ? YOU_TAG : ''} <small>${escapeHtml(row.team)}</small></td><td>${fmtTime(row.total)}</td><td>${fmtTime(row.best)}</td>${C && C.points ? `<td class="pts">${C.points[i] ? '+' + C.points[i] : ''}</td>` : ''}</tr>`).join('');
    el.innerHTML = `<div class="rr-box champ-box"><span class="kicker">${kicker}</span><h2>${title}</h2>${race.sheet.extra}
        <table class="champ-table"><thead><tr><th></th><th>Driver</th><th>Race time</th><th>Best lap</th>${C && C.points ? '<th>Points</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
        <div class="rr-actions">${actions}${PODIUM_BTN}</div></div>`;
    el.hidden = false;
}

// =====================================================================
//  THE PODIUM: a few seconds after you finish, the top three cars go up on the steps by the start line, with their
//  lap times underneath. The cars are the real race cars, bumps and scrapes and all.
// =====================================================================
// each step: [place, metres to the side of the middle of the road, height, how far the car is turned in towards the middle]
const STEPS = [[1, 0, 0.9, 0], [2, 3.7, 0.6, 0.26], [3, -3.7, 0.35, -0.26]], STEP_LEN = 5.9, STEP_W = 3.6, PODIUM_D = 12;
let podium = null;
function buildPodium() {
    const group = new THREE.Group(), block = new THREE.MeshStandardMaterial({ color: 0x232831, roughness: 0.55, metalness: 0.3 }), edge = new THREE.MeshStandardMaterial({ color: 0xE10600, roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 });
    for (const [n, z, h] of STEPS) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(STEP_LEN, h, STEP_W), block); b.position.set(0, h / 2, z); b.castShadow = b.receiveShadow = true; group.add(b);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(STEP_LEN + 0.06, 0.05, STEP_W + 0.06), top); lid.position.set(0, h - 0.02, z); lid.receiveShadow = true; group.add(lid);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, STEP_W + 0.08), edge); trim.position.set(STEP_LEN / 2 + 0.02, h - 0.03, z); group.add(trim);
        // the big number on the front of the step
        const tex = canvasTex(128, 128, x => { x.clearRect(0, 0, 128, 128); x.font = '900 104px Orbitron, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ['#FFB300', '#C9CED6', '#C98A4B'][n - 1]; x.fillText(String(n), 64, 70); });
        const size = Math.min(0.8, h - 0.1), num = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        num.rotation.y = Math.PI / 2; num.position.set(STEP_LEN / 2 + 0.012, (h - 0.06) / 2, z); group.add(num);
    }
    group.visible = false; scene.add(group);
    return { group };
}
// put the three cars on their steps, and everyone else out of sight
function podiumScene() {
    if (!podium) podium = buildPodium();
    const P = race.podium, at = pathAt(PODIUM_D, 0, 0), c = Math.cos(at.heading), sn = Math.sin(at.heading);
    podium.group.position.set(at.x, at.y, at.z); podium.group.rotation.y = at.heading; podium.group.visible = true;
    P.x = at.x; P.y = at.y; P.z = at.z; P.heading = at.heading;
    for (const r of [player, ...rivals]) { r.holder.visible = false; r.v = 0; showDetail(r, true); r.boostOn = false; if (r.trail) { r.trail.visible = false; r.trailK = 0; } }
    P.top.forEach((row, i) => {
        const r = row.c, [, z, h, turn] = STEPS[i];
        r.x = at.x + z * sn; r.z = at.z + z * c; r.heading = at.heading + turn; r.v = 0; r.steer = turn ? Math.sign(turn) * 0.3 : 0.22;
        r.holder.visible = true; r.holder.position.set(r.x, at.y + h, r.z); r.holder.rotation.set(0, r.heading, 0);
        if (r.susp) { r.susp.lastV = 0; r.susp.lastH = r.heading; }
        for (const w of r.model.wheels) w.rotation.y = (w.userData.side < 0 ? Math.PI : 0) + (w.userData.front ? r.steer : 0);
    });
    podiumLamps(true);
    if (headlight && headlight.visible) {   // at night: the headlight and the lamp glow light the podium instead
        headlight.position.set(at.x + c * 13, at.y + 6, at.z - sn * 13); headlight.target.position.set(at.x, at.y + 0.8, at.z); headlight.target.updateMatrixWorld();
        carGlow.position.set(at.x + c * 2, at.y + 5, at.z - sn * 2);
    }
    document.getElementById('race-stage').classList.add('podium-on');
    document.getElementById('race-hud').innerHTML = ''; lastHud = '';
}
function lapRows(row) {
    return `<table class="pod-laps">${row.laps.map((t, i) => `<tr><td>Lap ${i + 1}</td><td>${fmtTime(t)}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td>${fmtTime(row.total)}</td></tr></table>`;
}
function startPodium() {
    const rows = race.results, top = rows.slice(0, 3).filter(row => row.total != null), you = rows.findIndex(row => row.k === 0);
    race.podiumAt = null;
    race.podium = { t: 0, top, saveCam: camMode, party: you < 3 && !matchMedia('(prefers-reduced-motion: reduce)').matches };
    camMode = 0; applyCameraView();
    stopEngine(); if (efx) efx.clear(); dmg.clearPieces();
    if (window.playSound) window.playSound(you < 3 ? 'bigcheer' : 'cheer');   // the crowd, as the cars go up on the steps
    podiumScene();
    // the sheet under the cars: who came where, each lap and the race time. Second, first, third, the same way round as the steps.
    const card = i => { const row = top[i]; if (!row) return '<div></div>';
        return `<div class="pod-card p${i + 1} ${row.k === 0 ? 'me' : ''}" style="--c:${row.colour}"><div class="pod-pos">${ordinal(i + 1)}${row.k === 0 ? YOU_TAG : ''}</div><div class="pod-name">${badge(row)}${escapeHtml(row.name)}</div>${lapRows(row)}</div>`; };
    const mine = rows[you], S = race.sheet;
    const own = you >= 3 ? `<div class="pod-you"><b>${escapeHtml(mine.name)}${YOU_TAG} · ${ordinal(you + 1)}</b>${mine.laps.map((t, i) => `<span>Lap ${i + 1} <b>${fmtTime(t)}</b></span>`).join('')}<span>Total <b>${fmtTime(mine.total)}</b></span></div>` : '';
    const el = document.getElementById('race-result'), sheet = document.createElement('div'); sheet.className = 'pod-sheet';
    sheet.innerHTML = `<div class="pod-head"><span class="kicker">${S.kicker}</span><h2>${S.title}</h2>${S.extra}</div>
        <div class="pod-cards">${card(1)}${card(0)}${card(2)}</div>${own}
        <p class="pod-note">Lap 1 is timed from the green light.</p>
        <div class="rr-actions">${S.actions}<button class="act-btn ghost" data-race="results">${S.more}</button></div>`;
    el.appendChild(sheet); el.classList.add('has-podium', 'podium'); el.hidden = false;
}
// (on a floodlit night circuit no headlight follows your car, but the podium still gets its two lamps)
function podiumLamps(on) { if (headlight && TRACK && TRACK.floodlit && timeOfDay === 'night') headlight.visible = carGlow.visible = on; }
// leave the podium for good (a new race, or back to the menu)
function leavePodium() {
    podiumLamps(false);
    if (podium) podium.group.visible = false;
    if (camera) camera.clearViewOffset();
    const st = document.getElementById('race-stage'); if (st) st.classList.remove('podium-on');
    if (race && race.podium) { camMode = race.podium.saveCam; race.podium = null; }
}
// confetti for a podium finish: a few dozen bits of coloured paper on the flat layer over the 3D view, for a few seconds
const CONFETTI = 70, confetti = new Float32Array(CONFETTI * 5), CONFETTI_COLOURS = ['#E10600', '#FFB300', '#00E5FF', '#C6FF00', '#F4F6F8'];
function drawConfetti(P, dt) {
    const cv = efx.overlay, x = efx.ctx2d, w = cv.clientWidth, h = cv.clientHeight;
    if (!P.party || P.t > 7) { if (P.party) { P.party = false; x.clearRect(0, 0, cv.width, cv.height); } return; }
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (!P.thrown) { P.thrown = true; for (let i = 0; i < CONFETTI; i++) confetti.set([Math.random() * w, -Math.random() * h * 0.9, (Math.random() - 0.5) * 60, 90 + Math.random() * 130, Math.random() * 6], i * 5); }
    x.clearRect(0, 0, w, h); x.globalAlpha = Math.min(1, (7 - P.t) / 1.5);
    for (let i = 0; i < CONFETTI; i++) {
        const k = i * 5; confetti[k] += (confetti[k + 2] + Math.sin(P.t * 3 + i) * 30) * dt; confetti[k + 1] += confetti[k + 3] * dt; confetti[k + 4] += dt * 7;
        x.fillStyle = CONFETTI_COLOURS[i % 5]; x.fillRect(confetti[k], confetti[k + 1], 9, 5 * Math.abs(Math.cos(confetti[k + 4])) + 2);
    }
    x.globalAlpha = 1;
}
const podiumLook = new THREE.Vector3();
function podiumFrame(dt) {
    const P = race.podium; P.t += dt;
    for (const row of P.top) updateSuspension(row.c, dt, null);
    // the camera: in front of the cars, drifting slowly from side to side, and far enough back to fit all three in.
    // The picture is slid up the screen, so the cars sit above the sheet of lap times.
    const fov = camera.aspect < 1 ? 58 : 44, tanV = Math.tan(fov * Math.PI / 360), ease = 1 - Math.pow(1 - Math.min(1, P.t / 2.2), 3);
    const short = renderer.domElement.clientHeight < 500 && camera.aspect > 1.2;   // a phone on its side: the heading sits beside the cars, so they move over to the right
    // (an upright phone is narrow, so the cars are framed tightly there: the outer corners of steps 2 and 3 may be cut off, the cars never are)
    const far = Math.max((camera.aspect < 1 ? 5.1 : 5.9) / (tanV * camera.aspect * (short ? 0.72 : 1)), 3.1 / tanV), dist = far * (1.35 - 0.35 * ease) + STEP_LEN / 2;
    const a = Math.sin(P.t * 0.32) * Math.min(0.34, Math.asin(Math.min(1, (samples[0].hw - 2.5) / (far * 1.35 + STEP_LEN / 2)))), c = Math.cos(P.heading + a), sn = Math.sin(P.heading + a);   // (the camera stays over the road, inside the barriers)
    camera.fov = fov; camera.position.set(P.x + c * dist, P.y + 2.0 + (1 - ease) * 2.5, P.z - sn * dist);
    camera.lookAt(podiumLook.set(P.x, P.y + 0.9, P.z));
    camera.setViewOffset(camera.aspect * 1000, 1000, short ? -140 * camera.aspect : 0, camera.aspect < 1 ? 120 : short ? 190 : 150, camera.aspect * 1000, 1000);
    camPos.copy(camera.position); camLook.copy(podiumLook);
    followSun(P.x, P.z, P.y); tunnelLight(dt, 0); world.update(dt);
    if (weather) weather.update(dt, camera.position, 0, 0);
    efx.update(dt); drawConfetti(P, dt);
    drawFrame();
}

// =====================================================================
//  REPLAYS: the race played back through TV cameras
// =====================================================================
// Shots: a fixed trackside camera that pans and zooms as the cars pass, a helicopter view from high above, a low camera
// on the car, one looking back from in front of it, and one travelling alongside. The director cuts between them.
const SHOTS = ['heli', 'trackside', 'low', 'trackside', 'front', 'side', 'trackside', 'heli', 'trackside'];
let tvCams = null;
function buildTvCams() {
    // trackside cameras every 110 m, on alternating sides, on poles behind the barriers
    tvCams = [];
    for (let d = 40, k = 0; d < trackLen; d += 110, k++) {
        if (sampleAt(d).roofed || sampleAt(d).deck || sampleAt(d).under) continue;   // (none in a tunnel, on a bridge or under one)
        const side = k % 2 ? 1 : -1, sm = sampleAt(d), p = pathAt(d, side * ((side > 0 ? sm.wl : sm.wr) + 1.5), 0);   // just behind the barrier
        tvCams.push({ d, pos: new THREE.Vector3(p.x, p.y + 4.8 + (k % 3) * 1.6, p.z) });   // (above the catch fence)
    }
    // keep only the cameras that can actually see the road coming towards them (not hidden behind stands, buildings or trees)
    const ray = new THREE.Raycaster(), dir = new THREE.Vector3(), objs = world.group.children;
    tvCams = tvCams.filter(c => {
        let clear = 0;
        for (let a = 20; a <= 80; a += 15) {
            const q = pathAt(c.d - a, 0, 0), to = new THREE.Vector3(q.x, q.y + 0.8, q.z), dist = c.pos.distanceTo(to);
            ray.set(c.pos, dir.subVectors(to, c.pos).normalize()); ray.far = dist - 1;
            if (!ray.intersectObjects(objs, true).some(h => !h.object.userData.seeThrough)) clear++;   // (the wire catch fence doesn't block the view)
        }
        return clear >= 4;
    });
}
function startReplay() {
    if (!race || !race.tape || race.tape.length < 20) return;
    if (!tvCams) buildTvCams();
    race.replay = { t: 0, shot: -1, shotT: 0, cam: null, saveCam: camMode, hit: 0 };
    if (window.stopLongSounds) window.stopLongSounds();
    camMode = 0; applyCameraView();
    if (race.podiumAt != null) race.podiumAt = 0;                    // (the podium then follows straight after the replay)
    podiumLamps(false);
    if (race.podium) { podium.group.visible = false; camera.clearViewOffset(); document.getElementById('race-stage').classList.remove('podium-on'); }
    for (const c of [player, ...rivals]) { c.holder.visible = true; dmg.reset(c); }   // the cars start the replay undamaged: each bump comes back at its moment
    dmg.clearPieces();
    document.getElementById('race-result').hidden = true;
    let bar = document.getElementById('race-replay');
    if (!bar) { bar = document.createElement('div'); bar.id = 'race-replay'; bar.className = 'race-replay'; document.getElementById('race-canvas-wrap').appendChild(bar); }
    bar.innerHTML = `<span class="rp-badge">● REPLAY</span><span class="rp-shot" id="rp-shot"></span><button class="opt" data-race="replay-exit">✕ Close replay</button>`;
    bar.hidden = false; document.getElementById('race-stage').classList.add('replaying');
    stopEngine();
    if (efx) efx.clear();
    nextShot(race.replay);
}
function stopReplay() {
    if (!race || !race.replay) return;
    replayHits(Infinity, false); dmg.clearPieces();                  // all the race's damage is back on the cars
    camMode = race.replay.saveCam; race.replay = null; applyCameraView();
    if (race.podium) { efx.clear(); podiumScene(); }
    const bar = document.getElementById('race-replay'); if (bar) bar.hidden = true;
    document.getElementById('race-stage').classList.remove('replaying');
}
// where the cars were at replay time t (smoothly between the tape's samples). Each sample keeps the moment it was taken,
// and between two samples the car follows a smooth curve that leaves and arrives along its heading at its own speed, so
// it glides through corners instead of moving in short straight lines that kink ten times a second.
function tapeAt(t) {
    const T = race.tapeTimes, rt = T[0] + t; let lo = 0, hi = T.length - 1;
    if (rt >= T[hi]) return [hi - 1, 1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= rt) lo = m; else hi = m; }
    return [lo, Math.max(0, Math.min(1, (rt - T[lo]) / Math.max(1e-6, T[lo + 1] - T[lo])))];
}
function replayPose(t) {
    const tape = race.tape, [i, u] = tapeAt(t), A = tape[i], B = tape[i + 1], h = race.tapeTimes[i + 1] - race.tapeTimes[i];
    const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    [player, ...rivals].forEach((c, k) => {
        const a = A[k], b = B[k]; if (!a || !b) return;
        const jump = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 > 400;   // (a car put back on the road jumps: no curve across that)
        if (jump) { c.x = a[0] + (b[0] - a[0]) * u; c.z = a[1] + (b[1] - a[1]) * u; }
        else {
            const ta = a[4] * h, tb = b[4] * h;
            c.x = h00 * a[0] + h10 * Math.cos(a[2]) * ta + h01 * b[0] + h11 * Math.cos(b[2]) * tb;
            c.z = h00 * a[1] - h10 * Math.sin(a[2]) * ta + h01 * b[1] - h11 * Math.sin(b[2]) * tb;
        }
        c.heading = a[2] + wrapAngle(b[2] - a[2]) * u;
        c.steer = a[3] + (b[3] - a[3]) * u; c.v = a[4] + (b[4] - a[4]) * u;
        c.brakeLamp = (u < 0.5 ? a : b)[6] || 0;   // (the brake light, exactly as it was)
        c.boostOn = !!(u < 0.5 ? a : b)[7];        // (and its boost streak)
        // which part of the lap the car is on (for the road's height under it): the tape says (so a car on a bridge is
        // never mistaken for one on the road beneath it); an old tape without it: near where it was, or anywhere after a jump
        if (a[5] != null) { c.idx = (u < 0.5 ? a : b)[5] % N; return; }
        c.idx = nearestIndex(c); const p = samples[c.idx].p;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 900) { let bd = Infinity; for (let i = 0; i < N; i += 2) { const q = samples[i].p, dd = (c.x - q.x) ** 2 + (c.z - q.z) ** 2; if (dd < bd) { bd = dd; c.idx = i; } } }
    });
}
// bring back the bumps that had happened by replay time t (the tape starts a tenth of a second into the race)
function replayHits(t, pieces) {
    const R = race.replay, all = [player, ...rivals];
    while (R.hit < race.hits.length && race.hits[R.hit].t <= race.tapeTimes[0] + t) { const ev = race.hits[R.hit++]; if (!all[ev.k]) continue; if (ev.fresh) dmg.reset(all[ev.k]); else dmg.apply(all[ev.k], ev, pieces); }   // (fresh: cleaned up at a pit stop)
}
function replayFrame(dt) {
    const R = race.replay, len = race.tapeTimes[race.tapeTimes.length - 1] - race.tapeTimes[0];
    R.t += dt; if (R.t >= len) { R.t = 0; R.cam = null; R.hit = 0; for (const c of [player, ...rivals]) dmg.reset(c); dmg.clearPieces(); }       // loops round to the start
    replayPose(R.t); replayHits(R.t, true); updateCars(dt);
    // the director: cut to the next shot every few seconds (a trackside shot lasts until the cars have passed)
    R.shotT += dt;
    const shot = SHOTS[R.shot % SHOTS.length], r = player;
    const pd = samples[r.idx].d;   // (where the car is on the lap: replayPose has just set it)
    if (shot === 'trackside') {
        if (!R.cam) { R.cam = tvCams.reduce((best, c) => { const ahead = ((c.d - pd) % trackLen + trackLen) % trackLen; return ahead > 20 && ahead < 90 && ahead < (best ? best.ahead : 1e9) ? { c, ahead } : best; }, null); }
        const past = R.cam ? ((pd - R.cam.c.d) % trackLen + trackLen) % trackLen : 0;
        if (!R.cam || (past < trackLen / 2 && past > 45) || R.shotT > 9) nextShot(R);
    } else if (R.shotT > 5.5) nextShot(R);
    placeReplayCamera(SHOTS[R.shot % SHOTS.length], R, dt);
    [player, ...rivals].forEach(c => { c.sliding = false; c.onGrass = false; });
    followSun(); tunnelLight(dt); world.update(dt); updateEffects(dt); drawMap();
    document.getElementById('race-hud').innerHTML = '';
    drawFrame();
}
function nextShot(R) { R.shot++; R.shotT = 0; R.cam = null; R.side = Math.random() < 0.5 ? 1 : -1; const el = document.getElementById('rp-shot'); if (el) el.textContent = { trackside: 'Trackside camera', heli: 'Helicopter', low: 'On-board camera', front: 'Front camera', side: 'Tracking camera' }[SHOTS[R.shot % SHOTS.length]]; }
function placeReplayCamera(shot, R, dt) {
    const r = player, fx = Math.cos(r.heading), fz = -Math.sin(r.heading), car = new THREE.Vector3(r.x, r.y + 0.7, r.z), y = r.y;
    if (samples[r.idx].roofed && (shot === 'heli' || shot === 'trackside')) shot = 'low';   // (in a tunnel: the on-board camera)
    let pos, look = car.clone(), fov = 50;
    if (shot === 'trackside' && R.cam) { pos = R.cam.c.pos.clone(); const dist = pos.distanceTo(car); fov = Math.max(9, Math.min(45, Math.atan(5.5 / dist) * 2 * 180 / Math.PI)); }
    else if (shot === 'heli') { const a = R.shotT * 0.12; pos = new THREE.Vector3(r.x - fx * 26 + Math.sin(a) * 12, y + (TRACK.heliHeight || 24), r.z - fz * 26 + Math.cos(a) * 12); fov = 42; look.addScaledVector(new THREE.Vector3(fx, 0, fz), 10); }
    else if (shot === 'low') { pos = new THREE.Vector3(r.x - fx * 6.5 + fz * 1.4, y + 0.8, r.z - fz * 6.5 - fx * 1.4); look = new THREE.Vector3(r.x + fx * 5, y + 0.7, r.z + fz * 5); fov = 58; }
    else if (shot === 'front') { pos = new THREE.Vector3(r.x + fx * 15 + fz * 2, y + 1.7, r.z + fz * 15 - fx * 2); fov = 40; }
    else { const sd = R.side || 1; const out = TRACK.tightWalls ? Math.max(2.6, Math.min(6, (sd > 0 ? samples[r.idx].wr : samples[r.idx].wl) - 1)) : 6; pos = new THREE.Vector3(r.x - fz * sd * out + fx * 1.5, y + 1.3, r.z + fx * sd * out + fz * 1.5); fov = 55; }
    if (!R.camPos || R.shotT < 0.02) { R.camPos = pos.clone(); R.camLook = look.clone(); }
    const k = shot === 'trackside' ? 1 : Math.min(1, dt * 5);
    R.camPos.lerp(pos, k); R.camLook.lerp(look, shot === 'trackside' ? Math.min(1, dt * 8) : Math.min(1, dt * 10));
    if (shot !== 'trackside' && shot !== 'heli') { const keep = camPos.clone(); camPos.copy(R.camPos); keepCameraInside(); R.camPos.copy(camPos); camPos.copy(keep); }   // (never through a wall or a tunnel roof)
    camera.position.copy(R.camPos); camera.lookAt(R.camLook); camera.fov = fov; camera.updateProjectionMatrix();
    camPos.copy(camera.position); camLook.copy(R.camLook);
}

// =====================================================================
//  CAMERA, HUD, MINIMAP, SOUND
// =====================================================================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
// The chase camera never dips into a hill, never rises through a tunnel's roof, and on a street circuit (walls and
// buildings right at the edge of the road) never swings out through a wall on a tight corner.
function keepCameraInside() {
    let best = player.idx, bd = Infinity;
    for (let j = -16; j <= 12; j++) { const i = (player.idx + j + N) % N, p = samples[i].p, dx = camPos.x - p.x, dz = camPos.z - p.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } }
    const s = samples[best];
    if (TRACK.tightWalls) {
        const lat = (camPos.x - s.p.x) * s.n.x + (camPos.z - s.p.z) * s.n.z, over = lat > 0 ? lat - (s.wl - 0.8) : -lat - (s.wr - 0.8);
        if (over > 0) { camPos.x -= s.n.x * over * Math.sign(lat); camPos.z -= s.n.z * over * Math.sign(lat); }
    }
    if (camPos.y < s.p.y + 0.7) camPos.y = s.p.y + 0.7;   // (low enough for the replay's low on-board shot, which sits at 0.8)
    if (s.roofed) camPos.y = Math.min(camPos.y, s.p.y + (TRACK.tunnelHeight || 5.6) - 0.9);
    if (s.under) camPos.y = Math.min(camPos.y, s.p.y + s.under - 0.9);   // (passing under a bridge: below its deck)
}
// Inside a tunnel the daylight fades out (the tunnel's own lamps light its walls), and comes back as you near the far end
let tunnelNow = 0;
function tunnelLight(dt, f = samples[player.idx].tunnel) {
    if (!look || (!f && !tunnelNow)) return;
    tunnelNow += (f - tunnelNow) * Math.min(1, dt * 5); if (Math.abs(tunnelNow) < 0.004 && !f) tunnelNow = 0;
    sun.intensity = look.light.sun * (1 - 0.94 * tunnelNow); hemi.intensity = look.light.hemi * (1 - 0.6 * tunnelNow);
    scene.environmentIntensity = look.light.env * (1 - 0.7 * tunnelNow);
    if (weather) weather.group.visible = tunnelNow < 0.5;
}
function placeCamera(snap = false, dt = 0.016) {
    const r = player, fx = Math.cos(r.heading), fz = -Math.sin(r.heading);
    const [back, up, ahead] = camMode === 0 ? [8.2, 3.1, 7] : [5.4, 1.9, 8];
    const want = new THREE.Vector3(r.x - fx * back, r.y + up, r.z - fz * back);
    const look = new THREE.Vector3(r.x + fx * ahead, r.y + 0.8, r.z + fz * ahead);
    if (snap) { camPos.copy(want); camLook.copy(look); }
    else { const k = Math.min(1, dt * 6); camPos.lerp(want, k); camLook.lerp(look, Math.min(1, dt * 10)); }
    keepCameraInside();
    if (camMode >= 2 && !window.__camAt && !window.__aerial && !window.__camRel && !window.__camSun && !window.__camLook) {
        // bonnet and cockpit: fixed to the car, looking down the road (the cockpit view glances a little into corners)
        const ck = r.cockpit, eye = (camMode === 3 ? ck.eye : ck.bonnet).clone();
        const turn = camMode === 3 ? r.steer * 0.35 : 0;
        const ahead = new THREE.Vector3(eye.x + Math.cos(turn) * 10, eye.y - (ck.drop ? ck.drop[camMode - 2] : camMode === 3 ? 0.75 : r.design.cabin[0] < 0.33 ? 1.9 : 1.25), eye.z - Math.sin(turn) * 10);   // (low bonnets: look a little more down, so the bonnet shows)
        // the camera rides with the body (like a camera fixed inside a real car), so the dash and bonnet stay still in view
        r.holder.updateMatrixWorld(); const onBody = r.susp ? r.susp.sprung : r.holder; onBody.localToWorld(eye); onBody.localToWorld(ahead);
        camera.position.copy(eye);
        if (efx) { const [sx, sy] = efx.shakeOffset(r.v / r.perf.vmax, elapsed); camera.position.y += sy * 0.25; ahead.x += sx * 0.5; }
        camera.lookAt(ahead);
        camera.fov = (camMode === 3 ? 66 : 62) + Math.min(10, Math.max(0, r.v - 30) * 0.18); camera.updateProjectionMatrix();
        if (camMode === 3) { const gs = gearState(r), u = window.getUnits ? window.getUnits() : 'mph'; ck.update({ steer: r.steer, speed: Math.abs(r.v) * (u === 'mph' ? 2.23694 : 3.6), mps: Math.abs(r.v), rpm: 0.18 + gs.inGear * 0.78, gear: gs.gear, weather: weatherKind }, dt); }
        camPos.copy(camera.position); camLook.copy(ahead);
        return;
    }
    if (window.__camAt) { const c = window.__camAt, a = pathAt(c.d, c.lat, 0), b = pathAt(c.d2, c.lat2, 0); camPos.set(a.x, a.y + c.h, a.z); camLook.set(b.x, b.y + c.h2, b.z); }   // testing only
    else if (window.__camRel) { const [cx, cy, cz, lx = 0, ly = 0.4, lz = 0] = window.__camRel, c = Math.cos(r.heading), sn = Math.sin(r.heading); camPos.set(r.x + cx * c + cz * sn, r.y + cy, r.z - cx * sn + cz * c); camLook.set(r.x + lx * c + lz * sn, r.y + ly, r.z - lx * sn + lz * c); }   // testing only: a camera fixed beside the car
    else if (window.__camSun) { const d = sun.userData.dir; camPos.set(r.x - Math.cos(r.heading) * 7, r.y + 2.2, r.z + Math.sin(r.heading) * 7); camLook.set(camPos.x + d.x * 50 + window.__camSun * 20, camPos.y + d.y * 50 - 12, camPos.z + d.z * 50); }   // testing only: look towards the sun
    else if (window.__camLook) { const [bearing, pitch = 0, h = 3] = window.__camLook, b = bearing * Math.PI / 180, e = pitch * Math.PI / 180; camPos.set(r.x, r.y + h, r.z); camLook.set(r.x + Math.sin(b) * Math.cos(e) * 100, r.y + h + Math.sin(e) * 100, r.z - Math.cos(b) * Math.cos(e) * 100); }   // testing only: look towards a compass bearing (to check the horizon)
    else if (window.__aerial) { camPos.set(r.x + window.__aerial * 0.6, r.y + window.__aerial, r.z + window.__aerial * 0.6); camLook.set(r.x, r.y, r.z); }   // testing only
    camera.position.copy(camPos);
    if (efx) { const [sx, sy] = efx.shakeOffset(r.v / r.perf.vmax, elapsed); camera.position.x += sx; camera.position.y += sy; }
    camera.lookAt(camLook);
    camera.fov = 60 + Math.min(14, Math.max(0, r.v - 30) * 0.25) + (r.slip ? 3 : 0) + (r.boostOn ? 4 : 0); camera.updateProjectionMatrix();   // (the view opens out a little in a slipstream or a boost)
}
// The minimap: the circuit's outline is drawn once and kept; each frame it is copied and the cars' dots go on top.
// North is up, as on a real map.
let mapCtx = null, mapScale = 1, mapOff = [0, 0], mapBase = null;
function drawMapBase() {
    const c = document.getElementById('race-map'), b = T.box, w = b.maxX - b.minX, h = b.maxZ - b.minZ, big = 220, pad = 12;
    c.width = Math.round(w >= h ? big : big * w / h + pad); c.height = Math.round(h >= w ? big : big * h / w + pad);
    mapCtx = c.getContext('2d');
    mapScale = Math.min((c.width - pad * 2) / w, (c.height - pad * 2) / h);
    mapOff = [pad - b.minX * mapScale + (c.width - pad * 2 - w * mapScale) / 2, pad - b.minZ * mapScale + (c.height - pad * 2 - h * mapScale) / 2];
    mapBase = document.createElement('canvas'); mapBase.width = c.width; mapBase.height = c.height;
    const x = mapBase.getContext('2d'); x.lineJoin = 'round';
    const trace = () => { x.beginPath(); for (let i = 0; i < N; i += 2) { const s = samples[i], px = s.p.x * mapScale + mapOff[0], pz = s.p.z * mapScale + mapOff[1]; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.closePath(); x.stroke(); };
    x.lineWidth = 7; x.strokeStyle = 'rgba(10,12,16,.75)'; trace(); x.lineWidth = 3.5; x.strokeStyle = 'rgba(255,255,255,.92)'; trace();
    if (TRACK.crossover) {   // where the track crosses itself, the bridge is drawn again on top, so you can see which road goes over
        const i0 = T.indexAt(TRACK.crossover.over[0] - 30), i1 = T.indexAt(TRACK.crossover.over[1] + 30);
        const part = () => { x.beginPath(); for (let i = i0; i <= i1; i++) { const s = samples[i], px = s.p.x * mapScale + mapOff[0], pz = s.p.z * mapScale + mapOff[1]; i > i0 ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.stroke(); };
        x.lineCap = 'butt'; x.lineWidth = 8; x.strokeStyle = 'rgb(10,12,16)'; part(); x.lineWidth = 3.5; x.strokeStyle = 'rgb(255,255,255)'; part();
    }
    const s0 = samples[0]; x.fillStyle = '#E10600'; x.save(); x.translate(s0.p.x * mapScale + mapOff[0], s0.p.z * mapScale + mapOff[1]); x.rotate(-s0.heading); x.fillRect(-1.5, -7, 3, 14); x.restore();   // the start line
}
function drawMap() {
    const c = mapCtx.canvas, x = mapCtx;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(mapBase, 0, 0);
    const dot = (r, col, size) => { x.fillStyle = col; x.beginPath(); x.arc(r.x * mapScale + mapOff[0], r.z * mapScale + mapOff[1], size, 0, Math.PI * 2); x.fill(); };
    if (pitMarks && pitMarks.visible) { const p = pathAt(PIT.d, PIT.side * 70, 0); x.fillStyle = '#0b0c0f'; x.fillRect(p.x * mapScale + mapOff[0] - 5, p.z * mapScale + mapOff[1] - 5, 10, 10); x.fillStyle = '#FFC400'; x.fillRect(p.x * mapScale + mapOff[0] - 3.5, p.z * mapScale + mapOff[1] - 3.5, 7, 7); }   // (the pit box: a yellow square beside the start line)
    rivals.forEach(r => { dot(r, '#0b0c0f', 5); dot(r, r.design.paint, 3.8); });
    if (ghost && ghost.holder.visible) dot({ x: ghost.holder.position.x, z: ghost.holder.position.z }, 'rgba(0,229,255,.8)', 5);
    dot(player, '#fff', 7.5); dot(player, '#E10600', 5.5);
}
let lastHud = '', lastTower = '';
function hud() {
    const units = window.getUnits ? window.getUnits() : 'mph';
    const spd = Math.abs(player.v) * (units === 'mph' ? 2.23694 : 3.6), laps = raceLaps();
    const lapShown = Math.max(1, Math.min(laps, player.lap + 1));
    const order = mode === 'race' ? raceOrder() : [player], pos = order.indexOf(player) + 1;
    const left = mode === 'race'
        ? `<div class="hud-pos"><b>P${pos}</b><span>/${rivals.length + 1}</span></div><div class="hud-lap">LAP ${lapShown}/${laps}</div>`
        : mode === 'quali' ? `<div class="hud-pos"><b>QUALI</b></div><div class="hud-lap">${player.lap < 0 ? 'DRIVE TO THE LINE' : 'FLYING LAP'}${quali && quali.tries ? ' · GO 2' : ''}</div>`
        : `<div class="hud-pos"><b>TIME</b></div><div class="hud-lap">TRIAL · LAP ${Math.max(1, player.lap + 1)}</div>`;
    // The little tower under your position: the car ahead, you, and the car behind (in a race), each by its driver's
    // name. Your own row is lit and carries the YOU tag. It is only redrawn when the order changes.
    const k0 = Math.max(0, Math.min(order.length - 3, pos - 2)), tower = order.slice(k0, k0 + 3).map((c, i) => {
        const me = c === player, n = c.design.driver;
        return `<div class="tw-row ${me ? 'me' : ''}">${mode === 'race' ? `<i>${k0 + i + 1}</i>` : ''}<span class="tw-dot" style="background:${c.design.paint}"></span><span class="tw-n">${escapeHtml(me ? n : n.split(' ').pop())}</span>${me ? YOU_TAG : ''}</div>`; }).join('');
    if (tower !== lastTower) { const tw = document.getElementById('race-tower'); if (tw) tw.innerHTML = tower; lastTower = tower; }
    // This lap's clock. It starts running at the green light (not when you first reach the line): in a race the first
    // lap is timed from there; in a time trial the clock starts again as you cross the line to begin your first timed lap.
    const fromGreen = player.lap < 0 || (mode === 'race' && player.lap === 0);
    const lapNow = mode === 'quali' && player.lap < 0 ? 0 : race.phase === 'go' ? (fromGreen ? race.raceTime : race.raceTime - player.lapStart) : race.phase === 'done' && race.lapTimes.length ? race.lapTimes[race.lapTimes.length - 1] : 0;
    // your best ever lap here, and the laps you have finished
    const done = race.lapTimes.slice(-3).map((t, i, a) => `<div class="hud-done">Lap ${race.lapTimes.length - a.length + i + 1} <b>${fmtTime(t)}</b></div>`).join('');
    const right = `<div class="hud-time">${fmtTenths(lapNow)}</div><div class="hud-best">Best ${fmtTime(store('raceBest_' + TRACK.id, null))}</div>${mode === 'quali' && quali ? `<div class="hud-best pole">Pole ${fmtTime(Math.min(...quali.times.map(r => r.time ?? Infinity), quali.best ?? Infinity))}</div>` : ''}${done}`;
    const html = `<div class="hud-left">${left}</div><div class="hud-right">${right}</div><div class="hud-speed"><b>${Math.round(spd)}</b><span>${units === 'mph' ? 'MPH' : 'KM/H'}</span></div>`;
    if (html !== lastHud) { document.getElementById('race-hud').innerHTML = html; lastHud = html; }
}
// the name of the corner coming up, shown small under the buttons at the top
function cornerNames() {
    if (!TRACK.corners || race.phase !== 'go' || player.v < 12) return;
    const d = samples[player.idx].d;
    for (const [at, name] of TRACK.corners) {
        const ahead = ((at - d) % trackLen + trackLen) % trackLen;
        if (ahead < 140 && race.cornerShown !== name) {
            race.cornerShown = name;
            const el = document.getElementById('race-corner'); if (!el) return;
            el.textContent = name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        }
    }
}
let flashTimer = null;
// The big start countdown, near the top of the screen so it never covers your car. Each number arrives large and
// shrinks away; each one is a little smaller than the one before. A beep for each number, a higher one for GO.
function countdown(text, step) {
    let el = document.getElementById('race-count');
    if (!el) { el = document.createElement('div'); el.id = 'race-count'; el.className = 'race-count'; document.getElementById('race-flash').after(el); }
    el.textContent = text; el.classList.toggle('go', step === 4);
    el.style.setProperty('--start', [2.6, 2.2, 1.8, 1.9][step - 1]);
    el.classList.remove('run'); void el.offsetWidth; el.classList.add('run');      // restart the animation
    if (soundOn && window.playSound) window.playSound(step === 4 ? 'high' : 'low');
}
function flash(text, ms = 1800) {
    const el = document.getElementById('race-flash'); el.textContent = text; el.classList.add('show');
    clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.remove('show'), ms);
}
let lastBump = 0;
function bump(vol) {
    const now = performance.now(); if (now - lastBump < 300) return; lastBump = now;
    const ctx = window.getAudio && window.getAudio(); if (!ctx || !soundOn) return;
    const len = Math.floor(ctx.sampleRate * 0.25), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = vol * 0.5;
    src.connect(g); g.connect(window.audioOut()); src.start();
}
// Engine sound: real engine recordings (Wikimedia Commons, see Credits) looped and sped up and down with the revs through
// six imaginary gears. A low loop for the engine's own note fades into a high-revs loop near the top of each gear. Electric
// cars, and any device that can't load the recordings, use the made-up tones instead. Tyres squeal when you slide.
let engine = null, soundOn = store('raceSound', true), engineOn = store('raceEngine', true);   // (Sound is everything; Engine is just the engine)
const SOUND_FILES = { v8: 'sounds/v8_loop.wav', v12: 'sounds/v12_loop.wav', high: 'sounds/high_loop.wav', roar: 'sounds/roar.wav' };
const soundBufs = {}; let soundsLoading = null;
function loadSounds(ctx) {
    if (soundsLoading) return soundsLoading;
    soundsLoading = Promise.all(Object.entries(SOUND_FILES).map(([k, url]) => fetch(url).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).then(buf => { soundBufs[k] = buf; }).catch(() => {})));
    return soundsLoading;
}
function loopSource(ctx, buf, dest, extra) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(dest); if (extra) g.connect(extra); s.start(0, Math.random() * buf.duration); return { s, g }; }
function startEngine() {
    const ctx = window.getAudio && window.getAudio(); if (!ctx || engine || !soundOn) return;
    const ev = player.stats.engine.sound === 0, kind = player.design.engine;
    // everything goes through a gentle compressor, so the engine can be loud without crackling
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(window.audioOut());   // (through the game's volume knob: see sound.js)
    // inside the cockpit the sound is muffled, as if heard through the car's body
    const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(comp);
    const master = ctx.createGain(); master.gain.value = 1.6; master.connect(muffle);
    // small speakers (laptops, tablets) can't play the deep engine note, so a copy of it with only the higher tones
    // ('presence') is added on top: the same engine, but you can hear it on any speaker
    const presence = ctx.createBiquadFilter(); presence.type = 'highpass'; presence.frequency.value = 380; const pg = ctx.createGain(); pg.gain.value = 1.8;
    presence.connect(pg); pg.connect(master);
    engine = { ctx, ev, master, kind, presence, muffle };
    // gear changes, pops and crackles, turbo, wind, kerbs, the rivals' engines, and on a street circuit the echo off the
    // buildings (see soundfx.js)
    try { engine.fx = new RaceSound(ctx, master, { city: !!TRACK.tightWalls, turbo: true, ev, post: muffle, presence }); } catch (e) { engine.fx = null; }
    // the made-up tones (used for electric cars, and until the recordings have loaded)
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = ev ? 'sine' : 'sawtooth'; o2.type = ev ? 'triangle' : 'square';
    f.type = 'lowpass'; f.frequency.value = ev ? 3000 : 900; g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
    Object.assign(engine, { o1, o2, g });
    // tyre squeal: filtered noise, silent until you slide
    const len = ctx.sampleRate, nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1700; nf.Q.value = 6;
    const ng = ctx.createGain(); ng.gain.value = 0; ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start();
    engine.squeal = ng; engine.noise = ns;
    if (!ev) loadSounds(ctx).then(() => {
        if (!engine || engine.ctx !== ctx || !soundBufs.v8 || !soundBufs.high) return;
        engine.low = loopSource(ctx, kind === 'v12' || kind === 'v10' || kind === 'v6h' ? soundBufs.v12 || soundBufs.v8 : soundBufs.v8, master, engine.presence);
        engine.high = loopSource(ctx, soundBufs.high, master, engine.presence);
        engine.real = true;
        if (engine.fx) engine.fx.useEngineRecording(soundBufs.v8);
    });
    if (weather) weather.startSound(ctx, soundOn);
}
// the roar as the lights go out
function startRoar() {
    if (!engine || !soundBufs.roar || engine.ev || !engineOn) return;
    const ctx = engine.ctx, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = soundBufs.roar; g.gain.value = 0.32; s.playbackRate.value = engine.kind === 'v8' ? 0.85 : 1;
    s.connect(g); g.connect(engine.master); s.start();
}
// Slide a sound setting towards a new value. Each call replaces the one before: the browser otherwise keeps every
// one ever asked for, and after a few minutes' racing was spending more time on the sound than on the picture.
// (cancelAndHoldAtTime keeps the value where it has got to; plain cancelScheduledValues is the fallback for browsers
// without it, and only drops what is still to come, so a sound never jumps back to where it started)
const glide = (param, value, t, tc) => { if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t); param.setTargetAtTime(value, t, tc); };
function updateEngine() {
    if (!engine) return;
    const v = Math.abs(player.v), vmax = player.perf.vmax, t = engine.ctx.currentTime;
    const gs = gearState(player), rpm = 0.18 + gs.inGear * 0.78;
    let cut = 1;
    if (engine.fx) {
        const h = player.heading, sn = Math.sin(h), cs = Math.cos(h), pvx = cs * player.v, pvz = -sn * player.v;
        const rv = rivals.map(o => {
            const dx = o.x - player.x, dz = o.z - player.z, dist = Math.hypot(dx, dz) || 0.01, ux = dx / dist, uz = dz / dist;
            const ovx = Math.cos(o.heading) * o.v, ovz = -Math.sin(o.heading) * o.v;
            return { dist, side: (dx * sn + dz * cs) / dist, closing: -((ovx - pvx) * ux + (ovz - pvz) * uz), v: o.v, vmax: o.perf.vmax };
        });
        const onKerb = !!(player.susp && Math.max(...player.susp.bumps) > 0.025);
        cut = engine.fx.update(0, { v: player.v, vmax, gear: gs.gear, rpm, gas: !!player.throttle, onKerb, onGrass: !!player.onGrass, cockpit: camMode === 3, engineOn, soundOn, rivals: rv });
    }
    glide(engine.muffle.frequency, camMode === 3 ? 1900 : 20000, t, 0.1);
    const on = engineOn ? (input.gas ? 1 : 0.55) * cut : 0;
    let f;
    if (engine.ev) f = 200 + v / vmax * 1600;
    else f = (player.stats.engine.sound || 90) * (0.55 + gs.inGear * 1.1 + (gs.gear - 1) * 0.05);
    glide(engine.o1.frequency, f, t, 0.05); glide(engine.o2.frequency, f * 0.5, t, 0.05);
    if (engine.real) {
        // a higher-pitched engine for the V10 and V12, and each gear starts a touch higher than the last
        const base = { v8: 0.82, hybrid: 0.86, v10: 1.0, v12: 1.08, v6h: 1.0 }[engine.kind] || 0.9, rate = base * (0.72 + rpm * 1.15 + (gs.gear - 1) * 0.03);
        glide(engine.low.s.playbackRate, rate, t, 0.04); glide(engine.high.s.playbackRate, 0.55 + rpm * 0.75 + (gs.gear - 1) * 0.02, t, 0.04);
        const hi = Math.max(0, (rpm - 0.45) / 0.55);
        glide(engine.low.g.gain, (0.24 - hi * 0.1) * on, t, 0.08); glide(engine.high.g.gain, hi * 0.2 * on, t, 0.08);
        glide(engine.g.gain, 0.02 * on, t, 0.1);          // a little of the made-up tone adds body
    } else glide(engine.g.gain, (input.gas ? 0.07 : 0.035) * (engineOn ? 1 : 0), t, 0.1);
    glide(engine.squeal.gain, player.sliding && v > 12 ? 0.05 : 0, t, 0.06);
    if (engine.fx && engine.fx.echo) glide(engine.fx.echo.wet.gain, 0.16 + 0.42 * tunnelNow, t, 0.2);   // the echo is much stronger in the tunnel
}
function stopEngine() {
    if (weather) weather.stopSound();
    if (!engine) return;
    const e = engine, t = e.ctx.currentTime; engine = null;
    if (e.fx) setTimeout(() => e.fx.stop(), 400);
    try { e.master.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { try { e.master.disconnect(); e.o1.stop(); e.o2.stop(); e.noise.stop(); if (e.low) { e.low.s.stop(); e.high.s.stop(); } } catch (err) { /* already stopped */ } }, 400); } catch (err) { /* already stopped */ }
}

// =====================================================================
//  THE GRID FLYOVER (races only: a short aerial shot of the whole field, just before the lights)
// =====================================================================
// The camera starts high up ahead of pole, looking back at the grid; sweeps low over the lights gantry; glides down the line
// of cars; swings round your own car and settles exactly where your race camera sits. Only then do the lights start.
// Nothing drives while it plays (the race clock, the lights and the tape haven't begun), and a tap or a key skips it.
// The path is laid out along the road itself (metres along it, metres across, metres up), so it bends with the track
// and stays between the walls on every circuit, wherever your car is on the grid.
const GRID_CAM_TIME = 6, GRID_CAM_GRACE = 0.35;    // seconds: the whole shot; how long before a tap can skip it (so the tap that started the race doesn't)
const gcA = new THREE.Vector3(), gcB = new THREE.Vector3(), gcEnd = new THREE.Vector3(), gcEndLook = new THREE.Vector3();
// a smooth curve through timed points [t, a, b, c] (it passes through every point, and comes gently to rest at the last)
function gridCurve(keys, t, out) {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1], span = k1[0] - k0[0], u = Math.max(0, Math.min(1, (t - k0[0]) / span)), u2 = u * u, u3 = u2 * u;
    for (let c = 1; c <= 3; c++) {
        const slope = j => j === keys.length - 1 ? 0 : j === 0 ? (keys[1][c] - keys[0][c]) / (keys[1][0] - keys[0][0]) : (keys[j + 1][c] - keys[j - 1][c]) / (keys[j + 1][0] - keys[j - 1][0]);
        out[c - 1] = (2 * u3 - 3 * u2 + 1) * k0[c] + (u3 - 2 * u2 + u) * span * slope(i) + (-2 * u3 + 3 * u2) * k1[c] + (u3 - u2) * span * slope(i + 1);
    }
    return out;
}
function startGridCam() {
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (mode !== 'race' || calm || window.__noGridCam) return;    // (a time trial goes straight to the lights; so does a device set to reduce motion)
    const pole = Math.max(...rivals.map(r => r.d), player.d), last = Math.min(...rivals.map(r => r.d), player.d), pd = player.d, pl = player.lat;
    const side = pl > 0 ? -1 : 1, mid = (pole + last) / 2;             // the camera comes down the other column from yours
    const reach = Math.min(16, Math.max(0, pole - pd) + 4);            // (from near the front of the grid there is less of it to glide down)
    const L = GRID_CAM_TIME;
    race.phase = 'grid';
    race.grid = {
        t: 0, saveCam: camMode, hold: null,
        warm: 2,   // for its first two frames (still part of the pause while the circuit appears) every car is drawn in full, so none of them causes a stutter later, when the camera first comes close
        // [seconds, metres along the road (0 = the start line), metres across it, metres above it]
        // (it skims over the gantry's beam, whose top is 7.7 m up: passing under it, the dark beam filled the top of the picture)
        cam: [[0, pole + 48, 0, 14.5], [L * 0.25, 0, 0, 9.5], [L * 0.5, pd + reach, side * 1.3, 4.1], [L * 0.65, pd + 2, side * 3.3, 3.5], [L * 0.85, pd - 5.5, pl + side * 5, 3.6], [L, pd - 8.2, pl, 3.1]],
        // (the swing round your car starts a little sooner and looks a little ahead of it, so it turns at most about 90 degrees a second)
        look: [[0, mid + 8, 0, 0.6], [L * 0.25, Math.min(mid, pd + reach + 6), 0, 0.6], [L * 0.5, pd + 3, pl * 0.5, 0.7], [L * 0.65, pd + 0.8, pl, 0.7], [L * 0.85, pd + 1.6, pl, 0.65], [L, pd + 7, pl, 0.8]]
    };
    camMode = 0; applyCameraView();                                    // (seen from outside until it settles, whatever view you chose)
    world.lightMats.forEach(m => { m.emissiveIntensity = 0; });
    let hint = document.getElementById('race-skip'), veil = document.getElementById('race-veil');
    if (!hint) { hint = document.createElement('div'); hint.id = 'race-skip'; hint.className = 'race-skip'; hint.textContent = 'Tap to skip'; document.getElementById('race-flash').after(hint); }
    if (!veil) { veil = document.createElement('div'); veil.id = 'race-veil'; veil.className = 'race-veil'; document.getElementById('race-hud').before(veil); }
    veil.style.transition = 'none'; veil.style.opacity = 0;
    document.getElementById('race-stage').classList.add('grid-cam');
    placeGridCam(0);
}
// a point on the road's own map (along, across, up) as a place in the world; never through a wall, a roof or the ground
function gridPoint(v, out) {
    const f = ((v[0] / trackLen * N) % N + N) % N, i = Math.floor(f) % N, k = f - Math.floor(f), s = samples[i], s2 = samples[(i + 1) % N];   // (smoothly between the road's 2 m points)
    const lat = Math.max(-(s.wr + (s2.wr - s.wr) * k - 1.2), Math.min(s.wl + (s2.wl - s.wl) * k - 1.2, v[1])), p = pathAt(v[0], lat, 0);
    let h = Math.max(0.7, v[2]); if (s.roofed || s2.roofed) h = Math.min(h, (TRACK.tunnelHeight || 5.6) - 0.9);
    return out.set(p.x, p.y + h, p.z);
}
const gcV = [0, 0, 0];
function placeGridCam(dt) {
    const G = race.grid, t = Math.min(GRID_CAM_TIME, G.hold ?? G.t), r = player;
    // where your race camera will sit (the bonnet and cockpit views are reached from the close chase view, through a quick fade)
    const fx = Math.cos(r.heading), fz = -Math.sin(r.heading), [back, up, ahead] = G.saveCam === 0 ? [8.2, 3.1, 7] : [5.4, 1.9, 8];
    camPos.set(r.x - fx * back, r.y + up, r.z - fz * back); keepCameraInside(); gcEnd.copy(camPos);
    gcEndLook.set(r.x + fx * ahead, r.y + 0.8, r.z + fz * ahead);
    gridPoint(gridCurve(G.cam, t, gcV), gcA); gridPoint(gridCurve(G.look, t, gcV), gcB);
    // over the last part the path melts into that exact spot, so there is no jump when the race camera takes over
    let w = Math.max(0, Math.min(1, (t / GRID_CAM_TIME - 0.68) / 0.32)); w = w * w * w * (w * (w * 6 - 15) + 10);
    camPos.copy(gcA).lerp(gcEnd, w); camLook.copy(gcB).lerp(gcEndLook, w);
    camera.position.copy(camPos); camera.lookAt(camLook);
    const open = Math.min(1, t / (GRID_CAM_TIME * 0.5)); camera.fov = 50 + 10 * w + 6 * (1 - open) * (1 - open); camera.updateProjectionMatrix();   // a wide view of the whole grid at first
    const inside = G.saveCam >= 2, veil = document.getElementById('race-veil');
    if (veil) veil.style.opacity = inside ? Math.max(0, Math.min(1, (t - (GRID_CAM_TIME - 0.3)) / 0.26)).toFixed(2) : 0;
}
// the flyover is over (or was skipped): your own camera takes over and the lights begin, exactly as they always have
function endGridCam(leaving = false) {
    if (!race || !race.grid) return;
    const G = race.grid; race.grid = null; camMode = G.saveCam;
    document.getElementById('race-stage').classList.remove('grid-cam');
    const veil = document.getElementById('race-veil');
    if (veil) { veil.style.transition = leaving || +veil.style.opacity === 0 ? 'none' : 'opacity .4s'; void veil.offsetWidth; veil.style.opacity = 0; }
    if (leaving) return;
    race.phase = 'lights'; race.t = 0;
    applyCameraView(); placeCamera(true);
}
// The circuit's pictures (textures) are still arriving while the flight begins, and each one costs a moment's work the
// first time it is drawn. Left alone, that moment comes whenever the camera first turns to face something new, as a
// stutter in the middle of the sweep. So during the high opening shot they are made ready, one or two a frame.
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap', 'aoMap'];
function readyPictures(G, budget = 3) {
    if (G.t > GRID_CAM_TIME * 0.4) return;
    if (!G.pics || G.picsAt < G.t - 0.5) {   // (looked for again every half second: some arrive late)
        G.done = G.done || new Set(); G.pics = []; G.picsAt = G.t;
        scene.traverse(o => { for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) for (const k of TEX_SLOTS) { const t = m[k]; if (t && t.isTexture && !t.isRenderTargetTexture && !t.isCubeTexture && !G.done.has(t)) G.pics.push(t); } });
    }
    const t0 = performance.now();
    for (let i = G.pics.length - 1; i >= 0 && performance.now() - t0 < budget; i--) {
        const t = G.pics[i], im = t.image;
        if (!im || !(im.width > 0) || im.complete === false) continue;   // (not arrived yet)
        G.pics.splice(i, 1); G.done.add(t);
        try { renderer.initTexture(t); } catch (e) { /* made ready when it is first drawn instead */ }
    }
}
function skipGridCam() { if (race && race.grid && !race.paused && race.grid.t > GRID_CAM_GRACE) endGridCam(); }
function gridFrame(dt) {
    const G = race.grid, t0 = performance.now();
    // (the clock stands still through the warm-up frames and the one after, whose time step is the long warm-up itself,
    // so the slow first frames show one still picture instead of a jerk; and the very first time step can be below zero)
    if (G.hold == null && G.warm < 0) G.t += Math.max(0, dt);
    updateCars(dt);
    if (G.t >= GRID_CAM_TIME) endGridCam(); else placeGridCam(dt);
    updateEngine();
    followSun(camLook.x, camLook.z, player.y);          // (the shadows follow what the camera is looking at, not your car at the back)
    world.update(dt); updateEffects(dt);
    hud(); drawMap();
    drawFrame();
    // (while the picture is still held, the pictures that have arrived are all made ready at once: one big one alone can take
    // 50 ms on a slow tablet, which would show as a jerk once the camera moves; after that, a few milliseconds a frame)
    if (G.warm >= 0) { G.warm--; readyPictures(G, 300); } else readyPictures(G);
    if (window.__bench) window.__bench.work.push(performance.now() - t0);
}

// =====================================================================
//  MAIN LOOP
// =====================================================================
// smoke when sliding, dust on the grass, speed lines, headlights
function updateEffects(dt) {
    elapsed += dt; puffT += dt; efx.baseY = dmg.baseY = player.y;
    const r = player, fwdX = Math.cos(r.heading), fwdZ = -Math.sin(r.heading), back = r.design.L * 0.32;
    if (puffT > 0.06 && race.phase !== 'lights') {
        puffT = 0;
        const kind = r.onGrass && r.v > 8 ? 'dust' : r.sliding && r.v > 12 ? 'smoke' : null;
        if (kind) for (const side of [-1, 1]) efx.puff(r.x - fwdX * back + fwdZ * side * 0.8, r.z - fwdZ * back - fwdX * side * 0.8, kind, r.v * fwdX, r.v * fwdZ);
        // spray off the tyres in the rain, a powdery cloud in the snow: behind you and any rival close by
        if (weatherKind === 'rain' || weatherKind === 'snow') for (const c of [player, ...rivals]) {
            if (c.v < 12 || Math.hypot(c.x - r.x, c.z - r.z) > 45 || Math.random() > (c === player ? 0.9 : 0.5)) continue;
            const cx = Math.cos(c.heading), cz = -Math.sin(c.heading), cb = c.design.L * 0.45, sd = Math.random() < 0.5 ? -1 : 1;
            efx.puff(c.x - cx * cb + cz * sd * 0.75, c.z - cz * cb - cx * sd * 0.75, weatherKind === 'rain' ? 'spray' : 'powder', c.v * cx, c.v * cz);
        }
    }
    if (weather) weather.update(dt, camera.position, r.v * fwdX, r.v * fwdZ);
    efx.update(dt); dmg.update(dt);
    efx.drawSpeedLines(r.v / r.perf.vmax, r.slip || r.boostOn, dt);
    efx.lensDrops(dt, weatherKind === 'rain' && camMode < 2);
    if (headlight && headlight.visible) {
        headlight.position.set(r.x + fwdX * 1.8, r.y + 1.0, r.z + fwdZ * 1.8);
        headlight.target.position.set(r.x + fwdX * 25, r.y, r.z + fwdZ * 25); headlight.target.updateMatrixWorld();
        carGlow.position.set(r.x - fwdX * 2, r.y + 4.5, r.z - fwdZ * 2);
    }
    const tag = document.getElementById('race-slip'); if (tag) tag.classList.toggle('show', !!r.slip);
}
// keep the shadow area centred on the player, and the sky around the camera
function followSun(x = player.x, z = player.z, y = player.y) {
    const d = sun.userData.dir;
    sun.position.set(x + d.x * 200, y + d.y * 200, z + d.z * 200); sun.target.position.set(x, y, z); sun.target.updateMatrixWorld();
    sky.position.copy(camera.position);
}
// 'auto' quality: if the frame rate stays low for a few seconds, step down a level
let fpsTime = 0, fpsFrames = 0;
function watchFrameRate(dt) {
    if (qualitySetting !== 'auto' || race.phase !== 'go') return;
    fpsTime += dt; fpsFrames++;
    if (fpsTime < 4) return;
    const fps = fpsFrames / fpsTime; fpsTime = 0; fpsFrames = 0;
    if (fps < 42 && quality !== 'low') {
        applyQuality(quality === 'high' ? 'medium' : 'low'); storeSet('autoLevel', quality);   // (remembered, so the next visit starts here)
        flash('Graphics set to ' + SC.QUALITY[quality].label + ' for smoother racing', 2200);
        fpsTime = -3;   // (a few seconds' grace: the change itself causes a short pause, which mustn't count)
    }
}
function frame(now) {
    raf = requestAnimationFrame(frame);
    renderer.info.reset();   // (counted over the whole frame: shadows, reflections and the picture itself)
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0) * (window.__timeScale || 1), t0 = performance.now(); if (window.__bench) window.__bench.gap.push(now - lastT);   // (__timeScale: testing only, a test lap in less time; the driving still runs in the same small steps)
    lastT = now;
    if (window.__mapView && T) { mapFrame(); return; }   // (testing: the whole circuit from above, with the OpenStreetMap outline drawn over it)
    if (!race || race.paused || race.phase === 'qintro' || race.phase === 'qdone') { if (sky) sky.position.copy(camera.position); drawFrame(); return; }   // (paused, or reading a qualifying panel: a still picture)
    if (race.replay) { replayFrame(dt); return; }
    if (race.podium) { podiumFrame(dt); return; }
    if (race.phase === 'grid') { gridFrame(dt); return; }   // (the flyover: nothing drives, and no clock runs, until it is over)
    race.t += dt;
    if (race.podiumAt != null && race.t >= race.podiumAt) { startPodium(); podiumFrame(dt); return; }
    if (race.phase === 'lights') {
        // the gantry lights come on one by one while the countdown runs: 3, 2, 1, GO!
        const lit = Math.min(5, Math.floor(race.t / 0.8));
        world.lightMats.forEach((m, i) => { m.emissiveIntensity = i < lit ? 4 : 0; });
        const step = Math.floor(race.t);                    // 1 = "3", 2 = "2", 3 = "1", 4 = GO
        if (step >= 1 && step <= 3 && step !== race.countShown) { race.countShown = step; countdown(String(4 - step), step); }
        if (race.t > 4.0) {
            race.phase = 'go'; world.lightMats.forEach(m => { m.emissiveIntensity = 0; }); countdown('GO!', 4); startRoar();
            player.lapStart = race.raceTime; rivals.forEach(r => { r.lapStart = race.raceTime; });
        }
    }
    // fixed small steps keep the driving stable (the race clock ticks with them, so lap times are right to a hundredth of a second)
    const steps = Math.ceil(dt / 0.01), h = dt / steps, timed = race.phase === 'go' || race.phase === 'done';
    for (let i = 0; i < steps; i++) { if (timed) race.raceTime += h; drivePlayer(h); rivals.forEach(r => driveRival(r, h)); collisions(); }
    // the replay tape: every car, ten times a second, from the start until a few seconds after you finish
    if (mode === 'race' && (race.phase === 'go' || race.phase === 'done') && (race.tapeEnd == null || race.raceTime < race.tapeEnd)) {
        race.tapeT = (race.tapeT || 0) + dt;
        if (race.tapeT >= 0.1) { race.tapeT -= 0.1; race.tape.push([player, ...rivals].map(c => [c.x, c.z, c.heading, c.steer, c.v, c.idx, takeLamp(c), c.boostOn ? 1 : 0])); race.tapeTimes.push(race.raceTime); }   // (with the exact moment of each sample: frames don't land exactly on the tenths, and playing them back as if they did made the cars judder; the place on the lap, so a car on a bridge stays on it; and the brake light)
    }
    // every lap you drive is recorded (twenty times a second), in case it turns out to be your best: then it is your ghost
    if (race.phase === 'go' && player.lap >= 0) {
        race.recT = (race.recT || 0) + dt;
        while (race.recT >= 0.05) { if (race.recording.length < 9000) race.recording.push(player.y ? [+player.x.toFixed(2), +player.z.toFixed(2), +player.heading.toFixed(3), +player.y.toFixed(2)] : [+player.x.toFixed(2), +player.z.toFixed(2), +player.heading.toFixed(3)]); race.recT -= 0.05; }
    }
    if (mode === 'trial' && race.phase === 'go') updateGhost();
    if (race.pit) pitFrame();
    if (mode === 'quali') { if (race.phase !== 'go') return; updateGhost(); }   // (your flying lap has just ended: the grid's table is up)
    updateCars(dt); placeCamera(false, dt); updateEngine();
    followSun(); tunnelLight(dt); world.update(dt); watchFrameRate(dt);
    updateEffects(dt);
    hud(); showBoosts(); pitHint(); drawMap(); cornerNames();
    drawFrame();
    if (window.__bench) window.__bench.work.push(performance.now() - t0);   // (testing: how long this frame's work took)
}

// =====================================================================
//  CONTROLS (touch buttons with pointer events, keyboard, optional tilt)
// =====================================================================
// When the tablet goes to another app or the screen turns off, the race pauses and every sound stops (otherwise the
// engine would carry on droning in the background)
function onHidden() {
    if (!document.hidden || !race) return;
    Object.keys(input).forEach(k => { if (k !== 'tilt') input[k] = false; });
    if (race.phase !== 'done' && race.phase !== 'qintro' && race.phase !== 'qdone' && !race.paused) togglePause(); else stopEngine();
}
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'brake' };
const WHEEL_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };   // (the pit stop's four wheels)
function onKeyDown(e) {
    if (!isRacing()) return;
    if (race && race.grid && !e.repeat && e.code !== 'Escape' && e.code !== 'KeyC') skipGridCam();
    if (race && race.pit && e.code in WHEEL_KEYS) { if (!e.repeat) pitTap(WHEEL_KEYS[e.code]); e.preventDefault(); return; }
    if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); getAudioStart(); }
    if (e.code === 'KeyB' && !e.repeat) useBoost();          // (B for boost: Space is already the brake)
    if (e.code === 'KeyC') nextCamera(); if (e.code === 'Escape') togglePause(true);
}
// The buttons on the racing screen are part of the page for good, so their listeners are added once (bindControls).
// The listeners on the window and the document only matter while the racing screen is up: they are added as a race
// starts and all taken away together on leaving it (one AbortController), so nothing of a race is left behind.
let live = null;
function listen() {
    if (live) return;
    live = new AbortController(); const o = { signal: live.signal };
    document.addEventListener('visibilitychange', onHidden, o);
    window.addEventListener('keydown', onKeyDown, o);
    window.addEventListener('keyup', e => { if (KEYS[e.code]) input[KEYS[e.code]] = false; }, o);
    window.addEventListener('blur', () => { Object.keys(input).forEach(k => { if (k !== 'tilt') input[k] = false; }); }, o);
}
function unlisten() {
    if (live) { live.abort(); live = null; }
    if (tiltOn) { window.removeEventListener('deviceorientation', tiltHandler); tiltOn = false; const b = document.getElementById('race-tilt'); if (b) b.classList.remove('active'); }
    Object.keys(input).forEach(k => { input[k] = k === 'tilt' ? 0 : false; });
}
function bindControls() {
    document.querySelectorAll('[data-pad]').forEach(btn => {
        const key = btn.dataset.pad;
        const on = e => { e.preventDefault(); btn.setPointerCapture && btn.setPointerCapture(e.pointerId); input[key] = true; btn.classList.add('down'); getAudioStart(); };
        const off = e => { e.preventDefault(); input[key] = false; btn.classList.remove('down'); };
        btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off); btn.addEventListener('lostpointercapture', off);
        btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    // the overtake boost: it fires the moment the thumb lands
    const boost = document.getElementById('race-boost');
    if (boost) { boost.addEventListener('pointerdown', e => { e.preventDefault(); useBoost(); }); boost.addEventListener('contextmenu', e => e.preventDefault()); }
    // a tap anywhere on the picture skips the grid flyover (the buttons along the top still do their own jobs)
    document.getElementById('race-stage').addEventListener('pointerdown', e => { if (race && race.grid && !e.target.closest('.race-top, .race-panel')) skipGridCam(); });
}
let tiltOn = false;
function getAudioStart() { if (!engine && race && !race.paused && !race.replay && !race.podium) startEngine(); }   // (not while paused or watching a replay)
function tiltHandler(e) { if (e.gamma == null) return; const landscape = Math.abs(window.orientation || 0) === 90 || innerWidth > innerHeight; const raw = landscape ? e.beta * (window.orientation === -90 ? -1 : 1) : e.gamma; input.tilt = -Math.max(-1, Math.min(1, raw / 25)); }
async function toggleTilt() {
    if (!tiltOn) {
        try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const p = await DeviceOrientationEvent.requestPermission(); if (p !== 'granted') return; } } catch (e) { return; }
        window.addEventListener('deviceorientation', tiltHandler); tiltOn = true; flash('Tilt steering on');
    } else { window.removeEventListener('deviceorientation', tiltHandler); input.tilt = 0; tiltOn = false; flash('Tilt steering off'); }
    document.getElementById('race-tilt').classList.toggle('active', tiltOn);
}
const isRacing = () => !document.getElementById('race-stage').hidden;
function togglePause(back = false) {
    if (!race) return;
    if (race.phase === 'done') {
        if (!back) return;   // (the Back button after the finish: out of a replay, then back to the menu)
        if (race.replay) { stopReplay(); document.getElementById('race-result').hidden = false; }
        else if (race.podium || !document.getElementById('race-result').hidden) showMenu();
        return;
    }
    if (race.phase === 'qintro' || race.phase === 'qdone') { if (back) showMenu(); return; }   // (a qualifying panel is up: Back leaves; there is nothing to pause)
    race.paused = !race.paused;
    document.getElementById('race-pause-panel').hidden = !race.paused;
    if (race.paused) stopEngine(); else startEngine();   // the engine comes back when you carry on racing
}

// =====================================================================
//  MENU AND SCREEN
// =====================================================================
function showStage() {
    document.getElementById('race-stage').hidden = false;
    document.getElementById('race-result').hidden = true;
    document.getElementById('race-pause-panel').hidden = true;
    // (in a championship, leaving a race part-way doesn't lose the season: the pause box says so)
    const note = document.getElementById('race-pause-note'), quit = document.querySelector('#race-pause-panel [data-race="menu"]');
    if (note) { note.hidden = !champ; note.textContent = mode === 'quali' ? 'Your season is saved. If you quit now, qualifying starts again next time.' : gridOrder ? 'Your season and your place on the grid are saved. If you quit now, this race starts again from the grid next time.' : 'Your season is saved. If you quit now, this race starts again from the grid next time.'; }
    if (quit) quit.textContent = champ ? 'Save and quit' : 'Quit to menu';
    const skip = document.getElementById('race-qskip'); if (skip) { skip.hidden = mode !== 'quali'; skip.textContent = 'Skip qualifying'; }
    const keep = document.querySelector('#race-pause-panel [data-race="resume"]'); if (keep) keep.textContent = mode === 'quali' ? 'Keep driving' : 'Keep racing';
    const st = document.getElementById('race-stage'); st.classList.toggle('quali-on', mode === 'quali'); lastTower = '';
    document.body.classList.add('racing'); listen();
    resize(); setupRace(); startEngine();
}
// back to the menus (app.js shows them)
function showMenu() {
    const finished = !!(race && race.phase === 'done');   // (leaving after the finish, or giving up part-way)
    if (window.stopLongSounds) window.stopLongSounds();
    stopEngine(); leavePodium(); endGridCam(true); if (race && race.pit) for (const w of race.pit.wheels) if (w) w.visible = true;
    race = null; quali = null; closePit(); unlisten(); { const h = document.getElementById('race-pit-hint'); if (h) h.hidden = true; }
    document.getElementById('race-stage').hidden = true;
    document.body.classList.remove('racing');
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (onExit) onExit(finished);
}
function resize() {
    if (!renderer) return;
    const el = document.getElementById('race-canvas-wrap'), w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function loadCircuit(c) {
    if (world && TRACK === c) return;
    if (world) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }); }); }   // (every picture: the photo ones are copies made for this circuit, and going back to a circuit builds it afresh)
    tunnelNow = 0; TRACK = c; T = buildTrackData(c); samples = T.samples; N = T.N; trackLen = T.trackLen; tvCams = null;
    world = buildTrack(scene);
    PIT = pitLayout(T, c); pitMarks = buildPitMarks(T, PIT); pitMarks.visible = false; world.group.add(pitMarks);   // (the painted pit box: shown in races that have pit stops)
    setAtmosphere(c.theme);
    drawMapBase();
}
// sky, haze, sun direction and reflections for a circuit's theme
function setAtmosphere(theme) {
    // (the circuit's own sky, horizon, haze and light, for this weather: see backdrop.js)
    const th = look = BD.lookFor(TRACK, weatherLook(SC.lookFor(theme, timeOfDay), weatherKind)), low = quality === 'low';
    if (sky) { scene.remove(sky); sky.material.dispose(); }
    sky = BD.makeSky(th, low, () => { if (TRACK && TRACK.theme === theme && look === th) setAtmosphere(theme); }); scene.add(sky);   // (made again when its photo arrives)
    // distant scenery fades into exactly the colour of the bottom of the sky, so there is no edge where it ends
    const direct = !filmEffects();
    scene.background = th.haze.clone();
    scene.fog = new THREE.Fog(BD.fogColour(th, direct), th.fog[0], th.fog[1]);
    if (world.setLook) world.setLook(th, direct);
    if (scene.environment) { const rt = scene.environment.userData.target; if (rt) rt.dispose(); else scene.environment.dispose(); }   // (the whole render target, or it stays in memory each time)
    scene.environment = SC.makeEnvironment(renderer, th, low);
    scene.environmentIntensity = th.light.env;
    sun.intensity = th.light.sun; sun.color.set(th.light.sunColor); hemi.intensity = th.light.hemi;
    hemi.color.set(th.light.hemiSky); hemi.groundColor.set(th.light.hemiGround);
    SC.setTreeLight(th);
    renderer.toneMappingExposure = th.light.exposure;
    if (headlight) headlight.visible = carGlow.visible = timeOfDay === 'night' && !TRACK.floodlit;   // (a floodlit circuit needs no headlight)
    // glowing things (lamps, lit windows, tail lights) glow brighter in the dark
    world.group.traverse(o => { if (o.material) [].concat(o.material).forEach(m => {
        if (!m.emissive) return;
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.emissiveIntensity;
        // lit windows only show at sunset and night; other lamps just glow brighter in the dark
        m.emissiveIntensity = m.emissiveMap ? th.glow * 1.4 : m.userData.baseGlow * (1 + th.glow * 2);
    }); });
    sun.userData.dir = new THREE.Vector3(...th.sun).normalize();
    camera.far = th.fog[1] + 900; camera.updateProjectionMatrix();
    applyWeatherToGround(weatherKind);
    if (weather) { weather.set(weatherKind, SC.QUALITY[quality].density, timeOfDay === 'night'); if (engine) weather.startSound(engine.ctx, soundOn); }
}
// rain makes the road dark and shiny and the grass darker; snow covers the grass and sand, and leaves the road pale.
// Each photo material remembers how it started, so going back to sunny puts it back exactly.
function applyWeatherToGround(kind) {
    world.group.traverse(o => { if (o.userData.snowOnly) o.visible = kind === 'snow'; });
    // grandstand, pit and bridge roofs (and the city's rooftop units) are covered in snow
    world.group.traverse(o => { if (o.material) [].concat(o.material).forEach(m => {
        if (!m.userData.snowRoof) return;
        if (m.userData.roofColour === undefined) m.userData.roofColour = m.color.getHex();
        m.color.set(kind === 'snow' ? 0xeef2f7 : m.userData.roofColour);
    }); });
    // tyre marks are fainter on a snowy road (they'd look like heavy black tracks)
    scene.traverse(o => { if (o.material && o.material.userData && o.material.userData.roadMarks) o.material.opacity = kind === 'snow' ? 0.45 : 1; });
    world.group.traverse(o => { if (o.userData.cols) { o.geometry.attributes.color.array.set(kind === 'snow' ? o.userData.cols.snow : o.userData.cols.normal); o.geometry.attributes.color.needsUpdate = true; } });
    world.group.traverse(o => { if (o.material) [].concat(o.material).forEach(m => {
        const b = m.userData.base; if (!b) return;
        const road = m.userData.photo === 'asphalt_02', soft = m.userData.photo === 'leafy_grass' || m.userData.photo === 'coast_sand_01';
        m.map = b.map; m.color.set(b.color); m.roughness = b.rough; m.metalness = 0;
        if (kind === 'rain') {
            if (road) { m.color.multiplyScalar(0.62); m.roughness = 0.18; m.metalness = 0.25; }
            else { m.color.multiplyScalar(0.78); m.roughness = Math.min(b.rough, 0.7); }
        }
        if (kind === 'snow') {
            if (soft) { m.map = null; m.color.set(0xeef2f7); m.roughness = 0.92; }
            else if (road) { m.color.set(0xd6dbe2); m.roughness = 0.6; }
            else { m.color.lerp(new THREE.Color(0xffffff), 0.45); }
        }
        m.needsUpdate = true;
    }); });
}
// apply a quality level: sharpness and shadows
function applyQuality(q) {
    if (probe && q !== quality) { probe.dispose(); probe = null; }   // (made again at the right size)
    const skyChanges = (q === 'low') !== (quality === 'low');
    quality = q; SC.setDetail(q !== 'low');
    const Q = SC.QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
    const wantShadows = Q.shadows > 0;
    if (renderer.shadowMap.enabled !== wantShadows) { renderer.shadowMap.enabled = wantShadows; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    sun.castShadow = wantShadows;
    if (wantShadows) {
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        sun.shadow.mapSize.set(Q.shadows, Q.shadows);
        const c = sun.shadow.camera; c.left = c.bottom = -Q.shadowSize; c.right = c.top = Q.shadowSize; c.near = 10; c.far = 400; c.updateProjectionMatrix();
    }
    [player, ...rivals].forEach(r => { if (r) r.blob.material.opacity = wantShadows ? 0.55 : 1; });
    if (skyChanges && world && TRACK) setAtmosphere(TRACK.theme);   // (Low uses smaller sky pictures, and mixes its haze in differently)
    resize();
}
function init() {
    const wrap = document.getElementById('race-canvas-wrap'), canvas = document.createElement('canvas');
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2 }); } catch (e) { return false; }
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.info.autoReset = false;
    wrap.prepend(canvas);
    scene = new THREE.Scene();
    hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a3a, 0.7); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff0d8, 2.8); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    sun.shadow.camera.layers.enable(1);   // (the cars' one-piece shadow casters live on layer 1: see makeRacer)
    scene.add(sun, sun.target);
    camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2600);
    SC.setDetail(quality !== 'low');
    // the speed lines are drawn on a see-through layer over the 3D view
    const overlay = document.createElement('canvas'); overlay.className = 'race-fx';
    canvas.after(overlay);
    efx = new Effects(scene, overlay); weather = new Weather(scene); dmg = new Damage(scene);
    // headlights for night races (one light that follows your car)
    headlight = new THREE.SpotLight(0xfff4e0, 60, 90, 0.45, 0.5, 1.4); headlight.visible = false;
    carGlow = new THREE.PointLight(0xc8d8ff, 18, 14, 1.6); carGlow.visible = false;   // like light from street lamps falling on your car
    scene.add(headlight, headlight.target, carGlow);
    applyQuality(quality);
    bindControls();
    new ResizeObserver(resize).observe(wrap);
    return true;
}
// Start a race or a time trial. opts: { circuit (its data), mode: 'race' | 'trial', laps, difficulty, weather, team, onExit }
// A race can begin with qualifying (quali: true); onGrid(order, { pos, time, skipped }) is then told the grid (team
// numbers, pole first) as soon as it is set. Or it can be given a grid that is already known (grid: [...]).
// onExit(finished) is called on leaving: finished is true after the chequered flag, false if the race was given up.
// A championship race also passes champ: { round, of, field (the ten rivals' team numbers, front of the grid first),
// points (for 1st, 2nd, ...), onFinish(rows) }: onFinish gets [{ team, total, best }] in finishing order, at the flag.
// Returns false if this device can't show 3D.
export function start(opts) {
    if (!started) {
        started = true;
        if (!init()) { renderer = null; return false; }
        document.getElementById('race-stage').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.race === 'again') { stopReplay(); showStage(); }
            if (b.dataset.race === 'qgo' || b.dataset.race === 'qretry') { if (quali && (b.dataset.race === 'qgo' || quali.tries < QUALI_TRIES)) qualiGo(); return; }
            if (b.dataset.race === 'qskip') { if (quali && race && race.phase !== 'qdone') qualiDone(null, true); return; }
            if (b.dataset.race === 'qrace') { qualiToRace(); return; }
            if (b.dataset.race === 'menu' || b.dataset.race === 'next') { stopReplay(); showMenu(); }
            if (b.dataset.race === 'replay') startReplay();
            if (b.dataset.race === 'replay-exit') { stopReplay(); document.getElementById('race-result').hidden = false; }
            if (b.dataset.race === 'results') document.getElementById('race-result').classList.remove('podium');   // from the podium to the full results
            if (b.dataset.race === 'podium') document.getElementById('race-result').classList.add('podium');       // ... and back
            if (b.dataset.race === 'pause') togglePause();
            if (b.dataset.race === 'resume') togglePause();
            if (b.id === 'race-tilt') toggleTilt();
            if (b.id === 'race-cam') nextCamera();
            if (b.id === 'race-units') { if (window.toggleUnits) window.toggleUnits(); b.textContent = (window.getUnits && window.getUnits() === 'kmh') ? 'KM/H' : 'MPH'; if (player && player.cockpit && player.cockpit.setUnits) player.cockpit.setUnits(window.getUnits()); }
            if (b.id === 'race-help') { help = !help; storeSet('raceHelp', help); b.classList.toggle('active', help); flash(help ? 'Driving help on' : 'Driving help off'); }
            if (b.id === 'race-engine') { engineOn = !engineOn; storeSet('raceEngine', engineOn); b.classList.toggle('active', engineOn); flash(engineOn ? 'Engine sound on' : 'Engine sound off'); }
            if (b.id === 'race-sound') { soundOn = !soundOn; if (window.FFVSound) window.FFVSound.setOn(soundOn); else storeSet('raceSound', soundOn); b.classList.toggle('active', soundOn); soundOn ? getAudioStart() : stopEngine(); }
        });
    }
    if (!renderer) return false;
    // (these can also be changed on the Settings screen between races)
    soundOn = store('raceSound', true) !== false; engineOn = store('raceEngine', true) !== false; help = store('raceHelp', true) !== false;
    document.getElementById('race-sound').classList.toggle('active', soundOn);
    document.getElementById('race-engine').classList.toggle('active', engineOn);
    document.getElementById('race-help').classList.toggle('active', help);
    champ = opts.mode !== 'trial' && opts.champ ? opts.champ : null;
    // qualifying first (opts.quali), unless the grid is already known (opts.grid: team numbers, pole first)
    gridOrder = opts.mode !== 'trial' && validGrid(opts.grid) ? opts.grid.slice() : null;
    onGrid = opts.mode !== 'trial' && typeof opts.onGrid === 'function' ? opts.onGrid : null;
    mode = opts.mode === 'trial' ? 'trial' : opts.quali && !gridOrder ? 'quali' : 'race';
    lapsChosen = opts.laps || opts.circuit.laps || 3;
    difficulty = DIFF[opts.difficulty] ? opts.difficulty : 'medium';
    playerTeam = Math.max(0, Math.min(TEAMS.length - 1, opts.team ?? 5));
    onExit = opts.onExit || null;
    if (opts.quality && opts.quality !== qualitySetting) { qualitySetting = opts.quality; storeSet('raceQuality', qualitySetting); applyQuality(qualitySetting === 'auto' ? autoQuality() : qualitySetting); }
    const wk = WEATHERS[opts.weather] ? opts.weather : 'sunny', changed = wk !== weatherKind; weatherKind = wk;
    const fresh = TRACK !== opts.circuit;
    timeOfDay = SC.TIMES[opts.circuit.time] ? opts.circuit.time : 'day';   // (a circuit can be a night race: see lasvegas.js)
    loadCircuit(opts.circuit);
    if (changed && !fresh) setAtmosphere(TRACK.theme);
    document.getElementById('race-units').textContent = (window.getUnits && window.getUnits() === 'kmh') ? 'KM/H' : 'MPH';
    showStage();
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
    return true;
}
export function stop() { if (race) showMenu(); }
// for testing: drive automatically along the racing line
export function autopilot(on) { window.__autopilot = on; }
export function suspDebug() { const s = player && player.susp; return s && { pitch: +s.pitch.toFixed(4), roll: +s.roll.toFixed(4), heave: +s.heave.toFixed(4), heat: +s.heat.toFixed(2), bumps: s.bumps.map(b => +b.toFixed(3)), parts: s.corners.length || (s.links ? s.links.length : 0) }; }
export function qualiForTest() { return quali && { ...quali, order: qualiOrder(), grid: gridOrder }; }   // testing only
export function simLapForTest(f) { return simLap(f); }   // testing only
export function debug() { return { mode, grid: gridOrder, phase: race && race.phase, raceT: race && +race.t.toFixed(2), cam: camMode, lap: player && player.lap, idx: player && player.idx, v: player && player.v, pos: player && positionOf(player), best: player && player.best, rivals: rivals.map(r => [r.lap, Math.round(r.v)]), rivalLat: rivals.map(r => [+r.lat.toFixed(2), +r.latV.toFixed(2)]), trackLen, N, trees: world && world.trees, ghost: !!(ghost && ghost.holder.visible), slip: player && player.slip, time: timeOfDay, quality, shadows: renderer.shadowMap.enabled, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, grassPct: player ? Math.round(100 * (player.grassTime || 0) / (player.driveTime || 1)) : 0, wallHits: player && (player.wallHits || 0), slideTime: player && +(player.slideTime || 0).toFixed(1), raceTime: race && race.raceTime }; }
export function setHelp(on) { help = on; }
// testing only: bump car k (0 = you, 1 = the first rival ...) on its 'front', 'rear', 'left' or 'right', as hard as sev (0 to 1)
export function testHit(k = 0, where = 'front', sev = 0.8, colour = '#FFB300') {
    const r = [player, ...rivals][k]; if (!r || !race) return null;
    const [lx, lz] = { front: [1, 0], rear: [-1, 0], right: [0, 1], left: [0, -1] }[where] || [1, 0], c = Math.cos(r.heading), s = Math.sin(r.heading);
    r.hitAt = -9; const n = race.hits.length; carHit(r, lx * c + lz * s, -lx * s + lz * c, sev, colour, false);
    return race.hits.length > n ? { ...race.hits[n], damage: { scuffs: r.damage.scuffs, dents: r.damage.dents, lost: r.damage.lost, chips: r.damage.chips, parts: r.damage.parts.length } } : null;
}
export function results() { return race && race.results && race.results.map(row => ({ k: row.k, name: row.name, total: row.total, laps: row.laps })); }   // testing only
export function damageDebug() { return { hits: race ? race.hits.length : 0, ffMs: race && race.ffMs, replayAt: race && race.replay ? [+race.replay.t.toFixed(1), race.replay.hit] : null, cars: [player, ...rivals].map(r => r.damage ? [r.damage.scuffs, r.damage.dents, r.damage.lost, r.damage.chips] : null) }; }   // testing only
export function testReplay() { if (race && race.tape && race.tape.length >= 20) { startReplay(); return true; } return false; }   // testing only

// testing only: put your car anywhere on the lap (metres from the start line), standing still or moving
export function testGoto(d, v = 0, lat = 0) {
    const s = sampleAt(d); player.x = s.p.x + s.n.x * lat; player.z = s.p.z + s.n.z * lat; player.heading = s.heading; player.idx = T.indexAt(d); player.v = v;
    updateCars(0); placeCamera(true);
}
// testing only: the whole circuit seen from straight above (north at the top), with the outline from OpenStreetMap drawn
// over it in pink, to check the game's track against the map it was traced from
let mapCam = null;
function mapFrame() {
    const b = T.box, cv = renderer.domElement, aspect = cv.clientWidth / cv.clientHeight, m = 90, z = window.__mapView;
    let w = b.maxX - b.minX + m * 2, h = b.maxZ - b.minZ + m * 2; if (w / h < aspect) w = h * aspect; else h = w / aspect;
    let cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (z && z.d != null) { const s = sampleAt(z.d); cx = s.p.x; cz = s.p.z; h = z.size; w = h * aspect; }      // (a close-up of one part)
    if (!mapCam) mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 4000);
    mapCam.left = -w / 2; mapCam.right = w / 2; mapCam.top = h / 2; mapCam.bottom = -h / 2; mapCam.updateProjectionMatrix();
    mapCam.position.set(cx, 1500, cz); mapCam.up.set(0, 0, -1); mapCam.lookAt(cx, 0, cz);
    for (const l of world.lod) l.o.visible = true;
    const fog = scene.fog; scene.fog = null; sky.visible = false;
    const far = world.group.children.filter(o => o.userData.backdrop && o.visible); far.forEach(o => { o.visible = false; });   // (far-off mountains only smear across a map)
    renderer.render(scene, mapCam);
    scene.fog = fog; sky.visible = true; far.forEach(o => { o.visible = true; });
    const o = efx.overlay, x = efx.ctx2d, W = o.clientWidth, H = o.clientHeight; if (o.width !== W || o.height !== H) { o.width = W; o.height = H; }
    x.clearRect(0, 0, W, H);
    const P = TRACK.geo.outline, px = i => (P[i] - cx) / w * W + W / 2, pz = i => (P[i + 1] - cz) / h * H + H / 2;
    x.strokeStyle = '#ff2bd6'; x.lineWidth = z && z.d != null ? 2 : 1.2; x.beginPath();
    for (let i = 0; i < P.length; i += 2) i ? x.lineTo(px(i), pz(i)) : x.moveTo(px(i), pz(i));
    x.closePath(); x.stroke();
    if (z && z.d != null) { x.fillStyle = '#ff2bd6'; for (let i = 0; i < P.length; i += 2) x.fillRect(px(i) - 2.5, pz(i) - 2.5, 5, 5); }   // each mapped point
    x.font = '700 15px sans-serif'; x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 3;
    const note = `Pink: OpenStreetMap outline (${TRACK.geo.mappedLength} m).  Game track: ${trackLen.toFixed(1)} m.  Real lap: ${TRACK.geo.realLength} m.`;
    x.strokeText(note, 14, H - 16); x.fillText(note, 14, H - 16);
}
export function testGridCam(t) { if (!race || !race.grid) return false; if (t == null && race.grid.hold != null) race.grid.t = race.grid.hold; race.grid.hold = t; return true; }   // testing only: hold the grid flyover at a moment (null lets it run on from there)
export function sceneForTest() { return scene; }   // testing only
export function pitForTest() { return { open: pitsOpen(), PIT, shown: !!(pitMarks && pitMarks.visible), pit: race && race.pit && { taps: race.pit.taps, time: race.pit.time }, stops: player && player.pitStops, boosts: player && player.boosts, boostT: player && +player.boostT.toFixed(2), used: player && player.boostsUsed, crashed: race && race.crashed,
    rivals: rivals.map(r => r.ps && [r.ps.plan, r.ps.state || (r.ps.done ? 'done' : '-'), r.ps.bay, r.boosts, r.boostOn ? 1 : 0]) }; }   // testing only
export function pitTapForTest(i) { pitTap(i); }   // testing only
export function rivalsBoostForTest() { return rivals.map(r => !!r.boostOn); }   // testing only
export function rivalBoostNow(k = 0) { const r = rivals[k]; if (r) { r.boostT = BOOST_TIME; } return !!r; }   // testing only: make rival k fire a boost
export function trackForTest() { return T; }   // testing only
export function testTime(t) { if (!SC.TIMES[t]) return false; timeOfDay = t; if (world && TRACK) setAtmosphere(TRACK.theme); return true; }   // testing only: 'day', 'sunset' or 'night'
export function rivalsForTest() { return rivals.map(r => [Math.round(((r.d % trackLen) + trackLen) % trackLen), Math.round(r.v * 3.6), +r.y.toFixed(1)]); }   // testing only: where each rival is, its speed (km/h) and height
export function ghostForTest() { return ghost && ghost.holder.visible ? [+ghost.holder.position.x.toFixed(1), +ghost.holder.position.y.toFixed(2), +ghost.holder.position.z.toFixed(1)] : null; }   // testing only
export function heightForTest() { return { d: Math.round(samples[player.idx].d), carY: +player.y.toFixed(2), roadY: +samples[player.idx].p.y.toFixed(2) }; }   // testing only
export function gfxForTest() { return { renderer, scene, camera, sun, world }; }   // testing only
