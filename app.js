// Formula for Victory: the app around the racing. The title screen and main menu, choosing a circuit, setting up a race,
// how to play, settings, credits and the Install button. The championship's screens are in championship.js, the sounds
// in sound.js, and the teams and drivers in teams.js. The racing itself (race.js and three.js) is only loaded when needed.
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
//  TAP SOUNDS AND MESSAGES (the sounds themselves are made in sound.js)
// =====================================================================
// every button makes a little sound when it is tapped: a brighter one for the big buttons, a falling one for going back
document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || b.classList.contains('pad-btn')) return;
    playSound(b.classList.contains('back-btn') || b.classList.contains('home') ? 'back' : b.classList.contains('big-btn') || b.classList.contains('menu-card') ? 'go' : 'click');
}, true);
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
window.toggleUnits = () => { units = units === 'mph' ? 'kmh' : 'mph'; storeSet('units', units); showUnits(); if (current === 'setup') renderSetup(); if (current === 'settings') renderSettings(); };
// the loudspeaker button: all sound on or off (the same switch as the one on the racing screen and in Settings)
const soundBtn = document.getElementById('sound-btn');
const showSound = () => { soundBtn.textContent = FFVSound.on ? '🔊' : '🔇'; soundBtn.classList.toggle('off', !FFVSound.on); soundBtn.setAttribute('aria-pressed', String(FFVSound.on)); };
soundBtn.addEventListener('click', () => { FFVSound.setOn(!FFVSound.on); if (FFVSound.on) playSound('click'); });
document.addEventListener('ffv-sound', () => { showSound(); if (current === 'settings') renderSettings(); });
showSound();
unitsBtn.addEventListener('click', () => window.toggleUnits());
showUnits();

// =====================================================================
//  SCREENS
// =====================================================================
let current = 'title';
let intent = 'race';                            // what the circuit and set-up screens are for: a quick 'race' or a time 'trial'
const racing = () => document.body.classList.contains('racing');
// show a screen (extra: something for that screen to know, e.g. the championship's 'after' the race view)
function show(name, extra) {
    if (current === 'champ' && window.leaveChamp) window.leaveChamp();   // (stops the confetti and the fanfare)
    if (current === 'teams' && name !== 'teams') FFV.myTeams.leave();
    if (current === 'cards' && name !== 'cards' && window.FFVCards) window.FFVCards.leave();
    current = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelector('.nav-btn.home').classList.toggle('active', name === 'title');
    if (name === 'title') renderTitle();
    if (name === 'circuits') renderCircuits();
    if (name === 'setup') renderSetup();
    if (name === 'champ') renderChamp(extra);
    if (name === 'help') renderHelp();
    if (name === 'settings') renderSettings();
    if (name === 'teams') FFV.myTeams.render();
    if (name === 'cards' && window.FFVCards) window.FFVCards.open();
    if (name === 'credits') renderCredits();
    window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-screen]'); if (!b) return;
    // (the Back button comes here too: during a race it pauses instead of leaving)
    if (racing()) { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); return; }
    show(b.dataset.screen);
});
// the main menu's four big buttons
document.querySelector('.menu-cards').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    if (b.dataset.menu === 'champ') show('champ'); else if (b.dataset.menu === 'cards') show('cards'); else { intent = b.dataset.menu === 'trial' ? 'trial' : 'race'; show('circuits'); }
});
// the Championship button says where your season has got to
function renderTitle() {
    const el = document.getElementById('mc-champ'), S = FFV.season, s = S.load();
    el.textContent = !s ? 'Five races. One champion.' : S.finished(s) ? 'Season finished: see the final table.' : s.results.length ? `Carry on: race ${s.results.length + 1} of ${s.rounds.length} is next.` : 'Your season is ready: race 1 is next.';
    drawTitleArt();
}

