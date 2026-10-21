// Written in ES5 with XMLHttpRequest so it runs on the older webOS TV browser.
//
// Security notes:
// - The page has no accounts, cookies or analytics. The only thing it stores is the viewer's
//   settings (city, calendar, theme) in this browser's localStorage.
// - It only talks to two public APIs (prayer times and weather), sending a city's coordinates.
//   index.html's Content-Security-Policy blocks every other script, style, font and request.
// - Nothing received from the APIs or from storage is inserted as HTML: values are validated
//   as numbers/dates first, and text is set with textContent.
'use strict';

// Refuse to run inside another site's frame.
if (window.top !== window.self) { document.documentElement.style.display = 'none'; throw new Error('framed'); }

// [id, Arabic name, latitude, longitude, default school calendar]
var CITIES = [
  ['riyadh', 'الرياض', 24.7136, 46.6753, 'rest'], ['jeddah', 'جدة', 21.5433, 39.1728, 'west'],
  ['makkah', 'مكة المكرمة', 21.3891, 39.8579, 'west'], ['madinah', 'المدينة المنورة', 24.5247, 39.5692, 'west'],
  // South
  ['baha', 'الباحة', 20.0129, 41.4677, 'rest'], ['abha', 'أبها', 18.2164, 42.5053, 'rest'],
  ['khamis', 'خميس مشيط', 18.3000, 42.7333, 'rest'], ['bisha', 'بيشة', 19.9883, 42.6052, 'rest'],
  ['jazan', 'جازان', 16.8892, 42.5511, 'rest'], ['najran', 'نجران', 17.4924, 44.1277, 'rest'],
  ['sharurah', 'شرورة', 17.4700, 47.1100, 'rest'],
  ['taif', 'الطائف', 21.2703, 40.4158, 'west'], ['dammam', 'الدمام', 26.4207, 50.0888, 'rest'],
  ['khobar', 'الخبر', 26.2172, 50.1971, 'rest'], ['dhahran', 'الظهران', 26.2886, 50.1140, 'rest'],
  ['ahsa', 'الأحساء', 25.3833, 49.5833, 'rest'], ['qatif', 'القطيف', 26.5196, 50.0115, 'rest'],
  ['jubail', 'الجبيل', 27.0174, 49.6225, 'rest'], ['hafar', 'حفر الباطن', 28.4328, 45.9708, 'rest'],
  ['kharj', 'الخرج', 24.1556, 47.3120, 'rest'], ['majmaah', 'المجمعة', 25.9039, 45.3456, 'rest'],
  ['dawadmi', 'الدوادمي', 24.5077, 44.3924, 'rest'], ['dawasir', 'وادي الدواسر', 20.4607, 44.7866, 'rest'],
  ['buraydah', 'بريدة', 26.3260, 43.9750, 'rest'], ['unaizah', 'عنيزة', 26.0840, 43.9940, 'rest'],
  ['rass', 'الرس', 25.8694, 43.4973, 'rest'], ['hail', 'حائل', 27.5114, 41.7208, 'rest'],
  ['tabuk', 'تبوك', 28.3835, 36.5662, 'rest'], ['ula', 'العلا', 26.6085, 37.9232, 'rest'],
  ['yanbu', 'ينبع', 24.0895, 38.0618, 'rest'], ['rabigh', 'رابغ', 22.7986, 39.0349, 'rest'],
  ['qunfudhah', 'القنفذة', 19.1264, 41.0789, 'rest'], ['wajh', 'الوجه', 26.2333, 36.4667, 'rest'],
  ['duba', 'ضباء', 27.3500, 35.6900, 'rest'], ['arar', 'عرعر', 30.9753, 41.0381, 'rest'],
  ['sakaka', 'سكاكا', 29.9697, 40.2064, 'rest'], ['qurayyat', 'القريات', 31.3317, 37.3428, 'rest']
];
// Saudi Pro League clubs offered in the "favourite club" list: [TheSportsDB team id, Arabic name].
var CLUBS = [
  ['136022', 'النصر'], ['137721', 'الأهلي'], ['136018', 'الاتحاد'], ['136015', 'القادسية'],
  ['136017', 'الاتفاق'], ['136020', 'الشباب'], ['136012', 'التعاون'], ['136011', 'الفتح'],
  ['139080', 'الخليج'], ['136014', 'الفيحاء'], ['147445', 'الرياض'], ['149112', 'الخلود'],
  ['136200', 'الحزم'], ['150637', 'نيوم'], ['137855', 'أبها'], ['136021', 'الفيصلي'],
  ['152917', 'الدرعية']
];
// Arabic names for opponents that are not in the list above.
var OTHER_TEAMS_AR = { '136013': 'الهلال' };
function clubById(id) {
  for (var i = 0; i < CLUBS.length; i++) if (CLUBS[i][0] === id) return CLUBS[i];
  return null;
}
var COMPETITIONS_AR = {
  'Saudi-Arabian Pro League': 'دوري روشن السعودي',
  'Saudi King Cup': 'كأس خادم الحرمين الشريفين',
  'Saudi Super Cup': 'كأس السوبر السعودي',
  'AFC Champions League Elite': 'دوري أبطال آسيا للنخبة',
  'AFC Champions League Two': 'دوري أبطال آسيا 2'
};
function cityById(id) {
  for (var i = 0; i < CITIES.length; i++) if (CITIES[i][0] === id) return CITIES[i];
  return null;
}
var TZ_OFFSET_MIN = 180; // Saudi Arabia, UTC+3, no daylight saving

/* ---------- Settings (saved on this TV) ---------- */
// cal stays null until chosen by hand, so it follows the city's region.
var settings = { city: 'jeddah', cal: null, theme: 'auto', scene: 'trees', alerts: 'full', club: '', saved: false };
var ALLOWED = { cal: { rest: 1, west: 1 }, theme: { auto: 1, day: 1, night: 1, dim: 1 }, scene: { trees: 1, city: 1 }, alerts: { full: 1, iqama: 1, off: 1 } };
function allowed(name, val) { return typeof val === 'string' && ALLOWED[name].hasOwnProperty(val); }

