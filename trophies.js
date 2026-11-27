// Formula for Victory: the trophy cabinet. Trophies to win, kept on this device only, under 'ffv_trophies', as
// { id: when it was won (the clock's milliseconds) }. A trophy, once won, is never taken away.
//
// Nothing here knows how many circuits there are, or their names. The "win at ..." trophies (one for each circuit) and
// the "win on every circuit" trophy are made from the list of circuits (circuits/index.js), which app.js hands over
// with FFV.trophies.setCircuits(list) as soon as it has loaded. Add a circuit to that list and it gets its trophy, and
// the world tour needs it too. (Trophies already won are kept, whatever the list says later.)
//
//   FFV.trophies.award('first_win')   gives a trophy (once): saves it, slides in a message and plays a short fanfare
//   FFV.trophies.has(id)              have you got it?
//   renderTrophies()                  fills the Trophies screen (it uses app.js's helpers)
//
// Who gives them: race.js (finishing, winning, pit stops, boosts, pole, the time trial), championship.js (the season)
// and cards.js (Driver Cards). Every picture is drawn here in code: a cup, a medal, a shield or a star, in gold, silver
// or bronze, with a small sign on it. Nothing is downloaded.
'use strict';
(function () {
    const FFV = window.FFV = window.FFV || {}, KEY = 'ffv_trophies';
    // id (never change one: it is how a won trophy is remembered), name, how to win it, shape, metal, the sign on it
    let circuits = [];   // the circuits that can be raced on: [{ id, name, flag }], from circuits/index.js (see setCircuits)
    const FIRST = [
        { id: 'first_race', name: 'First flag', how: 'Finish your first race.', shape: 'medal', metal: 'bronze', sign: '🏁' },
        { id: 'first_win', name: 'Winner!', how: 'Win a race.', shape: 'cup', metal: 'silver', sign: '1' },
        { id: 'last_first', name: 'Back to front', how: 'Start last on the grid and win the race.', shape: 'cup', metal: 'gold', sign: '⏫' }
    ];
    const REST = [
        { id: 'grand_tour', name: 'World tour', how: 'Win a race on every circuit.', shape: 'cup', metal: 'gold', sign: '🌍' },
        { id: 'champion', name: 'Champion', how: 'Win the championship.', shape: 'cup', metal: 'gold', sign: '👑' },
        { id: 'pole', name: 'Pole position', how: 'Set the quickest lap in qualifying.', shape: 'medal', metal: 'silver', sign: '⏱' },
        { id: 'pit_fast', name: 'Lightning crew', how: 'Do a pit stop in under 3 seconds.', shape: 'star', metal: 'gold', sign: '🔧' },
        { id: 'clean', name: 'Clean racer', how: 'Finish a race without a crash.', shape: 'star', metal: 'silver', sign: '✨' },
        { id: 'boost_win', name: 'Full boost', how: 'Use all 3 boosts in a race, and still win it.', shape: 'star', metal: 'silver', sign: '⚡' },
        { id: 'hard_win', name: 'Tough cookie', how: 'Win a race against Hard rivals.', shape: 'cup', metal: 'gold', sign: '💪' },
        { id: 'night', name: 'Night rider', how: 'Finish a race at night.', shape: 'medal', metal: 'bronze', sign: '🌙' },
        { id: 'rain', name: 'Rain master', how: 'Finish a race in the rain.', shape: 'medal', metal: 'bronze', sign: '🌧️' },
        { id: 'trial_record', name: 'Record breaker', how: 'Beat your own best lap in a time trial.', shape: 'star', metal: 'silver', sign: '👻' },
        { id: 'cards_win', name: 'Card player', how: 'Win a game of Driver Cards.', shape: 'medal', metal: 'bronze', sign: '🃏' },
        { id: 'cards_all', name: 'Full pack', how: 'Win every single card in a game of Driver Cards.', shape: 'cup', metal: 'gold', sign: '🎴' }
    ];
    // a circuit's own trophy (its id is 'win_' and the circuit's id: never change a circuit's id)
    const WIN = /^win_[a-z0-9_-]{1,24}$/;
    const winTrophy = c => ({ id: 'win_' + c.id, name: `${c.name} winner`, how: `Win a race at ${c.name}.`, shape: 'shield', metal: 'silver', sign: c.flag || '🏁' });
    // every trophy there is, in the cabinet's order
    const list = () => [...FIRST, ...circuits.map(winTrophy), ...REST];
    function setCircuits(all) {
        circuits = (Array.isArray(all) ? all : []).filter(c => c && !c.soon && typeof c.id === 'string' && WIN.test('win_' + c.id)).map(c => ({ id: c.id, name: String(c.name || c.id), flag: typeof c.flag === 'string' ? c.flag : '' }));
        // (someone who had already won at every circuit there is gets the world tour, if they somehow have not)
        const won = read(); if (circuits.length && circuits.every(c => won['win_' + c.id]) && !won.grand_tour) award('grand_tour');
    }
    const find = id => list().find(t => t.id === id) || null;
    function read() {
        let v = null; try { v = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none yet, or unreadable */ }
        const out = {}; if (v && typeof v === 'object' && !Array.isArray(v)) for (const id of Object.keys(v)) { const at = v[id]; if ((find(id) || WIN.test(id)) && (at === true || (Number.isFinite(at) && at > 0))) out[id] = at === true ? 1 : at; }   // (a circuit's trophy is kept even before the list of circuits has loaded)
        return out;
    }
    const has = id => !!read()[id];
    function award(id) {
        const t = find(id); if (!t) return false;
        const won = read(); if (won[id]) return false;
        won[id] = Date.now();
        try { localStorage.setItem(KEY, JSON.stringify(won)); } catch (e) { /* storage unavailable: still shown this once */ }
        announce(t);
        // (winning at the last circuit on the list brings the world tour with it)
        if (WIN.test(id) && circuits.length && circuits.every(c => won['win_' + c.id])) award('grand_tour');
        return true;
    }

    // ---------- the pictures ----------
    const METAL = { gold: ['#8a5d00', '#ffd75e', '#fff3b0', '#f0b90b'], silver: ['#5f6b7a', '#dfe5ec', '#ffffff', '#a9b4c2'], bronze: ['#6b3d14', '#e0a36a', '#ffd9b0', '#b87333'], locked: ['#2c313a', '#4a5160', '#5b6372', '#3a404b'] };
    const SHAPES = {
        cup: '<path d="M30 16 C10 14 8 42 31 52 L35 45 C22 39 23 24 33 24 Z M90 16 C110 14 112 42 89 52 L85 45 C98 39 97 24 87 24 Z" fill="url(#G)"/><path d="M27 10 H93 C93 46 83 66 66 72 V88 H54 V72 C37 66 27 46 27 10 Z" fill="url(#G)"/><ellipse cx="60" cy="10" rx="33" ry="5" fill="@2"/><path d="M42 88 H78 L84 100 H36 Z" fill="url(#G)"/><rect x="30" y="100" width="60" height="12" rx="2" fill="#15171b"/>',
        medal: '<path d="M38 4 H56 L66 42 H48 Z" fill="#E10600"/><path d="M82 4 H64 L54 42 H72 Z" fill="#1E3A8A"/><circle cx="60" cy="74" r="38" fill="url(#G)"/><circle cx="60" cy="74" r="30" fill="none" stroke="@0" stroke-width="2.5" opacity=".55"/>',
        shield: '<path d="M60 6 L104 20 V58 C104 86 84 104 60 114 C36 104 16 86 16 58 V20 Z" fill="url(#G)"/><path d="M60 16 L95 27 V58 C95 80 79 95 60 103 C41 95 25 80 25 58 V27 Z" fill="none" stroke="@0" stroke-width="2.5" opacity=".5"/>',
        star: '<path d="M60 4 L74.7 40.8 L114.2 43.4 L83.8 68.7 L93.5 107.1 L60 86 L26.5 107.1 L36.2 68.7 L5.8 43.4 L45.3 40.8 Z" fill="url(#G)" stroke="@0" stroke-width="2" stroke-linejoin="round"/>'
    };
    const SIGN_AT = { cup: [60, 46, 30], medal: [60, 76, 34], shield: [60, 62, 36], star: [60, 64, 28] };
    let artN = 0;
    function art(t, locked = false) {
        const c = METAL[locked ? 'locked' : t.metal] || METAL.bronze, g = 'tr' + (++artN), [x, y, size] = SIGN_AT[t.shape] || SIGN_AT.cup;
        const body = (SHAPES[t.shape] || SHAPES.cup).replace(/url\(#G\)/g, `url(#${g})`).replace(/@0/g, c[0]).replace(/@2/g, c[2]);
        const sign = locked ? '🔒' : t.sign, plain = !locked && /^[0-9A-Z]$/.test(sign);   // (a plain number is drawn in the game's own lettering)
        return `<svg class="trophy-art ${locked ? 'locked' : ''}" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".32" stop-color="${c[1]}"/><stop offset=".52" stop-color="${c[2]}"/><stop offset=".76" stop-color="${c[3]}"/><stop offset="1" stop-color="${c[0]}"/></linearGradient></defs>
            ${body}<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${plain ? size * 1.15 : size}" ${plain ? 'font-family="Orbitron, Arial Black, sans-serif" font-weight="900" fill="#15171b"' : ''} ${locked ? 'opacity=".75"' : ''}>${sign}</text></svg>`;
    }

    // ---------- "Trophy won!": a message that slides in at the top (over the racing screen too), one at a time ----------
    const queue = []; let showing = false;
    function announce(t) { queue.push(t); if (!showing) next(); }
    function next() {
        const t = queue.shift(); if (!t) { showing = false; return; }
        showing = true;
        let el = document.getElementById('trophy-toast');
        if (!el) { el = document.createElement('div'); el.id = 'trophy-toast'; el.className = 'trophy-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.innerHTML = `${art(t)}<span class="tt-text"><small>Trophy won!</small><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.how)}</span></span>`;
        void el.offsetWidth; el.classList.add('show');
        if (window.playSound) window.playSound('trophy');
        setTimeout(() => { el.classList.remove('show'); setTimeout(next, 350); }, 3200);
    }

    // (count: how many of the trophies in the cabinet you have; total: how many there are)
    FFV.trophies = { KEY, list, setCircuits, has, award, art, all: read, count: () => { const won = read(); return list().filter(t => won[t.id]).length; }, total: () => list().length };

    // ---------- the Trophies screen ----------
    window.renderTrophies = function () {
        const el = document.getElementById('trophies'); if (!el) return;
        const LIST = list(), won = read(), n = LIST.filter(t => won[t.id]).length, when = at => { if (!(at > 1)) return ''; try { return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
        el.innerHTML = `<p class="trophy-count"><b>${n}</b> of ${LIST.length} won${n === LIST.length ? ': the cabinet is full!' : ''}</p>
            <div class="trophy-grid">${LIST.map(t => { const got = won[t.id];
                return `<div class="trophy-card ${got ? 'won' : 'locked'}">${art(t, !got)}<b>${escapeHtml(t.name)}</b><span class="trophy-how">${got ? '' : '<i>How to win it:</i> '}${escapeHtml(t.how)}</span>${got ? `<small>${when(got) ? 'Won ' + escapeHtml(when(got)) : 'Won'}</small>` : ''}</div>`; }).join('')}</div>`;
    };
})();
