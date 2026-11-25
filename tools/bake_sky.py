#!/usr/bin/env python3
"""Formula for Victory: turn a Poly Haven sky photo (a small .hdr panorama) into the picture the game uses.

    python3 -I tools/bake_sky.py <sky.hdr> <skies/name> [exposure]

Writes skies/name.webp (2048 x 512) and skies/name_low.webp (1024 x 256, for Low graphics), and prints the numbers to
copy into SKIES in backdrop.js (where the sun is, and the colour just above the horizon).

Only the top half of the panorama is kept (the sky from the horizon up to straight overhead): the game draws its own
horizon in front, and haze below it. The picture is saved as plain light levels, not 'tone mapped': the game's own film
curve does that when it draws, exactly as it does for everything else in the scene, so the sky and the haze always match.
Needs only Python and the 'cwebp' tool. Uses no outside packages, and never runs anything from the photo's folder.
"""
import math, os, subprocess, sys, tempfile


def read_hdr(path):
    data = open(path, 'rb').read()
    if not data.startswith(b'#?RADIANCE') and not data.startswith(b'#?RGBE'):
        raise SystemExit('not a Radiance .hdr file')
    pos = data.index(b'\n\n') + 2
    end = data.index(b'\n', pos)
    parts = data[pos:end].split()
    if parts[0] != b'-Y' or parts[2] != b'+X':
        raise SystemExit('unexpected picture layout: ' + data[pos:end].decode())
    h, w = int(parts[1]), int(parts[3])
    pos = end + 1
    rows = []
    for _ in range(h):
        if data[pos] != 2 or data[pos + 1] != 2 or ((data[pos + 2] << 8) | data[pos + 3]) != w:
            raise SystemExit('this .hdr is not run-length packed in the usual way')
        pos += 4
        chans = []
        for _c in range(4):
            line = bytearray()
            while len(line) < w:
                n = data[pos]; pos += 1
                if n > 128:
                    line += bytes([data[pos]]) * (n - 128); pos += 1
                else:
                    line += data[pos:pos + n]; pos += n
            chans.append(bytes(line))
        rows.append(chans)
    return w, h, rows


def encode(x):          # light level 0..1 to a saved (sRGB) byte
    x = min(1.0, max(0.0, x))
    return int(round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)))


def soft(x):            # the very brightest parts (round the sun) roll off gently instead of clipping
    return x if x < 0.8 else 0.8 + 0.2 * (1 - math.exp(-(x - 0.8) / 0.2))


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    w, h, rows = read_hdr(src)
    half = h // 2
    scale = [math.ldexp(1.0, e - 136) if e else 0.0 for e in range(256)]
    lum = lambda r, g, b, e: (0.2126 * r + 0.7152 * g + 0.0722 * b) * scale[e]
    # where the sun is: the middle of the brightest patch
    best, bi, bj = -1.0, 0, 0
    for j in range(half):
        R, G, B, E = rows[j]
        for i in range(0, w, 2):
            v = lum(R[i], G[i], B[i], E[i])
            if v > best: best, bi, bj = v, i, j
    sx = sy = sn = 0.0
    for j in range(max(0, bj - 12), min(half, bj + 13)):
        R, G, B, E = rows[j]
        for i in range(bi - 12, bi + 13):
            k = i % w
            if lum(R[k], G[k], B[k], E[k]) > best * 0.3: sx += i; sy += j; sn += 1
    sun_u, sun_el = (sx / sn / w) % 1.0, 90 - (sy / sn + 0.5) / half * 90
    # how bright the sky is: the level that three quarters of it is darker than
    samples = []
    for j in range(8, half, 8):
        R, G, B, E = rows[j]
        samples += [lum(R[i], G[i], B[i], E[i]) for i in range(0, w, 8)]
    samples.sort()
    p75 = samples[int(len(samples) * 0.75)]
    exposure = float(sys.argv[3]) if len(sys.argv) > 3 else 0.55 / p75
    # every (brightness byte, exponent byte) pair to its saved byte, worked out once
    table = [bytes(encode(soft(m * scale[e] * exposure)) for m in range(256)) for e in range(256)]
    px = bytearray()
    band = [0.0, 0.0, 0.0]; bn = 0
    for j in range(half):
        R, G, B, E = rows[j]
        line = bytearray(w * 3)
        for i in range(w):
            t = table[E[i]]
            line[i * 3] = t[R[i]]; line[i * 3 + 1] = t[G[i]]; line[i * 3 + 2] = t[B[i]]
        px += line
        if half - j <= max(4, half * 4 // 90):          # the lowest four degrees: the colour of the horizon
            for i in range(0, w, 4):
                band[0] += line[i * 3]; band[1] += line[i * 3 + 1]; band[2] += line[i * 3 + 2]; bn += 1
    tmp = tempfile.mkdtemp()
    ppm = os.path.join(tmp, 'sky.ppm')
    with open(ppm, 'wb') as f:
        f.write(b'P6\n%d %d\n255\n' % (w, half)); f.write(px)
    subprocess.run(['cwebp', '-quiet', '-q', '84', '-m', '6', ppm, '-o', out + '.webp'], check=True)
    subprocess.run(['cwebp', '-quiet', '-q', '82', '-m', '6', '-resize', str(w // 2), str(half // 2), ppm, '-o', out + '_low.webp'], check=True)
    os.remove(ppm); os.rmdir(tmp)
    hz = '#%02x%02x%02x' % tuple(int(round(c / bn)) for c in band)
    print('%s: %d x %d, exposure %.3f, sunU %.4f, sunEl %.1f degrees, horizon %s, files %d and %d bytes' % (
        os.path.basename(out), w, half, exposure, sun_u, sun_el, hz, os.path.getsize(out + '.webp'), os.path.getsize(out + '_low.webp')))


main()
