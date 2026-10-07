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
    daily: { kcal: null, protein: null, carbs: null, steps: 8000, sleepH: 7.5 },
    weekly: { zone2_min: 60, strength_sessions: 3, hit_sessions: 1, sauna_sessions: 1 },
  },
  habits: [
    { id: 'meditation_am', name: 'Meditation morgens', type: 'bool', slot: 'morning', prio: 1, active: true },
    { id: 'light_am', name: 'Licht nach dem Aufstehen', type: 'bool', slot: 'morning', prio: 2, active: true },
    { id: 'omega3', name: 'Omega 3', type: 'bool', slot: 'morning', prio: 2, active: true, group: 'Supplements' },
    { id: 'vitamin_d3', name: 'Vitamin D3', type: 'bool', slot: 'morning', prio: 2, active: true, group: 'Supplements' },
    { id: 'creatine', name: 'Kreatin', type: 'bool', slot: 'morning', prio: 2, active: true, group: 'Supplements' },
    { id: 'magnesium', name: 'Magnesium', type: 'bool', slot: 'evening', prio: 2, active: true, group: 'Supplements' },
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
  meals: [],
  recipes: [],
  counters: [
    { id: 'sweets', name: 'Süßes', active: true },
    { id: 'alcohol', name: 'Alkohol', active: true },
    { id: 'caffeine_late', name: 'Koffein nach 14 Uhr', active: true },
    { id: 'late_meal', name: 'Spät gegessen', active: true },
    { id: 'stress', name: 'Stress', active: true },
  ],
  pauseModes: [
    { id: 'sick', name: 'Krank' },
    { id: 'travel', name: 'Reise' },
  ],
};

/** Fehlende Felder ergänzen, damit ältere oder handgeschriebene Konfigurationen nicht stören. */
function normalizeConfig(c) {
  const cfg = Object.assign(clone(DEFAULT_CONFIG), c || {});
  if (c && !Array.isArray(c.counters)) cfg.counters = [];   // bestehende Konfiguration: Migration ergänzt die Standardzähler
  cfg.user = Object.assign({ name: '' }, cfg.user);
  cfg.windows = Object.assign(clone(DEFAULT_CONFIG.windows), cfg.windows);
  cfg.targets = Object.assign({ daily: {}, weekly: {} }, cfg.targets);
  cfg.targets.daily = Object.assign({ kcal: null, protein: null, fat: null, carbs: null, steps: null, sleepH: null }, cfg.targets.daily);
  cfg.targets.weekly = Object.assign({}, cfg.targets.weekly);
  for (const k of ['habits', 'metrics', 'training', 'meals', 'counters', 'pauseModes', 'recipes']) if (!Array.isArray(cfg[k])) cfg[k] = [];
  if (!Array.isArray(cfg.foods)) cfg.foods = clone(DEFAULT_FOODS);
  if (!Array.isArray(cfg.exercises)) cfg.exercises = clone(DEFAULT_EXERCISES);
  if (!Array.isArray(cfg.noteTags)) cfg.noteTags = [...DEFAULT_NOTE_TAGS];
  if (!Array.isArray(cfg.dayTags)) cfg.dayTags = DEFAULT_DAY_TAGS.map((t) => ({ ...t }));
  cfg.health = Object.assign({ workoutMap: {} }, cfg.health);
  if (!cfg.health.workoutMap || typeof cfg.health.workoutMap !== 'object') cfg.health.workoutMap = {};
  return cfg;
}

/**
 * Einmalige Umstellungen bestehender Konfigurationen. Liefert true, wenn sich etwas geändert hat.
 * - split_supplements: „Supplements“ (ein Tap für alles) → vier einzelne Gewohnheiten.
 */
function migrateConfig(cfg) {
  cfg.migrations = cfg.migrations || [];
  let changed = false;
  if (!cfg.migrations.includes('split_supplements')) {
    const old = cfg.habits.find((x) => x.id === 'supplements');
    if (old && isActive(old) && !cfg.habits.some((x) => x.group === 'Supplements')) {
      old.active = false;
      const at = cfg.habits.indexOf(old) + 1;
      const add = DEFAULT_CONFIG.habits.filter((x) => x.group === 'Supplements').map((x) => ({ ...x, slot: old.slot === 'evening' ? 'evening' : x.slot }));
      cfg.habits.splice(at, 0, ...add.filter((x) => !cfg.habits.some((y) => y.id === x.id)));
    }
    cfg.migrations.push('split_supplements');
    changed = true;
  }
  if (!cfg.migrations.includes('meals_to_recipes')) {
    // Frühere Mahlzeiten (feste Nährwerte) werden zu Rezepten; das Beispiel entfällt.
    for (const m of cfg.meals.filter((x) => isActive(x) && x.id !== 'example_meal')) {
      if (!cfg.recipes.some((r) => r.id === m.id)) cfg.recipes.push({ id: m.id, name: m.name, kcal: m.kcal || 0, protein: m.protein || 0, fat: m.fat || 0, carbs: m.carbs || 0, active: true });
    }
    cfg.migrations.push('meals_to_recipes');
    changed = true;
  }
  if (!cfg.migrations.includes('add_strength')) {
    if (cfg.targets.weekly.sets_legs == null) cfg.targets.weekly.sets_legs = 5;
    cfg.migrations.push('add_strength');
    changed = true;
  }
  if (!cfg.migrations.includes('add_counters')) {
    for (const c of DEFAULT_CONFIG.counters) if (!cfg.counters.some((x) => x.id === c.id)) cfg.counters.push({ ...c });
    cfg.migrations.push('add_counters');
    changed = true;
  }
  return changed;
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
  healthCache.clear();
  if (config && migrateConfig(config)) saveConfig('config: migrate');
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

/** Zeitpunkt aus ISO 8601 oder deutschem Format („25.09.2026, 07:12“). */
function parseHealthTime(v) {
  const t = Date.parse(v);
  if (Number.isFinite(t)) return t;
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v || ''));
  if (!m) return NaN;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(y, m[2] - 1, m[1], m[4], m[5], m[6] || 0).getTime();
}

/**
 * Rang einer Quelle. Maßgeblich ist die Reihenfolge aus dem Setup (wie in Health →
 * Schritte → Datenquellen); unbekannte Quellen: Watch vor anderen vor iPhone.
 */
function sourceRank(src) {
  const order = (config && config.health && config.health.sourceOrder) || [];
  const i = order.indexOf(src);
  if (i !== -1) return i;
  return order.length + (/watch/i.test(src) ? 0 : /iphone/i.test(src) ? 2 : 1);
}

/**
 * Schritte eines Tages aus Einzelwerten (Spalten Start/Ende/Wert/Quelle).
 * Überlappende Zeiträume zählen nur einmal: Quellen mit höherem Rang gewinnen,
 * niedrigere tragen nur den nicht überdeckten Anteil ihres Zeitraums bei.
 */
function dedupSteps(raw, date) {
  const col = (k) => String(raw[k] || '').split(/\r?\n/);
  const starts = col('stepsStart'), ends = col('stepsEnd'), values = col('stepsValue'), sources = col('stepsSource');
  const samples = starts.map((st, i) => ({ s: parseHealthTime(st), e: parseHealthTime(ends[i]), v: looseNum(values[i]), src: (sources[i] || '').trim() }))
    .filter((x) => Number.isFinite(x.s) && x.v != null && ymd(new Date(x.s)) === date)
    .map((x) => ({ ...x, e: Number.isFinite(x.e) && x.e >= x.s ? x.e : x.s }));
  if (!samples.length) return null;
  const bySource = {};
  for (const x of samples) (bySource[x.src] = bySource[x.src] || []).push(x);
  const order = Object.keys(bySource).sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
  let covered = [];   // vereinigte Intervalle aller bisher gezählten Quellen
  const overlap = (s, e) => covered.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0);
  const inside = (t) => covered.some(([a, b]) => t >= a && t <= b);
  const perSource = {};
  let total = 0;
  for (const src of order) {
    let part = 0;
    for (const x of bySource[src]) {
      const len = x.e - x.s;
      part += len > 0 ? x.v * Math.max(0, 1 - overlap(x.s, x.e) / len) : (inside(x.s) ? 0 : x.v);
    }
    perSource[src || '?'] = Math.round(bySource[src].reduce((a, x) => a + x.v, 0));
    total += part;
    covered = [...covered, ...bySource[src].map((x) => [x.s, x.e])].sort((a, b) => a[0] - b[0])
      .reduce((acc, iv) => { const last = acc[acc.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else acc.push([...iv]); return acc; }, []);
  }
  return { steps: Math.round(total), perSource };
}

/** Gesamtdauer (Minuten) einer Menge von Intervallen [start, ende] ohne Doppelzählung. */
function unionMinutes(iv) {
  let total = 0, cur = null;
  for (const [a, b] of [...iv].sort((x, y) => x[0] - y[0])) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / 60000);
}

/** Schlafphase aus dem (lokalisierten) Wert. */
function sleepStage(v) {
  if (/tief|deep/i.test(v)) return 'deep';
  if (/rem/i.test(v)) return 'rem';
  if (/kern|core/i.test(v)) return 'core';
  return 'asleep';
}

/**
 * Schlaf der Nacht, die am Morgen von date endet (Beginn zwischen 18:00 am Vortag und 12:00).
 * Liefern mehrere Quellen (z. B. Oura und Watch), zählt nur die oberste aus dem Setup.
 */
function sleepStats(samples, date) {
  const from = date ? parseYmd(addDays(date, -1)).setHours(18, 0, 0, 0) : -Infinity;
  const to = date ? parseYmd(date).setHours(12, 0, 0, 0) : Infinity;
  const asleep = samples
    .filter((x) => !ASLEEP_EXCLUDE.test(x.value || ''))
    .map((x) => ({ s: parseHealthTime(x.start), e: parseHealthTime(x.end), stage: sleepStage(x.value || ''), src: (x.source || '').trim() }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.s >= from && x.s < to);
  if (!asleep.length) return null;
  const src = [...new Set(asleep.map((x) => x.src))].sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b))[0];
  const mine = asleep.filter((x) => x.src === src);
  const stage = (k) => { const iv = mine.filter((x) => x.stage === k).map((x) => [x.s, x.e]); return iv.length ? unionMinutes(iv) : null; };
  const bed = Math.min(...mine.map((x) => x.s)), wake = Math.max(...mine.map((x) => x.e));
  // Wachphasen derselben Quelle innerhalb der Nacht
  const awake = samples
    .filter((x) => /wach|awake/i.test(x.value || '') && (x.source || '').trim() === src)
    .map((x) => ({ s: parseHealthTime(x.start), e: parseHealthTime(x.end), stage: 'awake' }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.s >= bed && x.e <= wake);
  return {
    total: unionMinutes(mine.map((x) => [x.s, x.e])),
    awake: awake.length ? unionMinutes(awake.map((x) => [x.s, x.e])) : null,
    timeline: [...mine, ...awake].map((x) => ({ s: x.s, e: x.e, stage: x.stage })).sort((a, b) => a.s - b.s),
    bedTime: Math.min(...mine.map((x) => x.s)),
    wakeTime: Math.max(...mine.map((x) => x.e)),
    deep: stage('deep'), rem: stage('rem'), core: stage('core'),
    source: src, sources: [...new Set(asleep.map((x) => x.src).filter(Boolean))],
  };
}

/** Blutdruck des Tages aus Apple Health: letzte Messung der obersten Quelle (sys/dia nach Zeitpunkt gepaart). */
function healthBp(sysText, diaText, date) {
  const parse = (v) => healthLines(v, ['start', 'value', 'source'])
    .map((x) => ({ t: parseHealthTime(x.start), v: looseNum(x.value), src: (x.source || '').trim() }))
    .filter((x) => Number.isFinite(x.t) && x.v != null && x.v > 0 && ymd(new Date(x.t)) === date);
  const sys = parse(sysText), dia = parse(diaText);
  if (!sys.length || !dia.length) return null;
  const src = [...new Set(sys.map((x) => x.src))].sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b))[0];
  const last = sys.filter((x) => x.src === src).sort((a, b) => b.t - a.t)[0];
  const match = dia.filter((x) => x.src === src).sort((a, b) => Math.abs(a.t - last.t) - Math.abs(b.t - last.t))[0];
  if (!match || Math.abs(match.t - last.t) > 5 * 60 * 1000) return null;
  return { value: { sys: Math.round(last.v), dia: Math.round(match.v) }, sources: src ? [src] : [] };
}

/** Herzwerte (Ruhepuls, HRV) des Tages: Durchschnitt der obersten Quelle, ab 18:00 am Vortag. */
function heartValue(v, date) {
  const lines = healthLines(v, ['start', 'value', 'source'])
    .map((x) => ({ t: parseHealthTime(x.start), v: looseNum(x.value), src: (x.source || '').trim() }))
    .filter((x) => Number.isFinite(x.t) && x.v != null && x.v > 0);
  const from = parseYmd(addDays(date, -1)).setHours(18, 0, 0, 0), to = parseYmd(addDays(date, 1)).setHours(0, 0, 0, 0);
  const inDay = lines.filter((x) => x.t >= from && x.t < to);
  if (!inDay.length) return { value: null, sources: [] };
  const sources = [...new Set(inDay.map((x) => x.src))].sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
  const mine = inDay.filter((x) => x.src === sources[0]);
  return { value: Math.round(mine.reduce((a, x) => a + x.v, 0) / mine.length), sources: sources.filter(Boolean) };
}

const healthCache = new Map();   // path → { sha, parsed }

// ---------- Health-Historie (history/daily.json, einmalig aus dem Health-Export, siehe tools/import_health_export.py) ----------
// { from, to, days: { "JJJJ-MM-TT": { steps, sleepMin, deepMin, remMin, coreMin, awakeMin, bed, wake, weight,
//   bpSys, bpDia, hrv, restingHr, exerciseMin, workouts: [[Typ, Minuten]] } } }

const HISTORY_PATH = 'history/daily.json';
const historyData = () => { const f = Store.get(HISTORY_PATH); return f && f.data && f.data.days ? f.data : null; };

/** Historie neu laden, wenn sie sich im Repo geändert hat. */
async function ensureHistory() {
  const remote = (await GH.listDir('history')).find((f) => f.name === 'daily.json');
  const cached = Store.get(HISTORY_PATH);
  if (!remote || (cached && cached.sha === remote.sha)) return false;
  const f = await GH.getFile(HISTORY_PATH);
  if (!f) return false;
  Store.put(HISTORY_PATH, f.data, f.sha);
  healthCache.clear();
  return true;
}

/** Tageswerte aus der Historie im Format von getHealth (ohne Schlaf-Zeitstrahl). */
function historyHealth(date) {
  const hd = historyData();
  const x = hd && hd.days[date];
  if (!x) return null;
  const at = (hhmm, night) => {
    const [hh, mm] = String(hhmm).split(':').map(Number);
    const d = parseYmd(night && hh >= 12 ? addDays(date, -1) : date);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  };
  const n = (v) => (typeof v === 'number' && v > 0 ? v : null);
  return {
    date,
    steps: n(x.steps), weight: n(x.weight), stepSources: null,
    sleepMin: n(x.sleepMin), deepMin: n(x.deepMin), remMin: n(x.remMin), coreMin: n(x.coreMin), awakeMin: n(x.awakeMin),
    bedTime: x.bed && x.sleepMin ? at(x.bed, true) : null, wakeTime: x.wake && x.sleepMin ? at(x.wake, false) : null,
    timeline: null, sleepSource: x.sleepMin ? 'Health-Export' : null,
    restingHr: n(x.restingHr), hrv: n(x.hrv),
    bp: n(x.bpSys) && n(x.bpDia) ? { sys: x.bpSys, dia: x.bpDia } : null,
    exerciseMin: n(x.exerciseMin),
    sources: [], workouts: (x.workouts || []).map(([type, min]) => ({ type, start: null, min })),
    fromHistory: true,
  };
}

const SLEEP_KEYS = ['sleepMin', 'deepMin', 'remMin', 'coreMin', 'awakeMin', 'bedTime', 'wakeTime', 'sleepSource'];

/** Lücken in den Kurzbefehl-Daten mit der Historie füllen (Schlaf nur als Ganzes). */
function fillFromHistory(parsed, date) {
  const hx = historyHealth(date);
  if (!hx) return parsed;
  if (parsed.sleepMin == null && hx.sleepMin != null) for (const k of SLEEP_KEYS) parsed[k] = hx[k];
  for (const k of ['steps', 'weight', 'restingHr', 'hrv', 'bp', 'exerciseMin']) if (parsed[k] == null && hx[k] != null) parsed[k] = hx[k];
  if (!parsed.workouts.length && hx.workouts.length) parsed.workouts = hx.workouts;
  return parsed;
}

/**
 * Rohdaten für einen Tag. Seit Kurzbefehl v6 enthält jede Datei „gestern + heute bis jetzt“;
 * Daten für date stehen daher in health/date.json (vollständig) und health/(date−1).json (Teil des Tages,
 * inkl. der Nacht, die am Morgen von date endet). Beide werden zusammengeführt, doppelte Zeilen entfernt.
 */
function healthRaw(date) {
  const own = Store.get(healthPath(date)), prev = Store.get(healthPath(addDays(date, -1)));
  const files = [own, prev].filter((f) => f && f.data && !f.data.invalid);
  if (!files.length) return null;
  const key = files.map((f) => f.sha).join('+');
  const text = (k) => [...new Set(files.flatMap((f) => (typeof f.data[k] === 'string' ? f.data[k].split(/\r?\n/) : [])).filter((x) => x.trim()))].join('\n');
  const raw = {};
  for (const k of ['sleep', 'restingHr', 'hrv', 'bpSys', 'bpDia', 'workouts', 'weight', 'exercise']) raw[k] = text(k);
  // Schritte pro Tag (gruppiert): je Tag der größte Wert – ein früherer Lauf kennt nur einen Teil des Tages
  const perDay = {};
  for (const f of files) {
    if (typeof f.data.steps !== 'string') continue;
    for (const l of f.data.steps.split(/\r?\n/)) {
      const [st, v] = l.split('|');
      const t = parseHealthTime(st), n = looseNum(v);
      if (!Number.isFinite(t) || n == null) continue;
      const d = ymd(new Date(t));
      if (!perDay[d] || n > perDay[d].n) perDay[d] = { st, n };
    }
  }
  raw.steps = Object.values(perDay).map((x) => `${x.st}|${x.n}`).join('\n');
  // Schritt-Einzelwerte: Spalten zusammenführen, gleiche Messungen nur einmal
  const rows = new Map();
  for (const f of files) {
    if (!f.data.stepsValue) continue;
    const c = (k) => String(f.data[k] || '').split(/\r?\n/);
    const st = c('stepsStart'), en = c('stepsEnd'), va = c('stepsValue'), so = c('stepsSource');
    st.forEach((x, i) => { if (x.trim()) rows.set(`${x}|${en[i]}|${va[i]}|${so[i]}`, [x, en[i], va[i], so[i]]); });
  }
  if (rows.size) {
    const list = [...rows.values()];
    raw.stepsStart = list.map((r) => r[0]).join('\n'); raw.stepsEnd = list.map((r) => r[1]).join('\n');
    raw.stepsValue = list.map((r) => r[2]).join('\n'); raw.stepsSource = list.map((r) => r[3]).join('\n');
  }
  // Alte Dateien mit Einzelzahlen gelten nur für ihren eigenen Tag
  if (own && own.data && !own.data.invalid) {
    for (const k of ['steps', 'weight', 'sleepMin']) if (typeof own.data[k] === 'number') raw[k] = own.data[k];
  }
  raw.debug = own && own.data ? own.data.debug : null;
  return { raw, key, hasOwn: !!(own && own.data && !own.data.invalid) };
}

/** Aufbereitete Health-Daten eines Tages oder null. */
function getHealth(date) {
  // Schlüssel zuerst (billig), damit die Rohdaten nur bei Änderungen neu zusammengesetzt werden
  const files = [healthPath(date), healthPath(addDays(date, -1))].map((p) => Store.get(p)).filter((f) => f && f.data && !f.data.invalid);
  const key = `${files.map((f) => f.sha).join('+') || '-'}|${(Store.get(HISTORY_PATH) || {}).sha || ''}`;
  const hit = healthCache.get(date);
  if (hit && hit.key === key) return hit.parsed;
  const src = files.length ? healthRaw(date) : null;
  if (!src) {
    const hx = historyHealth(date);
    healthCache.set(date, { key, parsed: hx });
    return hx;
  }
  const raw = src.raw;
  const sleep = healthLines(raw.sleep, ['value', 'start', 'end', 'source']);
  const sleepInfo = sleepStats(sleep, date);
  const rhr = heartValue(raw.restingHr, date), hrv = heartValue(raw.hrv, date);
  const bp = healthBp(raw.bpSys, raw.bpDia, date);
  const workouts = healthLines(raw.workouts, ['type', 'start', 'min'])
    .map((w) => ({ type: String(w.type || '').trim(), start: w.start || null, min: Math.round(looseNum(w.min ?? w.minutes ?? w.duration) || 0) }))
    .filter((w) => w.type);
  // Neues Format: Zeilen „Start|Wert“ – nur Werte, die an date begonnen haben, zählen.
  const onDate = (v) => {
    if (typeof v !== 'string' || !v.includes('|')) return null;
    return healthLines(v, ['start', 'value'])
      .map((x) => ({ t: Date.parse(x.start), v: looseNum(x.value) }))
      .filter((x) => Number.isFinite(x.t) && x.v != null && ymd(new Date(x.t)) === date)
      .sort((a, b) => a.t - b.t);
  };
  const stepLines = onDate(raw.steps), weightLines = onDate(raw.weight), exerciseLines = onDate(raw.exercise);
  // Trainingsminuten (Kurzbefehl v9, pro Tag summiert): spätere Läufe kennen mehr vom Tag → größter Wert
  const exerciseMin = exerciseLines && exerciseLines.length ? Math.round(Math.max(...exerciseLines.map((x) => x.v))) : null;
  const weight = weightLines ? (weightLines.length ? weightLines[weightLines.length - 1].v : null) : looseNum(raw.weight);
  const dedup = raw.stepsValue ? dedupSteps(raw, date) : null;
  const steps = dedup ? dedup.steps
    : stepLines ? (stepLines.length ? stepLines.reduce((a, x) => a + x.v, 0) : null) : looseNum(raw.steps);
  const parsed = {
    date,
    steps: steps != null && steps > 0 ? Math.round(steps) : null,
    weight: weight != null && weight > 0 ? round(weight, 1) : null,
    stepSources: dedup ? dedup.perSource : null,
    sleepMin: raw.sleepMin != null ? looseNum(raw.sleepMin) : sleepInfo ? sleepInfo.total : null,
    deepMin: sleepInfo ? sleepInfo.deep : null,
    remMin: sleepInfo ? sleepInfo.rem : null,
    coreMin: sleepInfo ? sleepInfo.core : null,
    bedTime: sleepInfo ? sleepInfo.bedTime : null,
    wakeTime: sleepInfo ? sleepInfo.wakeTime : null,
    awakeMin: sleepInfo ? sleepInfo.awake : null,
    timeline: sleepInfo ? sleepInfo.timeline : null,
    sleepSource: sleepInfo ? sleepInfo.source : null,
    restingHr: rhr.value,
    bp: bp ? bp.value : null,
    hrv: hrv.value,
    exerciseMin: exerciseMin > 0 ? exerciseMin : null,
    sources: [...new Set([...(dedup ? Object.keys(dedup.perSource) : []), ...(sleepInfo ? sleepInfo.sources : []), ...rhr.sources, ...hrv.sources, ...(bp ? bp.sources : [])].filter((x) => x && x !== '?'))],
    workouts,
  };
  fillFromHistory(parsed, date);
  if (![parsed.steps, parsed.weight, parsed.sleepMin, parsed.restingHr, parsed.hrv, parsed.bp, parsed.exerciseMin].some((v) => v != null) && !parsed.workouts.length && !src.hasOwn) {
    healthCache.set(date, { key, parsed: null });
    return null;
  }
  healthCache.set(date, { key, parsed });
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
  const out = [...fromHealth, ...manual.filter((e) => !covered.has(e.id))];
  // Protokollierte Kraft-Sätze zählen als eine Einheit, falls nicht schon erfasst
  if (((getDay(date) || {}).strength || []).length && config.training.some((t) => t.id === 'strength') && !out.some((e) => e.id === 'strength')) {
    out.push({ id: 'strength', source: 'sets' });
  }
  return out;
}

