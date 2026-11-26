// Formula for Victory: LAS VEGAS (the Las Vegas Strip Circuit, USA). 6.201 km, raced anticlockwise through the city's
// streets, and always at night under floodlights. Its long, long straight runs down the middle of the Strip.
// The centre line comes from OpenStreetMap (see lasvegas.geo.js). Everything below is set by hand: distances are metres
// round the lap from the start line; 'L' and 'R' are the driver's left and right.
// No real hotel, casino or company is named or copied anywhere here: every sign and building in the game is made up.
// Corner names are plain ones (the real circuit only numbers its corners); street names are the real streets.
import { GEO } from './lasvegas.geo.js';
import { lasVegasScenery } from './lasvegas-scenery.js';

// the light of a floodlit street at night (the 'sun' here is the glow of the floodlights from above: as strong as
// daylight on the road, the cars and the grandstands, while the buildings, which are dark, stay dark), in clear
// weather, and under cloud, rain or snow: the same lights, with the sky and the haze changed
const FLOODLIT = { sunEl: 64, sun: 2.4, sunColor: 0xeef1ff, hemi: 1.15, hemiSky: 0xd6dcf2, hemiGround: 0x4a443e, env: 0.7, exposure: 1.08, grade: [1.03, 1.0, 1.05], sat: 1.14 };

export const LASVEGAS = {
    id: 'lasvegas', name: 'Las Vegas', title: 'Las Vegas Strip Circuit', country: 'USA', flag: '🇺🇸',
    about: 'A night race through a city of lights. Round the hairpin, up Koval Lane, round the giant glowing globe, then flat out for nearly two kilometres down the famous Strip, with walls right at the edge of the road.',
    theme: 'city', laps: 3, geo: GEO,
    time: 'night',              // always raced at night (see start in race.js: the menu offers no other time of day)
    floodlit: true,             // (the whole track is lit, so no headlight follows your car)
    // wide city streets: 13 m, wider on the start straight and down the Strip
    width: 13,
    widths: [[5990, 170, 14], [3210, 5050, 15]],
    elevation: null,            // the valley floor: flat
    tightWalls: true,           // a street circuit: the camera stays between the walls, and the rivals queue instead of barging
    heliHeight: 50,             // (the helicopter camera in replays flies above the buildings along the road)
    // between the road and the wall: a metre of asphalt, concrete blocks and a catch fence
    runoff: { w: 1.0, surface: 'asphalt', barrier: 'concrete', fence: true },
    zones: [
        // the start straight: the pit wall on the left
        { from: 5990, to: 180, side: 'L', w: 1.2, fence: false },
        // the first hairpin: an escape road straight ahead, a kerb on the inside
        { from: 120, to: 400, side: 'R', w: 9, tyres: true, blend: 34 },
        { from: 190, to: 362, side: 'L', w: 2.2, blend: 12 },
        // the long right-hander out of the paddock and the kink onto Koval Lane
        { from: 420, to: 650, side: 'L', w: 6, tyres: true, blend: 26 },
        { from: 430, to: 642, side: 'R', w: 2, blend: 12 },
        // turn five, at the end of Koval Lane: a square right-hander with an escape road
        { from: 1430, to: 1536, side: 'L', w: 8, tyres: true, blend: 26 },
        { from: 1494, to: 1540, side: 'R', w: 2, blend: 10 },
        // round the globe: fast left-handers, then left, right and left again
        { from: 1745, to: 1950, side: 'B', w: 1.9, blend: 14 },
        { from: 1910, to: 2000, side: 'R', w: 7, tyres: true, blend: 22 },
        { from: 1954, to: 1996, side: 'L', w: 2, blend: 8 },
        { from: 1998, to: 2100, side: 'L', w: 4.5, tyres: true, blend: 18 },
        { from: 2004, to: 2096, side: 'R', w: 2, blend: 10 },
        { from: 2105, to: 2206, side: 'R', w: 7, tyres: true, blend: 22 },
        { from: 2160, to: 2204, side: 'L', w: 2, blend: 8 },
        // the wiggle: right then left
        { from: 2470, to: 2560, side: 'B', w: 2.2, blend: 14 },
        // turn twelve, onto the Strip
        { from: 3070, to: 3190, side: 'R', w: 9, tyres: true, blend: 28 },
        { from: 3140, to: 3186, side: 'L', w: 2, blend: 10 },
        // the end of the Strip: the hardest braking on the lap, with a long escape road, then left and left again
        { from: 4990, to: 5112, side: 'R', w: 11, tyres: true, blend: 34 },
        { from: 5064, to: 5110, side: 'L', w: 2.2, blend: 10 },
        { from: 5184, to: 5256, side: 'B', w: 2, blend: 14 }
    ],
    // corner names, shown as you reach them
    corners: [[150, 'First Hairpin'], [430, 'Paddock Curve'], [720, 'Koval Lane'], [1470, 'Turn Five'], [1750, 'Round the Globe'], [2150, 'Turn Nine'], [2470, 'The Wiggle'],
              [3110, 'Turn Twelve'], [3330, 'The Strip'], [5020, 'Turn Fourteen'], [5300, 'Harmon Avenue'], [5930, 'Last Corner']],
    scenery: lasVegasScenery,
    // The far distance (see backdrop.js): the lights of the city all round the horizon, dark desert mountains behind
    // them, and a dark sky that glows a dusty purple where it meets the city.
    backdrop: {
        id: 'lasvegas', sky: 'night', haze: 0x3a2b3d,
        looks: {
            night: { ...FLOODLIT, haze: 0x3a2b3d, tint: [0.7, 0.72, 0.95], hazeTop: 20, fog: [240, 1500] },
            cloudy: { ...FLOODLIT, sun: 2.2, haze: 0x45384a, hazeTop: 34, top: 0x1b1722, fog: [200, 1200] },                           // low cloud lit from below by the city
            rain: { ...FLOODLIT, sun: 2.0, hemi: 1.05, haze: 0x372f40, hazeTop: 40, top: 0x14121b, fog: [130, 800], sat: 1.06 },
            snow: { ...FLOODLIT, sun: 2.0, haze: 0x5a5262, hazeTop: 40, top: 0x2a2632, fog: [110, 700], sat: 1.0 }
        },
        horizon: { top: 9, bottom: -3, hazeTop: 1.1, hazeStrength: 0.55, layers: [
            { kind: 'ridge', height: 3.4, freq: 3, seed: 41, colour: 0x8a7f96, haze: 0.5, sharp: 1.4, floor: 0.3, facets: 0.5 },     // the desert mountains all round the valley
            { kind: 'skyline', height: 2.6, count: 520, seed: 5, colour: 0x2a2e3a, haze: 0.3 },                                      // the city, far and wide
            { kind: 'skyline', from: 150, to: 330, height: 5.2, count: 130, seed: 9, colour: 0x242834, haze: 0.2, wide: 1.5, fade: 30 }   // the tall towers of the middle of town
        ] }
    }
};
