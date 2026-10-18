/* Makes the page installable on a phone or computer. Pages always come from the network first, so a new version
   shows up straight away. The saved copy is only a fallback when there is no internet. Email, Google and AI
   calls are never saved. */
"use strict";
const CACHE = "wyz-shell-v30";
const SHELL = ["./", "app.js", "connectors.js", "library.js", "preview.js", "docman.js", "lifeimport.js", "platforms.js", "advise.js", "arabic.js", "apple.css", "pages.js", "undo.js", "layout.js", "instruct.js", "revenue.js", "usage.js", "tidy.js", "config.js", "versionswitch.js", "version.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
/* 3.48: the 8am and 6pm brief. The push carries no data, so nothing private passes through the push service. */
self.addEventListener("push", function (e) {
  const h = (new Date().getUTCHours() + 4) % 24, morning = h < 14;
  e.waitUntil(self.registration.showNotification(morning ? "☀️ Your morning brief" : "🌙 Your evening brief", {
    body: morning ? "Your plan for today is ready. Tap to open it." : "See what got done today and what's left for tomorrow.",
    icon: "icon-192.png", badge: "icon-192.png", tag: "wyz-brief", renotify: true, data: { brief: morning ? "morning" : "evening" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  const brief = e.notification.data && e.notification.data.brief;
  if (brief) {
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
      for (const c of cs) { if ("focus" in c) { c.postMessage({ brief: brief }); return c.focus(); } }
      return self.clients.openWindow("./#brief");
    }));
    return;
  }
  const id = e.notification.data && e.notification.data.thread;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (const c of cs) { if ("focus" in c) { c.postMessage({ thread: id || "" }); return c.focus(); } }
    return self.clients.openWindow("./" + (id ? "#thread=" + encodeURIComponent(id) : ""));
  }));
});
self.addEventListener("fetch", function (e) {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/api/") === 0) return;
  e.respondWith(
    fetch(r).then(function (res) {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copy); }); }
      return res;
    }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match("./"); }); })
  );
});