// Only known values are taken from storage or the link; anything else is ignored.
try {
  var saved = JSON.parse(localStorage.getItem('tvDashSettings') || '{}');
  if (saved && typeof saved === 'object') {
    if (typeof saved.city === 'string' && cityById(saved.city)) settings.city = saved.city;
    if (allowed('cal', saved.cal)) settings.cal = saved.cal;
    if (allowed('theme', saved.theme)) settings.theme = saved.theme;
    if (allowed('scene', saved.scene)) settings.scene = saved.scene;
    if (allowed('alerts', saved.alerts)) settings.alerts = saved.alerts;
    if (typeof saved.club === 'string' && clubById(saved.club)) settings.club = saved.club;
    settings.saved = saved.saved === true;
  }
} catch (e) {}
(function () {
  var m = /^\?city=([a-z]{2,12})$/.exec(location.search);
  if (m && cityById(m[1]) && !settings.saved) settings.city = m[1];
})();
function city() { var c = cityById(settings.city); return { id: c[0], ar: c[1], lat: c[2], lon: c[3], region: c[4] }; }
function calKey() { return settings.cal || city().region; }
function saveSettings() {
  settings.saved = true;
  try {
    localStorage.setItem('tvDashSettings', JSON.stringify({ city: settings.city, cal: settings.cal, theme: settings.theme, scene: settings.scene, alerts: settings.alerts, club: settings.club, saved: true }));
  } catch (e) {}
}
var RAMADAN_FALLBACK = { year: 1448, date: '2027-02-08' };

var PRAYERS = [
  { key: 'Fajr', ar: 'الفجر', icon: 'dawn' },
  { key: 'Sunrise', ar: 'الشروق', icon: 'sunrise' },
  { key: 'Dhuhr', ar: 'الظهر', icon: 'noon' },
  { key: 'Asr', ar: 'العصر', icon: 'afternoon' },
  { key: 'Maghrib', ar: 'المغرب', icon: 'sunset' },
  { key: 'Isha', ar: 'العشاء', icon: 'night' }
];
var DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
var HIJRI_MONTHS_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
var MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

var timings = null, timingsDay = null, hijri = null, ramadanStart = null;