/** Wert einer Kennzahl an einem Tag – bei Quelle „health“ aus Apple Health. */
function healthMetric(m, date) {
  const hl = getHealth(date);
  if (!hl) return null;
  if (m.type === 'bloodpressure') return hl.bp || null;
  return m.id === 'weight' ? hl.weight : null;
}

/**
 * Wert einer Kennzahl an einem Tag. Quelle „health“: nur Apple Health.
 * Sonst: eigener Eintrag, und falls keiner da ist, der Wert aus Apple Health (z. B. Waage).
 */
function metricOn(m, date) {
  if (m.source === 'health') return healthMetric(m, date);
  return ((getDay(date) || {}).metrics || {})[m.id] ?? healthMetric(m, date);
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
        data = remote ? (path.startsWith('notes/') ? mergeNotes(remote.data, current) : mergeLocalOver(remote.data, current)) : current;
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
      try { if (await ensureNotes()) changed = true; } catch { /* Notizen sind optional */ }
      try { if (await ensureHistory()) changed = true; } catch { /* Historie ist optional */ }
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

/** Logisches „Heute“: Bis zum Ende des Abendfensters (z. B. 05:59) zählt noch der Vortag. */
function logicalToday(now = new Date()) {
  const today = ymd(now);
  if (!config) return today;
  const ev = config.windows.evening;
  const s = toMin(ev.start), e = toMin(ev.end);
  if (e < s && nowMin(now) <= e) return addDays(today, -1);
  return today;
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

const setupUi = { focus: null, openCat: null, openGroup: null, recipeOpen: null };
// Aufgeklappte Setup-Gruppen (nur auf diesem Gerät); standardmäßig alles zu
const setupOpen = new Set(LS.get('la.ui.setupOpen', []));

function setupGroup(id, title, summary, content) {
  const open = setupOpen.has(id);
  return h('section', { class: `sgroup${open ? ' open' : ''}`, id: `setup-${id}` },
    h('button', {
      type: 'button', class: 'sgroup-head', 'aria-expanded': open ? 'true' : 'false',
      onclick: () => { if (open) setupOpen.delete(id); else setupOpen.add(id); LS.set('la.ui.setupOpen', [...setupOpen]); softRender(); },
    }, h('span', {}, h('b', {}, title), summary ? h('small', {}, summary) : null), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
    open ? h('div', { class: 'sgroup-body' }, content) : null);
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
    (it.id === 'weight' && it.type === 'number') || it.type === 'bloodpressure'
      ? selectEl({ manual: 'Manuell + Health', health: 'Nur Apple Health' }, it.source || 'manual', (v) => { it.source = v; commitConfig('metrics', true); })
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

  // Lebensmittel (je Kategorie aufklappbar) und Rezepte
  const macroInputs = (it, what) => MACROS.map((k) => h('label', { class: 'inline' }, { kcal: 'kcal', protein: 'P', fat: 'F', carbs: 'KH' }[k],
    numEl(it[k], (v) => { it[k] = v ?? 0; commitConfig(what); }, { decimal: k !== 'kcal' })));
  const foodRow = (it) => h('div', { class: `row${isActive(it) ? '' : ' inactive'}` },
    h('div', { class: 'row-main' },
      textEl(it.name, (v) => { if (v.trim()) { it.name = v.trim(); commitConfig('foods'); } }, { 'aria-label': 'Name' }),
      textEl(it.unit, (v) => { it.unit = v.trim(); commitConfig('foods'); }, { 'aria-label': 'Einheit', placeholder: 'Einheit', style: 'max-width:120px' })),
    (() => { const calc = 4 * (it.protein || 0) + 4 * (it.carbs || 0) + 9 * (it.fat || 0); return it.kcal && Math.abs(it.kcal - calc) > Math.max(15, it.kcal * 0.15) ? h('p', { class: 'macro-check bad' }, `Nährwerte ergeben ${fmtNum(calc)} kcal statt ${fmtNum(it.kcal)}.`) : null; })(),
    h('div', { class: 'row-opts' }, macroInputs(it, 'foods'),
      h('button', { type: 'button', class: `toggle${isActive(it) ? ' on' : ''}`, onclick: () => { it.active = !isActive(it); commitConfig('foods', true); } }, isActive(it) ? 'Aktiv' : 'Inaktiv')));
  const foodCats = Object.entries(FOOD_CATS).map(([cat, label]) => {
    const list = c.foods.filter((f) => f.cat === cat);
    return h('details', { class: 'cat', open: setupUi.openCat === cat },
      h('summary', { onclick: () => { setupUi.openCat = setupUi.openCat === cat ? null : cat; } }, `${label} (${list.filter(isActive).length})`),
      h('div', { class: 'rows' }, list.map(foodRow)));
  });
  const newFood = h('input', { type: 'text', placeholder: 'Neues Lebensmittel' });
  const newFoodCat = selectEl(FOOD_CATS, 'protein', () => {});
  const newFoodUnit = h('input', { type: 'text', placeholder: 'Einheit, z. B. 50 g', style: 'max-width:140px' });

  const recipeRow = (r) => {
    const open = setupUi.recipeOpen === r.id;
    const m = recipeMacros(r);
    const setItem = (f, delta) => {
      r.items = { ...(r.items || {}) };
      const n = Math.max(0, (r.items[f.id] || 0) + delta);
      if (n) r.items[f.id] = n; else delete r.items[f.id];
      commitConfig('recipes', true);
    };
    return h('div', { class: `row${isActive(r) ? '' : ' inactive'}` },
      h('div', { class: 'row-main' },
        textEl(r.name, (v) => { if (v.trim()) { r.name = v.trim(); commitConfig('recipes'); } }, { 'aria-label': 'Name' }),
        h('button', { type: 'button', class: `toggle${open ? ' on' : ''}`, onclick: () => { setupUi.recipeOpen = open ? null : r.id; softRender(); } }, open ? 'Fertig' : 'Zutaten')),
      h('p', { class: 'hint' }, r.items
        ? `${Object.entries(r.items).map(([id, n]) => `${n}× ${(c.foods.find((f) => f.id === id) || { name: id }).name}`).join(', ') || 'noch keine Zutaten'} · ${fmtMacro(m)}`
        : `feste Werte · ${fmtMacro(m)}`),
      open ? [
        h('p', { class: 'hint' }, 'Zutaten antippen (+1), lange drücken (−1). Die Nährwerte rechnet die App.'),
        Object.entries(FOOD_CATS).map(([cat, label]) => [h('p', { class: 'subhead' }, label), h('div', { class: 'food-chips' },
          c.foods.filter((f) => isActive(f) && f.cat === cat).map((f) => foodChip(f.name, f.unit, (r.items || {})[f.id] || 0, () => setItem(f, 1), () => setItem(f, -1))))]),
      ] : null,
      h('div', { class: 'row-opts' },
        h('button', { type: 'button', class: `toggle${isActive(r) ? ' on' : ''}`, onclick: () => { r.active = !isActive(r); commitConfig('recipes', true); } }, isActive(r) ? 'Aktiv' : 'Inaktiv')));
  };
  const newRecipe = h('input', { type: 'text', placeholder: 'Neues Rezept, z. B. Mittag-Bowl' });

  // Übungen (je Muskelgruppe aufklappbar)
  const exRow = (it) => h('div', { class: `row${isActive(it) ? '' : ' inactive'}` },
    h('div', { class: 'row-main' },
      textEl(it.name, (v) => { if (v.trim()) { it.name = v.trim(); commitConfig('exercises'); } }, { 'aria-label': 'Name' })),
    h('div', { class: 'row-opts' },
      selectEl({ pull: 'Pull', push: 'Push', both: 'Beide' }, it.day || 'both', (v) => { it.day = v; commitConfig('exercises'); }),
      h('label', { class: 'inline' }, 'Schritt', selectEl({ 1: '1 kg', 2: '2 kg', 2.5: '2,5 kg', 5: '5 kg', 10: '10 kg' }, it.step || 5, (v) => { it.step = Number(v); commitConfig('exercises'); })),
      h('label', { class: 'inline' }, 'Wdh', numEl(it.reps || 10, (v) => { if (v) { it.reps = Math.round(v); commitConfig('exercises'); } })),
      h('button', { type: 'button', class: `toggle${isActive(it) ? ' on' : ''}`, onclick: () => { it.active = !isActive(it); commitConfig('exercises', true); } }, isActive(it) ? 'Aktiv' : 'Inaktiv')));
  const exGroups = Object.entries(MUSCLE_GROUPS).map(([g, label]) => {
    const list = c.exercises.filter((x) => x.group === g);
    if (!list.length) return null;
    return h('details', { class: 'cat', open: setupUi.openGroup === g },
      h('summary', { onclick: () => { setupUi.openGroup = setupUi.openGroup === g ? null : g; } }, `${label} (${list.filter(isActive).length})`),
      h('div', { class: 'rows' }, list.map(exRow)));
  });
  const newEx = h('input', { type: 'text', placeholder: 'Neue Übung' });
  const newExGroup = selectEl(MUSCLE_GROUPS, 'back', () => {});
  const newExDay = selectEl({ pull: 'Pull', push: 'Push', both: 'Beide' }, 'pull', () => {});
  const setTargets = Object.entries(MUSCLE_GROUPS).filter(([g]) => c.exercises.some((x) => x.group === g && isActive(x))).map(([g, label]) => h('label', { class: 'field' },
    h('span', {}, `${label} (Sätze / Woche)`),
    numEl(c.targets.weekly[`sets_${g}`], (v) => { if (v == null) delete c.targets.weekly[`sets_${g}`]; else c.targets.weekly[`sets_${g}`] = v; commitConfig('targets'); }, { placeholder: 'kein Ziel' })));

  // Ziele
  const dailyField = (key, label) => h('label', { class: 'field' }, h('span', {}, label),
    numEl(c.targets.daily[key], (v) => { c.targets.daily[key] = v; commitConfig('targets'); }, { placeholder: 'kein Ziel' }));
  const weeklyFields = c.training.filter(isActive).map((t) => h('label', { class: 'field' },
    h('span', {}, `${t.name} (${t.type === 'minutes' ? 'Minuten' : 'Einheiten'} / Woche)`),
    numEl(c.targets.weekly[weeklyKey(t)], (v) => {
      if (v == null) delete c.targets.weekly[weeklyKey(t)]; else c.targets.weekly[weeklyKey(t)] = v;
      commitConfig('targets');
    }, { placeholder: 'kein Ziel' })));

  // Negative
  const counterRows = c.counters.map((it, i) => editRow(c.counters, i, 'counters', [
    h('label', { class: 'inline' }, 'max. pro Woche',
      numEl(c.targets.weekly[`${it.id}_max`], (v) => {
        if (v == null) delete c.targets.weekly[`${it.id}_max`]; else c.targets.weekly[`${it.id}_max`] = v;
        commitConfig('counters');
      }, { placeholder: 'kein Limit' })),
  ]));
  const newCounter = h('input', { type: 'text', placeholder: 'Neues Negativ, z. B. Chips' });

  // Pause-Modi
  const pauseRows = c.pauseModes.map((p) => h('div', { class: 'row' },
    textEl(p.name, (v) => { if (v.trim()) { p.name = v.trim(); commitConfig('pauseModes'); } }, { 'aria-label': 'Name des Pause-Modus' })));
  const newPause = h('input', { type: 'text', placeholder: 'Neuer Pause-Modus' });

  // Apple Health
  const healthDates = cachedDates('health');
  const lastHealth = healthDates[healthDates.length - 1];
  // Alle Schritt-Quellen, sortiert nach aktueller Reihenfolge
  const stepSources = [...new Set(healthDates.flatMap((d) => (getHealth(d) || {}).sources || []))]
    .sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
  const moveSource = (i, dir) => {
    const list = [...stepSources];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    c.health.sourceOrder = list;
    healthCache.clear();
    commitConfig('health', true);
  };
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

    setupGroup('goals', 'Ziele', 'Ernährung, Schritte, Schlaf, Training', [
      h('p', { class: 'hint' }, 'Tagesziele Ernährung'),
      h('div', { class: 'pair' }, dailyField('kcal', 'kcal'), dailyField('protein', 'Protein (g)'), dailyField('fat', 'Fett (g)'), dailyField('carbs', 'Carbs max. (g)')),
      h('p', { class: 'hint' }, 'Tagesziele Aktivität & Schlaf'),
      h('div', { class: 'pair' }, dailyField('steps', 'Schritte pro Tag'),
        h('label', { class: 'field' }, h('span', {}, 'Schlaf pro Nacht (Stunden)'),
          numEl(c.targets.daily.sleepH, (v) => { c.targets.daily.sleepH = v; commitConfig('targets'); }, { placeholder: 'kein Ziel', decimal: true }))),
      h('p', { class: 'hint' }, 'Wochenziele Training'),
      h('div', { class: 'pair' }, weeklyFields),
      h('p', { class: 'hint' }, 'Krafttraining: Sätze pro Muskelgruppe und Woche'),
      h('div', { class: 'pair' }, setTargets),

    ]),

    setupGroup('habits', 'Gewohnheiten', `${c.habits.filter(isActive).length} aktiv`, [
      h('div', { class: 'rows' }, habitRows),
      addRow([newHabit, newHabitSlot], (name, [, slot]) => {
        c.habits.push({ id: slugId(name, c.habits), name, type: 'bool', slot, prio: 2, active: true });
        commitConfig('habits');
      }),

    ]),

    setupGroup('metrics', 'Messwerte', 'Blutdruck, Gewicht, Befinden', [
      h('div', { class: 'rows' }, metricRows),
      addRow([newMetric, newMetricType, newMetricUnit], (name, [, type, unit]) => {
        const m = { id: slugId(name, c.metrics), name, type, slot: 'morning', prio: 2, active: true };
        if (type === 'number') { m.unit = unit.trim(); m.decimals = 1; m.source = 'manual'; }
        c.metrics.push(m);
        commitConfig('metrics');
      }),

    ]),

    setupGroup('training', 'Training', 'Trainingsarten und Kraftübungen', [
      h('h3', {}, 'Trainingsarten'),
      h('div', { class: 'rows' }, trainRows),
      addRow([newTrain, newTrainType], (name, [, type]) => {
        c.training.push({ id: slugId(name, c.training), name, type, presetsMin: [30, 45, 60], prio: 2, active: true });
        commitConfig('training');
      }),

      h('h3', {}, 'Kraftübungen'),
      h('p', { class: 'hint' }, 'Pull/Push steuert nur die Vorsortierung im Training. Das Gewicht merkt sich die App aus deinen Sätzen.'),
      exGroups,
      addRow([newEx, newExGroup, newExDay], (name, [, group, day]) => {
        c.exercises.push({ id: slugId(name, c.exercises), name, group, day, weight: null, step: 5, active: true });
        setupUi.openGroup = group;
        commitConfig('exercises');
      }),

    ]),

    setupGroup('food', 'Ernährung', `${c.recipes.filter(isActive).length} Rezepte · ${c.foods.filter(isActive).length} Lebensmittel`, [
      h('h3', {}, 'Rezepte'),
      h('div', { class: 'rows' }, c.recipes.length ? c.recipes.map(recipeRow) : h('p', { class: 'empty-note' }, 'Noch keine Rezepte. Lege eins an und tippe die Zutaten an.')),
      addRow([newRecipe], (name) => {
        const r = { id: slugId(name, c.recipes), name, items: {}, active: true };
        c.recipes.push(r);
        setupUi.recipeOpen = r.id;
        commitConfig('recipes');
      }),

      h('h3', {}, 'Lebensmittel'),
      h('p', { class: 'hint' }, 'Nährwerte je Einheit (Richtwerte). Im Reiter Heute stehen die häufigsten vorne.'),
      foodCats,
      addRow([newFood, newFoodCat, newFoodUnit], (name, [, cat, unit]) => {
        c.foods.push({ id: slugId(name, c.foods), name, cat, unit: unit.trim() || '1 Portion', kcal: 0, protein: 0, fat: 0, carbs: 0, active: true });
        setupUi.openCat = cat;
        commitConfig('foods');
      }),

    ]),

    setupGroup('daytags', 'Tages-Tags', `${c.dayTags.filter(isActive).length} Tags`, [
      h('p', { class: 'hint' }, 'Markierungen für besondere Tage. Neue Tags legst du direkt im Reiter Heute an; hier umbenennen oder ausblenden.'),
      h('div', { class: 'rows' }, c.dayTags.map((t) => h('div', { class: `row${isActive(t) ? '' : ' inactive'}` }, h('div', { class: 'row-main' },
        textEl(t.name, (v) => { if (v.trim()) { t.name = v.trim(); commitConfig('dayTags'); } }, { 'aria-label': 'Tag' }),
        h('button', { type: 'button', class: `toggle${isActive(t) ? ' on' : ''}`, onclick: () => { t.active = !isActive(t); commitConfig('dayTags', true); } }, isActive(t) ? 'Aktiv' : 'Aus'))))),
    ]),

    setupGroup('negatives', 'Negatives', `${c.counters.filter(isActive).length} Zähler`, [
      h('p', { class: 'hint' }, 'Zähler für Dinge, die du reduzieren willst. Im Reiter Heute: Tap = +1. Ein Wochenlimit erscheint in der Auswertung unter Soll/Ist.'),
      h('div', { class: 'rows' }, counterRows),
      addRow([newCounter], (name) => {
        c.counters.push({ id: slugId(name, c.counters), name, active: true });
        commitConfig('counters');
      }),

    ]),

    setupGroup('notes', 'Erkenntnisse', 'Tags und Erinnerung', [
      h('div', { class: 'rows' }, c.noteTags.map((t, i) => h('div', { class: 'row' }, h('div', { class: 'row-main' },
        textEl(t, (v) => { if (v.trim()) { c.noteTags[i] = v.trim(); commitConfig('noteTags'); } }, { 'aria-label': 'Tag' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tag entfernen', onclick: () => { c.noteTags.splice(i, 1); commitConfig('noteTags', true); } }, '×'))))),
      addRow([h('input', { type: 'text', placeholder: 'Neuer Tag' })], (name) => { if (!c.noteTags.includes(name)) c.noteTags.push(name); commitConfig('noteTags'); }),
      h('div', { class: 'btn-row' }, h('button', {
        type: 'button', class: `toggle${c.notesResurface !== false ? ' on' : ''}`,
        onclick: () => { c.notesResurface = c.notesResurface === false; commitConfig('notes', true); },
      }, c.notesResurface !== false ? 'Erinnerung im Reiter Heute: an' : 'Erinnerung im Reiter Heute: aus')),
      h('p', { class: 'hint' }, 'Zeigt unten im Reiter Heute täglich eine ältere Erkenntnis (mindestens 7 Tage alt).'),
    ]),

    setupGroup('health', 'Apple Health', lastHealth ? `zuletzt ${formatDateShort(lastHealth)}` : 'nicht verbunden', [
      h('p', { class: 'hint' },
        'Schritte, Schlaf und Gewicht kommen vom iOS-Kurzbefehl „Lebensapp-Health“. ',
        h('a', { href: 'shortcuts/Lebensapp-Health.shortcut' }, 'Kurzbefehl laden'), ' · ',
        h('a', { href: shortcutGuideUrl(), target: '_blank', rel: 'noopener' }, 'Anleitung'), '.'),
      h('div', { class: 'btn-row' }, h('button', {
        type: 'button', class: `toggle${c.health.shortcut ? ' on' : ''}`,
        onclick: () => { c.health.shortcut = !c.health.shortcut; commitConfig('health', true); },
      }, c.health.shortcut ? 'Kurzbefehl installiert ✓' : 'Kurzbefehl ist installiert')),
      h('p', { class: 'hint' }, 'Dann erscheint morgens ein Knopf, der die Daten von gestern überträgt, falls sie noch fehlen.'),
      shortcutOutdated() ? outdatedHint() : null,
    lastHealth ? healthStatusCard(lastHealth) : h('p', { class: 'hint' }, 'Noch keine Health-Daten empfangen.'),
      stepSources.length > 1 ? [
        h('p', { class: 'hint' }, 'Reihenfolge der Quellen – so wie in der Health-App unter „Datenquellen und Zugriff“. Wo sich Messungen überschneiden (Schritte, Schlaf, Herz), zählt die obere Quelle.'),
        h('div', { class: 'rows' }, stepSources.map((src, i) => h('div', { class: 'row' }, h('div', { class: 'row-main' },
          h('span', { style: 'flex:1' }, `${i + 1}. ${src}`),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => moveSource(i, -1) }, '↑'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach unten', disabled: i === stepSources.length - 1, onclick: () => moveSource(i, 1) }, '↓'))))),
      ] : null,
      seenTypes.length ? [h('p', { class: 'hint' }, 'Workout-Typen zuordnen (Health-Workouts ersetzen manuelle Einträge derselben Art):'),
        h('div', { class: 'rows' }, mapRows)] : null,    ]),

    setupGroup('sync', 'Sync & Daten', syncState() === 'ok' ? 'synchron' : syncState() === 'error' ? 'Fehler' : 'ausstehend', viewSync()),

    setupGroup('general', 'Allgemein', 'Name, Tageswechsel, Pause-Modi', [
      h('label', { class: 'field' }, h('span', {}, 'Name'),
        textEl(c.user.name, (v) => { c.user.name = v.trim(); commitConfig('user'); })),

      h('h3', {}, 'Tageswechsel'),
      h('label', { class: 'field' }, h('span', {}, 'Einträge bis einschließlich … zählen noch zum Vortag'),
        h('input', { type: 'time', value: c.windows.evening.end, onchange: (e) => { if (e.target.value) { c.windows.evening.end = e.target.value; commitConfig('windows'); } } })),
      h('p', { class: 'hint' }, 'Standard 05:59: Wer nach Mitternacht noch etwas einträgt, landet beim richtigen Tag. „Morgen/Abend“ bei Gewohnheiten und Kennzahlen bestimmt nur die Reihenfolge.'),

      h('h3', {}, 'Pause-Modi'),
      h('div', { class: 'rows' }, pauseRows),
      addRow([newPause], (name) => {
        c.pauseModes.push({ id: slugId(name, c.pauseModes), name });
        commitConfig('pauseModes');
      }),

    ]),
  );
}

// ---------- Heute ----------

const todayUi = { noteOpen: null, tagOpen: false, date: null, pauseOpen: false, trainOpen: null, trainAuto: null, strengthDay: null, lastExercise: null, foodOpen: false, moreCats: new Set(), ensured: null };

const byPrio = (list) => list.map((x, i) => [x, i]).sort((a, b) => (a[0].prio || 1) - (b[0].prio || 1) || a[1] - b[1]).map((x) => x[0]);
const habitDate = (hb, date) => (hb.refersTo === 'previousDay' ? addDays(date, -1) : date);
const habitValue = (hb, date) => ((getDay(habitDate(hb, date)) || {}).habits || {})[hb.id];
const metricValue = (m, date) => ((getDay(date) || {}).metrics || {})[m.id];
const showMetric = (m) => isActive(m) && m.source !== 'health';

/** Letzter Wert einer Kennzahl vor (oder an) einem Datum – eigene Einträge oder Apple Health – für die Vorbelegung. */
function lastMetricValue(m, date, maxDays = 90) {
  for (let i = 0; i <= maxDays; i++) {
    const v = metricOn(m, addDays(date, -i));
    if (v != null) return v;
  }
  return null;
}

/** Alles für einen Tag: Morgen-Einträge zuerst, innerhalb nach Priorität. */
const slotOrder = (x) => (x.slot === 'evening' ? 1 : 0);
function dayItems() {
  const sorted = (list) => byPrio(list).sort((a, b) => ((a.prio || 1) - (b.prio || 1)) || (slotOrder(a) - slotOrder(b)));
  return {
    habits: sorted(config.habits.filter(isActive)),
    metrics: sorted(config.metrics.filter(showMetric)),
  };
}

/** Abschnitte der Tagesansicht mit Zähler „erledigt / gesamt“. */
function sectionCounts(date) {
  const { habits, metrics } = dayItems();
  const count = (list, has) => ({ done: list.filter(has).length, total: list.length });
  const mHas = (m) => metricOn(m, date) != null;
  return {
    measures: count(metrics.filter((m) => m.type !== 'scale10'), mHas),
    habits: count(habits, (x) => habitValue(x, date) !== undefined),
    mood: count(metrics.filter((m) => m.type === 'scale10'), mHas),
  };
}

function progressOf(date) {
  const c = Object.values(sectionCounts(date));
  const total = c.reduce((a, x) => a + x.total, 0);
  return total ? c.reduce((a, x) => a + x.done, 0) / total : 0;
}
function updateProgress(date) {
  const bar = $('#progress > i');
  if (bar) bar.style.width = `${Math.round(progressOf(date) * 100)}%`;
  const counts = sectionCounts(date);
  for (const [id, c] of Object.entries(counts)) {
    const el = document.querySelector(`[data-count="${id}"]`);
    if (el) el.textContent = countLabel(c);
    const g = document.querySelector(`[data-group="${id}"]`);
    if (g) g.classList.toggle('done', isDone(c));
  }
}
const isDone = (c) => c.total > 0 && c.done >= c.total;
const countLabel = (c) => (isDone(c) ? '✓ erledigt' : `${c.done}/${c.total}`);

// Eingeklappte Abschnitte merken (nur auf diesem Gerät)
const collapsed = new Set(LS.get('la.ui.collapsed', []));

function section(id, title, summary, content) {
  if (!content || (Array.isArray(content) && !content.filter(Boolean).length)) return null;
  const isOpen = !collapsed.has(id);
  const done = summary && summary.countId && summary.done;
  return h('section', { class: `group${isOpen ? '' : ' closed'}${done ? ' done' : ''}`, 'data-group': id },
    h('button', {
      type: 'button', class: 'group-head', 'aria-expanded': isOpen ? 'true' : 'false',
      onclick: () => { if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); LS.set('la.ui.collapsed', [...collapsed]); softRender(); },
    },
      h('span', { class: 'group-title' }, title),
      h('span', { class: 'group-sum', 'data-count': summary && summary.countId ? summary.countId : null }, summary ? summary.text : ''),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
    isOpen ? h('div', { class: 'group-body' }, content) : null);
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
  const note = (((getDay(date) || {}).notes || {})[m.id]) || '';
  const key = `${date}:${m.id}`;
  const open = note || todayUi.noteOpen === key;
  let area = null;
  if (open) {
    area = h('textarea', {
      class: 'day-note', rows: 1, placeholder: `Was fällt dir zu „${m.name}“ heute auf? (optional)`,
      oninput: (e) => autoGrow(e.target),
      onchange: (e) => {
        const t = e.target.value.trim();
        updateDay(date, (d) => { const n = { ...(d.notes || {}) }; if (t) n[m.id] = t; else delete n[m.id]; d.notes = n; if (!Object.keys(n).length) delete d.notes; });
        if (!t) { todayUi.noteOpen = null; softRender(); }
      },
    });
    area.value = note;
    setTimeout(() => { autoGrow(area); if (!note && todayUi.noteOpen === key && document.body.contains(area)) area.focus(); }, 30);
  }
  return h('div', { class: 'block' },
    h('p', { class: 'block-title' }, h('span', {}, m.name),
      !open ? h('button', { type: 'button', class: 'link', onclick: () => { todayUi.noteOpen = key; softRender(); } }, '+ Notiz') : null),
    h('div', { class: 'scale', role: 'group', 'aria-label': m.name },
      Array.from({ length: 10 }, (_, i) => i + 1).map((n) => h('button', {
        type: 'button', class: v === n ? 'on' : '', 'aria-pressed': v === n ? 'true' : 'false',
        onclick: () => { haptic(); setMetric(m, date, v === n ? null : n); softRender(); },
      }, n))),
    area);
}

// ---------- Tages-Tags ----------
// Freie Markierungen pro Tag (z. B. Koffeinverzicht, Durchfall). day.tags = [id, …]

const DEFAULT_DAY_TAGS = [
  { id: 'caffeine_free', name: 'Koffeinverzicht', active: true },
  { id: 'diarrhea', name: 'Durchfall', active: true },
  { id: 'headache', name: 'Kopfschmerzen', active: true },
  { id: 'cold', name: 'Erkältung', active: true },
];

function toggleDayTag(date, id) {
  haptic();
  updateDay(date, (d) => {
    const tags = new Set(d.tags || []);
    if (tags.has(id)) tags.delete(id); else tags.add(id);
    d.tags = [...tags];
    if (!d.tags.length) delete d.tags;
  });
  softRender();
}

function dayTagBlock(date, day) {
  const use = {};
  for (const d of cachedDates('days')) if (d < date) for (const id of (getDay(d) || {}).tags || []) use[id] = (use[id] || 0) + 1;
  const list = config.dayTags.filter(isActive).sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0));
  const on = new Set(day.tags || []);
  const input = h('input', { type: 'text', placeholder: 'Neuer Tag, z. B. Sauna spät', enterkeyhint: 'done' });
  const add = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    let tag = config.dayTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      tag = { id: slugId(name, config.dayTags), name, active: true };
      config.dayTags.push(tag);
      saveConfig('config: add day tag');
    } else if (!isActive(tag)) { tag.active = true; saveConfig('config: update day tag'); }
    todayUi.tagOpen = false;
    if (document.activeElement) document.activeElement.blur();
    if (!on.has(tag.id)) toggleDayTag(date, tag.id); else softRender();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return h('div', { class: 'block' },
    h('div', { class: 'tag-chips' },
      list.map((t) => h('button', { type: 'button', class: `tag${on.has(t.id) ? ' on' : ''}`, 'aria-pressed': on.has(t.id) ? 'true' : 'false', onclick: () => toggleDayTag(date, t.id) }, t.name)),
      // Tags, die an diesem Tag gesetzt, aber inzwischen deaktiviert sind
      [...on].filter((id) => !list.some((t) => t.id === id)).map((id) => h('button', { type: 'button', class: 'tag on', onclick: () => toggleDayTag(date, id) }, (config.dayTags.find((t) => t.id === id) || { name: id }).name)),
      !todayUi.tagOpen ? h('button', { type: 'button', class: 'tag add', onclick: () => { todayUi.tagOpen = true; softRender(); setTimeout(() => { const i = document.querySelector('.tag-new input'); if (i) i.focus(); }, 30); } }, '+ Neu') : null),
    todayUi.tagOpen ? h('div', { class: 'add-row tag-new' }, input,
      h('button', { type: 'button', class: 'btn', onclick: add }, 'Hinzufügen')) : null,
    h('p', { class: 'hint' }, 'Für alles Besondere an diesem Tag. „Was hilft mir?“ vergleicht Tage mit und ohne Tag.'));
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
  const hv = v ? null : healthMetric(m, date);
  const last = lastMetricValue(m, addDays(date, -1));
  const shown = v || hv || last || { sys: 120, dia: 80 };
  const prefill = !v && !hv;
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
      h('span', {}, m.name, hv ? ' · aus Apple Health' : prefill && last ? ' · letzter Wert' : ''),
      hv ? null : prefill
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
  const hv = v == null ? healthMetric(m, date) : null;
  const last = lastMetricValue(m, addDays(date, -1));
  const shown = v ?? hv ?? last;
  const prefill = v == null && hv == null;
  const save = (n, rerender) => {
    setMetric(m, date, n);
    if (rerender) softRender(); else { card.classList.remove('prefill'); updateProgress(date, slot); }
  };
  const card = h('div', { class: `metric-card${prefill ? ' prefill' : ''}` },
    h('div', { class: 'metric-head' },
      h('span', {}, m.name, m.unit ? ` (${m.unit})` : '', hv != null ? ' · aus Apple Health' : prefill && last != null ? ' · letzter Wert' : ''),
      hv != null ? null : prefill
        ? (shown != null ? h('button', { type: 'button', onclick: () => { haptic(); save(shown, true); } }, 'Übernehmen') : null)
        : h('button', { type: 'button', class: 'muted', onclick: () => save(null, true) }, 'Löschen')),
    stepper({ value: shown, decimals, step: 10 ** -decimals, label: '', inputmode: decimals ? 'decimal' : 'numeric', onSet: save }));
  return card;
}

// ---------- Krafttraining ----------
// Tap auf eine Übung = 1 Satz mit dem üblichen Gewicht. Jeder Satz speichert sein Gewicht;
// „üblich“ ist immer das zuletzt verwendete. day.strength = [{ id, sets: [kg, …], reps: [n, …] }]
// Wiederholungen werden genauso vorbelegt (vom letzten Mal, sonst Standard der Übung).

const MUSCLE_GROUPS = { back: 'Rücken', rear_delt: 'Hintere Schulter', biceps: 'Bizeps', chest: 'Brust', shoulders: 'Schultern', triceps: 'Trizeps', legs: 'Beine', core: 'Core' };
const STRENGTH_DAYS = { pull: 'Pull', push: 'Push', all: 'Alle' };

// [id, Name, Muskelgruppe, Tag, Startgewicht (null = beim ersten Satz fragen), Schritt kg]
const DEFAULT_EXERCISES = [
  ['lat_pulldown', 'Latzug', 'back', 'pull', 80, 5],
  ['row_wide', 'Rudern breit', 'back', 'pull', 55, 5],
  ['pullover', 'Überzüge', 'back', 'pull', 25, 2.5],
  ['face_pull', 'Face Pulls', 'rear_delt', 'pull', null, 2.5],
  ['reverse_fly', 'Reverse Butterfly', 'rear_delt', 'pull', null, 5],
  ['preacher_curl', 'Preacher Curls', 'biceps', 'pull', null, 5],
  ['hammer_curl', 'Hammer Curls', 'biceps', 'pull', null, 2],
  ['cable_curl', 'Kabel-Curls einarmig', 'biceps', 'pull', null, 2.5],
  ['rdl', 'Rumän. Kreuzheben', 'legs', 'pull', null, 5],
  ['leg_curl', 'Beinbeuger', 'legs', 'pull', null, 5],
  ['chest_press', 'Brustpresse', 'chest', 'push', null, 5],
  ['push_up', 'Liegestütze', 'chest', 'push', 0, 5],
  ['butterfly', 'Butterfly', 'chest', 'push', null, 5],
  ['ohp', 'Schulterdrücken LH', 'shoulders', 'push', null, 2.5],
  ['lateral_db', 'Seitheben KH', 'shoulders', 'push', null, 2],
  ['lateral_cable', 'Seitheben Kabel', 'shoulders', 'push', null, 2.5],
  ['triceps_pushdown', 'Trizepsdrücken', 'triceps', 'push', null, 5],
  ['triceps_overhead', 'Trizeps über Kopf', 'triceps', 'push', null, 2.5],
  ['squat', 'Kniebeugen', 'legs', 'push', null, 5],
  ['leg_press', 'Beinpresse', 'legs', 'push', null, 10],
  ['lunges', 'Ausfallschritte', 'legs', 'push', null, 2],
  ['leg_extension', 'Beinstrecker', 'legs', 'push', null, 5],
].map(([id, name, group, day, weight, step]) => ({
  id, name, group, day, weight, step, active: true,
  reps: /curl|seitheben|lateral|face|butterfly|reverse|trizeps|beinstrecker|beinbeuger/i.test(`${id} ${name}`) ? 12 : 10,
}));

const fmtKg = (kg) => (kg == null ? '? kg' : kg === 0 ? 'KG' : `${fmtNum(kg, kg % 1 ? 1 : 0)} kg`);

/** Zuletzt verwendetes Gewicht einer Übung (vor date), sonst Startgewicht. */
function lastWeight(ex, date) {
  const dates = cachedDates('days').filter((d) => d < date).reverse();
  for (const d of dates.slice(0, 120)) {
    const e = ((getDay(d) || {}).strength || []).find((x) => x.id === ex.id);
    const sets = e ? e.sets.filter((w) => w != null) : [];
    if (sets.length) return sets[sets.length - 1];
  }
  return ex.weight ?? null;
}

/** Zuletzt verwendete Wiederholungen einer Übung (vor date), sonst Standard. */
function lastReps(ex, date) {
  const dates = cachedDates('days').filter((d) => d < date).reverse();
  for (const d of dates.slice(0, 120)) {
    const e = ((getDay(d) || {}).strength || []).find((x) => x.id === ex.id);
    const reps = e && e.reps ? e.reps.filter((r) => r != null) : [];
    if (reps.length) return reps[reps.length - 1];
  }
  return ex.reps || 10;
}

/** Heutige Einträge ändern (Kopie), leere Übungen entfernen. */
function updateStrength(date, fn) {
  updateDay(date, (d) => {
    const list = (d.strength || []).map((e) => ({ id: e.id, sets: [...e.sets], reps: e.reps ? [...e.reps] : e.sets.map(() => null) }));
    fn(list);
    d.strength = list.filter((e) => e.sets.length);
    if (!d.strength.length) delete d.strength;
  });
}

function addSet(date, ex) {
  haptic();
  const today = ((getDay(date) || {}).strength || []).find((e) => e.id === ex.id);
  const w = today && today.sets.length ? today.sets[today.sets.length - 1] : lastWeight(ex, date);
  const r = today && today.reps && today.reps.length && today.reps[today.reps.length - 1] != null ? today.reps[today.reps.length - 1] : lastReps(ex, date);
  updateStrength(date, (list) => {
    let e = list.find((x) => x.id === ex.id);
    if (!e) { e = { id: ex.id, sets: [], reps: [] }; list.push(e); }
    e.sets.push(w);
    e.reps.push(r);
  });
  todayUi.lastExercise = ex.id;
  softRender();
}

/** Einen bestimmten Satz (Index) oder die ganze Übung (index = null) von heute entfernen. */
function removeStrength(date, ex, index = null) {
  haptic();
  updateStrength(date, (list) => {
    const i = list.findIndex((x) => x.id === ex.id);
    if (i === -1) return;
    if (index == null) list.splice(i, 1);
    else { list[i].sets.splice(index, 1); list[i].reps.splice(index, 1); }
  });
  softRender();
}

function removeSet(date, ex) {
  haptic();
  updateStrength(date, (list) => { const e = list.find((x) => x.id === ex.id); if (e) { e.sets.pop(); e.reps.pop(); } });
  softRender();
}

/** Gewicht des letzten Satzes ändern; weitere Sätze übernehmen es automatisch. */
function setWeight(date, ex, value) {
  updateStrength(date, (list) => {
    const e = list.find((x) => x.id === ex.id);
    if (!e || !e.sets.length) return;
    const last = e.sets.length - 1;
    // Unbekanntes Startgewicht: alle bisher offenen Sätze bekommen den Wert
    if (e.sets[last] == null) e.sets = e.sets.map((w) => (w == null ? value : w));
    else e.sets[last] = value;
  });
  softRender();
}

/** Wiederholungen des letzten Satzes ändern; weitere Sätze übernehmen sie. */
function setReps(date, ex, value) {
  updateStrength(date, (list) => {
    const e = list.find((x) => x.id === ex.id);
    if (!e || !e.sets.length) return;
    e.reps[e.sets.length - 1] = Math.max(1, value);
  });
  softRender();
}

/** Geschätztes Maximum (Epley) eines Satzes – macht mehr Wiederholungen bei gleichem Gewicht als Fortschritt sichtbar. */
const e1rm = (w, r) => (w == null ? null : r ? w * (1 + r / 30) : w);

/** Sätze pro Muskelgruppe über gezählte Tage. */
function setsByGroup(dates) {
  const out = {};
  for (const d of countedDates(dates)) {
    for (const e of (getDay(d) || {}).strength || []) {
      const ex = config.exercises.find((x) => x.id === e.id);
      if (ex) out[ex.group] = (out[ex.group] || 0) + e.sets.length;
    }
  }
  return out;
}

/** Vorschlag für den Tag: der andere als beim letzten Krafttraining. */
function suggestedStrengthDay(date) {
  for (const d of cachedDates('days').filter((x) => x < date).reverse().slice(0, 21)) {
    const ids = ((getDay(d) || {}).strength || []).map((e) => e.id);
    if (!ids.length) continue;
    const days = ids.map((id) => (config.exercises.find((x) => x.id === id) || {}).day);
    const push = days.filter((x) => x === 'push').length, pull = days.filter((x) => x === 'pull').length;
    return push >= pull ? 'pull' : 'push';
  }
  return 'pull';
}

function strengthPanel(date, day) {
  const done = day.strength || [];
  const todayDays = done.map((e) => (config.exercises.find((x) => x.id === e.id) || {}).day).filter(Boolean);
  const chosen = todayUi.strengthDay || (todayDays.length ? (todayDays.filter((x) => x === 'push').length > todayDays.filter((x) => x === 'pull').length ? 'push' : 'pull') : suggestedStrengthDay(date));
  const list = config.exercises.filter((x) => isActive(x) && (chosen === 'all' || x.day === chosen || x.day === 'both'));
  const setsOf = (id) => ((done.find((e) => e.id === id) || {}).sets || []).length;
  const groups = Object.keys(MUSCLE_GROUPS).filter((g) => list.some((x) => x.group === g));
  const legSets = done.filter((e) => (config.exercises.find((x) => x.id === e.id) || {}).group === 'legs').reduce((a, e) => a + e.sets.length, 0);

  return h('div', { class: 'strength' },
    h('div', { class: 'segmented' }, Object.entries(STRENGTH_DAYS).map(([k, label]) => h('button', {
      type: 'button', class: chosen === k ? 'on' : '', onclick: () => { todayUi.strengthDay = k; softRender(); },
    }, label))),

    done.length ? h('div', { class: 'sets-list' }, done.map((e) => {
      const ex = config.exercises.find((x) => x.id === e.id) || { id: e.id, name: e.id, step: 5 };
      const last = e.sets[e.sets.length - 1];
      const lastRep = (e.reps || [])[e.sets.length - 1];
      const step = ex.step || 5;
      const unknown = last == null;
      const input = unknown ? h('input', {
        type: 'text', inputmode: 'decimal', placeholder: 'kg', class: 'kg-input', 'aria-label': `Gewicht ${ex.name}`,
        onchange: (ev) => { const v = parseNum(ev.target.value); if (v != null && v >= 0) setWeight(date, ex, round(v, 1)); },
        onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); },
      }) : null;
      if (unknown && todayUi.lastExercise === ex.id) setTimeout(() => { if (input && document.body.contains(input)) input.focus(); }, 60);
      return h('div', { class: `set-row${todayUi.lastExercise === ex.id ? ' current' : ''}` },
        h('div', { class: 'set-info' },
          h('div', { class: 'set-title' }, h('b', {}, ex.name),
            h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `${ex.name} komplett entfernen`, onclick: () => { if (confirm(`${ex.name} mit allen ${e.sets.length} Sätzen entfernen?`)) removeStrength(date, ex); } }, '🗑')),
          h('span', { class: 'set-pills' }, e.sets.map((w, i) => h('button', {
            type: 'button', class: 'pill', 'aria-label': `Satz ${i + 1} entfernen`,
            onclick: () => { if (confirm(`Satz ${i + 1} entfernen?`)) removeStrength(date, ex, i); },
          }, `${w == null ? '?' : w === 0 ? 'KG' : fmtNum(w, w % 1 ? 1 : 0)}${(e.reps || [])[i] != null ? `×${e.reps[i]}` : ''}`)))),
        unknown ? input : h('div', { class: 'kg-btns' },
          h('button', { type: 'button', onclick: () => setWeight(date, ex, Math.max(0, round(last - step, 1))) }, `−${fmtNum(step, step % 1 ? 1 : 0)}`),
          h('span', {}, fmtKg(last)),
          h('button', { type: 'button', onclick: () => setWeight(date, ex, round(last + step, 1)) }, `+${fmtNum(step, step % 1 ? 1 : 0)}`),
          h('button', { type: 'button', onclick: () => setWeight(date, ex, round(last + step * 2, 1)) }, `+${fmtNum(step * 2, (step * 2) % 1 ? 1 : 0)}`)),
        lastRep != null ? h('div', { class: 'kg-btns reps' },
          h('button', { type: 'button', 'aria-label': 'Eine Wiederholung weniger', onclick: () => setReps(date, ex, lastRep - 1) }, '−1'),
          h('span', {}, `${lastRep} Wdh`),
          h('button', { type: 'button', 'aria-label': 'Eine Wiederholung mehr', onclick: () => setReps(date, ex, lastRep + 1) }, '+1')) : null);
    })) : h('p', { class: 'hint' }, 'Tap auf eine Übung = 1 Satz mit deinem üblichen Gewicht. Langer Druck = Satz zurück.'),
    done.length ? h('p', { class: 'hint' }, 'Satz antippen = diesen Satz löschen · 🗑 = ganze Übung löschen') : null,

    groups.map((g) => [
      h('p', { class: 'subhead' }, g === 'legs' ? `Beine · ${legSets} Sätze heute` : MUSCLE_GROUPS[g]),
      h('div', { class: 'food-chips' }, list.filter((x) => x.group === g).map((ex) => {
        const n = setsOf(ex.id);
        const cur = n ? done.find((e) => e.id === ex.id) : null;
        const kg = cur ? cur.sets.slice(-1)[0] : lastWeight(ex, date);
        const reps = cur && cur.reps ? cur.reps.slice(-1)[0] : lastReps(ex, date);
        return foodChip(ex.name, `${fmtKg(kg)}${kg != null ? ` × ${reps}` : ''}`, n,
          () => addSet(date, ex), () => removeSet(date, ex));
      })),
    ]),
    done.length ? h('button', {
      type: 'button', class: 'btn danger block delete-training',
      onclick: () => {
        const sets = done.reduce((a, e) => a + e.sets.length, 0);
        if (!confirm(`Komplettes Krafttraining von ${date === logicalToday() ? 'heute' : formatDateShort(date)} löschen (${done.length} Übungen, ${sets} Sätze)?`)) return;
        updateDay(date, (d) => { delete d.strength; d.training = (d.training || []).filter((x) => x.id !== 'strength'); });
        todayUi.lastExercise = null;
        softRender();
      },
    }, 'Krafttraining dieses Tages löschen') : null);
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
  if (todayUi.trainOpen == null && todayUi.trainAuto !== date && (day.strength || []).length) { todayUi.trainOpen = 'strength'; todayUi.trainAuto = date; }
  const effective = trainingFor(date);
  const fromHealth = effective.filter((e) => e.source === 'health');
  const covered = new Set(fromHealth.map((e) => e.id));
  const setCount = (day.strength || []).reduce((a, e) => a + e.sets.length, 0);
  const summary = (t) => {
    if (t.id === 'strength' && setCount) return `${setCount} Sätze`;
    const mine = effective.filter((e) => e.id === t.id);
    if (!mine.length) return null;
    const min = mine.reduce((s, e) => s + (e.min || 0), 0);
    return min ? `${min} min` : `${mine.length}×`;
  };
  const open = types.find((t) => t.id === todayUi.trainOpen);
  return h('div', { class: 'block' },
    h('div', { class: 'train-tiles' }, types.map((t) => h('button', {
      type: 'button', class: `tile${summary(t) ? ' on' : ''}${open === t ? ' open' : ''}`,
      onclick: () => {
        if (t.id === 'strength' || (t.presetsMin && t.presetsMin.length)) { todayUi.trainOpen = open === t ? null : t.id; softRender(); } else add({ id: t.id });
      },
    }, t.name, h('small', {}, summary(t) || ' ')))),
    open && open.id === 'strength' ? strengthPanel(date, day) : null,
    open && open.id !== 'strength' ? h('div', { class: 'presets' },
      (open.presetsMin || []).map((min) => h('button', { type: 'button', class: 'btn', onclick: () => add({ id: open.id, min }) }, `${min} min`)),
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

// ---------- Ernährung ----------
// Lebensmittel-Chips mit kleinster sinnvoller Einheit; Nährwerte je Einheit (Richtwerte, im Setup änderbar).

const FOOD_CATS = { protein: 'Protein', carbs: 'Kohlenhydrate', veg: 'Gemüse & Obst', fat: 'Fette & Saaten', sweet: 'Süßes & Getränke' };
const MACROS = ['kcal', 'protein', 'fat', 'carbs'];

// [id, Name, Kategorie, Einheit, kcal, Protein, Fett, Carbs, Negativ-Zähler]
const DEFAULT_FOODS = [
  ['egg', 'Ei', 'protein', '1 Stück', 80, 7, 5.5, 0.5],
  ['cheese', 'Käse', 'protein', '1 Scheibe (25 g)', 95, 6.5, 7.5, 0],
  ['parmesan', 'Parmesan', 'protein', '10 g', 40, 3.5, 2.9, 0],
  ['feta', 'Feta', 'protein', '25 g', 65, 4, 5.3, 0.2],
  ['mozzarella', 'Mozzarella', 'protein', '25 g', 63, 4.6, 4.8, 0.3],
  ['cottage', 'Körniger Frischkäse', 'protein', '50 g', 50, 6.3, 2, 1.5],
  ['skyr', 'Skyr', 'protein', '50 g', 32, 5.5, 0.1, 2],
  ['skyr_drink', 'Skyr Drink', 'protein', '100 ml', 60, 8, 0.2, 6],
  ['greek_yogurt', 'Griech. Joghurt', 'protein', '50 g', 60, 3, 5, 2],
  ['yogurt', 'Joghurt', 'protein', '50 g', 32, 1.7, 1.8, 2.2],
  ['whey', 'Whey', 'protein', '1 Messlöffel (30 g)', 115, 24, 1.5, 2],
  ['protein_milk', 'Proteinmilch', 'protein', '100 ml', 60, 10, 0.2, 4],
  ['protein_pudding', 'Protein-Pudding', 'protein', '1 Becher (200 g)', 150, 20, 3, 10],
  ['protein_bar', 'Proteinriegel', 'protein', '1 Riegel', 180, 20, 6, 12],
  ['protein_ball', 'Protein Ball', 'protein', '1 Stück', 85, 4, 5, 6],
  ['protein_wrap', 'Protein-Wrap', 'protein', '1 Wrap', 170, 12, 4, 18],
  ['chicken', 'Hähnchen', 'protein', '50 g', 55, 12, 0.7, 0],
  ['turkey', 'Pute', 'protein', '50 g', 53, 12, 0.5, 0],
  ['beef_mince', 'Rinderhack', 'protein', '50 g', 108, 9.5, 7.5, 0],
  ['steak', 'Rindersteak', 'protein', '50 g', 62, 11, 2, 0],
  ['patty', 'Burger-Patty', 'protein', '1 Patty', 290, 23, 21, 0],
  ['chicken_sausage', 'Hähnchen-Bratwurst', 'protein', '1 Wurst', 190, 15, 14, 1],
  ['ham', 'Schinken', 'protein', '1 Scheibe', 22, 4, 0.6, 0.2],
  ['salmon', 'Lachs', 'protein', '50 g', 100, 10, 6.5, 0],
  ['tuna', 'Thunfisch', 'protein', '50 g', 55, 12.5, 0.5, 0],

  ['pasta', 'Nudeln (roh)', 'carbs', '25 g', 89, 3.2, 0.4, 18],
  ['rice', 'Reis (roh)', 'carbs', '25 g', 88, 1.8, 0.2, 19.5],
  ['potato', 'Kartoffeln', 'carbs', '100 g', 75, 2, 0.1, 16],
  ['bread', 'Brot', 'carbs', '1 Scheibe', 95, 3, 0.6, 17],
  ['roll', 'Brötchen', 'carbs', '1 Stück', 140, 4.5, 0.7, 28],
  ['pretzel', 'Brezel', 'carbs', '1 Stück', 215, 6, 1.5, 43],
  ['oats', 'Haferflocken', 'carbs', '10 g', 37, 1.3, 0.7, 5.9],
  ['granola', 'Granola', 'carbs', '10 g', 45, 1, 1.8, 6],
  ['muesli', 'Müsli', 'carbs', '10 g', 37, 1, 0.6, 6.5],
  ['pizza', 'Pizza', 'carbs', '1 Stück (⅛)', 270, 11, 10, 33],
  ['fries', 'Pommes', 'carbs', '50 g', 145, 1.7, 7, 18],
  ['maultaschen', 'Maultasche', 'carbs', '1 Stück', 105, 4.5, 3.5, 13],
  ['potato_salad', 'Kartoffelsalat', 'carbs', '50 g', 80, 1, 5, 7],
  ['doener', 'Döner / Dürüm', 'carbs', '1 Stück', 650, 35, 28, 60],

  ['salad', 'Salat', 'veg', '1 Schale (50 g)', 8, 0.6, 0.1, 1],
  ['berries', 'Beeren', 'veg', '50 g', 22, 0.5, 0.2, 4],
  ['fruit', 'Obst', 'veg', '1 Stück', 60, 0.4, 0.2, 13],
  ['avocado', 'Avocado', 'veg', '½ Stück', 112, 1.4, 10, 1.5],
  ['tomato', 'Tomaten', 'veg', '50 g', 9, 0.5, 0.1, 1.5],
  ['zucchini', 'Zucchini', 'veg', '100 g', 19, 1.5, 0.3, 2],
  ['veggies', 'Gemüse gemischt', 'veg', '100 g', 35, 2, 0.3, 5],
  ['mushrooms', 'Pilze', 'veg', '50 g', 11, 1.5, 0.2, 0.3],
  ['broccoli', 'Brokkoli', 'veg', '100 g', 34, 3, 0.4, 2.7],
  ['carrot', 'Karotte', 'veg', '1 Stück', 22, 0.5, 0.1, 4.5],
  ['spinach', 'Spinat', 'veg', '50 g', 12, 1.4, 0.2, 0.3],
  ['cucumber', 'Gurke', 'veg', '100 g', 15, 0.6, 0.2, 2],

  ['chia', 'Chia', 'fat', '1 TL (5 g)', 25, 0.8, 1.5, 0.4],
  ['linseed', 'Leinsamen', 'fat', '1 TL (5 g)', 27, 1, 2.1, 0.1],
  ['nuts', 'Nüsse', 'fat', '10 g', 63, 1.8, 5.7, 1],
  ['dark_choc', 'Dunkle Schokolade 90 %', 'fat', '1 Stück (10 g)', 59, 1, 5.5, 1.4],
  ['peanut_butter', 'Erdnussmus', 'fat', '10 g', 62, 2.6, 5, 1.2],
  ['olive_oil', 'Olivenöl', 'fat', '1 EL', 88, 0, 10, 0],
  ['butter', 'Butter', 'fat', '10 g', 74, 0.1, 8.3, 0.1],
  ['milk', 'Milch', 'fat', '100 ml', 64, 3.4, 3.5, 4.8],
  ['almond_milk', 'Mandelmilch', 'fat', '100 ml', 15, 0.5, 1.1, 0.3],
  ['cream', 'Sahne', 'fat', '20 ml', 60, 0.5, 6, 0.7],
  ['sauce', 'Dip / Sauce', 'fat', '1 EL', 45, 0.2, 4, 2],

  ['ice_cream', 'Eis', 'sweet', '1 Kugel', 120, 2, 6, 15, 'sweets'],
  ['cake', 'Kuchen / Gebäck', 'sweet', '1 Stück', 350, 5, 18, 42, 'sweets'],
  ['gummies', 'Gummibärchen', 'sweet', '10 g', 34, 0.7, 0, 7.7, 'sweets'],
  ['cookie', 'Keks', 'sweet', '1 Stück', 48, 0.6, 2, 7, 'sweets'],
  ['chocolate', 'Schokolade', 'sweet', '1 Riegel (10 g)', 54, 0.8, 3.2, 5.6, 'sweets'],
  ['cola', 'Cola / Softdrink', 'sweet', '250 ml', 105, 0, 0, 26, 'sweets'],
  ['cappuccino', 'Cappuccino', 'sweet', '1 Tasse', 60, 3, 3, 5],
  ['beer', 'Bier', 'sweet', '0,33 l', 140, 1.5, 0, 10, 'alcohol'],
  ['wine', 'Wein / Aperol', 'sweet', '1 Glas', 150, 0, 0, 5, 'alcohol'],
].map(([id, name, cat, unit, kcal, protein, fat, carbs, counter]) => ({ id, name, cat, unit, kcal, protein, fat, carbs, ...(counter ? { counter } : {}), active: true }));

const macrosOf = (x) => Object.fromEntries(MACROS.map((k) => [k, Number(x && x[k]) || 0]));

/** Nährwerte eines Rezepts: feste Werte oder Summe seiner Lebensmittel. */
function recipeMacros(r) {
  if (!r.items) return macrosOf(r);
  const sum = macrosOf({});
  for (const [id, n] of Object.entries(r.items)) {
    const f = config.foods.find((x) => x.id === id);
    if (f) for (const k of MACROS) sum[k] += (f[k] || 0) * n;
  }
  return sum;
}

/** Tagessummen: Lebensmittel, Rezepte, freie Einträge und ältere Mahlzeiten-Einträge. */
function nutritionOf(day) {
  const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0, any: false };
  const add = (m, n = 1) => { for (const k of MACROS) sum[k] += (Number(m[k]) || 0) * n; sum.any = true; };
  const snap = day.foodSnap || {};
  for (const [id, n] of Object.entries(day.foods || {})) {
    add(snap[`f:${id}`] || config.foods.find((x) => x.id === id) || {}, n);
  }
  for (const [id, n] of Object.entries(day.recipes || {})) {
    const r = config.recipes.find((x) => x.id === id);
    add(snap[`r:${id}`] || (r ? recipeMacros(r) : {}), n);
  }
  for (const f of day.food || []) add(f);
  // Ältere Einträge (Mahlzeiten mit Snapshot aus früheren Versionen)
  const oldSnap = day.mealsSnapshot || [];
  for (const e of day.meals || []) {
    if (!e.count) continue;
    add(oldSnap.find((s) => s.id === e.id) || config.meals.find((m) => m.id === e.id) || {}, e.count);
  }
  return sum;
}

/** Lebensmittel (f) oder Rezept (r) zählen; Werte beim ersten Eintrag des Tages festhalten. */
function changeFood(date, kind, item, delta) {
  haptic();
  updateDay(date, (d) => {
    const key = kind === 'f' ? 'foods' : 'recipes';
    const map = { ...(d[key] || {}) };
    const before = map[item.id] || 0;
    const n = Math.max(0, before + delta);
    if (n) map[item.id] = n; else delete map[item.id];
    d[key] = map;
    if (!Object.keys(map).length) delete d[key];
    const snap = { ...(d.foodSnap || {}) };
    if (n && !snap[`${kind}:${item.id}`]) snap[`${kind}:${item.id}`] = kind === 'f' ? macrosOf(item) : recipeMacros(item);
    if (!n) delete snap[`${kind}:${item.id}`];
    d.foodSnap = snap;
    if (!Object.keys(snap).length) delete d.foodSnap;
    // Verknüpfter Negativ-Zähler (z. B. Eis → Süßes, Bier → Alkohol)
    const counter = kind === 'f' && item.counter && config.counters.find((c) => c.id === item.counter && isActive(c));
    if (counter && n !== before) {
      const counters = { ...(d.counters || {}) };
      const c = Math.max(0, (counters[counter.id] || 0) + (n - before));
      if (c) counters[counter.id] = c; else delete counters[counter.id];
      d.counters = counters;
      if (!Object.keys(counters).length) delete d.counters;
    }
  });
  softRender();
}

/** Wie oft jedes Lebensmittel / Rezept in den gespeicherten Tagen vorkommt – für die Reihenfolge. */
function foodUsage(before) {
  const use = {};
  for (const d of cachedDates('days')) {
    if (before && d >= before) continue;   // der aktuelle Tag zählt nicht – sonst springen die Chips beim Antippen
    const day = getDay(d) || {};
    for (const [id, n] of Object.entries(day.foods || {})) use[`f:${id}`] = (use[`f:${id}`] || 0) + n;
    for (const [id, n] of Object.entries(day.recipes || {})) use[`r:${id}`] = (use[`r:${id}`] || 0) + n;
  }
  return use;
}

const fmtMacro = (m) => `${fmtNum(m.kcal)} kcal · P ${fmtNum(m.protein)} · F ${fmtNum(m.fat)} · KH ${fmtNum(m.carbs)}`;

/** Chip: Tap = +1, langer Druck = −1. */
function foodChip(label, sub, n, onAdd, onRemove) {
  const btn = h('button', { type: 'button', class: `food-chip${n ? ' on' : ''}` },
    h('span', {}, label), sub ? h('small', {}, sub) : null, n ? h('b', {}, n) : null);
  pressable(btn, onAdd, () => { if (n) onRemove(); });
  return btn;
}

function foodBlock(date, day) {
  const sum = nutritionOf(day);
  const t = config.targets.daily;
  const use = foodUsage(date);
  const byUse = (kind) => (a, b) => (use[`${kind}:${b.id}`] || 0) - (use[`${kind}:${a.id}`] || 0);

  // Tagessumme gegen Ziele (Carbs = Obergrenze)
  const cell = (label, key, unit, isMax) => {
    const target = t[key];
    const over = isMax && target != null && sum[key] > target;
    return h('div', { class: `macro${over ? ' over' : ''}` },
      h('b', {}, fmtNum(sum[key]), h('small', {}, unit)),
      h('span', {}, label, target != null ? ` ${isMax ? 'max. ' : '/ '}${fmtNum(target)}` : ''));
  };

  // Heute gegessen
  const eaten = [
    ...Object.entries(day.recipes || {}).map(([id, n]) => ({ kind: 'r', n, item: config.recipes.find((x) => x.id === id) || { id, name: id } })),
    ...Object.entries(day.foods || {}).map(([id, n]) => ({ kind: 'f', n, item: config.foods.find((x) => x.id === id) || { id, name: id } })),
  ];
  const legacy = (day.meals || []).filter((e) => e.count).map((e) => ({ e, m: config.meals.find((x) => x.id === e.id) || { name: e.id } }));
  const unitMacros = ({ kind, item }) => (day.foodSnap || {})[`${kind}:${item.id}`] || (kind === 'f' ? macrosOf(item) : recipeMacros(item));

  // Chips je Kategorie
  const recipes = config.recipes.filter(isActive).sort(byUse('r'));
  const count = (kind, id) => ((kind === 'f' ? day.foods : day.recipes) || {})[id] || 0;
  const catBlock = (cat, label) => {
    const all = config.foods.filter((f) => isActive(f) && f.cat === cat).sort(byUse('f'));
    if (!all.length) return null;
    const open = todayUi.moreCats.has(cat);
    const shown = open ? all : all.slice(0, 8);
    return [
      h('p', { class: 'subhead' }, label),
      h('div', { class: 'food-chips' },
        shown.map((f) => foodChip(f.name, f.unit, count('f', f.id), () => changeFood(date, 'f', f, 1), () => changeFood(date, 'f', f, -1))),
        all.length > 8 ? h('button', {
          type: 'button', class: 'food-more',
          onclick: () => { if (open) todayUi.moreCats.delete(cat); else todayUi.moreCats.add(cat); softRender(); },
        }, open ? 'weniger' : `+${all.length - 8} mehr`) : null),
    ];
  };

  // Freier Eintrag (nur Nährwerte). kcal und Nährwerte werden aufeinander abgestimmt:
  // 1 g Protein = 4 kcal, 1 g Carbs = 4 kcal, 1 g Fett = 9 kcal.
  const LABEL = { kcal: 'kcal', protein: 'Protein g', fat: 'Fett g', carbs: 'Carbs g' };
  const f = Object.fromEntries(MACROS.map((k) => [k, h('input', { type: 'text', inputmode: 'decimal', placeholder: LABEL[k], oninput: () => check() })]));
  const status = h('p', { class: 'macro-check' });
  const resolve = () => {
    const v = Object.fromEntries(MACROS.map((k) => [k, parseNum(f[k].value)]));
    const fromMacros = 4 * (v.protein || 0) + 4 * (v.carbs || 0) + 9 * (v.fat || 0);
    const missing = ['protein', 'fat', 'carbs'].filter((k) => v[k] == null);
    const out = { ...v, fill: null, mismatch: null };
    if (v.kcal == null && missing.length < 3) { out.kcal = Math.round(fromMacros); out.fill = 'kcal'; }
    else if (v.kcal != null && missing.length === 1) {
      const k = missing[0], rest = v.kcal - fromMacros;
      if (rest < -Math.max(30, v.kcal * 0.1)) out.mismatch = Math.round(fromMacros);   // die anderen Werte ergeben schon mehr kcal
      else { out[k] = Math.max(0, Math.round(rest / (k === 'fat' ? 9 : 4))); out.fill = k; }
    } else if (v.kcal != null && missing.length === 0 && Math.abs(v.kcal - fromMacros) > Math.max(30, v.kcal * 0.1)) {
      out.mismatch = Math.round(fromMacros);
    }
    for (const k of MACROS) if (out[k] == null) out[k] = 0;
    return out;
  };
  const check = () => {
    const r = resolve();
    for (const k of MACROS) f[k].placeholder = r.fill === k ? `≈ ${fmtNum(r[k])} ${k === 'kcal' ? 'kcal' : 'g'}` : LABEL[k];
    status.replaceChildren();
    status.className = 'macro-check';
    if (r.mismatch != null) {
      status.classList.add('bad');
      status.append(`Passt nicht: Protein, Fett und Carbs ergeben ${fmtNum(r.mismatch)} kcal. `,
        h('button', { type: 'button', class: 'link', onclick: () => { f.kcal.value = String(r.mismatch); check(); } }, `kcal auf ${fmtNum(r.mismatch)} setzen`));
    } else if (r.fill) {
      status.append(`Wird ergänzt: ${r.fill === 'kcal' ? `${fmtNum(r.kcal)} kcal` : `${fmtNum(r[r.fill])} g ${LABEL[r.fill].replace(' g', '')}`} (1 g Protein/Carbs = 4 kcal, Fett = 9 kcal)`);
    } else status.append('1 g Protein oder Carbs = 4 kcal, 1 g Fett = 9 kcal. Ein fehlendes Feld rechnet die App aus.');
  };
  const submitFree = () => {
    const r = resolve();
    if (r.mismatch != null) { check(); return; }
    const entry = Object.fromEntries(MACROS.map((k) => [k, Math.round(r[k] || 0)]));
    if (!MACROS.some((k) => entry[k])) { f.kcal.focus(); return; }
    todayUi.foodOpen = false;
    if (document.activeElement) document.activeElement.blur();
    haptic();
    updateDay(date, (d) => { d.food = [...(d.food || []), entry]; });
    softRender();
  };

  return h('div', { class: 'block' },
    h('div', { class: 'macros' }, cell('kcal', 'kcal', '', false), cell('Protein', 'protein', ' g', false), cell('Fett', 'fat', ' g', false), cell('Carbs', 'carbs', ' g', true)),

    eaten.length || legacy.length || (day.food || []).length ? [
      h('p', { class: 'subhead' }, 'Heute gegessen'),
      h('div', { class: 'food-list' },
        eaten.map((x) => {
          const m = unitMacros(x);
          return h('div', { class: 'food-row' },
            h('span', { class: 'food-name' }, `${x.n}× ${x.item.name}`,
              h('small', {}, `${x.item.unit ? `${x.item.unit} · ` : ''}${fmtNum(m.kcal * x.n)} kcal · KH ${fmtNum(m.carbs * x.n)} g`)),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${x.item.name} verringern`, onclick: () => changeFood(date, x.kind, x.item, -1) }, '−'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${x.item.name} erhöhen`, onclick: () => changeFood(date, x.kind, x.item, 1) }, '+'));
        }),
        legacy.map(({ e, m }) => h('div', { class: 'food-row' }, h('span', { class: 'food-name' }, `${e.count}× ${m.name}`, h('small', {}, 'früherer Eintrag')))),
        (day.food || []).map((x, i) => h('div', { class: 'food-row' },
          h('span', { class: 'food-name' }, 'Nährwerte', h('small', {}, fmtMacro(macrosOf(x)))),
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': 'Entfernen',
            onclick: () => { updateDay(date, (d) => { d.food = (d.food || []).filter((_, j) => j !== i); if (!d.food.length) delete d.food; }); softRender(); },
          }, '×')))),
    ] : null,

    recipes.length ? [h('p', { class: 'subhead' }, 'Rezepte'), h('div', { class: 'food-chips' },
      recipes.map((r) => foodChip(r.name, `${fmtNum(recipeMacros(r).kcal)} kcal`, count('r', r.id), () => changeFood(date, 'r', r, 1), () => changeFood(date, 'r', r, -1))))] : null,
    Object.entries(FOOD_CATS).map(([cat, label]) => catBlock(cat, label)),

    todayUi.foodOpen
      ? h('div', { class: 'food-form' },
        h('div', { class: 'food-macros four' }, MACROS.map((k) => f[k])),
        (setTimeout(check, 0), status),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { todayUi.foodOpen = false; softRender(); } }, 'Abbrechen'),
          h('button', { type: 'button', class: 'btn primary', onclick: submitFree }, 'Hinzufügen')))
      : h('p', { class: 'food-links' },
        h('button', { type: 'button', class: 'link', onclick: () => { todayUi.foodOpen = true; softRender(); setTimeout(() => { const i = document.querySelector('.food-form input'); if (i) i.focus(); }, 50); } }, 'Nur Nährwerte eintragen'),
        ' · ',
        h('button', { type: 'button', class: 'link', onclick: () => { setupOpen.add('food'); LS.set('la.ui.setupOpen', [...setupOpen]); setupUi.focus = 'food'; setTab('setup'); } }, 'Lebensmittel & Rezepte bearbeiten')));
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

