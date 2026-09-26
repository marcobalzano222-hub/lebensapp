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
  cfg.targets.daily = Object.assign({ kcal: null, protein: null, carbs: null, steps: null, sleepH: null }, cfg.targets.daily);
  cfg.targets.weekly = Object.assign({}, cfg.targets.weekly);
  for (const k of ['habits', 'metrics', 'training', 'meals', 'pauseModes']) if (!Array.isArray(cfg[k])) cfg[k] = [];
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
  return {
    total: unionMinutes(mine.map((x) => [x.s, x.e])),
    deep: stage('deep'), rem: stage('rem'), core: stage('core'),
    source: src, sources: [...new Set(asleep.map((x) => x.src).filter(Boolean))],
  };
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

/** Aufbereitete Health-Daten eines Tages oder null. */
function getHealth(date) {
  const f = Store.get(healthPath(date));
  if (!f || !f.data || f.data.invalid) return null;
  const hit = healthCache.get(date);
  if (hit && hit.sha === f.sha && hit.raw === f.data) return hit.parsed;
  const raw = f.data;
  const sleep = healthLines(raw.sleep, ['value', 'start', 'end', 'source']);
  const sleepInfo = sleepStats(sleep, date);
  const rhr = heartValue(raw.restingHr, date), hrv = heartValue(raw.hrv, date);
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
  const stepLines = onDate(raw.steps), weightLines = onDate(raw.weight);
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
    restingHr: rhr.value,
    hrv: hrv.value,
    sources: [...new Set([...(dedup ? Object.keys(dedup.perSource) : []), ...(sleepInfo ? sleepInfo.sources : []), ...rhr.sources, ...hrv.sources].filter((x) => x && x !== '?'))],
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
    h('p', { class: 'hint' }, 'Tagesziele Aktivität & Schlaf'),
    h('div', { class: 'pair' }, dailyField('steps', 'Schritte pro Tag'),
      h('label', { class: 'field' }, h('span', {}, 'Schlaf pro Nacht (Stunden)'),
        numEl(c.targets.daily.sleepH, (v) => { c.targets.daily.sleepH = v; commitConfig('targets'); }, { placeholder: 'kein Ziel', decimal: true }))),
    h('p', { class: 'hint' }, 'Wochenziele Training'),
    h('div', { class: 'pair' }, weeklyFields),

    h('h2', {}, 'Mahlzeiten'),
    h('div', { class: 'rows' }, mealRows.length ? mealRows : h('p', { class: 'empty-note' }, 'Noch keine Mahlzeiten.')),
    addRow([newMeal], (name) => {
      c.meals.push({ id: slugId(name, c.meals), name, kcal: 0, protein: 0, carbs: 0, active: true });
      commitConfig('meals');
    }),

    h('h2', {}, 'Tageswechsel'),
    h('label', { class: 'field' }, h('span', {}, 'Einträge bis einschließlich … zählen noch zum Vortag'),
      h('input', { type: 'time', value: c.windows.evening.end, onchange: (e) => { if (e.target.value) { c.windows.evening.end = e.target.value; commitConfig('windows'); } } })),
    h('p', { class: 'hint' }, 'Standard 05:59: Wer nach Mitternacht noch etwas einträgt, landet beim richtigen Tag. „Morgen/Abend“ bei Gewohnheiten und Kennzahlen bestimmt nur die Reihenfolge.'),

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
    lastHealth ? healthStatusCard(lastHealth) : h('p', { class: 'hint' }, 'Noch keine Health-Daten empfangen.'),
    stepSources.length > 1 ? [
      h('p', { class: 'hint' }, 'Reihenfolge der Quellen – so wie in der Health-App unter „Datenquellen und Zugriff“. Wo sich Messungen überschneiden (Schritte, Schlaf, Herz), zählt die obere Quelle.'),
      h('div', { class: 'rows' }, stepSources.map((src, i) => h('div', { class: 'row' }, h('div', { class: 'row-main' },
        h('span', { style: 'flex:1' }, `${i + 1}. ${src}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => moveSource(i, -1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nach unten', disabled: i === stepSources.length - 1, onclick: () => moveSource(i, 1) }, '↓'))))),
    ] : null,
    seenTypes.length ? [h('p', { class: 'hint' }, 'Workout-Typen zuordnen (Health-Workouts ersetzen manuelle Einträge derselben Art):'),
      h('div', { class: 'rows' }, mapRows)] : null,
  );
}

// ---------- Heute ----------

const todayUi = { date: null, pauseOpen: false, trainOpen: null, foodOpen: false, ensured: null };

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
  const mHas = (m) => metricValue(m, date) != null;
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
  // Freie Einträge (nur Nährwerte, ohne gespeicherte Mahlzeit)
  for (const f of day.food || []) {
    for (const k of ['kcal', 'protein', 'carbs']) sum[k] += f[k] || 0;
    sum.any = true;
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

/** Wie oft jede Mahlzeit in den gespeicherten Tagen vorkommt – für die Reihenfolge der Schnellauswahl. */
function mealUsage() {
  const use = {};
  for (const d of cachedDates('days')) for (const e of (getDay(d) || {}).meals || []) use[e.id] = (use[e.id] || 0) + (e.count || 0);
  return use;
}

/** Eintrag aus dem Formular: mit Namen → Mahlzeit merken und zählen; ohne Namen → freier Eintrag. */
function addFood(date, { name, kcal, protein, carbs }) {
  const macros = { kcal: kcal || 0, protein: protein || 0, carbs: carbs || 0 };
  if (name) {
    let meal = config.meals.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!meal) {
      meal = { id: slugId(name, config.meals), name, ...macros, active: true };
      config.meals.push(meal);
      saveConfig('config: add meal');
    } else if (kcal != null || protein != null || carbs != null) {
      Object.assign(meal, macros, { active: true });
      saveConfig('config: update meal');
    }
    changeMeal(date, meal, 1);
  } else {
    haptic();
    updateDay(date, (d) => { d.food = [...(d.food || []), macros]; });
    softRender();
  }
}

function mealsBlock(date, day) {
  const counts = Object.fromEntries((day.meals || []).map((e) => [e.id, e.count]));
  const use = mealUsage();
  const presets = config.meals.filter(isActive).sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0)).slice(0, 12);
  const eaten = (day.meals || []).map((e) => ({ e, m: config.meals.find((x) => x.id === e.id) || { id: e.id, name: e.id } }));
  const sum = nutritionOf(day);
  const t = config.targets.daily;
  const part = (label, key, unit = '') => h('span', {},
    `${label} `, h('b', {}, fmtNum(sum[key]), unit),
    t[key] != null ? h('span', { class: 'of' }, ` / ${fmtNum(t[key])}${unit}`) : null);
  const macroText = (x) => [x.kcal ? `${fmtNum(x.kcal)} kcal` : null, x.protein ? `${fmtNum(x.protein)} g P` : null, x.carbs ? `${fmtNum(x.carbs)} g KH` : null].filter(Boolean).join(' · ') || 'ohne Nährwerte';

  // Formular
  const f = {
    name: h('input', { type: 'text', placeholder: 'Name (optional – wird gemerkt)', autocapitalize: 'sentences', enterkeyhint: 'next' }),
    kcal: h('input', { type: 'text', inputmode: 'decimal', placeholder: 'kcal' }),
    protein: h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Protein g' }),
    carbs: h('input', { type: 'text', inputmode: 'decimal', placeholder: 'KH g' }),
  };
  const submit = () => {
    const entry = { name: f.name.value.trim(), kcal: parseNum(f.kcal.value), protein: parseNum(f.protein.value), carbs: parseNum(f.carbs.value) };
    if (!entry.name && entry.kcal == null && entry.protein == null && entry.carbs == null) { f.name.focus(); return; }
    todayUi.foodOpen = false;
    if (document.activeElement) document.activeElement.blur();
    addFood(date, entry);
  };

  return h('div', { class: 'block' },
    eaten.length || (day.food || []).length ? h('div', { class: 'food-list' },
      eaten.map(({ e, m }) => h('div', { class: 'food-row' },
        h('span', { class: 'food-name' }, m.name, h('small', {}, macroText(m))),
        h('span', { class: 'count' }, `${e.count}×`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${m.name} verringern`, onclick: () => changeMeal(date, m, -1) }, '−'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${m.name} erhöhen`, onclick: () => changeMeal(date, m, 1) }, '+'))),
      (day.food || []).map((x, i) => h('div', { class: 'food-row' },
        h('span', { class: 'food-name' }, 'Eintrag', h('small', {}, macroText(x))),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'Entfernen',
          onclick: () => { updateDay(date, (d) => { d.food = (d.food || []).filter((_, j) => j !== i); if (!d.food.length) delete d.food; }); softRender(); },
        }, '×')))) : null,

    presets.length ? h('div', { class: 'chips quick' }, presets.map((m) => h('button', {
      type: 'button', class: `chip-btn${counts[m.id] ? ' on' : ''}`, onclick: () => changeMeal(date, m, 1),
    }, m.name, m.kcal ? h('small', {}, ` ${fmtNum(m.kcal)}`) : null))) : null,

    todayUi.foodOpen
      ? h('div', { class: 'food-form' }, f.name, h('div', { class: 'food-macros' }, f.kcal, f.protein, f.carbs),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { todayUi.foodOpen = false; softRender(); } }, 'Abbrechen'),
          h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Hinzufügen')))
      : h('button', { type: 'button', class: 'btn block add-food', onclick: () => { todayUi.foodOpen = true; softRender(); setTimeout(() => { const i = document.querySelector('.food-form input'); if (i) i.focus(); }, 50); } }, '+ Eintragen'),

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

/** Kurzbefehl starten, wenn die Health-Daten von gestern noch fehlen. */
function healthButton(date, today) {
  if (!config.health.shortcut || date !== today) return null;
  if (Store.get(healthPath(addDays(today, -1)))) return null;
  return h('div', { class: 'block' }, h('a', {
    class: 'btn block health-btn', href: `shortcuts://run-shortcut?name=${encodeURIComponent('Lebensapp-Health')}`,
  }, '♥ Apple-Health-Daten von gestern holen'));
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

  const go = (d) => { todayUi.date = d >= today ? null : d; todayUi.trainOpen = null; todayUi.pauseOpen = false; render(); };
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
  const trainingSum = training.length
    ? [...new Set(training.map((e) => (config.training.find((t) => t.id === e.id) || { name: e.id }).name))].join(', ')
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
      section('measures', 'Messwerte', countSum('measures'), measures.map((m) => metricBlock(m, date))),
      section('habits', 'Gewohnheiten', countSum('habits'), [
        p1Habits.length ? h('div', { class: 'tiles' }, p1Habits.map((x) => boolTile(x, date, null, false))) : null,
        habitGroups(p2Habits).map(([group, list]) => [
          group ? h('p', { class: 'subhead' }, group) : null,
          h('div', { class: 'tiles compact spaced' }, list.map((x) => boolTile(x, date, null, true))),
        ]),
      ]),
      section('food', 'Ernährung', { text: nutrition.any ? `${fmtNum(nutrition.kcal)} kcal` : '–' }, mealsBlock(date, day)),
      section('training', 'Training', { text: trainingSum }, trainingBlock(date, day)),
      section('mood', 'Befinden', countSum('mood'), moods.map((m) => metricBlock(m, date))),
      !habits.length && !metrics.length ? h('p', { class: 'empty-note' }, 'Noch nichts eingerichtet – siehe Setup.') : null,
    ));

  attachSwipe(root, () => { if (date < today) go(addDays(date, 1)); }, () => go(addDays(date, -1)));
  return root;
}

