// Formula for Victory: the app around the racing. Title screen, choosing a circuit, setting up a race, credits,
// the Install button and the little sounds. The racing itself (race.js and three.js) is only loaded when it is needed.
'use strict';

if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {   // ("?nosw": testing only, so a test always sees the newest files)
    // When a new version takes over, reload once so the old and new files are never mixed
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloading) { reloading = true; window.location.reload(); }
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Everything this app saves on the device starts with 'ffv_' (the owner's other apps share the same web address)
const store = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem('ffv_' + key)); return v ?? fallback; } catch (e) { return fallback; } };
const storeSet = (key, v) => { try { localStorage.setItem('ffv_' + key, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = t => t == null ? '–' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// =====================================================================
//  SOUND (made in code) AND MESSAGES
// =====================================================================
let audioCtx = null;
function getAudio() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    } catch (e) { return null; }
}
function tone(ctx, { freq, to = freq, dur = .2, type = 'sine', vol = .2, delay = 0 }) {
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(.001, t + dur);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + dur + .02);
}
function playSound(type) {
    if (!store('raceSound', true)) return;
    const ctx = getAudio(); if (!ctx) return;
    switch (type) {
        case 'click': tone(ctx, { freq: 900, to: 1200, dur: .05, type: 'square', vol: .04 }); break;
        case 'rev':   // a quick engine blip
            tone(ctx, { freq: 70, to: 210, dur: .35, type: 'sawtooth', vol: .09 });
            tone(ctx, { freq: 140, to: 420, dur: .35, type: 'square', vol: .03 });
            tone(ctx, { freq: 210, to: 90, dur: .4, type: 'sawtooth', vol: .06, delay: .33 }); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(ctx, { freq: f, dur: .22, type: 'triangle', vol: .16, delay: i * .08 })); break;
        case 'lose': tone(ctx, { freq: 220, to: 90, dur: .35, type: 'sawtooth', vol: .1 }); break;
    }
}
window.getAudio = getAudio; window.playSound = playSound;
let toastTimer = null;
function toast(msg, ms = 1800) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// =====================================================================
//  MPH or KM/H
// =====================================================================
let units = store('units', 'mph') === 'kmh' ? 'kmh' : 'mph';
const unitsBtn = document.getElementById('units-btn');
const showUnits = () => { unitsBtn.textContent = units === 'mph' ? 'MPH' : 'KM/H'; };
window.getUnits = () => units;
window.toggleUnits = () => { units = units === 'mph' ? 'kmh' : 'mph'; storeSet('units', units); showUnits(); if (current === 'setup') renderSetup(); };
unitsBtn.addEventListener('click', () => { window.toggleUnits(); playSound('click'); });
showUnits();

// =====================================================================
//  SCREENS
// =====================================================================
let current = 'title';
const racing = () => document.body.classList.contains('racing');
function show(name) {
    current = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelector('.nav-btn.home').classList.toggle('active', name === 'title');
    if (name === 'circuits') renderCircuits();
    if (name === 'setup') renderSetup();
    if (name === 'credits') renderCredits();
    window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-screen]'); if (!b) return;
    // (the Back button comes here too: during a race it pauses instead of leaving)
    if (racing()) { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); return; }
    playSound('click'); show(b.dataset.screen);
});