function $(id) { return document.getElementById(id); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function setText(id, s) { $(id).textContent = s; }
// "32" followed by a smaller unit word, built as DOM nodes (no HTML parsing).
function setNum(id, num, unit) {
  var el = $(id), small = document.createElement('small');
  el.textContent = num === '' ? '' : String(num);
  if (unit) { small.textContent = unit; el.appendChild(small); }
}
// A finite number rounded for display, or '--' for anything else.
function num(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x) : '--'; }
// A whole number (or digit string) within [lo, hi], else null.
function intIn(x, lo, hi) {
  if (!(typeof x === 'number' || (typeof x === 'string' && /^\d{1,4}$/.test(x)))) return null;
  var n = Number(x);
  return n % 1 === 0 && n >= lo && n <= hi ? n : null;
}
// "HH:MM" (optionally followed by a zone like "(+03)") to minutes after midnight.
function parseHM(s) {
  var m = /^(\d{1,2}):(\d{2})(\s|$)/.exec(String(s));
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

// Current time in Saudi Arabia, independent of the TV's own time-zone setting.
function nowKsa() {
  var d = new Date();
  return new Date(d.getTime() + (d.getTimezoneOffset() + TZ_OFFSET_MIN) * 60000);
}
// Whole days from today (KSA) to a 'YYYY-MM-DD' date.
function daysUntil(iso) {
  var n = nowKsa(), p = iso.split('-');
  var today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  var target = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  return Math.round((target - today) / 86400000);
}
function fmtDate(iso) {
  var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  return DAYS_AR[d.getDay()] + ' ' + (+p[2]) + ' ' + MONTHS_AR[+p[1] - 1];
}
function dayWord(n) {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return 'أيام';
  return 'يوم';
}
function to12h(mins) {
  var h = Math.floor(mins / 60), m = mins % 60, h12 = h % 12 || 12;
  return '<span dir="ltr">' + h12 + ':' + pad(m) + '</span> ' + (h < 12 ? 'ص' : 'م');
}

function getJSON(url, ok, fail) {
  var x = new XMLHttpRequest();
  x.open('GET', url, true);
  x.timeout = 15000;
  x.onreadystatechange = function () {
    if (x.readyState !== 4) return;
    if (x.status === 200 && x.responseText.length < 200000) { try { ok(JSON.parse(x.responseText)); } catch (e) { fail && fail(e); } }
    else { fail && fail(x.status); }
  };
  x.ontimeout = function () { fail && fail('timeout'); };
  x.send();
}
function setStatus(msg) { setText('status', msg); }

/* ---------- Icons ---------- */
function prayerIcon(kind) {
  var sun = function (c) { return '<circle cx="32" cy="32" r="11" fill="' + c + '"/>'; };
  var rays = function (c) {
    return '<g stroke="' + c + '" stroke-width="4" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="13"/>' +
      '<line x1="32" y1="51" x2="32" y2="58"/><line x1="6" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="58" y2="32"/>' +
      '<line x1="14" y1="14" x2="19" y2="19"/><line x1="45" y1="45" x2="50" y2="50"/><line x1="14" y1="50" x2="19" y2="45"/><line x1="45" y1="19" x2="50" y2="14"/></g>';
  };
  var horizon = '<rect x="4" y="42" width="56" height="5" rx="2.5" fill="#7fd3ff"/>';
  var b = '';
  if (kind === 'dawn') b = '<path d="M14 42a18 18 0 0 1 36 0z" fill="#ff9fd0"/>' + horizon + '<circle cx="48" cy="14" r="2.5" fill="#fff"/>';
  else if (kind === 'sunrise') b = '<path d="M14 42a18 18 0 0 1 36 0z" fill="#ffb347"/>' + horizon +
    '<g stroke="#ffb347" stroke-width="4" stroke-linecap="round"><line x1="32" y1="8" x2="32" y2="16"/><line x1="12" y1="20" x2="17" y2="25"/><line x1="52" y1="20" x2="47" y2="25"/></g>';
  else if (kind === 'noon') b = sun('#ffd84d') + rays('#ffd84d');
  else if (kind === 'afternoon') b = sun('#ffad33') + rays('#ffad33') + '<path d="M28 54h26a9 9 0 0 0 0-18 12 12 0 0 0-23-2A10 10 0 0 0 28 54z" fill="#e6f2ff"/>';
  else if (kind === 'sunset') b = '<path d="M14 42a18 18 0 0 1 36 0z" fill="#ff6b5a"/>' + horizon + '<rect x="12" y="50" width="40" height="4" rx="2" fill="#7fd3ff" opacity=".6"/>';
  else b = '<path d="M38 10a20 20 0 1 0 16 32A17 17 0 1 1 38 10z" fill="#ffe08a"/><circle cx="14" cy="16" r="2.5" fill="#fff"/><circle cx="52" cy="12" r="2" fill="#fff"/>';
  return '<svg class="ic" viewBox="0 0 64 64">' + b + '</svg>';
}

function wxInfo(code) {
  if (code === 0) return { ar: 'صحو', icon: 'sun' };
  if (code <= 2) return { ar: 'غائم جزئيًا', icon: 'partly' };
  if (code === 3) return { ar: 'غائم', icon: 'cloud' };
  if (code === 45 || code === 48) return { ar: 'ضباب', icon: 'fog' };
  if (code >= 51 && code <= 67) return { ar: 'مطر', icon: 'rain' };
  if (code >= 71 && code <= 77) return { ar: 'ثلج', icon: 'rain' };
  if (code >= 80 && code <= 82) return { ar: 'زخات مطر', icon: 'rain' };
  if (code >= 95) return { ar: 'عواصف رعدية', icon: 'storm' };
  return { ar: '', icon: 'cloud' };
}
function wxIcon(name, cls) {
  var sun = '<circle cx="32" cy="32" r="12" fill="#ffd84d"/><g stroke="#ffd84d" stroke-width="4" stroke-linecap="round">' +
    '<line x1="32" y1="4" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="60"/><line x1="4" y1="32" x2="12" y2="32"/>' +
    '<line x1="52" y1="32" x2="60" y2="32"/><line x1="12" y1="12" x2="18" y2="18"/><line x1="46" y1="46" x2="52" y2="52"/>' +
    '<line x1="12" y1="52" x2="18" y2="46"/><line x1="46" y1="18" x2="52" y2="12"/></g>';
  var cloud = function (f) { return '<path d="M18 50h30a11 11 0 0 0 0-22 15 15 0 0 0-29-3A12 12 0 0 0 18 50z" fill="' + f + '"/>'; };
  var b = '';
  if (name === 'sun') b = sun;
  else if (name === 'partly') b = '<g transform="translate(-8,-8) scale(0.8)">' + sun + '</g>' + cloud('#f2f7ff');
  else if (name === 'cloud') b = cloud('#e1eaf7');
  else if (name === 'fog') b = cloud('#c4cfe3') + '<g stroke="#c4cfe3" stroke-width="3" stroke-linecap="round"><line x1="12" y1="56" x2="52" y2="56"/><line x1="18" y1="61" x2="46" y2="61"/></g>';
  else if (name === 'rain') b = '<g transform="translate(0,-6)">' + cloud('#e1eaf7') + '</g><g stroke="#5fc0ff" stroke-width="3" stroke-linecap="round"><line x1="22" y1="50" x2="19" y2="58"/><line x1="32" y1="50" x2="29" y2="58"/><line x1="42" y1="50" x2="39" y2="58"/></g>';
  else if (name === 'storm') b = '<g transform="translate(0,-6)">' + cloud('#b9c3d8') + '</g><path d="M34 44l-8 10h6l-4 9 10-12h-6l4-7z" fill="#ffd84d"/>';
  return '<svg class="' + (cls || '') + '" viewBox="0 0 64 64">' + b + '</svg>';
}

/* ---------- Prayer times ---------- */
// Minutes from adhan to iqama, as commonly used in Saudi mosques.
var IQAMA_MIN = { Fajr: 25, Dhuhr: 20, Asr: 20, Maghrib: 10, Isha: 20 };
var JUMUAH_MIN = 30;  // how long the Friday "it's time" state stays up
function isFriday() { return nowKsa().getDay() === 5; }
function prayerName(p) { return p.key === 'Dhuhr' && isFriday() ? 'الجمعة' : p.ar; }

// Validate one day's timings and Hijri date; returns { t, h } or null.
function parseDay(t, h) {
  if (!t || !h) return null;
  var parsed = {};
  for (var i = 0; i < PRAYERS.length; i++) {
    var raw = t[PRAYERS[i].key];
    var v = typeof raw === 'number' ? intIn(raw, 0, 1439) : parseHM(raw);
    if (v === null) return null;
    parsed[PRAYERS[i].key] = v;
  }
  var hm = h.month && typeof h.month === 'object' ? h.month.number : h.month;
  var hd = intIn(h.day, 1, 30), hmo = intIn(hm, 1, 12), hy = intIn(h.year, 1400, 1700);
  if (hd === null || hmo === null || hy === null) return null;
  return { t: parsed, h: { day: hd, month: hmo, year: hy } };
}

// A month of prayer times is kept in this browser, so the page keeps working without internet.
var PRAYER_CACHE_KEY = 'tvDashPrayers';
function readPrayerDay(cityId, y, m, d) {
  try {
    var c = JSON.parse(localStorage.getItem(PRAYER_CACHE_KEY) || 'null');
    if (!c || c.city !== cityId || c.y !== y || c.m !== m || !c.days || typeof c.days !== 'object') return null;
    var e = c.days[d];
    return e ? parseDay(e.t, e.h) : null;
  } catch (e2) { return null; }
}
function savePrayerMonth(cityId, y, m, days) {
  try { localStorage.setItem(PRAYER_CACHE_KEY, JSON.stringify({ city: cityId, y: y, m: m, days: days })); } catch (e) {}
}

function applyDay(d, day) {
  timings = d.t;
  hijri = d.h;
  timingsDay = day;
  setText('hijri', hijri.day + ' ' + HIJRI_MONTHS_AR[hijri.month - 1] + ' ' + hijri.year + ' هـ');
  renderPrayers();
  loadRamadan();
  setStatus('');
}

function loadPrayers() {
  var n = nowKsa(), c = city(), y = n.getFullYear(), m = n.getMonth() + 1, day = n.getDate();
  var cached = readPrayerDay(c.id, y, m, day);
  if (cached) { applyDay(cached, day); return; }
  getJSON('https://api.aladhan.com/v1/calendar/' + y + '/' + m + '?latitude=' + c.lat + '&longitude=' + c.lon + '&method=4',
    function (res) {
      // Validate everything before using it; a bad or tampered response is treated as a failure.
      if (!res || !(res.data instanceof Array)) throw new Error('bad prayer data');
      var days = {};
      for (var i = 0; i < res.data.length && i < 31; i++) {
        var item = res.data[i] || {}, date = item.date || {};
        var g = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date.gregorian && date.gregorian.date);
        if (!g || +g[2] !== m || +g[3] !== y) continue;
        var parsed = parseDay(item.timings, date.hijri);
        if (parsed) days[+g[1]] = parsed;
      }
      if (!days[day]) throw new Error('today missing');
      savePrayerMonth(c.id, y, m, days);
      applyDay(days[day], day);
    },
    function () { setStatus('تعذّر تحميل أوقات الصلاة، بنحاول مرة ثانية…'); setTimeout(loadPrayers, 60000); });
}