// ---------- Auswertung: Grundlagen ----------

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

// ---------- Auswertung: Level ----------

const svgEl = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

const ATTRS = { koerper: 'Körper', treibstoff: 'Treibstoff', geist: 'Geist' };

/** Welchem Attribut eine Gewohnheit zählt (Setup-Feld „attr“, sonst nach Name). */
function habitAttr(hb) {
  if (hb.attr && ATTRS[hb.attr]) return hb.attr;
  const t = `${hb.id} ${hb.name} ${hb.group || ''}`;
  if (/medit|lesen|read|handy|phone|journal|atem|breath|dankbar/i.test(t)) return 'geist';
  if (/supplement|omega|vitamin|kreatin|creatin|magnes|wasser|water|essen|food|zucker|alkohol/i.test(t)) return 'treibstoff';
  return 'koerper';
}

/** Anteil (0–1) erledigter Tage einer Gewohnheit an den gezählten Tagen. */
function habitRate(hb, dates) {
  const days = countedDates(dates);
  if (!days.length) return null;
  return days.filter((d) => ((getDay(d) || {}).habits || {})[hb.id] === true).length / days.length;
}

/** Soll/Ist aller Trainingsziele einer Woche. */
function trainingGoals(dates) {
  return config.training.filter(isActive).map((t) => {
    const target = config.targets.weekly[weeklyKey(t)];
    if (target == null) return null;
    const entries = countedDates(dates).flatMap((d) => trainingFor(d).filter((e) => e.id === t.id));
    const ist = t.type === 'minutes' ? entries.reduce((s, e) => s + (e.min || 0), 0) : entries.length;
    return { t, ist, soll: target, unit: t.type === 'minutes' ? ' min' : '×', rate: target > 0 ? Math.min(1, ist / target) : 1 };
  }).filter(Boolean);
}

