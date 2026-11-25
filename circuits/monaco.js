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
    scenery: monacoScenery
};