function renderPrayers() {
  if (!timings) return;
  var n = nowKsa(), nowMin = n.getHours() * 60 + n.getMinutes(), cur = -1, html = '';
  for (var i = 0; i < PRAYERS.length; i++) if (timings[PRAYERS[i].key] <= nowMin) cur = i;
  for (var j = 0; j < PRAYERS.length; j++) {
    var cls = 'prayer' + (j === cur ? ' current' : (j < cur ? ' past' : ''));
    html += '<div class="' + cls + '">' + prayerIcon(PRAYERS[j].icon) + '<span class="nm">' + prayerName(PRAYERS[j]) +
      '</span><span class="t">' + to12h(timings[PRAYERS[j].key]) + '</span></div>';
  }
  $('prayers').innerHTML = html;
  updateSky(nowMin);
}

var autoSky = 'sky-night', weatherKind = 'clear';
function updateSky(nowMin) {
  var t = timings;
  // From 1 AM the automatic theme dims itself, until half an hour before Fajr.
  if (nowMin >= 60 && nowMin < t.Fajr - 30) autoSky = 'sky-dim';
  else if (nowMin < t.Fajr || nowMin >= t.Isha) autoSky = 'sky-night';
  else if (nowMin < t.Sunrise + 30) autoSky = 'sky-dawn';
  else if (nowMin < t.Maghrib - 30) autoSky = 'sky-day';
  else autoSky = 'sky-sunset';
  applySky();
}
function applySky() {
  var t = settings.theme;
  var sky = t === 'day' ? 'sky-day' : t === 'night' ? 'sky-night' : t === 'dim' ? 'sky-dim' : autoSky;
  var cls = sky + ' scene-' + settings.scene + (settings.club ? ' has-match' : '') + ' wx-' + weatherKind + (isFullscreen() ? '' : ' not-fs');
  if (document.body.className !== cls) document.body.className = cls;
}

function updateNext() {
  if (!timings) return;
  var n = nowKsa(), nowSec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(), next = null, diff = 0;
  // From adhan until iqama: announce the prayer and count down to the iqama.
  for (var k = 0; k < PRAYERS.length && settings.alerts !== 'off'; k++) {
    var p = PRAYERS[k];
    if (p.key === 'Sunrise') continue;
    var jumuah = p.key === 'Dhuhr' && n.getDay() === 5;
    var start = timings[p.key] * 60, win = (jumuah ? JUMUAH_MIN : IQAMA_MIN[p.key]) * 60;
    if (nowSec >= start && nowSec < start + win) { showPrayerNow(p, jumuah, start + win - nowSec, nowSec - start); return; }
  }
  showAdhan(null);
  $('nextCard').className = 'card next';
  setText('nextTitle', 'الصلاة القادمة');
  setText('nextLeftLbl', 'متبقي');
  for (var i = 0; i < PRAYERS.length; i++) {
    if (PRAYERS[i].key === 'Sunrise') continue;
    var s = timings[PRAYERS[i].key] * 60;
    if (s > nowSec) { next = PRAYERS[i]; diff = s - nowSec; break; }
  }
  if (!next) { next = PRAYERS[0]; diff = 86400 - nowSec + timings.Fajr * 60; }
  setText('nextName', prayerName(next));
  $('nextAt').innerHTML = 'الساعة ' + to12h(timings[next.key]);
  setText('nextLeft', pad(Math.floor(diff / 3600)) + ':' + pad(Math.floor(diff % 3600 / 60)) + ':' + pad(diff % 60));
}

function showPrayerNow(p, jumuah, toIqama, sinceAdhan) {
  $('nextCard').className = 'card next now';
  setText('nextTitle', 'حان الآن وقت صلاة');
  setText('nextName', prayerName(p));
  if (jumuah) {
    setText('nextAt', 'تقبّل الله منا ومنكم');
    setText('nextLeftLbl', '');
    setText('nextLeft', '');
  } else {
    setText('nextAt', 'الإقامة بعد ' + IQAMA_MIN[p.key] + ' دقيقة من الأذان');
    setText('nextLeftLbl', 'متبقي على الإقامة');
    setText('nextLeft', pad(Math.floor(toIqama / 60)) + ':' + pad(toIqama % 60));
  }
  // Big announcement for the first minute after the adhan.
  showAdhan(sinceAdhan < 60 && settings.alerts === 'full' ? prayerName(p) : null);
}
function showAdhan(name) {
  var el = $('adhan');
  if (!name) { if (el.className) el.className = ''; return; }
  setText('adhanName', name);
  el.className = 'show';
}

