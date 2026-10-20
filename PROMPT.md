# البرومبت

هذا البرومبت اللي تقدر تلصقه في (Claude Code)، أو أي مساعد برمجة يقدر يشغّل أوامر على كمبيوترك. الكمبيوتر لازم يكون على نفس الواي فاي حق التلفزيون.

**تبي الشاشة بس؟** ما تحتاج البرومبت. افتح متصفح التلفزيون، واكتب الرابط:

https://mjn707.github.io/tv-dashboard/

**تبي تبني نسختك الخاصة أو تعدّل عليها؟** انسخ البرومبت اللي تحت، وعدّل أول سطرين فيه: نوع تلفزيونك ومدينتك. البرومبت مكتوب بالإنجليزي لأن المساعد يتبعه بدقة أكثر، بس تقدر تكلّمه بالعربي عادي.

قبل ما تبدأ: شغّل التلفزيون وخلّه على نفس الشبكة. بيطلع على الشاشة طلب اقتران مع الكمبيوتر، اضغط فيه "موافق".

---

```text
My TV: <BRAND AND MODEL, e.g. LG webOS 4.1>
My city: <CITY, e.g. Jeddah>

I want a home screen for my TV that shows the clock, Umm al-Qura prayer times, the weather,
a countdown to the next Saudi school holiday and a countdown to Ramadan. Work on the real TV
step by step, check each step, and ask me before anything that depends on my preferences.

Find and connect to the TV
- Find the TV on my network: ARP table, then SSDP (for LG search
  "urn:lge-com:service:webos-second-screen:1"), then probe ports (LG 3000/3001, Samsung 8001/8002,
  Android 5555). Ask me for the IP if you can't find it.
- LG webOS: open a WebSocket to ws://<ip>:3000 and register with pairingType PROMPT. Tell me
  when the pairing prompt is on screen so I can accept it. Keep the client key in a local file
  outside any git repository, never commit it, and offer to delete it when we're done.
- Useful LG calls: ssap://system.launcher/open {"target": url} opens a page in the TV browser;
  ssap://com.webos.service.networkinput/getPointerInputSocket gives a socket where
  "type:button\nname:ENTER\n\n" presses OK.
- webOS can't uninstall system apps or replace the home screen over the network. Tell me which
  ads and promotions I can switch off myself in Settings instead of pretending to remove them.

Build the page (a static site: index.html, style.css, app.js, calendars.js, fonts/)
- The TV browser can be very old (webOS 4 is Chromium 53): write ES5 with XMLHttpRequest, no
  fetch, no CSS grid, no flex gap. Size everything in vh so it fits a 16:9 screen.
- Arabic, right-to-left. Put Latin digits that must read left-to-right (times, countdowns) in
  their own dir="ltr" elements.
- Prayer times: api.aladhan.com /v1/timings/<DD-MM-YYYY>?latitude=..&longitude=..&method=4
  (Umm al-Qura). Use Saudi time (UTC+3, no daylight saving) whatever the TV's time zone is.
- Ramadan: api.aladhan.com /v1/hToG/01-09-<hijri year>?calendarMethod=UAQ.
- Weather: api.open-meteo.com forecast with timezone=Asia/Riyadh.
- School holidays: a data file with two lists, all regions and the western region (Makkah,
  Jeddah, Madinah, Taif). Take dates from the Ministry of Education or several agreeing sources,
  and tell me where sources disagree.
- A settings panel that works with the remote: arrow keys move focus to the nearest button in
  that direction, OK selects, Back closes. City list, school calendar, background (auto/day/night).
  Save settings in localStorage and accept only known values.
- Full screen needs a key press in the TV browser: enter it on OK. Let Back leave full screen,
  and show a small hint when not in full screen.
- Move the layout a few pixels every few minutes so a screen left on doesn't burn in.

Security, for everyone who will use the page
- Content-Security-Policy meta: default-src 'none'; script-src 'self'; style-src 'self';
  font-src 'self'; img-src 'self' data:; connect-src only the two APIs; base-uri 'none';
  form-action 'none'. No inline scripts, styles or event handlers.
- Self-host the font, add <meta name="referrer" content="no-referrer">, no cookies, no analytics.
- Validate every API value (times, dates, numbers) before use, and set text with textContent.
- Refuse to run inside a frame.
- Test it: try to load an outside script and send data to another site, and confirm the CSP
  blocks both.

Publish and put it on the TV
- Publish with GitHub Pages and use the GitHub noreply email for commits.
- After each publish, wait for the Pages build, then open the URL on the TV with ?v=<commit>
  so the browser doesn't show a cached copy, and press OK for full screen.
- Tell me how to set the page as the TV browser's start page.
```

---

## مشاكل واجهناها وحلولها
- **متصفح التلفزيون قديم.** متصفح (webOS 4) مبني على (Chromium 53)، فأي كود حديث يوقف بصمت. الحل: كود قديم الأسلوب (ES5).
- **خط رمادي فوق الصفحة.** هذا شريط المتصفح. يختفي بملء الشاشة، والمتصفح ما يسمح بملء الشاشة إلا بعد ضغطة زر. الحل: زر (OK).
- **زر الرجوع يطلّع الصفحة من ملء الشاشة.** لا تقفل زر الرجوع، لأن المستخدم يعلق في الصفحة. الحل: رسالة صغيرة تقول "اضغط OK لملء الشاشة".
- **التلفزيون يعرض نسخة قديمة بعد التحديث.** الحل: افتح الرابط وفي آخره رقم النسخة.
- **تواريخ الإجازات تختلف بين المواقع.** اعتمد على وزارة التعليم، أو على أكثر من مصدر متفق.
