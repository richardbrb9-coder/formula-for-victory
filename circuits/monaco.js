// Formula for Victory: MONACO (Circuit de Monaco). 3.337 km, raced clockwise through the streets of Monte Carlo.
// The centre line comes from OpenStreetMap (see monaco.geo.js). Everything below is set by hand to match the real place:
// distances are metres round the lap from the start line; 'L' and 'R' are the driver's left and right.
import { GEO } from './monaco.geo.js';
import { monacoScenery } from './monaco-scenery.js';

export const MONACO = {
    id: 'monaco', name: 'Monaco', title: 'Circuit de Monaco', country: 'Monaco', flag: '🇲🇨',
    about: 'The streets of Monte Carlo, with steel barriers right at the edge of the road. Up the hill to the casino, down round the slowest hairpin in racing, through the tunnel and back along the harbour past the yachts.',
    theme: 'riviera', laps: 3, geo: GEO,
    // a street circuit: narrow everywhere, a little wider on the start straight, in the casino square and round the hairpin
    width: 9,
    widths: [[3090, 170, 11], [870, 950, 11], [1228, 1312, 12.5], [1500, 1870, 10], [2060, 2180, 10]],
    // the height of the road above the sea, in metres: [metres round the lap, height]. From the harbour the road climbs
    // about 35 m up Beau Rivage to the casino square, then drops through Mirabeau, the hairpin and Portier back to the
    // sea front, where the tunnel brings it down to the quay.
    elevation: [[0, 6.5], [150, 7.5], [215, 9], [300, 13.5], [640, 37], [760, 40.5], [860, 42], [950, 41], [1110, 31], [1180, 28.5], [1270, 22.5],
                [1350, 17], [1440, 11.5], [1500, 9.5], [1880, 7], [2060, 3.2], [2170, 2.6], [2400, 2.6], [2900, 3], [3030, 4.2], [3200, 5.5]],
    // the tunnel under the hotel: [from, to]. Inside, the daylight fades and the tunnel's own lamps take over.
    tunnels: [[1492, 1878]], tunnelHeight: 5.6,
    tightWalls: true,           // (the camera must stay between the walls: there are buildings right behind them)
    heliHeight: 62,             // (the helicopter camera in replays flies above the rooftops)
    // between the road and the wall: nothing but a strip of pavement under a metre wide, a steel barrier and a catch fence
    runoff: { w: 0.9, surface: 'asphalt', barrier: 'steel', fence: true },
    // the pit box painted on the road for 5-lap races (see pitstop.js): on the pit wall's side (1 = the driver's left, -1 = the right), its middle this many metres past the start line
    pit: { side: -1, at: 56 },
    zones: [
        // the start straight: the pit wall on the right
        { from: 3050, to: 150, side: 'R', w: 1.1, barrier: 'concrete' },
        // Sainte Dévote: the escape road straight ahead
        { from: 150, to: 238, side: 'L', w: 11, tyres: true, blend: 24 },
        // the hairpin: a kerb on the inside, a touch more room outside
        { from: 1236, to: 1300, side: 'L', w: 1.7, blend: 8 },
        { from: 1236, to: 1300, side: 'R', w: 1.4, blend: 8 },
        // the tunnel: plain barriers, no fences
        { from: 1485, to: 1885, side: 'B', fence: false, blend: 4 },
        // the chicane out of the tunnel: the escape road straight ahead, kerbs through the middle
        { from: 2010, to: 2100, side: 'R', w: 9, tyres: true, blend: 24 },
        { from: 2075, to: 2170, side: 'L', w: 1.8, blend: 10 },
        { from: 2105, to: 2170, side: 'R', w: 1.8, blend: 10 },
        // Tabac and the Swimming Pool: kerbs on both sides through the two fast flicks
        { from: 2495, to: 2765, side: 'B', w: 1.8, blend: 12 },
        // La Rascasse and Anthony Noghès
        { from: 2885, to: 3030, side: 'B', w: 1.2, blend: 10 }
    ],
    // corner names, shown as you reach them
    corners: [[185, 'Sainte Dévote'], [320, 'Beau Rivage'], [650, 'Massenet'], [870, 'Casino'], [1105, 'Mirabeau'], [1235, 'Grand Hotel Hairpin'], [1400, 'Portier'],
              [1520, 'The Tunnel'], [2070, 'Nouvelle Chicane'], [2355, 'Tabac'], [2500, 'Swimming Pool'], [2880, 'La Rascasse'], [2960, 'Anthony Noghès']],
    scenery: monacoScenery,
    // The far distance (see backdrop.js): warm Mediterranean light. Steep limestone mountains behind the town with houses
    // climbing their lower slopes, a headland along the coast each way, and the open sea on the harbour side.
    backdrop: {
        id: 'monaco', sky: 'riviera', haze: 0xdbe1e3, seaHaze: 0x8fb9d0,
        looks: { sunny: { tint: [1.3, 1.36, 1.5], hazeTop: 8, sunEl: 43, sun: 3.0, sunColor: 0xfff0d2, hemi: 0.72, hemiSky: 0xc4dcff, hemiGround: 0x8a7a62, fog: [260, 1400], grade: [1.04, 1.0, 0.95], sat: 1.14 } },
        horizon: { top: 26, bottom: -3, hazeTop: 2.5, layers: [
            { kind: 'clouds', from: 240, to: 40, base: 14, height: 7, count: 9, seed: 2 },                                                                      // a few clouds sitting on the tops
            { kind: 'ridge', from: 205, to: 58, height: 13, freq: 3, seed: 31, colour: 0x8793a6, haze: 0.6, sharp: 1.3, fade: 22 },                              // the Alps behind
            { kind: 'ridge', from: 214, to: 48, height: 19, freq: 2, seed: 7, colour: 0x7a7d76, haze: 0.06, sharp: 1.5, floor: 0.3, fade: 26, facets: 1.4, scrub: 0.8 },   // grey limestone above the town, with scrub and pines
            { kind: 'town', from: 220, to: 42, height: 12, freq: 3, seed: 12, colour: 0x34492e, haze: 0.03, count: 1100, cover: 0.72, size: 0.85, fade: 20, scrub: 0.5 },   // dark green slopes, with the upper town climbing them
            { kind: 'ridge', from: 36, to: 66, height: 3.2, freq: 6, seed: 19, colour: 0x6f8366, haze: 0.45, fade: 14 },                                        // the headland up the coast
            { kind: 'ridge', from: 188, to: 226, height: 3.5, freq: 6, seed: 23, colour: 0x6f8366, haze: 0.45, fade: 14 },                                      // the headland down the coast
            { kind: 'sea', from: 52, to: 202 }
        ] }
    }
};
