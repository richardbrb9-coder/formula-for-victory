// Formula for Victory: the list of circuits. Each one is its own data file, loaded only when it is chosen.
// time: 'night' marks a circuit that is always raced at night (the menus show a moon for it).
// To add a circuit: trace it with tools/build_circuit.py, write its data file (see monza.js), and switch it on here.
export const CIRCUITS = [
    { id: 'monza', name: 'Monza', country: 'Italy', flag: '🇮🇹', km: 5.793, blurb: 'The Temple of Speed: long straights through a royal park, three chicanes and the sweeping Parabolica.',
      load: () => import('./monza.js').then(m => m.MONZA) },
    { id: 'silverstone', name: 'Silverstone', country: 'Great Britain', flag: '🇬🇧', km: 5.891, blurb: 'Fast, flowing bends on an old airfield: Copse, Maggotts and Becketts, and the long Hangar Straight.',
      load: () => import('./silverstone.js').then(m => m.SILVERSTONE) },
    { id: 'monaco', name: 'Monaco', country: 'Monaco', flag: '🇲🇨', km: 3.337, blurb: 'Tight streets between the walls: up the hill to the casino, round the slowest hairpin in racing, through the tunnel and along the harbour.',
      load: () => import('./monaco.js').then(m => m.MONACO) },
    { id: 'suzuka', name: 'Suzuka', country: 'Japan', flag: '🇯🇵', km: 5.807, blurb: 'A figure of eight in the wooded hills: the snaking S Curves, the Hairpin, Spoon, and a bridge where the track crosses over itself.',
      load: () => import('./suzuka.js').then(m => m.SUZUKA) },
    { id: 'lasvegas', name: 'Las Vegas', country: 'USA', flag: '🇺🇸', km: 6.201, time: 'night', blurb: 'A night race through a city of lights: walls at the edge of the road, a giant glowing globe, and flat out down the famous Strip.',
      load: () => import('./lasvegas.js').then(m => m.LASVEGAS) },
    { id: 'jeddah', name: 'Jeddah', country: 'Saudi Arabia', flag: '🇸🇦', km: 6.174, time: 'night', blurb: 'The fastest street circuit of all, at night beside the Red Sea: sweeping curves between the walls, a lagoon full of boats, and a giant fountain on the skyline.',
      load: () => import('./jeddah.js').then(m => m.JEDDAH) }
];
// a small picture of a circuit's shape for the menus (only for circuits that are ready)
export const OUTLINES = {};