// =====================================================================
//  CIRCUITS
// =====================================================================
let circuitList = null, chosen = null;          // chosen: { info (from the list), data (the loaded circuit) }
const loaded = {};
function loadCircuits() { return circuitList ? Promise.resolve(circuitList) : import('./circuits/index.js').then(m => (circuitList = m.CIRCUITS)); }
function loadCircuit(info) { return loaded[info.id] ? Promise.resolve(loaded[info.id]) : info.load().then(c => (loaded[info.id] = c)); }
// a circuit's outline, drawn from its centre line (north at the top). crossover: for a track that crosses over itself,
// which part is the bridge (it is drawn again on top, with a gap in the road beneath it, so you can see which goes over)
function drawOutline(canvas, geo, size, lineWidth = 4, crossover = null) {
    const P = geo.pts; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < P.length; i += 2) { minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i]); minZ = Math.min(minZ, P[i + 1]); maxZ = Math.max(maxZ, P[i + 1]); }
    const w = maxX - minX, h = maxZ - minZ, pad = 10, k = (size - pad * 2) / Math.max(w, h), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round((w * k + pad * 2) * dpr); canvas.height = Math.round((h * k + pad * 2) * dpr);
    canvas.style.width = Math.round(w * k + pad * 2) + 'px'; canvas.style.height = Math.round(h * k + pad * 2) + 'px';
    const x = canvas.getContext('2d'); x.scale(dpr, dpr); x.lineJoin = 'round';
    const trace = () => { x.beginPath(); for (let i = 0; i < P.length; i += 2) { const px = pad + (P[i] - minX) * k, pz = pad + (P[i + 1] - minZ) * k; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.closePath(); x.stroke(); };
    x.strokeStyle = '#3D4451'; x.lineWidth = lineWidth + 4; trace(); x.strokeStyle = '#F4F6F8'; x.lineWidth = lineWidth; trace();
    if (crossover) {
        const n = P.length / 2, at = d => Math.round(d / geo.length * n), i0 = at(crossover.over[0] - 45), i1 = at(crossover.over[1] + 45);
        const part = () => { x.beginPath(); for (let i = i0; i <= i1; i++) { const px = pad + (P[i * 2] - minX) * k, pz = pad + (P[i * 2 + 1] - minZ) * k; i > i0 ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.stroke(); };
        x.lineCap = 'butt'; x.strokeStyle = '#3D4451'; x.lineWidth = lineWidth + 5; part(); x.strokeStyle = '#F4F6F8'; x.lineWidth = lineWidth; part();
    }
    // the start line and an arrow showing which way the cars go
    const sx = pad + (P[0] - minX) * k, sz = pad + (P[1] - minZ) * k, ax = P[4] - P[0], az = P[5] - P[1], al = Math.hypot(ax, az) || 1;
    x.save(); x.translate(sx, sz); x.rotate(Math.atan2(az, ax)); x.fillStyle = '#E10600'; x.fillRect(-2, -lineWidth * 2, 4, lineWidth * 4);
    x.beginPath(); x.moveTo(lineWidth * 5, 0); x.lineTo(lineWidth * 2, -lineWidth * 1.6); x.lineTo(lineWidth * 2, lineWidth * 1.6); x.fill(); x.restore();
}
function renderCircuits() {
    const grid = document.getElementById('circuit-grid'), trial = intent === 'trial';
    document.getElementById('circuits-kicker').textContent = trial ? 'Time trial' : 'Quick race';
    loadCircuits().then(list => {
        grid.innerHTML = list.map(c => c.soon
            ? `<div class="circuit-card soon"><span class="cc-soon">COMING SOON</span><div class="cc-map"><span>🔒</span></div><span class="cc-where">${c.flag} ${escapeHtml(c.country)}</span><b>${escapeHtml(c.name)}</b><span class="cc-blurb">${escapeHtml(c.blurb)}</span></div>`
            : `<button class="circuit-card" data-circuit="${c.id}"><div class="cc-map"><canvas></canvas></div><span class="cc-where">${c.flag} ${escapeHtml(c.country)} · ${c.km.toFixed(3)} km</span><b>${escapeHtml(c.name)}</b><span class="cc-blurb">${escapeHtml(c.blurb)}</span><span class="act-btn cc-go">${trial ? 'Drive here' : 'Race here'}</span></button>`).join('');
        for (const c of list) if (!c.soon) loadCircuit(c).then(data => { const cv = grid.querySelector(`[data-circuit="${c.id}"] canvas`); if (cv) drawOutline(cv, data.geo, 120, 3, data.crossover); }).catch(() => { /* its little map is left blank; choosing it tries again */ });
    }).catch(() => { grid.innerHTML = '<p class="small">The circuits could not load. Check your connection and try again.</p>'; });
}
document.getElementById('circuit-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-circuit]'); if (!b) return;
    const info = circuitList.find(c => c.id === b.dataset.circuit); if (!info || info.soon) return;
    loadCircuit(info).then(data => { chosen = { info, data }; show('setup'); }).catch(() => toast('That circuit could not load. Check your connection and try again.', 5000));
});

