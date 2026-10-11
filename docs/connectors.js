/* connectors.js
   Talks to Google (Gmail, Calendar, Drive), Todoist and Claude straight from the browser.
   There is no server. Google access tokens live in memory only. The page code (app.js) calls this
   through the same small interface it was written for: mcp.callTool(server, tool, args). */
(function () {
  "use strict";
  var CFG = window.WYZ_CONFIG || {};

  var SC = {
    gmailRead: "https://www.googleapis.com/auth/gmail.readonly",
    gmailDraft: "https://www.googleapis.com/auth/gmail.compose",
    gmailModify: "https://www.googleapis.com/auth/gmail.modify",
    cal: "https://www.googleapis.com/auth/calendar.readonly",
    calEvents: "https://www.googleapis.com/auth/calendar.events",
    drive: "https://www.googleapis.com/auth/drive.metadata.readonly",
    contacts: "https://www.googleapis.com/auth/contacts.readonly",
    otherContacts: "https://www.googleapis.com/auth/contacts.other.readonly",
    driveRead: "https://www.googleapis.com/auth/drive.readonly",
    driveFile: "https://www.googleapis.com/auth/drive.file"
  };
  var SCOPES = ["openid", "email", "profile", SC.gmailRead, SC.gmailDraft, SC.gmailModify, SC.cal, SC.calEvents, SC.drive, SC.contacts, SC.otherContacts, SC.driveRead, SC.driveFile].join(" ");
  var KEY = { flag: "wyz-google-flag", hint: "wyz-google-hint", todo: "wyz-todoist-token", ai: "wyz-claude-key", cid: "wyz-google-client-id", model: "wyz-claude-model" };

  var ls = {
    get: function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var cerr = function (code, message) { var e = new Error(message || code); e.code = code; return e; };
  /* A family link like https://site/#cid=123.apps.googleusercontent.com sets the Client ID on that person's device, once. */
  try {
    var hm = location.hash.match(/[#&]cid=([^&]+)/);
    if (hm && /\.apps\.googleusercontent\.com$/.test(decodeURIComponent(hm[1]))) {
      ls.set(KEY.cid, decodeURIComponent(hm[1]));
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
  var clientId = function () { return String(CFG.GOOGLE_CLIENT_ID || ls.get(KEY.cid) || "").trim(); };
  var configured = function () { return /\.apps\.googleusercontent\.com$/.test(clientId()); };

  /* ---------- Google sign-in (token model) ---------- */
  var tok = { access: "", exp: 0, scope: "" };
  var inflight = null;

  function gisReady() {
    return new Promise(function (res, rej) {
      var n = 0;
      (function t() {
        if (window.google && google.accounts && google.accounts.oauth2) return res();
        if (++n > 100) return rej(cerr("google_unavailable", "Google sign-in didn't load. Check your connection and reload."));
        setTimeout(t, 100);
      })();
    });
  }

  function requestToken(prompt) {
    return gisReady().then(function () {
      return new Promise(function (resolve, reject) {
        var c = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPES,
          include_granted_scopes: true,
          callback: function (r) {
            if (r.error) {
              reject(cerr(r.error === "access_denied" ? "consent_required" : prompt === "none" ? "needs_reauth" : r.error, r.error_description || r.error));
              return;
            }
            tok = { access: r.access_token, exp: Date.now() + Math.max(60, (+r.expires_in || 3600) - 90) * 1000, scope: r.scope || "" };
            ls.set(KEY.flag, "1");
            resolve(tok.access);
          },
          error_callback: function (e) {
            var t = e && e.type;
            reject(cerr(t === "popup_closed" ? "popup_closed" : t === "popup_failed_to_open" ? "popup_failed_to_open" : prompt === "none" ? "needs_reauth" : "google_error", (e && e.message) || "Google sign-in failed"));
          }
        });
        var o = { prompt: prompt };
        var h = ls.get(KEY.hint);
        if (h) o.hint = h;
        c.requestAccessToken(o);
      });
    });
  }

  function ensure() {
    if (tok.access && Date.now() < tok.exp) return Promise.resolve(tok.access);
    if (!configured()) return Promise.reject(cerr("not_configured", "Google sign-in isn't set up yet."));
    if (!ls.get(KEY.flag)) return Promise.reject(cerr("server_not_connected", "Not connected to Google"));
    if (!inflight) inflight = requestToken("none").then(function (t) { inflight = null; return t; }, function (e) { inflight = null; throw e; });
    return inflight;
  }

  async function gfetch(url, opt, scope, tries) {
    opt = opt || {}; tries = tries || 0;
    var t = await ensure();
    if (scope && tok.scope.split(" ").indexOf(scope) < 0) throw cerr("consent_required", "Google didn't give permission for this.");
    var headers = Object.assign({ Authorization: "Bearer " + t }, opt.headers || {});
    var r = await fetch(url, Object.assign({}, opt, { headers: headers }));
    if (r.status === 401 && tries < 1) { tok.exp = 0; return gfetch(url, opt, scope, tries + 1); }
    if ((r.status === 429 || r.status === 503) && tries < 3) { await sleep(700 * (tries + 1)); return gfetch(url, opt, scope, tries + 1); }
    if (r.status === 403) {
      var msg = "", reason = "";
      try { var j = await r.json(); msg = (j.error && j.error.message) || ""; reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || ""; } catch (e) {}
      if (/ratelimit/i.test(reason) && tries < 3) { await sleep(800 * (tries + 1)); return gfetch(url, opt, scope, tries + 1); }
      if (/accessNotConfigured|has not been used|is disabled/i.test(reason + " " + msg)) throw cerr("api_disabled", "That Google API is switched off in your Google Cloud project. See EXECUTION-PAGE.md, step 2.");
      throw cerr("consent_required", msg || "Google refused access");
    }
    if (!r.ok) throw cerr("tool_error", "Google answered " + r.status);
    if (opt.as === "buffer") return r.arrayBuffer();
    return r.status === 204 ? {} : r.json();
  }
  function b64FromBuffer(buf) {
    var u = new Uint8Array(buf), s = "";
    for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return btoa(s);
  }

  async function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    var workers = [];
    for (var w = 0; w < Math.min(n, items.length); w++) {
      workers.push((async function () {
        while (i < items.length) { var k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } }
      })());
    }
    await Promise.all(workers);
    return out;
  }

  var profileCache = null;
  async function profile() {
    if (profileCache) return profileCache;
    var p = await gfetch("https://www.googleapis.com/oauth2/v3/userinfo");
    profileCache = p;
    if (p.email) ls.set(KEY.hint, p.email);
    return p;
  }
  var mailTo = function () { return profileCache && profileCache.email ? profileCache.email : ""; };

  /* ---------- Gmail ---------- */
  var GM = "https://gmail.googleapis.com/gmail/v1/users/me";
  var hdr = function (m, n) {
    var h = ((m.payload && m.payload.headers) || []).find(function (x) { return x.name.toLowerCase() === n.toLowerCase(); });
    return h ? h.value : "";
  };
  var splitAddrs = function (s) { return String(s || "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var threadUrl = function (id) { return "https://mail.google.com/mail/?authuser=" + encodeURIComponent(mailTo()) + "#all/" + id; };
  function b64decode(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    var bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  function b64url(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function findPart(p, type) {
    if (!p) return "";
    if (p.mimeType === type && p.body && p.body.data) return b64decode(p.body.data);
    for (var i = 0; i < (p.parts || []).length; i++) { var t = findPart(p.parts[i], type); if (t) return t; }
    return "";
  }
  function htmlText(h) {
    return h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  }
  function bodyOf(p) { return findPart(p, "text/plain") || htmlText(findPart(p, "text/html")); }
  function filesOf(p, out) {
    out = out || [];
    if (!p) return out;
    var h = (p.headers || []).reduce(function (a, x) { a[String(x.name).toLowerCase()] = x.value; return a; }, {});
    var cid = String(h["content-id"] || "").replace(/[<>]/g, "");
    if ((p.filename || cid) && p.body && (p.body.attachmentId || p.body.data) && !/^(text\/(plain|html)|multipart\/)/.test(p.mimeType || "")) {
      out.push({ name: p.filename || "", type: p.mimeType || "application/octet-stream", id: p.body.attachmentId || "", data: p.body.attachmentId ? "" : (p.body.data || ""), cid: cid, size: p.body.size || 0 });
    }
    (p.parts || []).forEach(function (c) { filesOf(c, out); });
    return out;
  }
  function attachmentsOf(p, out) {
    out = out || [];
    if (!p) return out;
    if (p.filename) out.push(p.filename);
    (p.parts || []).forEach(function (c) { attachmentsOf(c, out); });
    return out;
  }
  function slimMsg(m, withBody) {
    var o = {
      id: m.id, threadId: m.threadId, labelIds: m.labelIds || [], snippet: m.snippet || "",
      sender: hdr(m, "From"), toRecipients: splitAddrs(hdr(m, "To")), subject: hdr(m, "Subject"),
      date: m.internalDate ? new Date(+m.internalDate).toISOString() : hdr(m, "Date"),
      viewUrl: threadUrl(m.threadId)
    };
    if (withBody) {
      o.plaintextBody = bodyOf(m.payload);
      o.html = findPart(m.payload, "text/html").slice(0, 800000);
      o.files = filesOf(m.payload);
      o.ccRecipients = splitAddrs(hdr(m, "Cc"));
      o.replyTo = hdr(m, "Reply-To");
      o.unsub = hdr(m, "List-Unsubscribe");
      o.unsubPost = hdr(m, "List-Unsubscribe-Post");
      o.attachments = attachmentsOf(m.payload);
    }
    return o;
  }
  var META = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";

  async function buildMessage(a) {
    var threadId = "", inReply = "", refs = "";
    if (a.replyToMessageId) {
      var o = await gfetch(GM + "/messages/" + encodeURIComponent(a.replyToMessageId) + "?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References", null, SC.gmailDraft);
      threadId = o.threadId; inReply = hdr(o, "Message-ID"); refs = hdr(o, "References");
    }
    var enc = function (s) { return /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?="; };
    var lines = ["To: " + (a.to || []).join(", ")];
    if (a.cc && a.cc.length) lines.push("Cc: " + a.cc.join(", "));
    lines.push("Subject: " + enc(a.subject || ""));
    if (inReply) { lines.push("In-Reply-To: " + inReply); lines.push("References: " + (refs ? refs + " " : "") + inReply); }
    var bodyB64 = btoa(unescape(encodeURIComponent(a.body || ""))).replace(/(.{76})/g, "$1\r\n");
    var out;
    if (a.attachments && a.attachments.length) {
      var bnd = "wyz_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      lines.push("MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="' + bnd + '"', "");
      var parts = ["--" + bnd, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", bodyB64];
      a.attachments.forEach(function (f) {
        var nm = enc(String(f.name || "file").replace(/["\r\n]/g, "_"));
        parts.push("--" + bnd, "Content-Type: " + (f.type || "application/octet-stream") + '; name="' + nm + '"', 'Content-Disposition: attachment; filename="' + nm + '"', "Content-Transfer-Encoding: base64", "", String(f.data).replace(/(.{76})/g, "$1\r\n"));
      });
      parts.push("--" + bnd + "--", "");
      out = lines.join("\r\n") + "\r\n" + parts.join("\r\n");
    } else {
      lines.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "");
      out = lines.join("\r\n") + "\r\n" + bodyB64;
    }
    var msg = { raw: b64url(out) };
    if (threadId) msg.threadId = threadId;
    return msg;
  }

  var TOOLS = {
    "Gmail": {
      search_threads: async function (a) {
        await profile();
        var list = await gfetch(GM + "/threads?q=" + encodeURIComponent(a.query || "") + "&maxResults=" + (a.pageSize || 20), null, SC.gmailRead);
        var ids = (list.threads || []).map(function (t) { return t.id; });
        var full = await pool(ids, 8, function (id) { return gfetch(GM + "/threads/" + id + "?" + META, null, SC.gmailRead); });
        return {
          threads: full.filter(Boolean).map(function (t) {
            var ms = (t.messages || []).map(function (m) { return slimMsg(m, false); });
            return { id: t.id, messageCount: ms.length, messages: ms, viewUrl: threadUrl(t.id) };
          })
        };
      },
      get_thread: async function (a) {
        await profile();
        var plain = a.messageFormat === "PLAIN_TEXT";
        var t = await gfetch(GM + "/threads/" + encodeURIComponent(a.threadId) + "?" + (plain ? "format=full" : META), null, SC.gmailRead);
        return { id: t.id, messages: (t.messages || []).map(function (m) { return slimMsg(m, plain); }) };
      },
      create_draft: async function (a) {
        await profile();
        var msg = await buildMessage(a);
        var d = await gfetch(GM + "/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) }, SC.gmailDraft);
        return { id: d.id, viewUrl: "https://mail.google.com/mail/?authuser=" + encodeURIComponent(mailTo()) + "#drafts" };
      },
      get_attachment: async function (a) {
        await profile();
        var j = await gfetch(GM + "/messages/" + encodeURIComponent(a.messageId) + "/attachments/" + encodeURIComponent(a.attachmentId), null, SC.gmailRead);
        return { data: j.data || "" };
      },
      archive_thread: async function (a) {
        await profile();
        await gfetch(GM + "/threads/" + encodeURIComponent(a.threadId) + "/modify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeLabelIds: ["INBOX"] }) }, SC.gmailModify);
        return {};
      },
      mark_read: async function (a) {
        await profile();
        await gfetch(GM + "/threads/" + encodeURIComponent(a.threadId) + "/modify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }, SC.gmailModify);
        return {};
      },
      modify_thread: async function (a) {
        await profile();
        await gfetch(GM + "/threads/" + encodeURIComponent(a.threadId) + "/modify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addLabelIds: a.add || [], removeLabelIds: a.remove || [] }) }, SC.gmailModify);
        return {};
      },
      trash_thread: async function (a) {
        await profile();
        await gfetch(GM + "/threads/" + encodeURIComponent(a.threadId) + "/trash", { method: "POST" }, SC.gmailModify);
        return {};
      },
      list_labels: async function () {
        await profile();
        var j = await gfetch(GM + "/labels", null, SC.gmailRead);
        return { labels: (j.labels || []).filter(function (l) { return l.type === "user"; }).map(function (l) { return { id: l.id, name: l.name }; }).sort(function (a, b) { return a.name.localeCompare(b.name); }) };
      },
      create_label: async function (a) {
        await profile();
        var j = await gfetch(GM + "/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(a.name).slice(0, 100), labelListVisibility: "labelShow", messageListVisibility: "show" }) }, SC.gmailModify);
        return { id: j.id, name: j.name };
      },
      unsubscribe_one_click: async function (a) {
        if (!/^https:\/\//i.test(a.url || "")) throw cerr("tool_error", "That unsubscribe link isn't safe to use");
        await fetch(a.url, { method: "POST", mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
        return { sent: true };
      },
      send_message: async function (a) {
        await profile();
        var msg = await buildMessage(a);
        var m = await gfetch(GM + "/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg) }, SC.gmailDraft);
        return { id: m.id, threadId: m.threadId };
      }
    },
    "Google Calendar": {
      create_event: async function (a) {
        var tz = "Asia/Dubai", fix = function (v) { return String(v).length === 16 ? v + ":00" : v; };
        var body = { summary: a.title || "Meeting", location: a.location || "", description: a.description || "", start: { dateTime: fix(a.start), timeZone: tz }, end: { dateTime: fix(a.end), timeZone: tz } };
        if (a.attendees && a.attendees.length) body.attendees = a.attendees.map(function (e) { return { email: e }; });
        if (a.video) body.conferenceData = { createRequest: { requestId: "wyz" + Date.now(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
        var j = await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, SC.calEvents);
        return { id: j.id, htmlLink: j.htmlLink };
      },
      move_event: async function (a) {
        var tz = "Asia/Dubai", fix = function (v) { return String(v).length === 16 ? v + ":00" : v; };
        var body = { start: { dateTime: fix(a.start), timeZone: tz }, end: { dateTime: fix(a.end), timeZone: tz } };
        if (a.title) body.summary = a.title;
        if (a.location != null) body.location = a.location;
        var j = await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(a.eventId) + "?sendUpdates=all", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, SC.calEvents);
        return { id: j.id, htmlLink: j.htmlLink };
      },
      list_events: async function (a) {
        var q = (a.q ? "q=" + encodeURIComponent(a.q) + "&" : "") + "singleEvents=true&orderBy=startTime&maxResults=" + (a.pageSize || 40) +
          "&timeMin=" + encodeURIComponent(new Date(a.startTime).toISOString()) +
          "&timeMax=" + encodeURIComponent(new Date(a.endTime).toISOString());
        var j = await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?" + q, null, SC.cal);
        return {
          events: (j.items || []).map(function (e) {
            var video = e.conferenceData && (e.conferenceData.entryPoints || []).find(function (x) { return x.entryPointType === "video"; });
            return { id: e.id, status: e.status, summary: e.summary, description: String(e.description || "").slice(0, 1500), location: e.location, start: e.start, end: e.end, htmlLink: e.htmlLink, conferenceUrl: e.hangoutLink || (video && video.uri) || "",
              attendees: (e.attendees || []).map(function (x) { return { email: String(x.email || "").toLowerCase(), name: x.displayName || "", self: !!x.self, resource: !!x.resource }; }), organizer: e.organizer && e.organizer.email || "" };
          })
        };
      }
    },
    "Google Contacts": {
      list_contacts: async function () {
        var people = [], pick = function (p) {
          var e = (p.emailAddresses || []).map(function (x) { return x.value; }).filter(Boolean);
          var n = (p.names && p.names[0] && p.names[0].displayName) || "";
          e.forEach(function (a) { people.push({ name: n, email: String(a).toLowerCase() }); });
        };
        var have = { c: false, o: false }, err = null;
        try {
          var tok = "";
          for (var i = 0; i < 3; i++) {
            var j = await gfetch("https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&sortOrder=LAST_MODIFIED_DESCENDING&pageSize=1000" + (tok ? "&pageToken=" + encodeURIComponent(tok) : ""), null, SC.contacts);
            (j.connections || []).forEach(pick); have.c = true; tok = j.nextPageToken; if (!tok) break;
          }
        } catch (e) { err = e; }
        try {
          var tok2 = "";
          for (var k = 0; k < 3; k++) {
            var o = await gfetch("https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses&pageSize=1000" + (tok2 ? "&pageToken=" + encodeURIComponent(tok2) : ""), null, SC.otherContacts);
            (o.otherContacts || []).forEach(pick); have.o = true; tok2 = o.nextPageToken; if (!tok2) break;
          }
        } catch (e2) { err = err || e2; }
        if (!have.c && !have.o && err) throw err;
        return { people: people };
      }
    },
    "Google Drive": {
      search_files: async function (a) {
        var term = String(a.query || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        var q = "pageSize=" + (a.pageSize || 15) + "&orderBy=" + encodeURIComponent("modifiedTime desc") +
          "&q=" + encodeURIComponent(a.raw ? String(a.raw) : "trashed=false and name contains '" + term + "'") + "&fields=" + encodeURIComponent("files(id,name,modifiedTime,mimeType,fileExtension)");
        var j = await gfetch("https://www.googleapis.com/drive/v3/files?" + q, null, SC.drive);
        return { files: (j.files || []).map(function (f) { return { id: f.id, title: f.name, modifiedTime: f.modifiedTime, mimeType: f.mimeType, fileExtension: f.fileExtension }; }) };
      },
      read_file: async function (a) {
        var base = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(a.fileId), mime = String(a.mimeType || ""), buf;
        if (/^application\/vnd\.google-apps\./.test(mime)) {
          if (!/document|presentation|spreadsheet/.test(mime)) throw cerr("tool_error", "That kind of Google file can't be read here. Open it in Drive.");
          buf = await gfetch(base + "/export?mimeType=" + encodeURIComponent(/spreadsheet/.test(mime) ? "text/csv" : "text/plain"), { as: "buffer" }, SC.driveRead);
          return { text: new TextDecoder().decode(buf).slice(0, 200000) };
        }
        var meta = await gfetch(base + "?fields=size", null, SC.driveRead);
        if (+meta.size > 3000000) throw cerr("tool_error", "That file is too big to read here (over 3 MB). Open it in Drive.");
        buf = await gfetch(base + "?alt=media", { as: "buffer" }, SC.driveRead);
        if (/^text\/|json|csv/.test(mime)) return { text: new TextDecoder().decode(buf).slice(0, 200000) };
        return { data: b64FromBuffer(buf), mime: mime };
      },
      save_file: async function (a) {
        var base = "https://www.googleapis.com/drive/v3/files", name = String(a.folder || "WYZ Rent Attachments").replace(/[\\\/]/g, " ").slice(0, 80).trim() || "WYZ Rent Attachments";
        var folderId = String(a.folderId || "");
        if (folderId) {
          try { var chk = await gfetch(base + "/" + encodeURIComponent(folderId) + "?fields=id,trashed", null, SC.driveFile); if (chk.trashed) folderId = ""; } catch (e) { if (e && e.code === "consent_required") throw e; folderId = ""; }
        }
        if (!folderId) {
          var q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + name.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
          var found = await gfetch(base + "?pageSize=1&fields=files(id)&q=" + encodeURIComponent(q), null, SC.driveFile);
          folderId = found.files && found.files[0] && found.files[0].id;
          if (!folderId) {
            var made = await gfetch(base + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, mimeType: "application/vnd.google-apps.folder" }) }, SC.driveFile);
            folderId = made.id;
          }
        }
        var boundary = "wyzb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        var body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: String(a.name || "attachment").slice(0, 200), parents: [folderId] }) +
          "\r\n--" + boundary + "\r\nContent-Type: " + (a.mime || "application/octet-stream") + "\r\nContent-Transfer-Encoding: base64\r\n\r\n" + String(a.data || "").replace(/-/g, "+").replace(/_/g, "/") + "\r\n--" + boundary + "--";
        var f = await gfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: body }, SC.driveFile);
        return { id: f.id, name: f.name, link: f.webViewLink || ("https://drive.google.com/file/d/" + f.id + "/view"), folderId: folderId, folder: name };
      },
      list_recent_files: async function (a) {
        var q = "pageSize=" + (a.pageSize || 10) + "&orderBy=" + encodeURIComponent("modifiedByMeTime desc") +
          "&q=" + encodeURIComponent("trashed=false") + "&fields=" + encodeURIComponent("files(id,name,modifiedTime,mimeType,fileExtension)");
        var j = await gfetch("https://www.googleapis.com/drive/v3/files?" + q, null, SC.drive);
        return { files: (j.files || []).map(function (f) { return { id: f.id, title: f.name, modifiedTime: f.modifiedTime, mimeType: f.mimeType, fileExtension: f.fileExtension }; }) };
      }
    },
    "Todoist": {
      "find-tasks-by-date": async function () {
        var j = await tdfetch("/tasks/filter?query=" + encodeURIComponent("today | overdue") + "&limit=50");
        return { tasks: Array.isArray(j) ? j : (j.results || []) };
      },
      "complete-tasks": async function (a) {
        for (var i = 0; i < (a.ids || []).length; i++) await tdfetch("/tasks/" + encodeURIComponent(a.ids[i]) + "/close", { method: "POST" });
        return {};
      },
      "add-tasks": async function (a) {
        for (var i = 0; i < (a.tasks || []).length; i++) {
          var t = a.tasks[i], body = { content: t.content };
          if (t.dueString) body.due_string = t.dueString;
          await tdfetch("/tasks", { method: "POST", body: JSON.stringify(body) });
        }
        return {};
      }
    }
  };

  /* ---------- Todoist (personal API token, optional) ---------- */
  async function tdfetch(path, opt) {
    var t = ls.get(KEY.todo);
    if (!t) throw cerr("server_not_connected", "No Todoist token");
    opt = opt || {};
    var headers = { Authorization: "Bearer " + t };
    if (opt.body) headers["Content-Type"] = "application/json";
    var r = await fetch("https://api.todoist.com/api/v1" + path, Object.assign({}, opt, { headers: headers }));
    if (r.status === 401 || r.status === 403) throw cerr("needs_reauth", "Todoist rejected the token");
    if (!r.ok) throw cerr("tool_error", "Todoist answered " + r.status);
    var txt = await r.text();
    return txt ? JSON.parse(txt) : {};
  }

  /* ---------- the interface app.js uses ---------- */
  var mcp = {
    listTools: async function () { return { servers: Object.keys(TOOLS).map(function (s) { return { server: s }; }) }; },
    describeTool: async function () { throw cerr("unavailable", "No schema here"); },
    callTool: async function (server, tool, args) {
      var f = TOOLS[server] && TOOLS[server][tool];
      if (!f) throw cerr("tool_error", "Unknown tool " + server + "." + tool);
      return { payload: await f(args || {}) };
    },
    server: async function (name) {
      var t = TOOLS[name];
      if (!t) throw cerr("server_not_connected", "Unknown connector");
      var o = {};
      Object.keys(t).forEach(function (k) { o[k] = function (a) { return t[k](a || {}); }; });
      return o;
    }
  };

  var connected = function () { return !!(tok.access && Date.now() < tok.exp) || !!ls.get(KEY.flag); };

  var google_ = {
    configured: configured,
    clientId: clientId,
    fromConfigFile: function () { return !!String(CFG.GOOGLE_CLIENT_ID || "").trim(); },
    setClientId: function (v) { ls.set(KEY.cid, String(v || "").trim()); },
    connected: connected,
    wasConnected: function () { return !!ls.get(KEY.flag); },
    /* interactive=true opens Google's window (needs a tap). false tries silently. consent=true forces the permission screen. */
    connect: function (interactive, consent) {
      if (!configured()) return Promise.reject(cerr("not_configured", "Google sign-in isn't set up yet."));
      return requestToken(interactive ? (consent ? "consent" : "") : "none");
    },
    profile: profile,
    token: ensure,
    hasScope: function (name) { return tok.scope.split(" ").indexOf(SC[name]) >= 0; },
    scopeNames: function () { return Object.keys(SC); },
    hasAllScopes: function () { var have = tok.scope.split(" "); return [SC.gmailRead, SC.gmailDraft, SC.cal, SC.drive].every(function (s) { return have.indexOf(s) >= 0; }); },
    signOut: async function () {
      try { if (tok.access && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(tok.access, function () {}); } catch (e) {}
      tok = { access: "", exp: 0, scope: "" }; profileCache = null;
      ls.del(KEY.flag); ls.del(KEY.hint);
    }
  };

  var perms = {
    state: async function () { return connected() ? "granted" : "prompt"; },
    request: async function () { await google_.connect(true); return {}; },
    manage: async function () { await google_.signOut(); }
  };

  /* ---------- AI assistants: Claude and ChatGPT (each with the owner's shared key or the person's own), plus any AI added by link ---------- */
  KEY.provider = "wyz-ai-provider"; KEY.auto = "wyz-ai-auto-switched"; KEY.openai = "wyz-openai-key"; KEY.omodel = "wyz-openai-model"; KEY.links = "wyz-ai-links";
  var MODEL_LIST = [["claude-sonnet-5-5", "Sonnet 5.5 (standard)"], ["claude-haiku-5-5", "Haiku 5.5 (fastest, lowest cost)"], ["claude-opus-5-5", "Opus 5.5 (strongest, costs the most)"]];
  var OMODELS = ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-6-astra"];   /* suggestions only: the person can type any model their OpenAI account offers */
  function getModel() { var m = ls.get(KEY.model); return MODEL_LIST.some(function (x) { return x[0] === m; }) ? m : MODEL_LIST[0][0]; }
  function getOModel() { return ls.get(KEY.omodel) || OMODELS[0]; }
  function modelLabel() { return MODEL_LIST.filter(function (x) { return x[0] === getModel(); })[0][1].replace(/ \(.*/, ""); }
  var NAMES = { claude: "Claude", chatgpt: "ChatGPT" };
  function niceError(p, status, d) {
    if (/credit balance|insufficient_quota|exceeded your current quota|billing/i.test(d)) return p === "chatgpt" ? "The OpenAI account has no credit left. Add credit at platform.openai.com, under Billing." : "The Anthropic account has no credit left. Add credit under Billing at console.anthropic.com.";
    if (/model/i.test(d) && /not.?found|invalid|unknown|does not exist|access/i.test(d)) return "That " + NAMES[p] + " model isn't available on this account. Pick another one in Connections.";
    return d ? String(d).slice(0, 160) : NAMES[p] + " answered " + status;
  }
  function parseJson(txt) {
    var s = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(s); } catch (e) {}
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw cerr("tool_error", "The AI's answer wasn't readable");
  }
  /* Shared AI: the site owner's key sits on the server (api/claude.js and api/chatgpt.js). Signed-in people use it with no key of their own. */
  var shared = { claude: false, chatgpt: false };
  var down = {};
  var missing = { claude: [], chatgpt: [] };
  function creditLike(e) { var m = String((e && e.message) || ""); return /no credit|credit left|credit balance|billing|quota|insufficient|rejected the API key/i.test(m) || !!(e && (e.code === "not_granted" || e.code === "rate_limited")); }
  /* When the chosen AI has no credit and the other one works, make the working one the default for good.
     If the switch was automatic, the first AI gets its place back as soon as it works again. */
  function autoSwitch(from, to) { if (chosen() !== from) return; ls.set(KEY.provider, to); ls.set(KEY.auto, from); announce(); }
  function autoRestore(p) { if (ls.get(KEY.auto) === p && chosen() !== p) { ls.set(KEY.provider, p); ls.del(KEY.auto); announce(); } }
  function announce() { try { window.dispatchEvent(new CustomEvent("wyz-ai-status")); } catch (e) {} }
  function detectShared() {
    var probe = function (p, url) { return fetch(url, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { ok: false }; }).then(function (j) { shared[p] = !!(j && j.ok); missing[p] = (j && Array.isArray(j.missing)) ? j.missing : []; }, function () { shared[p] = false; missing[p] = []; }); };
    return Promise.all([probe("claude", "/api/claude"), probe("chatgpt", "/api/chatgpt")]).then(function () { return shared.claude || shared.chatgpt; });
  }
  var keyOf = function (p) { return ls.get(p === "chatgpt" ? KEY.openai : KEY.ai); };
  var avail = function (p) { return !!(keyOf(p) || shared[p]); };
  function chosen() { return ls.get(KEY.provider) === "chatgpt" ? "chatgpt" : "claude"; }
  function active() { var p = chosen(); if (avail(p)) return p; var o = p === "claude" ? "chatgpt" : "claude"; return avail(o) ? o : ""; }
  function modeOf(p) { p = p || active(); return !p ? "" : keyOf(p) ? "key" : shared[p] ? "shared" : ""; }
  function textOf(j) { return (j.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(""); }

  async function callShared(p, messages) {
    var t = await ensure();
    var r = await fetch(p === "chatgpt" ? "/api/chatgpt" : "/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ model: p === "chatgpt" ? getOModel() : getModel(), messages: messages, max_tokens: 8000 })
    });
    var detail = "";
    if (!r.ok) { try { detail = (await r.json()).error || ""; } catch (e) {} }
    if (r.status === 429) throw cerr("rate_limited", detail || NAMES[p] + " is busy or the daily limit was reached");
    if (!r.ok) throw cerr("tool_error", detail || NAMES[p] + " answered " + r.status);
    return { text: textOf(await r.json()) };
  }
  async function callDirect(p, messages) {
    var r, key = keyOf(p);
    if (p === "chatgpt") {
      r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ model: getOModel(), messages: messages }) });
    } else {
      r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: getModel(), max_tokens: 8000, messages: messages }) });
    }
    var d = "";
    if (!r.ok) { try { var e = (await r.json()).error || {}; d = (e.message || "") + " " + (e.code || ""); } catch (x) {} }
    if (r.status === 401) throw cerr("not_granted", NAMES[p] + " rejected the API key");
    if (r.status === 429 && !/quota|credit|billing/i.test(d)) throw cerr("rate_limited", NAMES[p] + " is busy");
    if (!r.ok) throw cerr("tool_error", niceError(p, r.status, d));
    var j = await r.json();
    return { text: p === "chatgpt" ? String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "") : textOf(j) };
  }
  function makeSample() {
    if (!active()) return null;
    /* If one AI has no credit (or its key is refused), the other one answers. The broken one is skipped for a few minutes. */
    async function call(input, opts) {
      var p = (opts && opts.provider) || active();
      if (!avail(p)) { p = active(); if (!p) throw cerr("not_granted", "No AI is connected"); }
      var messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
      var files = messages.some(function (m) { return Array.isArray(m.content); });
      var other = p === "claude" ? "chatgpt" : "claude";
      var canSwitch = !(opts && opts.noFallback) && !files && avail(other);
      var run = function (pp) { return keyOf(pp) ? callDirect(pp, messages) : callShared(pp, messages); };
      if (canSwitch && down[p] && down[p].until > Date.now() && !(down[other] && down[other].until > Date.now())) {
        try { var r0 = await run(other); r0.usedOther = other; r0.skipped = p; if (down[p].credit) autoSwitch(p, other); return r0; }
        catch (e0) { if (!creditLike(e0)) throw e0; down[other] = { until: Date.now() + 2 * 60000, why: String(e0.message || "").slice(0, 160), credit: /credit|billing|quota/i.test(String(e0.message || "")) }; announce(); throw e0; }
      }
      try {
        var ok = await run(p);
        if (down[p]) { delete down[p]; announce(); }
        autoRestore(p);
        return ok;
      } catch (e) {
        if (!creditLike(e)) throw e;
        var credit = /credit|billing|quota|insufficient/i.test(String(e.message || ""));
        down[p] = { until: Date.now() + (credit || e.code === "not_granted" ? 10 : 2) * 60000, why: String(e.message || "").slice(0, 160), credit: credit };
        announce();
        if (!canSwitch) throw e;
        try { var r = await run(other); r.usedOther = other; r.skipped = p; if (credit) autoSwitch(p, other); return r; }
        catch (e2) {
          if (creditLike(e2)) { var c2 = /credit|billing|quota|insufficient/i.test(String(e2.message || "")); down[other] = { until: Date.now() + (c2 || e2.code === "not_granted" ? 10 : 2) * 60000, why: String(e2.message || "").slice(0, 160), credit: c2 }; announce(); }
          throw e2;
        }
      }
    }
    var sample = async function (input, opts) {
      var r = await call(input, opts);
      if (opts && opts.onText) opts.onText({ text: r.text, delta: r.text });
      return r;
    };
    sample.json = async function (input, opts) {
      var r = await call(String(input) + "\n\nReturn valid JSON only. No code fences and no commentary.", opts);
      return parseJson(r.text);
    };
    return sample;
  }
  /* AIs added by link: they open in a new tab with the question filled in (or copied) */
  function links() { try { var a = JSON.parse(ls.get(KEY.links) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveLinks(a) { ls.set(KEY.links, JSON.stringify(a)); }

  window.Connectors = {
    mcp: mcp,
    perms: perms,
    google: google_,
    makeSample: makeSample,
    todoist: { has: function () { return !!ls.get(KEY.todo); }, set: function (t) { ls.set(KEY.todo, String(t || "").trim()); }, clear: function () { ls.del(KEY.todo); } },
    ai: {
      detect: detectShared, names: NAMES, missing: function (p) { return missing[p] || []; },
      chosen: chosen, setChosen: function (p) { ls.set(KEY.provider, p === "chatgpt" ? "chatgpt" : "claude"); ls.del(KEY.auto); },
      autoSwitch: autoSwitch, autoRestore: autoRestore, autoSwitched: function () { return ls.get(KEY.auto) || ""; },
      active: active, avail: avail, mode: modeOf,
      down: function (p) { return down[p] && down[p].until > Date.now() ? down[p] : null; }, clearDown: function (p) { delete down[p]; announce(); },
      /* Claude */
      models: MODEL_LIST, getModel: getModel, setModel: function (m) { ls.set(KEY.model, m); }, modelLabel: modelLabel,
      set: function (k) { ls.set(KEY.ai, String(k || "").trim()); }, clear: function () { ls.del(KEY.ai); }, has: function () { return !!ls.get(KEY.ai); },
      /* ChatGPT */
      omodels: OMODELS, getOModel: getOModel, setOModel: function (m) { ls.set(KEY.omodel, String(m || "").trim()); },
      setOpenAI: function (k) { ls.set(KEY.openai, String(k || "").trim()); }, clearOpenAI: function () { ls.del(KEY.openai); }, hasOpenAI: function () { return !!ls.get(KEY.openai); },
      label: function (p) { p = p || active(); return !p ? "" : p === "chatgpt" ? "ChatGPT " + getOModel() : "Claude " + modelLabel(); },
      /* other AIs, opened by link */
      links: links,
      addLink: function (name, url) { var a = links(); a.push({ id: Math.random().toString(36).slice(2, 9), name: String(name).trim().slice(0, 30), url: String(url).trim() }); saveLinks(a); },
      removeLink: function (id) { saveLinks(links().filter(function (x) { return x.id !== id; })); }
    }
  };
})();
