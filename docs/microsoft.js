/* Microsoft accounts (Outlook.com, Hotmail, Live and Microsoft 365) through Microsoft Graph.
   The page talks to Microsoft directly from the browser, like it does with Google. Nothing goes through a server.
   It offers the same tools the page already uses for Google (mail, calendar, files, contacts), so a Microsoft
   account works anywhere a Google account does. Needs MS_CLIENT_ID in config.js (see EXECUTION-PAGE.md). */
(function () {
  "use strict";
  var CFG = window.WYZ_CONFIG || {};
  var GR = "https://graph.microsoft.com/v1.0";
  var SCOPES = ["User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.ReadWrite", "Contacts.Read", "People.Read"];
  var cerr = function (code, message) { var e = new Error(message || code); e.code = code; return e; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var configured = function () { return /^[0-9a-f-]{36}$/i.test(String(CFG.MS_CLIENT_ID || "").trim()); };

  /* ---------- sign-in (MSAL loads only when someone uses Microsoft) ---------- */
  var pca = null, readyP = null, redirectResult = null;
  function loadLib() {
    if (window.msal) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "msal-browser.min.js"; s.onload = res;
      s.onerror = function () { rej(cerr("ms_unavailable", "Microsoft sign-in didn't load. Check your connection and reload.")); };
      document.head.appendChild(s);
    });
  }
  function ready() {
    if (!configured()) return Promise.reject(cerr("ms_not_configured", "Microsoft sign-in isn't switched on yet. Ask the person who invited you."));
    if (!readyP) readyP = loadLib().then(function () {
      pca = new window.msal.PublicClientApplication({
        auth: { clientId: String(CFG.MS_CLIENT_ID).trim(), authority: "https://login.microsoftonline.com/common", redirectUri: location.origin + "/", navigateToLoginRequestUrl: false },
        cache: { cacheLocation: "localStorage" }
      });
      return pca.initialize();
    }).then(function () { return pca.handleRedirectPromise(); }).then(function (r) { redirectResult = r || null; return pca; });
    return readyP;
  }
  var standaloneIos = function () { return navigator.standalone === true; };
  var acctOf = function (email) { email = String(email || "").toLowerCase(); return (pca.getAllAccounts() || []).filter(function (a) { return String(a.username || "").toLowerCase() === email; })[0] || null; };
  var who = function (r) { var a = r.account || {}; return { email: String(a.username || "").toLowerCase(), name: a.name || "", id: a.homeAccountId || a.localAccountId || a.username, token: r.accessToken, exp: r.expiresOn ? +new Date(r.expiresOn) : Date.now() + 3000000 }; };
  /* interactive sign-in: a Microsoft window (or a full-page sign-in in the installed iPhone app) */
  async function signIn(opt) {
    opt = opt || {};
    await ready();
    var req = { scopes: SCOPES, prompt: "select_account" };
    if (opt.hint) req.loginHint = opt.hint;
    if (standaloneIos()) { try { sessionStorage.setItem("wyz-ms-pending", opt.extra ? "extra" : "main"); } catch (e) {} await pca.loginRedirect(req); return new Promise(function () {}); }
    try { return who(await pca.loginPopup(Object.assign({ redirectUri: location.origin + "/ms-redirect" }, req))); }
    catch (e) {
      var c = String(e && e.errorCode || "");
      if (/user_cancelled|popup_window_error|empty_window_error/.test(c)) throw cerr(/popup_window_error|empty_window_error/.test(c) ? "popup_failed_to_open" : "popup_closed", "The Microsoft window was closed.");
      throw cerr("ms_error", (e && e.errorMessage) || (e && e.message) || "Microsoft sign-in failed");
    }
  }
  /* silent token: Microsoft keeps people signed in, so this normally needs no tap */
  async function token(email) {
    await ready();
    var a = acctOf(email);
    if (!a) throw cerr("needs_reauth", "Sign in to Microsoft again");
    try { return who(await pca.acquireTokenSilent({ scopes: SCOPES, account: a })); }
    catch (e) { throw cerr("needs_reauth", "Microsoft needs you to sign in again"); }
  }
  async function signOut(email) {
    try { await ready(); var a = acctOf(email); if (a) await pca.clearCache({ account: a }); } catch (e) {}
  }
  /* coming back from a full-page sign-in */
  async function pending() {
    var kind = ""; try { kind = sessionStorage.getItem("wyz-ms-pending") || ""; sessionStorage.removeItem("wyz-ms-pending"); } catch (e) {}
    if (!kind || !configured()) return null;
    try { await ready(); } catch (e) { return null; }
    return redirectResult ? { kind: kind, who: who(redirectResult) } : null;
  }

  /* ---------- Microsoft Graph tools, shaped like the Google ones ---------- */
  function makeTools(getTok, myEmail) {
    async function g(path, opt, tries) {
      opt = opt || {}; tries = tries || 0;
      var t = await getTok();
      var h = Object.assign({ Authorization: "Bearer " + t, Prefer: 'outlook.timezone="UTC", outlook.body-content-type="html"' }, opt.headers || {});
      if (opt.json !== undefined) { h["Content-Type"] = "application/json"; opt.body = JSON.stringify(opt.json); }
      var r = await fetch(/^https:/.test(path) ? path : GR + path, { method: opt.method || "GET", headers: h, body: opt.body });
      if (r.status === 429 || r.status === 503) {
        if (tries < 2) { var ra = +r.headers.get("Retry-After") || (tries ? 15 : 3); await sleep(Math.min(30, ra) * 1000); return g(path, opt, tries + 1); }
        throw cerr("rate_limited", "Microsoft asked the page to slow down for a minute. It clears by itself, then tap Refresh.");
      }
      if (r.status === 401) throw cerr("needs_reauth", "Microsoft needs you to sign in again");
      if (r.status === 403) throw cerr("consent_required", "Microsoft didn't give permission for this.");
      if (!r.ok) { var m = ""; try { m = ((await r.json()).error || {}).message || ""; } catch (e) {} throw cerr("tool_error", "Microsoft answered " + r.status + (m ? ": " + m.slice(0, 120) : "")); }
      if (opt.as === "buffer") return r.arrayBuffer();
      return r.status === 204 || r.status === 202 ? {} : r.json();
    }
    var me = String(myEmail || "").toLowerCase();
    var folders = {};
    async function folderId(name) { if (!folders[name]) folders[name] = (await g("/me/mailFolders/" + name + "?$select=id")).id; return folders[name]; }
    var SEL = "id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,importance,flag,parentFolderId,hasAttachments,webLink,isDraft";
    var fmt = function (r) { var e = r && r.emailAddress; return !e ? "" : e.name && e.name !== e.address ? e.name + " <" + e.address + ">" : (e.address || ""); };
    var addrs = function (list) { return (list || []).map(function (s) { s = String(s); var m = s.match(/^(.*)<([^>]+)>\s*$/); return { emailAddress: m ? { address: m[2].trim(), name: m[1].replace(/"/g, "").trim() } : { address: s.trim() } }; }); };
    var q = function (s) { return String(s).replace(/'/g, "''"); };
    var stdB64 = function (s) { return String(s || "").replace(/-/g, "+").replace(/_/g, "/"); };
    var urlB64 = function (s) { return String(s || "").replace(/\+/g, "-").replace(/\//g, "_"); };
    function htmlText(h) {
      return String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
    }
    async function slim(m, withBody) {
      var sentF = await folderId("sentitems").catch(function () { return ""; }), inF = await folderId("inbox").catch(function () { return ""; });
      var from = ((m.from || {}).emailAddress || {}).address || "";
      var labels = [];
      if (m.parentFolderId === sentF || String(from).toLowerCase() === me) labels.push("SENT");
      if (m.parentFolderId === inF) labels.push("INBOX");
      if (m.isRead === false) labels.push("UNREAD");
      if (m.importance === "high") labels.push("IMPORTANT");
      if (m.flag && m.flag.flagStatus === "flagged") labels.push("STARRED");
      var o = { id: m.id, threadId: m.conversationId, labelIds: labels, snippet: m.bodyPreview || "", sender: fmt(m.from), toRecipients: (m.toRecipients || []).map(fmt),
        subject: m.subject || "", date: m.receivedDateTime || m.sentDateTime || "", viewUrl: m.webLink || "" };
      if (withBody) {
        var b = m.body || {}, html = b.contentType === "html" ? b.content || "" : "";
        o.plaintextBody = html ? htmlText(html) : (b.content || "");
        o.html = html.slice(0, 800000);
        o.ccRecipients = (m.ccRecipients || []).map(fmt);
        o.replyTo = (m.replyTo || []).map(fmt).join(", ");
        o.unsub = ""; o.unsubPost = "";
        o.files = []; o.attachments = [];
        if (m.hasAttachments) {
          try {
            var at = await g("/me/messages/" + encodeURIComponent(m.id) + "/attachments?$select=id,name,contentType,size,isInline,contentId");
            (at.value || []).forEach(function (x) { o.files.push({ name: x.name || "", type: x.contentType || "application/octet-stream", id: x.id, data: "", cid: String(x.contentId || "").replace(/[<>]/g, ""), size: x.size || 0 }); o.attachments.push(x.name || ""); });
          } catch (e) {}
        }
      }
      return o;
    }
    async function convo(id, extra) {
      var j = await g("/me/messages?$top=50&$select=" + SEL + (extra || "") + "&$filter=" + encodeURIComponent("conversationId eq '" + q(id) + "'"));
      return (j.value || []).filter(function (m) { return !m.isDraft; }).sort(function (a, b) { return Date.parse(a.receivedDateTime || a.sentDateTime) - Date.parse(b.receivedDateTime || b.sentDateTime); });
    }
    async function pool(items, n, fn) {
      var out = new Array(items.length), i = 0, ws = [];
      for (var w = 0; w < Math.min(n, items.length); w++) ws.push((async function () { while (i < items.length) { var k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })());
      await Promise.all(ws); return out;
    }
    var DAY = 86400000;
    async function search(a) {
      var s = String(a.query || ""), n = a.pageSize || 20;
      var folder = /in:sent/.test(s) ? "sentitems" : /in:inbox/.test(s) ? "inbox" : "";
      var span = function (m) { return m ? +m[1] * (m[2] === "d" ? 1 : m[2] === "m" ? 30 : m[2] === "y" ? 365 : 1) : 0; };
      var newer = span(s.match(/newer_than:(\d+)([dmy]?)/)), older = span(s.match(/older_than:(\d+)([dmy]?)/));
      var unread = /is:unread/.test(s);
      var text = s.replace(/-?\S+:\S+/g, " ").replace(/\b(OR|AND)\b/g, " ").replace(/[(){}"]/g, " ").replace(/\s+/g, " ").trim();
      var field = folder === "sentitems" ? "sentDateTime" : "receivedDateTime";
      var url = "/me" + (folder ? "/mailFolders/" + folder : "") + "/messages?$top=" + Math.min(50, n * 2) + "&$select=" + SEL;
      if (text) url += "&$search=" + encodeURIComponent('"' + text.replace(/"/g, "") + '"');
      else {
        var f = [field + " ge " + new Date(newer ? Date.now() - newer * DAY : Date.UTC(2000, 0, 1)).toISOString()];
        if (older) f.push(field + " lt " + new Date(Date.now() - older * DAY).toISOString());
        if (unread) f.push("isRead eq false");
        url += "&$filter=" + encodeURIComponent(f.join(" and ")) + "&$orderby=" + field + " desc";
      }
      var j = await g(url), list = (j.value || []).filter(function (m) { return !m.isDraft; });
      if (text) list = list.filter(function (m) { var d = Date.parse(m[field] || m.receivedDateTime); return (!newer || d >= Date.now() - newer * DAY) && (!older || d < Date.now() - older * DAY); });
      var byC = {}, order = [];
      list.forEach(function (m) { if (!byC[m.conversationId]) { byC[m.conversationId] = []; order.push(m.conversationId); } byC[m.conversationId].push(m); });
      order = order.slice(0, n);
      /* sent mail: bring in the whole conversation, so the page can see whether they answered */
      if (folder === "sentitems") await pool(order, 4, async function (c) { byC[c] = await convo(c); });
      var threads = [];
      for (var i = 0; i < order.length; i++) {
        var ms = byC[order[i]].slice().sort(function (a, b) { return Date.parse(a.receivedDateTime || a.sentDateTime) - Date.parse(b.receivedDateTime || b.sentDateTime); });
        var sl = []; for (var k = 0; k < ms.length; k++) sl.push(await slim(ms[k], false));
        threads.push({ id: order[i], messageCount: sl.length, messages: sl, viewUrl: (ms[ms.length - 1] || {}).webLink || "" });
      }
      return { threads: threads };
    }
    var ids = async function (threadId) { return (await convo(threadId)).map(function (m) { return m; }); };
    async function draftFor(a) {
      var d;
      if (a.replyToMessageId) d = await g("/me/messages/" + encodeURIComponent(a.replyToMessageId) + "/createReply", { method: "POST", json: {} });
      else d = await g("/me/messages", { method: "POST", json: { subject: a.subject || "" } });
      await g("/me/messages/" + encodeURIComponent(d.id), { method: "PATCH", json: { subject: a.subject || d.subject || "", body: { contentType: "Text", content: a.body || "" }, toRecipients: addrs(a.to), ccRecipients: addrs(a.cc) } });
      for (var i = 0; i < (a.attachments || []).length; i++) {
        var f = a.attachments[i];
        await g("/me/messages/" + encodeURIComponent(d.id) + "/attachments", { method: "POST", json: { "@odata.type": "#microsoft.graph.fileAttachment", name: String(f.name || "file"), contentType: f.type || "application/octet-stream", contentBytes: stdB64(f.data) } });
      }
      return d;
    }
    var moveAll = async function (threadId, dest, onlyInbox) {
      var inF = onlyInbox ? await folderId("inbox") : "";
      var ms = (await ids(threadId)).filter(function (m) { return !onlyInbox || m.parentFolderId === inF; });
      for (var i = 0; i < ms.length; i++) await g("/me/messages/" + encodeURIComponent(ms[i].id) + "/move", { method: "POST", json: { destinationId: dest } });
      return {};
    };
    function ev(e) {
      var z = function (s) { return s && s.dateTime ? (/Z$|[+-]\d\d:\d\d$/.test(s.dateTime) ? s.dateTime : s.dateTime.replace(/\.\d+$/, "") + "Z") : ""; };
      var st = z(e.start), en = z(e.end);
      return { id: e.id, status: e.isCancelled ? "cancelled" : "confirmed", summary: e.subject || "", description: String(e.bodyPreview || "").slice(0, 1500), location: (e.location || {}).displayName || "",
        start: e.isAllDay ? { date: st.slice(0, 10) } : { dateTime: st }, end: e.isAllDay ? { date: en.slice(0, 10) } : { dateTime: en }, htmlLink: e.webLink || "",
        conferenceUrl: (e.onlineMeeting && e.onlineMeeting.joinUrl) || "", organizer: ((e.organizer || {}).emailAddress || {}).address || "",
        attendees: (e.attendees || []).map(function (x) { var a = x.emailAddress || {}; return { email: String(a.address || "").toLowerCase(), name: a.name || "", self: String(a.address || "").toLowerCase() === me, resource: x.type === "resource" }; }) };
    }
    var fileOf = function (f) {
      var r = f.remoteItem || {}, drive = (r.parentReference || f.parentReference || {}).driveId || "", id = r.id || f.id;
      var name = f.name || r.name || "", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || "";
      return { id: (drive ? drive + "!" : "") + id, title: name, modifiedTime: f.lastModifiedDateTime || r.lastModifiedDateTime || "", mimeType: ((f.file || r.file || {}).mimeType) || "", fileExtension: ext, link: f.webUrl || r.webUrl || "" };
    };
    var itemPath = function (fileId) { var p = String(fileId).split("!"); return p.length > 1 && /^[A-Za-z0-9]/.test(p[0]) && p[0].length < 40 && !/\./.test(p[0]) && p[1] ? "/drives/" + encodeURIComponent(p[0]) + "/items/" + encodeURIComponent(p.slice(1).join("!")) : "/me/drive/items/" + encodeURIComponent(fileId); };
    var tz = "Arabian Standard Time";
    var fix = function (v) { return String(v).length === 16 ? v + ":00" : String(v); };
    return {
      "Gmail": {
        search_threads: search,
        get_thread: async function (a) {
          var plain = a.messageFormat === "PLAIN_TEXT";
          var ms = await convo(a.threadId, plain ? ",body,ccRecipients,replyTo" : "");
          var out = []; for (var i = 0; i < ms.length; i++) out.push(await slim(ms[i], plain));
          return { id: a.threadId, messages: out };
        },
        get_attachment: async function (a) { var j = await g("/me/messages/" + encodeURIComponent(a.messageId) + "/attachments/" + encodeURIComponent(a.attachmentId)); return { data: urlB64(j.contentBytes || "") }; },
        send_message: async function (a) { var d = await draftFor(a); await g("/me/messages/" + encodeURIComponent(d.id) + "/send", { method: "POST" }); return { id: d.id, threadId: d.conversationId || "" }; },
        create_draft: async function (a) { var d = await draftFor(a); return { id: d.id, viewUrl: d.webLink || "https://outlook.live.com/mail/0/drafts" }; },
        archive_thread: function (a) { return moveAll(a.threadId, "archive", true); },
        trash_thread: function (a) { return moveAll(a.threadId, "deleteditems", false); },
        mark_read: async function (a) { var ms = (await ids(a.threadId)).filter(function (m) { return m.isRead === false; }); for (var i = 0; i < ms.length; i++) await g("/me/messages/" + encodeURIComponent(ms[i].id), { method: "PATCH", json: { isRead: true } }); return {}; },
        modify_thread: async function (a) {
          var add = a.add || [], rem = a.remove || [], ms = await ids(a.threadId), last = ms[ms.length - 1];
          if (add.indexOf("STARRED") >= 0 && last) await g("/me/messages/" + encodeURIComponent(last.id), { method: "PATCH", json: { flag: { flagStatus: "flagged" } } });
          if (rem.indexOf("STARRED") >= 0) for (var i = 0; i < ms.length; i++) if (ms[i].flag && ms[i].flag.flagStatus === "flagged") await g("/me/messages/" + encodeURIComponent(ms[i].id), { method: "PATCH", json: { flag: { flagStatus: "notFlagged" } } });
          var folder = add.filter(function (x) { return !/^(STARRED|INBOX|UNREAD|IMPORTANT|SENT|TRASH)$/.test(x); })[0];
          if (folder) return moveAll(a.threadId, folder, false);
          if (rem.indexOf("INBOX") >= 0) return moveAll(a.threadId, "archive", true);
          return {};
        },
        list_labels: async function () { var j = await g("/me/mailFolders?$top=100&$select=id,displayName,wellKnownName"); return { labels: (j.value || []).filter(function (f) { return !f.wellKnownName; }).map(function (f) { return { id: f.id, name: f.displayName }; }).sort(function (a, b) { return a.name.localeCompare(b.name); }) }; },
        create_label: async function (a) { var f = await g("/me/mailFolders", { method: "POST", json: { displayName: String(a.name).slice(0, 100) } }); return { id: f.id, name: f.displayName }; },
        unsubscribe_one_click: async function () { throw cerr("tool_error", "One-tap unsubscribe isn't available for Outlook. Open the email and use its unsubscribe link."); }
      },
      "Google Calendar": {
        list_events: async function (a) {
          var j = await g("/me/calendarView?startDateTime=" + encodeURIComponent(new Date(a.startTime).toISOString()) + "&endDateTime=" + encodeURIComponent(new Date(a.endTime).toISOString()) +
            "&$top=" + (a.pageSize || 40) + "&$orderby=start/dateTime&$select=id,subject,start,end,location,attendees,organizer,onlineMeeting,isCancelled,isAllDay,bodyPreview,webLink");
          var list = (j.value || []).map(ev);
          if (a.q) { var w = String(a.q).toLowerCase(); list = list.filter(function (e) { return (e.summary + " " + e.description + " " + e.location).toLowerCase().indexOf(w) >= 0; }); }
          return { events: list };
        },
        create_event: async function (a) {
          var body = { subject: a.title || "Meeting", body: { contentType: "Text", content: a.description || "" }, start: { dateTime: fix(a.start), timeZone: tz }, end: { dateTime: fix(a.end), timeZone: tz } };
          if (a.location) body.location = { displayName: a.location };
          if (a.attendees && a.attendees.length) body.attendees = a.attendees.map(function (e) { return { emailAddress: { address: e }, type: "required" }; });
          if (a.video) { body.isOnlineMeeting = true; body.onlineMeetingProvider = "teamsForBusiness"; }
          var e;
          try { e = await g("/me/events", { method: "POST", json: body }); }
          catch (x) { if (!a.video) throw x; delete body.isOnlineMeeting; delete body.onlineMeetingProvider; e = await g("/me/events", { method: "POST", json: body }); }
          return { id: e.id, htmlLink: e.webLink || "" };
        },
        move_event: async function (a) {
          var body = { start: { dateTime: fix(a.start), timeZone: tz }, end: { dateTime: fix(a.end), timeZone: tz } };
          if (a.title) body.subject = a.title;
          if (a.location != null) body.location = { displayName: a.location };
          var e = await g("/me/events/" + encodeURIComponent(a.eventId), { method: "PATCH", json: body });
          return { id: e.id, htmlLink: e.webLink || "" };
        }
      },
      "Google Contacts": {
        list_contacts: async function () {
          var people = [], add = function (n, e) { if (e) people.push({ name: n || "", email: String(e).toLowerCase() }); };
          try { var c = await g("/me/contacts?$top=500&$select=displayName,emailAddresses"); (c.value || []).forEach(function (p) { (p.emailAddresses || []).forEach(function (x) { add(p.displayName, x.address); }); }); } catch (e) {}
          try { var r = await g("/me/people?$top=300&$select=displayName,scoredEmailAddresses"); (r.value || []).forEach(function (p) { (p.scoredEmailAddresses || []).forEach(function (x) { add(p.displayName, x.address); }); }); } catch (e) {}
          return { people: people };
        }
      },
      "Google Drive": {
        list_recent_files: async function (a) { var j = await g("/me/drive/recent?$top=" + (a.pageSize || 10)); return { files: (j.value || []).filter(function (f) { return f.file || (f.remoteItem && f.remoteItem.file); }).map(fileOf) }; },
        search_files: async function (a) { var j = await g("/me/drive/root/search(q='" + encodeURIComponent(q(a.query || "")) + "')?$top=" + (a.pageSize || 15)); return { files: (j.value || []).filter(function (f) { return f.file; }).map(fileOf) }; },
        read_file: async function (a) {
          var p = itemPath(a.fileId), meta = await g(p + "?$select=size,name,file");
          var mime = ((meta.file || {}).mimeType) || String(a.mimeType || ""), name = meta.name || "";
          if (/\.(docx|pptx|xlsx|doc|ppt|xls)$/i.test(name) && +meta.size <= 15000000) { var pdf = await g(p + "/content?format=pdf", { as: "buffer" }); return { data: b64(pdf), mime: "application/pdf" }; }
          if (+meta.size > 3000000) throw cerr("tool_error", "That file is too big to read here (over 3 MB). Open it in OneDrive.");
          var buf = await g(p + "/content", { as: "buffer" });
          if (/^text\/|json|csv/.test(mime)) return { text: new TextDecoder().decode(buf).slice(0, 200000) };
          return { data: b64(buf), mime: mime };
        },
        save_file: async function (a) {
          var folder = String(a.folder || "WYZ Rent Attachments").replace(/[\\\/:*?"<>|]/g, " ").slice(0, 80).trim() || "WYZ Rent Attachments";
          var name = String(a.name || "attachment").replace(/[\\\/:*?"<>|]/g, " ").slice(0, 200);
          var bin = atob(stdB64(a.data)), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          if (u.length > 4000000) throw cerr("tool_error", "That file is over 4 MB. Save it from Outlook instead.");
          var t = await getTok();
          var r = await fetch(GR + "/me/drive/root:/" + encodeURIComponent(folder) + "/" + encodeURIComponent(name) + ":/content?@microsoft.graph.conflictBehavior=rename", { method: "PUT", headers: { Authorization: "Bearer " + t, "Content-Type": a.mime || "application/octet-stream" }, body: u });
          if (!r.ok) throw cerr("tool_error", "OneDrive answered " + r.status);
          var f = await r.json();
          return { id: f.id, name: f.name, link: f.webUrl || "", folderId: "", folder: folder };
        }
      }
    };
  }
  function b64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }

  window.WyzMS = { configured: configured, ready: ready, signIn: signIn, token: token, signOut: signOut, pending: pending, makeTools: makeTools };
})();
