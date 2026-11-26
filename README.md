# Formula for Victory

A Grand Prix racing game for ages 9 to 12: single-seater racing cars on real circuits. A spin-off of the racing in
Supercar Legends. Plain JavaScript and three.js, installable (a PWA), and it works with no internet: nothing is loaded
from other websites.

**Phase 4 (this version):** a championship season across all five circuits, a main menu with Championship, Quick
race and Time trial, a How to play screen, Settings (with a volume control), and a crowd, countdown and fanfare made in
code. The five circuits: Monza, Silverstone, Monaco, Suzuka (a figure of eight: the track crosses over itself on a
bridge) and Las Vegas (a street circuit, always raced at night).

## How it fits together

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app: title and main menu, choose a circuit, set up a race, How to play, Settings, credits, Install button |
| `teams.js` | **The one place** for every team name, driver name, team colour and car number |
| `myteams.js` | My teams: a family's own names, colours and logos, kept on their device only |
| `season.js` | The championship's rules: the order of the races, the points, the tables, saving and mending a season |
| `championship.js` | The championship's screens: a new season, the season so far, after each race, the champion |
| `sound.js` | The volume control every sound goes through, menu taps, countdown beeps, the crowd and the fanfare |
| `race.js` | The racing: driving, rivals, cameras, HUD, minimap, results, podium, replay, sound |
| `track.js` | Turns a circuit's data into the road: samples every 2 m, road, kerbs, run-off, barriers, grid, gantry |
| `circuits/index.js` | The list of circuits |
| `circuits/monza.geo.js` | Monza's centre line, made from OpenStreetMap by `tools/build_circuit.py` (do not edit by hand) |
| `circuits/monza.js` | Monza's widths, run-off areas, walls, fences and corner names (set by hand) |
| `circuits/monza-scenery.js` | Monza's surroundings: park trees, pits and podium, grandstands, the old banking, boards |
| `circuits/silverstone*.js` | Silverstone: the same three files. An old airfield: runways, the Wing, big run-offs, grass banks, hedges |
| `circuits/monaco*.js` | Monaco: the same three files. A hilly street circuit: the town, the casino, the tunnel, the harbour |
| `circuits/suzuka*.js` | Suzuka: the same three files. A figure of eight in wooded hills: the bridge, gravel traps, the amusement park and its big wheel |
| `circuits/lasvegas*.js` | Las Vegas: the same three files. A night street circuit: floodlights, glowing towers and made-up neon signs, the giant globe |
| `circuits/common.js` | Scenery parts the newer circuits share: grandstand lists, boards, a pit lane ribbon, the podium stand |
| `backdrop.js` | The far distance: each circuit's photographed sky, painted horizon, haze, light and colour grade |
| `tools/bake_sky.py` | Turns a Poly Haven sky photo (.hdr) into the two small pictures the game uses |
| `formula.js`, `carmodel.js`, `cockpit.js`, `suspension.js`, `damage.js`, `effects.js`, `post.js`, `reflections.js`, `soundfx.js`, `weather.js`, `scenery.js`, `trackdetail.js`, `standdata.js` | Carried over from Supercar Legends (some trimmed) |
| `sw.js`, `manifest.json`, `icon-*.png` | Installing and working offline |

## Teams and drivers (`teams.js`)

- Every team name, driver name, colour and car number is in the table at the top of `teams.js`, and nowhere else. To
  change one, change it there. Never change a team's `id`: saved seasons remember teams by it.
- All of them are made up, and must stay made up: no real teams, drivers, sponsors or brands, and never the name of a
  real racing series. Drivers are only ever shown in a helmet.
- There are eleven teams, so eleven cars on the grid. Add a team to the table and the grid, the results, the points
  tables and the championship all follow (points still go to the top ten only).

## My teams (`myteams.js`): a family's own names and logos, on their own device only

- Settings → My teams lets a family rename the eleven teams and drivers, change car numbers and colours, and load a
  logo picture for each team from the tablet's own files (several at once, or one zip of them).
