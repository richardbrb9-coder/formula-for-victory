// Formula for Victory: the championship's screens. Starting a season, the season so far, what happened after each race
// (the result, the points and the tables, with arrows for who moved up and down), and the champion's celebration.
// The rules and the saving are in season.js; the teams and drivers are in teams.js. This file uses app.js's helpers.
'use strict';

const S = FFV.season;
const ordinalWord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const WEATHER_ICON = { sunny: '☀️', cloudy: '☁️', rain: '🌧️' };
// what a new season starts with: the choices made last time, or your quick-race team on Easy
const champDraft = (() => {
    const d = store('champSetup', {}) || {};
    return { team: Number.isInteger(d.team) && TEAMS[d.team] ? d.team : opts.team, laps: S.LAPS.includes(d.laps) ? d.laps : 3, difficulty: S.DIFFICULTIES.includes(d.difficulty) ? d.difficulty : 'easy', quali: d.quali === true };
})();
let champTab = 'drivers', champFresh = false, champSure = false;   // which table is showing; "start a new season" was asked for; ... and asked for twice
let champCircuits = null;                                          // the list of circuits (for their names and flags)
let champShown = '';                                               // which of the screens is up: 'setup', 'hub', 'after' or 'final'

// every driver by name; yours carries a small YOU tag (youOf gives the tag's HTML, or nothing)
const nameOf = (s, id) => FFV.teamById(id).driver;
const youOf = (s, id) => id === s.team ? FFV.youTag : '';
const dot = id => FFV.badge(id);   // (the team's colour dot, or a family's own logo for it: see myteams.js)
const circuitOf = id => (champCircuits || []).find(c => c.id === id) || { id, name: id, flag: '', country: '' };
const placeClass = p => p <= 3 ? 'pl' + p : '';
// (a night race shows the moon, whatever the weather: 'time' is in the list of circuits)
const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'], numWord = n => NUM_WORDS[n] || String(n), cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const weatherFor = (s, i) => { const info = S.roundInfo(s, i), c = circuitOf(s.rounds[i]); return c.time === 'night' ? '🌙' : WEATHER_ICON[(info && info.weather) || 'sunny']; };

