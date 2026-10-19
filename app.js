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
function cityById(id) {
  for (var i = 0; i < CITIES.length; i++) if (CITIES[i][0] === id) return CITIES[i];
  return null;
}
var TZ_OFFSET_MIN = 180; // Saudi Arabia, UTC+3, no daylight saving

// School breaks 1448 (2026-2027). start = first day off, end = last day off (inclusive);
// end is null when the return date has not been announced.
var CALENDARS = {
  rest: { label: 'كافة مناطق المملكة', breaks: [
    { name: 'إجازة الخريف',       start: '2026-11-20', end: '2026-11-28' },
    { name: 'إجازة منتصف العام',   start: '2027-01-08', end: '2027-01-16' },
    { name: 'إجازة يوم التأسيس',   start: '2027-02-19', end: '2027-02-22' },
    { name: 'إجازة عيد الفطر',     start: '2027-02-26', end: '2027-03-13' },
    { name: 'إجازة عيد الأضحى',    start: '2027-05-07', end: '2027-05-22' },
    { name: 'إجازة نهاية العام',    start: '2027-06-25', end: null }
  ] },
  west: { label: 'المنطقة الغربية', breaks: [
    { name: 'إجازة الخريف',       start: '2026-11-20', end: '2026-11-28' },
    { name: 'إجازة منتصف العام',   start: '2027-01-08', end: '2027-01-16' },
    { name: 'إجازة يوم التأسيس',   start: '2027-02-19', end: '2027-02-22' },
    { name: 'إجازة عيد الفطر',     start: '2027-02-26', end: '2027-03-13' },
    { name: 'إجازة عيد الأضحى',    start: '2027-04-30', end: null },
    { name: 'إجازة نهاية العام',    start: '2027-07-01', end: null }
  ] }
};

/* ---------- Settings (saved on this TV) ---------- */
// cal stays null until chosen by hand, so it follows the city's region.
var settings = { city: 'jeddah', cal: null, theme: 'auto', saved: false };
var ALLOWED = { cal: { rest: 1, west: 1 }, theme: { auto: 1, day: 1, night: 1 } };
function allowed(name, val) { return typeof val === 'string' && ALLOWED[name].hasOwnProperty(val); }