// =====================================================================
//  CIRCUITS
// =====================================================================
let circuitList = null, chosen = null;          // chosen: { info (from the list), data (the loaded circuit) }
const loaded = {};
function loadCircuits() { return circuitList ? Promise.resolve(circuitList) : import('./circuits/index.js').then(m => (circuitList = m.CIRCUITS)); }
function loadCircuit(info) { return loaded[info.id] ? Promise.resolve(loaded[info.id]) : info.load().then(c => (loaded[info.id] = c)); }
// a circuit's outline, drawn from its centre line (north at the top)
function drawOutline(canvas, geo, size, lineWidth = 4) {
    const P = geo.pts; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < P.length; i += 2) { minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i]); minZ = Math.min(minZ, P[i + 1]); maxZ = Math.max(maxZ, P[i + 1]); }
    const w = maxX - minX, h = maxZ - minZ, pad = 10, k = (size - pad * 2) / Math.max(w, h), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round((w * k + pad * 2) * dpr); canvas.height = Math.round((h * k + pad * 2) * dpr);
    canvas.style.width = Math.round(w * k + pad * 2) + 'px'; canvas.style.height = Math.round(h * k + pad * 2) + 'px';
    const x = canvas.getContext('2d'); x.scale(dpr, dpr); x.lineJoin = 'round';
    const trace = () => { x.beginPath(); for (let i = 0; i < P.length; i += 2) { const px = pad + (P[i] - minX) * k, pz = pad + (P[i + 1] - minZ) * k; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.closePath(); x.stroke(); };
    x.strokeStyle = '#3D4451'; x.lineWidth = lineWidth + 4; trace(); x.strokeStyle = '#F4F6F8'; x.lineWidth = lineWidth; trace();
    // the start line and an arrow showing which way the cars go
    const sx = pad + (P[0] - minX) * k, sz = pad + (P[1] - minZ) * k, ax = P[4] - P[0], az = P[5] - P[1], al = Math.hypot(ax, az) || 1;
    x.save(); x.translate(sx, sz); x.rotate(Math.atan2(az, ax)); x.fillStyle = '#E10600'; x.fillRect(-2, -lineWidth * 2, 4, lineWidth * 4);
    x.beginPath(); x.moveTo(lineWidth * 5, 0); x.lineTo(lineWidth * 2, -lineWidth * 1.6); x.lineTo(lineWidth * 2, lineWidth * 1.6); x.fill(); x.restore();
}
function renderCircuits() {
    const grid = document.getElementById('circuit-grid');
    loadCircuits().then(list => {
        grid.innerHTML = list.map(c => c.soon
            ? `<div class="circuit-card soon"><span class="cc-soon">COMING SOON</span><div class="cc-map"><span>🔒</span></div><span class="cc-where">${c.flag} ${escapeHtml(c.country)}</span><b>${escapeHtml(c.name)}</b><span class="cc-blurb">${escapeHtml(c.blurb)}</span></div>`
            : `<button class="circuit-card" data-circuit="${c.id}"><div class="cc-map"><canvas></canvas></div><span class="cc-where">${c.flag} ${escapeHtml(c.country)} · ${c.km.toFixed(3)} km</span><b>${escapeHtml(c.name)}</b><span class="cc-blurb">${escapeHtml(c.blurb)}</span><span class="act-btn cc-go">Race here</span></button>`).join('');
        for (const c of list) if (!c.soon) loadCircuit(c).then(data => { const cv = grid.querySelector(`[data-circuit="${c.id}"] canvas`); if (cv) drawOutline(cv, data.geo, 120, 3); });
    });
}
document.getElementById('circuit-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-circuit]'); if (!b) return;
    const info = circuitList.find(c => c.id === b.dataset.circuit); if (!info || info.soon) return;
    playSound('click');
    loadCircuit(info).then(data => { chosen = { info, data }; show('setup'); });
});

// =====================================================================
//  SETTING UP A RACE
// =====================================================================
// (the ten made-up teams: the same list as in race.js, kept here too so the menu opens without loading the 3D parts)
const TEAMS = [['Team Apex', '#F4F6F8', '#FF6D00'], ['Nitro Racing', '#1E3A8A', '#FFB300'], ['Velocity GP', '#00A86B', '#F4F6F8'], ['Bolt Motorsport', '#FFB300', '#1B1F26'],
    ['Rocket Racing', '#1B1F26', '#C6FF00'], ['Comet Speed', '#7E57C2', '#F4F6F8'], ['Peak Performance', '#D81B60', '#F4F6F8'], ['Thunder GP', '#00B8D9', '#1B1F26'],
    ['Falcon Racing', '#FF6D00', '#1B1F26'], ['Storm Motorsport', '#C6FF00', '#1B1F26']];