// ---------- the tables ----------
function moveCell(r, show) {
    if (!show || !r.move) return `<td class="mv">${show ? '<span class="same" aria-label="no change">–</span>' : ''}</td>`;
    return r.move > 0 ? `<td class="mv"><span class="up" aria-label="up ${r.move}">▲${r.move}</span></td>` : `<td class="mv"><span class="down" aria-label="down ${-r.move}">▼${-r.move}</span></td>`;
}
function standingsTable(s, kind, { moves = false } = {}) {
    const rows = S.standingsWithMoves(s), n = s.results.length, showMoves = moves && n > 1;
    const head = kind === 'teams' ? 'Team' : 'Driver';
    const body = rows.map(r => {
        const t = FFV.teamById(r.id), who = kind === 'teams'
            ? `${escapeHtml(t.team)}${youOf(s, r.id)} <small>${escapeHtml(nameOf(s, r.id))}</small>`
            : `${escapeHtml(nameOf(s, r.id))}${youOf(s, r.id)} <small>${escapeHtml(t.team)}</small>`;
        const places = s.rounds.map((_, i) => `<td class="rd ${r.places[i] ? placeClass(r.places[i]) : ''}">${r.places[i] || '·'}</td>`).join('');
        return `<tr class="${r.you ? 'me' : ''}"><td class="ps">${r.pos}</td>${moveCell(r, showMoves)}<td class="nm">${dot(r.id)}${who}</td>${places}<td class="gn">${moves && n ? (r.gained ? '+' + r.gained : '') : ''}</td><td class="pt">${r.pts}</td></tr>`;
    }).join('');
    return `<table class="champ-table season-table"><thead><tr><th></th><th></th><th>${head}</th>${s.rounds.map((c, i) => `<th class="rd" title="${escapeHtml(circuitOf(c).name)}">R${i + 1}</th>`).join('')}<th class="gn"></th><th class="pt">Points</th></tr></thead><tbody>${body}</tbody></table>`;
}
function tablesPanel(s, opt) {
    const tab = (k, text) => `<button class="opt ${champTab === k ? 'active' : ''}" data-champ="tab" data-val="${k}" aria-pressed="${champTab === k}">${text}</button>`;
    return `<div class="panel champ-tables"><div class="tabs"><h2>${champTab === 'teams' ? "Teams' table" : "Drivers' table"}</h2><div class="opts">${tab('drivers', 'Drivers')}${tab('teams', 'Teams')}</div></div>
        ${standingsTable(s, champTab, opt)}
        <p class="small table-note">R1 to R${s.rounds.length} show where each ${champTab === 'teams' ? 'team' : 'driver'} finished in each race.${opt && opt.moves && s.results.length > 1 ? ' <b class="up">▲</b> up and <b class="down">▼</b> down since the race before.' : ''}</p></div>`;
}
// the races: what happened in the ones that are done, and which is next
function calendar(s) {
    const next = s.results.length;
    return `<ol class="cal">${s.rounds.map((id, i) => {
        const c = circuitOf(id), r = s.results[i];
        let right = `<span class="cal-wx">${weatherFor(s, i)}</span>`, sub = escapeHtml(c.country);
        if (r) {
            const mine = r.order.indexOf(s.team) + 1, pts = S.pointsFor(mine - 1);
            right = `<span class="cal-res ${placeClass(mine)}"><b>${ordinalWord(mine)}</b><small>${pts ? '+' + pts : '0'} pts</small></span>`;
            sub = mine === 1 ? 'You won!' : `Won by ${escapeHtml(nameOf(s, r.order[0]))}`;
        } else if (i === next) right = `<span class="cal-next">NEXT</span>` + right;
        return `<li class="${r ? 'done' : i === next ? 'next' : ''}"><span class="cal-n">${i + 1}</span><span class="cal-name"><b>${c.flag} ${escapeHtml(c.name)}</b><small>${sub}</small></span>${right}</li>`;
    }).join('')}</ol>`;
}
const pointsKey = () => `<div class="points-row">${S.POINTS.map((p, i) => `<span class="pt ${i < 3 ? 'p' + (i + 1) : ''}"><small>${ordinalWord(i + 1)}</small><b>${p}</b></span>`).join('')}</div>`;
// one line about where you stand
function standingLine(s) {
    const rows = S.standings(s), me = rows.find(r => r.you), lead = rows[0], second = rows[1];
    if (!s.results.length) return 'Nobody has any points yet.';
    if (me.pos === 1) { const gap = me.pts - second.pts; return gap ? `You lead the championship by ${gap} point${gap === 1 ? '' : 's'}.` : `You lead the championship, level on points with ${escapeHtml(nameOf(s, second.id))}.`; }
    const gap = lead.pts - me.pts;
    return `You are ${ordinalWord(me.pos)} with ${me.pts} point${me.pts === 1 ? '' : 's'}, ${gap ? `${gap} behind` : 'level with'} ${escapeHtml(nameOf(s, lead.id))}.`;
}

