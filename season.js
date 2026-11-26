// Formula for Victory: the championship's rules and record-keeping (no screens here: see championship.js for those).
//
// A season is five races, one on each circuit. Points go to the top ten in each race (nothing for 11th). The same eleven teams and drivers
// (teams.js) race all season; you drive for one of them. The season is saved on the device after every race under
// 'ffv_champ', so you can stop and carry on another day.
//
// What is saved: { v, team, laps, difficulty, rounds: [circuit ids], results: [{ circuit, order: [team ids, winner
// first], time, best }], started, celebrated }. The points and the tables are never saved: they are always worked out again from the
// finishing orders, so they cannot get out of step. A race only counts once its finishing order has been recorded (at
// the chequered flag); a race you leave part-way was never recorded, so it simply starts again.
'use strict';
(function () {
    const FFV = window.FFV, VERSION = 1, KEY = 'ffv_champ';
    const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    // The order of the season: the fastest, simplest circuit first, the tight streets later, and the night race to finish.
    // The weather is only for looks (the car grips just the same): a grey day in England, a wet one in Japan.
    const ROUNDS = [
        { circuit: 'monza', weather: 'sunny' }, { circuit: 'silverstone', weather: 'cloudy' }, { circuit: 'suzuka', weather: 'rain' },
        { circuit: 'monaco', weather: 'sunny' }, { circuit: 'lasvegas', weather: 'sunny' }
    ];
    const LAPS = [2, 3, 5], DIFFICULTIES = ['easy', 'medium', 'hard'];
    const ids = () => FFV.TEAMS.map(t => t.id);

    function newSeason({ team, laps, difficulty }) {
        return { v: VERSION, team: ids().includes(team) ? team : ids()[0], laps: LAPS.includes(laps) ? laps : 3, difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'easy',
            rounds: ROUNDS.map(r => r.circuit), results: [], started: Date.now() };
    }
    // Check a saved season, and mend it if it can be mended. Anything that is not a season at all gives null; a season
    // from an older version, or with a damaged race in it, keeps every good race up to the first bad one.
    function check(s) {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
        const all = ids(), team = Number.isInteger(s.team) && FFV.TEAMS[s.team] ? FFV.TEAMS[s.team].id : s.team;   // (a number: the team's place in the list)
        if (!all.includes(team)) return null;
        const out = newSeason({ team, laps: +s.laps, difficulty: s.difficulty });
        if (Number.isFinite(s.started)) out.started = s.started;
        const circuits = ROUNDS.map(r => r.circuit);
        // (an old save might list the circuits in another order, or fewer of them: keep its order for the ones we still have)
        if (Array.isArray(s.rounds)) { const kept = s.rounds.filter((c, i) => circuits.includes(c) && s.rounds.indexOf(c) === i); out.rounds = [...kept, ...circuits.filter(c => !kept.includes(c))]; }
        if (Array.isArray(s.results)) {
            for (let i = 0; i < s.results.length && i < out.rounds.length; i++) {
                const r = s.results[i], order = r && Array.isArray(r.order) ? r.order.filter((id, k) => all.includes(id) && r.order.indexOf(id) === k) : null;
                if (!order || !order.length) break;
                for (const id of all) if (!order.includes(id)) order.push(id);   // (anyone missing from the list is put at the back)
                out.results.push({ circuit: out.rounds[i], order, time: Number.isFinite(r.time) ? r.time : null, best: Number.isFinite(r.best) ? r.best : null });
            }
        }
        if (s.celebrated === true && out.results.length >= out.rounds.length) out.celebrated = true;   // (the champion's party has been seen)
        return out;
    }
    function load() { try { return check(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return null; } }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
    function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } }

    const finished = s => s.results.length >= s.rounds.length;
    const roundInfo = (s, i) => ROUNDS.find(r => r.circuit === s.rounds[i]) || null;
    const pointsFor = place => POINTS[place] || 0;   // place: 0 for the winner

    // Write down a race's finishing order (team ids, winner first). It only ever fills in the NEXT race of the season:
    // asked twice for the same race, or for the wrong one, it changes nothing. Returns true if it was recorded.
    function record(s, round, order, extra = {}) {
        if (round !== s.results.length || finished(s)) return false;
        const all = ids(), clean = (order || []).filter((id, k) => all.includes(id) && order.indexOf(id) === k);
        if (!clean.length) return false;
        for (const id of all) if (!clean.includes(id)) clean.push(id);
        s.results.push({ circuit: s.rounds[round], order: clean, time: Number.isFinite(extra.time) ? extra.time : null, best: Number.isFinite(extra.best) ? extra.best : null });
        return true;
    }
    // The table after 'upto' races (all of them, if not given). Level on points? Whoever has more wins is ahead, then more
    // second places, and so on; still level, whoever did better in the latest race.
    function standings(s, upto = s.results.length) {
        const rows = FFV.TEAMS.map(t => ({ id: t.id, pts: 0, places: [], count: new Array(FFV.TEAMS.length).fill(0), last: 99 }));
        const by = Object.fromEntries(rows.map(r => [r.id, r]));
        s.results.slice(0, upto).forEach(res => res.order.forEach((id, place) => { const r = by[id]; if (!r) return; r.pts += pointsFor(place); r.places.push(place + 1); r.count[place]++; r.last = place; }));
        const list = FFV.TEAMS.map(t => t.id);
        rows.sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            for (let k = 0; k < a.count.length; k++) if (a.count[k] !== b.count[k]) return b.count[k] - a.count[k];
            return a.last - b.last || list.indexOf(a.id) - list.indexOf(b.id);
        });
        rows.forEach((r, i) => { r.pos = i + 1; r.wins = r.count[0]; r.you = r.id === s.team; });
        return rows;
    }
    // ... and the same table with how many places each driver has gone up (move > 0) or down since the race before, and
    // the points they scored in the latest race
    function standingsWithMoves(s) {
        const now = standings(s), n = s.results.length;
        const before = n > 1 ? Object.fromEntries(standings(s, n - 1).map(r => [r.id, r.pos])) : null, latest = n ? s.results[n - 1].order : [];
        now.forEach(r => { r.move = before ? before[r.id] - r.pos : 0; r.gained = n ? pointsFor(latest.indexOf(r.id)) : 0; });
        return now;
    }
    // The starting grid for the rivals in a championship race (team ids, front of the grid first): the drivers with more
    // 'pace' usually start nearer the front, with enough luck mixed in that every race, and every season, is different.
    // You always start at the back, as in a single race.
    function grid(s, rand = Math.random) {
        return FFV.TEAMS.filter(t => t.id !== s.team).map(t => ({ id: t.id, score: t.pace + (rand() - 0.5) * 0.9 })).sort((a, b) => b.score - a.score).map(t => t.id);
    }

    FFV.season = { VERSION, KEY, POINTS, ROUNDS, LAPS, DIFFICULTIES, newSeason, check, load, save, clear, finished, roundInfo, pointsFor, record, standings, standingsWithMoves, grid };
})();
