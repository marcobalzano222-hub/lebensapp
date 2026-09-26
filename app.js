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
  cfg.health = Object.assign({ workoutMap: {} }, cfg.health);
  if (!cfg.health.workoutMap || typeof cfg.health.workoutMap !== 'object') cfg.health.workoutMap = {};
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
  meta = Object.assign({ pending: {}, rev: 0, lastSync: null, lastError: null, index: null, hindex: null }, LS.get(`la.m:${repoKey()}`, {}));
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

// ---------- Apple Health (health/, geschrieben vom iOS-Kurzbefehl, nur lesen) ----------
// Format des Kurzbefehls (alle Werte dürfen Text sein):
// { date, source: "shortcut", steps, weight,
//   sleep:    "Wert|Start ISO|Ende ISO\n…"   (Schlaf-Samples der Nacht, die am Morgen von date endet)
//   workouts: "Typ|Start ISO|Minuten\n…" }   (Workouts, die an date begonnen haben)

const healthPath = (date) => `health/${date}.json`;

/** Zahl aus Text wie „8.423“, „82,4 kg“ oder 8423. */
function looseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  if (t.includes('.') && t.includes(',')) {
    // Das letzte Trennzeichen ist das Dezimalzeichen.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');                     // „8.423“ = Tausenderpunkt
  } else {
    t = t.replace(',', '.');                      // „82,4“ = Dezimalkomma
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Zeilen „a|b|c“ oder schon eine Liste von Objekten. */
function healthLines(v, keys) {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'object' && x ? x : Object.fromEntries(String(x).split('|').map((p, i) => [keys[i], p.trim()]))));
  }
  if (typeof v !== 'string' || !v.trim()) return [];
  return v.split(/\r?\n/).filter((l) => l.trim()).map((l) => Object.fromEntries(l.split('|').map((p, i) => [keys[i], p.trim()])));
}

const ASLEEP_EXCLUDE = /bett|bed|wach|awake/i;