/** Ernährung: Anteil der Tage mit Einträgen, an denen die Tagesziele erreicht wurden. */
function nutritionRate(dates) {
  const t = config.targets.daily;
  const days = countedDays(dates).map(nutritionOf).filter((n) => n.any);
  if (!days.length) return null;
  const checks = days.map((n) => {
    const ok = [];
    if (t.kcal) ok.push(n.kcal >= t.kcal * 0.9 && n.kcal <= t.kcal * 1.1);
    if (t.protein) ok.push(n.protein >= t.protein);
    if (t.carbs) ok.push(n.carbs <= t.carbs * 1.1);
    return ok.length ? ok.filter(Boolean).length / ok.length : 1;
  });
  return avg(checks);
}

/**
 * Wochen-Score (0–100) und Attribute. Pause-Tage zählen nicht; Prio-1-Gewohnheiten doppelt.
 * Körper = Trainingsziele + Körper-Gewohnheiten, Treibstoff = Ernährungsziele + Supplements usw.,
 * Geist = Meditation, Lesen usw.
 */
function weekScore(dates) {
  if (!countedDates(dates).length) return null;
  const parts = { koerper: [], treibstoff: [], geist: [] };   // [wert 0–1, gewicht]
  for (const g of trainingGoals(dates)) parts.koerper.push([g.rate, 2]);
  for (const hb of config.habits.filter(isActive)) {
    const r = habitRate(hb, dates);
    if (r != null) parts[habitAttr(hb)].push([r, (hb.prio || 1) === 1 ? 2 : 1]);
  }
  const n = nutritionRate(dates);
  if (n != null) parts.treibstoff.push([n, 2]);
  const attrs = {};
  for (const [k, list] of Object.entries(parts)) {
    const w = list.reduce((a, [, x]) => a + x, 0);
    attrs[k] = w ? Math.round((list.reduce((a, [v, x]) => a + v * x, 0) / w) * 100) : null;
  }
  const vals = Object.values(attrs).filter((v) => v != null);
  return { score: vals.length ? Math.round(avg(vals)) : 0, attrs };
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

// ---------- Auswertung: Diagramme ----------

/** Balken „Ist gegenüber Soll“. */
function goalRow(label, istText, rate, sub) {
  const pct = Math.max(0, Math.min(100, Math.round((rate || 0) * 100)));
  return h('div', { class: `goal${rate >= 1 ? ' reached' : ''}` },
    h('div', { class: 'goal-top' }, h('span', {}, label), h('span', {}, istText)),
    h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
    sub ? h('div', { class: 'goal-sub' }, sub) : null);
}

/** Gestapelte Schlafbalken pro Nacht (Tief, REM, Kern, sonstiger Schlaf). */
function sleepChart(dates) {
  const nights = dates.map((d) => ({ d, hl: getHealth(d) }));
  const target = config.targets.daily.sleepH ? config.targets.daily.sleepH * 60 : null;
  const max = Math.max(60 * 9, target || 0, ...nights.map((n) => (n.hl && n.hl.sleepMin) || 0));
  const W = 300, H = 130, top = 16, base = H - 18, bw = 26, gap = (W - 7 * bw) / 7;
  const y = (min) => base - (min / max) * (base - top);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Schlafphasen pro Nacht' });
  if (target) svg.append(svgEl('line', { x1: 0, x2: W, y1: y(target), y2: y(target), class: 'target' }));
  nights.forEach(({ d, hl }, i) => {
    const x = gap / 2 + i * (bw + gap);
    svg.append(svgEl('text', { x: x + bw / 2, y: H - 4, class: 'lbl' }, WD_SHORT[parseYmd(d).getDay()]));
    if (!hl || !hl.sleepMin) return;
    const deep = hl.deepMin || 0, rem = hl.remMin || 0, core = hl.coreMin || 0;
    const other = Math.max(0, hl.sleepMin - deep - rem - core);
    let acc = 0;
    for (const [v, cls] of [[deep, 's-deep'], [rem, 's-rem'], [core, 's-core'], [other, 's-other']]) {
      if (!v) continue;
      svg.append(svgEl('rect', { x, width: bw, y: y(acc + v), height: y(acc) - y(acc + v), class: cls, rx: 2 }));
      acc += v;
    }
    svg.append(svgEl('text', { x: x + bw / 2, y: y(acc) - 4, class: 'val' }, `${Math.floor(hl.sleepMin / 60)}:${pad2(Math.round(hl.sleepMin % 60))}`));
  });
  return svg;
}

/** Punkte-Linie über 7 Tage (z. B. Ruhepuls, HRV) mit Werten. */
function dayLine(dates, values) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  const W = 300, H = 80, top = 16, base = H - 18;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const step = W / 7, cx = (i) => step / 2 + i * step;
  dates.forEach((d, i) => svg.append(svgEl('text', { x: cx(i), y: H - 4, class: 'lbl' }, WD_SHORT[parseYmd(d).getDay()])));
  if (!pts.length) return svg;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v)), span = max - min || 1;
  const y = (v) => base - 6 - ((v - min) / span) * (base - top - 12);
  if (pts.length > 1) svg.append(svgEl('path', { d: pts.map((p, k) => `${k ? 'L' : 'M'}${cx(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '), class: 'line' }));
  for (const p of pts) {
    svg.append(svgEl('circle', { cx: cx(p.i), cy: y(p.v), r: 3, class: 'dot' }));
    svg.append(svgEl('text', { x: cx(p.i), y: y(p.v) - 7, class: 'val' }, p.v));
  }
  return svg;
}

const legend = (items) => h('div', { class: 'legend' }, items.map(([cls, label]) => h('span', {}, h('i', { class: cls }), label)));

// ---------- Auswertung ----------

const weekUi = { offset: 0 };

function viewWeek() {
  const start = weekStartFor(weekUi.offset);
  const dates = weekDates(start);
  const today = logicalToday();
  const days = countedDays(dates);
  const go = (offset) => { weekUi.offset = Math.max(0, offset); render(); ensureWeekData(); };
  const weeks8 = Array.from({ length: 8 }, (_, i) => weekDates(addDays(start, -7 * (7 - i))));
  const t = config.targets.daily;

  // Level und Wochen-Score
  const lvl = levelInfo();
  const ws = weekScore(dates);
  const levelCard = h('div', { class: 'level-card' },
    h('div', { class: 'level-top' },
      h('div', {}, h('div', { class: 'level-num' }, `Level ${lvl.level}`),
        h('div', { class: 'small muted' }, `${fmtNum(lvl.xp - lvl.prev)} / ${fmtNum(lvl.next - lvl.prev)} Punkte bis Level ${lvl.level + 1}`)),
      h('div', { class: 'level-score' }, h('b', {}, ws ? `${ws.score} %` : '–'), h('span', {}, weekUi.offset ? 'Wochen-Score' : 'diese Woche'))),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(((lvl.xp - lvl.prev) / (lvl.next - lvl.prev)) * 100)}%` })),
    h('div', { class: 'attrs' }, Object.entries(ATTRS).map(([k, label]) => {
      const v = ws && ws.attrs[k];
      return h('div', { class: 'attr' },
        h('div', { class: 'goal-top' }, h('span', {}, label), h('span', {}, v != null ? `${v} %` : '–')),
        h('div', { class: 'bar thin' }, h('i', { style: `width:${v || 0}%` })));
    })),
    h('p', { class: 'hint' }, 'Jede abgeschlossene Woche bringt ihren Score als Punkte. Pause-Tage zählen nicht.'));

  // Soll / Ist
  const goals = trainingGoals(dates).map((g) => goalRow(g.t.name, `${fmtNum(g.ist)} / ${fmtNum(g.soll)}${g.unit}`, g.rate));
  const counted = countedDates(dates).length;
  const habitRows = byPrio(config.habits.filter(isActive)).map((hb) => {
    const done = countedDates(dates).filter((d) => ((getDay(d) || {}).habits || {})[hb.id] === true).length;
    return goalRow(hb.name, `${done} / ${counted} Tage`, counted ? done / counted : 0);
  });
  const fed = days.map(nutritionOf).filter((n) => n.any);
  const nutriRows = [
    t.kcal ? goalRow('Kalorien Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.kcal)))} / ${fmtNum(t.kcal)} kcal` : '–', fed.length ? Math.min(1, avg(fed.map((n) => n.kcal)) / t.kcal) : 0) : null,
    t.protein ? goalRow('Protein Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.protein)))} / ${fmtNum(t.protein)} g` : '–', fed.length ? Math.min(1, avg(fed.map((n) => n.protein)) / t.protein) : 0) : null,
  ].filter(Boolean);
  const steps = healthAvg('steps', dates), sleep = healthAvg('sleepMin', dates);
  const healthRows = [
    t.steps ? goalRow('Schritte Ø', steps != null ? `${fmtNum(steps)} / ${fmtNum(t.steps)}` : '–', steps != null ? steps / t.steps : 0) : null,
    t.sleepH ? goalRow('Schlaf Ø', sleep != null ? `${fmtDuration(sleep)} / ${fmtDuration(t.sleepH * 60)}` : '–', sleep != null ? sleep / (t.sleepH * 60) : 0) : null,
  ].filter(Boolean);

  // Schlaf & Herz
  const hasSleep = dates.some((d) => (getHealth(d) || {}).sleepMin);
  const avgOf = (k) => healthAvg(k, dates);
  const sleepSum = [
    ['Gesamt', avgOf('sleepMin')], ['Tief', avgOf('deepMin')], ['REM', avgOf('remMin')],
  ].filter(([, v]) => v != null).map(([l, v]) => `${l} Ø ${fmtDuration(v)}`).join(' · ');
  const rhrVals = dates.map((d) => (getHealth(d) || {}).restingHr ?? null);
  const hrvVals = dates.map((d) => (getHealth(d) || {}).hrv ?? null);
  const hasHeart = rhrVals.some((v) => v != null) || hrvVals.some((v) => v != null);

  // Kennzahlen
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
      kpis.push(kpi(`${m.name} Ø`, v != null ? fmtNum(v, 1) : '–', null, sparkline([weeks8.map((w) => metricAvg(m, w))])));
    }
  }
  if (steps != null) kpis.push(kpi('Schritte Ø', fmtNum(steps), null, sparkline([weeks8.map((w) => healthAvg('steps', w))])));
  if (sleep != null) kpis.push(kpi('Schlaf Ø', fmtDuration(sleep), null, sparkline([weeks8.map((w) => healthAvg('sleepMin', w))])));
  const rhr = avgOf('restingHr'), hrv = avgOf('hrv');
  if (rhr != null) kpis.push(kpi('Ruhepuls Ø', `${fmtNum(rhr)} bpm`, null, sparkline([weeks8.map((w) => healthAvg('restingHr', w))])));
  if (hrv != null) kpis.push(kpi('HRV Ø', `${fmtNum(hrv)} ms`, null, sparkline([weeks8.map((w) => healthAvg('hrv', w))])));
  kpis.push(kpi('Ernährung Ø', fed.length ? `${fmtNum(avg(fed.map((n) => n.kcal)))} kcal` : '–',
    fed.length ? `${fmtNum(avg(fed.map((n) => n.protein)))} g Protein · ${fed.length} Tage` : null));

  // Gewohnheiten-Raster
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

    levelCard,
    section('s-goals', 'Soll / Ist', null, [
      goals.length ? [h('p', { class: 'subhead first' }, 'Training pro Woche'), goals] : null,
      healthRows.length ? [h('p', { class: 'subhead' }, 'Aktivität & Schlaf'), healthRows] : null,
      nutriRows.length ? [h('p', { class: 'subhead' }, 'Ernährung'), nutriRows] : null,
      habitRows.length ? [h('p', { class: 'subhead' }, 'Gewohnheiten'), habitRows] : null,
      !goals.length && !healthRows.length && !nutriRows.length ? h('p', { class: 'hint' }, 'Ziele legst du im Setup unter „Ziele“ fest.') : null,
    ]),
    hasSleep ? section('s-sleep', 'Schlaf', { text: avgOf('sleepMin') != null ? `Ø ${fmtDuration(avgOf('sleepMin'))}` : '' }, [
      sleepChart(dates),
      legend([['s-deep', 'Tief'], ['s-rem', 'REM'], ['s-core', 'Kern'], ['s-other', 'sonstiger Schlaf']]),
      sleepSum ? h('p', { class: 'hint' }, sleepSum) : null,
    ]) : null,
    hasHeart ? section('s-heart', 'Herz', null, [
      rhrVals.some((v) => v != null) ? [h('p', { class: 'subhead first' }, `Ruhepuls (bpm)${rhr != null ? ` · Ø ${fmtNum(rhr)}` : ''}`), dayLine(dates, rhrVals)] : null,
      hrvVals.some((v) => v != null) ? [h('p', { class: 'subhead' }, `HRV (ms)${hrv != null ? ` · Ø ${fmtNum(hrv)}` : ''}`), dayLine(dates, hrvVals)] : null,
    ]) : null,
    section('s-kpis', 'Wochenschnitt', null, h('div', { class: 'kpis' }, kpis)),
    section('s-grid', 'Gewohnheiten-Raster', null, habits.length ? grid : h('p', { class: 'empty-note' }, 'Keine aktiven Gewohnheiten.')));
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
    row('Schlaf', hl && hl.sleepMin != null ? fmtDuration(hl.sleepMin) : 'fehlt'),
    hl && (hl.deepMin != null || hl.remMin != null) ? row('davon Tief / REM', `${hl.deepMin != null ? fmtDuration(hl.deepMin) : '–'} / ${hl.remMin != null ? fmtDuration(hl.remMin) : '–'}`) : null,
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

