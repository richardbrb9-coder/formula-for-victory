// Formula for Victory: the pictures on the Driver Cards. Each card shows its team's car and its driver's helmet. Both are
// drawn here from the game's own 3D models (the very car and helmet you see on the track), once, into two small pictures,
// which cards.js then keeps (in this browser only) so they never need drawing again until a team's look changes.
// No photographs, and never a face: a helmet with a dark visor.
//
// This is only loaded when the Driver Cards are opened, never during a race, and it gives its 3D drawing surface back
// as soon as the pictures are made.
import * as THREE from './lib/three.module.min.js';
import { createCar, helmetModel } from './carmodel.js';
import { designFor } from './teamdesign.js';

const CAR = [600, 300], HELMET = [240, 240];   // the pictures' sizes, in pixels

// soft, even surroundings for the paint to reflect: a pale sky fading to a grey floor
function studio(renderer) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 128; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#f6f9ff'); g.addColorStop(0.45, '#aebbd0'); g.addColorStop(0.52, '#5a616e'); g.addColorStop(1, '#23262c');
    x.fillStyle = g; x.fillRect(0, 0, 8, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const room = new THREE.Scene(), dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
    room.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer), rt = pmrem.fromScene(room, 0.03);
    pmrem.dispose(); dome.geometry.dispose(); dome.material.dispose(); tex.dispose();
    return rt;
}
// a soft shadow on the ground under the car
function groundShadow() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.62)'); g.addColorStop(0.6, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.01; return m;
}
const breathe = () => new Promise(r => setTimeout(r, 0));   // (lets the page draw and answer taps between pictures)

// Draw the pictures for a list of cards: [{ id, team (from teams.js, or a legend), index }]. each(id, { car, helmet })
// is called as every card's pictures are ready (each a picture as a data: address). Resolves to how many were made
// (0 if this device cannot draw 3D: the cards then simply keep their plain coloured panels).
export async function drawCards(list, each, stillWanted = () => true) {
    const canvas = document.createElement('canvas'); let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' }); } catch (e) { return 0; }
    let made = 0, env = null;
    try {
        renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene(); env = studio(renderer); scene.environment = env.texture; scene.environmentIntensity = 0.95;
        const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x3a3d44, 1.0), key = new THREE.DirectionalLight(0xfff4e2, 2.7), fill = new THREE.DirectionalLight(0xbcd2ff, 0.7);
        key.position.set(4, 7, 5); fill.position.set(-5, 3, -4);
        const shadow = groundShadow(); scene.add(hemi, key, fill, shadow);
        const cam = new THREE.PerspectiveCamera(20, CAR[0] / CAR[1], 0.5, 80);
        const type = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/png';   // (some browsers can only save PNG)
        for (const card of list) {
            if (!stillWanted()) break;
            const design = designFor(card.team, card.index), out = {};
            // ---- the car: from the front corner, a little above, the whole car in the picture ----
            const model = createCar(design, { merge: true });
            model.group.traverse(o => { if (o.material === model.mats.spinBlur) o.visible = false; });
            for (const w of model.wheels) w.rotation.y = (w.userData.side < 0 ? Math.PI : 0) + (w.userData.front ? -0.2 : 0);   // the front wheels turned a touch towards you
            scene.add(model.group); shadow.visible = true;
            renderer.setSize(CAR[0], CAR[1], false); cam.fov = 17; cam.aspect = CAR[0] / CAR[1]; cam.position.set(7.6, 2.5, 6.4); cam.lookAt(0.1, 0.36, 0.05); cam.updateProjectionMatrix();
            renderer.render(scene, cam); out.car = canvas.toDataURL(type, 0.88);
            scene.remove(model.group); model.dispose();
            // ---- the helmet: close up, from the front and a little to one side, so the visor, stripe and ring all show ----
            const helmet = helmetModel(design); scene.add(helmet.group); shadow.visible = false;
            renderer.setSize(HELMET[0], HELMET[1], false); cam.fov = 22; cam.aspect = 1; cam.position.set(0.8, 0.3, 0.66); cam.lookAt(0, -0.02, 0); cam.updateProjectionMatrix();
            renderer.render(scene, cam); out.helmet = canvas.toDataURL(type, 0.9);
            scene.remove(helmet.group); helmet.dispose();
            made++; each(card.id, out);
            await breathe();
        }
        shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose();
    } catch (e) { console.error(e); }
    try { if (env) env.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* already gone */ }
    return made;
}
