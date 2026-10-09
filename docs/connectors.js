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
    cal: "https://www.googleapis.com/auth/calendar.readonly",
    drive: "https://www.googleapis.com/auth/drive.metadata.readonly"
  };
  var SCOPES = ["openid", "email", "profile", SC.gmailRead, SC.gmailDraft, SC.cal, SC.drive].join(" ");
  var KEY = { flag: "wyz-google-flag", hint: "wyz-google-hint", todo: "wyz-todoist-token", ai: "wyz-claude-key", cid: "wyz-google-client-id" };

  var ls = {
    get: function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var cerr = function (code, message) { var e = new Error(message || code); e.code = code; return e; };
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
    return r.status === 204 ? {} : r.json();
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
  function bodyOf(p) {
    if (!p) return "";
    if (p.mimeType === "text/plain" && p.body && p.body.data) return b64decode(p.body.data);
    for (var i = 0; i < (p.parts || []).length; i++) { var t = bodyOf(p.parts[i]); if (t) return t; }
    return "";
  }
  function slimMsg(m, withBody) {
    var o = {
      id: m.id, threadId: m.threadId, labelIds: m.labelIds || [], snippet: m.snippet || "",
      sender: hdr(m, "From"), toRecipients: splitAddrs(hdr(m, "To")), subject: hdr(m, "Subject"),
      date: m.internalDate ? new Date(+m.internalDate).toISOString() : hdr(m, "Date"),
      viewUrl: threadUrl(m.threadId)
    };
    if (withBody) o.plaintextBody = bodyOf(m.payload);
    return o;
  }
  var META = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";

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
        var threadId = "", inReply = "", refs = "";
        if (a.replyToMessageId) {
          var o = await gfetch(GM + "/messages/" + encodeURIComponent(a.replyToMessageId) + "?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References", null, SC.gmailDraft);
          threadId = o.threadId; inReply = hdr(o, "Message-ID"); refs = hdr(o, "References");
        }
        var enc = function (s) { return /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?="; };
        var lines = ["To: " + (a.to || []).join(", "), "Subject: " + enc(a.subject || "")];
        if (inReply) { lines.push("In-Reply-To: " + inReply); lines.push("References: " + (refs ? refs + " " : "") + inReply); }
        lines.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "");
        var bodyB64 = btoa(unescape(encodeURIComponent(a.body || ""))).replace(/(.{76})/g, "$1\r\n");
        var raw = b64url(lines.join("\r\n") + "\r\n" + bodyB64);
        var msg = { raw: raw }; if (threadId) msg.threadId = threadId;
        var d = await gfetch(GM + "/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) }, SC.gmailDraft);
        return { id: d.id, viewUrl: "https://mail.google.com/mail/?authuser=" + encodeURIComponent(mailTo()) + "#drafts" };
      }
    },
    "Google Calendar": {
      list_events: async function (a) {
        var q = "singleEvents=true&orderBy=startTime&maxResults=" + (a.pageSize || 40) +
          "&timeMin=" + encodeURIComponent(new Date(a.startTime).toISOString()) +
          "&timeMax=" + encodeURIComponent(new Date(a.endTime).toISOString());
        var j = await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?" + q, null, SC.cal);
        return {
          events: (j.items || []).map(function (e) {
            var video = e.conferenceData && (e.conferenceData.entryPoints || []).find(function (x) { return x.entryPointType === "video"; });
            return { status: e.status, summary: e.summary, location: e.location, start: e.start, end: e.end, htmlLink: e.htmlLink, conferenceUrl: e.hangoutLink || (video && video.uri) || "" };
          })
        };
      }
    },
    "Google Drive": {
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
    setClientId: function (v) { ls.set(KEY.cid, String(v || "").trim()); },
    connected: connected,
    wasConnected: function () { return !!ls.get(KEY.flag); },
    /* interactive=true opens Google's window (needs a tap). false tries silently. consent=true forces the permission screen. */
    connect: function (interactive, consent) {
      if (!configured()) return Promise.reject(cerr("not_configured", "Google sign-in isn't set up yet."));
      return requestToken(interactive ? (consent ? "consent" : "") : "none");
    },
    profile: profile,
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

  /* ---------- Claude (optional, the person's own API key) ---------- */
  var MODELS = { quick: "claude-haiku-5-5", "default": "claude-sonnet-5-5", complex: "claude-opus-5-5" };
  function parseJson(txt) {
    var s = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(s); } catch (e) {}
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw cerr("tool_error", "Claude's answer wasn't readable");
  }
  /* Shared Claude: the site owner's key sits on the server (api/claude.js). Signed-in people use it with no key of their own. */
  var shared = false;
  function detectShared() {
    return fetch("/api/claude", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { ok: false }; }).then(function (j) { shared = !!(j && j.ok); return shared; }, function () { shared = false; return false; });
  }
  async function callShared(messages, opts) {
    var t = await ensure();
    var r = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ tier: (opts && opts.modelTier) || "default", messages: messages, max_tokens: 8000 })
    });
    if (r.status === 429) throw cerr("rate_limited", "Claude is busy or the daily limit was reached");
    if (r.status === 401 || r.status === 403) throw cerr("tool_error", "Claude isn't available for this account");
    if (!r.ok) throw cerr("tool_error", "Claude answered " + r.status);
    var j = await r.json();
    return { text: (j.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("") };
  }
  function makeSample() {
    var key = ls.get(KEY.ai);
    if (!key && !shared) return null;
    async function call(input, opts) {
      var messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
      if (!key) return callShared(messages, opts);
      var r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: MODELS[(opts && opts.modelTier) || "default"] || MODELS["default"], max_tokens: 8000, messages: messages })
      });
      if (r.status === 401 || r.status === 403) throw cerr("not_granted", "Claude rejected the API key");
      if (r.status === 429 || r.status === 529) throw cerr("rate_limited", "Claude is busy");
      if (!r.ok) throw cerr("tool_error", "Claude answered " + r.status);
      var j = await r.json();
      return { text: (j.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("") };
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

  window.Connectors = {
    mcp: mcp,
    perms: perms,
    google: google_,
    makeSample: makeSample,
    todoist: { has: function () { return !!ls.get(KEY.todo); }, set: function (t) { ls.set(KEY.todo, String(t || "").trim()); }, clear: function () { ls.del(KEY.todo); } },
    ai: { detect: detectShared, mode: function () { return ls.get(KEY.ai) ? "key" : shared ? "shared" : ""; }, has: function () { return !!ls.get(KEY.ai); }, set: function (k) { ls.set(KEY.ai, String(k || "").trim()); }, clear: function () { ls.del(KEY.ai); } }
  };
})();
