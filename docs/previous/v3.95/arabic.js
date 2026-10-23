/* Arabic switch (3.91): a small EN / عربي button. It flips the page to right-to-left and translates the main labels:
   tabs, the Today strip, Platforms and Advise me. It does not translate emails or AI replies (Advise me answers in Arabic when the switch is on).
   The choice is saved on this device only. */
(function () {
  "use strict";
  var KEY = "wyz-lang";
  var D = {
    "Platforms": "المنصات", "Today": "اليوم", "All your platforms": "كل منصاتك", "Run the day": "إدارة اليوم", "Operations": "العمليات",
    "Revenue and pricing": "الإيرادات والتسعير", "Finance": "المالية", "Marketing": "التسويق", "Build and admin": "البناء والإدارة", "AI helpers": "مساعدو الذكاء الاصطناعي",
    "Recently used": "المستخدمة مؤخراً", "Pinned": "المثبتة", "Your own links": "روابطك", "Search platforms": "ابحث في المنصات",
    "Check-ins today": "وصول اليوم", "Check-outs today": "مغادرة اليوم", "Guests in house": "النزلاء في الوحدات", "Occupied today": "الإشغال اليوم",
    "Next 30 days": "الأيام الثلاثون القادمة", "Occupancy this month": "الإشغال هذا الشهر", "Booked this month": "المحجوز هذا الشهر", "Vs last year": "مقارنة بالعام الماضي",
    "Booked nights": "ليالٍ محجوزة", "Refresh": "تحديث", "Advise me": "انصحني", "What should I do?": "ماذا أفعل؟", "Advise": "انصح", "Point at something": "أشر إلى عنصر",
    "Close": "إغلاق", "Tap an item": "اختر عنصراً", "What:": "ماذا:", "When:": "متى:", "How:": "كيف:", "Risk:": "المخاطرة:",
    "SAMOCO legal": "ساموكو: قانوني", "Kuwait company": "شركة الكويت", "A09 villa": "فيلا A09", "Lebanon money": "أموال لبنان", "Inheritance": "الميراث",
    "Karim": "كريم", "Whole team": "الفريق كله", "Team:": "الفريق:", "Lawyer": "محامٍ", "Doctor": "طبيب", "Trainer": "مدرب", "Financial": "مالي", "Business": "أعمال", "Family": "عائلة", "Health": "الصحة", "Tax and visas": "الضرائب والتأشيرات", "Thinking it through...": "جارٍ التفكير...",
    "Connected": "متصل", "Not connected yet": "غير متصل بعد", "Check the key": "تحقق من المفتاح",
    "I'm not a licensed lawyer, doctor or financial adviser. Confirm with a professional before you act.": "لست محامياً أو طبيباً أو مستشاراً مالياً مرخصاً. استشر مختصاً قبل أن تتصرف."
  };
  var orig = new Map(), ar = false, btn, obs;
  function tr(node) {
    var v = node.nodeValue, k = v && v.trim();
    if (!k) return;
    if (ar) { var t = D[k]; if (t) { if (!orig.has(node)) orig.set(node, v); node.nodeValue = v.replace(k, t); } }
  }
  function walk(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) { var p = n.parentNode && n.parentNode.nodeName; if (p !== "SCRIPT" && p !== "STYLE") list.push(n); }
    list.forEach(tr);
  }
  function restore() { orig.forEach(function (v, node) { try { node.nodeValue = v; } catch (e) {} }); orig.clear(); }
  function apply(on) {
    ar = on; var h = document.documentElement;
    h.setAttribute("dir", on ? "rtl" : "ltr"); h.setAttribute("lang", on ? "ar" : "en");
    btn.textContent = on ? "EN" : "عربي";
    if (on) { walk(document.body); if (!obs) { obs = new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (a) { if (a.nodeType === 3) tr(a); else if (a.nodeType === 1) walk(a); }); if (m.type === "characterData") tr(m.target); }); }); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); } }
    else { if (obs) { obs.disconnect(); obs = null; } restore(); }
    try { localStorage.setItem(KEY, on ? "ar" : "en"); } catch (e) {}
  }
  function build() {
    var st = document.createElement("style");
    st.textContent = "#langBtn{position:fixed;left:14px;bottom:14px;z-index:60;min-height:44px;min-width:56px;padding:0 14px;border:1px solid var(--line,#d2d2d7);border-radius:999px;background:var(--panel,#fff);color:var(--fg,#1d1d1f);font:600 14px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.12);cursor:pointer}";
    document.head.appendChild(st);
    btn = document.createElement("button"); btn.id = "langBtn"; btn.type = "button"; btn.textContent = "عربي"; btn.setAttribute("aria-label", "Switch language, Arabic or English");
    btn.onclick = function () { apply(!ar); };
    document.body.appendChild(btn);
    var saved = ""; try { saved = localStorage.getItem(KEY) || ""; } catch (e) {}
    if (saved === "ar") setTimeout(function () { apply(true); }, 600);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
