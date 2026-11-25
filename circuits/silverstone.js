// Formula for Victory: SILVERSTONE (Great Britain). 5.891 km, raced clockwise. The Grand Prix layout, starting on the
// Hamilton Straight in front of the Wing. The centre line comes from OpenStreetMap (see silverstone.geo.js); everything
// below is set by hand to match the real place: distances are metres round the lap from the start line; 'L' and 'R' are
// the driver's left and right.
import { GEO } from './silverstone.geo.js';
import { silverstoneScenery } from './silverstone-scenery.js';

export const SILVERSTONE = {
    id: 'silverstone', name: 'Silverstone', title: 'Silverstone Circuit', country: 'Great Britain', flag: '🇬🇧',
    about: 'An old wartime airfield, wide and fast. Flat out through Abbey and Copse, left-right-left-right through Maggotts and Becketts, then down the long Hangar Straight to Stowe.',
    theme: 'airfield', laps: 3, geo: GEO,
    // the road: 15 m wide nearly everywhere
    width: 15,
    widths: [[5700, 300, 16]],
    // Silverstone is on a plateau and very nearly flat
    elevation: null,
    // between the road and the wall: grass 8 m wide with a steel barrier, unless a zone below says otherwise.
    // Silverstone is famous for its huge asphalt run-off areas on the outside of the fast corners.
    runoff: { w: 8, surface: 'grass', barrier: 'steel' },
    zones: [
        // the Hamilton Straight: the pit wall on the right, a grandstand behind a fence on the left
        { from: 5740, to: 250, side: 'R', w: 4.5, barrier: 'concrete', fence: true },
        { from: 5720, to: 250, side: 'L', w: 6, fence: true },
        // Abbey (a very fast right) and Farm (left)
        { from: 260, to: 470, side: 'L', w: 30, surface: 'asphalt', tyres: true, fence: true, blend: 50 },
        { from: 250, to: 470, side: 'R', w: 6 },
        { from: 480, to: 640, side: 'R', w: 9, surface: 'asphalt' },
        // Village (a slow right) and the Loop (a slower left)
        { from: 700, to: 860, side: 'L', w: 28, surface: 'asphalt', tyres: true, fence: true, blend: 45 },
        { from: 770, to: 850, side: 'R', w: 5.5 },
        { from: 880, to: 1040, side: 'R', w: 26, surface: 'asphalt', tyres: true, blend: 40 },
        { from: 910, to: 1010, side: 'L', w: 5.5 },
        // Aintree, onto the Wellington Straight
        { from: 1100, to: 1230, side: 'R', w: 18, surface: 'asphalt', blend: 40 },
        // Brooklands (left) and Luffield (a long, long right)
        { from: 1740, to: 1960, side: 'R', w: 30, surface: 'gravel', tyres: true, fence: true, blend: 50 },
        { from: 1990, to: 2230, side: 'L', w: 24, surface: 'gravel', tyres: true, fence: true, blend: 40 },
        { from: 2330, to: 2540, side: 'L', w: 14, surface: 'asphalt', fence: true, blend: 40 },
        // the old pit straight: the old pit wall on the right, grandstands on the left
        { from: 2560, to: 2900, side: 'R', w: 4, barrier: 'concrete' },
        { from: 2560, to: 2900, side: 'L', w: 6, fence: true },
        // Copse: flat out, a big run-off outside
        { from: 2910, to: 3130, side: 'L', w: 30, surface: 'asphalt', tyres: true, fence: true, blend: 50 },
        // Maggotts, Becketts and Chapel: left, right, left, right, left
        { from: 3560, to: 3700, side: 'L', w: 20, surface: 'asphalt', tyres: true, blend: 40 },
        { from: 3710, to: 3860, side: 'R', w: 20, surface: 'asphalt', tyres: true, blend: 40 },
        { from: 3860, to: 4020, side: 'L', w: 22, surface: 'gravel', tyres: true, fence: true, blend: 40 },
        { from: 4040, to: 4160, side: 'R', w: 13, surface: 'asphalt', blend: 40 },
        // Stowe, at the end of the Hangar Straight: the biggest run-off of all
        { from: 4830, to: 5100, side: 'L', w: 38, surface: 'asphalt', tyres: true, fence: true, blend: 60 },
        // Vale (a slow left) and Club (the long right back to the start)
        { from: 5300, to: 5480, side: 'R', w: 22, surface: 'asphalt', tyres: true, blend: 40 },
        { from: 5385, to: 5470, side: 'L', w: 5.5 },
        { from: 5480, to: 5725, side: 'L', w: 24, surface: 'asphalt', tyres: true, fence: true, blend: 40 }
    ],
    // corner names, shown as you reach them
    corners: [[280, 'Abbey'], [490, 'Farm'], [770, 'Village'], [900, 'The Loop'], [1120, 'Aintree'], [1300, 'Wellington Straight'], [1800, 'Brooklands'],
              [2010, 'Luffield'], [2340, 'Woodcote'], [2930, 'Copse'], [3480, 'Maggotts'], [3720, 'Becketts'], [3880, 'Chapel'], [4250, 'Hangar Straight'],
              [4870, 'Stowe'], [5300, 'Vale'], [5490, 'Club']],
    scenery: silverstoneScenery
};