/* ---------- Countdowns ---------- */
function updateHoliday() {
  var cal = CALENDARS[calKey()], list = cal.breaks;
  for (var i = 0; i < list.length; i++) {
    var h = list[i], toStart = daysUntil(h.start), isLast = i === list.length - 1;
    // A break without an announced return date counts as ongoing for two weeks,
    // or until the calendar gets a later break if it is the last one listed.
    if (!h.end && toStart <= 0 && (isLast || toStart > -14)) {
      setText('hLbl', 'إجازة سعيدة!');
      setText('hName', h.name);
      setText('hNum', '');
      setText('hSub', isLast ? 'تقويم العام الدراسي الجديد لم يُضف بعد' : 'موعد العودة لم يُعلن بعد · ' + cal.label);
      return;
    }
    if (!h.end && toStart <= 0) continue;
    var toEnd = h.end ? daysUntil(h.end) : toStart;
    if (toEnd < 0) continue;
    if (toStart <= 0) {
      setText('hLbl', 'إجازة سعيدة!');
      setText('hName', h.name);
      setNum('hNum', toEnd + 1, dayWord(toEnd + 1) + ' متبقية');
      setText('hSub', 'الدوام يرجع بعد ' + fmtDate(h.end));
    } else {
      setText('hLbl', 'الإجازة القادمة');
      setText('hName', h.name);
      setNum('hNum', toStart, dayWord(toStart));
      setText('hSub', 'تبدأ ' + fmtDate(h.start) + ' · ' + cal.label);
    }
    return;
  }
  setText('hLbl', 'الإجازة القادمة');
  setText('hName', 'قريبًا');
  setText('hNum', '');
  setText('hSub', 'تقويم العام الدراسي الجديد لم يُضف بعد');
}

function loadRamadan() {
  if (!hijri) return;
  var hy = hijri.year, hm = hijri.month;
  var year = hm > 9 ? hy + 1 : hy;
  if (ramadanStart && ramadanStart.year === year) { updateRamadan(); return; }
  getJSON('https://api.aladhan.com/v1/hToG/01-09-' + year + '?calendarMethod=UAQ', function (res) {
    var g = /^(\d{2})-(\d{2})-(\d{4})$/.exec(res && res.data && res.data.gregorian && res.data.gregorian.date);
    if (!g) throw new Error('bad date');
    ramadanStart = { year: year, date: g[3] + '-' + g[2] + '-' + g[1] };
    updateRamadan();
  }, function () {
    if (year === RAMADAN_FALLBACK.year) { ramadanStart = RAMADAN_FALLBACK; updateRamadan(); }
  });
}

function updateRamadan() {
  if (!ramadanStart || !hijri) return;
  if (hijri.month === 9) {
    setText('rLbl', 'رمضان مبارك');
    setNum('rNum', hijri.day, 'من رمضان');
    setText('rSub', 'تقبّل الله صيامكم وقيامكم');
    return;
  }
  var d = daysUntil(ramadanStart.date);
  setText('rLbl', 'متبقي على رمضان');
  setNum('rNum', d, dayWord(d));
  setText('rSub', 'يبدأ ' + fmtDate(ramadanStart.date) + ' تقريبًا · ' + ramadanStart.year + ' هـ');
}

/* ---------- Weather ---------- */
function loadWeather() {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city().lat + '&longitude=' + city().lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FRiyadh&forecast_days=5';
  var cityId = city().id;
  getJSON(url, function (res) {
    renderWeather(res);
    try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ city: cityId, at: Date.now(), res: res })); } catch (e) {}
  }, function () {
    // Service down or no internet: show the last reading for this city if it is under 12 hours old.
    try {
      var cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
      if (cached && cached.city === cityId && typeof cached.at === 'number' && Date.now() - cached.at < 12 * 3600000) renderWeather(cached.res);
    } catch (e) {}
    setTimeout(loadWeather, 60000);
  });
}

var WEATHER_CACHE_KEY = 'tvDashWeather';
function renderWeather(res) {
    var c = res && res.current, d = res && res.daily;
    if (!c || !d || !(d.time instanceof Array)) throw new Error('bad weather data');
    var today = nowKsa(), todayIso = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var code = intIn(c.weather_code, 0, 99), info = wxInfo(code);
    weatherKind = code === null ? 'clear' : code === 0 ? 'clear' : code <= 2 ? 'partly' : code === 3 ? 'cloudy' :
      (code === 45 || code === 48) ? 'fog' : 'rain';
    applySky();
    $('wxIcon').innerHTML = wxIcon(info.icon, 'big');
    setText('wxTemp', num(c.temperature_2m) + '°');
    setText('wxDesc', info.ar);
    setText('wxFeel', num(c.apparent_temperature) + '°');
    setText('wxHum', num(c.relative_humidity_2m) + '%');
    setText('wxWind', num(c.wind_speed_10m));
    // Only constants, a validated date and rounded numbers go into this markup.
    var html = '', shown = 0;
    for (var i = 0; i < d.time.length && i < 8 && shown < 4; i++) {
      var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.time[i]);
      if (!p || d.time[i] <= todayIso) continue;  // upcoming days only (also right for an older cached copy)
      shown++;
      var dow = new Date(+p[1], +p[2] - 1, +p[3]).getDay();
      html += '<div class="day"><div class="dn">' + DAYS_AR[dow] + '</div>' + wxIcon(wxInfo(intIn(d.weather_code && d.weather_code[i], 0, 99)).icon) +
        '<div class="hl">' + num(d.temperature_2m_max && d.temperature_2m_max[i]) + '° <span>' + num(d.temperature_2m_min && d.temperature_2m_min[i]) + '°</span></div></div>';
    }
    $('days').innerHTML = html;
}

/* ---------- Favourite club: next match ---------- */
var match = null, matchFetchedAt = 0;
var MATCH_LENGTH_MS = 2.25 * 3600000;  // treat a match as live for about 2h15m after kick-off

