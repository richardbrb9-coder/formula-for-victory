// Formula for Victory: "My teams". On their own tablet a family can give the eleven teams and drivers their own names,
// car numbers and colours, and load a logo picture for each team from the tablet's own files.
//
// EVERYTHING HERE STAYS ON THE DEVICE. Names, numbers and colours are kept in this browser's storage ('ffv_names');
// the logo pictures in this browser's own database ('ffv_teams'). Nothing is uploaded, and nothing a family loads is
// ever part of the app's files, its saved copy for offline use, or its code. The game everyone downloads has only the
// made-up names in teams.js and no logos at all. Never put a real team's name or logo in this code or its tests.
//
// SAFETY: a picture file is never put into the page as markup. It is only ever opened as a picture (through an <img>,
// where a script inside an SVG cannot run), drawn onto a small canvas, and kept as a plain PNG. The file itself is
// then forgotten.
//
//   FFV.logoUrl(id)     an address for a team's logo to show in an <img> (or '' if it has none)
//   FFV.logoImage(id)   the loaded picture, for painting onto the car (or null)
//   FFV.badge(id)       the HTML for a team's little mark in a table: its logo, or its round colour dot
//   FFV.logosReady      a promise: the saved logos have been read
'use strict';
(function () {
    const FFV = window.FFV, TEAMS = FFV.TEAMS, SLOTS = TEAMS.length;
    const MAX_FILE = 2 * 1024 * 1024, MAX_FILES = 30, MAX_ZIP = 40 * 1024 * 1024, BOX = 256;
    const KINDS = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- the logos' own little database ----------
    const DB = 'ffv_teams', STORE = 'logos';
    const logos = {};        // team id -> { data (a PNG as a data: address), url (a short address for <img>), img (loaded) }
    function db() {
        return new Promise((ok, no) => {
            try {
                const r = indexedDB.open(DB, 1);
                r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
                r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(new Error('blocked'));
            } catch (e) { no(e); }
        });
    }
    // (if the database can't be used, e.g. private browsing, the logos still work until the app is closed)
    function dbDo(mode, fn) {
        return db().then(d => new Promise((ok, no) => {
            const tx = d.transaction(STORE, mode), out = fn(tx.objectStore(STORE));
            tx.oncomplete = () => { d.close(); ok(out && out.result); }; tx.onerror = tx.onabort = () => { d.close(); no(tx.error); };
        })).catch(() => undefined);
    }
    const isPng = v => typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length < 1500000;
    function toBlobUrl(data) {
        try { const bin = atob(data.split(',')[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type: 'image/png' })); } catch (e) { return ''; }
    }
    function keep(id, data) {
        drop(id);
        if (!isPng(data) || !FFV.teamById(id)) return Promise.resolve();
        const url = toBlobUrl(data); if (!url) return Promise.resolve();
        const entry = logos[id] = { data, url, img: null };
        return new Promise(done => { const im = new Image(); im.onload = () => { if (logos[id] === entry) entry.img = im; done(); }; im.onerror = () => done(); im.src = url; });
    }
    function drop(id) { if (logos[id]) { try { URL.revokeObjectURL(logos[id].url); } catch (e) { /* gone */ } delete logos[id]; } }
    const changed = () => document.dispatchEvent(new CustomEvent('ffv-teams'));
    function setLogo(id, data) { const p = keep(id, data); dbDo('readwrite', s => s.put(data, id)); return p; }
    function removeLogo(id) { drop(id); dbDo('readwrite', s => s.delete(id)); }
    FFV.logosReady = dbDo('readonly', s => {
        const out = {}; s.openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } };
        return { get result() { return out; } };
    }).then(all => Promise.all(Object.entries(all || {}).map(([id, data]) => keep(id, data)))).catch(() => {}).then(() => { if (Object.keys(logos).length) changed(); });
    FFV.logoUrl = id => (logos[id] ? logos[id].url : '');
    FFV.logoImage = id => (logos[id] && logos[id].img) || null;
    FFV.hasLogos = () => Object.keys(logos).length > 0;
    FFV.badge = id => { const t = FFV.teamById(id); if (!t) return ''; return logos[id] ? `<img class="team-logo" src="${logos[id].url}" alt="">` : `<span class="champ-dot" style="background:${t.paint}"></span>`; };

    // ---------- reading picture files ----------
    const extOf = name => (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
    const baseName = path => String(path).split(/[\\/]/).pop();
    // "red_rockets-team.svg" -> "Red Rockets Team"
    function tidyName(file) {
        const words = baseName(file).replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.+]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
        return FFV.cleanName(words.split(' ').map(w => w ? w[0].toUpperCase() + (w === w.toUpperCase() && w.length <= 3 ? w.slice(1) : w.slice(1).toLowerCase()) : '').join(' '));
    }
    // Turn one file's bytes into a small PNG. The file is only ever shown to the browser as a picture.
    function toPng(bytes, kind) {
        return new Promise((ok, no) => {
            const url = URL.createObjectURL(new Blob([bytes], { type: KINDS[kind] })), im = new Image();
            const end = (fn, v) => { clearTimeout(timer); try { URL.revokeObjectURL(url); } catch (e) { /* gone */ } fn(v); };
            const timer = setTimeout(() => end(no, new Error('slow')), 8000);
            im.onerror = () => end(no, new Error('unreadable'));
            im.onload = () => {
                try {
                    const w0 = im.naturalWidth || BOX, h0 = im.naturalHeight || BOX, k = Math.min(BOX / w0, BOX / h0);
                    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
                    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                    const data = c.toDataURL('image/png');
                    isPng(data) ? end(ok, data) : end(no, new Error('unreadable'));
                } catch (e) { end(no, e); }
            };
            im.decoding = 'async'; im.src = url;
        });
    }
    // ---------- zip files, opened here in the browser (no library, nothing downloaded) ----------
    async function inflate(bytes, limit) {
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = []; let n = 0;
        for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > limit) { reader.cancel().catch(() => {}); throw new Error('big'); } parts.push(value); }
        const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
    }
    // returns [{ name, bytes }] for the pictures inside, and counts what was left out
    async function unzip(buf, notes) {
        const v = new DataView(buf), u8 = new Uint8Array(buf), n = buf.byteLength, out = [];
        let e = -1; for (let i = n - 22; i >= Math.max(0, n - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
        if (e < 0) throw new Error('notzip');
        const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
        for (let k = 0; k < count && p + 46 <= n; k++) {
            if (v.getUint32(p, true) !== 0x02014b50) break;
            const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
            const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
            const path = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
            const name = baseName(path), kind = extOf(name);
            if (!name || path.endsWith('/') || name.startsWith('.') || /(^|\/)__MACOSX\//.test(path) || !KINDS[kind]) continue;   // folders, hidden files and anything that isn't a picture
            if (out.length >= MAX_FILES) { notes.extra++; continue; }
            if (usize > MAX_FILE || csize > MAX_FILE || (flags & 1)) { notes.bad.push([name, flags & 1 ? 'locked' : 'big']); continue; }
            if (at + 30 > n || v.getUint32(at, true) !== 0x04034b50) { notes.bad.push([name, 'broken']); continue; }
            const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), raw = u8.subarray(start, start + csize);
            try {
                if (method === 0) out.push({ name, bytes: raw.slice() });
                else if (method === 8) out.push({ name, bytes: await inflate(raw, MAX_FILE) });
                else notes.bad.push([name, 'broken']);
            } catch (err) { notes.bad.push([name, err.message === 'big' ? 'big' : 'broken']); }
        }
        return out;
    }
    // Read whatever was picked (pictures, or a zip of pictures) into [{ name, tidy, data }], sorted A to Z by file name
    async function readPicked(fileList) {
        const notes = { bad: [], extra: 0, nozip: false }, raw = [];
        for (const f of Array.from(fileList)) {
            const kind = extOf(f.name);
            if (kind === 'zip') {
                if (typeof DecompressionStream === 'undefined') { notes.nozip = true; continue; }
                if (f.size > MAX_ZIP) { notes.bad.push([f.name, 'big']); continue; }
                try { raw.push(...await unzip(await f.arrayBuffer(), notes)); } catch (e) { notes.bad.push([f.name, 'broken']); }
            } else if (KINDS[kind]) {
                if (f.size > MAX_FILE) { notes.bad.push([f.name, 'big']); continue; }
                raw.push({ name: baseName(f.name), bytes: new Uint8Array(await f.arrayBuffer()) });
            } else notes.bad.push([f.name, 'kind']);
        }
        raw.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        if (raw.length > MAX_FILES) { notes.extra += raw.length - MAX_FILES; raw.length = MAX_FILES; }
        const good = [];
        for (const r of raw) { try { good.push({ name: r.name, tidy: tidyName(r.name), data: await toPng(r.bytes, extOf(r.name)) }); } catch (e) { notes.bad.push([r.name, 'broken']); } }
        return { good, notes };
    }
    const WHY = { big: 'too big', broken: "I couldn't read it", kind: 'not a picture I know', locked: 'locked' };
    function story(notes, used) {
        const bits = [];
        if (used) bits.push(`${used} logo${used === 1 ? '' : 's'} loaded. 🎉`);
        if (notes.nozip) bits.push("This tablet can't open zip files. Pick the pictures themselves instead: you can choose lots at once.");
        if (notes.bad.length) bits.push(`Oops! ${notes.bad.length === 1 ? 'One file' : notes.bad.length + ' files'} couldn't be used: ${notes.bad.slice(0, 4).map(([n, w]) => `${n} (${WHY[w] || WHY.broken})`).join(', ')}${notes.bad.length > 4 ? ' and more' : ''}. Logos need to be SVG, PNG or WebP pictures, no bigger than 2 MB each.`);
        if (notes.extra) bits.push(`Only the first ${MAX_FILES} pictures were looked at.`);
        if (!bits.length) bits.push("I couldn't find any logo pictures there. Try SVG, PNG or WebP pictures.");
        return bits.join(' ');
    }

    // ---------- the screen ----------
    let held = null, pending = null, sure = false, message = '', oneFor = null;   // the team whose logo is picked up; pictures waiting to be chosen from; "clear" tapped once
    const $ = id => document.getElementById(id);
    function render() {
        const el = $('myteams'); if (!el) return;
        const any = FFV.changed() || FFV.hasLogos();
        el.innerHTML = `
            <p class="mt-note">🔒 These are saved only on this device. They are never sent anywhere, and nobody else who plays the game sees them.</p>
            <div class="panel mt-load">
                <button class="big-btn" data-mt="pick">📁 Load team logos</button>
                <p class="small">Pick all your logo pictures in one go (or one zip file with them inside). They go to the teams in A to Z order, and each team is named after its picture. You can change anything afterwards.</p>
                <p class="mt-msg" role="status" aria-live="polite">${esc(message)}</p>
            </div>
            ${pending ? chooser() : ''}
            <div class="mt-list">${TEAMS.map(row).join('')}</div>
            <p class="small mt-hint">Tap a logo, then tap another team's logo to swap them.</p>
            <div class="mt-foot"><button class="act-btn ghost" data-mt="clear" ${any ? '' : 'disabled'}>${sure ? 'Tap again to clear everything here' : '🧹 Clear my teams'}</button>${sure ? '<button class="act-btn" data-mt="keep">Keep them</button>' : ''}</div>`;
    }
    function row(t, i) {
        const has = !!logos[t.id], on = held === t.id;
        return `<div class="panel mt-row ${on ? 'held' : ''}" data-id="${t.id}">
            <button class="mt-logo" data-mt="logo" aria-label="${has ? 'Logo of' : 'No logo yet for'} ${esc(t.team)}" style="--c:${t.paint};--s:${t.stripe}">${has ? `<img src="${logos[t.id].url}" alt="">` : '<span>＋</span>'}<i>${i + 1}</i></button>
            <label class="mt-f wide"><span>Team</span><input type="text" maxlength="24" data-k="team" value="${esc(t.team)}" autocomplete="off" spellcheck="false"></label>
            <label class="mt-f wide"><span>Driver</span><input type="text" maxlength="24" data-k="driver" value="${esc(t.driver)}" autocomplete="off" spellcheck="false"></label>
            <label class="mt-f num"><span>Number</span><input type="number" min="1" max="99" inputmode="numeric" data-k="number" value="${t.number}"></label>
            <div class="mt-f cols"><span>Colours</span><div>${['paint', 'stripe', 'paint2'].map(k => `<input type="color" data-k="${k}" value="${t[k].toLowerCase()}" aria-label="${k === 'paint' ? 'Main colour' : k === 'stripe' ? 'Stripe colour' : 'Second colour'}">`).join('')}</div></div>
            <button class="opt mt-reset" data-mt="reset" title="Back to how this team started">↺ Reset</button>
            ${on ? `<div class="mt-held"><b>Now tap another team's logo to swap.</b><button class="opt" data-mt="one">📁 Load a logo for this team</button>${has ? '<button class="opt" data-mt="remove">✖ Take the logo off</button>' : ''}<button class="opt" data-mt="drop">Done</button></div>` : ''}
        </div>`;
    }
    // more pictures than teams: choose which ones to use
    function chooser() {
        const n = pending.filter(p => p.on).length;
        return `<div class="panel mt-choose"><h2>Which ${SLOTS} shall we use?</h2>
            <p class="small">You picked ${pending.length} pictures, and there are ${SLOTS} teams. Untick the ones you don't want.</p>
            <div class="mt-picks">${pending.map((p, i) => `<button class="mt-pick ${p.on ? 'on' : ''}" data-mt="tick" data-i="${i}" aria-pressed="${p.on}"><img src="${p.url}" alt=""><span>${esc(p.tidy || p.name)}</span><b>${p.on ? '✓' : ''}</b></button>`).join('')}</div>
            <div class="rr-actions"><button class="big-btn" data-mt="use" ${n && n <= SLOTS ? '' : 'disabled'}>Use these ${n}</button><span class="mt-count ${n > SLOTS ? 'over' : ''}">${n} of ${SLOTS} chosen${n > SLOTS ? ': untick ' + (n - SLOTS) + ' more' : ''}</span><button class="act-btn ghost" data-mt="cancel">Never mind</button></div></div>`;
    }
    function endPending() { if (pending) for (const p of pending) { try { URL.revokeObjectURL(p.url); } catch (e) { /* gone */ } } pending = null; }
    // give the chosen pictures to the teams in order, naming each team after its picture
    async function assign(list) {
        const use = list.slice(0, SLOTS);
        await Promise.all(use.map((p, i) => { const t = TEAMS[i]; if (p.tidy) FFV.rename(t.id, { team: p.tidy }); return setLogo(t.id, p.data); }));
        changed();
    }
    async function picked(files) {
        if (!files || !files.length) return;
        message = 'Looking at your pictures…'; render();
        let res; try { res = await readPicked(files); } catch (e) { res = { good: [], notes: { bad: [['your files', 'broken']], extra: 0, nozip: false } }; }
        const { good, notes } = res;
        if (oneFor) {   // a single logo for one team
            const id = oneFor; oneFor = null;
            if (good.length) { await setLogo(id, good[0].data); held = null; message = 'New logo loaded. 🎉'; changed(); } else message = story(notes, 0);
            render(); return;
        }
        if (good.length > SLOTS) {
            endPending(); pending = good.map((g, i) => ({ ...g, on: i < SLOTS, url: toBlobUrl(g.data) }));
            message = notes.bad.length || notes.extra || notes.nozip ? story(notes, 0) : ''; render(); return;
        }
        if (good.length) await assign(good);
        message = story(notes, good.length); render();
    }
    function wire() {
        const el = $('myteams'), many = $('mt-files'), one = $('mt-file'); if (!el || !many || !one) return;
        many.addEventListener('change', () => { const f = Array.from(many.files || []); many.value = ''; oneFor = null; picked(f); });
        one.addEventListener('change', () => { const f = Array.from(one.files || []); one.value = ''; picked(f); });
        el.addEventListener('click', async e => {
            const b = e.target.closest('[data-mt]'); if (!b) return;
            const rowEl = b.closest('[data-id]'), id = rowEl && rowEl.dataset.id, act = b.dataset.mt;
            if (act !== 'clear') sure = false;
            if (act === 'pick') { many.click(); return; }
            if (act === 'one') { oneFor = id; one.click(); return; }
            if (act === 'logo') {
                if (held && held !== id) {   // swap the two teams' logos (or move one to a team without)
                    const a = logos[held] && logos[held].data, c = logos[id] && logos[id].data, from = held; held = null;
                    await Promise.all([c ? setLogo(from, c) : removeLogo(from), a ? setLogo(id, a) : removeLogo(id)]);
                    message = a || c ? 'Swapped!' : ''; changed();
                } else held = held === id ? null : id;
            }
            if (act === 'drop') held = null;
            if (act === 'remove') { removeLogo(id); held = null; changed(); }
            if (act === 'reset') { const o = FFV.original(id); FFV.rename(id, { team: '', driver: '', number: 0, paint: '', stripe: '', paint2: '' }); message = `${o.team} is back to how it started.`; changed(); }
            if (act === 'tick' && pending) { const p = pending[+b.dataset.i]; if (p) p.on = !p.on; }
            if (act === 'use' && pending) { const use = pending.filter(p => p.on); endPending(); await assign(use); message = `${Math.min(use.length, SLOTS)} logos loaded. 🎉`; }
            if (act === 'cancel') { endPending(); message = ''; }
            if (act === 'keep') sure = false;
            if (act === 'clear') {
                if (!sure) sure = true;
                else { sure = false; held = null; endPending(); for (const t of TEAMS) drop(t.id); dbDo('readwrite', s => s.clear()); FFV.resetNames(); message = 'All cleared. The teams are back to how they started.'; changed(); }
            }
            render();
        });
        // typing a name, number or colour: saved as soon as the box is left (or the colour chosen)
        el.addEventListener('change', e => {
            const inp = e.target.closest('input[data-k]'), rowEl = inp && inp.closest('[data-id]'); if (!inp || !rowEl) return;
            FFV.rename(rowEl.dataset.id, { [inp.dataset.k]: inp.value });
            const t = FFV.teamById(rowEl.dataset.id); if (inp.type !== 'color') inp.value = t[inp.dataset.k];   // (show what was really kept: tidied, or the old one if it wasn't allowed)
            const lg = rowEl.querySelector('.mt-logo'); lg.style.setProperty('--c', t.paint); lg.style.setProperty('--s', t.stripe);
            changed();
        });
    }
    FFV.myTeams = { render, leave() { held = null; sure = false; message = ''; endPending(); }, tidyName, readPicked, state: () => ({ logos: Object.keys(logos), pending: pending ? pending.map(p => [p.name, p.on]) : null, message, held }) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
