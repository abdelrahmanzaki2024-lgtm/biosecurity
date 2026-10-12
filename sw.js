/* عامل الخدمة: تشغيل التطبيق دون إنترنت + استقبال الإشعارات الفورية والقرار منها مباشرة */
var CACHE = 'bio-v10';
var SHELL = ['./', 'index.html', 'styles.css', 'fonts.css', 'app.js', 'core.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'logo.png'];
importScripts('config.js');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || /script\.google(usercontent)?\.com|googleapis\.com\/(?!css)|fcm|firebaseinstallations/.test(url.href)) return;
  // ملفات التطبيق: من الشبكة أولاً ثم المحفوظ. المكتبات والخطوط: المحفوظ أولاً
  var sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(fetch(req).then(function (res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res; })
      .catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); }); }));
  } else if (/unpkg\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|gstatic\.com\/firebasejs/.test(url.href)) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res; }).catch(function () { return hit; });
      return hit || net;
    }));
  }
});

/* ---------- الإشعارات ---------- */
var CFG = self.BIO_CONFIG || {};
if (CFG.FIREBASE) {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp(CFG.FIREBASE);
  firebase.messaging().onBackgroundMessage(function (p) { return show(p.data || {}); });
}
function show(d) {
  var urgent = d.kind === 'request' || d.kind === 'violation' || d.kind === 'report' || d.kind === 'escalation' || /عاجل/.test(d.title || '');
  return self.registration.showNotification(d.title || 'الأمن الحيوي', {
    body: d.body || '', dir: 'rtl', lang: 'ar', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: d.approvalId || d.reportId || d.kind || 'bio', renotify: true, requireInteraction: urgent, vibrate: [200, 100, 200],
    data: d, actions: d.kind === 'request' && d.approvalId ? [{ action: 'approve', title: 'موافقة' }, { action: 'reject', title: 'رفض' }]
      : (d.kind === 'report' || d.kind === 'escalation') && d.reportId ? [{ action: 'r-ack', title: 'تم الاستلام' }, { action: 'r-alert', title: 'رفع إنذار على الموقع' }] : []
  });
}
function kvGet(key) {
  return new Promise(function (res) {
    var r = indexedDB.open('bio-biosecurity', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { try { var q = r.result.transaction('kv').objectStore('kv').get(key); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } };
    r.onerror = function () { res(null); };
  });
}
self.addEventListener('notificationclick', function (e) {
  var d = e.notification.data || {};
  e.notification.close();
  if ((e.action === 'approve' || e.action === 'reject') && d.approvalId) {
    e.waitUntil(kvGet('session').then(function (s) {
      if (!s || !CFG.API_URL) throw new Error('افتح التطبيق للقرار');
      return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ fn: 'decide', args: [s.pin, d.approvalId, e.action === 'approve'] }) }).then(function (r) { return r.json(); });
    }).then(function (r) {
      var txt = r && r.ok ? r.data.status + (r.data.already ? ' (سبق البت فيه)' : '') : (r && r.error) || 'تعذر تسجيل القرار';
      return self.registration.showNotification('القرار: ' + txt, { body: d.title || '', dir: 'rtl', lang: 'ar', icon: 'icons/icon-192.png', tag: d.approvalId });
    }).catch(function (err) { return openApp('#requests'); }));
    return;
  }
  if ((e.action === 'r-ack' || e.action === 'r-alert') && d.reportId) {
    e.waitUntil(kvGet('session').then(function (s) {
      if (!s || !CFG.API_URL) throw new Error('open');
      return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ fn: 'reportAct', args: [s.pin, d.reportId, e.action === 'r-ack' ? 'استلام' : 'إنذار', 'من الإشعار'] }) }).then(function (r) { return r.json(); });
    }).then(function (r) {
      var txt = r && r.ok ? (e.action === 'r-ack' ? 'تم الاستلام ووصل لفرد الأمن' : 'رُفع الإنذار على الموقع وأُبلغت البوابات') : (r && r.error) || 'تعذر تسجيل الإجراء';
      return self.registration.showNotification(txt, { body: d.title || '', dir: 'rtl', lang: 'ar', icon: 'icons/icon-192.png', tag: d.reportId });
    }).catch(function () { return openApp('#comms'); }));
    return;
  }
  e.waitUntil(openApp(d.route || '#'));
});
function openApp(route) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { cs[i].postMessage({ route: route, sync: true }); return cs[i].focus(); }
    return self.clients.openWindow('./' + route);
  });
}
