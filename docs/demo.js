/* Demo mode: open the page with ?demo to see exactly what a new person sees, signed in as a sample "Karim".
   Nothing touches a real Google account. Sending, drafts, archiving and calendar changes are pretended, never done.
   Storage is in memory only (set up in index.html), so every demo starts as a brand-new person. */
(function () {
  "use strict";
  if (!/[?&]demo\b/.test(location.search)) return;
  window.WYZ_DEMO = true;
  var C = window.Connectors; if (!C) return;
  var now = Date.now(), H = 3600000, D = 24 * H;
  var iso = function (ms) { return new Date(ms).toISOString(); };
  var day = function (off, h, m) { var d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, m || 0, 0, 0); return d; };
  var ME = "karim.demo@wyzrent.com";
  var who = function (n, e) { return n + " <" + e + ">"; };

  /* sample inbox: [id, from, subject, snippet, hoursAgo, sentByMe, body] */
  var MAIL = [
    ["d1", who("Kelvin", "kelvin@wyzrent.com"), "New owner lead: 2BR in Dubai Marina", "Owner wants our management offer by Tuesday. Can you send the income estimate?", 3, false,
      "Hi Karim,\n\nThe owner of a 2-bedroom in Marina Gate wants our management offer by Tuesday. Can you send the income estimate and the contract summary today?\n\nThanks,\nKelvin"],
    ["d2", who("Louloua Bahri", "louloua@wyzrent.com"), "Marketing plan for November", "Please share the November plan before Thursday's meeting.", 6, false,
      "Hi Karim,\n\nPlease share the November marketing plan before Thursday's meeting. Keep it to one page with budget and targets.\n\nLouloua"],
    ["d3", who("Broker Partner", "partner@example-realty.ae"), "Referral fee question", "Is the referral fee paid on signing or on first booking?", 20, false,
      "Hello Karim,\n\nQuick question about the broker program. Is the referral fee paid when the owner signs, or after the first booking?\n\nBest regards"],
    ["d4", who("Karim Bahri", ME), "Photos for the JVC listing", "Can you confirm the photographer for Wednesday?", 50, true,
      "Hi,\n\nCan you confirm the photographer for Wednesday at 11am?\n\nKarim"],
    ["d5", who("Abbas Fannoush", "abbas@wyzrent.com"), "AI caption tool ready to test", "The Instagram caption tool is live. Try it and tell me what to change.", 26, false,
      "Hi Karim,\n\nThe Instagram caption tool is live on the dashboard. Try it on three listings and tell me what to change.\n\nAbbas"],
    ["d6", who("Bank Notifications", "no-reply@examplebank.ae"), "Your monthly statement is ready", "Your statement for September is available.", 30, false, "Your statement is available in online banking."],
    ["d7", who("Owner, Downtown 1BR", "owner.downtown@example.com"), "Payout date this month?", "When will September's payout reach my account?", 9, false,
      "Dear Karim,\n\nCould you tell me when September's payout will reach my account?\n\nThank you"]
  ];
  function msg(r) {
    return { id: r[0] + "m", threadId: r[0], labelIds: r[5] ? ["SENT"] : ["INBOX", "UNREAD"], snippet: r[3], sender: r[1], toRecipients: r[5] ? ["photos@example-studio.ae"] : [ME],
      subject: r[2], date: iso(now - r[4] * H), viewUrl: "#", plaintextBody: r[6], html: "", files: [], ccRecipients: [], attachments: [] };
  }
  var threads = MAIL.map(function (r) { return { id: r[0], messageCount: 1, messages: [msg(r)], viewUrl: "#" }; });
  var EVENTS = [
    { id: "e1", status: "confirmed", summary: "Owner call: Marina Gate 2BR", start: { dateTime: iso(day(0, 15, 0)) }, end: { dateTime: iso(day(0, 15, 30)) }, attendees: [{ email: "kelvin@wyzrent.com", name: "Kelvin" }], organizer: ME, conferenceUrl: "https://meet.google.com/demo" },
    { id: "e2", status: "confirmed", summary: "Marketing review with Louloua", start: { dateTime: iso(day(0, 17, 0)) }, end: { dateTime: iso(day(0, 17, 45)) }, location: "WYZ office", attendees: [{ email: "louloua@wyzrent.com", name: "Louloua Bahri" }], organizer: "louloua@wyzrent.com" },
    { id: "e3", status: "confirmed", summary: "Broker program weekly", start: { dateTime: iso(day(1, 10, 0)) }, end: { dateTime: iso(day(1, 10, 30)) }, attendees: [], organizer: ME },
    { id: "e4", status: "confirmed", summary: "Photographer at JVC unit", start: { dateTime: iso(day(3, 11, 0)) }, end: { dateTime: iso(day(3, 12, 0)) }, location: "JVC", attendees: [], organizer: ME }
  ];
  var FILES = [
    { id: "f1", title: "November marketing plan (draft)", modifiedTime: iso(now - 5 * H), mimeType: "application/vnd.google-apps.document", fileExtension: "" },
    { id: "f2", title: "Owner income estimate - Marina Gate 2BR", modifiedTime: iso(now - D), mimeType: "application/vnd.google-apps.spreadsheet", fileExtension: "" },
    { id: "f3", title: "Broker program one-pager.pdf", modifiedTime: iso(now - 3 * D), mimeType: "application/pdf", fileExtension: "pdf" }
  ];
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var pretend = function (what) { return function () { return wait(400).then(function () { note("Demo: \"" + what + "\" was not really done."); return { id: "demo", threadId: "demo", viewUrl: "#" }; }); }; };
  function inRange(e, a) { var s = Date.parse(e.start.dateTime); return s >= Date.parse(new Date(a.startTime).toISOString()) && s < Date.parse(new Date(a.endTime).toISOString()); }
  function search(a) {
    var q = String(a.query || "");
    var list = threads.filter(function (t) { var m = t.messages[0], sent = m.labelIds.indexOf("SENT") >= 0; return (!t.account || offX.indexOf(t.account) < 0) && (/in:sent/.test(q) ? sent : !sent); });
    if (!/in:(sent|inbox)/.test(q) && q) { var w = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (x) { return x.length > 2; }); list = threads.filter(function (t) { var s = (t.messages[0].subject + " " + t.messages[0].snippet + " " + t.messages[0].sender).toLowerCase(); return w.some(function (x) { return s.indexOf(x) >= 0; }); }); }
    if (/older_than:3d/.test(q)) list = list.filter(function (t) { return Date.parse(t.messages[0].date) < now - 3 * D; });
    else if (/newer_than:3d/.test(q)) list = list.filter(function (t) { return Date.parse(t.messages[0].date) >= now - 3 * D; });
    return { threads: list.slice(0, a.pageSize || 20) };
  }
  var TOOLS = {
    "Gmail": {
      search_threads: async function (a) { await wait(250); return search(a); },
      get_thread: async function (a) { var t = threads.filter(function (x) { return x.id === a.threadId; })[0]; return { id: a.threadId, messages: t ? t.messages : [] }; },
      create_draft: pretend("Save to Gmail drafts"), send_message: pretend("Send"), archive_thread: pretend("Archive"), mark_read: async function () { return {}; },
      modify_thread: pretend("Move"), trash_thread: pretend("Delete"), list_labels: async function () { return { labels: [] }; }, create_label: pretend("New label"),
      unsubscribe_one_click: pretend("Unsubscribe"), get_attachment: async function () { return { data: "" }; }
    },
    "Google Calendar": {
      list_events: async function (a) { return { events: EVENTS.filter(function (e) { return inRange(e, a); }) }; },
      create_event: pretend("Create meeting"), move_event: pretend("Move meeting")
    },
    "Google Contacts": { list_contacts: async function () { return { people: [{ name: "Kelvin", email: "kelvin@wyzrent.com" }, { name: "Louloua Bahri", email: "louloua@wyzrent.com" }, { name: "Abbas Fannoush", email: "abbas@wyzrent.com" }] }; } },
    "Google Drive": {
      list_recent_files: async function () { return { files: FILES }; },
      search_files: async function (a) { var q = String(a.query || "").toLowerCase(); return { files: FILES.filter(function (f) { return !q || f.title.toLowerCase().indexOf(q.split(" ")[0]) >= 0; }) }; },
      read_file: async function () { return { text: "Demo file. In the real page this is the file's text." }; }, save_file: pretend("Save to Drive")
    },
    "Todoist": { "find-tasks-by-date": async function () { if (!C.todoist.has()) { var e = new Error("Not connected to Todoist"); e.code = "server_not_connected"; throw e; } return { tasks: [] }; }, "complete-tasks": pretend("Complete task"), "add-tasks": pretend("Add task") }
  };
  C.mcp = {
    listTools: async function () { return { servers: Object.keys(TOOLS).map(function (s) { return { server: s }; }) }; },
    describeTool: async function () { throw new Error("No schema here"); },
    callTool: async function (s, t, a) { var f = TOOLS[s] && TOOLS[s][t]; if (!f) throw new Error("Unknown tool " + s + "." + t); return { payload: await f(a || {}) }; },
    server: async function (s) { var t = TOOLS[s] || {}, o = {}; Object.keys(t).forEach(function (k) { o[k] = function (a) { return t[k](a || {}); }; }); return o; }
  };
  var signed = false;
  var G = C.google;
  var PROFILE = { sub: "demo-karim", email: ME, name: "Karim Bahri", given_name: "Karim", picture: "" };
  G.configured = function () { return true; };
  G.connected = function () { return signed; };
  G.wasConnected = function () { return false; };
  G.connect = function () { return wait(900).then(function () { signed = true; localStorage.setItem("wyz-google-flag", "1"); return "demo-token"; }); };
  G.profile = async function () { return PROFILE; };
  G.token = async function () { return "demo-token"; };
  G.hasScope = function () { return true; };
  G.hasAllScopes = function () { return true; };
  G.signOut = async function () { signed = false; };
  /* a second account in the demo: a sample work inbox */
  var extra = [], offX = [];
  var WORK = [
    ["w1", who("Mhyar Kronful", "mhyar@wyzrent.com"), "Keyless lock offline at Marina unit", "Guest arrives at 4pm and the lock shows offline.", 2, false, "Hi Karim,\n\nThe keyless lock at the Marina unit shows offline and the guest arrives at 4pm. Can you call the lock company?\n\nMhyar"],
    ["w2", who("Jethelmay Olaran", "jethelmay@wyzrent.com"), "Owner statements to approve", "Three statements are ready for your approval.", 7, false, "Hi Karim,\n\nThree owner statements are ready. Please approve today so payouts go out tomorrow.\n\nJeth"]
  ];
  G.accounts = function () { return [{ email: ME, main: true, ok: signed, n: 0 }].concat(extra.map(function (e, i) { return { email: e, main: false, ok: true, needsTap: false, n: i + 1 }; })); };
  G.accountOn = function (e) { return offX.indexOf(e) < 0; };
  G.setAccountOn = function (e, on) { offX = offX.filter(function (x) { return x !== e; }); if (!on) offX.push(e); window.dispatchEvent(new CustomEvent("wyz-accounts")); };
  G.addAccount = function () { return wait(700).then(function () { var em = "karim@wyzrent.com"; if (extra.indexOf(em) >= 0) { var e = new Error("That account is already connected."); e.code = "same_account"; throw e; } extra.push(em);
    WORK.forEach(function (r) { var t = { id: "a1~" + r[0], messageCount: 1, account: em, messages: [Object.assign(msg(r), { id: "a1~" + r[0] + "m", threadId: "a1~" + r[0], toRecipients: [em] })], viewUrl: "#" }; threads.push(t); });
    window.dispatchEvent(new CustomEvent("wyz-accounts")); return em; }); };
  G.reconnectAccount = async function () {};
  G.removeAccount = function () { extra = []; threads = threads.filter(function (t) { return !t.account; }); window.dispatchEvent(new CustomEvent("wyz-accounts")); };

  /* the demo ribbon */
  function note(t) { var n = document.getElementById("demoNote"); if (n) { n.textContent = t; clearTimeout(note.t); note.t = setTimeout(function () { n.textContent = ""; }, 4000); } }
  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.createElement("div"); bar.className = "demobar"; bar.setAttribute("role", "note");
    var b = document.createElement("b"); b.textContent = "DEMO";
    var t = document.createElement("span"); t.textContent = " This is what Karim sees. Fake login, sample data, nothing is sent. ";
    var n = document.createElement("span"); n.id = "demoNote";
    var again = document.createElement("a"); again.href = location.pathname + "?demo=" + Date.now(); again.textContent = "Start again";
    var out = document.createElement("a"); out.href = location.pathname; out.textContent = "Exit demo";
    bar.append(b, t, n, " ", again, " · ", out); document.body.prepend(bar);
  });
})();
