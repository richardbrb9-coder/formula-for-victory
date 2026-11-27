// Formula for Victory: the records board. For every circuit: your best lap, your best race time (kept separately for
// 3-lap and 5-lap races) and your best qualifying lap, each with the day it was set. Kept on this device only, under
// 'ffv_records', as { v, c: { monza: { lap: { t, at }, race3: { t, at }, race5: { t, at }, quali: { t, at } }, ... } }
// (t: seconds; at: when, as the clock's milliseconds, or null if it is not known).
//
// The best LAP is also the lap your time-trial ghost drives (see onPlayerLap in race.js), so only a proper flying lap
// counts for it: from the line to the line, with no overtake boost and no pit stop in it. That keeps the time trial
// fair: a lap you could only do with a boost would be a ghost you could never catch. Best laps from before the records
// board existed (kept as 'ffv_raceBest_<circuit>') are carried over, without a date.
//
// The screen is drawn here too (it uses app.js's helpers): renderRecords() fills the Records screen.
'use strict';
(function () {
    const FFV = window.FFV = window.FFV || {}, KEY = 'ffv_records';
    const KINDS = [['lap', 'Best lap'], ['race3', 'Best race: 3 laps'], ['race5', 'Best race: 5 laps'], ['quali', 'Best qualifying lap']];
    const okTime = t => typeof t === 'number' && Number.isFinite(t) && t > 3 && t < 86400, okId = id => typeof id === 'string' && /^[a-z0-9_-]{1,24}$/.test(id);
    // read what is saved, keeping only what makes sense (anything else is simply left out)
    function read() {
        let v = null; try { v = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none yet, or unreadable */ }
        const c = v && typeof v === 'object' && !Array.isArray(v) && v.c && typeof v.c === 'object' && !Array.isArray(v.c) ? v.c : {}, out = {};
        for (const id of Object.keys(c)) {
            const r = c[id]; if (!okId(id) || !r || typeof r !== 'object') continue;
            const o = {}; for (const [k] of KINDS) { const e = r[k]; if (e && typeof e === 'object' && okTime(e.t)) o[k] = { t: e.t, at: Number.isFinite(e.at) && e.at > 0 ? e.at : null }; }
            out[id] = o;
        }
        return out;
    }
    function write(all) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, c: all })); return true; } catch (e) { return false; } }
    // the best lap kept by older versions of the game
    function oldLap(id) { try { const t = JSON.parse(localStorage.getItem('ffv_raceBest_' + id)); return okTime(t) ? t : null; } catch (e) { return null; } }
    // one circuit's records: { lap, race3, race5, quali }, each { t, at } or missing
    function get(id) {
        const r = read()[id] || {}, old = oldLap(id);
        if (old != null && (!r.lap || old < r.lap.t)) r.lap = { t: old, at: null };
        return r;
    }
    // A time has been set. kind: 'lap', 'race3', 'race5' or 'quali'. Returns true if it is a new record (the first
    // time ever set counts as one).
    function set(id, kind, t) {
        if (!okId(id) || !KINDS.some(k => k[0] === kind) || !okTime(t)) return false;
        const now = get(id)[kind]; if (now && Math.round(t * 100) >= Math.round(now.t * 100)) return false;   // (to the hundredth shown on screen: "New record! 1:38.05" when the old one was 1:38.05 too would puzzle anyone)
        const all = read(); all[id] = all[id] || {}; all[id][kind] = { t, at: Date.now() };
        write(all);
        if (kind === 'lap') { try { localStorage.setItem('ffv_raceBest_' + id, JSON.stringify(t)); } catch (e) { /* storage unavailable */ } }   // (the racing screen's "Best" reads this)
        return true;
    }
    const raceKind = laps => laps === 3 ? 'race3' : laps === 5 ? 'race5' : null;   // (a 2-lap championship race has no board of its own)
    const dateText = at => { if (!at) return ''; try { return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
    FFV.records = { KEY, KINDS, get, set, raceKind, dateText, clear() { try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } } };

    // ---------- the Records screen ----------
    window.renderRecords = function () {
        const el = document.getElementById('records'); if (!el) return;
        loadCircuits().then(list => {
            el.innerHTML = `<div class="rec-grid">${list.filter(c => !c.soon).map(c => {
                const r = get(c.id), any = KINDS.some(([k]) => r[k]);
                return `<div class="panel rec-card ${any ? '' : 'empty'}"><h2><span aria-hidden="true">${c.flag}</span> ${escapeHtml(c.name)}</h2>
                    <table class="rec-table"><tbody>${KINDS.map(([k, label]) => `<tr class="${r[k] ? '' : 'none'}"><th scope="row">${label}</th><td class="rec-t">${r[k] ? fmtTime(r[k].t) : '–'}</td><td class="rec-d">${r[k] ? escapeHtml(dateText(r[k].at) || 'Earlier') : 'Not set yet'}</td></tr>`).join('')}</tbody></table></div>`;
            }).join('')}</div>
            <p class="small rec-note">A best lap is one clean flying lap, from the line to the line. Laps with an overtake boost or a pit stop in them don't count, so your time-trial ghost is always a lap you can beat.</p>`;
        }).catch(() => { el.innerHTML = '<p class="small">The records could not load. Check your connection and try again.</p>'; });
    };
})();
