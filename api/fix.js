/* Vercel serverless function behind the owner's "Fix the app" box.
   The owner types what should change. Claude reads the code of this site on GitHub, proposes edits, and nothing goes
   live until the owner presses Go live. Every publish gets a new version number and can be undone.
   Environment variables (Vercel, Settings, Environment Variables):
     OWNER_EMAILS        required. Only these Google accounts may use the Fix box.
     ANTHROPIC_API_KEY   required. The same key the shared Claude uses.
     GOOGLE_CLIENT_ID    required. Same as the other functions.
     GITHUB_TOKEN        required. A fine-grained GitHub token for this one repository with
                         "Contents: Read and write" (and "Deployments: Read-only" if you want preview links).
     GITHUB_REPO         optional. owner/name. Defaults to the repository Vercel built this site from.
     FIX_BRANCH          optional. The branch that goes live. Defaults to the branch Vercel built this site from.
     FIX_MODEL           optional. Defaults to claude-sonnet-5-5. Set claude-opus-5-5 for harder changes.
   GET  returns {owner, ready, missing, repo, branch}.
   POST {action:"step"|"publish"|"preview_status"|"undo", ...} */
"use strict";
const vm = require("vm");
const S = require("./_shared");
const g = globalThis;
g.__wyzBlob = g.__wyzBlob || new Map();
g.__wyzTree = g.__wyzTree || new Map();

const MODEL = process.env.FIX_MODEL || "claude-sonnet-5-5";
const PREVIEW_BRANCH = "fixbox-preview";
const EDITABLE = /^(docs|api)\/[A-Za-z0-9_.\-\/]+\.(js|html|css|json|webmanifest|md)$/;
const HIDDEN = /(^|\/)msal-browser\.min\.js$|\.\.|^docs\/previous\//;   /* the saved earlier versions stay frozen */
/* Readable, but never changeable from the Fix box: sign-in checks, who may use the AI, and the Fix box's own guard rails. */
const LOCKED = /^(api\/(_shared|fix|admin|seen)\.js|docs\/(config|version)\.js)$/;
const MAX_READ = 40000, MAX_STEP_MS = 24000, CLAUDE_TIMEOUT = 50000;

const repoName = function () {
  const r = String(process.env.GITHUB_REPO || "").trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(r)) return r;
  if (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG) return process.env.VERCEL_GIT_REPO_OWNER + "/" + process.env.VERCEL_GIT_REPO_SLUG;
  return "habahri-svg/Bahri-Repo";
};
const liveBranch = function () {
  const b = String(process.env.FIX_BRANCH || "").trim();
  if (b) return b;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_GIT_COMMIT_REF) return process.env.VERCEL_GIT_COMMIT_REF;
  return "claude/gracious-mayer-ywmspl";
};
const missing = function () {
  return ["OWNER_EMAILS", "ANTHROPIC_API_KEY", "GOOGLE_CLIENT_ID", "GITHUB_TOKEN"].filter(function (k) { return !String(process.env[k] || "").trim(); });
};

function fail(status, message) { const e = new Error(message); e.status = status; return e; }

