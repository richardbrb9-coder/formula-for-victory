// Formula for Victory: the teams and drivers. This is the ONE place their names, colours and car numbers are written
// down: the menus, the cars, the results, the podium and the championship all read them from here.
//
// RULES: every name here is made up. Never use a real team, driver, sponsor or brand, or the name of a real racing
// series. Drivers are only ever shown wearing a helmet: there are no faces to draw or describe.
//
// Each team: id (never change it: saved seasons remember teams by it), team, driver, number (on the car), paint (the main
// colour), stripe, paint2 (the second colour), and pace (0 to 1: how often this driver starts near the front in the
// championship; it does not make the car itself any quicker).
// The order matters too: a team's place in the list picks its paint pattern, and the menus remember your team by it.
//
// Renaming on one device (for later: there is no screen for it yet). A device can keep its own names under
// 'ffv_names', as { apex: { team: 'New team name', driver: 'New driver name' }, ... }. FFV.rename() saves one,
// FFV.resetNames() goes back to the names below. Colours and numbers are not changed by this.
'use strict';
(function () {
    const TEAMS = [
        { id: 'apex',    team: 'Team Apex',        driver: 'Leo Hartwell',    number: 4,  paint: '#F4F6F8', stripe: '#FF6D00', paint2: '#00B8D9', pace: 0.9 },
        { id: 'nitro',   team: 'Nitro Racing',     driver: 'Tomas Varga',     number: 24, paint: '#1E3A8A', stripe: '#FFB300', paint2: '#F4F6F8', pace: 0.8 },
        { id: 'velocity', team: 'Velocity GP',     driver: 'Ines Calloway',   number: 7,  paint: '#00A86B', stripe: '#F4F6F8', paint2: '#1B1F26', pace: 1.0 },
        { id: 'bolt',    team: 'Bolt Motorsport',  driver: 'Kofi Adeyemi',    number: 11, paint: '#FFB300', stripe: '#1B1F26', paint2: '#E10600', pace: 0.6 },
        { id: 'rocket',  team: 'Rocket Racing',    driver: 'Ravi Kapoor',     number: 33, paint: '#1B1F26', stripe: '#C6FF00', paint2: '#9AA3AF', pace: 0.7 },
        { id: 'comet',   team: 'Comet Speed',      driver: 'Sofia Lindqvist', number: 18, paint: '#7E57C2', stripe: '#F4F6F8', paint2: '#00B8D9', pace: 0.5 },
        { id: 'peak',    team: 'Peak Performance', driver: 'Hana Morita',     number: 5,  paint: '#D81B60', stripe: '#F4F6F8', paint2: '#1B1F26', pace: 0.4 },
        { id: 'thunder', team: 'Thunder GP',       driver: 'Diego Ferrand',   number: 46, paint: '#00B8D9', stripe: '#1B1F26', paint2: '#FFB300', pace: 0.3 },
        { id: 'falcon',  team: 'Falcon Racing',    driver: 'Aisha Rahman',    number: 62, paint: '#FF6D00', stripe: '#1B1F26', paint2: '#C6FF00', pace: 0.2 },
        { id: 'storm',   team: 'Storm Motorsport', driver: 'Jack Winterton',  number: 88, paint: '#C6FF00', stripe: '#1B1F26', paint2: '#7E57C2', pace: 0.1 }
    ];
    const YOU = 'You';                  // what the player is called in every table
    const KEY = 'ffv_names', MAX = 24;  // (a name longer than this would not fit on the podium)
    const ORIGINAL = TEAMS.map(t => ({ team: t.team, driver: t.driver }));

    // a name typed on the device: plain text only, trimmed, not too long (it is still escaped wherever it is shown)
    const clean = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX) : '';
    function saved() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
    function applyNames() {
        const own = saved();
        TEAMS.forEach((t, i) => {
            const o = own[t.id] && typeof own[t.id] === 'object' ? own[t.id] : {};
            t.team = clean(o.team) || ORIGINAL[i].team; t.driver = clean(o.driver) || ORIGINAL[i].driver;
        });
    }
    applyNames();

    window.FFV = Object.assign(window.FFV || {}, {
        TEAMS, YOU,
        teamIndex: id => TEAMS.findIndex(t => t.id === id),
        teamById: id => TEAMS.find(t => t.id === id) || null,
        // (for the renaming screen, when there is one)
        rename(id, names) {
            if (!TEAMS.some(t => t.id === id) || !names) return false;
            const own = saved(), o = own[id] && typeof own[id] === 'object' ? own[id] : {};
            if ('team' in names) o.team = clean(names.team);
            if ('driver' in names) o.driver = clean(names.driver);
            own[id] = o;
            try { localStorage.setItem(KEY, JSON.stringify(own)); } catch (e) { return false; }
            applyNames(); return true;
        },
        resetNames() { try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } applyNames(); }
    });
})();