/** Schlafminuten: Vereinigung aller Schlaf-Intervalle (keine Doppelzählung iPhone + Watch). */
function sleepMinutes(samples) {
  const iv = samples
    .filter((s) => !ASLEEP_EXCLUDE.test(s.value || ''))
    .map((s) => [Date.parse(s.start), Date.parse(s.end)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const [a, b] of iv) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return iv.length ? Math.round(total / 60000) : null;
}

const healthCache = new Map();   // path → { sha, parsed }

/** Aufbereitete Health-Daten eines Tages oder null. */
function getHealth(date) {
  const f = Store.get(healthPath(date));
  if (!f || !f.data || f.data.invalid) return null;
  const hit = healthCache.get(date);
  if (hit && hit.sha === f.sha && hit.raw === f.data) return hit.parsed;
  const raw = f.data;
  const sleep = healthLines(raw.sleep, ['value', 'start', 'end']);
  const workouts = healthLines(raw.workouts, ['type', 'start', 'min'])
    .map((w) => ({ type: String(w.type || '').trim(), start: w.start || null, min: Math.round(looseNum(w.min ?? w.minutes ?? w.duration) || 0) }))
    .filter((w) => w.type);
  const weight = looseNum(raw.weight);
  const steps = looseNum(raw.steps);
  const parsed = {
    date,
    steps: steps != null && steps > 0 ? Math.round(steps) : null,
    weight: weight != null && weight > 0 ? round(weight, 1) : null,
    sleepMin: raw.sleepMin != null ? looseNum(raw.sleepMin) : sleepMinutes(sleep),
    workouts,
  };
  healthCache.set(date, { sha: f.sha, raw: f.data, parsed });
  return parsed;
}

/** Standard-Zuordnung der Apple-Watch-Workout-Typen (deutsch und englisch). */
const WORKOUT_RULES = [
  ['strength', /kraft|strength/i],
  ['hit', /hiit|intervall|interval/i],
  ['zone2', /geh|walk|lauf|run|rad|cycl|bike|wander|hik|ruder|row|ellip|crosstrain|schwimm|swim|stepper|treppe|stair/i],
];

/** Trainings-ID für einen Workout-Typ, 'ignore' oder null (nicht zugeordnet). */
function mapWorkout(type) {
  const map = (config.health && config.health.workoutMap) || {};
  if (map[type]) return map[type] === 'ignore' ? 'ignore' : (config.training.some((t) => t.id === map[type]) ? map[type] : null);
  return autoMapWorkout(type);
}
function autoMapWorkout(type) {
  for (const [id, re] of WORKOUT_RULES) if (re.test(type) && config.training.some((t) => t.id === id && isActive(t))) return id;
  return null;
}

/**
 * Training eines Tages für die Auswertung. Pro Trainingsart gilt: Gibt es Health-Workouts
 * dieser Art, zählen nur diese; sonst die manuellen Einträge (z. B. Sauna, oder heute,
 * solange der Kurzbefehl noch nicht gelaufen ist).
 */
function trainingFor(date) {
  const manual = ((getDay(date) || {}).training || []).map((e) => ({ ...e, source: 'manual' }));
  const hl = getHealth(date);
  const fromHealth = hl ? hl.workouts.map((w) => ({ id: mapWorkout(w.type), min: w.min || undefined, type: w.type, source: 'health' }))
    .filter((w) => w.id && w.id !== 'ignore') : [];
  const covered = new Set(fromHealth.map((w) => w.id));
  return [...fromHealth, ...manual.filter((e) => !covered.has(e.id))];
}

/** Wert einer Kennzahl an einem Tag – bei Quelle „health“ aus Apple Health. */
function metricOn(m, date) {
  if (m.source === 'health') {
    const hl = getHealth(date);
    return hl && m.id === 'weight' ? hl.weight : null;
  }
  return ((getDay(date) || {}).metrics || {})[m.id];
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
    const text = b64decode(j.content);
    try {
      return { data: JSON.parse(text), sha: j.sha };
    } catch {
      // Ungültiges JSON (z. B. aus dem Kurzbefehl) soll den Sync nicht blockieren.
      return { data: { invalid: true, raw: text.slice(0, 2000) }, sha: j.sha };
    }
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

/** Liste der Tagesdateien (Datum → sha) für days/ und health/ aktualisieren. */
async function refreshIndex() {
  const toIndex = (files) => {
    const index = {};
    for (const f of files) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
      if (m) index[m[1]] = f.sha;
    }
    return index;
  };
  const [days, health] = await Promise.all([GH.listDir('days'), GH.listDir('health')]);
  meta.index = toIndex(days);
  meta.hindex = toIndex(health);
  saveMeta();
}

/** Alle Tage (App und Health) im Bereich laden, die im Repo neuer sind als der Cache. */
async function ensureDays(from, to) {
  if (!meta.index || !meta.hindex) await refreshIndex();
  const wanted = [];
  for (const [index, pathOf] of [[meta.index, dayPath], [meta.hindex, healthPath]]) {
    for (const date of Object.keys(index)) {
      if ((from && date < from) || (to && date > to)) continue;
      const path = pathOf(date);
      if (Store.isPending(path)) continue;
      const cached = Store.get(path);
      if (!cached || cached.sha !== index[date]) wanted.push(path);
    }
  }
  let changed = false;
  const queue = [...wanted];
  const worker = async () => {
    while (queue.length) {
      const path = queue.shift();
      const f = await GH.getFile(path);
      if (f && !Store.isPending(path)) { Store.put(path, f.data, f.sha); changed = true; }
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
    it.id === 'weight' && it.type === 'number'
      ? selectEl({ manual: 'Manuell', health: 'Apple Health' }, it.source || 'manual', (v) => { it.source = v; commitConfig('metrics', true); })
      : it.type === 'number'
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

  // Apple Health
  const healthDates = cachedDates('health');
  const lastHealth = healthDates[healthDates.length - 1];
  const seenTypes = [...new Set(healthDates.flatMap((d) => (getHealth(d) || { workouts: [] }).workouts.map((w) => w.type)))].sort();
  const mapRows = seenTypes.map((type) => {
    const auto = autoMapWorkout(type);
    const autoName = auto ? (c.training.find((t) => t.id === auto) || {}).name : 'nicht gezählt';
    const opts = { '': `Automatisch (${autoName})` };
    for (const t of c.training.filter(isActive)) opts[t.id] = t.name;
    opts.ignore = 'Ignorieren';
    return h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('span', {}, type)),
      h('div', { class: 'row-opts' }, selectEl(opts, c.health.workoutMap[type] || '', (v) => {
        if (v) c.health.workoutMap[type] = v; else delete c.health.workoutMap[type];
        commitConfig('health');
      })));
  });

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

    h('h2', {}, 'Apple Health'),
    h('p', { class: 'hint' },
      'Schritte, Schlaf und Gewicht kommen vom iOS-Kurzbefehl „Lebensapp-Health“. ',
      h('a', { href: 'shortcuts/Lebensapp-Health.shortcut' }, 'Kurzbefehl laden'), ' · ',
      h('a', { href: shortcutGuideUrl(), target: '_blank', rel: 'noopener' }, 'Anleitung'), '.'),
    h('div', { class: 'btn-row' }, h('button', {
      type: 'button', class: `toggle${c.health.shortcut ? ' on' : ''}`,
      onclick: () => { c.health.shortcut = !c.health.shortcut; commitConfig('health', true); },
    }, c.health.shortcut ? 'Kurzbefehl installiert ✓' : 'Kurzbefehl ist installiert')),
    h('p', { class: 'hint' }, 'Dann erscheint morgens ein Knopf, der die Daten von gestern überträgt, falls sie noch fehlen.'),
    h('p', { class: 'hint' }, lastHealth ? `Letzte Health-Daten: ${formatDateLong(lastHealth)}.` : 'Noch keine Health-Daten empfangen.'),
    seenTypes.length ? [h('p', { class: 'hint' }, 'Workout-Typen zuordnen (Health-Workouts ersetzen manuelle Einträge derselben Art):'),
      h('div', { class: 'rows' }, mapRows)] : null,
  );
}

// ---------- Heute ----------

const todayUi = { date: null, slot: null, pauseOpen: false, trainOpen: null, ensured: null };

const byPrio = (list) => list.map((x, i) => [x, i]).sort((a, b) => (a[0].prio || 1) - (b[0].prio || 1) || a[1] - b[1]).map((x) => x[0]);
const habitDate = (hb, date) => (hb.refersTo === 'previousDay' ? addDays(date, -1) : date);
const habitValue = (hb, date) => ((getDay(habitDate(hb, date)) || {}).habits || {})[hb.id];
const metricValue = (m, date) => ((getDay(date) || {}).metrics || {})[m.id];
const showMetric = (m) => isActive(m) && !(m.type === 'number' && m.source === 'health');

/** Letzter erfasster Wert einer Kennzahl vor (oder an) einem Datum – für die Vorbelegung. */
function lastMetricValue(id, date, maxDays = 90) {
  for (let i = 0; i <= maxDays; i++) {
    const v = ((getDay(addDays(date, -i)) || {}).metrics || {})[id];
    if (v != null) return v;
  }
  return null;
}

function slotItems(slot) {
  return {
    habits: byPrio(config.habits.filter((x) => isActive(x) && x.slot === slot)),
    metrics: byPrio(config.metrics.filter((x) => showMetric(x) && x.slot === slot)),
  };
}

