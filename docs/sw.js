/* Makes the page installable on a phone or computer. Pages always come from the network first, so a new version
   shows up straight away. The saved copy is only a fallback when there is no internet. Email, Google and AI
   calls are never saved. */
"use strict";
const CACHE = "wyz-shell-v4";
const SHELL = ["./", "app.js", "connectors.js", "config.js", "version.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
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