/** Kurzbefehl starten, wenn die Health-Daten von gestern noch fehlen. */
function healthButton(date, today) {
  if (!config.health.shortcut || date !== today) return null;
  if (Store.get(healthPath(addDays(today, -1)))) return null;
  return h('div', { class: 'block' }, h('a', {
    class: 'btn block health-btn', href: `shortcuts://run-shortcut?name=${encodeURIComponent('Lebensapp-Health')}`,
  }, '♥ Apple-Health-Daten von gestern holen'));
}

/** Negativ-Zähler: Tap = +1, „−“ bzw. langer Druck = −1. */
function counterBlock(date, day) {
  const list = config.counters.filter(isActive);
  if (!list.length) return null;
  const set = (c, delta) => {
    haptic();
    updateDay(date, (d) => {
      const counters = { ...(d.counters || {}) };
      const n = Math.max(0, (counters[c.id] || 0) + delta);
      if (n) counters[c.id] = n; else delete counters[c.id];
      d.counters = counters;
      if (!Object.keys(counters).length) delete d.counters;
    });
    softRender();
  };
  return h('div', { class: 'counters' }, list.map((c) => {
    const n = (day.counters || {})[c.id] || 0;
    const btn = h('button', { type: 'button', class: `counter${n ? ' on' : ''}` },
      h('span', {}, c.name), n ? h('b', {}, `${n}×`) : h('span', { class: 'plus' }, '+'));
    pressable(btn, () => set(c, 1), () => set(c, -1));
    return h('div', { class: 'counter-wrap' }, btn,
      n ? h('button', { type: 'button', class: 'icon-btn counter-minus', 'aria-label': `${c.name} verringern`, onclick: () => set(c, -1) }, '−') : null);
  }));
}