// Arabic name for a team id, or the given English name reduced to safe plain text.
function teamName(id, fallback) {
  var c = clubById(String(id));
  if (c) return c[1];
  if (OTHER_TEAMS_AR.hasOwnProperty(String(id))) return OTHER_TEAMS_AR[String(id)];
  return String(fallback || '').replace(/[^\w \-.'؀-ۿ]/g, '').slice(0, 40) || '—';
}
function competitionName(s) {
  s = String(s || '');
  return COMPETITIONS_AR.hasOwnProperty(s) ? COMPETITIONS_AR[s] : s.replace(/[^\w \-.']/g, '').slice(0, 50);
}

function loadMatch() {
  var id = settings.club;
  if (!id) { match = null; renderMatch(); return; }
  matchFetchedAt = Date.now();
  getJSON('https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=' + encodeURIComponent(id), function (res) {
    if (settings.club !== id) return;  // the club was changed meanwhile
    var e = res && res.events instanceof Array ? res.events[0] : null;
    if (!e) { match = { none: true }; renderMatch(); return; }
    var t = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e.strTimestamp);
    if (!t || !/^\d{1,8}$/.test(String(e.idHomeTeam)) || !/^\d{1,8}$/.test(String(e.idAwayTeam))) throw new Error('bad match data');
    match = {
      ts: Date.UTC(+t[1], +t[2] - 1, +t[3], +t[4], +t[5]),  // TheSportsDB timestamps are UTC
      homeId: String(e.idHomeTeam), awayId: String(e.idAwayTeam),
      home: teamName(e.idHomeTeam, e.strHomeTeam), away: teamName(e.idAwayTeam, e.strAwayTeam),
      comp: competitionName(e.strLeague)
    };
    renderMatch();
  }, function () { setTimeout(loadMatch, 10 * 60000); });
}

function renderMatch() {
  if (!settings.club) return;
  var club = clubById(settings.club);
  setText('mClub', club ? club[1] : '');
  if (!match) { setText('mLbl', 'المباراة القادمة'); setText('mTeams', '…'); setText('mWhen', ''); setText('mLeft', ''); return; }
  if (match.none) { setText('mLbl', 'المباراة القادمة'); setText('mTeams', 'لا توجد مباراة قادمة معلنة'); setText('mWhen', ''); setText('mLeft', ''); return; }
  // Teams, with the favourite club highlighted
  var teams = $('mTeams'), h = document.createElement('span'), v = document.createElement('span'), a = document.createElement('span');
  h.textContent = match.home; a.textContent = match.away; v.textContent = ' × '; v.className = 'vs';
  if (match.homeId === settings.club) h.className = 'fav';
  if (match.awayId === settings.club) a.className = 'fav';
  teams.textContent = ''; teams.appendChild(h); teams.appendChild(v); teams.appendChild(a);
  // Kick-off in Saudi time
  var k = new Date(match.ts + TZ_OFFSET_MIN * 60000);
  var hh = k.getUTCHours(), mm = k.getUTCMinutes();
  setText('mWhen', DAYS_AR[k.getUTCDay()] + ' ' + k.getUTCDate() + ' ' + MONTHS_AR[k.getUTCMonth()] + ' · ' +
    (hh % 12 || 12) + ':' + pad(mm) + (hh < 12 ? ' ص' : ' م') + (match.comp ? ' · ' + match.comp : ''));
  var diff = match.ts - Date.now();
  if (diff > 0) {
    setText('mLbl', 'المباراة القادمة');
    var mins = Math.ceil(diff / 60000), days = Math.floor(mins / 1440);
    if (days >= 1) setNum('mLeft', days, dayWord(days) + ' متبقية');
    else setNum('mLeft', Math.floor(mins / 60) + ':' + pad(mins % 60), 'متبقي');
  } else if (-diff < MATCH_LENGTH_MS) {
    setText('mLbl', 'المباراة جارية الآن');
    setText('mLeft', 'مباشر');
  } else {
    // The match is over: fetch the next one (at most every 10 minutes).
    if (Date.now() - matchFetchedAt > 10 * 60000) loadMatch();
  }
}

/* ---------- Clock ---------- */
function tick() {
  var n = nowKsa();
  setText('hm', (n.getHours() % 12 || 12) + ':' + pad(n.getMinutes()));
  setText('sec', pad(n.getSeconds()));
  setText('ampm', n.getHours() < 12 ? 'ص' : 'م');
  setText('greg', DAYS_AR[n.getDay()] + '، ' + n.getDate() + ' ' + MONTHS_AR[n.getMonth()] + ' ' + n.getFullYear() + 'م');
  if (timingsDay !== null && timingsDay !== n.getDate()) { timingsDay = null; loadPrayers(); updateHoliday(); }
  if (n.getSeconds() === 0) { renderPrayers(); renderMatch(); }
  updateNext();
}

/* ---------- Trees scene ---------- */
var SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  var el = document.createElementNS(SVG_NS, tag);
  for (var a in attrs) if (attrs.hasOwnProperty(a)) el.setAttribute(a, attrs[a]);
  if (parent) parent.appendChild(el);
  return el;
}
// A round leafy tree standing on (x, base), s = scale.
function roundTree(g, x, base, s, sway) {
  svgEl('rect', { 'class': 't-trunk', x: x - 7 * s, y: base - 95 * s, width: 14 * s, height: 95 * s, rx: 4 * s }, g);
  var crown = svgEl('g', { 'class': 'sway ' + sway }, g);
  var c = [[0, -150, 52], [-38, -122, 40], [40, -124, 42], [0, -190, 38], [-30, -170, 30], [32, -168, 30]];
  for (var i = 0; i < c.length; i++) svgEl('circle', { 'class': 't-leaf1', cx: x + c[i][0] * s, cy: base + c[i][1] * s, r: c[i][2] * s }, crown);
  var hl = [[-14, -168, 20], [20, -146, 16], [-30, -128, 14]];
  for (var j = 0; j < hl.length; j++) svgEl('circle', { 'class': 't-leaf2', cx: x + hl[j][0] * s, cy: base + hl[j][1] * s, r: hl[j][2] * s }, crown);
}
// A tall slim cypress.
function cypress(g, x, base, s, sway) {
  svgEl('rect', { 'class': 't-trunk', x: x - 4 * s, y: base - 30 * s, width: 8 * s, height: 30 * s }, g);
  var crown = svgEl('g', { 'class': 'sway ' + sway }, g);
  svgEl('ellipse', { 'class': 't-cyp', cx: x, cy: base - 110 * s, rx: 26 * s, ry: 90 * s }, crown);
  svgEl('ellipse', { 'class': 't-leaf2', cx: x - 8 * s, cy: base - 130 * s, rx: 8 * s, ry: 50 * s, opacity: 0.5 }, crown);
}
// A date palm.
function palm(g, x, base, s, sway) {
  svgEl('path', { 'class': 't-trunk', d: 'M' + (x - 6 * s) + ' ' + base + ' Q' + (x - 2 * s) + ' ' + (base - 90 * s) + ' ' + (x + 6 * s) + ' ' + (base - 170 * s) +
    ' L' + (x + 14 * s) + ' ' + (base - 170 * s) + ' Q' + (x + 8 * s) + ' ' + (base - 90 * s) + ' ' + (x + 8 * s) + ' ' + base + ' Z' }, g);
  var top = svgEl('g', { 'class': 'sway ' + sway }, g);
  var cx = x + 10 * s, cy = base - 172 * s;
  var fronds = [[-80, 20], [-70, -18], [-35, -45], [80, 20], [70, -18], [35, -45], [0, -55]];
  for (var i = 0; i < fronds.length; i++) {
    var ex = cx + fronds[i][0] * s, ey = cy + fronds[i][1] * s;
    var mx = cx + fronds[i][0] * 0.5 * s, my = cy + fronds[i][1] * 0.5 * s - 22 * s;
    svgEl('path', { 'class': 't-palm', d: 'M' + cx + ' ' + cy + ' Q' + mx + ' ' + my + ' ' + ex + ' ' + ey +
      ' Q' + (mx + 4 * s) + ' ' + (my + 14 * s) + ' ' + cx + ' ' + (cy + 6 * s) + ' Z' }, top);
  }
  svgEl('circle', { 'class': 't-flower-b', cx: cx - 6 * s, cy: cy + 8 * s, r: 5 * s, opacity: 0.8 }, top);
  svgEl('circle', { 'class': 't-flower-b', cx: cx + 5 * s, cy: cy + 10 * s, r: 5 * s, opacity: 0.8 }, top);
}
function bush(g, x, base, s) {
  svgEl('circle', { 'class': 't-bush', cx: x - 22 * s, cy: base - 12 * s, r: 22 * s }, g);
  svgEl('circle', { 'class': 't-bush', cx: x + 20 * s, cy: base - 10 * s, r: 20 * s }, g);
  svgEl('circle', { 'class': 't-leaf2', cx: x, cy: base - 26 * s, r: 24 * s }, g);
}
function buildTrees() {
  var far = $('treesFar'), mid = $('treesMid'), front = $('treesFront');
  // A soft line of distant trees along the back hill
  for (var x = 10; x < 1600; x += 46) {
    var h = 18 + (x * 7) % 14;
    svgEl('circle', { 'class': 't-far', cx: x, cy: 246 - h, r: h }, far);
    svgEl('circle', { 'class': 't-far', cx: x + 20, cy: 252 - h * 0.7, r: h * 0.8 }, far);
  }
  palm(mid, 30, 334, 0.95, 'sway-b');
  roundTree(mid, 140, 334, 1.2, '');
  roundTree(mid, 340, 330, 0.9, 'sway-c');
  cypress(mid, 470, 332, 1.0, 'sway-b');
  roundTree(mid, 620, 334, 1.3, '');
  palm(mid, 770, 334, 1.1, 'sway-c');
  roundTree(mid, 910, 332, 1.0, 'sway-b');
  roundTree(mid, 1130, 334, 1.4, 'sway-c');
  cypress(mid, 1275, 330, 0.9, '');
  roundTree(mid, 1400, 334, 1.1, 'sway-b');
  palm(mid, 1530, 334, 1.0, '');
  var bushes = [60, 255, 520, 700, 845, 1050, 1210, 1335, 1585];
  for (var i = 0; i < bushes.length; i++) bush(front, bushes[i], 346, 0.8 + (i % 3) * 0.15);
  var colours = ['t-flower-a', 't-flower-b', 't-flower-c'];
  for (var f = 0; f < 46; f++) {
    var fx = (f * 137) % 1600, fy = 342 + (f * 53) % 14;
    svgEl('circle', { 'class': colours[f % 3], cx: fx, cy: fy, r: 3 + (f % 2) }, front);
  }
}
buildTrees();

/* ---------- Rain drops (only shown when it rains) ---------- */
(function () {
  for (var i = 0; i < 46; i++) {
    var d = document.createElement('div');
    d.className = 'drop';
    d.style.left = (Math.random() * 100) + '%';
    d.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
    d.style.animationDuration = (0.8 + Math.random() * 0.5).toFixed(2) + 's';
    $('rain').appendChild(d);
  }
})();

/* ---------- Stars ---------- */
(function () {
  for (var i = 0; i < 60; i++) {
    var st = document.createElement('div');
    st.className = 'star';
    st.style.top = (Math.random() * 100) + '%';
    st.style.left = (Math.random() * 100) + '%';
    st.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
    $('stars').appendChild(st);
  }
})();

/* ---------- Full screen ---------- */
// The TV browser only allows full screen after a key press, so any remote button switches it on.
function goFullscreen() {
  var el = document.documentElement;
  var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  if (req && !(document.fullscreenElement || document.webkitFullscreenElement)) { try { req.call(el); } catch (e) {} }
}
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.webkitIsFullScreen); }
function onFsChange() { applySky(); }
/* ---------- Settings panel and remote control ---------- */
var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27 };
var focused = null;