// ---------- the screens ----------
// view: 'after' (straight after a race), 'final' (the celebration), or nothing: wherever the season has got to
function renderChamp(view) {
    const el = document.getElementById('champ');
    if (!champCircuits) { el.innerHTML = '<p class="small">Getting the season ready…</p>'; loadCircuits().then(list => { champCircuits = list; if (current === 'champ') renderChamp(view); }).catch(() => { el.innerHTML = '<p class="small">The season could not load. Check your connection and try again.</p>'; }); return; }
    const s = S.load();
    if (view !== 'keep') champSure = false;
    if (!s || champFresh) { stopParty(); champShown = 'setup'; return renderChampSetup(el, s); }
    if (view === 'after' && s.results.length) { stopParty(); champShown = 'after'; return renderChampAfter(el, s); }
    // (a finished season that has never had its party gets it now, however you arrive here)
    if (S.finished(s)) { const again = champShown === 'final'; champShown = 'final'; return renderChampFinal(el, s, view === 'final' || (!s.celebrated && !again)); }
    stopParty(); champShown = 'hub'; renderChampHub(el, s);
}
function renderChampSetup(el, old) {
    const d = champDraft, t = TEAMS[d.team];
    const row = (key, list) => `<div class="opts">${list.map(([v, text]) => `<button class="opt ${d[key] === v ? 'active' : ''}" data-draft="${key}" data-val="${v}" aria-pressed="${d[key] === v}">${text}</button>`).join('')}</div>`;
    const tmp = S.newSeason({ team: t.id, laps: d.laps, difficulty: d.difficulty, quali: d.quali });
    el.innerHTML = `
        <div class="champ-head"><div><h1><span class="kicker">Championship</span>A new season</h1>
            <p class="subtitle">${cap(numWord(tmp.rounds.length))} races, one on each circuit, against the same ten drivers all season. Score points in every race: most points wins the trophy.</p></div></div>
        <div class="champ-grid">
            <div class="panel">
                <p class="b-label" style="margin-top:0">Your team for the season</p>
                <div class="team-dots">${teamDots(d.team, 'draft')}</div>
                <p class="team-name">${teamLine(d.team)}</p>
                <p class="b-label">Laps in each race</p>
                ${row('laps', [[2, '2 laps'], [3, '3 laps'], [5, '5 laps 🔧']])}
                ${d.laps === 5 ? '<p class="small opt-note">5 laps: the pit box is open from lap 2, and the rivals pit too.</p>' : ''}
                <p class="b-label">Rivals</p>
                ${row('difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']])}
                <p class="b-label">Qualifying before each race</p>
                ${row('quali', [[false, 'Off'], [true, '⏱ On']])}
                <p class="small opt-note">${d.quali ? 'On: before every race you drive one flying lap on your own. The quicker your lap, the nearer the front you start.' : 'Off: you start every race at the back of the grid.'}</p>
                <div class="mode-btns"><button class="big-btn" data-champ="start">🏁 Start the season</button>${old ? '<button class="act-btn ghost" data-champ="keep">Keep my old season</button>' : ''}</div>
                <p class="small" style="margin-top:10px">${old ? 'Starting a new season wipes the old one.' : 'Your season is saved after every race, so you can stop and carry on another day.'}</p>
            </div>
            <div class="panel">
                <h2>The ${numWord(tmp.rounds.length)} races</h2>
                ${calendar(tmp)}
                <h2 class="gap">Points for each race</h2>
                ${pointsKey()}
            </div>
        </div>`;
}
function renderChampHub(el, s) {
    const n = s.results.length, c = circuitOf(s.rounds[n]), g = s.grid, gp = g ? g.order.indexOf(s.team) + 1 : 0;
    // with qualifying: either it is still to do, or its grid is saved and the race starts from it
    const go = !s.quali ? `🏁 Race at ${escapeHtml(c.name)}` : g ? `🏁 Race at ${escapeHtml(c.name)}: you start ${ordinalWord(gp)}` : `⏱ Qualifying at ${escapeHtml(c.name)}`;
    const qnote = !s.quali ? '' : g ? ` Qualifying is done: you start ${gp === 1 ? 'on pole position' : ordinalWord(gp)}${g.skipped ? ' (you skipped it)' : g.time != null ? ` with a lap of ${fmtTime(g.time)}` : ''}.` : ' Qualifying comes first: one flying lap for your place on the grid.';
    el.innerHTML = `
        <div class="champ-head"><div><h1><span class="kicker">Championship · the season so far</span>Race ${n + 1} of ${s.rounds.length}: ${c.flag} ${escapeHtml(c.name)}</h1>
            <p class="subtitle">${standingLine(s)} ${s.laps} laps a race, ${s.difficulty} rivals, driving for ${escapeHtml(FFV.teamById(s.team).team)}.${qnote}</p></div>
            <div class="champ-go"><button class="big-btn" data-champ="race">${go}</button></div></div>
        <div class="champ-grid">
            <div class="panel"><h2>The ${numWord(s.rounds.length)} races</h2>${calendar(s)}<h2 class="gap">Points for each race</h2>${pointsKey()}</div>
            ${tablesPanel(s, { moves: false })}
        </div>
        <div class="champ-foot"><button class="link-btn" data-champ="new">${champSure ? 'Tap again to wipe this season and start a new one' : 'Start a new season instead'}</button></div>`;
}
function renderChampAfter(el, s) {
    const n = s.results.length, r = s.results[n - 1], c = circuitOf(r.circuit), mine = r.order.indexOf(s.team) + 1, pts = S.pointsFor(mine - 1), done = S.finished(s);
    const nextC = done ? null : circuitOf(s.rounds[n]);
    const result = r.order.map((id, i) => `<tr class="${id === s.team ? 'me' : ''}"><td class="ps">${i + 1}</td><td class="nm">${dot(id)}${escapeHtml(nameOf(s, id))}${youOf(s, id)} <small>${escapeHtml(FFV.teamById(id).team)}</small></td><td class="pt gain">${S.pointsFor(i) ? '+' + S.pointsFor(i) : ''}</td></tr>`).join('');
    el.innerHTML = `
        <div class="champ-head"><div><h1><span class="kicker">Race ${n} of ${s.rounds.length} · ${c.flag} ${escapeHtml(c.name)}</span>${mine === 1 ? 'You won the race!' : `You finished ${ordinalWord(mine)}`} <span class="gain-badge">${pts ? '+' + pts : '0'} point${pts === 1 ? '' : 's'}</span></h1>
            <p class="subtitle">${standingLine(s)}</p></div>
            <div class="champ-go">${done ? '<button class="big-btn gold" data-champ="final">🏆 See the champion</button>' : `<button class="big-btn" data-champ="race">${s.quali ? 'Next: qualifying at' : 'Next race:'} ${escapeHtml(nextC.name)} ›</button><button class="act-btn ghost" data-champ="hub">Season so far</button>`}</div></div>
        <div class="champ-grid">
            <div class="panel"><h2>Race result</h2><table class="champ-table season-table"><thead><tr><th></th><th>Driver</th><th class="pt">Points</th></tr></thead><tbody>${result}</tbody></table></div>
            ${tablesPanel(s, { moves: true })}
        </div>`;
}
function renderChampFinal(el, s, celebrate) {
    const rows = S.standings(s), me = rows.find(r => r.you), champ = rows[0], won = me.pos === 1, t = FFV.teamById(champ.id);
    el.innerHTML = `
        <div class="champ-final ${won ? 'won' : ''}">
            <div class="trophy-wrap">${trophy(t.paint, t.stripe)}</div>
            <div class="final-text"><span class="kicker">The season is over</span>
                <h1>${won ? 'You are the champion!' : `${escapeHtml(nameOf(s, champ.id))} is the champion`}</h1>
                <p class="final-pos">${won ? `${me.pts} points, ${me.wins} win${me.wins === 1 ? '' : 's'}, driving for ${escapeHtml(t.team)}. What a season!` : `You finished <b>${ordinalWord(me.pos)}</b> in the championship with <b>${me.pts}</b> point${me.pts === 1 ? '' : 's'}${me.pos <= 3 ? ': on the season’s podium!' : '.'} ${escapeHtml(t.team)} take the trophy.`}</p>
                <div class="rr-actions"><button class="big-btn" data-champ="new-now">🏁 Start a new season</button><button class="act-btn ghost" data-champ="party">🎉 Celebrate again</button></div>
            </div>
        </div>
        <div class="champ-grid">
            <div class="panel"><h2>Your season</h2>${calendar(s)}</div>
            ${tablesPanel(s, { moves: false })}
        </div>`;
    if (celebrate) celebrateSeason(s, me.pos);
}
// the champion's party: the fanfare (or a cheer, if someone else won) and confetti
function celebrateSeason(s, pos) {
    playSound(pos === 1 ? 'fanfare' : pos <= 3 ? 'bigcheer' : 'cheer');
    startParty(pos === 1 ? 9 : pos <= 3 ? 5 : 3, pos === 1 ? 170 : 90);
    if (!s.celebrated) { s.celebrated = true; S.save(s); if (pos === 1) FFV.myStats.add('titles'); }   // (a title for your own Driver Card, counted once)
    if (pos === 1) FFV.trophies.award('champion');   // (given once: see trophies.js)
    // remember the best you have ever done at each level
    const best = store('champBest', {}) || {}, old = best[s.difficulty];
    if (!Number.isInteger(old) || pos < old) { best[s.difficulty] = pos; storeSet('champBest', best); }
}