// =====================================================================
//  SETTING UP A RACE
// =====================================================================
const TEAMS = FFV.TEAMS;   // (the eleven made-up teams and their drivers: see teams.js)
const opts = { laps: [3, 5].includes(store('laps', 3)) ? store('laps', 3) : 3, difficulty: ['easy', 'medium', 'hard'].includes(store('difficulty', 'easy')) ? store('difficulty', 'easy') : 'easy',
    quali: store('quali', false) === true,   // qualifying before a quick race: off unless it has been switched on
    weather: 'sunny', team: Math.max(0, Math.min(TEAMS.length - 1, store('team', 5) | 0)), quality: ['auto', 'low', 'medium', 'high'].includes(store('raceQuality', 'auto')) ? store('raceQuality', 'auto') : 'auto' };
// the row of round team badges to choose from, and the line under it naming the one chosen
function teamDots(active, kind) {
    return TEAMS.map((t, i) => `<button class="team-dot ${i === active ? 'active' : ''} ${FFV.logoUrl(t.id) ? 'has-logo' : ''}" data-${kind}="team" data-val="${i}" style="background:${t.paint};--stripe:${t.stripe}" aria-label="${escapeHtml(t.team)}" title="${escapeHtml(t.team)}">${FFV.logoUrl(t.id) ? `<img src="${FFV.logoUrl(t.id)}" alt="">` : ''}</button>`).join('');
}
const teamLine = i => `${escapeHtml(TEAMS[i].team)} <small>car ${TEAMS[i].number}</small>`;
function renderSetup() {
    if (!chosen) { show('circuits'); return; }
    const c = chosen.data, best = store('raceBest_' + c.id, null), medals = store('medals', {}), trial = intent === 'trial';
    const medalFor = k => ({ 1: '🥇', 2: '🥈', 3: '🥉' }[medals[c.id + '_' + k]] || '');
    const km = c.geo.realLength / 1000, len = units === 'mph' ? `${(km * 0.621371).toFixed(2)} miles` : `${km.toFixed(3)} km`;
    const row = (key, list, label) => `<div class="opts">${list.map(([v, text]) => `<button class="opt ${opts[key] === v ? 'active' : ''}" data-opt="${key}" data-val="${v}">${text}</button>`).join('')}</div>`;
    // a night race (Las Vegas) is always at night: the other times of day are shown, but can't be chosen
    const night = c.time === 'night';
    const timeRow = night ? `<p class="b-label">Time of day</p><div class="opts"><button class="opt" disabled aria-disabled="true">☀️ Day</button><button class="opt" disabled aria-disabled="true">🌇 Sunset</button><button class="opt active locked" disabled aria-pressed="true">🌙 Night</button></div><p class="small opt-note">This race is always at night, under the floodlights.</p>` : '';
    document.getElementById('setup').innerHTML = `
        <div class="screen-head"><h1><span class="kicker">${trial ? 'Time trial' : 'Quick race'} · ${chosen.info.flag} ${escapeHtml(c.country)}</span>${escapeHtml(c.title || c.name)}</h1></div>
        <div class="setup-grid">
            <div class="panel">
                <div class="setup-map"><canvas id="setup-map"></canvas></div>
                <p class="small">${escapeHtml(c.about)}</p>
                <div class="setup-facts"><span>Lap <b>${len}</b></span><span>Your best lap <b>${fmtTime(best)}</b></span></div>
            </div>
            <div class="panel">
                <p class="b-label" style="margin-top:0">Your team</p>
                <div class="team-dots">${teamDots(opts.team, 'opt')}</div>
                <p class="team-name">${teamLine(opts.team)}</p>
                ${trial ? '' : `<p class="b-label">Race length</p>
                ${row('laps', [[3, '3 laps'], [5, '5 laps']])}
                <p class="b-label">Rivals</p>
                ${row('difficulty', [['easy', 'Easy ' + medalFor('easy')], ['medium', 'Medium ' + medalFor('medium')], ['hard', 'Hard ' + medalFor('hard')]])}`}
                ${trial ? '' : `<p class="b-label">Qualifying</p>
                ${row('quali', [[false, 'Off'], [true, '⏱ On']])}
                <p class="small opt-note">${opts.quali ? 'On: before the race you drive one flying lap on your own. The quicker your lap, the nearer the front you start.' : 'Off: you start the race at the back of the grid.'}</p>`}
                ${timeRow}
                <p class="b-label">Weather (looks only: the car grips just the same)</p>
                ${row('weather', night ? [['sunny', '✨ Clear night'], ['cloudy', '☁️ Cloudy night'], ['rain', '🌧️ Rain']] : [['sunny', '☀️ Sunny'], ['cloudy', '☁️ Grey skies'], ['rain', '🌧️ Rain']])}
                <p class="b-label">Graphics</p>
                ${row('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
                <div class="mode-btns">${trial ? '<button class="big-btn" data-go="trial">⏱ Start the time trial</button>' : '<button class="big-btn" data-go="race">🏁 Race</button>'}</div>
                <p class="small" style="margin-top:10px">${trial ? 'Time trial: the track to yourself, chasing your own best lap. Beat it and a see-through ghost of your best lap races you.' : opts.quali ? 'Race: eleven cars. First, one flying lap to decide where you start. Can you take pole position?' : 'Race: eleven cars, and you start at the back. How many can you pass?'}
                    <button class="link-btn inline" data-intent="${trial ? 'race' : 'trial'}">${trial ? 'Race here instead' : 'Do a time trial here instead'}</button></p>
            </div>
        </div>
        <div class="panel how"><h3>How to drive</h3><p><b>Tablet and phone:</b> hold the arrows on the left to steer, and the pedals on the right to go and brake. <b>Laptop:</b> arrow keys or W A S D. <b>Driving help</b> (on at the start) slows you down in time for the corners. Lower Graphics if the racing feels jerky. <button class="link-btn inline" data-screen="help">More in How to play</button></p></div>`;
    drawOutline(document.getElementById('setup-map'), c.geo, Math.min(300, window.innerWidth - 90), 4, c.crossover);
}
document.getElementById('setup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.opt) {
        const k = b.dataset.opt, v = k === 'laps' || k === 'team' ? +b.dataset.val : k === 'quali' ? b.dataset.val === 'true' : b.dataset.val;
        opts[k] = v; if (k !== 'weather') storeSet(k === 'quality' ? 'raceQuality' : k, v);
        renderSetup(); return;
    }
    if (b.dataset.intent) { intent = b.dataset.intent === 'trial' ? 'trial' : 'race'; renderSetup(); return; }
    if (b.dataset.go) startRace(b.dataset.go);
});
let raceModule = null;
// Start the racing. o: anything that differs from the set-up screen's choices (the championship gives its own circuit,
// laps, rivals, weather and team, and is told when the race finishes: see championship.js)
function startRace(mode, o = {}) {
    const veil = document.getElementById('loading'); if (!veil.hidden) return;   // (a second tap while it is loading)
    getAudio(); playSound('rev');
    veil.hidden = false;
    // (two frames' grace, so the "warming up" message is on screen before the circuit is built)
    requestAnimationFrame(() => requestAnimationFrame(() => {
        // (a family's own logos are painted onto the cars as the race is built, so they must have been read first)
        Promise.race([FFV.logosReady, new Promise(r => setTimeout(r, 1500))]).then(() => raceModule ? raceModule : import('./race.js').then(m => (raceModule = window.__race = m)))
            .then(m => {
                const ok = m.start({ circuit: o.circuit || chosen.data, mode, laps: o.laps || opts.laps, difficulty: o.difficulty || opts.difficulty, weather: o.weather || opts.weather,
                    team: o.team ?? opts.team, quality: opts.quality, champ: o.champ || null, onExit: o.onExit || (() => show('setup')),
                    // qualifying first, if it is switched on (a championship race says for itself, and may already know its grid)
                    quali: mode === 'race' && ('quali' in o ? !!o.quali : opts.quali), grid: o.grid || null, onGrid: o.onGrid || null });
                veil.hidden = true;
                if (!ok) toast("This device or browser can't show 3D graphics, so racing can't start.", 5000);
            })
            .catch(err => { veil.hidden = true; console.error(err); toast('The race could not load. Check your connection and try again.', 5000); });
    }));
}

