// Formula for Victory: the teams and drivers. This is the ONE place their names, colours and car numbers are written
// down: the menus, the cars, the results, the podium and the championship all read them from here.
//
// RULES: every name here is made up. Never use a real team, driver, sponsor or brand, or the name of a real racing
// series. Drivers are only ever shown wearing a helmet: there are no faces to draw or describe.
//
// Each team: id (never change it: saved seasons remember teams by it), team, driver, number (on the car), paint (the main
// colour), stripe, paint2 (the second colour), and pace (0 to 1: how often this driver starts near the front in the
// championship; it does not make the car itself any quicker).
// For the Driver Cards game each team also has made-up career numbers: top (top speed, km/h) and stats { wins, poles,
// podiums, titles, debut (the year of the team's first race) }. They are for comparing cards only: they change nothing
// on the track. They are balanced so every card has something it is good at.
// The order matters too: a team's place in the list picks its paint pattern, and the menus remember your team by it.
//
// The driver you race as is shown by their own name, with a small YOU tag beside it (FFV.youTag), never as "You".
// Every driver's helmet is painted in the team's three colours (see helmetedDriver in carmodel.js).
//
// A family's own teams, on their own device only (the "My teams" screen: see myteams.js). A device can keep its own
// names, car numbers, colours, paint pattern and card numbers under 'ffv_names', as { apex: { team, driver, number,
// paint, stripe, paint2, pattern, stats: { wins, poles, podiums, titles, debut } }, ... }.
// FFV.rename() saves one team's, FFV.resetNames() goes back to the table below. Nothing typed on a device is ever
// sent anywhere or put into the app's own files: the game everyone downloads only ever has the made-up names here.
'use strict';
(function () {
    const TEAMS = [
        { id: 'apex',    team: 'Team Apex',        driver: 'Leo Hartwell',    number: 4,  paint: '#F4F6F8', stripe: '#FF6D00', paint2: '#00B8D9', pace: 0.9, top: 346, stats: { wins: 48, poles: 39, podiums: 121, titles: 4, debut: 1998 } },
        { id: 'nitro',   team: 'Nitro Racing',     driver: 'Tomas Varga',     number: 24, paint: '#1E3A8A', stripe: '#FFB300', paint2: '#F4F6F8', pace: 0.8, top: 351, stats: { wins: 31, poles: 52, podiums: 98, titles: 2, debut: 2004 } },
        { id: 'velocity', team: 'Velocity GP',     driver: 'Ines Calloway',   number: 7,  paint: '#00A86B', stripe: '#F4F6F8', paint2: '#1B1F26', pace: 1.0, top: 349, stats: { wins: 62, poles: 44, podiums: 140, titles: 5, debut: 2009 } },
        { id: 'bolt',    team: 'Bolt Motorsport',  driver: 'Kofi Adeyemi',    number: 11, paint: '#FFB300', stripe: '#1B1F26', paint2: '#E10600', pace: 0.6, top: 356, stats: { wins: 22, poles: 18, podiums: 77, titles: 1, debut: 1987 } },
        { id: 'rocket',  team: 'Rocket Racing',    driver: 'Ravi Kapoor',     number: 33, paint: '#1B1F26', stripe: '#C6FF00', paint2: '#9AA3AF', pace: 0.7, top: 358, stats: { wins: 27, poles: 61, podiums: 85, titles: 1, debut: 2012 } },
        { id: 'comet',   team: 'Comet Speed',      driver: 'Sofia Lindqvist', number: 18, paint: '#7E57C2', stripe: '#F4F6F8', paint2: '#00B8D9', pace: 0.5, top: 361, stats: { wins: 14, poles: 12, podiums: 58, titles: 0, debut: 2019 } },
        { id: 'peak',    team: 'Peak Performance', driver: 'Hana Morita',     number: 5,  paint: '#D81B60', stripe: '#F4F6F8', paint2: '#1B1F26', pace: 0.4, top: 339, stats: { wins: 19, poles: 9, podiums: 66, titles: 3, debut: 1979 } },
        { id: 'thunder', team: 'Thunder GP',       driver: 'Diego Ferrand',   number: 46, paint: '#00B8D9', stripe: '#1B1F26', paint2: '#FFB300', pace: 0.3, top: 363, stats: { wins: 9, poles: 23, podiums: 41, titles: 0, debut: 2016 } },
        { id: 'falcon',  team: 'Falcon Racing',    driver: 'Aisha Rahman',    number: 62, paint: '#FF6D00', stripe: '#1B1F26', paint2: '#C6FF00', pace: 0.2, top: 342, stats: { wins: 5, poles: 7, podiums: 34, titles: 2, debut: 1971 } },
        { id: 'storm',   team: 'Storm Motorsport', driver: 'Jack Winterton',  number: 88, paint: '#C6FF00', stripe: '#1B1F26', paint2: '#7E57C2', pace: 0.1, top: 365, stats: { wins: 3, poles: 4, podiums: 19, titles: 0, debut: 1966 } },
        { id: 'blaze',   team: 'Blaze Racing',     driver: 'Mateo Brandt',    number: 21, paint: '#C62828', stripe: '#F4F6F8', paint2: '#FFB300', pace: 0.55, top: 344, stats: { wins: 36, poles: 28, podiums: 104, titles: 3, debut: 1992 } }
    ];
    // Five more cards for the Driver Cards game only: famous old cars from this game's own made-up history. They never
    // race, cannot be changed on the My teams screen, and are made up like everything else here.
    const LEGENDS = [
        { id: 'legend-swift',     legend: true, team: 'Silver Swift',     driver: 'Rex Calder',   number: 1,  paint: '#C9CED6', stripe: '#C62828', paint2: '#1E3A8A', pattern: 'stripe',       top: 301, stats: { wins: 71, poles: 33, podiums: 96,  titles: 6, debut: 1958 } },
        { id: 'legend-whirlwind', legend: true, team: 'Whirlwind Racing', driver: 'Nora Ashby',   number: 3,  paint: '#0B6E4F', stripe: '#FFD600', paint2: '#F4F6F8', pattern: 'twin-stripe',  top: 312, stats: { wins: 44, poles: 68, podiums: 88,  titles: 3, debut: 1967 } },
        { id: 'legend-owl',       legend: true, team: 'Night Owl GP',     driver: 'Vic Marlowe',  number: 9,  paint: '#2A1B4D', stripe: '#FFB300', paint2: '#F4F6F8', pattern: 'side-stripes', top: 322, stats: { wins: 25, poles: 30, podiums: 152, titles: 2, debut: 1981 } },
        { id: 'legend-sunburst',  legend: true, team: 'Sunburst Motors',  driver: 'Carmen Solis', number: 12, paint: '#FFD600', stripe: '#E65100', paint2: '#1B1F26', pattern: 'lightning',    top: 331, stats: { wins: 58, poles: 41, podiums: 110, titles: 7, debut: 1988 } },
        { id: 'legend-icefox',    legend: true, team: 'Ice Fox Racing',   driver: 'Elsa Nyberg',  number: 27, paint: '#E8F4FA', stripe: '#00B8D9', paint2: '#1E3A8A', pattern: 'chevrons',     top: 368, stats: { wins: 12, poles: 72, podiums: 45,  titles: 1, debut: 1996 } }
    ];
    const YOU = 'You';                  // (how the player used to be named in the tables: now it is the driver's own name and the tag below)
    const YOU_TAG = '<span class="you-tag" aria-label="this is you">YOU</span>';
    const KEY = 'ffv_names', MAX = 30;  // (a name longer than this would not fit on the podium)
    // The paint patterns a team can have (the car painter's own styles: see liveryTexture in carmodel.js), by the plain
    // names used on the My teams screen and in a teams.csv file: [the painter's name for it, two-tone body?].
    // A team with no pattern of its own keeps the one its place in the list gives it.
    const PATTERNS = { plain: ['none', false], stripe: ['single', false], 'twin-stripe': ['twin', false], 'side-stripes': ['side', false], 'two-tone': ['none', true],
        chequer: ['chequer', false], lightning: ['lightning', false], racing: ['rally', false], bands: ['endurance', false], chevrons: ['gt', false] };
    const ORIGINAL = TEAMS.map(t => ({ ...t, stats: { ...t.stats } }));
    // The numbers on a Driver Card that a family can set (from teams.csv only). Whole numbers, each within its own limits;
    // anything else is ignored and the made-up number is used.
    const STAT_LIMITS = { wins: [0, 999], poles: [0, 999], podiums: [0, 999], titles: [0, 999], debut: [1950, 2100] };
    const stat = (k, v) => { const lim = STAT_LIMITS[k], str = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''; if (!lim || !/^\d{1,4}$/.test(str)) return null; const n = +str; return n >= lim[0] && n <= lim[1] ? n : null; };

    // a name typed on the device: plain text only, trimmed, not too long (it is still escaped wherever it is shown)
    const clean = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX) : '';
    const COLOURS = ['paint', 'stripe', 'paint2'];
    const colour = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : '';   // (only plain #RRGGBB colours)
    const number = v => { const n = Math.floor(+v); return Number.isFinite(n) && n >= 1 && n <= 99 ? n : 0; };
    const pattern = v => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PATTERNS, v.trim().toLowerCase()) ? v.trim().toLowerCase() : '';
    function saved() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
    function applyNames() {
        const own = saved();
        TEAMS.forEach((t, i) => {
            const o = own[t.id] && typeof own[t.id] === 'object' ? own[t.id] : {};
            t.team = clean(o.team) || ORIGINAL[i].team; t.driver = clean(o.driver) || ORIGINAL[i].driver;
            t.number = number(o.number) || ORIGINAL[i].number;
            for (const k of COLOURS) t[k] = colour(o[k]) || ORIGINAL[i][k];
            t.pattern = pattern(o.pattern);
            const st = o.stats && typeof o.stats === 'object' && !Array.isArray(o.stats) ? o.stats : {};
            t.stats = { ...ORIGINAL[i].stats }; t.ownStats = false;
            for (const k of Object.keys(STAT_LIMITS)) { const n = stat(k, st[k]); if (n != null) { t.stats[k] = n; if (n !== ORIGINAL[i].stats[k]) t.ownStats = true; } }
        });
    }
    applyNames();

    window.FFV = Object.assign(window.FFV || {}, {
        TEAMS, LEGENDS, YOU, youTag: YOU_TAG, PATTERNS, STAT_LIMITS, cleanStat: stat,
        teamIndex: id => TEAMS.findIndex(t => t.id === id),
        teamById: id => TEAMS.find(t => t.id === id) || null,
        original: id => { const i = TEAMS.findIndex(t => t.id === id); return i < 0 ? null : { ...ORIGINAL[i] }; },
        changed: () => TEAMS.some((t, i) => t.pattern || t.ownStats || ['team', 'driver', 'number', ...COLOURS].some(k => t[k] !== ORIGINAL[i][k])),
        cleanName: clean,
        // save one team's own names, number and colours (only the ones given; an empty one goes back to the table's)
        rename(id, names) {
            if (!TEAMS.some(t => t.id === id) || !names) return false;
            const own = saved(), o = own[id] && typeof own[id] === 'object' ? own[id] : {};
            if ('team' in names) o.team = clean(names.team);
            if ('driver' in names) o.driver = clean(names.driver);
            if ('number' in names) o.number = number(names.number);
            for (const k of COLOURS) if (k in names) o[k] = colour(names[k]);
            if ('pattern' in names) o.pattern = pattern(names.pattern);
            // (card numbers: each one given is kept if it is a sensible whole number, and otherwise goes back to the usual)
            if (names.stats && typeof names.stats === 'object') {
                const st = o.stats && typeof o.stats === 'object' && !Array.isArray(o.stats) ? o.stats : {};
                for (const k of Object.keys(STAT_LIMITS)) if (k in names.stats) { const n = stat(k, names.stats[k]); if (n == null) delete st[k]; else st[k] = n; }
                if (Object.keys(st).length) o.stats = st; else delete o.stats;
            }
            own[id] = o;
            try { localStorage.setItem(KEY, JSON.stringify(own)); } catch (e) { return false; }
            applyNames(); return true;
        },
        resetNames() { try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } applyNames(); },
        // What you have done in this game, on this device ('ffv_stats'): races, wins, podiums, poles and titles. Shown on
        // your own Driver Card. add('wins') counts one more.
        myStats: {
            KEYS: ['races', 'wins', 'podiums', 'poles', 'titles'],
            get() { let v = null; try { v = JSON.parse(localStorage.getItem('ffv_stats')); } catch (e) { /* none yet */ } const o = v && typeof v === 'object' ? v : {}; return Object.fromEntries(this.KEYS.map(k => [k, Number.isInteger(o[k]) && o[k] > 0 ? Math.min(o[k], 99999) : 0])); },
            add(k) { if (!this.KEYS.includes(k)) return; const o = this.get(); o[k]++; try { localStorage.setItem('ffv_stats', JSON.stringify(o)); } catch (e) { /* storage unavailable */ } }
        }
    });
})();