function hasClass(el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0; }
function setFocus(el) {
  if (focused) focused.className = focused.className.replace(/\s*\bfocus\b/g, '');
  focused = el;
  if (el) { el.className += ' focus'; if (el.scrollIntoView && el.id !== 'gear') el.scrollIntoView(false); }
}
function panelOpen() { return hasClass($('settings'), 'open'); }
var VIEWS = ['viewMain', 'viewCity', 'viewClub'];
function activeView() {
  for (var i = 1; i < VIEWS.length; i++) if (hasClass($(VIEWS[i]), 'active')) return $(VIEWS[i]);
  return $('viewMain');
}
function showView(id) {
  for (var i = 0; i < VIEWS.length; i++) $(VIEWS[i]).className = 'view' + (VIEWS[i] === id ? ' active' : '');
}

function refreshPanel() {
  setText('cityBtn', city().ar);
  setText('clubBtn', settings.club ? 'فريقي: ' + clubById(settings.club)[1] : 'فريقي: بدون');
  var chips = $('viewMain').querySelectorAll('[data-set]');
  for (var i = 0; i < chips.length; i++) {
    var ch = chips[i], set = ch.getAttribute('data-set'), val = set === 'cal' ? calKey() : settings[set];
    ch.className = 'chip fx' + (ch.getAttribute('data-val') === val ? ' on' : '') + (ch === focused ? ' focus' : '');
  }
}
function buildCityGrid() {
  for (var i = 0; i < CITIES.length; i++) {
    var b = document.createElement('button');
    b.className = 'chip fx';
    b.setAttribute('data-city', CITIES[i][0]);
    b.textContent = CITIES[i][1];
    $('cityGrid').appendChild(b);
  }
}
function buildClubGrid() {
  var list = [['none', 'بدون فريق']].concat(CLUBS);
  for (var i = 0; i < list.length; i++) {
    var b = document.createElement('button');
    b.className = 'chip fx';
    b.setAttribute('data-club', list[i][0]);
    b.textContent = list[i][1];
    $('clubGrid').appendChild(b);
  }
}
function openClubPicker() {
  showView('viewClub');
  var btns = $('clubGrid').querySelectorAll('.chip'), cur = btns[0];
  for (var i = 0; i < btns.length; i++) {
    var id = btns[i].getAttribute('data-club');
    var on = id === (settings.club || 'none');
    btns[i].className = 'chip fx' + (on ? ' on' : '');
    if (on) cur = btns[i];
  }
  focused = null;
  setFocus(cur);
}
function openSettings() {
  refreshPanel(); showView('viewMain');
  $('settings').className = 'open';
  setFocus($('cityBtn'));
}
function closeSettings() { $('settings').className = ''; setFocus(null); }
function openCityPicker() {
  showView('viewCity');
  var btns = $('cityGrid').querySelectorAll('.chip'), cur = btns[0];
  for (var i = 0; i < btns.length; i++) {
    var on = btns[i].getAttribute('data-city') === settings.city;
    btns[i].className = 'chip fx' + (on ? ' on' : '');
    if (on) cur = btns[i];
  }
  focused = null;
  setFocus(cur);
}
function applyCity() {
  setText('cityName', city().ar);
  setText('wxCity', city().ar);
  loadPrayers(); loadWeather(); updateHoliday();
}