// ---------- Schlaf im Detail ----------

const STAGE_ROWS = [['awake', 'Wach'], ['rem', 'REM'], ['core', 'Kern'], ['deep', 'Tief']];
const clock = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/** Schlafphasen einer Nacht als Zeitstrahl (wie in der Health-App): Wach oben, Tief unten. */
function hypnogram(hl, { compact = false } = {}) {
  const tl = hl && hl.timeline;
  if (!tl || !tl.length) return null;
  const start = hl.bedTime, end = hl.wakeTime, span = end - start || 1;
  const W = 300, rowH = compact ? 7 : 16, gap = compact ? 2 : 6, left = compact ? 0 : 34;
  const H = STAGE_ROWS.length * (rowH + gap) + (compact ? 0 : 16);
  const x = (t) => left + ((t - start) / span) * (W - left);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: `hypno${compact ? ' compact' : ''}`, role: 'img', 'aria-label': 'Schlafphasen im Verlauf der Nacht' });
  STAGE_ROWS.forEach(([k, label], i) => {
    const y = i * (rowH + gap);
    svg.append(svgEl('rect', { x: left, y, width: W - left, height: rowH, class: 'hy-track', rx: 2 }));
    if (!compact) svg.append(svgEl('text', { x: 0, y: y + rowH - 4, class: 'hy-lbl' }, label));
    for (const p of tl) {
      const stage = p.stage === 'asleep' ? 'core' : p.stage;
      if (stage !== k) continue;
      svg.append(svgEl('rect', { x: x(p.s), y, width: Math.max(0.8, x(p.e) - x(p.s)), height: rowH, class: `hy-${k}${p.stage === 'asleep' ? ' hy-unspec' : ''}`, rx: 1 }));
    }
  });
  if (!compact) {
    const yT = H - 3;
    svg.append(svgEl('text', { x: left, y: yT, class: 'hy-time', 'text-anchor': 'start' }, clock(start)));
    svg.append(svgEl('text', { x: W, y: yT, class: 'hy-time', 'text-anchor': 'end' }, clock(end)));
    // volle Stunden als feine Linien
    for (let t = new Date(start).setMinutes(60, 0, 0); t < end; t += 3600000) {
      svg.append(svgEl('line', { x1: x(t), x2: x(t), y1: 0, y2: H - 16, class: 'hy-hour' }));
    }
  }
  return svg;
}