// =====================================================================
//  HOW TO PLAY
// =====================================================================
function renderHelp() {
    const pts = FFV.season.POINTS;
    document.getElementById('help').innerHTML = `
        <div class="help-grid">
            <div class="panel help-card"><h3>🎮 On a tablet or phone</h3>
                <div class="help-pads" aria-hidden="true"><span class="hp round">◀</span><span class="hp round">▶</span><i></i><span class="hp brake">BRAKE</span><span class="hp gas">GO</span></div>
                <p>Hold the <b>arrows</b> on the left to steer. Hold <b>GO</b> on the right to speed up and <b>BRAKE</b> to slow down. You can use both thumbs at once.</p>
                <p class="small">Like tilting instead? Tap <b>📱 Tilt</b> at the top of the racing screen and steer by tipping the tablet.</p></div>
            <div class="panel help-card"><h3>⌨️ On a laptop</h3>
                <div class="help-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span><span>or</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div>
                <p><b>Up</b> to go, <b>Down</b> or <b>Space</b> to brake, <b>Left</b> and <b>Right</b> to steer. <b>C</b> changes the camera and <b>Esc</b> pauses.</p></div>
            <div class="panel help-card"><h3>🛞 Driving help</h3>
                <p>Driving help is <b>on</b> when you start. It slows the car in time for each corner and nudges you back onto the road, so you can keep your thumb on GO and enjoy the race.</p>
                <p>Feeling brave? Tap <b>🛞 Driving help</b> at the top of the racing screen to turn it off. Then the braking is all up to you: brake <b>before</b> the corner, then steer.</p></div>
            <div class="panel help-card"><h3>🚨 The light on the back of your car</h3>
                <p><span class="lamp red"></span><b>Red</b> means <b>you</b> are braking.</p>
                <p><span class="lamp amber"></span><b>Amber</b> means the <b>driving help</b> is braking for you. Watch where it comes on: that is where to brake when you switch the help off.</p>
                <p class="small">The other cars' red lights tell you when they are slowing down, too.</p></div>
            <div class="panel help-card"><h3>💨 Racing tips</h3>
                <p><b>Slipstream:</b> tuck in close behind another car on a straight. It punches a hole in the air and you go faster: the word SLIPSTREAM lights up. Then pull out and pass!</p>
                <p><b>Stay on the road:</b> grass and gravel slow you right down. <b>🎥 Camera</b> swaps between four views, one from the driver's seat.</p>
                <p class="small">Rain and grey skies only change how things look. The car grips just the same.</p></div>
            <div class="panel help-card"><h3>🎬 After the flag</h3>
                <p>The top three cars go up on the <b>podium</b>, with everyone's lap times underneath. Finish in the top three and you get confetti!</p>
                <p>Tap <b>Watch replay</b> to see your race again from the TV cameras, bumps and all.</p>
                <p class="small">In a time trial there are no rivals: a see-through ghost of your best lap races against you.</p></div>
            <div class="panel help-card"><h3>⏱ Qualifying</h3>
                <p>Switch <b>Qualifying</b> on when you set up a race or a season. Before each race you then get the track to yourself: drive up to the line, then do <b>one flying lap</b> as fast as you can. You can have one more go, and your quicker lap counts.</p>
                <p>Everyone's lap times set the starting grid. The quickest starts at the front, on <b>pole position</b>.</p>
                <p class="small">In a hurry? <b>Skip qualifying</b> starts you at the back, just like a race with qualifying off.</p></div>
            <div class="panel help-card"><h3>🃏 Driver Cards</h3>
                <p>A card game against the computer. Every driver has a card with numbers on it. Pick the number you think beats the computer's card: the <b>higher number wins</b> both cards.</p>
                <p>One number is different: for <b>Debut year</b> the <b>earlier</b> year wins. Win all the cards, or have the most when the rounds run out.</p>
                <p class="small">Your own card also shows what you have won in this game.</p></div>
            <div class="panel help-card wide"><h3>🏆 The championship</h3>
                <p>A season is <b>five races</b>, one on each circuit, against the same ten drivers. You choose your team, how many laps each race has, and how quick the rivals are. You start every race at the back, unless you switch <b>qualifying</b> on.</p>
                <p>The first ten home score points:</p>
                <div class="points-row">${pts.map((p, i) => `<span class="pt ${i < 3 ? 'p' + (i + 1) : ''}"><small>${i + 1}${['st', 'nd', 'rd'][i] || 'th'}</small><b>${p}</b></span>`).join('')}</div>
                <p>After each race you see who scored what and how the table has changed: <b class="up">▲</b> means a driver has moved up, <b class="down">▼</b> means down. Most points after five races wins the trophy.</p>
                <p class="small">Your season is saved after every race, so you can stop and carry on another day. If you leave in the middle of a race, that race starts again from the grid.</p></div>
        </div>
        <div class="help-go"><button class="big-btn" data-screen="title">Got it</button></div>`;
}

