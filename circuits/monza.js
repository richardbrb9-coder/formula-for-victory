// Formula for Victory: MONZA (Autodromo Nazionale Monza, Italy). 5.793 km, raced clockwise.
// The centre line comes from OpenStreetMap (see monza.geo.js). Everything below is set by hand to match the real place:
// distances are metres round the lap from the start line; 'L' and 'R' are the driver's left and right.
import { GEO } from './monza.geo.js';
import { monzaScenery } from './monza-scenery.js';

export const MONZA = {
    id: 'monza', name: 'Monza', title: 'Autodromo Nazionale Monza', country: 'Italy', flag: '🇮🇹',
    about: 'The Temple of Speed. Flat out down the long straights through the park, hard on the brakes for the three chicanes, then the long Parabolica back to the line.',
    theme: 'park', laps: 3, geo: GEO,
    // the road: 12 m wide, wider on the start straight, narrower through the chicanes
    width: 12,
    widths: [[5450, 560, 14], [600, 720, 10], [1830, 1920, 10], [3700, 3890, 11]],
    // the height of the road round the lap. Monza is very nearly flat, so there is nothing here.
    // (A hilly circuit lists [metres, height] pairs; a circuit that crosses itself just gives the bridge its height.)
    elevation: null,
    // between the road and the wall: grass 6 m wide with a steel barrier, unless a zone below says otherwise
    runoff: { w: 6, surface: 'grass', barrier: 'steel' },
    zones: [
        // the start straight: pit wall on the right, grandstands behind a fence on the left
        { from: 5230, to: 210, side: 'R', w: 2.5, barrier: 'concrete', fence: true },
        { from: 210, to: 560, side: 'R', w: 3 },
        { from: 5330, to: 520, side: 'L', w: 4, fence: true },
        // Variante del Rettifilo (first chicane, right then left): an asphalt escape road straight ahead
        { from: 560, to: 705, side: 'L', w: 17, surface: 'asphalt', tyres: true },
        { from: 640, to: 760, side: 'R', w: 9, surface: 'gravel' },
        // Curva Biassono, the 'Curva Grande': a long fast right-hander with gravel on the outside
        { from: 960, to: 1500, side: 'L', w: 13, surface: 'gravel', tyres: true },
        // Variante della Roggia (second chicane, left then right)
        { from: 1770, to: 1905, side: 'R', w: 14, surface: 'asphalt', tyres: true },
        { from: 1860, to: 1970, side: 'L', w: 9, surface: 'gravel' },
        // the two Lesmo corners
        { from: 2160, to: 2370, side: 'L', w: 14, surface: 'gravel', tyres: true },
        { from: 2530, to: 2650, side: 'L', w: 12, surface: 'gravel', tyres: true },
        // under the old banking: the bridge's walls stand close to the road
        { from: 3286, to: 3330, side: 'B', w: 2.5, barrier: 'concrete', blend: 22 },
        // Variante Ascari (left, right, left)
        { from: 3660, to: 3790, side: 'R', w: 14, surface: 'gravel', tyres: true },
        { from: 3770, to: 3905, side: 'L', w: 12, surface: 'gravel' },
        // Curva Alboreto, the 'Parabolica': a long right-hander that opens out onto the start straight
        { from: 4780, to: 5210, side: 'L', w: 18, surface: 'gravel', tyres: true, fence: true }
    ],
    // corner names, shown as you reach them
    corners: [[590, 'Variante del Rettifilo'], [1000, 'Curva Grande'], [1800, 'Variante della Roggia'], [2180, 'Lesmo 1'], [2540, 'Lesmo 2'],
              [2940, 'Curva del Serraglio'], [3660, 'Variante Ascari'], [4780, 'Parabolica']],
    scenery: monzaScenery,
    // The far distance (see backdrop.js): a golden afternoon in the park. Thick woods all round, the foothills and then
    // the snowy Alps away to the north, and a warm haze that the trees fade into.
    backdrop: {
        id: 'monza', sky: 'park', haze: 0xeadfc8,
        looks: { sunny: { tint: [1.42, 1.36, 1.3], hazeTop: 11, sunEl: 27, sun: 2.9, sunColor: 0xffe2b8, hemi: 0.78, hemiSky: 0xd4e2f4, hemiGround: 0x5a5a38, fog: [170, 1300], grade: [1.035, 1.0, 0.945], sat: 1.1 } },
        horizon: { top: 9, bottom: -3, hazeTop: 2.2, layers: [
            { kind: 'ridge', from: 300, to: 60, base: 0.3, height: 3.4, freq: 5, seed: 11, sharp: 1.6, floor: 0.25, colour: 0x8a9ab0, haze: 0.72, snow: 0.45, fade: 25 },   // the Alps
            { kind: 'ridge', from: 280, to: 80, height: 1.9, freq: 4, seed: 5, colour: 0x6f8a80, haze: 0.62, fade: 30, facets: 0.5 },                                   // the foothills
            { kind: 'trees', height: 1.5, freq: 9, seed: 3, colour: 0x4b6b3c, haze: 0.5, floor: 0.6, crown: 0.2 },                                                      // far woods, all the way round
            { kind: 'trees', height: 1.0, freq: 14, seed: 8, colour: 0x3d5e30, haze: 0.3, floor: 0.6, crown: 0.26 }                                                     // nearer woods
        ] }
    }
};