/** Kennzahlen einer Nacht als kompakte Zeile. */
function nightStats(hl) {
  const cell = (label, v, cls) => (v != null ? h('div', { class: 'ns' }, h('i', { class: cls }), h('span', {}, label), h('b', {}, fmtDuration(v))) : null);
  return h('div', { class: 'night-stats' },
    cell('Tief', hl.deepMin, 's-deep'), cell('REM', hl.remMin, 's-rem'), cell('Kern', hl.coreMin, 's-core'), cell('Wach', hl.awakeMin, 's-awake'));
}

/** „Letzte Nacht“ im Reiter Heute. */
function lastNightSection(date) {
  const hl = getHealth(date);
  const outdated = date === logicalToday() && shortcutOutdated() ? outdatedHint() : null;
  if (!hl || !hl.sleepMin) {
    if (!config.health.shortcut || date !== logicalToday()) return null;
    return section('night', 'Letzte Nacht', { text: 'keine Daten' }, outdated || h('p', { class: 'hint' },
      'Noch keine Schlafdaten für letzte Nacht. Lauf den Kurzbefehl (Knopf oben) – kommt dann immer noch nichts: Health → Profilbild → Apps → Kurzbefehle → „Schlaf“ lesen erlauben, und in der Oura-App das Schreiben von Schlaf nach Apple Health aktivieren.'));
  }
  const pct = (v) => (v != null && hl.sleepMin ? ` (${Math.round((v / hl.sleepMin) * 100)} %)` : '');
  return section('night', 'Letzte Nacht', { text: fmtDuration(hl.sleepMin) }, [
    outdated,
    h('div', { class: 'night-head' },
      h('div', {}, h('b', {}, fmtDuration(hl.sleepMin)), h('span', {}, 'geschlafen')),
      hl.bedTime ? h('div', {}, h('b', {}, `${clock(hl.bedTime)} – ${clock(hl.wakeTime)}`), h('span', {}, 'im Bett')) : null),
    hypnogram(hl),
    nightStats(hl),
    h('p', { class: 'hint' }, [
      hl.deepMin != null ? `Tief${pct(hl.deepMin)}` : null, hl.remMin != null ? `REM${pct(hl.remMin)}` : null,
      hl.hrv != null ? `HRV ${hl.hrv} ms` : null, hl.restingHr != null ? `Ruhepuls ${hl.restingHr}` : null,
      hl.sleepSource ? `Quelle: ${hl.sleepSource}` : null,
    ].filter(Boolean).join(' · ')),
  ]);
}

/** Kleine Gewohnheiten nach optionaler Gruppe (z. B. „Supplements“) bündeln; ohne Gruppe zuerst. */
function habitGroups(list) {
  const groups = new Map();
  for (const x of list) {
    const g = x.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  }
  return [...groups.entries()].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0));
}

function viewToday() {
  const today = logicalToday();
  if (todayUi.date && todayUi.date >= today) todayUi.date = null;
  const date = todayUi.date || today;
  const day = Object.assign(emptyDay(date), getDay(date) || {});
  const paused = day.pause ? config.pauseModes.find((p) => p.id === day.pause) || { id: day.pause, name: day.pause } : null;

  // Vergangene Tage bei Bedarf nachladen.
  if (date !== today && todayUi.ensured !== date && conn()) {
    todayUi.ensured = date;
    ensureDays(addDays(date, -1), date).then((changed) => { if (changed) softRender(); }).catch(() => {});
  }

  const go = (d) => { todayUi.date = d >= today ? null : d; todayUi.trainOpen = null; todayUi.strengthDay = null; todayUi.lastExercise = null; todayUi.pauseOpen = false; render(); };
  const yesterday = addDays(today, -1);
  const sub = date === today ? 'Heute' : `${date === yesterday ? 'Gestern' : `vor ${Math.round((parseYmd(today) - parseYmd(date)) / 86400000)} Tagen`} · Tippen für heute`;

  const { habits, metrics } = dayItems();
  const measures = metrics.filter((m) => m.type !== 'scale10');
  const moods = metrics.filter((m) => m.type === 'scale10');
  const p1Habits = habits.filter((x) => (x.prio || 1) === 1);
  const p2Habits = habits.filter((x) => (x.prio || 1) !== 1);
  const counts = sectionCounts(date);
  const countSum = (id) => ({ countId: id, text: countLabel(counts[id]), done: isDone(counts[id]) });

  const nutrition = nutritionOf(day);
  const training = trainingFor(date);
  const setTotal = (day.strength || []).reduce((a, e) => a + e.sets.length, 0);
  const trainingSum = training.length
    ? [...new Set(training.map((e) => (config.training.find((t) => t.id === e.id) || { name: e.id }).name))].join(', ') + (setTotal ? ` · ${setTotal} Sätze` : '')
    : '–';

  const root = h('div', {},
    h('div', { class: 'dayhead' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Vortag', onclick: () => go(addDays(date, -1)) }, '‹'),
      h('button', { type: 'button', class: 'date-btn', onclick: () => go(today) },
        h('strong', {}, formatDateLong(date)),
        h('small', { class: date === today ? '' : 'past' }, sub)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nächster Tag', disabled: date === today, onclick: () => go(addDays(date, 1)) }, '›')),

    h('div', { class: 'controls' },
      h('div', { class: 'progress', id: 'progress', role: 'presentation' }, h('i', { style: `width:${Math.round(progressOf(date) * 100)}%` })),
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

    h('div', { class: `checkin${paused ? ' paused' : ''}` },
      paused ? h('p', { class: 'paused-note' }, 'Pause-Tag: zählt nicht in Durchschnitte und Wochenziele. Eingaben sind trotzdem möglich.') : null,
      healthButton(date, today),
      lastNightSection(date),
      section('measures', 'Messwerte', countSum('measures'), measures.map((m) => metricBlock(m, date))),
      section('habits', 'Gewohnheiten', countSum('habits'), [
        p1Habits.length ? h('div', { class: 'tiles' }, p1Habits.map((x) => boolTile(x, date, null, false))) : null,
        habitGroups(p2Habits).map(([group, list]) => [
          group ? h('p', { class: 'subhead' }, group) : null,
          h('div', { class: 'tiles compact spaced' }, list.map((x) => boolTile(x, date, null, true))),
        ]),
      ]),
      section('food', 'Ernährung', { text: nutrition.any ? `${fmtNum(nutrition.kcal)} kcal · KH ${fmtNum(nutrition.carbs)} g` : '–' }, foodBlock(date, day)),
      section('training', 'Training', { text: trainingSum }, trainingBlock(date, day)),
      section('mood', 'Befinden', countSum('mood'), moods.map((m) => metricBlock(m, date))),
      section('neg', 'Negatives', { text: (() => { const n = Object.values(day.counters || {}).reduce((a, x) => a + x, 0); return n ? `${n}×` : 'keine'; })() }, counterBlock(date, day)),
      section('tags', 'Tags', { text: (day.tags || []).map((id) => (config.dayTags.find((t) => t.id === id) || { name: id }).name).join(', ') || '–' }, dayTagBlock(date, day)),
      date === logicalToday() ? noteReminder(date) : null,
      !habits.length && !metrics.length ? h('p', { class: 'empty-note' }, 'Noch nichts eingerichtet – siehe Setup.') : null,
    ));

  attachSwipe(root, () => { if (date < today) go(addDays(date, 1)); }, () => go(addDays(date, -1)));
  return root;
}

// ---------- Auswertung: Grundlagen ----------

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

// ---------- Auswertung: Level ----------

const svgEl = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

const ATTRS = { koerper: 'Körper', treibstoff: 'Treibstoff', geist: 'Geist' };

/** Welchem Attribut eine Gewohnheit oder ein Negativ-Zähler zählt (Feld „attr“, sonst nach Name). */
function habitAttr(hb) {
  if (hb.attr && ATTRS[hb.attr]) return hb.attr;
  const t = `${hb.id} ${hb.name} ${hb.group || ''}`;
  if (/medit|lesen|read|handy|phone|journal|atem|breath|dankbar|stress|bildschirm|screen/i.test(t)) return 'geist';
  if (/supplement|omega|vitamin|kreatin|creatin|magnes|wasser|water|essen|food|zucker|süß|suess|sweet|alkohol|alcohol|koffein|caffeine|gegessen|meal/i.test(t)) return 'treibstoff';
  return 'koerper';
}

/** Anteil (0–1) erledigter Tage einer Gewohnheit an den gezählten Tagen. */
function habitRate(hb, dates) {
  const days = countedDates(dates);
  if (!days.length) return null;
  return days.filter((d) => ((getDay(d) || {}).habits || {})[hb.id] === true).length / days.length;
}

/** Summe eines Negativ-Zählers über die gezählten Tage. */
const counterSum = (c, dates) => countedDates(dates).reduce((a, d) => a + (((getDay(d) || {}).counters || {})[c.id] || 0), 0);
const counterMax = (c) => config.targets.weekly[`${c.id}_max`];

/** Soll/Ist aller Trainingsziele; das Wochenziel wird auf die Länge des Zeitraums hochgerechnet. */
function trainingGoals(dates) {
  const weeks = dates.length / 7;
  return config.training.filter(isActive).map((t) => {
    const target = config.targets.weekly[weeklyKey(t)];
    if (target == null) return null;
    const soll = Math.round(target * weeks);
    const entries = countedDates(dates).flatMap((d) => trainingFor(d).filter((e) => e.id === t.id));
    const ist = t.type === 'minutes' ? entries.reduce((s, e) => s + (e.min || 0), 0) : entries.length;
    return { t, ist, soll, unit: t.type === 'minutes' ? ' min' : '×', rate: soll > 0 ? Math.min(1, ist / soll) : 1 };
  }).filter(Boolean);
}

/** Ernährung: Anteil der Tage mit Einträgen, an denen die Tagesziele erreicht wurden. */
function nutritionRate(dates) {
  const t = config.targets.daily;
  const days = countedDays(dates).map(nutritionOf).filter((n) => n.any);
  if (!days.length) return null;
  return avg(days.map((n) => {
    const ok = [];
    if (t.kcal) ok.push(n.kcal >= t.kcal * 0.9 && n.kcal <= t.kcal * 1.1);
    if (t.protein) ok.push(n.protein >= t.protein);
    if (t.carbs) ok.push(n.carbs <= t.carbs * 1.1);
    return ok.length ? ok.filter(Boolean).length / ok.length : 1;
  }));
}

/**
 * Wochen-Score (0–100) und Attribute. Pause-Tage zählen nicht; Prio-1-Gewohnheiten doppelt.
 * Negative mit Wochenlimit zählen voll, solange das Limit eingehalten wird.
 */
function weekScore(dates) {
  const counted = countedDates(dates).length;
  if (!counted) return null;
  // Jedes Ziel ist ein Baustein: [Erfüllung 0–1, Gewicht, Name, Ist-Text]
  const parts = { koerper: [], treibstoff: [], geist: [] };
  for (const g of trainingGoals(dates)) parts.koerper.push([g.rate, 2, g.t.name, `${fmtNum(g.ist)} / ${fmtNum(g.soll)}${g.unit}`]);
  const sets = setsByGroup(dates);
  for (const [g, label] of Object.entries(MUSCLE_GROUPS)) {
    const target = config.targets.weekly[`sets_${g}`];
    if (!target) continue;
    const soll = Math.round(target * dates.length / 7);
    parts.koerper.push([Math.min(1, (sets[g] || 0) / soll), 1, `${label}-Sätze`, `${sets[g] || 0} / ${soll}`]);
  }
  for (const hb of config.habits.filter(isActive)) {
    const r = habitRate(hb, dates);
    if (r != null) parts[habitAttr(hb)].push([r, (hb.prio || 1) === 1 ? 2 : 1, hb.name, `${Math.round(r * counted)} / ${counted} Tage`]);
  }
  for (const c of config.counters.filter(isActive)) {
    const max = counterMax(c);
    if (max == null) continue;
    const limit = Math.round(max * dates.length / 7);
    const ist = counterSum(c, dates);
    parts[habitAttr(c)].push([ist <= limit ? 1 : Math.max(0, limit / ist), 1, `${c.name} (Limit)`, `${ist} / max. ${limit}×`]);
  }
  const n = nutritionRate(dates);
  if (n != null) parts.treibstoff.push([n, 2, 'Ernährungsziele', `${Math.round(n * 100)} % erfüllt`]);
  const attrs = {}, items = {};
  for (const [k, list] of Object.entries(parts)) {
    const w = list.reduce((a, [, x]) => a + x, 0);
    attrs[k] = w ? Math.round((list.reduce((a, [v, x]) => a + v * x, 0) / w) * 100) : null;
    items[k] = list.map(([v, , label, text]) => ({ label, text, pct: Math.round(v * 100) }));
  }
  const vals = Object.values(attrs).filter((v) => v != null);
  return { score: vals.length ? Math.round(avg(vals)) : 0, attrs, items };
}

/** Level aus allen abgeschlossenen Wochen: Level L braucht 50·L·(L−1) Punkte (100, 300, 600, …). */
function levelInfo() {
  const dates = cachedDates('days');
  if (!dates.length) return { level: 1, xp: 0, next: 100, prev: 0, weeks: 0 };
  const thisWeek = mondayOf(logicalToday());
  let xp = 0, weeks = 0;
  for (let w = mondayOf(dates[0]); w < thisWeek; w = addDays(w, 7)) {
    const s = weekScore(weekDates(w));
    if (s) { xp += s.score; weeks++; }
  }
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  return { level, xp, prev: 50 * level * (level - 1), next: 50 * (level + 1) * level, weeks };
}

/** Titel je Level – damit die Zahl etwas bedeutet. */
const LEVEL_TITLES = ['Einsteiger', 'Dranbleiber', 'Gewohnheitstier', 'Routinier', 'Durchzieher', 'Profi', 'Meister', 'Vorbild', 'Legende'];
const levelTitle = (l) => LEVEL_TITLES[Math.min(l, LEVEL_TITLES.length) - 1];
const ATTR_HINTS = { koerper: 'Training, Sätze, Bewegung', treibstoff: 'Ernährung, Supplements, Süßes', geist: 'Meditation, Lesen, Handy, Stress' };

// ---------- Auswertung: Zeitraum ----------

const PERIODS = { week: 'Woche', month: 'Monat', quarter: '3 Monate' };
const statsUi = { kind: LS.get('la.ui.period', 'week'), offset: 0, night: null, attrOpen: null, exOpen: null };
const rangeDates = (s, e) => { const out = []; for (let d = s; d <= e; d = addDays(d, 1)) out.push(d); return out; };

/** Zeitraum mit Versatz (0 = aktuell): Woche Mo–So, Monat, 3 Kalendermonate. */
function periodRange(kind, offset) {
  const today = logicalToday();
  if (kind === 'week') {
    const s = addDays(mondayOf(today), -7 * offset), e = addDays(s, 6);
    return { start: s, end: e, dates: rangeDates(s, e), title: `KW ${isoWeek(s)}`, sub: `${formatDateShort(s)} – ${formatDateShort(e)}` };
  }
  const months = kind === 'month' ? 1 : 3;
  const t = parseYmd(today);
  const last = new Date(t.getFullYear(), t.getMonth() - offset * months + 1, 0, 12);
  const first = new Date(last.getFullYear(), last.getMonth() - months + 1, 1, 12);
  const s = ymd(first), e = ymd(last);
  const title = months === 1 ? `${MONTHS[first.getMonth()]} ${first.getFullYear()}`
    : `${MONTHS[first.getMonth()].slice(0, 3)} – ${MONTHS[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
  return { start: s, end: e, dates: rangeDates(s, e), title, sub: `${formatDateShort(s)} – ${formatDateShort(e)}` };
}

/** Werte pro Tag, bei mehr als 31 Tagen als Wochenmittel. */
function series(dates, fn) {
  if (dates.length <= 31) {
    return dates.map((d, i) => ({
      v: fn(d),
      label: dates.length <= 7 ? WD_SHORT[parseYmd(d).getDay()] : (i % 5 === 0 ? String(parseYmd(d).getDate()) : ''),
    }));
  }
  const out = [];
  for (let i = 0; i < dates.length; i += 7) {
    const chunk = dates.slice(i, i + 7);
    const vals = chunk.map(fn).filter((v) => v != null);
    out.push({ v: vals.length ? avg(vals) : null, label: out.length % 2 === 0 ? `KW${isoWeek(chunk[0])}` : '' });
  }
  return out;
}

// ---------- Auswertung: Diagramme ----------

/** Balken „Ist gegenüber Soll“; lowerIsBetter für Negative (Limit). */
function goalRow(label, istText, rate, { reached, over } = {}) {
  const pct = Math.max(0, Math.min(100, Math.round((rate || 0) * 100)));
  const ok = reached ?? rate >= 1;
  return h('div', { class: `goal${ok ? ' reached' : ''}${over ? ' over' : ''}` },
    h('div', { class: 'goal-top' }, h('span', {}, label), h('span', {}, istText)),
    h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })));
}

/** Gestapelte Schlafbalken pro Nacht (bzw. Wochenmittel) mit Tief, REM, Kern, sonstigem Schlaf. */
function sleepChart(dates) {
  const get = (k) => (d) => { const hl = getHealth(d); return hl && hl.sleepMin ? (hl[k] || 0) : null; };
  const total = series(dates, get('sleepMin'));
  const parts = [['deepMin', 's-deep'], ['remMin', 's-rem'], ['coreMin', 's-core']].map(([k, cls]) => [series(dates, get(k)), cls]);
  const target = config.targets.daily.sleepH ? config.targets.daily.sleepH * 60 : null;
  const max = Math.max(60 * 9, target || 0, ...total.map((p) => p.v || 0));
  const n = total.length, W = 300, H = 130, top = 16, base = H - 18;
  const slot = W / n, bw = Math.min(26, slot * 0.72);
  const y = (min) => base - (min / max) * (base - top);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Schlafphasen' });
  if (target) svg.append(svgEl('line', { x1: 0, x2: W, y1: y(target), y2: y(target), class: 'target' }));
  total.forEach((p, i) => {
    const x = i * slot + (slot - bw) / 2;
    if (p.label) svg.append(svgEl('text', { x: x + bw / 2, y: H - 4, class: 'lbl' }, p.label));
    if (!p.v) return;
    let acc = 0;
    const stack = parts.map(([s, cls]) => [s[i].v || 0, cls]);
    stack.push([Math.max(0, p.v - stack.reduce((a, [v]) => a + v, 0)), 's-other']);
    for (const [v, cls] of stack) {
      if (!v) continue;
      svg.append(svgEl('rect', { x, width: bw, y: y(acc + v), height: y(acc) - y(acc + v), class: cls, rx: Math.min(2, bw / 4) }));
      acc += v;
    }
    if (n <= 7) svg.append(svgEl('text', { x: x + bw / 2, y: y(acc) - 4, class: 'val' }, `${Math.floor(p.v / 60)}:${pad2(Math.round(p.v % 60))}`));
  });
  return svg;
}

/** Punkte-Linie (Ruhepuls, HRV …); bei langen Zeiträumen Wochenmittel. */
function lineChart(points, { labels = true, decimals = 0 } = {}) {
  const W = 300, H = 80, top = 16, base = H - 18, n = points.length, step = W / n, cx = (i) => step / 2 + i * step;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  points.forEach((p, i) => { if (p.label) svg.append(svgEl('text', { x: cx(i), y: H - 4, class: 'lbl' }, p.label)); });
  const pts = points.map((p, i) => ({ v: p.v, i })).filter((p) => p.v != null);
  if (!pts.length) return svg;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v)), span = max - min || 1;
  const y = (v) => base - 6 - ((v - min) / span) * (base - top - 12);
  if (pts.length > 1) svg.append(svgEl('path', { d: pts.map((p, k) => `${k ? 'L' : 'M'}${cx(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '), class: 'line' }));
  for (const p of pts) {
    svg.append(svgEl('circle', { cx: cx(p.i), cy: y(p.v), r: n > 14 ? 2 : 3, class: 'dot' }));
    if (labels && n <= 7) svg.append(svgEl('text', { x: cx(p.i), y: y(p.v) - 7, class: 'val' }, fmtNum(p.v, decimals)));
  }
  return svg;
}

/** Tageswerte als blasse Punkte plus gleitender 7-Tage-Durchschnitt als Linie. */
function trendChart(dates, lines) {
  const W = 300, H = 110, top = 10, base = H - 18, n = dates.length, step = W / n, cx = (i) => step / 2 + i * step;
  const all = lines.flatMap((l) => dates.map(l.fn)).filter((v) => v != null);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  dates.forEach((d, i) => { if (i % 7 === 0) svg.append(svgEl('text', { x: cx(i), y: H - 4, class: 'lbl' }, formatDateShort(d))); });
  if (!all.length) return svg;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const y = (v) => base - ((v - min) / span) * (base - top);
  for (const l of lines) {
    const vals = dates.map(l.fn);
    vals.forEach((v, i) => { if (v != null) svg.append(svgEl('circle', { cx: cx(i), cy: y(v), r: 1.8, class: `raw ${l.cls || ''}` })); });
    const ma = vals.map((_, i) => { const w = vals.slice(Math.max(0, i - 6), i + 1).filter((v) => v != null); return w.length >= 3 ? avg(w) : null; });
    let d = '', pen = false;
    ma.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
    if (d) svg.append(svgEl('path', { d, class: `line ${l.cls || ''}` }));
  }
  return svg;
}

const legend = (items) => h('div', { class: 'legend' }, items.map(([cls, label]) => h('span', {}, h('i', { class: cls }), label)));

// ---------- Auswertung: Schlafrhythmus ----------

/** Uhrzeit (ms) → Minuten ab 18:00, damit Zeiten um Mitternacht sauber gemittelt werden. */
const minFrom18 = (ms) => { const d = new Date(ms); return ((d.getHours() * 60 + d.getMinutes()) - 18 * 60 + 1440) % 1440; };
const clockFrom18 = (m) => { const t = Math.round(m + 18 * 60) % 1440; return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };
const sd = (list) => { const m = avg(list); return Math.sqrt(avg(list.map((v) => (v - m) ** 2))); };

function sleepRhythm(dates) {
  const nights = countedDates(dates).map(getHealth).filter((hl) => hl && hl.bedTime && hl.wakeTime);
  if (nights.length < 2) return null;
  const bed = nights.map((hl) => minFrom18(hl.bedTime)), wake = nights.map((hl) => minFrom18(hl.wakeTime));
  return { bed: clockFrom18(avg(bed)), bedSd: Math.round(sd(bed)), wake: clockFrom18(avg(wake)), wakeSd: Math.round(sd(wake)), n: nights.length };
}

// ---------- Auswertung: Was hilft mir? ----------

/**
 * Einfache Vergleiche: Tage mit Faktor gegen Tage ohne. Gezeigt wird nur, was in beiden Gruppen
 * mindestens 4 Tage hat und einen spürbaren Unterschied zeigt (Effektstärke ≥ 0,3).
 * Abend-Faktoren wirken auf die Nacht danach (Health-Datei des Folgetags).
 */
function insights(dates) {
  const days = countedDates(dates).filter((d) => getDay(d) || getHealth(d));
  const next = (d) => getHealth(addDays(d, 1)) || {};
  const moods = config.metrics.filter((m) => isActive(m) && m.type === 'scale10');
  const negTotal = (d) => { const c = (getDay(d) || {}).counters || {}; return config.counters.filter(isActive).reduce((a, x) => a + (c[x.id] || 0), 0); };
  const outcomes = [
    { label: 'Schlaf in der Nacht danach', fmt: (v) => `${Math.round(v)} min`, fn: (d) => next(d).sleepMin ?? null, night: true },
    { label: 'Tiefschlaf in der Nacht danach', fmt: (v) => `${Math.round(v)} min`, fn: (d) => next(d).deepMin ?? null, night: true },
    { label: 'HRV in der Nacht danach', fmt: (v) => `${Math.round(v)} ms`, fn: (d) => next(d).hrv ?? null, night: true },
    { label: 'Ruhepuls danach', fmt: (v) => `${Math.round(v)} bpm`, fn: (d) => next(d).restingHr ?? null, night: true, lowerIsBetter: true },
    ...moods.map((m) => ({ label: m.name, fmt: (v) => fmtNum(v, 1), fn: (d) => metricOn(m, d) ?? null })),
    config.counters.some(isActive) ? { label: 'Negatives am selben Tag', isNeg: true, fmt: (v) => `${fmtNum(v, 1)}×`, fn: (d) => (getDay(d) ? negTotal(d) : null), lowerIsBetter: true } : null,
  ].filter(Boolean);
  const factors = [
    ...config.habits.filter(isActive).map((hb) => ({ label: hb.name, test: (d) => { const day = getDay(d); return day ? ((day.habits || {})[hb.id] === true) : null; } })),
    ...config.counters.filter(isActive).map((c) => ({ label: c.name, negative: true, test: (d) => { const day = getDay(d); return day ? (((day.counters || {})[c.id] || 0) > 0) : null; } })),
    { label: 'Training', test: (d) => (getDay(d) || getHealth(d) ? trainingFor(d).length > 0 : null) },
    ...config.dayTags.filter(isActive).map((t) => ({ label: t.name, test: (d) => { const day = getDay(d); return day ? (day.tags || []).includes(t.id) : null; } })),
    { label: 'Beintraining', test: (d) => { const day = getDay(d); if (!day) return null; return (day.strength || []).some((e) => (config.exercises.find((x) => x.id === e.id) || {}).group === 'legs'); } },
  ];
  // Viele Carbs (über dem Median der Tage mit Ernährungseinträgen)
  const carbDays = days.map((d) => nutritionOf(Object.assign(emptyDay(d), getDay(d) || {}))).filter((n) => n.any).map((n) => n.carbs).sort((a, b) => a - b);
  if (carbDays.length >= 8) {
    const median = carbDays[Math.floor(carbDays.length / 2)];
    factors.push({ label: `mehr als ${fmtNum(median)} g Carbs`, test: (d) => { const n = nutritionOf(Object.assign(emptyDay(d), getDay(d) || {})); return n.any ? n.carbs > median : null; } });
  }
  // Häufige Lebensmittel (an mindestens 6 Tagen gegessen)
  const foodDays = {};
  for (const d of days) for (const id of Object.keys((getDay(d) || {}).foods || {})) foodDays[id] = (foodDays[id] || 0) + 1;
  for (const [id, n] of Object.entries(foodDays)) {
    const food = config.foods.find((f) => f.id === id);
    if (!food || n < 6 || food.counter) continue;
    factors.push({ label: food.name, test: (d) => { const day = getDay(d); if (!day) return null; const any = Object.keys(day.foods || {}).length > 0; return any ? ((day.foods || {})[id] || 0) > 0 : null; } });
  }
  // Gut geschlafen (Nacht vor dem Tag, über dem Median) → Wirkung auf den Tag
  const sleeps = days.map((d) => (getHealth(d) || {}).sleepMin).filter((v) => v != null).sort((a, b) => a - b);
  if (sleeps.length >= 8) {
    const median = sleeps[Math.floor(sleeps.length / 2)];
    factors.push({ label: `mehr als ${fmtDuration(median)} Schlaf`, sameDayOnly: true, test: (d) => { const s = (getHealth(d) || {}).sleepMin; return s == null ? null : s > median; } });
  }
  const found = [];
  for (const f of factors) {
    for (const o of outcomes) {
      if ((f.sameDayOnly && o.night) || (f.negative && o.isNeg)) continue;
      const a = [], b = [];
      for (const d of days) {
        const t = f.test(d), v = o.fn(d);
        if (t == null || v == null) continue;
        (t ? a : b).push(v);
      }
      if (a.length < 4 || b.length < 4) continue;
      const diff = avg(a) - avg(b);
      const pooled = Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2) || 1;
      const effect = diff / pooled;
      if (Math.abs(effect) < 0.3) continue;
      const good = o.lowerIsBetter ? diff < 0 : diff > 0;
      found.push({ f, o, diff, effect, good, na: a.length, nb: b.length });
    }
  }
  return found.sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)).slice(0, 6);
}

function insightRow(x) {
  const sign = x.diff > 0 ? '+' : '−';
  return h('div', { class: `insight ${x.good ? 'good' : 'bad'}` },
    h('div', {}, h('b', {}, x.f.negative ? `Mit „${x.f.label}“` : x.f.sameDayOnly ? `Nach ${x.f.label}` : `Mit „${x.f.label}“`), ': ',
      `${x.o.label} Ø ${sign}${x.o.fmt(Math.abs(x.diff))}`),
    h('small', {}, `${x.na} Tage mit gegen ${x.nb} ohne · ${Math.abs(x.effect) >= 0.8 ? 'deutlich' : Math.abs(x.effect) >= 0.5 ? 'mittel' : 'leicht'}`));
}

// ---------- Auswertung ----------

// ---------- Lebensbilanz: wenige Kennzahlen über Jahre ----------
// Gleitend über 30 Tage, verglichen mit den 30 Tagen davor und demselben Zeitraum vor einem Jahr.
// Grundlage: App-Einträge, Kurzbefehl und die Historie aus dem Health-Export.

const bilanzUi = { open: null };
const BILANZ_WINDOW = 30;

/** Sparplan: { start, rates: [{ from, perHour }], extras: [{ id, date, eur }] } in config.savings. */
function savedAt(ms) {
  const s = config.savings;
  if (!s) return 0;
  let eur = 0;
  const rates = (s.rates || []).filter((r) => r.from && r.perHour > 0).sort((a, b) => (a.from < b.from ? -1 : 1));
  rates.forEach((r, i) => {
    const from = Math.max(parseYmd(r.from).setHours(0, 0, 0, 0), s.start ? parseYmd(s.start).setHours(0, 0, 0, 0) : -Infinity);
    const to = Math.min(ms, i + 1 < rates.length ? parseYmd(rates[i + 1].from).setHours(0, 0, 0, 0) : Infinity);
    if (to > from) eur += ((to - from) / 3600000) * r.perHour;
  });
  for (const x of s.extras || []) if (x.eur && parseYmd(x.date).setHours(0, 0, 0, 0) <= ms) eur += Number(x.eur);
  return eur;
}
const endOfDay = (date) => parseYmd(date).setHours(24, 0, 0, 0);
const fmtEur = (v) => `${fmtNum(Math.round(v))} €`;

function moodOn(d) {
  const vals = config.metrics.filter((m) => isActive(m) && m.type === 'scale10').map((m) => metricValue(m, d)).filter((v) => typeof v === 'number');
  return vals.length ? avg(vals) : null;
}
const metricById = (id) => config.metrics.find((m) => m.id === id);

/** Kennzahlen der Lebensbilanz. better: +1 = mehr ist besser, −1 = weniger ist besser. */
function bilanzDefs() {
  const w = metricById('weight') || { id: 'weight', type: 'number' };
  const bp = config.metrics.find((m) => m.type === 'bloodpressure') || { id: 'bp', type: 'bloodpressure' };
  return [
    { id: 'move', label: 'Bewegung', better: 1, scale: 7, min: 5, skipToday: true, decimals: 0,
      day: (d) => (getHealth(d) || {}).exerciseMin ?? null, fmt: (v) => `${fmtNum(v)} min`, unit: 'pro Woche',
      info: 'Trainingsminuten aus Apple Health (grüner Ring der Watch), hochgerechnet auf eine Woche.' },
    { id: 'weight', label: 'Gewicht', better: -1, min: 1, decimals: 1,
      day: (d) => metricOn(w, d) ?? null, fmt: (v) => `${fmtNum(v, 1)} kg`, unit: 'Ø 30 Tage',
      info: 'Durchschnitt aller Wiegungen der letzten 30 Tage (eigene Einträge und Waage über Health).' },
    { id: 'bp', label: 'Blutdruck', better: -1, min: 1, decimals: 0,
      day: (d) => (metricOn(bp, d) || {}).sys ?? null, day2: (d) => (metricOn(bp, d) || {}).dia ?? null,
      fmt: (v, v2) => `${fmtNum(v)}/${v2 != null ? fmtNum(v2) : '–'}`, unit: 'Ø 30 Tage',
      info: 'Durchschnitt aller Messungen der letzten 30 Tage. Verglichen wird der obere Wert (systolisch).' },
    { id: 'sleep', label: 'Schlaf', better: 1, min: 5, decimals: 0,
      day: (d) => (getHealth(d) || {}).sleepMin ?? null, fmt: (v) => fmtDuration(v), unit: 'Ø pro Nacht',
      info: 'Geschlafene Zeit pro Nacht (ohne Wachphasen), Quelle wie im Setup festgelegt.' },
    { id: 'mood', label: 'Befinden', better: 1, min: 3, decimals: 1,
      day: moodOn, fmt: (v) => `${fmtNum(v, 1)} / 10`, unit: 'Ø Körper & Geist',
      info: 'Durchschnitt deiner abendlichen Bewertung von Körper und Geist.' },
  ];
}

/** Durchschnitt einer Kennzahl über die n Tage bis end (bzw. nur mit genug Messungen). */
function bilanzAvg(def, end, n = BILANZ_WINDOW) {
  const dates = rangeDates(addDays(end, -(n - 1)), end);
  const vals = dates.map(def.day).filter((v) => typeof v === 'number');
  if (vals.length < Math.min(def.min, n)) return null;
  const v2 = def.day2 ? avg(dates.map(def.day2).filter((v) => typeof v === 'number')) : null;
  return { v: avg(vals) * (def.scale || 1), v2, n: vals.length };
}

/** Monatswerte seit Beginn der Daten (höchstens 7 Jahre). */
function bilanzMonths(def, today) {
  const hd = historyData();
  const first = [hd && hd.from, cachedDates('days')[0]].filter(Boolean).sort()[0] || today;
  const t = parseYmd(today);
  let m = new Date(Math.max(parseYmd(first).getTime(), new Date(t.getFullYear() - 7, t.getMonth(), 1).getTime()));
  m = new Date(m.getFullYear(), m.getMonth(), 1, 12);
  const out = [];
  while (m <= t) {
    const s = ymd(m), last = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12);
    const e = ymd(last) < today ? ymd(last) : today;
    const vals = rangeDates(s, e).map(def.day).filter((v) => typeof v === 'number');
    const need = def.min > 1 ? Math.min(def.min, 3) : 1;
    out.push({ month: s, v: vals.length >= need ? avg(vals) * (def.scale || 1) : null });
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12);
  }
  while (out.length && out[0].v == null) out.shift();
  return out;
}

const monthLabel = (s) => { const d = parseYmd(s); return `${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`; };

function bilanzDelta(def, cur, ref, word) {
  if (!cur || !ref) return null;
  const diff = round(cur.v, def.decimals) - round(ref.v, def.decimals);
  const good = diff * def.better > 0, bad = diff * def.better < 0;
  const txt = def.id === 'sleep' ? fmtDuration(Math.abs(diff)).replace(' h', '') + ' h' : fmtNum(Math.abs(diff), def.decimals) + (def.id === 'move' ? ' min' : def.id === 'weight' ? ' kg' : '');
  return h('span', { class: `delta${good ? ' good' : bad ? ' bad' : ''}` }, `${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${diff ? txt : ''} ${word}`.replace(/\s+/g, ' ').trim());
}

/** Monatsverlauf als Linie mit Jahresmarken. */
function monthChart(months, def) {
  const pts = months.map((x) => ({ v: x.v, label: parseYmd(x.month).getMonth() === 0 || months.length <= 12 ? (months.length <= 12 ? MONTHS[parseYmd(x.month).getMonth()].slice(0, 1) : `'${x.month.slice(2, 4)}`) : '' }));
  return lineChart(pts, { labels: months.length <= 7, decimals: def.decimals });
}

function savingsDetail() {
  const s = config.savings || {};
  const rate = ((s.rates || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1)).pop() || {}).perHour;
  const today = logicalToday();
  const ensure = () => { config.savings = Object.assign({ start: null, rates: [], extras: [] }, config.savings); return config.savings; };
  const setStart = (v) => {
    const c = ensure();
    c.start = v || null;
    if (c.rates.length && v) c.rates[0].from = v < c.rates[0].from || c.rates.length === 1 ? v : c.rates[0].from;
    commitConfig('savings', true);
  };
  const setRate = (v) => {
    const c = ensure();
    const n = parseNum(v);
    if (n == null || n < 0) return;
    const from = !c.start || today <= c.start || !c.rates.length ? (c.start || today) : today;
    c.rates = c.rates.filter((r) => r.from !== from && r.from < from);
    c.rates.push({ from, perHour: n });
    commitConfig('savings', true);
  };
  let amount = '';
  let date = today;
  const add = () => {
    const n = parseNum(amount);
    if (!n) return;
    const c = ensure();
    c.extras.push({ id: `x${Date.now().toString(36)}`, date, eur: n });
    c.extras.sort((a, b) => (a.date < b.date ? -1 : 1));
    commitConfig('savings extra', true);
  };
  const extras = (s.extras || []).slice().reverse();
  return h('div', { class: 'bilanz-form' },
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Sparplan seit'), h('input', { type: 'date', value: s.start || '', onchange: (e) => setStart(e.target.value) })),
      h('label', { class: 'field' }, h('span', {}, '€ pro Stunde'), h('input', { type: 'text', inputmode: 'decimal', value: rate != null ? fmtNum(rate, 2) : '', placeholder: '1,30', onchange: (e) => setRate(e.target.value) }))),
    rate ? h('p', { class: 'hint' }, `= ${fmtNum(rate * 24, 2)} € pro Tag · ca. ${fmtEur(rate * 24 * 365 / 12)} pro Monat. Eine neue Rate gilt ab heute, frühere Tage behalten die alte.`) : null,
    h('p', { class: 'subhead' }, 'Extra-Kauf eintragen'),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Betrag (€)'), h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 250', oninput: (e) => { amount = e.target.value; } })),
      h('label', { class: 'field' }, h('span', {}, 'Datum'), h('input', { type: 'date', value: today, onchange: (e) => { date = e.target.value || today; } }))),
    h('button', { type: 'button', class: 'btn primary', onclick: add }, 'Hinzufügen'),
    extras.length ? h('div', { class: 'extras' }, extras.map((x) => h('div', { class: 'extra' },
      h('span', {}, formatDateShort(x.date) + String(parseYmd(x.date).getFullYear()).slice(2)),
      h('b', {}, fmtEur(x.eur)),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Löschen', onclick: () => {
        if (!confirm(`Extra-Kauf über ${fmtEur(x.eur)} löschen?`)) return;
        config.savings.extras = config.savings.extras.filter((y) => y.id !== x.id);
        commitConfig('savings extra', true);
      } }, '×')))) : null,
    h('p', { class: 'hint' }, 'Nur Euro-Beträge – deine BTC-Menge bleibt außerhalb der App.'));
}