/* ---------- GitHub ---------- */
async function gh(path, opts) {
  const o = opts || {};
  const r = await fetch("https://api.github.com/repos/" + repoName() + path, {
    method: o.method || "GET",
    headers: { Authorization: "Bearer " + process.env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "wyz-fix-box", "content-type": "application/json" },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  if (o.raw) return r;
  if (!r.ok) {
    let m = ""; try { m = (await r.json()).message || ""; } catch (e) {}
    const why = r.status === 401 ? "GitHub refused the token. Check GITHUB_TOKEN in Vercel."
      : r.status === 403 ? "The GitHub token isn't allowed to do this. It needs Contents: Read and write on this repository."
      : r.status === 404 ? "GitHub couldn't find " + repoName() + " (or the token can't see it)."
      : "GitHub answered " + r.status + (m ? ": " + m.slice(0, 140) : "") + ".";
    throw fail(502, why);
  }
  return r.json();
}
const refPath = function (b) { return b.split("/").map(encodeURIComponent).join("/"); };
async function headOf(branch) { return (await gh("/git/ref/heads/" + refPath(branch))).object.sha; }

/* A snapshot of the code at one commit: {commit, tree, files:{path:{sha,size}}}. Commits never change, so it is safe to keep. */
async function snapshot(commit) {
  const hit = g.__wyzTree.get(commit);
  if (hit) return hit;
  const c = await gh("/git/commits/" + commit);
  const t = await gh("/git/trees/" + c.tree.sha + "?recursive=1");
  const files = {};
  (t.tree || []).forEach(function (e) { if (e.type === "blob" && EDITABLE.test(e.path) && !HIDDEN.test(e.path)) files[e.path] = { sha: e.sha, size: e.size || 0 }; });
  const snap = { commit: commit, tree: c.tree.sha, parents: (c.parents || []).map(function (p) { return p.sha; }), message: c.message || "", files: files };
  if (g.__wyzTree.size > 20) g.__wyzTree.clear();
  g.__wyzTree.set(commit, snap);
  return snap;
}
async function blob(sha) {
  const hit = g.__wyzBlob.get(sha);
  if (hit !== undefined) return hit;
  const b = await gh("/git/blobs/" + sha);
  const text = Buffer.from(b.content || "", b.encoding === "base64" ? "base64" : "utf8").toString("utf8");
  if (g.__wyzBlob.size > 60) g.__wyzBlob.clear();
  g.__wyzBlob.set(sha, text);
  return text;
}

/* ---------- the working copy: the snapshot plus the edits made so far ---------- */
function cleanPath(p) {
  p = String(p || "").trim().replace(/^\.?\//, "");
  if (!/\//.test(p)) p = "docs/" + p;
  if (!EDITABLE.test(p) || HIDDEN.test(p)) throw new Error("That file can't be opened or changed here: " + p + ". Only text files under docs/ and api/ are available.");
  return p;
}
function syntaxError(path, text) {
  if (!/\.js$/.test(path)) return "";
  try { new vm.Script(text, { filename: path }); return ""; } catch (e) { return String((e && e.message) || e); }
}
function work(snap, edits) {
  const changed = {};   /* path -> new text */
  const W = {
    exists: function (p) { return p in changed || p in snap.files; },
    list: function () {
      const all = new Set(Object.keys(snap.files).concat(Object.keys(changed)));
      return Array.from(all).sort();
    },
    read: async function (p) { if (p in changed) return changed[p]; if (!(p in snap.files)) throw new Error("There is no file called " + p + "."); return blob(snap.files[p].sha); },
    /* Applies one edit. Throws a plain-English reason when it can't. */
    apply: async function (e) {
      const p = cleanPath(e.file), oldS = String(e.old == null ? "" : e.old), newS = String(e.new == null ? "" : e.new);
      if (p === "docs/version.js") throw new Error("Don't change docs/version.js. The version number is raised automatically when the owner publishes.");
      if (LOCKED.test(p)) throw new Error(p + " is locked. It holds the sign-in and safety checks, so it can only be changed by a developer, not from the Fix box. Tell the owner.");
      let next;
      if (!W.exists(p)) {
        if (oldS) throw new Error("There is no file called " + p + ". To create it, call edit with an empty old text.");
        next = newS;
      } else {
        const cur = await W.read(p);
        if (!oldS) throw new Error(p + " already exists. Give the exact old text you want to replace.");
        if (oldS === newS) throw new Error("The old and new text are the same.");
        const first = cur.indexOf(oldS);
        if (first < 0) throw new Error("The old text was not found in " + p + ". It must match the file exactly, including spaces and line breaks. Read that part of the file again and copy it exactly.");
        if (cur.indexOf(oldS, first + 1) >= 0) throw new Error("The old text appears more than once in " + p + ". Include more of the surrounding text so it matches only one place.");
        next = cur.slice(0, first) + newS + cur.slice(first + oldS.length);
      }
      const bad = syntaxError(p, next);
      if (bad) throw new Error("That change would break " + p + " (JavaScript error: " + bad + "). Nothing was changed. Fix the edit and try again.");
      changed[p] = next;
      return p;
    },
    changed: changed
  };
  return W;
}
async function replay(snap, edits) {
  const W = work(snap);
  for (const e of edits) await W.apply(e);
  return W;
}

/* ---------- the tools Claude can use ---------- */
const TOOLS = [
  { name: "list_files", description: "List the files of the app that can be read and changed, with their sizes.", input_schema: { type: "object", properties: {} } },
  { name: "search", description: "Search the app's code for a piece of text (plain text, not a pattern). Returns up to 40 matching places as file:line with a short excerpt around the match. Lines in this code are often very long, so use this to find the right line first.",
    input_schema: { type: "object", properties: { text: { type: "string", description: "The exact text to look for. Case-insensitive." }, file: { type: "string", description: "Optional. Limit the search to one file, for example docs/app.js." } }, required: ["text"] } },
  { name: "read", description: "Read lines of one file, with line numbers. Returns at most about 40,000 characters, then tells you where to continue.",
    input_schema: { type: "object", properties: { file: { type: "string" }, start: { type: "integer", description: "First line, starting at 1." }, end: { type: "integer", description: "Last line, inclusive." } }, required: ["file", "start"] } },
  { name: "edit", description: "Change one place in one file by replacing an exact piece of text. 'old' must appear exactly once in the file, so include enough surrounding text. Keep 'old' as short as possible while still unique. To create a new file, give its path with an empty 'old'. JavaScript files are checked, and an edit that breaks the syntax is refused.",
    input_schema: { type: "object", properties: { file: { type: "string" }, old: { type: "string" }, new: { type: "string" }, why: { type: "string", description: "A few plain words for the owner, for example 'Makes the Invite button gold'." } }, required: ["file", "old", "new", "why"] } }
];

const SYSTEM = [
  "You are the maintenance engineer for the WYZ Rent Execution Page, a personal dashboard web app (Gmail, Google Calendar, Drive, Todoist and AI in one page). The owner, Sam, is not a programmer. He types what he wants changed and you make the change in the code.",
  "",
  "How the app is built:",
  "- Plain HTML, CSS and JavaScript with no build step. The site is the docs/ folder. docs/index.html holds the markup and all CSS. docs/app.js is the main logic (large, with very long lines). docs/connectors.js talks to Google and the AI. docs/microsoft.js is Outlook sign-in. docs/demo.js is the ?demo mode with sample data. docs/fixbox.js is this Fix box. docs/admin.html is the owner's usage page.",
  "- api/ holds the Vercel serverless functions (claude.js, chatgpt.js, admin.js, seen.js, fix.js, and shared helpers in _shared.js).",
  "- Helpers used everywhere in app.js: $(id) gets an element, el(tag, className, text) makes one, infoOpen(title) opens the pop-up panel and returns its body, toast(text), state plus persist() for saved settings.",
  "- Brand colours come from CSS variables: --navy, --gold, --sky, --bg, --panel, --fg, --soft, --line. Use them instead of fixed colours.",
  "",
  "How to work:",
  "1. Find the code first with search, then read the lines around it. Never guess what the code says.",
  "2. Make the smallest change that does the job, in the same style as the code around it. Use several small edits instead of one big one. Keep each edit under about 60 lines.",
  "3. In text people see, write plain simple English, with no em dashes and no semicolons.",
  "4. Never touch sign-in security, the Google or Microsoft client IDs, who is allowed to use the AI, or anything that would send people's email or data somewhere new. Never add code that loads scripts from other websites. If asked for something like that, explain that it has to be done by a developer and change nothing.",
  "5. Don't change docs/version.js. The version is raised automatically on publish.",
  "6. If the request is unclear, or too big to do safely in a handful of edits, change nothing and say what you need to know or how to split it up.",
  "7. You can't run or see the app, so read carefully and check your edit against the code around it.",
  "",
  "When you are done, stop calling tools and write a short answer for Sam in plain English: what you changed, where he will see it on the page, and one thing to check after it goes live. No code in the answer. If you changed nothing, say why."
].join("\n");

const clipTo = function (s, n) { s = String(s); return s.length > n ? s.slice(0, n) + " ...(cut)" : s; };

async function runTool(W, name, input, edits, notes) {
  input = input || {};
  if (name === "list_files") {
    const out = [];
    for (const p of W.list()) out.push(p + "  (" + (await W.read(p)).length + " characters)");
    notes.push("Looked at the list of files");
    return out.join("\n");
  }
  if (name === "search") {
    const q = String(input.text || "");
    if (q.length < 2) throw new Error("Give at least 2 characters to search for.");
    const only = input.file ? cleanPath(input.file) : "", needle = q.toLowerCase(), hits = [];
    let total = 0;
    for (const p of W.list()) {
      if (only && p !== only) continue;
      const lines = (await W.read(p)).split("\n");
      for (let i = 0; i < lines.length; i++) {
        let at = lines[i].toLowerCase().indexOf(needle);
        while (at >= 0) {
          total++;
          if (hits.length < 40) {
            const a = Math.max(0, at - 110), b = Math.min(lines[i].length, at + q.length + 150);
            hits.push(p + ":" + (i + 1) + ": " + (a > 0 ? "..." : "") + lines[i].slice(a, b) + (b < lines[i].length ? "..." : ""));
          }
          at = lines[i].toLowerCase().indexOf(needle, at + needle.length);
        }
      }
    }
    notes.push("Searched for \"" + clipTo(q, 40) + "\"" + (only ? " in " + only.replace(/^docs\//, "") : ""));
    return total ? hits.join("\n") + (total > hits.length ? "\n(" + total + " matches in total, only the first " + hits.length + " shown. Search for something more specific.)" : "") : "No matches.";
  }
  if (name === "read") {
    const p = cleanPath(input.file), lines = (await W.read(p)).split("\n");
    const start = Math.max(1, Math.min(lines.length, +input.start || 1)), end = Math.max(start, Math.min(lines.length, +input.end || start + 80));
    let out = "", last = start - 1;
    for (let i = start; i <= end; i++) {
      const row = i + "| " + lines[i - 1] + "\n";
      if (out && out.length + row.length > MAX_READ) break;
      out += row.length > MAX_READ ? row.slice(0, MAX_READ) + " ...(this line is longer, use search to see other parts of it)\n" : row;
      last = i;
    }
    notes.push("Read " + p.replace(/^docs\//, "") + " lines " + start + " to " + last);
    return out + (last < end ? "(stopped at line " + last + " of the " + end + " asked for. Read from line " + (last + 1) + " to continue.)" : "") + "\n(" + p + " has " + lines.length + " lines)";
  }
  if (name === "edit") {
    const e = { file: input.file, old: input.old, new: input.new, why: clipTo(String(input.why || ""), 160) };
    const p = await W.apply(e);
    e.file = p;
    edits.push(e);
    notes.push("Changed " + p.replace(/^docs\//, "") + (e.why ? ": " + e.why : ""));
    return "Done. " + p + " is changed in the draft (not live yet).";
  }
  throw new Error("There is no tool called " + name + ".");
}

/* ---------- Claude ---------- */
function okMessages(msgs) {
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > 200) return false;
  return msgs.every(function (m) { return m && (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content)); });
}
/* Marks the end of the conversation so far as reusable, which makes each next step faster and cheaper. */
function withCache(msgs) {
  const out = msgs.map(function (m) {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    return { role: m.role, content: m.content.map(function (b) { if (b && b.cache_control) { const c = Object.assign({}, b); delete c.cache_control; return c; } return b; }) };
  });
  const last = out[out.length - 1];
  if (typeof last.content === "string") last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
  else if (last.content.length) last.content[last.content.length - 1] = Object.assign({}, last.content[last.content.length - 1], { cache_control: { type: "ephemeral" } });
  return out;
}
async function askClaude(msgs) {
  const ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, CLAUDE_TIMEOUT);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 3500, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], tools: TOOLS, messages: withCache(msgs) })
    });
    if (!r.ok) {
      let m = ""; try { m = ((await r.json()).error || {}).message || ""; } catch (e) {}
      if (/credit balance/i.test(m)) throw fail(502, "Claude has no credit left. Add credit in the Anthropic console, then try again.");
      if (r.status === 429 || r.status === 529) throw fail(429, "Claude is busy right now. Wait a minute and press Continue.");
      throw fail(502, "Claude couldn't answer (" + r.status + ")." + (m ? " " + m.slice(0, 140) : ""));
    }
    return r.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw fail(504, "Claude took too long on this step. Press Continue to carry on.");
    throw e;
  } finally { clearTimeout(timer); }
}

/* One request from the page = as many Claude turns as fit in about 24 seconds. The page calls again until done. */
async function step(who, b) {
  const msgs = b.messages, edits = Array.isArray(b.edits) ? b.edits.slice(0, 80) : [];
  if (!okMessages(msgs) || JSON.stringify(msgs).length > 3500000) throw fail(400, "This fix has become too long. Publish or discard it and start a new one.");
  const base = /^[0-9a-f]{40}$/.test(String(b.base || "")) ? b.base : await headOf(liveBranch());
  const snap = await snapshot(base);
  const W = await replay(snap, edits);
  const added = [], notes = [], t0 = Date.now();
  let done = false, summary = "", usage = { in: 0, out: 0 };
  while (!done && Date.now() - t0 < MAX_STEP_MS) {
    const a = await askClaude(msgs.concat(added));
    usage.in += (a.usage && (a.usage.input_tokens || 0) + (a.usage.cache_read_input_tokens || 0) + (a.usage.cache_creation_input_tokens || 0)) || 0;
    usage.out += (a.usage && a.usage.output_tokens) || 0;
    let content = Array.isArray(a.content) ? a.content : [];
    const cut = a.stop_reason === "max_tokens";
    if (cut) content = content.filter(function (c) { return c.type !== "tool_use"; });   /* a tool call that was cut off can't be trusted */
    const calls = content.filter(function (c) { return c.type === "tool_use"; });
    if (!content.length) content = [{ type: "text", text: "(no answer)" }];
    added.push({ role: "assistant", content: content });
    if (cut) { added.push({ role: "user", content: "Your last message was cut off because it was too long. Carry on, with smaller edits." }); continue; }
    if (!calls.length) { done = true; summary = content.filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("\n").trim(); break; }
    const results = [];
    for (const c of calls) {
      try { results.push({ type: "tool_result", tool_use_id: c.id, content: await runTool(W, c.name, c.input, edits, notes) }); }
      catch (e) { results.push({ type: "tool_result", tool_use_id: c.id, is_error: true, content: String((e && e.message) || e).slice(0, 600) }); }
    }
    added.push({ role: "user", content: results });
  }
  try { await S.record(who.email, "claude", usage); } catch (e) {}
  return { base: base, add: added, edits: edits, notes: notes, done: done, summary: summary, files: Object.keys(W.changed) };
}

/* ---------- publishing ---------- */
function bumpVersion(text, title) {
  const m = /version:\s*"(\d+)\.(\d+)"/.exec(text);
  if (!m) throw fail(500, "Couldn't read the version number in docs/version.js.");
  const v = m[1] + "." + (+m[2] + 1);
  const name = String(title || "Fix").replace(/[\\"\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70) || "Fix";
  const stamp = new Date().toISOString().slice(0, 16) + ":00Z";
  const out = text.replace(/version:\s*"[^"]*"/, 'version: "' + v + '"').replace(/name:\s*"[^"]*"/, 'name: "' + name + '"').replace(/updated:\s*"[^"]*"/, 'updated: "' + stamp + '"');
  return { text: out, version: v, name: name, stamp: stamp };
}
async function commit(snap, files, message) {
  const tree = await gh("/git/trees", { method: "POST", body: { base_tree: snap.tree, tree: Object.keys(files).map(function (p) { return { path: p, mode: "100644", type: "blob", content: files[p] }; }) } });
  return (await gh("/git/commits", { method: "POST", body: { message: message, tree: tree.sha, parents: [snap.commit] } })).sha;
}
async function publish(who, b) {
  const edits = Array.isArray(b.edits) ? b.edits.slice(0, 80) : [];
  if (!edits.length) throw fail(400, "There is nothing to publish.");
  const preview = b.target === "preview", branch = liveBranch();
  const snap = await snapshot(await headOf(branch));
  let W;
  try { W = await replay(snap, edits); }
  catch (e) { throw fail(409, "The live code changed since this fix was prepared, so it no longer fits. Start the fix again. (" + String((e && e.message) || e).slice(0, 160) + ")"); }
  const files = Object.assign({}, W.changed);
  const ver = bumpVersion(await W.read("docs/version.js"), b.title);
  files["docs/version.js"] = ver.text;
  const message = ver.version + ": " + ver.name + "\n\nFix box" + (preview ? " preview" : "") + ", asked by " + who.email + "\n\n" + edits.map(function (e) { return "- " + e.file + (e.why ? ": " + e.why : ""); }).join("\n");
  const sha = await commit(snap, files, message);
  if (preview) {
    const r = await gh("/git/refs/heads/" + PREVIEW_BRANCH, { method: "PATCH", body: { sha: sha, force: true }, raw: true });
    if (!r.ok) await gh("/git/refs", { method: "POST", body: { ref: "refs/heads/" + PREVIEW_BRANCH, sha: sha } });
  } else {
    await gh("/git/refs/heads/" + refPath(branch), { method: "PATCH", body: { sha: sha, force: false } });
  }
  return { ok: true, target: preview ? "preview" : "live", version: ver.version, name: ver.name, updated: ver.stamp, sha: sha, branch: preview ? PREVIEW_BRANCH : branch };
}

/* Asks GitHub whether Vercel has finished building a commit, and where the preview lives. */
async function previewStatus(b) {
  const sha = String(b.sha || "");
  if (!/^[0-9a-f]{40}$/.test(sha)) throw fail(400, "Bad request.");
  const r = await gh("/deployments?sha=" + sha + "&per_page=5", { raw: true });
  if (!r.ok) return { state: "unknown" };
  const deps = await r.json();
  if (!Array.isArray(deps) || !deps.length) return { state: "waiting" };
  const s = await gh("/deployments/" + deps[0].id + "/statuses?per_page=5", { raw: true });
  if (!s.ok) return { state: "unknown" };
  const st = (await s.json())[0];
  if (!st) return { state: "waiting" };
  if (st.state === "success") return { state: "ready", url: st.environment_url || st.target_url || "" };
  if (st.state === "failure" || st.state === "error") return { state: "failed" };
  return { state: "waiting" };
}

/* The list of Fix box publishes on the live branch, newest first. */
async function history() {
  const r = await gh("/commits?sha=" + encodeURIComponent(liveBranch()) + "&per_page=60");
  const undone = new Set();
  const out = [];
  (Array.isArray(r) ? r : []).forEach(function (c) {
    const msg = (c.commit && c.commit.message) || "";
    const m = /\n\nFix box undo of ([0-9a-f]{7,40})/.exec(msg);
    if (m) undone.add(m[1].slice(0, 7));
    if (!/\n\nFix box, asked by /.test(msg)) return;
    const head = msg.split("\n")[0], v = /^(\d+\.\d+):\s*(.*)$/.exec(head) || [];
    out.push({ sha: c.sha, version: v[1] || "", name: v[2] || head, date: (c.commit.committer && c.commit.committer.date) || "", by: (/asked by (\S+)/.exec(msg) || [])[1] || "" });
  });
  out.forEach(function (x) { x.undone = undone.has(x.sha.slice(0, 7)); });
  return { items: out.slice(0, 30) };
}

/* Takes back one Fix box publish (the newest one when no sha is given). It only touches the files that fix changed,
   and refuses when any of them has been changed again since, so nothing newer is lost. */
async function undo(who, sha) {
  const branch = liveBranch(), head = await snapshot(await headOf(branch));
  let target = head;
  if (sha) {
    if (!/^[0-9a-f]{40}$/.test(String(sha))) throw fail(400, "Bad request.");
    target = await snapshot(sha);
  } else if (!/\n\nFix box, asked by /.test(head.message)) {
    const h = await history(), last = h.items.filter(function (x) { return !x.undone; })[0];
    if (!last) throw fail(409, "There is no Fix box change to undo.");
    target = await snapshot(last.sha);
  }
  if (!/\n\nFix box, asked by /.test(target.message) || !target.parents.length) throw fail(409, "That change wasn't made by the Fix box, so it can't be undone here.");
  const before = await snapshot(target.parents[0]);
  const paths = Array.from(new Set(Object.keys(target.files).concat(Object.keys(before.files)))).filter(function (p) {
    return p !== "docs/version.js" && (target.files[p] || {}).sha !== (before.files[p] || {}).sha;
  });
  if (!paths.length) throw fail(409, "That fix didn't change any files.");
  const changedSince = paths.filter(function (p) { return (head.files[p] || {}).sha !== (target.files[p] || {}).sha; });
  if (changedSince.length) throw fail(409, "Can't undo this one safely: " + changedSince.join(", ") + " changed again after it. Ask the Fix box to change it back instead.");
  const tree = [];
  for (const p of paths) {
    if (before.files[p]) tree.push({ path: p, mode: "100644", type: "blob", sha: before.files[p].sha });
    else tree.push({ path: p, mode: "100644", type: "blob", sha: null });
  }
  const label = target.message.split("\n")[0].replace(/^\d+\.\d+:\s*/, "");
  const ver = bumpVersion(await blob(head.files["docs/version.js"].sha), "Undo: " + label);
  tree.push({ path: "docs/version.js", mode: "100644", type: "blob", content: ver.text });
  const t = await gh("/git/trees", { method: "POST", body: { base_tree: head.tree, tree: tree } });
  const c = (await gh("/git/commits", { method: "POST", body: { message: ver.version + ": " + ver.name + "\n\nFix box undo of " + target.commit.slice(0, 7) + ", asked by " + who.email, tree: t.sha, parents: [head.commit] } })).sha;
  await gh("/git/refs/heads/" + refPath(branch), { method: "PATCH", body: { sha: c, force: false } });
  return { ok: true, target: "live", version: ver.version, name: ver.name, updated: ver.stamp, sha: c, branch: branch };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS);
  if (owners.indexOf(who.email) < 0) return res.status(403).json({ owner: false, error: "The Fix box is only for the owner." });
  /* Download the whole app code as a .zip (owner only). Needs only GITHUB_TOKEN. */
  if (req.method === "GET" && String((req.query || {}).zip || "") === "1") {
    if (!String(process.env.GITHUB_TOKEN || "").trim()) return res.status(503).json({ error: "GITHUB_TOKEN is missing in Vercel." });
    try {
      const r = await gh("/zipball/" + encodeURIComponent(liveBranch()), { raw: true });
      if (!r.ok) return res.status(502).json({ error: "GitHub didn't send the code (" + r.status + ")." });
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=\"WYZ-Execution-Page-code.zip\"");
      return res.status(200).send(buf);
    } catch (e) { return res.status(502).json({ error: "Couldn't fetch the code from GitHub." }); }
  }
  const miss = missing();
  if (req.method === "GET") return res.status(200).json({ owner: true, ready: !miss.length, missing: miss, repo: repoName(), branch: liveBranch(), model: MODEL });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (miss.length) return res.status(503).json({ error: "The Fix box isn't set up yet. Missing in Vercel: " + miss.join(", ") + "." });
  const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
  try {
    if (b.action === "step") return res.status(200).json(await step(who, b));
    if (b.action === "publish") return res.status(200).json(await publish(who, b));
    if (b.action === "preview_status") return res.status(200).json(await previewStatus(b));
    if (b.action === "undo") return res.status(200).json(await undo(who, b.sha));
    if (b.action === "history") return res.status(200).json(await history());
    return res.status(400).json({ error: "Bad request." });
  } catch (e) {
    return res.status((e && e.status) || 500).json({ error: String((e && e.message) || "Something went wrong.").slice(0, 400) });
  }
};
module.exports._test = { work: work, bumpVersion: bumpVersion, cleanPath: cleanPath };