- **Nothing a family types or loads is ever part of this app.** Names, numbers and colours are kept in the browser's
  storage (`ffv_names`); logos in the browser's own database (`ffv_teams`). They are never uploaded, never in this
  repository, never in the service worker's saved files. The game everyone downloads has the made-up names in
  `teams.js` and no logos. **Never put a real team's name or logo in the code, the tests, the pictures or a commit.**
- Safety: a loaded file is never put into the page as markup. It is opened only as a picture (an `<img>` from a blob
  address, where a script inside an SVG cannot run), drawn onto a canvas no bigger than 256 pixels, and only that PNG
  is kept. Limits: 2 MB a file, 30 files, zips opened in the browser with `DecompressionStream` (no library).
- Logos show beside names in every table (`FFV.badge`) and are painted into each car's livery picture once, as the
  race is built (`formulaTeam` in `formula.js`): no extra things to draw while racing.
- "Clear my teams" (tap twice) wipes the names, colours and logos. `FFV.resetNames()` does the names alone.
- Test with your own plain shapes (a coloured square with "T1" on it), never with real logos.

## The championship

- Five races in the order set by `ROUNDS` in `season.js` (Monza, Silverstone, Suzuka, Monaco, Las Vegas), each with its
  own weather (looks only). Points for the top ten: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 (`POINTS`).
- The season is saved under `ffv_champ` the moment you cross the line (`onFinish` in `championship.js`). Only the
  finishing orders are saved; points and tables are always worked out again from them, so they can't disagree.
- A race you leave part-way was never saved, so it starts again from the grid. Recording a race only ever fills in the
  next race of the season, so nothing can be counted twice. `check()` mends old or damaged saves.
- The rivals' places on the grid come from each driver's `pace` in `teams.js` plus some luck (`grid()`); the cars
  themselves are as quick as in a single race. With eleven teams of one car each, the teams' table follows the drivers'.
- Testing: `window.__autopilot = true` (or `__kidbot`), `__noGridCam = true` and `__timeScale = 4` play a race quickly.
  Keep `__timeScale` at 4 or less: higher than that the cars' springs go wrong and the bodies vanish from the podium.

## Sound

- Every sound must go to `window.audioOut()` (never straight to the speakers), so the volume and mute work on it.
- `ffv_raceSound` is the mute and `ffv_volume` is 1, 2 or 3. The loudspeaker button, Settings and the racing screen's
  Sound button all change the same setting.
- When the app is hidden the whole sound system is put to sleep; cheers and the fanfare are cut off on leaving a screen.

## Adding a circuit

1. Put the OpenStreetMap data (Overpass `out geom` JSON) in `../research/osm/`.
2. Add the circuit to `CIRCUITS` in `tools/build_circuit.py` (the ways that make up the lap, in racing order, and where
   the start line is) and run `python3 tools/build_circuit.py <id>`. It prints the lap length next to the real one.
   (The map file can be a list of ways, like Monza and Silverstone, or one 'circuit' relation, like Monaco.)
3. Write `circuits/<id>.js` (copy `monza.js`): widths, run-off zones, corner names, and `elevation` if the circuit has
   hills or crosses itself on a bridge (see `monaco.js`: heights in metres at points round the lap, joined by slopes and
   rounded off). A street circuit also sets `tightWalls` (keeps the camera between the walls) and lists its `tunnels`.
4. Write its scenery file, switch it on in `circuits/index.js`, add its files to `sw.js`, and give it a place in the
   season (`ROUNDS` in `season.js`).
5. Give it a `backdrop` (see `monaco.js` and the notes at the top of `backdrop.js`): which sky photo, the colour of the
   haze, its light and colour grade, and the layers of its painted horizon (ridges, woods, fields, a town, the sea,
   by compass bearing). A new sky photo is made with `tools/bake_sky.py` and listed in `SKIES` in `backdrop.js`, in
   `sw.js` and in the credits. A circuit with no `backdrop` gets the plain day sky and haze.

## The far distance and baked shading

- The sky photo and the painted horizon are drawn together as one thing, last of all, so they only fill the part of the
  screen where sky shows. The bottom of the sky, the foot of the painted hills and the fog are one colour, so the scenery
  has no visible end. Ground must reach past the end of the fog (the grass and sea sheets do).
