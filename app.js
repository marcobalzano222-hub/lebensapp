'use strict';
/* Lebensapp – Vanilla JS, kein Build-Schritt.
 * Abschnitte: Hilfsfunktionen · Speicher · Ansichten · App-Kern */

// ============================================================
// Hilfsfunktionen
// ============================================================

const $ = (sel, root = document) => root.querySelector(sel);

/** Kleiner DOM-Baukasten: h('div', {class: 'x', onclick: fn}, 'Text', child) */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function haptic() {
  try { navigator.vibrate && navigator.vibrate(8); } catch { /* iOS ignoriert das */ }
}

// ---------- Datum ----------

const pad2 = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function mondayOf(s) { const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); }
function toMin(hhmm) { const [hh, mm] = String(hhmm || '0:0').split(':').map(Number); return (hh || 0) * 60 + (mm || 0); }
function nowMin(d = new Date()) { return d.getHours() * 60 + d.getMinutes(); }

function isoWeek(s) {
  const d = parseYmd(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

function formatDateLong(s) {
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
function formatDateShort(s) { const d = parseYmd(s); return `${d.getDate()}.${d.getMonth() + 1}.`; }

/** ISO-Zeitstempel mit lokalem Offset, z. B. 2026-10-01T22:31:05+02:00 */
function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad2(Math.floor(Math.abs(off) / 60)), om = pad2(Math.abs(off) % 60);
  return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${oh}:${om}`;
}

function formatDateTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  const today = ymd(new Date());
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return ymd(d) === today ? `heute, ${time}` : `${formatDateShort(ymd(d))} ${time}`;
}

// ---------- Zahlen (deutsch) ----------

function fmtNum(n, decimals = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const round = (n, decimals) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ============================================================
// Lokaler Speicher (localStorage, abgesichert)
// ============================================================

const LS = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Lokales Speichern fehlgeschlagen:', e.name); }
  },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};

// ============================================================
// Standardkonfiguration (Briefing 4.1 / 10)
// ============================================================

const DEFAULT_CONFIG = {
  version: 1,
  user: { name: '' },
  windows: {
    morning: { start: '06:00', end: '14:00' },
    evening: { start: '14:00', end: '05:59' },
  },
  targets: {
    daily: { kcal: null, protein: null, carbs: null },
    weekly: { zone2_min: 60, strength_sessions: 3, hit_sessions: 1, sauna_sessions: 1 },
  },
  habits: [
    { id: 'meditation_am', name: 'Meditation morgens', type: 'bool', slot: 'morning', prio: 1, active: true },
    { id: 'light_am', name: 'Licht nach dem Aufstehen', type: 'bool', slot: 'morning', prio: 2, active: true },
    { id: 'supplements', name: 'Supplements', type: 'bool', slot: 'morning', prio: 2, active: true, note: 'Omega 3, Vitamin D3, Magnesium, Creatin' },
    { id: 'no_phone_night', name: 'Kein Handy vorm Schlafen (gestern)', type: 'bool', slot: 'morning', prio: 2, active: true, refersTo: 'previousDay' },
    { id: 'meditation_pm', name: 'Meditation abends', type: 'bool', slot: 'evening', prio: 1, active: true },
    { id: 'reading', name: 'Lesen', type: 'bool', slot: 'evening', prio: 2, active: true },
  ],
  metrics: [
    { id: 'bp', name: 'Blutdruck', type: 'bloodpressure', slot: 'morning', prio: 1, active: true },
    { id: 'weight', name: 'Gewicht', type: 'number', unit: 'kg', decimals: 1, slot: 'morning', prio: 1, active: true, source: 'manual' },
    { id: 'body', name: 'Körper', type: 'scale10', slot: 'evening', prio: 1, active: true },
    { id: 'mind', name: 'Geist', type: 'scale10', slot: 'evening', prio: 1, active: true },
  ],
  training: [
    { id: 'strength', name: 'Kraft', type: 'session', presetsMin: [30, 45, 60, 75], prio: 1 },
    { id: 'zone2', name: 'Zone 2', type: 'minutes', presetsMin: [20, 30, 45, 60], prio: 1 },
    { id: 'hit', name: 'HIT', type: 'session', presetsMin: [10, 15, 20], prio: 1 },
    { id: 'sauna', name: 'Sauna', type: 'session', prio: 2 },
  ],
  meals: [
    { id: 'example_meal', name: 'Beispiel: Skyr mit Beeren', kcal: 250, protein: 30, carbs: 25 },
  ],
  pauseModes: [
    { id: 'sick', name: 'Krank' },
    { id: 'travel', name: 'Reise' },
  ],
};

/** Fehlende Felder ergänzen, damit ältere oder handgeschriebene Konfigurationen nicht stören. */
function normalizeConfig(c) {
  const cfg = Object.assign(clone(DEFAULT_CONFIG), c || {});
  cfg.user = Object.assign({ name: '' }, cfg.user);
  cfg.windows = Object.assign(clone(DEFAULT_CONFIG.windows), cfg.windows);
  cfg.targets = Object.assign({ daily: {}, weekly: {} }, cfg.targets);
  cfg.targets.daily = Object.assign({ kcal: null, protein: null, carbs: null }, cfg.targets.daily);
  cfg.targets.weekly = Object.assign({}, cfg.targets.weekly);
  for (const k of ['habits', 'metrics', 'training', 'meals', 'pauseModes']) if (!Array.isArray(cfg[k])) cfg[k] = [];
  return cfg;
}

/** Wochenziel-Schlüssel einer Trainingsart: Minuten bei type=minutes, sonst Einheiten. */
const weeklyKey = (t) => (t.type === 'minutes' ? `${t.id}_min` : `${t.id}_sessions`);
const isActive = (item) => item.active !== false;

/** Stabile, kurze ID aus einem Namen, eindeutig innerhalb der Liste. */
function slugId(name, list) {
  const base = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'item';
  const taken = new Set(list.map((x) => x.id));
  let id = base, i = 2;
  while (taken.has(id)) id = `${base}_${i++}`;
  return id;
}

// ============================================================
// Verbindung und lokaler Cache
// ============================================================
// la.conn                  → { owner, repo, token }  (nur auf diesem Gerät)
// la.d:<owner>/<repo>:<p>  → { data, sha }  Cache einer Repo-Datei
// la.m:<owner>/<repo>      → { pending, lastSync, lastError, index }

const conn = () => LS.get('la.conn');
const repoKey = () => { const c = conn(); return c ? `${c.owner}/${c.repo}` : '_'; };

const mem = {};                       // Arbeitskopie der Dateien im Speicher
let meta = null;                      // Sync-Metadaten für das aktuelle Repo

function loadMeta() {
  meta = Object.assign({ pending: {}, rev: 0, lastSync: null, lastError: null, index: null }, LS.get(`la.m:${repoKey()}`, {}));
}
function saveMeta() { LS.set(`la.m:${repoKey()}`, meta); }

const Store = {
  get(path) {
    if (!(path in mem)) mem[path] = LS.get(`la.d:${repoKey()}:${path}`);
    return mem[path];
  },
  put(path, data, sha) {
    mem[path] = { data, sha: sha === undefined ? (Store.get(path) || {}).sha || null : sha };
    LS.set(`la.d:${repoKey()}:${path}`, mem[path]);
  },
  isPending: (path) => path in meta.pending,
  /** Lokal speichern und zum Hochladen vormerken. */
  change(path, data) {
    Store.put(path, data);
    meta.pending[path] = ++meta.rev;
    saveMeta();
    Sync.schedule();
  },
  clearAll() {
    const prefix = `la.d:${repoKey()}:`;
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
    } catch { /* egal */ }
    LS.del(`la.m:${repoKey()}`);
    for (const k of Object.keys(mem)) delete mem[k];
  },
};

// ---------- Konfiguration ----------

let config = null;

function loadConfigFromCache() {
  const f = Store.get('config.json');
  config = f ? normalizeConfig(f.data) : null;
}
function saveConfig(message = 'config: update') {
  meta.commitMsg = Object.assign(meta.commitMsg || {}, { 'config.json': message });
  Store.change('config.json', config);
}

// ---------- Tage ----------

const dayPath = (date) => `days/${date}.json`;
const emptyDay = (date) => ({ date, updatedAt: null, pause: null, habits: {}, metrics: {}, training: [], meals: [] });

function getDay(date) {
  const f = Store.get(dayPath(date));
  return f ? f.data : null;
}

/** Tag ändern: fn bekommt eine Kopie und darf sie verändern. */
function updateDay(date, fn) {
  const d = Object.assign(emptyDay(date), clone(getDay(date)) || {});
  fn(d);
  d.updatedAt = isoLocal();
  Store.change(dayPath(date), d);
}

// ============================================================
// GitHub Contents API
// ============================================================

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function httpMessage(status, body) {
  if (status === 401) return 'Token ungültig oder abgelaufen.';
  if (status === 403) return (body && /rate limit/i.test(body.message || '')) ? 'GitHub-Limit erreicht, bitte später erneut.' : 'Keine Berechtigung. Hat der Token „Contents: Read and write“ für dieses Repo?';
  if (status === 404) return 'Repo oder Datei nicht gefunden (oder der Token hat keinen Zugriff darauf).';
  return `GitHub-Fehler ${status}${body && body.message ? `: ${body.message}` : ''}`;
}

const GH = {
  async req(method, path, body, { keepalive = false, c = conn() } = {}) {
    const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`;
    return fetch(url, {
      method,
      cache: 'no-store',
      keepalive,
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  async fail(res) {
    let body = null;
    try { body = await res.json(); } catch { /* keine JSON-Antwort */ }
    throw new HttpError(res.status, httpMessage(res.status, body));
  },
  async repo(c) {
    const res = await GH.req('GET', '', null, { c });
    if (!res.ok) await GH.fail(res);
    return res.json();
  },
  /** Datei lesen → { data, sha } oder null, wenn es sie nicht gibt. */
  async getFile(path, c) {
    const res = await GH.req('GET', `/contents/${path}`, null, { c });
    if (res.status === 404) return null;
    if (!res.ok) await GH.fail(res);
    const j = await res.json();
    return { data: JSON.parse(b64decode(j.content)), sha: j.sha };
  },
  /** Verzeichnis auflisten → [{ name, sha }] (leer, wenn es fehlt). */
  async listDir(path) {
    const res = await GH.req('GET', `/contents/${path}`);
    if (res.status === 404) return [];
    if (!res.ok) await GH.fail(res);
    const j = await res.json();
    return Array.isArray(j) ? j.map((f) => ({ name: f.name, sha: f.sha })) : [];
  },
  /** Datei schreiben; liefert die neue sha. Wirft HttpError (409/422 = Konflikt). */
  async putFile(path, data, sha, message, opts = {}) {
    const body = { message, content: b64encode(JSON.stringify(data, null, 2) + '\n') };
    if (sha) body.sha = sha;
    const res = await GH.req('PUT', `/contents/${path}`, body, opts);
    if (!res.ok) await GH.fail(res);
    const j = await res.json();
    return j.content.sha;
  },
};

/** Feldweise zusammenführen: lokal gewinnt bei gleichen Feldern, Listen werden ganz ersetzt. */
function mergeLocalOver(remote, local) {
  if (Array.isArray(local) || typeof local !== 'object' || local === null) return local;
  if (typeof remote !== 'object' || remote === null || Array.isArray(remote)) return local;
  const out = { ...remote };
  for (const [k, v] of Object.entries(local)) out[k] = k in remote ? mergeLocalOver(remote[k], v) : v;
  return out;
}

function commitMessage(path) {
  if (path.startsWith('days/')) return `day: ${path.slice(5, 15)}`;
  if (path === 'config.json') return (meta.commitMsg && meta.commitMsg[path]) || 'config: update';
  return `update: ${path}`;
}

// ============================================================
// Synchronisation
// ============================================================

const Sync = {
  timer: null,
  running: false,
  again: false,
  offline: false,

  schedule(delay = 3000) {
    clearTimeout(Sync.timer);
    Sync.timer = setTimeout(() => Sync.flush(), delay);
    updateDot();
  },

  /** Alle ausstehenden Dateien schreiben. */
  async flush({ keepalive = false } = {}) {
    clearTimeout(Sync.timer);
    if (!conn()) return;
    if (Sync.running) { Sync.again = true; return; }
    Sync.running = true;
    updateDot();
    try {
      for (const path of Object.keys(meta.pending)) await Sync.pushOne(path, keepalive);
      Sync.offline = false;
      meta.lastSync = isoLocal();
      meta.lastError = null;
    } catch (e) {
      Sync.handleError(e);
    } finally {
      Sync.running = false;
      saveMeta();
      updateDot();
      if (Sync.again) { Sync.again = false; Sync.flush(); }
    }
  },

  async pushOne(path, keepalive) {
    const rev = meta.pending[path];
    const local = Store.get(path);
    if (!local) { delete meta.pending[path]; return; }
    let data = local.data, sha = local.sha;
    for (let attempt = 1; ; attempt++) {
      try {
        const newSha = await GH.putFile(path, data, sha, commitMessage(path), { keepalive });
        // Nur als erledigt markieren, wenn es währenddessen keine neue lokale Änderung gab.
        if (meta.pending[path] === rev) {
          delete meta.pending[path];
          Store.put(path, data, newSha);
          if (meta.commitMsg) delete meta.commitMsg[path];
        } else {
          Store.put(path, Store.get(path).data, newSha);
        }
        if (meta.index && path.startsWith('days/')) meta.index[path.slice(5, 15)] = newSha;
        return;
      } catch (e) {
        const conflict = e instanceof HttpError && (e.status === 409 || e.status === 422);
        if (!conflict || attempt >= 3) throw e;
        // SHA veraltet: neu laden, lokale Felder darüberlegen, erneut schreiben.
        const remote = await GH.getFile(path);
        const current = Store.get(path).data;
        data = remote ? mergeLocalOver(remote.data, current) : current;
        sha = remote ? remote.sha : null;
        Store.put(path, data, sha);
        if (path === 'config.json') { config = normalizeConfig(data); }
      }
    }
  },

  handleError(e) {
    if (e instanceof HttpError) {
      meta.lastError = e.message;
      Sync.offline = false;
    } else {
      // Netzwerkfehler: offline – Warteschlange bleibt stehen.
      Sync.offline = true;
      meta.lastError = navigator.onLine ? `Netzwerkfehler: ${e.message}` : null;
    }
  },

  pendingCount: () => (meta ? Object.keys(meta.pending).length : 0),
};

function syncState() {
  if (!conn() || !meta) return 'none';
  if (meta.lastError && !Sync.offline) return 'error';
  if (Sync.pendingCount() > 0 || Sync.running) return 'pending';
  return 'ok';
}

function updateDot() {
  const dot = $('#sync-dot');
  const s = syncState();
  dot.className = `dot ${s}`;
  const labels = { ok: 'Synchron', pending: 'Änderungen ausstehend', error: 'Sync-Fehler', none: 'Nicht verbunden' };
  dot.setAttribute('aria-label', labels[s]);
  dot.title = labels[s];
}

// ---------- Laden aus dem Repo ----------

/** Liste der Tagesdateien (Datum → sha) aktualisieren. */
async function refreshIndex() {
  const files = await GH.listDir('days');
  const index = {};
  for (const f of files) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
    if (m) index[m[1]] = f.sha;
  }
  meta.index = index;
  saveMeta();
}

/** Alle Tage im Bereich laden, die im Repo neuer sind als der Cache. */
async function ensureDays(from, to) {
  if (!meta.index) await refreshIndex();
  const wanted = Object.keys(meta.index).filter((date) => {
    if ((from && date < from) || (to && date > to)) return false;
    const path = dayPath(date);
    if (Store.isPending(path)) return false;
    const cached = Store.get(path);
    return !cached || cached.sha !== meta.index[date];
  });
  let changed = false;
  const queue = [...wanted];
  const worker = async () => {
    while (queue.length) {
      const date = queue.shift();
      const f = await GH.getFile(dayPath(date));
      if (f && !Store.isPending(dayPath(date))) { Store.put(dayPath(date), f.data, f.sha); changed = true; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return changed;
}

let refreshing = null;
/** Hintergrund-Aktualisierung: config.json, Tagesliste, letzte 14 Tage. */
function refreshFromRemote() {
  if (!conn()) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      let changed = false;
      if (!Store.isPending('config.json')) {
        const remote = await GH.getFile('config.json');
        const cached = Store.get('config.json');
        if (remote && (!cached || cached.sha !== remote.sha)) {
          Store.put('config.json', remote.data, remote.sha);
          loadConfigFromCache();
          changed = true;
        }
      }
      await refreshIndex();
      const today = logicalToday();
      if (await ensureDays(addDays(today, -14), today)) changed = true;
      Sync.offline = false;
      if (meta.lastError && Sync.pendingCount() === 0) meta.lastError = null;
      if (changed) softRender();
      if (Sync.pendingCount() > 0) Sync.flush();
    } catch (e) {
      Sync.handleError(e);
      saveMeta();
    } finally {
      refreshing = null;
      updateDot();
    }
  })();
  return refreshing;
}

// ============================================================
// Zeitfenster und Tageszuordnung
// ============================================================

function inWindow(m, w) {
  const s = toMin(w.start), e = toMin(w.end);
  return s <= e ? m >= s && m <= e : m >= s || m <= e;
}

/** Logisches „Heute“: Bis zum Ende des Abendfensters (z. B. 05:59) zählt noch der Vortag. */
function logicalToday(now = new Date()) {
  const today = ymd(now);
  if (!config) return today;
  const ev = config.windows.evening;
  const s = toMin(ev.start), e = toMin(ev.end);
  if (e < s && nowMin(now) <= e) return addDays(today, -1);
  return today;
}

/** Aktueller Check-in nach Uhrzeit. */
function currentSlot(now = new Date()) {
  if (!config) return 'morning';
  const m = nowMin(now);
  if (inWindow(m, config.windows.morning)) return 'morning';
  return 'evening';
}

// ============================================================
// Ansichten
// ============================================================

// ---------- Onboarding ----------

function viewOnboarding() {
  const prev = conn() || LS.get('la.lastConn') || {};
  const owner = h('input', { type: 'text', value: prev.owner || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, autocomplete: 'username', placeholder: 'z. B. satoshi' });
  const repo = h('input', { type: 'text', value: prev.repo || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, placeholder: 'z. B. lebensapp-data-satoshi' });
  const token = h('input', { type: 'password', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, autocomplete: 'off', placeholder: 'github_pat_…' });
  const msg = h('p', { class: 'error-text', role: 'status' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Verbindung testen');

  async function submit(e) {
    e.preventDefault();
    const c = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
    if (!c.owner || !c.repo || !c.token) { msg.textContent = 'Bitte alle drei Felder ausfüllen.'; return; }
    btn.disabled = true; msg.textContent = ''; btn.textContent = 'Verbinde …';
    try {
      const r = await GH.repo(c);
      if (!r.private) msg.textContent = 'Hinweis: Dieses Repo ist öffentlich. Für Gesundheitsdaten bitte ein privates Repo verwenden.';
      const remote = await GH.getFile('config.json', c);
      // Erst nach erfolgreichem Test speichern.
      LS.set('la.conn', c);
      LS.set('la.lastConn', { owner: c.owner, repo: c.repo });
      loadMeta();
      if (remote) {
        Store.put('config.json', remote.data, remote.sha);
        loadConfigFromCache();
        ui.tab = 'today';
      } else {
        config = normalizeConfig(clone(DEFAULT_CONFIG));
        config.user.name = c.owner;
        saveConfig('config: initial');
        await Sync.flush();
        ui.tab = 'setup';
      }
      LS.set('la.ui.tab', ui.tab);
      if (r.private) render();
      else setTimeout(render, 2500);
      refreshFromRemote();
    } catch (err) {
      msg.textContent = err instanceof HttpError ? err.message : 'Keine Verbindung zu GitHub. Bist du online?';
      btn.disabled = false; btn.textContent = 'Verbindung testen';
    }
  }

  return h('form', { class: 'welcome', onsubmit: submit, autocomplete: 'off' },
    h('h1', {}, 'Lebensapp'),
    h('p', { class: 'lead' }, 'Zwei kurze Check-ins am Tag. Deine Daten liegen in deinem eigenen privaten GitHub-Repo.'),
    h('label', { class: 'field' }, h('span', {}, 'GitHub-Benutzername'), owner),
    h('label', { class: 'field' }, h('span', {}, 'Daten-Repo'), repo),
    h('label', { class: 'field' }, h('span', {}, 'Fine-grained Token'), token),
    h('p', { class: 'hint' }, 'Der Token bleibt nur auf diesem Gerät. Anleitung zum Anlegen: siehe README der App.'),
    h('div', { class: 'btn-row' }, btn),
    msg,
  );
}

// ---------- Setup ----------

const SLOT_LABEL = { morning: 'Morgen', evening: 'Abend' };
const METRIC_TYPES = { number: 'Zahl', scale10: 'Skala 1–10', bloodpressure: 'Blutdruck' };
const TRAIN_TYPES = { session: 'Einheiten', minutes: 'Minuten' };

/** Konfiguration speichern; structural = Ansicht neu zeichnen (z. B. nach Sortieren). */
function commitConfig(what, structural = false) {
  saveConfig(`config: update ${what}`);
  if (structural) softRender();
}

function selectEl(options, value, onchange) {
  return h('select', { onchange: (e) => onchange(e.target.value) },
    Object.entries(options).map(([v, label]) => h('option', { value: v, selected: String(value) === v }, label)));
}
function textEl(value, onchange, attrs = {}) {
  return h('input', { type: 'text', value: value ?? '', onchange: (e) => onchange(e.target.value), ...attrs });
}
function numEl(value, onchange, attrs = {}) {
  return h('input', {
    type: 'text', inputmode: attrs.decimal ? 'decimal' : 'numeric', value: value == null ? '' : fmtNum(value, attrs.decimal ? 1 : 0).replace(/\./g, ''),
    placeholder: attrs.placeholder || '–', onchange: (e) => onchange(parseNum(e.target.value)),
  });
}

/** Zeile mit Name, Sortierpfeilen und Optionen für ein Listenelement. */
function editRow(list, i, what, opts) {
  const item = list[i];
  const move = (dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commitConfig(what, true);
  };
  return h('div', { class: `row${isActive(item) ? '' : ' inactive'}` },
    h('div', { class: 'row-main' },
      textEl(item.name, (v) => { if (v.trim()) { item.name = v.trim(); commitConfig(what); } }, { 'aria-label': 'Name' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(-1) }, '↑'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach unten', disabled: i === list.length - 1, onclick: () => move(1) }, '↓'),
    ),
    h('div', { class: 'row-opts' },
      opts || [],
      h('button', {
        class: `toggle${isActive(item) ? ' on' : ''}`, type: 'button',
        onclick: () => { item.active = !isActive(item); commitConfig(what, true); },
      }, isActive(item) ? 'Aktiv' : 'Inaktiv'),
    ),
  );
}

const slotSelect = (item, what) => selectEl(SLOT_LABEL, item.slot, (v) => { item.slot = v; commitConfig(what); });
const prioSelect = (item, what) => selectEl({ 1: 'Prio 1', 2: 'Prio 2' }, item.prio || 1, (v) => { item.prio = Number(v); commitConfig(what); });

function addRow(fields, onAdd) {
  const btn = h('button', { class: 'btn', type: 'button' }, 'Hinzufügen');
  btn.addEventListener('click', () => {
    const name = fields[0].value.trim();
    if (!name) { fields[0].focus(); return; }
    onAdd(name, fields.map((f) => f.value));
    softRender();
  });
  return h('div', { class: `add-row${fields.length > 1 ? ' multi' : ''}` }, fields, btn);
}

function viewSetup() {
  const c = config;
  const firstRun = !Object.keys(meta.index || {}).length && !Object.keys(mem).some((p) => p.startsWith('days/') && mem[p]);

  // Gewohnheiten
  const habitRows = c.habits.map((it, i) => editRow(c.habits, i, 'habits', [
    slotSelect(it, 'habits'),
    prioSelect(it, 'habits'),
    h('button', {
      class: `toggle${it.refersTo === 'previousDay' ? ' on' : ''}`, type: 'button', title: 'Wird morgens eingetragen, zählt aber für den Vortag',
      onclick: () => { if (it.refersTo) delete it.refersTo; else it.refersTo = 'previousDay'; commitConfig('habits', true); },
    }, 'Vortag'),
  ]));
  const newHabit = h('input', { type: 'text', placeholder: 'Neue Gewohnheit' });
  const newHabitSlot = selectEl(SLOT_LABEL, 'morning', () => {});

  // Kennzahlen
  const metricRows = c.metrics.map((it, i) => editRow(c.metrics, i, 'metrics', [
    slotSelect(it, 'metrics'),
    prioSelect(it, 'metrics'),
    it.type === 'number'
      ? textEl(it.unit, (v) => { it.unit = v.trim(); commitConfig('metrics'); }, { placeholder: 'Einheit', 'aria-label': 'Einheit', style: 'max-width:70px' })
      : h('span', { class: 'small muted' }, METRIC_TYPES[it.type] || it.type),
  ]));
  const newMetric = h('input', { type: 'text', placeholder: 'Neue Kennzahl' });
  const newMetricType = selectEl(METRIC_TYPES, 'number', () => {});
  const newMetricUnit = h('input', { type: 'text', placeholder: 'Einheit', style: 'max-width:90px' });

  // Training
  const trainRows = c.training.map((it, i) => editRow(c.training, i, 'training', [
    selectEl(TRAIN_TYPES, it.type || 'session', (v) => {
      const oldKey = weeklyKey(it);
      it.type = v;
      if (oldKey in c.targets.weekly) { c.targets.weekly[weeklyKey(it)] = c.targets.weekly[oldKey]; delete c.targets.weekly[oldKey]; }
      commitConfig('training', true);
    }),
    prioSelect(it, 'training'),
    h('label', { class: 'inline wide' }, 'Minuten-Presets',
      textEl((it.presetsMin || []).join(', '), (v) => {
        const list = v.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (list.length) it.presetsMin = list; else delete it.presetsMin;
        commitConfig('training');
      }, { placeholder: 'z. B. 30, 45, 60', inputmode: 'numeric' })),
  ]));
  const newTrain = h('input', { type: 'text', placeholder: 'Neue Trainingsart' });
  const newTrainType = selectEl(TRAIN_TYPES, 'session', () => {});

  // Mahlzeiten
  const macro = (it, key, label) => h('label', { class: 'inline' }, label,
    numEl(it[key], (v) => { it[key] = v ?? 0; commitConfig('meals'); }));
  const mealRows = c.meals.map((it, i) => editRow(c.meals, i, 'meals', [
    macro(it, 'kcal', 'kcal'), macro(it, 'protein', 'P'), macro(it, 'carbs', 'KH'),
  ]));
  const newMeal = h('input', { type: 'text', placeholder: 'Neue Mahlzeit' });

  // Ziele
  const dailyField = (key, label) => h('label', { class: 'field' }, h('span', {}, label),
    numEl(c.targets.daily[key], (v) => { c.targets.daily[key] = v; commitConfig('targets'); }, { placeholder: 'kein Ziel' }));
  const weeklyFields = c.training.filter(isActive).map((t) => h('label', { class: 'field' },
    h('span', {}, `${t.name} (${t.type === 'minutes' ? 'Minuten' : 'Einheiten'} / Woche)`),
    numEl(c.targets.weekly[weeklyKey(t)], (v) => {
      if (v == null) delete c.targets.weekly[weeklyKey(t)]; else c.targets.weekly[weeklyKey(t)] = v;
      commitConfig('targets');
    }, { placeholder: 'kein Ziel' })));

  // Tagesablauf
  const timeField = (w, k, label) => h('label', { class: 'field' }, h('span', {}, label),
    h('input', { type: 'time', value: c.windows[w][k], onchange: (e) => { if (e.target.value) { c.windows[w][k] = e.target.value; commitConfig('windows'); } } }));

  // Pause-Modi
  const pauseRows = c.pauseModes.map((p) => h('div', { class: 'row' },
    textEl(p.name, (v) => { if (v.trim()) { p.name = v.trim(); commitConfig('pauseModes'); } }, { 'aria-label': 'Name des Pause-Modus' })));
  const newPause = h('input', { type: 'text', placeholder: 'Neuer Pause-Modus' });

  return h('div', {},
    h('h1', {}, 'Setup'),
    firstRun ? h('p', { class: 'muted' }, 'Die Standardkonfiguration ist angelegt. Passe sie an; jede Änderung wird automatisch gespeichert.') : null,

    h('label', { class: 'field' }, h('span', {}, 'Name'),
      textEl(c.user.name, (v) => { c.user.name = v.trim(); commitConfig('user'); })),

    h('h2', {}, 'Gewohnheiten'),
    h('div', { class: 'rows' }, habitRows),
    addRow([newHabit, newHabitSlot], (name, [, slot]) => {
      c.habits.push({ id: slugId(name, c.habits), name, type: 'bool', slot, prio: 2, active: true });
      commitConfig('habits');
    }),

    h('h2', {}, 'Kennzahlen'),
    h('div', { class: 'rows' }, metricRows),
    addRow([newMetric, newMetricType, newMetricUnit], (name, [, type, unit]) => {
      const m = { id: slugId(name, c.metrics), name, type, slot: 'morning', prio: 2, active: true };
      if (type === 'number') { m.unit = unit.trim(); m.decimals = 1; m.source = 'manual'; }
      c.metrics.push(m);
      commitConfig('metrics');
    }),

    h('h2', {}, 'Training'),
    h('div', { class: 'rows' }, trainRows),
    addRow([newTrain, newTrainType], (name, [, type]) => {
      c.training.push({ id: slugId(name, c.training), name, type, presetsMin: [30, 45, 60], prio: 2, active: true });
      commitConfig('training');
    }),

    h('h2', {}, 'Ziele'),
    h('p', { class: 'hint' }, 'Tagesziele Ernährung'),
    h('div', { class: 'pair' }, dailyField('kcal', 'kcal'), dailyField('protein', 'Protein (g)'), dailyField('carbs', 'Carbs (g)')),
    h('p', { class: 'hint' }, 'Wochenziele Training'),
    h('div', { class: 'pair' }, weeklyFields),

    h('h2', {}, 'Mahlzeiten'),
    h('div', { class: 'rows' }, mealRows.length ? mealRows : h('p', { class: 'empty-note' }, 'Noch keine Mahlzeiten.')),
    addRow([newMeal], (name) => {
      c.meals.push({ id: slugId(name, c.meals), name, kcal: 0, protein: 0, carbs: 0, active: true });
      commitConfig('meals');
    }),

    h('h2', {}, 'Tagesablauf'),
    h('div', { class: 'pair' },
      timeField('morning', 'start', 'Morgen ab'), timeField('morning', 'end', 'Morgen bis'),
      timeField('evening', 'start', 'Abend ab'), timeField('evening', 'end', 'Abend bis')),
    h('p', { class: 'hint' }, 'Einträge vor dem Ende des Abendfensters (z. B. 00:30) zählen zum Vortag.'),

    h('h2', {}, 'Pause-Modi'),
    h('div', { class: 'rows' }, pauseRows),
    addRow([newPause], (name) => {
      c.pauseModes.push({ id: slugId(name, c.pauseModes), name });
      commitConfig('pauseModes');
    }),
  );
}

const views = {
  today: () => h('div', {}, h('h1', {}, 'Heute')),
  week: () => h('div', {}, h('h1', {}, 'Woche')),
  setup: viewSetup,
  sync: () => h('div', {}, h('h1', {}, 'Sync')),
};

// ============================================================
// App-Kern
// ============================================================

const ui = {
  tab: LS.get('la.ui.tab', 'today'),
};

function setTab(tab) {
  ui.tab = tab;
  LS.set('la.ui.tab', tab);
  window.scrollTo(0, 0);
  render();
  if (tab === 'week') ensureWeekData();
}

function render() {
  const view = $('#view');
  updateDot();
  if (!conn() || !config) {
    document.body.classList.add('no-tabs');
    view.replaceChildren(viewOnboarding());
    return;
  }
  document.body.classList.remove('no-tabs');
  for (const b of document.querySelectorAll('#tabbar button')) b.classList.toggle('active', b.dataset.tab === ui.tab);
  view.replaceChildren((views[ui.tab] || views.today)());
}

/** Neu zeichnen, außer der Nutzer tippt gerade in ein Feld. */
function softRender() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT') && $('#view').contains(a)) return;
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

/** Daten für die Wochenansicht (8 Wochen für Sparklines) nachladen. */
function ensureWeekData() { return Promise.resolve(); }

let hiddenAt = 0;

function init() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $('#sync-dot').addEventListener('click', () => { if (conn() && config) setTab('sync'); });

  loadMeta();
  loadConfigFromCache();
  render();                      // sofort aus dem lokalen Cache, kein Ladebildschirm
  refreshFromRemote();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (Sync.pendingCount() > 0) Sync.flush({ keepalive: true });
    } else {
      onResume(Date.now() - hiddenAt > 10 * 60 * 1000);
      refreshFromRemote();
    }
  });
  window.addEventListener('online', () => { Sync.offline = false; Sync.flush(); });
  window.addEventListener('offline', () => { Sync.offline = true; updateDot(); });
  // Morgen/Abend-Wechsel und Tageswechsel auch bei offener App.
  setInterval(() => onResume(false), 60 * 1000);

  // Lokal (Entwicklung) ohne Service Worker, damit Änderungen sofort sichtbar sind; mit ?sw=1 erzwingen.
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !dev) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker:', e.message));
  }
}

/** Nach Rückkehr in die App: automatischen Check-in und „Heute“ neu bestimmen. */
function onResume() { softRender(); }

init();