function bilanzCard() {
  const today = logicalToday();
  const yesterday = addDays(today, -1);
  const tiles = [];
  let detail = null;
  for (const def of bilanzDefs()) {
    const end = def.skipToday ? yesterday : today;
    const cur = bilanzAvg(def, end);
    const prev = bilanzAvg(def, addDays(end, -BILANZ_WINDOW));
    const year = bilanzAvg(def, addDays(end, -365));
    const open = bilanzUi.open === def.id;
    const months = open || cur ? bilanzMonths(def, end) : [];
    tiles.push(h('button', { type: 'button', class: `bz${open ? ' on' : ''}${cur ? '' : ' empty'}`, onclick: () => { bilanzUi.open = open ? null : def.id; softRender(); } },
      h('span', { class: 'bz-label' }, def.label),
      h('b', { class: 'bz-val' }, cur ? def.fmt(cur.v, cur.v2) : '–'),
      h('small', { class: 'bz-unit' }, cur ? def.unit : 'noch keine Daten'),
      cur ? bilanzDelta(def, cur, prev, '') : null,
      months.length > 1 ? sparkline([months.slice(-12).map((x) => x.v)]) : null));
    if (open) {
      const valid = months.filter((x) => x.v != null);
      const best = valid.length ? valid.reduce((a, x) => ((x.v - a.v) * def.better > 0 ? x : a)) : null;
      detail = h('div', { class: 'bz-detail' },
        h('p', { class: 'small muted' }, def.info),
        valid.length > 1 ? [h('p', { class: 'subhead' }, `Verlauf pro Monat seit ${monthLabel(months.slice(-36)[0].month)}`), monthChart(months.slice(-36), def)] : null,
        h('div', { class: 'bz-compare' },
          h('div', {}, h('span', {}, 'Letzte 30 Tage'), h('b', {}, cur ? def.fmt(cur.v, cur.v2) : '–')),
          h('div', {}, h('span', {}, '30 Tage davor'), h('b', {}, prev ? def.fmt(prev.v, prev.v2) : '–')),
          h('div', {}, h('span', {}, 'Vor einem Jahr'), h('b', {}, year ? def.fmt(year.v, year.v2) : '–'))),
        cur && year ? h('p', { class: 'small' }, bilanzDelta(def, cur, year, 'im Vergleich zu vor einem Jahr')) : null,
        best ? h('p', { class: 'hint' }, `Bester Monat seit ${monthLabel(months[0].month)}: ${MONTHS[parseYmd(best.month).getMonth()]} ${best.month.slice(0, 4)} (${def.fmt(best.v)})`) : null);
    }
  }
  // Gespart (€): eigener Baustein, da Summe statt Durchschnitt
  const s = config.savings;
  const now = Date.now();
  const total = savedAt(now);
  const monthStart = ymd(new Date(parseYmd(today).getFullYear(), parseYmd(today).getMonth(), 1, 12));
  const thisMonth = total - savedAt(parseYmd(monthStart).setHours(0, 0, 0, 0));
  const openS = bilanzUi.open === 'saved';
  let spark = null;
  if (s && s.start) {
    const pts = [];
    const t = parseYmd(today);
    for (let i = 11; i >= 0; i--) { const e = new Date(t.getFullYear(), t.getMonth() - i + 1, 0, 23, 59); pts.push(Math.min(e.getTime(), now) >= parseYmd(s.start).getTime() ? savedAt(Math.min(e.getTime(), now)) : null); }
    spark = sparkline([pts]);
  }
  tiles.push(h('button', { type: 'button', class: `bz${openS ? ' on' : ''}${total ? '' : ' empty'}`, onclick: () => { bilanzUi.open = openS ? null : 'saved'; softRender(); } },
    h('span', { class: 'bz-label' }, 'Gespart'),
    h('b', { class: 'bz-val' }, total ? fmtEur(total) : '–'),
    h('small', { class: 'bz-unit' }, total ? 'gesamt' : 'Sparplan eintragen'),
    total ? h('span', { class: 'delta good' }, `+${fmtEur(thisMonth)} diesen Monat`) : null,
    spark));
  if (openS) detail = h('div', { class: 'bz-detail' }, savingsDetail());
  // Detail direkt unter der Zeile der angetippten Kachel
  const at = tiles.findIndex((x) => x.classList.contains('on'));
  const grid = h('div', { class: 'bz-grid' });
  tiles.forEach((tile, i) => {
    grid.append(tile);
    if (detail && i === Math.min(at | 1, tiles.length - 1)) grid.append(detail);
  });
  const hd = historyData();
  return section('s-bilanz', 'Lebensbilanz', { text: 'letzte 30 Tage' }, [
    grid,
    h('p', { class: 'hint' }, `▲▼ = Veränderung zu den 30 Tagen davor, grün = in die richtige Richtung. Tippe auf eine Kachel für den Verlauf über Jahre.${hd ? ` Health-Historie seit ${formatDateShort(hd.from)}${hd.from.slice(0, 4)}.` : ''}`),
  ]);
}