/** Kompakte Tagestabelle (eine Zeile pro Tag) mit kurzer Anleitung – zum Einfügen in einen Claude-Chat. */
function exportForClaude(weeks = 8) {
  const today = logicalToday();
  const dates = Array.from({ length: weeks * 7 }, (_, i) => addDays(today, -(weeks * 7 - 1) + i));
  const habits = config.habits.filter(isActive);
  const metrics = config.metrics.filter(isActive);
  const training = config.training.filter(isActive);
  const cols = ['date', 'pause', ...habits.map((x) => x.id)];
  for (const m of metrics) cols.push(...(m.type === 'bloodpressure' ? [`${m.id}_sys`, `${m.id}_dia`] : [m.id]));
  cols.push('kcal', 'protein', ...training.map((t) => `${t.id}${t.type === 'minutes' ? '_min' : ''}`),
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
    r.push(n.any ? Math.round(n.kcal) : '', n.any ? Math.round(n.protein) : '',
      ...training.map((t) => { const e = tr.filter((x) => x.id === t.id); return e.length ? (t.type === 'minutes' ? e.reduce((a, x) => a + (x.min || 0), 0) : e.length) : ''; }),
      hl.steps ?? '', hl.sleepMin ?? '', hl.deepMin ?? '', hl.remMin ?? '', hl.restingHr ?? '', hl.hrv ?? '');
    rows.push(r.join(','));
  }
  const legendText = [
    ...habits.map((x) => `${x.id} = ${x.name} (1 erledigt, 0 nicht gemacht, leer = nicht eingetragen)`),
    ...metrics.map((m) => `${m.id} = ${m.name}${m.type === 'scale10' ? ' (1–10)' : m.unit ? ` (${m.unit})` : ''}`),
    ...training.map((t) => `${t.id} = ${t.name} (${t.type === 'minutes' ? 'Minuten' : 'Einheiten'})`),
    'steps, sleep_min, deep_min, rem_min, resting_hr, hrv_ms = aus Apple Health (Schlaf = Nacht vor dem Datum)',
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
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn block', disabled: syncUi.loading, onclick: copyForClaude }, 'Für Claude kopieren (8 Wochen)')),

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
  // Erst die sichtbaren 8 Wochen, danach alles (für das Level).
  return ensureDays(addDays(start, -7 * 8), addDays(start, 6))
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
  if (reset) Object.assign(todayUi, { date: null, pauseOpen: false, trainOpen: null });
  softRender();
}

init();
