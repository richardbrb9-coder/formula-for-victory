// Formula for Victory: "Driver Cards", a card game against the computer (a game of comparing numbers, like the classic
// top-number card games). One card for each of the eleven teams' drivers, plus five made-up "legend" cars.
//
// THE RULES: the pack is shuffled and dealt, half each. You only see your top card. Whoever's turn it is picks one
// of the six numbers on their top card; the HIGHER number wins both cards (for "Debut year" the EARLIER year wins).
// A tie puts both cards in the middle, and the next winner takes those as well. You and the computer take turns to
// pick, you first. (In the classic game the winner keeps the pick; here that let whoever got ahead run away with it,
// because picking your own best number wins most rounds. Taking turns keeps every game close.) The game ends
// when one side has every card, or after a set number of rounds (a short game: 10), when whoever holds more cards wins.
//
// THE NUMBERS on a card: the made-up career numbers in teams.js (or a family's own, from their teams.csv: on their
// device only), and the car's top speed. Your own team's card also shows what YOU have done in this game.
// THE PICTURES: the team's car and the driver's helmet, drawn from the game's 3D models by cardart.js, once, and kept
// in this browser's own database ('ffv_cards') until the team's look changes. Never a photograph, never a face.
// Everything a family has typed (names) is escaped before it is put on a card.
'use strict';
(function () {
    const FFV = window.FFV, $ = id => document.getElementById(id), esc = s => escapeHtml(s);
    const STATS = [
        { k: 'wins', label: 'Wins', icon: '🏁' }, { k: 'poles', label: 'Pole positions', short: 'Poles', icon: '⏱' }, { k: 'podiums', label: 'Podiums', icon: '🥇' },
        { k: 'titles', label: 'Championships', short: 'Titles', icon: '🏆' }, { k: 'top', label: 'Top speed', short: 'Speed', icon: '💨', unit: 'km/h' }, { k: 'debut', label: 'Debut year', short: 'Debut', icon: '📅', low: true }   // (short: the name used where there is little room)
    ];
    const SHORT = 10, LONGEST = 50;   // rounds in a short game; the most a full game can last
    const ART_V = 2;                  // (change this if the pictures are ever drawn differently: every device then draws them afresh)

    // ---------- the pack ----------
    const lum = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return (0.3 * (n >> 16 & 255) + 0.59 * (n >> 8 & 255) + 0.11 * (n & 255)) / 255; };
    function pack() {
        return [...FFV.TEAMS, ...FFV.LEGENDS].map((t, i) => ({ id: t.id, t, index: i, legend: !!t.legend,
            v: { wins: t.stats.wins, poles: t.stats.poles, podiums: t.stats.podiums, titles: t.stats.titles, top: t.top, debut: t.stats.debut } }));
    }
    // the team you drive for: this season's, if you have a season on the go; otherwise your quick-race team
    const myTeamId = () => { const s = FFV.season && FFV.season.load(); if (s && !FFV.season.finished(s) && FFV.teamById(s.team)) return s.team; return (FFV.TEAMS[typeof opts !== 'undefined' ? opts.team : 0] || FFV.TEAMS[0]).id; };
    // what a card's pictures depend on: if any of it changes, they are drawn again
    const sigOf = c => [ART_V, c.t.team, c.t.paint, c.t.stripe, c.t.paint2, c.t.pattern || '', c.t.number, c.legend ? '' : FFV.logoSig(c.id)].join('|');

    // ---------- the pictures: kept in this browser's own database, drawn only when missing or out of date ----------
    const DB = 'ffv_cards', STORE = 'art', art = {};   // art: card id -> { sig, car, helmet }
    function dbDo(mode, fn) {
        return new Promise(ok => {
            try {
                const r = indexedDB.open(DB, 1);
                r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
                r.onerror = r.onblocked = () => ok(undefined);
                r.onsuccess = () => { try { const d = r.result, tx = d.transaction(STORE, mode), out = fn(tx.objectStore(STORE)); tx.oncomplete = () => { d.close(); ok(out && out.result); }; tx.onerror = tx.onabort = () => { d.close(); ok(undefined); }; } catch (e) { ok(undefined); } };
            } catch (e) { ok(undefined); }
        });
    }
    // (a saved picture is only ever a plain PNG or WebP, written out in the 64 safe letters: anything else is not used)
    const isPic = v => typeof v === 'string' && v.length < 900000 && /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(v);
    let artRead = null, drawing = false, artRun = 0;
    function readArt() {
        return artRead || (artRead = dbDo('readonly', s => { const out = {}; s.openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } }; return { get result() { return out; } }; })
            .then(all => { for (const [id, a] of Object.entries(all || {})) if (a && isPic(a.car) && isPic(a.helmet) && typeof a.sig === 'string') art[id] = a; }));
    }
    function showArt(id) {
        const a = art[id]; if (!a) return;
        document.querySelectorAll(`[data-art="${id}"]`).forEach(box => { box.classList.add('ready'); box.querySelector('.dc-car').src = a.car; box.querySelector('.dc-helmet').src = a.helmet; });
    }
    // make sure every card has up-to-date pictures (the ones that are missing are drawn, a card at a time)
    async function ensureArt() {
        await readArt();
        const cards = pack(), todo = cards.filter(c => !art[c.id] || art[c.id].sig !== sigOf(c));
        cards.forEach(c => { if (!todo.includes(c)) showArt(c.id); });
        if (!todo.length || drawing) return;
        drawing = true; const run = ++artRun; note(`Painting the cards… 0 of ${todo.length}`);
        try {
            await FFV.logosReady;
            const m = await import('./cardart.js'); let n = 0;
            await m.drawCards(todo.map(c => ({ id: c.id, team: c.t, index: c.index })), (id, pics) => {
                const c = todo.find(k => k.id === id); if (!c || run !== artRun || !isPic(pics.car) || !isPic(pics.helmet)) return;
                art[id] = { sig: sigOf(c), car: pics.car, helmet: pics.helmet }; dbDo('readwrite', s => s.put(art[id], id));
                showArt(id); note(`Painting the cards… ${++n} of ${todo.length}`);
            }, () => run === artRun && current === 'cards');
        } catch (e) { console.error(e); }
        drawing = false; note('');
        if (run !== artRun && current === 'cards') ensureArt();   // (the teams changed while they were being drawn: go round again)
    }
    function note(text) { const el = $('dc-note'); if (el) el.textContent = text; }

    // ---------- one card ----------
    // o: { pick (its numbers are buttons to choose from), small (a little one, for the "all the cards" grid), mine }
    function cardHtml(c, o = {}) {
        const t = c.t, a = art[c.id], ready = a && a.sig === sigOf(c), ink = lum(t.paint) > 0.6 ? '#15171b' : '#ffffff', logo = !c.legend && FFV.logoUrl(c.id);
        const mine = c.id === myTeamId(), my = FFV.myStats.get();
        const rows = STATS.map(s => `<${o.pick ? 'button' : 'div'} class="dc-stat" data-stat="${s.k}"${o.pick ? ` aria-label="${s.label}: ${c.v[s.k]}${s.unit ? ' ' + s.unit : ''}"` : ''}><span class="dc-sl"><i aria-hidden="true">${s.icon}</i><span class="dc-l">${s.label}</span>${s.short ? `<span class="dc-s">${s.short}</span>` : ''}${s.low ? '<em>earliest wins</em>' : ''}</span><b>${c.v[s.k]}${s.unit ? `<small>${s.unit}</small>` : ''}</b></${o.pick ? 'button' : 'div'}>`).join('');
        return `<div class="dc-card ${c.legend ? 'legend' : ''} ${mine ? 'mine' : ''} ${o.small ? 'small' : ''}" data-card="${c.id}" style="--c1:${t.paint};--c2:${t.stripe};--c3:${t.paint2};--ink:${ink}">
            <div class="dc-top"><span class="dc-num">${t.number}</span><span class="dc-names"><b>${esc(t.driver)}${mine ? FFV.youTag : ''}</b><small>${esc(t.team)}</small></span>${logo ? `<img class="dc-logo" src="${logo}" alt="">` : c.legend ? '<span class="dc-star" title="Legend">★</span>' : ''}</div>
            <div class="dc-art ${ready ? 'ready' : ''}" data-art="${c.id}"><img class="dc-car" alt="" ${ready ? `src="${a.car}"` : ''}><img class="dc-helmet" alt="" ${ready ? `src="${a.helmet}"` : ''}>${c.legend ? '<span class="dc-ribbon">LEGEND</span>' : ''}</div>
            ${o.small ? '' : `<div class="dc-stats">${rows}</div>${mine ? `<p class="dc-mine">In this game you have won <b>${my.wins}</b> race${my.wins === 1 ? '' : 's'}, with <b>${my.podiums}</b> podium${my.podiums === 1 ? '' : 's'}, <b>${my.poles}</b> pole${my.poles === 1 ? '' : 's'} and <b>${my.titles}</b> title${my.titles === 1 ? '' : 's'}.</p>` : ''}`}
        </div>`;
    }
    const cardBack = () => `<div class="dc-back"><span class="dc-back-flag"></span><b>DRIVER<br>CARDS</b><small>Formula for Victory</small></div>`;

    // ---------- the game ----------
    const setup = (() => { const d = (typeof store === 'function' && store('cardsSetup', {})) || {}; return { length: d.length === 'full' ? 'full' : 'short', level: d.level === 'easy' ? 'easy' : 'normal' }; })();
    let view = 'menu', game = null, zoom = null, timers = [];
    const later = (fn, ms) => { const t = setTimeout(() => { timers = timers.filter(k => k !== t); fn(); }, ms); timers.push(t); };
    const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };
    const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function shuffle(a, rand = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function newGame() {
        const all = shuffle(pack(), window.__cardRand || Math.random), half = all.length / 2;
        game = { you: all.slice(0, half), cpu: all.slice(half), pile: [], round: 1, limit: setup.length === 'short' ? SHORT : LONGEST, level: setup.level, turn: 'you', phase: 'pick', last: null, total: all.length };
        view = 'game'; render(); playSound('deal');
    }
    // which number the computer picks: on Easy any of them; on Normal the one its card is best at, compared with every card in the pack
    function cpuChoice() {
        const c = game.cpu[0], all = pack();
        if (game.level === 'easy') return STATS[Math.floor((window.__cardRand || Math.random)() * STATS.length)].k;
        let best = null, score = -1;
        for (const s of STATS) { const beats = all.filter(o => o.id !== c.id && (s.low ? c.v[s.k] < o.v[s.k] : c.v[s.k] > o.v[s.k])).length + Math.random() * 0.5; if (beats > score) { score = beats; best = s.k; } }
        return best;
    }
    // compare the two top cards on one number
    function play(k) {
        if (!game || game.phase !== 'pick') return;
        const s = STATS.find(x => x.k === k); if (!s) return;
        const a = game.you[0].v[k], b = game.cpu[0].v[k], who = a === b ? 'tie' : (s.low ? a < b : a > b) ? 'you' : 'cpu';
        game.phase = 'shown'; game.last = { k, who, by: game.turn };
        // (the table is changed in place, not drawn again, so the computer's card can turn over)
        const table = $('cards').querySelector('.dc-table'); if (!table) { render(); return; }
        table.classList.add('shown', 'r-' + who);
        table.querySelectorAll('.dc-stat').forEach(el => { if (el.dataset.stat === k) el.classList.add('picked'); if (el.tagName === 'BUTTON') el.disabled = true; });
        const mineRow = table.querySelector(`.dc-seat.you .dc-stat[data-stat="${k}"]`), theirs = table.querySelector(`.dc-seat.cpu .dc-stat[data-stat="${k}"]`);
        if (mineRow) mineRow.classList.add(who === 'you' ? 'win' : who === 'cpu' ? 'lose' : 'tie'); if (theirs) theirs.classList.add(who === 'cpu' ? 'win' : who === 'you' ? 'lose' : 'tie');
        const flip = table.querySelector('.dc-flip'); if (flip) flip.classList.add('up');
        playSound('flip');
        const msg = table.querySelector('.dc-msg'), val = v => v + (s.unit ? ' ' + s.unit : '');
        const won = game.pile.length + 2;
        msg.innerHTML = who === 'tie' ? `<b class="tie">It's a tie!</b><span>${s.label}: both ${val(a)}. The two cards go in the middle for the next winner.</span>`
            : who === 'you' ? `<b class="win">You win the round!</b><span>${s.label}: your ${val(a)} beats ${val(b)}${s.low ? ' (earlier wins)' : ''}. You take ${won} cards.</span>`
            : `<b class="lose">The computer wins the round</b><span>${s.label}: its ${val(b)} beats your ${val(a)}${s.low ? ' (earlier wins)' : ''}. It takes ${won} cards.</span>`;
        const next = table.querySelector('.dc-next'); next.hidden = false; next.textContent = ending() ? 'See who won ›' : 'Next card ›';
        later(() => playSound(who === 'you' ? 'win' : who === 'cpu' ? 'lose' : 'click'), calm() ? 0 : 420);
        later(() => { try { next.focus({ preventScroll: true }); } catch (e) { /* no matter */ } }, 500);
    }
    // would the game be over once this round's cards have been handed out?
    function ending() {
        const L = game.last, you = game.you.length - 1 + (L.who === 'you' ? game.pile.length + 2 : 0), cpu = game.cpu.length - 1 + (L.who === 'cpu' ? game.pile.length + 2 : 0);
        return you === 0 || cpu === 0 || game.round >= game.limit;
    }
    function nextRound() {
        if (!game || game.phase !== 'shown') return;
        const L = game.last, a = game.you.shift(), b = game.cpu.shift();
        if (L.who === 'tie') game.pile.push(a, b);
        else { const won = L.who === 'you' ? [a, b] : [b, a]; (L.who === 'you' ? game.you : game.cpu).push(...won, ...game.pile); game.pile = []; }
        game.turn = game.turn === 'you' ? 'cpu' : 'you';   // you take turns to pick
        if (!game.you.length || !game.cpu.length || game.round >= game.limit) { finish(); return; }
        game.round++; game.phase = 'pick'; game.last = null;
        const table = $('cards').querySelector('.dc-table');
        if (table && !calm()) { table.classList.add('leaving', 'to-' + L.who); playSound('deal'); later(render, 330); } else render();
    }
    function finish() {
        const you = game.you.length, cpu = game.cpu.length, who = you === cpu ? 'tie' : you > cpu ? 'you' : 'cpu';
        game.over = { who, you, cpu, all: !cpu || !you }; view = 'over'; game.phase = 'over';
        if (who === 'you') storeSet('cardWins', (store('cardWins', 0) | 0) + 1);
        if (who === 'you') { FFV.trophies.award('cards_win'); if (!cpu) FFV.trophies.award('cards_all'); }   // (the second: the computer has no cards left at all)
        render();
        if (who === 'you') { playSound('fanfare'); if (typeof startParty === 'function') startParty(6, 120); } else playSound(who === 'tie' ? 'go' : 'lose');
    }
    // the computer's turn to pick: it "thinks" for a moment first
    function cpuTurn() {
        if (!game || game.phase !== 'pick' || game.turn !== 'cpu') return;
        const k = cpuChoice(), s = STATS.find(x => x.k === k), table = $('cards').querySelector('.dc-table');
        later(() => { if (!game || game.phase !== 'pick' || view !== 'game') return; const msg = table && table.querySelector('.dc-msg'); if (msg) msg.innerHTML = `<b>The computer picks ${s.label}!</b>`; later(() => play(k), calm() ? 300 : 800); }, calm() ? 300 : 1100);
    }

    // ---------- the screens ----------
    function render() {
        const el = $('cards'); if (!el) return;
        stopTimers();
        if (view === 'game' && game) renderGame(el); else if (view === 'over' && game) renderOver(el); else renderMenu(el);
        $('screen-cards').classList.toggle('dc-playing', view === 'game');
        if (zoom) openZoom(zoom);
    }
    function renderMenu(el) {
        const row = (key, list) => `<div class="opts">${list.map(([v, text]) => `<button class="opt ${setup[key] === v ? 'active' : ''}" data-dc="set" data-key="${key}" data-val="${v}" aria-pressed="${setup[key] === v}">${text}</button>`).join('')}</div>`;
        const won = store('cardWins', 0) | 0, cards = pack();
        el.innerHTML = `
            <div class="screen-head"><h1><span class="kicker">Driver Cards</span>Beat the computer's card</h1>
                <p class="subtitle">${cards.length} cards: every driver on the grid, and five legends from long ago. Pick your best number and win them all.</p></div>
            <div class="dc-menu">
                <div class="panel dc-setup">
                    <p class="b-label" style="margin-top:0">How long a game?</p>
                    ${row('length', [['short', `Short: ${SHORT} rounds`], ['full', 'Full: win every card']])}
                    <p class="b-label">The computer</p>
                    ${row('level', [['easy', 'Easy'], ['normal', 'Normal']])}
                    <p class="small opt-note">${setup.level === 'easy' ? 'Easy: the computer picks any number, without thinking.' : 'Normal: the computer picks the number its card is best at.'}${setup.length === 'full' ? ` A full game stops after ${LONGEST} rounds if nobody has every card by then.` : ''}</p>
                    <div class="mode-btns"><button class="big-btn" data-dc="play">🃏 Deal the cards</button></div>
                    <p class="small dc-won">${won ? `Card games you have won: <b>${won}</b>` : 'Tap a card below to see it close up.'}</p>
                </div>
                <div class="panel dc-rules"><h2>How to play</h2>
                    <ol><li>The cards are shuffled and dealt: half for you, half for the computer. You see your <b>top card</b>.</li>
                        <li>Tap the number on your card that you think is better than the computer's.</li>
                        <li>The <b>higher number wins</b> both cards. Only for <b>📅 Debut year</b> is it the other way: the <b>earlier year wins</b>.</li>
                        <li>The same number? A <b>tie</b>: both cards wait in the middle, and the next winner takes them too.</li>
                        <li>You pick first, then the computer picks, and so on, turn by turn. Win <b>all the cards</b>, or hold the most when the rounds run out.</li></ol>
                </div>
            </div>
            <div class="dc-all-head"><h2>All the cards</h2><span class="small" id="dc-note" role="status" aria-live="polite"></span></div>
            <div class="dc-all">${cards.map(c => `<button class="dc-thumb" data-dc="zoom" data-id="${c.id}" aria-label="${esc(c.t.driver)}, ${esc(c.t.team)}">${cardHtml(c, { small: true })}</button>`).join('')}</div>`;
    }
    function scoreHtml() {
        const g = game, pct = Math.round(100 * g.you.length / g.total);
        return `<div class="dc-score"><span class="dc-side you"><b>${g.you.length}</b> You</span>
            <span class="dc-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
            <span class="dc-side cpu">Computer <b>${g.cpu.length}</b></span>
            <span class="dc-round">Round <b>${g.round}</b>${g.limit === SHORT ? ` of ${SHORT}` : ''}${g.pile.length ? ` · <em>${g.pile.length} in the middle</em>` : ''}</span>
            <button class="opt dc-quit" data-dc="quit" aria-label="End the game">✕<span> End game</span></button></div>`;
    }
    function renderGame(el) {
        const g = game, mine = g.you[0], theirs = g.cpu[0], myTurn = g.turn === 'you';
        el.innerHTML = `<div class="dc-table ${myTurn ? 'my-turn' : 'cpu-turn'} ${calm() ? '' : 'deal'}">
            ${scoreHtml()}
            <div class="dc-seat you"><span class="dc-seat-name">Your card <small>${g.you.length} left</small></span>${cardHtml(mine, { pick: myTurn })}</div>
            <div class="dc-mid"><div class="dc-msg" role="status" aria-live="polite">${myTurn ? '<b>Your pick!</b><span>Tap a number on your card.</span>' : '<b>The computer picks…</b><span>It is choosing a number on its card.</span>'}</div>
                <button class="big-btn dc-next" data-dc="next" hidden>Next card ›</button>
                ${g.pile.length ? `<div class="dc-pile" aria-hidden="true"><i></i><i></i><span>${g.pile.length}</span></div>` : ''}</div>
            <div class="dc-seat cpu"><span class="dc-seat-name">Computer's card <small>${g.cpu.length} left</small></span>
                <div class="dc-flip"><div class="dc-face back">${cardBack()}</div><div class="dc-face front">${cardHtml(theirs)}</div></div></div>
        </div>`;
        // (back on this screen while a round's result was showing: show it again, with its Next button, rather than a card that can't be played)
        if (g.phase === 'shown' && g.last) { g.phase = 'pick'; play(g.last.k); return; }
        if (!myTurn) cpuTurn();
    }
    function renderOver(el) {
        const o = game.over, title = o.who === 'you' ? 'You win! 🏆' : o.who === 'cpu' ? 'The computer wins this time' : "It's a draw!";
        const line = o.all && o.who !== 'tie' ? (o.who === 'you' ? `You won every single card in ${game.round} rounds. Champion!` : 'The computer took every card. Deal again and win them back!')
            : `After ${game.round} rounds you hold <b>${o.you}</b> card${o.you === 1 ? '' : 's'} and the computer holds <b>${o.cpu}</b>${game.pile.length ? ` (${game.pile.length} were left in the middle)` : ''}.`;
        const best = (o.who === 'cpu' ? game.cpu : game.you).slice(0, 3);
        el.innerHTML = `<div class="dc-over ${o.who}">
            <span class="kicker">Driver Cards · game over</span><h1>${title}</h1><p class="subtitle">${line}</p>
            <div class="dc-final"><span class="you"><b>${o.you}</b>You</span><span class="vs">–</span><span class="cpu"><b>${o.cpu}</b>Computer</span></div>
            <div class="dc-fan">${best.map(c => cardHtml(c, { small: true })).join('')}</div>
            <div class="rr-actions"><button class="big-btn" data-dc="play">🃏 Play again</button><button class="act-btn ghost" data-dc="menu">Driver Cards menu</button></div>
        </div>`;
    }
    // one card, close up (from "All the cards")
    function openZoom(id) {
        const c = pack().find(k => k.id === id); closeZoom(false); if (!c) return;
        zoom = id;
        const box = document.createElement('div'); box.className = 'dc-zoom modal open'; box.id = 'dc-zoom';
        box.innerHTML = `<div class="dc-zoom-in">${cardHtml(c)}<button class="act-btn" data-dc="unzoom">Close</button></div>`;
        box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-dc=unzoom]')) closeZoom(); });
        $('screen-cards').appendChild(box);
    }
    function closeZoom(forget = true) { const z = $('dc-zoom'); if (z) z.remove(); if (forget) zoom = null; }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('dc-zoom')) closeZoom(); });

    // (a family's teams changed while a game was on the table: its cards are out of date, so it is put away)
    document.addEventListener('ffv-teams', () => { if (typeof current === 'undefined' || current !== 'cards') { artRun++; game = null; view = 'menu'; } });
    function wire() {
        const el = $('cards'); if (!el) return;
        el.addEventListener('click', e => {
            const st = e.target.closest('button.dc-stat'); if (st && game && view === 'game' && game.phase === 'pick' && game.turn === 'you') { play(st.dataset.stat); return; }
            const b = e.target.closest('[data-dc]'); if (!b) return;
            switch (b.dataset.dc) {
                case 'set': setup[b.dataset.key] = b.dataset.val; storeSet('cardsSetup', setup); render(); ensureArt(); break;
                case 'play': if (typeof stopParty === 'function') stopParty(); stopLongSounds(); newGame(); window.scrollTo(0, 0); break;
                case 'next': nextRound(); break;
                case 'quit': if (b.dataset.sure) { game = null; view = 'menu'; render(); ensureArt(); window.scrollTo(0, 0); } else { b.dataset.sure = '1'; b.textContent = 'Tap again to end'; later(() => { if (b.isConnected) { delete b.dataset.sure; b.innerHTML = '✕<span> End game</span>'; } }, 3000); } break;
                case 'menu': if (typeof stopParty === 'function') stopParty(); stopLongSounds(); game = null; view = 'menu'; render(); ensureArt(); window.scrollTo(0, 0); break;
                case 'zoom': openZoom(b.dataset.id); break;
            }
        });
    }
    window.FFVCards = {
        open() { if (!game) view = 'menu'; render(); ensureArt(); },
        // leaving the screen: a game in progress is kept until the app is closed, but anything timed stops
        leave() { stopTimers(); closeZoom(); if (typeof stopParty === 'function') stopParty(); stopLongSounds(); if (game && game.phase === 'over') { game = null; view = 'menu'; } },
        // a family's teams have changed (names, colours, logos): redraw, and repaint the pictures that no longer match
        teamsChanged() { artRun++; if (game) { game = null; view = 'menu'; } render(); ensureArt(); },
        // "Clear my teams": throw away the saved pictures too (some had a family's logo painted on them)
        forget() { artRun++; for (const k of Object.keys(art)) delete art[k]; dbDo('readwrite', s => s.clear()); },
        state: () => ({ view, round: game && game.round, you: game && game.you.map(c => c.id), cpu: game && game.cpu.map(c => c.id), pile: game && game.pile.length, turn: game && game.turn, phase: game && game.phase, last: game && game.last, over: game && game.over, art: Object.keys(art).length, drawing }),   // (testing)
        STATS, pack
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