function viewWeek() {
  const kind = statsUi.kind;
  const p = periodRange(kind, statsUi.offset);
  const dates = p.dates;
  const today = logicalToday();
  const days = countedDays(dates);
  const go = (offset) => { statsUi.offset = Math.max(0, offset); render(); ensureWeekData(); };
  const setKind = (k) => { statsUi.kind = k; statsUi.offset = 0; LS.set('la.ui.period', k); render(); ensureWeekData(); };
  const prevDates = periodRange(kind, statsUi.offset + 1).dates;
  const histLen = kind === 'week' ? 8 : kind === 'month' ? 6 : 4;
  const history = Array.from({ length: histLen }, (_, i) => periodRange(kind, statsUi.offset + histLen - 1 - i).dates);
  const t = config.targets.daily;
  const periodWord = { week: 'Woche', month: 'Monat', quarter: 'Zeitraum' }[kind];

  // Level und Score
  const lvl = levelInfo();
  const weeksIn = [];
  for (let w = mondayOf(p.start); w <= p.end; w = addDays(w, 7)) weeksIn.push(weekDates(w));
  const scores = weeksIn.map(weekScore).filter(Boolean);
  const ws = scores.length ? {
    score: Math.round(avg(scores.map((x) => x.score))),
    attrs: Object.fromEntries(Object.keys(ATTRS).map((k) => { const v = scores.map((x) => x.attrs[k]).filter((x) => x != null); return [k, v.length ? Math.round(avg(v)) : null]; })),
    items: scores[scores.length - 1].items,
  } : null;
  // Verlauf: Scores der letzten 8 Wochen (bis zur angezeigten)
  const recentWeeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(p.end < today ? p.end : today), -7 * (7 - i)));
  const recent = recentWeeks.map((w) => ({ w, s: weekScore(weekDates(w)) }));
  const missing = lvl.next - lvl.prev - (lvl.xp - lvl.prev);
  const openAttr = statsUi.attrOpen;
  const levelCard = h('div', { class: 'level-card' },
    h('div', { class: 'score-head' },
      h('div', {},
        h('span', { class: 'small muted' }, kind === 'week' ? (statsUi.offset ? 'Wochen-Score' : 'Diese Woche') : `Ø Wochen-Score · ${PERIODS[kind]}`),
        h('div', { class: 'score-big' }, ws ? `${ws.score} %` : '–'),
        h('span', { class: 'small muted' }, 'So viel deiner Ziele hast du erreicht.'),
        kind === 'week' && !statsUi.offset && recent[6] && recent[6].s ? h('div', { class: 'small' }, `Letzte Woche: `, h('b', {}, `${recent[6].s.score} %`)) : null),
      h('div', { class: 'score-weeks', 'aria-label': 'Wochen-Scores der letzten 8 Wochen' }, recent.map(({ w, s }) => h('div', { class: `wk${w === mondayOf(today) ? ' now' : ''}` },
        h('i', { style: `height:${s ? Math.max(4, s.score) : 0}%` }), h('span', {}, `${isoWeek(w)}`))))),
    h('div', { class: 'attr-cards' }, Object.entries(ATTRS).map(([k, label]) => {
      const v = ws && ws.attrs[k];
      return h('button', { type: 'button', class: `attr-card${openAttr === k ? ' on' : ''}`, onclick: () => { statsUi.attrOpen = openAttr === k ? null : k; softRender(); } },
        h('span', { class: 'attr-name' }, label),
        h('b', { class: 'attr-pct' }, v != null ? `${v} %` : '–'),
        h('div', { class: 'bar thin' }, h('i', { style: `width:${v || 0}%` })),
        h('small', {}, ATTR_HINTS[k]));
    })),
    openAttr && ws && ws.items[openAttr] ? h('div', { class: 'attr-detail' },
      h('p', { class: 'small muted' }, `${ATTRS[openAttr]} setzt sich zusammen aus (schwächstes zuerst):`),
      ws.items[openAttr].length ? ws.items[openAttr].slice().sort((a, b) => a.pct - b.pct).map((it) => goalRow(it.label, it.text, it.pct / 100))
        : h('p', { class: 'hint' }, 'Dafür sind noch keine Ziele gesetzt.')) : h('p', { class: 'hint tap-hint' }, 'Tippe auf Körper, Treibstoff oder Geist, um zu sehen, was zählt.'),
    h('div', { class: 'level-row' },
      h('div', { class: 'level-badge' }, h('b', {}, lvl.level), h('span', {}, 'Level')),
      h('div', { class: 'level-info' },
        h('b', {}, levelTitle(lvl.level)),
        h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(((lvl.xp - lvl.prev) / (lvl.next - lvl.prev)) * 100)}%` })),
        h('small', {}, `Noch ${fmtNum(missing)} Punkte bis Level ${lvl.level + 1} (${levelTitle(lvl.level + 1)}) – etwa ${Math.max(1, Math.ceil(missing / 75))} gute Woche${Math.ceil(missing / 75) > 1 ? 'n' : ''}.`))),
    h('p', { class: 'hint' }, 'Jede abgeschlossene Woche bringt so viele Punkte wie ihr Score (max. 100). Pause-Tage zählen nicht, nichts geht verloren.'));

  // Soll / Ist
  const counted = countedDates(dates).length;
  const goals = trainingGoals(dates).map((g) => goalRow(g.t.name, `${fmtNum(g.ist)} / ${fmtNum(g.soll)}${g.unit}`, g.rate));
  const negRows = config.counters.filter(isActive).map((c) => {
    const max = counterMax(c);
    const ist = counterSum(c, dates);
    if (max == null) return ist ? goalRow(c.name, `${ist}×`, 0, { reached: false }) : null;
    const limit = Math.round(max * dates.length / 7);
    return goalRow(c.name, `${ist} / max. ${limit}×`, limit ? Math.min(1, ist / limit) : (ist ? 1 : 0), { reached: ist <= limit, over: ist > limit });
  }).filter(Boolean);
  const habitRows = byPrio(config.habits.filter(isActive)).map((hb) => {
    const done = countedDates(dates).filter((d) => ((getDay(d) || {}).habits || {})[hb.id] === true).length;
    return goalRow(hb.name, `${done} / ${counted} Tage`, counted ? done / counted : 0);
  });
  const fed = days.map(nutritionOf).filter((n) => n.any);
  const nutriRows = [
    t.kcal ? goalRow('Kalorien Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.kcal)))} / ${fmtNum(t.kcal)} kcal` : '–', fed.length ? Math.min(1, avg(fed.map((n) => n.kcal)) / t.kcal) : 0) : null,
    t.protein ? goalRow('Protein Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.protein)))} / ${fmtNum(t.protein)} g` : '–', fed.length ? Math.min(1, avg(fed.map((n) => n.protein)) / t.protein) : 0) : null,
    t.fat ? goalRow('Fett Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.fat)))} / ${fmtNum(t.fat)} g` : '–', fed.length ? Math.min(1, avg(fed.map((n) => n.fat)) / t.fat) : 0) : null,
    t.carbs ? (() => {
      const c = fed.length ? avg(fed.map((n) => n.carbs)) : null;
      const okDays = fed.filter((n) => n.carbs <= t.carbs).length;
      return goalRow(`Carbs Ø (max. ${fmtNum(t.carbs)} g)`, c != null ? `${fmtNum(c)} g · ${okDays}/${fed.length} Tage im Limit` : '–',
        c != null ? Math.min(1, c / t.carbs) : 0, { reached: c != null && c <= t.carbs, over: c != null && c > t.carbs });
    })() : null,
  ].filter(Boolean);
  const steps = healthAvg('steps', dates), sleep = healthAvg('sleepMin', dates);
  const healthRows = [
    t.steps ? goalRow('Schritte Ø', steps != null ? `${fmtNum(steps)} / ${fmtNum(t.steps)}` : '–', steps != null ? steps / t.steps : 0) : null,
    t.sleepH ? goalRow('Schlaf Ø', sleep != null ? `${fmtDuration(sleep)} / ${fmtDuration(t.sleepH * 60)}` : '–', sleep != null ? sleep / (t.sleepH * 60) : 0) : null,
  ].filter(Boolean);

  // Krafttraining: Überblick, Muskelgruppen (Soll/Ist, zuletzt trainiert) und Fortschritt je Übung
  const groupSets = setsByGroup(dates);
  const strengthDays = countedDates(dates).filter((d) => ((getDay(d) || {}).strength || []).length);
  const totalSets = Object.values(groupSets).reduce((a, x) => a + x, 0);
  const allDays = cachedDates('days').filter((d) => d <= today);
  /** Alle Einheiten einer Übung (neueste zuletzt) mit bestem Satz nach Kraftwert. */
  const sessionsOf = (ex) => allDays.map((d) => {
    const e = ((getDay(d) || {}).strength || []).find((x) => x.id === ex.id);
    if (!e || !e.sets.length) return null;
    let top = null;
    e.sets.forEach((w, i) => { const v = e1rm(w, (e.reps || [])[i]); if (v != null && (!top || v > top.v)) top = { v, w, r: (e.reps || [])[i] }; });
    return top ? { d, e, top } : null;   // Einheiten ohne bekanntes Gewicht überspringen
  }).filter(Boolean);
  const lastTrained = (g) => {
    for (let i = allDays.length - 1; i >= 0; i--) {
      if (((getDay(allDays[i]) || {}).strength || []).some((x) => (config.exercises.find((y) => y.id === x.id) || {}).group === g)) return allDays[i];
    }
    return null;
  };
  const daysAgo = (d) => Math.round((parseYmd(today) - parseYmd(d)) / 86400000);
  const agoText = (d) => { const n = daysAgo(d); return n === 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`; };
  const setRows = Object.entries(MUSCLE_GROUPS).map(([g, label]) => {
    const target = config.targets.weekly[`sets_${g}`];
    const ist = groupSets[g] || 0;
    const last = lastTrained(g);
    if (!target && !ist && !last) return null;
    const soll = target ? Math.round(target * dates.length / 7) : null;
    return h('div', { class: `goal${soll && ist >= soll ? ' reached' : ''}` },
      h('div', { class: 'goal-top' }, h('span', {}, label),
        h('span', {}, `${ist}${soll ? ` / ${soll}` : ''} Sätze`)),
      soll ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, Math.round(ist / soll * 100))}%` })) : null,
      h('div', { class: `goal-sub${last && daysAgo(last) > 7 ? ' late' : ''}` }, last ? `zuletzt ${agoText(last)}` : 'noch nie trainiert'));
  }).filter(Boolean);
  // Fortschritt: bester Satz der letzten Einheit gegen die beste Einheit vor ≥ 3 Wochen
  const exRows = config.exercises.map((ex) => {
    const ss = sessionsOf(ex);
    if (!ss.length) return null;
    const last = ss[ss.length - 1];
    const ref = ss.filter((x) => daysAgo(x.d) >= daysAgo(last.d) + 21).slice(-3);
    const refBest = ref.length ? ref.reduce((a, x) => (x.top.v > a.top.v ? x : a)) : null;
    const pct = refBest ? Math.round((last.top.v / refBest.top.v - 1) * 100) : null;
    return { ex, ss, last, pct, refBest };
  }).filter(Boolean).sort((a, b) => (a.last.d < b.last.d ? 1 : -1));
  const txtSet = (w, r) => `${w == null ? '?' : w === 0 ? 'KG' : `${fmtNum(w, w % 1 ? 1 : 0)} kg`}${r ? ` × ${r}` : ''}`;
  const strengthContent = setRows.length || exRows.length ? [
    h('div', { class: 'strength-sum' },
      h('div', {}, h('b', {}, strengthDays.length), h('span', {}, strengthDays.length === 1 ? 'Einheit' : 'Einheiten')),
      h('div', {}, h('b', {}, totalSets), h('span', {}, 'Sätze')),
      h('div', {}, h('b', {}, exRows.filter((x) => x.pct != null && x.pct > 0).length), h('span', {}, 'Übungen stärker'))),
    setRows.length ? [h('p', { class: 'subhead' }, 'Muskelgruppen'), setRows] : null,
    exRows.length ? [h('p', { class: 'subhead' }, 'Übungen · zuletzt trainiert zuerst'),
      h('div', { class: 'curves' }, exRows.map((x) => {
        const open = statsUi.exOpen === x.ex.id;
        const trend = x.pct == null ? h('span', { class: 'trend new' }, 'neu')
          : x.pct > 0 ? h('span', { class: 'trend up' }, `↑ ${x.pct} %`)
          : x.pct < 0 ? h('span', { class: 'trend down' }, `↓ ${Math.abs(x.pct)} %`)
          : h('span', { class: 'trend' }, '→ gleich');
        return h('button', { type: 'button', class: `ex-row${open ? ' open' : ''}`, onclick: () => { statsUi.exOpen = open ? null : x.ex.id; softRender(); } },
          h('div', { class: 'ex-top' },
            h('div', {}, h('b', {}, x.ex.name),
              h('small', {}, `Bester Satz zuletzt: ${txtSet(x.last.top.w, x.last.top.r)} · ${agoText(x.last.d)}`)),
            trend),
          open ? [
            x.ss.length > 1 ? sparkline([x.ss.slice(-12).map((y) => y.top.v)]) : null,
            x.refBest ? h('p', { class: 'hint' }, `Vergleich: ${txtSet(x.refBest.top.w, x.refBest.top.r)} am ${formatDateShort(x.refBest.d)}`) : null,
            h('div', { class: 'ex-sessions' }, x.ss.slice(-5).reverse().map((y) => h('div', {},
              h('span', {}, formatDateShort(y.d)),
              h('span', {}, y.e.sets.map((w, i) => txtSet(w, (y.e.reps || [])[i])).join(' · '))))),
          ] : null);
      })),
      h('p', { class: 'hint' }, '↑ / ↓ vergleicht deinen besten Satz der letzten Einheit mit dem vor mindestens 3 Wochen – mehr Gewicht oder mehr Wiederholungen zählen beide als „stärker“. Tippe auf eine Übung für die letzten Einheiten.')] : null,
  ] : null;

  // Was hilft mir? – mindestens 8 Wochen Daten, sonst der gewählte Zeitraum
  const analysisEnd = p.end < today ? p.end : today;
  const analysisDates = rangeDates(addDays(analysisEnd, -Math.max(55, dates.length - 1)), analysisEnd);
  const found = insights(analysisDates);

  // Schlaf & Herz
  const avgOf = (k) => healthAvg(k, dates);
  const hasSleep = dates.some((d) => (getHealth(d) || {}).sleepMin);
  const rhythm = sleepRhythm(dates);
  const sleepSum = [['Gesamt', avgOf('sleepMin')], ['Tief', avgOf('deepMin')], ['REM', avgOf('remMin')]]
    .filter(([, v]) => v != null).map(([l, v]) => `${l} Ø ${fmtDuration(v)}`).join(' · ');
  const hl = (k) => (d) => (getHealth(d) || {})[k] ?? null;
  const rhr = avgOf('restingHr'), hrv = avgOf('hrv');
  const hasHeart = rhr != null || hrv != null;

  // Gewicht & Blutdruck: mindestens 4 Wochen für einen sinnvollen Trend
  const trendDates = dates.length >= 28 ? dates.filter((d) => d <= today) : rangeDates(addDays(analysisEnd, -27), analysisEnd);
  const weightM = config.metrics.find((m) => isActive(m) && m.id === 'weight');
  const bpM = config.metrics.find((m) => isActive(m) && m.type === 'bloodpressure');
  const hasW = weightM && trendDates.some((d) => metricOn(weightM, d) != null);
  const hasBp = bpM && trendDates.some((d) => metricOn(bpM, d) != null);
  const weightNow = hasW ? avg(trendDates.slice(-7).map((d) => metricOn(weightM, d)).filter((v) => v != null)) : null;

  // Kennzahlen
  const kpis = [];
  const diffText = (cur, prev, decimals) => {
    if (cur == null || prev == null) return null;
    const diff = round(cur, decimals) - round(prev, decimals);
    return `${diff > 1e-9 ? '+' : diff < -1e-9 ? '−' : '±'}${fmtNum(Math.abs(diff), decimals)} zum Vorzeitraum`;
  };
  for (const m of config.metrics.filter(isActive)) {
    if (m.type === 'number') {
      const decimals = m.decimals ?? 1;
      const cur = metricAvg(m, dates);
      kpis.push(kpi(`${m.name} Ø`, cur != null ? `${fmtNum(cur, decimals)}${m.unit ? ` ${m.unit}` : ''}` : '–',
        diffText(cur, metricAvg(m, prevDates), decimals), sparkline([history.map((w) => metricAvg(m, w))])));
    } else if (m.type === 'bloodpressure') {
      const sys = metricAvg(m, dates, (v) => v.sys), dia = metricAvg(m, dates, (v) => v.dia);
      const pulse = metricAvg(m, dates, (v) => v.pulse);
      kpis.push(kpi(`${m.name} Ø`, sys != null ? `${fmtNum(sys)}/${fmtNum(dia)}` : '–', pulse != null ? `Puls ${fmtNum(pulse)}` : null,
        sparkline([history.map((w) => metricAvg(m, w, (v) => v.sys)), history.map((w) => metricAvg(m, w, (v) => v.dia))])));
    } else if (m.type === 'scale10') {
      const v = metricAvg(m, dates);
      kpis.push(kpi(`${m.name} Ø`, v != null ? fmtNum(v, 1) : '–', null, sparkline([history.map((w) => metricAvg(m, w))])));
    }
  }
  if (steps != null) kpis.push(kpi('Schritte Ø', fmtNum(steps), diffText(steps, healthAvg('steps', prevDates), 0), sparkline([history.map((w) => healthAvg('steps', w))])));
  if (sleep != null) kpis.push(kpi('Schlaf Ø', fmtDuration(sleep), null, sparkline([history.map((w) => healthAvg('sleepMin', w))])));
  if (rhr != null) kpis.push(kpi('Ruhepuls Ø', `${fmtNum(rhr)} bpm`, null, sparkline([history.map((w) => healthAvg('restingHr', w))])));
  if (hrv != null) kpis.push(kpi('HRV Ø', `${fmtNum(hrv)} ms`, null, sparkline([history.map((w) => healthAvg('hrv', w))])));
  kpis.push(kpi('Ernährung Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.kcal)))} kcal` : '–',
    fed.length ? `P ${fmtNum(avg(fed.map((n) => n.protein)))} · F ${fmtNum(avg(fed.map((n) => n.fat)))} · KH ${fmtNum(avg(fed.map((n) => n.carbs)))} g · ${fed.length} Tage` : null,
    sparkline([history.map((w) => { const x = countedDays(w).map(nutritionOf).filter((n) => n.any); return x.length ? avg(x.map((n) => n.carbs)) : null; })])));
  for (const c of config.counters.filter(isActive)) {
    const ist = counterSum(c, dates);
    kpis.push(kpi(c.name, `${ist}×`, counted ? `${fmtNum(ist / counted * 7, 1)}× pro Woche` : null, sparkline([history.map((w) => counterSum(c, w))])));
  }

  // Gewohnheiten-Raster (nur Woche)
  const habits = byPrio(config.habits.filter(isActive));
  const grid = kind !== 'week' ? null : h('table', { class: 'grid' },
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

  const pauseCount = dates.filter((d) => d <= today && (getDay(d) || {}).pause).length;
  const root = h('div', {},
    bilanzCard(),
    h('div', { class: 'segmented period' }, Object.entries(PERIODS).map(([k, label]) => h('button', {
      type: 'button', class: kind === k ? 'on' : '', 'aria-pressed': kind === k ? 'true' : 'false', onclick: () => setKind(k),
    }, label))),
    h('div', { class: 'weekhead' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zurück', onclick: () => go(statsUi.offset + 1) }, '‹'),
      h('button', { type: 'button', class: 'date-btn', onclick: () => go(0) },
        h('strong', {}, p.title),
        h('small', {}, `${p.sub}${statsUi.offset ? ' · Tippen für aktuell' : ''}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Weiter', disabled: statsUi.offset === 0, onclick: () => go(statsUi.offset - 1) }, '›')),
    pauseCount ? h('p', { class: 'hint' }, `${pauseCount} Pause-Tag${pauseCount > 1 ? 'e' : ''} – nicht mitgezählt.`) : null,

    levelCard,
    section('s-goals', 'Soll / Ist', null, [
      goals.length ? [h('p', { class: 'subhead first' }, `Training ${kind === 'week' ? 'pro Woche' : `im ${periodWord}`}`), goals] : null,
      healthRows.length ? [h('p', { class: 'subhead' }, 'Aktivität & Schlaf'), healthRows] : null,
      nutriRows.length ? [h('p', { class: 'subhead' }, 'Ernährung'), nutriRows] : null,
      negRows.length ? [h('p', { class: 'subhead' }, 'Negatives'), negRows] : null,
      habitRows.length ? [h('p', { class: 'subhead' }, 'Gewohnheiten'), habitRows] : null,
      !goals.length && !healthRows.length && !nutriRows.length ? h('p', { class: 'hint' }, 'Ziele legst du im Setup unter „Ziele“ fest.') : null,
    ]),
    strengthContent ? section('s-strength', 'Krafttraining', null, strengthContent) : null,
    section('s-insights', 'Was hilft mir?', null, [
      found.length ? found.map(insightRow)
        : h('p', { class: 'hint' }, 'Noch keine klaren Unterschiede. Dafür braucht es für jeden Vergleich mindestens 4 Tage mit und 4 ohne – je mehr Wochen, desto verlässlicher.'),
      h('p', { class: 'hint' }, `Grundlage: ${formatDateShort(analysisDates[0])} – ${formatDateShort(analysisEnd)} Das sind Zusammenhänge, keine Beweise.`),
    ]),
    hasSleep ? section('s-sleep', 'Schlaf', { text: avgOf('sleepMin') != null ? `Ø ${fmtDuration(avgOf('sleepMin'))}` : '' }, [
      sleepChart(dates),
      legend([['s-deep', 'Tief'], ['s-rem', 'REM'], ['s-core', 'Kern'], ['s-other', 'sonstiger Schlaf']]),
      kind === 'week' ? h('div', { class: 'nights' }, dates.filter((d) => d <= today).slice().reverse().map((d) => {
        const n = getHealth(d);
        if (!n || !n.sleepMin) return null;
        const open = statsUi.night === d;
        return h('button', { type: 'button', class: `night${open ? ' open' : ''}`, onclick: () => { statsUi.night = open ? null : d; softRender(); } },
          h('div', { class: 'night-row' },
            h('span', {}, `${WD_SHORT[parseYmd(d).getDay()]} ${formatDateShort(d)}`),
            h('b', {}, fmtDuration(n.sleepMin)),
            h('span', { class: 'small muted' }, [n.deepMin != null ? `Tief ${fmtDuration(n.deepMin)}` : null, n.remMin != null ? `REM ${fmtDuration(n.remMin)}` : null].filter(Boolean).join(' · '))),
          hypnogram(n, { compact: !open }),
          open ? nightStats(n) : null,
          open && n.bedTime ? h('p', { class: 'hint' }, `${clock(n.bedTime)} – ${clock(n.wakeTime)}${n.hrv != null ? ` · HRV ${n.hrv} ms` : ''}${n.restingHr != null ? ` · Ruhepuls ${n.restingHr}` : ''}`) : null);
      })) : null,
      sleepSum ? h('p', { class: 'hint' }, sleepSum) : null,
      rhythm ? h('div', { class: 'rhythm' },
        h('div', {}, h('span', {}, 'Einschlafen Ø'), h('b', {}, rhythm.bed), h('small', {}, `± ${rhythm.bedSd} min`)),
        h('div', {}, h('span', {}, 'Aufwachen Ø'), h('b', {}, rhythm.wake), h('small', {}, `± ${rhythm.wakeSd} min`))) : null,
      rhythm ? h('p', { class: 'hint' }, 'Je kleiner die Schwankung (±), desto regelmäßiger dein Rhythmus.') : null,
    ]) : null,
    hasHeart ? section('s-heart', 'Herz', null, [
      rhr != null ? [h('p', { class: 'subhead first' }, `Ruhepuls (bpm) · Ø ${fmtNum(rhr)}`), lineChart(series(dates, hl('restingHr')))] : null,
      hrv != null ? [h('p', { class: 'subhead' }, `HRV (ms) · Ø ${fmtNum(hrv)}`), lineChart(series(dates, hl('hrv')))] : null,
    ]) : null,
    hasW || hasBp ? section('s-trend', 'Gewicht & Blutdruck', null, [
      hasW ? [h('p', { class: 'subhead first' }, `Gewicht · 7-Tage-Schnitt ${weightNow != null ? `${fmtNum(weightNow, 1)} kg` : '–'}`),
        trendChart(trendDates, [{ fn: (d) => metricOn(weightM, d) ?? null }])] : null,
      hasBp ? [h('p', { class: 'subhead' }, 'Blutdruck · Linie = 7-Tage-Schnitt'),
        trendChart(trendDates, [{ fn: (d) => (metricOn(bpM, d) || {}).sys ?? null }, { fn: (d) => (metricOn(bpM, d) || {}).dia ?? null, cls: 'second' }])] : null,
      h('p', { class: 'hint' }, 'Punkte = einzelne Messungen, Linie = gleitender 7-Tage-Durchschnitt.'),
    ]) : null,
    section('s-kpis', kind === 'week' ? 'Wochenschnitt' : 'Durchschnitt', null, h('div', { class: 'kpis' }, kpis)),
    grid ? section('s-grid', 'Gewohnheiten-Raster', null, habits.length ? grid : h('p', { class: 'empty-note' }, 'Keine aktiven Gewohnheiten.')) : null);
  attachSwipe(root, () => go(statsUi.offset - 1), () => go(statsUi.offset + 1));
  return root;
}

// ---------- Erkenntnisse ----------
// Kurze Notizen mit Tags und optionaler Quelle. Eine Datei pro Monat: notes/JJJJ-MM.json = { month, notes: [...] }
// Gelöschte Einträge bleiben als { id, deleted: true } stehen, damit sie beim Zusammenführen nicht zurückkommen.

const DEFAULT_NOTE_TAGS = ['Philosophie', 'Ökonomie', 'Gesundheit', 'Training', 'Buch/Empfehlung', 'Idee'];
const notePath = (month) => `notes/${month}.json`;
const notesUi = { tags: [], sourceOpen: false, filter: null, query: '', editing: null };

/** Alle bekannten Monate (Repo-Index, Cache, ausstehend). */
function noteMonths() {
  const set = new Set(Object.keys(meta.nindex || {}));
  const prefix = `la.d:${repoKey()}:notes/`;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) set.add(k.slice(prefix.length, prefix.length + 7)); } catch { /* egal */ }
  for (const p of [...Object.keys(meta.pending), ...Object.keys(mem)]) { const m = /^notes\/(\d{4}-\d{2})\.json$/.exec(p); if (m && mem[p] !== null) set.add(m[1]); }
  return [...set].filter((m) => Store.get(notePath(m))).sort().reverse();
}

/** Alle Notizen, neueste zuerst, ohne gelöschte. */
function allNotes() {
  return noteMonths().flatMap((m) => (Store.get(notePath(m)).data.notes || []))
    .filter((n) => !n.deleted && n.text)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function changeNotes(month, fn) {
  const cur = Store.get(notePath(month));
  const data = clone(cur ? cur.data : { month, notes: [] });
  fn(data.notes);
  Store.change(notePath(month), data);
}

function addNote({ text, source, tags }) {
  const now = new Date();
  const month = ymd(now).slice(0, 7);
  const note = { id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: isoLocal(now), updatedAt: isoLocal(now), text, tags };
  if (source) note.source = source;
  meta.commitMsg = Object.assign(meta.commitMsg || {}, { [notePath(month)]: `notes: add ${month}` });
  changeNotes(month, (list) => list.push(note));
}

function updateNote(note, patch) {
  const month = note.createdAt.slice(0, 7);
  changeNotes(month, (list) => {
    const i = list.findIndex((n) => n.id === note.id);
    if (i !== -1) list[i] = patch.deleted ? { id: note.id, createdAt: note.createdAt, deleted: true, updatedAt: isoLocal() } : { ...list[i], ...patch, updatedAt: isoLocal() };
  });
}

/** Zusammenführen bei Konflikt: Vereinigung nach id, bei gleicher id gewinnt die jüngere Änderung. */
function mergeNotes(remote, local) {
  const byId = new Map();
  for (const n of [...((remote && remote.notes) || []), ...((local && local.notes) || [])]) {
    const prev = byId.get(n.id);
    if (!prev || (n.updatedAt || '') >= (prev.updatedAt || '')) byId.set(n.id, n);
  }
  return { month: (local && local.month) || (remote && remote.month), notes: [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) };
}

/** Alle Notiz-Monate laden, die im Repo neuer sind als der Cache. */
async function ensureNotes() {
  const files = await GH.listDir('notes');
  meta.nindex = {};
  for (const f of files) { const m = /^(\d{4}-\d{2})\.json$/.exec(f.name); if (m) meta.nindex[m[1]] = f.sha; }
  saveMeta();
  let changed = false;
  for (const [m, sha] of Object.entries(meta.nindex)) {
    const path = notePath(m);
    if (Store.isPending(path)) continue;
    const cached = Store.get(path);
    if (cached && cached.sha === sha) continue;
    const f = await GH.getFile(path);
    if (f && !Store.isPending(path)) { Store.put(path, f.data, f.sha); changed = true; }
  }
  return changed;
}

const relTime = (iso) => {
  const days = Math.round((parseYmd(logicalToday()) - parseYmd(iso.slice(0, 10))) / 86400000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 14) return `vor ${days} Tagen`;
  if (days < 60) return `vor ${Math.round(days / 7)} Wochen`;
  return `vor ${Math.round(days / 30)} Monaten`;
};

function tagChips(selected, onToggle) {
  return h('div', { class: 'tag-chips' }, config.noteTags.map((t) => h('button', {
    type: 'button', class: `tag${selected.includes(t) ? ' on' : ''}`, 'aria-pressed': selected.includes(t) ? 'true' : 'false',
    onclick: () => onToggle(t),
  }, t)));
}

const autoGrow = (el) => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 360)}px`; };

function noteEditor(note) {
  const text = h('textarea', { class: 'note-text', rows: 3, oninput: (e) => autoGrow(e.target) });
  text.value = note.text;   // Textarea-Inhalt nur über die Eigenschaft setzbar
  const source = h('input', { type: 'text', value: note.source || '', placeholder: 'Quelle (optional)' });
  let tags = [...(note.tags || [])];
  const chips = () => tagChips(tags, (t) => { tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]; box.replaceChild(chips(), box.children[2]); });
  const box = h('div', { class: 'note editing' }, text, source, chips(),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm('Erkenntnis löschen?')) { updateNote(note, { deleted: true }); notesUi.editing = null; render(); } } }, 'Löschen'),
      h('button', { type: 'button', class: 'btn', onclick: () => { notesUi.editing = null; render(); } }, 'Abbrechen'),
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: () => { if (!text.value.trim()) return; updateNote(note, { text: text.value.trim(), source: source.value.trim() || undefined, tags }); notesUi.editing = null; render(); },
      }, 'Speichern')));
  setTimeout(() => autoGrow(text), 0);
  return box;
}

