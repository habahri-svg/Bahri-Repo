/* WhatsApp beside the page (3.98).
   Every WhatsApp link on the page (wa.me or web.whatsapp.com) opens WhatsApp Web in one small
   floating window next to the Execution Page instead of handing over to the WhatsApp app.
   The window is reused, so the same one just comes to the front with the new chat filled in.
   Sending is still done by you in that window. WhatsApp Web is your personal account; the
   Business number stays on the Business phone app. */
(function () {
  var NAME = "wyz_whatsapp";
  function digits(s) { return String(s || "").replace(/[^\d]/g, ""); }
  function toWeb(href) {
    try {
      var u = new URL(href, location.href);
      if (/(^|\.)wa\.me$/.test(u.hostname)) {
        var phone = digits(u.pathname.replace(/^\//, "")), text = u.searchParams.get("text") || "";
        var out = new URL("https://web.whatsapp.com/send");
        if (phone) out.searchParams.set("phone", phone);
        if (text) out.searchParams.set("text", text);
        return out.toString();
      }
      if (/(^|\.)whatsapp\.com$/.test(u.hostname)) return u.toString().replace(/^https:\/\/(www\.)?whatsapp\.com/, "https://web.whatsapp.com");
    } catch (e) {}
    return "";
  }
  function features() {
    var w = Math.min(560, Math.max(420, Math.round(screen.availWidth * 0.36)));
    var h = Math.min(900, Math.round(screen.availHeight * 0.92));
    var left = (window.screenX || 0) + Math.max(0, (window.outerWidth || screen.availWidth) - w - 8);
    var top = (window.screenY || 0) + 40;
    return "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top + ",resizable=yes,scrollbars=yes";
  }
  function openWA(href) {
    var url = toWeb(href || "https://web.whatsapp.com/");
    if (!url) return false;
    var w = null;
    try { w = window.open(url, NAME, features()); } catch (e) {}
    if (!w) { try { w = window.open(url, "_blank", "noopener"); } catch (e2) {} }
    else { try { w.focus(); } catch (e3) {} }
    if (!w && typeof toast === "function") toast("Your browser blocked the WhatsApp window. Allow pop-ups for this page, then try again.");
    return !!w;
  }
  window.openWhatsAppWindow = openWA;
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!/wa\.me|whatsapp\.com/.test(href)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    openWA(a.href);
  }, true);
  function addButton() {
    var host = document.querySelector(".herouser") || document.querySelector(".herotop");
    if (!host || document.getElementById("waWindowBtn")) return;
    var b = document.createElement("button");
    b.id = "waWindowBtn"; b.type = "button"; b.className = "btn small"; b.textContent = "💬 WhatsApp";
    b.title = "Open WhatsApp Web in a small window beside this page";
    b.onclick = function () { openWA("https://web.whatsapp.com/"); };
    host.insertBefore(b, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton); else addButton();
})();
