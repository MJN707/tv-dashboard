// Saudi school breaks, kept apart from the code so a new school year only touches this file.
//
// - rest: all regions of the Kingdom; west: Makkah, Jeddah, Madinah and Taif education departments.
// - start = first day off, end = last day off (inclusive), both 'YYYY-MM-DD'.
// - end is null when the return date has not been announced.
// - Add a new school year by appending its breaks to each list (oldest first). Past breaks are
//   skipped automatically, so old years can stay or be removed.
// - Every date here must come from the Ministry of Education or be confirmed by several sources.
'use strict';

var CALENDARS = {
  rest: { label: 'كافة مناطق المملكة', breaks: [
    // 1448 (2026-2027)
    { name: 'إجازة الخريف',       start: '2026-11-20', end: '2026-11-28' },
    { name: 'إجازة منتصف العام',   start: '2027-01-08', end: '2027-01-16' },
    { name: 'إجازة يوم التأسيس',   start: '2027-02-19', end: '2027-02-22' },
    { name: 'إجازة عيد الفطر',     start: '2027-02-26', end: '2027-03-13' },
    { name: 'إجازة عيد الأضحى',    start: '2027-05-07', end: '2027-05-22' },
    { name: 'إجازة نهاية العام',    start: '2027-06-25', end: null }
  ] },
  west: { label: 'المنطقة الغربية', breaks: [
    // 1448 (2026-2027)
    { name: 'إجازة الخريف',       start: '2026-11-20', end: '2026-11-28' },
    { name: 'إجازة منتصف العام',   start: '2027-01-08', end: '2027-01-16' },
    { name: 'إجازة يوم التأسيس',   start: '2027-02-19', end: '2027-02-22' },
    { name: 'إجازة عيد الفطر',     start: '2027-02-26', end: '2027-03-13' },
    { name: 'إجازة عيد الأضحى',    start: '2027-04-30', end: null },
    { name: 'إجازة نهاية العام',    start: '2027-07-01', end: null }
  ] }
};