- Colours in a `backdrop` are written as they should look on screen. Low graphics draws without the film effects, so its
  fog colour is worked out differently (`fogColour` in `backdrop.js`); the sky photos have half-size copies for Low.
- Soft shading is baked into colours, never worked out while racing: walls darken towards the pavement and under roofs
  (`Quads.box` takes a `shade`), the crowd's back rows are darker, and every tree darkens towards the ground.

## Hills, tunnels and street circuits

- Every sample of the track carries its own height and slope. Cars, the camera, the ghost, the podium, replays, sparks and
  smoke all sit at the road's height, so nothing assumes the ground is at zero.
- The scenery must follow the road too. Monaco's ground is worked out from the road's heights (`land()` in
  `monaco-scenery.js`) and is always kept a little below the road near it; pavements and retaining walls cover the join.
- In a tunnel the daylight is faded out while you are inside (`tunnelLight` in `race.js`), the tunnel's walls and lamps
  are drawn at their own brightness, and a sheet of white light covers each mouth from the inside.
- Where the wall is closer than a kerb's width to the road, no kerb is drawn or felt.

## A track that crosses over itself (Suzuka)

- `crossover` in the circuit's data says which part of the lap is the bridge's deck (`over`), which part passes beneath
  it (`under`) and the headroom (`clear`). The heights of both roads are in `elevation`, like any hill.
- Nothing finds a car's place on the lap by looking for "the nearest bit of road": that would jump between the two
  levels where they cross. Your car searches only near where it was a moment ago; rivals keep their own distance round
  the lap; replays remember each car's place on the tape; cars only bump or slipstream each other when they are at the
  same height.
- The camera is kept below the deck while you pass under it; trackside TV cameras are not put on or under the bridge;
  the little map and the menu outlines draw the bridge on top of the road beneath.
- The scenery's ground must follow both roads. Suzuka's is level with each road beside it, and where two roads are
  close the lower one wins, so it runs in a cutting and the upper one crosses it between concrete walls.

## A night circuit (Las Vegas)

- `time: 'night'` in the circuit's data makes it a night race, always (the set-up screen shows Day and Sunset greyed
  out). Its `backdrop.looks` are then `night`, `cloudy`, `rain` and `snow`: the same floodlit street under each sky.
- No extra lights are used. The two lights every circuit has become a soft white glow from above; the pools of light
  under the floodlights are one see-through layer over the road; buildings are dark with glowing windows (one picture
  for the walls, one for the light they give out); signs and lamps simply glow, and the film effects add the bloom.
- The horizon's `skyline` layer paints a city of lit towers; `haze` is the glow where the sky meets the city.
- Every name on every sign is made up (`SIGNS` in `lasvegas-scenery.js`). Never add a real hotel's or company's name.

## Rules for this game

- Made-up teams, drivers and sponsors only (all in `teams.js`). No real series, team, sponsor, hotel or company names or logos. Real place
  names are fine. A real corner that is named after a sponsor gets a plain name here instead (see `suzuka.js`).
- Crash damage changes how a car looks, never how it drives. Weather never changes grip.
- Everything saved on the device starts with `ffv_` (the owner's other apps share the same web address), and so does
  the logos' database.
- `sw.js`: bump `CACHE_NAME` on every change; it only ever deletes caches starting `formula-for-victory-`.
- Keep the number of separate things drawn low (tablets): build scenery, then bake it with `SC.mergeStatic` (one mesh per
  material), share materials between copies (`shareMaterials` in `circuits/common.js` does it for buildings made one at a time, like
  a pit building in several blocks), and plant all of a circuit's trees in one `SC.plantTrees` call. Rivals are drawn
  in full only when they are among the nearest few; each car's shadow comes from one simple shape on layer 1.

## Credits

Circuit maps © OpenStreetMap contributors (ODbL). three.js (MIT). Fonts under the SIL Open Font Licence. Textures, skies
and tree models from Poly Haven (CC0). Skies: Kloofendal 43d Clear, Farm Field, Qwantani Late Afternoon and Kloofendal
Overcast (all Pure Sky versions) by Greg Zaal, Jarod Guest and Dimitrios Savva (Suzuka shares Farm Field; Las Vegas uses the older night sky). Engine recordings from Wikimedia Commons (see the Credits screen for each one).