function noteCard(n) {
  if (notesUi.editing === n.id) return noteEditor(n);
  const d = new Date(n.createdAt);
  return h('button', { type: 'button', class: 'note', onclick: () => { notesUi.editing = n.id; render(); } },
    h('p', { class: 'note-body' }, n.text),
    h('div', { class: 'note-meta' },
      h('span', {}, `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() : ''} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`),
      (n.tags || []).map((t) => h('span', { class: 'note-tag' }, t)),
      n.source ? h('span', { class: 'note-source' }, n.source) : null));
}

function exportNotesForClaude(list) {
  return [
    `Hier sind ${list.length} Erkenntnisse, die ich mir notiert habe (neueste zuerst).`,
    'Bitte fasse die wichtigsten Gedanken zusammen, finde wiederkehrende Themen und Verbindungen und schlage mir 3 Fragen zum Weiterdenken vor.',
    '',
    ...list.map((n) => `- ${n.createdAt.slice(0, 10)}${(n.tags || []).length ? ` [${n.tags.join(', ')}]` : ''}: ${n.text.replace(/\s*\n\s*/g, ' / ')}${n.source ? ` (Quelle: ${n.source})` : ''}`),
  ].join('\n');
}

function viewNotes() {
  const draft = LS.get('la.ui.noteDraft', { text: '', source: '' });
  const text = h('textarea', {
    class: 'note-text', rows: 3, placeholder: 'Was hast du gelernt, gehört, gelesen?',
    oninput: (e) => { autoGrow(e.target); LS.set('la.ui.noteDraft', { ...LS.get('la.ui.noteDraft', {}), text: e.target.value }); },
  });
  text.value = draft.text || '';
  const source = h('input', {
    type: 'text', placeholder: 'Quelle, z. B. Podcast, Buch, Person', value: draft.source || '',
    oninput: (e) => LS.set('la.ui.noteDraft', { ...LS.get('la.ui.noteDraft', {}), source: e.target.value }),
  });
  const save = () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return; }
    haptic();
    addNote({ text: t, source: source.value.trim() || undefined, tags: [...notesUi.tags] });
    LS.del('la.ui.noteDraft');
    notesUi.tags = [];
    notesUi.sourceOpen = false;
    if (document.activeElement) document.activeElement.blur();
    render();
  };
  setTimeout(() => autoGrow(text), 0);

  const q = notesUi.query.trim().toLowerCase();
  const all = allNotes();
  const list = all.filter((n) => (!notesUi.filter || (n.tags || []).includes(notesUi.filter))
    && (!q || `${n.text} ${n.source || ''} ${(n.tags || []).join(' ')}`.toLowerCase().includes(q)));
  const byMonth = new Map();
  for (const n of list) {
    const d = new Date(n.createdAt), key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(n);
  }
  const search = h('input', {
    type: 'search', placeholder: 'Suchen …', value: notesUi.query,
    onchange: (e) => { notesUi.query = e.target.value; render(); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });

  return h('div', {},
    h('h1', {}, 'Erkenntnisse'),
    h('div', { class: 'composer' },
      text,
      tagChips(notesUi.tags, (t) => { notesUi.tags = notesUi.tags.includes(t) ? notesUi.tags.filter((x) => x !== t) : [...notesUi.tags, t]; softRender(); }),
      notesUi.sourceOpen || draft.source ? source
        : h('button', { type: 'button', class: 'link', onclick: () => { notesUi.sourceOpen = true; softRender(); setTimeout(() => { const i = document.querySelector('.composer input'); if (i) i.focus(); }, 30); } }, '+ Quelle'),
      h('button', { type: 'button', class: 'btn primary block', onclick: save }, 'Speichern')),

    h('h2', {}, `Archiv · ${all.length}`),
    all.length ? [
      search,
      h('div', { class: 'tag-chips filter' },
        h('button', { type: 'button', class: `tag${!notesUi.filter ? ' on' : ''}`, onclick: () => { notesUi.filter = null; render(); } }, 'Alle'),
        config.noteTags.filter((t) => all.some((n) => (n.tags || []).includes(t))).map((t) => h('button', {
          type: 'button', class: `tag${notesUi.filter === t ? ' on' : ''}`, onclick: () => { notesUi.filter = notesUi.filter === t ? null : t; render(); },
        }, t))),
      [...byMonth.entries()].map(([month, notes]) => [h('p', { class: 'subhead' }, month), h('div', { class: 'notes' }, notes.map(noteCard))]),
      !list.length ? h('p', { class: 'hint' }, 'Nichts gefunden.') : null,
      list.length ? h('div', { class: 'btn-row' }, h('button', {
        type: 'button', class: 'btn block',
        onclick: async () => {
          const out = exportNotesForClaude(list);
          try { await navigator.clipboard.writeText(out); alert('Kopiert – jetzt in einen Claude-Chat einfügen.'); } catch { await shareFile(`erkenntnisse-${ymd(new Date())}.txt`, out, 'text/plain'); }
        },
      }, `${list.length === all.length ? 'Alle' : 'Diese'} ${list.length} für Claude kopieren`)) : null,
    ] : h('p', { class: 'hint' }, 'Noch keine Erkenntnisse. Schreib einfach los – ein Satz reicht.'));
}

/** Im Reiter Heute: täglich wechselnd eine ältere Erkenntnis (mindestens 7 Tage alt). */
function noteReminder(date) {
  if (config.notesResurface === false) return null;
  const old = allNotes().filter((n) => n.createdAt.slice(0, 10) <= addDays(date, -7));
  if (!old.length) return null;
  let hash = 0;
  for (const ch of date) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const n = old[hash % old.length];
  return h('button', { type: 'button', class: 'reminder', onclick: () => { notesUi.editing = null; notesUi.query = ''; setTab('notes'); } },
    h('span', { class: 'small muted' }, `Erinnerung · ${relTime(n.createdAt)}${(n.tags || []).length ? ` · ${n.tags.join(', ')}` : ''}`),
    h('p', {}, n.text));
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

/** Aktuelle Kurzbefehl-Version; ältere Versionen holen die letzte Nacht nicht vollständig. */
const SHORTCUT_VERSION = 8;
function shortcutOutdated() {
  const dates = cachedDates('health');
  const last = dates.length ? Store.get(healthPath(dates[dates.length - 1])) : null;
  return !!(last && last.data && !(looseNum(last.data.version) >= SHORTCUT_VERSION));
}
const outdatedHint = () => h('p', { class: 'warn' }, 'Auf deinem iPhone läuft noch eine ältere Version des Kurzbefehls. Die holt die letzte Nacht nicht vollständig. Bitte löschen und ',
  h('a', { href: 'shortcuts/Lebensapp-Health.shortcut' }, 'hier neu laden'), '.');

/** Was zuletzt aus Apple Health angekommen ist – zum Prüfen, ob der Kurzbefehl funktioniert. */
function healthStatusCard(date) {
  const f = Store.get(healthPath(date));
  const hl = getHealth(date);
  const row = (label, value) => h('div', { class: 'kv' }, h('span', {}, label), h('span', {}, value));
  return h('div', { class: 'card' },
    row('Letzte Health-Daten', `${formatDateLong(date)}`),
    f && f.data && f.data.invalid ? row('Status', 'Datei unlesbar') : null,
    row('Schritte', hl && hl.steps != null ? fmtNum(hl.steps) : 'fehlt'),
    hl && hl.stepSources && Object.keys(hl.stepSources).length > 1
      ? row('Quellen (roh)', Object.entries(hl.stepSources).map(([k, v]) => `${k}: ${fmtNum(v)}`).join(' · ')) : null,
    row('Gewicht', hl && hl.weight != null ? `${fmtNum(hl.weight, 1)} kg` : 'fehlt'),
    row('Schlaf', hl && hl.sleepMin != null ? fmtDuration(hl.sleepMin) : (/schlafSamples=0\b/.test((f && f.data && f.data.debug) || '') ? 'fehlt – Kurzbefehl fand keine Schlafdaten' : 'fehlt')),
    hl && (hl.deepMin != null || hl.remMin != null) ? row('davon Tief / REM', `${hl.deepMin != null ? fmtDuration(hl.deepMin) : '–'} / ${hl.remMin != null ? fmtDuration(hl.remMin) : '–'}`) : null,
    row('Blutdruck', hl && hl.bp ? `${hl.bp.sys}/${hl.bp.dia}` : 'fehlt'),
    row('Ruhepuls', hl && hl.restingHr != null ? `${hl.restingHr} bpm` : 'fehlt'),
    row('HRV', hl && hl.hrv != null ? `${hl.hrv} ms` : 'fehlt'));
}

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
  return JSON.stringify({ exportedAt: isoLocal(), repo: repoKey(), config, days, health, notes: allNotes() }, null, 2);
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
    for (const [k, v] of Object.entries(d.counters || {})) add('counter', k, v);
    for (const id of d.tags || []) add('tag', id, 1);
    for (const [k, v] of Object.entries(d.notes || {})) add('note', k, v);
    for (const [k, v] of Object.entries(d.foods || {})) add('food', k, v);
    for (const [k, v] of Object.entries(d.recipes || {})) add('recipe', k, v);
    for (const e of d.strength || []) add('strength', e.id, e.sets.map((w, i) => `${w ?? ''}x${(e.reps || [])[i] ?? ''}`).join(';'));
    const n = nutritionOf(d);
    if (n.any) { add('nutrition', 'kcal', Math.round(n.kcal)); add('nutrition', 'protein', Math.round(n.protein)); add('nutrition', 'fat', Math.round(n.fat)); add('nutrition', 'carbs', Math.round(n.carbs)); }
  }
  for (const date of cachedDates('health')) {
    const hl = getHealth(date);
    if (!hl) continue;
    const pause = (getDay(date) || {}).pause || '';
    const add = (category, key, value) => rows.push([date, 'health', category, key, value, pause]);
    if (hl.steps != null) add('metric', 'steps', hl.steps);
    if (hl.sleepMin != null) add('metric', 'sleep_min', hl.sleepMin);
    if (hl.weight != null) add('metric', 'weight', hl.weight);
    if (hl.bp) { add('metric', 'bp_sys', hl.bp.sys); add('metric', 'bp_dia', hl.bp.dia); }
    if (hl.restingHr != null) add('metric', 'resting_hr', hl.restingHr);
    if (hl.hrv != null) add('metric', 'hrv_ms', hl.hrv);
    if (hl.deepMin != null) add('metric', 'deep_min', hl.deepMin);
    if (hl.remMin != null) add('metric', 'rem_min', hl.remMin);
    for (const w of hl.workouts) {
      const id = mapWorkout(w.type);
      add('training', id && id !== 'ignore' ? id : `unmapped:${w.type}`, w.min || '');
    }
  }
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/** Kompakte Tagestabelle (eine Zeile pro Tag) mit kurzer Anleitung – zum Einfügen in einen Claude-Chat. */
function exportForClaude(weeks = 8) {
  const today = logicalToday();
  const dates = Array.from({ length: weeks * 7 }, (_, i) => addDays(today, -(weeks * 7 - 1) + i));
  const habits = config.habits.filter(isActive);
  const metrics = config.metrics.filter(isActive);
  const training = config.training.filter(isActive);
  const cols = ['date', 'pause', ...habits.map((x) => x.id)];
  for (const m of metrics) cols.push(...(m.type === 'bloodpressure' ? [`${m.id}_sys`, `${m.id}_dia`] : [m.id]));
  const counters = config.counters.filter(isActive);
  cols.push(...counters.map((c) => c.id));
  const moods = metrics.filter((m) => m.type === 'scale10');
  cols.push('tags', ...moods.map((m) => `note_${m.id}`));
  cols.push('kcal', 'protein', 'fat', 'carbs', 'foods', 'strength', ...training.map((t) => `${t.id}${t.type === 'minutes' ? '_min' : ''}`),
    'steps', 'sleep_min', 'deep_min', 'rem_min', 'resting_hr', 'hrv_ms');
  const rows = [cols.join(',')];
  for (const d of dates) {
    const day = getDay(d) || {};
    const hl = getHealth(d) || {};
    if (!getDay(d) && !getHealth(d)) continue;
    const n = nutritionOf(Object.assign(emptyDay(d), day));
    const tr = trainingFor(d);
    const r = [d, day.pause || '', ...habits.map((x) => { const v = (day.habits || {})[x.id]; return v === true ? 1 : v === false ? 0 : ''; })];
    for (const m of metrics) {
      const v = metricOn(m, d);
      if (m.type === 'bloodpressure') r.push(v ? v.sys : '', v ? v.dia : ''); else r.push(v ?? '');
    }
    r.push(...counters.map((c) => (getDay(d) ? ((day.counters || {})[c.id] || 0) : '')));
    const q = (t) => (t ? `"${String(t).replace(/"/g, "'").replace(/\s*\n\s*/g, ' / ')}"` : '');
    r.push(q((day.tags || []).map((id) => (config.dayTags.find((t) => t.id === id) || { name: id }).name).join('; ')),
      ...moods.map((m) => q((day.notes || {})[m.id])));
    const foods = [...Object.entries(day.recipes || {}).map(([id, k]) => `${(config.recipes.find((x) => x.id === id) || { name: id }).name} ${k}x`),
      ...Object.entries(day.foods || {}).map(([id, k]) => `${(config.foods.find((x) => x.id === id) || { name: id }).name} ${k}x`)].join('; ');
    r.push(n.any ? Math.round(n.kcal) : '', n.any ? Math.round(n.protein) : '', n.any ? Math.round(n.fat) : '', n.any ? Math.round(n.carbs) : '', foods ? `"${foods.replace(/"/g, '')}"` : '',
      (day.strength || []).length ? `"${day.strength.map((e) => `${(config.exercises.find((x) => x.id === e.id) || { name: e.id }).name} ${e.sets.map((w, i) => `${w ?? '?'}x${(e.reps || [])[i] ?? '?'}`).join(' ')}`).join('; ')}"` : '',
      ...training.map((t) => { const e = tr.filter((x) => x.id === t.id); return e.length ? (t.type === 'minutes' ? e.reduce((a, x) => a + (x.min || 0), 0) : e.length) : ''; }),
      hl.steps ?? '', hl.sleepMin ?? '', hl.deepMin ?? '', hl.remMin ?? '', hl.restingHr ?? '', hl.hrv ?? '');
    rows.push(r.join(','));
  }
  const legendText = [
    ...habits.map((x) => `${x.id} = ${x.name} (1 erledigt, 0 nicht gemacht, leer = nicht eingetragen)`),
    ...metrics.map((m) => `${m.id} = ${m.name}${m.type === 'scale10' ? ' (1–10)' : m.unit ? ` (${m.unit})` : ''}`),
    ...counters.map((c) => `${c.id} = ${c.name} (Anzahl pro Tag, negativ – weniger ist besser)`),
    ...training.map((t) => `${t.id} = ${t.name} (${t.type === 'minutes' ? 'Minuten' : 'Einheiten'})`),
    'steps, sleep_min, deep_min, rem_min, resting_hr, hrv_ms = aus Apple Health (Schlaf = Nacht vor dem Datum)',
    'strength = Krafttraining: Übung mit kg x Wiederholungen je Satz (z. B. Latzug 80x10 80x10 85x8 = 3 Sätze)',
    'kcal, protein, fat, carbs = Tagessumme (g); foods = gegessene Lebensmittel/Rezepte mit Anzahl Einheiten; Ziel: wenig Carbs',
    'tags = besondere Markierungen des Tages (z. B. Koffeinverzicht, Durchfall); note_<x> = freie Notiz zu Körper/Geist',
    'pause = Pause-Tag (krank, Reise …) – bei Auswertungen ausklammern',
  ];
  const goals = [
    ...trainingGoals(weekDates(mondayOf(today))).map((g) => `${g.t.name}: ${g.soll}${g.unit} pro Woche`),
    ...Object.entries(config.targets.daily).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v} pro Tag`),
  ];
  return [
    `Hier sind meine Lebensapp-Daten der letzten ${weeks} Wochen (eine Zeile pro Tag, CSV).`,
    'Bitte suche nach Mustern und Zusammenhängen (z. B. Schlaf, HRV, Training, Meditation, Befinden) und gib mir 3–5 konkrete, umsetzbare Erkenntnisse. Nenne auch, wo die Datenlage zu dünn ist.',
    '', 'Spalten:', ...legendText.map((x) => `- ${x}`),
    goals.length ? '' : null, goals.length ? 'Meine Ziele:' : null, ...goals.map((x) => `- ${x}`),
    '', '```csv', ...rows, '```',
  ].filter((x) => x != null).join('\n');
}

async function copyForClaude() {
  const text = exportForClaude();
  try {
    await navigator.clipboard.writeText(text);
    syncUi.msg = 'Kopiert – jetzt einfach in einen Claude-Chat einfügen.';
  } catch {
    await shareFile(`lebensapp-claude-${ymd(new Date())}.txt`, text, 'text/plain');
    syncUi.msg = '';
  }
  softRender();
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

    h('h3', {}, 'Export'),
    h('p', { class: 'hint' }, syncUi.loading ? 'Lade alle Tage …' : `${allDates().length} Tage, Konfiguration inklusive.`),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', disabled: syncUi.loading, onclick: () => shareFile(`lebensapp-${stamp}.json`, exportJson(), 'application/json') }, 'Alles als JSON'),
      h('button', { type: 'button', class: 'btn', disabled: syncUi.loading, onclick: () => shareFile(`lebensapp-${stamp}.csv`, exportCsv(), 'text/csv') }, 'Alles als CSV')),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn block', disabled: syncUi.loading, onclick: copyForClaude }, 'Für Claude kopieren (8 Wochen)')),

    h('h3', {}, 'Gerät'),
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
  notes: viewNotes,
  setup: viewSetup,
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
  if (tab === 'setup' && setupUi.focus) {
    const el = document.getElementById(`setup-${setupUi.focus}`);
    if (el) el.scrollIntoView();
    setupUi.focus = null;
  }
  if (tab === 'week') ensureWeekData();
  if (tab === 'notes' && conn()) ensureNotes().then((changed) => { if (changed && ui.tab === 'notes') softRender(); }).catch(() => {});
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
  if (!views[ui.tab]) ui.tab = 'today';
  try {
    view.replaceChildren(views[ui.tab]());
  } catch (e) {
    // Ein Fehler in einer Ansicht darf die App nicht lahmlegen
    console.error(e);
    view.replaceChildren(h('div', {},
      h('h1', {}, 'Ups'),
      h('p', { class: 'warn' }, 'In dieser Ansicht ist ein Fehler aufgetreten. Deine Daten sind sicher – die anderen Reiter funktionieren weiter.'),
      h('p', { class: 'hint' }, `Technisch: ${e.message}`)));
  }
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
  const p = periodRange(statsUi.kind, statsUi.offset);
  // Erst den sichtbaren Zeitraum samt Vergleichsdaten, danach alles (für das Level).
  return ensureDays(addDays(p.start, -7 * 13), addDays(p.end, 1))
    .then((changed) => { if (changed && ui.tab === 'week') softRender(); })
    .then(() => ensureDays(null, null))
    .then((changed) => { if (changed && ui.tab === 'week') softRender(); })
    .catch((e) => { Sync.handleError(e); updateDot(); });
}

let hiddenAt = 0;

function init() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $('#sync-dot').addEventListener('click', () => { if (conn() && config) { setupOpen.add('sync'); setTab('setup'); setupUi.focus = 'sync'; const el = document.getElementById('setup-sync'); if (el) el.scrollIntoView(); } });

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
  let clockKey = config ? logicalToday() : '';
  setInterval(() => {
    if (!config) return;
    const k = logicalToday();
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
  if (reset) Object.assign(todayUi, { date: null, pauseOpen: false, trainOpen: null, strengthDay: null, lastExercise: null });
  softRender();
}

init();