const opts = { laps: [3, 5].includes(store('laps', 3)) ? store('laps', 3) : 3, difficulty: ['easy', 'medium', 'hard'].includes(store('difficulty', 'easy')) ? store('difficulty', 'easy') : 'easy',
    weather: 'sunny', team: Math.max(0, Math.min(9, store('team', 5) | 0)), quality: ['auto', 'low', 'medium', 'high'].includes(store('raceQuality', 'auto')) ? store('raceQuality', 'auto') : 'auto' };
function renderSetup() {
    if (!chosen) { show('circuits'); return; }
    const c = chosen.data, best = store('raceBest_' + c.id, null), medals = store('medals', {});
    const medalFor = k => ({ 1: '🥇', 2: '🥈', 3: '🥉' }[medals[c.id + '_' + k]] || '');
    const km = c.geo.realLength / 1000, len = units === 'mph' ? `${(km * 0.621371).toFixed(2)} miles` : `${km.toFixed(3)} km`;
    const row = (key, list, label) => `<div class="opts">${list.map(([v, text]) => `<button class="opt ${opts[key] === v ? 'active' : ''}" data-opt="${key}" data-val="${v}">${text}</button>`).join('')}</div>`;
    document.getElementById('setup').innerHTML = `
        <div class="screen-head"><h1><span class="kicker">${chosen.info.flag} ${escapeHtml(c.country)}</span>${escapeHtml(c.title || c.name)}</h1></div>
        <div class="setup-grid">
            <div class="panel">
                <div class="setup-map"><canvas id="setup-map"></canvas></div>
                <p class="small">${escapeHtml(c.about)}</p>
                <div class="setup-facts"><span>Lap <b>${len}</b></span><span>Your best lap <b>${fmtTime(best)}</b></span></div>
            </div>
            <div class="panel">
                <p class="b-label" style="margin-top:0">Your team</p>
                <div class="team-dots">${TEAMS.map(([name, paint, stripe], i) => `<button class="team-dot ${i === opts.team ? 'active' : ''}" data-opt="team" data-val="${i}" style="background:${paint};--stripe:${stripe}" aria-label="${name}" title="${name}"></button>`).join('')}</div>
                <p class="team-name">${TEAMS[opts.team][0]}</p>
                <p class="b-label">Race length</p>
                ${row('laps', [[3, '3 laps'], [5, '5 laps']])}
                <p class="b-label">Rivals</p>
                ${row('difficulty', [['easy', 'Easy ' + medalFor('easy')], ['medium', 'Medium ' + medalFor('medium')], ['hard', 'Hard ' + medalFor('hard')]])}
                <p class="b-label">Weather (looks only: the car grips just the same)</p>
                ${row('weather', [['sunny', '☀️ Sunny'], ['rain', '🌧️ Rain']])}
                <p class="b-label">Graphics</p>
                ${row('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
                <div class="mode-btns"><button class="big-btn" data-go="race">🏁 Race</button><button class="big-btn alt" data-go="trial">⏱ Time trial</button></div>
                <p class="small" style="margin-top:10px">Race: ten cars, you start at the back. Time trial: the track to yourself, chasing your own best lap.</p>
            </div>
        </div>
        <div class="panel how"><h3>How to drive</h3><p><b>Tablet and phone:</b> hold the arrows on the left to steer, and the pedals on the right to go and brake. You can also turn on tilt steering. <b>Driving help</b> (on at the start) slows you down in time for the corners and nudges you back onto the road. <b>Laptop:</b> arrow keys or W A S D, C changes the camera, Esc pauses. Lower Graphics if the racing feels jerky.</p></div>`;
    drawOutline(document.getElementById('setup-map'), c.geo, Math.min(300, window.innerWidth - 90), 4);
}
document.getElementById('setup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.opt) {
        const k = b.dataset.opt, v = k === 'laps' || k === 'team' ? +b.dataset.val : b.dataset.val;
        opts[k] = v; if (k !== 'weather') storeSet(k === 'quality' ? 'raceQuality' : k, v);
        playSound('click'); renderSetup(); return;
    }
    if (b.dataset.go) startRace(b.dataset.go);
});
let raceModule = null;
function startRace(mode) {
    getAudio(); playSound('rev');
    const veil = document.getElementById('loading'); veil.hidden = false;
    // (two frames' grace, so the "warming up" message is on screen before the circuit is built)
    requestAnimationFrame(() => requestAnimationFrame(() => {
        (raceModule ? Promise.resolve(raceModule) : import('./race.js').then(m => (raceModule = window.__race = m)))
            .then(m => {
                const ok = m.start({ circuit: chosen.data, mode, laps: opts.laps, difficulty: opts.difficulty, weather: opts.weather, team: opts.team, quality: opts.quality, onExit: () => show('setup') });
                veil.hidden = true;
                if (!ok) toast("This device or browser can't show 3D graphics, so racing can't start.", 5000);
            })
            .catch(err => { veil.hidden = true; console.error(err); toast('The race could not load. Check your connection and try again.', 5000); });
    }));
}

