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
    scenery: monzaScenery
};
