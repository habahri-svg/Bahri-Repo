/* Removes repeats. The setup checklist lives in Settings. On the Today tab it shows only how far along it is, with a button to open it.
   Nothing is deleted: the full checklist is still in Settings, and it still updates from the same code. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof show !== "function") return;
  function apply() {
    var card = $("setupCard"), list = $("setupList"); if (!card || !list) return;
    list.hidden = true;
    var go = $("setupGo");
    if (!go) { go = el("button", "btn small solid", "Open the setup steps"); go.id = "setupGo"; go.type = "button"; go.onclick = function () { show("t-conn"); var s = $("setupList2"); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }; list.parentNode.insertBefore(go, list); }
  }
  setTimeout(apply, 500); setInterval(apply, 3000);
})();