// a gold cup, drawn in code, with a ribbon in the champion team's colours
function trophy(paint, stripe) {
    return `<svg class="trophy" viewBox="0 0 200 220" role="img" aria-label="The championship trophy">
        <defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".3" stop-color="#ffd75e"/><stop offset=".5" stop-color="#fff3b0"/><stop offset=".72" stop-color="#f0b90b"/><stop offset="1" stop-color="#9a6b00"/></linearGradient>
        <linearGradient id="tb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a3f4a"/><stop offset="1" stop-color="#15171b"/></linearGradient></defs>
        <path d="M84 118 L102 124 L60 210 L55 195 L40 200 Z" fill="${paint}" stroke="#15171b" stroke-width="1.5"/><path d="M116 118 L98 124 L140 210 L145 195 L160 200 Z" fill="${stripe}" stroke="#15171b" stroke-width="1.5"/>
        <path d="M52 34 C20 30 14 74 50 92 L56 82 C34 70 36 46 54 46 Z M148 34 C180 30 186 74 150 92 L144 82 C166 70 164 46 146 46 Z" fill="url(#tg)"/>
        <path d="M46 22 H154 C154 78 138 112 108 122 V150 H92 V122 C62 112 46 78 46 22 Z" fill="url(#tg)"/>
        <ellipse cx="100" cy="22" rx="54" ry="8" fill="#fff3b0"/><ellipse cx="100" cy="23" rx="46" ry="5" fill="#b8860b"/>
        <path d="M72 150 H128 L136 168 H64 Z" fill="url(#tg)"/>
        <rect x="52" y="168" width="96" height="34" rx="3" fill="url(#tb)"/><rect x="62" y="177" width="76" height="16" rx="2" fill="#ffd75e"/>
        <text x="100" y="189" text-anchor="middle" font-family="Orbitron, Arial Black, sans-serif" font-weight="900" font-size="9" fill="#15171b">CHAMPION</text>
        <path d="M100 44 l8.5 17.5 19 2.6 -13.8 13.2 3.4 19 -17.1 -9.2 -17.1 9.2 3.4 -19 -13.8 -13.2 19 -2.6 Z" fill="#fff8d6" opacity=".9"/>
    </svg>`;
}

