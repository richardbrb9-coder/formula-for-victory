// Formula for Victory: JEDDAH (the Jeddah Corniche Circuit, Saudi Arabia). 6.174 km, raced anticlockwise along the
// shore of the Red Sea, and always at night under floodlights. A very fast street circuit: long, sweeping, flat-out
// curves between concrete walls, round a lagoon and back beside the sea.
// The centre line comes from OpenStreetMap (see jeddah.geo.js). Everything below is set by hand: distances are metres
// round the lap from the start line; 'L' and 'R' are the driver's left and right.
// No real company is named or copied anywhere here: every board and building in the game is made up. Corner names
// are plain ones (the real circuit only numbers its corners).
import { GEO } from './jeddah.geo.js';
import { jeddahScenery } from './jeddah-scenery.js';

// the light of a floodlit road at night (see lasvegas.js: the 'sun' is the glow of the floodlights from above), in
// clear weather, and under cloud, rain or snow: the same lights, with the sky and the haze changed. A touch warmer
// than Las Vegas: pale sand and palm trees under the lamps, and no neon.
const FLOODLIT = { sunEl: 66, sun: 2.4, sunColor: 0xfff4e6, hemi: 1.1, hemiSky: 0xd8dcee, hemiGround: 0x5a5040, env: 0.7, exposure: 1.08, grade: [1.04, 1.0, 1.0], sat: 1.12 };

