/* Library: every ChatGPT and Claude conversation you have, kept on this device so you can search, read and ask questions of it.
   - Import the full export (ChatGPT: Settings, Data controls, Export data. Claude: Settings, Privacy, Export data). A .zip or the json files inside it.
   - Everything is saved in this browser's own storage (IndexedDB), never on a server. It does not sync between devices: import again on another device.
   - "Ask my memory" finds the most relevant passages in your chats, adds the memory profile you pasted (ChatGPT's saved memories are not part of
     its export, so you copy them in once), and asks the AI you chose to answer from that material only. Only your question and those passages are sent.
   Reads and writes only its own storage. It never touches your email. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof infoOpen !== "function") return;

  var DB = null, dbName = "";
  var short = function (s, n) { return typeof clip === "function" ? clip(s, n) : String(s || "").slice(0, n); };
  var B = function (t, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = function () { fn(b); }; return b; };
  var fmtDate = function (ms) { try { return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  var plural = function (n, w) { return n.toLocaleString("en-GB") + " " + w + (n === 1 ? "" : "s"); };

  /* ---------- storage (IndexedDB) ---------- */
  function openDb() {
    var name = "wyz-library-" + (typeof LS === "string" ? LS : "default");
    if (DB && dbName === name) return Promise.resolve(DB);
    return new Promise(function (ok, no) {
      var r = indexedDB.open(name, 3); dbName = name;
      r.onupgradeneeded = function () { var d = r.result; ["convs", "files", "trash"].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: "key" }); }); if (!d.objectStoreNames.contains("memory")) d.createObjectStore("memory", { keyPath: "id" }); };
      r.onsuccess = function () { DB = r.result; ok(DB); };
      r.onerror = function () { no(r.error || new Error("This browser would not open its storage.")); };
    });
  }
  function tx(store, mode, fn) {
    return openDb().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
        t.onerror = t.onabort = function () { no(t.error || new Error("Storage failed.")); };
      });
    });
  }
  function putMany(store, list) { return tx(store, "readwrite", function (s) { list.forEach(function (x) { s.put(x); }); }); }
  function delMany(store, keys) { return tx(store, "readwrite", function (s) { keys.forEach(function (k) { s.delete(k); }); }); }
  function getAll(store) { return tx(store, "readonly", function (s) { return s.getAll(); }); }
  function walk(each) {
    return openDb().then(function (d) {
      return new Promise(function (ok, no) {
        var c = d.transaction("convs", "readonly").objectStore("convs").openCursor();
        c.onsuccess = function () { var cur = c.result; if (cur) { each(cur.value); cur.continue(); } else ok(); };
        c.onerror = function () { no(c.error); };
      });
    });
  }
  function clearAll() { return tx("convs", "readwrite", function (s) { s.clear(); }).then(function () { return tx("files", "readwrite", function (s) { s.clear(); }); }).then(function () { return tx("trash", "readwrite", function (s) { s.clear(); }); }).then(function () { return tx("memory", "readwrite", function (s) { s.clear(); }); }); }
  var stats = null;
  function loadStats() {
    var by = { chatgpt: 0, claude: 0 }, newest = 0, oldest = Infinity, msgs = 0;
    return walk(function (c) { by[c.src] = (by[c.src] || 0) + 1; newest = Math.max(newest, c.at || 0); if (c.at) oldest = Math.min(oldest, c.at); msgs += c.n || 0; })
      .then(function () { return getAll("memory"); })
      .then(function (m) { stats = { by: by, total: (by.chatgpt || 0) + (by.claude || 0), newest: newest, oldest: oldest === Infinity ? 0 : oldest, msgs: msgs, memory: m }; return stats; });
  }

  /* ---------- reading the export files ---------- */
  var MAXMSG = 20000, MAXCONV = 250000;
  function pushMsg(list, role, text, at, tot) {
    text = String(text || "").trim(); if (!text) return tot;
    if (text.length > MAXMSG) text = text.slice(0, MAXMSG) + " [shortened]";
    if (tot + text.length > MAXCONV) return tot;
    list.push({ r: role, t: text, at: at || 0 }); return tot + text.length;
  }
  /* every file ChatGPT knows of in one chat: canvas documents, files you shared, files it made. Looks at every branch, not only the visible one. */
  function gptFiles(c, id) {
    var out = [], seen = {}, url = id ? "https://chatgpt.com/c/" + id : "https://chatgpt.com/", chat = String(c.title || "Untitled").slice(0, 160);
    var list = Object.keys(c.mapping || {}).map(function (k) { return c.mapping[k] && c.mapping[k].message; }).filter(Boolean).sort(function (a, b) { return (a.create_time || 0) - (b.create_time || 0); });
    list.forEach(function (m) {
      var at = (m.create_time || c.update_time || c.create_time || 0) * 1000, ct = m.content || {}, parts = Array.isArray(ct.parts) ? ct.parts.filter(function (p) { return typeof p === "string"; }) : [];
      var add = function (k, kind, title, text) { if (!title || seen[k]) return null; var f = { key: "chatgpt:" + id + ":" + k, src: "chatgpt", kind: kind, title: String(title).slice(0, 200), at: at, chat: chat, url: url, text: String(text || "").slice(0, 120000) }; seen[k] = f; out.push(f); return f; };
      var rc = String(m.recipient || "");
      if (/^canmore\.(create|update)_textdoc$/.test(rc)) {
        try {
          var j = JSON.parse(parts.join(""));
          if (/create/.test(rc)) add("canvas:" + (j.name || ""), "Canvas document", j.name || "Canvas document", j.content);
          else { var last = out.filter(function (f) { return f.kind === "Canvas document"; }).pop(); var u = (j.updates || [])[0]; if (last) { last.at = at; if (u && u.pattern === ".*" && u.replacement) last.text = String(u.replacement).slice(0, 120000); } }
        } catch (e) {}
      }
      ((m.metadata && m.metadata.attachments) || []).forEach(function (a) { if (a && a.name) add("att:" + a.name, "File you shared", a.name, ""); });
      if (m.author && m.author.role === "assistant") parts.forEach(function (p) { (p.match(/sandbox:\/mnt\/data\/[^\s)\]"']+/g) || []).forEach(function (u) { var n; try { n = decodeURIComponent(u.split("/").pop()); } catch (e) { n = u.split("/").pop(); } add("made:" + n, "Made by ChatGPT", n, ""); }); });
    });
    return out;
  }
  function claudeFiles(c, id) {
    var out = [], seen = {}, url = id ? "https://claude.ai/chat/" + id : "https://claude.ai/", chat = String(c.name || "Untitled").slice(0, 160);
    (c.chat_messages || []).forEach(function (m) {
      var at = Date.parse(m.created_at || c.updated_at || c.created_at || "") || 0;
      var add = function (k, kind, title, text) { if (!title) return null; var key = "claude:" + id + ":" + k, f = seen[key]; if (f) { f.at = at; if (text) f.text = String(text).slice(0, 120000); return f; } f = { key: key, src: "claude", kind: kind, title: String(title).slice(0, 200), at: at, chat: chat, url: url, text: String(text || "").slice(0, 120000) }; seen[key] = f; out.push(f); return f; };
      (m.content || []).forEach(function (x) { if (x && x.type === "tool_use" && x.name === "artifacts" && x.input && (x.input.title || x.input.id)) add("art:" + (x.input.id || x.input.title), "Artifact", x.input.title || "Artifact", x.input.content); });
      (m.attachments || []).concat(m.files || []).forEach(function (a) { var n = a && (a.file_name || a.name); if (n) add("att:" + n, "File you shared", n, a.extracted_content || ""); });
    });
    return out;
  }
  function fromChatGPT(c) {
    var map = c.mapping || {}, ids = [], cur = c.current_node, guard = 0;
    if (cur && map[cur]) { while (cur && map[cur] && guard++ < 20000) { ids.push(cur); cur = map[cur].parent; } ids.reverse(); }
    else ids = Object.keys(map).sort(function (a, b) { var x = (map[a].message || {}).create_time || 0, y = (map[b].message || {}).create_time || 0; return x - y; });
    var msgs = [], tot = 0;
    ids.forEach(function (id) {
      var m = map[id] && map[id].message; if (!m || !m.author) return;
      var role = m.author.role; if (role !== "user" && role !== "assistant") return;
      if (m.metadata && m.metadata.is_visually_hidden_from_conversation) return;
      var ct = m.content || {}, at = (m.create_time || 0) * 1000, text = "";
      if (m.recipient && /^canmore\.(create|update)_textdoc$/.test(m.recipient)) {
        try { var j = JSON.parse((ct.parts || []).filter(function (p) { return typeof p === "string"; }).join("")); text = "[Canvas document" + (j.name ? ": " + j.name : "") + "]\n" + String(j.content || (j.updates && j.updates[0] && j.updates[0].replacement) || ""); } catch (e) { return; }
      } else if (Array.isArray(ct.parts)) text = ct.parts.filter(function (p) { return typeof p === "string"; }).join("\n");
      else if (typeof ct.text === "string" && role === "user") text = ct.text;
      tot = pushMsg(msgs, role === "user" ? "me" : "ai", text, at, tot);
    });
    var id = c.conversation_id || c.id || "";
    var files = gptFiles(c, id);
    return { files: files, key: "chatgpt:" + (id || c.title), src: "chatgpt", id: id, title: String(c.title || "Untitled").slice(0, 160), at: ((c.update_time || c.create_time || 0) * 1000), url: id ? "https://chatgpt.com/c/" + id : "https://chatgpt.com/", n: msgs.length, msgs: msgs };
  }
  function fromClaude(c) {
    var msgs = [], tot = 0;
    (c.chat_messages || []).forEach(function (m) {
      var at = Date.parse(m.created_at || "") || 0, role = m.sender === "human" ? "me" : "ai";
      var text = m.text || (m.content || []).map(function (x) { return x && x.type === "text" ? x.text || "" : ""; }).join("\n");
      tot = pushMsg(msgs, role, text, at, tot);
      (m.content || []).forEach(function (x) { if (x && x.type === "tool_use" && x.name === "artifacts" && x.input && x.input.content) tot = pushMsg(msgs, "ai", "[Artifact: " + (x.input.title || "untitled") + "]\n" + x.input.content, at, tot); });
    });
    var id = c.uuid || "";
    return { files: claudeFiles(c, id), key: "claude:" + (id || c.name), src: "claude", id: id, title: String(c.name || "Untitled").slice(0, 160), at: Date.parse(c.updated_at || c.created_at || "") || 0, url: id ? "https://claude.ai/chat/" + id : "https://claude.ai/", n: msgs.length, msgs: msgs };
  }
  function looksLike(arr) { var f = arr && arr[0]; if (!f) return ""; return f.mapping ? "chatgpt" : (f.chat_messages || f.uuid) ? "claude" : ""; }

  async function readFiles(files, hint, say) {
    var texts = [], memoryTexts = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (/\.zip$/i.test(f.name) || (f.type || "").indexOf("zip") >= 0) {
        if (!window.JSZip) await new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "../../jszip.min.js"; s.onload = ok; s.onerror = function () { no(new Error("Couldn't open the .zip here. Unzip it and choose the conversations json files instead.")); }; document.head.append(s); });
        say("Opening " + f.name + "...");
        var z = await JSZip.loadAsync(f);
        var names = Object.keys(z.files).filter(function (n) { return !z.files[n].dir; });
        var conv = names.filter(function (n) { return /(^|\/)conversations(-\d+)?\.json$/i.test(n); });
        if (!conv.length) throw new Error(f.name + " has no conversations file inside. Use the export from Settings.");
        for (var k = 0; k < conv.length; k++) { say("Reading " + conv[k] + "..."); texts.push(await z.files[conv[k]].async("string")); }
        names.filter(function (n) { return /(^|\/)memor(y|ies)[^\/]*\.json$/i.test(n); }).forEach(function (n) { memoryTexts.push(z.files[n]); });
        for (var m = 0; m < memoryTexts.length; m++) if (typeof memoryTexts[m] !== "string") memoryTexts[m] = await memoryTexts[m].async("string");
      } else { say("Reading " + f.name + "..."); texts.push(await f.text()); }
    }
    return { texts: texts, memory: memoryTexts };
  }
  async function importFiles(files, hint, say) {
    var got = await readFiles(files, hint, say), total = 0, srcs = {}, nfiles = 0, gone = {};
    (await getAll("trash")).forEach(function (t) { if (t.perm || t.rec) gone[t.key] = !!t.perm; });
    Object.keys(gone).forEach(function (k) { if (!gone[k]) delete gone[k]; });
    for (var i = 0; i < got.texts.length; i++) {
      var arr; try { arr = JSON.parse(got.texts[i]); } catch (e) { throw new Error("One of the files is not a conversations export (it could not be read)."); }
      got.texts[i] = null;
      if (!Array.isArray(arr)) throw new Error("That file is not a list of conversations.");
      var src = looksLike(arr) || hint;
      var conv = src === "chatgpt" ? fromChatGPT : fromClaude, batch = [];
      var fb = [];
      for (var j = 0; j < arr.length; j++) {
        var c = conv(arr[j]); var fl = c.files || []; delete c.files;
        if (c.n) batch.push(c);
        fl.forEach(function (f) { if (gone[f.key]) return; fb.push(f); nfiles++; });
        if (batch.length >= 40 || fb.length >= 200 || j === arr.length - 1) {
          if (batch.length) await putMany("convs", batch); if (fb.length) await putMany("files", fb);
          total += batch.length; srcs[src] = (srcs[src] || 0) + batch.length; batch = []; fb = [];
          say("Saved " + plural(total, "conversation") + " and " + plural(nfiles, "file") + "..."); await new Promise(function (r) { setTimeout(r, 0); });
        }
      }
      arr = null;
    }
    var mem = 0;
    for (var q = 0; q < got.memory.length; q++) {
      try { var t = flatten(JSON.parse(got.memory[q])).trim(); if (t) { await putMany("memory", [{ id: "file:" + Date.now() + ":" + q, src: hint || "export", title: "Memory file from the export", text: t.slice(0, 60000), at: Date.now() }]); mem++; } } catch (e) {}
    }
    return { total: total, srcs: srcs, memory: mem, files: nfiles };
  }
  function flatten(x) { if (x == null) return ""; if (typeof x === "string") return x; if (Array.isArray(x)) return x.map(flatten).filter(Boolean).join("\n"); if (typeof x === "object") return Object.keys(x).map(function (k) { var v = flatten(x[k]); return v ? (/^(id|uuid|created_at|updated_at)$/.test(k) ? "" : v) : ""; }).filter(Boolean).join("\n"); return String(x); }

  /* ---------- searching ---------- */
  var STOP = /^(the|a|an|and|or|of|to|in|on for|is|are|was|were|be|it|this|that|with|about|what|which|who|how|do|does|did|my|me|i|you|your|we|our|have|has|had|can|could|should|would|from|at|by|as|if|so|any|all|tell|give|know|knows|remember|say|said)$/i;
  function terms(q) { var t = String(q || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'.-]*/gu) || []; var keep = t.filter(function (w) { return w.length > 1 && !STOP.test(w); }); return keep.length ? keep : t; }
  function scoreOf(c, ts) {
    var title = c.title.toLowerCase(), body = "", s = 0, first = -1, hits = 0;
    for (var i = 0; i < c.msgs.length; i++) body += c.msgs[i].t + "\n";
    body = body.toLowerCase();
    ts.forEach(function (w) {
      var n = 0, p = -1, from = 0; while ((p = body.indexOf(w, from)) >= 0 && n < 30) { if (first < 0 || p < first) first = p; n++; from = p + w.length; }
      if (title.indexOf(w) >= 0) s += 8;
      if (n) { hits++; s += 2 + Math.min(n, 12); }
    });
    return { score: hits === ts.length ? s * 2 : hits ? s : 0, first: first, body: body };
  }
  function windowAt(c, body, pos, len) {
    var raw = ""; for (var i = 0; i < c.msgs.length; i++) raw += c.msgs[i].t + "\n";
    var a = Math.max(0, pos - len / 3), b = Math.min(raw.length, pos + len);
    return (a > 0 ? "…" : "") + raw.slice(a, b).replace(/\s+/g, " ") + (b < raw.length ? "…" : "");
  }
  async function search(q, limit) {
    var ts = terms(q), out = []; if (!ts.length) return [];
    await walk(function (c) {
      var r = scoreOf(c, ts); if (!r.score) return;
      out.push({ c: c, score: r.score, snip: windowAt(c, r.body, Math.max(0, r.first), 320), terms: ts });
      if (out.length > 400) { out.sort(function (a, b) { return b.score - a.score; }); out.length = 100; }
    });
    return out.sort(function (a, b) { return b.score - a.score || (b.c.at - a.c.at); }).slice(0, limit || 30);
  }
  function highlight(text, ts) {
    var f = document.createDocumentFragment(), low = text.toLowerCase(), i = 0;
    var re = ts.length ? new RegExp("(" + ts.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi") : null;
    if (!re) { f.append(text); return f; }
    text.split(re).forEach(function (part, n) { if (n % 2) { var m = el("mark", "", part); f.append(m); } else f.append(part); });
    return f;
  }

  /* ---------- the pages: read a chat, ask it ---------- */
  function openChat(c, ts) {
    var h = infoOpen((c.src === "chatgpt" ? "ChatGPT: " : "Claude: ") + c.title);
    h.append(el("p", "status", fmtDate(c.at) + " · " + plural(c.n, "message")));
    var acts = el("div", "acts");
    acts.append(B("Ask AI about this chat", function () { infoClose(); var txt = c.msgs.map(function (m) { return (m.r === "me" ? "Me: " : "AI: ") + m.t; }).join("\n\n"); openFileAI(c.title, async function () { return { text: txt.slice(0, 60000) }; }); }, "solid"));
    acts.append(B("Copy the text", function (b) { var txt = c.msgs.map(function (m) { return (m.r === "me" ? "Me: " : "AI: ") + m.t; }).join("\n\n"); navigator.clipboard.writeText(txt).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text to copy"; }); }));
    var o = el("a", "btn small ghost", "Open the original ↗"); o.href = c.url; o.target = "_blank"; o.rel = "noopener"; acts.append(o);
    h.append(acts);
    var box = el("div"); box.style.cssText = "display:flex;flex-direction:column;gap:8px;max-height:58vh;overflow:auto";
    c.msgs.forEach(function (m) {
      var d = el("div"); d.style.cssText = "padding:8px 10px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;max-width:92%;" + (m.r === "me" ? "align-self:flex-end;background:var(--sky);" : "align-self:flex-start;border:1px solid var(--line);");
      d.append(highlight(m.t.length > 6000 ? m.t.slice(0, 6000) + "…" : m.t, ts || []));
      box.append(d);
    });
    h.append(box);
  }

  async function askMemory(q, out) {
    out.replaceChildren(); var st = el("p", "status", "Looking through your library..."); out.append(st);
    var s = await loadStats(); var hits = await search(q, 6);
    var mem = (s.memory || []).map(function (m) { return "[" + (m.title || "Memory") + " · " + (m.src || "") + "]\n" + m.text; }).join("\n\n").slice(0, 9000);
    var passages = [], budget = 11000;
    hits.forEach(function (h) {
      var raw = ""; h.c.msgs.forEach(function (m) { raw += (m.r === "me" ? "Me: " : "AI: ") + m.t + "\n"; });
      var low = raw.toLowerCase(), picks = [], seen = 0;
      terms(q).forEach(function (w) { var p = low.indexOf(w); if (p >= 0 && picks.every(function (x) { return Math.abs(x - p) > 900; })) picks.push(p); });
      if (!picks.length) picks.push(0);
      var txt = picks.slice(0, 3).map(function (p) { return raw.slice(Math.max(0, p - 500), p + 1100).replace(/\n{3,}/g, "\n\n"); }).join("\n…\n");
      if (txt.length > budget) txt = txt.slice(0, Math.max(0, budget)); budget -= txt.length;
      if (txt) passages.push({ h: h, text: txt });
    });
    st.remove();
    if (!sample) {
      out.append(el("p", "status", "No AI is connected, so here are the best matching passages. Connect Claude or ChatGPT under Settings to get a written answer."));
    }
    var srcList = function () {
      var d = el("div"); d.append(el("p", "status", "From these chats:"));
      passages.forEach(function (p) { var r = el("div", "acts"); r.append(B(short(p.h.c.title, 60) + " · " + fmtDate(p.h.c.at), function () { openChat(p.h.c, terms(q)); }, "ghost")); d.append(r); });
      if (!passages.length) d.append(el("p", "status", "Nothing in your chats matched. Try different words, or add your memory profile below."));
      return d;
    };
    if (!sample) { passages.forEach(function (p) { var b = el("div", "out"); b.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:8px;margin:6px 0"; b.append(el("b", "", p.h.c.title + " (" + fmtDate(p.h.c.at) + ")"), el("div", "", short(p.text, 700))); out.append(b); }); out.append(srcList()); return; }
    if (!passages.length && !mem) { out.append(el("p", "status", "I found nothing about that in your chats or memory profile. Try other words, or paste your memory profile below.")); return; }
    var wait = el("p", "status", "Writing the answer from " + plural(passages.length, "chat") + (mem ? " and your memory profile" : "") + "..."); out.append(wait);
    var prompt = "You are answering a question for " + (typeof myName === "string" && myName ? myName : "the user") + " from their OWN past ChatGPT and Claude conversations and from the memory notes those assistants keep about them. Answer only from the material below. If it does not cover the question, say so plainly and say what is missing. Do not invent facts. Name the chat titles you used. Plain text, short, no markdown tables, no em dashes.\n\n" +
      (mem ? "MEMORY NOTES ABOUT THE USER:\n" + mem + "\n\n" : "") + "EXCERPTS FROM THEIR CHATS:\n" + passages.map(function (p, i) { return "--- Chat " + (i + 1) + ": " + p.h.c.title + " (" + fmtDate(p.h.c.at) + ", " + (p.h.c.src === "chatgpt" ? "ChatGPT" : "Claude") + ")\n" + p.text; }).join("\n\n") + "\n\nQUESTION: " + q;
    try {
      var r = await creditFallback(function (prov) { return sample(prompt, { cache: false, provider: prov }); });
      wait.remove(); var a = el("div", "out"); a.textContent = String(r.text || "").trim() || "The AI sent back nothing."; out.append(a, srcList());
    } catch (e) { wait.className = "status err"; wait.textContent = "Couldn't write the answer (" + short((e && e.message) || "unknown reason", 100) + "). The passages it would have used are listed below."; out.append(srcList()); }
  }


  /* ---------- Lovable: a dated list of your projects (snapshot file, see EXECUTION-PAGE.md) ---------- */
  var LOV = null;
  function loadLovable() {
    if (LOV) return Promise.resolve(LOV);
    return fetch("lovable-projects.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { LOV = j && Array.isArray(j.projects) ? j : { projects: [], syncedAt: "" }; return LOV; })
      .catch(function () { LOV = { projects: [], syncedAt: "" }; return LOV; });
  }
  var SRC_NAME = { chatgpt: "ChatGPT", claude: "Claude", lovable: "Lovable" };
  function openFile(f) {
    var h = infoOpen(f.title);
    h.append(el("p", "status", SRC_NAME[f.src] + " · " + f.kind + " · " + fmtDate(f.at) + (f.chat ? " · " + (f.src === "lovable" ? f.chat : "in \"" + short(f.chat, 60) + "\"") : "")));
    var acts = el("div", "acts");
    if (f.text) {
      acts.append(B("Copy the text", function (b) { navigator.clipboard.writeText(f.text).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text to copy"; }); }), B("Ask AI about it", function () { infoClose(); openFileAI(f.title, async function () { return { text: f.text.slice(0, 60000) }; }); }, "solid"));
    }
    var o = el("a", "btn small" + (f.text ? " ghost" : " solid"), f.src === "lovable" ? "Open in Lovable ↗" : "Open the original chat ↗"); o.href = f.url; o.target = "_blank"; o.rel = "noopener"; acts.append(o);
    if (f.preview) { var pv = el("a", "btn small ghost", "Open the app preview ↗"); pv.href = f.preview; pv.target = "_blank"; pv.rel = "noopener"; acts.append(pv); }
    h.append(acts);
    if (f.text) { var d = el("div", "out"); d.style.maxHeight = "55vh"; d.style.overflow = "auto"; d.textContent = f.text; h.append(d); }
    else h.append(el("p", "status", f.src === "lovable" ? "" : "The export lists this file's name and date. The file itself is in your export .zip, or in the original chat."));
  }
  /* Document manager: select, move to Trash (with a confirmation), restore, delete forever (with a stronger confirmation).
     This only removes files from your Library on this device. Nothing is deleted in ChatGPT, Claude, Lovable or Drive.
     Files deleted forever stay deleted even if you import the same export again. */
  function confirmBox(title, lines, okLabel, danger, needTick) {
    return new Promise(function (resolve) {
      var h = infoOpen(title), done = false;
      var fin = function (v) { if (done) return; done = true; infoClose(); resolve(v); };
      lines.forEach(function (l) { h.append(typeof l === "string" ? el("p", "", l) : l); });
      var tick = null, go = B(okLabel, function () { fin(true); }, danger ? "solid" : "solid");
      if (danger) { go.style.background = "var(--d-reply)"; go.style.borderColor = "var(--d-reply)"; go.style.color = "#fff"; }
      if (needTick) {
        var lab = el("label", "status"); lab.style.cssText = "display:flex;gap:8px;align-items:flex-start"; tick = document.createElement("input"); tick.type = "checkbox"; tick.style.marginTop = "3px";
        lab.append(tick, el("span", "", needTick)); h.append(lab); go.disabled = true; tick.onchange = function () { go.disabled = !tick.checked; };
      }
      var acts = el("div", "acts"); acts.append(go, B("Cancel", function () { fin(false); }, "ghost")); h.append(acts);
      var obs = setInterval(function () { var box = $("info"); if (box && box.hidden) { clearInterval(obs); fin(false); } }, 300);
    });
  }
  var nameList = function (rows) { var ul = el("ul"); ul.style.cssText = "margin:4px 0;padding-left:18px;font-size:14px"; rows.slice(0, 6).forEach(function (r) { ul.append(el("li", "", short(r.title, 70) + " (" + SRC_NAME[r.src] + ")")); }); if (rows.length > 6) ul.append(el("li", "", "and " + (rows.length - 6) + " more")); return ul; };

  async function filesSection(pad) {
    pad.append(el("h2", "", "All my files, by date"));
    var stored = await getAll("files"), lov = await loadLovable(), tr = await getAll("trash");
    var inTrash = {}, trashRows = [];
    tr.forEach(function (t) { inTrash[t.key] = 1; if (!t.perm && t.rec) trashRows.push(Object.assign({ trashedAt: t.trashedAt }, t.rec)); });
    var all = stored.filter(function (f) { return !inTrash[f.key]; });
    lov.projects.forEach(function (p) { var k = "lovable:" + p.id; if (!inTrash[k]) all.push({ key: k, src: "lovable", kind: "App project", title: p.name, at: Date.parse(p.edited) || 0, chat: p.workspace, url: p.editor, preview: p.preview, text: p.description || "", published: p.published }); });
    var head = el("p", "sub"), note = el("p", "status");
    pad.append(head, note);
    var F = { src: "", kind: "", range: "all", from: "", to: "", q: "", shown: 120, trash: false }, SEL = {};
    var count = function (rows) { var n = { chatgpt: 0, claude: 0, lovable: 0 }; rows.forEach(function (f) { n[f.src] = (n[f.src] || 0) + 1; }); return n; };
    var bar = el("div", "chips"), kinds = el("select", "in"), rng = el("div", "chips"), q = el("input", "in"), custom = el("div", "ask"), tools = el("div", "acts"), list = el("div"); list.id = "libFiles";
    q.placeholder = "Search file names and text"; q.setAttribute("aria-label", "Search my files");
    var fromI = el("input", "in"), toI = el("input", "in");
    var rowsNow = function () { return F.trash ? trashRows : all; };
    var filtered = function () {
      var now = Date.now(), from = 0, to = Infinity, day = 86400000;
      if (F.range === "custom") { from = F.from ? Date.parse(F.from + "T00:00:00") : 0; to = F.to ? Date.parse(F.to + "T00:00:00") + day : Infinity; }
      else if (F.range !== "all") from = now - (+F.range) * day;
      var ts = F.q ? terms(F.q) : [];
      return rowsNow().filter(function (f) {
        if (F.src && f.src !== F.src) return false; if (F.kind && f.kind !== F.kind) return false; if (f.at < from || f.at >= to) return false;
        if (F.q) { var hay = (f.title + " " + (f.chat || "") + " " + (f.text || "")).toLowerCase(); return ts.every(function (w) { return hay.indexOf(w) >= 0; }); }
        return true;
      }).sort(function (a, b) { return F.trash ? (b.trashedAt || 0) - (a.trashedAt || 0) : b.at - a.at; });
    };
    var selected = function () { return rowsNow().filter(function (f) { return SEL[f.key]; }); };
    var chip = function (host, label, on, fn) { var c = el("button", "chip", label); c.type = "button"; c.setAttribute("aria-pressed", String(on)); c.onclick = function () { fn(); [].forEach.call(host.children, function (x) { x.setAttribute("aria-pressed", String(x === c)); }); F.shown = 120; draw(); }; host.append(c); };
    function drawBar() {
      bar.replaceChildren(); var n = count(rowsNow());
      chip(bar, "All sources (" + rowsNow().length + ")", !F.src, function () { F.src = ""; });
      ["chatgpt", "claude", "lovable"].forEach(function (k) { if (n[k]) chip(bar, SRC_NAME[k] + " (" + n[k] + ")", F.src === k, function () { F.src = k; }); });
      var ks = {}; rowsNow().forEach(function (f) { ks[f.kind] = 1; });
      kinds.replaceChildren(new Option("All types", "")); Object.keys(ks).sort().forEach(function (k) { kinds.append(new Option(k, k)); }); kinds.value = F.kind && ks[F.kind] ? F.kind : ""; if (!ks[F.kind]) F.kind = "";
    }
    kinds.style.flex = "0 1 190px"; kinds.setAttribute("aria-label", "Type of file"); kinds.onchange = function () { F.kind = kinds.value; F.shown = 120; draw(); };
    [["all", "Any date"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 3 months"], ["365", "Last year"]].forEach(function (r, i) { chip(rng, r[1], i === 0, function () { F.range = r[0]; F.from = F.to = ""; fromI.value = toI.value = ""; }); });
    fromI.type = toI.type = "date"; fromI.style.flex = toI.style.flex = "0 1 160px"; fromI.setAttribute("aria-label", "From date"); toI.setAttribute("aria-label", "To date");
    var onDate = function () { F.from = fromI.value; F.to = toI.value; F.range = "custom"; [].forEach.call(rng.children, function (x) { x.setAttribute("aria-pressed", "false"); }); F.shown = 120; draw(); };
    fromI.onchange = toI.onchange = onDate;
    custom.append(el("span", "status", "From"), fromI, el("span", "status", "to"), toI);
    var timer = 0; q.oninput = function () { clearTimeout(timer); timer = setTimeout(function () { F.q = q.value.trim().toLowerCase(); F.shown = 120; draw(); }, 200); };
    var top = el("div", "ask"); top.append(q, kinds);
    pad.append(top, bar, rng, custom, tools, list);

    /* actions */
    async function toTrash(rows) {
      var ok = await confirmBox("Move " + rows.length + " file" + (rows.length > 1 ? "s" : "") + " to Trash?", [nameList(rows), "They leave your Library list but you can restore them from Trash. Nothing is deleted in ChatGPT, Claude or Lovable."], "Move to Trash", false);
      if (!ok) return;
      var now = Date.now();
      await putMany("trash", rows.map(function (r) { return { key: r.key, rec: r, trashedAt: now, perm: 0 }; }));
      await delMany("files", rows.filter(function (r) { return r.src !== "lovable"; }).map(function (r) { return r.key; }));
      var gone = {}; rows.forEach(function (r) { gone[r.key] = 1; delete SEL[r.key]; r.trashedAt = now; });
      all = all.filter(function (f) { return !gone[f.key]; }); trashRows = rows.concat(trashRows);
      note.textContent = rows.length + " file" + (rows.length > 1 ? "s" : "") + " moved to Trash. Open Trash to restore them."; draw();
    }
    async function restore(rows) {
      await putMany("files", rows.filter(function (r) { return r.src !== "lovable"; }).map(function (r) { var c = Object.assign({}, r); delete c.trashedAt; return c; }));
      await delMany("trash", rows.map(function (r) { return r.key; }));
      var back = {}; rows.forEach(function (r) { back[r.key] = 1; delete SEL[r.key]; var c = Object.assign({}, r); delete c.trashedAt; all.push(c); });
      trashRows = trashRows.filter(function (f) { return !back[f.key]; });
      note.textContent = rows.length + " file" + (rows.length > 1 ? "s" : "") + " restored."; draw();
    }
    async function forever(rows) {
      var ok = await confirmBox("Delete " + rows.length + " file" + (rows.length > 1 ? "s" : "") + " forever?", [nameList(rows), "This cannot be undone. They will not come back, even if you import the same export again. Your ChatGPT, Claude and Lovable accounts are not touched."], "Delete forever", true, "I understand these files cannot be recovered.");
      if (!ok) return;
      await putMany("trash", rows.map(function (r) { return { key: r.key, perm: 1, trashedAt: Date.now() }; }));
      var gone = {}; rows.forEach(function (r) { gone[r.key] = 1; delete SEL[r.key]; });
      trashRows = trashRows.filter(function (f) { return !gone[f.key]; });
      note.textContent = rows.length + " file" + (rows.length > 1 ? "s" : "") + " deleted forever."; draw();
    }

    function drawTools() {
      tools.replaceChildren(); var sel = selected(), shown = filtered();
      var all_ = B("Select all " + shown.length + (shown.length === 1 ? " file" : " files") + " shown", function () { shown.forEach(function (f) { SEL[f.key] = 1; }); draw(); }, "ghost"); all_.disabled = !shown.length;
      var none = B("Clear selection", function () { SEL = {}; draw(); }, "ghost"); none.disabled = !sel.length;
      tools.append(all_, none);
      if (!F.trash) {
        var del = B("Delete selected (" + sel.length + ")", function () { toTrash(sel); }, "solid"); del.disabled = !sel.length; tools.append(del);
      } else {
        var rs = B("Restore selected (" + sel.length + ")", function () { restore(sel); }, "solid"); rs.disabled = !sel.length;
        var fv = B("Delete selected forever (" + sel.length + ")", function () { forever(sel); }, "ghost"); fv.disabled = !sel.length;
        var em = B("Empty Trash", function () { forever(trashRows.slice()); }, "ghost"); em.disabled = !trashRows.length;
        tools.append(rs, fv, em);
      }
      var tg = B(F.trash ? "← Back to my files" : "Trash (" + trashRows.length + ")", function () { F.trash = !F.trash; F.src = F.kind = ""; SEL = {}; F.shown = 120; draw(); }, "ghost"); tools.append(tg);
    }
    function draw() {
      head.textContent = F.trash ? (trashRows.length ? plural(trashRows.length, "file") + " in Trash. Restore them, or delete them forever. Files stay here until you delete them." : "Trash is empty.") :
        (all.length ? plural(all.length, "file") + ": " + count(all).chatgpt.toLocaleString("en-GB") + " from ChatGPT, " + count(all).claude.toLocaleString("en-GB") + " from Claude, " + count(all).lovable.toLocaleString("en-GB") + " Lovable projects. Newest first." : "No files yet. Import your ChatGPT and Claude exports above and every canvas document, artifact and file in them is listed here by date.");
      if (!F.trash && !note.dataset.intro) { note.dataset.intro = "1"; if (!note.textContent) note.textContent = "ChatGPT and Claude: canvas documents, artifacts, files you shared and files they made, from your imported exports. Lovable: your " + plural(lov.projects.length, "project") + (lov.syncedAt ? ", as of " + fmtDate(Date.parse(lov.syncedAt)) : "") + ", newest edit first. The Lovable list is a saved copy of your account. To refresh it, ask Claude to \"refresh my Lovable list\". Deleting here only removes files from this Library."; }
      drawBar(); drawTools();
      var rows = filtered(); list.replaceChildren();
      list.append(el("p", "status", rows.length ? plural(rows.length, "file") + (F.q || F.src || F.kind || F.range !== "all" ? " match." : ".") : (F.trash ? "" : "No files match. Widen the dates or clear the search.")));
      var last = "";
      rows.slice(0, F.shown).forEach(function (f) {
        var when = F.trash ? f.trashedAt : f.at;
        var dl = when ? new Date(when).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "No date";
        if (dl !== last) { last = dl; var hd = el("h3", "", (F.trash ? "Deleted " : "") + dl); hd.style.cssText = "margin:10px 0 2px;font-size:14px;color:var(--navy)"; list.append(hd); }
        var r = el("div", "item"); r.style.gridTemplateColumns = "26px minmax(0,1fr)"; var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!SEL[f.key]; cb.setAttribute("aria-label", "Select " + f.title); cb.style.cssText = "width:20px;height:20px;margin-top:3px";
        cb.onchange = function () { if (cb.checked) SEL[f.key] = 1; else delete SEL[f.key]; drawTools(); }; r.append(cb);
        var m = el("div", "main"); m.append(el("span", "t", f.title));
        m.append(el("span", "m", SRC_NAME[f.src] + " · " + f.kind + " · " + fmtDate(f.at) + (f.src === "lovable" ? " · " + f.chat + (f.published ? " · Published" : " · Not published") : f.chat ? " · in \"" + short(f.chat, 50) + "\"" : "")));
        var a = el("div", "acts"); a.append(B(f.text ? "Read" : "Details", function () { openFile(f); }, "solid"));
        var o = el("a", "btn small", f.src === "lovable" ? "Open in Lovable ↗" : "Open chat ↗"); o.href = f.url; o.target = "_blank"; o.rel = "noopener"; a.append(o);
        a.append(F.trash ? B("Restore", function () { restore([f]); }, "ghost") : B("Delete", function () { toTrash([f]); }, "ghost"));
        m.append(a); r.append(m); list.append(r);
      });
      if (rows.length > F.shown) list.append(B("Show more (" + (rows.length - F.shown) + " left)", function () { F.shown += 200; draw(); }, "ghost"));
    }
    draw();
  }

  /* ---------- the card ---------- */
  var card = null, busy = false;
  var MEMORY_ASK = "Please write out everything you remember about me, as plain text, grouped by topic: my work and business, the people I work with, my projects and goals, my preferences and how I like answers written, decisions I have made, and anything else you have saved. Quote your saved memory as exactly as you can. Do not summarise or leave anything out.";
  function build() {
    card = $("libCard");
    if (!card) {
      card = el("div", "card note"); card.id = "libCard";
      var host = document.querySelector('[data-sec="research"]') || $("secs");
      if (!host) return false;
      host.append(card);
    }
    return true;
  }
  async function render() {
    if (!build()) return;
    var scrollY = window.scrollY;
    var keepQ = $("libQ") ? $("libQ").value : "", keepAsk = $("libAskQ") ? $("libAskQ").value : "";
    card.replaceChildren(); var pad = el("div", "pad"); card.append(pad);
    pad.append(el("h2", "", "Library: all your ChatGPT and Claude chats"));
    var s; try { s = await loadStats(); } catch (e) { pad.append(el("p", "status err", "This browser would not open its storage, so the library can't be used here (" + short(e && e.message, 80) + ").")); return; }
    pad.append(el("p", "sub", s.total ? plural(s.total, "conversation") + " (" + (s.by.chatgpt || 0).toLocaleString("en-GB") + " ChatGPT, " + (s.by.claude || 0).toLocaleString("en-GB") + " Claude), " + plural(s.msgs, "message") + ", from " + fmtDate(s.oldest) + " to " + fmtDate(s.newest) + ". Kept on this device only." : "Import your full ChatGPT and Claude history once. Then search it, read any chat, and ask questions of it whenever you need. It is kept on this device only and nothing is sent anywhere until you ask a question."));
    var status = el("p", "status"); status.setAttribute("role", "status");
    /* import */
    var imp = el("div", "acts");
    var pick = function (hint) { var i = document.createElement("input"); i.type = "file"; i.multiple = true; i.accept = ".zip,.json,application/zip,application/json"; i.onchange = function () { if (i.files && i.files.length) run([].slice.call(i.files), hint); }; i.click(); };
    imp.append(B("Import ChatGPT export", function () { pick("chatgpt"); }, s.by.chatgpt ? "" : "solid"), B("Import Claude export", function () { pick("claude"); }, s.by.claude ? "" : "solid"));
    var how = el("details"); how.append(el("summary", "status", "How to get the files"));
    how.append(el("p", "status", "ChatGPT: Settings, Data controls, Export data, Confirm. OpenAI emails a download link, usually within minutes. Claude: Settings, Privacy, Export data. You can pick the .zip as it is, or several json files at once. Repeat when you want the library refreshed. Importing again never makes duplicates."));
    var l1 = el("a", "btn small ghost", "ChatGPT export page ↗"); l1.href = "https://chatgpt.com/#settings/DataControls"; l1.target = "_blank"; l1.rel = "noopener";
    var l2 = el("a", "btn small ghost", "Claude export page ↗"); l2.href = "https://claude.ai/settings/data-privacy-controls"; l2.target = "_blank"; l2.rel = "noopener";
    var hr = el("div", "acts"); hr.append(l1, l2); how.append(hr); pad.append(imp, how, status);
    async function run(files, hint) {
      if (busy) return; busy = true;
      try { var r = await importFiles(files, hint, function (t) { status.className = "status"; status.textContent = t; }); status.textContent = "Done. " + plural(r.total, "conversation") + " and " + plural(r.files || 0, "file") + " added" + (r.memory ? " and " + plural(r.memory, "memory file") : "") + "."; busy = false; await render(); var st2 = $("libStatus"); if (st2) st2.textContent = "Done. " + plural(r.total, "conversation") + " and " + plural(r.files || 0, "file") + " added."; }
      catch (e) { busy = false; status.className = "status err"; status.textContent = (e && e.message) || "Couldn't read that file."; }
    }
    status.id = "libStatus";

    /* memory profile */
    var memBox = el("details"); memBox.open = !s.memory.length && s.total > 0;
    memBox.append(el("summary", "", "Memory profile (what ChatGPT and Claude have saved about you): " + (s.memory.length ? "added" : "not added yet")));
    var mp = el("div", "pad"); mp.style.padding = "8px 0";
    mp.append(el("p", "status", "ChatGPT's saved memories are not included in its export, so copy them in once. Fastest: send ChatGPT the request below, then paste its answer here. Or open Settings, Personalization, Manage memories, and copy the list. Do the same in Claude if you use its memory."));
    var ra = el("div", "acts");
    ra.append(B("Copy the request", function (b) { navigator.clipboard.writeText(MEMORY_ASK).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text to copy"; }); }));
    var o1 = el("a", "btn small", "Ask ChatGPT ↗"); o1.href = "https://chatgpt.com/?q=" + encodeURIComponent(MEMORY_ASK); o1.target = "_blank"; o1.rel = "noopener";
    var o2 = el("a", "btn small", "Ask Claude ↗"); o2.href = "https://claude.ai/new?q=" + encodeURIComponent(MEMORY_ASK); o2.target = "_blank"; o2.rel = "noopener";
    ra.append(o1, o2); mp.append(ra);
    var mt = el("textarea", "in"); mt.rows = 6; mt.placeholder = "Paste what ChatGPT or Claude remembers about you"; mt.setAttribute("aria-label", "Memory profile"); mt.style.minHeight = "120px";
    var ms = el("select", "in"); [["chatgpt", "From ChatGPT"], ["claude", "From Claude"], ["other", "Other"]].forEach(function (o) { ms.append(new Option(o[1], o[0])); }); ms.style.flex = "0 1 160px";
    var msave = B("Save to my library", async function (b) {
      var t = mt.value.trim(); if (!t) { mt.focus(); return; }
      await putMany("memory", [{ id: "paste:" + Date.now(), src: ms.value, title: "Pasted " + (ms.value === "chatgpt" ? "ChatGPT" : ms.value === "claude" ? "Claude" : "") + " memory", text: t.slice(0, 60000), at: Date.now() }]); mt.value = ""; render();
    }, "solid");
    var mr = el("div", "ask"); mr.append(ms, msave); mp.append(mt, mr);
    (s.memory || []).forEach(function (m) {
      var r = el("div", "acts"); r.append(el("span", "status", m.title + " · " + fmtDate(m.at) + " · " + plural(m.text.length, "character")));
      r.append(B("Show", function () { var h = infoOpen(m.title); var d = el("div", "out"); d.textContent = m.text; h.append(d); }, "ghost"), B("Remove", async function () { await tx("memory", "readwrite", function (st) { st.delete(m.id); }); render(); }, "ghost")); mp.append(r);
    });
    memBox.append(mp); pad.append(memBox);

    try { await filesSection(pad); } catch (e) { pad.append(el("p", "status err", "Couldn't list your files (" + short(e && e.message, 80) + ").")); }
    if (!s.total && !s.memory.length) return;

    /* ask */
    pad.append(el("h2", "", "Ask my memory"));
    pad.append(el("p", "status", "Ask anything, for example: what did I decide about owner payouts? What do I always want in a guest reply? Who is Louloua? The AI answers only from your chats and memory profile, and names the chats it used. Only your question and the matching passages are sent to the AI you chose under Settings."));
    var aq = el("input", "in"); aq.id = "libAskQ"; aq.placeholder = "Ask what you or ChatGPT know about you and your work"; aq.setAttribute("aria-label", "Ask my memory"); aq.value = keepAsk;
    var out = el("div"); out.setAttribute("role", "status");
    var ag = B("Ask", async function (b) { var q = aq.value.trim(); if (!q) { aq.focus(); return; } b.disabled = true; try { await askMemory(q, out); } catch (e) { out.replaceChildren(el("p", "status err", "Something went wrong (" + short(e && e.message, 90) + ").")); } b.disabled = false; }, "solid");
    aq.onkeydown = function (e) { if (e.key === "Enter") ag.click(); };
    var ar = el("div", "ask"); ar.append(aq, ag); pad.append(ar, out);

    /* search and browse */
    pad.append(el("h2", "", "Search and review"));
    var q = el("input", "in"); q.id = "libQ"; q.placeholder = "Search every chat, for example: payout, Marina pricing, contract"; q.setAttribute("aria-label", "Search the library"); q.value = keepQ;
    var res = el("div"); var go = B("Search", function () { doSearch(); }, "solid"); q.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
    var sr = el("div", "ask"); sr.append(q, go);
    var flt = el("div", "chips"), src = "";
    [["", "All"], ["chatgpt", "ChatGPT"], ["claude", "Claude"]].forEach(function (o) { var c = el("button", "chip", o[1]); c.type = "button"; c.setAttribute("aria-pressed", String(o[0] === "")); c.onclick = function () { src = o[0]; [].forEach.call(flt.children, function (x) { x.setAttribute("aria-pressed", String(x === c)); }); doSearch(); }; flt.append(c); });
    pad.append(sr, flt, res);
    async function doSearch() {
      var term = q.value.trim(); res.replaceChildren();
      if (!term) { return browse(); }
      res.append(el("p", "status", "Searching " + plural(s.total, "conversation") + "..."));
      var hits = (await search(term, 40)).filter(function (h) { return !src || h.c.src === src; });
      res.replaceChildren(); res.append(el("p", "status", hits.length ? plural(hits.length, "chat") + " match, best first." : "No chat contains those words. Try fewer or different words."));
      hits.forEach(function (h) { res.append(row(h.c, h.snip, h.terms)); });
    }
    function row(c, snip, ts) {
      var r = el("div", "item"); r.append(el("span", "dot " + (c.src === "chatgpt" ? "fyi" : "work")));
      var m = el("div", "main"); m.append(el("span", "t", c.title), el("span", "m", (c.src === "chatgpt" ? "ChatGPT" : "Claude") + " · " + fmtDate(c.at) + " · " + plural(c.n, "message")));
      if (snip) { var sp = el("span", "s"); sp.append(highlight(snip, ts || [])); m.append(sp); }
      var a = el("div", "acts"); a.append(B("Read", function () { openChat(c, ts); }, "solid"), B("Ask AI about it", function () { var txt = c.msgs.map(function (x) { return (x.r === "me" ? "Me: " : "AI: ") + x.t; }).join("\n\n"); openFileAI(c.title, async function () { return { text: txt.slice(0, 60000) }; }); }));
      m.append(a); r.append(m); return r;
    }
    async function browse() {
      var all = []; await walk(function (c) { if (!src || c.src === src) all.push({ key: c.key, src: c.src, title: c.title, at: c.at, n: c.n }); });
      all.sort(function (a, b) { return b.at - a.at; }); res.replaceChildren();
      res.append(el("p", "status", "Newest " + Math.min(all.length, 40) + " of " + plural(all.length, "chat") + ". Type words above to search all of them."));
      for (var i = 0; i < Math.min(all.length, 40); i++) { (function (x) { var r = el("div", "item"); r.append(el("span", "dot " + (x.src === "chatgpt" ? "fyi" : "work"))); var m = el("div", "main"); m.append(el("span", "t", x.title), el("span", "m", (x.src === "chatgpt" ? "ChatGPT" : "Claude") + " · " + fmtDate(x.at) + " · " + plural(x.n, "message"))); var a = el("div", "acts"); a.append(B("Read", async function () { var c = await tx("convs", "readonly", function (st) { return st.get(x.key); }); if (c) openChat(c, []); }, "solid")); m.append(a); r.append(m); res.append(r); })(all[i]); }
    }
    if (keepQ) doSearch(); else browse();

    /* delete */
    var del = el("div", "acts");
    del.append(B("Delete my library", async function (b) { if (!confirm("Delete every imported chat and memory note from this device? Your ChatGPT and Claude accounts are not touched.")) return; await clearAll(); render(); }, "ghost"));
    pad.append(del);
    window.scrollTo(0, scrollY);
  }

  /* chats imported through the older import buttons also go into the library */
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || (t.id !== "f-chatgpt" && t.id !== "f-claude")) return;
    var files = t.files ? [].slice.call(t.files) : []; if (!files.length) return;
    var hint = t.id === "f-chatgpt" ? "chatgpt" : "claude";
    setTimeout(function () { importFiles(files, hint, function () {}).then(function (r) { if (r.total) { try { toast(plural(r.total, "conversation") + " also added to your Library."); } catch (x) {} render(); } }).catch(function () {}); }, 0);
  }, true);

  /* "Search everything" also looks in the library */
  function hookSearch() {
    var go = $("allGo"), orig = window.searchAll;
    if (!go || typeof orig !== "function" || go.dataset.lib) return; go.dataset.lib = "1";
    var wrapped = async function () {
      await orig.apply(this, arguments);
      var q = ($("allQ").value || "").trim(), host = $("allRes"); if (!q || !host || !host.firstChild) return;
      try {
        var s = await loadStats(); if (!s.total) return;
        var hits = await search(q, 5), sec = el("div", "infosec"); sec.append(el("h3", "", "ChatGPT and Claude chats (" + hits.length + ")"));
        if (!hits.length) sec.append(el("p", "status", "Nothing found."));
        hits.forEach(function (h) { var r = el("div", "item"); r.append(el("span", "dot " + (h.c.src === "chatgpt" ? "fyi" : "work"))); var m = el("div", "main"); m.append(el("span", "t", h.c.title), el("span", "m", (h.c.src === "chatgpt" ? "ChatGPT" : "Claude") + " · " + fmtDate(h.c.at)));
          var sp = el("span", "s"); sp.append(highlight(h.snip, h.terms)); m.append(sp); var a = el("div", "acts"); a.append(B("Read", function () { openChat(h.c, h.terms); }, "small")); m.append(a); r.append(m); sec.append(r); });
        var last = host.lastElementChild; if (last && last.tagName === "BUTTON") host.insertBefore(sec, last); else host.append(sec);
      } catch (e) {}
    };
    window.searchAll = wrapped; go.onclick = wrapped;
  }

  var tries = 0;
  function start() {
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 2000); return; }
    render().catch(function () {}); hookSearch();
  }
  setTimeout(start, 1500);
})();
