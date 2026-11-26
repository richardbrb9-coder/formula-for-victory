// Formula for Victory: a team's car, ready for the car builder (carmodel.js). The racing (race.js) and the Driver Cards'
// pictures (cardart.js) both ask here, so a team's car and its driver's helmet look the same everywhere.
import { DEFAULT, applyPreset } from './carmodel.js';

const FFV = window.FFV;
// t: a team from teams.js (or one of the legends, for the cards). i: its place in the list, which picks the paint pattern
// and finish of a team that has not chosen its own.
export function designFor(t, i) {
    const d = applyPreset({ ...DEFAULT }, 'formula'), own = FFV.PATTERNS[t.pattern];   // (own: a paint pattern chosen on the My teams screen)
    return { ...d, name: t.team, driver: t.driver, teamIdx: i, logo: !t.legend && FFV.logoImage ? FFV.logoImage(t.id) : null, paint: t.paint, stripeColour: t.stripe, paint2: t.paint2, caliper: t.stripe,
        helmet: [t.paint, t.stripe, t.paint2],   // the driver's helmet, in the team's three colours
        livery: own ? own[0] : ['rally', 'endurance', 'gt'][i % 3], twoTone: own ? own[1] : d.twoTone, number: String(t.number), finish: ['gloss', 'metallic', 'gloss'][i % 3], tag: '' };
}
export function teamDesign(i) { const k = i % FFV.TEAMS.length; return designFor(FFV.TEAMS[k], k); }
