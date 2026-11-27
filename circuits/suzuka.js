// Formula for Victory: SUZUKA (Suzuka Circuit, Japan). 5.807 km. The only figure of eight in Grand Prix racing: the first
// half of the lap turns clockwise, the second half anticlockwise, and the back straight crosses OVER the road between
// Degner and the Hairpin on a bridge.
// The centre line comes from OpenStreetMap (see suzuka.geo.js). Everything below is set by hand to match the real place:
// distances are metres round the lap from the start line; 'L' and 'R' are the driver's left and right.
// Corner names: the real ones, except where the real name is a sponsor's (this game shows no real brands). Those are
// called something plain instead: 'Hilltop Curve' (the long left-hander after the S Curves) and 'The Chicane'.
import { GEO } from './suzuka.geo.js';
import { suzukaScenery } from './suzuka-scenery.js';

export const SUZUKA = {
    id: 'suzuka', name: 'Suzuka', title: 'Suzuka Circuit', country: 'Japan', flag: '🇯🇵',
    about: 'A figure of eight in the wooded hills of Japan. Downhill to the First Curve, up through the snaking S Curves, under the bridge to the Hairpin, round the long Spoon Curve, then back over the bridge and flat out through 130R.',
    theme: 'forest', laps: 3, geo: GEO,
    // the road: 12 m wide, wider on the start straight, a little narrower through the S Curves and the chicane
    width: 12,
    widths: [[5480, 430, 15], [900, 1480, 11], [5190, 5320, 10.5]],
    // the height of the road in metres: [metres round the lap, height]. From the start the road runs downhill to the
    // First Curve (the lowest part), climbs all the way up through the S Curves and Hilltop Curve to Degner, dips under
    // the bridge, climbs again past the Hairpin to Spoon (the highest part), and comes back along the West Straight,
    // over the bridge, before dropping down through the chicane to the start. About 38 m from lowest to highest.
    elevation: [[0, 15], [240, 12], [420, 6.5], [520, 3.5], [700, 2], [900, 5], [1100, 11], [1300, 17], [1400, 20], [1600, 26], [1900, 33], [2100, 35.5],
                [2290, 33.5], [2380, 30.6], [2480, 30.6], [2600, 31.5], [2760, 33.5], [3000, 35.5], [3400, 38.5], [3650, 40], [3850, 38.6], [4200, 38.2],
                [4600, 37.8], [4700, 37.8], [4810, 37.8], [4900, 37], [5020, 34.5], [5220, 29.5], [5300, 27.5], [5440, 21.5], [5540, 18]],
    // where the track crosses itself: the West Straight goes over ('over': the part of the lap on the bridge's deck) and
    // the road from Degner to the Hairpin goes under ('under'; 'clear': the headroom beneath the bridge, in metres)
    crossover: { over: [4740, 4778], under: [2362, 2398], clear: 5.4 },
    heliHeight: 30,
    roadFar: 1100,              // (a section of road more than 1100 m away is deep in the haze: it is not drawn. See track.js)
    // between the road and the wall: grass 9 m wide with a steel barrier, unless a zone below says otherwise
    runoff: { w: 9, surface: 'grass', barrier: 'steel' },
    // the pit box painted on the road for 5-lap races (see pitstop.js): on the pit wall's side (1 = the driver's left, -1 = the right), its middle this many metres past the start line
    pit: { side: -1, at: 56 },
    zones: [
        // the main straight: the pit wall on the right, the big grandstand behind a fence on the left
        { from: 5450, to: 430, side: 'R', w: 3, barrier: 'concrete', fence: true },
        { from: 5500, to: 420, side: 'L', w: 5, fence: true },
        // the First Curve and the second: one long right-hander, with a huge gravel trap round the outside
        { from: 440, to: 800, side: 'L', w: 38, surface: 'gravel', tyres: true, fence: true, blend: 50 },
        { from: 480, to: 780, side: 'R', w: 7 },
        // the S Curves: left, right, left, and the right-hander of the Reverse Bank
        { from: 890, to: 1000, side: 'R', w: 18, surface: 'gravel', tyres: true, blend: 30 },
        { from: 1000, to: 1130, side: 'L', w: 18, surface: 'gravel', tyres: true, blend: 30 },
        { from: 1150, to: 1290, side: 'R', w: 18, surface: 'gravel', tyres: true, blend: 30 },
        { from: 1300, to: 1490, side: 'L', w: 20, surface: 'gravel', tyres: true, fence: true, blend: 30 },
        // Hilltop Curve: the long climbing left-hander
        { from: 1520, to: 1960, side: 'R', w: 20, surface: 'gravel', tyres: true, blend: 40 },
        // Degner: two quick right-handers
        { from: 2070, to: 2190, side: 'L', w: 22, surface: 'gravel', tyres: true, blend: 30 },
        { from: 2225, to: 2330, side: 'L', w: 17, surface: 'gravel', tyres: true, fence: true, blend: 24 },
        // under the bridge: concrete walls close to the road on both sides
        { from: 2340, to: 2420, side: 'B', w: 3, surface: 'asphalt', barrier: 'concrete', fence: false, tyres: false, blend: 18 },
        // the Hairpin: gravel straight ahead and round the outside, a narrow verge inside
        { from: 2600, to: 2830, side: 'R', w: 26, surface: 'gravel', tyres: true, fence: true, blend: 40 },
        { from: 2700, to: 2810, side: 'L', w: 6 },
        // the long fast right-hander up to Spoon
        { from: 2930, to: 3480, side: 'L', w: 11 },
        // Spoon Curve: a long double left-hander, gravel all the way round the outside
        { from: 3570, to: 3930, side: 'R', w: 30, surface: 'gravel', tyres: true, fence: true, blend: 50 },
        { from: 3640, to: 3880, side: 'L', w: 7 },
        // the bridge on the West Straight: concrete walls and fences at the road's edge
        { from: 4690, to: 4822, side: 'B', w: 1.5, surface: 'asphalt', barrier: 'concrete', fence: true, blend: 26 },
        // 130R: flat out, with a wide asphalt run-off outside (it starts where the walls of the bridge end)
        { from: 4862, to: 5010, side: 'R', w: 26, surface: 'asphalt', tyres: true, fence: true, blend: 26 },
        // the chicane: right then left. An escape road straight ahead, gravel on the way out
        { from: 5110, to: 5262, side: 'L', w: 20, surface: 'asphalt', tyres: true, blend: 40 },
        { from: 5250, to: 5330, side: 'R', w: 11, surface: 'gravel', blend: 20 },
        // the last curve, down onto the main straight
        { from: 5330, to: 5490, side: 'L', w: 13, surface: 'gravel', tyres: true, fence: true, blend: 30 }
    ],
    // corner names, shown as you reach them (kept at least 140 m apart, so two are never due at once)
    corners: [[470, 'First Curve'], [900, 'S Curves'], [1310, 'Reverse Bank'], [1540, 'Hilltop Curve'], [2110, 'Degner'], [2350, 'Under the Bridge'],
              [2700, 'Hairpin'], [3000, '200R'], [3600, 'Spoon Curve'], [4050, 'West Straight'], [4630, 'Over the Bridge'], [4800, '130R'], [5190, 'The Chicane'], [5340, 'Final Curve']],
    scenery: suzukaScenery,
    // The far distance (see backdrop.js): green wooded hills all round under a hazy blue sky, with the higher blue hills
    // of the mountains inland to the west.
    backdrop: {
        id: 'suzuka', sky: 'airfield', haze: 0xc9d9e2,
        looks: { sunny: { tint: [1.16, 1.3, 1.6], skySat: 1.45, hazeTop: 9, sunEl: 46, sun: 2.8, sunColor: 0xfff2dc, hemi: 0.8, hemiSky: 0xc6dcf2, hemiGround: 0x55663c, fog: [280, 1500], grade: [1.0, 1.01, 1.0], sat: 1.1 } },
        horizon: { top: 9, bottom: -3, hazeTop: 2.2, hazeStrength: 0.75, layers: [
            { kind: 'ridge', from: 200, to: 350, height: 5.2, freq: 3, seed: 14, colour: 0x7c93ab, haze: 0.6, sharp: 1.3, floor: 0.3, fade: 28, facets: 0.4 },    // the mountains inland, blue with distance
            { kind: 'ridge', height: 3.6, freq: 4, seed: 6, colour: 0x5f8468, haze: 0.42, floor: 0.45, facets: 0.3 },                                         // rounded green hills all the way round
            { kind: 'trees', height: 2.4, freq: 8, seed: 2, colour: 0x3f6b3a, haze: 0.26, floor: 0.55, crown: 0.2 },                                           // far woods
            { kind: 'trees', height: 1.5, freq: 13, seed: 9, colour: 0x2f5a2c, haze: 0.14, floor: 0.6, crown: 0.27 }                                          // nearer woods
        ] }
    }
};