// =====================================================================
//  SETTINGS (each one is remembered on this device)
// =====================================================================
function renderSettings() {
    const line = (label, key, value, list, note = '') => `<div class="set-row"><div class="set-label"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div><div class="opts">${list.map(([v, text]) => `<button class="opt ${value === v ? 'active' : ''}" data-set="${key}" data-val="${v}" aria-pressed="${value === v}">${text}</button>`).join('')}</div></div>`;
    document.getElementById('settings').innerHTML =
        line('Sound', 'sound', FFVSound.on, [[true, '🔊 On'], [false, '🔇 Off']], 'Everything: engines, crowd and menus.') +
        line('Volume', 'volume', FFVSound.volume, [[1, 'Quiet'], [2, 'Medium'], [3, 'Loud']]) +
        line('Engine sound', 'engine', store('raceEngine', true) !== false, [[true, 'On'], [false, 'Off']], 'Off keeps the other sounds but hushes your engine.') +
        line('Speed shown in', 'units', units, [['mph', 'MPH'], ['kmh', 'KM/H']]) +
        line('Driving help', 'help', store('raceHelp', true) !== false, [[true, 'On'], [false, 'Off']], 'Slows you for the corners and nudges you back onto the road.') +
        line('Graphics', 'quality', opts.quality, [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'Auto picks for you. Choose Low if the racing feels jerky.') +
        `<div class="set-row"><div class="set-label"><b>My teams</b><small>Give the teams your own names, colours and logos. They stay on this device only.</small></div><div class="opts"><button class="act-btn" data-screen="teams">🎨 My teams</button></div></div>`;
}
document.getElementById('settings').addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const k = b.dataset.set, v = b.dataset.val, yes = v === 'true';
    if (k === 'sound') { FFVSound.setOn(yes); if (yes) playSound('click'); return; }              // (these two redraw the screen themselves)
    if (k === 'volume') { FFVSound.setVolume(+v); if (!FFVSound.on) FFVSound.setOn(true); playSound('go'); return; }
    if (k === 'engine') storeSet('raceEngine', yes);
    if (k === 'help') storeSet('raceHelp', yes);
    if (k === 'units' && v !== units) { window.toggleUnits(); return; }
    if (k === 'quality') { opts.quality = v; storeSet('raceQuality', v); }
    renderSettings();
});