// =====================================================================
//  CREDITS
// =====================================================================
function renderCredits() {
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    document.getElementById('credits').innerHTML = `
        <p><b>Formula for Victory</b> is a racing game for ages 9 to 12. It is a spin-off of the racing in Supercar Legends. The cars, teams, drivers and sponsors are all made up: this game is not connected with any racing series, team or circuit owner.</p>
        <h3>Circuit maps</h3>
        <p>The shape of every circuit is traced from map data © ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}, used under the ${link('https://opendatacommons.org/licenses/odbl/', 'Open Database Licence (ODbL)')}. The data was straightened into a single lap, smoothed a little and saved inside the game. Thank you to everyone who maps the world for OpenStreetMap.</p>
        <h3>3D and fonts</h3>
        <p><b>3D:</b> ${link('https://threejs.org', 'three.js')} © 2010–2025 three.js authors, MIT licence (the full licence is saved inside the game: ${link('lib/three-LICENSE.txt', 'read it')}). <b>Fonts:</b> Orbitron, Russo One and Exo 2, all under the SIL Open Font Licence, saved inside the game.</p>
        <h3>Pictures used on the track</h3>
        <p><b>Textures</b> (asphalt, grass, sand, concrete): CC0 textures by Rob Tuytel and Charlotte Baglioni from ${link('https://polyhaven.com', 'Poly Haven')}. <b>Skies:</b> CC0 photographed skies from Poly Haven by Greg Zaal, Jarod Guest and Dimitrios Savva. <b>Trees:</b> pictures made in Blender from CC0 tree models from Poly Haven by Rob Tuytel, Rico Cilliers, James Ray Cock and Jenelle van Heerden. The cars, grandstands, pit buildings and everything else are drawn in code or were modelled for Supercar Legends.</p>
        <h3>Engine sounds</h3>
        <p>Recordings from Wikimedia Commons, cut into short loops: V8: ${link('https://commons.wikimedia.org/wiki/File:Rover-v8-rr79.ogg', 'recording')} by Collard at English Wikipedia, public domain; V10/V12: ${link('https://commons.wikimedia.org/wiki/File:M70.ogg', 'recording')} by Johannes Maximilian, ${link('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0')}; high revs: ${link('https://commons.wikimedia.org/wiki/File:Ford_Sierra_RS_Cosworth_(tuned,_about_600_hp)_-_engine_and_exhaust_sound_(YouTube_7e3q50wwmNE).opus', 'recording')} by hggi.car (YouTube), ${link('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0')}; start roar: ${link('https://commons.wikimedia.org/wiki/File:Pagani_Zonda_Roadster_F.ogg', 'recording')} by Edvvc, ${link('https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA 3.0')}. The looped versions are shared under the same licences. All the other sounds are made in code.</p>
        <p class="small">Racing here is pretend. On real roads: seat belts on, and leave the racing to the racing drivers.</p>`;
}