function activate(el) {
  if (!el) return;
  if (el.id === 'gear') { openSettings(); return; }
  if (el.id === 'cityBtn') { openCityPicker(); return; }
  if (el.id === 'clubBtn') { openClubPicker(); return; }
  var clubId = el.getAttribute('data-club');
  if (clubId && (clubId === 'none' || clubById(clubId))) {
    settings.club = clubId === 'none' ? '' : clubId;
    saveSettings(); match = null; applySky(); loadMatch();
    showView('viewMain'); focused = null; setFocus($('clubBtn')); refreshPanel();
    return;
  }
  if (el.id === 'doneBtn') { closeSettings(); return; }
  var cityId = el.getAttribute('data-city');
  if (cityId && cityById(cityId)) {
    settings.city = cityId;
    saveSettings(); applyCity();
    showView('viewMain'); focused = null; setFocus($('cityBtn')); refreshPanel();
    return;
  }
  var set = el.getAttribute('data-set');
  var val = el.getAttribute('data-val');
  if ((set === 'cal' || set === 'theme' || set === 'scene' || set === 'alerts') && allowed(set, val)) {
    settings[set] = val;
    saveSettings(); refreshPanel();
    if (set === 'cal') updateHoliday(); else applySky();
  }
}

// Move focus to the nearest button in the arrow's direction.
function moveFocus(dir) {
  var items = activeView().querySelectorAll('.fx');
  if (!focused) { setFocus(items[0]); return; }
  var a = focused.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  var best = null, bestScore = Infinity;
  for (var i = 0; i < items.length; i++) {
    var el = items[i]; if (el === focused) continue;
    var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    var dx = bx - ax, dy = by - ay, main, cross;
    if (dir === KEY.LEFT) { main = -dx; cross = dy; }
    else if (dir === KEY.RIGHT) { main = dx; cross = dy; }
    else if (dir === KEY.UP) { main = -dy; cross = dx; }
    else { main = dy; cross = dx; }
    if (main <= 2) continue;
    var score = main + Math.abs(cross) * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) setFocus(best);
}

document.addEventListener('keydown', function (e) {
  var k = e.keyCode;
  if (panelOpen()) {
    if (k === KEY.BACK || k === KEY.ESC || k === 8) {
      e.preventDefault();
      var sub = activeView().id;
      if (sub !== 'viewMain') { showView('viewMain'); focused = null; setFocus($(sub === 'viewClub' ? 'clubBtn' : 'cityBtn')); }
      else closeSettings();
    } else if (k === KEY.OK) { e.preventDefault(); activate(focused); }
    else if (k >= 37 && k <= 40) { e.preventDefault(); moveFocus(k); }
    return;
  }
  if (k >= 37 && k <= 40) { e.preventDefault(); setFocus($('gear')); return; }
  if (k === KEY.OK) {
    // OK on the settings button opens settings; OK anywhere else switches to full screen.
    if (focused && focused.id === 'gear') { e.preventDefault(); openSettings(); }
    else goFullscreen();
    return;
  }
  if ((k === KEY.BACK || k === KEY.ESC) && focused) setFocus(null);
});

// Pointer (Magic Remote or mouse)
document.addEventListener('click', function (e) {
  var el = e.target;
  while (el && el !== document.body && el.id !== 'gear' && !(el.className && hasClass(el, 'chip'))) el = el.parentNode;
  if (el && el !== document.body) { setFocus(el); activate(el); }
  else if (panelOpen()) { if (e.target === $('settings')) closeSettings(); }
  else goFullscreen();  // a click on the page itself, not on a button
});

buildCityGrid();
buildClubGrid();
setText('cityName', city().ar);
setText('wxCity', city().ar);
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

// Nudge the layout a few pixels every few minutes to avoid screen burn-in.
var shifts = [[0, 0], [6, 4], [-6, 4], [6, -4], [-6, -4]], shiftIdx = 0;
setInterval(function () {
  shiftIdx = (shiftIdx + 1) % shifts.length;
  $('stage').style.transform = 'translate(' + shifts[shiftIdx][0] + 'px,' + shifts[shiftIdx][1] + 'px)';
}, 5 * 60000);

onFsChange();
loadPrayers();
loadWeather();
updateHoliday();
tick();
setInterval(tick, 1000);
setInterval(loadWeather, 30 * 60000);
loadMatch();
setInterval(loadMatch, 3 * 3600000);
setTimeout(function () { location.reload(); }, 6 * 3600000);