// ---------- confetti (a see-through layer over the page; never during a race) ----------
let partyNow = null;
function startParty(seconds, bits) {
    stopParty();
    const cv = document.getElementById('party'); if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight, x = cv.getContext('2d');
    cv.width = w * dpr; cv.height = h * dpr; cv.hidden = false;
    const colours = ['#E10600', '#FFB300', '#00E5FF', '#C6FF00', '#F4F6F8', '#D81B60', '#7E57C2'];
    const P = Array.from({ length: bits }, (_, i) => ({ x: Math.random() * w, y: -Math.random() * h * 1.2, vx: (Math.random() - 0.5) * 70, vy: 110 + Math.random() * 170, a: Math.random() * 6, s: 6 + Math.random() * 7, c: colours[i % colours.length] }));
    partyNow = { t: 0, last: performance.now(), raf: 0 };
    const tick = now => {
        if (!partyNow) return;
        const dt = Math.min(0.05, (now - partyNow.last) / 1000); partyNow.last = now; partyNow.t += dt;
        x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
        if (partyNow.t > seconds) { stopParty(); return; }
        x.globalAlpha = Math.min(1, (seconds - partyNow.t) / 1.5);
        for (const p of P) {
            p.x += (p.vx + Math.sin(partyNow.t * 3 + p.a) * 40) * dt; p.y += p.vy * dt; p.a += dt * 7;
            if (p.y > h + 20 && partyNow.t < seconds - 3) { p.y = -20; p.x = Math.random() * w; }
            x.fillStyle = p.c; x.fillRect(p.x, p.y, p.s, p.s * 0.55 * Math.abs(Math.cos(p.a)) + 2);
        }
        partyNow.raf = requestAnimationFrame(tick);
    };
    partyNow.raf = requestAnimationFrame(tick);
}
function stopParty() {
    if (partyNow) { cancelAnimationFrame(partyNow.raf); partyNow = null; }
    const cv = document.getElementById('party'); if (cv && !cv.hidden) { cv.hidden = true; cv.width = cv.height = 1; }
}
// leaving the championship's screens: the party stops, and so does the fanfare
window.leaveChamp = () => { stopParty(); stopLongSounds(); champFresh = false; champSure = false; champShown = ''; };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopParty(); });

