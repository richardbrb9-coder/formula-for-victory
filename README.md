# Formula for Victory

A Grand Prix racing game for ages 9 to 12: single-seater racing cars on real circuits. A spin-off of the racing in
Supercar Legends. Plain JavaScript and three.js, installable (a PWA), and it works with no internet: nothing is loaded
from other websites.

**Phase 1 (this version):** the app, and one circuit, Monza, fully playable. Silverstone, Monaco, Suzuka and Las Vegas
are listed as "coming soon".

## How it fits together

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app: title, choose a circuit, set up a race, credits, Install button |
| `race.js` | The racing: driving, rivals, cameras, HUD, minimap, results, podium, replay, sound |
| `track.js` | Turns a circuit's data into the road: samples every 2 m, road, kerbs, run-off, barriers, grid, gantry |
| `circuits/index.js` | The list of circuits |
| `circuits/monza.geo.js` | Monza's centre line, made from OpenStreetMap by `tools/build_circuit.py` (do not edit by hand) |
| `circuits/monza.js` | Monza's widths, run-off areas, walls, fences and corner names (set by hand) |
| `circuits/monza-scenery.js` | Monza's surroundings: park trees, pits and podium, grandstands, the old banking, boards |
| `formula.js`, `carmodel.js`, `cockpit.js`, `suspension.js`, `damage.js`, `effects.js`, `post.js`, `reflections.js`, `soundfx.js`, `weather.js`, `scenery.js`, `trackdetail.js`, `standdata.js` | Carried over from Supercar Legends (some trimmed) |
| `sw.js`, `manifest.json`, `icon-*.png` | Installing and working offline |

## Adding a circuit

1. Put the OpenStreetMap data (Overpass `out geom` JSON) in `../research/osm/`.
2. Add the circuit to `CIRCUITS` in `tools/build_circuit.py` (the ways that make up the lap, in racing order, and where
   the start line is) and run `python3 tools/build_circuit.py <id>`. It prints the lap length next to the real one.
3. Write `circuits/<id>.js` (copy `monza.js`): widths, run-off zones, corner names, and `elevation` if the circuit has
   hills or crosses itself on a bridge.
4. Write its scenery file, switch it on in `circuits/index.js`, and add its files to `sw.js`.

## Rules for this game

- Made-up teams, drivers and sponsors only. No real series, team or sponsor names or logos. Real place names are fine.
- Crash damage changes how a car looks, never how it drives. Weather never changes grip.
- Everything saved on the device starts with `ffv_` (the owner's other apps share the same web address).
- `sw.js`: bump `CACHE_NAME` on every change; it only ever deletes caches starting `formula-for-victory-`.

## Credits

Circuit maps © OpenStreetMap contributors (ODbL). three.js (MIT). Fonts under the SIL Open Font Licence. Textures, skies
and tree models from Poly Haven (CC0). Engine recordings from Wikimedia Commons (see the Credits screen for each one).