// =====================================================================
//  CREDITS
// =====================================================================
function renderCredits() {
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    document.getElementById('credits').innerHTML = `
        <p><b>Formula for Victory</b> is a racing game for ages 9 to 12. It is a spin-off of the racing in Supercar Legends. The cars, teams, drivers and sponsors are all made up, and so is every hotel, shop and sign beside the track: this game is not connected with any racing series, team, circuit owner or company.</p>
        <h3>Circuit maps</h3>
        <p>The shape of every circuit is traced from map data © ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}, used under the ${link('https://opendatacommons.org/licenses/odbl/', 'Open Database Licence (ODbL)')}. The data was straightened into a single lap, smoothed a little and saved inside the game. Thank you to everyone who maps the world for OpenStreetMap.</p>
        <h3>3D and fonts</h3>
        <p><b>3D:</b> ${link('https://threejs.org', 'three.js')} © 2010–2025 three.js authors, MIT licence (the full licence is saved inside the game: ${link('lib/three-LICENSE.txt', 'read it')}). <b>Fonts:</b> Orbitron, Russo One and Exo 2, all under the SIL Open Font Licence, saved inside the game.</p>
        <h3>Pictures used on the track</h3>
        <p><b>Textures</b> (asphalt, grass, sand): CC0 textures by Rob Tuytel and Charlotte Baglioni from ${link('https://polyhaven.com', 'Poly Haven')}. <b>Skies:</b> CC0 photographed skies from Poly Haven: <i>Kloofendal 43d Clear (Pure Sky)</i> by Greg Zaal (Monaco), <i>Farm Field (Pure Sky)</i> by Dimitrios Savva and Jarod Guest (Silverstone and Suzuka), <i>Qwantani Late Afternoon (Pure Sky)</i> by Greg Zaal and Jarod Guest (Monza), <i>Kloofendal Overcast (Pure Sky)</i> by Greg Zaal (grey skies and rain), and sunset and night skies by Greg Zaal, Jarod Guest and Dimitrios Savva (the night sky is the one over Las Vegas). The hills, woods, fields and towns on the horizon are painted by the game. <b>Trees:</b> pictures made in Blender from CC0 tree models from Poly Haven by Rob Tuytel, Rico Cilliers, James Ray Cock and Jenelle van Heerden. The cars, grandstands, pit buildings and everything else are drawn in code or were modelled for Supercar Legends.</p>
        <h3>Engine sounds</h3>
        <p>Recordings from Wikimedia Commons, cut into short loops: V8: ${link('https://commons.wikimedia.org/wiki/File:Rover-v8-rr79.ogg', 'recording')} by Collard at English Wikipedia, public domain; V10/V12: ${link('https://commons.wikimedia.org/wiki/File:M70.ogg', 'recording')} by Johannes Maximilian, ${link('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0')}; high revs: ${link('https://commons.wikimedia.org/wiki/File:Ford_Sierra_RS_Cosworth_(tuned,_about_600_hp)_-_engine_and_exhaust_sound_(YouTube_7e3q50wwmNE).opus', 'recording')} by hggi.car (YouTube), ${link('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0')}; start roar: ${link('https://commons.wikimedia.org/wiki/File:Pagani_Zonda_Roadster_F.ogg', 'recording')} by Edvvc, ${link('https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA 3.0')}. The looped versions are shared under the same licences. All the other sounds are made in code.</p>
        <p class="small">Racing here is pretend. On real roads: seat belts on, and leave the racing to the racing drivers.</p>`;
}