function progressOf(date, slot) {
  const { habits, metrics } = slotItems(slot);
  const total = habits.length + metrics.length;
  if (!total) return 0;
  const done = habits.filter((x) => habitValue(x, date) !== undefined).length
    + metrics.filter((x) => metricValue(x, date) != null).length;
  return done / total;
}
function updateProgress(date, slot) {
  const bar = $('#progress > i');
  if (bar) bar.style.width = `${Math.round(progressOf(date, slot) * 100)}%`;
}

function setHabit(hb, date, value) {
  updateDay(habitDate(hb, date), (d) => {
    if (value === undefined) delete d.habits[hb.id]; else d.habits[hb.id] = value;
  });
}
function setMetric(m, date, value) {
  updateDay(date, (d) => { if (value == null) delete d.metrics[m.id]; else d.metrics[m.id] = value; });
}

/** Tap und langer Druck auf demselben Element. */
function pressable(el, onTap, onLong) {
  let timer = null, long = false, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    long = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { timer = null; long = true; haptic(); onLong(); }, 500);
  });
  el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', () => { if (long) { long = false; return; } haptic(); onTap(); });
}

function boolTile(hb, date, slot, compact) {
  const el = h('button', { type: 'button', class: 'tile', title: hb.note || null },
    hb.name, !compact && hb.note ? h('small', {}, hb.note) : null);
  const paint = () => {
    const v = habitValue(hb, date);
    el.classList.toggle('on', v === true);
    el.classList.toggle('no', v === false);
    el.setAttribute('aria-pressed', v === true ? 'true' : 'false');
  };
  const set = (v) => { setHabit(hb, date, v); paint(); updateProgress(date, slot); };
  // Tap: erledigt ↔ nicht eingetragen. Langer Druck: explizit „nicht gemacht“.
  pressable(el,
    () => set(habitValue(hb, date) === true ? undefined : true),
    () => set(habitValue(hb, date) === false ? undefined : false));
  paint();
  return el;
}

function scaleRow(m, date) {
  const v = metricValue(m, date);
  return h('div', { class: 'block' },
    h('p', { class: 'block-title' }, h('span', {}, m.name)),
    h('div', { class: 'scale', role: 'group', 'aria-label': m.name },
      Array.from({ length: 10 }, (_, i) => i + 1).map((n) => h('button', {
        type: 'button', class: v === n ? 'on' : '', 'aria-pressed': v === n ? 'true' : 'false',
        onclick: () => { haptic(); setMetric(m, date, v === n ? null : n); softRender(); },
      }, n))));
}

