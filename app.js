/* تطبيق الأمن الحيوي - كايرو ثري إيه
   يعمل بثلاثة أوضاع: تطبيق مستضاف (web) مع إشعارات وعمل دون اتصال، أو من رابط Apps Script مباشرة (gas)، أو نسخة عرض (demo). */
(function () {
  'use strict';
  var CFG = window.BIO_CONFIG || {};
  var MODE = window.DemoApi ? 'demo' : (window.google && google.script && google.script.run) ? 'gas' : 'web';
  var FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var $ = function (id) { return document.getElementById(id); };
  var B = window.BIO;

  /* ============================ أدوات ============================ */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  var TZ = { timeZone: 'Africa/Cairo' };
  function fmt(ms, withDay) {
    if (!ms) return '';
    var o = withDay === false ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
    try { return new Date(ms).toLocaleString('ar-EG', Object.assign(o, TZ)); } catch (e) { return new Date(ms).toLocaleString(); }
  }
  function ago(ms) {
    var m = (Date.now() - ms) / 60000;
    if (m < 1) return 'الآن';
    if (m < 60) return 'منذ ' + Math.round(m) + ' د';
    if (m < 48 * 60) return 'منذ ' + Math.round(m / 60) + ' س';
    return 'منذ ' + Math.round(m / 1440) + ' يوم';
  }
  function left(ms) { var h = Math.ceil((ms - Date.now()) / 36e5); return h > 0 ? 'بعد ' + h + ' ساعة' : 'الآن'; }
  function isToday(ms) { var a = new Date(ms), b = new Date(); return a.toDateString() === b.toDateString(); }
  function netErr() { return { net: true, message: 'لا يوجد اتصال بالإنترنت' }; }
  function appErr(m) { return { app: true, message: m || 'حدث خطأ غير متوقع' }; }
  function errText(e) { return (e && e.message) || String(e); }

  var ICONS = {
    pause: 'M7 4h3v16H7zM14 4h3v16h-3z', layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    gate: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6', scan: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 8h4v4H7zM13 13h4v4h-4zM13 8h4M8 15h2',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', radar: 'M12 12 19 5M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5', file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
    dash: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z', bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    mega: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12',
    db: 'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6',
    menu: 'M4 6h16M4 12h16M4 18h16', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
    out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', inn: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
    wifioff: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 12.86a10 10 0 0 1 5.17-2.69M12 20h.01',
    camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    tool: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
    refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    plus: 'M12 5v14M5 12h14', book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
    wa: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', card: 'M3 5h18v14H3zM7 10h4M7 14h6M15 9h3v4h-3z',
    key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l3 3L22 7l-3-3', share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
    network: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 23a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 23a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 5v6M12 11l-6 8M12 11l6 8M6 21h12', calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z', back: 'M9 18l6-6-6-6',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
    chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', siren: 'M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4', send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6', image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21', up: 'M18 15l-6-6-6 6',
    map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16', expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
    trace: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.24 7.76a6 6 0 1 0 0 8.49M19.07 4.93a10 10 0 1 0 0 14.14', arrow: 'M19 12H5M11 18l-6-6 6-6',
    trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7', copy: 'M9 9h11v11H9zM5 15H4V4h11v1', chev: 'M15 18l-6-6 6-6',
    bird: 'M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20M20 7l2 .5-2 .5M10 18v3M14 17.75V21M7 18a6 6 0 0 0 3.84-10.61', grad: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5M22 10v6',
    clip: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9zM9 12l2 2 4-4M9 18h6', box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    wind: 'M9.59 4.59A2 2 0 1 1 11 8H2M12.59 19.41A2 2 0 1 0 14 16H2M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2', tv: 'M2 7h20v13H2zM17 2l-5 5-5-5', history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2', play: 'M5 3l14 9-14 9z'
  };
  function icon(n, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[n] + '"/></svg>'; }
  function kindIcon(kind) { return kind === 'مركبة' ? 'truck' : kind === 'معدة' ? 'tool' : 'user'; }
  var PLACEHOLDER_LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f4c3a"/><path d="M32 10l18 7v13c0 12-8 20-18 24-10-4-18-12-18-24V17z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 32l6 6 11-12" fill="none" stroke="#9fe0c0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  function logoSrc() { return window.BIO_LOGO_DATA || CFG.LOGO_URL || (MODE === 'web' ? 'logo.png' : PLACEHOLDER_LOGO); }
  function logoImg() { return '<img src="' + esc(logoSrc()) + '" alt="" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_LOGO + '\'">'; }

  /* ============================ التخزين المحلي ============================ */
  var KV = (function () {
    var mem = {}, dbp = null;
    if (MODE !== 'demo' && window.indexedDB) {
      dbp = new Promise(function (res) {
        try {
          var r = indexedDB.open('bio-biosecurity', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    }
    function tx(mode, fn) {
      if (!dbp) return Promise.resolve(null);
      return dbp.then(function (db) {
        if (!db) return null;
        return new Promise(function (res) {
          try { var t = db.transaction('kv', mode), st = t.objectStore('kv'), q = fn(st); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { res(null); }; } catch (e) { res(null); }
        });
      });
    }
    return {
      get: function (k) { return dbp ? tx('readonly', function (s) { return s.get(k); }) : Promise.resolve(mem[k]); },
      set: function (k, v) { if (!dbp) { mem[k] = v; return Promise.resolve(); } return tx('readwrite', function (s) { return s.put(v, k); }); },
      del: function (k) { if (!dbp) { delete mem[k]; return Promise.resolve(); } return tx('readwrite', function (s) { return s.delete(k); }); }
    };
  })();

  /* ============================ الحالة ============================ */
  var S = { session: null, ref: null, moves: {}, outbox: [], lastSync: 0, notices: [], approvals: {}, pendingCount: 0, online: true, syncing: false, route: '', dir: 'IN', siteId: '', busy: false, dash: null, seenNotices: {}, pushOn: false, installEvt: null, poll: null, comms: null, chats: {}, showers: [] };
  function persist() {
    KV.set('session', S.session); KV.set('ref', S.ref); KV.set('outbox', S.outbox); KV.set('lastSync', S.lastSync);
    KV.set('notices', S.notices); KV.set('approvals', S.approvals); KV.set('comms', S.comms); KV.set('chats', S.chats); KV.set('showers', S.showers);
    KV.set('moves', Object.keys(S.moves).map(function (k) { return S.moves[k]; }));
  }
  function pruneMoves() {
    var keep = Date.now() - ((Number(S.ref && S.ref.settings.LOOKBACK_HOURS) || 240) + 72) * 36e5;
    Object.keys(S.moves).forEach(function (k) { if (S.moves[k].time < keep && !S.moves[k]._local) delete S.moves[k]; });
  }

  /* ============================ الاتصال بالخادم ============================ */
  var DemoNet = { offline: false };
  function remote(fn, args) {
    if (MODE === 'demo') {
      return new Promise(function (res, rej) {
        setTimeout(function () {
          if (DemoNet.offline) return rej(netErr());
          try { res(JSON.parse(JSON.stringify(window.DemoApi[fn].apply(null, args)))); } catch (e) { rej(appErr(errText(e))); }
        }, DemoNet.offline ? 350 : 140);
      });
    }
    if (MODE === 'gas') {
      return new Promise(function (res, rej) {
        google.script.run.withSuccessHandler(function (r) { if (r && r.ok) res(r.data); else rej(appErr(r && r.error)); })
          .withFailureHandler(function () { rej(netErr()); }).api(fn, args);
      });
    }
    if (!CFG.API_URL) return Promise.reject(appErr('لم يُضبط رابط الخادم في ملف config.js'));
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); }, function () { throw netErr(); })
      .then(function (r) { clearTimeout(timer); if (!r || !r.ok) throw appErr(r && r.error); return r.data; }, function (e) { clearTimeout(timer); throw e && e.app ? e : netErr(); });
  }
  function setOnline(v) { if (S.online !== v) { S.online = v; if (v) setTimeout(sync, 50); } renderNet(); }

  function enqueue(fn, args) {
    S.outbox.push({ opId: uid(), fn: fn, args: args, at: Date.now() });
    persist(); renderNet();
    setTimeout(sync, 60);
  }
  /** ينفذ العملية على الخادم، أو يحفظها للمزامنة لو لا يوجد اتصال */
  function act(fn, args) {
    if (S.outbox.length || !S.online) { enqueue(fn, args); return Promise.resolve({ queued: true }); }
    return remote(fn, [S.session.pin].concat(args)).then(function (d) { return { data: d }; }, function (e) {
      if (!e.net) throw e;
      setOnline(false); enqueue(fn, args); return { queued: true };
    });
  }

  function sync() {
    if (!S.session || S.syncing) return Promise.resolve();
    if (vrOnly()) return Promise.resolve();   // حساب التقارير فقط: لا يحتاج بيانات البوابات
    S.syncing = true; renderNet();
    var ops = S.outbox.slice();
    return remote('sync', [S.session.pin, { ops: ops, since: S.lastSync, refVersion: S.ref && S.ref.version }]).then(function (r) {
      var done = {};
      r.results.forEach(function (x) { done[x.opId] = true; if (!x.ok) toast('عملية مؤجلة لم تُقبل: ' + x.error); });
      S.outbox = S.outbox.filter(function (o) { return !done[o.opId]; });
      if (r.ref) S.ref = r.ref;
      r.moves.forEach(function (m) { S.moves[m.id] = m; });
      Object.keys(S.moves).forEach(function (k) { if (S.moves[k]._local && !S.outbox.some(function (o) { return o.fn === 'scan' && (o.args[0].id === k || o.args[0].id + '-X' === k); }) && !r.moves.some(function (m) { return m.id === k; }) && S.lastSync) delete S.moves[k]; });
      pruneMoves();
      r.approvals.forEach(function (a) { S.approvals[a.id] = a; });
      var fresh = (r.notices || []).filter(function (n) { return !S.seenNotices[n.id] && !n.acked && n.time > Date.now() - 6 * 36e5; });
      if (S.lastSync && fresh.length && S.session && !S.session.user.isManager) fresh.slice(0, 2).forEach(function (n) { toast((n.level === 'عاجل' ? 'قرار عاجل: ' : 'قرار جديد: ') + n.title); });
      (r.notices || []).forEach(function (n) { S.seenNotices[n.id] = true; });
      S.notices = r.notices || [];
      S.pendingCount = r.pendingCount || 0;
      if (r.comms) S.comms = r.comms;
      S.session = Object.assign({}, S.session, r.session, { pin: S.session.pin });
      S.lastSync = r.serverTime;
      S.online = true;
      persist();
      refreshLive();
    }).catch(function (e) {
      if (e.net) S.online = false; else if (/الرقم السري/.test(e.message)) { logout(true); toast('انتهت صلاحية الدخول، أدخل الرقم السري من جديد'); }
    }).then(function () { S.syncing = false; renderNet(); renderBadges(); });
  }

  /** نسخة من المحرك تعمل على الجهاز ببيانات آخر مزامنة */
  function localEngine() {
    var r = S.ref, u = S.session.user;
    var store = BIO_memoryStore({
      sites: r.sites, checkpoints: r.checkpoints, rules: r.rules, items: r.items,
      users: [{ id: u.id, pin: S.session.pin, name: u.name, role: u.role, gate: S.session.gate.id }],
      settings: Object.keys(r.settings).map(function (k) { return { key: k, value: r.settings[k] }; }),
      moves: Object.keys(S.moves).map(function (k) { return S.moves[k]; }),
      approvals: [], notices: [], acks: [], devices: [], contacts: [], missions: r.missions || [], companies: r.companies || []
    });
    return { store: store, api: BIO_api(store, { now: Date.now, id: function (p) { return p + uid(); }, notify: function () {}, lock: function (f) { return f(); } }) };
  }

  /* ============================ الإشعارات داخل التطبيق ============================ */
  function toast(text, ms) {
    var box = $('toasts'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast plain'; el.textContent = text; el.setAttribute('role', 'status');
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 3800);
  }
  /** إشعار بشكل إشعار الموبايل (يُستخدم للإشعارات الواردة ولمحاكاة الموبايل في نسخة العرض) */
  function pushCard(o) {
    var box = $('toasts'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (o.compact || ($('sheetWrap') && !o.actions) ? ' compact' : '');
    el.innerHTML = '<div class="th"><span class="app ' + (o.wa ? 'wa' : o.mail ? 'mail' : '') + '">' + (o.wa ? icon('wa', '') : o.mail ? icon('mail', '') : logoImg()) + '</span><span>' + esc(o.app || 'الأمن الحيوي') + ' · الآن</span>' +
      '<button class="btn ghost sm" style="margin-inline-start:auto;min-height:24px;padding:0 4px" aria-label="إغلاق" data-x>' + icon('x') + '</button></div>' +
      '<b>' + esc(o.title) + '</b><p>' + esc(o.body) + '</p>' + (o.actions ? '<div class="acts"></div>' : '');
    el.querySelector('[data-x]').onclick = function () { el.remove(); };
    if (o.actions) o.actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn sm ' + (a.cls || ''); b.textContent = a.label; b.type = 'button';
      b.onclick = function () { a.run(el); };
      el.querySelector('.acts').appendChild(b);
    });
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    if (!o.sticky) setTimeout(function () { el.remove(); }, o.ms || 9000);
    if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {}
  }

  /* ============================ الإقلاع وتسجيل الدخول ============================ */
  function selfTrainStart() { return window.BIO_START === 'train' || /(^|[?&])p=train\b/.test(location.search) || location.hash === '#train'; }
  function selfStart() { if (selfTrainStart()) return true; return window.BIO_START === 'mission' || /(^|[?&])p=mission\b/.test(location.search) || location.hash === '#mission'; }
  function boot() {
    if (selfStart()) { if (selfTrainStart()) showSelfTrain(); else showSelfMission(); return; }
    Promise.all(['session', 'ref', 'moves', 'outbox', 'lastSync', 'notices', 'approvals', 'comms', 'chats', 'showers'].map(KV.get)).then(function (v) {
      if (v[0] && v[1]) {
        S.session = v[0]; S.ref = v[1]; S.outbox = v[3] || []; S.lastSync = v[4] || 0; S.notices = v[5] || []; S.approvals = v[6] || {}; S.comms = v[7] || null; S.chats = v[8] || {}; S.showers = v[9] || [];
        (v[2] || []).forEach(function (m) { S.moves[m.id] = m; });
        S.notices.forEach(function (n) { S.seenNotices[n.id] = true; });
        startApp();
        sync();
      } else showLogin();
    });
    if (MODE === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
      navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.route) go(e.data.route.replace('#', '')); if (e.data && e.data.sync) sync(); });
    }
    window.addEventListener('online', function () { setOnline(true); });
    window.addEventListener('offline', function () { setOnline(false); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; if (S.instShown) { S.instHelp = false; instDraw(); } else instOffer(); });
    window.addEventListener('appinstalled', function () { S.installEvt = null; instClose(); toast('تم تثبيت التطبيق. افتحه من أيقونته مباشرة'); });
    if (instCan() && /(^|[?&])install=1\b/.test(location.search)) setTimeout(function () { S.instShown = true; S.instHelp = !S.installEvt; instDraw(); }, 1200);
    else if (instIOS() || (instAndroid() && !instRealChrome())) setTimeout(instOffer, 2500);
    if (window.matchMedia) matchMedia('(display-mode: standalone)').addEventListener && matchMedia('(display-mode: standalone)').addEventListener('change', refreshInstBtns);
    if (window.MutationObserver) new MutationObserver(function () { if (S.instShown && !$('instBar')) instDraw(); }).observe(document.body, { childList: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    setInterval(function () { if (!document.hidden) sync(); }, MODE === 'demo' ? 6000 : 20000);
    window.addEventListener('hashchange', function () { if (S.session) render(); });
  }


  /* ============================ تثبيت التطبيق: نافذة تلقائية عند أول فتح ============================ */
  function instStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function instIOS() { var u = navigator.userAgent || ''; return /iPhone|iPad|iPod/.test(u) && !instStandalone(); }
  function instAndroid() { return /Android/i.test(navigator.userAgent || ''); }
  // متصفح Chrome الحقيقي (وليس متصفح الكاميرا أو قارئ QR أو واتساب أو تطبيق Google)
  function instRealChrome() { var u = navigator.userAgent || ''; return /Chrome\/\d/.test(u) && !/; wv\)|SamsungBrowser|EdgA|OPR|YaBrowser|GSA\/|FBAN|FBAV|Instagram|Line\/|Snapchat|MiuiBrowser|HeyTap|UCBrowser/.test(u); }
  // رابط النسخة القابلة للتثبيت (GitHub Pages). رابط Apps Script لا يقبل التثبيت، فزر التثبيت هناك يفتح هذه النسخة
  var PWA_URL = CFG.PWA_URL || 'https://abdelrahmanzaki2024-lgtm.github.io/biosecurity/';
  function instCan() { return MODE === 'gas' || (MODE === 'web' && !instStandalone()); }
  function instMode() { return S.installEvt ? 'prompt' : instIOS() ? 'ios' : (instAndroid() && !instRealChrome()) ? 'chrome' : instAndroid() ? 'menu' : 'desk'; }
  function instChromeUrl() { return 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end'; }
  function instSnoozed() { try { return Date.now() - Number(localStorage.getItem('bioInstallLater') || 0) < 3 * 864e5; } catch (e) { return false; } }
  function instOffer() {
    if (window.BIO_FORCE_INSTALL) { S.instShown = true; return instDraw(); }
    if (MODE !== 'web' || !instCan() || instSnoozed() || S.instShown) return;
    var m = instMode(); if (m === 'menu' || m === 'desk') return;
    S.instShown = true; instDraw();
  }
  // زر «تثبيت التطبيق» في التطبيق: خطوة واحدة ثم موافقة المتصفح
  function instGo() {
    if (MODE === 'gas') { window.open(PWA_URL + '?install=1', '_blank', 'noopener'); return; }
    if (S.installEvt) {
      var ev = S.installEvt; S.installEvt = null; ev.prompt();
      return (ev.userChoice || Promise.resolve({})).then(function (r) { if (r && r.outcome === 'accepted') { instClose(); toast('جارٍ تثبيت التطبيق… ستظهر الأيقونة على شاشتك خلال ثوانٍ', 5000); } else instClose(true); refreshInstBtns(); });
    }
    if (instMode() === 'chrome') { location.href = instChromeUrl(); return; }
    S.instShown = true; S.instHelp = true; instDraw();
  }
  function instClose(later) { S.instShown = false; S.instHelp = false; var el = $('instBar'); if (el) el.remove(); if (later) try { localStorage.setItem('bioInstallLater', String(Date.now())); } catch (e) {} }
  function instBtnHtml(cls) { return instCan() ? '<button type="button" class="' + (cls || 'self-cta inst-cta') + '" data-install="1">' + '<img class="inst-ico sm" src="' + (MODE === 'gas' ? logoSrc() : 'icons/icon-192.png') + '" alt=""><span><b>ثبّت التطبيق على هذا الجهاز</b><small>' + (MODE === 'gas' ? 'يفتح نسخة التطبيق القابلة للتثبيت، ثم اضغط «تثبيت الآن»' : 'ضغطة واحدة وتظهر أيقونة كايرو ثري إيه على شاشتك') + '</small></span>' + icon('download') + '</button>' : ''; }
  function refreshInstBtns() { if (instStandalone()) Array.prototype.forEach.call(document.querySelectorAll('[data-install]'), function (b) { b.remove(); }); }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-install]'); if (b) { e.preventDefault(); instGo(); } });
  function instDraw() {
    var old = $('instBar'); if (old) old.remove();
    var m = instMode(), el = document.createElement('div'), body;
    el.id = 'instBar'; el.className = 'inst-bar'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'تثبيت التطبيق');
    if (m === 'prompt') body = '<div class="inst-acts"><button class="btn primary grow" type="button" data-i="go">' + icon('download') + ' تثبيت الآن</button><button class="btn ghost" type="button" data-i="later">لاحقاً</button></div><p class="inst-note">ستطلب منك الشاشة التالية الموافقة، اضغط «تثبيت».</p>';
    else if (m === 'chrome') body = '<p class="inst-note">هذه الصفحة مفتوحة داخل الكاميرا أو قارئ الكود، وهو لا يدعم التثبيت. اضغط الزر لفتحها في Chrome، ثم اضغط «تثبيت الآن».</p><div class="inst-acts"><button class="btn primary grow" type="button" data-i="chrome">' + icon('download') + ' افتح في Chrome للتثبيت</button><button class="btn ghost" type="button" data-i="later">لاحقاً</button></div>';
    else if (m === 'ios') body = '<ol class="inst-steps"><li>اضغط زر المشاركة <span class="inst-k">' + icon('share') + '</span> أسفل الشاشة</li><li>اختر «إضافة إلى الشاشة الرئيسية»</li><li>اضغط «إضافة»، وستظهر أيقونة كايرو ثري إيه</li></ol><p class="inst-note">على آيفون يجب فتح الرابط في Safari.</p><button class="btn ghost block" type="button" data-i="later">تذكيري لاحقاً</button>' + '<div class="inst-arrow" aria-hidden="true">' + icon('chev') + '</div>';
    else if (m === 'menu') body = '<ol class="inst-steps"><li>اضغط قائمة Chrome <span class="inst-k">⋮</span> أعلى الشاشة</li><li>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»</li><li>اضغط «تثبيت»</li></ol><button class="btn ghost block" type="button" data-i="later">إغلاق</button>';
    else body = '<ol class="inst-steps"><li>اضغط أيقونة التثبيت <span class="inst-k">' + icon('download') + '</span> في نهاية شريط العنوان</li><li>أو من قائمة المتصفح اختر «تثبيت التطبيق»</li></ol><button class="btn ghost block" type="button" data-i="later">إغلاق</button>';
    el.className += m === 'ios' ? ' ios' : '';
    el.innerHTML = '<div class="inst-top"><img class="inst-ico" src="icons/icon-192.png" alt=""><div class="inst-t"><b>ثبّت تطبيق الأمن الحيوي</b><span>أيقونة على شاشتك تفتح التطبيق مباشرة، دون رابط، وتعمل حتى دون إنترنت</span></div><button class="inst-x" type="button" data-i="later" aria-label="لاحقاً">' + icon('x') + '</button></div>' + body;
    document.body.appendChild(el);
    el.onclick = function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return;
      if (b.dataset.i === 'later') return instClose(!S.instHelp);
      if (b.dataset.i === 'chrome') { location.href = instChromeUrl(); return; }
      instGo();
    };
  }

  var pinBuf = '';
  function showLogin(msg) {
    stopCam();
    document.body.innerHTML = demoStrip() +
      '<div class="login"><div class="login-hero"><div class="logo">' + logoImg() + '</div><h1>نظام الأمن الحيوي</h1><p>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + ' · تتبع حركة الأفراد والمركبات والمعدات بين المواقع وتطبيق فترات العزل لحظياً</p>' +
      '<div class="login-feats"><span>' + icon('shield') + ' قواعد عزل تلقائية</span><span>' + icon('bell') + ' قرارات فورية للمدير</span><span>' + icon('wifioff') + ' يعمل دون إنترنت</span><span>' + icon('wa') + ' تنبيهات واتساب</span></div></div>' +
      '<div class="login-side"><div class="login-card"><div class="lc-title"><b>تسجيل الدخول</b><span class="small muted">أدخل رقمك السري · يُحفظ الدخول على هذا الجهاز</span></div>' +
      '<div class="pin-dots" id="pinDots"></div><div class="keypad" id="keypad"></div><div class="login-err" id="loginErr" role="alert">' + esc(msg || '') + '</div>' +
      (MODE === 'demo' ? '<div class="demo-pins"><span class="xs muted">أرقام نسخة العرض:</span>' +
        [['1111', 'أمن التطهير المركزي - الواحات'], ['2222', 'أمن تطهير التسمين كلين - الواحات'], ['3333', 'أمن التطهير المركزي - ريجوا'], ['9999', 'مدير الأمن الحيوي (كل الصلاحيات)'], ['4444', 'مدير قطاع الواحات'], ['5555', 'مدير محطتي 5 و10'], ['6666', 'الإدارة العليا (متابعة فقط)'], ['7777', 'معاون أمن حيوي (التقارير فقط)']]
          .map(function (p) { return '<button type="button" data-pin="' + p[0] + '"><span>' + p[1] + '</span><b>' + p[0] + '</b></button>'; }).join('') + '</div>' : '') +
      instBtnHtml() +
      '<button type="button" class="self-cta" id="selfGo">' + icon('calendar') + '<span><b>موظف وعندك مأمورية أو زيارة لموقع؟</b><small>أرسلها من هنا بكودك ورقم هاتفك، بدون رقم سري</small></span>' + icon('chev') + '</button>' +
      '<button type="button" class="self-cta train" id="trainGo">' + icon('grad') + '<span><b>موظف جديد؟ التأهيل الإلزامي للأمن الحيوي</b><small>اقرأ الدروس واجتز الاختبار ليتفعل كارتك</small></span>' + icon('chev') + '</button>' +
      '</div><p class="login-foot">إدارة الأمن الحيوي · ' + esc(CFG.COMPANY || 'كايرو ثري إيه') + ' · إصدار 11</p></div></div><div class="toasts" id="toasts"></div>';
    bindDemoStrip();
    $('selfGo').onclick = function () { showSelfMission(); };
    $('trainGo').onclick = function () { showSelfTrain(); };
    pinBuf = '';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    $('keypad').innerHTML = keys.map(function (k) {
      return '<button type="button" class="key ' + (k.length > 1 ? 'fn' : '') + '" data-k="' + k + '">' + (k === 'del' ? 'مسح' : k === 'ok' ? 'دخول' : k) + '</button>';
    }).join('');
    $('keypad').onclick = function (e) { var b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); };
    document.querySelectorAll('[data-pin]').forEach(function (b) { b.onclick = function () { pinBuf = b.dataset.pin; dots(); doLogin(pinBuf); }; });
    document.onkeydown = function (e) { if (!$('keypad')) return; if (/^\d$/.test(e.key)) key(e.key); else if (e.key === 'Backspace') key('del'); else if (e.key === 'Enter') key('ok'); };
    dots();
  }
  function key(k) {
    if (k === 'del') pinBuf = pinBuf.slice(0, -1);
    else if (k === 'ok') { if (pinBuf.length >= 4) doLogin(pinBuf); return; }
    else if (pinBuf.length < 8) pinBuf += k;
    dots();
  }
  function dots() { var d = $('pinDots'); if (!d) return; var n = Math.max(4, pinBuf.length); d.innerHTML = Array.from({ length: n }, function (_, i) { return '<span class="' + (i < pinBuf.length ? 'on' : '') + '"></span>'; }).join(''); }
  function doLogin(pin) {
    $('loginErr').innerHTML = '<span class="spin"></span>';
    remote('login', [pin]).then(function (sess) {
      var sameUser = S.session && S.session.user.id === sess.user.id;
      if (!sameUser) { S.moves = {}; S.lastSync = 0; S.notices = []; S.approvals = {}; S.seenNotices = {}; S.dash = null; S.comms = null; S.chats = {}; }
      S.session = Object.assign({ pin: pin }, sess);
      S.siteId = ''; S.route = ''; S.vrFrame = null;
      try { history.replaceState(null, '', location.pathname + location.search + (sess.user.reportsOnly ? '#vr' : sess.user.isManager && (sess.user.perms || []).some(function (p) { return p.indexOf('vr_') === 0; }) ? '#portal' : '')); } catch (e) { location.hash = ''; }
      persist();
      return sync().then(startApp);
    }).catch(function (e) {
      if (e.net) {
        KV.get('session').then(function (s) {
          if (s && s.pin === pin && S.ref) { S.session = s; startApp(); toast('تم الدخول دون اتصال ببيانات آخر مزامنة'); }
          else if ($('loginErr')) $('loginErr').textContent = 'لا يوجد اتصال بالإنترنت. أول دخول يحتاج اتصالاً.';
        });
      } else if ($('loginErr')) { $('loginErr').textContent = errText(e); pinBuf = ''; dots(); }
    });
  }
  function logout(force) {
    if (!force && S.outbox.length) {
      openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('alert') + '</div><h2>عمليات لم تُرسل بعد</h2></div><div class="sheet-body"><p>يوجد ' + S.outbox.length + ' عملية مسجلة دون اتصال لم تصل للخادم. الخروج الآن سيحتفظ بها على هذا الجهاز وتُرسل عند الدخول مرة أخرى.</p>' +
        '<button class="btn primary big" data-a="sync">' + icon('refresh') + ' مزامنة الآن</button><button class="btn big" data-a="force">خروج على أي حال</button><button class="btn ghost" data-a="close">رجوع</button></div>', function (a) {
        if (a === 'sync') { closeSheet(); sync(); } else if (a === 'force') { closeSheet(); logout(true); } else closeSheet();
      });
      return;
    }
    S.session = null; S.vrFrame = null; KV.del('session'); clearInterval(S.poll); showLogin();
  }

  /* ============================ الإطار والتنقل ============================ */
  /** صلاحيات المستخدم الحالي (الحسابات القديمة بدون صلاحيات = مدير كامل) */
  function can(p) { var u = S.session && S.session.user; if (!u || !u.isManager) return false; if (!u.perms) return true; return u.perms.indexOf(p) >= 0; }
  function isAdmin() { var u = S.session && S.session.user; return !!(u && u.isManager && (u.isAdmin || !u.perms)); }
  /** تقارير الزيارات: صلاحيات المستخدم عليها، وهل حسابه للتقارير فقط */
  function vrPerms() { var u = S.session && S.session.user; return u && u.isManager && u.perms ? u.perms.filter(function (p) { return p.indexOf('vr_') === 0; }) : (u && u.isManager && !u.perms ? ['vr_write', 'vr_view', 'vr_review', 'vr_approve'] : []); }
  function hasVr() { return vrPerms().length > 0; }
  function vrOnly() { var u = S.session && S.session.user; return !!(u && u.reportsOnly); }
  function navItems() {
    if (vrOnly()) return [['vr', 'تقارير الزيارات', 'clip'], ['more', 'المزيد', 'menu']];
    if (S.session.user.isManager) return [
      ['dash', 'مركز القيادة', 'dash'], ['report', 'التقرير التنفيذي', 'file'], can('analytics') && ['sim', 'محاكاة التفشي', 'radar'], can('reports') && ['comms', 'البلاغات', 'siren'], can('analytics') && ['map', 'الخريطة الحية', 'map'], ['birds', 'رادار الطيور', 'bird'], ['wx', 'الأرصاد والآفات', 'wind'], can('analytics') && ['trace', 'تتبع العدوى', 'trace'], can('analytics') && ['insights', 'التخطيط والتحليل', 'network'], can('decide') && ['requests', 'الطلبات', 'inbox'], ['missions', 'المأموريات', 'calendar'], ['inspect', 'التدقيق الداخلي', 'clip'], ['disposal', 'النافق والسبلة', 'box'], ['companies', 'شركات النقل', 'truck'], ['academy', 'الأكاديمية', 'grad'], ['passport', 'جواز الأمن الحيوي', 'card'], ['notices', 'القرارات', 'mega'], hasVr() && ['vr', 'تقارير الزيارات', 'clip'], (can('data') || can('admin')) && ['data', 'البيانات', 'db'], isAdmin() && ['users', 'المستخدمون', 'user'], isAdmin() && ['gate', 'البوابة', 'scan'], ['more', 'المزيد', 'menu']
    ].filter(Boolean);
    return [['gate', 'البوابة', 'scan'], ['missions', 'الزيارات', 'calendar'], ['comms', 'المدير', 'chat'], ['notices', 'القرارات', 'mega'], ['log', 'سجل اليوم', 'list'], ['more', 'المزيد', 'menu']];
  }
  function demoStrip() {
    if (MODE !== 'demo') return '';
    return '<div class="demo-strip"><div class="in"><span class="tag">نسخة عرض</span><span class="hide-sm">بيانات افتراضية للتجربة · إشعارات الموبايل وواتساب تظهر هنا كما ستصل للمدير</span>' +
      '<label class="switch" style="margin-inline-start:auto"><input type="checkbox" id="demoOff"' + (DemoNet.offline ? ' checked' : '') + '> محاكاة انقطاع الإنترنت</label></div></div>';
  }
  function bindDemoStrip() {
    var t = $('demoOff'); if (!t) return;
    t.onchange = function () { DemoNet.offline = t.checked; setOnline(!t.checked); if (!t.checked) sync(); toast(t.checked ? 'انقطع الإنترنت: التطبيق يعمل ويحفظ العمليات على الجهاز' : 'عاد الإنترنت: جارٍ إرسال العمليات المحفوظة'); };
  }
  function startApp() {
    var me = S.session;
    document.body.innerHTML = demoStrip() +
      '<div class="app"><header class="topbar"><div class="topbar-in"><div class="logo">' + logoImg() + '</div>' +
      '<div class="brandtxt"><b>' + esc(me.company || CFG.COMPANY || 'الأمن الحيوي') + '</b><span id="subTitle"></span></div>' +
      '<div class="top-actions">' + (hasVr() && !vrOnly() ? '<button class="netchip portal-chip" type="button" id="portalChip">' + icon('layers') + '<span>المنصة</span></button>' : '') + (instCan() ? '<button class="netchip inst-chip" type="button" data-install="1">' + icon('download') + '<span>تثبيت</span></button>' : '') + '<button class="netchip" id="netChip" type="button"></button>' +
      '<button class="iconbtn" id="bellBtn" type="button" aria-label="القرارات">' + icon('bell') + '<span class="badge" id="bellBadge" hidden></span></button></div></div></header>' +
      '<div class="shell"><nav class="sidenav" id="sideNav" aria-label="التنقل"></nav><div class="maincol"><main class="main" id="main"></main><div class="vr-host" id="vrHost" hidden></div></div></div>' +
      '<nav class="bottomnav" id="bottomNav" aria-label="التنقل"></nav></div><div class="toasts" id="toasts" aria-live="polite"></div><div id="sheetRoot"></div>';
    bindDemoStrip();
    document.onkeydown = function (e) { if (e.key === 'Escape') closeSheet(); };
    var nav = navItems().map(function (n) { return '<button class="navbtn" type="button" data-go="' + n[0] + '">' + icon(n[2]) + '<span>' + n[1] + '</span><span class="badge" data-badge="' + n[0] + '" hidden></span></button>'; }).join('');
    $('sideNav').innerHTML = '<span class="navlabel">' + (vrOnly() ? 'تقارير الزيارات' : S.session.user.isManager ? 'إدارة الأمن الحيوي' : 'بوابة التطهير') + '</span>' + nav +
      '<div class="sidefoot"><b>' + esc(S.session.user.name) + '</b><span>' + esc(S.session.user.isManager ? (S.session.user.roleLabel || 'مدير') + (S.session.user.scope && !S.session.user.scope.all ? ' · ' + S.session.user.scope.label : '') : (S.session.gate.name || 'أمن بوابة')) + '</span></div>';
    $('bottomNav').innerHTML = navItems().filter(function (n) { return !(S.session.user.isManager && (n[0] === 'gate' || n[0] === 'sim' || n[0] === 'report' || n[0] === 'passport' || n[0] === 'trace' || n[0] === 'map' || n[0] === 'insights' || n[0] === 'users' || ['birds', 'wx', 'inspect', 'disposal', 'companies', 'academy', 'vr'].indexOf(n[0]) >= 0)); }).map(function (n) { return '<button class="navbtn" type="button" data-go="' + n[0] + '">' + icon(n[2]) + '<span>' + (n[0] === 'dash' ? 'القيادة' : n[1]) + '</span><span class="badge" data-badge="' + n[0] + '" hidden></span></button>'; }).join('');
    document.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
    $('netChip').onclick = function () { sync(); go('more'); };
    if ($('portalChip')) $('portalChip').onclick = function () { go('portal'); };
    if (vrOnly()) { $('netChip').hidden = true; $('bellBtn').hidden = true; }
    $('bellBtn').onclick = function () { go('notices'); };
    if (MODE === 'web' && window.Notification && Notification.permission === 'granted' && CFG.FIREBASE) enablePush(true);
    render();
    renderNet();
  }
  function go(r) { if (location.hash !== '#' + r) location.hash = r; else render(); }
  function currentRoute() {
    var r = (location.hash || '').replace('#', '');
    var allowed = navItems().map(function (n) { return n[0]; }).concat(hasVr() && !vrOnly() ? ['portal'] : [], S.session.user.isManager ? ['history', 'ref'].concat(can('analytics') ? ['map', 'trace', 'plan', 'network', 'audit'] : [], can('data') || can('admin') ? ['table', 'cards', 'external'] : [], ['tv'], isAdmin() ? ['backup'] : []) : ['ref', 'passport', 'disposal']);
    var base = r.split('/')[0];
    if (allowed.indexOf(base) < 0) return vrOnly() ? 'vr' : S.session.user.isManager ? 'dash' : 'gate';
    return r;
  }
  function render() {
    if (!S.session || !$('main')) return;
    var r = currentRoute(), base = r.split('/')[0];
    if (base !== 'gate') stopCam();
    if (base !== 'tv') tvStop();
    if (base !== 'birds') birdLiveStop();
    if (base !== 'wx' && S.wxMap) { try { S.wxMap.remove(); } catch (e) {} S.wxMap = null; }
    document.body.classList.toggle('vr-on', base === 'vr');
    if ($('vrHost')) $('vrHost').hidden = base !== 'vr' || !S.vrFrame;
    clearInterval(S.poll);
    S.route = r;
    document.querySelectorAll('[data-go]').forEach(function (b) { b.classList.toggle('on', b.dataset.go === base || (base === 'table' || base === 'cards' || base === 'history' || base === 'external') && b.dataset.go === 'data' || (base === 'ref' || base === 'tv' || base === 'backup') && b.dataset.go === 'more' || base === 'users' && b.dataset.go === 'users' || (base === 'plan' || base === 'network' || base === 'audit') && b.dataset.go === 'insights'); });
    var views = { gate: viewGate, notices: viewNotices, log: viewLog, more: viewMore, dash: viewDash, requests: viewRequests, data: viewData, table: viewTable, cards: viewCards, history: viewHistory, trace: viewTrace, map: viewMap, comms: viewComms, ref: viewRef, sim: viewSim, report: viewReport, missions: viewMissions, passport: viewPassport, external: viewExternal, insights: viewInsights, users: viewUsers, plan: viewPlan, network: viewNetwork, audit: viewAudit, birds: viewBirds, wx: viewWx, disposal: viewDisposal, companies: viewCompanies, inspect: viewInspect, academy: viewAcademy, backup: viewBackup, tv: viewTv, portal: viewPortal, vr: viewVr };
    $('main').innerHTML = '';
    views[base](r.split('/').slice(1));
    renderBadges(); renderSub();
    window.scrollTo(0, 0);
  }
  /** تحديث ما يتغير بعد المزامنة دون إعادة بناء الشاشة */
  function refreshLive() {
    if (!S.session || !$('main')) return;
    renderBadges(); renderSub();
    var base = S.route.split('/')[0];
    if (base === 'notices' && !$('composeForm')) render();
    if (base === 'log') render();
    if (base === 'gate') renderMyReports();
    if (base === 'comms' && S.commsRefresh) S.commsRefresh();
    if (base === 'gate') { renderGateBanner(); renderGateStats(); var ck = $('gateClock'); if (ck && ck.firstChild) ck.firstChild.nodeValue = fmt(Date.now(), false); }
  }
  function renderSub() {
    var el = $('subTitle'); if (!el || !S.session) return;
    var g = S.session.gate, site = S.ref && S.ref.sites.filter(function (s) { return s.id === S.siteId; })[0];
    el.textContent = S.session.user.name + (g.name && !S.session.user.isManager ? ' · ' + g.name : '') + (site && S.route.indexOf('gate') === 0 ? ' · ' + site.name : '');
  }
  function renderNet() {
    var c = $('netChip'); if (!c) return;
    var n = S.outbox.length;
    c.className = 'netchip' + (S.online ? '' : ' off');
    c.innerHTML = '<span class="dot"></span>' + (S.online ? (S.syncing ? 'مزامنة…' : n ? n + ' بانتظار الإرسال' : 'متصل') : 'دون اتصال' + (n ? ' · ' + n + ' محفوظة' : ''));
  }
  function unackedCount() { return S.notices.filter(function (n) { return !n.acked && S.session && !S.session.user.isManager; }).length; }
  function renderBadges() {
    var set = function (k, n) { document.querySelectorAll('[data-badge="' + k + '"]').forEach(function (b) { b.hidden = !n; b.textContent = n; }); };
    set('requests', S.session && S.session.user.isManager ? S.pendingCount : 0);
    set('notices', unackedCount());
    var cm = S.comms || {}; set('comms', S.session && S.session.user.isManager ? (cm.unseen || 0) + (cm.unread || 0) : (cm.unread || 0));
    var bb = $('bellBadge'); if (bb && S.session) { var n = S.session.user.isManager ? S.pendingCount : unackedCount(); bb.hidden = !n; bb.textContent = n; }
  }

  /* ============================ الورقة المنبثقة ============================ */
  var sheetHandler = null;
  function openSheet(html, onAction) {
    sheetHandler = onAction || null;
    $('sheetRoot').innerHTML = '<div class="sheet-wrap" id="sheetWrap"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('sheetWrap').onclick = function (e) {
      if (e.target.id === 'sheetWrap' && !$('sheetWrap').dataset.lock) return closeSheet();
      var b = e.target.closest('[data-a]');
      if (b && sheetHandler) sheetHandler(b.dataset.a, b);
    };
    var f = $('sheetRoot').querySelector('[autofocus], .btn.primary, .btn');
    if (f) f.focus();
  }
  function closeSheet() { clearInterval(S.poll); sheetHandler = null; var r = $('sheetRoot'); if (r) r.innerHTML = ''; stopCam(); plateStop(); }

  /* ============================ البوابة ============================ */
  function gateSites() {
    if (!S.ref) return [];
    var ids = S.session.gate.siteIds || [];
    return S.ref.sites.filter(function (s) { return ids.indexOf(s.id) >= 0; });
  }
  var HUB_TIPS = [
    ['الاستحمام وتغيير الملابس لكل داخل', 'لا يدخل أحد الموقع قبل غرفة التغيير: استحمام كامل وملابس وأحذية خاصة بالموقع.', 'دليل إدارة الأمهات من هابرد، القسم 1'],
    ['المركبات تُغسل وتُطهَّر بالرش', 'كل مركبة تدخل الموقع تمر بالغسيل والتطهير بالرش، ولا تقترب من العنابر إلا للضرورة.', 'دليل إدارة الأمهات من هابرد، القسم 2.5'],
    ['عمر واحد وسلالة واحدة في الموقع', 'نظام الدخول الكامل والخروج الكامل يقطع دورة انتقال الأمراض بين الأعمار.', 'دليل إدارة الأمهات من هابرد، القسم 1'],
    ['راحة 10 أيام على الأقل بين الدورات', 'بعد التنظيف والتطهير يبقى الموقع فارغاً 10 أيام على الأقل قبل التسكين التالي.', 'دليل إدارة الأمهات من هابرد، القسمان 1 و2.10'],
    ['بيض الأرضية يُعامل كملوث', 'يُجمع بيض الأرضية منفصلاً ويُطهَّر، ولا يُخلط ببيض الأعشاش.', 'دليل إدارة الأمهات من هابرد، القسم 12']
  ];
  function viewGate() {
    var sites = gateSites();
    if (!S.siteId || !sites.some(function (s) { return s.id === S.siteId; })) S.siteId = sites.length ? sites[0].id : '';
    var groups = {};
    sites.forEach(function (s) { (groups[s.sector] = groups[s.sector] || []).push(s); });
    var opts = Object.keys(groups).map(function (g) {
      var o = groups[g].map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === S.siteId ? ' selected' : '') + '>' + esc(s.name) + (s.status !== 'نشط' ? ' (' + s.status + ')' : '') + '</option>'; }).join('');
      return Object.keys(groups).length > 1 ? '<optgroup label="قطاع ' + esc(g) + '">' + o + '</optgroup>' : o;
    }).join('');
    var ext = (S.ref ? S.ref.sites : []).filter(function (s) { return s.external; });
    var tip = HUB_TIPS[Math.floor(Date.now() / 864e5) % HUB_TIPS.length];
    $('main').innerHTML = '<section class="view">' +
      '<div class="hero dark"><div class="gate-hero"><span class="gico">' + icon('gate') + '</span><div><span class="hello">' + greet() + '، ' + esc(S.session.user.name) + '</span><h1 style="font-size:1.35rem">' + esc(S.session.gate.name || 'بوابة الأمن الحيوي') + '</h1></div>' +
      '<div class="clock" id="gateClock">' + esc(fmt(Date.now(), false)) + '<small>' + esc(new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' })) + '</small></div></div></div>' +
      '<div id="gateBanner" class="stack"></div>' +
      '<div class="sos-card"><div><b>' + icon('siren') + ' حالة حرجة؟</b><span>اشتباه مرض، دخول بالقوة، أو عطل في التطهير: بلّغ المدير فوراً</span></div><div class="row"><button type="button" class="btn sos" id="sosBtn">' + icon('siren') + ' بلاغ عاجل</button><a class="btn" href="#comms">' + icon('chat') + ' رسالة للمدير</a></div></div>' +
      gateTools() + '<div id="myReports"></div><div id="showerBox"></div><div id="visitBox"></div>' +
      '<div class="gate-grid"><div class="card">' +
      (sites.length > 1 ? '<div class="field"><label for="siteSel">' + icon('pin') + ' الموقع المتجه إليه أو الخارج منه</label><select id="siteSel">' + opts + '</select></div>' : sites.length ? '<div class="spread"><b>' + icon('pin') + ' ' + esc(sites[0].name) + '</b><span class="pill p-n">مستوى ' + sites[0].level + '</span></div>' : '<div class="infobox">لم يتم ربط حسابك ببوابة. اطلب من المدير ضبط «البوابة» في بيانات المستخدمين.</div>') +
      '<div class="seg" role="group" aria-label="الاتجاه"><button type="button" data-dir="IN" class="' + (S.dir === 'IN' ? 'on' : '') + '">' + icon('inn') + ' دخول</button><button type="button" data-dir="OUT" class="' + (S.dir === 'OUT' ? 'on' : '') + '">' + icon('out') + ' خروج</button></div>' +
      '<div class="field" id="extWrap"' + (S.dir === 'OUT' ? '' : ' hidden') + '><label for="extDest">إقرار الوجهة بعد الخروج</label><select id="extDest"><option value="">موقع من مواقع الشركة أو المنزل</option>' + ext.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select><span class="hint">اختيار وجهة خارجية يجعل النظام يحسب فترة العزل عند العودة.</span></div>' +
      '<div class="scan-hero"><button type="button" class="scan-btn ' + (S.dir === 'OUT' ? 'out' : '') + '" id="scanBtn">' + icon('scan') + '<span>' + (S.dir === 'OUT' ? 'امسح للخروج' : 'امسح الكارت') + '</span></button>' +
      '<span class="small muted">يفتح الكاميرا لقراءة كود QR على الكارت أو ملصق السيارة</span></div>' +
      '<div class="row"><label class="btn grow" for="photoIn">' + icon('camera') + ' تصوير الكود</label><input id="photoIn" type="file" accept="image/*" capture="environment" hidden></div>' +
      '<form class="row" id="manualForm"><div class="field grow"><label for="codeIn">الكارت تالف أو منسي؟ اكتب الكود أو الاسم</label><input id="codeIn" type="text" autocomplete="off" autocapitalize="characters" placeholder="مثال: E001 أو اسم الموظف" list="codeList"><datalist id="codeList">' + (S.ref ? S.ref.items : []).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist></div><button class="btn primary" type="submit">تحقق</button></form>' +
      (MODE === 'demo' ? '<div class="stack" style="gap:6px"><span class="xs muted">أكواد العرض (بدلاً من مسح الكارت):</span><div class="chips" id="chips">' + ['E001', 'E002', 'E003', 'E004', 'E004.2', 'E005', 'E006', 'E007', 'D001', 'V001', 'V002', 'V004', 'Q001', 'G001', 'X999'].map(function (c) { return '<button class="chip" type="button" data-code="' + c + '">' + c + '</button>'; }).join('') + '</div></div>' : '') +
      '</div><div class="stack"><div class="tip"><span class="eyebrow">قاعدة اليوم من دليل هابرد</span><b>' + esc(tip[0]) + '</b><p>' + esc(tip[1]) + '</p><span class="src">' + esc(tip[2]) + '</span></div><div class="card"><div class="card-head"><h2>' + icon('clock') + ' اليوم على هذه البوابة</h2><a href="#log" class="small">السجل كامل</a></div><div id="gateStats"></div></div>' +
      (MODE === 'demo' ? '<div class="card"><h2>' + icon('book') + ' سيناريوهات للتجربة</h2><ul class="small" style="margin:0;padding-inline-start:18px;display:grid;gap:6px">' +
        '<li><b>1111</b> ثم «أمهات الواحات» ثم <b>E001</b>: مهندس كان في تسمين ريجوا أمس، فيُرفض ويصل إشعار للمدير.</li>' +
        '<li>اطلب استثناء، ووافق من الإشعار الذي يظهر كإشعار موبايل المدير.</li>' +
        '<li><b>E002</b> على «أمهات الواحات»: مسموح، ويبدأ مؤقت الاستحمام (دقيقة واحدة في نسخة العرض) ثم تأكيد الدخول.</li>' +
        '<li><b>G001</b> على «مصنع علف الواحات»: زائر بمأمورية مسجلة اليوم فيُسمح له. و<b>G002</b> مورد بلا مأمورية اليوم فيُمنع.</li>' +
        '<li><b>V001</b> على «مصنع علف الواحات»: بعد التطهير تصدر شهادة تطهير للمركبة تظهر في البوابة التالية.</li>' +
        '<li>شغّل «محاكاة انقطاع الإنترنت» وسجّل حركات، ثم أعد الاتصال لترى المزامنة التلقائية.</li>' +
        '<li><b>9999</b> للوحة القيادة: غيّر حالة موقع إلى «إنذار» وأرسل قراراً للبوابات.</li>' +
        '<li><b>V002</b> سيارة سبلة خرجت من محطة 5 منذ 3 ساعات: ممنوعة 24 ساعة. <b>V004</b> تتبع شركة صيانة موقوفة. جرّب «قراءة لوحة مركبة» واختر لوحة تجريبية.</li>' +
        '<li><b>E007</b> عامل جديد لم يجتز التأهيل الإلزامي فيُمنع، و<b>E006</b> عامل جديد اجتازه فيُسمح له.</li>' +
        '<li><b>E004</b> كارت قديم أُبلغ عن فقده: يُرفض ويصل تنبيه للمدير. الكارت البديل <b>E004.2</b> يعمل.</li>' +
        '<li>اكتب اسماً أو كوداً في «الكارت تالف أو منسي» لتجربة الدخول بالتحقق من الهوية.</li></ul></div>' : '') +
      '</div></div></section>';
    if ($('siteSel')) $('siteSel').onchange = function () { S.siteId = this.value; renderSub(); };
    document.querySelectorAll('.seg button').forEach(function (b) { b.onclick = function () { S.dir = b.dataset.dir; render(); }; });
    $('scanBtn').onclick = openCamera;
    $('photoIn').onchange = scanPhoto;
    $('manualForm').onsubmit = function (e) { e.preventDefault(); var c = $('codeIn').value.trim(); if (c) { $('codeIn').value = ''; manualEntry(c); } };
    if ($('chips')) $('chips').onclick = function (e) { var b = e.target.closest('[data-code]'); if (b) doScan(b.dataset.code); };
    $('sosBtn').onclick = function () { reportSheet(); };
    renderGateBanner(); renderGateStats(); renderMyReports(); renderShowers(); renderVisits(); bindGateTools();
  }
  function renderGateBanner() {
    var el = $('gateBanner'); if (!el) return;
    var list = S.notices.filter(function (n) { return !n.acked && !S.session.user.isManager; }).slice(0, 3);
    el.innerHTML = list.map(function (n) {
      return '<div class="notice-banner ' + (n.level === 'عاجل' ? '' : 'normal') + '"><div class="spread"><b>' + icon(n.level === 'عاجل' ? 'alert' : 'mega') + ' ' + esc(n.title) + '</b><span class="xs muted">' + esc(fmt(n.time)) + '</span></div>' +
        (n.body ? '<p class="small">' + esc(n.body) + '</p>' : '') + '<div><button class="btn sm primary" data-ack="' + esc(n.id) + '">' + icon('check') + ' تم الاطلاع</button></div></div>';
    }).join('');
    el.querySelectorAll('[data-ack]').forEach(function (b) { b.onclick = function () { ackNotice(b.dataset.ack); }; });
  }
  function myGateMoves() {
    var g = S.session.gate.name, me = S.session.user.name;
    return Object.keys(S.moves).map(function (k) { return S.moves[k]; }).filter(function (m) { return (m.checkpoint === g || m.user === me) && m.dir !== B.EXT; }).sort(function (a, b) { return b.time - a.time; });
  }
  function renderGateStats() {
    var el = $('gateStats'); if (!el) return;
    var today = myGateMoves().filter(function (m) { return isToday(m.time); });
    var c = { in: 0, deny: 0, out: 0 };
    today.forEach(function (m) { if (m.dir === B.OUT) c.out++; else if (m.decision === B.ALLOW || m.decision === B.OVERRIDE) c.in++; else if (m.decision !== B.CANCELLED) c.deny++; });
    el.innerHTML = '<div class="stat-row"><div class="stat"><b style="color:var(--ok)">' + c.in + '</b><span>دخول</span></div><div class="stat"><b style="color:var(--bad)">' + c.deny + '</b><span>رفض</span></div><div class="stat"><b>' + c.out + '</b><span>خروج</span></div></div>' +
      '<div class="list">' + (today.slice(0, 6).map(moveLi).join('') || '<p class="empty">' + icon('clock') + 'لم تُسجَّل حركات اليوم بعد</p>') + '</div>';
  }
  function decisionPill(m) {
    if (m.flag) return '<span class="pill p-bad">' + icon('alert') + ' مخالفة</span>';
    if (m.dir === B.OUT) return '<span class="pill p-n">خروج</span>';
    if (m.dir === B.EXT) return '<span class="pill p-warn">زيارة خارجية</span>';
    var c = m.decision === B.ALLOW ? 'p-ok' : m.decision === B.OVERRIDE || m.decision === B.PENDING ? 'p-warn' : m.decision === B.CANCELLED ? 'p-n' : 'p-bad';
    return '<span class="pill ' + c + '">' + esc(m.decision) + '</span>';
  }
  function moveLi(m) {
    var d = m.dir === B.OUT ? 'd-n' : m.decision === B.ALLOW ? 'd-ok' : m.decision === B.OVERRIDE || m.decision === B.PENDING ? 'd-warn' : 'd-bad';
    return '<div class="li"><span class="dot ' + d + '"></span><div class="t"><b>' + esc(m.itemName) + '</b><span>' + esc(m.siteName) + ' · ' + esc(m.dir) + '</span></div><div class="meta"><time>' + esc(fmt(m.time, false)) + '</time>' +
      (m._local ? '<span class="pill p-warn">' + icon('wifioff') + ' محفوظة</span>' : decisionPill(m)) + '</div></div>';
  }

  /* ---------- الكاميرا ---------- */
  var scanner = null;
  function openCamera() {
    if (!window.Html5Qrcode) { toast('مكتبة قراءة الكود غير متاحة الآن. استخدم «تصوير الكود» أو اكتب الكود.'); return; }
    openSheet('<div class="sheet-head sh-brand"><h2>' + icon('scan') + ' وجّه الكاميرا للكود</h2></div><div class="sheet-body"><div id="reader"></div><button class="btn big" data-a="close">إلغاء</button></div>', function (a) { if (a === 'close') closeSheet(); });
    scanner = new Html5Qrcode('reader');
    scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 230, height: 230 } }, function (text) {
      stopCam(); closeSheet(); doScan(text);
    }, function () {}).catch(function () {
      closeSheet(); toast('تعذر فتح الكاميرا. اسمح للتطبيق باستخدام الكاميرا، أو استخدم «تصوير الكود».', 5000);
    });
  }
  function stopCam() { var s = scanner; scanner = null; if (s) { try { s.stop().then(function () { s.clear(); }).catch(function () {}); } catch (e) {} } }
  function scanPhoto() {
    var f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    if (!window.Html5Qrcode) return toast('مكتبة قراءة الكود غير متاحة. اكتب الكود يدوياً.');
    var holder = document.createElement('div'); holder.id = 'qrTmp'; holder.hidden = true; document.body.appendChild(holder);
    var sc = new Html5Qrcode('qrTmp');
    sc.scanFile(f, false).then(function (t) { holder.remove(); doScan(t); }).catch(function () { holder.remove(); toast('لم يُقرأ كود في الصورة. اقترب من الكارت وأعد التصوير.'); });
  }

  /* ---------- المسح والقرار ---------- */
  /** دخول بدون مسح الكارت (تالف، منسي، مفقود، أو الكاميرا معطلة): بالكود أو الاسم، مع سبب وتحقق من الهوية، ويُسجَّل كإدخال يدوي */
  var MANUAL_REASONS = ['الكارت تالف ولا يُقرأ', 'نسي الكارت', 'الكارت مفقود', 'الكاميرا لا تعمل'];
  function findItemByText(t) {
    var items = S.ref ? S.ref.items : [], id = BIO_parseCard(t).id;
    var hit = items.filter(function (i) { return i.id === id; })[0];
    if (hit) return hit;
    var q = String(t).trim();
    var byName = items.filter(function (i) { return String(i.name).indexOf(q) >= 0; });
    return byName.length === 1 ? byName[0] : null;
  }
  if (MODE === 'demo') window.BIO_demoScan = function (code) { doScan(code); };
  function manualEntry(text) {
    var it = findItemByText(text);
    if (!it) return doScan(text);
    var reason = '', idOk = false;
    openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('card') + '</div><h2>دخول بدون مسح الكارت</h2></div><div class="sheet-body">' +
      '<div class="who"><div class="avatar">' + icon(kindIcon(it.kind), 'ico-lg') + '</div><div><b>' + esc(it.name) + '</b><span class="small muted">' + esc([it.kind, it.dept, it.id].filter(Boolean).join(' · ')) + '</span></div></div>' +
      '<b class="small">السبب</b><div class="checks">' + MANUAL_REASONS.map(function (r, i) { return '<button type="button" class="check" data-a="why" data-i="' + i + '"><span class="box">' + icon('check') + '</span><span>' + esc(r) + '</span></button>'; }).join('') + '</div>' +
      (S.session.user.isManager ? '' : '<button type="button" class="check" data-a="idok"><span class="box">' + icon('check') + '</span><span>طابقت الاسم والصورة مع البطاقة الشخصية أو كارنيه الشركة</span></button>') +
      '<div class="infobox">' + icon('shield') + ' يُطبَّق نفس فحص العزل تماماً، وتُسجَّل الحركة كـ«إدخال يدوي» بالسبب. «الكارت مفقود» يرسل تنبيهاً للمدير لإيقافه وإصدار بديل.</div>' +
      '<button class="btn primary big" data-a="go" disabled>' + icon('shield') + ' تحقق من السماح بالدخول</button><button class="btn ghost" data-a="close">رجوع</button></div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'why') { reason = MANUAL_REASONS[+b.dataset.i]; document.querySelectorAll('[data-a="why"]').forEach(function (x) { x.classList.toggle('on', x === b); }); }
      if (a === 'idok') { idOk = !idOk; b.classList.toggle('on', idOk); }
      var go = document.querySelector('[data-a="go"]'); if (go) go.disabled = !(reason && (idOk || S.session.user.isManager));
      if (a === 'go' && reason && (idOk || S.session.user.isManager)) { closeSheet(); doScan(it.id, { manual: reason, idChecked: idOk }); }
    });
  }
  function doScan(code, extra) {
    if (S.busy) return;
    if (!S.siteId) return toast('لا يوجد موقع مرتبط بهذه البوابة');
    S.busy = true;
    var p = Object.assign({ id: 'M' + uid(), itemId: String(code).trim(), dir: S.dir, siteId: S.siteId, extSiteId: S.dir === 'OUT' && $('extDest') ? $('extDest').value : '' }, extra || {});
    var useServer = S.online && !S.outbox.length;
    (useServer ? remote('scan', [S.session.pin, p]) : Promise.reject(netErr()))
      .then(function (r) { rememberLocal(r, p); if (p.manual) r.manual = p.manual; return r; })
      .catch(function (e) { if (!e.net) throw e; setOnline(false); var o = offlineScan(p); if (p.manual) o.manual = p.manual; return o; })
      .then(showResult)
      .catch(function (e) { toast(errText(e), 5000); })
      .then(function () { S.busy = false; renderGateStats(); });
  }
  function rememberLocal(r, p) {
    var now = Date.now(), base = { time: now, itemId: r.itemId, itemName: r.item ? r.item.name : 'غير مسجل', siteId: r.site.id, siteName: r.site.name, checkpoint: S.session.gate.name, user: S.session.user.name, updatedAt: now };
    S.moves[r.moveId] = Object.assign({ id: r.moveId, dir: r.dir === 'OUT' ? B.OUT : B.IN, decision: r.decision }, base);
    if (r.ext) S.moves[r.moveId + '-X'] = Object.assign({ id: r.moveId + '-X', dir: B.EXT, decision: B.ALLOW }, base, { siteId: r.ext.id, siteName: r.ext.name, time: now + 1 });
    persist();
  }
  function offlineScan(p) {
    if (!S.ref) throw appErr('لا توجد بيانات محفوظة على الجهاز. اتصل بالإنترنت مرة واحدة على الأقل.');
    var L = localEngine();
    p.time = Date.now();
    var r = L.api.scan(S.session.pin, p);
    L.store.all('moves').forEach(function (m) { if (m.id === p.id || m.id === p.id + '-X') S.moves[m.id] = Object.assign({}, m, { _local: true, offline: 'نعم' }); });
    enqueue('scan', [Object.assign({}, p, { offline: true, offlineDecision: r.decision })]);
    r.offline = true;
    return r;
  }

  function whoHtml(r) {
    var it = r.item;
    return '<div class="who"><div class="avatar">' + icon(kindIcon(it && it.kind), 'ico-lg') + '</div><div><b>' + esc(it ? it.name : 'كود غير مسجل') + '</b><span class="small muted">' +
      esc([it && it.kind, it && it.dept, r.itemId].filter(Boolean).join(' · ')) + '</span><div class="small">' + icon('pin') + ' ' + esc(r.site.name) + '</div></div></div>';
  }
  function permitTag(r) { return '<span class="permit">تصريح عبور · ' + esc((r.site && r.site.name) || '') + ' · ' + esc(fmt(Date.now(), false)) + '</span>'; }
  function showResult(r) {
    var head, body = whoHtml(r), acts = '';
    if (r.offline) body += '<div class="infobox">' + icon('wifioff') + ' تم القرار على الجهاز دون اتصال ببيانات آخر مزامنة' + (S.lastSync ? ' (' + esc(ago(S.lastSync)) + ')' : '') + '. سيراجعه الخادم تلقائياً عند عودة الإنترنت.</div>';
    if (r.duplicate) { toast('هذه الحركة مسجلة بالفعل'); return; }
    if (r.manual) body += '<div class="infobox">' + icon('card') + ' إدخال يدوي بدون مسح الكارت: ' + esc(r.manual) + '. سُجّل بالسبب في السجل.' + (/مفقود/.test(r.manual) ? ' وصل تنبيه للمدير لإيقاف الكارت وإصدار بديل.' : '') + '</div>';
    if (r.dir === 'OUT') {
      head = '<div class="sheet-head sh-out">' + permitTag(r) + '<div class="big-ico">' + icon('out') + '</div><h2>تم تسجيل الخروج</h2></div>';
      if (r.ext) body += '<div class="warnbox">تم تسجيل إقرار بزيارة «' + esc(r.ext.name) + '». سيُحسب العزل تلقائياً عند العودة.</div>';
      if (r.reasons.length) body += '<div class="warnbox">' + esc(r.reasons.join('، ')) + '</div>';
      acts = '<button class="btn primary big" data-a="close">التالي</button>';
    } else if (r.decision === B.ALLOW) {
      head = '<div class="sheet-head sh-ok">' + permitTag(r) + '<div class="big-ico">' + icon('check') + '</div><h2>مسموح بالدخول</h2><span class="small">بعد استكمال إجراءات الأمن الحيوي</span></div>';
      if (r.checks && r.checks.length) {
        body += '<div class="stack" style="gap:8px"><b>' + icon('shield') + ' إجراءات الدخول</b><div class="checks' + (showerMin(r.item) ? ' ro' : '') + '">' + r.checks.map(function (c, i) {
          return '<button type="button" class="check" data-a="tick" data-i="' + i + '"><span class="box">' + icon('check') + '</span><span>' + esc(c) + '</span></button>';
        }).join('') + '</div><span class="src">المرجع: دليل إدارة قطعان الأمهات من هابرد: غرفة تغيير عند مدخل الموقع يستخدمها كل من يدخل (استحمام وتغيير ملابس)، وغسيل وتطهير المركبات بالرش.</span></div>';
        acts = showerMin(r.item) ? '<div class="infobox">' + icon('clock') + ' يبدأ الآن مؤقت الاستحمام وتغيير الملابس (' + showerMin(r.item) + ' دقائق). تابع مسح الآخرين، وسيظهر الشخص في قائمة «في الاستحمام الآن» حتى يكتمل الوقت ثم تؤكد دخوله.</div><button class="btn ok big" data-a="shower">' + icon('clock') + ' بدء مؤقت الاستحمام</button><button class="btn" data-a="cancelEntry">لم يستكمل الإجراءات: إلغاء الدخول</button>'
          : '<button class="btn ok big" data-a="confirm" id="confirmBtn" disabled>' + icon('check') + ' تأكيد الدخول</button><button class="btn" data-a="cancelEntry">لم يستكمل الإجراءات: إلغاء الدخول</button>';
      } else acts = '<button class="btn primary big" data-a="close">التالي</button>';
    } else {
      head = '<div class="sheet-head sh-bad">' + permitTag(r) + '<div class="big-ico">' + icon('x') + '</div><h2>ممنوع الدخول</h2><span class="small">لا تُفتح البوابة</span></div>';
      body += '<div class="reason">' + r.reasons.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
      if (r.allowedAt) body += '<div class="until">' + icon('clock') + '<div><span class="small muted">يُسمح بالدخول</span><br><b>' + esc(fmt(r.allowedAt)) + '</b> <span class="small">(' + esc(left(r.allowedAt)) + ')</span></div></div>';
      if (r.item) {
        body += '<div class="field"><label for="ovNote">طلب دخول استثنائي من مدير الأمن الحيوي</label><textarea id="ovNote" rows="2" placeholder="السبب، مثال: زيارة طارئة لنفوق، استحم وغيّر ملابسه بالكامل"></textarea></div>';
        acts = '<button class="btn big" data-a="override">' + icon('inbox') + ' إرسال طلب استثناء</button>';
      }
      acts += '<button class="btn primary big" data-a="close">التالي</button>';
    }
    if (r.dir !== 'OUT' && r.item && r.item.kind === 'مركبة') body += r.cert ? '<div class="cert-ok">' + icon('shield') + '<div><b>شهادة تطهير سارية · ' + esc(r.cert.id) + '</b><span>طُهّرت في ' + esc(r.cert.checkpoint || r.cert.siteName) + ' ' + esc(ago(r.cert.at)) + ' · صالحة حتى ' + esc(fmt(r.cert.until, false)) + '</span></div></div>' : '<div class="warnbox"><b>لا توجد شهادة تطهير سارية لهذه المركبة</b><span>تُغسل وتُطهر بالكامل هنا، وتصدر لها شهادة جديدة بعد تأكيد الدخول.</span></div>';
    if (r.mission) body += '<div class="cert-ok">' + icon('calendar') + '<div><b>مأمورية مسجلة · ' + esc(r.mission.id) + '</b><span>' + esc(r.mission.kind + ': ' + r.mission.purpose) + ' · ' + esc(fmt(r.mission.visitAt, false)) + '–' + esc(fmt(r.mission.endAt, false)) + '</span></div></div>';
    if (r.warnings && r.warnings.length) body += '<div class="warnbox"><b>تنبيه</b>' + r.warnings.map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</div>';
    var ticks = {};
    openSheet(head + '<div class="sheet-body">' + body + acts + '</div>', function (a, b) {
      if (a === 'close') closeSheet();
      else if (a === 'tick') {
        ticks[b.dataset.i] = !ticks[b.dataset.i]; b.classList.toggle('on', ticks[b.dataset.i]);
        $('confirmBtn').disabled = Object.keys(ticks).filter(function (k) { return ticks[k]; }).length < r.checks.length;
      } else if (a === 'confirm') {
        b.disabled = true;
        act('confirmEntry', [r.moveId, r.checks]).then(function (res) {
          closeSheet(); toast('تم تسجيل الدخول واستكمال الإجراءات');
          if (r.item && r.item.kind === 'مركبة') certSheet((res.data && res.data.cert) || localCert(r));
        }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      } else if (a === 'shower') {
        S.showers.push({ moveId: r.moveId, itemId: r.itemId, name: r.item.name, siteName: r.site.name, start: Date.now(), min: showerMin(r.item), checks: r.checks });
        persist(); closeSheet(); renderShowers(); toast('بدأ مؤقت الاستحمام: ' + r.item.name);
      } else if (a === 'cancelEntry') {
        act('cancelEntry', [r.moveId, 'لم يستكمل إجراءات الأمن الحيوي']).then(function () {
          if (S.moves[r.moveId]) S.moves[r.moveId].decision = B.CANCELLED;
          closeSheet(); renderGateStats(); toast('أُلغي الدخول');
        }).catch(function (e) { toast(errText(e)); });
      } else if (a === 'override') {
        b.disabled = true;
        var reqId = 'R' + uid();
        act('requestOverride', [r.moveId, ($('ovNote') || {}).value || '', reqId]).then(function (res) {
          S.approvals[reqId] = { id: reqId, status: B.PENDING, itemName: r.item.name, siteName: r.site.name, requestedById: S.session.user.id, time: Date.now() };
          if (S.moves[r.moveId]) S.moves[r.moveId].decision = B.PENDING;
          showPending(r, reqId, res.queued);
        }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      }
    });
  }
  function showPending(r, reqId, queued) {
    var phone = S.session.managerPhone || (S.ref && S.ref.settings.MANAGER_PHONE);
    var html = '<div class="sheet-head sh-warn"><div class="big-ico"><span class="spin"></span></div><h2>بانتظار قرار المدير</h2><span class="small">اترك الشخص خارج البوابة حتى يظهر القرار</span></div><div class="sheet-body">' + whoHtml(r) +
      (queued ? '<div class="infobox">' + icon('wifioff') + ' لا يوجد اتصال الآن. حُفظ الطلب وسيُرسل للمدير تلقائياً فور عودة الإنترنت.</div>' : '<div class="infobox">' + icon('bell') + ' وصل إشعار فوري للمدير' + (MODE === 'demo' ? ' (يظهر في أعلى الشاشة كإشعار موبايل المدير)' : '') + '.</div>') +
      (phone ? '<a class="btn big" href="tel:' + esc(phone) + '">' + icon('phone') + ' اتصال بالمدير ' + esc(phone) + '</a>' : '') +
      '<button class="btn" data-a="close">إغلاق والمتابعة لاحقاً</button></div>';
    openSheet(html, function (a) { if (a === 'close') closeSheet(); });
    $('sheetWrap').dataset.lock = '1';
    clearInterval(S.poll);
    S.poll = setInterval(function () {
      var local = S.approvals[reqId];
      var check = S.online && !S.outbox.length ? remote('approvalStatus', [S.session.pin, reqId]).catch(function () { return local; }) : Promise.resolve(local);
      check.then(function (st) {
        if (!st || st.status === B.PENDING || !$('sheetWrap')) return;
        clearInterval(S.poll);
        var ok = st.status === B.APPROVED;
        if (S.moves[r.moveId]) S.moves[r.moveId].decision = ok ? B.OVERRIDE : B.DENY;
        var checks = ok && r.item ? checksOf(r.item) : [];
        openSheet('<div class="sheet-head ' + (ok ? 'sh-ok' : 'sh-bad') + '"><div class="big-ico">' + icon(ok ? 'check' : 'x') + '</div><h2>' + (ok ? 'وافق المدير على الدخول' : 'رفض المدير الدخول') + '</h2></div><div class="sheet-body">' + whoHtml(r) +
          '<p class="small muted">القرار بواسطة: ' + esc(st.decidedBy || '') + '</p>' +
          (ok && checks.length ? '<div class="warnbox"><b>قبل فتح البوابة</b>' + checks.map(function (c) { return '<span>• ' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
          '<button class="btn primary big" data-a="close">التالي</button></div>', function (a) { if (a === 'close') closeSheet(); });
        renderGateStats();
      });
    }, MODE === 'demo' ? 1200 : 3500);
  }
  /* ---------- التحقق من الاستحمام وشهادة تطهير المركبات ---------- */
  function showerMin(item) {
    if (!item || item.kind === 'مركبة' || item.kind === 'معدة') return 0;
    var v = S.ref && S.ref.settings.SHOWER_MIN; v = v == null || v === '' ? 8 : Number(v);
    return v > 0 ? v : 0;
  }
  function mmss(ms) { ms = Math.max(0, ms); var m = Math.floor(ms / 6e4), s = Math.floor(ms % 6e4 / 1e3); return m + ':' + (s < 10 ? '0' : '') + s; }
  function renderShowers() {
    var box = $('showerBox'); clearInterval(S.showerTick);
    if (!box) return;
    if (!S.showers.length) { box.innerHTML = ''; return; }
    var rows = function () {
      return S.showers.map(function (x, i) {
        var tot = x.min * 6e4, left = x.start + tot - Date.now(), done = left <= 0, pct = Math.min(100, (Date.now() - x.start) / tot * 100);
        return '<div class="sw' + (done ? ' sw-done' : '') + '"><span class="av">' + esc(initials(x.name)) + '</span><div class="t"><b>' + esc(x.name) + '</b><span>' + esc(x.siteName) + ' · بدأ ' + esc(fmt(x.start, false)) + '</span><i class="sw-bar"><i style="width:' + pct + '%"></i></i></div>' +
          (done ? '<button type="button" class="btn ok sm" data-sw="' + i + '">' + icon('check') + ' تأكيد الدخول</button>' : '<b class="sw-t mono">' + mmss(left) + '</b>') + '</div>';
      }).join('');
    };
    box.innerHTML = '<div class="card shower-card"><div class="card-head"><h2>' + icon('clock') + ' في الاستحمام الآن</h2><span class="sub">لا يُؤكد الدخول قبل اكتمال الوقت</span></div><div class="sw-list" id="swList">' + rows() + '</div></div>';
    var bind = function () { box.querySelectorAll('[data-sw]').forEach(function (b) { b.onclick = function () { showerConfirm(S.showers[+b.dataset.sw]); }; }); };
    bind();
    S.showerTick = setInterval(function () { var l = $('swList'); if (!l) return clearInterval(S.showerTick); if ($('sheetWrap')) return; l.innerHTML = rows(); bind(); }, 1000);
  }
  function showerConfirm(x) {
    if (!x) return;
    var ticks = {};
    openSheet('<div class="sheet-head sh-ok"><span class="permit">اكتمل وقت الاستحمام · ' + esc(mmss(Date.now() - x.start)) + '</span><div class="big-ico">' + icon('check') + '</div><h2>' + esc(x.name) + '</h2><span class="small">' + esc(x.siteName) + '</span></div><div class="sheet-body">' +
      '<div class="stack" style="gap:8px"><b>' + icon('shield') + ' تأكد من استكمال الإجراءات</b><div class="checks">' + x.checks.map(function (c, i) { return '<button type="button" class="check" data-a="tick" data-i="' + i + '"><span class="box">' + icon('check') + '</span><span>' + esc(c) + '</span></button>'; }).join('') + '</div></div>' +
      '<button class="btn ok big" data-a="confirm" id="confirmBtn" disabled>' + icon('check') + ' تأكيد الدخول</button><button class="btn" data-a="cancelEntry">لم يستكمل الإجراءات: إلغاء الدخول</button><button class="btn ghost" data-a="close">رجوع</button></div>', function (a, b) {
      var drop = function () { S.showers = S.showers.filter(function (y) { return y.moveId !== x.moveId; }); persist(); renderShowers(); };
      if (a === 'close') closeSheet();
      else if (a === 'tick') { ticks[b.dataset.i] = !ticks[b.dataset.i]; b.classList.toggle('on', ticks[b.dataset.i]); $('confirmBtn').disabled = Object.keys(ticks).filter(function (k) { return ticks[k]; }).length < x.checks.length; }
      else if (a === 'confirm') {
        b.disabled = true;
        act('confirmEntry', [x.moveId, x.checks, Math.round((Date.now() - x.start) / 6e4)]).then(function () { closeSheet(); drop(); toast('تم تأكيد دخول ' + x.name + ' بعد استكمال الاستحمام'); }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      } else if (a === 'cancelEntry') {
        act('cancelEntry', [x.moveId, 'لم يستكمل الاستحمام وتغيير الملابس']).then(function () { if (S.moves[x.moveId]) S.moves[x.moveId].decision = B.CANCELLED; closeSheet(); drop(); renderGateStats(); toast('أُلغي الدخول'); }).catch(function (e) { toast(errText(e)); });
      }
    });
  }
  function localCert(r) {
    var h = Number(S.ref && S.ref.settings.VEH_CERT_HOURS) || 6, now = Date.now();
    return { id: 'C-' + String(r.moveId).replace(/^M/, ''), itemId: r.itemId, itemName: r.item.name, siteName: r.site.name, checkpoint: S.session.gate.name, by: S.session.user.name, at: now, until: now + h * 36e5, checks: r.checks || [] };
  }
  function certSheet(c) {
    var txt = '🚚 شهادة تطهير مركبة · ' + c.id + '\n' + c.itemName + ' (' + c.itemId + ')\nطُهّرت في: ' + (c.checkpoint || c.siteName) + '\nالوقت: ' + fmt(c.at) + '\nصالحة حتى: ' + fmt(c.until) + '\nالإجراءات: ' + c.checks.join('، ') + '\nبواسطة: ' + (c.by || '');
    openSheet('<div class="sheet-head sh-ok"><span class="permit">شهادة تطهير مركبة · ' + esc(c.id) + '</span><div class="big-ico">' + icon('truck') + '</div><h2>' + esc(c.itemName) + '</h2><span class="small mono">' + esc(c.itemId) + '</span></div><div class="sheet-body">' +
      '<div class="cert"><div class="cert-qr" id="certQr"></div><dl><dt>مكان التطهير</dt><dd>' + esc(c.checkpoint || c.siteName) + '</dd><dt>الوقت</dt><dd>' + esc(fmt(c.at)) + '</dd><dt>صالحة حتى</dt><dd><b>' + esc(fmt(c.until)) + '</b></dd><dt>الإجراءات</dt><dd>' + esc(c.checks.join('، ')) + '</dd></dl></div>' +
      '<p class="xs muted">تُعرض الشهادة على بوابة الموقع التالي عند مسح كود المركبة، وبعد انتهاء صلاحيتها تحتاج المركبة تطهيراً جديداً.</p>' +
      '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waLink(txt)) + '">' + icon('wa') + ' إرسال الشهادة للسائق على واتساب</a><button class="btn primary big" data-a="close">التالي</button></div>', function (a) { if (a === 'close') closeSheet(); });
    if (window.QRCode && $('certQr')) new QRCode($('certQr'), { text: c.itemId, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
  }
  function checksOf(item) {
    var st = S.ref.settings, k = item.kind;
    return BIO_list(k === 'مركبة' ? st.CHECKS_VEHICLE : k === 'معدة' ? st.CHECKS_EQUIPMENT : st.CHECKS_PERSON);
  }

  /* ============================ المأموريات والزيارات (تسجيل مسبق قبل الموعد) ============================ */
  var MS_CLS = { 'مسجلة في الموعد': 'p-ok', 'متأخرة: تحتاج استثناء': 'p-warn', 'معتمدة استثنائياً': 'p-info', 'مرفوضة': 'p-bad', 'تمت الزيارة': 'p-n' };
  function localInput(t) { var d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); }
  function dayLabel(t) {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0); var diff = Math.floor((t - d0.getTime()) / 864e5);
    return diff === 0 ? 'اليوم' : diff === 1 ? 'غداً' : diff === -1 ? 'أمس' : new Date(t).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });
  }
  /* ============================ طلب المأمورية الذاتي للموظف (بدون حساب) ============================ */
  function selfLink() { var u = appLink().split('?')[0]; return u + '?p=mission#mission'; }
  function selfLinkText() {
    return '📋 تسجيل المأموريات والزيارات · ' + (CFG.COMPANY || 'كايرو ثري إيه') + '\nأي مأمورية عمل أو زيارة أو صيانة أو توريد لموقع من مواقع الشركة تُسجل من هذا الرابط قبل موعدها بـ 24 ساعة على الأقل:\n' + selfLink() +
      '\n\nادخل بكودك المكتوب على كارت الأمن الحيوي ورقم هاتفك. يصل الطلب لمدير الأمن الحيوي بالإيميل والإشعار فوراً، وتظهر المأمورية لأمن البوابة يوم الزيارة.';
  }
  function selfLinkSheet() {
    openSheet('<div class="sheet-head sh-dark"><span class="permit">بدون رقم سري</span><div class="big-ico">' + icon('link') + '</div><h2>رابط تسجيل المأموريات للموظفين</h2><span class="small">يدخل الموظف بكوده ورقم هاتفه ويرسل المأمورية بنفسه</span></div><div class="sheet-body">' +
      '<div class="field"><label for="slUrl">الرابط</label><input id="slUrl" type="text" dir="ltr" readonly value="' + esc(selfLink()) + '"></div>' +
      (S.ref && S.ref.settings.APP_URL ? '' : '<div class="lk-warn">' + icon('alert') + '<span>لم يُضبط رابط التطبيق في الإعدادات (APP_URL)، فالرابط الظاهر هو رابط هذا الجهاز. اكتب رابط /exec في ورقة الإعدادات ليصل للموظفين الرابط الصحيح.</span></div>') +
      '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waLink(selfLinkText())) + '">' + icon('wa') + ' إرسال الرابط لمجموعة الموظفين على واتساب</a><button class="btn big" data-a="copy">' + icon('copy') + ' نسخ الرابط</button><button class="btn ghost" data-a="close">إغلاق</button></div>', function (a) {
      if (a === 'copy') { var i = $('slUrl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { toast('تم نسخ الرابط'); }, function () { try { document.execCommand('copy'); toast('تم نسخ الرابط'); } catch (e) {} }); }
      else closeSheet();
    });
  }
  function showSelfMission() {
    stopCam();
    var who = null;
    try { who = JSON.parse(localStorage.getItem('bio-self') || 'null'); } catch (e) {}
    document.body.innerHTML = demoStrip() +
      '<div class="login self"><div class="login-hero"><div class="logo">' + logoImg() + '</div><h1>تسجيل مأمورية أو زيارة</h1><p>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + ' · لكل موظف سيذهب لموقع من مواقع الشركة في مأمورية عمل أو زيارة أو صيانة أو توريد</p>' +
      '<ol class="self-steps"><li><b>1</b><span>ادخل بكودك ورقم هاتفك</span></li><li><b>2</b><span>اختر الموقع والموعد واكتب الغرض</span></li><li><b>3</b><span>يصل الطلب للمدير بالإيميل والإشعار وتظهر المأمورية للبوابة</span></li></ol>' +
      '<div class="login-feats"><span>' + icon('clock') + ' قبل الموعد بـ 24 ساعة على الأقل</span><span>' + icon('shield') + ' بدون رقم سري</span></div></div>' +
      '<div class="login-side"><div class="login-card self-card" id="selfCard"></div><p class="login-foot"><a href="#" id="selfBack">' + icon('back') + ' دخول المديرين وأمن البوابات</a> · <a href="#" id="selfTrain">' + icon('grad') + ' التدريب والاختبار</a></p></div></div><div class="toasts" id="toasts"></div>';
    bindDemoStrip();
    $('selfTrain').onclick = function (e) { e.preventDefault(); showSelfTrain(); };
    $('selfBack').onclick = function (e) { e.preventDefault(); window.BIO_START = ''; try { history.replaceState(null, '', location.pathname); } catch (x) { location.hash = ''; } if (S.session) location.reload(); else boot(); };
    function idStep(msg) {
      $('selfCard').innerHTML = '<div class="lc-title"><b>بياناتك</b><span class="small muted">الكود مكتوب على كارت الأمن الحيوي الخاص بك</span></div>' +
        '<form id="selfId" class="stack"><div class="field"><label for="sCode">كود الموظف</label><input id="sCode" type="text" dir="ltr" autocomplete="off" required placeholder="مثال: E001" value="' + esc(who ? who.code : '') + '"></div>' +
        '<div class="field"><label for="sPhone">رقم هاتفك المحمول</label><input id="sPhone" type="tel" dir="ltr" inputmode="tel" required placeholder="01xxxxxxxxx" value="' + esc(who ? who.phone : '') + '"><span class="hint">يُطابَق مع رقمك المسجل في الشركة. لو لم يكن لك رقم مسجل يُربط هذا الرقم بكودك من أول طلب</span></div>' +
        '<div class="login-err" id="sErr" role="alert">' + esc(msg || '') + '</div><button class="btn primary big" type="submit">متابعة ' + icon('chev') + '</button></form>' +
        (MODE === 'demo' ? '<div class="demo-pins"><span class="xs muted">للتجربة في نسخة العرض:</span><button type="button" id="sDemo"><span>م. مهندس تسمين (مثال)</span><b>E001</b></button></div>' : '');
      if ($('sDemo')) $('sDemo').onclick = function () { $('sCode').value = 'E001'; $('sPhone').value = '01012345678'; };
      $('selfId').onsubmit = function (e) {
        e.preventDefault();
        var code = $('sCode').value.trim(), phone = $('sPhone').value.trim(), b = $('selfId').querySelector('[type=submit]');
        b.disabled = true; $('sErr').innerHTML = '<span class="spin"></span>';
        remote('selfMissionInfo', [code, phone]).then(function (d) {
          who = { code: code, phone: phone }; try { localStorage.setItem('bio-self', JSON.stringify(who)); } catch (x) {}
          formStep(d);
        }).catch(function (x) { b.disabled = false; $('sErr').textContent = x.net ? 'لا يوجد اتصال بالإنترنت. إرسال المأمورية يحتاج اتصالاً.' : errText(x); });
      };
    }
    function mine(d) {
      if (!d.missions.length) return '';
      return '<div class="self-mine"><h3>طلباتك الأخيرة</h3>' + d.missions.map(function (m) {
        return '<div class="li"><span class="av">' + icon('calendar') + '</span><div class="t"><b>' + esc(m.kind + ' · ' + m.siteName) + '</b><span>' + esc(dayLabel(m.visitAt) + ' ' + fmt(m.visitAt, false)) + ' · ' + esc(m.id) + (m.note ? ' · ' + esc(m.note) : '') + '</span></div><div class="meta"><span class="pill ' + (MS_CLS[m.status] || 'p-n') + '">' + esc(m.status) + '</span></div></div>';
      }).join('') + '</div>';
    }
    function formStep(d) {
      var t0 = Date.now() + 26 * 36e5; t0 = Math.ceil(t0 / 18e5) * 18e5;
      var contacts = ['لا توجد', 'مزرعة دواجن أخرى', 'مزرعة عملاء', 'سوق طيور حية', 'مجزر', 'معمل تفريخ خارجي'];
      var sectors = {}; d.sites.forEach(function (x) { (sectors[x.sector || 'أخرى'] = sectors[x.sector || 'أخرى'] || []).push(x); });
      $('selfCard').innerHTML = '<div class="self-me"><span class="avatar">' + icon('user') + '</span><div><b>' + esc(d.me.name) + '</b><span class="mono">' + esc(d.me.id) + (d.me.dept ? ' · ' + esc(d.me.dept) : '') + '</span></div><button type="button" class="btn sm ghost" id="sOut">تغيير</button></div>' +
        '<form id="sForm" class="stack"><div class="grid-2" style="gap:12px"><div class="field"><label for="mKind">نوع المأمورية</label><select id="mKind">' + d.kinds.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="mSite">الموقع الذي ستذهب إليه</label><select id="mSite">' + Object.keys(sectors).map(function (k) { return '<optgroup label="قطاع ' + esc(k) + '">' + sectors[k].map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></div></div>' +
        '<div class="grid-2" style="gap:12px"><div class="field"><label for="mAt">موعد الوصول</label><input id="mAt" type="datetime-local" value="' + localInput(t0) + '" required></div><div class="field"><label for="mEnd">موعد الانتهاء</label><input id="mEnd" type="datetime-local" value="' + localInput(t0 + 4 * 36e5) + '"></div></div>' +
        '<div id="mLead"></div>' +
        '<div class="field"><label for="mPurpose">الغرض من المأمورية</label><textarea id="mPurpose" rows="2" required placeholder="مثال: متابعة برنامج التحصين في المحطة"></textarea></div>' +
        '<div class="grid-2" style="gap:12px"><div class="field"><label for="mContact">آخر مخالطة دواجن خارج الشركة</label><select id="mContact">' + contacts.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div><div class="field"><label for="mContactAt">تاريخها</label><input id="mContactAt" type="datetime-local"></div></div>' +
        '<div class="grid-2" style="gap:12px"><div class="field"><label for="mVehicle">المركبة (إن وجدت)</label><input id="mVehicle" type="text" placeholder="النوع ورقم اللوحة"></div><div class="field"><label for="mEmail">إيميلك لاستلام نسخة وقرار المدير</label><input id="mEmail" type="text" inputmode="email" dir="ltr" placeholder="name@company.com" value="' + esc(who && who.email || '') + '"></div></div>' +
        '<div class="login-err" id="sErr" role="alert"></div><button class="btn primary big" type="submit">' + icon('send') + ' إرسال المأمورية للمدير</button></form>' + mine(d);
      $('sOut').onclick = function () { try { localStorage.removeItem('bio-self'); } catch (x) {} who = null; idStep(); };
      function lead() {
        var t = new Date($('mAt').value).getTime(), h = (t - Date.now()) / 36e5;
        $('mLead').innerHTML = !t ? '' : h < 0 ? '<div class="lk-warn">' + icon('alert') + '<span>الموعد في الماضي</span></div>' : h < d.lead ? '<div class="lk-warn">' + icon('alert') + '<span>الموعد بعد <b>' + Math.round(h * 10) / 10 + ' ساعة</b> فقط، أقل من ' + d.lead + ' ساعة المطلوبة. ستُرسل <b>متأخرة</b> ولن تُدخلك البوابة إلا بعد موافقة مدير الأمن الحيوي.</span></div>' : '<div class="cert-ok">' + icon('check') + '<div><b>في الموعد: قبل الزيارة بـ ' + Math.round(h) + ' ساعة</b><span>تُسجل مباشرة وتظهر للبوابة يوم الزيارة</span></div></div>';
      }
      $('mAt').oninput = function () { var t = new Date($('mAt').value).getTime(); if (t) $('mEnd').value = localInput(t + 4 * 36e5); lead(); };
      lead();
      $('sForm').onsubmit = function (e) {
        e.preventDefault();
        var b = $('sForm').querySelector('[type=submit]'); b.disabled = true; $('sErr').innerHTML = '<span class="spin"></span>';
        who.email = $('mEmail').value.trim(); try { localStorage.setItem('bio-self', JSON.stringify(who)); } catch (x) {}
        remote('selfMission', [who.code, who.phone, { id: 'MS-' + uid(), kind: $('mKind').value, siteId: $('mSite').value, visitAt: new Date($('mAt').value).getTime(), endAt: new Date($('mEnd').value).getTime() || null, purpose: $('mPurpose').value,
          lastContact: $('mContact').value, lastContactAt: $('mContactAt').value ? new Date($('mContactAt').value).getTime() : null, vehicle: $('mVehicle').value, email: who.email }]).then(function (r) { doneStep(r); })
          .catch(function (x) { b.disabled = false; $('sErr').textContent = x.net ? 'لا يوجد اتصال بالإنترنت. أعد المحاولة عند توفر الاتصال.' : errText(x); });
      };
    }
    function doneStep(r) {
      var m = r.mission;
      $('selfCard').innerHTML = '<div class="self-done ' + (r.late ? 'is-late' : 'is-ok') + '"><div class="big-ico">' + icon(r.late ? 'clock' : 'check') + '</div><h2>' + (r.late ? 'أُرسلت متأخرة: بانتظار موافقة المدير' : 'تم تسجيل المأمورية') + '</h2><span class="mono">' + esc(m.id) + '</span>' +
        '<p>' + (r.late ? 'سُجلت قبل الموعد بـ ' + m.leadHours + ' ساعة فقط. لن تُدخلك البوابة إلا بعد موافقة مدير الأمن الحيوي، وسيصلك قراره' + (m.email ? ' على إيميلك' : '') + '.' : 'وصل إيميل وإشعار فوري لمدير الأمن الحيوي، وستظهر المأمورية لأمن بوابة الموقع يوم الزيارة.' + (m.email ? ' ووصلتك نسخة على إيميلك.' : '')) + '</p></div>' +
        '<div class="cert"><div class="cert-qr" id="sQr"></div><dl><dt>الاسم</dt><dd>' + esc(m.visitor) + '</dd><dt>كود الدخول</dt><dd><b class="mono">' + esc(m.itemId) + '</b></dd><dt>الموقع</dt><dd>' + esc(m.siteName) + '</dd><dt>الموعد</dt><dd>' + esc(dayLabel(m.visitAt) + ' ' + fmt(m.visitAt, false)) + ' حتى ' + esc(fmt(m.endAt, false)) + '</dd></dl></div>' +
        '<div class="self-rules"><b>' + icon('shield') + ' قبل الذهاب</b><span>لا تزر أي مزرعة دواجن أو سوق طيور قبل الزيارة بـ 72 ساعة</span><span>معك كارت الأمن الحيوي، واستحمام كامل وتغيير الملابس عند البوابة</span></div>' +
        '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waLink(passText(m))) + '">' + icon('wa') + ' حفظ التصريح على واتساب</a><button class="btn primary big" type="button" id="sAgain">' + icon('plus') + ' مأمورية أخرى</button>';
      if (window.QRCode && $('sQr')) new QRCode($('sQr'), { text: m.itemId, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });
      $('sAgain').onclick = function () { remote('selfMissionInfo', [who.code, who.phone]).then(formStep).catch(function (x) { toast(errText(x)); }); };
    }
    if (who && who.code && who.phone) remote('selfMissionInfo', [who.code, who.phone]).then(formStep).catch(function (x) { idStep(x.net ? '' : errText(x)); });
    else idStep();
  }
  function passText(m) {
    return '📋 تصريح زيارة · ' + (CFG.COMPANY || 'كايرو ثري إيه') + '\nرقم المأمورية: ' + m.id + '\nالاسم: ' + m.visitor + '\nكود الدخول: ' + m.itemId + '\nالموقع: ' + m.siteName + '\nالموعد: ' + dayLabel(m.visitAt) + ' ' + fmt(m.visitAt, false) + ' حتى ' + fmt(m.endAt, false) +
      '\n\nتعليمات الأمن الحيوي:\n• لا تزر أي مزرعة دواجن أو سوق طيور قبل الزيارة بـ 72 ساعة\n• استحمام كامل وتغيير الملابس والحذاء عند البوابة\n• أظهر كود الدخول لأمن البوابة\n• لن يُسمح بالدخول خارج موعد الزيارة';
  }
  function missionCard(m, d) {
    var canAct = d.canDecide && m.status === 'متأخرة: تحتاج استثناء', canStop = d.canDecide && m.status === 'مسجلة في الموعد' && !m.arrivedAt && m.endAt > Date.now();
    return '<article class="ms ms-' + (m.late ? 'late' : 'ok') + '"><div class="ms-when"><b>' + esc(fmt(m.visitAt, false)) + '</b><span>' + esc(dayLabel(m.visitAt)) + '</span><small>حتى ' + esc(fmt(m.endAt, false)) + '</small></div>' +
      '<div class="ms-main"><div class="ms-top"><span class="pill p-n">' + esc(m.kind) + '</span><span class="pill ' + (MS_CLS[m.status] || 'p-n') + '">' + esc(m.status) + '</span><span class="xs muted mono">' + esc(m.id) + '</span></div>' +
      '<b class="ms-name">' + esc(m.visitor) + (m.company ? ' <span class="muted small">· ' + esc(m.company) + '</span>' : '') + '</b>' +
      '<span class="small">' + icon('pin') + ' ' + esc(m.siteName) + ' · كود الدخول <b class="mono">' + esc(m.itemId) + '</b></span>' +
      '<span class="small muted">' + esc(m.purpose) + '</span>' +
      '<div class="ms-meta"><span class="' + (m.late ? 'lead-bad' : 'lead-ok') + '">' + icon('clock') + ' سُجلت قبل الموعد بـ ' + m.leadHours + ' ساعة</span>' + (m.lastContact && m.lastContact !== 'لا توجد' ? '<span class="lead-bad">' + icon('alert') + ' آخر مخالطة: ' + esc(m.lastContact) + (m.lastContactAt ? ' ' + esc(ago(m.lastContactAt)) : '') + '</span>' : '') + (m.vehicle ? '<span>' + icon('truck') + ' ' + esc(m.vehicle) + '</span>' : '') + '<span>' + icon('user') + ' ' + esc(m.requestedBy) + '</span>' + (m.arrivedAt ? '<span class="lead-ok">' + icon('check') + ' وصل ' + esc(fmt(m.arrivedAt, false)) + '</span>' : '') + '</div>' +
      (m.decidedBy ? '<span class="xs muted">القرار: ' + esc(m.decidedBy) + (m.note ? ' · ' + esc(m.note) : '') + '</span>' : '') +
      '<div class="ms-acts">' + (canStop ? '<button type="button" class="btn sm ghost" data-msd="0" data-id="' + esc(m.id) + '">' + icon('x') + ' رفض</button>' : '') + (canAct ? '<button type="button" class="btn sm ok" data-msd="1" data-id="' + esc(m.id) + '">' + icon('check') + ' اعتماد استثنائي</button><button type="button" class="btn sm bad" data-msd="0" data-id="' + esc(m.id) + '">' + icon('x') + ' رفض</button>' : '') +
      (m.status !== 'مرفوضة' ? '<a class="btn sm wa" target="_blank" rel="noopener" href="' + esc(waLink(passText(m))) + '">' + icon('wa') + ' تصريح الزائر</a>' : '') + '</div></div></article>';
  }
  function viewMissions() {
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>' + icon('calendar') + ' المأموريات والزيارات</h1><p>كل مأمورية عمل أو زيارة أو توريد تُسجل هنا قبل موعدها بـ 24 ساعة على الأقل. يصل إيميل وإشعار فوري للمدير، وتظهر للبوابة يوم الزيارة. البوابة لا تُدخل أي زائر أو مورد بدون مأمورية مسجلة لنفس الموقع ونفس اليوم.</p></div><div class="row"><button class="btn" type="button" id="msLink">' + icon('link') + ' رابط الموظفين</button><button class="btn primary" type="button" id="msNew">' + icon('plus') + ' تسجيل مأمورية</button></div></div><div id="msOut"><div class="card"><p class="empty"><span class="spin"></span></p></div></div></section>';
    function load() {
      remote('missions', [S.session.pin]).then(draw).catch(function (e) { $('msOut').innerHTML = e.net ? offlineCard('المأموريات') : ''; if (!e.net) toast(errText(e)); });
    }
    function draw(d) {
      var now = d.now, ms = d.missions;
      var need = ms.filter(function (m) { return m.status === 'متأخرة: تحتاج استثناء' && m.endAt > now; });
      var today = ms.filter(function (m) { return m.status !== 'متأخرة: تحتاج استثناء' && dayLabel(m.visitAt) === 'اليوم'; });
      var next = ms.filter(function (m) { return m.status !== 'متأخرة: تحتاج استثناء' && m.visitAt > now && dayLabel(m.visitAt) !== 'اليوم'; });
      var past = ms.filter(function (m) { return need.indexOf(m) < 0 && today.indexOf(m) < 0 && next.indexOf(m) < 0; }).reverse().slice(0, 15);
      var onTime = ms.filter(function (m) { return !m.late; }).length;
      var sec = function (title, sub, list, empty) { return '<div class="card"><div class="card-head"><div><span class="kick">' + sub + '</span><h2>' + title + '</h2></div><span class="badge">' + list.length + '</span></div>' + (list.length ? '<div class="ms-list">' + list.map(function (m) { return missionCard(m, d); }).join('') + '</div>' : '<p class="empty">' + esc(empty) + '</p>') + '</div>'; };
      $('msOut').innerHTML = '<div class="ms-kpis">' + [['زيارات اليوم', today.length], ['قادمة', next.length], ['تحتاج قرارك', need.length, need.length ? 'hot' : ''], ['الالتزام بالتسجيل المسبق', ms.length ? Math.round(onTime / ms.length * 100) + '%' : '—']].map(function (k) { return '<div class="ck ' + (k[2] || '') + '"><span class="ck-l">' + k[0] + '</span><b class="mono">' + k[1] + '</b></div>'; }).join('') + '</div>' +
        (need.length ? sec('تحتاج قرارك', 'سُجلت قبل موعدها بأقل من ' + d.lead + ' ساعة', need, '') : '') +
        sec('زيارات اليوم', 'تظهر للبوابة تلقائياً', today, 'لا توجد زيارات مسجلة اليوم') + sec('القادمة', 'مسجلة في الموعد', next, 'لا توجد زيارات قادمة') + (past.length ? sec('السابقة', 'آخر 15', past, '') : '');
      $('msOut').querySelectorAll('[data-msd]').forEach(function (b) {
        b.onclick = function () {
          var ok = b.dataset.msd === '1';
          openSheet('<div class="sheet-head ' + (ok ? 'sh-ok' : 'sh-bad') + '"><span class="permit">مأمورية متأخرة</span><div class="big-ico">' + icon(ok ? 'check' : 'x') + '</div><h2>' + (ok ? 'اعتماد استثنائي' : 'رفض المأمورية') + '</h2></div><div class="sheet-body"><div class="field"><label for="msNote">' + (ok ? 'سبب الاستثناء (يُسجل ويصل لمقدم الطلب)' : 'سبب الرفض') + '</label><textarea id="msNote" rows="2"></textarea></div><button class="btn ' + (ok ? 'ok' : 'bad') + ' big" data-a="go">تأكيد</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a, x) {
            if (a === 'close') return closeSheet();
            x.disabled = true;
            remote('decideMission', [S.session.pin, b.dataset.id, ok, $('msNote').value]).then(function (r) { closeSheet(); toast(r.status + ' · وصل الإشعار لمقدم الطلب'); load(); sync(); }).catch(function (e) { x.disabled = false; toast(errText(e)); });
          });
        };
      });
      $('msNew').onclick = function () { missionForm(d, load); };
      $('msLink').onclick = selfLinkSheet;
    }
    load();
  }
  function missionForm(d, done) {
    var t0 = Date.now() + 26 * 36e5; t0 = Math.ceil(t0 / 18e5) * 18e5;
    var contacts = ['لا توجد', 'مزرعة دواجن أخرى', 'مزرعة عملاء', 'سوق طيور حية', 'مجزر', 'معمل تفريخ خارجي'];
    openSheet('<div class="sheet-head sh-dark"><span class="permit">تسجيل مسبق · قبل الموعد بـ ' + d.lead + ' ساعة على الأقل</span><div class="big-ico">' + icon('calendar') + '</div><h2>مأمورية أو زيارة جديدة</h2></div><div class="sheet-body"><form id="msForm" class="stack">' +
      '<div class="grid-2" style="gap:12px"><div class="field"><label for="mKind">النوع</label><select id="mKind">' + d.kinds.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="mSite">الموقع</label><select id="mSite">' + d.sites.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grid-2" style="gap:12px"><div class="field"><label for="mVisitor">اسم الزائر أو المأمور</label><input id="mVisitor" type="text" required list="mItems" placeholder="الاسم الكامل"><datalist id="mItems">' + (S.ref ? S.ref.items : []).filter(function (i) { return i.kind !== 'مركبة' && i.kind !== 'معدة'; }).map(function (i) { return '<option value="' + esc(i.name) + '">' + esc(i.id) + '</option>'; }).join('') + '</datalist><span class="hint">زائر جديد يُسجل تلقائياً بكود دخول يُرسل له</span></div>' +
      '<div class="field"><label for="mCompany">الجهة</label><input id="mCompany" type="text" placeholder="مثال: شركة الأدوية، الطب البيطري الحكومي"></div></div>' +
      '<div class="grid-2" style="gap:12px"><div class="field"><label for="mAt">موعد الوصول</label><input id="mAt" type="datetime-local" value="' + localInput(t0) + '" required></div><div class="field"><label for="mEnd">نهاية الزيارة</label><input id="mEnd" type="datetime-local" value="' + localInput(t0 + 4 * 36e5) + '"></div></div>' +
      '<div id="mLead"></div>' +
      '<div class="field"><label for="mPurpose">الغرض من المأمورية</label><textarea id="mPurpose" rows="2" required placeholder="مثال: صيانة خطوط المعالف قبل التسكين"></textarea></div>' +
      '<div class="grid-2" style="gap:12px"><div class="field"><label for="mContact">آخر مخالطة دواجن خارج الشركة</label><select id="mContact">' + contacts.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div><div class="field"><label for="mContactAt">تاريخها</label><input id="mContactAt" type="datetime-local"></div></div>' +
      '<div class="grid-2" style="gap:12px"><div class="field"><label for="mPhone">هاتف الزائر</label><input id="mPhone" type="tel" dir="ltr"></div><div class="field"><label for="mVehicle">المركبة (إن وجدت)</label><input id="mVehicle" type="text" placeholder="النوع ورقم اللوحة"></div></div>' +
      '<div class="field"><label for="mEmail">إيميلك لاستلام نسخة وقرار المدير</label><input id="mEmail" type="text" dir="ltr" placeholder="name@company.com"></div>' +
      '<button class="btn primary big" type="submit">' + icon('send') + ' إرسال المأمورية للمدير</button><button class="btn ghost" type="button" data-a="close">إلغاء</button></form></div>', function (a) { if (a === 'close') closeSheet(); });
    function lead() {
      var t = new Date($('mAt').value).getTime(), h = (t - Date.now()) / 36e5;
      $('mLead').innerHTML = !t ? '' : h < 0 ? '<div class="lk-warn">' + icon('alert') + '<span>الموعد في الماضي</span></div>' : h < d.lead ? '<div class="lk-warn">' + icon('alert') + '<span>الموعد بعد <b>' + Math.round(h * 10) / 10 + ' ساعة</b> فقط، أقل من ' + d.lead + ' ساعة المطلوبة. ستُسجل <b>متأخرة</b> ولن تُدخلها البوابة إلا باستثناء من مدير الأمن الحيوي.</span></div>' : '<div class="cert-ok">' + icon('check') + '<div><b>في الموعد: قبل الزيارة بـ ' + Math.round(h) + ' ساعة</b><span>ستظهر للبوابة تلقائياً يوم الزيارة</span></div></div>';
    }
    $('mAt').oninput = function () { var t = new Date($('mAt').value).getTime(); if (t) $('mEnd').value = localInput(t + 4 * 36e5); lead(); };
    lead();
    $('msForm').onsubmit = function (e) {
      e.preventDefault();
      var name = $('mVisitor').value.trim(), it = (S.ref ? S.ref.items : []).filter(function (i) { return i.name === name; })[0];
      var b = $('msForm').querySelector('[type=submit]'); b.disabled = true;
      remote('createMission', [S.session.pin, { id: 'MS-' + uid(), kind: $('mKind').value, siteId: $('mSite').value, visitor: name, itemId: it ? it.id : '', company: $('mCompany').value, phone: $('mPhone').value, visitAt: new Date($('mAt').value).getTime(), endAt: new Date($('mEnd').value).getTime() || null,
        purpose: $('mPurpose').value, lastContact: $('mContact').value, lastContactAt: $('mContactAt').value ? new Date($('mContactAt').value).getTime() : null, vehicle: $('mVehicle').value, email: $('mEmail').value }]).then(function (r) {
        var m = r.mission;
        openSheet('<div class="sheet-head ' + (r.late ? 'sh-warn' : 'sh-ok') + '"><span class="permit">' + esc(m.id) + '</span><div class="big-ico">' + icon(r.late ? 'clock' : 'check') + '</div><h2>' + (r.late ? 'سُجلت متأخرة' : 'تم تسجيل المأمورية') + '</h2><span class="small">' + (r.late ? 'بانتظار استثناء مدير الأمن الحيوي' : 'وصل إيميل وإشعار للمدير') + '</span></div><div class="sheet-body">' +
          '<div class="cert"><div class="cert-qr" id="msQr"></div><dl><dt>الزائر</dt><dd>' + esc(m.visitor) + '</dd><dt>كود الدخول</dt><dd><b class="mono">' + esc(m.itemId) + '</b></dd><dt>الموقع</dt><dd>' + esc(m.siteName) + '</dd><dt>الموعد</dt><dd>' + esc(dayLabel(m.visitAt) + ' ' + fmt(m.visitAt, false)) + '</dd></dl></div>' +
          '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waLink(passText(m))) + '">' + icon('wa') + ' إرسال التصريح للزائر على واتساب</a><button class="btn primary big" data-a="close">تم</button></div>', function (a) { if (a === 'close') { closeSheet(); done(); } });
        if (window.QRCode && $('msQr')) new QRCode($('msQr'), { text: m.itemId, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
        sync();
      }).catch(function (e) { b.disabled = false; toast(errText(e)); });
    };
  }
  /** زيارات اليوم على البوابة (من بيانات المزامنة فتعمل دون اتصال) */
  function renderVisits() {
    var box = $('visitBox'); if (!box || !S.ref) return;
    var mine = gateSites().map(function (s) { return s.id; }), now = Date.now();
    var list = (S.ref.missions || []).filter(function (m) { return mine.indexOf(m.siteId) >= 0 && m.endAt > now && m.visitAt < now + 18 * 36e5; }).sort(function (a, b) { return a.visitAt - b.visitAt; });
    box.innerHTML = '<div class="card visit-card"><div class="card-head"><h2>' + icon('calendar') + ' زيارات اليوم</h2><a href="#missions" class="small">كل المأموريات</a></div>' + (list.length ? '<div class="list">' + list.map(function (m) {
      return '<div class="li"><span class="av">' + esc(initials(m.visitor)) + '</span><div class="t"><b>' + esc(m.visitor) + '</b><span>' + esc(m.siteName) + ' · ' + esc(fmt(m.visitAt, false)) + '–' + esc(fmt(m.endAt, false)) + ' · ' + esc(m.kind) + '</span></div><div class="meta">' + (m.arrivedAt ? '<span class="pill p-ok">وصل</span>' : '<button type="button" class="chip" data-vcode="' + esc(m.itemId) + '" data-vsite="' + esc(m.siteId) + '">' + esc(m.itemId) + '</button>') + '</div></div>';
    }).join('') + '</div>' : '<p class="empty small">لا توجد زيارات مسجلة اليوم. أي زائر بدون مأمورية مسجلة مسبقاً يُمنع من الدخول.</p>') + '</div>';
    box.querySelectorAll('[data-vcode]').forEach(function (b) { b.onclick = function () { if ($('siteSel')) { $('siteSel').value = b.dataset.vsite; S.siteId = b.dataset.vsite; } S.dir = 'IN'; doScan(b.dataset.vcode); }; });
  }

  /* ============================ جواز الأمن الحيوي ============================ */
  function viewPassport(args) {
    var code = args[0] || '';
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>' + icon('card') + ' جواز الأمن الحيوي</h1><p>بطاقة واحدة لكل فرد: أين يُسمح له بالدخول الآن، ومتى تنتهي فترة عزله، وسجل التزامه، وآخر المواقع التي زارها.</p></div></div>' +
      '<form class="card row" id="ppForm"><div class="field grow"><label for="ppCode">الكود أو الاسم</label><input id="ppCode" type="text" value="' + esc(code) + '" list="ppItems" placeholder="مثال: E001"><datalist id="ppItems">' + (S.ref ? S.ref.items : []).filter(function (i) { return i.kind !== 'مركبة' && i.kind !== 'معدة'; }).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist></div><button class="btn primary" type="submit">' + icon('search') + ' عرض الجواز</button></form><div id="ppOut"></div></section>';
    $('ppForm').onsubmit = function (e) { e.preventDefault(); var v = $('ppCode').value.trim(), it = (S.ref ? S.ref.items : []).filter(function (i) { return i.name === v; })[0]; if (v) go('passport/' + (it ? it.id : v)); };
    if (!code) return;
    $('ppOut').innerHTML = '<div class="card"><p class="empty"><span class="spin"></span></p></div>';
    remote('passport', [S.session.pin, code]).then(drawPassport).catch(function (e) { $('ppOut').innerHTML = e.net ? offlineCard('جواز الأمن الحيوي') : '<div class="card"><p class="empty">' + esc(errText(e)) + '</p></div>'; });
  }
  function drawPassport(p) {
    var it = p.item, st = p.stats;
    var txt = '🛂 جواز الأمن الحيوي · ' + it.name + ' (' + it.id + ')\n' + p.access.map(function (a) { return (a.allowedAt ? '⛔ ' : '✅ ') + a.name + (a.allowedAt ? ': ممنوع حتى ' + fmt(a.allowedAt) : ': مسموح الآن'); }).join('\n') + '\nدرجة الالتزام: ' + p.score + '/100 (' + p.grade.label + ')';
    $('ppOut').innerHTML = '<article class="pp"><header class="pp-h"><div class="pp-brand">' + logoImg() + '<div><b>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + '</b><span>جواز الأمن الحيوي · BIOSECURITY PASSPORT</span></div></div><div class="pp-qr" id="ppQr"></div></header>' +
      '<div class="pp-id"><span class="avatar">' + icon(kindIcon(it.kind), 'ico-lg') + '</span><div><h2>' + esc(it.name) + '</h2><span class="mono">' + esc(it.id) + '</span><span>' + esc([it.kind, it.dept].filter(Boolean).join(' · ')) + '</span>' + (p.inside ? '<span class="pill p-ok">داخل ' + esc(p.inside.site) + ' منذ ' + esc(ago(p.inside.since)) + '</span>' : '') + '</div><div class="pp-grade g-' + p.grade.k + '"><b class="mono">' + p.score + '</b><span>' + esc(p.grade.label) + '</span><small>درجة الالتزام · 30 يوماً</small></div></div>' +
      '<h3 class="pp-sec">الدخول المسموح الآن</h3><div class="pp-access">' + p.access.map(function (a) { return '<div class="pa ' + (a.allowedAt ? 'pa-no' : 'pa-ok') + '"><span class="pa-l">المستوى ' + a.level + '</span><b>' + esc(a.name) + '</b>' + (a.allowedAt ? '<span class="pa-s">' + icon('clock') + ' ممنوع ' + esc(left(a.allowedAt)) + '</span><small>' + esc(fmt(a.allowedAt)) + '</small>' : '<span class="pa-s">' + icon('check') + ' مسموح الآن</span>') + '</div>'; }).join('') + '</div>' +
      '<h3 class="pp-sec">السجل · آخر 30 يوماً</h3><div class="wk pp-stats">' + [['مرات الدخول', st.entries], ['مرفوض', st.denied], ['استثنائي', st.overrides], ['يدوي بدون كارت', st.manual], ['مخالفات', st.flags], ['استحمام موثق بالمؤقت', st.showers]].map(function (x) { return '<div><b class="mono">' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('') + '</div>' +
      ppTraining(p) + '<h3 class="pp-sec">أختام آخر المواقع</h3><div class="pp-stamps">' + (p.stamps.map(function (s) { var bad = s.decision === 'مرفوض' || s.decision === 'مرفوض نهائياً'; return '<div class="stamp ' + (s.ext ? 'st-ext' : bad ? 'st-bad' : 'st-ok') + '"><b>' + esc(s.site.replace(/\s*\(.*?\)\s*/g, '')) + '</b><span>' + esc(fmt(s.time)) + '</span><small>' + (s.ext ? 'زيارة خارجية' : esc(s.decision)) + (s.level ? ' · م' + s.level : '') + '</small></div>'; }).join('') || '<p class="empty small">لا توجد حركات</p>') + '</div>' +
      (p.missions.length ? '<h3 class="pp-sec">المأموريات القادمة</h3><div class="list">' + p.missions.map(function (m) { return '<div class="li"><span class="av">' + icon('calendar') + '</span><div class="t"><b>' + esc(m.kind + ' · ' + m.siteName) + '</b><span>' + esc(dayLabel(m.visitAt) + ' ' + fmt(m.visitAt, false)) + ' · ' + esc(m.status) + '</span></div></div>'; }).join('') + '</div>' : '') +
      '<footer class="rep-f"><span>صدر ' + esc(fmt(p.now)) + ' بطلب ' + esc(p.by) + '</span><span>يُحدَّث تلقائياً من سجل الحركة</span></footer></article>' +
      '<div class="row"><a class="btn wa" target="_blank" rel="noopener" href="' + esc(waLink(txt)) + '">' + icon('wa') + ' إرسال الجواز على واتساب</a>' + (S.session.user.isManager ? '<a class="btn" href="#history/' + esc(it.id) + '">' + icon('list') + ' السجل الكامل</a>' : '') + '</div>';
    if (window.QRCode && $('ppQr')) new QRCode($('ppQr'), { text: it.id, width: 84, height: 84, correctLevel: QRCode.CorrectLevel.M });
  }

  /* ============================ القرارات والتعليمات ============================ */
  function ackNotice(id) {
    S.notices.forEach(function (n) { if (n.id === id) n.acked = true; });
    persist(); renderBadges(); renderGateBanner();
    act('ackNotice', [id]).then(function () { if (S.route === 'notices') render(); }).catch(function (e) { toast(errText(e)); });
  }
  function targetOptions() {
    var sc = S.session.user.scope, lim = sc && !sc.all;
    var o = lim ? [] : [['ALL', 'كل البوابات والمديرين'], ['MANAGERS', 'المديرين فقط']];
    var sectors = {};
    (S.ref ? S.ref.sites : []).forEach(function (s) { if (!s.external && (!lim || sc.sectors.indexOf(s.sector) >= 0)) sectors[s.sector] = 1; });
    Object.keys(sectors).forEach(function (s) { o.push(['SECTOR:' + s, 'قطاع ' + s]); });
    (S.ref ? S.ref.checkpoints : []).forEach(function (c) { if (!lim || sc.sectors.indexOf(c.sector) >= 0 || c.serves.some(function (x) { return sc.sites.indexOf(x) >= 0; })) o.push(['GATE:' + c.id, c.name]); });
    return o;
  }
  function waLink(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }
  function viewNotices() {
    var mgr = S.session.user.isManager && can('notices');
    var html = '<section class="view"><div class="viewhead"><div><h1>القرارات والتعليمات</h1><p>' + (mgr ? 'أرسل قراراً فورياً لكل البوابات أو لقطاع أو لمنطقة تطهير، وتابع من اطلع عليه.' : 'قرارات الإدارة الموجهة لبوابتك. اضغط «تم الاطلاع» بعد قراءة كل قرار.') + '</p></div></div>';
    if (mgr) {
      html += '<form class="card" id="composeForm"><h2>' + icon('mega') + ' قرار أو تعليمات جديدة</h2>' +
        '<div class="row"><div class="field grow"><label for="nTarget">موجه إلى</label><select id="nTarget">' + targetOptions().map(function (t) { return '<option value="' + esc(t[0]) + '">' + esc(t[1]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field" style="flex:0 1 160px"><label for="nLevel">الأهمية</label><select id="nLevel"><option>عادي</option><option>عاجل</option></select></div></div>' +
        '<div class="field"><label for="nTitle">العنوان</label><input id="nTitle" type="text" required placeholder="مثال: منع دخول السيارات الخارجية لقطاع الواحات"></div>' +
        '<div class="field"><label for="nBody">التفاصيل</label><textarea id="nBody" rows="3" placeholder="نص القرار والإجراء المطلوب من الأمن"></textarea></div>' +
        '<div class="row"><button class="btn primary big grow" type="submit">' + icon('bell') + ' إرسال للبوابات الآن</button><button class="btn wa big" type="button" id="waShare">' + icon('wa') + ' مشاركة على واتساب</button></div>' +
        '<span class="xs muted">يصل القرار كإشعار فوري على تطبيق البوابات المعنية، ويظهر أعلى شاشة البوابة حتى يضغط فرد الأمن «تم الاطلاع».</span></form>';
    }
    html += '<div class="card"><h2>' + icon('list') + ' ' + (mgr ? 'القرارات المرسلة' : 'كل القرارات') + '</h2><div class="list">' + (S.notices.map(function (n) {
      return '<div class="li" style="grid-template-columns:auto 1fr"><span class="dot ' + (n.level === 'عاجل' ? 'd-bad' : 'd-n') + '"></span><div class="stack" style="gap:4px;min-width:0"><div class="spread"><b>' + esc(n.title) + '</b><span class="xs muted">' + esc(fmt(n.time)) + '</span></div>' +
        (n.body ? '<p class="small" style="white-space:pre-line">' + esc(n.body) + '</p>' : '') +
        '<div class="spread"><span class="xs muted">' + esc(n.from) + ' · إلى: ' + esc(n.targetName) + '</span>' +
        (mgr ? '<button class="btn sm" data-acks="' + esc(n.id) + '">' + icon('check') + ' اطلع عليه ' + n.ackCount + '</button>' : n.acked ? '<span class="pill p-ok">' + icon('check') + ' تم الاطلاع</span>' : '<button class="btn sm primary" data-ack="' + esc(n.id) + '">تم الاطلاع</button>') +
        '</div></div></div>';
    }).join('') || '<p class="empty">لا توجد قرارات</p>') + '</div></div></section>';
    $('main').innerHTML = html;
    document.querySelectorAll('[data-ack]').forEach(function (b) { b.onclick = function () { ackNotice(b.dataset.ack); }; });
    document.querySelectorAll('[data-acks]').forEach(function (b) {
      b.onclick = function () {
        remote('noticeAcks', [S.session.pin, b.dataset.acks]).then(function (list) {
          openSheet('<div class="sheet-head sh-brand"><h2>من اطلع على القرار</h2></div><div class="sheet-body"><div class="list">' + (list.map(function (a) { return '<div class="li" style="grid-template-columns:auto 1fr auto"><span class="dot d-ok"></span><b>' + esc(a.userName) + '</b><span class="xs muted">' + esc(fmt(a.time)) + '</span></div>'; }).join('') || '<p class="empty">لم يطلع عليه أحد بعد</p>') + '</div><button class="btn" data-a="close">إغلاق</button></div>', function () { closeSheet(); });
        }).catch(function (e) { toast(errText(e)); });
      };
    });
    if (mgr && S.noticeDraft) { $('nTitle').value = S.noticeDraft.title; $('nBody').value = S.noticeDraft.body; $('nLevel').value = 'عاجل'; S.noticeDraft = null; }
    if (mgr) {
      $('composeForm').onsubmit = function (e) {
        e.preventDefault();
        var n = { target: $('nTarget').value, level: $('nLevel').value, title: $('nTitle').value, body: $('nBody').value };
        var btn = this.querySelector('[type=submit]'); btn.disabled = true;
        remote('sendNotice', [S.session.pin, n]).then(function () { toast('أُرسل القرار للبوابات'); return sync(); }).then(render).catch(function (err) { btn.disabled = false; toast(errText(err)); });
      };
      $('waShare').onclick = function () {
        var t = ($('nLevel').value === 'عاجل' ? '🔴 قرار عاجل: ' : '📣 قرار: ') + $('nTitle').value + '\n' + $('nBody').value + '\n— إدارة الأمن الحيوي · ' + (S.session.company || '');
        window.open(waLink(t), '_blank', 'noopener');
      };
    }
  }

  /* ============================ سجل اليوم (البوابة) ============================ */
  function viewLog() {
    var list = myGateMoves();
    var days = {};
    list.forEach(function (m) { var k = new Date(m.time).toDateString(); (days[k] = days[k] || []).push(m); });
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>سجل البوابة</h1><p>' + esc(S.session.gate.name) + '</p></div>' +
      (S.outbox.length ? '<span class="pill p-warn">' + icon('wifioff') + ' ' + S.outbox.length + ' عملية بانتظار الإرسال</span>' : '') + '</div>' +
      (Object.keys(days).map(function (k) { return '<div class="card"><h2>' + esc(new Date(days[k][0].time).toLocaleDateString('ar-EG', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, TZ))) + '</h2><div class="list">' + days[k].map(moveLi).join('') + '</div></div>'; }).join('') || '<div class="card"><p class="empty">لا توجد حركات مسجلة على هذه البوابة</p></div>') + '</section>';
  }

  /* ============================ المزيد ============================ */

  /* ============================ المنصة: النظام أو تقارير الزيارات ============================ */
  var VR_TYPES = [['clip', 'أثناء التربية', 'تقييم 36 بنداً في 8 محاور، والحالة الصحية، والدرجة والتقدير، والإجراءات التصحيحية'], ['shield', 'التجهيز والتطهير', 'برنامج التطهير 30 خطوة، وفحص الجاهزية، والمسحات، وقرار استلام القطيع'], ['box', 'مصنع العلف', 'برنامج المصنع 24 خطوة، والمطابقة، ومسحات المصنع وعينات العلف، وقرار التوريد']];
  var VR_ROLE_TXT = { mgr: 'الاعتماد النهائي (مدير إدارة الأمن الحيوي)', sup: 'المراجعة والتعديل (مسؤول الأمن الحيوي)', insp: 'تحرير التقارير (مفتش / معاون)', view: 'الاطلاع على التقارير' };
  function vrRoleOf(perms) { return perms.indexOf('vr_approve') >= 0 ? 'mgr' : perms.indexOf('vr_review') >= 0 ? 'sup' : perms.indexOf('vr_write') >= 0 ? 'insp' : 'view'; }
  function viewPortal() {
    var u = S.session.user, vr = vrPerms(), role = vrRoleOf(vr);
    var h = new Date().toLocaleString('en-US', Object.assign({ hour: 'numeric', hour12: false }, TZ)) | 0;
    $('main').innerHTML = '<section class="view portal"><div class="portal-head"><span class="crumb">' + icon('layers') + ' منصة الأمن الحيوي · ' + esc(CFG.COMPANY || 'كايرو ثري إيه') + '</span><h1>' + (h < 12 ? 'صباح الخير' : 'مساء الخير') + '، ' + esc(u.name || '') + '</h1><p>اختر ما تريد العمل عليه الآن. تقدر تنتقل بينهما في أي وقت من زر «المنصة» أعلى الشاشة.</p></div>' +
      '<div class="portal-grid">' +
      '<button type="button" class="portal-card sys" data-pt="dash"><span class="pc-ico">' + icon('dash') + '</span><span class="pc-k">النظام</span><b>نظام تتبع الأمن الحيوي</b><span class="pc-d">البوابات وحركة الأفراد والمركبات والمعدات، وفترات العزل، والقرارات والطلبات، ولوحة القيادة والتحليل.</span>' +
        '<span class="pc-tags"><i>' + esc(u.roleLabel || u.role) + '</i>' + (u.scope && !u.scope.all ? '<i>' + esc(u.scope.label) + '</i>' : '<i>كل القطاعات</i>') + '</span><span class="pc-go">دخول النظام ' + icon('chev') + '</span></button>' +
      '<button type="button" class="portal-card vr" data-pt="vr"><span class="pc-ico">' + icon('clip') + '</span><span class="pc-k">التقارير</span><b>تقارير زيارات الأمن الحيوي</b><span class="pc-d">' + VR_TYPES.map(function (x) { return x[1]; }).join(' · ') + '، مع دورة المراجعة والاعتماد وملفات PDF.</span>' +
        '<span class="pc-tags"><i>دورك: ' + esc(VR_ROLE_TXT[role]) + '</i></span><span class="pc-go">فتح التقارير ' + icon('chev') + '</span></button>' +
      '</div><p class="xs muted portal-note">' + icon('lock') + ' دخول واحد للمنصة كلها. صلاحياتك في النظام والتقارير يحددها مدير الأمن الحيوي من شاشة المستخدمين.</p></section>';
    $('main').querySelectorAll('[data-pt]').forEach(function (b) { b.onclick = function () { go(b.dataset.pt); }; });
  }
  /** يفتح تطبيق التقارير داخل المنصة بتذكرة دخول تُستخدم مرة واحدة (بدون رقم سري ثانٍ) */
  function viewVr() {
    if (S.vrFrame) { $('vrHost').hidden = false; vrFit(); return; }
    $('main').innerHTML = '<section class="view">' + v5Head('تقارير زيارات الأمن الحيوي', 'clip', 'التقارير الثلاثة بدورة المراجعة والاعتماد، بنفس دخولك للمنصة') + '<div class="card vr-wait"><span class="spin"></span><b>جارٍ فتح التقارير بحسابك…</b><span class="small muted">بنتأكد من صلاحياتك ونفتح تطبيق التقارير بدورك</span></div></section>';
    remote('vrOpen', [S.session.pin]).then(function (r) {
      if (S.route.split('/')[0] !== 'vr') return;
      if (r.demo) return vrDemo(r);
      var host = $('vrHost');
      host.innerHTML = '<div class="vr-bar"><span class="vr-t">' + icon('clip') + '<b><span class="hide-sm">تقارير زيارات الأمن الحيوي</span><span class="only-sm">التقارير</span></b></span><span class="vr-role">' + esc(r.roleLabel) + '</span><span class="vr-sp"></span>' +
        '<button type="button" class="btn sm ghost" data-vr="win" title="فتح التقارير في نافذة مستقلة">' + icon('expand') + '<span class="hide-sm"> نافذة مستقلة</span></button>' +
        '<button type="button" class="btn sm ghost" data-vr="reload" title="إعادة تحميل التقارير">' + icon('refresh') + '</button>' +
        (vrOnly() ? '' : '<button type="button" class="btn sm" data-vr="sys">' + icon('dash') + '<span class="hide-sm"> النظام</span></button>') + '</div>' +
        '<iframe class="vr-frame" id="vrFrame" title="تقارير زيارات الأمن الحيوي" allow="camera; clipboard-read; clipboard-write; fullscreen; geolocation" src="' + esc(r.url) + '"></iframe>';
      S.vrFrame = { url: r.url, role: r.role };
      $('main').innerHTML = '';
      host.hidden = false;
      host.querySelector('.vr-bar').onclick = function (e) {
        var b = e.target.closest('[data-vr]'); if (!b) return;
        if (b.dataset.vr === 'sys') go('dash');
        else if (b.dataset.vr === 'reload') { S.vrFrame = null; host.hidden = true; host.innerHTML = ''; render(); }
        else if (b.dataset.vr === 'win') {
          var w = window.open('', '_blank');
          remote('vrOpen', [S.session.pin]).then(function (x) { if (w) w.location = x.url; else location.href = x.url; }, function (e) { if (w) w.close(); toast(errText(e)); });
        }
      };
      vrFit();
    }).catch(function (e) {
      if (S.route.split('/')[0] !== 'vr') return;
      $('main').innerHTML = '<section class="view">' + v5Head('تقارير زيارات الأمن الحيوي', 'clip', '') + '<div class="card vr-wait">' + icon(e.net ? 'wifioff' : 'alert', 'ico-lg') + '<b>' + esc(e.net ? 'التقارير تحتاج اتصالاً بالإنترنت لفتحها' : errText(e)) + '</b>' +
        '<span class="small muted">' + (e.net ? 'تطبيق التقارير يحفظ ما تكتبه على الجهاز لو انقطع الاتصال بعد فتحه، لكن أول فتح يحتاج إنترنت.' : 'لو المشكلة مستمرة كلّم مدير الأمن الحيوي.') + '</span><button class="btn primary" type="button" id="vrRetry">' + icon('refresh') + ' حاول مرة أخرى</button></div></section>';
      $('vrRetry').onclick = function () { render(); };
    });
  }
  function vrFit() {
    var f = $('vrFrame'); if (!f) return;
    var bn = $('bottomNav'), bh = bn && getComputedStyle(bn).display !== 'none' ? bn.offsetHeight + 20 : 0;
    var top = f.getBoundingClientRect().top + window.scrollY;
    f.style.height = Math.max(420, window.innerHeight - top - bh - 8) + 'px';
  }
  window.addEventListener('resize', function () { if (S.route && S.route.split('/')[0] === 'vr') vrFit(); });
  /** نسخة العرض: تطبيق التقارير الحقيقي يعمل على خادم Apps Script، فنعرض هنا كيف يعمل الدخول والصلاحيات */
  function vrDemo(r) {
    var steps = [['edit', 'المفتش / المعاون', 'يحرر التقرير من الموبايل في الموقع، ويحفظ دون إنترنت ويرفعه تلقائياً'], ['eye', 'مسؤول الأمن الحيوي', 'يراجع التقرير ويعدّله أو يعيده للمعد بملاحظاته'], ['check', 'مدير إدارة الأمن الحيوي', 'يعتمد التقرير نهائياً بالتوقيع، ويُحفظ PDF في Drive'], ['mega', 'المتابعة', 'الإجراءات التصحيحية لها مسؤول وموعد وتُتابع حتى الإغلاق']];
    $('main').innerHTML = '<section class="view">' + v5Head('تقارير زيارات الأمن الحيوي', 'clip', 'تطبيق التقارير الحالي بكل نماذجه يفتح هنا داخل المنصة بنفس دخولك') +
      '<div class="card vr-demo-hero"><div><span class="kick">' + icon('lock') + ' دخولك الحالي</span><h2>' + esc(S.session.user.name) + '</h2><p class="small muted">دورك في التقارير: <b>' + esc(r.roleLabel) + '</b></p>' +
        '<div class="chips">' + r.perms.map(function (k) { return '<span class="pill p-info">' + esc(PERM_SHORT[k] || k) + '</span>'; }).join('') + '</div></div>' +
        '<div class="infobox small">' + icon('alert') + ' في التطبيق الفعلي تفتح شاشة التقارير هنا كاملة. نسخة العرض لا تتصل بخادم التقارير، لذلك نعرض طريقة العمل فقط.</div></div>' +
      '<div class="vr-types">' + VR_TYPES.map(function (x) { return '<div class="card vr-type"><span class="pc-ico">' + icon(x[0]) + '</span><b>' + esc(x[1]) + '</b><span class="small muted">' + esc(x[2]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="card"><h2>' + icon('history') + ' دورة التقرير</h2><div class="vr-flow">' + steps.map(function (s, i) { return '<div class="vr-step"><span class="n">' + (i + 1) + '</span>' + icon(s[0]) + '<b>' + esc(s[1]) + '</b><span class="xs muted">' + esc(s[2]) + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h2>' + icon('user') + ' مين بيشوف إيه</h2><div class="tbl"><table><thead><tr><th>صلاحية المنصة</th><th>الدور في التقارير</th><th>يقدر</th></tr></thead><tbody>' +
        [['اعتماد التقارير', 'مدير إدارة الأمن الحيوي', 'يطّلع على الكل، ويعتمد نهائياً، ويحذف'], ['مراجعة التقارير', 'مسؤول الأمن الحيوي', 'يطّلع على الكل، ويراجع ويعدّل ويعيد للمعد'], ['تحرير التقارير', 'مفتش / معاون', 'ينشئ تقاريره ويعدّلها حتى الإرسال'], ['الاطلاع على التقارير', 'اطلاع', 'يقرأ التقارير وملفات PDF فقط']].map(function (x) { return '<tr><td><b>' + x[0] + '</b></td><td>' + x[1] + '</td><td class="small">' + x[2] + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="xs muted">يحددها مدير الأمن الحيوي لكل مستخدم من «المستخدمون والصلاحيات». حساب «مفتش / معاون أمن حيوي» يدخل على التقارير فقط.</p></div></section>';
  }

  function viewMoreVr() {
    var me = S.session;
    $('main').innerHTML = '<section class="view"><div class="viewhead"><h1>المزيد</h1></div><div class="grid-2">' +
      '<div class="card"><div class="who"><div class="avatar">' + icon('user', 'ico-lg') + '</div><div><b>' + esc(me.user.name) + '</b><span class="small muted">' + esc(me.user.roleLabel || me.user.role) + '</span></div></div>' +
      '<p class="small muted">حسابك مخصص لتقارير زيارات الأمن الحيوي. لو محتاج صلاحيات أخرى اطلبها من مدير الأمن الحيوي.</p>' +
      '<button class="btn" id="logoutBtn">' + icon('out') + ' تسجيل الخروج</button></div>' +
      '<div class="card"><h2>' + icon('download') + ' التطبيق على جهازك</h2><p class="small muted">ثبّت التطبيق على الشاشة الرئيسية ليفتح بضغطة واحدة مثل أي تطبيق.</p>' + (instCan() ? '<button class="btn primary" type="button" data-install="1">' + icon('download') + ' تثبيت التطبيق</button>' : '') + '</div>' +
      '</div></section>';
    $('logoutBtn').onclick = function () { logout(); };
  }
  function viewMore() {
    if (vrOnly()) return viewMoreVr();
    var me = S.session, pushTxt;
    if (MODE === 'demo') pushTxt = 'في نسخة العرض تظهر الإشعارات أعلى الشاشة كما ستظهر على الموبايل.';
    else if (MODE === 'gas') pushTxt = 'الإشعارات الفورية تعمل عند فتح التطبيق من رابطه المستضاف وتثبيته على الشاشة الرئيسية.';
    else if (!CFG.FIREBASE) pushTxt = 'لم تُضبط إعدادات Firebase في config.js بعد.';
    else pushTxt = window.Notification && Notification.permission === 'granted' ? 'الإشعارات مفعلة على هذا الجهاز.' : 'فعّل الإشعارات ليصلك كل قرار وطلب فوراً حتى والتطبيق مغلق.';
    $('main').innerHTML = '<section class="view"><div class="viewhead"><h1>المزيد</h1></div><div class="grid-2">' +
      '<div class="card"><div class="who"><div class="avatar">' + icon('user', 'ico-lg') + '</div><div><b>' + esc(me.user.name) + '</b><span class="small muted">' + esc(me.user.roleLabel || me.user.role) + (me.user.scope && !me.user.scope.all ? ' · ' + esc(me.user.scope.label) : '') + (me.gate.name && !me.user.isManager ? ' · ' + esc(me.gate.name) : '') + '</span>' + (me.user.isManager && me.user.perms ? '<span class="perm-mini">' + me.user.perms.map(function (k) { var d = (S.permDefs || PERM_SHORT)[k]; return '<i>' + esc(d || k) + '</i>'; }).join('') + '</span>' : '') + '</div></div>' +
      '<button class="btn" id="logoutBtn">' + icon('out') + ' تسجيل الخروج</button></div>' +
      '<div class="card"><h2>' + icon('bell') + ' الإشعارات الفورية</h2><p class="small muted">' + esc(pushTxt) + '</p>' +
      (MODE === 'web' && CFG.FIREBASE ? '<button class="btn primary" id="pushBtn">' + icon('bell') + ' تفعيل الإشعارات على هذا الجهاز</button>' : '') +
      (instCan() ? '<button class="btn" type="button" data-install="1">' + icon('download') + ' تثبيت التطبيق على هذا الجهاز</button>' : '') + '</div>' +
      '<div class="card"><h2>' + icon('refresh') + ' المزامنة والعمل دون اتصال</h2><div class="small">الحالة: <b>' + (S.online ? 'متصل' : 'دون اتصال') + '</b></div><div class="small">آخر مزامنة: <b>' + (S.lastSync ? esc(fmt(S.lastSync)) : 'لم تتم بعد') + '</b></div>' +
      '<div class="small">عمليات بانتظار الإرسال: <b>' + S.outbox.length + '</b></div><p class="xs muted">عند انقطاع الإنترنت يستمر التطبيق في التسجيل واتخاذ القرار ببيانات آخر مزامنة، ويرسل كل شيء تلقائياً عند عودة الاتصال، ويراجع الخادم القرارات ويبلغ الإدارة بأي مخالفة.</p>' +
      '<button class="btn" id="syncBtn">' + icon('refresh') + ' مزامنة الآن</button></div>' +
      (me.user.isManager && (can('analytics') || isAdmin()) ? '<div class="card"><h2>' + icon('network') + ' أدوات الإدارة</h2><div class="tool-links">' + (isAdmin() ? [['users', 'user', 'المستخدمون والصلاحيات']] : []).concat(can('analytics') ? [['map', 'map', 'الخريطة الحية'], ['trace', 'trace', 'تتبع العدوى'], ['plan', 'calendar', 'مخطط الزيارات الذكي'], ['network', 'network', 'شبكة المخالطة'], ['audit', 'shield', 'ملف اعتماد المنشأة المعزولة']] : []).map(function (t) { return '<a class="btn" href="#' + t[0] + '">' + icon(t[1]) + ' ' + t[2] + '</a>'; }).join('') + '</div></div>' : '') +
      (me.user.isManager ? '<div class="card"><h2>' + icon('shield') + ' أدوات الأمن الحيوي المتقدمة</h2><div class="tool-links">' + [['birds', 'bird', 'رادار الطيور المهاجرة'], ['wx', 'wind', 'الأرصاد الجوية والآفات والإجهاد الحراري'], ['inspect', 'clip', 'التدقيق الداخلي والإجراءات التصحيحية'], ['disposal', 'box', 'النافق والسبلة'], ['companies', 'truck', 'شركات النقل والمقاولون'], ['academy', 'grad', 'أكاديمية الأمن الحيوي'], ['tv', 'tv', 'شاشة غرفة العمليات']].concat(isAdmin() ? [['backup', 'history', 'النسخ الاحتياطي وسجل التعديلات']] : []).map(function (t) { return '<a class="btn" href="#' + t[0] + '">' + icon(t[1]) + ' ' + t[2] + '</a>'; }).join('') + '</div></div>' : '<div class="card"><h2>' + icon('box') + ' أدوات البوابة</h2><div class="tool-links"><a class="btn" href="#disposal">' + icon('box') + ' النافق والسبلة</a></div></div>') +
      '<a class="card" href="#ref" style="text-decoration:none;color:inherit"><h2>' + icon('book') + ' مرجع قواعد الأمن الحيوي</h2><p class="small muted">فترات العزل المعتمدة وإجراءات هابرد إفيشنسي بلس.</p></a>' +
      '</div></section>';
    $('logoutBtn').onclick = function () { logout(); };
    $('syncBtn').onclick = function () { sync().then(render); };
    if ($('pushBtn')) $('pushBtn').onclick = function () { enablePush(false); };
  }

  /* ---------- الإشعارات الفورية (Firebase) ---------- */
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(appErr('تعذر تحميل ' + src)); }; document.head.appendChild(s); }); }
  function enablePush(silent) {
    if (!('serviceWorker' in navigator) || !window.Notification) { if (!silent) toast('هذا المتصفح لا يدعم الإشعارات. على آيفون: ثبّت التطبيق على الشاشة الرئيسية أولاً ثم فعّل الإشعارات.', 6000); return; }
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw appErr('لم يُسمح بالإشعارات. فعّلها من إعدادات المتصفح لهذا الموقع.');
      return window.firebase && firebase.messaging ? null : loadScript(FB + 'firebase-app-compat.js').then(function () { return loadScript(FB + 'firebase-messaging-compat.js'); });
    }).then(function () {
      if (!firebase.apps.length) firebase.initializeApp(CFG.FIREBASE);
      var m = firebase.messaging();
      m.onMessage(function (pl) { var d = pl.data || {}; incomingPush(d); });
      return navigator.serviceWorker.ready.then(function (reg) { return m.getToken({ vapidKey: CFG.VAPID_KEY, serviceWorkerRegistration: reg }); });
    }).then(function (tok) {
      return remote('registerDevice', [S.session.pin, tok, S.session.gate.name]).then(function () { S.pushOn = true; if (!silent) toast('تم تفعيل الإشعارات على هذا الجهاز'); });
    }).catch(function (e) { if (!silent) toast(errText(e), 6000); });
  }
  function incomingPush(d) {
    var actions = null;
    if (d.kind === 'request' && d.approvalId && can('decide')) actions = decideActions(d.approvalId);
    pushCard({ title: d.title, body: d.body, actions: actions, sticky: !!actions });
    sync().then(function () { if (S.route === 'dash' || S.route === 'requests') render(); });
  }
  function decideActions(id) {
    function run(ok) {
      return function (el) {
        remote('decide', [S.session.pin, id, ok]).then(function (r) { el.remove(); toast(r.already ? 'تم البت في الطلب مسبقاً: ' + r.status : r.status); sync().then(function () { if (S.route === 'dash' || S.route === 'requests') render(); }); }).catch(function (e) { toast(errText(e)); });
      };
    }
    return [{ label: 'موافقة', cls: 'ok', run: run(true) }, { label: 'رفض', cls: 'bad', run: run(false) }];
  }

  /* ============================ لوحة القيادة ============================ */
  function offlineCard(what) { return '<div class="card"><p class="empty">' + icon('wifioff', 'ico-lg') + '<br>' + esc(what) + ' يحتاج اتصالاً بالإنترنت. ستظهر البيانات تلقائياً عند عودة الاتصال.</p></div>'; }
  function viewDash() {
    $('main').innerHTML = '<section class="view" id="dashView"><div id="dashBody">' + (S.dash ? '' : '<div class="card"><p class="empty"><span class="spin"></span></p></div>') + '</div></section>';
    if (S.dash) drawDash(S.dash);
    loadDash();
    S.poll = setInterval(function () { if (!document.hidden && S.route === 'dash' && !$('sheetWrap')) loadDash(); }, MODE === 'demo' ? 5000 : 15000);
  }
  function loadDash() {
    remote('dashboard', [S.session.pin]).then(function (d) { S.dash = d; S.pendingCount = d.stats.pending; renderBadges(); if (S.route === 'dash') drawDash(d); })
      .catch(function (e) { if (e.net) { setOnline(false); if ($('dashTime')) $('dashTime').textContent = S.dash ? 'دون اتصال · آخر بيانات ' + fmt(S.dash.now) : ''; if (!S.dash && $('dashBody')) $('dashBody').innerHTML = offlineCard('عرض لوحة القيادة'); } else toast(errText(e)); });
  }
  function reqCard(a, hot) {
    return '<div class="req ' + (hot ? 'hot' : '') + '"><div class="spread"><b>' + esc(a.itemName) + ' <span class="xs muted">' + esc(a.itemId) + '</span></b><span class="xs muted">' + esc(ago(a.time)) + '</span></div>' +
      '<div class="small">' + icon('pin') + ' ' + esc(a.siteName) + ' · من ' + esc(a.requestedBy) + '</div><div class="small" style="color:var(--bad)">' + esc(a.reason) + '</div>' +
      (a.note ? '<div class="small">ملاحظة الأمن: ' + esc(a.note) + '</div>' : '') +
      (!can('decide') ? '<span class="xs muted">القرار لمدير الموقع أو القطاع</span>' : '<div class="acts"><button class="btn ok" data-dec="1" data-id="' + esc(a.id) + '">' + icon('check') + ' موافقة</button><button class="btn bad" data-dec="0" data-id="' + esc(a.id) + '">' + icon('x') + ' رفض</button></div>') + '</div>';
  }
  function bindDecide(root) {
    root.querySelectorAll('[data-dec]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        remote('decide', [S.session.pin, b.dataset.id, b.dataset.dec === '1']).then(function (r) { toast(r.already ? 'تم البت في الطلب مسبقاً' : r.status + ' · وصل القرار للبوابة'); return sync(); }).then(render).catch(function (e) { b.disabled = false; toast(errText(e)); });
      };
    });
  }
  function initials(n) {
    var p = String(n || '').replace(/\(.*?\)/g, '').replace(/^\s*(م|د|أ|ا)\s*[\/.]\s*/, '').trim().split(/\s+/);
    return (p[0] || '?').charAt(0) + (p[1] ? ' ' + p[1].charAt(0) : '');
  }
  function greet() { var h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' })); return h < 12 ? 'صباح الخير' : 'مساء الخير'; }
  function hoursLeft(ms) { return Math.max(1, Math.ceil((ms - Date.now()) / 36e5)); }
  function activityChart(hourly, W) {
    if (!hourly || !hourly.length) return '';
    W = Math.max(280, W || 720); var H = 150, pl = 30, pb = 22, pt = 8, n = hourly.length;
    var top = hourly.reduce(function (a, b) { return Math.max(a, b.allowed + b.denied); }, 0);
    var max = Math.max(4, Math.ceil(top / 4) * 4), ih = H - pb - pt, bw = (W - pl) / n;
    var y = function (v) { return pt + ih - v / max * ih; };
    var g = [0, max / 2, max].map(function (v) { return '<line class="grid" x1="' + pl + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="axis" x="' + (pl - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '</text>'; }).join('');
    var bars = hourly.map(function (b, i) {
      var x = pl + i * bw + 1, w = Math.max(2, bw - 2), out = '';
      var ha = b.allowed / max * ih, hd = b.denied / max * ih;
      if (ha) out += '<rect class="bar-ok" x="' + x + '" y="' + (y(0) - ha) + '" width="' + w + '" height="' + ha + '" rx="2"/>';
      if (hd) out += '<rect class="bar-bad" x="' + x + '" y="' + (y(0) - ha - hd - (ha ? 2 : 0)) + '" width="' + w + '" height="' + hd + '" rx="2"/>';
      if (i % (W < 500 ? 8 : 4) === 0 || i === n - 1) out += '<text class="axis" x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + (i === n - 1 ? 'الآن' : esc(fmt(b.start, false))) + '</text>';
      return out + '<rect class="hit" data-i="' + i + '" x="' + (pl + i * bw) + '" y="' + pt + '" width="' + bw + '" height="' + ih + '"/>';
    }).join('');
    var tA = hourly.reduce(function (a, b) { return a + b.allowed; }, 0), tD = hourly.reduce(function (a, b) { return a + b.denied; }, 0);
    return '<div class="chart"><div class="chart-legend"><span><i style="background:var(--ok)"></i>دخول مسموح (' + tA + ')</span><span><i style="background:var(--bad)"></i>دخول مرفوض (' + tD + ')</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" dir="ltr" role="img" aria-label="الدخول بالساعة خلال آخر 24 ساعة: ' + tA + ' مسموح و' + tD + ' مرفوض">' + g + bars + '</svg></div>';
  }
  function bindChart(root, hourly) {
    var tip = null;
    function hide() { if (tip) { tip.remove(); tip = null; } }
    root.querySelectorAll('.chart .hit').forEach(function (r) {
      var show = function (e) {
        var b = hourly[+r.dataset.i]; hide();
        tip = document.createElement('div'); tip.className = 'chart-tip';
        tip.innerHTML = '<b>' + esc(fmt(b.start, false)) + ' – ' + esc(fmt(b.start + 36e5, false)) + '</b><span>مسموح <b>' + b.allowed + '</b></span><span>مرفوض <b>' + b.denied + '</b></span>';
        document.body.appendChild(tip);
        var x = (e.touches ? e.touches[0].clientX : e.clientX), yy = (e.touches ? e.touches[0].clientY : e.clientY);
        tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, x - tip.offsetWidth / 2)) + 'px';
        tip.style.top = Math.max(8, yy - tip.offsetHeight - 14) + 'px';
      };
      r.addEventListener('mousemove', show); r.addEventListener('click', show); r.addEventListener('mouseleave', hide);
    });
  }
  function siteTile(s) {
    var c = s.status === 'إنذار' ? 's-alert' : s.status === 'مغلق' ? 's-closed' : '';
    var st = s.status === 'نشط' ? '' : '<span class="pill ' + (s.status === 'مغلق' ? 'p-bad' : 'p-warn') + '">' + esc(s.status) + '</span>';
    var inside = '<span class="in' + (s.inside ? ' has' : '') + '">' + icon('user') + ' ' + s.inside + '</span>';
    var st5 = String(s.name).match(/محطة\s*(\d+)/);
    if (st5) return '<button type="button" class="site ' + c + '" data-site="' + esc(s.id) + '" title="' + esc(s.name) + ' · ' + esc(s.status) + '"><span class="xs muted">محطة</span><b>' + st5[1] + '</b>' + (st ? st : inside) + '</button>';
    return '<button type="button" class="site ' + c + '" data-site="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span class="lv"><span>' + esc(s.type || '') + '</span><span class="lvl" title="مستوى الخطورة">م' + s.level + '</span></span><span class="spread">' + inside + st + '</span></button>';
  }
  /* ============================ مركز القيادة (الإصدار 4) ============================ */
  var BAND_C = { low: 'var(--r-low)', mid: 'var(--r-mid)', high: 'var(--r-high)', crit: 'var(--r-crit)' };
  var DAYN = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function dayName(t) { return DAYN[new Date(t + 3 * 36e5).getUTCDay()]; }
  function plural(n, one, many) { return n + ' ' + (n >= 3 && n <= 10 ? many : one); }
  function pctTxt(v) { return v == null ? '—' : (Math.round(v * 10) / 10) + '%'; }
  /** حلقة قياس 0-100 */
  function ring(v, size, stroke, color, label) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, v || 0)) / 100;
    return '<svg class="ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(label || '') + ' ' + v + ' من 100">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  /** رسم مصغر لسلسلة 7 أيام */
  function spark(vals, color) {
    var v = vals.map(function (x) { return x == null ? null : Number(x); }), ok = v.filter(function (x) { return x != null; });
    if (ok.length < 2) return '<svg class="spark" viewBox="0 0 100 28"></svg>';
    var mn = Math.min.apply(null, ok), mx = Math.max.apply(null, ok); if (mx === mn) { mx += 1; mn -= 1; }
    var pts = v.map(function (x, i) { return x == null ? null : [i / (v.length - 1) * 96 + 2, 25 - (x - mn) / (mx - mn) * 21]; }).filter(Boolean);
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + ' L' + last[0] + ' 28 L' + pts[0][0] + ' 28 Z" fill="' + color + '" opacity=".10"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="' + color + '"/></svg>';
  }
  function delta(cur, prev, goodUp, unit) {
    if (cur == null || prev == null) return '<span class="dl dl-n">—</span>';
    var dv = Math.round((cur - prev) * 10) / 10;
    if (!dv) return '<span class="dl dl-n">= الأمس</span>';
    var good = goodUp ? dv > 0 : dv < 0;
    return '<span class="dl ' + (good ? 'dl-g' : 'dl-b') + '">' + (dv > 0 ? '▲ ' : '▼ ') + Math.abs(dv) + (unit || '') + ' عن الأمس</span>';
  }
  /** منحنى الالتزام اليومي لكل قطاع (محور واحد 0-100%) */
  function complianceChart(model, W) {
    W = Math.max(300, W || 640); var H = 220, pl = 48, pr = 14, pt = 16, pb = 28, n = model.days.length;
    var vals = []; model.bySector.forEach(function (s) { s.series.forEach(function (v) { if (v != null) vals.push(v); }); }); model.days.forEach(function (d) { if (d.compliance != null) vals.push(d.compliance); });
    var lo = Math.max(0, Math.floor((Math.min.apply(null, vals.concat([90])) - 4) / 10) * 10), hi = 100;
    var x = function (i) { return pl + i * (W - pl - pr) / (n - 1); }, y = function (v) { return pt + (hi - v) / (hi - lo) * (H - pt - pb); };
    var ticks = []; for (var t = lo; t <= hi; t += (hi - lo) / 2) ticks.push(t);
    var g = ticks.map(function (v) { return '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="axis" x="' + (pl - 12) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '%</text>'; }).join('');
    var xl = model.days.map(function (d, i) { return '<text class="axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + (i === n - 1 ? 'اليوم' : dayName(d.start + 12 * 36e5)) + '</text>'; }).join('');
    var series = [{ name: 'الشركة', vals: model.days.map(function (d) { return d.compliance; }), c: 'var(--s-co)', w: 2.5 }].concat(model.bySector.map(function (s, i) { return { name: 'قطاع ' + s.name, vals: s.series, c: ['var(--s-1)', 'var(--s-2)', 'var(--s-3)'][i % 3], w: 2, dash: true }; }));
    var lines = series.map(function (s) {
      var d = '', pen = false;
      s.vals.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; pen = true; });
      var dots = s.vals.map(function (v, i) { return v == null ? '' : '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (i === n - 1 ? 4.5 : 3) + '" fill="' + s.c + '" stroke="var(--surface)" stroke-width="2"/>'; }).join('');
      return '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + s.w + '"' + (s.dash ? ' stroke-dasharray="1 0"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>' + dots;
    }).join('');
    var hits = model.days.map(function (d, i) { var w = (W - pl - pr) / (n - 1); return '<rect class="hit" data-i="' + i + '" x="' + (x(i) - w / 2) + '" y="' + pt + '" width="' + w + '" height="' + (H - pt - pb) + '"/>'; }).join('');
    var legend = series.map(function (s) { var last = s.vals.filter(function (v) { return v != null; }).pop(); return '<span><i style="background:' + s.c + '"></i>' + esc(s.name) + ' <b class="mono">' + pctTxt(last) + '</b></span>'; }).join('');
    return '<div class="chart cc-chart"><div class="chart-legend">' + legend + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" dir="ltr" role="img" aria-label="مؤشر الالتزام اليومي آخر 7 أيام">' + g + xl + '<line class="cc-cross" id="ccCross" x1="0" x2="0" y1="' + pt + '" y2="' + (H - pb) + '" opacity="0"/>' + lines + hits + '</svg></div>';
  }
  function bindComplianceChart(root, model) {
    var tip = null; function hide() { if (tip) { tip.remove(); tip = null; } var c = $('ccCross'); if (c) c.setAttribute('opacity', 0); }
    root.querySelectorAll('.cc-chart .hit').forEach(function (r) {
      var show = function (e) {
        var i = +r.dataset.i, d = model.days[i]; hide();
        var c = $('ccCross'); if (c) { var x = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2; c.setAttribute('x1', x); c.setAttribute('x2', x); c.setAttribute('opacity', 1); }
        tip = document.createElement('div'); tip.className = 'chart-tip';
        tip.innerHTML = '<b>' + (i === model.days.length - 1 ? 'اليوم' : dayName(d.start + 12 * 36e5)) + '</b><span>الشركة <b>' + pctTxt(d.compliance) + '</b></span>' + model.bySector.map(function (s) { return '<span>قطاع ' + esc(s.name) + ' <b>' + pctTxt(s.series[i]) + '</b></span>'; }).join('') + '<span>محاولات الدخول <b>' + d.attempts + '</b> · مرفوض <b>' + d.denied + '</b></span>';
        document.body.appendChild(tip);
        var X = (e.touches ? e.touches[0].clientX : e.clientX), Y = (e.touches ? e.touches[0].clientY : e.clientY);
        tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, X - tip.offsetWidth / 2)) + 'px';
        tip.style.top = Math.max(8, Y - tip.offsetHeight - 16) + 'px';
      };
      r.addEventListener('mousemove', show); r.addEventListener('click', show); r.addEventListener('mouseleave', hide);
    });
  }
  function riskTile(r) {
    var st = String(r.name).match(/محطة\s*(\d+)/), nm = st ? 'محطة ' + st[1] : r.name.replace(/\s*\(.*?\)\s*/g, '').replace(/^تسمين ريجوا$/, 'تسمين ريجوا');
    return '<button type="button" class="rt rt-' + r.bk + (r.status !== 'نشط' ? ' rt-st' : '') + '" data-risk="' + esc(r.id) + '" title="' + esc(r.name + ' · خطر ' + r.band + ' ' + r.score + '/100') + '">' +
      '<span class="rt-n">' + esc(nm) + '</span><span class="rt-s mono">' + r.score + '</span><span class="rt-b">' + (r.status !== 'نشط' ? esc(r.status) : esc(r.band)) + '</span>' +
      '<i class="rt-bar" style="width:' + Math.max(4, r.score) + '%"></i></button>';
  }
  function drawDash(d) {
    var el = $('dashBody'); if (!el) return;
    var st = d.stats, m = d.model, me = S.session.user, inside = d.onSite.length, days = m.days, T = days[6], Y = days[5];
    var nSites = m.risk.length, hiRisk = m.risk.filter(function (r) { return r.score >= 50; }).length;
    var rd = m.readiness, pc = m.posture >= 85 ? 'var(--r-low)' : m.posture >= 70 ? 'var(--r-mid)' : m.posture >= 55 ? 'var(--r-high)' : 'var(--r-crit)';
    var html = '<div class="cc-head"><div class="cc-title"><span class="cc-kick">' + icon('shield') + ' ' + greet() + '، ' + esc(me.name) + '</span><h1>مركز قيادة الأمن الحيوي</h1>' +
      '<div class="cc-meta"><span class="live"><i></i> مباشر</span><span id="dashTime">' + esc(fmt(d.now)) + '</span><span>' + esc(d.scope || 'كل القطاعات') + ' · ' + plural(nSites, 'موقع', 'مواقع') + '</span>' + (d.reports && d.reports.avgMin != null ? '<span>زمن الاستجابة للبلاغات ' + d.reports.avgMin + ' د</span>' : '') + '</div></div>' +
      '<div class="cc-state st-' + rd.k + '"><span class="cc-lbl">حالة الجاهزية</span><b>' + esc(rd.label) + '</b><span class="cc-note">' + esc(rd.note) + '</span></div>' +
      '<div class="cc-gauge" title="مؤشر الجاهزية = 60% الالتزام + 40% (100 − متوسط الخطر)">' + ring(m.posture, 108, 10, pc, 'مؤشر الجاهزية') + '<div class="cc-gv"><b class="mono">' + m.posture + '</b><span>مؤشر الجاهزية</span></div></div>' +
      '<div class="cc-acts">' + (can('notices') ? '<button class="btn cc-btn" type="button" data-goto="notices">' + icon('mega') + ' إرسال قرار</button>' : '') +
      (can('analytics') ? '<button class="btn cc-btn" type="button" data-goto="sim">' + icon('radar') + ' محاكاة تفشٍ</button>' : '') +
      '<button class="btn cc-btn" type="button" data-goto="report">' + icon('file') + ' التقرير التنفيذي</button>' +
      (d.canLock ? '<button class="btn cc-lock" type="button" id="lockBtn">' + icon('lock') + ' الإغلاق الطارئ</button>' : '') +
      '<button class="btn cc-btn icon-only" type="button" id="dashRefresh" aria-label="تحديث">' + icon('refresh') + '</button></div></div>';
    var alertsBar = '';
    if (d.reports && d.reports.open.length) alertsBar += '<div class="cc-alert a-bad">' + icon('siren') + '<span><b>' + plural(d.reports.open.length, 'بلاغ عاجل مفتوح', 'بلاغات عاجلة مفتوحة') + '</b>' + (d.reports.open.some(function (r) { return !r.readAt; }) ? '، منها ما لم يُفتح بعد' : '') + '</span><button class="btn sm" type="button" data-goto="comms">فتح البلاغات</button></div>';
    if (st.pending) alertsBar += '<div class="cc-alert a-warn">' + icon('inbox') + '<span><b>' + plural(st.pending, 'طلب دخول استثنائي', 'طلبات دخول استثنائي') + '</b> ينتظر القرار الآن</span><button class="btn sm" type="button" data-goto="requests">عرض</button></div>';
    if (d.missions && d.missions.late) alertsBar += '<div class="cc-alert a-warn">' + icon('calendar') + '<span><b>' + plural(d.missions.late, 'مأمورية متأخرة', 'مأموريات متأخرة') + '</b> سُجلت قبل موعدها بأقل من 24 ساعة وتنتظر قرارك</span><button class="btn sm" type="button" data-goto="missions">مراجعة</button></div>';
    alertsBar += v5DashAlerts(d);
    html += alertsBar;
    var kp = [
      ['الالتزام اليوم', pctTxt(T.compliance), days.map(function (x) { return x.compliance; }), delta(T.compliance, Y.compliance, true, '%'), 'var(--r-low)', 'نسبة محاولات الدخول المطابقة للقواعد من أول مرة'],
      ['دخول مسموح', T.allowed, days.map(function (x) { return x.allowed; }), delta(T.allowed, Y.allowed, true), 'var(--s-1)', 'دخول مطابق للقواعد اليوم'],
      ['محاولات مرفوضة', T.denied, days.map(function (x) { return x.denied; }), delta(T.denied, Y.denied, false), 'var(--r-crit)', 'منعها النظام لعدم انتهاء العزل أو إغلاق الموقع'],
      ['دخول استثنائي', T.overrides, days.map(function (x) { return x.overrides; }), delta(T.overrides, Y.overrides, false), 'var(--r-high)', 'دخول بموافقة المدير رغم القواعد'],
      ['بلاغات عاجلة', T.reports, days.map(function (x) { return x.reports; }), delta(T.reports, Y.reports, false), 'var(--r-mid)', 'بلاغات البوابات اليوم'],
      ['داخل المواقع الآن', inside, null, '<span class="dl dl-n">' + plural(d.isolation.length, 'شخص', 'أشخاص') + ' في فترة عزل</span>', 'var(--s-2)', 'مسجلون بالدخول ولم يسجلوا الخروج']
    ];
    html += '<div class="cc-kpis">' + kp.map(function (k) { return '<div class="ck" title="' + esc(k[5]) + '"><span class="ck-l">' + k[0] + '</span><b class="mono">' + k[1] + '</b>' + (k[2] ? spark(k[2], k[4]) : '<svg class="spark"></svg>') + k[3] + '</div>'; }).join('') + '</div>';
    html += v5DashStrip(d);
    // خريطة الخطر + الإنذارات
    var secs = {}; m.risk.forEach(function (r) { (secs[r.sector] = secs[r.sector] || []).push(r); });
    var order = function (list) { var ref = (d.sectors.filter(function (s) { return s.name === list[0].sector; })[0] || { sites: [] }).sites.map(function (s) { return s.id; }); return list.slice().sort(function (a, b) { return ref.indexOf(a.id) - ref.indexOf(b.id); }); };
    html += '<div class="cc-grid"><div class="card cc-risk"><div class="card-head"><div><span class="kick">مؤشر الخطر اليومي · 0 إلى 100</span><h2>خريطة الخطر للمواقع</h2></div><div class="rlegend"><span><i class="rt-low"></i>منخفض</span><span><i class="rt-mid"></i>متوسط</span><span><i class="rt-high"></i>مرتفع</span><span><i class="rt-crit"></i>حرج</span></div></div>' +
      Object.keys(secs).map(function (k) {
        var list = order(secs[k]), core = list.filter(function (r) { return !/محطة/.test(r.name); }), stn = list.filter(function (r) { return /محطة/.test(r.name); }), sec = m.bySector.filter(function (x) { return x.name === k; })[0] || {};
        return '<div class="rsec"><div class="rsec-h"><b>قطاع ' + esc(k) + '</b><span>الالتزام <b class="mono">' + pctTxt(sec.compliance) + '</b></span><span>متوسط الخطر <b class="mono">' + (sec.avgRisk || 0) + '</b></span>' + (sec.closed ? '<span class="pill p-bad">' + sec.closed + ' مغلق</span>' : '') + (sec.alert ? '<span class="pill p-warn">' + sec.alert + ' إنذار</span>' : '') + '</div>' +
          '<div class="rtiles">' + core.map(riskTile).join('') + '</div>' + (stn.length ? '<div class="rsub">محطات التسمين بترتيب التسكين</div><div class="rtiles mini">' + stn.map(riskTile).join('') + '</div>' : '') + '</div>';
      }).join('') + '<p class="xs muted">يُحسب لكل موقع من آخر 7 أيام: البلاغات المفتوحة، محاولات الدخول المرفوضة، الدخول الاستثنائي واليدوي، المخالفات، دخول من هم تحت المراقبة أو القادمين من مستوى أقل أماناً، مع وزن أعلى للأمهات والتفريخ. اضغط أي موقع لمعرفة الأسباب.</p></div>';
    var hot = d.alerts.filter(function (a) { return a.level === 'bad'; }).length;
    html += '<div class="stack" style="gap:16px"><div class="card cc-feed"><div class="card-head"><div><span class="kick">آخر 24 ساعة</span><h2>الإنذارات الحية</h2></div>' + (hot ? '<span class="pill p-bad">' + hot + ' مهم</span>' : '<span class="pill p-ok">مستقر</span>') + '</div><div class="feed">' +
      (d.alerts.slice(0, 7).map(function (a) { return '<div class="fe fe-' + a.level + (a.route ? ' click" data-goto="' + esc(a.route) : '') + '"><i></i><div><div class="spread"><b>' + esc(a.title) + '</b><span class="xs muted">' + esc(ago(a.time)) + '</span></div><span class="small muted">' + esc(a.body) + '</span></div></div>'; }).join('') || '<p class="empty">' + icon('check') + 'لا توجد إنذارات · الوضع طبيعي</p>') + '</div></div>';
    html += '<div class="card cc-top"><div class="card-head"><div><span class="kick">الأولوية الآن</span><h2>أعلى المواقع خطراً</h2></div></div>' + m.risk.slice(0, 4).map(function (r, i) {
      return '<button type="button" class="tr-row" data-risk="' + esc(r.id) + '"><span class="tr-rank mono">' + (i + 1) + '</span><div class="t"><b>' + esc(r.name) + '</b><span>' + esc(r.factors.length ? r.factors[0].label + ' (' + r.factors[0].n + ')' : 'لا توجد عوامل خطر') + '</span></div><span class="tr-sc" style="--c:' + BAND_C[r.bk] + '"><b class="mono">' + r.score + '</b>' + esc(r.band) + '</span></button>';
    }).join('') + '</div></div></div>';
    if (d.pending.length) html += '<div class="card"><div class="card-head"><h2>' + icon('inbox') + ' طلبات تحتاج قرارك الآن</h2><span class="badge">' + d.pending.length + '</span></div><div class="grid-2" style="gap:10px">' + d.pending.slice(0, 4).map(function (a) { return reqCard(a, true); }).join('') + '</div></div>';
    html += '<div class="cc-grid g2"><div class="card"><div class="card-head"><div><span class="kick">آخر 7 أيام · مرّر على أي يوم للتفاصيل</span><h2>اتجاه الالتزام</h2></div><span class="sub">الالتزام = دخول مطابق من أول مرة ÷ كل محاولات الدخول</span></div><div id="ccChart"></div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">لكل ساعة</span><h2>حركة الدخول · آخر 24 ساعة</h2></div></div><div id="chartBox"></div></div></div>';
    var iso = d.isolation;
    html += '<div class="cc-grid g3"><div class="card"><div class="card-head"><div><span class="kick">' + plural(inside, 'شخص', 'أشخاص') + '</span><h2>داخل المواقع الآن</h2></div></div><div class="list">' + (d.onSite.slice(0, 7).map(function (o) {
      return '<div class="li click" data-hist="' + esc(o.item.id) + '"><span class="av">' + esc(initials(o.item.name)) + '<span class="dot d-ok"></span></span><div class="t"><b>' + esc(o.item.name) + '</b><span>' + esc(o.siteName) + '</span></div><div class="meta">' + esc(ago(o.since)) + '</div></div>';
    }).join('') || '<p class="empty">لا أحد مسجل داخل المواقع</p>') + (inside > 7 ? '<p class="xs muted">و' + (inside - 7) + ' آخرون</p>' : '') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">' + plural(iso.length, 'شخص', 'أشخاص') + '</span><h2>في فترة عزل الآن</h2></div></div><div class="iso">' + (iso.slice(0, 6).map(function (i) {
        var lv = d.levels.filter(function (l) { return i.until[l]; }), mx = lv.reduce(function (a, l) { return Math.max(a, i.until[l]); }, 0);
        return '<div class="iso-row" data-hist="' + esc(i.item.id) + '"><span class="av">' + esc(initials(i.item.name)) + '</span><div class="t"><b>' + esc(i.item.name) + '</b><span>ممنوع من ' + lv.map(function (l) { return 'م' + l; }).join('، ') + ' · ' + hoursLeft(mx) + ' س متبقية</span></div></div>';
      }).join('') || '<p class="empty">' + icon('check') + 'لا يوجد أحد في فترة عزل</p>') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">آخر 7 أيام</span><h2>ملخص الأسبوع</h2></div></div><div class="wk">' + [
        ['محاولات دخول', days.reduce(function (a, x) { return a + x.attempts; }, 0)], ['مرفوض', days.reduce(function (a, x) { return a + x.denied; }, 0)], ['استثنائي', days.reduce(function (a, x) { return a + x.overrides; }, 0)], ['مخالفات', days.reduce(function (a, x) { return a + x.flags; }, 0)], ['بلاغات', days.reduce(function (a, x) { return a + x.reports; }, 0)], ['الالتزام', pctTxt(m.compliance)]
      ].map(function (x) { return '<div><b class="mono">' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('') + '</div><button class="btn block" type="button" data-goto="report">' + icon('file') + ' عرض التقرير التنفيذي</button></div></div>';
    html += '<div class="card"><div class="card-head"><div><span class="kick">اضغط أي حركة لعرض سجل الشخص أو المركبة</span><h2>آخر الحركات</h2></div></div>' +
      '<div class="tbl hide-sm"><table><thead><tr><th>الوقت</th><th>الاسم</th><th>الموقع</th><th>الاتجاه</th><th>القرار</th><th>نقطة التسجيل</th></tr></thead><tbody>' +
      d.recent.slice(0, 12).map(function (mv) { return '<tr class="click" data-hist="' + esc(mv.itemId) + '"><td class="num small">' + esc(fmt(mv.time)) + '</td><td><b>' + esc(mv.itemName) + '</b></td><td>' + esc(mv.siteName) + '</td><td>' + esc(mv.dir) + '</td><td>' + decisionPill(mv) + (mv.offline ? ' <span class="pill p-info">' + icon('wifioff') + ' دون اتصال</span>' : '') + (/يدوي/.test(mv.via || '') ? ' <span class="pill p-warn" title="' + esc(mv.via) + '">' + icon('card') + ' يدوي</span>' : '') + '</td><td class="small muted">' + esc(mv.checkpoint || mv.user) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="list only-sm">' + d.recent.slice(0, 8).map(function (mv) { return '<div class="click" data-hist="' + esc(mv.itemId) + '">' + moveLi(mv) + '</div>'; }).join('') + '</div></div>';
    el.innerHTML = html;
    bindDecide(el);
    var cc = $('ccChart'); if (cc) { cc.innerHTML = complianceChart(m, cc.clientWidth); bindComplianceChart(el, m); }
    var cb = $('chartBox'); if (cb) { cb.innerHTML = activityChart(d.hourly, cb.clientWidth); bindChart(el, d.hourly || []); }
    $('dashRefresh').onclick = loadDash;
    if ($('lockBtn')) $('lockBtn').onclick = function () { lockdownSheet(d); };
    el.querySelectorAll('[data-goto]').forEach(function (b) { b.onclick = function () { go(b.dataset.goto); }; });
    el.querySelectorAll('[data-risk]').forEach(function (b) { b.onclick = function () { riskSheet(m.risk.filter(function (r) { return r.id === b.dataset.risk; })[0]); }; });
    el.querySelectorAll('[data-hist]').forEach(function (r) { r.onclick = function () { go('history/' + r.dataset.hist); }; });
  }
  function riskSheet(r) {
    if (!r) return;
    var max = r.factors.reduce(function (a, f) { return a + f.pts; }, 0) || 1;
    openSheet('<div class="sheet-head sh-dark"><span class="permit">مؤشر الخطر اليومي · آخر 7 أيام</span><div class="rs-top">' + ring(r.score, 92, 9, BAND_C[r.bk], 'مؤشر الخطر') + '<div class="rs-v"><b class="mono">' + r.score + '</b><span>' + esc(r.band) + '</span></div></div><h2>' + esc(r.name) + '</h2><span class="small">قطاع ' + esc(r.sector) + ' · المستوى ' + r.level + ' · الحالة ' + esc(r.status) + '</span></div><div class="sheet-body">' +
      (r.factors.length ? '<div class="rf">' + r.factors.map(function (f) { return '<div class="rf-row"><div class="spread"><span>' + esc(f.label) + (f.n > 1 ? ' <span class="muted">× ' + f.n + '</span>' : '') + '</span><b class="mono">+' + f.pts + '</b></div><i style="width:' + (f.pts / max * 100) + '%;background:' + BAND_C[r.bk] + '"></i></div>'; }).join('') + '</div>' +
        (r.mult !== 1 ? '<p class="xs muted">× ' + r.mult + ' وزن حساسية المستوى ' + r.level + (r.level <= 2 ? ' (الأمهات والتفريخ أعلى حساسية)' : '') + '</p>' : '') : '<div class="infobox small">' + icon('check') + ' لا توجد عوامل خطر مسجلة لهذا الموقع خلال آخر 7 أيام.</div>') +
      '<div class="grid-2" style="gap:8px">' + (can('sites') ? '<button class="btn" data-a="status">' + icon('alert') + ' تغيير حالة الموقع</button>' : '') + (can('analytics') ? '<button class="btn" data-a="trace">' + icon('trace') + ' تتبع العدوى</button><button class="btn primary" data-a="sim">' + icon('radar') + ' محاكاة تفشٍ هنا</button>' : '') + '</div>' +
      '<button class="btn ghost" data-a="close">إغلاق</button></div>', function (a) {
      if (a === 'close') return closeSheet();
      closeSheet();
      if (a === 'status') siteStatusSheet(r.id); else if (a === 'trace') go('trace/' + r.id); else if (a === 'sim') go('sim/' + r.id);
    });
  }
  function lockdownSheet(d) {
    var secs = d.model.bySector, sel = secs[0] && secs[0].name;
    function body() {
      var s = secs.filter(function (x) { return x.name === sel; })[0], locked = s && s.closed === s.sites;
      return '<div class="field"><span class="flabel">القطاع</span><div class="seg" role="group">' + secs.map(function (x) { return '<button type="button" data-a="sec" data-s="' + esc(x.name) + '" class="' + (x.name === sel ? 'on' : '') + '">قطاع ' + esc(x.name) + '<small>' + plural(x.sites, 'موقع', 'مواقع') + (x.closed ? ' · ' + x.closed + ' مغلق' : '') + '</small></button>'; }).join('') + '</div></div>' +
        '<div class="field"><label for="lkNote">السبب (يصل مع القرار لكل البوابات)</label><textarea id="lkNote" rows="2" placeholder="مثال: اشتباه إنفلونزا طيور في محيط القطاع"></textarea></div>' +
        (locked ? '<button class="btn ok big" data-a="lift">' + icon('check') + ' رفع الإغلاق عن قطاع ' + esc(sel) + '</button>'
          : '<div class="lk-warn">' + icon('alert') + '<span>سيُغلق <b>' + plural(s.sites, 'موقع', 'مواقع') + '</b> في قطاع ' + esc(sel) + ' فوراً، وتمنع كل البوابات أي دخول، ويصل قرار عاجل لكل بوابات القطاع وللمديرين.</span></div><button class="btn bad big" data-a="lock">' + icon('lock') + ' تأكيد الإغلاق الطارئ لقطاع ' + esc(sel) + '</button>') +
        '<button class="btn ghost" data-a="close">إلغاء</button>';
    }
    openSheet('<div class="sheet-head sh-bad"><span class="permit">إجراء طوارئ</span><span class="big-ico">' + icon('lock') + '</span><h2>الإغلاق الطارئ لقطاع كامل</h2></div><div class="sheet-body" id="lkBody">' + body() + '</div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'sec') { sel = b.dataset.s; $('lkBody').innerHTML = body(); return; }
      if (a === 'lock' || a === 'lift') {
        b.disabled = true;
        remote('lockdown', [S.session.pin, sel, a === 'lock', $('lkNote') ? $('lkNote').value : '']).then(function (r) { closeSheet(); toast(a === 'lock' ? 'تم إغلاق ' + plural(r.sites, 'موقع', 'مواقع') + ' في قطاع ' + sel + ' وإبلاغ كل البوابات' : 'عاد قطاع ' + sel + ' للعمل الطبيعي', 5000); return sync(); }).then(loadDash).catch(function (e) { b.disabled = false; toast(errText(e)); });
      }
    });
  }

  /* ---------- محاكاة التفشي ---------- */
  function viewSim(args) {
    var sites = S.ref ? S.ref.sites.filter(function (s) { return !s.external; }) : [];
    var sel = args[0] || 'W-F05', days = Number(args[1]) || 14, sectors = [];
    sites.forEach(function (s) { if (sectors.indexOf(s.sector) < 0) sectors.push(s.sector); });
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><span class="crumb">' + icon('dash') + ' مركز القيادة</span><h1>' + icon('radar') + ' محاكاة التفشي</h1><p>ماذا لو ظهرت إصابة في أحد المواقع اليوم؟ يحسب النظام من الحركات الفعلية دوائر الانتشار، وما يجب عزله وإغلاقه، ويجهز خطة الاحتواء للتنفيذ بلمسة.</p></div></div>' +
      '<form class="sim-ctl card" id="simForm"><div class="field grow"><label for="simSite">موقع الإصابة المفترضة</label><select id="simSite">' + sectors.map(function (sec) {
        return '<optgroup label="قطاع ' + esc(sec) + '">' + sites.filter(function (s) { return s.sector === sec; }).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '</select></div><div class="field"><span class="flabel">فترة الرجوع</span><div class="seg sm" role="group">' + [7, 14, 21].map(function (n) { return '<button type="button" data-days="' + n + '" class="' + (n === days ? 'on' : '') + '">' + n + ' يوماً</button>'; }).join('') + '</div></div>' +
      '<button class="btn primary big" type="submit">' + icon('radar') + ' شغّل المحاكاة</button></form><div id="simOut"></div></section>';
    $('simForm').querySelectorAll('[data-days]').forEach(function (b) { b.onclick = function () { days = Number(b.dataset.days); $('simForm').querySelectorAll('[data-days]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('simForm').onsubmit = function (e) { e.preventDefault(); sel = $('simSite').value; history.replaceState(null, '', '#sim/' + sel + '/' + days); S.route = 'sim/' + sel + '/' + days; load(); };
    function load() {
      $('simOut').innerHTML = '<div class="card"><p class="empty"><span class="spin"></span>جارٍ حساب دوائر الانتشار…</p></div>';
      remote('simulate', [S.session.pin, sel, days]).then(drawSim).catch(function (e) { $('simOut').innerHTML = e.net ? offlineCard('محاكاة التفشي') : ''; if (!e.net) toast(errText(e)); });
    }
    load();
  }
  function simRings(s) {
    var W = 520, H = 400, cx = W / 2, cy = H / 2, R = [0, 92, 168];
    var nodes = s.ring2.slice(0, 14), k = nodes.length;
    var out = '<svg class="sim-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="دوائر الانتشار حول ' + esc(s.site.name) + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R[2] + '" class="sr3"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R[1] + '" class="sr2"/><circle cx="' + cx + '" cy="' + cy + '" r="46" class="sr1"/>';
    nodes.forEach(function (n, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, k), rr = i % 2 ? R[2] - 22 : R[1] + 34, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      var nm = String(n.name).match(/محطة\s*(\d+)/); nm = nm ? 'محطة ' + nm[1] : String(n.name).replace(/\s*\(.*?\)\s*/g, '').replace('معمل ', '').replace('مصنع ', '');
      out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" class="sl"/><g class="sn"><circle cx="' + x + '" cy="' + y + '" r="' + (9 + Math.min(10, n.count * 2)) + '"/><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" class="sc">' + n.count + '</text><text x="' + x + '" y="' + (y + 30 + Math.min(10, n.count * 2) - 4) + '" text-anchor="middle" class="st">' + esc(nm) + '</text></g>';
    });
    var cn = String(s.site.name).match(/محطة\s*(\d+)/);
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="40" class="s0"/><text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="s0t">' + esc(cn ? 'محطة ' + cn[1] : 'المصدر') + '</text><text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="s0s">' + s.ring1.length + ' مخالط</text></svg>';
    return out;
  }
  function simText(s) {
    var L = ['🚨 محاكاة تفشٍ: ' + s.site.name, 'شدة الانتشار المتوقعة: ' + s.severity + '/100 (' + s.band.label + ')', 'المخالطون المباشرون: ' + s.ring1.length + ' · مواقع معرضة: ' + s.ring2.length + ' · الدائرة الثالثة: ' + s.ring3.length, '', 'خطة الاحتواء:'];
    s.plan.forEach(function (p, i) { L.push((i + 1) + '. ' + p.text + ' (' + p.who + ')'); });
    return L.join('\n');
  }
  function drawSim(s) {
    var out = $('simOut'); if (!out) return;
    var bc = BAND_C[s.band.k];
    var html = '<div class="sim-top"><div class="card sim-sev"><span class="kick">شدة الانتشار المتوقعة</span><div class="rs-top">' + ring(s.severity, 120, 11, bc, 'شدة الانتشار') + '<div class="rs-v"><b class="mono">' + s.severity + '</b><span>' + esc(s.band.label) + '</span></div></div>' +
      '<div class="sim-k"><div><b class="mono">' + s.ring1.length + '</b><span>مخالط مباشر</span></div><div><b class="mono">' + s.ring2.length + '</b><span>موقع معرض</span></div><div><b class="mono">' + s.ring3.length + '</b><span>الدائرة الثالثة</span></div><div><b class="mono">' + s.inside.length + '</b><span>داخل المواقع الآن</span></div></div>' +
      '<p class="xs muted">' + plural(s.ring2.length, 'موقع', 'مواقع') + ' من ' + s.companySites + ' في ' + s.sectors.map(function (x) { return 'قطاع ' + x; }).join(' و') + ' · عزل لا يقل عن ' + s.isoHours + ' ساعة</p></div>' +
      '<div class="card sim-map"><div class="card-head"><div><span class="kick">آخر ' + s.days + ' يوماً</span><h2>دوائر الانتشار</h2></div><div class="rlegend"><span><i style="background:var(--r-crit)"></i>المصدر</span><span><i style="background:var(--r-high)"></i>موقع معرض (عدد المخالطين)</span></div></div>' + simRings(s) + '</div></div>';
    html += '<div class="card sim-plan"><div class="card-head"><div><span class="kick">جاهزة للتنفيذ</span><h2>خطة الاحتواء</h2></div><div class="row">' +
      '<a class="btn sm wa" target="_blank" rel="noopener" href="' + esc(waLink(simText(s))) + '">' + icon('wa') + ' مشاركة</a>' +
      (s.canAct ? '<button class="btn sm bad" type="button" id="simAct">' + icon('lock') + ' نفّذ الخطة الآن</button>' : '') + '</div></div><ol class="plan">' +
      s.plan.map(function (p) { return '<li><span class="pi pi-' + p.k + '">' + icon({ close: 'lock', alert: 'alert', isolate: 'clock', watch: 'eye', sample: 'tool', notify: 'mega' }[p.k] || 'check') + '</span><div><b>' + esc(p.text) + '</b><span>المسؤول: ' + esc(p.who) + '</span></div></li>'; }).join('') + '</ol></div>';
    var list = function (title, kick, rows) { return '<div class="card"><div class="card-head"><div><span class="kick">' + kick + '</span><h2>' + title + '</h2></div></div><div class="list">' + (rows || '<p class="empty">لا يوجد</p>') + '</div></div>'; };
    html += '<div class="cc-grid g3">' +
      list('الدائرة الأولى', 'دخلوا ' + esc(s.site.name), s.ring1.slice(0, 10).map(function (e) { return '<div class="li click" data-hist="' + esc(e.itemId) + '"><span class="av">' + esc(initials(e.name)) + '</span><div class="t"><b>' + esc(e.name) + '</b><span>' + (e.onward.length ? 'انتقل إلى ' + plural(e.onward.length, 'موقع', 'مواقع') : 'لم ينتقل لموقع آخر') + (e.insideAt ? ' · داخل ' + esc(e.insideAt) + ' الآن' : '') + '</span></div></div>'; }).join('')) +
      list('الدائرة الثانية', 'مواقع زارها المخالطون بعده', s.ring2.map(function (x) { return '<div class="li"><span class="av av-w">' + x.count + '</span><div class="t"><b>' + esc(x.name) + '</b><span>قطاع ' + esc(x.sector) + ' · أول وصول ' + esc(ago(x.firstAt)) + '</span></div></div>'; }).join('')) +
      list('الدائرة الثالثة', 'دخلوا المواقع المعرضة بعد المخالطين', s.ring3.slice(0, 10).map(function (x) { return '<div class="li click" data-hist="' + esc(x.itemId) + '"><span class="av">' + esc(initials(x.name)) + '</span><div class="t"><b>' + esc(x.name) + '</b><span>' + esc(x.sites.slice(0, 2).join('، ')) + '</span></div></div>'; }).join('') + (s.ring3.length > 10 ? '<p class="xs muted">و' + (s.ring3.length - 10) + ' آخرون</p>' : '')) + '</div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-hist]').forEach(function (r) { r.onclick = function () { go('history/' + r.dataset.hist); }; });
    if ($('simAct')) $('simAct').onclick = function () {
      openSheet('<div class="sheet-head sh-bad"><span class="permit">تأكيد خطة الاحتواء</span><span class="big-ico">' + icon('lock') + '</span><h2>إغلاق ' + esc(s.site.name) + '</h2></div><div class="sheet-body"><p>سيُغلق الموقع المصدر فوراً، وتُرفع حالة الإنذار في ' + plural(s.ring2.length, 'موقع', 'مواقع') + '، ويصل قرار عاجل لبوابات ' + s.sectors.map(function (x) { return 'قطاع ' + x; }).join(' و') + '. هذا إجراء حقيقي وليس محاكاة.</p><button class="btn bad big" data-a="go">' + icon('lock') + ' تأكيد التنفيذ</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a, b) {
        if (a === 'close') return closeSheet();
        b.disabled = true;
        remote('containPlan', [S.session.pin, s.site.id, s.ring2.map(function (x) { return x.siteId; }), 'من محاكاة التفشي']).then(function (r) { closeSheet(); toast('نُفذت الخطة: إغلاق المصدر وإنذار ' + plural(r.alerted, 'موقع', 'مواقع') + ' وإبلاغ البوابات', 5000); return sync(); }).then(function () { go('dash'); }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      });
    };
  }

  /* ---------- التقرير التنفيذي ---------- */
  function viewReport(args) {
    var days = Number(args[0]) || 7;
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><span class="crumb">' + icon('dash') + ' مركز القيادة</span><h1>' + icon('file') + ' التقرير التنفيذي</h1><p>صفحة واحدة للإدارة العليا تُبنى تلقائياً من بيانات التشغيل الفعلية.</p></div><div class="row"><div class="seg sm" role="group">' + [7, 30].map(function (n) { return '<button type="button" data-days="' + n + '" class="' + (n === days ? 'on' : '') + '">' + (n === 7 ? 'أسبوعي' : 'شهري') + '</button>'; }).join('') + '</div></div></div><div id="repOut"><div class="card"><p class="empty"><span class="spin"></span>جارٍ إعداد التقرير…</p></div></div></section>';
    $('main').querySelectorAll('[data-days]').forEach(function (b) { b.onclick = function () { go('report/' + b.dataset.days); }; });
    remote('execReport', [S.session.pin, days]).then(drawReport).catch(function (e) { $('repOut').innerHTML = e.net ? offlineCard('التقرير التنفيذي') : ''; if (!e.net) toast(errText(e)); });
  }
  function repText(r) {
    var c = r.cur, L = ['📊 التقرير التنفيذي للأمن الحيوي · ' + (r.days === 7 ? 'أسبوعي' : 'آخر ' + r.days + ' يوماً'), (CFG.COMPANY || 'كايرو ثري إيه') + ' · ' + fmt(r.from) + ' – ' + fmt(r.now), '',
      'مؤشر الجاهزية: ' + r.posture + '/100 · الحالة: ' + r.readiness.label, 'الالتزام: ' + pctTxt(c.compliance), 'محاولات الدخول: ' + c.attempts + ' · مرفوض: ' + c.denied + ' · استثنائي: ' + c.overrides, 'البلاغات العاجلة: ' + c.reports + (c.avgAck != null ? ' · متوسط الاستجابة ' + c.avgAck + ' د' : ''), '', 'أعلى المواقع خطراً:'];
    r.topRisk.slice(0, 3).forEach(function (x, i) { L.push((i + 1) + '. ' + x.name + ' · ' + x.score + ' (' + x.band + ')'); });
    L.push('', 'التوصيات:'); r.recs.forEach(function (x) { L.push('• ' + x); });
    return L.join('\n');
  }
  function drawReport(r) {
    var o = $('repOut'); if (!o) return;
    var c = r.cur, p = r.prev, cmp = p.attempts >= 20;
    var kv = function (lbl, v, pv, goodUp, unit) {
      var dd = cmp && pv != null && v != null ? Math.round((v - pv) * 10) / 10 : null;
      return '<div class="rk"><span>' + lbl + '</span><b class="mono">' + (v == null ? '—' : v + (unit || '')) + '</b>' + (dd == null ? '<small>—</small>' : '<small class="' + (dd === 0 || goodUp == null ? '' : (goodUp ? dd > 0 : dd < 0) ? 'g' : 'b') + '">' + (dd > 0 ? '▲ ' : dd < 0 ? '▼ ' : '') + Math.abs(dd) + (unit || '') + ' عن الفترة السابقة</small>') + '</div>';
    };
    var pc = r.posture >= 85 ? 'var(--r-low)' : r.posture >= 70 ? 'var(--r-mid)' : r.posture >= 55 ? 'var(--r-high)' : 'var(--r-crit)';
    var html = '<article class="rep"><header class="rep-h"><div class="rep-brand">' + logoImg() + '<div><b>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + '</b><span>التقرير التنفيذي للأمن الحيوي</span></div></div><div class="rep-meta"><b>' + (r.days === 7 ? 'التقرير الأسبوعي' : 'تقرير آخر ' + r.days + ' يوماً') + '</b><span>' + esc(fmt(r.from)) + ' – ' + esc(fmt(r.now)) + '</span><span>النطاق: ' + esc(r.scope || 'كل القطاعات') + '</span></div></header>' +
      '<section class="rep-hero"><div class="cc-gauge">' + ring(r.posture, 112, 10, pc, 'مؤشر الجاهزية') + '<div class="cc-gv"><b class="mono">' + r.posture + '</b><span>مؤشر الجاهزية</span></div></div><div class="rep-sum"><span class="cc-state st-' + r.readiness.k + ' inline"><b>' + esc(r.readiness.label) + '</b></span><h2>' + (r.posture >= 85 ? 'الوضع مستقر والالتزام مرتفع' : r.posture >= 70 ? 'الوضع جيد مع نقاط تحتاج متابعة' : 'الوضع يحتاج تدخلاً إدارياً') + '</h2><p>سجّل النظام <b>' + c.attempts + '</b> محاولة دخول لـ <b>' + c.people + '</b> فرداً ومركبة ومعدة. نسبة الالتزام <b>' + pctTxt(c.compliance) + '</b>، ومنع النظام <b>' + c.denied + '</b> محاولة دخول مخالفة قبل وقوعها' + (c.reports ? '، وتعامل مع <b>' + c.reports + '</b> بلاغ عاجل' + (c.avgAck != null ? ' بمتوسط استجابة ' + c.avgAck + ' دقيقة' : '') : '') + '.</p></div></section>' +
      '<section class="rep-k">' + kv('نسبة الالتزام', c.compliance, p.compliance, true, '%') + kv('محاولات الدخول', c.attempts, p.attempts, null) + kv('دخول مرفوض', c.denied, p.denied, false) + kv('دخول استثنائي', c.overrides, p.overrides, false) + kv('دخول يدوي بدون كارت', c.manual, p.manual, false) + kv('بلاغات عاجلة', c.reports, p.reports, false) + '</section>' +
      '<section class="rep-2"><div><h3>الالتزام حسب القطاع</h3><table class="rep-t"><thead><tr><th>القطاع</th><th>الالتزام</th><th>متوسط الخطر</th><th>أعلى خطر</th><th>الحالة</th></tr></thead><tbody>' + r.bySector.map(function (s) { return '<tr><td><b>' + esc(s.name) + '</b></td><td class="mono">' + pctTxt(s.compliance) + '</td><td class="mono">' + s.avgRisk + '</td><td class="mono">' + s.maxRisk + '</td><td>' + (s.closed ? '<span class="pill p-bad">' + s.closed + ' مغلق</span>' : s.alert ? '<span class="pill p-warn">' + s.alert + ' إنذار</span>' : '<span class="pill p-ok">طبيعي</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div><h3>أعلى المواقع خطراً</h3><ol class="rep-risk">' + r.topRisk.map(function (x) { return '<li><span class="tr-sc" style="--c:' + BAND_C[x.bk] + '"><b class="mono">' + x.score + '</b>' + esc(x.band) + '</span><div><b>' + esc(x.name) + '</b><span>' + esc(x.factors.slice(0, 2).map(function (f) { return f.label + ' (' + f.n + ')'; }).join(' · ') || 'لا توجد عوامل خطر') + '</span></div></li>'; }).join('') + '</ol></div></section>' +
      '<section class="rep-recs"><h3>' + icon('check') + ' التوصيات</h3><ol>' + r.recs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></section>' +
      (c.repeat.length ? '<section class="rep-recs"><h3>' + icon('user') + ' تكرار محاولات الدخول المخالفة</h3><ol>' + c.repeat.map(function (x) { return '<li>' + esc(x.name) + ' · ' + x.n + ' محاولات</li>'; }).join('') + '</ol></section>' : '') +
      '<footer class="rep-f"><span>أُعد تلقائياً بواسطة نظام تتبع الأمن الحيوي · ' + esc(fmt(r.now)) + ' · بطلب ' + esc(r.by) + '</span><span>' + r.notices + ' قرار صدر خلال الفترة</span></footer></article>' +
      '<div class="row rep-acts"><a class="btn wa" target="_blank" rel="noopener" href="' + esc(waLink(repText(r))) + '">' + icon('wa') + ' إرسال الملخص على واتساب</a>' + (MODE !== 'demo' ? '<button class="btn" type="button" onclick="window.print()">' + icon('printer') + ' طباعة أو حفظ PDF</button>' : '') + '</div>';
    o.innerHTML = html;
  }
  function siteStatusSheet(id) {
    var s = S.ref.sites.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    openSheet('<div class="sheet-head sh-brand"><h2>' + esc(s.name) + '</h2><span class="small">الحالة الحالية: ' + esc(s.status) + '</span></div><div class="sheet-body">' +
      '<div class="field"><label for="stNote">ملاحظة تصل مع القرار (اختياري)</label><textarea id="stNote" rows="2" placeholder="مثال: اشتباه نفوق مرتفع في عنبر 3"></textarea></div>' +
      (can('sites') ? '<button class="btn ok big" data-a="نشط">' + icon('check') + ' نشط: عمل طبيعي</button>' +
      '<button class="btn big" data-a="إنذار" style="border-color:var(--warn);color:var(--warn)">' + icon('alert') + ' إنذار: عزل مشدد لكل من زاره</button>' +
      '<button class="btn bad big" data-a="مغلق">' + icon('x') + ' مغلق: منع الدخول نهائياً</button>' : '<div class="infobox small">تغيير حالة الموقع لمن لديه صلاحية «إنذار وإغلاق المواقع».</div>') +
      (can('analytics') ? '<button class="btn primary big" data-a="trace">' + icon('trace') + ' تتبع كل من زار الموقع وأين ذهب بعده</button>' : '') +
      '<p class="xs muted">يصل قرار تغيير الحالة فوراً لكل بوابات قطاع ' + esc(s.sector) + '، ويطبقه النظام تلقائياً على قرارات الدخول.</p><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a) {
      if (a === 'close') return closeSheet();
      if (a === 'trace') { closeSheet(); return go('trace/' + id); }
      remote('setSiteStatus', [S.session.pin, id, a, $('stNote').value]).then(function () { closeSheet(); toast('تم تغيير حالة ' + s.name + ' إلى ' + a + ' وإبلاغ البوابات'); return sync(); }).then(function () { if (S.route.indexOf('trace') === 0 || S.route === 'map') render(); else loadDash(); }).catch(function (e) { toast(errText(e)); });
    });
  }




  /* ============================ البلاغات العاجلة والتواصل ============================ */
  var R_STEPS = ['أُرسل', 'جديد', 'فتحه المدير', 'جارٍ التعامل', 'مغلق'];
  var R_ICONS = { 'اشتباه مرض أو نفوق مفاجئ': 'alert', 'دخول بالقوة أو بدون تصريح': 'shield', 'عطل في التطهير أو نقص مطهر': 'tool', 'أخرى': 'chat' };
  var QUICK = ['سيارة علف وصلت البوابة', 'نقص في المطهر', 'زائر بدون موعد مسبق', 'عطل في حوض التطهير', 'تم تنفيذ التعليمات', 'أحتاج اتصالاً عاجلاً'];
  var QUICK_MGR = ['تم، جاري التعامل', 'امنع الدخول حتى أصل', 'أرسل صورة من الموقع', 'نفّذ تطهيراً مضاعفاً', 'اسمح بالدخول بعد التطهير الكامل', 'اتصل بي فوراً'];
  function reportTypes() { return (window.BIO && BIO.REPORT_TYPES) || ['أخرى']; }
  function rStatusPill(r) {
    var c = r.queued ? 'p-info' : r.status === 'مغلق' ? 'p-ok' : r.status === 'جارٍ التعامل' ? 'p-info' : r.status === 'فتحه المدير' ? 'p-warn' : 'p-bad';
    return '<span class="pill ' + c + '">' + esc(r.queued ? 'محفوظ، يُرسل عند عودة الاتصال' : r.status) + '</span>';
  }
  function rTracker(r) {
    var idx = r.queued ? 0 : Math.max(1, R_STEPS.indexOf(r.status));
    var labels = ['أُرسل', 'وصل', 'فتحه المدير', 'جارٍ التعامل', 'مغلق'];
    return '<ol class="rtrack">' + labels.map(function (l, i) { return '<li class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"><i></i><span>' + l + '</span></li>'; }).join('') + '</ol>';
  }
  function renderMyReports() {
    var el = $('myReports'); if (!el || !S.comms || S.session.user.isManager) return;
    var list = (S.comms.reports || []).filter(function (r) { return r.status !== 'مغلق' || Date.now() - (r.closedAt || 0) < 6 * 36e5; }).slice(0, 2);
    el.innerHTML = list.map(function (r) {
      return '<div class="card rmine"><div class="spread"><b>' + icon(R_ICONS[r.type] || 'siren') + ' ' + esc(r.type) + '</b>' + rStatusPill(r) + '</div>' + rTracker(r) +
        '<div class="xs muted">' + esc(fmt(r.time)) + (r.siteName ? ' · ' + esc(r.siteName) : '') + (r.escLevel ? ' · تم التصعيد (مستوى ' + r.escLevel + ')' : '') + '</div>' +
        (r.action ? '<div class="small ract">' + icon('check') + ' ' + esc(r.action.split('\n').pop()) + '</div>' : '') + '</div>';
    }).join('');
  }
  function shrinkPhoto(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 960 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function reportSheet() {
    var sites = gateSites(), type = '', photo = '';
    openSheet('<div class="sheet-head sh-bad"><span class="permit">بلاغ عاجل · يصل المدير فوراً</span><span class="big-ico">' + icon('siren') + '</span><h2>ما الحالة؟</h2></div><div class="sheet-body">' +
      '<div class="rtypes">' + reportTypes().map(function (t) { return '<button type="button" class="rtype" data-a="type" data-t="' + esc(t) + '">' + icon(R_ICONS[t] || 'chat') + '<span>' + esc(t) + '</span></button>'; }).join('') + '</div>' +
      (sites.length ? '<div class="field"><label for="rSite">الموقع</label><select id="rSite"><option value="">بدون موقع محدد</option>' + sites.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === S.siteId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="field"><label for="rNote">التفاصيل (اختياري)</label><textarea id="rNote" rows="2" placeholder="مثال: نفوق مرتفع في عنبر 3 منذ الصباح"></textarea></div>' +
      '<div class="row"><label class="btn grow" for="rPhoto">' + icon('camera') + ' إرفاق صورة</label><input id="rPhoto" type="file" accept="image/*" capture="environment" hidden></div><div id="rPrev"></div>' +
      '<button class="btn bad big" data-a="send" id="rSend" disabled>' + icon('send') + ' أرسل البلاغ الآن</button>' +
      '<p class="xs muted">يصل للمدير إشعار فوري وواتساب وإيميل عالي الأهمية. إن لم يفتحه خلال ' + esc((S.ref && S.ref.settings.ESCALATE_MINUTES) || 5) + ' دقائق يُصعَّد تلقائياً لنائبه ثم مدير القطاع.</p>' +
      '<button class="btn ghost" data-a="close">إلغاء</button></div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'type') { type = b.dataset.t; document.querySelectorAll('.rtype').forEach(function (x) { x.classList.toggle('on', x === b); }); $('rSend').disabled = false; return; }
      if (a === 'send' && type) {
        var r = { id: 'B' + uid(), time: Date.now(), type: type, siteId: $('rSite') ? $('rSite').value : '', note: $('rNote').value.trim(), photo: photo };
        b.disabled = true;
        act('report', [r]).then(function (res) {
          closeSheet();
          var site = (S.ref ? S.ref.sites : []).filter(function (x) { return x.id === r.siteId; })[0];
          S.comms = S.comms || { reports: [] }; S.comms.reports = S.comms.reports || [];
          S.comms.reports.unshift({ id: r.id, time: r.time, type: r.type, siteName: site ? site.name : '', status: 'جديد', queued: !!res.queued, escLevel: 0 });
          renderMyReports(); persist();
          toast(res.queued ? 'البلاغ محفوظ على الجهاز ويُرسل فور عودة الإنترنت. للحالات الحرجة اتصل بالمدير' : 'وصل البلاغ للمدير الآن', 5000);
          if (!res.queued) sync();
        }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      }
    });
    $('rPhoto').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      shrinkPhoto(f).then(function (d) { photo = d; $('rPrev').innerHTML = '<div class="rprev"><img src="' + d + '" alt="صورة البلاغ"><button type="button" class="btn sm" id="rDrop">' + icon('x') + ' إزالة</button></div>'; $('rDrop').onclick = function () { photo = ''; $('rPrev').innerHTML = ''; }; }).catch(function () { toast('تعذر قراءة الصورة'); });
    };
  }
  /* ---------- شاشة التواصل ---------- */
  function viewComms(args) {
    S.commsRefresh = null;
    if (S.session.user.isManager) return args[0] ? viewManagerChat(args[0]) : viewManagerComms();
    var mp = S.session.managerPhone, me = S.session.managerEmail;
    $('main').innerHTML = '<section class="view comms"><div class="viewhead"><div><h1>' + icon('chat') + ' التواصل مع المدير</h1><p>رسائلك تصل للمدير فوراً كإشعار. للحالات الحرجة استخدم «بلاغ عاجل».</p></div>' +
      '<div class="row"><button class="btn sos" type="button" id="sosBtn2">' + icon('siren') + ' بلاغ عاجل</button></div></div>' +
      '<div class="comms-grid"><div class="card chat-card"><div class="card-head"><h2>' + icon('user') + ' مدير الأمن الحيوي</h2><div class="row">' +
      '<a class="btn sm wa" target="_blank" rel="noopener" id="waMgr" href="' + esc(mp ? 'https://wa.me/' + String(mp).replace(/[^\d]/g, '') : 'https://wa.me/') + '">' + icon('wa') + ' واتساب</a>' +
      '<a class="btn sm" id="mailMgr" href="mailto:' + esc(me || '') + '?subject=' + encodeURIComponent('رسالة من ' + (S.session.gate.name || S.session.user.name)) + '">' + icon('mail') + ' إيميل</a>' +
      (mp ? '<a class="btn sm" href="tel:' + esc(mp) + '">' + icon('phone') + ' اتصال</a>' : '') + '</div></div>' + chatShell() + '</div>' +
      '<div class="stack"><div class="card"><div class="card-head"><h2>' + icon('siren') + ' بلاغاتي</h2></div><div id="myRepList"></div></div></div></div></section>';
    $('sosBtn2').onclick = function () { reportSheet(); };
    var gate = S.session.gate.id;
    function drawReps() {
      var el = $('myRepList'); if (!el) return;
      var list = (S.comms && S.comms.reports) || [];
      el.innerHTML = list.map(function (r) { return '<div class="rrow"><div class="spread"><b class="small">' + icon(R_ICONS[r.type] || 'siren') + ' ' + esc(r.type) + '</b>' + rStatusPill(r) + '</div>' + rTracker(r) + '<span class="xs muted">' + esc(fmt(r.time)) + (r.siteName ? ' · ' + esc(r.siteName) : '') + '</span>' + (r.action ? '<div class="small ract">' + icon('check') + ' ' + esc(r.action.split('\n').pop()) + '</div>' : '') + '</div>'; }).join('') || '<p class="empty">' + icon('check') + '<b>لا توجد بلاغات</b><span class="xs">أي بلاغ عاجل ترسله يظهر هنا مع حالته لحظة بلحظة</span></p>';
    }
    drawReps();
    bindChat(gate, false, function (txt) { $('mailMgr').href = 'mailto:' + (me || '') + '?subject=' + encodeURIComponent('رسالة من ' + (S.session.gate.name || '')) + '&body=' + encodeURIComponent(txt); $('waMgr').href = (mp ? 'https://wa.me/' + String(mp).replace(/[^\d]/g, '') : 'https://wa.me/') + '?text=' + encodeURIComponent(txt); });
    var base = S.commsRefresh;
    S.commsRefresh = function () { drawReps(); if (base) base(); };
  }
  function chatShell(asMgr) {
    return '<div class="chat" id="chatBox"><p class="empty"><span class="spin"></span></p></div>' +
      '<div class="quick" id="quick">' + (asMgr ? QUICK_MGR : QUICK).map(function (q) { return '<button type="button" class="qchip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form class="chat-in" id="chatForm"><input id="chatText" type="text" autocomplete="off" placeholder="اكتب رسالة…" maxlength="1000"><button class="btn primary" type="submit" aria-label="إرسال">' + icon('send') + '</button></form>';
  }
  function bindChat(gate, asMgr, onDraft) {
    var key = gate || 'me';
    function draw(list) {
      var box = $('chatBox'); if (!box) return;
      var pend = S.outbox.filter(function (o) { return o.fn === 'sendMessage' && (asMgr ? o.args[0].gate === gate : true); }).map(function (o) { return { id: o.args[0].id, time: o.args[0].time, text: o.args[0].text, fromMgr: asMgr, fromName: S.session.user.name, queued: true }; });
      var all = (list || []).concat(pend.filter(function (p) { return !(list || []).some(function (m) { return m.id === p.id; }); }));
      var last = '';
      box.innerHTML = all.length ? all.map(function (m) {
        var mine = m.fromMgr === asMgr, day = new Date(m.time).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }), sep = day !== last ? '<div class="cday"><span>' + esc(day) + '</span></div>' : '';
        last = day;
        return sep + '<div class="msg ' + (mine ? 'me' : 'them') + '"><div class="bub">' + (!mine ? '<b class="xs">' + esc(m.fromName) + '</b>' : '') + '<span>' + esc(m.text) + '</span><small>' + esc(fmt(m.time, false)) + (mine ? ' · ' + (m.queued ? 'محفوظة' : m.readAt ? 'قُرئت ✓✓' : 'وصلت ✓') : '') + '</small></div></div>';
      }).join('') : '<p class="empty">' + icon('chat') + '<b>لا توجد رسائل بعد</b><span class="xs">اكتب رسالة أو اختر رداً جاهزاً</span></p>';
      box.scrollTop = box.scrollHeight;
    }
    function load() {
      remote('chat', [S.session.pin].concat(asMgr ? [gate] : [])).then(function (c) { S.chats[key] = c.messages; draw(c.messages); if (S.comms) { if (!asMgr) S.comms.unread = 0; } renderBadges(); })
        .catch(function (e) { draw(S.chats[key] || []); if (!e.net) toast(errText(e)); });
    }
    function send(text) {
      text = String(text || '').trim(); if (!text) return;
      var m = { id: 'G' + uid(), time: Date.now(), text: text };
      if (asMgr) m.gate = gate;
      act('sendMessage', [m]).then(function (res) { if (res.queued) draw(S.chats[key] || []); else load(); }).catch(function (e) { toast(errText(e)); });
      draw(S.chats[key] || []);
    }
    draw(S.chats[key]); load();
    $('chatForm').onsubmit = function (e) { e.preventDefault(); var t = $('chatText').value; $('chatText').value = ''; send(t); };
    $('chatText').oninput = function () { if (onDraft) onDraft(this.value); };
    $('quick').onclick = function (e) { var b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); };
    S.poll = setInterval(function () { if (!document.hidden && S.route.indexOf('comms') === 0 && !$('sheetWrap')) load(); }, MODE === 'demo' ? 4000 : 12000);
    S.commsRefresh = load;
  }
  /* ---------- المدير ---------- */
  function viewManagerComms() {
    $('main').innerHTML = '<section class="view comms"><div class="viewhead"><div><h1>' + icon('siren') + ' البلاغات والرسائل</h1><p>البلاغات العاجلة من البوابات، وحالة كل بلاغ، والمحادثات. افتح البلاغ لإيقاف التصعيد واتخاذ القرار.</p></div></div><div id="commsBody"><div class="card"><p class="empty"><span class="spin"></span></p></div></div></section>';
    function load() {
      Promise.all([remote('reports', [S.session.pin]), remote('threads', [S.session.pin])]).then(function (x) { draw(x[0], x[1]); })
        .catch(function (e) { if ($('commsBody')) $('commsBody').innerHTML = e.net ? offlineCard('عرض البلاغات') : ''; if (!e.net) toast(errText(e)); });
    }
    function draw(rp, th) {
      var el = $('commsBody'); if (!el) return;
      var st = rp.stats, open = rp.reports.filter(function (r) { return r.status !== 'مغلق'; }), closed = rp.reports.filter(function (r) { return r.status === 'مغلق'; });
      var html = '<div class="kpis" style="margin-top:16px">' + [
        ['k-bad', 'siren', st.open.length, 'بلاغ مفتوح', st.open.length ? 'hot-bad' : ''],
        ['k-warn', 'alert', rp.reports.filter(function (r) { return !r.readAt; }).length, 'لم يُفتح بعد', ''],
        ['k-ok', 'clock', st.avgMin == null ? '—' : st.avgMin, 'متوسط الاستجابة (دقيقة)', ''],
        ['k-brand', 'up', st.escalated30, 'تصعيد خلال 30 يوماً', '']
      ].map(function (k) { return '<div class="kpi ' + k[0] + ' ' + k[4] + '"><b>' + k[2] + '</b><span class="ki">' + icon(k[1]) + '</span><span>' + k[3] + '</span></div>'; }).join('') + '</div>';
      html += '<div class="comms-grid"><div class="stack" style="gap:18px"><div class="card"><div class="card-head"><h2>' + icon('siren') + ' بلاغات تحتاج تدخلك</h2><span class="badge">' + open.length + '</span></div><div class="rlist">' +
        (open.map(repCard).join('') || '<p class="empty">' + icon('check') + '<b>لا توجد بلاغات مفتوحة</b><span class="xs">أي بلاغ عاجل من البوابات يظهر هنا ويصلك كإشعار فوري</span></p>') + '</div></div>' +
        (closed.length ? '<div class="card"><div class="card-head"><h2>' + icon('check') + ' بلاغات أُغلقت</h2><span class="xs muted">آخر 7 أيام</span></div><div class="rlist">' + closed.map(repCard).join('') + '</div></div>' : '') + '</div>' +
        '<div class="card"><div class="card-head"><h2>' + icon('chat') + ' محادثات البوابات</h2></div><div class="threads">' + th.map(function (t) {
          return '<a class="thread' + (t.unread ? ' unread' : '') + '" href="#comms/' + esc(t.id) + '"><span class="tav">' + icon('gate') + '</span><div><b>' + esc(t.name) + '</b><span class="xs muted">' + esc(t.last ? (t.last.fromMgr ? 'أنت: ' : '') + t.last.text : 'لا توجد رسائل') + '</span></div><div class="tmeta">' + (t.last ? '<span class="xs muted">' + esc(ago(t.last.time)) + '</span>' : '') + (t.unread ? '<span class="badge">' + t.unread + '</span>' : '') + '</div></a>';
        }).join('') + '</div></div></div>';
      el.innerHTML = html;
      el.querySelectorAll('[data-rep]').forEach(function (b) { b.onclick = function () { managerReportSheet(b.dataset.rep, load); }; });
    }
    load();
    S.commsRefresh = load;
    S.poll = setInterval(function () { if (!document.hidden && S.route === 'comms' && !$('sheetWrap')) load(); }, MODE === 'demo' ? 5000 : 15000);
  }
  function repCard(r) {
    var mins = Math.round((Date.now() - r.time) / 6e4), waiting = !r.readAt && r.status !== 'مغلق';
    return '<button type="button" class="rcard ' + (waiting ? 'wait' : '') + (r.status === 'مغلق' ? ' closed' : '') + '" data-rep="' + esc(r.id) + '"><span class="rico">' + icon(R_ICONS[r.type] || 'siren') + '</span><div class="rbody"><div class="spread"><b>' + esc(r.type) + '</b>' + rStatusPill(r) + '</div>' +
      '<span class="small">' + (r.siteName ? icon('pin') + ' ' + esc(r.siteName) + ' · ' : '') + esc(r.fromName) + '</span>' +
      (r.note ? '<span class="small muted rnote">' + esc(r.note) + '</span>' : '') +
      '<div class="rmeta"><span class="xs muted">' + esc(fmt(r.time)) + '</span>' + (r.hasPhoto ? '<span class="pill p-info">' + icon('image') + ' صورة</span>' : '') + (r.escLevel ? '<span class="pill p-bad">' + icon('up') + ' تصعيد ' + r.escLevel + '</span>' : '') +
      (waiting ? '<span class="pill p-bad wait-pill">بدون فتح منذ ' + mins + ' د</span>' : r.ackAt ? '<span class="pill p-ok">استجابة خلال ' + Math.max(1, Math.round((r.ackAt - r.time) / 6e4)) + ' د</span>' : '') + '</div></div></button>';
  }
  function managerReportSheet(id, after) {
    remote('reportOpen', [S.session.pin, id]).then(function (r) {
      if (S.comms && S.comms.unseen) S.comms.unseen = Math.max(0, S.comms.unseen - 1); renderBadges();
      var done = r.status === 'مغلق';
      openSheet('<div class="sheet-head ' + (done ? 'sh-brand' : 'sh-bad') + '"><span class="permit">بلاغ عاجل · ' + esc(fmt(r.time)) + '</span><span class="big-ico">' + icon(R_ICONS[r.type] || 'siren') + '</span><h2>' + esc(r.type) + '</h2><span class="small">' + esc(r.fromName) + (r.siteName ? ' · ' + esc(r.siteName) : '') + '</span></div><div class="sheet-body">' +
        rTracker(r) +
        (r.note ? '<div class="infobox">' + esc(r.note) + '</div>' : '') +
        (r.photo ? '<a href="' + esc(r.photo) + '" target="_blank" rel="noopener" class="rphoto"><img src="' + esc(r.photo) + '" alt="صورة البلاغ"></a>' : '') +
        (r.action ? '<div class="rlog"><b class="small">الإجراءات المتخذة</b>' + r.action.split('\n').map(function (l) { return '<span class="small">' + icon('check') + ' ' + esc(l) + '</span>'; }).join('') + '</div>' : '') +
        (done ? '' : '<div class="field"><label for="raNote">ملاحظة تصل لفرد الأمن (اختياري)</label><input id="raNote" type="text" placeholder="مثال: أرسلنا الطبيب البيطري، امنع الدخول حتى وصوله"></div>' +
        '<button class="btn ok big" data-a="استلام">' + icon('check') + ' تم الاستلام: أتعامل معه الآن</button>' +
        (r.siteId && can('sites') ? '<div class="grid-2" style="gap:8px"><button class="btn big" data-a="إنذار" style="border-color:var(--warn);color:var(--warn)">' + icon('alert') + ' رفع إنذار على الموقع</button><button class="btn bad big" data-a="إغلاق">' + icon('x') + ' إغلاق الموقع</button></div>' : '') +
        '<button class="btn" data-a="إنهاء">' + icon('check') + ' إنهاء البلاغ (تم الحل)</button>') +
        '<div class="row"><a class="btn wa grow" target="_blank" rel="noopener" href="' + esc(waLink('🚨 بلاغ عاجل: ' + r.type + (r.siteName ? '\nالموقع: ' + r.siteName : '') + '\nمن: ' + r.fromName + (r.note ? '\n' + r.note : ''))) + '">' + icon('wa') + ' مشاركة واتساب</a>' +
        (r.siteId && can('analytics') ? '<button class="btn grow" data-a="trace">' + icon('trace') + ' تتبع العدوى</button>' : '') + '</div>' +
        '<button class="btn ghost" data-a="close">إغلاق النافذة</button></div>', function (a, b) {
        if (a === 'close') { closeSheet(); return after && after(); }
        if (a === 'trace') { closeSheet(); return go('trace/' + r.siteId); }
        b.disabled = true;
        remote('reportAct', [S.session.pin, id, a, $('raNote') ? $('raNote').value.trim() : '']).then(function () {
          closeSheet(); toast({ 'استلام': 'وصل لفرد الأمن أنك تتعامل مع البلاغ', 'إنذار': 'رُفع الإنذار على الموقع وأُبلغت البوابات', 'إغلاق': 'أُغلق الموقع وأُبلغت البوابات', 'إنهاء': 'أُغلق البلاغ' }[a]);
          return sync();
        }).then(function () { if (after) after(); }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      });
      if (after) after();
    }).catch(function (e) { toast(errText(e)); });
  }
  function viewManagerChat(gate) {
    var cp = (S.ref ? S.ref.checkpoints : []).filter(function (c) { return c.id === gate; })[0];
    $('main').innerHTML = '<section class="view comms"><div class="viewhead"><div><a href="#comms" class="small">' + icon('back') + ' البلاغات والرسائل</a><h1>' + icon('chat') + ' ' + esc(cp ? cp.name : gate) + '</h1></div></div>' +
      '<div class="card chat-card chat-solo"><div class="card-head"><h2>' + icon('gate') + ' أمن البوابة</h2><div class="row"><a class="btn sm wa" target="_blank" rel="noopener" id="waGate" href="https://wa.me/">' + icon('wa') + ' واتساب</a></div></div>' + chatShell(true) + '</div></section>';
    bindChat(gate, true, function (txt) { $('waGate').href = 'https://wa.me/?text=' + encodeURIComponent(txt); });
  }

  /* ============================ الخريطة الحية ============================ */
  function viewMap() {
    $('main').innerHTML = '<section class="view lmap" id="mapView"><div class="viewhead"><div><h1>' + icon('map') + ' الخريطة الحية</h1><p>كل قطاع كما يعمل الآن: مناطق التطهير في المنتصف، والمواقع حولها بلون حالتها وعدد من بداخلها، وآخر الحركات تتحرك على المسارات.</p></div>' +
      '<div class="row"><span class="live-pill"><i></i> مباشر · <span id="mapTime">…</span></span><button class="btn" type="button" id="mapFull">' + icon('expand') + ' شاشة كاملة</button></div></div>' +
      '<div id="mapBody">' + (S.dash ? '' : '<div class="card"><p class="empty"><span class="spin"></span></p></div>') + '</div></section>';
    S.mapKey = '';
    if (S.dash) drawMap(S.dash);
    function load() {
      remote('dashboard', [S.session.pin]).then(function (d) { S.dash = d; S.pendingCount = d.stats.pending; renderBadges(); if (S.route === 'map') drawMap(d); })
        .catch(function (e) { if (e.net) { setOnline(false); if (!S.dash && $('mapBody')) $('mapBody').innerHTML = offlineCard('عرض الخريطة'); } else toast(errText(e)); });
    }
    load();
    S.poll = setInterval(function () { if (!document.hidden && S.route === 'map' && !$('sheetWrap')) load(); }, MODE === 'demo' ? 5000 : 15000);
    $('mapFull').onclick = function () {
      var el = $('mapView'), fs = document.fullscreenElement;
      try { (fs ? document.exitFullscreen() : el.requestFullscreen()).catch(function () { toast('الشاشة الكاملة غير متاحة في هذا المتصفح'); }); } catch (e) { toast('الشاشة الكاملة غير متاحة في هذا المتصفح'); }
    };
  }
  function shortName(n, sector) { return String(n || '').replace('منطقة ', '').replace(' - ' + sector, '').replace(' ' + sector, '').trim(); }
  function drawMap(d) {
    var body = $('mapBody'); if (!body) return;
    if ($('mapTime')) $('mapTime').textContent = fmt(d.now);
    var cps = S.ref ? S.ref.checkpoints : [];
    var recent = d.recent.filter(function (m) { return (m.dir === B.IN || m.dir === B.OUT) && d.now - m.time < 72 * 36e5; }).slice(0, 10);
    var key = JSON.stringify([d.sectors.map(function (x) { return x.sites.map(function (s) { return s.id + s.status + s.inside; }); }), recent.map(function (m) { return m.id + m.decision; }), cps.length]);
    if (key === S.mapKey) return;
    S.mapKey = key;
    var all = [].concat.apply([], d.sectors.map(function (x) { return x.sites; }));
    var cnt = function (st) { return all.filter(function (s) { return s.status === st; }).length; };
    var html = '<div class="map-sum">' +
      '<div><b>' + all.length + '</b><span>موقع</span></div>' +
      '<div class="ok"><i></i><b>' + cnt('نشط') + '</b><span>نشط</span></div>' +
      '<div class="warn"><i></i><b>' + cnt('إنذار') + '</b><span>إنذار</span></div>' +
      '<div class="bad"><i></i><b>' + cnt('مغلق') + '</b><span>مغلق</span></div>' +
      '<div class="brand"><b>' + d.onSite.length + '</b><span>داخل المواقع الآن</span></div>' +
      '<div><b>' + (d.stats.allowed + d.stats.overrides + d.stats.denied) + '</b><span>محاولة دخول آخر 24 ساعة</span></div></div>';
    html += '<div class="map-grid"><div class="stack" style="gap:18px">' + d.sectors.map(function (sec) { return sectorMap(sec, cps.filter(function (c) { return c.sector === sec.name; }), recent); }).join('') + '</div>' +
      '<aside class="card map-feed"><div class="card-head"><h2>' + icon('list') + ' آخر الحركات</h2></div><div class="feed">' + (recent.map(function (m) {
        var bad = m.decision === B.DENY || m.decision === B.PENDING, out = m.dir === B.OUT;
        return '<div class="fe ' + (bad ? 'bad' : out ? 'out' : 'ok') + '"><span class="fd"></span><div><b>' + esc(m.itemName) + '</b><span class="xs">' + esc(out ? 'خرج من ' : bad ? 'رُفض دخوله ' : 'دخل ') + esc(m.siteName) + '</span></div><span class="xs muted">' + esc(ago(m.time)) + '</span></div>';
      }).join('') || '<p class="empty">لا حركات في آخر 72 ساعة</p>') + '</div>' +
      '<div class="map-legend"><span><i class="lg-ok"></i>نشط</span><span><i class="lg-warn"></i>إنذار</span><span><i class="lg-bad"></i>مغلق</span><span><i class="lg-in"></i>دخول</span><span><i class="lg-out"></i>خروج</span><span><i class="lg-deny"></i>رفض</span></div></aside></div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-site]').forEach(function (g) {
      g.onclick = function () { siteStatusSheet(g.dataset.site); };
      g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); siteStatusSheet(g.dataset.site); } };
    });
  }
  function sectorMap(sec, cps, recent) {
    var W = 1000, stations = [], core = [];
    sec.sites.forEach(function (s) { var m = String(s.name).match(/محطة\s*(\d+)/); if (m) stations.push(Object.assign({ num: m[1] }, s)); else core.push(s); });
    var H = stations.length ? 470 : 300, yCore = 62, yHub = 205, ySt = 395;
    var pos = {}, out = [];
    var spread = function (list, y, w, h) { list.forEach(function (s, i) { pos[s.id] = { x: W - (W / list.length) * (i + 0.5), y: y, w: w, h: h }; }); };
    spread(core, yCore, Math.min(190, W / Math.max(core.length, 1) - 24), 70);
    spread(stations, ySt, Math.min(84, W / Math.max(stations.length, 1) - 12), 70);
    cps.forEach(function (c, i) { pos[c.id] = { x: W - (W / cps.length) * (i + 0.5), y: yHub }; });
    var edges = {};
    cps.forEach(function (c) {
      c.serves.forEach(function (sid) {
        var a = pos[c.id], b = pos[sid]; if (!b) return;
        var ey = b.y > a.y ? b.y - b.h / 2 : b.y + b.h / 2, my = (a.y + ey) / 2;
        var id = 'e-' + c.id + '-' + sid;
        edges[c.name + '|' + sid] = id; edges['*|' + sid] = edges['*|' + sid] || id;
        out.push('<path id="' + id + '" class="edge" d="M' + a.x + ' ' + a.y + ' C' + a.x + ' ' + my + ' ' + b.x + ' ' + my + ' ' + b.x + ' ' + ey + '"/>');
      });
    });
    var svg = '<g class="edges">' + out.join('') + '</g>';
    /* الحركات: كل حركة لها خانة زمنية داخل دورة واحدة تتكرر */
    var moves = recent.filter(function (m) { return pos[m.siteId] && (edges[m.checkpoint + '|' + m.siteId] || edges['*|' + m.siteId]); });
    var slot = 1.4, run = 2.6, T = Math.max(moves.length * slot + run, 6);
    svg += moves.map(function (m, i) {
      var eid = edges[m.checkpoint + '|' + m.siteId] || edges['*|' + m.siteId];
      var bad = m.decision === B.DENY || m.decision === B.PENDING, outDir = m.dir === B.OUT;
      var a = (i * slot / T).toFixed(4), b = ((i * slot + run) / T).toFixed(4), c = Math.min(1, (i * slot + run + 0.3) / T).toFixed(4);
      var from = outDir ? 1 : 0, to = outDir ? 0 : bad ? 0.62 : 1;
      return '<g class="mv ' + (bad ? 'deny' : outDir ? 'out' : 'in') + '" opacity="0"><circle r="11" class="halo"/><circle r="6"/>' +
        '<animateMotion dur="' + T + 's" repeatCount="indefinite" calcMode="linear" keyPoints="' + from + ';' + from + ';' + to + ';' + to + '" keyTimes="0;' + a + ';' + b + ';1"><mpath href="#' + eid + '"/></animateMotion>' +
        '<animate attributeName="opacity" dur="' + T + 's" repeatCount="indefinite" calcMode="discrete" values="0;1;' + (bad ? '1' : '0') + ';0" keyTimes="0;' + a + ';' + b + ';' + c + '"/></g>';
    }).join('');
    svg += cps.map(function (c) {
      var p = pos[c.id];
      return '<g class="hub" transform="translate(' + p.x + ' ' + p.y + ')"><circle r="34" class="hub-ring"/><circle r="26"/><path transform="translate(-11 -11) scale(.92)" d="' + ICONS.gate + '"/><text y="56" class="hub-t">' + esc(shortName(c.name, sec.name)) + '</text></g>';
    }).join('');
    svg += core.concat(stations).map(function (s) {
      var p = pos[s.id], st = s.status === 'إنذار' ? 'warn' : s.status === 'مغلق' ? 'bad' : 'ok', small = !!s.num;
      var label = small ? '<text class="st-k" y="-10">محطة</text><text class="st-n" y="18">' + esc(s.num) + '</text>' : '<text class="cs-n" y="-6">' + esc(shortName(s.name, sec.name)) + '</text><text class="cs-k" y="18">مستوى ' + esc(s.level) + ' · ' + esc(s.type || '') + '</text>';
      return '<g class="node ' + st + (s.inside ? ' occ' : '') + '" transform="translate(' + p.x + ' ' + p.y + ')" data-site="' + esc(s.id) + '" tabindex="0" role="button" aria-label="' + esc(s.name + ' · ' + s.status + ' · ' + s.inside + ' بالداخل') + '">' +
        '<title>' + esc(s.name + ' · ' + s.status + ' · ' + s.inside + ' بالداخل') + '</title>' +
        (st !== 'ok' ? '<rect class="pulse" x="' + (-p.w / 2 - 6) + '" y="' + (-p.h / 2 - 6) + '" width="' + (p.w + 12) + '" height="' + (p.h + 12) + '" rx="22"/>' : '') +
        '<rect class="box" x="' + (-p.w / 2) + '" y="' + (-p.h / 2) + '" width="' + p.w + '" height="' + p.h + '" rx="16"/>' + label +
        (s.inside ? '<g class="cnt" transform="translate(' + (p.w / 2 - 4) + ' ' + (-p.h / 2 + 2) + ')"><circle r="13"/><text y="5">' + s.inside + '</text></g>' : '') + '</g>';
    }).join('');
    var occ = sec.sites.reduce(function (a, s) { return a + s.inside; }, 0);
    return '<div class="card map-card"><div class="card-head"><h2>' + icon('pin') + ' قطاع ' + esc(sec.name) + '</h2><span class="xs muted">' + sec.sites.length + ' موقع · ' + cps.length + ' مناطق تطهير · ' + occ + ' بالداخل الآن</span></div>' +
      (stations.length ? '<div class="map-cap"><span>مواقع الأمهات والتفريخ والعلف</span></div>' : '') +
      '<span class="map-hint only-sm">' + icon('arrow') + ' اسحب لرؤية باقي الخريطة</span><div class="map-scroll"><svg class="smap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="خريطة قطاع ' + esc(sec.name) + '">' + svg + '</svg></div>' +
      (stations.length ? '<div class="map-cap"><span>محطات التسمين بترتيب التسكين ←</span></div>' : '') + '</div>';
  }

  /* ============================ تتبع العدوى ============================ */
  function viewTrace(args) {
    var sites = S.ref ? S.ref.sites.filter(function (s) { return !s.external; }) : [];
    var sel = args[0] || (sites[0] && sites[0].id) || '', days = Number(args[1]) || 14;
    var sectors = [];
    sites.forEach(function (s) { if (sectors.indexOf(s.sector) < 0) sectors.push(s.sector); });
    $('main').innerHTML = '<section class="view trace"><div class="viewhead"><div><h1>' + icon('trace') + ' تتبع العدوى</h1><p>عند أي اشتباه مرضي اختر الموقع، فيظهر فوراً كل فرد ومركبة ومعدة دخلته، وأين ذهبوا بعده، مع قائمة عزل جاهزة للإرسال.</p></div></div>' +
      '<form class="hero tr-hero" id="trForm"><span class="tr-tag">' + icon('alert') + ' وضع الاستجابة السريعة</span>' +
      '<div class="tr-ctl"><div class="field grow"><label for="trSite">الموقع المشتبه به</label><select id="trSite">' + sectors.map(function (sec) {
        return '<optgroup label="' + esc(sec) + '">' + sites.filter(function (s) { return s.sector === sec; }).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '</select></div>' +
      '<div class="field"><span class="flabel">فترة الرجوع</span><div class="tr-days" role="group">' + [7, 14, 21].map(function (n) { return '<button type="button" data-days="' + n + '"' + (n === days ? ' class="on"' : '') + '>' + n + ' يوماً</button>'; }).join('') + '</div></div>' +
      '<button class="btn accent big" type="submit">' + icon('search') + ' ابدأ التتبع</button></div></form><div id="trOut"></div></section>';
    $('trForm').querySelectorAll('[data-days]').forEach(function (b) { b.onclick = function () { days = Number(b.dataset.days); $('trForm').querySelectorAll('[data-days]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('trForm').onsubmit = function (e) { e.preventDefault(); var id = $('trSite').value; history.replaceState(null, '', '#trace/' + id + '/' + days); S.route = 'trace/' + id + '/' + days; load(id); };
    function load(id) {
      $('trOut').innerHTML = '<div class="card"><p class="empty"><span class="spin"></span>جارٍ تتبع الحركات…</p></div>';
      remote('trace', [S.session.pin, id, days]).then(drawTrace).catch(function (e) { $('trOut').innerHTML = e.net ? offlineCard('تتبع العدوى') : ''; if (!e.net) toast(errText(e)); });
    }
    if (args[0]) load(sel);
  }
  function traceText(t) {
    var L = ['🔴 تتبع عدوى: ' + t.site.name, 'الفترة: آخر ' + t.days + ' يوماً حتى ' + fmt(t.now), ''];
    L.push('المخالطون المباشرون (' + t.exposed.length + '):');
    t.exposed.forEach(function (e, i) {
      L.push((i + 1) + '. ' + e.name + (e.kind ? ' (' + e.kind + ')' : '') + ' · ' + e.itemId + ' · آخر دخول ' + fmt(e.lastAt));
      if (e.onward.length) L.push('   انتقل بعدها إلى: ' + e.onward.map(function (o) { return o.siteName; }).join('، '));
      if (e.insideAt) L.push('   داخل ' + e.insideAt + ' الآن');
    });
    if (t.secondary.length) { L.push('', 'مواقع معرضة ثانوياً (' + t.secondary.length + '):'); t.secondary.forEach(function (x) { L.push('• ' + x.name + ' (' + x.count + ')'); }); }
    L.push('', 'المطلوب: عزل المخالطين ومنع دخولهم أي موقع، ومتابعة المواقع المعرضة حتى قرار الطبيب البيطري.');
    return L.join('\n');
  }
  function drawTrace(t) {
    var out = $('trOut'); if (!out) return;
    var inside = t.exposed.filter(function (e) { return e.insideAt; }).length;
    var stPill = t.site.status === 'نشط' ? '' : '<span class="pill ' + (t.site.status === 'مغلق' ? 'p-bad' : 'p-warn') + '">' + esc(t.site.status) + '</span>';
    var html = '<div class="tr-sum">' +
      '<div class="tr-k k-bad"><b>' + t.exposed.length + '</b><span>تلامس مباشر</span><small>فرد ومركبة ومعدة دخلوا الموقع</small></div>' +
      '<div class="tr-k k-warn"><b>' + t.secondary.length + '</b><span>مواقع معرضة ثانوياً</span><small>انتقل إليها المخالطون بعد الزيارة</small></div>' +
      '<div class="tr-k k-dark"><b>' + inside + '</b><span>داخل المواقع الآن</span><small>يحتاجون تدخلاً فورياً</small></div></div>';
    if (!t.exposed.length) {
      out.innerHTML = html + '<div class="card"><p class="empty">' + icon('check') + '<b>لم يدخل أحد هذا الموقع خلال آخر ' + t.days + ' يوماً</b><span class="xs">لا توجد مخالطة مسجلة. جرّب فترة أطول إن لزم.</span></p></div>';
      return;
    }
    /* خريطة الانتشار: المصدر ← المخالطون ← المواقع المعرضة */
    html += '<div class="card tr-map"><div class="card-head"><h2>' + icon('trace') + ' خريطة الانتشار</h2><span class="xs muted">من ' + esc(fmt(t.since)) + ' حتى الآن</span></div><div class="tr-flow">' +
      '<div class="tr-col"><span class="tr-h">المصدر</span><div class="tr-src"><span class="ring"></span>' + icon('pin') + '<b>' + esc(t.site.name) + '</b><span class="xs">' + esc(t.site.sector) + ' · مستوى ' + esc(t.site.level) + '</span>' + stPill + '</div></div>' +
      '<div class="tr-arrow">' + icon('arrow') + '</div>' +
      '<div class="tr-col"><span class="tr-h">المخالطون (' + t.exposed.length + ')</span><div class="tr-nodes">' + t.exposed.map(function (e) {
        return '<span class="tr-node' + (e.insideAt ? ' hot' : '') + '">' + icon(kindIcon(e.kind)) + '<b>' + esc(e.name) + '</b>' + (e.onward.length ? '<i>' + e.onward.length + '</i>' : '') + '</span>';
      }).join('') + '</div></div>' +
      '<div class="tr-arrow">' + icon('arrow') + '</div>' +
      '<div class="tr-col"><span class="tr-h">مواقع معرضة (' + t.secondary.length + ')</span><div class="tr-nodes">' + (t.secondary.map(function (x) {
        return '<button type="button" class="tr-site" data-site="' + esc(x.siteId) + '"><b>' + esc(x.name) + '</b><span class="xs">' + x.count + ' مخالط · منذ ' + esc(ago(x.firstAt)) + '</span></button>';
      }).join('') || '<span class="xs muted tr-none">' + icon('check') + ' لم ينتقل أي مخالط لموقع آخر</span>') + '</div></div>' +
      '</div></div>';
    html += '<div class="card tr-acts"><div><b>قائمة العزل جاهزة</b><span class="xs muted">أرسلها للطبيب البيطري ومديري المواقع، أو ارفع الإنذار ليطبق النظام العزل المشدد تلقائياً على البوابات.</span></div><div class="row">' +
      '<a class="btn wa" target="_blank" rel="noopener" href="' + esc(waLink(traceText(t))) + '">' + icon('wa') + ' إرسال على واتساب</a>' +
      '<button class="btn" type="button" id="trCopy">' + icon('list') + ' نسخ القائمة</button>' +
      (t.site.status === 'نشط' ? '<button class="btn bad" type="button" data-site="' + esc(t.site.id) + '">' + icon('alert') + ' رفع إنذار على المصدر</button>' : '') + '</div></div>';
    html += '<div class="card"><div class="card-head"><h2>' + icon('user') + ' المخالطون ومساراتهم</h2><span class="xs muted">الأخطر أولاً: من انتقل لمواقع أكثر</span></div><div class="tr-people">' + t.exposed.map(function (e) {
      return '<div class="tr-p' + (e.insideAt ? ' hot' : '') + '"><div class="tr-ph"><span class="avatar">' + icon(kindIcon(e.kind)) + '</span><div><b>' + esc(e.name) + '</b><span class="xs muted">' + esc([e.itemId, e.kind, e.dept].filter(String).join(' · ')) + '</span></div>' +
        (e.insideAt ? '<span class="pill p-bad">داخل ' + esc(e.insideAt) + ' الآن</span>' : e.onward.length ? '<span class="pill p-warn">انتقل لـ ' + e.onward.length + ' موقع</span>' : '<span class="pill p-info">لم ينتقل لموقع آخر</span>') + '</div>' +
        '<div class="tr-path"><span class="hop src"><small>' + esc(fmt(e.firstAt)) + '</small>' + esc(t.site.name) + (e.visits > 1 ? ' ×' + e.visits : '') + '</span>' +
        e.onward.map(function (o) { return icon('arrow') + '<span class="hop"><small>' + esc(fmt(o.time)) + '</small>' + esc(o.siteName) + '</span>'; }).join('') + '</div>' +
        '<a class="xs" href="#history/' + esc(e.itemId) + '">السجل الكامل وموعد السماح بالدخول ←</a></div>';
    }).join('') + '</div></div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-site]').forEach(function (b) { b.onclick = function () { siteStatusSheet(b.dataset.site); }; });
    $('trCopy').onclick = function () {
      var txt = traceText(t);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('نُسخت قائمة العزل'); }, function () { toast('تعذر النسخ من هذا المتصفح'); });
      else toast('تعذر النسخ من هذا المتصفح');
    };
  }

  /* ============================ الطلبات ============================ */
  function viewRequests() {
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>طلبات الدخول الاستثنائي</h1><p>كل طلب يصلك كإشعار فوري، ويمكنك القرار من هنا أو من الإشعار نفسه.</p></div></div><div id="reqBody"><p class="empty"><span class="spin"></span></p></div></section>';
    function load() {
      remote('listApprovals', [S.session.pin]).then(function (d) {
        S.pendingCount = d.pending.length; renderBadges();
        $('reqBody').innerHTML = '<div class="grid-2"><div class="card"><h2>' + icon('inbox') + ' بانتظار القرار</h2><div class="stack" style="gap:8px">' + (d.pending.map(function (a) { return reqCard(a, true); }).join('') || '<p class="empty">' + icon('check') + '<b>لا توجد طلبات معلقة</b><span class="xs">أي طلب استثناء من البوابات يصلك هنا وكإشعار فوري</span></p>') + '</div></div>' +
          '<div class="card"><h2>' + icon('list') + ' آخر القرارات</h2><div class="list">' + (d.done.map(function (a) {
            var ok = a.status === B.APPROVED;
            return '<div class="li"><span class="dot ' + (ok ? 'd-ok' : 'd-bad') + '"></span><div class="t"><b>' + esc(a.itemName) + '</b><span>' + esc(a.siteName) + ' · ' + esc(a.decidedBy) + '</span></div><div class="meta"><span class="pill ' + (ok ? 'p-ok' : 'p-bad') + '">' + (ok ? 'موافقة' : 'رفض') + '</span><time>' + esc(fmt(a.decidedAt)) + '</time></div></div>';
          }).join('') || '<p class="empty">' + icon('inbox') + '<b>لا توجد قرارات بعد</b><span class="xs">قراراتك بالموافقة أو الرفض تُحفظ هنا للمراجعة</span></p>') + '</div></div></div>';
        bindDecide($('reqBody'));
      }).catch(function (e) { $('reqBody').innerHTML = e.net ? offlineCard('عرض الطلبات') : ''; if (!e.net) toast(errText(e)); });
    }
    load();
    S.poll = setInterval(function () { if (!document.hidden && S.route === 'requests') load(); }, MODE === 'demo' ? 5000 : 15000);
  }

  /* ============================ البيانات ============================ */
  var TABLE_ICONS = { items: 'card', sites: 'pin', checkpoints: 'gate', rules: 'clock', users: 'user', contacts: 'wa', settings: 'tool' };
  function viewData() {
    var counts = S.ref ? { items: S.ref.items.length, sites: S.ref.sites.length, checkpoints: S.ref.checkpoints.length, rules: S.ref.rules.length } : {};
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>البيانات</h1><p>أضف وعدّل الأفراد والمركبات والمواقع والقواعد من هنا، أو مباشرة من جوجل شيتس. أي تعديل يصل لكل البوابات في المزامنة التالية.</p></div></div>' +
      '<div class="tiles">' + (isAdmin() ? '<button class="tile" type="button" data-r="users"><span class="tico">' + icon('user') + '</span><span><b>المستخدمون والصلاحيات</b><span>أمن البوابات ومديرو المواقع والقطاعات</span></span></button>' : '') + Object.keys(ADMIN).filter(function (t) { return t !== 'users' && (t === 'items' ? can('data') : isAdmin()); }).map(function (t) {
        return '<button class="tile" type="button" data-t="' + t + '"><span class="tico">' + icon(TABLE_ICONS[t]) + '</span><span><b>' + esc(ADMIN[t].title) + '</b><span>' + (counts[t] != null ? counts[t] + ' سجل' : 'عرض وتعديل') + '</span></span></button>';
      }).join('') +
      '<button class="tile" type="button" data-r="cards"><span class="tico">' + icon('printer') + '</span><span><b>كروت QR</b><span>طباعة وإرسال الكروت ودخول البوابات والفقد والتلف</span></span></button>' +
      '<button class="tile" type="button" data-r="history"><span class="tico">' + icon('search') + '</span><span><b>سجل فرد أو مركبة</b><span>كل الحركات والقيود الحالية</span></span></button>' +
      '<button class="tile" type="button" data-r="external"><span class="tico">' + icon('alert') + '</span><span><b>تسجيل زيارة خارجية</b><span>سوق أو مزرعة أو مجزر لم تُسجَّل على البوابة</span></span></button>' +
      '</div></section>';
    document.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { go('table/' + b.dataset.t); }; });
    document.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { go(b.dataset.r); }; });
  }
  function colLabel(t, k) { return TABLES[t].cols[k] || k; }
  function viewTable(args) {
    var t = args[0];
    if (!ADMIN[t]) return go('data');
    var def = ADMIN[t], sel = !def.noAdd;
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><a href="#data" class="crumb">' + icon('back') + ' البيانات</a><h1>' + esc(def.title) + '</h1><p id="tblCount"></p></div>' +
      (def.noAdd ? '' : '<div class="row">' + (t !== 'users' ? '<button class="btn" id="bulkBtn">' + icon('list') + ' إضافة بالجملة</button>' : '') + '<button class="btn primary" id="addBtn">' + icon('plus') + ' إضافة</button></div>') + '</div>' +
      '<div class="card"><div class="toolbar"><div class="search">' + icon('search') + '<input type="search" id="tblSearch" placeholder="بحث بالاسم أو الكود أو الجهة"></div>' +
      (sel ? '<label class="btn sm"><input type="checkbox" id="pickAll"> تحديد الكل</label>' : '') + '</div>' +
      (sel ? '<div class="selbar" id="selBar" hidden><span id="selTxt"></span><span class="row" style="gap:6px"><button class="btn sm ghost" id="selClear" type="button">إلغاء التحديد</button><button class="btn sm bad" id="bulkDel" type="button">' + icon('trash') + ' <span></span></button></span></div>' : '') +
      '<div id="tblBody"><p class="empty"><span class="spin"></span></p></div></div></section>';
    var rows = [], picked = {};
    function filtered() { var q = ($('tblSearch').value || '').trim().toLowerCase(); return rows.filter(function (r) { return !q || JSON.stringify(r).toLowerCase().indexOf(q) >= 0; }); }
    function cell(f, v) {
      if (f.k === 'serves') return BIO_list(v).length + ' موقع';
      if (f.type === 'yesno') return '<span class="pill ' + (v === 'لا' ? 'p-n' : 'p-ok') + '">' + esc(v || 'نعم') + '</span>';
      if (f.k === 'status') return '<span class="pill ' + (v === 'مغلق' ? 'p-bad' : v === 'إنذار' ? 'p-warn' : 'p-ok') + '">' + esc(v) + '</span>';
      if (f.k === 'id' || f.k === 'phone' || f.k === 'pin') return '<span class="mono">' + esc(v) + '</span>';
      return esc(v);
    }
    function draw() {
      var list = filtered();
      var fields = def.fields.filter(function (f) { return f.k !== 'apikey' && (f.req || f.k === 'name' || rows.some(function (r) { return r[f.k] !== '' && r[f.k] != null; })); });
      var nPicked = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
      $('tblCount').textContent = (list.length === rows.length ? rows.length : list.length + ' من ' + rows.length) + ' سجل';
      if (!list.length) { $('tblBody').innerHTML = '<p class="empty">' + icon('search') + 'لا توجد سجلات</p>'; updDel(); return; }
      var cb = function (r) { return sel ? '<input type="checkbox" data-pick="' + esc(r._key) + '"' + (picked[r._key] ? ' checked' : '') + ' aria-label="تحديد">' : ''; };
      var titleK = fields.some(function (f) { return f.k === 'name'; }) ? 'name' : fields[0].k;
      var subF = fields.filter(function (f) { return f.k !== titleK && f.type !== 'yesno' && f.k !== 'status' && f.k !== 'pin'; }).slice(0, 3);
      var endF = fields.filter(function (f) { return f.type === 'yesno' || f.k === 'status'; })[0];
      $('tblBody').innerHTML = '<div class="tbl hide-sm"><table><thead><tr>' + (sel ? '<th style="width:44px"></th>' : '') + fields.map(function (f) { return '<th>' + esc(colLabel(t, f.k)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        list.map(function (r) { return '<tr class="click' + (picked[r._key] ? ' sel' : '') + '" data-k="' + esc(r._key) + '">' + (sel ? '<td>' + cb(r) + '</td>' : '') + fields.map(function (f) { return '<td' + (f.k === titleK ? ' style="font-weight:600"' : '') + '>' + cell(f, r[f.k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="rows only-sm">' + list.map(function (r) {
          return '<div class="rowc' + (picked[r._key] ? ' sel' : '') + '" data-k="' + esc(r._key) + '"' + (sel ? '' : ' style="grid-template-columns:1fr auto"') + '>' + cb(r) + '<div class="t"><b>' + esc(r[titleK]) + '</b><span>' + subF.map(function (f) { return r[f.k] !== '' && r[f.k] != null ? (f.k === 'id' ? '<span class="mono">' + esc(r[f.k]) + '</span>' : esc(f.k === 'serves' ? BIO_list(r[f.k]).length + ' موقع' : r[f.k])) : ''; }).filter(Boolean).join(' · ') + '</span></div>' +
            '<div class="e">' + (endF && (endF.type !== 'yesno' || r[endF.k] === 'لا') ? (endF.type === 'yesno' ? '<span class="pill p-n">موقوف</span>' : cell(endF, r[endF.k])) : '') + '</div></div>';
        }).join('') + '</div>';
      $('tblBody').querySelectorAll('[data-k]').forEach(function (tr) {
        tr.onclick = function (e) {
          var c = e.target.closest('[data-pick]');
          if (c) { picked[c.dataset.pick] = c.checked; draw(); return; }
          editRow(t, rows.filter(function (r) { return r._key === tr.dataset.k; })[0], load);
        };
      });
      if ($('pickAll')) $('pickAll').checked = list.every(function (r) { return picked[r._key]; });
      updDel();
    }
    function updDel() {
      var b = $('bulkDel'); if (!b) return;
      var n = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
      $('selBar').hidden = !n; $('selTxt').textContent = 'تم تحديد ' + n + ' سجل';
      b.dataset.sure = ''; b.querySelector('span').textContent = 'حذف المحدد (' + n + ')';
    }
    function load() { picked = {}; remote('adminList', [S.session.pin, t]).then(function (r) { rows = r; draw(); }).catch(function (e) { $('tblBody').innerHTML = e.net ? offlineCard('تعديل البيانات') : '<p class="empty">' + esc(errText(e)) + '</p>'; }); }
    $('tblSearch').oninput = draw;
    if ($('pickAll')) $('pickAll').onchange = function () { var on = this.checked; filtered().forEach(function (r) { picked[r._key] = on; }); draw(); };
    if ($('selClear')) $('selClear').onclick = function () { picked = {}; draw(); };
    if ($('addBtn')) $('addBtn').onclick = function () { editRow(t, null, load); };
    if ($('bulkBtn')) $('bulkBtn').onclick = function () { bulkSheet(t, load); };
    if ($('bulkDel')) $('bulkDel').onclick = function () {
      var b = this, keys = Object.keys(picked).filter(function (k) { return picked[k]; });
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.querySelector('span').textContent = 'اضغط مرة أخرى لتأكيد حذف ' + keys.length + ' سجل'; return; }
      b.disabled = true;
      remote('adminBulkDelete', [S.session.pin, t, keys]).then(function (r) { b.disabled = false; toast('تم حذف ' + r.deleted + ' سجل'); load(); sync(); }).catch(function (e) { b.disabled = false; toast(errText(e)); });
    };
    load();
  }

  /** إدخال بالجملة: لصق من إكسيل أو ملف CSV */
  function parseBulk(text, t) {
    var fields = ADMIN[t].fields.filter(function (f) { return !f.ro; });
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var cells = (line.indexOf('\t') >= 0 ? line.split('\t') : line.split(/[,;،]/)).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (/الكود|كود|code|الاسم/i.test(cells.join(' ')) && !/\d{3,}/.test(cells.join(''))) return;
      if (cells.length >= 3 && /^\d{1,4}$/.test(cells[0]) && /^[A-Za-z]{0,3}\d{3,}$/.test(cells[1])) cells.shift();
      var o = {};
      fields.forEach(function (f, i) { if (cells[i] != null && cells[i] !== '') o[f.k] = cells[i]; });
      out.push(o);
    });
    return out;
  }
  function bulkSheet(t, reload) {
    var def = ADMIN[t], fields = def.fields.filter(function (f) { return !f.ro; });
    var kindSel = t === 'items' ? '<div class="row"><div class="field grow"><label for="bKind">النوع لمن لم يُحدد نوعه</label><select id="bKind">' + def.fields[2].opts.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></div><div class="field grow"><label for="bDept">الإدارة / الجهة (اختياري)</label><input id="bDept" type="text" placeholder="مثال: تسمين الواحات"></div></div>' : '';
    openSheet('<div class="sheet-head sh-brand"><h2>إضافة بالجملة: ' + esc(def.title) + '</h2><span class="small">الصق من إكسيل مباشرة</span></div><div class="sheet-body">' +
      '<div class="infobox small">انسخ الأعمدة من إكسيل بهذا الترتيب: <b>' + fields.map(function (f) { return esc(colLabel(t, f.k)); }).join(' ، ') + '</b>. الأعمدة الأولى تكفي (مثلاً الكود والاسم). عمود المسلسل في البداية يُتجاهل تلقائياً، والكود الموجود من قبل يُحدَّث بدل تكراره.</div>' + kindSel +
      '<div class="field"><label for="bText">البيانات</label><textarea id="bText" rows="8" dir="auto" placeholder="102818&#9;عمر فتحي عبدالحليم&#10;102772&#9;جمال فتحي حسين"></textarea></div>' +
      '<label class="btn" for="bFile">' + icon('download') + ' أو اختر ملف CSV</label><input id="bFile" type="file" accept=".csv,.txt,text/csv,text/plain" hidden>' +
      '<div id="bPrev"></div><button class="btn primary big" data-a="go" id="bGo" disabled>إضافة</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'go') {
        var rows = prep(); if (!rows.length) return;
        b.disabled = true; b.innerHTML = '<span class="spin"></span>';
        remote('adminBulk', [S.session.pin, t, rows]).then(function (r) {
          $('bPrev').innerHTML = '<div class="' + (r.errorCount ? 'warnbox' : 'infobox') + '"><b>أُضيف ' + r.added + ' وحُدِّث ' + r.updated + (r.errorCount ? ' ولم يُقبل ' + r.errorCount : '') + '</b>' + r.errors.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
          b.hidden = true; reload(); sync();
          if (!r.errorCount) { toast('أُضيف ' + r.added + ' وحُدِّث ' + r.updated); setTimeout(closeSheet, 900); }
        }).catch(function (e) { b.disabled = false; b.textContent = 'إضافة'; toast(errText(e), 5000); });
      }
    });
    function prep() {
      var rows = parseBulk($('bText').value, t);
      if (t === 'items') rows.forEach(function (r) { if (!r.kind) r.kind = $('bKind').value; if (!r.dept && $('bDept').value.trim()) r.dept = $('bDept').value.trim(); });
      return rows;
    }
    function preview() {
      var rows = prep(), keys = fields.map(function (f) { return f.k; });
      $('bGo').disabled = !rows.length;
      $('bGo').textContent = rows.length ? 'إضافة ' + rows.length + ' سجل' : 'إضافة';
      $('bPrev').innerHTML = rows.length ? '<div class="tbl"><table><thead><tr>' + keys.map(function (k) { return '<th>' + esc(colLabel(t, k)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.slice(0, 5).map(function (r) { return '<tr>' + keys.map(function (k) { return '<td>' + esc(r[k] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' + (rows.length > 5 ? '<span class="xs muted">و' + (rows.length - 5) + ' صفاً آخر</span>' : '') : '';
    }
    $('bText').oninput = preview;
    if ($('bKind')) { $('bKind').onchange = preview; $('bDept').oninput = preview; }
    $('bFile').onchange = function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { $('bText').value = rd.result; preview(); }; rd.readAsText(f, 'utf-8'); };
  }
  function fieldInput(t, f, val) {
    var id = 'f_' + f.k, v = val == null || val === '' ? (f.def || '') : val, lab = '<label for="' + id + '">' + esc(colLabel(t, f.k)) + (f.req ? ' *' : '') + '</label>';
    var hint = f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : '';
    if (f.ro) return '<div class="field">' + lab + '<input id="' + id + '" type="text" value="' + esc(v) + '" readonly>' + hint + '</div>';
    if (f.type === 'select' || f.type === 'yesno') {
      var opts = f.type === 'yesno' ? ['نعم', 'لا'] : f.opts;
      return '<div class="field">' + lab + '<select id="' + id + '">' + opts.map(function (o) { return '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' + hint + '</div>';
    }
    if (f.type === 'gate') {
      var o = [['', 'بدون (المدير يرى كل المواقع)']].concat(S.ref.checkpoints.map(function (c) { return [c.id, c.name]; }), S.ref.sites.filter(function (s) { return !s.external; }).map(function (s) { return [s.id, 'بوابة موقع: ' + s.name]; }));
      return '<div class="field">' + lab + '<select id="' + id + '">' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (BIO_norm(x[0]) === BIO_norm(v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' + hint + '</div>';
    }
    if (f.type === 'sites') {
      var chosen = BIO_list(v).map(BIO_norm), groups = {};
      S.ref.sites.filter(function (s) { return !s.external; }).forEach(function (s) { (groups[s.sector] = groups[s.sector] || []).push(s); });
      return '<div class="field"><label>' + esc(colLabel(t, f.k)) + ' *</label><div class="stack" id="' + id + '" style="gap:6px">' + Object.keys(groups).map(function (g) {
        return '<b class="small">قطاع ' + esc(g) + '</b><div class="chips">' + groups[g].map(function (s) { return '<label class="chip"><input type="checkbox" value="' + esc(s.id) + '"' + (chosen.indexOf(s.id) >= 0 ? ' checked' : '') + '> ' + esc(s.name) + '</label>'; }).join('') + '</div>';
      }).join('') + '</div></div>';
    }
    return '<div class="field">' + lab + '<input id="' + id + '" type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' + esc(v) + '"' + (f.upper ? ' dir="ltr" style="text-align:right"' : '') + '>' + hint + '</div>';
  }
  function editRow(t, row, reload) {
    var def = ADMIN[t];
    openSheet('<div class="sheet-head sh-brand"><h2>' + (row ? 'تعديل' : 'إضافة') + ': ' + esc(def.title) + '</h2></div><form class="sheet-body" id="rowForm">' + def.fields.map(function (f) { return fieldInput(t, f, row ? row[f.k] : ''); }).join('') +
      '<button class="btn primary big" type="submit">حفظ</button>' + (row && !def.noAdd ? '<button class="btn" type="button" data-a="del" style="color:var(--bad)">' + icon('trash') + ' حذف</button>' : '') + '<button class="btn ghost" type="button" data-a="close">إلغاء</button></form>', function (a, b) {
      if (a === 'close') closeSheet();
      if (a === 'del') {
        if (b.dataset.sure) { remote('adminDelete', [S.session.pin, t, row._key]).then(function () { closeSheet(); toast('تم الحذف'); reload(); sync(); }).catch(function (e) { toast(errText(e)); }); }
        else { b.dataset.sure = '1'; b.textContent = 'اضغط مرة أخرى لتأكيد الحذف'; }
      }
    });
    $('rowForm').onsubmit = function (e) {
      e.preventDefault();
      var o = {};
      def.fields.forEach(function (f) {
        if (f.type === 'sites') o[f.k] = Array.prototype.map.call($('f_' + f.k).querySelectorAll('input:checked'), function (c) { return c.value; }).join(',');
        else o[f.k] = $('f_' + f.k).value;
      });
      var btn = this.querySelector('[type=submit]'); btn.disabled = true;
      remote('adminSave', [S.session.pin, t, o, row ? row._key : '']).then(function () { closeSheet(); toast('تم الحفظ'); reload(); sync(); }).catch(function (err) { btn.disabled = false; toast(errText(err), 5000); });
    };
  }

  /* ============================ التخطيط والتحليل ============================ */
  function kpiRow(list) {
    return '<div class="kpis">' + list.map(function (k) { return '<div class="kpi ' + k[0] + '"><b>' + k[2] + '</b><span class="ki">' + icon(k[1]) + '</span><span>' + esc(k[3]) + '</span></div>'; }).join('') + '</div>';
  }
  function shortSite(n) { return String(n || '').replace(/\s*\(.*?\)\s*/g, '').replace(/^تسمين (الواحات|ريجوا) - محطة /, 'محطة ').trim(); }
  function viewInsights() {
    var t = [['plan', 'calendar', 'مخطط الزيارات الذكي', 'اكتب المواقع المطلوب زيارتها، فيقترح النظام أفضل ترتيب ومواعيد تحترم العزل في أقل عدد أيام. يمنع المخالفة قبل أن تحدث.'],
      ['network', 'network', 'شبكة المخالطة', 'من يربط المواقع والقطاعات ببعضها؟ يكشف «الجسور» التي قد تنقل العدوى على نطاق واسع لتشدد عليها وحدها.'],
      ['audit', 'shield', 'ملف اعتماد المنشأة المعزولة', 'تقرير تدقيق جاهز وفق معايير المنظمة العالمية لصحة الحيوان: نسبة الجاهزية، والفجوات، وكل السجلات.']];
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>' + icon('network') + ' التخطيط والتحليل</h1><p>أدوات تمنع المخالفة قبل حدوثها، وتكشف مسارات الخطر، وتجهز ملف الاعتماد للتدقيق.</p></div></div>' +
      '<div class="ins-tiles">' + t.map(function (x, i) { return '<a class="ins-tile" href="#' + x[0] + '"><span class="it-n">0' + (i + 1) + '</span><span class="it-i">' + icon(x[1]) + '</span><b>' + x[2] + '</b><span>' + x[3] + '</span><em>فتح ' + icon('back') + '</em></a>'; }).join('') + '</div></section>';
  }
  function insHead(title, ic, sub) {
    return '<div class="viewhead"><div><a href="#insights" class="crumb">' + icon('back') + ' التخطيط والتحليل</a><h1>' + icon(ic) + ' ' + title + '</h1><p>' + sub + '</p></div></div>';
  }

  /* ---------- مخطط الزيارات الذكي ---------- */
  function viewPlan() {
    var sites = (S.ref ? S.ref.sites : []).filter(function (s) { return !s.external && s.status !== B.ST_CLOSED; }), groups = {};
    sites.forEach(function (s) { (groups[s.sector] = groups[s.sector] || []).push(s); });
    var today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    var hours = function (sel) { var o = ''; for (var h = 5; h <= 22; h++) o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + (h < 10 ? '0' : '') + h + ':00</option>'; return o; };
    $('main').innerHTML = '<section class="view">' + insHead('مخطط الزيارات الذكي', 'calendar', 'اختر الشخص والمواقع، فيرتب النظام الزيارات ويحدد مواعيدها بحيث لا يُرفض أي دخول، اعتماداً على سجل حركته الفعلي وقواعد العزل.') +
      '<div class="plan-grid"><form class="card stack" id="planForm">' +
      '<div class="field"><label for="pItem">الشخص أو المركبة</label><input id="pItem" list="pItems" placeholder="الكود أو الاسم (اختياري)" autocomplete="off"><datalist id="pItems">' + (S.ref ? S.ref.items : []).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist><span class="hint">يُحسب العزل من آخر حركاته المسجلة. اتركه فارغاً لشخص جديد.</span></div>' +
      '<div class="field"><label>المواقع المطلوب زيارتها</label>' + Object.keys(groups).map(function (g) {
        return '<div class="psec"><b class="xs muted">قطاع ' + esc(g) + '</b><div class="chips">' + groups[g].sort(function (a, b) { return a.level - b.level; }).map(function (s) { return '<label class="chip pchip lv' + s.level + '"><input type="checkbox" value="' + esc(s.id) + '"> ' + esc(shortSite(s.name)) + ' <small>م' + s.level + '</small></label>'; }).join('') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="row wrap"><div class="field grow"><label for="pStart">من يوم</label><input id="pStart" type="date" value="' + today + '"></div><div class="field"><label for="pDS">بداية العمل</label><select id="pDS">' + hours(7) + '</select></div><div class="field"><label for="pDE">نهاية العمل</label><select id="pDE">' + hours(17) + '</select></div></div>' +
      '<div class="row wrap"><div class="field grow"><label for="pDur">مدة الزيارة</label><select id="pDur"><option value="1">ساعة</option><option value="2" selected>ساعتان</option><option value="3">3 ساعات</option><option value="4">4 ساعات</option></select></div><div class="field grow"><label for="pTr">الانتقال بين المواقع</label><select id="pTr"><option value="0.5">نصف ساعة</option><option value="1" selected>ساعة</option><option value="2">ساعتان</option></select></div></div>' +
      '<button class="btn primary big" type="submit">' + icon('calendar') + ' اقترح أفضل جدول</button></form>' +
      '<div id="planOut"><div class="card plan-empty"><span class="pe-i">' + icon('calendar', 'ico-lg') + '</span><b>الجدول يظهر هنا</b><span class="small muted">مثال: طبيب بيطري يريد زيارة الأمهات والمفرخ وثلاث محطات تسمين. يقترح النظام زيارة الأعلى حماية أولاً، ويوزع محطات التسمين على أيام لتحقيق العزل بينها.</span></div></div></div></section>';
    if (MODE === 'demo') { $('pItem').value = 'E003'; ['W-BRD', 'W-HAT', 'W-F05', 'W-F10', 'R-BRD'].forEach(function (id) { var c = document.querySelector('#planForm input[value="' + id + '"]'); if (c) c.checked = true; }); }
    $('planForm').onsubmit = function (e) {
      e.preventDefault();
      var ids = [].slice.call(document.querySelectorAll('#planForm .chips input:checked')).map(function (c) { return c.value; });
      if (!ids.length) return toast('اختر موقعاً واحداً على الأقل');
      var it = $('pItem').value.trim() ? findItemByText($('pItem').value) : null;
      if ($('pItem').value.trim() && !it) return toast('لم يُعثر على الكود أو الاسم');
      var d = $('pStart').value.split('-'), start = new Date(+d[0], +d[1] - 1, +d[2], +$('pDS').value).getTime();
      $('planOut').innerHTML = '<div class="card"><p class="empty"><span class="spin"></span>جارٍ البحث عن أفضل ترتيب…</p></div>';
      remote('planVisits', [S.session.pin, { itemId: it ? it.id : '', siteIds: ids, start: start, dayStart: +$('pDS').value, dayEnd: +$('pDE').value, visitHours: +$('pDur').value, travelHours: +$('pTr').value, tz: -new Date().getTimezoneOffset() }])
        .then(function (r) { drawPlan(r, it); })
        .catch(function (er) { $('planOut').innerHTML = er.net ? offlineCard('مخطط الزيارات') : '<div class="card"><p class="empty">' + esc(errText(er)) + '</p></div>'; });
    };
  }
  function planText(r, it) {
    var days = {}, lines = [];
    r.plan.forEach(function (v) { (days[v.day] = days[v.day] || []).push(v); });
    lines.push('جدول زيارات معتمد من الأمن الحيوي' + (it ? ' - ' + it.name : ''));
    Object.keys(days).forEach(function (d) {
      lines.push('\n' + new Date(days[d][0].start).toLocaleDateString('ar-EG', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, TZ)));
      days[d].forEach(function (v) { lines.push('• ' + new Date(v.start).toLocaleTimeString('ar-EG', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ)) + ' ' + v.siteName); });
    });
    lines.push('\nالالتزام بالترتيب والمواعيد شرط للسماح بالدخول على البوابات.');
    return lines.join('\n');
  }
  function drawPlan(r, it) {
    var days = {}, html = '';
    r.plan.forEach(function (v) { (days[v.day] = days[v.day] || []).push(v); });
    var saved = r.naiveDays - r.days, savedH = r.naiveEnd && r.end ? Math.round((r.naiveEnd - r.end) / 36e5) : 0;
    html += '<div class="plan-hero"><div><span class="eyebrow">أقل مدة ممكنة دون أي مخالفة</span><b class="num">' + r.days + ' <small>' + (r.days === 1 ? 'يوم' : r.days === 2 ? 'يومان' : 'أيام') + '</small></b><span>' + r.plan.length + ' زيارات' + (it ? ' · ' + esc(it.name) : '') + ' · تنتهي ' + esc(fmt(r.end)) + '</span></div>' +
      '<div class="ph-cmp">' + (saved > 0 ? '<b>يوفر ' + saved + ' ' + (saved === 1 ? 'يوم' : 'أيام') + '</b><span>مقارنة بترتيب الاختيار (' + r.naiveDays + ' أيام)</span>' : savedH > 0 ? '<b>يوفر ' + savedH + ' ساعة</b><span>مقارنة بترتيب الاختيار</span>' : '<b>أفضل ترتيب</b><span>لا يوجد ترتيب أسرع يحترم العزل</span>') + '</div></div>';
    if (r.blockedNow.length) html += '<div class="warnbox">' + icon('clock') + ' حالياً: ' + r.blockedNow.map(function (b) { return 'ممنوع من مستوى ' + b.level + ' حتى ' + esc(fmt(b.until)); }).join('، ') + '. ' + esc(r.blockedNow[0].why) + '</div>';
    if (r.closed.length) html += '<div class="infobox">مواقع مغلقة استُبعدت: ' + esc(r.closed.join('، ')) + '</div>';
    html += '<div class="plan-days">' + Object.keys(days).map(function (d) {
      var list = days[d];
      return '<div class="pday"><div class="pd-h"><span class="pd-n">اليوم ' + d + '</span><b>' + esc(new Date(list[0].start).toLocaleDateString('ar-EG', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, TZ))) + '</b></div><ol class="pd-list">' + list.map(function (v) {
        return '<li class="lv' + v.level + '"><time>' + esc(new Date(v.start).toLocaleTimeString('ar-EG', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ))) + '</time><div><b>' + esc(v.siteName) + '</b><span class="xs muted">مستوى ' + v.level + ' · قطاع ' + esc(v.sector) + (v.alert ? ' · <span class="red">في حالة إنذار</span>' : '') + '</span>' +
          (v.waitedFor ? '<span class="pw">' + icon('clock') + ' بعد عزل ' + v.waitedFor.hours + ' ساعة من «' + esc(shortSite(v.waitedFor.siteName)) + '»</span>' : '') + '</div></li>';
      }).join('') + '</ol></div>';
    }).join('') + '</div>';
    html += '<div class="card plan-why"><b>' + icon('shield') + ' لماذا هذا الترتيب؟</b><span class="small muted">الانتقال من الأعلى حماية (الأمهات) إلى الأقل (التسمين) لا يحتاج عزلاً، والعكس يحتاج 48 إلى 72 ساعة، وبين محطتي تسمين 24 ساعة. يجرب النظام كل الترتيبات الممكنة ويختار أسرعها.</span></div>';
    var txt = planText(r, it);
    html += '<div class="row wrap"><a class="btn wa grow" target="_blank" rel="noopener" href="' + esc(waTo(it && it.phone, txt)) + '">' + icon('wa') + ' إرسال الجدول على واتساب' + (it ? ' لـ' + esc(it.name) : '') + '</a><button class="btn" id="planCopy" type="button">' + icon('list') + ' نسخ</button></div>';
    $('planOut').innerHTML = html;
    $('planCopy').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('نُسخ الجدول'); }, function () { toast('تعذر النسخ من هذا المتصفح'); }); };
    if (window.innerWidth < 900) $('planOut').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- شبكة المخالطة ---------- */
  function viewNetwork(args) {
    var days = Number(args && args[0]) || 14;
    $('main').innerHTML = '<section class="view">' + insHead('شبكة المخالطة', 'network', 'كل خط = شخص أو مركبة انتقل بين موقعين. الخطوط الحمراء انتقال صاعد نحو موقع أعلى حماية، وهو الأخطر حتى لو احترم العزل.') +
      '<div class="subtabs no-print">' + [7, 14, 30].map(function (d) { return '<a href="#network/' + d + '" class="' + (d === days ? 'on' : '') + '">آخر ' + d + ' يوماً</a>'; }).join('') + '</div><div id="netBody"><div class="card"><p class="empty"><span class="spin"></span></p></div></div></section>';
    remote('network', [S.session.pin, days]).then(function (n) { drawNetwork(n, null); }).catch(function (e) { $('netBody').innerHTML = e.net ? offlineCard('تحليل الشبكة') : '<p class="empty">' + esc(errText(e)) + '</p>'; });
  }
  function netSvg(n, focus) {
    var W = 980, rows = [1, 2, 3, 4, 'x'], rowY = { 1: 70, 2: 175, 3: 285, 4: 395, x: 495 }, H = 560;
    var names = { 1: 'مستوى 1 · أمهات', 2: 'مستوى 2 · تفريخ', 3: 'مستوى 3 · تسمين', 4: 'مستوى 4 · علف', x: 'خارج الشركة' };
    var pos = {}, used = {};
    n.edges.forEach(function (e) { used[e.from] = used[e.to] = 1; });
    var sites = n.sites.filter(function (s) { return !s.external || used[s.id]; });
    rows.forEach(function (r) {
      var row = sites.filter(function (s) { return r === 'x' ? s.external : !s.external && s.level === r; }).sort(function (a, b) { return String(a.sector).localeCompare(String(b.sector)) || String(a.name).localeCompare(String(b.name), 'ar', { numeric: true }); });
      var x0 = 72, x1 = W - 190, step = row.length > 1 ? (x1 - x0) / (row.length - 1) : 0;
      row.forEach(function (s, i) { pos[s.id] = { x: row.length > 1 ? x0 + i * step : (x0 + x1) / 2, y: rowY[r], s: s }; });
    });
    var fe = focus ? n.edges.filter(function (e) { return e.carriers.indexOf(focus) >= 0; }) : n.edges;
    var maxC = Math.max.apply(null, n.edges.map(function (e) { return e.count; }).concat([1]));
    var svg = '<svg class="netsvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="شبكة الانتقال بين المواقع"><defs><marker id="arR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#c8182a"/></marker><marker id="arG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8d8583"/></marker></defs>';
    rows.forEach(function (r) { svg += '<g class="nrow"><rect x="10" y="' + (rowY[r] - 38) + '" width="' + (W - 20) + '" height="76" rx="16"/><text x="' + (W - 24) + '" y="' + (rowY[r] + 5) + '" text-anchor="end">' + names[r] + '</text></g>'; });
    fe.slice().sort(function (a, b) { return a.up - b.up; }).forEach(function (e) {
      var a = pos[e.from], b = pos[e.to]; if (!a || !b) return;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var bend = Math.min(80, 18 + len * 0.18), cx = mx - dy / len * bend, cy = my + dx / len * bend;
      var r0 = 13, ex = b.x - (b.x - cx) / Math.sqrt((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy)) * r0, ey = b.y - (b.y - cy) / Math.sqrt((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy)) * r0;
      var w = 1.4 + 3.6 * e.count / maxC;
      svg += '<path class="nedge ' + (e.up ? 'up' : '') + '" d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1) + '" stroke-width="' + w.toFixed(1) + '" marker-end="url(#' + (e.up ? 'arR' : 'arG') + ')"><title>' + esc(pos[e.from].s.name + ' ← ' + pos[e.to].s.name + ' · ' + e.count + ' انتقال' + (e.up ? ' صاعد' : '') + ' · أقل فاصل ' + e.minGap + ' ساعة') + '</title></path>';
    });
    Object.keys(pos).forEach(function (id) {
      var p = pos[id], s = p.s, on = !focus || fe.some(function (e) { return e.from === id || e.to === id; });
      var r = 9 + Math.min(8, s.carriers * 1.2);
      svg += '<g class="nnode ' + (s.sector === 'ريجوا' ? 'sec2' : '') + (on ? '' : ' dim') + (s.status !== 'نشط' && !s.external ? ' hot' : '') + '"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '"><title>' + esc(s.name + ' · ' + s.carriers + ' ناقل · ' + s.visits + ' دخول') + '</title></circle><text x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 14).toFixed(1) + '" text-anchor="middle">' + esc(shortSite(s.name)) + '</text></g>';
    });
    return svg + '</svg>';
  }
  function drawNetwork(n, focus) {
    var top = n.carriers.filter(function (c) { return c.bridge; });
    var html = kpiRow([['k-brand', 'user', n.carriers.length, 'شخص ومركبة تحركوا'], ['k-bad', 'network', n.bridges, 'جسور بين المواقع'], ['k-warn', 'map', n.crossSector, 'عبروا بين القطاعين'], ['k-bad', 'up', n.upMoves, 'انتقال صاعد نحو حماية أعلى'], ['k-warn', 'trace', n.bridgeShare + '%', 'من التنقلات تمر عبر الجسور']]);
    html += '<div class="card net-card"><div class="card-head"><h2>' + icon('network') + ' خريطة الانتقال بين المواقع</h2><span class="sub">' + (focus ? 'مسار: ' + esc((n.carriers.filter(function (c) { return c.id === focus; })[0] || {}).name) + ' · <a href="#" id="netAll">عرض الكل</a>' : 'سُمك الخط = عدد مرات الانتقال · مرّر على أي خط للتفاصيل') + '</span></div>' +
      '<div class="netwrap">' + netSvg(n, focus) + '</div><div class="net-legend"><span><i class="lg up"></i> انتقال صاعد (الأخطر)</span><span><i class="lg"></i> انتقال هابط أو أفقي</span><span><i class="lg n1"></i> قطاع الواحات</span><span><i class="lg n2"></i> قطاع ريجوا</span></div></div>';
    html += '<div class="card"><div class="card-head"><h2>' + icon('alert') + ' الجسور: الأعلى خطورة أولاً</h2><span class="sub">الدرجة = عدد المواقع + القطاعات المعبورة + الانتقالات الصاعدة (وخاصة خلال أقل من 72 ساعة)</span></div><div class="bridges">' +
      (top.map(function (c, i) {
        var maxS = top[0].score || 1;
        return '<div class="bridge ' + (focus === c.id ? 'on' : '') + '"><span class="br-rank">' + (i + 1) + '</span><div class="br-main"><div class="spread"><b>' + esc(c.name) + ' <span class="xs muted" dir="ltr">' + esc(c.id) + '</span></b>' + (c.watch ? '<span class="pill p-bad">' + icon('eye') + ' تحت المراقبة</span>' : '') + '</div>' +
          '<div class="br-bar"><i style="width:' + Math.round(100 * c.score / maxS) + '%"></i></div>' +
          '<div class="br-facts"><span>' + c.sites + ' مواقع</span><span>' + c.sectors + ' قطاع</span><span class="' + (c.up ? 'red' : '') + '">' + c.up + ' انتقال صاعد</span>' + (c.fast ? '<span class="red">' + c.fast + ' منها خلال أقل من 72 ساعة</span>' : '') + '</div>' +
          '<div class="br-path">' + c.path.map(function (p) { return '<span>' + esc(shortSite((n.sites.filter(function (s) { return s.id === p.siteId; })[0] || {}).name || p.siteId)) + '</span>'; }).join(icon('back')) + '</div></div>' +
          '<div class="br-acts"><button class="btn sm" type="button" data-focus="' + esc(c.id) + '">' + icon('trace') + ' المسار</button>' +
          '<button class="btn sm ' + (c.watch ? '' : 'bad') + '" type="button" data-watch="' + esc(c.id) + '" data-on="' + (c.watch ? '0' : '1') + '">' + icon('eye') + (c.watch ? ' رفع المراقبة' : ' مراقبة مشددة') + '</button></div></div>';
      }).join('') || '<p class="empty">' + icon('check') + '<b>لا توجد جسور في هذه الفترة</b><span class="xs">لم يتنقل أحد بين 3 مواقع أو أكثر أو بين القطاعين</span></p>') + '</div></div>';
    html += '<div class="card plan-why"><b>' + icon('shield') + ' ماذا تفعل المراقبة المشددة؟</b><span class="small muted">تظهر للأمن رسالة تحذير عند كل دخول لهذا الناقل ليطبق كل إجراءات التطهير بدقة، ويصلك إشعار فوري بكل حركة له. لا يُمنع من الدخول، فقواعد العزل تبقى كما هي.</span></div>';
    $('netBody').innerHTML = html;
    if ($('netAll')) $('netAll').onclick = function (e) { e.preventDefault(); drawNetwork(n, null); };
    $('netBody').onclick = function (e) {
      var f = e.target.closest('[data-focus]'), w = e.target.closest('[data-watch]');
      if (f) { drawNetwork(n, f.dataset.focus === focus ? null : f.dataset.focus); $('netBody').scrollIntoView({ behavior: 'smooth' }); }
      if (w) {
        var on = w.dataset.on === '1', c = n.carriers.filter(function (x) { return x.id === w.dataset.watch; })[0];
        if (!on) return setW('');
        openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('eye') + '</div><h2>مراقبة مشددة: ' + esc(c.name) + '</h2></div><div class="sheet-body"><p>ينتقل بين ' + c.sites + ' مواقع و' + c.sectors + ' قطاع، منها ' + c.up + ' انتقال صاعد. عند كل دخول تظهر للأمن رسالة تحذير، ويصلك إشعار فوري.</p>' +
          '<div class="field"><label for="wNote">سبب المراقبة (يظهر للأمن)</label><input id="wNote" type="text" value="' + esc(c.sectors > 1 ? 'ينتقل بين القطاعين' : 'ينتقل بين مواقع كثيرة') + '"></div>' +
          '<button class="btn bad big" data-a="ok">' + icon('eye') + ' تفعيل المراقبة المشددة</button><button class="btn ghost" data-a="close">رجوع</button></div>', function (a) {
          if (a === 'close') return closeSheet();
          if (a === 'ok') setW($('wNote').value.trim() || 'نعم');
        });
        function setW(note) {
          remote('setWatch', [S.session.pin, c.id, !!note, note]).then(function (it) {
            closeSheet(); c.watch = it.watch; patchRefItem(it); drawNetwork(n, focus);
            toast(note ? 'تم: سيصلك إشعار بكل حركة لـ' + c.name : 'رُفعت المراقبة عن ' + c.name);
          }).catch(function (er) { toast(errText(er)); });
        }
      }
    };
  }

  /* ---------- ملف اعتماد المنشأة المعزولة ---------- */
  function viewAudit(args) {
    var days = Number(args && args[0]) || 30;
    $('main').innerHTML = '<section class="view"><div class="no-print">' + insHead('ملف اعتماد المنشأة المعزولة', 'shield', 'تقرير تدقيق يجمع عناصر اعتماد «المنشأة المعزولة» (Compartmentalisation) وفق المنظمة العالمية لصحة الحيوان من سجلات التطبيق مباشرة، مع نسبة جاهزية لكل عنصر والفجوات المطلوب إغلاقها.') +
      '<div class="spread wrap"><div class="subtabs">' + [30, 90, 180, 365].map(function (d) { return '<a href="#audit/' + d + '" class="' + (d === days ? 'on' : '') + '">' + (d === 365 ? 'سنة' : d + ' يوماً') + '</a>'; }).join('') + '</div>' +
      (MODE !== 'demo' ? '<button class="btn primary" id="auPrint">' + icon('printer') + ' طباعة أو حفظ PDF</button>' : '') + '</div></div><div id="auBody"><div class="card"><p class="empty"><span class="spin"></span>جارٍ تجميع السجلات…</p></div></div></section>';
    if ($('auPrint')) $('auPrint').onclick = function () { window.print(); };
    remote('audit', [S.session.pin, days]).then(drawAudit).catch(function (e) { $('auBody').innerHTML = e.net ? offlineCard('ملف الاعتماد') : '<p class="empty">' + esc(errText(e)) + '</p>'; });
  }
  function drawAudit(a) {
    var d = function (t) { return new Date(t).toLocaleDateString('ar-EG', Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, TZ)); };
    var ring = function (v) { var c = 2 * Math.PI * 52, col = v >= 90 ? 'var(--ok)' : v >= 70 ? 'var(--warn)' : 'var(--bad)'; return '<svg viewBox="0 0 128 128" class="au-ring"><circle cx="64" cy="64" r="52" class="rt"/><circle cx="64" cy="64" r="52" class="rv" style="stroke:' + col + ';stroke-dasharray:' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '"/><text x="64" y="70" text-anchor="middle">' + v + '%</text></svg>'; };
    var cls = function (s) { return s === 'مطابق' ? 'p-ok' : s === 'مطابق مع ملاحظات' ? 'p-warn' : 'p-bad'; };
    var gaps = []; a.elements.forEach(function (e) { e.gaps.forEach(function (g) { gaps.push([e.title, g]); }); });
    var k = a.kpi, html = '<article class="audit">';
    html += '<header class="au-head"><div class="au-brand">' + logoImg() + '<div><b>' + esc(a.company) + '</b><span>إدارة الأمن الحيوي</span></div></div><div class="au-meta"><span>ملف تدقيق</span><b>اعتماد المنشأة المعزولة</b><small>Compartmentalisation · WOAH Terrestrial Code 4.4–4.5</small></div></header>';
    html += '<div class="au-sum">' + ring(a.overall) + '<div><span class="eyebrow">نسبة الجاهزية للاعتماد</span><h2>' + (a.overall >= 90 ? 'جاهز للتدقيق' : a.overall >= 70 ? 'جاهز مع ملاحظات' : 'يحتاج إجراءات قبل التدقيق') + '</h2><p>الفترة: ' + esc(d(a.since)) + ' إلى ' + esc(d(a.now)) + ' (' + a.days + ' يوماً) · أعدّه: ' + esc(a.by) + ' · ' + gaps.length + ' فجوة مطلوب إغلاقها.</p></div></div>';
    html += '<section class="au-sec"><h3><span>1</span> عناصر الاعتماد</h3><div class="au-els">' + a.elements.map(function (e) {
      return '<div class="au-el"><div class="spread"><b>' + esc(e.title) + '</b><span class="au-sc"><em>' + e.score + '%</em><span class="pill ' + cls(e.status) + '">' + esc(e.status) + '</span></span></div><div class="au-bar"><i style="width:' + e.score + '%" class="' + cls(e.status) + '"></i></div><p>' + esc(e.detail) + '</p><span class="xs muted">' + esc(e.ref) + '</span>' +
        (e.gaps.length ? '<ul class="au-gaps">' + e.gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }).join('') + '</div></section>';
    html += '<section class="au-sec"><h3><span>2</span> مؤشرات التتبع خلال الفترة</h3><div class="au-kpis">' + [[k.attempts, 'محاولة دخول'], [k.allowed, 'دخول مسموح'], [k.denied, 'رفض آلي لمخالفة العزل'], [k.overrides, 'دخول استثنائي معتمد'], [k.exits, 'خروج مسجل'], [k.ext, 'إقرار زيارة خارجية'], [k.checksPct + '%', 'دخول بإجراءات تطهير مؤكدة'], [k.exitPct + '%', 'دخول له خروج مسجل'], [k.offline, 'حركة دون اتصال روجعت'], [k.manual, 'دخول يدوي بتحقق من الهوية'], [k.reports, 'بلاغ عاجل'], [k.carriers, 'شخص ومركبة ومعدة']].map(function (x) { return '<div><b class="num">' + x[0] + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div></section>';
    html += '<section class="au-sec"><h3><span>3</span> تعريف المنشأة: المواقع ومستويات الحماية</h3><div class="au-cols">' + a.sectors.map(function (s) {
      return '<div class="au-sector"><b>قطاع ' + esc(s.name) + '</b><table><thead><tr><th>الموقع</th><th>المستوى</th><th>الحالة</th><th>بوابة تطهير</th></tr></thead><tbody>' + s.sites.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="num">' + x.level + '</td><td>' + esc(x.status) + '</td><td>' + (x.served ? icon('check') : '<span class="red">لا</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }).join('') + '</div><p class="small muted">' + a.checkpoints.length + ' مناطق تطهير تتحكم في الدخول: ' + esc(a.checkpoints.map(function (c) { return c.name + ' (' + c.serves + ' مواقع)'; }).join('، ')) + '.</p></section>';
    var lv = [1, 2, 3, 4], cell = function (f, t) { var r = a.rules.filter(function (x) { return x.from === f && x.to === t; })[0]; return r && r.hours ? '<td class="num hot">' + r.hours + '</td>' : '<td class="muted">—</td>'; };
    html += '<section class="au-sec"><h3><span>4</span> خطة الأمن الحيوي: ساعات العزل وإجراءات الدخول</h3><div class="au-cols"><div><table class="au-matrix"><thead><tr><th>من ↓ / إلى ←</th>' + lv.map(function (t) { return '<th>مستوى ' + t + '</th>'; }).join('') + '</tr></thead><tbody>' + lv.map(function (f) { return '<tr><th>مستوى ' + f + '</th>' + lv.map(function (t) { return cell(f, t); }).join('') + '</tr>'; }).join('') + '</tbody></table><p class="xs muted">ساعات العزل المطلوبة قبل دخول موقع بعد زيارة موقع آخر. «—» لا يلزم عزل (انتقال هابط).</p></div>' +
      '<div class="au-checks">' + [['الأفراد', a.checks.person], ['المركبات', a.checks.vehicle], ['المعدات', a.checks.equipment]].map(function (c) { return '<div><b>' + c[0] + '</b><ul>' + c[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; }).join('') + '<div><b>فترة الراحة</b><ul><li>' + a.checks.downtime + ' أيام على الأقل بين الدورات (هابرد)</li></ul></div></div></div></section>';
    html += '<section class="au-sec"><h3><span>5</span> عدم المطابقة والإجراءات التصحيحية</h3>' + (a.nonconformities.length ? '<table class="au-nc"><thead><tr><th>التاريخ</th><th>الحالة</th><th>التفاصيل</th><th>المسؤول</th></tr></thead><tbody>' + a.nonconformities.map(function (x) { return '<tr><td class="num">' + esc(fmt(x.time)) + '</td><td>' + esc(x.type) + '</td><td>' + esc(x.text) + '</td><td>' + esc(x.by || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="small">لا توجد حالات عدم مطابقة في الفترة.</p>') + '</section>';
    html += '<section class="au-sec"><h3><span>6</span> متطلبات تُوثَّق خارج التطبيق</h3><p class="small muted">يطلبها التدقيق الرسمي، وتُرفق بهذا الملف من الإدارات المختصة:</p><ul class="au-ext">' + a.external.map(function (x) { return '<li><span class="box"></span>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
    html += '<footer class="au-sign"><div><span>أعدّه</span><b>' + esc(a.by) + '</b></div><div><span>الطبيب البيطري المسؤول</span><b>&nbsp;</b></div><div><span>اعتماد الإدارة</span><b>&nbsp;</b></div></footer></article>';
    $('auBody').innerHTML = html;
  }

  /* ============================ الكروت: توزيع وفقد وتلف ============================ */
  function cardCode(i) { return BIO_cardCode(i.id, i.card); }
  function waTo(phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    return d ? 'https://wa.me/' + d + '?text=' + encodeURIComponent(text) : waLink(text);
  }
  function appLink() { return (S.ref && S.ref.settings.APP_URL) || location.href.split('#')[0]; }
  function cardMsg(i) {
    return 'السلام عليكم ' + i.name + '\nهذا كارت الأمن الحيوي الخاص بك (' + cardCode(i) + ') - ' + S.session.company + '.\n' +
      'احتفظ بالصورة على موبايلك: لو نسيت الكارت المطبوع أو تلف، اعرض الصورة على البوابة وتُمسح من الشاشة مباشرة.\n' +
      'لو فقدت الكارت أبلغ الأمن الحيوي فوراً ليُلغى ويصدر لك بديل. الكارت شخصي ولا يُعار لأحد.';
  }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  /** يرسم الكارت كصورة بمقاس كارت البنك (CR80) بدقة طباعة، لإرسالها على واتساب أو حفظها على الموبايل */
  function cardImage(i) {
    var W = 1012, H = 638, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), code = cardCode(i);
    var fonts = document.fonts ? Promise.all(['700 50px "El Messiri"', '800 26px Tajawal', '600 30px "IBM Plex Mono"'].map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve();
    return Promise.all([fonts, loadImg(logoSrc())]).then(function (r) {
      var logo = r[1];
      c.fillStyle = '#ffffff'; rrect(c, 0, 0, W, H, 40); c.fill();
      c.save(); rrect(c, 0, 0, W, H, 40); c.clip();
      var g = c.createLinearGradient(0, 0, W, 170); g.addColorStop(0, '#9e1020'); g.addColorStop(1, '#d01d30');
      c.fillStyle = g; c.fillRect(0, 0, W, 158);
      c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 8; c.lineJoin = 'round'; c.lineCap = 'round';
      for (var x = -40; x < W; x += 120) { c.beginPath(); c.moveTo(x, 130); c.lineTo(x + 30, 92); c.lineTo(x + 60, 130); c.stroke(); }
      c.fillStyle = '#c8182a'; c.fillRect(0, H - 14, W, 14);
      c.restore();
      c.fillStyle = '#fff'; rrect(c, W - 150, 26, 106, 106, 26); c.fill();
      if (logo) c.drawImage(logo, W - 141, 35, 88, 88);
      c.direction = 'rtl'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#fff'; c.font = '700 44px "El Messiri", Tajawal, sans-serif'; c.fillText(S.session.company, W - 172, 78);
      c.fillStyle = 'rgba(255,255,255,.82)'; c.font = '800 26px Tajawal, sans-serif'; c.fillText('كارت الأمن الحيوي · امسح عند كل دخول وخروج', W - 172, 120);
      // QR
      var holder = document.createElement('div');
      if (window.QRCode) new QRCode(holder, { text: code, width: 330, height: 330, correctLevel: QRCode.CorrectLevel.M });
      var q = holder.querySelector('canvas');
      c.fillStyle = '#fff'; c.strokeStyle = '#e8e1dc'; c.lineWidth = 3; rrect(c, 44, 192, 362, 362, 24); c.fill(); c.stroke();
      if (q) c.drawImage(q, 60, 208, 330, 330);
      c.direction = 'ltr'; c.textAlign = 'center'; c.fillStyle = '#2b2a2c'; c.font = '600 30px "IBM Plex Mono", monospace';
      c.fillText(code.split('').join(' '), 225, 600);
      // البيانات
      c.direction = 'rtl'; c.textAlign = 'right';
      var xR = W - 56, y = 250;
      c.fillStyle = '#1d1b1e'; c.font = '700 50px "El Messiri", Tajawal, sans-serif';
      var words = String(i.name).split(' '), line = '', lines = [];
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (c.measureText(t).width > 520 && line) { lines.push(line); line = w; } else line = t; });
      lines.push(line); lines.slice(0, 2).forEach(function (l) { c.fillText(l, xR, y); y += 66; });
      var tag = [i.kind, i.dept].filter(Boolean).join(' · ');
      if (tag) {
        c.font = '800 26px Tajawal, sans-serif'; var tw = c.measureText(tag).width + 40;
        c.fillStyle = '#fcebec'; rrect(c, xR - tw, y - 12, tw, 48, 24); c.fill();
        c.fillStyle = '#a81323'; c.fillText(tag, xR - 20, y + 22); y += 70;
      }
      if (i.card > 1) { c.fillStyle = '#6d6466'; c.font = '700 24px Tajawal, sans-serif'; c.fillText('الإصدار ' + i.card + ' · يلغي أي كارت سابق', xR, y + 10); }
      c.fillStyle = '#8d8583'; c.font = '600 21px Tajawal, sans-serif';
      c.fillText('شخصي ولا يُعار · عند الفقد أبلغ الأمن الحيوي فوراً', xR, H - 46);
      return cv;
    });
  }
  /** نافذة إرسال الكارت: معاينة الصورة + مشاركة مباشرة على الموبايل + واتساب على رقم الموظف + تحميل */
  function sendCardSheet(i, title) {
    cardImage(i).then(function (cv) {
      var url = cv.toDataURL('image/png'), name = 'كارت-' + cardCode(i) + '.png', file = null;
      try { var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k); file = new File([arr], name, { type: 'image/png' }); } catch (e) {}
      var canFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      openSheet('<div class="sheet-head sh-brand"><div class="big-ico">' + icon('card') + '</div><h2>' + esc(title || 'إرسال الكارت') + '</h2></div><div class="sheet-body">' +
        '<img class="card-preview" src="' + url + '" alt="كارت ' + esc(i.name) + '">' +
        (canFiles ? '<button class="btn wa big" data-a="share">' + icon('share') + ' مشاركة الصورة على واتساب</button>' : '') +
        '<a class="btn ' + (canFiles ? '' : 'wa big') + '" target="_blank" rel="noopener" href="' + esc(waTo(i.phone, cardMsg(i))) + '">' + icon('wa') + (i.phone ? ' فتح محادثة ' + esc(i.name) + ' على واتساب' : ' إرسال الرسالة على واتساب') + '</a>' +
        '<a class="btn" href="' + url + '" download="' + esc(name) + '">' + icon('download') + ' تحميل صورة الكارت</a>' +
        '<p class="xs muted">' + (canFiles ? 'المشاركة ترسل الصورة والرسالة معاً.' : 'حمّل الصورة ثم أرفقها في محادثة واتساب.') + (i.phone ? '' : ' أضف رقم الموظف في «الأفراد والمركبات» لتفتح محادثته مباشرة.') + '</p>' +
        '<button class="btn ghost" data-a="close">إغلاق</button></div>', function (a) {
        if (a === 'close') return closeSheet();
        if (a === 'share') navigator.share({ files: [file], text: cardMsg(i) }).catch(function () {});
      });
    });
  }
  function patchRefItem(it) { if (!S.ref) return; S.ref.items = S.ref.items.map(function (x) { return x.id === it.id ? Object.assign({}, x, it) : x; }); persist(); }
  function cardIssueSheet(i, done) {
    var step = 'pick';
    function body() {
      if (step === 'lost') return '<div class="reason">' + icon('alert') + ' <b>إيقاف كارت ' + esc(i.name) + ' (' + esc(cardCode(i)) + ')</b><span>يُلغى الكارت الحالي على كل البوابات فوراً، وأي محاولة دخول به تُرفض ويصلك تنبيه. يصدر كارت جديد برقم إصدار ' + (i.card + 1) + '.</span></div>' +
        '<div class="field"><label for="kNote">ملاحظة (اختياري)</label><input id="kNote" type="text" placeholder="مثال: فُقد في الطريق إلى الموقع"></div>' +
        '<button class="btn bad big" data-a="doLost">' + icon('x') + ' تأكيد الإيقاف وإصدار البديل</button><button class="btn ghost" data-a="back">رجوع</button>';
      return '<div class="who"><div class="avatar">' + icon(kindIcon(i.kind), 'ico-lg') + '</div><div><b>' + esc(i.name) + '</b><span class="small muted">' + esc(cardCode(i)) + (i.card > 1 ? ' · الإصدار ' + i.card : '') + '</span></div></div>' +
        '<button type="button" class="opt bad" data-a="lost"><span class="oi">' + icon('alert') + '</span><span><b>الكارت مفقود أو مسروق</b><span>إلغاء القديم فوراً وإصدار كارت بديل وإرساله</span></span></button>' +
        '<button type="button" class="opt" data-a="damaged"><span class="oi">' + icon('refresh') + '</span><span><b>الكارت تالف أو لا يُقرأ</b><span>إعادة طباعة أو إرسال نفس الكارت، ويبقى صالحاً</span></span></button>' +
        '<button class="btn ghost" data-a="close">رجوع</button>';
    }
    function paint() { var el = document.querySelector('#sheetRoot .sheet-body'); if (el) el.innerHTML = body(); }
    openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('card') + '</div><h2>فقد أو تلف الكارت</h2></div><div class="sheet-body">' + body() + '</div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'lost') { step = 'lost'; return paint(); }
      if (a === 'back') { step = 'pick'; return paint(); }
      if (a === 'damaged' || a === 'doLost') {
        b.disabled = true;
        remote('cardReport', [S.session.pin, i.id, a === 'doLost' ? 'فقد' : 'تلف', $('kNote') ? $('kNote').value.trim() : '']).then(function (r) {
          var it = Object.assign({}, i, r.item); patchRefItem(it); if (done) done(it);
          toast(a === 'doLost' ? 'أُلغي الكارت القديم. أرسل الكارت الجديد للموظف' : 'سُجّل التلف. أعد طباعة الكارت أو أرسله');
          sendCardSheet(it, a === 'doLost' ? 'الكارت البديل جاهز (الإصدار ' + it.card + ')' : 'إعادة إرسال الكارت');
        }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      }
    });
  }
  function gateMsg(g) {
    return 'تطبيق الأمن الحيوي - ' + S.session.company + '\nالبوابة: ' + g.gate + '\n\nرابط التطبيق:\n' + (g.appUrl || appLink()) + '\nالرقم السري: ' + g.pin +
      '\n\nطريقة التثبيت: افتح الرابط من Chrome ثم اختر «إضافة إلى الشاشة الرئيسية»، وأدخل الرقم السري مرة واحدة.\nالرقم خاص بهذه البوابة فقط ولا يُرسل لأحد. عند فقد الهاتف أبلغ المدير فوراً لإصدار رقم جديد.';
  }
  function gateSendSheet(g, isNew) {
    var msg = gateMsg(g);
    openSheet('<div class="sheet-head sh-brand"><div class="big-ico">' + icon('key') + '</div><h2>' + (isNew ? 'رقم سري جديد: ' : 'بيانات دخول ') + esc(g.gate) + '</h2></div><div class="sheet-body">' +
      (isNew ? '<div class="warnbox">أُلغي الرقم القديم. أي جهاز يستخدمه يخرج تلقائياً عند أول اتصال.</div>' : '') +
      '<div class="gate-pass"><span class="xs muted">الرقم السري</span><b class="num">' + esc(g.pin) + '</b><span class="xs muted">' + esc(g.name) + (g.phone ? ' · ' + esc(g.phone) : '') + '</span></div>' +
      '<pre class="msg-prev">' + esc(msg) + '</pre>' +
      '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waTo(g.phone, msg)) + '">' + icon('wa') + ' إرسال على واتساب ' + (g.phone ? 'لهاتف البوابة' : '') + '</a>' +
      '<button class="btn" data-a="copy">' + icon('list') + ' نسخ الرسالة</button>' +
      (g.phone ? '' : '<p class="xs muted">أضف رقم هاتف البوابة في «المستخدمون» لتفتح محادثتها مباشرة.</p>') +
      '<button class="btn ghost" data-a="close">إغلاق</button></div>', function (a) {
      if (a === 'close') return closeSheet();
      if (a === 'copy') { if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast('نُسخت الرسالة'); }, function () { toast('تعذر النسخ من هذا المتصفح'); }); }
    });
  }
  /* ============================ المستخدمون والصلاحيات ============================ */
  var PERM_SHORT = { decide: 'قرار الاستثناء', reports: 'البلاغات والرسائل', notices: 'إصدار القرارات', sites: 'إنذار وإغلاق المواقع', data: 'الأفراد والكروت', analytics: 'التحليل والتتبع', admin: 'إدارة النظام', vr_write: 'تحرير التقارير', vr_view: 'الاطلاع على التقارير', vr_review: 'مراجعة التقارير', vr_approve: 'اعتماد التقارير' };
  var ROLE_ICONS = { 'مدير': 'shield', 'مدير قطاع': 'map', 'مدير موقع': 'pin', 'أمن بوابة': 'scan', 'متابعة فقط': 'eye', 'مفتش أمن حيوي': 'clip' };
  function userAccessMsg(u, pin, appUrl) {
    var scope = u.role === 'أمن بوابة' ? 'البوابة: ' + (u.gateName || '') : u.scopeLabel ? 'نطاق الإدارة: ' + u.scopeLabel : 'نطاق الإدارة: كل القطاعات';
    return 'مرحباً ' + u.name + '\nتم تجهيز حسابك على تطبيق الأمن الحيوي - ' + (S.session.company || CFG.COMPANY || '') + '\n\nالدور: ' + u.roleLabel + '\n' + scope +
      (u.role !== 'أمن بوابة' && u.perms.length ? '\nالصلاحيات: ' + u.perms.map(function (k) { return PERM_SHORT[k] || k; }).join('، ') : '') +
      '\n\nرابط التطبيق: ' + (appUrl || '(رابط التطبيق)') + '\nالرقم السري: ' + pin + '\n\nافتح الرابط وأضف التطبيق للشاشة الرئيسية، ثم ادخل بالرقم السري. لا تشارك الرقم مع أحد.';
  }
  function userAccessSheet(u, pin, appUrl, isNew) {
    var msg = userAccessMsg(u, pin, appUrl);
    openSheet('<div class="sheet-head sh-brand"><div class="big-ico">' + icon('key') + '</div><h2>' + (isNew ? 'تم إنشاء الحساب: ' : 'رقم سري جديد: ') + esc(u.name) + '</h2><span class="small">' + esc(u.roleLabel) + '</span></div><div class="sheet-body">' +
      (isNew ? '' : '<div class="warnbox">أُلغي الرقم القديم. أي جهاز يستخدمه يخرج تلقائياً عند أول اتصال.</div>') +
      '<div class="gate-pass"><span class="xs muted">الرقم السري</span><b class="num">' + esc(pin) + '</b><span class="xs muted">يظهر الآن فقط. أرسله لصاحبه مباشرة.</span></div>' +
      '<pre class="msg-prev">' + esc(msg) + '</pre>' +
      '<a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waTo(u.phone, msg)) + '">' + icon('wa') + ' إرسال على واتساب' + (u.phone ? ' إلى ' + esc(u.phone) : '') + '</a>' +
      '<button class="btn" data-a="copy">' + icon('list') + ' نسخ الرسالة</button><button class="btn ghost" data-a="close">تم</button></div>', function (a) {
      if (a === 'close') return closeSheet();
      if (a === 'copy' && navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast('نُسخت الرسالة'); }, function () { toast('تعذر النسخ من هذا المتصفح'); });
    });
  }
  function userSheet(meta, u, reload) {
    var isNew = !u, roles = meta.roles, perms = meta.perms;
    var st = { role: u ? u.role : 'أمن بوابة', scope: u ? u.scope.slice() : [], gate: u ? u.gate : '', perms: u ? u.perms.slice() : [], active: u ? u.active : true };
    var sectors = [], sites = (S.ref ? S.ref.sites : []).filter(function (s) { return !s.external; });
    sites.forEach(function (s) { if (sectors.indexOf(s.sector) < 0) sectors.push(s.sector); });
    var roleDef = function (k) { return roles.filter(function (r) { return r.k === k; })[0]; };
    if (!u) st.perms = roleDef(st.role).perms.slice();
    var isMe = u && u.id === meta.me;
    openSheet('<div class="sheet-head sh-brand"><h2>' + (isNew ? 'مستخدم جديد' : 'تعديل: ' + esc(u.name)) + '</h2><span class="small">حدد الدور ونطاق الإدارة والصلاحيات</span></div><div class="sheet-body">' +
      '<div class="row"><div class="field grow"><label for="uName">الاسم *</label><input id="uName" type="text" value="' + esc(u ? u.name : '') + '" placeholder="مثال: م. أحمد علي"></div>' +
      '<div class="field" style="flex:0 1 170px"><label for="uId">الكود *</label><input id="uId" type="text" dir="ltr" value="' + esc(u ? u.id : '') + '" placeholder="الكود الوظيفي"></div></div>' +
      '<div class="field"><label for="uPhone">رقم الواتساب</label><input id="uPhone" type="tel" dir="ltr" value="' + esc(u ? u.phone : '') + '" placeholder="201001234567"><span class="hint">يُرسل عليه رابط التطبيق والرقم السري، ويصله إشعار عند الحاجة.</span></div>' +
      '<div class="field"><label>الدور *</label><div class="u-roles" id="uRoles">' + roles.map(function (r) {
        return '<button type="button" class="u-role" data-role="' + esc(r.k) + '"' + (isMe && r.k !== 'مدير' ? ' disabled' : '') + '><span class="u-ri">' + icon(ROLE_ICONS[r.k] || 'user') + '</span><span><b>' + esc(r.label) + '</b><span>' + esc(r.desc) + '</span></span></button>';
      }).join('') + '</div></div>' +
      '<div id="uScope"></div><div id="uPerms"></div>' +
      (isNew ? '<div class="infobox small">' + icon('key') + ' يُنشأ رقم سري من 6 أرقام تلقائياً، ويظهر لك مرة واحدة لترسله لصاحبه.</div>' :
        '<label class="check" id="uNewPin"><span class="box">' + icon('check') + '</span><span>إصدار رقم سري جديد (يُلغى الرقم الحالي فوراً)</span></label>' +
        (isMe ? '' : '<label class="check' + (st.active ? '' : ' on') + '" id="uStop"><span class="box">' + icon('check') + '</span><span>إيقاف الحساب مؤقتاً (لا يستطيع الدخول)</span></label>')) +
      '<div class="login-err" id="uErr" role="alert"></div>' +
      '<button class="btn primary big" data-a="save">' + icon('check') + (isNew ? ' إنشاء الحساب' : ' حفظ التعديلات') + '</button>' +
      (!isNew && !isMe ? '<button class="btn bad" data-a="del">' + icon('trash') + ' <span>حذف المستخدم</span></button>' : '') +
      '<button class="btn ghost" data-a="close">إلغاء</button></div>', function (a, b) {
      if (a === 'close') return closeSheet();
      if (a === 'del') {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.querySelector('span').textContent = 'اضغط مرة أخرى لتأكيد الحذف'; return; }
        b.disabled = true;
        remote('adminDelete', [S.session.pin, 'users', u.id]).then(function () { closeSheet(); toast('حُذف ' + u.name); reload(); }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      }
      if (a === 'save') {
        var row = { id: $('uId').value.trim(), name: $('uName').value.trim(), phone: $('uPhone').value.trim(), role: st.role, gate: st.gate, scope: st.scope, perms: st.perms, active: $('uStop') ? !$('uStop').classList.contains('on') : true, newPin: $('uNewPin') ? $('uNewPin').classList.contains('on') : false };
        b.disabled = true; $('uErr').textContent = '';
        remote('userSave', [S.session.pin, row, u ? u.id : null]).then(function (r) {
          reload();
          if (r.pin) userAccessSheet(r.user, r.pin, r.appUrl, isNew); else { closeSheet(); toast('حُفظت بيانات ' + r.user.name); }
        }).catch(function (e) { b.disabled = false; $('uErr').textContent = errText(e); });
      }
    });
    function drawRole() {
      document.querySelectorAll('#uRoles [data-role]').forEach(function (x) { x.classList.toggle('on', x.dataset.role === st.role); });
      var r = roleDef(st.role), h = '';
      if (r.scope === 'gate') {
        var opts = (S.ref ? S.ref.checkpoints : []).map(function (c) { return [c.id, c.name]; }).concat(sites.map(function (s) { return [s.id, 'بوابة موقع: ' + s.name]; }));
        if (!st.gate && opts.length) st.gate = opts[0][0];
        h = '<div class="field"><label for="uGate">البوابة التي يعمل عليها *</label><select id="uGate">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === st.gate ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select><span class="hint">يمكن إضافة أكثر من فرد أمن على نفس البوابة (الورديات). كل فرد برقمه السري الخاص.</span></div>';
      } else if (r.scope === 'sector' || r.scope === 'optional') {
        h = '<div class="field"><label>' + (r.scope === 'sector' ? 'القطاعات التي يديرها *' : 'يرى قطاعات محددة فقط (اتركه فارغاً لكل القطاعات)') + '</label><div class="u-picks">' + sectors.map(function (x) { return '<button type="button" class="u-pick' + (st.scope.indexOf(x) >= 0 ? ' on' : '') + '" data-sc="' + esc(x) + '">' + icon('check') + ' قطاع ' + esc(x) + '</button>'; }).join('') + '</div></div>';
      } else if (r.scope === 'site') {
        h = '<div class="field"><label>المواقع التي يديرها *</label>' + sectors.map(function (sec) {
          return '<div class="u-sec"><span class="xs muted">قطاع ' + esc(sec) + '</span><div class="u-picks">' + sites.filter(function (s) { return s.sector === sec; }).map(function (s) { return '<button type="button" class="u-pick' + (st.scope.indexOf(s.id) >= 0 ? ' on' : '') + '" data-sc="' + esc(s.id) + '">' + icon('check') + ' ' + esc(s.name.replace(/^(تسمين|أمهات) (الواحات|ريجوا) - /, '')) + ' <small>م' + s.level + '</small></button>'; }).join('') + '</div></div>';
        }).join('') + '<span class="hint">تصله طلبات الاستثناء والبلاغات العاجلة لهذه المواقع فقط، ويرى لوحة قيادتها.</span></div>';
      } else h = '<div class="infobox small">' + icon('shield') + ' يرى ويدير كل القطاعات والمواقع.</div>';
      $('uScope').innerHTML = h;
      if ($('uGate')) $('uGate').onchange = function () { st.gate = this.value; };
      $('uScope').querySelectorAll('[data-sc]').forEach(function (x) { x.onclick = function () { var k = x.dataset.sc, i = st.scope.indexOf(k); if (i >= 0) st.scope.splice(i, 1); else st.scope.push(k); x.classList.toggle('on', i < 0); }; });
      var locked = r.k === 'مدير' || r.k === 'أمن بوابة';
      $('uPerms').innerHTML = r.k === 'أمن بوابة' ? '<div class="infobox small">' + icon('scan') + ' أمن البوابة يسجل الدخول والخروج، ويرسل البلاغات العاجلة والرسائل للمدير، ويطّلع على القرارات.</div>' :
        '<div class="field"><div class="spread"><label>الصلاحيات</label>' + (locked ? '' : '<button type="button" class="btn sm ghost" id="uReset">' + icon('refresh') + ' صلاحيات الدور الافتراضية</button>') + '</div>' + [['', 'صلاحيات نظام الأمن الحيوي', 'shield'], ['vr', 'صلاحيات تقارير الزيارات', 'clip']].map(function (g) {
          var ps = perms.filter(function (p) { return (p.group || '') === g[0]; });
          if (!ps.length || (g[0] === '' && r.reportsOnly)) return '';
          return '<div class="u-pgroup"><span class="u-pg-h">' + icon(g[2]) + ' ' + g[1] + '</span>' + (g[0] === 'vr' ? '<span class="xs muted">تحدد دور الموظف داخل تطبيق التقارير: الاعتماد ← مدير الإدارة، المراجعة والتعديل ← مسؤول الأمن الحيوي، التحرير ← مفتش / معاون، الاطلاع ← متابعة.</span>' : '') + '<div class="u-perms">' + ps.map(function (p) {
            var on = locked || st.perms.indexOf(p.k) >= 0, dis = locked || p.k === 'admin';
            return '<button type="button" class="u-perm' + (on && !(p.k === 'admin' && !locked) ? ' on' : '') + '" data-pm="' + p.k + '"' + (dis ? ' disabled' : '') + '><span class="box">' + icon('check') + '</span><span><b>' + esc(p.short) + '</b><span>' + esc(p.label) + '</span></span></button>';
          }).join('') + '</div></div>';
        }).join('') + (locked ? '<span class="hint">مدير الأمن الحيوي له كل الصلاحيات دائماً.</span>' : '<span class="hint">«إدارة النظام» لمدير الأمن الحيوي فقط.</span>') + '</div>';
      $('uPerms').querySelectorAll('[data-pm]:not([disabled])').forEach(function (x) { x.onclick = function () { var k = x.dataset.pm, i = st.perms.indexOf(k); if (i >= 0) st.perms.splice(i, 1); else st.perms.push(k); x.classList.toggle('on', i < 0); }; });
      if ($('uReset')) $('uReset').onclick = function () { st.perms = r.perms.slice(); drawRole(); };
    }
    document.querySelectorAll('#uRoles [data-role]').forEach(function (x) { x.onclick = function () { if (x.disabled || st.role === x.dataset.role) return; st.role = x.dataset.role; st.scope = []; st.perms = roleDef(st.role).perms.slice(); drawRole(); }; });
    ['uNewPin', 'uStop'].forEach(function (id) { if ($(id)) $(id).onclick = function () { this.classList.toggle('on'); }; });
    drawRole();
  }
  function viewUsers() {
    if (!isAdmin()) return go('dash');
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><a href="#data" class="crumb">' + icon('back') + ' البيانات</a><h1>' + icon('user') + ' المستخدمون والصلاحيات</h1><p>أضف أمن البوابات ومديري المواقع والقطاعات، وحدد لكل واحد ما يراه وما يستطيع فعله. كل مستخدم يدخل برقمه السري الخاص.</p></div>' +
      '<button class="btn primary" id="uAdd">' + icon('plus') + ' إضافة مستخدم</button></div><div id="uBody"><div class="card"><p class="empty"><span class="spin"></span></p></div></div></section>';
    var meta = null, filter = '';
    function draw() {
      var users = meta.users, roles = meta.roles;
      var demo = users.filter(function (x) { return x.demoPin; }).length;
      var list = users.filter(function (x) { return !filter || x.role === filter; });
      $('uBody').innerHTML = (demo ? '<div class="warnbox">' + icon('alert') + ' ' + demo + ' حساب ما زال برقم سري تجريبي معروف (1111، 9999…). افتح كل حساب واختر «إصدار رقم سري جديد»، أو شغّل startProduction عند بدء التشغيل.</div>' : '') +
        '<div class="u-sum">' + roles.map(function (r) {
          var n = users.filter(function (x) { return x.role === r.k; }).length;
          return '<button type="button" class="u-rcard' + (filter === r.k ? ' on' : '') + '" data-f="' + esc(r.k) + '"><span class="u-ri">' + icon(ROLE_ICONS[r.k] || 'user') + '</span><b class="num">' + n + '</b><span>' + esc(r.label) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="card"><div class="spread"><h2>' + icon('list') + ' ' + (filter ? esc(roles.filter(function (r) { return r.k === filter; })[0].label) : 'كل المستخدمين') + ' <span class="xs muted">' + list.length + '</span></h2>' + (filter ? '<button class="btn sm ghost" data-f="">عرض الكل</button>' : '') + '</div>' +
        '<div class="u-list">' + (list.map(function (x) {
          var where = x.role === 'أمن بوابة' ? x.gateName : x.scopeLabel || 'كل القطاعات';
          return '<button type="button" class="u-row' + (x.active ? '' : ' off') + '" data-u="' + esc(x.id) + '"><span class="u-av">' + esc((x.name || '؟').replace(/^(م|د|أ)\s*[\/.]\s*/, '').trim().charAt(0)) + '</span>' +
            '<span class="u-main"><b>' + esc(x.name) + (x.id === meta.me ? ' <span class="pill p-n">أنت</span>' : '') + (x.active ? '' : ' <span class="pill p-bad">موقوف</span>') + '</b><span class="u-sub"><span class="mono">' + esc(x.id) + '</span> · ' + icon(ROLE_ICONS[x.role] || 'user') + ' ' + esc(x.roleLabel) + (where ? ' · ' + esc(where) : '') + '</span>' +
            (x.role === 'أمن بوابة' ? '' : '<span class="u-tags">' + (x.role === 'مدير' ? '<i class="all">كل الصلاحيات</i>' : x.perms.map(function (k) { return '<i>' + esc(PERM_SHORT[k] || k) + '</i>'; }).join('') + (x.custom ? '<i class="cu">مخصصة</i>' : '')) + '</span>') + '</span>' +
            '<span class="u-end">' + (x.demoPin ? '<span class="pill p-warn">رقم تجريبي</span>' : '') + (x.phone ? '<span class="xs muted mono">' + esc(x.phone) + '</span>' : '<span class="xs muted">بدون هاتف</span>') + '</span></button>';
        }).join('') || '<p class="empty">' + icon('user') + '<b>لا يوجد مستخدمون بهذا الدور</b></p>') + '</div></div>' +
        '<details class="card u-matrix"><summary><h2>' + icon('shield') + ' جدول الصلاحيات حسب الدور</h2></summary><div class="tbl"><table><thead><tr><th>الصلاحية</th>' + roles.map(function (r) { return '<th>' + esc(r.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        [{ short: 'تسجيل الدخول والخروج على البوابة', k: '_gate' }].concat(meta.perms).map(function (p) {
          return '<tr><td><b>' + esc(p.short) + '</b>' + (p.label ? '<span class="xs muted" style="display:block">' + esc(p.label) + '</span>' : '') + '</td>' + roles.map(function (r) {
            var on = p.k === '_gate' ? r.k === 'أمن بوابة' || r.k === 'مدير' : r.perms.indexOf(p.k) >= 0;
            return '<td class="c">' + (on ? '<span class="u-yes">' + icon('check') + '</span>' : '<span class="u-no">—</span>') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '<tr><td><b>النطاق</b></td>' + roles.map(function (r) { return '<td class="c xs">' + ({ none: 'كل القطاعات', sector: 'قطاعه', site: 'مواقعه', gate: 'بوابته', optional: 'الكل أو قطاعات' })[r.scope] + '</td>'; }).join('') + '</tr></tbody></table></div>' +
        '<p class="xs muted">الصلاحيات الافتراضية لكل دور قابلة للتعديل لكل مستخدم على حدة، فمثلاً يمكن منح مدير موقع صلاحية إصدار القرارات لبوابات موقعه.</p></details>';
      $('uBody').querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filter = filter === b.dataset.f ? '' : b.dataset.f; draw(); }; });
      $('uBody').querySelectorAll('[data-u]').forEach(function (b) { b.onclick = function () { userSheet(meta, users.filter(function (x) { return x.id === b.dataset.u; })[0], load); }; });
    }
    function load() { remote('usersList', [S.session.pin]).then(function (m) { meta = m; draw(); }).catch(function (e) { $('uBody').innerHTML = e.net ? offlineCard('إدارة المستخدمين') : '<p class="empty">' + esc(errText(e)) + '</p>'; }); }
    $('uAdd').onclick = function () { if (meta) userSheet(meta, null, load); };
    load();
  }
  function viewCards(args) {
    var tab = args && args[0] === 'gates' ? 'gates' : args && args[0] === 'lost' ? 'lost' : 'people';
    var items = (S.ref ? S.ref.items : []), kinds = [];
    items.forEach(function (i) { if (i.kind && kinds.indexOf(i.kind) < 0) kinds.push(i.kind); });
    var tabs = [['people', 'card', 'كروت الأفراد والمركبات'], ['gates', 'key', 'دخول البوابات'], ['lost', 'alert', 'الفقد والتلف']].filter(function (t) { return t[0] !== 'gates' || isAdmin(); });
    if (tab === 'gates' && !isAdmin()) tab = 'people';
    $('main').innerHTML = '<section class="view"><div class="viewhead no-print"><div><a href="#data" class="crumb">' + icon('back') + ' البيانات</a><h1>' + icon('card') + ' الكروت والأكواد</h1><p>اطبع الكروت أو أرسلها لكل موظف على واتساب، وأرسل لكل بوابة رابط التطبيق ورقمها السري، وعالج الكروت المفقودة والتالفة.</p></div>' +
      (MODE !== 'demo' && tab === 'people' ? '<button class="btn primary" id="printBtn">' + icon('printer') + ' طباعة الكروت</button>' : '') + '</div>' +
      '<div class="subtabs no-print" role="tablist">' + tabs.map(function (t) { return '<a role="tab" href="#cards' + (t[0] === 'people' ? '' : '/' + t[0]) + '" class="' + (tab === t[0] ? 'on' : '') + '">' + icon(t[1]) + ' ' + t[2] + '</a>'; }).join('') + '</div>' +
      '<div id="cardsBody"></div></section>';
    var box = $('cardsBody');
    if (tab === 'people') {
      box.innerHTML = '<div class="howto no-print"><div><span class="hn">1</span><b>اطبع وغلّف</b><span>كارت لكل فرد، وملصق على زجاج كل مركبة وجسم كل معدة.</span></div><div><span class="hn">2</span><b>أرسل على واتساب</b><span>صورة الكارت تصل لموبايل الموظف وتصلح للمسح من الشاشة.</span></div><div><span class="hn">3</span><b>نسخة احتياطية</b><span>لو نُسي الكارت أو تلف، تُمسح الصورة من الموبايل أو يُكتب الاسم على البوابة.</span></div></div>' +
        '<div class="card no-print"><div class="toolbar"><div class="search">' + icon('search') + '<input type="search" id="cardQ" placeholder="بحث بالاسم أو الكود"></div><select id="cardK"><option value="">كل الأنواع</option>' + kinds.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></div></div><div class="qrcards" id="qrcards"></div>';
      var draw = function () {
        var q = $('cardQ').value.trim().toLowerCase(), k = $('cardK').value;
        var list = items.filter(function (i) { return (!q || (i.name + ' ' + i.id).toLowerCase().indexOf(q) >= 0) && (!k || i.kind === k); });
        $('qrcards').innerHTML = list.map(function (i) {
          return '<div class="qrcard"><span class="co">' + logoImg() + esc(S.session.company) + ' · الأمن الحيوي</span><div class="qr" data-code="' + esc(cardCode(i)) + '"></div><b>' + esc(i.name) + '</b><span class="kind">' + esc(i.kind) + (i.dept ? ' · ' + esc(i.dept) : '') + '</span><span class="cid">' + esc(cardCode(i)) + '</span>' +
            (i.card > 1 ? '<span class="ver">الإصدار ' + i.card + '</span>' : '') +
            '<div class="qacts no-print"><button type="button" class="btn sm wa" data-send="' + esc(i.id) + '">' + icon('wa') + ' إرسال</button><button type="button" class="btn sm" data-issue="' + esc(i.id) + '" title="فقد أو تلف">' + icon('alert') + ' فقد / تلف</button></div></div>';
        }).join('') || '<p class="empty">لا توجد عناصر</p>';
        if (window.QRCode) document.querySelectorAll('#qrcards .qr').forEach(function (el) { new QRCode(el, { text: el.dataset.code, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M }); });
      };
      var byId = function (id) { return (S.ref ? S.ref.items : []).filter(function (x) { return x.id === id; })[0]; };
      $('qrcards').onclick = function (e) {
        var b = e.target.closest('[data-send],[data-issue]'); if (!b) return;
        if (b.dataset.send) sendCardSheet(byId(b.dataset.send));
        else cardIssueSheet(byId(b.dataset.issue), function () { items = S.ref.items; draw(); });
      };
      $('cardQ').oninput = draw; $('cardK').onchange = draw;
      if ($('printBtn')) $('printBtn').onclick = function () { window.print(); };
      draw();
    } else if (tab === 'gates') {
      box.innerHTML = '<div class="infobox">' + icon('key') + ' كل بوابة تدخل التطبيق برقم سري خاص بها. أرسل لكل بوابة رابط التطبيق ورقمها السري على واتساب هاتف البوابة. عند فقد هاتف البوابة أو تسرب الرقم أصدر رقماً جديداً، فيخرج الجهاز القديم تلقائياً عند أول اتصال.</div>' +
        '<div class="gate-cards" id="gateCards"><div class="card"><p class="empty"><span class="spin"></span></p></div></div>';
      var load = function () {
        remote('gateAccess', [S.session.pin]).then(function (list) {
          $('gateCards').innerHTML = list.map(function (g) {
            return '<div class="card gcard"><div class="gq" data-url="' + esc(g.appUrl || appLink()) + '"></div><div class="gi"><span class="eyebrow">' + esc(g.sector ? 'قطاع ' + g.sector : 'بوابة') + '</span><b>' + esc(g.gate || 'غير مرتبط ببوابة') + '</b><span class="small muted">' + esc(g.name) + '</span><span class="small">' + icon('phone') + ' ' + (g.phone ? '<span dir="ltr">' + esc(g.phone) + '</span>' : '<span class="muted">لا يوجد رقم هاتف</span>') + '</span>' +
              '<div class="row"><button type="button" class="btn sm wa" data-gs="' + esc(g.id) + '">' + icon('wa') + ' إرسال بيانات الدخول</button><button type="button" class="btn sm" data-gr="' + esc(g.id) + '">' + icon('key') + ' رقم سري جديد</button></div></div></div>';
          }).join('') || '<div class="card"><p class="empty">لا يوجد مستخدمون بصلاحية «أمن بوابة». أضفهم من «المستخدمون».</p></div>';
          if (window.QRCode) document.querySelectorAll('#gateCards .gq').forEach(function (el) { new QRCode(el, { text: el.dataset.url, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.L }); });
        }).catch(function (e) { $('gateCards').innerHTML = e.net ? offlineCard('بيانات دخول البوابات') : '<p class="empty">' + esc(errText(e)) + '</p>'; });
      };
      $('gateCards').onclick = function (e) {
        var b = e.target.closest('[data-gs],[data-gr]'); if (!b) return;
        if (b.dataset.gs) { b.disabled = true; remote('gateAccess', [S.session.pin, b.dataset.gs]).then(function (r) { b.disabled = false; gateSendSheet(r[0], false); }).catch(function (er) { b.disabled = false; toast(errText(er)); }); return; }
        var id = b.dataset.gr;
        openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('key') + '</div><h2>إصدار رقم سري جديد</h2></div><div class="sheet-body"><p>استخدمه عند فقد هاتف البوابة أو تلفه أو تسرب الرقم. الرقم القديم يُلغى فوراً، وأي جهاز مسجل به يخرج عند أول اتصال.</p>' +
          '<button class="btn bad big" data-a="ok">' + icon('key') + ' إلغاء القديم وإصدار رقم جديد</button><button class="btn ghost" data-a="close">رجوع</button></div>', function (a, bb) {
          if (a === 'close') return closeSheet();
          if (a === 'ok') { bb.disabled = true; remote('gateAccess', [S.session.pin, id, true]).then(function (r) { gateSendSheet(r[0], true); }).catch(function (er) { bb.disabled = false; toast(errText(er)); }); }
        });
      };
      load();
    } else {
      box.innerHTML = '<div class="plays">' +
        '<div class="play bad"><span class="pi">' + icon('alert') + '</span><b>كارت مفقود أو مسروق</b><ol><li>الموظف أو الأمن يبلغ المدير، أو يختار «الكارت مفقود» عند الدخول اليدوي فيصلك تنبيه.</li><li>من «كروت الأفراد» اضغط «فقد / تلف» ثم «مفقود».</li><li>يُلغى القديم على كل البوابات فوراً، وأي محاولة به تُرفض مع تنبيه.</li><li>أرسل الكارت البديل على واتساب واطبعه.</li></ol></div>' +
        '<div class="play"><span class="pi">' + icon('refresh') + '</span><b>كارت تالف أو لا يُقرأ</b><ol><li>على البوابة: اكتب الكود أو الاسم، واختر السبب، وطابق البطاقة الشخصية.</li><li>يُطبق فحص العزل كاملاً ويُسجل «إدخال يدوي».</li><li>المدير يعيد طباعة نفس الكارت أو إرساله، ويبقى صالحاً.</li></ol></div>' +
        '<div class="play"><span class="pi">' + icon('image') + '</span><b>نسي الكارت</b><ol><li>يعرض صورة الكارت المرسلة على موبايله وتُمسح من الشاشة.</li><li>أو يكتب الأمن الاسم مع التحقق من الهوية.</li></ol></div>' +
        '<div class="play"><span class="pi">' + icon('key') + '</span><b>هاتف البوابة مفقود أو الرقم السري تسرب</b><ol><li>من «دخول البوابات» اضغط «رقم سري جديد».</li><li>يخرج الجهاز القديم تلقائياً، وترسل الرقم الجديد للهاتف البديل.</li></ol></div></div>' +
        '<div class="card"><div class="card-head"><h2>' + icon('list') + ' سجل الكروت</h2><span class="sub">كل إلغاء وإعادة إصدار وتغيير رقم سري</span></div><div class="list" id="kLog"><p class="empty"><span class="spin"></span></p></div></div>';
      remote('cardLog', [S.session.pin]).then(function (rows) {
        $('kLog').innerHTML = rows.map(function (r) {
          return '<div class="li"><div class="t"><b>' + esc(r.itemName) + ' <span class="muted xs" dir="ltr">' + esc(r.itemId) + '</span></b><span>' + esc(r.action) + (r.note ? ' · ' + esc(r.note) : '') + '</span></div><div class="meta">' + esc(fmt(r.time)) + '<br>' + esc(r.by) + '</div></div>';
        }).join('') || '<p class="empty">لا توجد عمليات بعد</p>';
      }).catch(function (e) { $('kLog').innerHTML = e.net ? offlineCard('سجل الكروت') : '<p class="empty">' + esc(errText(e)) + '</p>'; });
    }
  }


  function viewHistory(args) {
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><a href="#data" class="small">' + icon('back') + ' البيانات</a><h1>سجل فرد أو مركبة</h1></div></div>' +
      '<form class="card row" id="hForm"><div class="field grow"><label for="hCode">الكود</label><input id="hCode" type="text" dir="ltr" style="text-align:right" value="' + esc(args[0] || '') + '" list="itemsList"><datalist id="itemsList">' + (S.ref ? S.ref.items : []).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist></div><button class="btn primary" type="submit">' + icon('search') + ' عرض</button></form><div id="hOut"></div></section>';
    function load(code) {
      $('hOut').innerHTML = '<p class="empty"><span class="spin"></span></p>';
      remote('history', [S.session.pin, code]).then(function (h) {
        $('hOut').innerHTML = '<div class="card"><div class="who"><div class="avatar">' + icon(kindIcon(h.item.kind), 'ico-lg') + '</div><div><b>' + esc(h.item.name) + '</b><span class="small muted">' + esc([h.item.id, h.item.kind, h.item.dept].join(' · ')) + '</span></div></div>' +
          '<div class="sites">' + h.restrictions.map(function (r) {
            return '<div class="site ' + (r.allowedAt ? 's-closed' : '') + '" style="cursor:default"><b>دخول مستوى ' + r.level + '</b>' + (r.allowedAt ? '<span class="pill p-bad">ممنوع ' + esc(left(r.allowedAt)) + '</span><span class="xs muted">' + esc(r.reasons[0] || '') + '</span>' : '<span class="pill p-ok">مسموح الآن</span>') + '</div>';
          }).join('') + '</div></div>' +
          '<div class="card"><h2>' + icon('list') + ' الحركات</h2><div class="tbl"><table><thead><tr><th>الوقت</th><th>الموقع</th><th>الاتجاه</th><th>القرار</th><th>الإجراءات</th><th>السبب</th><th>نقطة التسجيل</th></tr></thead><tbody>' +
          (h.moves.map(function (m) { return '<tr><td class="num">' + esc(fmt(m.time)) + '</td><td>' + esc(m.siteName) + '</td><td>' + esc(m.dir) + '</td><td>' + decisionPill(m) + (m.offline ? ' <span class="pill p-info">دون اتصال</span>' : '') + '</td><td class="xs">' + esc(m.checks) + '</td><td class="xs">' + esc(m.reason) + (/يدوي/.test(m.via || '') ? '<br><span class="pill p-warn">' + esc(m.via) + '</span>' : '') + '</td><td class="xs">' + esc(m.checkpoint || '') + '<br>' + esc(m.user) + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="empty">لا توجد حركات</td></tr>') +
          '</tbody></table></div></div>';
      }).catch(function (e) { $('hOut').innerHTML = e.net ? offlineCard('عرض السجل') : ''; if (!e.net) toast(errText(e)); });
    }
    $('hForm').onsubmit = function (e) { e.preventDefault(); var c = $('hCode').value.trim(); if (c) load(c); };
    if (args[0]) load(args[0]);
  }

  function viewExternal() {
    var ext = S.ref ? S.ref.sites.filter(function (s) { return s.external; }) : [];
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><a href="#data" class="small">' + icon('back') + ' البيانات</a><h1>تسجيل زيارة خارجية</h1><p>لأي زيارة لسوق أو مزرعة دواجن خارجية أو مجزر لم تُسجَّل عند الخروج من البوابة. يحسب النظام العزل منها تلقائياً.</p></div></div>' +
      '<form class="card" id="xForm"><div class="row"><div class="field grow"><label for="xCode">الكود</label><input id="xCode" type="text" dir="ltr" style="text-align:right" list="itemsList2" required><datalist id="itemsList2">' + (S.ref ? S.ref.items : []).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist></div>' +
      '<div class="field grow"><label for="xSite">الوجهة</label><select id="xSite">' + ext.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field grow"><label for="xTime">وقت الزيارة</label><input id="xTime" type="datetime-local"></div></div><div class="field"><label for="xNote">ملاحظة</label><input id="xNote" type="text"></div>' +
      '<button class="btn primary big" type="submit">تسجيل الزيارة</button></form></section>';
    $('xForm').onsubmit = function (e) {
      e.preventDefault();
      var t = $('xTime').value ? new Date($('xTime').value).getTime() : null;
      remote('recordExternal', [S.session.pin, { itemId: $('xCode').value, extSiteId: $('xSite').value, time: t, note: $('xNote').value }]).then(function () { toast('تم تسجيل الزيارة'); sync(); go('history/' + BIO_norm($('xCode').value)); }).catch(function (err) { toast(errText(err)); });
    };
  }

  /* ============================ المرجع ============================ */
  function viewRef() {
    var r = S.ref || { rules: [], settings: {} }, lv = [1, 2, 3, 4], names = { 1: 'جدود / أمهات', 2: 'تفريخ', 3: 'تسمين', 4: 'علف / مجازر / خارجي' };
    var matrix = '<div class="tbl"><table class="matrix"><thead><tr><th>قادم من ↓ / إلى ←</th>' + lv.map(function (l) { return '<th>مستوى ' + l + '<br><span class="xs">' + names[l] + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
      lv.map(function (f) { return '<tr><th>مستوى ' + f + '<br><span class="xs">' + names[f] + '</span></th>' + lv.map(function (t) { var h = BIO_requiredHours(r.rules, f, t); return '<td class="' + (h ? 'h' : 'z') + '">' + (h ? h + ' س' : 'مسموح') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    var st = r.settings;
    $('main').innerHTML = '<section class="view"><div class="viewhead"><div><h1>مرجع قواعد الأمن الحيوي</h1><p>ما يطبقه النظام الآن على كل قرار دخول.</p></div></div>' +
      '<div class="card"><h2>' + icon('clock') + ' فترات العزل بين المواقع</h2>' + matrix +
      '<p class="small muted">بعد زيارة موقع في حالة «إنذار» لا يقل العزل عن ' + esc(st.ALERT_HOURS || '—') + ' ساعة. هذه الساعات سياسة الشركة وتُعدَّل من «البيانات ← قواعد العزل».</p>' +
      '<div class="warnbox">أدلة هابرد المنشورة لسلالة إفيشنسي بلس (دليل قطعان الأمهات ودليل التسمين) ودليل إدارة الأمهات العام لا تحدد عدد ساعات لابتعاد الأفراد عن الدواجن الأخرى. لذلك الأرقام أعلاه مبدئية حتى يعتمدها الطبيب البيطري للشركة أو الدعم الفني لهابرد.</div></div>' +
      '<div class="grid-2"><div class="card"><h2>' + icon('shield') + ' ما يأخذه النظام من هابرد</h2><ul class="small" style="margin:0;padding-inline-start:18px;display:grid;gap:8px">' +
      '<li><b>غرفة تغيير عند مدخل الموقع يستخدمها كل من يدخل:</b> استحمام وتغيير ملابس. يطبقها التطبيق كقائمة إجراءات إلزامية قبل تأكيد دخول أي فرد.<div class="src">“A changing room should be made available at the entrance of the site. It must be used by everybody entering the farm (a shower and a change of clothes).” · Hubbard Breeder Management Manual، القسم 1</div></li>' +
      '<li><b>غسيل وتطهير المركبات بالرش:</b> قائمة إجراءات إلزامية لكل مركبة.<div class="src">“The vehicles … must have been carefully washed and disinfected by spray.” · القسم 2.5</div></li>' +
      '<li><b>عمر واحد وسلالة واحدة في الموقع (الكل يدخل والكل يخرج)</b>، لذلك كل محطة تسمين موقع مستقل له عزل خاص.<div class="src">“The golden rule of breeder management is to have one age and one breed per site.” · القسم 1</div></li>' +
      '<li><b>فترة راحة لا تقل عن ' + esc(st.DOWNTIME_DAYS || 10) + ' أيام</b> بعد التنظيف والتطهير وقبل التسكين الجديد.<div class="src">“…followed by a resting period of at least 10 days.” · القسم 1 و2.10</div></li>' +
      '<li><b>بيض التفريخ يُطهّر فور جمعه</b>، وبيض الأرضية يعامل كملوث.<div class="src">القسم 12</div></li></ul>' +
      '<div class="small"><a href="https://www.hubbardbreeders.com/media/ps-breeders-management-manual-en-20230322-ld.pdf" target="_blank" rel="noopener">دليل هابرد لإدارة الأمهات (PDF)</a> · <a href="https://www.hubbardbreeders.com/media/ps-guide-efficiency-plus-en-imp-20220922-ld.pdf" target="_blank" rel="noopener">دليل أمهات إفيشنسي بلس (PDF)</a></div></div>' +
      '<div class="card"><h2>' + icon('check') + ' إجراءات الدخول المطبقة في البوابات</h2>' +
      [['الأفراد', st.CHECKS_PERSON], ['المركبات', st.CHECKS_VEHICLE], ['المعدات', st.CHECKS_EQUIPMENT]].map(function (x) { return '<div><b class="small">' + x[0] + '</b><ul class="small" style="margin:4px 0 0;padding-inline-start:18px">' + BIO_list(x[1]).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>'; }).join('') +
      '<p class="xs muted">تُعدَّل من «البيانات ← الإعدادات».</p></div></div></section>';
  }


  /* ============================ الإصدار 5: أدوات مشتركة ============================ */
  var LVL_C = { low: 'var(--r-low)', mid: 'var(--r-mid)', high: 'var(--r-high)', crit: 'var(--r-crit)' };
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function v5Head(title, ic, sub, extra, crumb) {
    return '<div class="viewhead"><div>' + (crumb ? '<a href="#' + crumb[0] + '" class="crumb">' + icon('back') + ' ' + crumb[1] + '</a>' : '') + '<h1>' + icon(ic) + ' ' + title + '</h1><p>' + sub + '</p></div>' + (extra ? '<div class="row">' + extra + '</div>' : '') + '</div>';
  }
  function v5Load(fn, args, draw, what, boxId) {
    return remote(fn, [S.session.pin].concat(args || [])).then(draw).catch(function (e) {
      var box = $(boxId || 'v5Out'); if (!box) return;
      if (e.net) { setOnline(false); box.innerHTML = offlineCard(what); } else box.innerHTML = '<div class="card"><p class="empty">' + icon('alert') + esc(errText(e)) + '</p></div>';
    });
  }
  function v5Spin() { return '<div class="card"><p class="empty"><span class="spin"></span></p></div>'; }
  function bar(pct, color) { return '<span class="v5bar"><i style="width:' + Math.max(2, Math.min(100, pct)) + '%;background:' + color + '"></i></span>'; }
  function lvlPill(l) { return '<span class="pill lv-' + l.k + '">' + esc(l.label) + '</span>'; }
  function myScopeSites() { return (S.ref ? S.ref.sites : []).filter(function (s) { return !s.external; }); }
  function siteOptions(list, sel) {
    var g = {}; list.forEach(function (s) { (g[s.sector || ''] = g[s.sector || ''] || []).push(s); });
    return Object.keys(g).map(function (k) { var o = g[k].map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join(''); return Object.keys(g).length > 1 ? '<optgroup label="قطاع ' + esc(k) + '">' + o + '</optgroup>' : o; }).join('');
  }
  function bindGoto(root) { (root || document).querySelectorAll('[data-goto]').forEach(function (b) { b.onclick = function () { go(b.dataset.goto); }; }); }
  function copyText(t) { try { navigator.clipboard.writeText(t).then(function () { toast('تم النسخ'); }, function () { toast(t, 8000); }); } catch (e) { toast(t, 8000); } }

  /* ============================ رادار الطيور المهاجرة ============================ */
  var BIRD_SPECIES = ['بط بري (خضاري أو شرشير)', 'بلشون أو أبو قردان', 'نوارس', 'لقلق أبيض', 'صقور وجوارح', 'حمام', 'غربان', 'عصافير', 'سمان', 'طيور غير معروفة'];
  /* ============================ الأرصاد الجوية والآفات الناقلة للأمراض ============================
     الطقس الحي وتوقعات 7 أيام من Open-Meteo (مجاناً بدون مفتاح) لكل قطاع، ومؤشر «طقس الأمن الحيوي»
     لكل يوم، والمحطات الواقعة في اتجاه الريح، ونموذج نشاط الآفات حسب الحرارة والرطوبة (تقويم سنوي + الآن) */
  // المناخ الشهري لمنطقة الواحات/غرب الجيزة (عظمى، صغرى، رطوبة %، مطر مم): بديل عند غياب البيانات الحية
  var WX_CLIMO = [[20, 8, 60, 5], [22, 9, 55, 4], [25, 11, 50, 3], [30, 14, 42, 1], [34, 18, 38, 0], [36, 20, 42, 0], [36, 22, 50, 0], [36, 22, 55, 0], [34, 20, 55, 0], [31, 17, 57, 1], [26, 13, 60, 3], [21, 9, 62, 5]];
  // t = [أدنى حرارة للنشاط، بداية المثالي، نهاية المثالي، أقصى حرارة]، h = تفضيل الرطوبة، cold = يزيد الضغط مع البرد
  var PESTS = [
    { id: 'fly', name: 'الذباب المنزلي', sci: 'Musca domestica', ico: 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 13v6M9 9 4 5M15 9l5-4M9 12H3M15 12h6M9 15l-4 4M15 15l4 4', t: [12, 25, 32, 42], h: 'mid',
      dz: 'السالمونيلا، الإشريكية القولونية، الكامبيلوباكتر، ونقل نيوكاسل وإنفلونزا الطيور ميكانيكياً',
      act: ['رش يرقات الذباب في السبلة وحول العنابر', 'إخراج السبلة الرطبة وعدم تكديسها قرب العنابر', 'مصائد لاصقة وبطاقات عدّ أسبوعية لكل عنبر'] },
    { id: 'mosq', name: 'البعوض', sci: 'Culex spp.', ico: 'M12 6v12M12 9l-6-4M12 9l6-4M12 13l-7 2M12 13l7 2M12 17l-4 4M12 17l4 4', t: [15, 24, 30, 37], h: 'high', rain: 1,
      dz: 'جدري الطيور، فيروس غرب النيل، ملاريا الطيور',
      act: ['تجفيف أي مياه راكدة خلال 48 ساعة', 'شبك ناعم على فتحات التهوية', 'رش بعد الغروب حول العنابر ومصادر المياه'] },
    { id: 'rod', name: 'القوارض (الفئران والجرذان)', sci: 'Rattus / Mus musculus', ico: 'M5 14a7 5 0 0 0 14 0 7 5 0 0 0-14 0zM17 11l3-3M19 15h3M6 18l-3 2M9 10a2 2 0 1 1-3-2', cold: 1, h: 'mid',
      dz: 'السالمونيلا، الباستيريلا (كوليرا الطيور)، نقل الفيروسات بين العنابر والمواقع',
      act: ['مراجعة محطات الطُعم أسبوعياً وتسجيل الاستهلاك', 'سد الفتحات حول الأبواب والمواسير', 'تخزين العلف في مخازن مغلقة وتنظيف المنسكب'] },
    { id: 'beetle', name: 'خنفساء الفرشة', sci: 'Alphitobius diaperinus', ico: 'M12 5a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V9a4 4 0 0 0-4-4zM12 5v14M8 10H4M16 10h4M8 15H4M16 15h4M10 4 8 2M14 4l2-2', t: [17, 26, 34, 40], h: 'mid', indoor: 1,
      dz: 'السالمونيلا، مارك، الجمبورو، الكوكسيديا (تبقى حاملة للعدوى بين الدورات)',
      act: ['رش مبيد للحشرات الزاحفة فور خروج القطيع وقبل التبريد', 'معالجة التربة والجدران حتى ارتفاع متر', 'فترة راحة كاملة قبل الدورة التالية'] },
    { id: 'mite', name: 'الحلم الأحمر', sci: 'Dermanyssus gallinae', ico: 'M12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM8 9 5 6M16 9l3-3M7 13H3M17 13h4M8 17l-3 3M16 17l3 3', t: [10, 20, 30, 40], h: 'high', indoor: 1,
      dz: 'السالمونيلا، الحمرة الخنزيرية، فقر الدم وهبوط الإنتاج في الأمهات',
      act: ['فحص الشقوق والمجاثم ليلاً بمصابيح', 'معالجة الشقوق والفواصل بالمبيد المعتمد', 'منع نقل الأقفاص والمعدات بين العنابر دون تطهير'] },
    { id: 'tick', name: 'قراد الدواجن', sci: 'Argas persicus', ico: 'M12 7a5 6 0 1 0 0 12 5 6 0 0 0 0-12zM9 8 6 4M15 8l3-4M7 12H3M17 12h4M7 16l-3 3M17 16l3 3', t: [18, 27, 36, 42], h: 'low',
      dz: 'البوريليا (الإسبيروكيتات) وشلل القراد',
      act: ['فحص الأخشاب والشقوق في العنابر القديمة', 'معالجة الجدران والأسقف بالمبيد', 'منع دخول الطيور البرية والحمام للعنابر'] },
    { id: 'roach', name: 'الصراصير', sci: 'Periplaneta / Blattella', ico: 'M12 6a4 6 0 0 0-4 6v3a4 4 0 0 0 8 0v-3a4 6 0 0 0-4-6zM10 5 7 2M14 5l3-3M8 11H4M16 11h4M8 15l-4 2M16 15l4 2', t: [16, 25, 33, 40], h: 'mid', indoor: 1,
      dz: 'السالمونيلا، الكوكسيديا، ونقل بعض الفيروسات',
      act: ['نظافة المخازن وغرف الخدمة وتصريف الصرف', 'طُعم جل في الشقوق', 'إغلاق مصارف المياه ليلاً'] }
  ];
  var MONTHS3 = function (i) { return MONTHS[i].slice(0, 3); };
  function pestScore(p, tmean, rh, rain7) {
    var v;
    if (p.cold) v = tmean <= 12 ? 1 : tmean >= 30 ? 0.35 : 1 - (tmean - 12) / 18 * 0.65; // القوارض تدخل العنابر مع البرد
    else {
      var t = p.t; v = tmean <= t[0] || tmean >= t[3] ? 0 : tmean < t[1] ? (tmean - t[0]) / (t[1] - t[0]) : tmean <= t[2] ? 1 - 0.15 * Math.pow((tmean - (t[1] + t[2]) / 2) / Math.max(1, (t[2] - t[1]) / 2), 2) : (t[3] - tmean) / (t[3] - t[2]);
      if (p.indoor) v = 0.25 + v * 0.75; // داخل العنابر الحرارة أكثر ثباتاً
    }
    var c = function (x) { return Math.max(0, Math.min(1, x)); };
    if (p.h === 'high') v *= 0.6 + 0.4 * c((rh - 35) / 40); else if (p.h === 'low') v *= 1 - 0.35 * c((rh - 35) / 45); else v *= 0.8 + 0.2 * c((rh - 30) / 30);
    if (p.rain) v = Math.min(1, v * (1 + Math.min(0.35, (rain7 || 0) / 25)));
    return Math.round(v * 92);
  }
  function pestLvl(v) { return v >= 80 ? { k: 'crit', label: 'حرج' } : v >= 60 ? { k: 'high', label: 'مرتفع' } : v >= 40 ? { k: 'mid', label: 'متوسط' } : { k: 'low', label: 'منخفض' }; }
  function pestYear(p) { return WX_CLIMO.map(function (c) { return pestScore(p, (c[0] + c[1]) / 2, c[2], c[3]); }); }
  var WX_CODE = function (c) { return c >= 95 ? ['عواصف رعدية', '⛈'] : c >= 80 ? ['زخات مطر', '🌦'] : c >= 61 ? ['مطر', '🌧'] : c >= 51 ? ['رذاذ', '🌦'] : c >= 45 ? ['ضباب', '🌫'] : c >= 3 ? ['غائم', '☁'] : c >= 1 ? ['غائم جزئياً', '⛅'] : ['صافٍ', '☀']; };
  var DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function wxSectors(d) {
    var g = {}; d.sites.forEach(function (x) { if (x.lat == null || x.lng == null) return; (g[x.sector] = g[x.sector] || []).push(x); });
    return Object.keys(g).map(function (k) { var L0 = g[k]; return { name: k, sites: L0, lat: L0.reduce(function (a, x) { return a + +x.lat; }, 0) / L0.length, lng: L0.reduce(function (a, x) { return a + +x.lng; }, 0) / L0.length }; });
  }
  /** طقس محاكى من المناخ الشهري (نسخة العرض أو تعذر الاتصال) */
  function wxSim(secs) {
    var now = new Date(), m = now.getMonth(), seed = now.getDate();
    return secs.map(function (s, si) {
      var days = []; for (var i = 0; i < 7; i++) {
        var dt = new Date(now.getTime() + i * 864e5), c = WX_CLIMO[dt.getMonth()], j = Math.sin((seed + i) * 1.7 + si) * 2.2, w = 12 + Math.abs(Math.sin((seed + i) * 2.3)) * 22;
        var tx = c[0] + j, tn = c[1] + j * 0.6, rr = c[2] + j * 3, thiH = []; for (var h = 0; h < 24; h++) { var f = (1 - Math.cos((h - 4) / 24 * 2 * Math.PI)) / 2, tt = tn + (tx - tn) * (h >= 4 && h <= 15 ? (1 - Math.cos((h - 4) / 11 * Math.PI)) / 2 : h > 15 ? 1 - (h - 15) / 13 : 0.05); thiH.push(Math.round(wxTHI(tt, Math.max(15, rr + 25 - (tt - tn) * 2.2)))); }
        days.push({ thiH: thiH, date: dt.toISOString().slice(0, 10), tmax: Math.round(c[0] + j), tmin: Math.round(c[1] + j * 0.6), rh: Math.round(c[2] + j * 3), rain: i === 4 && c[3] > 0 ? 3.2 : 0, rainP: i === 4 && c[3] > 0 ? 60 : 5, wind: Math.round(w), gust: Math.round(w * 1.6), dir: Math.round((330 + i * 12 + si * 7) % 360), dust: i === 2 ? 210 : Math.round(30 + Math.abs(j) * 15), code: i === 4 && c[3] > 0 ? 61 : i === 2 ? 3 : 0 });
      }
      var c0 = WX_CLIMO[m];
      return { sector: s.name, live: false, cur: { t: Math.round((c0[0] + c0[1]) / 2 + 3), rh: c0[2], wind: days[0].wind, gust: days[0].gust, dir: days[0].dir, rain: 0, code: 1, dust: days[0].dust }, days: days };
    });
  }
  function wxFetch(secs) {
    if (MODE === 'demo' || !window.fetch) return Promise.resolve(wxSim(secs));
    var la = secs.map(function (s) { return s.lat.toFixed(4); }).join(','), lo = secs.map(function (s) { return s.lng.toFixed(4); }).join(',');
    var f1 = fetch('https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=relative_humidity_2m,temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&timezone=Africa%2FCairo&forecast_days=7').then(function (r) { if (!r.ok) throw new Error('wx'); return r.json(); });
    var f2 = fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + la + '&longitude=' + lo + '&hourly=dust,pm10&timezone=Africa%2FCairo&forecast_days=5').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return Promise.all([f1, f2]).then(function (r) {
      var A = [].concat(r[0]), Q = r[1] ? [].concat(r[1]) : [];
      return secs.map(function (s, i) {
        var a = A[i], q = Q[i], dy = a.daily, days = dy.time.map(function (t, k) {
          var hs = a.hourly.relative_humidity_2m.slice(k * 24, k * 24 + 24).filter(function (v) { return v != null; });
          var dz = q && q.hourly ? q.hourly.time.reduce(function (mx, ht, hi) { return ht.slice(0, 10) === t ? Math.max(mx, q.hourly.dust[hi] || 0, (q.hourly.pm10[hi] || 0) * 0.6) : mx; }, 0) : null;
          var ts = a.hourly.temperature_2m.slice(k * 24, k * 24 + 24), hr = a.hourly.relative_humidity_2m.slice(k * 24, k * 24 + 24), thi = ts.map(function (tv, h) { return { h: h, v: tv == null || hr[h] == null ? 0 : wxTHI(tv, hr[h]) }; });
          return { thiH: thi.map(function (o) { return Math.round(o.v); }), date: t, tmax: Math.round(dy.temperature_2m_max[k]), tmin: Math.round(dy.temperature_2m_min[k]), rh: hs.length ? Math.round(hs.reduce(function (x, y) { return x + y; }, 0) / hs.length) : null, rain: dy.precipitation_sum[k] || 0, rainP: dy.precipitation_probability_max[k] || 0, wind: Math.round(dy.wind_speed_10m_max[k]), gust: Math.round(dy.wind_gusts_10m_max[k]), dir: dy.wind_direction_10m_dominant[k], dust: dz, code: dy.weather_code[k] };
        });
        var c = a.current; return { sector: s.name, live: true, cur: { t: Math.round(c.temperature_2m), rh: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), gust: Math.round(c.wind_gusts_10m), dir: c.wind_direction_10m, rain: c.precipitation, code: c.weather_code, dust: days[0].dust }, days: days };
      });
    });
  }
  /** تأثير طقس اليوم على الأمن الحيوي: درجة (سلبي/إيجابي) + الأسباب + الإجراءات */
  function wxImpact(x) {
    var neg = [], pos = [], acts = [], tm = (x.tmax + x.tmin) / 2;
    if (x.gust >= 45 || x.wind >= 32) { neg.push([3, 'رياح قوية تنقل العدوى والغبار والريش لمسافات أبعد']); acts.push('إغلاق فتحات التهوية المواجهة للريح', 'تأجيل نقل السبلة والفرشة وتغطية سياراتها', 'متابعة المحطات الواقعة في اتجاه الريح'); }
    else if (x.wind >= 22) { neg.push([1, 'رياح نشطة قد تنقل الغبار من الطرق والمزارع المجاورة']); acts.push('تغطية سيارات السبلة والنافق أثناء النقل'); }
    if (x.dust != null && x.dust >= 150) { neg.push([3, 'غبار أو موجة خماسين: جسيمات تحمل الميكروبات وتُتلف الفلاتر']); acts.push('تنظيف وتغيير فلاتر التهوية بعد الموجة', 'تشغيل الستائر المبللة إن وجدت', 'تطهير الأسطح الخارجية بعد هدوء الغبار'); }
    if (x.rain >= 2 || x.rainP >= 70) { neg.push([2, 'أمطار: طين على عجلات المركبات وتخفيف محلول أحواض الأقدام والعجلات']); acts.push('تغيير محلول أحواض الأقدام والعجلات بعد المطر مباشرة', 'تجفيف المياه الراكدة خلال 48 ساعة (بعوض)', 'فرد جير حول مداخل العنابر'); }
    if (x.tmin <= 10) { neg.push([2, 'برودة: فاعلية المطهرات تضعف تحت 10°م والقوارض تتجه للعنابر']); acts.push('زيادة زمن التلامس للمطهر أو استخدام مطهر مناسب للبرد', 'مراجعة محطات طُعم القوارض'); }
    if (x.tmax >= 38) { neg.push([2, 'حرارة شديدة: تبخر سريع للمطهرات وإجهاد حراري ونشاط عالٍ للذباب']); acts.push('تجديد محاليل التطهير مرتين يومياً', 'تشغيل التبريد مبكراً وتوفير مياه باردة', 'رش يرقات الذباب في السبلة'); }
    if (x.rh != null && x.rh >= 75) { neg.push([1, 'رطوبة عالية: فرشة رطبة وأمونيا ونشاط الحلم والفطريات']); acts.push('زيادة التهوية الدنيا وتقليب الفرشة'); }
    if (x.wind < 15 && x.rain < 0.5 && x.rainP < 40 && tm >= 15 && tm <= 30 && (x.dust == null || x.dust < 80)) { pos.push('هدوء ومناخ معتدل: يوم مثالي للرش والتطهير الخارجي وتجديد الجير'); acts.unshift('جدولة التطهير الخارجي والرش اليوم'); }
    var sc = neg.reduce(function (a, n) { return a + n[0]; }, 0);
    var k = sc >= 4 ? ['crit', 'خطر', 'var(--r-crit)'] : sc >= 2 ? ['high', 'سلبي', 'var(--r-high)'] : sc >= 1 ? ['mid', 'انتبه', 'var(--r-mid)'] : pos.length ? ['good', 'إيجابي', 'var(--r-low)'] : ['ok', 'عادي', 'var(--muted)'];
    return { k: k[0], label: k[1], color: k[2], neg: neg.map(function (n) { return n[1]; }), pos: pos, acts: acts.filter(function (v, i, a) { return a.indexOf(v) === i; }) };
  }
  function wxBearing(a, b) { var y = (b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), xx = b.lat - a.lat, t = Math.atan2(y, xx) * 180 / Math.PI; return (t + 360) % 360; }
  /** المحطات الواقعة في اتجاه الريح من كل محطة (ضمن 10 كم وزاوية ±30°) */
  function wxDownwind(sites, windFrom) {
    var to = (windFrom + 180) % 360, out = [];
    sites.forEach(function (a) {
      var hit = sites.filter(function (b) { if (b === a) return false; var km = BIO_kmLL(+a.lat, +a.lng, +b.lat, +b.lng); if (km > 10) return false; var df = Math.abs(((wxBearing({ lat: +a.lat, lng: +a.lng }, { lat: +b.lat, lng: +b.lng }) - to) + 540) % 360 - 180); return df <= 30; })
        .map(function (b) { return { s: b, km: BIO_kmLL(+a.lat, +a.lng, +b.lat, +b.lng) }; }).sort(function (p, q) { return p.km - q.km; });
      if (hit.length) out.push({ s: a, hit: hit });
    });
    return out.sort(function (p, q) { return q.hit.length - p.hit.length; });
  }
  function compassAr(deg) { return ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }

  /** مؤشر الحرارة والرطوبة للدواجن THI = 0.8T + RH(T-14.4) + 46.4 */
  function wxTHI(t, rh) { return 0.8 * t + (rh / 100) * (t - 14.4) + 46.4; }
  function thiLvl(v) { return v >= 84 ? { k: 'crit', label: 'طوارئ' } : v >= 79 ? { k: 'high', label: 'خطر' } : v >= 75 ? { k: 'mid', label: 'تنبيه' } : { k: 'low', label: 'آمن' }; }
  var THI_ACT = {
    low: ['التهوية الدنيا المعتادة وفحص المساقي'],
    mid: ['تشغيل مراوح التهوية النفقية مبكراً قبل ساعات الذروة', 'التأكد من تدفق المياه وتبريد خزانات الشرب', 'تقليل الكثافة في العنابر المزدحمة إن أمكن'],
    high: ['تشغيل خلايا التبريد (الكولينج) من بداية ساعات الذروة', 'رفع العلف 4 إلى 6 ساعات قبل الذروة وإعادته مساءً', 'إضافة الأملاح والفيتامين C إلى مياه الشرب', 'منع أي حركة أو وزن أو تحميل للطيور وقت الذروة'],
    crit: ['طوارئ: كل وسائل التبريد والتهوية القصوى ومراقبة كل عنبر كل ساعة', 'رش ضبابي للأسطح والممرات إن توفر', 'منع النقل والتحميل نهائياً حتى المساء', 'إبلاغ المدير فوراً بأي نفوق أعلى من المعتاد']
  };
  /** التقويم الموسمي لمهام الأمن الحيوي: [الأشهر، المهمة، المسؤول، السبب] */
  var SEASON_TASKS = [
    [[9], 'برنامج مكافحة القوارض الموسع قبل الشتاء: مراجعة وزيادة محطات الطُعم حول كل موقع', 'المكافحة', 'القوارض تتجه للعنابر مع انخفاض الحرارة'],
    [[9, 10], 'فحص وإصلاح شبك الشبابيك وفتحات التهوية قبل موسم الطيور المهاجرة', 'الصيانة', 'ذروة الهجرة الخريفية من سبتمبر إلى نوفمبر'],
    [[10], 'مراجعة الدفايات وعزل الأسقف وأبواب العنابر', 'الصيانة', 'استعداد للشتاء وتقليل فتح الأبواب'],
    [[10, 11], 'رفع درجة الاستعداد لإنفلونزا الطيور: تشديد زيارات المزارع وتطهير المركبات', 'مدير الأمن الحيوي', 'تجمع البط الشتوي في البحيرات القريبة'],
    [[11, 12, 1], 'تفعيل بروتوكول التطهير في البرد: زيادة زمن التلامس واستخدام مطهر مناسب للحرارة المنخفضة', 'أمن البوابات', 'المطهرات تضعف تحت 10°م'],
    [[12, 1, 2], 'تجديد محلول أحواض الأقدام والعجلات بعد كل مطر وفرد الجير حول المداخل', 'أمن البوابات', 'موسم الأمطار القليلة والطين على المركبات'],
    [[1, 2], 'جرد المطهرات والمبيدات وطلب احتياجات موسم الصيف', 'المشتريات', 'تجنب نقص المواد في ذروة الذباب والحرارة'],
    [[2, 3], 'بدء برنامج مكافحة الذباب: رش اليرقات وبطاقات العدّ الأسبوعية', 'المكافحة', 'بداية ارتفاع نشاط الذباب مع الدفء'],
    [[3], 'تنظيف وتطهير خطوط المياه والخزانات قبل الصيف', 'الصيانة', 'نمو البكتيريا في المياه مع ارتفاع الحرارة'],
    [[3, 4, 5], 'خطة الخماسين: فلاتر احتياطية وتنظيف الفتحات بعد كل موجة غبار', 'الصيانة', 'موسم رياح الخماسين المحملة بالغبار'],
    [[3, 4], 'تشديد الشبك ومراقبة الطيور البرية مع الهجرة الربيعية', 'أمن البوابات', 'ذروة الهجرة الربيعية مارس وأبريل'],
    [[4], 'صيانة خلايا التبريد والمراوح وأجهزة قياس الحرارة والرطوبة', 'الصيانة', 'استعداد للإجهاد الحراري'],
    [[4, 5], 'برنامج مكافحة البعوض: تجفيف المياه الراكدة وشبك ناعم على الفتحات', 'المكافحة', 'ارتفاع نشاط البعوض وجدري الطيور'],
    [[5, 6], 'متابعة القوارض حول المواقع بعد حصاد القمح', 'المكافحة', 'هجرة القوارض من الحقول بعد الحصاد'],
    [[6, 7, 8], 'تفعيل خطة الإجهاد الحراري يومياً حسب مؤشر THI ومنع التحميل وقت الذروة', 'مدير الموقع', 'ذروة الحرارة صيفاً'],
    [[6, 7, 8, 9], 'رش يرقات الذباب في السبلة أسبوعياً وإخراج السبلة الرطبة', 'المكافحة', 'ذروة نشاط الذباب'],
    [[7, 8], 'مكافحة خنفساء الفرشة والحلم بين الدورات قبل تبريد العنابر', 'المكافحة', 'نشاطها الأعلى في الحرارة'],
    [[8], 'تدريب تنشيطي لأمن البوابات والعاملين قبل موسم الخريف', 'مدير الأمن الحيوي', 'الاستعداد لموسم الهجرة والشتاء'],
    [[10, 11], 'متابعة القوارض حول المواقع بعد حصاد الذرة والأرز', 'المكافحة', 'هجرة القوارض من الحقول بعد الحصاد'],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'مراجعة شهرية لسجلات البوابات وتقرير الالتزام لكل محطة', 'مدير الأمن الحيوي', 'متابعة دورية']
  ];
  function seasonTasks(m) { return SEASON_TASKS.map(function (t, i) { return { i: i, months: t[0], task: t[1], who: t[2], why: t[3] }; }).filter(function (t) { return t.months.indexOf(m + 1) >= 0; }); }
  function viewWx() {
    $('main').innerHTML = '<section class="view wx-view"><div id="wxOut">' + v5Spin() + '</div></section>';
    var go2 = function (b) {
      var secs = wxSectors(b); if (!secs.length) { $('wxOut').innerHTML = '<div class="card"><p class="empty">' + icon('pin') + 'أضف إحداثيات المواقع من رادار الطيور أولاً</p></div>'; return; }
      var cached = S.wx && Date.now() - S.wx.at < 45 * 60e3 ? Promise.resolve(S.wx) : wxFetch(secs).then(function (r) { return { at: Date.now(), data: r }; }).catch(function () { return KV.get('wx').then(function (c) { return c && c.data ? Object.assign(c, { stale: true }) : { at: Date.now(), data: wxSim(secs), failed: true }; }); });
      var kvd = S.wxDone ? Promise.resolve() : KV.get('wxDone').then(function (v) { S.wxDone = v || {}; }).catch(function () { S.wxDone = {}; });
      Promise.all([cached, kvd]).then(function (r) { var w = r[0]; S.wx = w; if (!w.stale && !w.failed) KV.set('wx', w); if (S.route.split('/')[0] === 'wx') drawWx(b, w); });
    };
    if (S.birds) go2(S.birds);
    else v5Load('birds', [], function (d) { S.birds = d; go2(d); }, 'الأرصاد والآفات', 'wxOut');
  }
  function drawWx(b, w) {
    var out = $('wxOut'); if (!out) return;
    var secs = wxSectors(b), names = secs.map(function (s) { return s.name; });
    if (!S.wxSec || names.indexOf(S.wxSec) < 0) S.wxSec = names.indexOf('الواحات') >= 0 ? 'الواحات' : names[0];
    var sec = secs.filter(function (s) { return s.name === S.wxSec; })[0], W = w.data.filter(function (x) { return x.sector === S.wxSec; })[0] || w.data[0], cur = W.cur, today = W.days[0];
    var mNow = new Date().getMonth(), rain7 = W.days.reduce(function (a, x) { return a + (x.rain || 0); }, 0);
    var tAvg = W.days.reduce(function (a, x) { return a + (x.tmax + x.tmin) / 2; }, 0) / W.days.length, rhAvg = W.days.reduce(function (a, x) { return a + (x.rh == null ? WX_CLIMO[mNow][2] : x.rh); }, 0) / W.days.length;
    var pests = PESTS.map(function (p) { var yr = pestYear(p), now = pestScore(p, tAvg, rhAvg, rain7), daily = W.days.map(function (x) { return pestScore(p, (x.tmax + x.tmin) / 2, x.rh == null ? WX_CLIMO[mNow][2] : x.rh, rain7); }); return { p: p, yr: yr, now: now, lvl: pestLvl(now), daily: daily, peak: yr.map(function (v, i) { return [v, i]; }).filter(function (a) { return a[0] >= 60; }).map(function (a) { return a[1]; }) }; }).sort(function (a, c) { return c.now - a.now; });
    var imp = W.days.map(wxImpact), bad = imp.filter(function (x) { return x.k === 'crit' || x.k === 'high'; }).length;
    var src = W.live ? 'بيانات حية: Open-Meteo' + (w.stale ? ' (آخر نسخة محفوظة)' : '') : MODE === 'demo' ? 'طقس محاكى (نسخة العرض)' : 'تعذر الاتصال: تقدير من المناخ الشهري';
    var dwn = wxDownwind(sec.sites, cur.dir);
    var html = '<div class="bd-hero wx-hero"><div class="bd-ht"><span class="cc-kick">' + icon('wind') + ' الأرصاد الجوية والآفات الناقلة للأمراض · أداة إدارة الأمن الحيوي</span><h1>الطقس والآفات وتأثيرهما على مواقع الشركة</h1>' +
      '<div class="cc-meta"><span class="live"><i></i> ' + esc(src) + '</span><span>قطاع ' + esc(S.wxSec) + '</span><span>تحديث ' + esc(fmt(w.at)) + '</span></div></div>' +
      '<div class="bd-hs"><div class="bd-big" style="--c:' + LVL_C[pests[0].lvl.k] + '"><b class="mono">' + pests[0].now + '</b><span>أعلى نشاط آفة الآن</span><small>' + esc(pests[0].p.name) + '</small></div>' +
      '<div class="bd-big" style="--c:' + (bad ? 'var(--r-high)' : 'var(--r-low)') + '"><b class="mono">' + bad + '</b><span>أيام سلبية خلال 7 أيام</span><small>حسب تأثير الطقس</small></div></div>' +
      '<div class="cc-acts"><div class="bd-seg" role="group">' + names.map(function (n) { return '<button type="button" data-wxsec="' + esc(n) + '" class="' + (n === S.wxSec ? 'on' : '') + '">قطاع ' + esc(n) + '</button>'; }).join('') + '</div><button class="btn cc-btn" type="button" id="wxRef">' + icon('refresh') + ' تحديث الطقس</button></div></div>';
    var tabs = [['wx', 'الطقس والرياح'], ['pest', 'الآفات الناقلة'], ['thi', 'الإجهاد الحراري'], ['cal', 'التقويم الموسمي']];
    if (!S.wxTab) S.wxTab = 'wx';
    html += '<div class="wx-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" data-wxtab="' + t[0] + '" class="' + (S.wxTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
    var secW = '', secP = '', secT = '', secC = '';
    // الطقس الآن
    var cw = WX_CODE(cur.code), ti = wxImpact(today);
    secW += '<div class="wx-now"><div class="card wx-cur"><div class="wx-big"><span class="wx-emo">' + cw[1] + '</span><div><b class="mono">' + cur.t + '°</b><span>' + esc(cw[0]) + ' · العظمى ' + today.tmax + '° والصغرى ' + today.tmin + '°</span></div></div><div class="wx-facts">' +
      '<div><span>الرطوبة</span><b class="mono">' + cur.rh + '%</b></div><div><span>الرياح</span><b><span class="wx-arr" style="transform:rotate(' + (cur.dir + 90) + 'deg)">' + icon('arrow') + '</span> <span class="mono">' + cur.wind + '</span> كم/س</b><small>من ' + esc(compassAr(cur.dir)) + ' · هبّات ' + cur.gust + '</small></div>' +
      '<div><span>الأمطار اليوم</span><b class="mono">' + (today.rain || 0).toFixed(1) + ' مم</b><small>احتمال ' + today.rainP + '%</small></div><div><span>الغبار</span><b class="mono">' + (cur.dust == null ? '—' : Math.round(cur.dust)) + '</b><small>ميكروجرام/م³</small></div></div></div>' +
      '<div class="card wx-today" style="--c:' + ti.color + '"><span class="kick">طقس الأمن الحيوي اليوم</span><h2><span class="wx-badge">' + esc(ti.label) + '</span></h2>' +
      (ti.neg.length ? '<ul class="wx-why">' + ti.neg.map(function (n) { return '<li class="neg">' + icon('alert') + esc(n) + '</li>'; }).join('') + '</ul>' : '') + (ti.pos.length ? '<ul class="wx-why">' + ti.pos.map(function (n) { return '<li class="pos">' + icon('check') + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
      (ti.acts.length ? '<div class="wx-acts"><b>المطلوب اليوم</b><ol>' + ti.acts.slice(0, 5).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol></div>' : '<p class="small muted">لا توجد إجراءات خاصة بالطقس اليوم. استمر في البرنامج المعتاد.</p>') + '</div></div>';
    // توقعات 7 أيام
    secW += '<div class="card"><div class="card-head"><div><span class="kick">توقعات 7 أيام · قطاع ' + esc(S.wxSec) + '</span><h2>' + icon('calendar') + ' تأثير الطقس على الأمن الحيوي يوماً بيوم</h2></div><div class="rlegend"><span><i style="background:var(--r-low)"></i>إيجابي</span><span><i style="background:var(--r-mid)"></i>انتبه</span><span><i style="background:var(--r-high)"></i>سلبي</span><span><i style="background:var(--r-crit)"></i>خطر</span></div></div><div class="wx-days">' +
      W.days.map(function (x, i) {
        var c = WX_CODE(x.code), m = imp[i], dt = new Date(x.date + 'T12:00:00');
        return '<button type="button" class="wx-day" data-wxday="' + i + '" style="--c:' + m.color + '"><b>' + (i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAYS_AR[dt.getDay()]) + '</b><small>' + dt.getDate() + ' ' + MONTHS3(dt.getMonth()) + '</small><span class="wx-emo">' + c[1] + '</span><span class="mono wx-t">' + x.tmax + '° <i>' + x.tmin + '°</i></span>' +
          '<span class="wx-l"><span class="wx-arr sm" style="transform:rotate(' + (x.dir + 90) + 'deg)">' + icon('arrow') + '</span><span class="mono">' + x.wind + '</span></span><span class="wx-l">💧 <span class="mono">' + (x.rain >= 0.1 ? x.rain.toFixed(1) + ' مم' : x.rainP + '%') + '</span></span>' + (x.dust != null ? '<span class="wx-l">🌫 <span class="mono">' + Math.round(x.dust) + '</span></span>' : '') + '<span class="wx-badge">' + esc(m.label) + '</span></button>';
      }).join('') + '</div><div id="wxDayBox" class="wx-daybox"></div></div>';
    // اتجاه الريح والمحطات المعرضة
    secW += '<div class="card"><div class="card-head"><div><span class="kick">الرياح الآن من ' + esc(compassAr(cur.dir)) + ' بسرعة ' + cur.wind + ' كم/س · نطاق 10 كم وزاوية 60°</span><h2>' + icon('wind') + ' المحطات الواقعة في اتجاه الريح</h2></div><span class="sub">عند الاشتباه في مرض بمحطة، هذه المحطات أول من يتأثر بالهواء القادم منها</span></div>' +
      '<div class="wx-dw"><div class="wx-dwmap" id="wxMap" dir="ltr"></div><div class="list">' + (dwn.length ? dwn.slice(0, 10).map(function (r) { return '<button type="button" class="li wx-dwrow" data-wxsite="' + esc(r.s.id) + '"><span class="av">' + icon('wind') + '</span><div class="t"><b>' + esc(shortSite(r.s.name)) + '</b><span>الهواء منها يتجه إلى: ' + esc(r.hit.map(function (h) { return shortSite(h.s.name) + ' (' + kmTxt(h.km) + ' كم)'; }).join('، ')) + '</span></div><div class="meta"><b class="mono">' + r.hit.length + '</b><span>محطة</span></div></button>'; }).join('') : '<p class="empty">' + icon('check') + 'لا توجد محطات متقاربة في اتجاه الريح الحالي</p>') + '</div></div></div>';
    // الآفات: بطاقات الآن
    secP += '<div class="card"><div class="card-head"><div><span class="kick">من متوسط حرارة ورطوبة الأيام السبعة القادمة · 0 إلى 100</span><h2>' + icon('alert') + ' نشاط الآفات الناقلة للأمراض الآن</h2></div><div class="rlegend"><span><i class="rt-low"></i>منخفض</span><span><i class="rt-mid"></i>متوسط</span><span><i class="rt-high"></i>مرتفع</span><span><i class="rt-crit"></i>حرج</span></div></div><div class="ps-grid">' +
      pests.map(function (o) {
        var p = o.p, c = LVL_C[o.lvl.k], mx = Math.max.apply(null, o.daily.concat([1]));
        return '<div class="ps-card" style="--c:' + c + '"><div class="ps-h"><span class="ps-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + p.ico + '"/></svg></span><div><b>' + esc(p.name) + '</b><small dir="ltr">' + esc(p.sci) + '</small></div><span class="tr-sc" style="--c:' + c + '"><b class="mono">' + o.now + '</b>' + esc(o.lvl.label) + '</span></div>' +
          '<div class="ps-spark">' + o.daily.map(function (v, i) { return '<i style="height:' + Math.max(6, v / 100 * 100) + '%;background:' + LVL_C[pestLvl(v).k] + '" title="' + (i === 0 ? 'اليوم' : 'بعد ' + i + ' يوم') + ': ' + v + '"></i>'; }).join('') + '</div>' +
          '<p class="ps-dz"><b>ينقل:</b> ' + esc(p.dz) + '</p><p class="ps-pk"><b>ذروة النشاط:</b> ' + (o.peak.length ? esc(o.peak.map(MONTHS3).join('، ')) : 'لا ذروة واضحة') + '</p>' +
          (o.now >= 40 ? '<ul class="ps-act">' + p.act.slice(0, o.now >= 60 ? 3 : 2).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">المتابعة الروتينية كافية حالياً</p>') + '</div>';
      }).join('') + '</div></div>';
    // التقويم السنوي
    secP += '<div class="card"><div class="card-head"><div><span class="kick">من المناخ الشهري لمنطقة القطاع · الشهر الحالي محدد</span><h2>' + icon('calendar') + ' تقويم نشاط الآفات خلال العام</h2></div><span class="sub">الأشهر الداكنة = أعلى احتمال خطورة، فخطط برامج المكافحة قبلها بشهر</span></div><div class="tbl bd-cal ps-cal"><table><thead><tr><th>الآفة</th>' + MONTHS.map(function (m, i) { return '<th class="' + (i === mNow ? 'now' : '') + '">' + m.slice(0, 3) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      PESTS.map(function (p) { var yr = pestYear(p); return '<tr><th>' + esc(p.name) + '</th>' + yr.map(function (v, i) { var l = pestLvl(v); return '<td class="' + (i === mNow ? 'now' : '') + '" style="background:color-mix(in srgb,' + LVL_C[l.k] + ' ' + Math.round(15 + v * 0.7) + '%,transparent)" title="' + MONTHS[i] + ': ' + v + ' (' + l.label + ')"><span class="mono">' + v + '</span></td>'; }).join('') + '</tr>'; }).join('') +
      '<tr class="ps-sum"><th>مؤشر الخطر العام</th>' + WX_CLIMO.map(function (c, i) { var v = Math.round(PESTS.reduce(function (a, p) { return a + pestYear(p)[i]; }, 0) / PESTS.length), l = pestLvl(v); return '<td class="' + (i === mNow ? 'now' : '') + '" style="background:color-mix(in srgb,' + LVL_C[l.k] + ' ' + Math.round(20 + v * 0.75) + '%,transparent)"><b class="mono">' + v + '</b></td>'; }).join('') + '</tr></tbody></table></div>' +
      '<p class="small muted">النموذج: لكل آفة مدى حرارة للنشاط ومدى مثالي وتفضيل للرطوبة من المراجع البيطرية، والقوارض يزيد ضغطها على العنابر مع البرد، والبعوض يزيد مع الأمطار. «الآن» يُحسب من توقعات الطقس الفعلية للأيام السبعة القادمة. يُفضَّل تأكيده ببطاقات عدّ الذباب ومحطات طُعم القوارض.</p></div>';
    // الإجهاد الحراري
    var thiD = W.days.map(function (x) { var hs = x.thiH || [], mx = hs.length ? Math.max.apply(null, hs) : wxTHI(x.tmax, Math.max(20, (x.rh || 40) - 15)), peak = hs.filter(function (v) { return v >= 79; }).length, from = hs.indexOf(Math.max.apply(null, hs.length ? hs : [0])); return { x: x, mx: Math.round(mx), lvl: thiLvl(mx), hrs: hs.filter(function (v) { return v >= 75; }).length, peak: peak, hs: hs }; });
    var t0 = thiD[0];
    secT += '<div class="wx-now"><div class="card wx-today" style="--c:' + LVL_C[t0.lvl.k] + '"><span class="kick">مؤشر الحرارة والرطوبة للدواجن (THI) · اليوم · قطاع ' + esc(S.wxSec) + '</span><h2><b class="mono thi-big">' + t0.mx + '</b> <span class="wx-badge">' + esc(t0.lvl.label) + '</span></h2><p class="small muted">' + (t0.hrs ? 'عدد الساعات فوق حد التنبيه (75): <b class="mono">' + t0.hrs + '</b> ساعة' + (t0.hs.length ? ' · من الساعة ' + t0.hs.indexOf(t0.hs.filter(function (v) { return v >= 75; })[0]) + ' إلى ' + (t0.hs.length - 1 - t0.hs.slice().reverse().indexOf(t0.hs.filter(function (v) { return v >= 75; }).pop())) : '') : 'لا ساعات فوق حد التنبيه اليوم') + '</p>' +
      '<div class="wx-acts"><b>الإجراءات للعنابر</b><ol>' + THI_ACT[t0.lvl.k].map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol></div></div>' +
      '<div class="card thi-calc"><span class="kick">قراءة داخل العنبر</span><h2>' + icon('clip') + ' احسب المؤشر لعنبر محدد</h2><p class="small muted">أدخل قراءة الترمومتر والهيجروميتر داخل العنبر لمعرفة حالته الآن.</p><div class="row" style="gap:10px"><div class="field grow"><label for="thiT">الحرارة °م</label><input id="thiT" type="number" inputmode="decimal" step="0.1" placeholder="32"></div><div class="field grow"><label for="thiH">الرطوبة %</label><input id="thiH" type="number" inputmode="decimal" placeholder="60"></div></div><div id="thiOut" class="thi-out"></div></div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">أعلى قيمة متوقعة في اليوم من الحرارة والرطوبة كل ساعة</span><h2>' + icon('calendar') + ' الإجهاد الحراري خلال 7 أيام</h2></div><div class="rlegend"><span><i class="rt-low"></i>آمن أقل من 75</span><span><i class="rt-mid"></i>تنبيه 75 إلى 78</span><span><i class="rt-high"></i>خطر 79 إلى 83</span><span><i class="rt-crit"></i>طوارئ 84 فأكثر</span></div></div><div class="thi-days">' +
      thiD.map(function (o, i) { var dt = new Date(o.x.date + 'T12:00:00'); return '<div class="thi-day" style="--c:' + LVL_C[o.lvl.k] + '"><b>' + (i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAYS_AR[dt.getDay()]) + '</b><span class="mono thi-v">' + o.mx + '</span><span class="wx-badge">' + esc(o.lvl.label) + '</span><div class="thi-hrs">' + (o.hs.length ? o.hs.map(function (v, h) { return '<i title="الساعة ' + h + ': ' + v + '" style="background:' + LVL_C[thiLvl(v).k] + ';opacity:' + (v >= 75 ? 1 : 0.35) + '"></i>'; }).join('') : '') + '</div><small>' + (o.hrs ? o.hrs + ' ساعة فوق 75' : 'بلا ساعات خطر') + '</small></div>'; }).join('') + '</div><p class="small muted">الشريط تحت كل يوم يمثل 24 ساعة من منتصف الليل. المؤشر محسوب من حرارة ورطوبة الهواء الخارجي، وداخل العنبر يختلف حسب التهوية والتبريد، لذلك استخدم الحاسبة أعلاه لقراءات العنابر الفعلية.</p></div>';
    // التقويم الموسمي
    var mm = new Date().getMonth(), done = S.wxDone || {}, tNow = seasonTasks(mm), tNext = seasonTasks((mm + 1) % 12);
    var tRow = function (t, m) { var key = new Date().getFullYear() + '-' + (m + 1) + '-' + t.i, ok = !!done[key]; return '<label class="st-row' + (ok ? ' done' : '') + '"><input type="checkbox" data-stk="' + key + '"' + (ok ? ' checked' : '') + '><div><b>' + esc(t.task) + '</b><small>' + esc(t.why) + '</small></div><span class="pill p-n">' + esc(t.who) + '</span></label>'; };
    var nDone = tNow.filter(function (t) { return done[new Date().getFullYear() + '-' + (mm + 1) + '-' + t.i]; }).length;
    secC += '<div class="card"><div class="card-head"><div><span class="kick">' + esc(MONTHS[mm]) + ' · أُنجز ' + nDone + ' من ' + tNow.length + '</span><h2>' + icon('check') + ' مهام الأمن الحيوي هذا الشهر</h2></div><div class="row" style="gap:6px">' + (can('notices') || isAdmin() ? '<button class="btn sm primary" type="button" id="stSend">' + icon('mega') + ' إرسالها كقرار للبوابات</button>' : '') + '<a class="btn sm wa" target="_blank" rel="noopener" id="stWa">' + icon('wa') + ' واتساب</a></div></div>' +
      '<div class="st-bar"><i style="width:' + (tNow.length ? Math.round(nDone / tNow.length * 100) : 0) + '%"></i></div><div class="st-list">' + tNow.map(function (t) { return tRow(t, mm); }).join('') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">استعد مبكراً</span><h2>' + icon('calendar') + ' مهام الشهر القادم · ' + esc(MONTHS[(mm + 1) % 12]) + '</h2></div></div><div class="st-list">' + tNext.map(function (t) { return '<div class="st-row next"><div><b>' + esc(t.task) + '</b><small>' + esc(t.why) + '</small></div><span class="pill p-n">' + esc(t.who) + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">نظرة على العام</span><h2>' + icon('calendar') + ' التقويم الموسمي الكامل</h2></div></div><div class="st-year">' + MONTHS.map(function (m, i) { var L1 = seasonTasks(i); return '<div class="st-m' + (i === mm ? ' now' : '') + '"><b>' + m + '</b><span class="mono">' + L1.length + ' مهام</span><ul>' + L1.filter(function (t) { return t.months.length < 12; }).map(function (t) { return '<li>' + esc(t.task.split(':')[0]) + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div></div>';
    html += '<div id="wxTabBody">' + ({ wx: secW, pest: secP, thi: secT, cal: secC })[S.wxTab] + '</div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-wxsec]').forEach(function (x) { x.onclick = function () { S.wxSec = x.dataset.wxsec; drawWx(b, w); }; });
    $('wxRef').onclick = function () { S.wx = null; viewWx(); };
    out.querySelectorAll('[data-wxtab]').forEach(function (x) { x.onclick = function () { S.wxTab = x.dataset.wxtab; drawWx(b, w); }; });
    if (S.wxTab === 'thi') {
      var calc = function () { var t = parseFloat($('thiT').value), h = parseFloat($('thiH').value), o = $('thiOut'); if (isNaN(t) || isNaN(h)) { o.innerHTML = ''; return; } var v = Math.round(wxTHI(t, h)), l = thiLvl(v); o.innerHTML = '<div class="thi-res" style="--c:' + LVL_C[l.k] + '"><b class="mono">' + v + '</b><span class="wx-badge">' + esc(l.label) + '</span></div><ol>' + THI_ACT[l.k].map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>'; };
      $('thiT').oninput = $('thiH').oninput = calc;
    }
    if (S.wxTab === 'cal') {
      var txt = '📋 مهام الأمن الحيوي لشهر ' + MONTHS[mm] + ' · قطاع ' + S.wxSec + '\n' + tNow.map(function (t, i) { return (i + 1) + '. ' + t.task + ' (' + t.who + ')'; }).join('\n');
      $('stWa').href = waLink(txt);
      out.querySelectorAll('[data-stk]').forEach(function (c) { c.onchange = function () { S.wxDone = S.wxDone || {}; if (c.checked) S.wxDone[c.dataset.stk] = Date.now(); else delete S.wxDone[c.dataset.stk]; KV.set('wxDone', S.wxDone); drawWx(b, w); }; });
      if ($('stSend')) $('stSend').onclick = function () { var btn = this; btn.disabled = true; remote('sendNotice', [S.session.pin, { target: 'SECTOR:' + S.wxSec, level: 'عادي', title: 'مهام الأمن الحيوي لشهر ' + MONTHS[mm], body: tNow.map(function (t, i) { return (i + 1) + '. ' + t.task + ' (' + t.who + ')'; }).join('\n') }]).then(function () { toast('أُرسلت المهام كقرار لبوابات قطاع ' + S.wxSec + '، ويظهر لك من استلمها في القرارات'); btn.disabled = false; }).catch(function (e) { btn.disabled = false; toast(errText(e)); }); };
    }
    if (S.wxTab !== 'wx') { if (S.wxMap) { try { S.wxMap.remove(); } catch (e) {} S.wxMap = null; } return; }
    var showDay = function (i) {
      var m = imp[i], x = W.days[i], box = $('wxDayBox'); out.querySelectorAll('[data-wxday]').forEach(function (e) { e.classList.toggle('on', +e.dataset.wxday === i); });
      box.innerHTML = '<div class="wx-today" style="--c:' + m.color + '"><h3>' + (i === 0 ? 'اليوم' : DAYS_AR[new Date(x.date + 'T12:00:00').getDay()]) + ': <span class="wx-badge">' + esc(m.label) + '</span> <small class="muted">الرياح من ' + esc(compassAr(x.dir)) + ' حتى ' + x.gust + ' كم/س' + (x.rh != null ? ' · رطوبة ' + x.rh + '%' : '') + '</small></h3>' +
        (m.neg.length || m.pos.length ? '<ul class="wx-why">' + m.neg.map(function (n) { return '<li class="neg">' + icon('alert') + esc(n) + '</li>'; }).join('') + m.pos.map(function (n) { return '<li class="pos">' + icon('check') + esc(n) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">طقس عادي بلا تأثير خاص</p>') +
        (m.acts.length ? '<div class="wx-acts"><b>الإجراءات</b><ol>' + m.acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol></div>' : '') + '</div>';
    };
    out.querySelectorAll('[data-wxday]').forEach(function (e) { e.onclick = function () { showDay(+e.dataset.wxday); }; });
    showDay(0);
    wxMapInit(sec, cur, dwn);
  }
  function wxMapInit(sec, cur, dwn) {
    if (S.wxMap) { try { S.wxMap.remove(); } catch (e) {} S.wxMap = null; }
    var box = $('wxMap'); if (!box) return;
    birdLeaflet().then(function () {
      box = $('wxMap'); if (!box) return;
      var map = L.map(box, { zoomSnap: 0.25, scrollWheelZoom: false }); S.wxMap = map;
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'صور: Esri' }).addTo(map);
      var to = (cur.dir + 180) % 360, sel = null, cone = L.layerGroup().addTo(map), mk = {};
      var draw = function (id) {
        cone.clearLayers(); var a = sec.sites.filter(function (x) { return x.id === id; })[0]; if (!a) return; sel = id;
        var pts = [[+a.lat, +a.lng]]; for (var g = -30; g <= 30; g += 5) { var r = (to + g) * Math.PI / 180; pts.push([+a.lat + Math.cos(r) * 10 / 110.57, +a.lng + Math.sin(r) * 10 / (111.32 * Math.cos(a.lat * Math.PI / 180))]); }
        L.polygon(pts, { color: '#38a3f1', weight: 1.5, fillColor: '#38a3f1', fillOpacity: 0.22, interactive: false }).addTo(cone);
        var hit = (dwn.filter(function (r) { return r.s.id === id; })[0] || { hit: [] }).hit;
        hit.forEach(function (h) { L.polyline([[+a.lat, +a.lng], [+h.s.lat, +h.s.lng]], { color: '#ff8a3d', weight: 2.5, dashArray: '3 7', interactive: false }).addTo(cone); });
        Object.keys(mk).forEach(function (k) { var el = mk[k].getElement(); if (el) { el.classList.toggle('cur', k === id); el.classList.toggle('hit', hit.some(function (h) { return h.s.id === k; })); } });
      };
      sec.sites.forEach(function (x) {
        var m = L.marker([x.lat, x.lng], { icon: L.divIcon({ className: 'bm-site wx-site', html: '<span class="bm-dot" style="--c:#2b7bd6"><b>' + esc(String(shortSite(x.name)).replace(/[^\d]/g, '') || '•') + '</b></span><span class="bm-lbl">' + esc(shortSite(x.name)) + '</span>', iconSize: [0, 0] }) }).addTo(map);
        m.on('click', function () { draw(x.id); }); mk[x.id] = m;
      });
      var wc = L.control({ position: 'topright' }); wc.onAdd = function () { var el = L.DomUtil.create('div', 'bm-wind'); el.innerHTML = '<span class="bm-arrow" style="transform:rotate(' + (cur.dir + 90) + 'deg)">' + icon('arrow') + '</span><div><b>الرياح الآن</b><span>من ' + esc(compassAr(cur.dir)) + ' · ' + cur.wind + ' كم/س</span></div>'; return el; }; wc.addTo(map);
      map.fitBounds(L.latLngBounds(sec.sites.map(function (x) { return [x.lat, x.lng]; })).pad(0.25), { maxZoom: 14 });
      box.classList.toggle('bm-far', map.getZoom() < 12); map.on('zoomend', function () { box.classList.toggle('bm-far', map.getZoom() < 12); });
      draw((dwn[0] && dwn[0].s.id) || sec.sites[0].id);
      document.querySelectorAll('[data-wxsite]').forEach(function (e) { e.onclick = function () { draw(e.dataset.wxsite); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
      setTimeout(function () { if (S.wxMap === map) map.invalidateSize(); }, 250);
    }).catch(function () { box.innerHTML = '<p class="empty">' + icon('wifioff') + 'الخريطة تحتاج إنترنت</p>'; });
  }
  function viewBirds() {
    $('main').innerHTML = '<section class="view bird-view"><div id="v5Out">' + (S.birds ? '' : v5Spin()) + '</div></section>';
    if (S.birds) drawBirds(S.birds);
    v5Load('birds', [], function (d) { S.birds = d; if (S.route.split('/')[0] === 'birds') drawBirds(d); }, 'رادار الطيور');
  }
  function birdLive(d) { return d.wx.live && !/محاكاة/.test(d.wx.source || ''); }
  /** خريطة مصر/منطقة المواقع: الحدود، النيل، البحيرات، مسارات الهجرة باتجاهها الحالي، المواقع بمستوى الخطر، والأسراب المتوقعة */
  function birdMap(d, mode, opt) {
    opt = opt || {};
    var B = mode === 'egypt' ? { s: 21.7, n: 31.95, w: 24.6, e: 37.0 } : mode === 'region' ? { s: 28.95, n: 31.72, w: 29.05, e: 32.65 } : birdFit(d.sites, opt.site);
    var k = Math.cos((B.s + B.n) / 2 * Math.PI / 180), W = 1000, H = Math.round(W * (B.n - B.s) / ((B.e - B.w) * k));
    var P = function (lat, lng) { return [(lng - B.w) / (B.e - B.w) * W, (B.n - lat) / (B.n - B.s) * H]; };
    var path = function (pts, close) { return pts.map(function (p, i) { var q = P(p[0], p[1]); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('') + (close ? 'Z' : ''); };
    var big = mode === 'egypt', near = mode === 'near', spring = d.season.k === 'spring', o = '';
    o += '<defs><linearGradient id="bdSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--map-sea-1)"/><stop offset="1" stop-color="var(--map-sea-2)"/></linearGradient>' +
      d.flyways.map(function (f) { return '<marker id="mk' + f.id + '" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + f.color + '"/></marker>'; }).join('') +
      '<marker id="mkFl" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>';
    o += '<rect width="' + W + '" height="' + H + '" fill="var(--map-land-2)"/>';
    // البحر المتوسط والأحمر
    var med = [[33.5, 22]].concat(BIO_EGYPT.slice(0, 13)).concat([[31.3, 35.5], [33.5, 38]]);
    o += '<path d="' + path(med, true) + '" fill="url(#bdSea)"/>';
    o += '<path d="' + path([[29.97, 32.55], [29.6, 32.35], [29.11, 32.65], [28.36, 33.08], [27.26, 33.81], [26.75, 33.94], [26.1, 34.28], [25.07, 34.9], [23.95, 35.48], [22.2, 36.6], [21.0, 37.2], [21.0, 39.5], [24.0, 37.7], [26.0, 36.5], [27.9, 35.25], [28.4, 34.85], [29.5, 34.95], [29.0, 34.67], [28.5, 34.51], [27.91, 34.33], [27.73, 34.25], [28.24, 33.6], [29.05, 33.1], [29.6, 32.72]], true) + '" fill="url(#bdSea)"/>';
    o += '<path d="' + path(BIO_EGYPT, true) + '" fill="var(--map-land)" stroke="var(--map-border)" stroke-width="1.5"/>';
    // النيل والقناة
    [BIO_NILE, BIO_NILE_ROSETTA, BIO_NILE_DAMIETTA].forEach(function (r) { o += '<path d="' + path(r) + '" fill="none" stroke="var(--map-water)" stroke-width="' + (big ? 2.2 : 3.4) + '" stroke-linejoin="round" stroke-linecap="round"/>'; });
    o += '<path d="' + path(BIO_SUEZ) + '" fill="none" stroke="var(--map-water)" stroke-width="1.6" stroke-dasharray="4 3"/>';
    // البحيرات وتجمعات البط
    d.wetlands.forEach(function (w) {
      var q = P(w.lat, w.lng); if (q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) return;
      var r = (big ? 4 : 8) + w.intensity / 100 * (big ? 8 : 18);
      o += '<g class="bd-wl"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="var(--map-water)" fill-opacity=".28" stroke="var(--map-water)" stroke-width="1.2"/><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (big ? 2.5 : 4) + '" fill="var(--map-water)"/>' +
        (big && w.w < 0.95 ? '' : '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + r + (big ? 11 : 15)).toFixed(1) + '" class="bd-lbl water" text-anchor="middle">' + esc(w.name.replace('بحيرات ', '').replace('بحيرة ', '')) + '</text>') + '<title>' + esc(w.name) + ' · تجمع الطيور المائية ' + w.intensity + '%</title></g>';
    });
    // المدن
    BIO_TOWNS.forEach(function (t) { var q = P(t[1], t[2]); if (q[0] < 10 || q[0] > W - 10 || q[1] < 10 || q[1] > H - 10) return; o += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="2.6" fill="var(--map-ink-2)"/><text x="' + (q[0] + 6).toFixed(1) + '" y="' + (q[1] - 5).toFixed(1) + '" class="bd-lbl town" text-anchor="end">' + esc(t[0]) + '</text>'; });
    // مسارات الهجرة: شريط عريض (جبهة الهجرة) + خط متحرك في اتجاه الطيران الحالي
    d.flyways.forEach(function (f) {
      var pts = spring ? f.path.slice().reverse() : f.path, a = Math.max(0.15, f.intensity / 100), dd = path(pts);
      o += '<path d="' + dd + '" fill="none" stroke="' + f.color + '" stroke-opacity="' + (0.1 + a * 0.16).toFixed(2) + '" stroke-width="' + (big ? 18 : 42) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      o += '<path class="bd-flow" d="' + dd + '" fill="none" stroke="' + f.color + '" stroke-width="' + (big ? 2.4 : 3.2) + '" stroke-dasharray="10 12" stroke-opacity="' + (0.45 + a * 0.55).toFixed(2) + '" marker-mid="url(#mk' + f.id + ')" marker-end="url(#mk' + f.id + ')" style="animation-duration:' + (5 - a * 3).toFixed(1) + 's"><title>' + esc(f.name) + ' · شدة الهجرة الآن ' + f.intensity + '%</title></path>';
    });
    // المواقع المرسومة
    var sites = d.sites, sel = opt.site;
    // الأسراب المتوقعة باتجاه المواقع
    var seen = {};
    sites.filter(function (x) { return x.flocks.length && x.score >= 30; }).slice(0, big ? 6 : 10).forEach(function (x) {
      var f = x.flocks[0], key = f.from + '|' + x.sector; if (seen[key] && x.id !== sel) return; seen[key] = 1;
      var fl = f.lat, fg = f.lng; if (f.d < 28) { var rr = f.track * Math.PI / 180; fl = x.lat - Math.cos(rr) * 28 / 111; fg = x.lng - Math.sin(rr) * 28 / (111 * Math.cos(x.lat * Math.PI / 180)); }
      var a = P(fl, fg), b = P(x.lat, x.lng), mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.18, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.18;
      var dd = 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
      o += '<g class="bd-flock"><path d="' + dd + '" fill="none" stroke="' + f.color + '" stroke-width="' + (big ? 1.8 : 2.6) + '" stroke-dasharray="2 6" stroke-linecap="round" marker-end="url(#mkFl)"/>' +
        '<g><path d="M-7 -3 L0 2 L7 -3" fill="none" stroke="' + f.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M-4 5 L1 9 L6 5" fill="none" stroke="' + f.color + '" stroke-width="1.8" stroke-linecap="round" opacity=".7"/><animateMotion dur="' + Math.max(3, Math.min(9, f.eta * 4)).toFixed(1) + 's" repeatCount="indefinite" rotate="auto" path="' + dd + '"/></g>' +
        (!near ? '' : '<text x="' + a[0].toFixed(1) + '" y="' + (a[1] - 12).toFixed(1) + '" class="bd-lbl flock" text-anchor="middle" fill="' + f.color + '">سرب ~' + BIO_eta(f.eta) + '</text>') + '<title>' + esc(f.from + ' ← ' + x.name + ' · ' + f.d + ' كم · الوصول ~' + BIO_eta(f.eta) + '') + '</title></g>';
    });
    // المشاهدات
    (d.sightings || []).forEach(function (s) { if (s.lat == null) return; var q = P(s.lat, s.lng); o += '<g class="bd-obs"><path d="M' + q[0].toFixed(1) + ' ' + (q[1] - 7).toFixed(1) + 'l6 7-6 7-6-7z" fill="' + (s.source === 'eBird' ? '#7c3aed' : '#ea580c') + '" stroke="#fff" stroke-width="1.4"/><title>' + esc(s.species + ' · ' + s.count + ' · ' + s.source + ' · ' + ago(s.time)) + '</title></g>'; });
    // المواقع
    var secs = {};
    sites.slice().reverse().forEach(function (x) {
      var q = P(x.lat, x.lng), c = LVL_C[x.lvl.k], r = big ? 4.5 : 7.5;
      (secs[x.sector] = secs[x.sector] || []).push(q);
      if (near && (!/محطة/.test(x.name) || d.sites.indexOf(x) < 3 || x.id === sel)) o += '<text x="' + (q[0] + 13).toFixed(1) + '" y="' + (q[1] + 5).toFixed(1) + '" class="bd-lbl site" text-anchor="end">' + esc(shortSite(x.name).replace(/\s*\(.*$/, '')) + '</text>';
      if (x.lvl.k === 'high' || x.lvl.k === 'crit') o += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="2"><animate attributeName="r" values="' + r + ';' + (r * 3.4) + '" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2s" repeatCount="indefinite"/></circle>';
      o += '<circle class="bd-site' + (x.id === sel ? ' sel' : '') + '" data-site="' + esc(x.id) + '" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (x.id === sel ? r + 3 : r) + '" fill="' + c + '" stroke="#fff" stroke-width="' + (big ? 1.4 : 2.2) + '"><title>' + esc(x.name + ' · خطر ' + x.score + ' (' + x.lvl.label + ')') + '</title></circle>';
    });
    // أسماء القطاعات والرياح فوقها
    Object.keys(secs).forEach(function (sec) {
      var L = secs[sec], cx = L.reduce(function (a, q) { return a + q[0]; }, 0) / L.length, cy = Math.min.apply(null, L.map(function (q) { return q[1]; }));
            o += '<g class="bd-sec"><rect x="' + (cx - 62).toFixed(1) + '" y="' + (cy - (big ? 30 : near ? 70 : 44)).toFixed(1) + '" width="124" height="' + (big ? 20 : 26) + '" rx="8" class="bd-tag"/><text x="' + cx.toFixed(1) + '" y="' + (cy - (big ? 16 : near ? 52 : 26)).toFixed(1) + '" text-anchor="middle" class="bd-lbl sec">قطاع ' + esc(sec) + '</text></g>';
    });
    // الرياح على ارتفاع الطيران (ركن الخريطة)
    var tw = sites[0] && sites[0].wind;
    if (tw) { var rad = tw.toward * Math.PI / 180, cx0 = W - 214, cy0 = 70; o += '<g class="bd-wind"><rect x="' + (W - 264) + '" y="16" width="250" height="108" rx="12" class="bd-tag"/><circle cx="' + cx0 + '" cy="' + cy0 + '" r="38" fill="none" stroke="var(--map-border)" stroke-dasharray="3 4"/><line x1="' + (cx0 - Math.sin(rad) * 30).toFixed(1) + '" y1="' + (cy0 + Math.cos(rad) * 30).toFixed(1) + '" x2="' + (cx0 + Math.sin(rad) * 30).toFixed(1) + '" y2="' + (cy0 - Math.cos(rad) * 30).toFixed(1) + '" stroke="var(--map-water)" stroke-width="5" stroke-linecap="round" marker-end="url(#mkFl)"/><text x="' + (W - 164) + '" y="56" class="bd-lbl sec" text-anchor="end">الرياح على 1500 م</text><text x="' + (W - 164) + '" y="82" class="bd-lbl" text-anchor="end">' + esc(tw.label) + '</text><text x="' + (W - 164) + '" y="106" class="bd-lbl wind" text-anchor="end">' + tw.spd + ' كم/س · ' + (tw.live ? 'حية' : 'تقدير') + '</text></g>'; }
    // مقياس المسافة واتجاه الشمال
    var spanKm = (B.e - B.w) * k * 111.32, km = big ? 200 : !near ? 50 : [2, 5, 10, 20, 50].filter(function (v) { return v <= spanKm / 4; }).pop() || 1, px = km / ((B.e - B.w) * k * 111.32) * W;
    o += '<g class="bd-scale"><rect x="18" y="' + (H - 46) + '" width="' + (px + 24).toFixed(1) + '" height="34" rx="8" class="bd-tag"/><line x1="30" x2="' + (30 + px).toFixed(1) + '" y1="' + (H - 22) + '" y2="' + (H - 22) + '" stroke="var(--map-ink)" stroke-width="3"/><text x="' + (30 + px / 2).toFixed(1) + '" y="' + (H - 28) + '" text-anchor="middle" class="bd-lbl">' + km + ' كم</text></g>';
    o += '<g transform="translate(40,44)"><circle r="22" class="bd-tag"/><path d="M0 -15 L7 6 L0 2 L-7 6Z" fill="var(--red)"/><text y="16" text-anchor="middle" class="bd-lbl" style="font-size:12px">ش</text></g>';
    return '<svg class="bd-svg" viewBox="0 0 ' + W + ' ' + H + '" dir="ltr" role="img" aria-label="خريطة مسارات الطيور المهاجرة ومواقع الشركة">' + o + '</svg>';
  }
  /** حدود الخريطة القريبة من الإحداثيات الفعلية للمواقع (أو قطاع الموقع المختار) */
  function birdFit(sites, selId) {
    var L0 = (sites || []).filter(function (x) { return x.lat != null && x.lng != null && isFinite(x.lat) && isFinite(x.lng); }), sel = selId && L0.filter(function (x) { return x.id === selId; })[0];
    if (sel) L0 = L0.filter(function (x) { return x.sector === sel.sector; });
    if (!L0.length) return { s: 29.38, n: 30.72, w: 29.95, e: 31.42 };
    var la = L0.map(function (x) { return +x.lat; }), lo = L0.map(function (x) { return +x.lng; });
    var s = Math.min.apply(null, la), n = Math.max.apply(null, la), w = Math.min.apply(null, lo), e = Math.max.apply(null, lo);
    var py = Math.max((n - s) * 0.22, 0.05), px = Math.max((e - w) * 0.22, 0.06), cy = (s + n) / 2, cx = (w + e) / 2;
    s -= py; n += py; w -= px; e += px;
    var k = Math.cos(cy * Math.PI / 180), hy = (n - s) / 2, hx = (e - w) / 2;
    // نسبة عرض إلى ارتفاع مريحة للعرض (بين 1.1 و 1.9)
    if (hx * k / hy < 1.1) hx = hy * 1.1 / k; else if (hx * k / hy > 1.9) hy = hx * k / 1.9;
    return { s: cy - hy, n: cy + hy, w: cx - hx, e: cx + hx };
  }
  /* ---------- الخريطة التفاعلية لرادار الطيور (Leaflet + صور الأقمار الصناعية) ---------- */
  function birdLeaflet() {
    if (window.L && L.map) return Promise.resolve();
    if (!document.querySelector('link[data-leaflet]')) { var c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; c.setAttribute('data-leaflet', '1'); document.head.appendChild(c); }
    return loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  }
  /* ---------- أنواع الطيور المتوقعة على كل مسار + بُعد المحطات عن المسارات ---------- */
  // m = أشهر المرور (1-12)، r = خطر نقل إنفلونزا الطيور (3 عالٍ، 2 متوسط، 1 منخفض)
  var BIRD_SP = {
    NILE: [['البط البري (الخضاري)', 'Anas platyrhynchos', [10, 11, 12, 1, 2, 3], 3], ['الشرشير الشتوي', 'Anas crecca', [10, 11, 12, 1, 2, 3], 3], ['دجاجة الماء والغرة', 'Fulica atra', [10, 11, 12, 1, 2, 3], 2], ['البلشون الرمادي', 'Ardea cinerea', [9, 10, 11, 12, 1, 2, 3], 2], ['أبو قردان (البلشون الأبيض)', 'Bubulcus ibis', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 2], ['الطيور الخواضة (الطيطوي والدريجة)', 'Calidris / Tringa', [3, 4, 5, 8, 9, 10], 2], ['القمري (اليمام المهاجر)', 'Streptopelia turtur', [4, 5, 8, 9], 2], ['السنونو والعصفوريات', 'Hirundo rustica', [3, 4, 5, 9, 10], 1]],
    OASIS: [['السمان', 'Coturnix coturnix', [3, 4, 9, 10], 2], ['القمري (اليمام المهاجر)', 'Streptopelia turtur', [4, 5, 8, 9], 2], ['الشرشير الصيفي (متجه لقارون والريان)', 'Spatula querquedula', [2, 3, 4, 8, 9, 10], 3], ['البط أبو مجرفة', 'Spatula clypeata', [10, 11, 12, 1, 2, 3], 3], ['الحدأة السوداء', 'Milvus migrans', [3, 4, 9, 10], 2], ['البلشون الليلي', 'Nycticorax nycticorax', [4, 5, 8, 9, 10], 2], ['الهدهد', 'Upupa epops', [3, 4, 9, 10], 1], ['الذعرة الصفراء والعصفوريات', 'Motacilla flava', [3, 4, 9, 10], 1]],
    REDSEA: [['اللقلق الأبيض', 'Ciconia ciconia', [3, 4, 8, 9], 2], ['البجع الأبيض', 'Pelecanus onocrotalus', [3, 4, 9, 10], 2], ['عقاب السهوب', 'Aquila nipalensis', [2, 3, 10, 11], 1], ['صقر العسل', 'Pernis apivorus', [5, 9], 1], ['الحدأة السوداء', 'Milvus migrans', [3, 4, 9, 10], 2]],
    MED: [['البط البري (الخضاري)', 'Anas platyrhynchos', [10, 11, 12, 1, 2, 3], 3], ['الشرشير الشتوي', 'Anas crecca', [10, 11, 12, 1, 2, 3], 3], ['البط أبو مجرفة', 'Spatula clypeata', [10, 11, 12, 1, 2, 3], 3], ['البط الحمراوي (أبو فروة)', 'Aythya ferina', [11, 12, 1, 2], 3], ['النوارس', 'Larus / Chroicocephalus', [10, 11, 12, 1, 2, 3], 3], ['الغرة', 'Fulica atra', [10, 11, 12, 1, 2, 3], 2]]
  };
  var SP_RISK = { 3: ['عالٍ', 'p-bad'], 2: ['متوسط', 'p-warn'], 1: ['منخفض', 'p-ok'] };
  function birdSpecies(fid, mNow) { return (BIRD_SP[fid] || []).map(function (a) { return { name: a[0], sci: a[1], months: a[2], risk: a[3], now: a[2].indexOf(mNow + 1) >= 0 }; }).sort(function (a, b) { return (b.now - a.now) || (b.risk - a.risk); }); }
  /** أقرب نقطة على المسار للمحطة والمسافة بالكيلومتر */
  function birdNear(lat, lng, path) {
    var k = Math.cos(lat * Math.PI / 180), X = function (p) { return [(p[1] - lng) * k * 111.32, (p[0] - lat) * 110.57]; }, best = null;
    for (var i = 0; i < path.length - 1; i++) {
      var a = X(path[i]), b = X(path[i + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0;
      var px = a[0] + t * dx, py = a[1] + t * dy, dd = Math.sqrt(px * px + py * py);
      if (!best || dd < best.km) best = { km: dd, lat: lat + py / 110.57, lng: lng + px / (k * 111.32) };
    }
    return best;
  }
  function BIO_kmLL(a1, o1, a2, o2) { var k = Math.cos((a1 + a2) / 2 * Math.PI / 180), dx = (o2 - o1) * k * 111.32, dy = (a2 - a1) * 110.57; return Math.sqrt(dx * dx + dy * dy); }
  function birdDists(d, x) { return d.flyways.map(function (f) { var n = birdNear(+x.lat, +x.lng, f.path); return { f: f, km: n.km, lat: n.lat, lng: n.lng }; }).sort(function (a, b) { return a.km - b.km; }); }
  function kmTxt(v) { return v < 10 ? v.toFixed(1) : Math.round(v).toString(); }
  function kmCls(v) { return v < 10 ? 'kd-1' : v < 25 ? 'kd-2' : v < 50 ? 'kd-3' : 'kd-4'; }
  function kmLbl(v) { return v < 10 ? 'على خط السير' : v < 25 ? 'قريبة جداً' : v < 50 ? 'قريبة' : 'بعيدة'; }
  function birdSpeciesCards(d) {
    var mNow = new Date(d.now).getMonth(), sec = S.bSector && S.bSector !== '*' ? S.bSector : null, ss = d.sites.filter(function (x) { return x.lat != null && (!sec || x.sector === sec); });
    var fl = d.flyways.map(function (f) { var ds = ss.map(function (x) { return birdNear(+x.lat, +x.lng, f.path).km; }); return { f: f, min: ds.length ? Math.min.apply(null, ds) : 9999 }; }).sort(function (a, b) { return a.min - b.min; });
    return '<div class="card"><div class="card-head"><div><span class="kick">' + esc(d.season.label) + ' · مرتبة من الأقرب ' + (sec ? 'لقطاع ' + esc(sec) : 'للمواقع') + '</span><h2>' + icon('bird') + ' أنواع الطيور المتوقعة على كل مسار</h2></div><span class="sub">«الآن» = يمر هذا الشهر · الخطر = احتمال نقل إنفلونزا الطيور</span></div><div class="sp-grid">' +
      fl.map(function (o) {
        var f = o.f, sp = birdSpecies(f.id, mNow);
        return '<div class="sp-card" style="--c:' + f.color + '"><div class="sp-h"><i></i><div><b>' + esc(f.name) + '</b><span>شدة الهجرة الآن <b class="mono">' + f.intensity + '%</b> · أقرب محطة على بُعد <b class="mono">' + kmTxt(o.min) + ' كم</b></span></div></div><ul>' +
          sp.map(function (b) { return '<li class="' + (b.now ? 'now' : '') + '"><div><b>' + esc(b.name) + '</b><small dir="ltr">' + esc(b.sci) + '</small></div><div class="sp-tags">' + (b.now ? '<span class="pill p-info">الآن</span>' : '<span class="sp-m">' + esc(b.months.map(function (m) { return MONTHS[m - 1].slice(0, 3); }).filter(function (v, i, a) { return a.length < 5 || i === 0 || i === a.length - 1; }).join(' – ')) + '</span>') + '<span class="pill ' + SP_RISK[b.risk][1] + '">' + SP_RISK[b.risk][0] + '</span></div></li>'; }).join('') + '</ul></div>';
      }).join('') + '</div></div>';
  }
  function birdDistTable(d) {
    var sec = S.bSector && S.bSector !== '*' ? S.bSector : null, ss = d.sites.filter(function (x) { return x.lat != null && (!sec || x.sector === sec); });
    var fw = d.flyways.slice().sort(function (a, b) { var O = { NILE: 1, OASIS: 2, MED: 3, REDSEA: 4 }; return (O[a.id] || 9) - (O[b.id] || 9); });
    var rows = ss.map(function (x) { var m = {}; birdDists(d, x).forEach(function (q) { m[q.f.id] = q.km; }); var near = birdDists(d, x)[0]; return { x: x, m: m, near: near }; }).sort(function (a, b) { return a.near.km - b.near.km; });
    return '<div class="card" id="bdDist"><div class="card-head"><div><span class="kick">المسافة المباشرة من إحداثيات المحطة إلى أقرب نقطة على خط سير كل مسار</span><h2>' + icon('map') + ' بُعد المحطات عن مسارات الطيور المهاجرة' + (sec ? ' · قطاع ' + esc(sec) : '') + '</h2></div><div class="rlegend"><span><i class="kd-1"></i>أقل من 10 كم</span><span><i class="kd-2"></i>10 إلى 25</span><span><i class="kd-3"></i>25 إلى 50</span><span><i class="kd-4"></i>أكثر من 50</span></div></div>' +
      '<div class="tbl"><table class="kd-tbl"><thead><tr><th>المحطة</th>' + fw.map(function (f) { return '<th><i class="kd-dot" style="background:' + f.color + '"></i>' + esc(f.name.replace('ممر ', '').replace(' وبحيرات الدلتا', '').replace(' والوادي المتصدع', '')) + '</th>'; }).join('') + '<th>الأقرب</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td><button type="button" class="kd-site" data-bfocus="' + esc(r.x.id) + '"><b>' + esc(shortSite(r.x.name)) + '</b><small>' + esc(r.x.sector) + '</small></button></td>' + fw.map(function (f) { var v = r.m[f.id]; return '<td><span class="kd ' + kmCls(v) + '">' + kmTxt(v) + ' كم</span></td>'; }).join('') + '<td><b style="color:' + r.near.f.color + '">' + esc(r.near.f.name.replace('ممر ', '')) + '</b><small class="muted"> · ' + kmLbl(r.near.km) + '</small></td></tr>'; }).join('') +
      '</tbody></table></div><p class="small muted">المسارات نموذج علمي يمثل منتصف جبهة الهجرة وعرضها الفعلي عشرات الكيلومترات، لذلك المحطة الأقل من 25 كم تعتبر داخل نطاق المرور. اضغط اسم أي محطة لعرض خطوط المسافة على الخريطة.</p></div>';
  }
  /** خطوط المسافة من المحطة المختارة إلى كل المسارات على الخريطة */
  function birdFocus(d, id, fly) {
    var map = S.bmap; if (!map) return;
    if (S.bFocusL) { map.removeLayer(S.bFocusL); S.bFocusL = null; }
    var x = d.sites.filter(function (s) { return s.id === id; })[0]; if (!x || x.lat == null) return;
    var g = L.layerGroup(); S.bFocus = id;
    birdDists(d, x).forEach(function (q, i) {
      if (i > 1 && q.km > 80) return;
      L.polyline([[x.lat, x.lng], [q.lat, q.lng]], { color: q.f.color, weight: i ? 2.5 : 4, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(g);
      L.circleMarker([q.lat, q.lng], { radius: 5, color: '#fff', weight: 2, fillColor: q.f.color, fillOpacity: 1, interactive: false }).addTo(g);
      L.marker([q.lat, q.lng], { interactive: false, icon: L.divIcon({ className: 'bm-km', html: '<span style="--c:' + q.f.color + '">' + kmTxt(q.km) + ' كم<small>' + esc(q.f.name.replace('ممر ', '')) + '</small></span>', iconSize: [0, 0] }) }).addTo(g);
    });
    g.addTo(map); S.bFocusL = g;
    Object.keys(S.bMarks || {}).forEach(function (k) { var el = S.bMarks[k].getElement(); if (el) el.classList.toggle('cur', k === id); });
    if (fly) { var pts = [[x.lat, x.lng]].concat(birdDists(d, x).slice(0, 2).map(function (q) { return [q.lat, q.lng]; })); map.flyToBounds(L.latLngBounds(pts), { maxZoom: 13, duration: 1.4, paddingTopLeft: [40, 120], paddingBottomRight: [40, 60] }); }
    var n = $('bmNow');
    if (n) { var ds = birdDists(d, x); n.hidden = false; n.innerHTML = '<span class="bm-dot lv-' + x.lvl.k + '" style="--c:' + LVL_C[x.lvl.k] + '"><b>' + x.score + '</b></span><div><b>' + esc(shortSite(x.name)) + '</b><span>' + ds.slice(0, 2).map(function (q) { return '<i style="color:' + q.f.color + '">●</i> ' + esc(q.f.name.replace('ممر ', '')) + ' ' + kmTxt(q.km) + ' كم'; }).join('<br>') + '</span></div><button type="button" class="btn sm" data-bsheet="' + esc(x.id) + '">التفاصيل</button>'; var b = n.querySelector('[data-bsheet]'); if (b) b.onclick = function () { birdSiteSheet(x.id); }; L.DomEvent.disableClickPropagation(n); }
  }
  function birdLiveStop() { clearInterval(S.bTourT); S.bTourT = null; if (S.bmap) { try { S.bmap.remove(); } catch (e) {} S.bmap = null; } }
  function birdHull(pts) {
    var P0 = pts.slice().sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; }); if (P0.length < 3) return P0;
    var cr = function (o, a, b) { return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]); }, lo = [], up = [];
    P0.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P0.slice().reverse().forEach(function (p) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function birdLiveBar(d) {
    var secs = []; d.sites.forEach(function (x) { if (x.sector && secs.indexOf(x.sector) < 0) secs.push(x.sector); });
    if (!S.bSector || (S.bSector !== '*' && secs.indexOf(S.bSector) < 0)) S.bSector = secs.indexOf('الواحات') >= 0 ? 'الواحات' : secs[0] || '*';
    return '<div class="bm-bar"><div class="bm-secs" role="group" aria-label="القطاع">' + secs.concat(['*']).map(function (s) { return '<button type="button" data-bsec="' + esc(s) + '" class="' + (S.bSector === s ? 'on' : '') + '">' + (s === '*' ? 'كل القطاعات' : 'قطاع ' + esc(s)) + '</button>'; }).join('') + '</div>' +
      '<div class="bm-acts"><button type="button" data-bm="fit">' + icon('map') + ' عرض القطاع كاملاً</button><button type="button" data-bm="tour" class="' + (S.bTour ? 'on' : '') + '">' + icon(S.bTour ? 'pause' : 'play') + '<span>' + (S.bTour ? 'إيقاف الجولة' : 'جولة تلقائية') + '</span></button><button type="button" data-bm="layer">' + icon('layers') + ' ' + (S.bLayer === 'osm' ? 'قمر صناعي' : 'خريطة الطرق') + '</button></div></div>';
  }
  function birdLiveInit(d) {
    var box = $('bdLive'); if (!box) return;
    birdLiveStop();
    birdLeaflet().then(function () {
      box = $('bdLive'); if (!box) return;
      box.innerHTML = '';
      var map = L.map(box, { zoomControl: true, scrollWheelZoom: true, zoomSnap: 0.25, zoomDelta: 0.5 }); S.bmap = map;
      var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
      var sat = L.layerGroup([L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'صور: Esri' }), L.tileLayer(esri + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })]);
      var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      (S.bLayer === 'osm' ? osm : sat).addTo(map);
      var flyLabs = [], spring = d.season.k === 'spring', mNow = new Date(d.now).getMonth(), sites = d.sites.filter(function (x) { return x.lat != null && x.lng != null; });
      // مسارات الهجرة
      d.flyways.forEach(function (f) {
        var pts = (spring ? f.path.slice().reverse() : f.path).map(function (p) { return [p[0], p[1]]; }), a = Math.max(0.15, f.intensity / 100);
        L.polyline(pts, { color: f.color, weight: 34, opacity: 0.08 + a * 0.14, lineCap: 'round', interactive: false }).addTo(map);
        var spl = birdSpecies(f.id, mNow), spNow = spl.filter(function (b) { return b.now; }), spShow = (spNow.length ? spNow : spl).slice(0, 3);
        L.polyline(pts, { color: f.color, weight: 3, opacity: 0.5 + a * 0.5, dashArray: '10 12', className: 'bm-flow' }).bindTooltip('<b>' + esc(f.name) + '</b> · شدة الهجرة ' + f.intensity + '%<br>' + spl.map(function (b) { return (b.now ? '● ' : '○ ') + esc(b.name); }).join('<br>'), { sticky: true, direction: 'top' }).addTo(map);
        // بطاقة الأنواع على المسار: تُوضع على جزء ظاهر من المسار بعيداً عن المحطات وتتحرك مع الخريطة
        var lab = L.marker(pts[0], { icon: L.divIcon({ className: 'bm-fly', html: '<span style="--c:' + f.color + '"><b>' + esc(f.name) + '</b><em>' + (spNow.length ? 'متوقع الآن: ' : 'أنواعه: ') + esc(spShow.map(function (b) { return b.name.replace(/\s*\(.*$/, ''); }).join('، ')) + '</em></span>', iconSize: [0, 0] }) }).on('click', function () { var t = $('bdSpecies'); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
        flyLabs.push({ m: lab, path: f.path });
      });
      // البحيرات وتجمعات الطيور المائية
      d.wetlands.forEach(function (w) { L.circle([w.lat, w.lng], { radius: 2500 + w.intensity * 120, color: '#38a3f1', weight: 1.5, fillOpacity: 0.22 }).bindTooltip(esc(w.name) + ' · تجمع الطيور المائية ' + w.intensity + '%', { direction: 'top' }).addTo(map); });
      // حدود كل قطاع
      var bySec = {}; sites.forEach(function (x) { (bySec[x.sector] = bySec[x.sector] || []).push([+x.lat, +x.lng]); });
      Object.keys(bySec).forEach(function (sec) {
        var h = birdHull(bySec[sec]);
        if (h.length >= 3) L.polygon(h, { color: '#ffffff', weight: 2, dashArray: '6 6', fillColor: '#c8182a', fillOpacity: 0.06, interactive: false }).addTo(map);
        var top = bySec[sec].reduce(function (a, p) { return p[0] > a[0] ? p : a; });
        L.marker(top, { interactive: false, icon: L.divIcon({ className: 'bm-sec', html: '<span>قطاع ' + esc(sec) + '</span>', iconSize: [0, 0] }) }).addTo(map);
      });
      // الأسراب المتوقعة باتجاه المواقع
      var seen = {};
      sites.filter(function (x) { return x.flocks.length && x.score >= 30; }).slice(0, 12).forEach(function (x) {
        var f = x.flocks[0], key = f.from + '|' + x.sector; if (seen[key]) return; seen[key] = 1;
        var fl = f.lat, fg = f.lng; if (f.d < 28) { var rr = f.track * Math.PI / 180; fl = x.lat - Math.cos(rr) * 28 / 111; fg = x.lng - Math.sin(rr) * 28 / (111 * Math.cos(x.lat * Math.PI / 180)); }
        L.polyline([[fl, fg], [x.lat, x.lng]], { color: f.color, weight: 3, dashArray: '3 9', className: 'bm-flock', interactive: false }).addTo(map);
        L.marker([fl, fg], { icon: L.divIcon({ className: 'bm-bird', html: '<span style="--c:' + f.color + '">' + icon('bird') + '<b>سرب ~' + BIO_eta(f.eta) + '</b></span>', iconSize: [0, 0] }) }).bindTooltip(esc(f.from + ' ← ' + x.name + ' · ' + f.d + ' كم · ' + f.species), { direction: 'top' }).addTo(map);
      });
      // المشاهدات
      (d.sightings || []).forEach(function (s) { if (s.lat == null || s.lat === '') return; L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'bm-obs ' + (s.source === 'eBird' ? 'eb' : 'ob'), html: '<i></i>', iconSize: [0, 0] }) }).bindTooltip(esc(s.species + ' · ' + s.count + ' · ' + s.source + ' · ' + ago(s.time)), { direction: 'top' }).addTo(map); });
      // المواقع بلون الخطر
      S.bMarks = {};
      sites.slice().reverse().forEach(function (x) {
        var k = x.lvl.k, m = L.marker([x.lat, x.lng], { riseOnHover: true, icon: L.divIcon({ className: 'bm-site', html: '<span class="bm-dot lv-' + k + '" style="--c:' + LVL_C[k] + '"><b>' + x.score + '</b></span><span class="bm-lbl">' + esc(shortSite(x.name).replace(/\s*\(.*$/, '')) + '</span>', iconSize: [0, 0] }) }).addTo(map);
        m.on('click', function () { if (S.bTour) birdTour(d, false); birdFocus(d, x.id, false); });
        S.bMarks[x.id] = m;
      });
      var placeLabs = function () {
        var vb = map.getBounds().pad(-0.04), cp = map.latLngToContainerPoint(map.getCenter()), sp = sites.map(function (x) { return map.latLngToContainerPoint([x.lat, x.lng]); }), used = [];
        flyLabs.forEach(function (o) {
          var best = null;
          for (var i = 0; i < o.path.length - 1; i++) for (var t = 0; t <= 1; t += 0.02) {
            var ll = L.latLng(o.path[i][0] + (o.path[i + 1][0] - o.path[i][0]) * t, o.path[i][1] + (o.path[i + 1][1] - o.path[i][1]) * t); if (!vb.contains(ll)) continue;
            var pp = map.latLngToContainerPoint(ll), md = 999; sp.concat(used).forEach(function (q) { md = Math.min(md, pp.distanceTo(q)); });
            var sc = Math.min(md, 170) - 0.12 * pp.distanceTo(cp); if (!best || sc > best.sc) best = { sc: sc, ll: ll, pp: pp };
          }
          if (best) {
            o.m.setLatLng(best.ll); if (!map.hasLayer(o.m)) o.m.addTo(map); used.push(best.pp);
            var el = o.m.getElement() && o.m.getElement().firstChild, sz = map.getSize();
            if (el) el.style.transform = 'translate(' + (best.pp.x > sz.x / 2 ? 'calc(-100% - 14px)' : '14px') + ',' + (best.pp.y > sz.y * 0.75 ? 'calc(-100% + 8px)' : best.pp.y < sz.y * 0.25 ? '-8px' : '-50%') + ')';
          } else if (map.hasLayer(o.m)) map.removeLayer(o.m);
        });
      };
      map.on('moveend zoomend', placeLabs);
      // خط رفيع من كل محطة إلى أقرب نقطة على أقرب مسار
      S.bLinks = L.layerGroup(); birdSecSites(d).forEach(function (x) { var q = birdDists(d, x)[0]; L.polyline([[x.lat, x.lng], [q.lat, q.lng]], { color: q.f.color, weight: 1.6, opacity: 0.75, dashArray: '2 6', interactive: false }).addTo(S.bLinks); }); S.bLinks.addTo(map);
      // الرياح على ارتفاع الطيران
      var tw = sites[0] && sites[0].wind;
      if (tw) { var wc = L.control({ position: 'topright' }); wc.onAdd = function () { var el = L.DomUtil.create('div', 'bm-wind'); el.innerHTML = '<span class="bm-arrow" style="transform:rotate(' + (tw.toward + 90) + 'deg)">' + icon('arrow') + '</span><div><b>الرياح على 1500 م</b><span>' + esc(tw.label) + ' · ' + tw.spd + ' كم/س</span></div>'; return el; }; wc.addTo(map); }
      L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
      var now = L.control({ position: 'bottomright' }); now.onAdd = function () { var el = L.DomUtil.create('div', 'bm-now'); el.id = 'bmNow'; el.hidden = true; return el; }; now.addTo(map);
      // اللمس أو السحب يوقف الجولة التلقائية (تحكم يدوي)
      ['mousedown', 'touchstart', 'wheel'].forEach(function (ev) { box.addEventListener(ev, function () { if (S.bTour) birdTour(d, false); }, { passive: true }); });
      var far = function () { box.classList.toggle('bm-far', map.getZoom() < 12); };
      map.on('zoomend', far);
      map.invalidateSize(); birdFitSector(d, true); far(); placeLabs();
      setTimeout(function () { if (S.bmap !== map) return; map.invalidateSize(); if (!S.bTour) birdFitSector(d, true); }, 250);
      if (S.bTour) birdTour(d, true);
    }).catch(function () {
      var b = $('bdLive'); if (b) { b.outerHTML = birdMap(d, 'near'); toast('تعذر تحميل الخريطة التفاعلية (تحتاج إنترنت). عُرضت الخريطة المبسطة'); }
    });
  }
  function birdSecSites(d) { return d.sites.filter(function (x) { return x.lat != null && x.lng != null && (S.bSector === '*' || x.sector === S.bSector); }); }
  function birdFitSector(d, instant) {
    var map = S.bmap, L1 = birdSecSites(d); if (!map || !L1.length) return;
    var b = L.latLngBounds(L1.map(function (x) { return [x.lat, x.lng]; })), c = b.getCenter();
    d.flyways.map(function (f) { return birdNear(c.lat, c.lng, f.path); }).sort(function (p, q) { return p.km - q.km; }).slice(0, 2).forEach(function (q) { if (q.km < 90) b.extend([q.lat, q.lng]); });
    var o = { maxZoom: L1.length > 1 ? 15 : 13, paddingTopLeft: [40, 120], paddingBottomRight: [40, 40] };
    if (instant) map.fitBounds(b, o); else map.flyToBounds(b, Object.assign({ duration: 1.4 }, o));
    Object.keys(S.bMarks || {}).forEach(function (id) { var el = S.bMarks[id].getElement(); if (el) el.classList.remove('cur'); });
    if (S.bFocusL) { map.removeLayer(S.bFocusL); S.bFocusL = null; }
    var n = $('bmNow'); if (n) n.hidden = true;
  }
  function birdTour(d, on) {
    S.bTour = on; clearInterval(S.bTourT); S.bTourT = null;
    var btn = document.querySelector('[data-bm="tour"]'); if (btn) { btn.classList.toggle('on', on); btn.innerHTML = icon(on ? 'pause' : 'play') + '<span>' + (on ? 'إيقاف الجولة' : 'جولة تلقائية') + '</span>'; }
    if (!on || !S.bmap) { var n0 = $('bmNow'); if (n0 && !on) n0.hidden = true; return; }
    var list = birdSecSites(d).slice().sort(function (a, b) { return b.score - a.score; }), i = -1;
    var step = function () {
      if (!S.bmap) return;
      i = (i + 1) % (list.length + 1);
      if (i === list.length) return birdFitSector(d);
      var x = list[i], n = $('bmNow');
      Object.keys(S.bMarks).forEach(function (id) { var el = S.bMarks[id].getElement(); if (el) el.classList.toggle('cur', id === x.id); });
      S.bmap.flyTo([x.lat, x.lng], 13, { duration: 1.6 }); birdFocus(d, x.id, false);
      if (false) { var f = x.flocks[0]; n.hidden = false; n.innerHTML = '<span class="bm-dot lv-' + x.lvl.k + '" style="--c:' + LVL_C[x.lvl.k] + '"><b>' + x.score + '</b></span><div><b>' + esc(shortSite(x.name)) + '</b><span>خطر ' + esc(x.lvl.label) + (f ? ' · سرب من ' + esc(f.from) + ' ~' + BIO_eta(f.eta) : '') + '</span></div><small>' + (i + 1) + '/' + list.length + '</small>'; }
    };
    step(); S.bTourT = setInterval(step, 5500);
  }
  function drawBirds(d) {
    var out = $('v5Out'); if (!out) return;
    var mode = S.birdMode || 'live', hi = d.sites.filter(function (x) { return x.score >= d.alertLevel; }), top = d.sites[0], live = birdLive(d);
    var dir = d.season.k === 'spring' ? 'الطيور تتجه شمالاً' : d.season.k === 'autumn' ? 'الطيور تتجه جنوباً' : d.season.dir;
    var html = '<div class="bd-hero"><div class="bd-ht"><span class="cc-kick">' + icon('bird') + ' رادار الطيور المهاجرة · الإنذار المبكر لإنفلونزا الطيور</span><h1>مسارات الهجرة وخطرها على مواقع الشركة</h1>' +
      '<div class="cc-meta"><span class="live"><i></i> ' + esc(d.season.label) + '</span><span>' + esc(dir) + '</span><span>آخر حساب ' + esc(fmt(d.now)) + '</span></div>' +
      '<div class="bd-src"><span class="' + (live ? 'on' : 'mod') + '">' + icon('wind') + (live ? ' رياح حية: ' + esc(d.wx.source) : /محاكاة/.test(d.wx.source || '') ? ' رياح محاكاة (نسخة العرض)' : ' رياح: نموذج مناخي حتى أول تحديث') + '</span><span class="' + (d.ebird ? 'on' : 'off') + '">' + icon('eye') + (d.ebird ? ' مشاهدات eBird مفعلة' : ' eBird غير مفعل') + '</span><span class="on">' + icon('pin') + ' ' + d.sightings.length + ' مشاهدة خلال 7 أيام</span><span class="mod">' + icon('map') + ' مسارات الهجرة: نموذج علمي</span></div></div>' +
      '<div class="bd-hs"><div class="bd-big" style="--c:' + (top ? LVL_C[top.lvl.k] : 'var(--r-low)') + '"><b class="mono">' + (top ? top.score : 0) + '</b><span>أعلى خطر الآن</span><small>' + esc(top ? shortSite(top.name) : '—') + '</small></div>' +
      '<div class="bd-big" style="--c:' + (hi.length ? 'var(--r-crit)' : 'var(--r-low)') + '"><b class="mono">' + hi.length + '</b><span>فوق حد التنبيه</span><small>الحد ' + d.alertLevel + ' من 100</small></div></div>' +
      '<div class="cc-acts"><button class="btn cc-btn" type="button" id="bdSight">' + icon('plus') + ' إبلاغ عن مشاهدة</button><button class="btn cc-btn" type="button" id="bdRef">' + icon('refresh') + ' تحديث الرياح والمشاهدات</button>' +
      '<div class="bd-seg" role="group"><button type="button" data-mode="live" class="' + (mode === 'live' ? 'on' : '') + '">خريطة تفاعلية</button><button type="button" data-mode="near" class="' + (mode === 'near' ? 'on' : '') + '">المواقع عن قرب</button><button type="button" data-mode="region" class="' + (mode === 'region' ? 'on' : '') + '">الدلتا والبحيرات</button><button type="button" data-mode="egypt" class="' + (mode === 'egypt' ? 'on' : '') + '">مصر كاملة</button></div></div></div>';
    if (hi.length) html += '<div class="cc-alert a-bad">' + icon('bird') + '<span><b>' + plural(hi.length, 'موقع', 'مواقع') + ' في خطر ' + esc(hi[0].lvl.label) + ' من الأسراب المهاجرة</b>: ' + esc(hi.slice(0, 4).map(function (x) { return shortSite(x.name) + ' (' + x.score + ')'; }).join('، ')) + (hi[0].flocks[0] ? '. أقرب سرب متوقع من «' + esc(hi[0].flocks[0].from) + '» خلال ~' + BIO_eta(hi[0].flocks[0].eta) + '' : '') + '. وصل تنبيه للمديرين.</span><button class="btn sm" type="button" data-bsite="' + esc(hi[0].id) + '">الإجراءات</button></div>';
    if (d.missing.length) html += '<div class="cc-alert a-warn">' + icon('pin') + '<span><b>' + plural(d.missing.length, 'موقع بلا إحداثيات', 'مواقع بلا إحداثيات') + '</b> لا يدخل في الحساب: ' + esc(d.missing.map(function (m) { return m.name; }).join('، ')) + '</span><a class="btn sm" href="#birds" data-scroll="bdGeo">إضافة</a></div>';
    html += '<div class="bd-grid' + (mode === 'live' ? ' live' : '') + '"><div class="card flush bd-map">' + (mode === 'live' ? birdLiveBar(d) + '<div class="bd-live" id="bdLive" dir="ltr"><p class="empty"><span class="spin"></span>جارٍ تحميل الخريطة…</p></div>' : '<div class="bd-mapbox">' + birdMap(d, mode) + '</div>') + '<div class="bd-legend">' +
      d.flyways.map(function (f) { return '<span><i style="background:' + f.color + '"></i>' + esc(f.name) + ' <b class="mono">' + f.intensity + '%</b></span>'; }).join('') +
      '<span><i class="wl"></i>تجمع البط في البحيرات <b class="mono">' + (d.wetlands[0] ? Math.round(d.wetlands[0].intensity / d.wetlands[0].w) : 0) + '%</b></span><span><i class="ob"></i>مشاهدة ميدانية</span><span><i class="eb"></i>مشاهدة eBird</span><span><i class="fl"></i>سرب متوقع وزمن الوصول</span></div></div>';
    html += '<div class="card bd-list"><div class="card-head"><div><span class="kick">0 إلى 100 · يُحدَّث كل 3 ساعات</span><h2>خطر الأسراب على كل موقع</h2></div><div class="rlegend"><span><i class="rt-low"></i>منخفض</span><span><i class="rt-mid"></i>متوسط</span><span><i class="rt-high"></i>مرتفع</span><span><i class="rt-crit"></i>حرج</span></div></div><div class="bd-rows">' +
      d.sites.map(function (x, i) {
        var f = x.flocks[0];
        return '<button type="button" class="bd-row" data-bsite="' + esc(x.id) + '"><span class="tr-rank mono">' + (i + 1) + '</span><div class="t"><b>' + esc(shortSite(x.name)) + ' <small>' + esc(x.sector) + '</small></b>' + bar(x.score, LVL_C[x.lvl.k]) +
          '<span>' + (f ? icon('bird') + ' سرب من ' + esc(f.from) + ' · ' + f.d + ' كم · ~' + BIO_eta(f.eta) : x.factors[0] ? esc(x.factors[0].label) + (x.factors[0].d ? ' · ' + x.factors[0].d + ' كم' : '') : 'بعيد عن مسارات الهجرة النشطة') + '</span></div><span class="tr-sc" style="--c:' + LVL_C[x.lvl.k] + '"><b class="mono">' + x.score + '</b>' + esc(x.lvl.label) + '</span></button>';
      }).join('') + '</div></div></div>';
    html += '<div id="bdSpecies">' + birdSpeciesCards(d) + '</div><div id="bdDistBox">' + birdDistTable(d) + '</div>';
    // تقويم الهجرة
    var mNow = new Date(d.now).getMonth();
    html += '<div class="card"><div class="card-head"><div><span class="kick">' + esc(d.season.label) + '</span><h2>' + icon('calendar') + ' تقويم الهجرة فوق مصر</h2></div><span class="sub">' + esc(d.season.note) + '</span></div><div class="tbl bd-cal"><table><thead><tr><th>المسار</th>' + MONTHS.map(function (m, i) { return '<th class="' + (i === mNow ? 'now' : '') + '">' + m.slice(0, 3) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.flyways.map(function (f) { return '<tr><th><i style="background:' + f.color + '"></i>' + esc(f.name) + '<small>' + esc(f.species) + '</small></th>' + f.months.map(function (v, i) { return '<td class="' + (i === mNow ? 'now' : '') + '" style="background:color-mix(in srgb,' + f.color + ' ' + Math.round(v * 85) + '%,transparent)" title="' + MONTHS[i] + ': ' + Math.round(v * 100) + '%"></td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><th><i style="background:#2563eb"></i>البط الشتوي في البحيرات<small>الخضاري والشرشير والحذاف: الأعلى خطراً لإنفلونزا الطيور</small></th>' + d.wetlandMonths.map(function (v, i) { return '<td class="' + (i === mNow ? 'now' : '') + '" style="background:color-mix(in srgb,#2563eb ' + Math.round(v * 85) + '%,transparent)"></td>'; }).join('') + '</tr></tbody></table></div></div>';
    // المشاهدات والتنبيهات
    html += '<div class="grid-2"><div class="card"><div class="card-head"><div><span class="kick">آخر 7 أيام</span><h2>' + icon('eye') + ' مشاهدات الطيور</h2></div><button class="btn sm" type="button" id="bdSight2">' + icon('plus') + ' إبلاغ</button></div><div class="list">' +
      (d.sightings.length ? d.sightings.slice(0, 8).map(function (s) { return '<div class="li"><span class="av bd-av ' + (s.source === 'eBird' ? 'eb' : 'ob') + '">' + icon('bird') + '</span><div class="t"><b>' + esc(s.species) + ' · <span class="mono">' + s.count + '</span></b><span>' + esc((s.note ? s.note + ' · ' : '') + (s.by || '')) + '</span></div><div class="meta"><span class="pill ' + (s.source === 'eBird' ? 'p-info' : 'p-warn') + '">' + esc(s.source) + '</span><span>' + esc(ago(s.time)) + '</span></div></div>'; }).join('') : '<p class="empty">' + icon('eye') + 'لا توجد مشاهدات مسجلة. أمن البوابات يبلغ عن أي أسراب حول المواقع من زر «مشاهدة طيور».</p>') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">تنبيهات أُرسلت للمديرين</span><h2>' + icon('bell') + ' سجل تنبيهات الأسراب</h2></div></div><div class="list">' +
      (d.alerts.length ? d.alerts.map(function (a) { return '<div class="li"><span class="av" style="background:var(--bad-soft);color:var(--bad)">' + icon('alert') + '</span><div class="t"><b>' + esc(a.siteName) + ' · ' + esc(a.level) + ' (' + a.score + ')</b><span>' + esc(a.note) + '</span></div><div class="meta"><span>' + esc(ago(a.time)) + '</span></div></div>'; }).join('') : '<p class="empty">' + icon('check') + 'لم يتجاوز أي موقع حد التنبيه بعد</p>') + '</div></div></div>';
    // الإحداثيات
    var all = d.sites.concat(d.missing.map(function (m) { return { id: m.id, name: m.name, sector: '', lat: null, lng: null, geo: '' }; }));
    html += '<div class="card" id="bdGeo"><div class="card-head"><div><span class="kick">أساس حساب الخطر</span><h2>' + icon('pin') + ' إحداثيات المواقع</h2></div><span class="sub">الإحداثيات التقريبية وُضعت للتجربة. استبدلها بالدقيقة: افتح خرائط جوجل، اضغط مطولاً على المزرعة، وانسخ الرقمين.</span></div><div class="tbl"><table><thead><tr><th>الموقع</th><th>خط العرض</th><th>خط الطول</th><th>الدقة</th><th></th></tr></thead><tbody>' +
      all.map(function (x) { return '<tr><td><b>' + esc(x.name) + '</b></td><td class="mono">' + (x.lat == null ? '—' : Number(x.lat).toFixed(4)) + '</td><td class="mono">' + (x.lng == null ? '—' : Number(x.lng).toFixed(4)) + '</td><td>' + (x.lat == null ? '<span class="pill p-bad">غير مضافة</span>' : x.geo === 'مؤكدة' ? '<span class="pill p-ok">مؤكدة</span>' : '<span class="pill p-warn">تقريبية</span>') + '</td><td class="row" style="gap:6px;justify-content:flex-end">' + (x.lat != null ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + x.lat + ',' + x.lng + '">' + icon('map') + ' الخريطة</a>' : '') + (d.canEdit ? '<button class="btn sm" type="button" data-geo="' + esc(x.id) + '">' + icon('edit') + ' تعديل</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    // المصادر والمنهجية
    html += '<div class="card bd-method"><div class="card-head"><h2>' + icon('book') + ' كيف يُحسب الخطر ومن أين البيانات</h2></div><div class="tbl"><table><thead><tr><th>المصدر</th><th>ما يقدمه</th><th>الحالة</th></tr></thead><tbody>' +
      [['مسارات الهجرة الأربعة فوق مصر', 'BirdLife International، ممر البحر الأحمر والوادي المتصدع، اتفاقية طيور الماء الأفريقية الأوراسية AEWA: مكان المسار وشدته لكل شهر', '<span class="pill p-n">نموذج علمي ثابت</span>'],
        ['تجمعات البط والطيور المائية', 'تعداد الطيور المائية الشتوي في بحيرات الدلتا وقارون ووادي الريان ووادي النطرون', '<span class="pill p-n">نموذج موسمي</span>'],
        ['الرياح على ارتفاع الطيران (1500 م)', 'Open-Meteo مجاناً وبدون مفتاح، لكل موقع كل 3 ساعات: تحدد اتجاه انجراف الأسراب وسرعتها', live ? '<span class="pill p-ok">حي</span>' : /محاكاة/.test(d.wx.source || '') ? '<span class="pill p-warn">محاكاة في نسخة العرض · حي على الخادم</span>' : '<span class="pill p-warn">مناخي حتى أول تحديث</span>'],
        ['مشاهدات eBird', 'مشاهدات حقيقية للطيور حول كل موقع (Cornell Lab) مجاناً بمفتاح يُكتب في الإعدادات EBIRD_KEY، مع تصفية الأنواع الناقلة لإنفلونزا الطيور', d.ebird ? '<span class="pill p-ok">حي</span>' : '<span class="pill p-n">يحتاج مفتاحاً مجانياً</span>'],
        ['مشاهدات الأمن والعاملين', 'زر «مشاهدة طيور» في البوابة والتطبيق، وكل مشاهدة ترفع خطر المواقع القريبة فوراً وتنبه المدير', '<span class="pill p-ok">حي</span>']].map(function (r) { return '<tr><td><b>' + r[0] + '</b></td><td class="small">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small muted">لكل موقع: قُرب الموقع من كل مسار × شدة الهجرة هذا الشهر × مدى توافق اتجاه طيران الأسراب (سرعة الطيور 40 كم/س + متجه الرياح) مع اتجاه الموقع، ومثلها لتجمعات البط في البحيرات القريبة، ثم تُضاف المشاهدات القريبة الحديثة. عند تجاوز ' + d.alertLevel + ' يصل تنبيه فوري بالإجراءات لمديري القطاع ومدير الأمن الحيوي. لا توجد خدمة مجانية ترصد الأسراب لحظياً فوق مصر بالرادار، لذلك «السرب المتوقع» تقدير احتياطي من الموسم والمسار والرياح والمشاهدات.</p></div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-bsite]').forEach(function (b) { b.onclick = function () { birdSiteSheet(b.dataset.bsite); }; });
    out.querySelectorAll('.bd-site').forEach(function (c) { c.onclick = function () { birdSiteSheet(c.dataset.site); }; });
    out.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { S.birdMode = b.dataset.mode; drawBirds(d); }; });
    var bindFocus = function () { out.querySelectorAll('[data-bfocus]').forEach(function (b) { b.onclick = function () { if (S.birdMode && S.birdMode !== 'live') { birdSiteSheet(b.dataset.bfocus); return; } if (S.bTour) birdTour(d, false); var m = $('bdLive'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); birdFocus(d, b.dataset.bfocus, true); }; }); };
    bindFocus();
    out.querySelectorAll('[data-bsec]').forEach(function (b) { b.onclick = function () { S.bSector = b.dataset.bsec; out.querySelectorAll('[data-bsec]').forEach(function (c) { c.classList.toggle('on', c === b); }); $('bdSpecies').innerHTML = birdSpeciesCards(d); $('bdDistBox').innerHTML = birdDistTable(d); bindFocus(); if (S.bmap) birdLiveInit(d); }; });
    out.querySelectorAll('[data-bm]').forEach(function (b) { b.onclick = function () { var a = b.dataset.bm; if (a === 'fit') { birdTour(d, false); birdFitSector(d); } else if (a === 'tour') birdTour(d, !S.bTour); else { S.bLayer = S.bLayer === 'osm' ? 'sat' : 'osm'; drawBirds(d); } }; });
    if (mode === 'live') birdLiveInit(d); else birdLiveStop();
    out.querySelectorAll('[data-geo]').forEach(function (b) { b.onclick = function () { geoSheet(b.dataset.geo); }; });
    out.querySelectorAll('[data-scroll]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); var t = $(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth' }); }; });
    $('bdSight').onclick = $('bdSight2').onclick = function () { birdSightingSheet(); };
    $('bdRef').onclick = function () { var b = this; b.disabled = true; remote('birdsRefresh', [S.session.pin]).then(function (x) { S.birds = x; drawBirds(x); toast('تم تحديث الرياح والمشاهدات وإعادة الحساب'); }).catch(function (e) { b.disabled = false; toast(errText(e)); }); };
  }
  var BIRD_ACTIONS = {
    low: ['المتابعة الروتينية: الشبابيك والفتحات مغطاة بالشبك', 'لا علف منسكب ولا مياه مكشوفة حول العنابر'],
    mid: ['فحص شبك الشبابيك وفتحات التهوية اليوم وإصلاح أي فتحة', 'تغطية العلف والمياه ومنع أي تجمع مياه مكشوف', 'إبلاغ فوري عن أي طيور برية داخل السياج'],
    high: ['إغلاق الشبابيك والفتحات المفتوحة بالشبك فوراً', 'تقليل الزيارات غير الضرورية اليوم وتأجيل الصيانة غير العاجلة', 'تشديد تطهير الأقدام والمركبات وتجديد المحاليل', 'متابعة النفوق اليومي وإبلاغ الطبيب البيطري عن أي زيادة'],
    crit: ['إيقاف الزيارات غير الضرورية لهذا الموقع حتى انخفاض الخطر', 'إغلاق كل الفتحات ومنع اقتراب الطيور البرية من العنابر والعلف', 'رفع حالة الموقع إلى «إنذار» من لوحة القيادة إن ظهر نفوق غير معتاد', 'فحص بيطري للقطيع وسحب عينات عند أي أعراض تنفسية']
  };
  function birdSiteSheet(id) {
    var d = S.birds, x = d && d.sites.filter(function (s) { return s.id === id; })[0]; if (!x) return;
    var c = LVL_C[x.lvl.k], w = x.wind;
    openSheet('<div class="sheet-head" style="background:linear-gradient(140deg,' + c + ',color-mix(in srgb,' + c + ' 55%,#000))"><span class="permit">رادار الطيور المهاجرة · ' + esc(x.sector) + '</span><div class="big-ico">' + icon('bird') + '</div><h2>' + esc(x.name) + '</h2><p>خطر الأسراب <b class="mono">' + x.score + '</b> من 100 · ' + esc(x.lvl.label) + '</p></div>' +
      '<div class="sheet-body"><div class="bd-mini">' + birdMap({ sites: d.sites, flyways: d.flyways, wetlands: d.wetlands, sightings: d.sightings, season: d.season }, 'near', { site: x.id }) + '</div>' +
      '<div class="bd-facts"><div><span>الرياح على ارتفاع الطيران</span><b>' + esc(w.label) + '</b><small>' + w.spd + ' كم/س · ' + (w.live ? esc((d.wx && d.wx.source) || 'بيانات حية') : 'تقدير مناخي') + '</small></div><div><span>الإحداثيات</span><b class="mono" dir="ltr" style="text-align:right">' + Number(x.lat).toFixed(3) + ', ' + Number(x.lng).toFixed(3) + '</b><small>' + esc(x.geo || 'تقريبية') + '</small></div><div><span>مشاهدات قريبة</span><b class="mono">' + x.sightings + '</b><small>خلال ' + d.radius + ' كم</small></div></div>' +
      (x.flocks.length ? '<h3>الأسراب المتوقعة باتجاه الموقع</h3><div class="list">' + x.flocks.map(function (f) { return '<div class="li"><span class="av" style="background:color-mix(in srgb,' + f.color + ' 18%,transparent);color:' + f.color + '">' + icon('bird') + '</span><div class="t"><b>' + esc(f.from) + '</b><span>' + esc(f.species) + '</span></div><div class="meta"><b class="mono">~' + BIO_eta(f.eta) + '</b><span>' + f.d + ' كم · تتحرك ' + esc(BIO_compass(f.track)) + ' ' + f.speed + ' كم/س</span></div></div>'; }).join('') + '</div>' : '') +
      '<h3>مصادر الخطر</h3><div class="bd-factors">' + (x.factors.length ? x.factors.map(function (f) { return '<div><span>' + esc(f.label) + (f.d ? ' <small>· ' + f.d + ' كم</small>' : '') + '</span>' + bar(f.pts * 2, c) + '<b class="mono">+' + f.pts + '</b></div>'; }).join('') : '<p class="small muted">الموقع بعيد عن المسارات النشطة هذا الشهر.</p>') + '</div>' +
      '<h3>الإجراءات الموصى بها الآن</h3><ul class="bd-acts">' + BIRD_ACTIONS[x.lvl.k].map(function (a) { return '<li>' + icon('check') + esc(a) + '</li>'; }).join('') + '</ul>' +
      '<div class="row"><button class="btn primary grow" data-a="sight">' + icon('plus') + ' إبلاغ عن مشاهدة هنا</button>' + (can('notices') ? '<button class="btn grow" data-a="notice">' + icon('mega') + ' قرار للبوابة</button>' : '') + (d.canEdit ? '<button class="btn" data-a="geo">' + icon('edit') + ' الإحداثيات</button>' : '') + '</div><button class="btn ghost" data-a="close">إغلاق</button></div>', function (a) {
      if (a === 'close') closeSheet(); else if (a === 'sight') birdSightingSheet(x.id); else if (a === 'geo') geoSheet(x.id);
      else if (a === 'notice') { closeSheet(); S.noticeDraft = { title: 'تشديد الإجراءات: أسراب مهاجرة قرب ' + shortSite(x.name), body: BIRD_ACTIONS[x.lvl.k].join('\n') }; go('notices'); }
    });
  }
  function birdSightingSheet(siteId) {
    var sites = S.session.user.isManager ? myScopeSites() : gateSites();
    var sid = siteId || S.siteId || (sites[0] && sites[0].id), pos = null;
    openSheet('<div class="sheet-head" style="background:linear-gradient(140deg,#ea580c,#7c2d12)"><span class="permit">ينبه المدير فوراً ويرفع خطر المواقع القريبة</span><div class="big-ico">' + icon('bird') + '</div><h2>إبلاغ عن مشاهدة طيور</h2></div><div class="sheet-body"><form class="stack" id="bsForm">' +
      '<div class="field"><label for="bsSite">أقرب موقع</label><select id="bsSite">' + siteOptions(sites, sid) + '</select></div>' +
      '<div class="field"><label>النوع</label><div class="chips" id="bsSp">' + BIRD_SPECIES.map(function (s, i) { return '<button type="button" class="chip' + (i === 0 ? ' on' : '') + '" data-sp="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div></div>' +
      '<div class="row"><div class="field grow"><label for="bsCount">العدد التقريبي</label><input id="bsCount" type="number" min="1" value="20" inputmode="numeric"></div><button type="button" class="btn" id="bsLoc">' + icon('pin') + ' موقعي الحالي</button></div>' +
      '<div class="field"><label for="bsNote">أين بالضبط؟</label><input id="bsNote" type="text" placeholder="مثال: حطت على أرض مكشوفة شمال العنبر 3"></div><span class="xs muted" id="bsLocTxt"></span>' +
      '<button class="btn primary big" type="submit">' + icon('send') + ' إرسال المشاهدة</button><button class="btn ghost" type="button" data-a="close">إلغاء</button></form></div>', function (a) { if (a === 'close') closeSheet(); });
    $('bsSp').onclick = function (e) { var b = e.target.closest('[data-sp]'); if (!b) return; $('bsSp').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === b); }); };
    $('bsLoc').onclick = function () {
      if (!navigator.geolocation) return toast('تحديد الموقع غير متاح على هذا الجهاز');
      $('bsLocTxt').textContent = 'جارٍ تحديد موقعك...';
      navigator.geolocation.getCurrentPosition(function (p) { pos = { lat: p.coords.latitude, lng: p.coords.longitude }; $('bsLocTxt').textContent = 'سيُسجل موقعك: ' + pos.lat.toFixed(4) + '، ' + pos.lng.toFixed(4); }, function () { $('bsLocTxt').textContent = 'تعذر تحديد الموقع، ستُسجل المشاهدة على إحداثيات الموقع المختار'; }, { enableHighAccuracy: true, timeout: 10000 });
    };
    $('bsForm').onsubmit = function (e) {
      e.preventDefault();
      var sp = $('bsSp').querySelector('.chip.on'), o = { id: 'BO' + uid(), siteId: $('bsSite').value, species: sp ? sp.dataset.sp : '', count: $('bsCount').value, note: $('bsNote').value, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '' };
      act('birdSighting', [o]).then(function (r) { closeSheet(); toast(r.queued ? 'حُفظت المشاهدة وتُرسل عند عودة الاتصال' : 'وصلت المشاهدة للمدير وأُعيد حساب الخطر'); if (S.route === 'birds') { S.birds = null; render(); } }).catch(function (x) { toast(errText(x)); });
    };
  }
  function geoSheet(id) {
    var d = S.birds, x = (d.sites.concat(d.missing)).filter(function (s) { return s.id === id; })[0]; if (!x) return;
    openSheet('<div class="sheet-head sh-dark"><span class="permit">' + esc(x.sector || '') + '</span><div class="big-ico">' + icon('pin') + '</div><h2>إحداثيات ' + esc(shortSite(x.name)) + '</h2></div><div class="sheet-body"><form class="stack" id="geoForm">' +
      '<ol class="small" style="margin:0;padding-inline-start:18px;display:grid;gap:4px"><li>افتح خرائط جوجل على الموبايل أو الكمبيوتر</li><li>اضغط مطولاً على منتصف المزرعة حتى يظهر دبوس أحمر</li><li>انسخ الرقمين الظاهرين (مثل 29.9051, 30.8012) والصقهما هنا</li></ol>' +
      '<div class="field"><label for="geoIn">الإحداثيات</label><input id="geoIn" dir="ltr" type="text" placeholder="29.9051, 30.8012" value="' + (x.lat != null ? x.lat + ', ' + x.lng : '') + '"></div>' +
      '<button type="button" class="btn" id="geoMe">' + icon('pin') + ' أنا الآن داخل الموقع: استخدم موقعي</button>' +
      '<div class="login-err" id="geoErr"></div><button class="btn primary big" type="submit">' + icon('check') + ' حفظ الإحداثيات</button><button class="btn ghost" type="button" data-a="close">إلغاء</button></form></div>', function (a) { if (a === 'close') closeSheet(); });
    $('geoMe').onclick = function () { if (!navigator.geolocation) return toast('غير متاح'); navigator.geolocation.getCurrentPosition(function (p) { $('geoIn').value = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5); }, function () { toast('تعذر تحديد الموقع'); }, { enableHighAccuracy: true, timeout: 10000 }); };
    $('geoForm').onsubmit = function (e) {
      e.preventDefault();
      var m = $('geoIn').value.replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; }).match(/(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)/);
      if (!m) { $('geoErr').textContent = 'الصق الرقمين مفصولين بفاصلة، مثل 29.9051, 30.8012'; return; }
      remote('siteGeo', [S.session.pin, id, Number(m[1]), Number(m[2])]).then(function () { closeSheet(); toast('حُفظت الإحداثيات وأُعيد حساب خطر الطيور'); S.birds = null; return sync(); }).then(function () { if (S.route === 'birds') render(); }).catch(function (x) { $('geoErr').textContent = errText(x); });
    };
  }

  /* ============================ قراءة لوحة المركبة بالكاميرا ============================ */
  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function arDigits(s) { return String(s).replace(/\d/g, function (c) { return AR_DIG.charAt(+c); }); }
  function plateSvg(text, w) {
    var n = BIO_plateNorm(String(text || '').replace(/مصر|EGYPT/gi, ''));
    var letters = n.letters.split('').join(' '), digits = arDigits(n.digits);
    return '<svg class="plate" direction="ltr" style="direction:ltr" viewBox="0 0 320 150" width="' + (w || 220) + '" role="img" aria-label="لوحة ' + esc(letters + ' ' + n.digits) + '"><rect x="3" y="3" width="314" height="144" rx="14" fill="#fff" stroke="#1f2937" stroke-width="4"/><path d="M5 17a12 12 0 0 1 12-12h286a12 12 0 0 1 12 12v27H5z" fill="#2f6fd6"/>' +
      '<text x="292" y="34" fill="#fff" font-size="22" font-weight="700" text-anchor="end" font-family="Tajawal,sans-serif">مصر</text><text x="26" y="33" fill="#fff" font-size="18" font-weight="700" font-family="IBM Plex Mono,monospace">EGYPT</text>' +
      '<line x1="160" y1="54" x2="160" y2="138" stroke="#1f2937" stroke-width="3"/><text x="82" y="114" letter-spacing="8" font-size="46" font-weight="800" text-anchor="middle" fill="#111" font-family="Tajawal,sans-serif">' + esc(digits || '—') + '</text><text x="240" y="114" direction="rtl" font-size="46" font-weight="800" text-anchor="middle" fill="#111" font-family="Tajawal,sans-serif">' + esc(letters || '—') + '</text></svg>';
  }
  function plateStop() { if (S.plStream) { try { S.plStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} S.plStream = null; } }
  function plateCandidates(text) {
    var clean = String(text || '').replace(/مصر|EGYPT/gi, '').trim();
    var list = BIO_plateMatch(clean, (S.ref ? S.ref.items : []).filter(function (i) { return i.kind === 'مركبة'; }));
    var cos = {}; ((S.ref && S.ref.companies) || []).forEach(function (c) { cos[c.id] = c; });
    var box = $('plRes'); if (!box) return;
    if (!clean) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="pl-read">' + plateSvg(clean, 200) + '<div><span class="xs muted">المقروء من اللوحة</span><b class="mono">' + esc(clean) + '</b></div></div>' +
      (list.length ? '<div class="pl-cands">' + list.map(function (x, i) {
        var c = cos[x.item.company];
        return '<button type="button" class="pl-cand' + (i === 0 ? ' best' : '') + '" data-pid="' + esc(x.item.id) + '"><span class="av">' + icon('truck') + '</span><span class="t"><b>' + esc(x.item.name) + '</b><span class="mono">' + esc(x.item.plate) + ' · ' + esc(x.item.id) + '</span>' + (c ? '<span class="' + (c.status === 'موقوف' ? 'bad' : '') + '">' + esc(c.name) + (c.status === 'موقوف' ? ' · موقوفة' : '') + '</span>' : '') + '</span><span class="pl-conf" style="--p:' + x.conf + '%"><b class="mono">' + x.conf + '%</b><small>تطابق</small></span></button>';
      }).join('') + '</div><p class="xs muted">اختر المركبة الصحيحة ليُسجَّل ' + (S.dir === 'OUT' ? 'خروجها' : 'دخولها') + ' ويطبق النظام كل قواعد العزل وشهادة التطهير.</p>'
        : '<div class="warnbox">' + icon('alert') + ' لا توجد مركبة مسجلة بهذه اللوحة. تأكد من الرقم أو سجّل المركبة ولوحتها من «البيانات ← الأفراد والمركبات».</div>');
    box.querySelectorAll('[data-pid]').forEach(function (b) { b.onclick = function () { closeSheet(); plateStop(); doScan(b.dataset.pid, { plate: clean }); }; });
  }
  function plateOcr(canvas) {
    var box = $('plRes'); if (!box) return;
    box.innerHTML = '<div class="pl-busy"><span class="spin"></span><span>جارٍ قراءة اللوحة...</span><i id="plProg"></i></div>';
    // تحسين الصورة: رمادي وتباين عالٍ يساعد قراءة الحروف العربية
    try {
      var cx = canvas.getContext('2d'), im = cx.getImageData(0, 0, canvas.width, canvas.height), p = im.data, sum = 0, i;
      for (i = 0; i < p.length; i += 4) { var g = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; sum += g; }
      var mean = sum / (p.length / 4);
      for (i = 0; i < p.length; i += 4) { var v = p[i] < mean * 0.82 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
      cx.putImageData(im, 0, 0);
    } catch (e) {}
    var lib = window.Tesseract ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    lib.then(function () {
      return Tesseract.recognize(canvas, 'ara', { logger: function (m) { var b = $('plProg'); if (b && m.progress) b.style.width = Math.round(m.progress * 100) + '%'; } });
    }).then(function (r) {
      var t = (r && r.data && r.data.text || '').replace(/\s+/g, ' ').trim();
      if ($('plTxt')) $('plTxt').value = t.replace(/مصر|EGYPT/gi, '').trim();
      plateCandidates(t);
    }).catch(function () {
      box.innerHTML = '<div class="warnbox">' + icon('wifioff') + ' تعذرت القراءة الآلية' + (MODE === 'demo' ? ' في نسخة العرض (العارض يمنع تحميل محرك القراءة). في التطبيق الفعلي تعمل القراءة من الكاميرا مباشرة. جرّب «لوحة تجريبية» أو اكتب الرقم.' : '. تأكد من الإنترنت ووضوح اللوحة، أو اكتب الرقم في الخانة.') + '</div>';
    });
  }
  function plateSheet() {
    if (!S.siteId) return toast('لا يوجد موقع مرتبط بهذه البوابة');
    var demoPlates = (S.ref ? S.ref.items : []).filter(function (i) { return i.plate; });
    openSheet('<div class="sheet-head sh-dark"><span class="permit">' + (S.dir === 'OUT' ? 'تسجيل خروج' : 'تسجيل دخول') + ' بقراءة اللوحة</span><div class="big-ico">' + icon('truck') + '</div><h2>قراءة لوحة المركبة</h2></div><div class="sheet-body">' +
      '<div class="pl-cam" id="plCam"><video id="plVid" playsinline muted autoplay></video><div class="pl-guide"><span>ضع لوحة المركبة داخل الإطار</span></div><div class="pl-nocam" id="plNo" hidden>' + icon('camera', 'ico-lg') + '<span>الكاميرا غير متاحة على هذا الجهاز. صوّر اللوحة من «صورة من الجهاز» أو اكتب الرقم.</span></div></div>' +
      '<div class="row"><button class="btn primary big grow" type="button" data-a="snap">' + icon('camera') + ' التقاط وقراءة</button><label class="btn big" for="plFile">' + icon('image') + ' صورة</label><input id="plFile" type="file" accept="image/*" capture="environment" hidden></div>' +
      (MODE === 'demo' && demoPlates.length ? '<div class="stack" style="gap:6px"><span class="xs muted">لوحات تجريبية (محاكاة تصوير اللوحة):</span><div class="chips">' + demoPlates.map(function (i) { return '<button type="button" class="chip" data-a="demo" data-plate="' + esc(i.plate) + '">' + esc(i.plate) + '</button>'; }).join('') + '</div></div>' : '') +
      '<div class="field"><label for="plTxt">أو اكتب ما على اللوحة</label><input id="plTxt" type="text" autocomplete="off" placeholder="مثال: ن ق ص 1234 أو الأرقام فقط"></div>' +
      '<div id="plRes"></div><button class="btn ghost" type="button" data-a="close">إغلاق</button></div>', function (a, b) {
      if (a === 'close') { plateStop(); closeSheet(); }
      else if (a === 'snap') {
        var v = $('plVid'); if (!S.plStream || !v || !v.videoWidth) return toast('الكاميرا غير جاهزة. استخدم «صورة» أو اكتب الرقم');
        var c = document.createElement('canvas'), sx = v.videoWidth * 0.1, sy = v.videoHeight * 0.3, sw = v.videoWidth * 0.8, sh = v.videoHeight * 0.4;
        c.width = 1000; c.height = Math.round(1000 * sh / sw); c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
        plateOcr(c);
      } else if (a === 'demo') {
        var t = b.dataset.plate; $('plRes').innerHTML = '<div class="pl-busy"><span class="spin"></span><span>جارٍ قراءة اللوحة...</span><i style="width:100%"></i></div>';
        $('plCam').classList.add('shot'); $('plCam').style.setProperty('--plate', 'url("data:image/svg+xml,' + encodeURIComponent(plateSvg(t, 320).replace('class="plate" ', 'xmlns="http://www.w3.org/2000/svg" ')) + '")');
        setTimeout(function () { var r = arDigits(t); if ($('plTxt')) $('plTxt').value = r; plateCandidates(r); }, 1100);
      }
    });
    $('plTxt').oninput = function () { plateCandidates(this.value); };
    $('plFile').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      var img = new Image(); img.onload = function () { var c = document.createElement('canvas'), s = Math.min(1, 1400 / img.width); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); plateOcr(c); };
      img.src = URL.createObjectURL(f);
    };
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }).then(function (st) {
        if (!$('plVid')) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        S.plStream = st; $('plVid').srcObject = st;
      }).catch(function () { if ($('plNo')) $('plNo').hidden = false; });
    } else $('plNo').hidden = false;
  }

  /* ============================ النافق والسبلة ============================ */
  function viewDisposal() {
    var mgr = S.session.user.isManager;
    $('main').innerHTML = '<section class="view">' + v5Head('النافق والسبلة', 'box', 'سجل يومي للنافق وطريقة التخلص منه وخروج السبلة. النظام ينبه عند ارتفاع النفوق المفاجئ، ويمنع سيارة السبلة أو النافق وسائقها من دخول أي منطقة نظيفة ' + esc((S.ref && S.ref.settings.LITTER_BLOCK_HOURS) || 24) + ' ساعة تلقائياً.', mgr ? '' : '<a class="btn" href="#gate">' + icon('back') + ' البوابة</a>') + '<div id="v5Out">' + v5Spin() + '</div></section>';
    v5Load('disposals', [14], drawDisposal, 'سجل النافق والسبلة');
  }
  function miniBars(days, spike) {
    var max = Math.max(10, Math.max.apply(null, days)), w = 8, g = 3, H = 34;
    return '<svg class="mbars" viewBox="0 0 ' + (days.length * (w + g)) + ' ' + H + '" dir="ltr">' + days.map(function (v, i) { var h = Math.max(1.5, v / max * (H - 2)); return '<rect x="' + i * (w + g) + '" y="' + (H - h) + '" width="' + w + '" height="' + h + '" rx="2" fill="' + (i === days.length - 1 ? (spike ? 'var(--r-crit)' : 'var(--ink-2)') : 'var(--line-2)') + '"><title>' + v + '</title></rect>'; }).join('') + '</svg>';
  }
  function drawDisposal(d) {
    var out = $('v5Out'); if (!out) return;
    var mgr = S.session.user.isManager, sites = mgr ? myScopeSites() : gateSites(), items = S.ref ? S.ref.items : [];
    var veh = items.filter(function (i) { return i.kind === 'مركبة'; }), drv = items.filter(function (i) { return i.kind === 'سائق'; });
    var spikes = d.bySite.filter(function (s) { return s.spike; });
    var html = kpiRow([['k-bad', 'box', d.totals.today, 'نافق اليوم'], ['k-warn', 'list', d.totals.dead, 'نافق آخر ' + d.days + ' يوماً'], ['k-ok', 'truck', d.totals.litterTons + ' طن', 'سبلة خرجت'], ['k-bad', 'lock', d.blocked.length, 'مركبات ممنوعة الآن']]);
    spikes.forEach(function (s) { html += '<div class="cc-alert a-bad">' + icon('alert') + '<span><b>نفوق مرتفع في «' + esc(s.name) + '»</b>: ' + s.today + ' طائر اليوم مقابل متوسط ' + s.avg + ' يومياً. أُبلغ المدير والطبيب البيطري. المطلوب سحب عينات ومنع خروج الأفراد والمعدات لمواقع أخرى حتى التشخيص.</span></div>'; });
    html += '<div class="grid-2"><form class="card stack" id="dpForm"><div class="card-head"><h2>' + icon('plus') + ' تسجيل جديد</h2></div>' +
      '<div class="seg dp-seg" role="group"><button type="button" data-k="نافق" class="on">' + icon('box') + ' نافق</button><button type="button" data-k="سبلة">' + icon('truck') + ' سبلة</button></div>' +
      '<div class="field"><label for="dpSite">الموقع</label><select id="dpSite">' + siteOptions(sites, S.siteId) + '</select></div>' +
      '<div class="row"><div class="field grow" id="dpCountW"><label for="dpCount">عدد الطيور النافقة</label><input id="dpCount" type="number" min="0" inputmode="numeric" placeholder="0"></div><div class="field grow"><label for="dpWeight">الوزن بالكيلو</label><input id="dpWeight" type="number" min="0" inputmode="numeric" placeholder="اختياري للنافق"></div></div>' +
      '<div class="field"><label for="dpMethod">طريقة التخلص</label><select id="dpMethod">' + d.methods.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="row"><div class="field grow"><label for="dpVeh">المركبة الناقلة (إن خرج من الموقع)</label><select id="dpVeh"><option value="">بدون مركبة</option>' + veh.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + (i.plate ? ' · ' + esc(i.plate) : '') + '</option>'; }).join('') + '</select></div><div class="field grow"><label for="dpDrv">السائق</label><select id="dpDrv"><option value="">—</option>' + drv.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<span class="hint xs muted" id="dpHint">المركبة والسائق يُمنعان من دخول أي منطقة نظيفة ' + d.blockHours + ' ساعة، وترفضهما كل البوابات تلقائياً.</span>' +
      '<div class="field"><label for="dpNote">ملاحظات</label><input id="dpNote" type="text" placeholder="مثال: العنبر 4، أعراض تنفسية"></div>' +
      '<button class="btn primary big" type="submit">' + icon('check') + ' تسجيل</button></form>' +
      '<div class="stack"><div class="card"><div class="card-head"><div><span class="kick">ممنوعة من المناطق النظيفة</span><h2>' + icon('lock') + ' مركبات السبلة والنافق</h2></div></div><div class="list">' +
      (d.blocked.length ? d.blocked.map(function (b) { return '<div class="li"><span class="av" style="background:var(--bad-soft);color:var(--bad)">' + icon('truck') + '</span><div class="t"><b>' + esc(b.vehicleName) + ' <span class="mono xs">' + esc(b.vehicleId) + '</span></b><span>نقل ' + esc(b.kind) + ' من ' + esc(b.siteName) + '</span></div><div class="meta"><span class="pill p-bad">ممنوعة ' + esc(left(b.until)) + '</span><span>' + esc(fmt(b.until)) + '</span></div></div>'; }).join('') : '<p class="empty">' + icon('check') + 'لا توجد مركبات ممنوعة الآن</p>') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><span class="kick">آخر ' + d.days + ' يوماً</span><h2>' + icon('shield') + ' طرق التخلص من النافق</h2></div></div>' + (function () { var tot = Object.keys(d.methodTotals).reduce(function (a, k) { return a + d.methodTotals[k]; }, 0) || 1; return Object.keys(d.methodTotals).map(function (k) { return '<div class="dp-m"><span>' + esc(k) + '</span>' + bar(d.methodTotals[k] / tot * 100, 'var(--ink-2)') + '<b class="mono">' + d.methodTotals[k] + '</b></div>'; }).join('') || '<p class="empty">لا توجد بيانات</p>'; })() + '</div></div></div>';
    html += '<div class="card"><div class="card-head"><div><span class="kick">النافق اليومي · آخر ' + d.days + ' يوماً · العمود الأخير اليوم</span><h2>' + icon('dash') + ' النفوق حسب الموقع</h2></div><span class="sub">تنبيه تلقائي عند تجاوز ضعف متوسط آخر 7 أيام (30 طائراً على الأقل)</span></div><div class="dp-sites">' +
      (d.bySite.length ? d.bySite.map(function (s) { return '<div class="dp-site' + (s.spike ? ' spike' : '') + '"><div class="t"><b>' + esc(shortSite(s.name)) + '</b><span>متوسط ' + s.avg + ' يومياً · إجمالي ' + s.total + '</span></div>' + miniBars(s.days, s.spike) + '<div class="dp-today"><b class="mono">' + s.today + '</b><span>' + (s.spike ? '<span class="pill p-bad">نفوق مرتفع</span>' : 'اليوم') + '</span></div></div>'; }).join('') : '<p class="empty">لا يوجد نافق مسجل</p>') + '</div></div>';
    html += '<div class="card"><div class="card-head"><h2>' + icon('list') + ' آخر السجلات</h2></div><div class="tbl"><table><thead><tr><th>الوقت</th><th>الموقع</th><th>النوع</th><th>العدد / الوزن</th><th>التخلص</th><th>المركبة</th><th>سجّله</th></tr></thead><tbody>' +
      d.rows.slice(0, 30).map(function (r) { return '<tr><td>' + esc(fmt(r.time)) + '</td><td>' + esc(shortSite(r.siteName)) + '</td><td><span class="pill ' + (r.kind === 'نافق' ? 'p-n' : 'p-warn') + '">' + esc(r.kind) + '</span></td><td class="mono">' + (r.kind === 'نافق' ? r.count + ' طائر' : (r.weight / 1000).toFixed(1) + ' طن') + '</td><td class="small">' + esc(r.method) + '</td><td class="small">' + esc(r.vehicleName || '—') + '</td><td class="small muted">' + esc(r.by) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    out.innerHTML = html;
    var kind = 'نافق';
    out.querySelectorAll('.dp-seg button').forEach(function (b) { b.onclick = function () { kind = b.dataset.k; out.querySelectorAll('.dp-seg button').forEach(function (x) { x.classList.toggle('on', x === b); }); $('dpCountW').hidden = kind === 'سبلة'; $('dpWeight').placeholder = kind === 'سبلة' ? 'مثال: 6000' : 'اختياري للنافق'; if (kind === 'سبلة') $('dpMethod').value = 'سيارة سبلة خارجية مرخصة'; }; });
    $('dpForm').onsubmit = function (e) {
      e.preventDefault();
      var r = { id: 'DP' + uid(), siteId: $('dpSite').value, kind: kind, count: $('dpCount').value, weight: $('dpWeight').value, method: $('dpMethod').value, vehicleId: $('dpVeh').value, driverId: $('dpDrv').value, note: $('dpNote').value };
      var b = this.querySelector('[type=submit]'); b.disabled = true;
      act('disposalAdd', [r]).then(function (x) {
        var res = x.data || {};
        if (res.spike) openSheet('<div class="sheet-head sh-bad"><span class="permit">وصل تنبيه فوري للمدير والطبيب البيطري</span><div class="big-ico">' + icon('alert') + '</div><h2>نفوق مرتفع</h2><p>' + res.spike.today + ' طائر اليوم مقابل متوسط ' + res.spike.avg + '</p></div><div class="sheet-body"><ul class="bd-acts">' + ['أبلغ الطبيب البيطري فوراً لسحب عينات', 'لا يخرج أي فرد أو معدة من الموقع إلى موقع آخر حتى التشخيص', 'افصل العنبر المصاب وراقب الأكل والمياه والأعراض التنفسية', 'تخلص من النافق داخل الموقع بالمحرقة أو حفرة التحلل المغلقة'].map(function (t) { return '<li>' + icon('check') + t + '</li>'; }).join('') + '</ul><button class="btn primary big" data-a="close">فهمت</button></div>', function () { closeSheet(); });
        else toast(x.queued ? 'حُفظ التسجيل ويُرسل عند عودة الاتصال' : r.vehicleId ? 'سُجل، والمركبة ممنوعة من المناطق النظيفة ' + d.blockHours + ' ساعة' : 'تم التسجيل');
        return sync();
      }).then(function () { if (S.route === 'disposal') viewDisposal(); }).catch(function (x) { b.disabled = false; toast(errText(x)); });
    };
  }

  /* ============================ شركات النقل والمقاولون ============================ */
  var GRADE_C = { a: 'var(--r-low)', b: 'var(--ok)', c: 'var(--r-mid)', d: 'var(--r-crit)', n: 'var(--muted)' };
  function viewCompanies() {
    S.coDays = S.coDays || 30;
    $('main').innerHTML = '<section class="view">' + v5Head('شركات النقل والمقاولون', 'truck', 'تقييم تلقائي لكل شركة من سجل حركة أفرادها ومركباتها على البوابات. التقييم يصل للمشتريات أول كل شهر، وإيقاف الشركة يمنع كل أفرادها ومركباتها من كل البوابات فوراً.',
      '<div class="bd-seg light" id="coDays"><button type="button" data-d="30" class="' + (S.coDays === 30 ? 'on' : '') + '">آخر 30 يوماً</button><button type="button" data-d="90" class="' + (S.coDays === 90 ? 'on' : '') + '">آخر 90 يوماً</button></div>') + '<div id="v5Out">' + v5Spin() + '</div></section>';
    $('coDays').onclick = function (e) { var b = e.target.closest('[data-d]'); if (b) { S.coDays = +b.dataset.d; viewCompanies(); } };
    v5Load('companies', [S.coDays], drawCompanies, 'تقييم الشركات');
  }
  function drawCompanies(d) {
    var out = $('v5Out'); if (!out) return;
    var rated = d.list.filter(function (c) { return c.score != null; }), susp = d.list.filter(function (c) { return c.status === 'موقوف'; });
    var avg = rated.length ? Math.round(rated.reduce(function (a, c) { return a + c.score; }, 0) / rated.length) : '—';
    var html = kpiRow([['k-ok', 'truck', d.list.length, 'شركة ومقاول'], ['k-ok', 'shield', avg, 'متوسط درجة الالتزام'], ['k-bad', 'lock', susp.length, 'موقوفة من البوابات'], ['k-warn', 'alert', rated.filter(function (c) { return c.score < 75; }).length, 'تحتاج متابعة']]);
    html += '<div class="card co-mail"><div>' + icon('mail') + '<span><b>التقرير الشهري للمشتريات</b>' + (d.purchasing ? 'يُرسل تلقائياً أول كل شهر إلى <span class="mono">' + esc(d.purchasing) + '</span>' : 'أضف إيميل المشتريات في الإعدادات (PURCHASING_EMAIL) ليصلهم الترتيب أول كل شهر') + '</span></div>' + (d.canEdit ? '<button class="btn sm" type="button" id="coSend">' + icon('send') + ' إرسال الآن</button>' : '') + '</div>';
    html += '<div class="co-grid">' + d.list.map(function (c) {
      var s = c.stats, gc = GRADE_C[c.grade.k], mem = d.members.filter(function (m) { return m.company === c.id; }), stop = c.status === 'موقوف';
      return '<article class="co-card' + (stop ? ' stop' : '') + '"><div class="co-top"><span class="co-rank mono">' + (c.rank ? '#' + c.rank : '—') + '</span><div class="co-ring" style="--c:' + gc + '">' + ring(c.score == null ? 0 : c.score, 70, 7, gc, 'درجة الالتزام') + '<b class="mono">' + (c.score == null ? '—' : c.score) + '</b></div>' +
        '<div class="co-t"><b>' + esc(c.name) + '</b><span>' + esc([c.type, c.contact].filter(Boolean).join(' · ')) + '</span><div class="chips"><span class="pill" style="background:color-mix(in srgb,' + gc + ' 15%,transparent);color:' + gc + '">' + esc(c.grade.label) + '</span><span class="pill ' + (stop ? 'p-bad' : 'p-ok') + '">' + (stop ? icon('lock') + ' موقوفة' : 'نشطة') + '</span>' + (c.trend != null && c.trend !== 0 ? '<span class="pill ' + (c.trend > 0 ? 'p-ok' : 'p-bad') + '">' + (c.trend > 0 ? '▲ ' : '▼ ') + Math.abs(c.trend) + '</span>' : '') + '</div></div></div>' +
        (stop ? '<div class="warnbox" style="background:var(--bad-soft);color:var(--bad)">' + icon('lock') + ' ممنوعة من كل البوابات: ' + esc(c.reason) + '</div>' : '') +
        '<div class="co-stats">' + [['محاولات دخول', s.attempts], ['مطابق', s.ok], ['مرفوض', s.denied], ['استثنائي', s.overrides], ['مخالفات', s.flags], ['يدوي', s.manual], ['مأموريات متأخرة', s.late], ['نقلات سبلة', s.litter]].map(function (x) { return '<div><b class="mono">' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('') + '</div>' +
        '<div class="co-mem">' + (mem.length ? mem.map(function (m) { return '<span class="chip">' + icon(kindIcon(m.kind)) + ' ' + esc(m.plate || m.id) + '</span>'; }).join('') : '<span class="xs muted">لم يُربط أي فرد أو مركبة بالشركة بعد</span>') + '</div>' +
        (d.canEdit ? '<div class="row" style="justify-content:flex-end">' + (stop ? '<button class="btn sm ok" type="button" data-co="' + esc(c.id) + '" data-st="نشط">' + icon('check') + ' إعادة التفعيل</button>' : '<button class="btn sm bad" type="button" data-co="' + esc(c.id) + '" data-st="موقوف">' + icon('lock') + ' إيقاف من كل البوابات</button>') + '</div>' : '') + '</article>';
    }).join('') + '</div><p class="xs muted">الدرجة = نسبة الدخول المطابق للقواعد من أول مرة، مع خصم للمخالفات (8) والدخول الاستثنائي (3) والمأموريات المتأخرة (3) والدخول اليدوي بدون كارت (2). اربط الأفراد والمركبات بكود الشركة من «البيانات ← الأفراد والمركبات».</p>';
    out.innerHTML = html;
    if ($('coSend')) $('coSend').onclick = function () { var b = this; b.disabled = true; remote('companyReportNow', [S.session.pin]).then(function (r) { toast(r.sent ? 'أُرسل التقييم إلى ' + r.to : 'أضف إيميل المشتريات في الإعدادات أولاً'); b.disabled = false; }).catch(function (e) { b.disabled = false; toast(errText(e)); }); };
    out.querySelectorAll('[data-co]').forEach(function (b) {
      b.onclick = function () {
        var c = d.list.filter(function (x) { return x.id === b.dataset.co; })[0], stop = b.dataset.st === 'موقوف';
        openSheet('<div class="sheet-head ' + (stop ? 'sh-bad' : 'sh-ok') + '"><div class="big-ico">' + icon(stop ? 'lock' : 'check') + '</div><h2>' + (stop ? 'إيقاف ' : 'إعادة تفعيل ') + esc(c.name) + '</h2></div><div class="sheet-body">' +
          '<p>' + (stop ? 'كل أفراد ومركبات الشركة (' + d.members.filter(function (m) { return m.company === c.id; }).length + ') سيُرفض دخولهم من كل البوابات فوراً، ويصل قرار لكل البوابات وإشعار للمديرين.' : 'يعود أفراد ومركبات الشركة للدخول وفق قواعد العزل المعتادة.') + '</p>' +
          (stop ? '<div class="field"><label for="coWhy">سبب الإيقاف</label><textarea id="coWhy" rows="2" placeholder="مثال: سائق دخل بدون تطهير مرتين هذا الأسبوع"></textarea></div>' : '') +
          '<button class="btn ' + (stop ? 'bad' : 'ok') + ' big" data-a="go">' + (stop ? 'إيقاف الآن' : 'إعادة التفعيل') + '</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a) {
          if (a !== 'go') return closeSheet();
          remote('setCompanyStatus', [S.session.pin, c.id, b.dataset.st, $('coWhy') ? $('coWhy').value : '']).then(function () { closeSheet(); toast(stop ? 'أُوقفت الشركة من كل البوابات ووصل القرار للأمن' : 'أُعيد تفعيل الشركة'); return sync(); }).then(viewCompanies).catch(function (e) { toast(errText(e)); });
        });
      };
    });
  }

  /* ============================ التدقيق الداخلي والإجراءات التصحيحية ============================ */
  function daysTxt(ms) { var dd = Math.round((ms - Date.now()) / 864e5); return dd === 0 ? 'اليوم' : dd > 0 ? 'بعد ' + plural(dd, 'يوم', 'أيام') : 'متأخر ' + plural(-dd, 'يوم', 'أيام'); }
  function scoreC(s) { return s == null ? 'var(--muted)' : s >= 90 ? 'var(--r-low)' : s >= 75 ? 'var(--r-mid)' : s >= 60 ? 'var(--r-high)' : 'var(--r-crit)'; }
  function viewInspect(args) {
    if (args[0] === 'new') return inspectForm(args[1]);
    $('main').innerHTML = '<section class="view">' + v5Head('التدقيق الداخلي والإجراءات التصحيحية', 'clip', 'زيارة تدقيق دورية لكل موقع بقائمة هابرد للأمن الحيوي. كل بند غير مطابق يتحول تلقائياً لإجراء تصحيحي له مسؤول وموعد، مع تذكير قبل الموعد بيوم وتصعيد عند التأخير.') + '<div id="v5Out">' + v5Spin() + '</div></section>';
    v5Load('inspections', [], function (d) { S.insp = d; drawInspect(d); }, 'التدقيق الداخلي');
  }
  function capaCard(a, canAct) {
    var late = a.late, done = a.status === 'مغلق';
    return '<article class="capa' + (late ? ' late' : '') + (done ? ' done' : '') + '"><div class="spread"><b>' + icon('pin') + ' ' + esc(shortSite(a.siteName)) + '</b>' + (done ? '<span class="pill p-ok">' + icon('check') + ' أُغلق ' + esc(fmt(a.closedAt)) + '</span>' : '<span class="pill ' + (late ? 'p-bad' : a.due - Date.now() < 864e5 ? 'p-warn' : 'p-n') + '">' + icon('clock') + ' ' + esc(daysTxt(a.due)) + '</span>') + '</div>' +
      '<p class="capa-f">' + esc(a.finding) + '</p><p class="capa-a">' + icon('tool') + ' ' + esc(a.action) + '</p>' +
      '<div class="capa-m"><span>' + icon('user') + ' ' + esc(a.owner) + '</span><span>الموعد ' + esc(fmt(a.due)) + '</span><span class="pill ' + (done ? 'p-ok' : a.status === 'جارٍ التنفيذ' ? 'p-info' : 'p-n') + '">' + esc(a.status) + '</span></div>' +
      (done && a.closeNote ? '<p class="small muted">' + icon('check') + ' ' + esc(a.closeNote) + '</p>' : '') +
      (!done && canAct ? '<div class="row" style="justify-content:flex-end">' + (a.status !== 'جارٍ التنفيذ' ? '<button class="btn sm" type="button" data-cp="' + esc(a.id) + '" data-st="جارٍ التنفيذ">بدأ التنفيذ</button>' : '') + '<button class="btn sm ok" type="button" data-cp="' + esc(a.id) + '" data-st="مغلق">' + icon('check') + ' إغلاق الإجراء</button></div>' : '') + '</article>';
  }
  function drawInspect(d) {
    var out = $('v5Out'); if (!out) return;
    var k = d.kpi, html = kpiRow([['k-ok', 'shield', k.avg == null ? '—' : k.avg + '%', 'متوسط درجات التدقيق · 90 يوماً'], ['k-warn', 'calendar', k.due, 'مواقع مستحق تدقيقها'], ['k-warn', 'list', k.open, 'إجراءات تصحيحية مفتوحة'], ['k-bad', 'clock', k.late, 'إجراءات متأخرة']]);
    if (k.late) html += '<div class="cc-alert a-bad">' + icon('clock') + '<span><b>' + plural(k.late, 'إجراء تصحيحي متأخر', 'إجراءات تصحيحية متأخرة') + '</b> عن موعدها. يصل تذكير يومي للمسؤول وتصعيد للمدير حتى الإغلاق.</span></div>';
    html += '<div class="card"><div class="card-head"><div><span class="kick">كل ' + d.every + ' يوماً لكل موقع</span><h2>' + icon('calendar') + ' جدول زيارات التدقيق</h2></div>' + (k.onTime != null ? '<span class="sub">إغلاق الإجراءات في موعدها: <b class="mono">' + k.onTime + '%</b></span>' : '') + '</div><div class="aud-tiles">' +
      d.sites.map(function (s) { var sc = s.last ? s.last.score : null; return '<div class="aud-tile' + (s.overdue && s.last ? ' due' : (!s.last ? ' first' : '')) + '"><div class="spread"><b>' + esc(shortSite(s.name)) + '</b>' + (s.last ? '<span class="aud-sc mono" style="--c:' + scoreC(sc) + '">' + sc + '%</span>' : '<span class="pill p-n">لم يُدقق</span>') + '</div><span class="xs muted">' + (s.last ? 'آخر زيارة ' + esc(ago(s.last.time)) + ' · ' + s.last.nc + ' ملاحظة' : 'لا توجد زيارة سابقة') + '</span>' +
        '<div class="spread"><span class="pill ' + (!s.last ? 'p-warn' : s.overdue ? 'p-bad' : 'p-n') + '">' + (!s.last ? 'أول تدقيق مطلوب' : s.overdue ? 'مستحق الآن' : 'التالي ' + esc(daysTxt(s.next))) + '</span>' + (s.open ? '<span class="pill ' + (s.late ? 'p-bad' : 'p-warn') + '">' + s.open + ' مفتوح' + (s.late ? ' · ' + s.late + ' متأخر' : '') + '</span>' : '') + '</div><button class="btn sm' + (s.overdue && s.last ? ' primary' : '') + '" type="button" data-new="' + esc(s.id) + '">' + icon('clip') + ' بدء تدقيق</button></div>'; }).join('') + '</div></div>';
    html += '<div class="card"><div class="card-head"><div><span class="kick">مرتبة حسب الموعد</span><h2>' + icon('tool') + ' الإجراءات التصحيحية المفتوحة</h2></div><span class="badge">' + d.open.length + '</span></div><div class="capa-grid">' + (d.open.length ? d.open.map(function (a) { return capaCard(a, true); }).join('') : '<p class="empty">' + icon('check') + 'لا توجد إجراءات مفتوحة</p>') + '</div></div>';
    html += '<div class="grid-2"><div class="card"><div class="card-head"><h2>' + icon('clip') + ' آخر زيارات التدقيق</h2></div><div class="list">' + (d.recent.length ? d.recent.map(function (r) { return '<div class="li"><span class="aud-sc mono" style="--c:' + scoreC(r.score) + '">' + r.score + '%</span><div class="t"><b>' + esc(r.siteName) + '</b><span>' + esc(r.auditor) + ' · ' + plural(r.nc, 'ملاحظة', 'ملاحظات') + (r.note ? ' · ' + esc(r.note) : '') + '</span></div><div class="meta"><span>' + esc(fmt(r.time)) + '</span></div></div>'; }).join('') : '<p class="empty">لا توجد زيارات بعد</p>') + '</div></div>' +
      '<div class="card"><div class="card-head"><h2>' + icon('check') + ' أُغلقت مؤخراً</h2></div><div class="capa-grid one">' + (d.closed.length ? d.closed.slice(0, 5).map(function (a) { return capaCard(a, false); }).join('') : '<p class="empty">لا توجد</p>') + '</div></div></div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-new]').forEach(function (b) { b.onclick = function () { go('inspect/new/' + b.dataset.new); }; });
    out.querySelectorAll('[data-cp]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.st !== 'مغلق') return remote('actionUpdate', [S.session.pin, b.dataset.cp, { status: b.dataset.st }]).then(function () { toast('تم التحديث'); viewInspect([]); }).catch(function (e) { toast(errText(e)); });
        openSheet('<div class="sheet-head sh-ok"><div class="big-ico">' + icon('check') + '</div><h2>إغلاق الإجراء التصحيحي</h2></div><div class="sheet-body"><div class="field"><label for="cpNote">ما الذي تم تنفيذه؟</label><textarea id="cpNote" rows="3" placeholder="مثال: تم إصلاح الشبك في العنابر 2 و5 والتحقق بالصور"></textarea></div><button class="btn ok big" data-a="go">إغلاق</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a) {
          if (a !== 'go') return closeSheet();
          remote('actionUpdate', [S.session.pin, b.dataset.cp, { status: 'مغلق', closeNote: $('cpNote').value }]).then(function () { closeSheet(); toast('أُغلق الإجراء'); viewInspect([]); }).catch(function (e) { toast(errText(e)); });
        });
      };
    });
  }
  function inspectForm(siteId) {
    var site = (S.ref ? S.ref.sites : []).filter(function (s) { return s.id === siteId; })[0];
    if (!site) return go('inspect');
    var ans = {};
    $('main').innerHTML = '<section class="view">' + v5Head('تدقيق «' + esc(site.name) + '»', 'clip', 'أجب على كل بند بالمعاينة الفعلية. «غير مطابق» يطلب ملاحظة قصيرة ويتحول لإجراء تصحيحي تلقائياً.', '', ['inspect', 'التدقيق الداخلي']) + '<div id="v5Out">' + v5Spin() + '</div></section>';
    var draw = function (d) {
      var html = d.checklist.map(function (sec, si) {
        return '<div class="card aud-secc"><div class="card-head"><h2><span class="aud-n mono">' + (si + 1) + '</span> ' + esc(sec.sec) + '</h2></div>' + sec.items.map(function (it) {
          return '<div class="aud-q" data-k="' + it.k + '"><p><span class="mono xs muted">' + it.k + '</span> ' + esc(it.t) + '</p><div class="aud-btns"><button type="button" data-v="y">' + icon('check') + ' مطابق</button><button type="button" data-v="n">' + icon('x') + ' غير مطابق</button><button type="button" data-v="na">لا ينطبق</button></div><input class="aud-note" type="text" placeholder="ما الملاحظة بالتحديد؟ (العنبر، المكان...)" hidden></div>';
        }).join('') + '</div>';
      }).join('');
      html += '<div class="aud-foot"><div class="aud-live"><b class="mono" id="auScore">—</b><span id="auCnt">لم تبدأ بعد</span></div><div class="field"><label for="auOwner">مسؤول الإجراءات</label><input id="auOwner" type="text" placeholder="مدير ' + esc(shortSite(site.name)) + '"></div><div class="field"><label for="auDays">مهلة التنفيذ</label><select id="auDays">' + [3, 7, 14, 30].map(function (n) { return '<option value="' + n + '"' + (n === d.capaDays ? ' selected' : '') + '>' + plural(n, 'يوم', 'أيام') + '</option>'; }).join('') + '</select></div><button class="btn primary big" type="button" id="auSave">' + icon('check') + ' حفظ التدقيق</button></div>';
      $('v5Out').innerHTML = html;
      function live() {
        var y = 0, n = 0; Object.keys(ans).forEach(function (k) { if (ans[k].v === 'y') y++; else if (ans[k].v === 'n') n++; });
        $('auScore').textContent = y + n ? Math.round(100 * y / (y + n)) + '%' : '—'; $('auScore').style.color = y + n ? scoreC(Math.round(100 * y / (y + n))) : '';
        $('auCnt').textContent = (y + n) + ' بنداً · ' + n + ' غير مطابق';
      }
      $('v5Out').querySelectorAll('.aud-q').forEach(function (q) {
        q.querySelectorAll('[data-v]').forEach(function (b) {
          b.onclick = function () { var k = q.dataset.k; ans[k] = { v: b.dataset.v, note: (ans[k] || {}).note || '' }; q.className = 'aud-q a-' + b.dataset.v; q.querySelector('.aud-note').hidden = b.dataset.v !== 'n'; if (b.dataset.v === 'n') q.querySelector('.aud-note').focus(); live(); };
        });
        q.querySelector('.aud-note').oninput = function () { (ans[q.dataset.k] = ans[q.dataset.k] || { v: 'n' }).note = this.value; };
      });
      $('auSave').onclick = function () {
        var b = this; b.disabled = true;
        remote('inspectionSave', [S.session.pin, { id: 'AU' + uid(), siteId: site.id, answers: ans, owner: $('auOwner').value, days: +$('auDays').value }]).then(function (r) {
          openSheet('<div class="sheet-head ' + (r.nc ? 'sh-warn' : 'sh-ok') + '"><span class="permit">' + esc(site.name) + '</span><div class="big-ico">' + icon(r.nc ? 'clip' : 'check') + '</div><h2>درجة التدقيق ' + r.score + '%</h2><p>' + (r.nc ? 'أُنشئ ' + plural(r.nc, 'إجراء تصحيحي', 'إجراءات تصحيحية') + ' موعدها ' + esc(fmt(r.due)) + '، ووصل إشعار للمسؤول والمدير' : 'كل البنود مطابقة') + '</p></div><div class="sheet-body"><button class="btn primary big" data-a="ok">متابعة الإجراءات</button></div>', function () { closeSheet(); go('inspect'); });
        }).catch(function (e) { b.disabled = false; toast(errText(e)); });
      };
    };
    if (S.insp) draw(S.insp); else v5Load('inspections', [], function (d) { S.insp = d; draw(d); }, 'التدقيق');
  }

  /* ============================ أكاديمية الأمن الحيوي ============================ */
  function viewAcademy() {
    $('main').innerHTML = '<section class="view">' + v5Head('أكاديمية الأمن الحيوي', 'grad', 'تأهيل إلزامي قصير للموظف الجديد من موبايله قبل تفعيل كارته، واختبار، وشهادة تظهر في جواز الأمن الحيوي، وتجديد كل 3 شهور، وسؤال أسبوعي للجميع.') + '<div id="v5Out">' + v5Spin() + '</div></section>';
    v5Load('academy', [], drawAcademy, 'الأكاديمية');
  }
  function drawAcademy(d) {
    var out = $('v5Out'); if (!out) return;
    var s = d.stats, link = d.selfUrl;
    var html = kpiRow([['k-ok', 'grad', s.pct + '%', 'أتموا التأهيل الإلزامي (' + s.done + ' من ' + s.staff + ')'], ['k-bad', 'lock', s.blocked, 'موظفون جدد ممنوعون حتى التدريب'], ['k-warn', 'refresh', s.refreshDue, 'يحتاجون التجديد ربع السنوي'], ['k-ok', 'check', s.avg30 == null ? '—' : s.avg30 + '%', 'متوسط درجات الاختبار · 30 يوماً']]);
    html += '<div class="cc-alert ' + (d.required ? 'a-warn' : 'a-bad') + '">' + icon(d.required ? 'shield' : 'alert') + '<span>' + (d.required ? '<b>التأهيل الإلزامي مفعّل</b>: أي موظف أو عامل أو سائق يُضاف من الآن لا تُدخله البوابات قبل اجتياز الاختبار بـ ' + d.passMark + '%، ولا يتأثر الموظفون المسجلون قبل التفعيل.' : '<b>التأهيل الإلزامي غير مفعّل</b>. فعّله من الإعدادات: ACADEMY_REQUIRED = نعم') + '</span></div>';
    var w = d.weekly;
    html += '<div class="grid-2"><div class="card ac-link"><div class="card-head"><div><span class="kick">بدون رقم سري · من موبايل الموظف</span><h2>' + icon('link') + ' رابط التدريب للموظفين</h2></div></div>' +
      (link ? '<div class="ac-url mono" dir="ltr">' + esc(link) + '</div><div class="row"><button class="btn" type="button" id="acCopy">' + icon('copy') + ' نسخ</button><a class="btn wa" target="_blank" rel="noopener" href="' + esc(waLink('🎓 أكاديمية الأمن الحيوي · ' + (CFG.COMPANY || 'كايرو ثري إيه') + '\nالتأهيل الإلزامي قبل تفعيل كارتك (12 دقيقة):\n' + link + '\nادخل بكودك ورقم هاتفك.')) + '">' + icon('wa') + ' إرسال على واتساب</a></div>' : '<div class="warnbox">أضف رابط التطبيق في الإعدادات (APP_URL) ليظهر الرابط هنا.</div>') +
      '<p class="small muted">الموظف يدخل بكوده ورقم هاتفه، يقرأ الدروس القصيرة، ويجتاز الاختبار، فيتفعل كارته على البوابات فوراً ويصل إشعار للمدير.</p>' + (MODE === 'demo' ? '<button class="btn primary" type="button" id="acTry">' + icon('grad') + ' جرّب صفحة الموظف (E007)</button>' : '') + '</div>' +
      '<div class="card ac-week"><div class="card-head"><div><span class="kick">سؤال الأسبوع · يظهر لكل البوابات</span><h2>' + icon('book') + ' هل يعرف فريقك الإجابة؟</h2></div></div><b class="ac-q">' + esc(w.q) + '</b><div class="ac-opts">' + w.a.map(function (o, i) { return '<button type="button" class="ac-opt" data-i="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div><p class="small muted" id="acWhy" hidden>' + esc(w.why) + '</p></div></div>';
    html += '<div class="grid-2"><div class="card"><div class="card-head"><div><span class="kick">أُضيفوا ولم يجتازوا التأهيل</span><h2>' + icon('lock') + ' ممنوعون من البوابات حتى التدريب</h2></div></div><div class="list">' +
      (d.blocked.length ? d.blocked.map(function (b) { return '<div class="li"><span class="av" style="background:var(--bad-soft);color:var(--bad)">' + icon('user') + '</span><div class="t"><b>' + esc(b.name) + ' <span class="mono xs">' + esc(b.id) + '</span></b><span>' + esc([b.kind, b.dept].filter(Boolean).join(' · ')) + ' · أُضيف ' + esc(ago(b.added)) + '</span></div><div class="meta row" style="gap:6px">' + (link ? '<a class="btn sm wa" target="_blank" rel="noopener" href="' + esc(waLink('مرحباً ' + b.name + '، كارتك سيتفعل بعد التأهيل الإلزامي للأمن الحيوي (12 دقيقة) من هذا الرابط:\n' + link + '\nالكود: ' + b.id)) + '">' + icon('wa') + '</a>' : '') + (d.canRecord ? '<button class="btn sm" type="button" data-rec="' + esc(b.id) + '">تدريب حضوري</button>' : '') + '</div></div>'; }).join('') : '<p class="empty">' + icon('check') + 'كل الموظفين الجدد اجتازوا التأهيل</p>') + '</div></div>' +
      '<div class="card"><div class="card-head"><h2>' + icon('user') + ' الإتمام حسب الإدارة</h2></div>' + d.depts.map(function (x) { var p = x.total ? Math.round(100 * x.done / x.total) : 0; return '<div class="dp-m"><span>' + esc(x.name) + '</span>' + bar(p, p >= 90 ? 'var(--r-low)' : p >= 70 ? 'var(--r-mid)' : 'var(--r-crit)') + '<b class="mono">' + p + '%</b></div>'; }).join('') + '</div></div>';
    html += '<div class="card"><div class="card-head"><h2>' + icon('grad') + ' البرامج التدريبية</h2></div><div class="ac-mods">' + d.modules.map(function (m) {
      return '<details class="ac-mod"><summary><span class="ac-mi">' + icon(m.id === 'DRV' ? 'truck' : m.id === 'REF' ? 'refresh' : 'shield') + '</span><span class="t"><b>' + esc(m.title) + '</b><span>' + esc(m.who) + ' · ' + m.minutes + ' دقيقة · ' + m.lessons.length + ' دروس · ' + m.quiz.length + ' أسئلة</span></span>' + (m.required ? '<span class="pill p-bad">إلزامي</span>' : '') + '</summary><ol>' + m.lessons.map(function (l) { return '<li><b>' + esc(l.t) + '</b><span>' + esc(l.p) + '</span></li>'; }).join('') + '</ol></details>';
    }).join('') + '</div></div>';
    html += '<div class="card"><div class="card-head"><h2>' + icon('list') + ' آخر النتائج</h2></div><div class="tbl"><table><thead><tr><th>الوقت</th><th>الاسم</th><th>البرنامج</th><th>الدرجة</th><th>النتيجة</th><th>الشهادة</th><th>الطريقة</th></tr></thead><tbody>' +
      d.recent.map(function (r) { return '<tr><td>' + esc(fmt(r.time)) + '</td><td><b>' + esc(r.itemName) + '</b> <span class="mono xs muted">' + esc(r.itemId) + '</span></td><td class="small">' + esc(r.title) + '</td><td class="mono">' + r.score + '%</td><td>' + (r.passed ? '<span class="pill p-ok">اجتاز</span>' : '<span class="pill p-bad">لم يجتز</span>') + '</td><td class="mono xs">' + esc(r.cert || '—') + '</td><td class="small muted">' + esc(r.via) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    out.innerHTML = html;
    if ($('acCopy')) $('acCopy').onclick = function () { copyText(link); };
    if ($('acTry')) $('acTry').onclick = function () { try { localStorage.setItem('bio-self', JSON.stringify({ code: 'E007', phone: '01098765432' })); } catch (e) {} showSelfTrain(); };
    out.querySelectorAll('.ac-opt').forEach(function (b) { b.onclick = function () { out.querySelectorAll('.ac-opt').forEach(function (x) { x.classList.add(+x.dataset.i === w.c ? 'ok' : x === b ? 'no' : 'dim'); }); $('acWhy').hidden = false; }; });
    out.querySelectorAll('[data-rec]').forEach(function (b) {
      b.onclick = function () {
        openSheet('<div class="sheet-head sh-ok"><div class="big-ico">' + icon('grad') + '</div><h2>تسجيل تدريب حضوري</h2></div><div class="sheet-body"><div class="field"><label for="trMod">البرنامج</label><select id="trMod">' + d.modules.map(function (m) { return '<option value="' + m.id + '">' + esc(m.title) + '</option>'; }).join('') + '</select></div><div class="field"><label for="trSc">درجة الاختبار الورقي %</label><input id="trSc" type="number" min="0" max="100" value="100"></div><button class="btn ok big" data-a="go">تسجيل</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a) {
          if (a !== 'go') return closeSheet();
          remote('academyRecord', [S.session.pin, b.dataset.rec, $('trMod').value, $('trSc').value]).then(function (r) { closeSheet(); toast(r.passed ? 'اجتاز · الشهادة ' + r.cert + ' · تفعّل كارته' : 'لم يجتز: الدرجة أقل من ' + d.passMark + '%'); viewAcademy(); }).catch(function (e) { toast(errText(e)); });
        });
      };
    });
  }
  /** صفحة الموظف: الدروس ثم الاختبار ثم الشهادة (بدون رقم سري) */
  function showSelfTrain() {
    stopCam();
    var who = null;
    try { who = JSON.parse(localStorage.getItem('bio-self') || 'null'); } catch (e) {}
    document.body.innerHTML = demoStrip() +
      '<div class="login self train"><div class="login-hero"><div class="logo">' + logoImg() + '</div><h1>أكاديمية الأمن الحيوي</h1><p>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + ' · التأهيل الإلزامي قبل تفعيل كارتك، والتجديد كل 3 شهور</p>' +
      '<ol class="self-steps"><li><b>1</b><span>ادخل بكودك ورقم هاتفك</span></li><li><b>2</b><span>اقرأ الدروس القصيرة (12 دقيقة)</span></li><li><b>3</b><span>اجتز الاختبار فيتفعل كارتك وتصلك الشهادة</span></li></ol>' +
      '<div class="login-feats"><span>' + icon('grad') + ' شهادة في جواز الأمن الحيوي</span><span>' + icon('shield') + ' بدون رقم سري</span></div></div>' +
      '<div class="login-side"><div class="login-card self-card" id="tCard"></div><p class="login-foot"><a href="#" id="tMission">' + icon('calendar') + ' تسجيل مأمورية</a> · <a href="#" id="tBack">دخول المديرين وأمن البوابات</a></p></div></div><div class="toasts" id="toasts"></div>';
    bindDemoStrip();
    $('tMission').onclick = function (e) { e.preventDefault(); window.BIO_START = 'mission'; try { history.replaceState(null, '', location.pathname + location.search); } catch (x) {} showSelfMission(); };
    $('tBack').onclick = function (e) { e.preventDefault(); window.BIO_START = ''; try { history.replaceState(null, '', location.pathname); } catch (x) { location.hash = ''; } if (S.session) location.reload(); else boot(); };
    var card = function (h) { $('tCard').innerHTML = h; window.scrollTo(0, 0); };
    function idStep(msg) {
      card('<div class="lc-title"><b>بياناتك</b><span class="small muted">الكود مكتوب على كارت الأمن الحيوي</span></div><form id="tId" class="stack"><div class="field"><label for="tCode">كود الموظف</label><input id="tCode" dir="ltr" required value="' + esc(who ? who.code : '') + '" placeholder="مثال: E007"></div><div class="field"><label for="tPhone">رقم هاتفك المحمول</label><input id="tPhone" type="tel" dir="ltr" required value="' + esc(who ? who.phone : '') + '" placeholder="01xxxxxxxxx"></div><div class="login-err" id="tErr">' + esc(msg || '') + '</div><button class="btn primary big" type="submit">متابعة ' + icon('chev') + '</button></form>' +
        (MODE === 'demo' ? '<div class="demo-pins"><span class="xs muted">للتجربة:</span><button type="button" id="tDemo"><span>عامل جديد لم يتدرب بعد (مثال)</span><b>E007</b></button></div>' : ''));
      if ($('tDemo')) $('tDemo').onclick = function () { $('tCode').value = 'E007'; $('tPhone').value = '01098765432'; };
      $('tId').onsubmit = function (e) {
        e.preventDefault(); var code = $('tCode').value.trim(), phone = $('tPhone').value.trim();
        $('tErr').innerHTML = '<span class="spin"></span>';
        remote('selfAcademy', [code, phone]).then(function (d) { who = { code: code, phone: phone }; try { localStorage.setItem('bio-self', JSON.stringify(who)); } catch (x) {} home(d); }).catch(function (x) { $('tErr').textContent = x.net ? 'لا يوجد اتصال بالإنترنت' : errText(x); });
      };
    }
    function home(d) {
      var done = {}; d.done.forEach(function (r) { done[r.module] = r; });
      card('<div class="self-me"><span class="avatar">' + icon('user') + '</span><div><b>' + esc(d.me.name) + '</b><span class="mono">' + esc(d.me.id) + (d.me.dept ? ' · ' + esc(d.me.dept) : '') + '</span></div><button type="button" class="btn sm ghost" id="tOut">تغيير</button></div>' +
        (d.blocked ? '<div class="acx-block">' + icon('lock') + '<div><b>كارتك غير مفعّل على البوابات بعد</b><span>اجتز «التأهيل الإلزامي» بـ ' + d.passMark + '% ليتفعل فوراً</span></div></div>' : done.IND ? '<div class="acx-okb">' + icon('check') + '<div><b>كارتك مفعّل</b><span>اجتزت التأهيل الإلزامي · شهادة ' + esc(done.IND.cert) + '</span></div></div>' : '') +
        '<div class="acx-mods">' + d.modules.map(function (m) {
          var r = done[m.id];
          return '<button type="button" class="acx-mod' + (r ? ' done' : m.required ? ' req' : '') + '" data-m="' + m.id + '"><span class="ac-mi">' + icon(r ? 'check' : m.id === 'DRV' ? 'truck' : m.id === 'REF' ? 'refresh' : 'shield') + '</span><span class="t"><b>' + esc(m.title) + '</b><span>' + m.minutes + ' دقيقة · ' + m.lessons.length + ' دروس · ' + m.quiz.length + ' أسئلة</span>' + (r ? '<span class="ok">' + icon('grad') + ' اجتزته ' + esc(ago(r.time)) + ' · ' + r.score + '%</span>' : '') + '</span>' + (m.required && !r ? '<span class="pill p-bad">إلزامي</span>' : icon('chev')) + '</button>';
        }).join('') + '</div>');
      $('tOut').onclick = function () { try { localStorage.removeItem('bio-self'); } catch (x) {} who = null; idStep(); };
      $('tCard').querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { lesson(d, d.modules.filter(function (m) { return m.id === b.dataset.m; })[0], 0); }; });
    }
    function prog(i, n, lbl) { return '<div class="acx-prog"><span>' + lbl + ' ' + (i + 1) + ' من ' + n + '</span><i><b style="width:' + Math.round(100 * (i + 1) / n) + '%"></b></i></div>'; }
    function lesson(d, m, i) {
      var L = m.lessons[i];
      card('<div class="acx-h"><button type="button" class="btn sm ghost" id="tHome">' + icon('back') + '</button><b>' + esc(m.title) + '</b></div>' + prog(i, m.lessons.length, 'الدرس') +
        (i === 0 && d.video ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(d.video) + '">' + icon('play') + ' شاهد فيديو التأهيل أولاً</a>' : '') +
        '<div class="acx-lesson"><span class="acx-ln mono">' + (i + 1) + '</span><h2>' + esc(L.t) + '</h2><p>' + esc(L.p) + '</p></div>' +
        '<div class="row">' + (i ? '<button class="btn big" type="button" id="tPrev">السابق</button>' : '') + '<button class="btn primary big grow" type="button" id="tNext">' + (i === m.lessons.length - 1 ? icon('check') + ' ابدأ الاختبار' : 'التالي ' + icon('chev')) + '</button></div>');
      $('tHome').onclick = function () { remote('selfAcademy', [who.code, who.phone]).then(home); };
      if ($('tPrev')) $('tPrev').onclick = function () { lesson(d, m, i - 1); };
      $('tNext').onclick = function () { if (i < m.lessons.length - 1) lesson(d, m, i + 1); else quiz(d, m, 0, []); };
    }
    function quiz(d, m, i, ans) {
      var Q = m.quiz[i];
      card('<div class="acx-h"><b>' + icon('clip') + ' اختبار: ' + esc(m.title) + '</b></div>' + prog(i, m.quiz.length, 'السؤال') + '<div class="acx-q"><h2>' + esc(Q.q) + '</h2><div class="acx-opts">' + Q.a.map(function (o, k) { return '<button type="button" class="acx-opt' + (ans[i] === k ? ' on' : '') + '" data-k="' + k + '"><span class="mono">' + 'أبج'.charAt(k) + '</span>' + esc(o) + '</button>'; }).join('') + '</div></div>' +
        '<div class="row">' + (i ? '<button class="btn big" type="button" id="tPrev">السابق</button>' : '') + '</div>');
      if ($('tPrev')) $('tPrev').onclick = function () { quiz(d, m, i - 1, ans); };
      $('tCard').querySelectorAll('[data-k]').forEach(function (b) {
        b.onclick = function () {
          ans[i] = +b.dataset.k; b.classList.add('on');
          setTimeout(function () {
            if (i < m.quiz.length - 1) return quiz(d, m, i + 1, ans);
            card('<p class="empty"><span class="spin"></span>جارٍ التصحيح...</p>');
            remote('selfQuiz', [who.code, who.phone, m.id, ans]).then(function (r) { result(d, m, r); }).catch(function (x) { toast(errText(x)); home(d); });
          }, 260);
        };
      });
    }
    function result(d, m, r) {
      var c = r.passed ? 'var(--r-low)' : 'var(--r-crit)', wrong = r.review.filter(function (x) { return !x.ok; });
      var share = '🎓 شهادة أكاديمية الأمن الحيوي · ' + (CFG.COMPANY || 'كايرو ثري إيه') + '\n' + r.title + '\nالاسم: ' + r.name + ' (' + r.id + ')\nالدرجة: ' + r.score + '%\nرقم الشهادة: ' + r.cert + '\nالتاريخ: ' + fmt(r.time);
      card('<div class="acx-res"><div class="co-ring" style="--c:' + c + '">' + ring(r.score, 110, 10, c, 'الدرجة') + '<b class="mono">' + r.score + '%</b></div><h2>' + (r.passed ? 'مبروك! اجتزت الاختبار' : 'لم تجتز هذه المرة') + '</h2><p class="small muted">' + (r.passed ? (m.required ? 'كارتك أصبح مفعلاً على البوابات الآن، ووصل إشعار للمدير.' : 'سُجلت الشهادة في جواز الأمن الحيوي.') : 'درجة النجاح ' + r.passMark + '%. راجع الإجابات ثم أعد الاختبار.') + '</p></div>' +
        (r.passed ? '<div class="acx-cert"><div class="acx-cb">' + logoImg() + '<div><b>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + '</b><span>أكاديمية الأمن الحيوي · شهادة اجتياز</span></div></div><h3>' + esc(r.title) + '</h3><dl><dt>الاسم</dt><dd>' + esc(r.name) + '</dd><dt>الكود</dt><dd class="mono">' + esc(r.id) + '</dd><dt>الدرجة</dt><dd class="mono">' + r.score + '%</dd><dt>التاريخ</dt><dd>' + esc(fmt(r.time)) + '</dd><dt>رقم الشهادة</dt><dd class="mono">' + esc(r.cert) + '</dd></dl></div><a class="btn wa big" target="_blank" rel="noopener" href="' + esc(waLink(share)) + '">' + icon('wa') + ' حفظ الشهادة على واتساب</a>' : '') +
        (wrong.length ? '<div class="acx-rev"><b>' + plural(wrong.length, 'إجابة خاطئة', 'إجابات خاطئة') + '</b>' + wrong.map(function (x) { return '<div><span>' + esc(x.q) + '</span><b>' + icon('check') + ' ' + esc(x.answer) + '</b><small>' + esc(x.why) + '</small></div>'; }).join('') + '</div>' : '') +
        '<div class="row">' + (!r.passed ? '<button class="btn primary big grow" type="button" id="tRe">' + icon('refresh') + ' أعد الاختبار</button>' : '') + '<button class="btn big grow" type="button" id="tHome">كل البرامج</button></div>');
      if ($('tRe')) $('tRe').onclick = function () { lesson(d, m, 0); };
      $('tHome').onclick = function () { remote('selfAcademy', [who.code, who.phone]).then(home); };
    }
    if (who && who.code && who.phone) remote('selfAcademy', [who.code, who.phone]).then(home).catch(function (x) { idStep(x.net ? '' : errText(x)); });
    else idStep();
  }

  /* ============================ النسخ الاحتياطي وسجل التعديلات ============================ */
  function viewBackup() {
    $('main').innerHTML = '<section class="view">' + v5Head('النسخ الاحتياطي وسجل التعديلات', 'history', 'نسخة كاملة من قاعدة البيانات كل ليلة في Google Drive (آخر 30 نسخة)، واسترجاع بضغطة، وسجل لكل تعديل: من غيّر ماذا ومتى، وما كان قبله وما أصبح بعده.') + '<div id="v5Out">' + v5Spin() + '</div></section>';
    S.chq = S.chq || {};
    Promise.all([remote('backups', [S.session.pin]), remote('changes', [S.session.pin, S.chq])]).then(function (r) { drawBackup(r[0], r[1]); }).catch(function (e) { $('v5Out').innerHTML = e.net ? offlineCard('النسخ الاحتياطي') : '<div class="card"><p class="empty">' + esc(errText(e)) + '</p></div>'; });
  }
  function colsOfSheet(name) { var o = {}; Object.keys(TABLES).forEach(function (t) { if (TABLES[t].sheet === name) o = TABLES[t].cols; }); return o; }
  var DIF_AR = { id: 'الكود', name: 'الاسم', kind: 'النوع', type: 'النوع', site: 'الموقع', siteId: 'الموقع', phone: 'الهاتف', plate: 'اللوحة', company: 'الشركة', companyId: 'الشركة', status: 'الحالة', reason: 'السبب', hours: 'ساعات العزل', dept: 'الإدارة', job: 'الوظيفة', active: 'نشط', lat: 'خط العرض', lng: 'خط الطول', value: 'القيمة', key: 'المفتاح', role: 'الدور', added: 'تاريخ الإضافة' };
  function diffHtml(c) {
    var b = {}, a = {}; try { b = c.before ? JSON.parse(c.before) : {}; } catch (e) { b = { '': c.before }; } try { a = c.after ? JSON.parse(c.after) : {}; } catch (e) { a = { '': c.after }; }
    var cols = colsOfSheet(c.table), keys = Object.keys(a).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); });
    if (!c.before && c.after) keys = Object.keys(a).slice(0, 4);
    if (c.before && !c.after) return '<span class="dif del">حُذف: ' + esc(b.name || b.id || c.key) + '</span>';
    return keys.slice(0, 5).map(function (k) { return '<span class="dif"><b>' + esc(cols[k] || DIF_AR[k] || k) + '</b> ' + (b[k] != null && c.before ? '<s>' + esc(String(b[k]).slice(0, 40)) + '</s> ← ' : '') + '<i>' + esc(String(a[k]).slice(0, 60)) + '</i></span>'; }).join('') || '<span class="xs muted">—</span>';
  }
  function drawBackup(bk, ch) {
    var out = $('v5Out'); if (!out) return;
    var html = '<div class="grid-2"><div class="card"><div class="card-head"><div><span class="kick">' + (bk.live ? 'Google Drive · مجلد «نسخ احتياطية - الأمن الحيوي»' : 'نسخة العرض: محاكاة لما سيظهر في Drive') + '</span><h2>' + icon('history') + ' النسخ الاحتياطية</h2></div><span class="pill p-ok">' + icon('check') + ' يومياً 2 فجراً · آخر ' + bk.keep + ' نسخة</span></div>' +
      '<div class="row"><button class="btn primary" type="button" id="bkNow">' + icon('download') + ' نسخة احتياطية الآن</button>' + (bk.folderUrl ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(bk.folderUrl) + '">' + icon('link') + ' فتح المجلد في Drive</a>' : '') + '</div><div class="list bk-list">' +
      bk.list.slice(0, 12).map(function (b, i) { return '<div class="li"><span class="av">' + icon(b.kind === 'يدوي' ? 'download' : b.kind === 'قبل الاسترجاع' ? 'shield' : 'history') + '</span><div class="t"><b>' + esc(b.name) + '</b><span>' + esc(fmt(b.time)) + (b.size ? ' · ' + (b.size / 1e6).toFixed(1) + ' م.ب' : '') + '</span></div><div class="meta row" style="gap:6px"><span class="pill ' + (b.kind === 'يدوي' ? 'p-info' : b.kind === 'قبل الاسترجاع' ? 'p-warn' : 'p-n') + '">' + esc(b.kind) + '</span>' + (i ? '<button class="btn sm" type="button" data-rs="' + esc(b.id) + '" data-n="' + esc(b.name) + '">استرجاع</button>' : '<span class="pill p-ok">الأحدث</span>') + '</div></div>'; }).join('') + '</div>' +
      '<p class="xs muted">الاسترجاع يأخذ نسخة أمان من الوضع الحالي أولاً، ثم يعيد كل الأوراق كما كانت وقت النسخة المختارة (عدا سجل التعديلات وأجهزة الإشعارات).</p></div>' +
      '<div class="card"><div class="card-head"><h2>' + icon('shield') + ' لماذا هذا مهم؟</h2></div><ul class="bd-acts">' + ['حذف أو تعديل خاطئ في الشيت يُسترجع في دقيقة', 'سجل التعديلات دليل للتدقيق الخارجي: كل تغيير باسم من قام به', 'تغيير قاعدة عزل أو إيقاف شركة أو إضافة موظف يظهر هنا فوراً', 'مجاني بالكامل داخل حساب Google نفسه'].map(function (t) { return '<li>' + icon('check') + t + '</li>'; }).join('') + '</ul></div></div>';
    html += '<div class="card"><div class="card-head"><div><span class="kick">' + plural(ch.total, 'تعديل مسجل', 'تعديلات مسجلة') + '</span><h2>' + icon('list') + ' سجل التعديلات</h2></div></div><div class="toolbar"><div class="search">' + icon('search') + '<input type="search" id="chText" placeholder="بحث بالاسم أو الكود أو المستخدم" value="' + esc(S.chq.text || '') + '"></div><select id="chTable" style="flex:0 1 240px"><option value="">كل الجداول</option>' + ch.tables.map(function (t) { return '<option' + (S.chq.table === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="tbl"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>الجدول</th><th>السجل</th><th>العملية</th><th>التغيير</th></tr></thead><tbody>' +
      (ch.list.length ? ch.list.map(function (c) { return '<tr><td class="small">' + esc(fmt(c.time)) + '</td><td><b class="small">' + esc(c.userName) + '</b></td><td class="small">' + esc(c.table) + '</td><td class="mono xs">' + esc(c.key) + '</td><td><span class="pill ' + (/حذف|إيقاف|استرجاع/.test(c.action) ? 'p-bad' : /إضافة/.test(c.action) ? 'p-ok' : 'p-info') + '">' + esc(c.action) + '</span></td><td class="ch-diff">' + diffHtml(c) + '</td></tr>'; }).join('') : '<tr><td colspan="6"><p class="empty">لا توجد تعديلات مطابقة</p></td></tr>') + '</tbody></table></div></div>';
    out.innerHTML = html;
    var t = null;
    $('chText').oninput = function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { S.chq.text = v; viewBackup(); }, 500); };
    $('chTable').onchange = function () { S.chq.table = this.value; viewBackup(); };
    $('bkNow').onclick = function () { var b = this; b.disabled = true; remote('backupNow', [S.session.pin]).then(function (r) { toast('تم: ' + r.name); viewBackup(); }).catch(function (e) { b.disabled = false; toast(errText(e)); }); };
    out.querySelectorAll('[data-rs]').forEach(function (b) {
      b.onclick = function () {
        openSheet('<div class="sheet-head sh-warn"><div class="big-ico">' + icon('history') + '</div><h2>استرجاع نسخة احتياطية</h2><p>' + esc(b.dataset.n) + '</p></div><div class="sheet-body"><div class="warnbox">ستعود كل البيانات (الحركات والأفراد والمواقع والقواعد...) كما كانت وقت هذه النسخة. تُحفظ نسخة أمان من الوضع الحالي أولاً لتتراجع إن احتجت.</div><div class="field"><label for="rsOk">اكتب كلمة «استرجاع» للتأكيد</label><input id="rsOk" type="text" autocomplete="off"></div><button class="btn bad big" data-a="go">استرجاع الآن</button><button class="btn ghost" data-a="close">إلغاء</button></div>', function (a) {
          if (a !== 'go') return closeSheet();
          remote('backupRestore', [S.session.pin, b.dataset.rs, $('rsOk').value]).then(function (r) { closeSheet(); toast(r.demo ? 'نسخة العرض: في التطبيق الفعلي تُسترجع البيانات الآن' : 'تم الاسترجاع · نسخة الأمان: ' + r.safety, 6000); return sync(); }).then(viewBackup).catch(function (e) { toast(errText(e)); });
        });
      };
    });
  }

  /* ============================ شاشة غرفة العمليات (تلفزيون) ============================ */
  var TV_PANELS = [['state', 'الموقف العام'], ['birds', 'رادار الطيور المهاجرة'], ['risk', 'خريطة الخطر للمواقع'], ['field', 'النافق والإجراءات والشركات'], ['reports', 'البلاغات والطلبات']];
  function tvStop() {
    var T = S.tv; if (!T) return;
    clearInterval(T.rot); clearInterval(T.poll); clearInterval(T.clock); clearInterval(T.beep);
    var el = $('tv'); if (el) el.remove();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    document.documentElement.classList.remove('tv-on');
    S.tv = null;
  }
  function viewTv() {
    tvStop();
    $('main').innerHTML = '<section class="view"><div class="card"><p class="empty">' + icon('tv') + 'شاشة غرفة العمليات مفتوحة</p></div></section>';
    var T = S.tv = { i: 0, d: null, b: null, dp: null, seen: {}, secs: Math.max(6, Number(S.ref && S.ref.settings.TV_SECONDS) || 12) };
    var el = document.createElement('div'); el.className = 'tv'; el.id = 'tv';
    el.innerHTML = '<header class="tv-h"><div class="tv-brand">' + logoImg() + '<div><b>غرفة عمليات الأمن الحيوي</b><span>' + esc(CFG.COMPANY || 'كايرو ثري إيه') + '</span></div></div><div class="tv-title" id="tvTitle"></div><div class="tv-dots" id="tvDots">' + TV_PANELS.map(function (p, i) { return '<i data-i="' + i + '"></i>'; }).join('') + '</div><div class="tv-clock mono" id="tvClock"></div><button class="tv-btn" type="button" id="tvFs" aria-label="ملء الشاشة">' + icon('expand') + '</button><button class="tv-btn" type="button" id="tvX" aria-label="خروج">' + icon('x') + '</button></header>' +
      '<div class="tv-stage" id="tvStage"><p class="empty"><span class="spin"></span></p></div><div class="tv-bar"><i id="tvBar"></i></div><div class="tv-alarm" id="tvAlarm" hidden></div>' +
      '<div class="tv-start" id="tvStart"><div><span>' + icon('tv', 'ico-lg') + '</span><b>شاشة غرفة العمليات</b><p>تعرض اللوحات بالتناوب كل ' + T.secs + ' ثانية، وتتحول لإنذار أحمر بصوت عند أي بلاغ عاجل لم يُفتح.</p><button class="btn primary big" type="button" id="tvGo">' + icon('expand') + ' تشغيل بملء الشاشة</button><button class="btn big" type="button" id="tvGo2">تشغيل في النافذة</button></div></div>';
    document.body.appendChild(el); document.documentElement.classList.add('tv-on');
    var start = function (fs) {
      $('tvStart').remove();
      try { T.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      if (fs && el.requestFullscreen) el.requestFullscreen().catch(function () {});
    };
    $('tvGo').onclick = function () { start(true); }; $('tvGo2').onclick = function () { start(false); };
    $('tvX').onclick = function () { tvStop(); go('dash'); };
    $('tvFs').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); };
    $('tvDots').onclick = function (e) { var i = e.target.closest('[data-i]'); if (i) { T.i = +i.dataset.i; tvShow(); tvRotate(); } };
    var tick = function () { var c = $('tvClock'); if (c) c.innerHTML = esc(fmt(Date.now(), false)) + '<small>' + esc(new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' })) + '</small>'; };
    tick(); T.clock = setInterval(tick, 1000);
    var load = function () {
      Promise.all([remote('dashboard', [S.session.pin]), remote('birds', [S.session.pin]).catch(function () { return null; }), remote('disposals', [S.session.pin, 7]).catch(function () { return null; })]).then(function (r) {
        if (!S.tv) return; T.d = r[0]; T.b = r[1]; T.dp = r[2]; if (!T.shown) { T.shown = 1; tvShow(); } tvAlarm();
      }).catch(function () {});
    };
    load(); T.poll = setInterval(load, MODE === 'demo' ? 8000 : 30000);
    tvRotate();
  }
  function tvRotate() { var T = S.tv; clearInterval(T.rot); T.rot = setInterval(function () { T.i = (T.i + 1) % TV_PANELS.length; tvShow(); }, T.secs * 1000); var b = $('tvBar'); if (b) { b.style.animation = 'none'; void b.offsetWidth; b.style.animation = 'tvbar ' + T.secs + 's linear infinite'; } }
  function tvShow() {
    var T = S.tv; if (!T || !T.d) return;
    var d = T.d, p = TV_PANELS[T.i][0], h = '', m = d.model, x = d.extra || {};
    $('tvTitle').textContent = TV_PANELS[T.i][1];
    $('tvDots').querySelectorAll('i').forEach(function (e, i) { e.classList.toggle('on', i === T.i); });
    if (p === 'state') {
      var T0 = m.days[6], rd = m.readiness, pc = m.posture >= 85 ? 'var(--r-low)' : m.posture >= 70 ? 'var(--r-mid)' : m.posture >= 55 ? 'var(--r-high)' : 'var(--r-crit)';
      h = '<div class="tv-state"><div class="tv-ring">' + ring(m.posture, 260, 18, pc, 'مؤشر الجاهزية') + '<div><b class="mono">' + m.posture + '</b><span>مؤشر الجاهزية</span></div></div><div class="tv-st st-' + rd.k + '"><span>حالة الجاهزية</span><b>' + esc(rd.label) + '</b><p>' + esc(rd.note) + '</p></div></div>' +
        '<div class="tv-kpis">' + [['الالتزام اليوم', pctTxt(T0.compliance)], ['دخول مسموح', T0.allowed], ['محاولات مرفوضة', T0.denied], ['داخل المواقع الآن', d.onSite.length], ['طلبات تنتظر القرار', d.stats.pending], ['نافق اليوم', x.deadToday || 0]].map(function (k) { return '<div><span>' + k[0] + '</span><b class="mono">' + k[1] + '</b></div>'; }).join('') + '</div>' +
        '<div class="tv-feed">' + (d.alerts.slice(0, 4).map(function (a) { return '<div class="fe fe-' + a.level + '"><i></i><div><b>' + esc(a.title) + '</b><span>' + esc(a.body) + ' · ' + esc(ago(a.time)) + '</span></div></div>'; }).join('') || '<div class="fe"><i></i><div><b>لا توجد إنذارات · الوضع طبيعي</b></div></div>') + '</div>';
    } else if (p === 'birds') {
      var b = T.b;
      h = b ? '<div class="tv-birds"><div class="tv-map">' + birdMap(b, 'region') + '</div><div class="tv-list"><span class="tv-k">' + esc(b.season.label) + '</span>' + b.sites.slice(0, 6).map(function (s) { var f = s.flocks[0]; return '<div class="tv-r"><b>' + esc(shortSite(s.name)) + '<small>' + (f ? 'سرب من ' + esc(f.from) + ' ~' + BIO_eta(f.eta) : esc(s.sector)) + '</small></b><span class="tr-sc" style="--c:' + LVL_C[s.lvl.k] + '"><b class="mono">' + s.score + '</b>' + esc(s.lvl.label) + '</span></div>'; }).join('') + '</div></div>' : '<p class="empty">رادار الطيور غير متاح</p>';
    } else if (p === 'risk') {
      var secs = {}; m.risk.forEach(function (r) { (secs[r.sector] = secs[r.sector] || []).push(r); });
      h = '<div class="tv-risk">' + Object.keys(secs).map(function (k) { return '<div class="rsec"><div class="rsec-h"><b>قطاع ' + esc(k) + '</b></div><div class="rtiles">' + secs[k].map(riskTile).join('') + '</div></div>'; }).join('') + '</div>';
    } else if (p === 'field') {
      var dp = T.dp, spikes = dp ? dp.bySite.filter(function (s) { return s.spike; }) : [];
      h = '<div class="tv-field"><div class="tv-big' + (spikes.length ? ' bad' : '') + '"><span>النافق اليوم</span><b class="mono">' + (x.deadToday || 0) + '</b><small>' + (spikes.length ? 'نفوق مرتفع: ' + esc(spikes.map(function (s) { return shortSite(s.name); }).join('، ')) : 'لا توجد زيادة غير معتادة') + '</small></div>' +
        '<div class="tv-big' + (x.capa && x.capa.late ? ' warn' : '') + '"><span>إجراءات تصحيحية مفتوحة</span><b class="mono">' + (x.capa ? x.capa.open : 0) + '</b><small>' + (x.capa && x.capa.late ? x.capa.late + ' متأخرة عن موعدها' : 'كلها في الموعد') + '</small></div>' +
        '<div class="tv-big' + (x.companies && x.companies.suspended.length ? ' bad' : '') + '"><span>شركات موقوفة من البوابات</span><b class="mono">' + (x.companies ? x.companies.suspended.length : 0) + '</b><small>' + esc(x.companies ? x.companies.suspended.join('، ') : '') + '</small></div>' +
        '<div class="tv-big"><span>مركبات سبلة ممنوعة الآن</span><b class="mono">' + (dp ? dp.blocked.length : 0) + '</b><small>' + esc(dp ? dp.blocked.map(function (v) { return v.vehicleName; }).join('، ') : '') + '</small></div></div>';
    } else {
      var open = d.reports ? d.reports.open : [];
      h = '<div class="tv-rep"><div><h3>' + icon('siren') + ' البلاغات العاجلة المفتوحة</h3>' + (open.length ? open.slice(0, 5).map(function (r) { return '<div class="tv-ri' + (!r.readAt ? ' new' : '') + '"><b>' + esc(r.type) + '</b><span>' + esc(r.siteName) + ' · ' + esc(ago(r.time)) + (!r.readAt ? ' · لم يُفتح' : '') + '</span></div>'; }).join('') : '<p class="empty">' + icon('check') + 'لا توجد بلاغات مفتوحة</p>') + '</div>' +
        '<div><h3>' + icon('inbox') + ' طلبات الدخول الاستثنائي</h3>' + (d.pending.length ? d.pending.slice(0, 5).map(function (a) { return '<div class="tv-ri"><b>' + esc(a.itemName) + '</b><span>' + esc(a.siteName) + ' · ' + esc(a.reason) + '</span></div>'; }).join('') : '<p class="empty">' + icon('check') + 'لا توجد طلبات</p>') + '</div>' +
        '<div><h3>' + icon('bell') + ' آخر الأحداث على البوابات</h3>' + (d.alerts.length ? d.alerts.slice(0, 6).map(function (a) { return '<div class="tv-ri ev-' + esc(a.level) + '"><b>' + esc(a.title) + '</b><span>' + esc(a.body) + ' · ' + esc(ago(a.time)) + '</span></div>'; }).join('') : '<p class="empty">' + icon('check') + 'لا توجد أحداث تحتاج انتباهاً</p>') + '</div></div>';
    }
    var st = $('tvStage'); st.classList.remove('in'); st.innerHTML = h; void st.offsetWidth; st.classList.add('in');
  }
  function tvAlarm() {
    var T = S.tv, d = T && T.d; if (!d) return;
    var hot = (d.reports ? d.reports.open : []).filter(function (r) { return !r.readAt && !T.seen[r.id]; })[0], el = $('tvAlarm');
    clearInterval(T.beep);
    if (!hot) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="tva-in"><span class="tva-ico">' + icon('siren') + '</span><span class="tva-k">بلاغ عاجل لم يُفتح بعد</span><h1>' + esc(hot.type) + '</h1><p><b>' + esc(hot.siteName) + '</b> · ' + esc(hot.gate || '') + ' · ' + esc(ago(hot.time)) + '</p>' + (hot.note ? '<p class="tva-n">' + esc(hot.note) + '</p>' : '') + '<button class="btn big" type="button" id="tvAck">' + icon('check') + ' تم الاطلاع</button></div>';
    $('tvAck').onclick = function () { T.seen[hot.id] = 1; tvAlarm(); };
    var beep = function () { var ac = T.ac; if (!ac) return; try { [0, 0.28].forEach(function (o) { var g = ac.createGain(), os = ac.createOscillator(); os.type = 'square'; os.frequency.value = 880; g.gain.value = 0.12; os.connect(g); g.connect(ac.destination); os.start(ac.currentTime + o); os.stop(ac.currentTime + o + 0.18); }); } catch (e) {} };
    beep(); T.beep = setInterval(beep, 2500);
  }

  /* ============================ إضافات لوحة القيادة والجواز والبوابة ============================ */
  function v5DashAlerts(d) {
    var x = d.extra || {}, h = '';
    if (x.birds && x.birds.high) h += '<div class="cc-alert a-bad">' + icon('bird') + '<span><b>' + plural(x.birds.high, 'موقع', 'مواقع') + ' في خطر مرتفع من الطيور المهاجرة</b>' + (x.birds.top ? ': الأعلى «' + esc(x.birds.top.name) + '» (' + x.birds.top.score + ')' + (x.birds.top.flock ? '، سرب متوقع من ' + esc(x.birds.top.flock.from) + ' خلال ~' + BIO_eta(x.birds.top.flock.eta) : '') : '') + '</span><button class="btn sm" type="button" data-goto="birds">الرادار</button></div>';
    if (x.capa && x.capa.late) h += '<div class="cc-alert a-warn">' + icon('clip') + '<span><b>' + plural(x.capa.late, 'إجراء تصحيحي متأخر', 'إجراءات تصحيحية متأخرة') + '</b> من زيارات التدقيق الداخلي</span><button class="btn sm" type="button" data-goto="inspect">متابعة</button></div>';
    return h;
  }
  function v5DashStrip(d) {
    var x = d.extra; if (!x) return '';
    var b = x.birds && x.birds.top, bc = b ? LVL_C[b.lvl.k] : 'var(--r-low)';
    return '<div class="v5-strip">' +
      '<button type="button" class="v5t" data-goto="birds" style="--c:' + bc + '"><span class="v5i">' + icon('bird') + '</span><span class="t"><span>الطيور المهاجرة · ' + esc(x.birds ? x.birds.season : '') + '</span><b class="mono">' + (b ? b.score : '—') + ' <small>' + esc(b ? b.lvl.label : '') + '</small></b><small>' + esc(b ? 'الأعلى: ' + shortSite(b.name) : 'أضف إحداثيات المواقع') + '</small></span></button>' +
      '<button type="button" class="v5t" data-goto="disposal" style="--c:var(--ink-2)"><span class="v5i">' + icon('box') + '</span><span class="t"><span>النافق اليوم</span><b class="mono">' + (x.deadToday || 0) + '</b><small>كل المواقع في نطاقك</small></span></button>' +
      '<button type="button" class="v5t" data-goto="inspect" style="--c:' + (x.capa && x.capa.late ? 'var(--r-high)' : 'var(--r-low)') + '"><span class="v5i">' + icon('clip') + '</span><span class="t"><span>إجراءات تصحيحية</span><b class="mono">' + (x.capa ? x.capa.open : 0) + ' <small>مفتوحة</small></b><small>' + (x.capa && x.capa.late ? x.capa.late + ' متأخرة' : 'لا يوجد تأخير') + '</small></span></button>' +
      '<button type="button" class="v5t" data-goto="companies" style="--c:' + (x.companies && x.companies.suspended.length ? 'var(--r-crit)' : 'var(--r-low)') + '"><span class="v5i">' + icon('truck') + '</span><span class="t"><span>شركات النقل والمقاولون</span><b class="mono">' + (x.companies ? x.companies.suspended.length : 0) + ' <small>موقوفة</small></b><small>' + esc(x.companies && x.companies.suspended.length ? x.companies.suspended[0] : 'كلها نشطة') + '</small></span></button></div>';
  }
  function ppTraining(p) {
    var t = p.training || [];
    return '<h3 class="pp-sec">أكاديمية الأمن الحيوي</h3><div class="pp-train">' + (t.length ? t.map(function (r) { return '<div class="ppt"><span>' + icon('grad') + '</span><div><b>' + esc(r.title) + '</b><small>' + esc(fmt(r.time)) + ' · ' + r.score + '% · <span class="mono">' + esc(r.cert) + '</span></small></div></div>'; }).join('') : '<div class="ppt no"><span>' + icon('alert') + '</span><div><b>لم يجتز التأهيل الإلزامي بعد</b><small>يجتازه من رابط التدريب على موبايله</small></div></div>') + '</div>';
  }
  function gateTools() {
    return '<div class="gate-tools"><button type="button" class="gtool" id="gtPlate">' + icon('truck') + '<span><b>قراءة لوحة مركبة</b><small>بالكاميرا بدلاً من الكارت</small></span></button>' +
      '<a class="gtool" href="#disposal">' + icon('box') + '<span><b>نافق أو سبلة</b><small>تسجيل وخروج سيارة السبلة</small></span></a>' +
      '<button type="button" class="gtool" id="gtBird">' + icon('bird') + '<span><b>مشاهدة طيور</b><small>أسراب حول الموقع</small></span></button></div>';
  }
  function bindGateTools() {
    if ($('gtPlate')) $('gtPlate').onclick = plateSheet;
    if ($('gtBird')) $('gtBird').onclick = function () { birdSightingSheet(S.siteId); };
  }

  /* ============================ نسخة العرض: الإشعارات ============================ */
  if (MODE === 'demo') {
    window.onDemoNotify = function (evt) {
      var me = S.session && S.session.user;
      var toMgr = ['birds', 'mortality', 'litter', 'capa', 'company', 'company-report', 'academy'].indexOf(evt.kind) >= 0 || evt.kind === 'mission' || evt.kind === 'tamper' || evt.kind === 'deny' || evt.kind === 'card' || evt.kind === 'watch' || evt.kind === 'request' || evt.kind === 'violation' || evt.kind === 'report' || (evt.kind === 'message' && !evt.toGate);
      var app = evt.kind === 'escalation' ? (evt.level === 1 ? 'موبايل نائب المدير · تصعيد مستوى 1' : 'موبايل مدير القطاع · تصعيد مستوى 2') : toMgr ? 'موبايل مدير الأمن الحيوي' : (evt.toUserId || evt.toGate) ? 'موبايل أمن البوابة' : 'موبايلات البوابات';
      var mgrAct = function (act, msg) { return function (el) { try { window.DemoApi.reportAct('9999', evt.reportId, act, ''); el.remove(); toast(msg); sync().then(function () { if (/^(dash|comms|map)/.test(S.route)) render(); }); } catch (e) { toast(errText(e)); } }; };
      var actions = evt.kind === 'request' ? [
        { label: 'موافقة', cls: 'ok', run: function (el) { var r = window.DemoApi._decide('مدير الأمن الحيوي (من الإشعار)', evt.approvalId, true); el.remove(); toast(r.status); } },
        { label: 'رفض', cls: 'bad', run: function (el) { var r = window.DemoApi._decide('مدير الأمن الحيوي (من الإشعار)', evt.approvalId, false); el.remove(); toast(r.status); } }]
        : evt.kind === 'report' || evt.kind === 'escalation' ? [
        { label: 'تم الاستلام', cls: 'ok', run: mgrAct('استلام', 'تم الاستلام من الإشعار، ووصل لفرد الأمن') },
        { label: 'رفع إنذار', cls: 'bad', run: mgrAct('إنذار', 'رُفع الإنذار على الموقع من الإشعار') }] : null;
      var mine = me && ((me.isManager && (evt.kind === 'notice' || (evt.kind === 'message' && evt.toGate))) || (!me.isManager && evt.kind === 'message' && !evt.toGate));
      var critical = ['report', 'escalation', 'violation', 'request'].indexOf(evt.kind) >= 0;
      setTimeout(function () {
        if (!mine) pushCard({ app: 'الأمن الحيوي · ' + app, title: evt.title, body: evt.body, actions: actions, sticky: !!actions, compact: evt.kind === 'message' || evt.kind === 'report-update' });
        if (critical || evt.kind === 'notice') setTimeout(function () { pushCard({ wa: true, compact: true, app: 'واتساب · نسخة لأرقام الإدارة المسجلة', title: evt.title, body: evt.body, ms: 5000 }); }, 900);
        if (critical) setTimeout(function () { pushCard({ mail: true, compact: true, app: 'إيميل عالي الأهمية ❗ · ' + (evt.kind === 'escalation' ? 'أرقام التصعيد' : 'جهات التنبيه'), title: '🔴 عاجل | ' + evt.title, body: evt.body, ms: 5000 }); }, 1700);
        if (me) sync();
      }, 350);
    };
  }

  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