export const JEDDAH = {
    id: 'jeddah', name: 'Jeddah', title: 'Jeddah Corniche Circuit', country: 'Saudi Arabia', flag: '🇸🇦',
    about: 'The fastest street circuit of all, on the shore of the Red Sea, and always raced at night. Long sweeping curves between the walls, a banked turn at the far end, then flat out beside the sea, with a lagoon full of boats in the middle and a giant fountain on the skyline.',
    theme: 'city', laps: 3, geo: GEO,
    time: 'night',              // always raced at night (see start in race.js: the menu offers no other time of day)
    floodlit: true,             // (the whole track is lit, so no headlight follows your car)
    // a wide, smooth road: 12 m, wider on the pit straight
    width: 12,
    widths: [[5420, 190, 14]],
    elevation: null,            // the sea front: flat
    tightWalls: true,           // a street circuit: the camera stays between the walls, and the rivals queue instead of barging
    heliHeight: 46,             // (the helicopter camera in replays flies above the floodlights)
    // between the road and the wall: a metre of asphalt, concrete blocks and a catch fence
    runoff: { w: 1.2, surface: 'asphalt', barrier: 'concrete', fence: true },
    // the pit box painted on the road for 5-lap races (see pitstop.js): on the pit wall's side (1 = the driver's left, -1 = the right), its middle this many metres past the start line
    pit: { side: 1, at: 56 },
    zones: [
        // the pit straight: the pit wall on the left
        { from: 5880, to: 180, side: 'L', w: 1.2, fence: false },
        // the first chicane (left, then right): a sandy escape area straight ahead, kerbs on the inside of each part
        { from: 150, to: 284, side: 'R', w: 10, surface: 'gravel', tyres: true, blend: 34 },
        { from: 212, to: 282, side: 'L', w: 2.2, blend: 10 },
        { from: 296, to: 366, side: 'R', w: 2.2, blend: 10 },
        { from: 288, to: 360, side: 'L', w: 3, blend: 12 },
        // turn four (left) and the long right-hander after it
        { from: 690, to: 800, side: 'R', w: 7, surface: 'gravel', tyres: true, blend: 26 },
        { from: 722, to: 796, side: 'L', w: 2, blend: 10 },
        { from: 822, to: 990, side: 'R', w: 2, blend: 12 },
        // the sweeps up the coast: left, left, right, right, left
        { from: 1000, to: 1150, side: 'L', w: 2, blend: 12 },
        { from: 1190, to: 1420, side: 'R', w: 2, blend: 12 },
        { from: 1436, to: 1524, side: 'L', w: 2, blend: 12 },
        { from: 1436, to: 1524, side: 'R', w: 4, surface: 'gravel', blend: 20 },
        // the banked turn at the northern end: a long, long left, with sand on the outside
        { from: 2050, to: 2410, side: 'R', w: 5.5, surface: 'gravel', blend: 30 },
        { from: 2084, to: 2396, side: 'L', w: 2.2, blend: 14 },
        // back down the coast: right, left, right, left
        { from: 2796, to: 2880, side: 'R', w: 2, blend: 10 },
        { from: 2800, to: 2890, side: 'L', w: 3.5, surface: 'gravel', blend: 16 },
        { from: 2890, to: 2990, side: 'L', w: 2, blend: 10 },
        { from: 2890, to: 2990, side: 'R', w: 4, surface: 'gravel', blend: 18 },
        // turn twenty-two (left) and the two rights after it: the only real braking on the way back
        { from: 3960, to: 4084, side: 'R', w: 6.5, surface: 'gravel', tyres: true, blend: 26 },
        { from: 4008, to: 4078, side: 'L', w: 2, blend: 10 },
        { from: 4112, to: 4300, side: 'R', w: 2, blend: 12 },
        // the last hairpin: the hardest braking on the lap, with a big sandy escape area
        { from: 5120, to: 5372, side: 'R', w: 12, surface: 'gravel', tyres: true, blend: 36 },
        { from: 5248, to: 5362, side: 'L', w: 2.4, blend: 12 }
    ],
    // corner names, shown as you reach them
    corners: [[205, 'First Chicane'], [700, 'Turn Four'], [820, 'The Long Right'], [1010, 'The Sweeps'], [1640, 'North Straight'], [2070, 'The Banked Turn'], [2440, 'Corniche Curves'],
              [2800, 'The Flick'], [3100, 'Flat Out by the Sea'], [3980, 'Turn Twenty-two'], [4440, 'Lagoon Curve'], [5200, 'Last Hairpin']],
    scenery: jeddahScenery,
    // The far distance (see backdrop.js): a dark, clear desert sky over the sea, the lights of the city along the land
    // side, and a warm glow where the sky meets them. The open sea fills the western half of the horizon.
    backdrop: {
        id: 'jeddah', sky: 'night', haze: 0x2c2a3a,
        looks: {
            night: { ...FLOODLIT, haze: 0x2c2a3a, seaHaze: 0x141c2c, tint: [0.72, 0.76, 0.98], hazeTop: 16, fog: [240, 1500] },
            cloudy: { ...FLOODLIT, sun: 2.2, haze: 0x3c3640, seaHaze: 0x1c2230, hazeTop: 32, top: 0x191820, fog: [200, 1200] },      // low cloud lit from below by the city
            rain: { ...FLOODLIT, sun: 2.0, hemi: 1.02, haze: 0x322e3a, seaHaze: 0x181c28, hazeTop: 40, top: 0x13121a, fog: [130, 800], sat: 1.05 },
            snow: { ...FLOODLIT, sun: 2.0, haze: 0x565060, seaHaze: 0x2a2c3a, hazeTop: 40, top: 0x282630, fog: [110, 700], sat: 1.0 }
        },
        horizon: { top: 9, bottom: -3, hazeTop: 1.1, hazeStrength: 0.5, layers: [
            { kind: 'ridge', from: 20, to: 160, height: 2.2, freq: 3, seed: 17, colour: 0x7a7488, haze: 0.55, sharp: 1.2, floor: 0.3, fade: 24 },     // low desert hills far inland
            { kind: 'skyline', from: 352, to: 188, height: 2.4, count: 420, seed: 8, colour: 0x2c2a34, haze: 0.3, fade: 14 },                        // the city, along the land side
            { kind: 'skyline', from: 100, to: 176, height: 4.6, count: 70, seed: 3, colour: 0x26262f, haze: 0.2, wide: 1.4, fade: 22 },              // the tall towers of the middle of town, down the coast
            { kind: 'sea', from: 190, to: 350 }
        ] }
    }
};