// Only known values are taken from storage or the link; anything else is ignored.
try {
  var saved = JSON.parse(localStorage.getItem('tvDashSettings') || '{}');
  if (saved && typeof saved === 'object') {
    if (typeof saved.city === 'string' && cityById(saved.city)) settings.city = saved.city;
    if (allowed('cal', saved.cal)) settings.cal = saved.cal;
    if (allowed('theme', saved.theme)) settings.theme = saved.theme;
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
    localStorage.setItem('tvDashSettings', JSON.stringify({ city: settings.city, cal: settings.cal, theme: settings.theme, saved: true }));
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
function loadPrayers() {
  var n = nowKsa();
  var dateStr = pad(n.getDate()) + '-' + pad(n.getMonth() + 1) + '-' + n.getFullYear();
  var c = city();
  getJSON('https://api.aladhan.com/v1/timings/' + dateStr + '?latitude=' + c.lat + '&longitude=' + c.lon + '&method=4',
    function (res) {
      // Validate everything before using it; a bad or tampered response is treated as a failure.
      var t = res && res.data && res.data.timings, h = res && res.data && res.data.date && res.data.date.hijri;
      if (!t || !h || !h.month) throw new Error('bad prayer data');
      var parsed = {};
      for (var i = 0; i < PRAYERS.length; i++) {
        parsed[PRAYERS[i].key] = parseHM(t[PRAYERS[i].key]);
        if (parsed[PRAYERS[i].key] === null) throw new Error('bad time');
      }
      var hd = intIn(h.day, 1, 30), hm = intIn(h.month.number, 1, 12), hy = intIn(h.year, 1400, 1700);
      if (hd === null || hm === null || hy === null) throw new Error('bad hijri date');
      timings = parsed;
      hijri = { day: hd, month: hm, year: hy };
      timingsDay = n.getDate();
      setText('hijri', hd + ' ' + HIJRI_MONTHS_AR[hm - 1] + ' ' + hy + ' هـ');
      renderPrayers();
      loadRamadan();
      setStatus('');
    },
    function () { setStatus('تعذّر تحميل أوقات الصلاة، بنحاول مرة ثانية…'); setTimeout(loadPrayers, 60000); });
}

function renderPrayers() {
  if (!timings) return;
  var n = nowKsa(), nowMin = n.getHours() * 60 + n.getMinutes(), cur = -1, html = '';
  for (var i = 0; i < PRAYERS.length; i++) if (timings[PRAYERS[i].key] <= nowMin) cur = i;
  for (var j = 0; j < PRAYERS.length; j++) {
    var cls = 'prayer' + (j === cur ? ' current' : (j < cur ? ' past' : ''));
    html += '<div class="' + cls + '">' + prayerIcon(PRAYERS[j].icon) + '<span class="nm">' + PRAYERS[j].ar +
      '</span><span class="t">' + to12h(timings[PRAYERS[j].key]) + '</span></div>';
  }
  $('prayers').innerHTML = html;
  updateSky(nowMin);
}

var autoSky = 'sky-night', overcast = false;
function updateSky(nowMin) {
  var t = timings;
  if (nowMin < t.Fajr || nowMin >= t.Isha) autoSky = 'sky-night';
  else if (nowMin < t.Sunrise + 30) autoSky = 'sky-dawn';
  else if (nowMin < t.Maghrib - 30) autoSky = 'sky-day';
  else autoSky = 'sky-sunset';
  applySky();
}
function applySky() {
  var sky = settings.theme === 'day' ? 'sky-day' : settings.theme === 'night' ? 'sky-night' : autoSky;
  var cls = sky + (settings.theme === 'auto' && overcast ? ' overcast' : '') + (isFullscreen() ? '' : ' not-fs');
  if (document.body.className !== cls) document.body.className = cls;
}

function updateNext() {
  if (!timings) return;
  var n = nowKsa(), nowSec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(), next = null, diff = 0;
  for (var i = 0; i < PRAYERS.length; i++) {
    if (PRAYERS[i].key === 'Sunrise') continue;
    var s = timings[PRAYERS[i].key] * 60;
    if (s > nowSec) { next = PRAYERS[i]; diff = s - nowSec; break; }
  }
  if (!next) { next = PRAYERS[0]; diff = 86400 - nowSec + timings.Fajr * 60; }
  setText('nextName', next.ar);
  $('nextAt').innerHTML = 'الساعة ' + to12h(timings[next.key]);
  setText('nextLeft', pad(Math.floor(diff / 3600)) + ':' + pad(Math.floor(diff % 3600 / 60)) + ':' + pad(diff % 60));
}

/* ---------- Countdowns ---------- */
function updateHoliday() {
  var cal = CALENDARS[calKey()], list = cal.breaks;
  for (var i = 0; i < list.length; i++) {
    var h = list[i], toStart = daysUntil(h.start);
    if (!h.end && toStart <= 0) {
      setText('hLbl', 'إجازة سعيدة!');
      setText('hName', h.name);
      setText('hNum', '');
      setText('hSub', 'موعد العودة لم يُعلن بعد · ' + cal.label);
      return;
    }
    var toEnd = h.end ? daysUntil(h.end) : toStart;
    if (toEnd < 0) continue;
    if (toStart <= 0) {
      setText('hLbl', 'إجازة سعيدة!');
      setText('hName', h.name);
      setNum('hNum', toEnd + 1, dayWord(toEnd + 1) + ' باقية');
      setText('hSub', 'الدوام يرجع بعد ' + fmtDate(h.end));
    } else {
      setText('hLbl', 'الإجازة القادمة');
      setText('hName', h.name);
      setNum('hNum', toStart, dayWord(toStart));
      setText('hSub', 'تبدأ ' + fmtDate(h.start) + ' · ' + cal.label);
    }
    return;
  }
  setText('hName', 'انتهى تقويم ١٤٤٨');
  setText('hNum', '');
  setText('hSub', 'يحتاج تحديث للسنة الجديدة');
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
  setText('rLbl', 'باقي على رمضان');
  setNum('rNum', d, dayWord(d));
  setText('rSub', 'يبدأ ' + fmtDate(ramadanStart.date) + ' تقريبًا · ' + ramadanStart.year + ' هـ');
}

/* ---------- Weather ---------- */
function loadWeather() {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city().lat + '&longitude=' + city().lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FRiyadh&forecast_days=5';
  getJSON(url, function (res) {
    var c = res && res.current, d = res && res.daily;
    if (!c || !d || !(d.time instanceof Array)) throw new Error('bad weather data');
    var code = intIn(c.weather_code, 0, 99), info = wxInfo(code);
    overcast = code !== null && code >= 3;
    applySky();
    $('wxIcon').innerHTML = wxIcon(info.icon, 'big');
    setText('wxTemp', num(c.temperature_2m) + '°');
    setText('wxDesc', info.ar);
    setText('wxFeel', num(c.apparent_temperature) + '°');
    setText('wxHum', num(c.relative_humidity_2m) + '%');
    setText('wxWind', num(c.wind_speed_10m));
    // Only constants, a validated date and rounded numbers go into this markup.
    var html = '';
    for (var i = 1; i < d.time.length && i < 8; i++) {
      var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.time[i]);
      if (!p) continue;
      var dow = new Date(+p[1], +p[2] - 1, +p[3]).getDay();
      html += '<div class="day"><div class="dn">' + DAYS_AR[dow] + '</div>' + wxIcon(wxInfo(intIn(d.weather_code && d.weather_code[i], 0, 99)).icon) +
        '<div class="hl">' + num(d.temperature_2m_max && d.temperature_2m_max[i]) + '° <span>' + num(d.temperature_2m_min && d.temperature_2m_min[i]) + '°</span></div></div>';
    }
    $('days').innerHTML = html;
  }, function () { setTimeout(loadWeather, 60000); });
}

/* ---------- Clock ---------- */
function tick() {
  var n = nowKsa();
  setText('hm', (n.getHours() % 12 || 12) + ':' + pad(n.getMinutes()));
  setText('sec', pad(n.getSeconds()));
  setText('ampm', n.getHours() < 12 ? 'ص' : 'م');
  setText('greg', DAYS_AR[n.getDay()] + '، ' + n.getDate() + ' ' + MONTHS_AR[n.getMonth()] + ' ' + n.getFullYear() + 'م');
  if (timingsDay !== null && timingsDay !== n.getDate()) { timingsDay = null; loadPrayers(); updateHoliday(); }
  if (n.getSeconds() === 0) renderPrayers();
  updateNext();
}

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
function activeView() { return hasClass($('viewCity'), 'active') ? $('viewCity') : $('viewMain'); }
function showView(id) {
  $('viewMain').className = 'view' + (id === 'viewMain' ? ' active' : '');
  $('viewCity').className = 'view' + (id === 'viewCity' ? ' active' : '');
}

function refreshPanel() {
  setText('cityBtn', city().ar);
  var chips = $('viewMain').querySelectorAll('[data-set]');
  for (var i = 0; i < chips.length; i++) {
    var ch = chips[i], val = ch.getAttribute('data-set') === 'cal' ? calKey() : settings.theme;
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
  if ((set === 'cal' || set === 'theme') && allowed(set, val)) {
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
      if (activeView().id === 'viewCity') { showView('viewMain'); focused = null; setFocus($('cityBtn')); }
      else closeSettings();
    } else if (k === KEY.OK) { e.preventDefault(); activate(focused); }
    else if (k >= 37 && k <= 40) { e.preventDefault(); moveFocus(k); }
    return;
  }
  if (k >= 37 && k <= 40) { e.preventDefault(); setFocus($('gear')); return; }
  if (k === KEY.OK) {
    goFullscreen();
    if (focused && focused.id === 'gear') { e.preventDefault(); openSettings(); }
    return;
  }
  if ((k === KEY.BACK || k === KEY.ESC) && focused) setFocus(null);
});

// Pointer (Magic Remote or mouse)
document.addEventListener('click', function (e) {
  var el = e.target;
  while (el && el !== document.body && el.id !== 'gear' && !(el.className && hasClass(el, 'chip'))) el = el.parentNode;
  if (el && el !== document.body) { setFocus(el); activate(el); }
  else if (panelOpen() && e.target === $('settings')) closeSettings();
});

buildCityGrid();
setText('cityName', city().ar);
setText('wxCity', city().ar);
document.addEventListener('click', goFullscreen);
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
setTimeout(function () { location.reload(); }, 6 * 3600000);
