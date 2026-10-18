#!/usr/bin/env node
/* Keeps "Back to the previous version" always available.
   Usage: node tools/archive-version.js <git-ref-of-the-version-to-keep> [--force]
   It saves a complete, working copy of the page as it was at <ref> into docs/previous/v<version>/ and lists it in
   docs/versions.json, which the Back and Forward bar at the top of the page reads (docs/versionswitch.js).
   The GitHub workflow .github/workflows/archive-version.yml runs this by itself every time docs/version.js changes,
   so nobody has to remember. It only reads git history and writes under docs/. Safe to run twice. */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ref = process.argv[2], force = process.argv.includes("--force");
if (!ref) { console.error("Usage: node tools/archive-version.js <git-ref> [--force]"); process.exit(2); }
const git = (a) => cp.execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const show = (p) => { try { return git(["show", ref + ":" + p]); } catch (e) { return null; } };
const docs = path.join(__dirname, "..", "docs");

const verSrc = show("docs/version.js");
if (!verSrc) { console.log("No docs/version.js at " + ref + ". Nothing to archive."); process.exit(0); }
const version = (/version:\s*"([^"]+)"/.exec(verSrc) || [])[1], name = (/name:\s*"([^"]*)"/.exec(verSrc) || [])[1] || "";
if (!version) { console.log("No version number found at " + ref + "."); process.exit(0); }
const dest = path.join(docs, "previous", "v" + version);
if (fs.existsSync(dest) && !force) { console.log("Version " + version + " is already archived."); process.exit(0); }

/* files that every version shares from the main folder (big libraries, icons, the sign-in setting, the switcher itself) */
const SHARED = ["config.js", "versionswitch.js", "msal-browser.min.js", "jszip.min.js", "jspdf.umd.min.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
const html = show("docs/index.html");
if (html == null) { console.log("No docs/index.html at " + ref + "."); process.exit(0); }
const local = [];   /* scripts and styles that belong to this version and get copied */
html.replace(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^":?#]+)"/g, (m, f) => { if (!SHARED.includes(f) && /\.(js|css)$/.test(f) && local.indexOf(f) < 0) local.push(f); return m; });

const toParent = (text) => {
  SHARED.forEach((s) => {
    const re = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp("([\"'(=])" + re + "(?=[\"')?#])", "g"), "$1../../" + s);
  });
  return text;
};
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
let page = toParent(html);
if (page.indexOf("versionswitch.js") < 0) page = page.replace(/(<script src="version\.js"><\/script>)/, '$1\n<script src="../../versionswitch.js"></script>');
fs.writeFileSync(path.join(dest, "index.html"), page);
local.forEach((f) => {
  const t = show("docs/" + f);
  if (t == null) { console.warn("  missing at " + ref + ": " + f); return; }
  fs.writeFileSync(path.join(dest, f), f === "version.js" ? t : toParent(t));
});
if (local.indexOf("version.js") < 0) fs.writeFileSync(path.join(dest, "version.js"), verSrc);

/* list it. Oldest first. The live page is the entry with an empty path. Versions above the live one come after it. */
const vf = path.join(docs, "versions.json");
let list = [];
try { list = JSON.parse(fs.readFileSync(vf, "utf8")).versions || []; } catch (e) {}
const live = JSON.parse(JSON.stringify(list.filter((v) => !v.path)[0] || { version: "", path: "", label: "Current" }));
const archived = list.filter((v) => v.path && v.version !== version);
archived.push({ version, path: "previous/v" + version + "/", label: name });
const cmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const nowV = (/version:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(docs, "version.js"), "utf8")) || [])[1] || live.version;
live.version = nowV;
const lowerOrSame = archived.filter((v) => cmp(v.version, nowV) < 0).sort((a, b) => cmp(a.version, b.version));
const higher = archived.filter((v) => cmp(v.version, nowV) >= 0).sort((a, b) => cmp(a.version, b.version));
fs.writeFileSync(vf, JSON.stringify({ versions: lowerOrSame.concat([live], higher) }, null, 2) + "\n");
try { const n = require("./prune-versions").prune(); if (n) console.log("Pruned " + n + " older versions (keeping the last 5)."); } catch (e) { console.warn("Prune skipped: " + e.message); }
console.log("Archived version " + version + " into docs/previous/v" + version + "/ (" + (local.length + 1) + " files).");