// ---------- starting a race in the season ----------
function champRace() {
    const s = S.load(); if (!s || S.finished(s)) { renderChamp(); return; }
    const round = s.results.length, info = S.roundInfo(s, round), entry = circuitOf(s.rounds[round]);
    if (!entry.load) { toast('That circuit could not be found.', 4000); return; }
    loadCircuit(entry).then(data => {
        const mine = FFV.teamIndex(s.team);
        startRace('race', {
            // qualifying, if this season has it: unless its grid for this race is already saved (you left after qualifying,
            // or part-way through the race), in which case the race starts straight from that grid
            quali: s.quali && !s.grid, grid: s.quali && s.grid ? s.grid.order.map(FFV.teamIndex) : null,
            onGrid: (order, info) => { const now = S.load(); if (now && S.setGrid(now, round, order.map(i => TEAMS[i] && TEAMS[i].id), info || {})) S.save(now); },
            circuit: data, laps: s.laps, difficulty: s.difficulty, weather: (info && info.weather) || 'sunny', team: mine,
            champ: {
                round: round + 1, of: s.rounds.length, points: S.POINTS, field: S.grid(s).map(FFV.teamIndex),
                // at the chequered flag: write the finishing order into the season and save it, there and then
                onFinish: rows => {
                    const now = S.load(); if (!now) return;
                    const me = rows.find(r => r.team === mine);
                    if (S.record(now, round, rows.map(r => TEAMS[r.team] && TEAMS[r.team].id), { time: me && me.total, best: me && me.best })) S.save(now);
                }
            },
            // back from the race: after the flag, to the result and the tables; given up part-way, to the season so far
            onExit: finished => show('champ', finished ? 'after' : undefined)
        });
    }).catch(err => { console.error(err); toast('The race could not load. Check your connection and try again.', 5000); });
}
document.getElementById('champ').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.draft) {
        const k = b.dataset.draft; champDraft[k] = k === 'difficulty' ? b.dataset.val : k === 'quali' ? b.dataset.val === 'true' : +b.dataset.val;
        storeSet('champSetup', champDraft); renderChamp(); return;
    }
    switch (b.dataset.champ) {
        case 'tab': champTab = b.dataset.val === 'teams' ? 'teams' : 'drivers'; { const y = window.scrollY; renderChamp(champShown === 'after' ? 'after' : undefined); window.scrollTo(0, y); } break;
        case 'start': { const s = S.newSeason({ team: TEAMS[champDraft.team].id, laps: champDraft.laps, difficulty: champDraft.difficulty, quali: champDraft.quali }); S.save(s); champFresh = false; champTab = 'drivers'; renderChamp(); window.scrollTo(0, 0); break; }
        case 'keep': champFresh = false; renderChamp(); break;
        case 'new': if (champSure) { champFresh = true; champSure = false; renderChamp(); window.scrollTo(0, 0); } else { champSure = true; renderChamp('keep'); } break;
        case 'new-now': champFresh = true; renderChamp(); window.scrollTo(0, 0); break;
        case 'hub': renderChamp(); window.scrollTo(0, 0); break;
        case 'final': renderChamp('final'); window.scrollTo(0, 0); break;
        case 'party': { const s = S.load(); if (s && S.finished(s)) { stopLongSounds(); celebrateSeason(s, S.standings(s).find(r => r.you).pos); } break; }
        case 'race': champRace(); break;
    }
});
