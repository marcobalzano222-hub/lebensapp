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
// Ansichten
// ============================================================

const views = {
  today: () => h('div', {}, h('h1', {}, 'Heute')),
  week: () => h('div', {}, h('h1', {}, 'Woche')),
  setup: () => h('div', {}, h('h1', {}, 'Setup')),
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
}

function render() {
  const view = $('#view');
  document.body.classList.remove('no-tabs');
  for (const b of document.querySelectorAll('#tabbar button')) b.classList.toggle('active', b.dataset.tab === ui.tab);
  view.replaceChildren((views[ui.tab] || views.today)());
}

function init() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker:', e.message));
  }
}

init();
