/* Preview: shows an HTML file as the page it really is, instead of its source code.
   Google Drive (and most file viewers) only show .html files as plain text, which is why they look like code there.
   The page is shown in a sandbox with no access to this app, your email or your saved data: it can run its own scripts, but it is
   cut off from everything here. Offers a code view, Download, and Print / Save as PDF.
   window.WYZ_PREVIEW(title, html)  opens it.   window.WYZ_IS_HTML(name, mime)  tells if a file is an HTML page. */
(function () {
  "use strict";
  if (typeof el !== "function") return;
  var dlg = null;
  window.WYZ_IS_HTML = function (name, mime) { return /\.html?$/i.test(String(name || "")) || /^text\/html/i.test(String(mime || "")); };
  var B = function (t, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = function () { fn(b); }; return b; };
  function build() {
    dlg = el("div", "onb"); dlg.id = "pvDlg"; dlg.hidden = true; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "pvTitle");
    var box = el("div", "onbbox card"); box.style.cssText = "max-width:1100px;width:96vw"; var pad = el("div", "pad");
    var hr = el("div", "headrow"); var t = el("h2", "", ""); t.id = "pvTitle"; t.style.cssText = "flex:1 1 200px;overflow-wrap:anywhere;font-size:17px";
    hr.append(t, B("Close", function () { dlg.hidden = true; var f = $("pvFrame"); if (f) f.srcdoc = ""; }));
    var acts = el("div", "acts"); acts.id = "pvActs";
    var frame = document.createElement("iframe"); frame.id = "pvFrame"; frame.title = "Preview"; frame.setAttribute("sandbox", "allow-scripts allow-modals allow-forms"); frame.setAttribute("referrerpolicy", "no-referrer");
    frame.style.cssText = "width:100%;height:68vh;border:1px solid var(--line);border-radius:8px;background:#fff";
    var code = el("pre"); code.id = "pvCode"; code.hidden = true; code.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:68vh;overflow:auto;margin:0;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:12.5px";
    var note = el("p", "status", "Shown in a sealed window. It can't see this app, your email or your data."); note.id = "pvNote";
    pad.append(hr, acts, frame, code, note); box.append(pad); dlg.append(box); document.body.append(dlg);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) { dlg.hidden = true; frame.srcdoc = ""; } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !dlg.hidden) { dlg.hidden = true; frame.srcdoc = ""; } });
  }
  window.WYZ_PREVIEW = function (title, html) {
    if (!dlg) build();
    html = String(html || "");
    $("pvTitle").textContent = title || "Preview";
    var frame = $("pvFrame"), code = $("pvCode"), acts = $("pvActs"); acts.replaceChildren(); code.textContent = html; code.hidden = true; frame.hidden = false;
    /* a page with no <base>, links open inside the window; keep them from navigating away */
    frame.srcdoc = html.indexOf("<base") < 0 ? html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">') : html;
    var view = B("View the code", function (b) { var showCode = code.hidden; code.hidden = !showCode; frame.hidden = showCode; b.textContent = showCode ? "View the page" : "View the code"; }, "ghost");
    var dl = B("Download .html", function () {
      var name = String(title || "page").replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\.html?$/i, "") + ".html";
      var url = URL.createObjectURL(new Blob([html], { type: "text/html" })), a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 800);
    }, "solid");
    var pr = B("Print / Save as PDF", function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { $("pvNote").textContent = "Couldn't open printing from here. Download the file, open it in your browser, and print from there."; } }, "ghost");
    acts.append(dl, pr, view);
    dlg.hidden = false;
  };
})();