// =====================================================================
//  TITLE PICTURE: a single-seater's silhouette and speed stripes, drawn in code
// =====================================================================
// A modern single-seater seen from the side, nose to the right: long low body, the airbox over the driver's head, the
// halo, a shark fin running back to a tall rear wing, a wide front wing, and big wheels. Drawn in units where the car is
// 100 long (about 5.6 m), wheels on y = 0, up negative. It is made up: no real team's car.
function drawCarShape(x, w, col) {
    const u = w / 100;
    x.save(); x.scale(u, u); x.lineJoin = x.lineCap = 'round';
    const body = new Path2D();
    body.moveTo(99.5, -2.4);                                                   // the tip of the nose
    body.bezierCurveTo(92, -3.6, 84, -6.2, 74, -8.6);                          // the nose rising to the cockpit
    body.lineTo(62, -10.6); body.quadraticCurveTo(58, -11.6, 55.5, -11.4);     // the cockpit's side
    body.lineTo(47.5, -11.6);
    body.bezierCurveTo(46.5, -14.5, 45, -17.2, 41.5, -17.4);                   // the airbox over the driver
    body.lineTo(37.5, -17.2);
    body.bezierCurveTo(30, -15.4, 20, -11, 9, -8.2);                           // the engine cover sloping down to the tail
    body.lineTo(5, -7.4); body.lineTo(4, -3.2); body.lineTo(10, -1.6);         // the gearbox and diffuser
    body.lineTo(24, -1.2); body.lineTo(26, -2.6);                              // the floor, under the sidepod
    body.bezierCurveTo(31, -7.6, 52, -8.4, 66, -5.6);                          // the sidepod's lower edge and the undercut
    body.lineTo(72, -3.4); body.lineTo(90, -2.1); body.closePath();
    x.fillStyle = col.body; x.fill(body);
    // the shark fin, the rear wing (two planes on a tall end plate) and its pylon
    x.beginPath(); x.moveTo(40, -16.6); x.lineTo(11, -14.2); x.lineTo(9, -9.5); x.lineTo(26, -12.4); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(1.2, -19.6); x.lineTo(8.6, -19.6); x.lineTo(9.6, -7.2); x.lineTo(1.8, -5.2); x.closePath(); x.fill();
    x.fillStyle = col.wing; x.beginPath(); x.moveTo(0, -19.4); x.lineTo(11, -19.2); x.lineTo(11.4, -17.4); x.lineTo(0.4, -17.2); x.closePath(); x.fill();
    x.fillRect(1, -16.4, 10.2, 1.4);
    // the front wing: end plate and three planes
    x.fillStyle = col.body; x.beginPath(); x.moveTo(98, -6.2); x.lineTo(102.4, -6); x.lineTo(103, -0.7); x.lineTo(97, -0.7); x.closePath(); x.fill();
    x.fillStyle = col.wing; for (const [y0, x0] of [[-1.5, 85], [-2.9, 88], [-4.2, 91.5]]) { x.beginPath(); x.moveTo(x0, y0 - 0.4); x.lineTo(102.5, y0 - 1.0); x.lineTo(102.5, y0 + 0.3); x.lineTo(x0, y0 + 0.6); x.closePath(); x.fill(); }
    // suspension arms
    x.strokeStyle = col.body; x.lineWidth = 0.7;
    for (const [ax, ay, bx, by] of [[70, -5.2, 80, -6.2], [70, -8.4, 80, -7.4], [26, -4.5, 16, -6.4], [24, -9.5, 16, -7.6]]) { x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); }
    // the driver's helmet, and the halo arching over it
    x.fillStyle = col.helmet; x.beginPath(); x.arc(51.2, -13.2, 2.7, Math.PI * 0.95, Math.PI * 2.05); x.fill();
    x.strokeStyle = col.halo; x.lineWidth = 1.1; x.beginPath(); x.moveTo(59.5, -11); x.quadraticCurveTo(57.5, -16.6, 51, -16.8); x.quadraticCurveTo(47, -16.8, 46, -14.8); x.stroke();
    x.lineWidth = 0.9; x.beginPath(); x.moveTo(57.6, -11.2); x.lineTo(56.2, -15.6); x.stroke();
    // a thin light along the top of the body, and a coloured stripe along the side
    x.strokeStyle = col.shine; x.lineWidth = 0.45;
    x.beginPath(); x.moveTo(98.5, -2.9); x.bezierCurveTo(92, -4, 84, -6.4, 74, -8.8); x.lineTo(62, -10.8); x.stroke();
    x.beginPath(); x.moveTo(44.6, -17.2); x.bezierCurveTo(30, -15.4, 20, -11.2, 9.5, -8.6); x.stroke();
    x.strokeStyle = col.stripe; x.lineWidth = 0.9; x.beginPath(); x.moveTo(94, -3.2); x.bezierCurveTo(80, -5.4, 60, -9.2, 30, -9.4); x.stroke();
    // the wheels: big fat tyres with a rim inside each one
    for (const [cx, r] of [[80.5, 6.5], [16, 6.9]]) {
        x.fillStyle = col.tyre; x.beginPath(); x.arc(cx, -r, r, 0, Math.PI * 2); x.fill();
        x.strokeStyle = col.rim; x.lineWidth = 0.8; x.beginPath(); x.arc(cx, -r, r * 0.62, 0, Math.PI * 2); x.stroke();
        x.fillStyle = col.rim; x.beginPath(); x.arc(cx, -r, r * 0.16, 0, Math.PI * 2); x.fill();
        x.strokeStyle = col.shine; x.lineWidth = 0.5; x.beginPath(); x.arc(cx, -r, r - 0.4, Math.PI * 1.1, Math.PI * 1.6); x.stroke();
    }
    x.restore();
}
function drawTitleArt() {
    const c = document.getElementById('title-art'), wrap = c.parentElement;
    // The car stands along the bottom of the screen, under the buttons, and room is kept for it there. On a screen too
    // short for that (a phone on its side) it is drawn faintly behind everything instead.
    const roomy = window.innerHeight >= 600, carW = Math.min(wrap.clientWidth * 0.86, roomy ? 600 : 520);
    wrap.style.paddingBottom = roomy ? Math.round(carW * 0.2 + 34) + 'px' : '';
    const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    // a red glow behind the logo, fading right out before the edges of the picture
    const g = x.createRadialGradient(0, 0, 0.02, 0, 0, 1); g.addColorStop(0, 'rgba(225,6,0,.24)'); g.addColorStop(1, 'rgba(225,6,0,0)');
    x.save(); x.translate(w / 2, h * 0.42); x.scale(w / 2, h * 0.58); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
    const cw = carW, cx0 = (w - cw) / 2, ground = h - 12;
    // speed streaks streaming back from the car (behind it, to the left)
    x.save(); x.translate(0, ground);
    ['rgba(225,6,0,.42)', 'rgba(255,179,0,.32)', 'rgba(0,229,255,.24)'].forEach((col, i) => {
        const y = -cw * (0.035 + i * 0.045), len = cw * (0.75 - i * 0.12), gr = x.createLinearGradient(cx0 + cw * 0.3 - len, 0, cx0 + cw * 0.3, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col); x.fillStyle = gr; x.fillRect(cx0 + cw * 0.3 - len, y, len, Math.max(3, cw * 0.009));
    });
    x.restore();
    // a soft shadow on the ground under the car
    const sh = x.createRadialGradient(cx0 + cw * 0.5, ground, 4, cx0 + cw * 0.5, ground, cw * 0.5); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.translate(0, ground); x.scale(1, 0.06); x.fillStyle = sh; x.fillRect(cx0 - cw * 0.1, -cw * 0.5, cw * 1.2, cw); x.restore();
    // (drawn solid on a layer of its own, then laid over the background see-through, so overlapping parts don't show seams)
    const layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height;
    const lx = layer.getContext('2d'); lx.scale(dpr, dpr); lx.translate(cx0, ground);
    drawCarShape(lx, cw, { body: '#59545a', wing: '#7a777e', helmet: '#c98a00', halo: '#8a8890', shine: '#c9ccd2', stripe: '#e10600', tyre: '#050608', rim: '#6d6c72' });
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = roomy ? 0.7 : 0.22; x.drawImage(layer, 0, 0); x.restore();
}
window.addEventListener('resize', drawTitleArt);
renderTitle(); if (document.fonts) document.fonts.ready.then(drawTitleArt);
// a teams.csv has been loaded: its first team becomes the one you drive for (you can still choose another)
document.addEventListener('ffv-first-team', () => { opts.team = 0; storeSet('team', 0); if (typeof champDraft !== 'undefined') { champDraft.team = 0; storeSet('champSetup', champDraft); } });
// a family's own team names or logos have changed (or have just been read): redraw whichever screen shows them
document.addEventListener('ffv-teams', () => { if (racing()) return; if (current === 'setup') renderSetup(); if (current === 'champ') renderChamp('keep'); if (current === 'cards' && window.FFVCards) window.FFVCards.teamsChanged(); });

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
