# Formula for Victory

A Grand Prix racing game for ages 9 to 12: single-seater racing cars on real circuits. A spin-off of the racing in
Supercar Legends. Plain JavaScript and three.js, installable (a PWA), and it works with no internet: nothing is loaded
from other websites.

**Phase 2 (this version):** the app, and three circuits fully playable: Monza, Silverstone and Monaco. Suzuka and
Las Vegas are listed as "coming soon".

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
| `circuits/silverstone*.js` | Silverstone: the same three files. An old airfield: runways, the Wing, big run-offs, grass banks, hedges |
| `circuits/monaco*.js` | Monaco: the same three files. A hilly street circuit: the town, the casino, the tunnel, the harbour |
| `circuits/common.js` | Scenery parts Silverstone and Monaco share: grandstand lists, boards, a pit lane ribbon, the podium stand |
| `formula.js`, `carmodel.js`, `cockpit.js`, `suspension.js`, `damage.js`, `effects.js`, `post.js`, `reflections.js`, `soundfx.js`, `weather.js`, `scenery.js`, `trackdetail.js`, `standdata.js` | Carried over from Supercar Legends (some trimmed) |
| `sw.js`, `manifest.json`, `icon-*.png` | Installing and working offline |

## Adding a circuit

1. Put the OpenStreetMap data (Overpass `out geom` JSON) in `../research/osm/`.
2. Add the circuit to `CIRCUITS` in `tools/build_circuit.py` (the ways that make up the lap, in racing order, and where
   the start line is) and run `python3 tools/build_circuit.py <id>`. It prints the lap length next to the real one.
   (The map file can be a list of ways, like Monza and Silverstone, or one 'circuit' relation, like Monaco.)
3. Write `circuits/<id>.js` (copy `monza.js`): widths, run-off zones, corner names, and `elevation` if the circuit has
   hills or crosses itself on a bridge (see `monaco.js`: heights in metres at points round the lap, joined by slopes and
   rounded off). A street circuit also sets `tightWalls` (keeps the camera between the walls) and lists its `tunnels`.
4. Write its scenery file, switch it on in `circuits/index.js`, and add its files to `sw.js`.

## Hills, tunnels and street circuits

- Every sample of the track carries its own height and slope. Cars, the camera, the ghost, the podium, replays, sparks and
  smoke all sit at the road's height, so nothing assumes the ground is at zero.
- The scenery must follow the road too. Monaco's ground is worked out from the road's heights (`land()` in
  `monaco-scenery.js`) and is always kept a little below the road near it; pavements and retaining walls cover the join.
- In a tunnel the daylight is faded out while you are inside (`tunnelLight` in `race.js`), the tunnel's walls and lamps
  are drawn at their own brightness, and a sheet of white light covers each mouth from the inside.
- Where the wall is closer than a kerb's width to the road, no kerb is drawn or felt.

## Rules for this game

- Made-up teams, drivers and sponsors only. No real series, team or sponsor names or logos. Real place names are fine.
- Crash damage changes how a car looks, never how it drives. Weather never changes grip.
- Everything saved on the device starts with `ffv_` (the owner's other apps share the same web address).
- `sw.js`: bump `CACHE_NAME` on every change; it only ever deletes caches starting `formula-for-victory-`.
- Keep the number of separate things drawn low (tablets): build scenery, then bake it with `SC.mergeStatic` (one mesh per
  material), share materials between copies, and plant all of a circuit's trees in one `SC.plantTrees` call. Rivals are drawn
  in full only when they are among the nearest few; each car's shadow comes from one simple shape on layer 1.

## Credits

Circuit maps © OpenStreetMap contributors (ODbL). three.js (MIT). Fonts under the SIL Open Font Licence. Textures, skies
and tree models from Poly Haven (CC0). Engine recordings from Wikimedia Commons (see the Credits screen for each one).
