// Formula for Victory: the sound desk. One volume knob that every sound in the game goes through, the little menu
// sounds, the crowd's cheer and the championship fanfare. All of it is made in code: nothing is downloaded.
//
//   getAudio()        the sound system (made on the first tap; null while the app is hidden)
//   audioOut()        where every sound must be sent (never straight to the speakers), so the volume and mute work
//   playSound(name)   'click', 'go', 'back', 'rev', 'win', 'lose', 'low', 'high' (countdown), 'cheer', 'bigcheer', 'fanfare',
//                     'flip' and 'deal' (the Driver Cards)
//   stopLongSounds()  cut off a cheer or fanfare that is still playing (leaving a screen, pausing)
//   FFVSound          { on, volume, setOn(bool), setVolume(1|2|3) }: remembered as ffv_raceSound and ffv_volume
//
// When the app is hidden (another app, the screen switched off) the whole sound system is put to sleep, so nothing can
// carry on playing in the background. It wakes again at the next tap, or when a race carries on.
'use strict';
(function () {
    const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem('ffv_' + key)); return v ?? fallback; } catch (e) { return fallback; } };
    const write = (key, v) => { try { localStorage.setItem('ffv_' + key, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
    const LEVELS = { 1: 0.3, 2: 0.65, 3: 1 };            // quiet, medium, loud
    let on = read('raceSound', true) !== false, volume = LEVELS[read('volume', 2)] ? read('volume', 2) : 2;
    let ctx = null, master = null, bus = null, noise = null;
    const level = () => on ? LEVELS[volume] : 0;

    function getAudio() {
        if (document.hidden) return null;
        try {
            if (!ctx) {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination);
            }
            if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }   // (asleep, or interrupted by a phone call)
            return ctx;
        } catch (e) { return null; }
    }
    const audioOut = () => (getAudio() ? master : null);
    function applyLevel() { if (ctx && master) { try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03); } catch (e) { master.gain.value = level(); } } }
    // long sounds (cheers, the fanfare) go through their own fader, so they can be cut off at once
    function longBus() { if (!bus) { bus = ctx.createGain(); bus.connect(master); } return bus; }
    function stopLongSounds() {
        if (!ctx || !bus) return;
        const old = bus; bus = null;
        try { old.gain.setTargetAtTime(0, ctx.currentTime, 0.04); } catch (e) { /* gone */ }
        setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 400);
    }
    function noiseBuf() {
        if (noise) return noise;
        const len = ctx.sampleRate * 2; noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return noise;
    }
    function tone({ freq, to = freq, dur = .2, type = 'sine', vol = .2, delay = 0, attack = .005, dest = master }) {
        const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, t); if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
        gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(vol, t + attack); gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
        osc.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + dur + .03);
        osc.onended = () => { try { gain.disconnect(); } catch (e) { /* gone */ } };
    }
    // a soft swish of air (a card moving): a short burst of noise, sliding from one tone to another
    function swish(dur, from, to, vol, delay = 0) {
        const t = ctx.currentTime + delay, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        s.connect(bp); bp.connect(g); g.connect(master); s.start(t, Math.random() * 1.5, dur + 0.05);
        s.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
    }
    // a crowd: a roar of filtered noise that swells and dies away, clapping, and a few whoops. size: 1 normal, 1.5 a big one
    function cheer(size = 1, delay = 0, seconds = 4.2) {
        const out = longBus(), t0 = ctx.currentTime + delay, len = seconds * (0.9 + size * 0.2);
        for (const [f, q, v] of [[520, 0.7, 0.16], [1150, 0.8, 0.13], [2500, 1.1, 0.07]]) {
            const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
            s.buffer = noiseBuf(); s.loop = true; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
            // (the roar wobbles, like thousands of voices that aren't quite together)
            const n = 24, curve = new Float32Array(n);
            for (let i = 0; i < n; i++) { const p = i / (n - 1), env = Math.min(1, p / 0.12) * Math.pow(1 - p, 1.3); curve[i] = v * size * env * (0.75 + Math.random() * 0.5); }
            curve[0] = 0; curve[n - 1] = 0;
            g.gain.value = 0; g.gain.setValueCurveAtTime(curve, t0, len);
            bp.frequency.setValueAtTime(f * 0.85, t0); bp.frequency.linearRampToValueAtTime(f * 1.2, t0 + len * 0.3); bp.frequency.linearRampToValueAtTime(f * 0.9, t0 + len);
            s.connect(bp); bp.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + len + 0.1);
            s.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
        }
        // clapping: lots of tiny bursts
        const claps = Math.round(46 * size);
        for (let i = 0; i < claps; i++) {
            const at = t0 + 0.15 + Math.random() * len * 0.8, s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
            s.buffer = noiseBuf(); hp.type = 'bandpass'; hp.frequency.value = 1400 + Math.random() * 1600; hp.Q.value = 1.4;
            g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.05 * (1 - (at - t0) / len * 0.6), at + 0.002); g.gain.setTargetAtTime(0, at + 0.004, 0.012);
            s.connect(hp); hp.connect(g); g.connect(out); s.start(at, Math.random() * 1.8, 0.09);
            s.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
        }
        // whoops: a few voices sliding up
        for (let i = 0; i < Math.round(4 * size); i++) {
            const f = 520 + Math.random() * 380;
            tone({ freq: f, to: f * (1.35 + Math.random() * 0.3), dur: 0.35 + Math.random() * 0.3, type: 'triangle', vol: 0.018, delay: delay + 0.2 + Math.random() * len * 0.6, attack: 0.08, dest: out });
        }
    }
    // a brass note: two bright waves through a filter that opens as the note starts
    function brass(freq, delay, dur, vol) {
        const out = longBus(), t = ctx.currentTime + delay, lp = ctx.createBiquadFilter(), g = ctx.createGain();
        lp.type = 'lowpass'; lp.Q.value = 1; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1500, t + dur);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.08)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        for (const [type, detune, k] of [['sawtooth', -6, 1], ['sawtooth', 7, 1], ['square', 0, 0.5]]) {
            const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune; og.gain.value = 0.34 * k;
            o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
        }
        lp.connect(g); g.connect(out);
        setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, (delay + dur + 0.5) * 1000);
    }
    // the championship fanfare: a rising call, an answer, and a big held chord, with a drum under the last note
    function fanfare() {
        const C4 = 261.63, E4 = 329.63, G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, v = 0.11;
        [[G4, 0, .16], [C5, .18, .16], [E5, .36, .16], [G5, .54, .5], [E5, 1.08, .16], [G5, 1.26, .16], [C6, 1.44, 1.5]].forEach(([f, at, d]) => brass(f, at, d, v));
        [[C4, .54, .5], [E4, .54, .5], [C4, 1.44, 1.5], [E4, 1.44, 1.5], [G4, 1.44, 1.5], [C5, 1.44, 1.5]].forEach(([f, at, d]) => brass(f, at, d, v * 0.55));
        for (const at of [.54, 1.44]) tone({ freq: 110, to: 52, dur: .5, type: 'sine', vol: .3, delay: at, dest: longBus() });
        cheer(1.5, 1.5, 5);
    }
    function playSound(name) {
        if (!on || !getAudio()) return;
        switch (name) {
            case 'click': tone({ freq: 620, to: 930, dur: .06, type: 'triangle', vol: .09 }); break;                              // a menu tap
            case 'go':    tone({ freq: 523, dur: .09, type: 'triangle', vol: .1 }); tone({ freq: 784, dur: .14, type: 'triangle', vol: .1, delay: .07 }); break;   // a big button
            case 'back':  tone({ freq: 700, to: 470, dur: .08, type: 'triangle', vol: .08 }); break;
            case 'rev':   // a quick engine blip
                tone({ freq: 70, to: 210, dur: .35, type: 'sawtooth', vol: .09 });
                tone({ freq: 140, to: 420, dur: .35, type: 'square', vol: .03 });
                tone({ freq: 210, to: 90, dur: .4, type: 'sawtooth', vol: .06, delay: .33 }); break;
            case 'win':  [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: .22, type: 'triangle', vol: .16, delay: i * .08 })); break;
            case 'lose': tone({ freq: 220, to: 90, dur: .35, type: 'sawtooth', vol: .1 }); break;
            case 'low':  tone({ freq: 440, dur: .22, type: 'square', vol: .1, attack: .01 }); tone({ freq: 880, dur: .2, type: 'sine', vol: .05 }); break;       // countdown: 3, 2, 1
            case 'high': tone({ freq: 880, dur: .5, type: 'square', vol: .1, attack: .01 }); tone({ freq: 1760, dur: .45, type: 'sine', vol: .05 }); break;     // ... GO!
            case 'flip':  swish(0.16, 900, 3200, 0.16); tone({ freq: 300, to: 520, dur: .09, type: 'triangle', vol: .06, delay: .1 }); break;   // a card turning over
            case 'deal':  for (let i = 0; i < 3; i++) swish(0.07, 1800, 2600, 0.1, i * 0.09); break;                                           // cards sliding across the table
            case 'cheer': cheer(1); break;
            case 'bigcheer': cheer(1.5, 0, 5); break;
            case 'fanfare': fanfare(); break;
        }
    }
    // hidden: every sound stops at once, and stays stopped until the app is back and something asks for sound again
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden || !ctx) return;
        stopLongSounds();
        try { ctx.suspend(); } catch (e) { /* already asleep */ }
    });

    const FFVSound = {
        get on() { return on; }, get volume() { return volume; }, get level() { return level(); },
        setOn(v) { on = !!v; write('raceSound', on); applyLevel(); if (!on) stopLongSounds(); document.dispatchEvent(new CustomEvent('ffv-sound')); },
        setVolume(v) { if (!LEVELS[v]) return; volume = v; write('volume', v); applyLevel(); document.dispatchEvent(new CustomEvent('ffv-sound')); },
        state() { return { on, volume, level: level(), ctx: ctx ? ctx.state : 'none', gain: master ? +master.gain.value.toFixed(3) : null, long: !!bus }; }   // (testing)
    };
    Object.assign(window, { getAudio, audioOut, playSound, stopLongSounds, FFVSound });
})();