/** Zahlenfeld mit −/+ Stepper. */
function stepper({ value, decimals = 0, step = 1, label, onSet, inputmode = 'numeric' }) {
  const input = h('input', {
    type: 'text', inputmode, value: value == null ? '' : fmtNum(value, decimals).replace(/\./g, ''),
    'aria-label': label, enterkeyhint: 'done',
    onfocus: (e) => e.target.select(),
    onchange: (e) => { const n = parseNum(e.target.value); if (n != null && n > 0) onSet(round(n, decimals), false); else e.target.value = value == null ? '' : fmtNum(value, decimals); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  const bump = (dir) => { haptic(); onSet(round((value ?? 0) + dir * step, decimals), true); };
  return h('div', {},
    h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': `${label} verringern`, onclick: () => bump(-1) }, '−'),
      input,
      h('button', { type: 'button', 'aria-label': `${label} erhöhen`, onclick: () => bump(1) }, '+')),
    label ? h('div', { class: 'stepper-label' }, label) : null);
}

function bpCard(m, date, slot) {
  const v = metricValue(m, date);
  const last = lastMetricValue(m.id, addDays(date, -1));
  const shown = v || last || { sys: 120, dia: 80 };
  const prefill = !v;
  const save = (patch, rerender) => {
    const next = { sys: shown.sys, dia: shown.dia, ...(v && v.pulse ? { pulse: v.pulse } : {}), ...patch };
    if (next.pulse == null) delete next.pulse;
    setMetric(m, date, next);
    if (rerender) softRender(); else { card.classList.remove('prefill'); updateProgress(date, slot); }
  };
  const pulse = h('input', {
    type: 'text', inputmode: 'numeric', value: v && v.pulse ? v.pulse : '', placeholder: '–',
    'aria-label': 'Puls', enterkeyhint: 'done',
    onchange: (e) => { const n = parseNum(e.target.value); save({ pulse: n && n > 0 ? Math.round(n) : null }, false); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  const card = h('div', { class: `metric-card${prefill ? ' prefill' : ''}` },
    h('div', { class: 'metric-head' },
      h('span', {}, m.name, prefill && last ? ' · letzter Wert' : ''),
      prefill
        ? h('button', { type: 'button', onclick: () => { haptic(); save({}, true); } }, 'Übernehmen')
        : h('button', { type: 'button', class: 'muted', onclick: () => { setMetric(m, date, null); softRender(); } }, 'Löschen')),
    h('div', { class: 'steppers' },
      stepper({ value: shown.sys, label: 'Systolisch', onSet: (n, re) => save({ sys: n }, re) }),
      stepper({ value: shown.dia, label: 'Diastolisch', onSet: (n, re) => save({ dia: n }, re) })),
    h('div', { class: 'pulse-row' }, h('label', {}, 'Puls (optional)'), pulse));
  return card;
}

function numberCard(m, date, slot) {
  const decimals = m.decimals ?? 1;
  const v = metricValue(m, date);
  const last = lastMetricValue(m.id, addDays(date, -1));
  const shown = v ?? last;
  const prefill = v == null;
  const save = (n, rerender) => {
    setMetric(m, date, n);
    if (rerender) softRender(); else { card.classList.remove('prefill'); updateProgress(date, slot); }
  };
  const card = h('div', { class: `metric-card${prefill ? ' prefill' : ''}` },
    h('div', { class: 'metric-head' },
      h('span', {}, m.name, m.unit ? ` (${m.unit})` : '', prefill && last != null ? ' · letzter Wert' : ''),
      prefill
        ? (shown != null ? h('button', { type: 'button', onclick: () => { haptic(); save(shown, true); } }, 'Übernehmen') : null)
        : h('button', { type: 'button', class: 'muted', onclick: () => save(null, true) }, 'Löschen')),
    stepper({ value: shown, decimals, step: 10 ** -decimals, label: '', inputmode: decimals ? 'decimal' : 'numeric', onSet: save }));
  return card;
}

function trainingBlock(date, day) {
  const types = config.training.filter(isActive);
  if (!types.length) return null;
  const entries = day.training || [];
  const add = (entry) => {
    haptic();
    updateDay(date, (d) => { d.training = [...(d.training || []), entry]; });
    todayUi.trainOpen = null;
    softRender();
  };
  const effective = trainingFor(date);
  const fromHealth = effective.filter((e) => e.source === 'health');
  const covered = new Set(fromHealth.map((e) => e.id));
  const summary = (t) => {
    const mine = effective.filter((e) => e.id === t.id);
    if (!mine.length) return null;
    const min = mine.reduce((s, e) => s + (e.min || 0), 0);
    return min ? `${min} min` : `${mine.length}×`;
  };
  const open = types.find((t) => t.id === todayUi.trainOpen);
  return h('div', { class: 'block' },
    h('p', { class: 'block-title' }, h('span', {}, 'Training')),
    h('div', { class: 'train-tiles' }, types.map((t) => h('button', {
      type: 'button', class: `tile${summary(t) ? ' on' : ''}${open === t ? ' open' : ''}`,
      onclick: () => {
        if (t.presetsMin && t.presetsMin.length) { todayUi.trainOpen = open === t ? null : t.id; softRender(); } else add({ id: t.id });
      },
    }, t.name, h('small', {}, summary(t) || ' ')))),
    open ? h('div', { class: 'presets' },
      open.presetsMin.map((min) => h('button', { type: 'button', class: 'btn', onclick: () => add({ id: open.id, min }) }, `${min} min`)),
      open.type !== 'minutes' ? h('button', { type: 'button', class: 'btn', onclick: () => add({ id: open.id }) }, 'ohne Zeit') : null) : null,
    fromHealth.length || entries.length ? h('div', { class: 'chips' }, fromHealth.map((e) => {
      const t = config.training.find((x) => x.id === e.id);
      return h('span', { class: 'chip health', title: `Apple Health: ${e.type}` },
        h('span', {}, `♥ ${t ? t.name : e.id}${e.min ? ` ${e.min} min` : ''}`));
    }), entries.map((e, i) => {
      const t = config.training.find((x) => x.id === e.id);
      const replaced = covered.has(e.id);
      return h('span', { class: `chip${replaced ? ' replaced' : ''}`, title: replaced ? 'Durch Apple Health ersetzt – zählt nicht' : null },
        h('span', {}, `${t ? t.name : e.id}${e.min ? ` ${e.min} min` : ''}`),
        h('button', {
          type: 'button', 'aria-label': 'Entfernen',
          onclick: () => { updateDay(date, (d) => { d.training = d.training.filter((_, j) => j !== i); }); softRender(); },
        }, '×'));
    })) : null);
}

/** Summen aus dem Snapshot (Makros zum Zeitpunkt der Eingabe). */
function nutritionOf(day) {
  const sum = { kcal: 0, protein: 0, carbs: 0, any: false };
  const snap = day.mealsSnapshot || [];
  for (const e of day.meals || []) {
    const src = snap.find((s) => s.id === e.id) || config.meals.find((m) => m.id === e.id) || {};
    for (const k of ['kcal', 'protein', 'carbs']) sum[k] += (src[k] || 0) * (e.count || 0);
    if (e.count) sum.any = true;
  }
  return sum;
}

function changeMeal(date, meal, delta) {
  haptic();
  updateDay(date, (d) => {
    const meals = (d.meals || []).map((e) => ({ ...e }));
    const e = meals.find((x) => x.id === meal.id);
    if (e) e.count = Math.max(0, e.count + delta); else if (delta > 0) meals.push({ id: meal.id, count: delta });
    d.meals = meals.filter((x) => x.count > 0);
    // Snapshot: bestehende Werte behalten, neue Mahlzeiten mit den aktuellen Makros.
    const old = d.mealsSnapshot || [];
    d.mealsSnapshot = d.meals.map((x) => {
      const prev = old.find((s) => s.id === x.id);
      const src = prev || config.meals.find((m) => m.id === x.id) || {};
      return { id: x.id, count: x.count, kcal: src.kcal || 0, protein: src.protein || 0, carbs: src.carbs || 0 };
    });
    if (!d.meals.length) delete d.mealsSnapshot;
  });
  softRender();
}

function mealsBlock(date, day) {
  const meals = config.meals.filter(isActive);
  const counts = Object.fromEntries((day.meals || []).map((e) => [e.id, e.count]));
  const sum = nutritionOf(day);
  const t = config.targets.daily;
  const part = (label, key, unit = '') => h('span', {},
    `${label} `, h('b', {}, fmtNum(sum[key]), unit),
    t[key] != null ? h('span', { class: 'of' }, ` / ${fmtNum(t[key])}${unit}`) : null);
  return h('div', { class: 'block' },
    h('p', { class: 'block-title' }, h('span', {}, 'Mahlzeiten')),
    meals.length ? h('div', { class: 'meals' }, meals.map((m) => h('div', { class: `meal${counts[m.id] ? ' on' : ''}` },
      h('button', { type: 'button', class: 'meal-add', onclick: () => changeMeal(date, m, 1) },
        m.name, h('small', {}, `${fmtNum(m.kcal)} kcal · ${fmtNum(m.protein)} g P · ${fmtNum(m.carbs)} g KH`)),
      counts[m.id] ? h('span', { class: 'count' }, counts[m.id]) : null,
      counts[m.id] ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${m.name} verringern`, onclick: () => changeMeal(date, m, -1) }, '−') : null,
    ))) : h('p', { class: 'empty-note' }, 'Lege deine Mahlzeiten im Setup an.'),
    h('div', { class: 'sumline' }, part('', 'kcal', ' kcal'), part('P', 'protein', ' g'), part('KH', 'carbs', ' g')));
}

function metricBlock(m, date, slot) {
  if (m.type === 'bloodpressure') return h('div', { class: 'block' }, bpCard(m, date, slot));
  if (m.type === 'number') return h('div', { class: 'block' }, numberCard(m, date, slot));
  if (m.type === 'scale10') return scaleRow(m, date);
  return null;
}

function attachSwipe(el, onLeft, onRight) {
  let sx = null, sy = 0;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, select')) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
  }, { passive: true });
}

/** Morgens: Kurzbefehl starten, wenn die Health-Daten von gestern noch fehlen. */
function healthButton(date, today, slot) {
  if (!config.health.shortcut || date !== today || slot !== 'morning') return null;
  if (Store.get(healthPath(addDays(today, -1)))) return null;
  return h('div', { class: 'block' }, h('a', {
    class: 'btn block health-btn', href: `shortcuts://run-shortcut?name=${encodeURIComponent('Lebensapp-Health')}`,
  }, '♥ Apple-Health-Daten von gestern holen'));
}

function viewToday() {
  const today = logicalToday();
  if (todayUi.date && todayUi.date >= today) todayUi.date = null;
  const date = todayUi.date || today;
  const slot = todayUi.slot || currentSlot();
  const day = Object.assign(emptyDay(date), getDay(date) || {});
  const paused = day.pause ? config.pauseModes.find((p) => p.id === day.pause) || { id: day.pause, name: day.pause } : null;

  // Vergangene Tage bei Bedarf nachladen.
  if (date !== today && todayUi.ensured !== date && conn()) {
    todayUi.ensured = date;
    ensureDays(addDays(date, -1), date).then((changed) => { if (changed) softRender(); }).catch(() => {});
  }

  const go = (d) => { todayUi.date = d >= today ? null : d; todayUi.trainOpen = null; todayUi.pauseOpen = false; render(); };
  const yesterday = addDays(today, -1);
  const sub = date === today ? 'Heute' : `${date === yesterday ? 'Gestern' : `vor ${Math.round((parseYmd(today) - parseYmd(date)) / 86400000)} Tagen`} · Tippen für heute`;

  const { habits, metrics } = slotItems(slot);
  const p1Metrics = metrics.filter((m) => (m.prio || 1) === 1);
  const p2Metrics = metrics.filter((m) => (m.prio || 1) !== 1);
  const p1Habits = habits.filter((x) => (x.prio || 1) === 1);
  const p2Habits = habits.filter((x) => (x.prio || 1) !== 1);
  const bigFirst = (list) => list.filter((m) => m.type !== 'scale10');
  const scales = (list) => list.filter((m) => m.type === 'scale10');

  const root = h('div', {},
    h('div', { class: 'dayhead' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Vortag', onclick: () => go(addDays(date, -1)) }, '‹'),
      h('button', { type: 'button', class: 'date-btn', onclick: () => go(today) },
        h('strong', {}, formatDateLong(date)),
        h('small', { class: date === today ? '' : 'past' }, sub)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nächster Tag', disabled: date === today, onclick: () => go(addDays(date, 1)) }, '›')),

    h('div', { class: 'controls' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Check-in' },
        ['morning', 'evening'].map((s) => h('button', {
          type: 'button', class: slot === s ? 'on' : '', 'aria-pressed': slot === s ? 'true' : 'false',
          onclick: () => { todayUi.slot = s === currentSlot() ? null : s; todayUi.trainOpen = null; render(); },
        }, SLOT_LABEL[s]))),
      config.pauseModes.length ? h('button', {
        type: 'button', class: `pause-btn${paused ? ' on' : ''}`,
        onclick: () => { todayUi.pauseOpen = !todayUi.pauseOpen; render(); },
      }, paused ? `Pause: ${paused.name}` : 'Pause') : null),

    todayUi.pauseOpen ? h('div', { class: 'pause-menu' },
      config.pauseModes.map((p) => h('button', {
        type: 'button', class: `btn${day.pause === p.id ? ' primary' : ''}`,
        onclick: () => { updateDay(date, (d) => { d.pause = d.pause === p.id ? null : p.id; }); todayUi.pauseOpen = false; render(); },
      }, p.name)),
      paused ? h('button', { type: 'button', class: 'btn', onclick: () => { updateDay(date, (d) => { d.pause = null; }); todayUi.pauseOpen = false; render(); } }, 'Keine Pause') : null) : null,

    h('div', { class: 'progress', id: 'progress', role: 'presentation' }, h('i', { style: `width:${Math.round(progressOf(date, slot) * 100)}%` })),

    h('div', { class: `checkin${paused ? ' paused' : ''}` },
      paused ? h('p', { class: 'paused-note' }, 'Pause-Tag: zählt nicht in Durchschnitte und Wochenziele. Eingaben sind trotzdem möglich.') : null,
      bigFirst(p1Metrics).map((m) => metricBlock(m, date, slot)),
      slot === 'evening' ? [mealsBlock(date, day), trainingBlock(date, day)] : null,
      healthButton(date, today, slot),
      p1Habits.length ? h('div', { class: 'block' }, h('div', { class: 'tiles' }, p1Habits.map((x) => boolTile(x, date, slot, false)))) : null,
      scales(p1Metrics).map((m) => metricBlock(m, date, slot)),
      p2Habits.length ? h('div', { class: 'block' }, h('div', { class: 'tiles compact' }, p2Habits.map((x) => boolTile(x, date, slot, true)))) : null,
      p2Metrics.map((m) => metricBlock(m, date, slot)),
      !habits.length && !metrics.length && slot === 'morning' ? h('p', { class: 'empty-note' }, 'Für den Morgen ist nichts eingerichtet.') : null,
    ));

  attachSwipe(root, () => { if (date < today) go(addDays(date, 1)); }, () => go(addDays(date, -1)));
  return root;
}

// ---------- Woche ----------

const weekUi = { offset: 0 };

const weekStartFor = (offset) => addDays(mondayOf(logicalToday()), -7 * offset);
const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Nur Tage, die bewertet werden: nicht in der Zukunft, kein Pause-Tag. */
function countedDates(dates) {
  const today = logicalToday();
  return dates.filter((d) => d <= today && !(getDay(d) || {}).pause);
}
function countedDays(dates) {
  return countedDates(dates).map((d) => getDay(d)).filter(Boolean);
}

function metricAvg(m, dates, pick = (v) => v) {
  return avg(countedDates(dates).map((d) => metricOn(m, d)).filter((v) => v != null).map(pick).filter((v) => typeof v === 'number'));
}
function healthAvg(key, dates) {
  return avg(countedDates(dates).map((d) => (getHealth(d) || {})[key]).filter((v) => typeof v === 'number' && v > 0));
}

function sparkline(series) {
  const all = series.flat().filter((v) => v != null);
  if (all.filter((v) => v != null).length < 2) return null;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const path = (vals) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      const x = (i / (vals.length - 1)) * 100, y = 26 - ((v - min) / span) * 24;
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 28');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  series.forEach((vals, i) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path(vals));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (i > 0) p.setAttribute('class', 'second');
    svg.append(p);
  });
  return svg;
}

const fmtDuration = (min) => { const t = Math.round(min); return `${Math.floor(t / 60)}:${pad2(t % 60)} h`; };

function kpi(label, value, sub, spark) {
  return h('div', { class: 'kpi' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value),
    sub ? h('div', { class: 'sub' }, sub) : null,
    spark || null);
}

function viewWeek() {
  const start = weekStartFor(weekUi.offset);
  const dates = weekDates(start);
  const today = logicalToday();
  const days = countedDays(dates);
  const go = (offset) => { weekUi.offset = Math.max(0, offset); render(); ensureWeekData(); };
  // 8 Wochen für Sparklines (älteste zuerst)
  const weeks8 = Array.from({ length: 8 }, (_, i) => weekDates(addDays(start, -7 * (7 - i))));

  // 1. Wochenziele Training
  const goals = config.training.filter(isActive).map((t) => {
    const target = config.targets.weekly[weeklyKey(t)];
    if (target == null) return null;
    const entries = countedDates(dates).flatMap((d) => trainingFor(d).filter((e) => e.id === t.id));
    const ist = t.type === 'minutes' ? entries.reduce((s, e) => s + (e.min || 0), 0) : entries.length;
    const pct = target > 0 ? Math.min(100, (ist / target) * 100) : 100;
    return h('div', { class: 'goal' },
      h('div', { class: 'goal-top' }, h('span', {}, t.name), h('span', {}, `${fmtNum(ist)} / ${fmtNum(target)}${t.type === 'minutes' ? ' min' : ''}`)),
      h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })));
  }).filter(Boolean);

  // 2. Gewohnheiten-Raster
  const habits = byPrio(config.habits.filter(isActive));
  const grid = h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), dates.map((d) => h('th', {}, WD_SHORT[parseYmd(d).getDay()])))),
    h('tbody', {}, habits.map((hb) => h('tr', {},
      h('td', {}, hb.name),
      dates.map((d) => {
        const day = getDay(d);
        let cls = 'none', label = 'nicht eingetragen';
        if (d > today) { cls = 'future'; label = ''; }
        else if (day && day.pause) { cls = 'pause'; label = 'Pause'; }
        else if (day && day.habits && day.habits[hb.id] === true) { cls = 'done'; label = 'erledigt'; }
        else if (day && day.habits && day.habits[hb.id] === false) { cls = 'no'; label = 'nicht gemacht'; }
        return h('td', { class: 'cell' }, h('i', { class: cls, title: label, 'aria-label': `${WD_SHORT[parseYmd(d).getDay()]}: ${label}` }));
      })))));

  // 3. Kennzahlen im Wochenschnitt
  const kpis = [];
  for (const m of config.metrics.filter(isActive)) {
    if (m.type === 'number') {
      const decimals = m.decimals ?? 1;
      const cur = metricAvg(m, dates), prev = metricAvg(m, weekDates(addDays(start, -7)));
      const diff = cur != null && prev != null ? round(cur, decimals) - round(prev, decimals) : null;
      kpis.push(kpi(`${m.name} Ø`, cur != null ? `${fmtNum(cur, decimals)}${m.unit ? ` ${m.unit}` : ''}` : '–',
        diff != null ? `${diff > 1e-9 ? '+' : diff < -1e-9 ? '−' : '±'}${fmtNum(Math.abs(diff), decimals)} zur Vorwoche` : null,
        sparkline([weeks8.map((w) => metricAvg(m, w))])));
    } else if (m.type === 'bloodpressure') {
      const sys = metricAvg(m, dates, (v) => v.sys), dia = metricAvg(m, dates, (v) => v.dia);
      const pulse = metricAvg(m, dates, (v) => v.pulse);
      kpis.push(kpi(`${m.name} Ø`, sys != null ? `${fmtNum(sys)}/${fmtNum(dia)}` : '–',
        pulse != null ? `Puls ${fmtNum(pulse)}` : null,
        sparkline([weeks8.map((w) => metricAvg(m, w, (v) => v.sys)), weeks8.map((w) => metricAvg(m, w, (v) => v.dia))])));
    } else if (m.type === 'scale10') {
      const v = metricAvg(m, dates);
      kpis.push(kpi(`${m.name} Ø`, v != null ? fmtNum(v, 1) : '–'));
    }
  }
  const steps = healthAvg('steps', dates), sleep = healthAvg('sleepMin', dates);
  if (steps != null) kpis.push(kpi('Schritte Ø', fmtNum(steps), null, sparkline([weeks8.map((w) => healthAvg('steps', w))])));
  if (sleep != null) kpis.push(kpi('Schlaf Ø', fmtDuration(sleep), null, sparkline([weeks8.map((w) => healthAvg('sleepMin', w))])));
  const fed = days.map(nutritionOf).filter((n) => n.any);
  kpis.push(kpi('Ernährung Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.kcal)))} kcal` : '–',
    fed.length ? `${fmtNum(avg(fed.map((n) => n.protein)))} g Protein · ${fed.length} Tage` : null));

  const pauseCount = dates.filter((d) => d <= today && (getDay(d) || {}).pause).length;
  const end = addDays(start, 6);
  const root = h('div', {},
    h('div', { class: 'weekhead' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Vorherige Woche', onclick: () => go(weekUi.offset + 1) }, '‹'),
      h('button', { type: 'button', class: 'date-btn', onclick: () => go(0) },
        h('strong', {}, `KW ${isoWeek(start)}`),
        h('small', {}, `${formatDateShort(start)} – ${formatDateShort(end)}${weekUi.offset ? ' · Tippen für aktuelle Woche' : ''}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nächste Woche', disabled: weekUi.offset === 0, onclick: () => go(weekUi.offset - 1) }, '›')),
    pauseCount ? h('p', { class: 'hint' }, `${pauseCount} Pause-Tag${pauseCount > 1 ? 'e' : ''} – nicht mitgezählt.`) : null,
    h('h2', {}, 'Wochenziele'),
    goals.length ? goals : h('p', { class: 'empty-note' }, 'Keine Wochenziele gesetzt.'),
    h('h2', {}, 'Gewohnheiten'),
    habits.length ? grid : h('p', { class: 'empty-note' }, 'Keine aktiven Gewohnheiten.'),
    h('h2', {}, 'Wochenschnitt'),
    h('div', { class: 'kpis' }, kpis));
  attachSwipe(root, () => go(weekUi.offset - 1), () => go(weekUi.offset + 1));
  return root;
}

// ---------- Sync und Export ----------

const syncUi = { msg: '', loading: false, loaded: false };

const maskToken = (t) => (t ? `${t.slice(0, Math.min(11, t.length - 4))}…${t.slice(-4)}` : '–');

/** Alle Tagesdaten laden (für den Export). Offline: was im Cache ist. */
function loadAllDays() {
  if (syncUi.loading || syncUi.loaded) return;
  syncUi.loading = true;
  refreshIndex().then(() => ensureDays(null, null))
    .then(() => { syncUi.loaded = true; })
    .catch((e) => {
      syncUi.msg = e instanceof HttpError
        ? `${e.message} Der Export enthält nur die Daten auf diesem Gerät.`
        : 'Offline: Der Export enthält nur die Daten auf diesem Gerät.';
    })
    .finally(() => { syncUi.loading = false; if (ui.tab === 'sync') softRender(); });
}

/** Alle bekannten Daten eines Ordners (Repo-Index, Cache, ausstehend), sortiert. */
function cachedDates(dir) {
  const set = new Set(Object.keys((dir === 'health' ? meta.hindex : meta.index) || {}));
  const prefix = `la.d:${repoKey()}:`;
  let cachedPaths = [];
  try { cachedPaths = Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)); } catch { /* egal */ }
  const re = new RegExp(`^${dir}/(\\d{4}-\\d{2}-\\d{2})\\.json$`);
  for (const p of [...Object.keys(meta.pending), ...Object.keys(mem), ...cachedPaths]) {
    const m = re.exec(p);
    if (m) set.add(m[1]);
  }
  const has = dir === 'health' ? (d) => Store.get(healthPath(d)) : (d) => getDay(d);
  return [...set].filter(has).sort();
}
const allDates = () => cachedDates('days');

/** Link zur Kurzbefehl-Anleitung im App-Repo. */
function shortcutGuideUrl() {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  const base = m && repo ? `https://github.com/${m[1]}/${repo}` : 'https://github.com/marcobalzano222-hub/lebensapp';
  return `${base}/blob/main/HEALTH-SHORTCUT.md`;
}

function exportJson() {
  const days = {};
  for (const d of allDates()) days[d] = getDay(d);
  const health = {};
  for (const d of cachedDates('health')) health[d] = Store.get(healthPath(d)).data;
  return JSON.stringify({ exportedAt: isoLocal(), repo: repoKey(), config, days, health }, null, 2);
}

function exportCsv() {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['date', 'source', 'category', 'key', 'value', 'pause']];
  for (const date of allDates()) {
    const d = getDay(date);
    const pause = d.pause || '';
    const add = (category, key, value) => rows.push([date, 'app', category, key, value, pause]);
    if (d.pause) add('day', 'pause', d.pause);
    for (const [k, v] of Object.entries(d.habits || {})) add('habit', k, v);
    for (const [k, v] of Object.entries(d.metrics || {})) {
      if (v && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) add('metric', `${k}_${sk}`, sv);
      else add('metric', k, v);
    }
    for (const t of d.training || []) add('training', t.id, t.min ?? '');
    for (const m of d.meals || []) add('meal', m.id, m.count);
    const n = nutritionOf(d);
    if (n.any) { add('nutrition', 'kcal', n.kcal); add('nutrition', 'protein', n.protein); add('nutrition', 'carbs', n.carbs); }
  }
  for (const date of cachedDates('health')) {
    const hl = getHealth(date);
    if (!hl) continue;
    const pause = (getDay(date) || {}).pause || '';
    const add = (category, key, value) => rows.push([date, 'health', category, key, value, pause]);
    if (hl.steps != null) add('metric', 'steps', hl.steps);
    if (hl.sleepMin != null) add('metric', 'sleep_min', hl.sleepMin);
    if (hl.weight != null) add('metric', 'weight', hl.weight);
    for (const w of hl.workouts) {
      const id = mapWorkout(w.type);
      add('training', id && id !== 'ignore' ? id : `unmapped:${w.type}`, w.min || '');
    }
  }
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/** Über das iOS-Share-Sheet teilen, sonst herunterladen. */
async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function viewSync() {
  const c = conn();
  const state = syncState();
  const stateLabel = { ok: 'Synchron', pending: Sync.offline ? 'Offline – wartet' : 'Ausstehend', error: 'Fehler', none: '–' }[state];
  loadAllDays();
  const stamp = ymd(new Date());
  const setMsg = (m) => { syncUi.msg = m; softRender(); };

  return h('div', {},
    h('h1', {}, 'Sync'),
    h('div', { class: 'card' },
      h('div', { class: 'kv' }, h('span', {}, 'Repo'), h('span', {}, `${c.owner}/${c.repo}`)),
      h('div', { class: 'kv' }, h('span', {}, 'Token'), h('span', {}, maskToken(c.token))),
      h('div', { class: 'kv' }, h('span', {}, 'Status'), h('span', {}, stateLabel)),
      h('div', { class: 'kv' }, h('span', {}, 'Letzter Sync'), h('span', {}, formatDateTime(meta.lastSync))),
      h('div', { class: 'kv' }, h('span', {}, 'Ausstehende Änderungen'), h('span', {}, String(Sync.pendingCount()))),
      meta.lastError ? h('div', { class: 'kv' }, h('span', {}, 'Letzter Fehler'), h('span', { class: 'error-text' }, meta.lastError)) : null),
    syncUi.msg ? h('p', { class: 'hint', role: 'status' }, syncUi.msg) : null,
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: async () => {
          try { const r = await GH.repo(); setMsg(`Verbindung ok${r.private ? ' (privates Repo)' : ' – Achtung: Repo ist öffentlich!'}.`); } catch (e) { setMsg(e instanceof HttpError ? e.message : 'Keine Verbindung zu GitHub.'); }
        },
      }, 'Verbindung testen'),
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => { syncUi.msg = ''; await Sync.flush(); await refreshFromRemote(); softRender(); },
      }, 'Jetzt synchronisieren')),

    h('h2', {}, 'Export'),
    h('p', { class: 'hint' }, syncUi.loading ? 'Lade alle Tage …' : `${allDates().length} Tage, Konfiguration inklusive.`),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', disabled: syncUi.loading, onclick: () => shareFile(`lebensapp-${stamp}.json`, exportJson(), 'application/json') }, 'Alles als JSON'),
      h('button', { type: 'button', class: 'btn', disabled: syncUi.loading, onclick: () => shareFile(`lebensapp-${stamp}.csv`, exportCsv(), 'text/csv') }, 'Alles als CSV')),

    h('h2', {}, 'Gerät'),
    h('button', {
      type: 'button', class: 'btn danger block',
      onclick: () => {
        const n = Sync.pendingCount();
        if (n && !confirm(`${n} Änderung${n > 1 ? 'en sind' : ' ist'} noch nicht übertragen und ginge${n > 1 ? 'n' : ''} verloren. Trotzdem abmelden?`)) return;
        if (!n && !confirm('Token von diesem Gerät entfernen? Deine Daten bleiben im Repo.')) return;
        Store.clearAll();
        LS.del('la.conn');
        config = null;
        Object.assign(syncUi, { msg: '', loaded: false });
        loadMeta();
        render();
      },
    }, 'Token entfernen / abmelden'));
}

const views = {
  today: viewToday,
  week: viewWeek,
  setup: viewSetup,
  sync: viewSync,
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
function ensureWeekData() {
  if (!conn()) return Promise.resolve();
  const start = weekStartFor(weekUi.offset);
  return ensureDays(addDays(start, -7 * 8), addDays(start, 6))
    .then((changed) => { if (changed && ui.tab === 'week') softRender(); })
    .catch((e) => { Sync.handleError(e); updateDot(); });
}

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
  let clockKey = config ? logicalToday() + currentSlot() : '';
  setInterval(() => {
    if (!config) return;
    const k = logicalToday() + currentSlot();
    if (k !== clockKey) { clockKey = k; if (ui.tab === 'today') softRender(); }
  }, 60 * 1000);

  // Lokal (Entwicklung) ohne Service Worker, damit Änderungen sofort sichtbar sind; mit ?sw=1 erzwingen.
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !dev) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker:', e.message));
  }
}

/** Nach Rückkehr in die App: automatischen Check-in und „Heute“ neu bestimmen. */
function onResume(reset) {
  if (reset) Object.assign(todayUi, { date: null, slot: null, pauseOpen: false, trainOpen: null });
  softRender();
}

init();
