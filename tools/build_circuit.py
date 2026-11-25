#!/usr/bin/env python3
"""Formula for Victory: turn OpenStreetMap data into a circuit's centre line.

Usage: python3 tools/build_circuit.py monza
Reads ../research/osm/<file> (Overpass 'out geom' JSON, (c) OpenStreetMap contributors, ODbL) and writes
circuits/<id>.geo.js: the lap as one closed loop in racing direction, in metres (x east, z south), starting at the
start/finish line, evenly spaced and lightly smoothed, plus any extra lines (pit lane, old banking) on the same map.
Nothing is downloaded. Add a new circuit by adding an entry to CIRCUITS below.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OSM = os.path.join(HERE, '..', '..', 'research', 'osm')
OUT = os.path.join(HERE, '..', 'circuits')

CIRCUITS = {
    'monza': {
        'file': 'monza.json', 'real_length': 5793,
        # the Grand Prix lap, way by way, in racing order (each way is turned round if needed to join the one before)
        'lap': [19842206, 179968242, 179968264, 179968220, 179968262, 179968245, 179968263, 179968229, 179968251,
                179968230, 179968252, 179968228, 1443867792, 1443867793, 179968254, 179968226, 179968249, 179968239,
                179968257, 179968234],
        # the start/finish line: metres along the first way in the list (the line is about 620 m before the first chicane)
        'start': 300,
        'step': 4, 'smooth': 2.5,
        'extras': {
            'pitlane': [[38168747]],
            # the old high-speed oval (the 'Sopraelevata'), joined into runs
            'oval': [[1313097098, 19982933, 725687995, 725687994, 34404729, 34404730, 231256008, 231256009, 34404638, 19983025, 1313098146, 1313098145]],
            'bridges': [[725687995], [34404729], [34404638]],
        },
    },
}

def metres(lat0):
    p = math.radians(lat0)
    return (111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p),
            111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p) - 0.0023 * math.cos(6 * p))

def length(pts, closed=False):
    n = len(pts); return sum(math.dist(pts[i], pts[(i + 1) % n]) for i in range(n if closed else n - 1))

def resample(pts, step, closed):
    """points every 'step' metres along a line (for a closed loop the spacing is adjusted to fit exactly)"""
    src = pts + [pts[0]] if closed else pts
    total = length(src); n = max(2, round(total / step)); out = []; seg = 0; acc = 0.0
    count = n if closed else n + 1
    for k in range(count):
        d = total * k / n
        while seg < len(src) - 2 and acc + math.dist(src[seg], src[seg + 1]) < d:
            acc += math.dist(src[seg], src[seg + 1]); seg += 1
        L = math.dist(src[seg], src[seg + 1]) or 1; t = min(1, max(0, (d - acc) / L))
        out.append((src[seg][0] + (src[seg + 1][0] - src[seg][0]) * t, src[seg][1] + (src[seg + 1][1] - src[seg][1]) * t))
    return out

def smooth(pts, sigma, spacing):
    """a gentle rounding of the mapped corners (closed loop)"""
    r = int(3 * sigma / spacing); w = [math.exp(-0.5 * (j * spacing / sigma) ** 2) for j in range(-r, r + 1)]; s = sum(w); n = len(pts)
    return [(sum(w[j + r] * pts[(i + j) % n][0] for j in range(-r, r + 1)) / s, sum(w[j + r] * pts[(i + j) % n][1] for j in range(-r, r + 1)) / s) for i in range(n)]

def chain(ways, ids):
    out = []; nodes = []
    for k, wid in enumerate(ids):
        w = ways[wid]; g = [(p['lon'], p['lat']) for p in w['geometry']]; nd = list(w['nodes'])
        if nodes:
            if nd[0] != nodes[-1]:
                if nd[-1] == nodes[-1]: g.reverse(); nd.reverse()
                elif k == 1 and nd[0] == nodes[0]: out.reverse(); nodes.reverse()
                elif k == 1 and nd[-1] == nodes[0]: out.reverse(); nodes.reverse(); g.reverse(); nd.reverse()
                else: raise SystemExit(f'way {wid} does not join the one before it')
            g = g[1:]; nd = nd[1:]
        out += g; nodes += nd
    return out, nodes

def main(cid):
    C = CIRCUITS[cid]
    data = json.load(open(os.path.join(OSM, C['file'])))
    ways = {e['id']: e for e in data['elements'] if e['type'] == 'way'}
    ll, nodes = chain(ways, C['lap'])
    if nodes[0] != nodes[-1]: raise SystemExit('the lap does not close')
    ll = ll[:-1]
    lon0 = (min(p[0] for p in ll) + max(p[0] for p in ll)) / 2; lat0 = (min(p[1] for p in ll) + max(p[1] for p in ll)) / 2
    mx, my = metres(lat0)
    proj = lambda p: ((p[0] - lon0) * mx, -(p[1] - lat0) * my)
    raw = [proj(p) for p in ll]
    raw_len = length(raw, True)
    # where each named way sits along the mapped lap (for corner names)
    names = []; d = 0; i = 0
    for wid in C['lap']:
        w = ways[wid]; n = len(w['geometry']) - 1; seg = sum(math.dist(raw[(i + j) % len(raw)], raw[(i + j + 1) % len(raw)]) for j in range(n))
        if w.get('tags', {}).get('name'): names.append([w['tags']['name'], d, d + seg])
        d += seg; i += n
    fine = resample(raw, 1.0, True)
    sp = length(fine, True) / len(fine)
    fine = smooth(fine, C['smooth'], sp)
    # start the loop at the start/finish line
    k0 = round(C['start'] / sp) % len(fine); fine = fine[k0:] + fine[:k0]
    pts = resample(fine, C['step'], True)
    final_len = length(pts, True)
    scale = final_len / raw_len
    names = [[nm, round(((a - C['start']) * scale) % final_len), round(((b - C['start']) * scale) % final_len)] for nm, a, b in names]
    extras = {}
    for key, runs in C.get('extras', {}).items():
        extras[key] = []
        for ids in runs:
            g, _ = chain(ways, ids)
            line = resample([proj(p) for p in g], 6.0, False) if len(g) > 2 or key != 'bridges' else [proj(p) for p in g]
            extras[key].append([round(v, 1) for p in line for v in p])
    flat = [round(v, 2) for p in pts for v in p]
    # the raw mapped outline too, for checking the game's track against the map (not used when racing)
    outline = [round(v, 1) for p in raw for v in p]
    geo = {'id': cid, 'source': 'OpenStreetMap contributors (ODbL), ' + data.get('osm3s', {}).get('timestamp_osm_base', ''),
           'realLength': C['real_length'], 'mappedLength': round(raw_len, 1), 'length': round(final_len, 1), 'step': C['step'],
           'origin': [round(lon0, 6), round(lat0, 6)], 'pts': flat, 'names': names, 'extras': extras, 'outline': outline}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, cid + '.geo.js'), 'w') as f:
        f.write(f'// Made by tools/build_circuit.py from OpenStreetMap data. (c) OpenStreetMap contributors, Open Database Licence (ODbL).\n')
        f.write('// pts: the centre line as x, z pairs in metres (x east, z south), a closed loop in racing direction from the start line.\n')
        f.write('export const GEO = ' + json.dumps(geo, separators=(',', ':'), ensure_ascii=False) + ';\n')
    print(f'{cid}: mapped {raw_len:.1f} m, in game {final_len:.1f} m, real {C["real_length"]} m ({(final_len / C["real_length"] - 1) * 100:+.2f}%), {len(pts)} points')
    for n in names: print('  ', n)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'monza')
