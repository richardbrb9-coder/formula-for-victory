// Formula for Victory: the hand-drawn surfaces used on the track (carried over from Supercar Legends): streaky rubber,
// red and white kerb paint with ridges, galvanised steel, painted concrete blocks and chain-link wire. Everything is
// drawn in code (no picture files). track.js builds the shapes these go on.
import * as THREE from './lib/three.module.min.js';

// streaks along the road, used to break up the rubber and skid marks
export function streakTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#c4c4c4'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 90; i++) {
        const u = Math.random() * 128, w = 0.6 + Math.random() * 2.5, g = Math.floor(120 + Math.random() * 135);
        x.fillStyle = `rgb(${g},${g},${g})`; x.globalAlpha = 0.5 + Math.random() * 0.5; x.fillRect(u, 0, w, 256);
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; x.fillRect(Math.random() * 128, Math.random() * 256, 6 + Math.random() * 20, 10 + Math.random() * 60); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    return t;
}

// kerb paint: red and white stripes (one of each down the picture), grubby, with tyre rubber along the inner edge
export function kerbTextures() {
    const W = 64, H = 128;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#c9180f'; x.fillRect(0, 0, W, H / 2); x.fillStyle = '#ecebe4'; x.fillRect(0, H / 2, W, H / 2);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(30,25,20,${Math.random() * 0.12})`; x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 1 + Math.random() * 3); }   // grime
    const gr = x.createLinearGradient(0, 0, W * 0.45, 0); gr.addColorStop(0, 'rgba(15,15,18,0.55)'); gr.addColorStop(1, 'rgba(15,15,18,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W * 0.45, H);                    // rubber from cars running wide over the inner edge
    for (let v = 0; v < H; v += 16) { x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(0, v, W, 2); }   // the shadow of each ridge
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
    // ridges across the kerb (a normal map: each ridge tilts up, then down)
    const n = document.createElement('canvas'); n.width = 4; n.height = H; const y = n.getContext('2d');
    for (let v = 0; v < H; v++) { const ph = (v % 16) / 16, k = Math.round(128 + (ph < 0.5 ? 55 : -55)); y.fillStyle = `rgb(128,${k},255)`; y.fillRect(0, v, 4, 1); }
    const nor = new THREE.CanvasTexture(n); nor.wrapT = THREE.RepeatWrapping; nor.colorSpace = THREE.NoColorSpace;
    return { map, nor };
}

// galvanised steel, a little streaky
export function steelTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#b9bec4'; x.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,64,70'},${Math.random() * 0.12})`; x.fillRect(Math.random() * 256, Math.random() * 32, 10 + Math.random() * 60, 1 + Math.random() * 3); }
    for (let u = 0; u < 256; u += 64) { x.fillStyle = 'rgba(40,44,50,0.5)'; x.fillRect(u, 0, 2, 32); x.fillStyle = 'rgba(30,30,30,0.6)'; for (const v of [8, 24]) { x.beginPath(); x.arc(u + 6, v, 2, 0, 7); x.fill(); } }   // joins and bolts
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// concrete blocks painted red and white (one block of each across the picture), with joins and road grime at the bottom
export function blockTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#d0140c'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#eeede8'; x.fillRect(128, 0, 128, 64);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(40,35,30,${Math.random() * 0.1})`; x.fillRect(Math.random() * 256, Math.random() * 64, 1 + Math.random() * 6, 1 + Math.random() * 3); }
    const g = x.createLinearGradient(0, 64, 0, 40); g.addColorStop(0, 'rgba(25,25,25,0.55)'); g.addColorStop(1, 'rgba(25,25,25,0)'); x.fillStyle = g; x.fillRect(0, 40, 256, 24);
    for (const u of [0, 128]) { x.fillStyle = 'rgba(20,20,20,0.8)'; x.fillRect(u, 0, 3, 64); }   // the gap between blocks
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(15,15,15,0.35)'; x.fillRect(Math.random() * 256, 44 + Math.random() * 16, 20 + Math.random() * 40, 2 + Math.random() * 3); }   // tyre scuffs
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// chain-link wire for the catch fence (see-through between the wires)
export function wireTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(200,205,210,1)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 32); x.lineTo(32, -32); x.moveTo(32, 96); x.lineTo(96, 32); x.moveTo(-32, 32); x.lineTo(32, 96); x.moveTo(32, -32); x.lineTo(96, 32); x.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// how high a kerb is at this point (for the suspension): the sloped edge, then the ridged top
export function kerbHeight(t, d) {   // t: 0..1.3 m out from the road edge; d: distance along the track
    if (t < 0.06) return 0.045 * Math.max(0, t / 0.06);
    return 0.052 + 0.005 * Math.abs(Math.sin(d * Math.PI / 0.375));
}
