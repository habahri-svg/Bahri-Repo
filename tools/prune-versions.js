#!/usr/bin/env node
/* Keeps only the last 5 older versions in docs/previous (Sam's rule). Safe to run twice.
   Usage: node tools/prune-versions.js   (also called by archive-version.js) */
"use strict";
const fs = require("fs"), path = require("path");
const docs = path.join(__dirname, "..", "docs"), KEEP = 5;
const cmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
function prune() {
  const vf = path.join(docs, "versions.json");
  const list = JSON.parse(fs.readFileSync(vf, "utf8")).versions || [];
  const live = list.find((v) => !v.path);
  const liveV = live && live.version;
  const old = list.filter((v) => v.path && (!liveV || cmp(v.version, liveV) < 0)).sort((a, b) => cmp(a.version, b.version));
  const drop = old.slice(0, Math.max(0, old.length - KEEP));
  drop.forEach((v) => fs.rmSync(path.join(docs, v.path), { recursive: true, force: true }));
  const gone = new Set(drop.map((v) => v.version));
  fs.writeFileSync(vf, JSON.stringify({ versions: list.filter((v) => !gone.has(v.version) || !v.path) }, null, 2) + "\n");
  return drop.length;
}
module.exports = { prune };
if (require.main === module) console.log("Removed " + prune() + " old versions, kept the last " + KEEP + ".");