// =====================================================================
//  TITLE PICTURE: a single-seater's silhouette and speed stripes, drawn in code
// =====================================================================
function drawCarShape(x, w) {   // a side view about 'w' wide, nose to the right, wheels on y = 0
    const u = w / 100;
    x.beginPath();
    x.moveTo(100 * u, -3 * u); x.lineTo(96 * u, -6 * u); x.lineTo(72 * u, -9 * u); x.lineTo(60 * u, -12 * u); x.lineTo(54 * u, -17 * u); x.lineTo(48 * u, -17 * u);
    x.lineTo(44 * u, -24 * u); x.lineTo(34 * u, -24 * u); x.lineTo(26 * u, -15 * u); x.lineTo(10 * u, -13 * u); x.lineTo(10 * u, -26 * u); x.lineTo(0, -26 * u); x.lineTo(0, -19 * u);
    x.lineTo(6 * u, -19 * u); x.lineTo(6 * u, -5 * u); x.lineTo(100 * u, -1 * u); x.closePath(); x.fill();
    x.fillRect(88 * u, -5.5 * u, 13 * u, 2.2 * u);                                   // front wing
    for (const cx of [20, 78]) { x.beginPath(); x.arc(cx * u, -7.5 * u, 7.5 * u, 0, Math.PI * 2); x.fill(); }
    x.save(); x.lineWidth = 1.6 * u; x.strokeStyle = x.fillStyle; x.beginPath(); x.moveTo(40 * u, -24 * u); x.quadraticCurveTo(50 * u, -27 * u, 56 * u, -17 * u); x.stroke(); x.restore();   // the halo
}
function drawTitleArt() {
    const c = document.getElementById('title-art'), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const g = x.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, Math.max(w, h) * 0.7); g.addColorStop(0, 'rgba(225,6,0,.22)'); g.addColorStop(1, 'rgba(225,6,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.save(); x.translate(0, h * 0.86); x.transform(1, 0, -0.5, 1, 0, 0);
    ['rgba(225,6,0,.5)', 'rgba(255,179,0,.4)', 'rgba(0,229,255,.3)'].forEach((col, i) => { x.fillStyle = col; x.fillRect(-w * 0.2, i * 13 - 30, w * 1.6, 7); });
    x.restore();
    const cw = Math.min(w * 0.82, 760);
    x.save(); x.translate((w - cw) / 2, h * 0.9); x.fillStyle = 'rgba(244,246,248,.07)'; drawCarShape(x, cw); x.restore();
}
window.addEventListener('resize', drawTitleArt);
drawTitleArt(); if (document.fonts) document.fonts.ready.then(drawTitleArt);

// =====================================================================
//  "INSTALL APP" BUTTON
//  Android/Chrome: shown only when Chrome says the app can be installed.
//  iPad/iPhone: Safari has no install pop-up, so the button explains Add to Home Screen.
// =====================================================================
(function installButton() {
    const btn = document.getElementById('install-btn');
    const installed = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
    if (installed) return;
    let installPrompt = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; btn.hidden = false; });
    window.addEventListener('appinstalled', () => { installPrompt = null; btn.hidden = true; toast('Installed! Find Formula for Victory on your home screen 🏁', 4000); });
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isApple) btn.hidden = false;
    btn.addEventListener('click', async () => {
        if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; btn.hidden = true; }
        else if (isApple) toast('Tap the Share button ⬆️ then "Add to Home Screen"', 5000);
    });
})();
