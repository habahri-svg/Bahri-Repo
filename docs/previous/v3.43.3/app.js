const PAGE_URL = location.href.split("#")[0];
const G = Connectors.google;
/* Brand: set in config.js, so the same page can be sold to another company (see brand.html) */
const BR=(()=>{const c=window.WYZ_CONFIG||{};return {co:String(c.COMPANY||""+BR.co+""),desc:String(c.COMPANY_DESC||"a Dubai holiday home management company"),app:String(c.APP_NAME||"Execution Page"),logo:String(c.LOGO_URL||""),c1:String(c.COLOR_MAIN||""),c2:String(c.COLOR_ACCENT||"")}})();
const ST = {reply:"Reply today",follow:"Follow up",work:"Work on",wait:"Waiting on others",fyi:"FYI"};
const ORDER = ["reply","follow","work","wait","fyi"];
const UR = {4:"Critical",3:"High",2:"Medium",1:"Low"};
const SRC = ["Gmail","Google Calendar"];
const $ = id => document.getElementById(id);
const el = (t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
let LS = "wyzcc-v1";
const state0={done:{},snooze:{},tasks:[]};
let mcp=null, sample=null, db=null, perms=null, uid=null, myName="", email="", pic="";
let threads=[], sent=[], events=null, board=null, state={done:{},snooze:{},tasks:[]}, flt=null, coFlt=null, showOff=false;
let busy=false;

/* ---------- dates ---------- */
const pad2=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
function todayLine(){const d=new Date();$("today").textContent=d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
todayLine();
const fmtTime=s=>{try{return new Date(s).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}catch(e){return ""}};
const fmtWhen=s=>{try{const d=new Date(s),n=new Date();const same=ymd(d)===ymd(n);return same?"Today "+fmtTime(s):d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})+", "+fmtTime(s)}catch(e){return ""}};

/* ---------- local + db storage ---------- */
function lsGet(){try{return JSON.parse(localStorage.getItem(LS)||"{}")}catch(e){return {}}}
function lsSet(o){try{localStorage.setItem(LS,JSON.stringify(o))}catch(e){}}
let saveT=0;
function persist(){
  const snap={board,state,at:Date.now()};
  lsSet(snap);
  if(db&&uid){clearTimeout(saveT);saveT=setTimeout(()=>{db.collection("data/users/"+uid).doc("cc").set({json:JSON.stringify(snap)}).catch(()=>{})},1200)}
}
function restore(snap){if(!snap)return;if(snap.board)board=snap.board;if(snap.state)state=Object.assign({done:{},snooze:{},tasks:[]},snap.state);try{renderBoard();renderLinks();renderTasks();applyOrder()}catch(e){}}

/* ---------- tabs ---------- */
const tabs=[["t-today","p-today"],["t-conn","p-conn"],["t-inst","p-inst"]];
function show(tid){tabs.forEach(([t,p])=>{const on=t===tid;$(t).setAttribute("aria-selected",String(on));$(p).hidden=!on})}
tabs.forEach(([t])=>$(t).onclick=()=>show(t));

/* ---------- install tab ---------- */
$("link").value=PAGE_URL;
$("copy").onclick=()=>{const b=$("copy");navigator.clipboard.writeText(PAGE_URL).then(()=>{b.textContent="Copied";setTimeout(()=>b.textContent="Copy link",1500)}).catch(()=>{$("link").focus();$("link").select();b.textContent="Press copy on your keyboard"})};

/* ---------- connection status + setup checklist ---------- */
const connState={};          // Gmail / Google Calendar: ok | prompt | denied | missing | reauth | na
const connNote={};
let research={claude:null,chatgpt:null,fu:null};  // imported or read research, plus follow-ups
function setConn(src,key,detail){connState[src]=key;connNote[src]=detail||"";renderSetup()}
function errToConn(src,e){
  const c=e&&e.code;
  if(c==="server_not_connected"||c==="selection_required")return setConn(src,"missing"),true;
  if(c==="needs_reauth")return setConn(src,"reauth"),true;
  if(c==="not_in_manifest"||c==="consent_required")return setConn(src,"denied"),true;
  if(c==="not_granted"||c==="capability_disabled")return setConn(src,"na"),true;
  return false;
}
async function readConn(){
  if(!mcp){SRC.forEach(s=>setConn(s,"na"));return}
  for(const s of SRC){
    let st="prompt";try{st=perms?await perms.state("mcp:"+s).catch(()=>"unavailable"):"prompt"}catch(e){}
    if(st==="denied")setConn(s,"denied");else if(connState[s]!=="ok")setConn(s,"prompt");
  }
  try{const r=await mcp.listTools();SRC.forEach(s=>{const sv=(r.servers||[]).find(x=>x.server===s);if(!sv)setConn(s,"missing");else if(sv.authStatus==="needs_reauth")setConn(s,"reauth")})}catch(e){}
}
const CONNECTORS="https://claude.ai/settings/connectors";
const GPT_EXPORT="https://chatgpt.com/#settings/DataControls";
const CLAUDE_EXPORT="https://claude.ai/settings/data-privacy-controls";
const daysAgo=t=>Math.floor((Date.now()-t)/86400000);
/* ---------- switch each source on or off (saved per person) ---------- */
const SRC_OF={"Gmail":"gmail","Google Calendar":"calendar","Google Drive":"drive","Google Contacts":"contacts","Todoist":"todoist"};
const SRC_EMPTY={gmail:{threads:[]},calendar:{events:[]},drive:{files:[]},contacts:{people:[]},todoist:{tasks:[]}};
const srcOff=k=>!!(state.off&&state.off[k]);
const readTool=t=>/^(search|list|find)/.test(t);
function gateMcp(m){return Object.assign({},m,{
  callTool:async(s,t,a,o)=>{const k=SRC_OF[s];if(k&&srcOff(k)&&readTool(t))return {payload:SRC_EMPTY[k]};return m.callTool(s,t,a,o)},
  server:async s=>{const o=await m.server(s),k=SRC_OF[s];if(!k)return o;const w={};Object.keys(o).forEach(t=>{w[t]=a=>srcOff(k)&&readTool(t)?Promise.resolve(SRC_EMPTY[k]):o[t](a)});return w}})}
const _mkSample=Connectors.makeSample;Connectors.makeSample=function(){return srcOff("ai")?null:_mkSample.apply(this,arguments)};
const GTABS=[["updates","Gmail Updates tab","Receipts, statements, bookings, notifications",1],["forums","Gmail Forums tab","Groups and mailing lists",1],["promotions","Gmail Promotions tab","Offers and newsletters",0],["social","Gmail Social tab","Social networks",0]];
const tabOn=k=>{const v=state.tabs&&state.tabs[k];return v===undefined?!!(GTABS.find(t=>t[0]===k)||[])[3]:!!v};
const inboxQuery=()=>"in:inbox newer_than:7d"+GTABS.filter(([k])=>!tabOn(k)).map(([k])=>" -category:"+k).join("");
const SOURCES=[["gmail","Email","Your inbox and sent mail"],["calendar","Calendar","Today's and this week's meetings"],["drive","Google Drive","Your recent files"],["contacts","Contacts","Address suggestions while you write"],["todoist","Todoist","Today's Todoist tasks"],["ai","AI assistant","Smart sorting, drafts and Ask"],["research","ChatGPT and Claude research","Follow-ups from your chats"],["alerts","Alerts on this browser","Pop-up alerts for urgent email"]];
function renderSources(){
  const host=$("srcList");if(!host)return;host.replaceChildren();
  const rows=[];
  const row=(on,label,sub,fn,key)=>{const l=el("label","srcrow");const i=el("input");i.type="checkbox";i.checked=on;i.onchange=()=>fn(i.checked);const t=el("span","");t.style.flex="1";t.append(el("b","",label),el("span","status"," "+sub));l.append(i,t);l.dataset.key=key||label;rows.push(l)};
  SOURCES.forEach(([k,label,sub])=>{
    if(k==="alerts"){row(!!state.alertsOn,label,sub,on=>{$("alertsOn").checked=on;$("alertsOn").onchange()},k);return}
    row(!srcOff(k),label,sub,on=>{state.off=state.off||{};state.off[k]=on?0:1;persist();if(k==="ai"){sample=Connectors.makeSample();try{renderAI();setAIButton()}catch(e){}}
      const r=document.querySelector('[data-sec="research"]');if(r)r.hidden=srcOff("research");refreshAll(true);toast(label+(on?" is on.":" is off. Turn it back on here any time."))},k);
  });
  if(G.mainType()!=="ms")GTABS.forEach(([k,label,sub])=>row(tabOn(k),label,sub,on=>{state.tabs=state.tabs||{};state.tabs[k]=on?1:0;persist();refreshAll(true);toast(label+(on?" is included.":" is left out."))},"tab:"+k));
  G.accounts().slice(1).filter(x=>x.email).forEach(x=>row(G.accountOn(x.email),"Email account: "+x.email,"Its mail, meetings and files",on=>{G.setAccountOn(x.email,on);refreshAll(true)},"acct:"+x.email));
  const list=ordered(rows,l=>l.dataset.key,state.srcOrder),keys=list.map(l=>l.dataset.key);
  list.forEach((l,i)=>{l.append(arrows(()=>{moveIn("srcOrder",keys,l.dataset.key,-1);renderSources()},()=>{moveIn("srcOrder",keys,l.dataset.key,1);renderSources()},i===0,i===list.length-1));host.append(l)});
}
window.addEventListener("wyz-accounts",()=>{try{renderSources()}catch(e){}});
function applyFocus(){const on=!!state.focus;document.body.classList.toggle("focus",on);$("focusBtn").setAttribute("aria-pressed",String(on));$("focusBtn").textContent=on?"Focus: on":"Focus"}
$("focusBtn").onclick=()=>{state.focus=state.focus?0:1;persist();applyFocus();if(state.focus){show("t-today");window.scrollTo({top:0,behavior:"smooth"})}toast(state.focus?"Focus is on: only your top list and emails to reply to. Tap Focus again to see everything.":"Showing everything again.")};
/* ---------- one big mic: say it, then choose task, question or email ---------- */
function openMic(){
  let d=$("micDlg");
  if(!d){d=el("div","onb");d.id="micDlg";d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");
    const box=el("div","onbbox card"),pad=el("div","pad");box.append(pad);d.append(box);
    pad.append(el("h2","","Say it"));
    const lang=el("select","in");lang.id="micLang";lang.style.maxWidth="160px";lang.append(new Option("English","en-GB"),new Option("العربية","ar-AE"),new Option("Français","fr-FR"));
    const big=el("button","bigmic","🎤");big.type="button";big.id="micGo";big.setAttribute("aria-label","Start speaking");
    const txt=el("textarea","in");txt.id="micTxt";txt.placeholder="Tap the microphone and speak. Or type here.";txt.style.minHeight="90px";
    const msg=el("p","status");msg.id="micMsg";
    const acts=el("div","acts");
    acts.append(onbBtn("Add as task",()=>{const v=txt.value.trim();if(!v)return;addTask(v,"Spoken");d.hidden=true;toast("Added to My tasks.")},"solid"),
      onbBtn("Ask",()=>{const v=txt.value.trim();if(!v)return;d.hidden=true;show("t-today");$("askQ").value=v;ask();$("askQ").scrollIntoView({behavior:"smooth",block:"center"})}),
      onbBtn("Write an email",()=>{const v=txt.value.trim();if(!v)return;d.hidden=true;openCompose();$("thrBrief").value=v;if(sample)composeDraft();else $("thrText").value=v}),
      onbBtn("🔊 Read my day",()=>{d.hidden=true;openReadDay()}),onbBtn("Close",()=>{stopMic();d.hidden=true},"ghost"));
    pad.append(lang,big,txt,msg,acts);document.body.append(d);
    let r=null;
    big.onclick=()=>{if(r){stopMic();return}
      if(!SR){msg.textContent="This browser can't listen. Type instead, or use the keyboard's microphone.";return}
      r=new SR();r.lang=lang.value;r.continuous=true;r.interimResults=true;let fin=txt.value?txt.value+" ":"";
      r.onresult=e=>{let it="";for(let k=e.resultIndex;k<e.results.length;k++){const t=e.results[k][0].transcript;if(e.results[k].isFinal)fin+=t+" ";else it+=t}txt.value=(fin+it).trim()};
      r.onerror=e=>{msg.textContent=e.error==="not-allowed"?"Allow the microphone for this site, then try again.":"Couldn't hear you ("+e.error+")."};
      r.onend=()=>{r=null;big.classList.remove("on");big.setAttribute("aria-label","Start speaking");msg.textContent=txt.value?"Now choose what to do with it.":""};
      try{r.start();big.classList.add("on");big.setAttribute("aria-label","Stop");msg.textContent="Listening... tap again to stop."}catch(x){r=null}};
    window.stopMic=()=>{try{r&&r.stop()}catch(x){}};
  }
  d.hidden=false;$("micTxt").value="";$("micMsg").textContent="";setTimeout(()=>$("micGo").focus(),30);
}
window.stopMic=()=>{};
$("micBtn").onclick=()=>{if(!G.connected()){showWelcome();return}openMic()};
$("srcBtn").onclick=()=>{show("t-conn");renderSources();const c=$("srcCard");c.classList.remove("collapsed");try{collapsed.delete(c.dataset.col);saveCol();applyCol()}catch(e){}c.scrollIntoView({behavior:"smooth",block:"start"})};
/* ---------- more connections: a second Google account, AI through your own chat account, apps, list import ---------- */
const CHAT={chatgpt:{name:"ChatGPT",url:"https://chatgpt.com/?q={prompt}",home:"https://chatgpt.com/"},claude:{name:"Claude",url:"https://claude.ai/new?q={prompt}",home:"https://claude.ai/"}};
const chatAI=()=>CHAT[state.chatAI]?state.chatAI:"";
function useChat(id){state.chatAI=id;state.skipAi=0;persist();window.open(CHAT[id].home,"_blank","noopener");renderSetup();try{setAIButton()}catch(e){}}
function askInChat(text){const c=CHAT[chatAI()];if(!c)return "";return openOutside({url:c.url,name:c.name},text)}
async function addAccount(type){
  if(type==="ms"&&!G.msConfigured()){toast("Microsoft accounts aren't switched on yet. Ask the person who invited you.");return}
  try{const em=await G.addAccount(type);toast("Added "+em+". Its email, meetings and files now show here too.");refreshAll(true)}
  catch(e){toast(e&&e.code==="same_account"?e.message:e&&e.code==="popup_closed"?"The Google window was closed. Tap Add account to try again.":"Couldn't add it ("+clip((e&&e.message)||"unknown reason",80)+").")}
  renderSetup();
}
async function reconnectAccount(n){try{await G.reconnectAccount(n);refreshAll(true)}catch(e){toast("Couldn't reconnect. Tap again.")}renderSetup()}
window.addEventListener("wyz-accounts",()=>{try{renderSetup();fillFrom()}catch(e){}});
function toast(t){let n=$("toastMsg");if(!n){n=el("div","updbar");n.id="toastMsg";n.setAttribute("role","status");document.body.append(n)}n.textContent=t;n.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{n.hidden=true},5000)}
const APPS=[["WhatsApp Business","https://web.whatsapp.com/"],["Hostaway","https://dashboard.hostaway.com/"],["Wafeq","https://app.wafeq.com/"],["PriceLabs","https://app.pricelabs.co/"],["Outlook","https://outlook.office.com/mail/"],["Slack","https://app.slack.com/"],["Notion","https://www.notion.so/"],["Canva","https://www.canva.com/"],["LinkedIn","https://www.linkedin.com/"],["Google Sheets","https://docs.google.com/spreadsheets/"],["Microsoft Teams","https://teams.microsoft.com/"],["Microsoft To Do","https://to-do.office.com/"],["Zoom","https://app.zoom.us/"],["Yahoo Mail","https://mail.yahoo.com/"],["iCloud Mail","https://www.icloud.com/mail"],["Proton Mail","https://mail.proton.me/"]];
const dashLink=()=>(window.WYZ_CONFIG&&window.WYZ_CONFIG.DASHBOARD_LINK)||state.dashLink||"";
function addApp(n,u){state.links=state.links||[];if(!state.links.some(l=>l.u===u))state.links.push({n,u});persist();try{renderLinks()}catch(e){}window.open(u,"_blank","noopener");renderSetup()}
function setDashLink(){const v=prompt("Paste the "+BR.co+" dashboard address (it starts with https://)",state.dashLink||"");if(v===null)return;const u=v.trim();if(!/^https:\/\/\S+$/.test(u)){toast("That doesn't look like a web address.");return}state.dashLink=u;persist();addApp(""+BR.co+" dashboard",u)}
/* Paste a list (iPhone Reminders, Notes, anything): every line becomes a task */
function importList(){
  let d=$("listDlg");
  if(!d){d=el("div","onb");d.id="listDlg";d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");
    const box=el("div","onbbox card"),pad=el("div","pad");box.append(pad);d.append(box);
    pad.append(el("h2","","Import your to-do list"));
    const st=el("ol","steps");["On your iPhone open Reminders (or Notes) and open the list.","Tap the three dots, then Select Reminders, then Select All. Tap Copy. (In Notes: select the checklist text and tap Copy.)","Come back here, paste below and tap Import."].forEach(t=>st.append(el("li","",t)));pad.append(st);
    const ta=el("textarea","in");ta.id="listTxt";ta.style.minHeight="160px";ta.placeholder="Paste your list here, one item per line";ta.setAttribute("aria-label","Your list");pad.append(ta);
    const msg=el("p","status");pad.append(msg);
    const acts=el("div","acts");
    acts.append(onbBtn("Import",()=>{const n=importLines(ta.value);if(!n){msg.textContent="Nothing to import yet. Paste your list first.";return}ta.value="";d.hidden=true;toast(n+" item"+(n>1?"s":"")+" added to My tasks.");state.listImported=Date.now();persist();renderSetup()},"solid"),onbBtn("Cancel",()=>{d.hidden=true},"ghost"));
    pad.append(acts);document.body.append(d)}
  d.hidden=false;setTimeout(()=>$("listTxt").focus(),30);
}
function importLines(txt){
  const have=new Set((state.tasks||[]).filter(t=>!t.done).map(t=>t.t.toLowerCase()));let n=0;
  String(txt||"").split(/\r?\n/).map(l=>l.replace(/^(?:\s*(?:[-*•◦▪●○☐☑✓✔]|\[[ xX]?\]|\d+[.)]))+\s*/,"").trim()).filter(l=>l&&l.length>1).reverse().forEach(l=>{if(have.has(l.toLowerCase()))return;have.add(l.toLowerCase());addTask(l,"iPhone list");n++});
  return n;
}
/* ---------- move connections and sources up or down (saved per person) ---------- */
const stepKey=s=>String(s.name||"").replace(/ \(optional\)/,"").replace(/accounts$/,"account");
function ordered(list,keyOf,order){const o=order||[];return list.map((x,i)=>({x,i,r:o.indexOf(keyOf(x))})).sort((a,b)=>(a.r<0?1000+a.i:a.r)-(b.r<0?1000+b.i:b.r)).map(y=>y.x)}
function moveIn(field,keys,key,dir){const i=keys.indexOf(key),j=i+dir;if(i<0||j<0||j>=keys.length)return;const k=keys.slice();[k[i],k[j]]=[k[j],k[i]];state[field]=k;persist()}
function arrows(onUp,onDown,first,last){const w=el("span","mv");const u=el("button","btn small ghost","↑");u.type="button";u.title="Move up";u.setAttribute("aria-label","Move up");u.disabled=first;u.onclick=e=>{e.preventDefault();e.stopPropagation();onUp()};
  const d=el("button","btn small ghost","↓");d.type="button";d.title="Move down";d.setAttribute("aria-label","Move down");d.disabled=last;d.onclick=e=>{e.preventDefault();e.stopPropagation();onDown()};w.append(u,d);return w}
function stepDefs(){
  const g=k=>connState[k];
  const skip=(flag)=>["Skip",()=>{state[flag]=1;persist();renderSetup()}];
  const mailStep=(name,what)=>{
    const s=g(name);
    if(s==="ok")return {done:true,desc:what};
    if(s==="reauth")return {desc:"Your Google sign-in ran out. Tap Sign in again.",btn:["Sign in again",()=>connectGoogle()]};
    if(s==="denied")return {desc:"Google didn't give this page permission. Tap Allow, then tick every box on Google's screen.",btn:["Allow",()=>connectGoogle(true)]};
    return {desc:what+" Tap Connect Google.",btn:["Connect Google",()=>connectGoogle()]};
  };
  const imp=(key,label,exportUrl,fileId,how)=>{
    const r=research[key];
    if(r&&r.at){const d=daysAgo(r.at);const stale=key==="chatgpt"&&d>=7;
      return {done:!stale,desc:(r.convs||[]).length+" conversations, imported "+(d===0?"today":d+" day"+(d>1?"s":"")+" ago")+"."+(stale?" Import a fresh copy to keep follow-ups current.":""),btn:["Import again",()=>$(fileId).click()],link:[exportUrl,"Open "+label+" export page"]};}
    return {desc:how,link:[exportUrl,"Open "+label+" export page"],btn:["Import file",()=>$(fileId).click()]};
  };
  const optional=(name,s,okTxt,flag,missingTxt,missingBtn,errTxt,retry)=>{
    const base={name};
    if(s==="ok")return Object.assign(base,{done:true,desc:okTxt});
    const sk=state[flag]?null:skip(flag);
    if(s==="reauth"||s==="denied")return Object.assign(base,{desc:errTxt,btn:missingBtn});
    if(s==="error")return Object.assign(base,{desc:"It answered with an error: "+clip(retry.note,140)+".",btn:["Try again",retry.fn],btn2:sk,done:!!state[flag]});
    return Object.assign(base,{desc:missingTxt,btn:missingBtn,btn2:sk,done:!!state[flag]});
  };
  return [
    {name:"Signed in",done:!!uid,desc:uid?"You're signed in as "+email+(G.mainType()==="ms"?" (Microsoft)":"")+". Your board is private to you.":"Tap Continue with Google or Continue with Microsoft at the top of the page.",btn:uid?null:["Continue with Google",()=>connectGoogle()]},
    Object.assign({name:G.mainType()==="ms"?"Outlook email":"Gmail"},mailStep("Gmail","Reads your inbox and sent mail, and saves reply drafts you approve.")),
    Object.assign({name:G.mainType()==="ms"?"Outlook calendar":"Google Calendar"},mailStep("Google Calendar","Shows your meetings for today and tomorrow.")),
    (()=>{const ex=G.accounts().slice(1),tap=ex.find(x=>x.needsTap);
      if(!ex.length)return {name:"Your other email account (optional)",done:!!state.skipAcct,desc:"Add your other email account: Gmail or Google work email, or Outlook, Hotmail or Microsoft 365. All inboxes, calendars and files show together, and every reply goes out from the right account.",btn:uid?["Add Google account",()=>addAccount("google")]:null,more:uid?[["Add Microsoft account",()=>addAccount("ms")]]:null,btn2:state.skipAcct?null:["Later",()=>{state.skipAcct=1;persist();renderSetup()}]};
      return {name:"Your other email account"+(ex.length>1?"s":""),done:!tap,desc:"Connected: "+ex.map(x=>x.email+(x.type==="ms"?" (Microsoft)":"")+(x.needsTap?" (needs a tap)":"")).join(", ")+"."+(tap?" The sign-in for this account ran out. Tap Reconnect.":""),btn:tap?["Reconnect "+tap.email,()=>reconnectAccount(tap.n)]:["Add Google account",()=>addAccount("google")],more:tap?null:[["Add Microsoft account",()=>addAccount("ms")]],btn2:["Remove "+ex[ex.length-1].email,()=>{if(confirm("Remove "+ex[ex.length-1].email+" from this page? Nothing is deleted in the account itself.")){G.removeAccount(ex[ex.length-1].n);refreshAll(true)}}]};
    })(),
    {name:"AI assistant: Claude or ChatGPT",done:!!sample||!!chatAI()||!!state.skipAi,
      more:sample?null:[["Use my ChatGPT account (no key)",()=>useChat("chatgpt")],["Use my Claude account (no key)",()=>useChat("claude")]],
      desc:sample?(Connectors.ai.label()+(Connectors.ai.mode()==="shared"?" is on automatically with your Google sign-in.":" is on with your own key (stored on this device only).")+" Change it under Settings, Personalise."):chatAI()?"Using your own "+CHAT[chatAI()].name+" account, no key needed. Write it for me and Ask open "+CHAT[chatAI()].name+" with the request filled in, then you paste the answer back. A key (below) makes it fully automatic.":"Without an AI, your inbox is sorted by simple rules. Connect Claude or ChatGPT for smarter sorting, drafts and Instruct AI. Each connects with an API key and stays on this device.",
      btn:["Add Claude key",()=>askKey("claude")],btn2:sample||state.skipAi?["Add ChatGPT key",()=>askKey("chatgpt")]:null},
    Object.assign({name:"Your Claude research"},imp("claude","Claude",CLAUDE_EXPORT,"f-claude","1. Tap Open Claude export page. 2. Under Your data, tap Export data and confirm. 3. Claude emails you a download link (usually within minutes). 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it.")),
    Object.assign({name:"Your ChatGPT research"},imp("chatgpt","ChatGPT",GPT_EXPORT,"f-chatgpt","1. Tap Open ChatGPT export page and sign in if asked. 2. In Data controls, tap Export data, then Confirm export. 3. OpenAI emails you a download link. 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it. Repeat weekly to keep it current.")),
    optional("Google Drive (optional)",drive.state,"Connected. Your recent documents show under Documents.","skipDrive","Shows the documents you've been working on. Uses the same Google sign-in as Gmail.",["Connect Google",()=>connectGoogle(drive.state==="denied")],"Google didn't give this page access to Drive. Tap Allow and tick every box on Google's screen.",{note:drive.note,fn:loadDrive}),
    optional("Todoist (optional)",todo.state,"Connected. Your Todoist tasks for today show under My tasks.","skipTodo","Use Todoist? In Todoist open Settings, Integrations, Developer and copy your API token, then tap Add token. No Todoist? Tap Skip, the built-in task list already works.",["Add token",setTodoToken],"Todoist didn't accept the token. Tap Replace token and paste it again.",{note:todo.note,fn:loadTodoist}),
    ...(DASH?[{name:""+BR.co+" dashboard (optional)",done:!!state.shareDash||!!state.skipDash,
      desc:state.shareDash?(state.dashErr?"Couldn't share: "+state.dashErr:"Sharing is on. Only counts and your research topics and ideas go to the company dashboard, never email text."+(state.dashAt?" Last shared "+fmtWhen(state.dashAt)+".":"")):"Optional. Share a daily summary with the company dashboard. Only counts and research topics and ideas are sent, never email text. You can turn it off any time.",
      btn:state.shareDash?["Share now",()=>shareSummary()]:["Turn on sharing",()=>setShare(true)],
      btn2:state.shareDash?["Turn off",()=>setShare(false)]:(state.skipDash?null:["Not now",()=>{state.skipDash=1;persist();renderSetup()}])}]:[]),
    {name:"Your to-do list from iPhone (optional)",done:!!state.listImported||!!state.skipList,desc:state.listImported?"Imported "+fmtWhen(state.listImported)+". Import again any time to add new items.":"Bring in your list from iPhone Reminders, Notes or anywhere else. Copy it, paste it here, and every line becomes a task.",btn:["Import a list",importList],btn2:state.listImported||state.skipList?null:["Later",()=>{state.skipList=1;persist();renderSetup()}]},
    {name:""+BR.co+" dashboard",done:!!dashLink()&&!!(state.links||[]).some(l=>l.u===dashLink())||!!state.skipDashLink,desc:dashLink()?"Opens the company dashboard in a new tab. Sign in there once and it stays on your Quick links.":"Add the company dashboard to your page. Ask Abbas or Sam for the address if you don't have it.",btn:dashLink()?["Open and sign in",()=>addApp(""+BR.co+" dashboard",dashLink())]:["Add dashboard link",setDashLink],btn2:state.skipDashLink?null:["Later",()=>{state.skipDashLink=1;persist();renderSetup()}]},
    {name:"Your other apps (optional)",done:(state.links||[]).length>0||!!state.skipApps,desc:"Put the apps you use every day one tap away. Each one opens so you can sign in, then stays on your Quick links. Add any other app under Quick links.",
      more:APPS.filter(([n,u])=>!(state.links||[]).some(l=>l.u===u)).slice(0,16).map(([n,u])=>["+ "+n,()=>addApp(n,u)]),btn2:state.skipApps||(state.links||[]).length?null:["Later",()=>{state.skipApps=1;persist();renderSetup()}]},
    {name:"Installed on your phone or computer",done:!!state.installed,desc:state.installed?"Done.":"Pin the page so it opens like an app. Steps are in the Install tab.",btn:state.installed?null:["Show me how",()=>show("t-inst")],btn2:state.installed?null:["I've done it",()=>{state.installed=1;persist();renderSetup()}]}
  ];
}
let lastStatus="",statT=0;
function reportStatus(steps){
  if(!db||!uid)return;
  const st={steps:steps.map(s=>({n:s.name,ok:!!s.done})),gmail:connState.Gmail||"",calendar:connState["Google Calendar"]||"",todoist:todo.state,drive:drive.state,
    inbox:threads.length,sorted:!!(board&&board.items&&board.items.length),meetings:events?events.length:null,
    claudeChats:(research.claude&&research.claude.convs||[]).length,chatgptChats:(research.chatgpt&&research.chatgpt.convs||[]).length,followups:(research.fu&&research.fu.items||[]).length,tasks:(state.tasks||[]).filter(t=>!t.done).length};
  const key=JSON.stringify(st);if(key===lastStatus)return;lastStatus=key;
  clearTimeout(statT);statT=setTimeout(()=>{db.collection("status").doc(uid).set(Object.assign({at:Date.now()},st)).catch(()=>{})},3000);
}
function renderSetup(){
  const steps=ordered(stepDefs(),stepKey,state.connOrder);try{reportStatus(steps)}catch(e){}const n=steps.filter(s=>s.done).length;
  $("progBar").style.width=Math.round(n/steps.length*100)+"%";
  $("setupTxt").textContent=n===steps.length?"All set. Everything below runs on your own accounts.":n+" of "+steps.length+" done. Sign in to each account below, one time. Everything uses your own accounts and nobody else sees your board.";
  const allDone=n===steps.length;
  if(allDone!==setupComplete){setupComplete=allDone;if(allDone)collapsed.add("setupCard");else collapsed.delete("setupCard");saveCol();try{applyOrder();applyCol()}catch(e){}}
  try{gateUi()}catch(e){}
  try{renderSources()}catch(e){}
  ["setupList","setupList2"].forEach(id=>{
    const host=$(id);host.replaceChildren();
    steps.forEach((s,ix)=>{
      const r=el("div","stp"+(s.done?" done":""));r.append(el("span","num",s.done?"✓":String(ix+1)),el("span","nm",s.name));
      const go=el("div","go");
      if(s.link){const a=el("a","btn small",s.link[1]);a.href=s.link[0];a.target="_blank";a.rel="noopener";go.append(a)}
      if(s.btn){const b=el("button","btn small solid",s.btn[0]);b.type="button";b.onclick=s.btn[1];go.append(b)}
      if(s.btn2){const b=el("button","btn small ghost",s.btn2[0]);b.type="button";b.onclick=s.btn2[1];go.append(b)}
      (s.more||[]).forEach(([t,f])=>{const b=el("button","btn small ghost",t);b.type="button";b.onclick=f;go.append(b)});
      {const keys=steps.map(stepKey);go.append(arrows(()=>{moveIn("connOrder",keys,stepKey(s),-1);renderSetup()},()=>{moveIn("connOrder",keys,stepKey(s),1);renderSetup()},ix===0,ix===steps.length-1))}
      r.append(go,el("span","ds",s.desc));host.append(r);
    });
  });
  try{if(!$("onb").hidden&&ONB[onbI]==="research")onbRender()}catch(e){}
}
/* ---------- guided connect: Claude, Todoist, research (shown right after Google sign-in) ---------- */
let ONB=["claude","todoist","research","done"];
let onbI=0;
const firstName=()=>(myName||"").split(" ")[0]||"there";
function onbOpen(){ONB=(Connectors.ai.mode()==="shared"?[]:["claude"]).concat(standalone()?[]:["install"],("Notification" in window)&&Notification.permission!=="granted"?["alerts"]:[],["done"]);if(ONB.length===1)ONB.unshift("welcome");onbI=0;$("onb").hidden=false;$("onbMsg").textContent="";onbRender()}
function onbClose(finished){$("onb").hidden=true;if(finished){state.onboarded=1;persist()}renderSetup()}
function onbGo(n){onbI=Math.min(n,ONB.length-1);$("onbMsg").textContent="";onbRender()}
function onbLink(href,text){const a=el("a","btn small",text);a.href=href;a.target="_blank";a.rel="noopener";return a}
function onbBtn(text,fn,cls){const b=el("button","btn "+(cls||""),text);b.type="button";b.onclick=fn;return b}
function onbRender(){
  const k=ONB[onbI],body=$("onbBody"),acts=$("onbActs");body.replaceChildren();acts.replaceChildren();
  $("onbStep").textContent=k==="done"?"All done":"Step "+(onbI+1)+" of "+(ONB.length-1);
  const dots=$("onbDots");dots.replaceChildren();ONB.forEach((_,i)=>dots.append(el("i",i<=onbI?"on":"")));
  const p=(t,c)=>body.append(el("p",c||"sub",t));
  const later=(flag)=>onbBtn("Later",()=>{if(flag){state[flag]=1;persist()}onbGo(onbI+1)},"ghost");
  if(k==="welcome"){
    $("onbTitle").textContent="Welcome, "+firstName();
    p("Your page is ready. Your email, meetings and files are loading now.");
    acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));
  }else if(k==="accounts"){
    $("onbTitle").textContent="Add your other email account";
    const ex=G.accounts().slice(1).filter(x=>x.email);
    p("Welcome, "+firstName()+". You're signed in as "+(email||"your account")+". Run all your email from here: add your other account too, Gmail or Google work email, or Outlook, Hotmail or Microsoft 365.");
    p("Both inboxes, calendars and files show together. Every reply goes out from the account the email came to, and new emails let you pick which one to send from.");
    if(ex.length)p("✓ Added: "+ex.map(x=>x.email).join(", "),"status");
    acts.append(onbBtn("Add Google account",async function(){this.disabled=true;await addAccount("google");onbRender()},"solid"),onbBtn("Add Microsoft account",async function(){this.disabled=true;await addAccount("ms");onbRender()},"solid"),onbBtn(ex.length?"Next":"Later",()=>{if(!ex.length){state.skipAcct=1;persist()}onbGo(onbI+1)},ex.length?"":"ghost"));
    p("Later is fine. It stays under Settings.","status");
  }else if(k==="apps"){
    $("onbTitle").textContent="Your dashboard and everyday apps";
    p("Put the "+BR.co+" dashboard and the apps you use every day one tap away. Each one opens so you can sign in, then stays on your Quick links. Choose any, or tap Later.");
    const r=el("div","acts");
    if(dashLink())r.append(onbBtn(""+BR.co+" dashboard",()=>{addApp(""+BR.co+" dashboard",dashLink());onbRender()},"solid"));
    else r.append(onbBtn("Add the "+BR.co+" dashboard",()=>{setDashLink();onbRender()},"solid"));
    APPS.forEach(([n,u])=>{const on=(state.links||[]).some(l=>l.u===u);const b=onbBtn((on?"✓ ":"+ ")+n,()=>{addApp(n,u);onbRender()},"small"+(on?" solid":""));r.append(b)});
    body.append(r);
    p("WhatsApp Business opens WhatsApp Web, where you scan the code with your phone once. Any other app can be added under Quick links.","status");
    acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"),later("skipApps"));
  }else if(k==="claude"){
    $("onbTitle").textContent="Connect an AI assistant";
    if(sample){p(Connectors.ai.label()+" is connected. Your inbox is sorted smartly and drafts are written for you.");acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));return}
    p("Welcome, "+firstName()+". Google is connected. Next, connect an AI so your inbox is sorted by what needs you, replies are drafted for you and your research gets follow-ups. Choose Claude or ChatGPT. You can add the other one later.");
    p("No API key? Use your own ChatGPT or Claude account. Write it for me and Ask open it with the request filled in, and you paste the answer back.");
    const cr=el("div","acts");cr.append(onbBtn("Use my ChatGPT account",()=>{useChat("chatgpt");onbGo(onbI+1)},"solid"),onbBtn("Use my Claude account",()=>{useChat("claude");onbGo(onbI+1)},"solid"));body.append(cr);
    p("Have an API key? It makes everything automatic. Paste it below. It's stored on this device only and sent only to that company.");
    const sel=el("select","in");sel.id="onbProv";sel.setAttribute("aria-label","Which AI");sel.append(new Option("Claude (sk-ant-...)","claude"),new Option("ChatGPT (sk-...)","chatgpt"));body.append(sel);
    const lk=onbLink("https://console.anthropic.com/settings/keys","Get my Claude key");body.append(lk);
    sel.onchange=()=>{const g=sel.value==="chatgpt";lk.href=g?"https://platform.openai.com/api-keys":"https://console.anthropic.com/settings/keys";lk.textContent=g?"Get my OpenAI key":"Get my Claude key";inp.placeholder=g?"sk-...":"sk-ant-..."};
    const inp=el("input","in");inp.id="onbKey";inp.type="password";inp.placeholder="sk-ant-...";inp.autocomplete="off";inp.setAttribute("aria-label","API key");body.append(inp);
    acts.append(onbBtn("Connect",async function(){
      const b=this;b.disabled=true;b.textContent="Checking your key...";$("onbMsg").textContent="";
      const r=await connectAI(sel.value,inp.value);
      if(r.ok){onbGo(onbI+1);return}
      b.disabled=false;b.textContent="Connect";$("onbMsg").textContent=r.msg;
    },""),onbBtn("Later",()=>{state.skipAi=1;persist();onbGo(onbI+1)},"ghost"));
  }else if(k==="todoist"){
    $("onbTitle").textContent="Bring in your to-do list";
    p("Keep your list on iPhone Reminders or Notes? Copy it and paste it here. Every line becomes a task.");
    body.append(onbBtn(state.listImported?"✓ Imported. Import more":"Import from iPhone",()=>importList(),"solid"));
    if(todo.state==="ok"){p("Todoist is connected. Today's tasks show next to your email.");acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));return}
    if(onbI===0)p("Welcome, "+firstName()+". Google and your AI are connected, so your inbox is already being sorted for you. Two optional connections left.");
    p("Use Todoist? Connect it to see today's tasks beside your email and tick them off here. In Todoist open Settings, Integrations, Developer, copy your API token and paste it below.");
    body.append(onbLink("https://app.todoist.com/app/settings/integrations/developer","Open Todoist settings"));
    const inp=el("input","in");inp.id="onbTodo";inp.type="password";inp.placeholder="Todoist API token";inp.autocomplete="off";inp.setAttribute("aria-label","Todoist API token");body.append(inp);
    acts.append(onbBtn("Connect Todoist",async function(){
      const v=inp.value.trim(),b=this;if(!v){$("onbMsg").textContent="Paste your Todoist token first.";return}
      b.disabled=true;b.textContent="Checking...";$("onbMsg").textContent="";
      Connectors.todoist.set(v);todo.state="unknown";await loadTodoist();
      if(todo.state==="ok"){onbGo(onbI+1);return}
      b.disabled=false;b.textContent="Connect Todoist";
      if(todo.state==="reauth"||todo.state==="denied"){Connectors.todoist.clear();todo.state="missing";renderSetup();$("onbMsg").textContent="Todoist rejected that token. Copy it again from Todoist."}
      else $("onbMsg").textContent="Todoist didn't answer ("+clip(todo.note,100)+"). You can skip this and try again later."
    },""),onbBtn("Next",()=>{state.skipTodo=1;persist();onbGo(onbI+1)},"solid"));
  }else if(k==="research"){
    $("onbTitle").textContent="Bring in your ChatGPT and Claude research";
    p("Optional. Export your chats from each service, then import the file here. The page then suggests a follow-up for each piece of unfinished research. ChatGPT and Claude only share chats through an export file, so this part takes a few minutes.");
    [["chatgpt","ChatGPT",GPT_EXPORT,"f-chatgpt"],["claude","Claude",CLAUDE_EXPORT,"f-claude"]].forEach(([key,label,url,fid])=>{
      const r=research[key],row=el("div","onbrow");
      row.append(el("b","",label+(r&&r.at?" ✓":"")));
      row.append(el("span","status",r&&r.at?(r.convs||[]).length+" conversations imported.":"Open the export page, request your data, then import the .zip from the email."));
      const a=el("div","acts");a.append(onbLink(url,"Open "+label+" export page"),onbBtn(r&&r.at?"Import again":"Import file",()=>$(fid).click()));row.append(a);body.append(row)});
    acts.append(onbBtn("Continue",()=>onbGo(onbI+1),"solid"));
  }else if(k==="alerts"){
    $("onbTitle").textContent="Only the important buzz";
    p("Turn on alerts and your phone or computer tells you only about VIP and urgent emails. Nothing else.");
    acts.append(onbBtn("Turn on VIP alerts",async()=>{$("alertsOn").checked=true;await $("alertsOn").onchange();onbGo(onbI+1)},"solid"),later());
  }else if(k==="install"){
    $("onbTitle").textContent="Put it on this "+(DEV.phone?"phone":"computer");
    p("Install it once and it opens like an app, straight from your "+(DEV.phone?"home screen":"dock or taskbar")+". Nothing to download from a store.");
    installGuide(body);
    p("Then do the same on your "+(DEV.phone?"computer":"phone")+". Send yourself the link:");
    const r=el("div","acts");r.append(onbBtn("Send to myself on WhatsApp",()=>window.open(waLink("My execution page: "+SITE_URL+"\nOpen it, sign in with Google, then install it."),"_blank","noopener")),onbLink("mailto:?subject="+encodeURIComponent("My execution page")+"&body="+encodeURIComponent("Open this, sign in with Google, then install it:\n"+SITE_URL),"Email it to myself"));body.append(r);
    acts.append(onbBtn("Done",()=>onbGo(onbI+1),"solid"),onbBtn("Later",()=>onbGo(onbI+1),"ghost"));
  }else if(k==="dash"){
    $("onbTitle").textContent="Share a daily summary with the company";
    p("Optional. Turn this on to send a short daily summary to the "+BR.co+" dashboard, so the team can see how the day is going.");
    p("What is sent: counts only (emails to reply, follow-ups, meetings today, open tasks) and your research topics and ideas. Never email text, names or files. You can turn it off at any time.");
    acts.append(onbBtn("Turn on sharing",()=>{setShare(true);onbGo(onbI+1)},"solid"),onbBtn("Not now",()=>{state.skipDash=1;persist();onbGo(onbI+1)},"ghost"));
  }else{
    $("onbTitle").textContent="You're all set, "+firstName();
    const line=(ok,t)=>body.append(el("p","sub",(ok?"✓ ":"○ ")+t));
    line(true,"Google: Gmail, Calendar and Drive ("+(email||"signed in")+")");
    const ex=G.accounts().slice(1).filter(x=>x.email);line(ex.length>0,ex.length?"Also connected: "+ex.map(x=>x.email).join(", "):"Other email account: not added yet");
    line(!!sample||!!chatAI(),sample?Connectors.ai.label()+": smart sorting and drafts on":chatAI()?"AI: your own "+CHAT[chatAI()].name+" account":"AI: not connected, simple sorting for now");
    line((state.links||[]).length>0,(state.links||[]).length?"Apps: "+(state.links||[]).map(l=>l.n).join(", "):"Apps: none added yet");
    line(todo.state==="ok",todo.state==="ok"?"Todoist: connected":"Todoist: not connected");
    const n=((research.chatgpt&&research.chatgpt.convs)||[]).length+((research.claude&&research.claude.convs)||[]).length;
    line(n>0,n?"Research: "+n+" conversations imported":"Research: not imported yet");
    if(DASH)line(!!state.shareDash,state.shareDash?"Company dashboard: sharing a daily summary":"Company dashboard: not sharing");
    p("When you want more, everything else is in Settings, Your data sources: a second email account, your to-do list, research, the "+BR.co+" dashboard and your everyday apps.");
    acts.append(onbBtn("Open my page",()=>onbClose(true),"solid"));
  }
  const f=body.querySelector("input")||acts.querySelector("button");if(f)setTimeout(()=>f.focus(),30);
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("onb").hidden)onbClose(true)});
$("onbAgain").onclick=()=>{show("t-today");onbOpen()};

/* ---------- share a daily summary with the company dashboard (optional, off until the person turns it on) ---------- */
const DASH=(window.WYZ_CONFIG&&window.WYZ_CONFIG.DASHBOARD_URL)||"";
const dubaiDay=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"});
function summaryPayload(){
  const items=allItems().filter(i=>!isOff(i));
  const n=k=>items.filter(i=>i.st===k).length;
  const today=ymd(new Date());
  const meet=(events||[]).filter(x=>{const s=x.start&&(x.start.dateTime||x.start.date);return s&&(x.start.date?x.start.date===today:ymd(new Date(s))===today)}).length;
  const open=(state.tasks||[]).filter(t=>!t.done).length+(todo.state==="ok"?todo.tasks.length:0);
  const byKey={};allConvs().forEach(c=>byKey[c.src+":"+c.id]=c);
  const rs=((research.fu&&research.fu.items)||[]).slice(0,10).map(f=>{const c=byKey[f.key];return {topic:clip(f.topic||"",200),idea:clip(f.next||"",200),source:c&&c.src==="chatgpt"?"chatgpt":"claude"}}).filter(x=>x.topic);
  return {date:dubaiDay(),emails_to_reply:n("reply"),follow_ups:n("follow"),waiting:n("wait"),meetings_today:meet,tasks_open:Math.min(open,10000),research:rs};
}
async function shareSummary(){
  if(!DASH||!G.connected())return;
  try{
    const t=await G.token();
    const r=await fetch(DASH,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+t},body:JSON.stringify(summaryPayload())});
    if(!r.ok)throw new Error(r.status===403?"Your Google account isn't on the dashboard's approved list.":"The dashboard answered "+r.status+".");
    state.dashAt=Date.now();state.dashErr="";
  }catch(e){state.dashErr=(e&&e.message)||"Couldn't reach the dashboard."}
  persist();renderSetup();
}
function setShare(on){state.shareDash=on?1:0;if(on)state.skipDash=0;persist();renderSetup();if(on)shareSummary()}

/* ---------- connect, personalise, sign out ---------- */
const niceErr=e=>{const c=e&&e.code;
  if(c==="popup_closed")return "The Google window was closed. Tap Continue with Google to try again.";
  if(c==="popup_failed_to_open")return "Your browser blocked the Google window. Allow pop-ups for this site, then try again.";
  if(c==="consent_required")return "Google didn't give permission. Tap Continue with Google again and tick every box on Google's screen.";
  if(c==="not_configured")return "Google sign-in isn't set up yet. The site owner needs to add a Google Client ID (EXECUTION-PAGE.md, step 2).";
  if(c==="google_unavailable")return e.message;
  return (e&&e.message)||"Couldn't connect to Google. Try again."};
const lastName=()=>{try{return localStorage.getItem("wyz-last-name")||""}catch(e){return ""}};
function showWelcome(){
  const w=$("welcome");w.hidden=false;$("wMs").hidden=!G.msConfigured();
  if(typeof DEV!=="undefined"&&DEV.inApp){$("wMsg").textContent="You opened this inside another app, and Google doesn't allow sign-in there. Tap the menu (three dots) and choose Open in "+(DEV.ios?"Safari":"Chrome")+", or copy the link into "+(DEV.ios?"Safari":"Chrome")+"."}
  if(!G.configured()){$("wTitle").textContent="One-time setup needed";$("wText").textContent="Google needs to know this site before anyone can sign in. Follow the steps below once, paste the Client ID, and the Continue with Google button turns on.";$("wBtn").disabled=true;$("wSetup").hidden=false;$("wOrigin").textContent=location.origin;return}
  $("wBtn").disabled=false;
  if(!G.fromConfigFile()){$("wFamily").hidden=false;$("wFamLink").value=location.origin+location.pathname+"#cid="+encodeURIComponent(G.clientId())}
  const n=lastName();if(n){$("wTitle").textContent="Welcome back, "+n.split(" ")[0];$("wText").textContent="Tap Continue with Google to reconnect. Your board loads straight away."}
}
function goSec(k){
  collapsed.delete(SEC_CARD[k]);saveCol();applyCol();
  const e=document.querySelector('[data-sec="'+k+'"]');
  if(e){const y=e.getBoundingClientRect().top+window.scrollY-$("toolbar").offsetHeight-8;window.scrollTo({top:y,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
}
/* the banner: a one-line read on the day, plus counts that jump to the right section */
function updateHero(){
  const box=$("heroStats"),sum=$("heroSum");
  if(!uid||!G.connected()){box.replaceChildren();sum.textContent="";return}
  const s=summaryPayload();
  document.title=(s.emails_to_reply?"("+s.emails_to_reply+") ":"")+baseTitle();
  const now=Date.now();
  const next=(events||[]).filter(x=>x.start&&x.start.dateTime&&Date.parse(x.start.dateTime)>now).sort((a,b)=>Date.parse(a.start.dateTime)-Date.parse(b.start.dateTime))[0];
  const parts=[];
  if(s.emails_to_reply)parts.push(s.emails_to_reply+" email"+(s.emails_to_reply>1?"s":"")+" to reply to");
  if(s.follow_ups)parts.push(s.follow_ups+" to chase");
  if(s.meetings_today)parts.push(s.meetings_today+" meeting"+(s.meetings_today>1?"s":""));
  let line=parts.length?"Today: "+parts.join(", ")+".":(board?"You're clear for now. Nothing urgent is waiting.":"");
  if(next)line+=" Next up at "+fmtTime(next.start.dateTime)+": "+clip(next.summary||"Meeting",50)+".";
  sum.textContent=line;
  const defs=[["Reply today",s.emails_to_reply,"#d6453d",()=>{flt="reply";renderBoard();goSec("inbox")}],["Follow up",s.follow_ups,"#e08a2e",()=>{flt="follow";renderBoard();goSec("inbox")}],["Meetings today",s.meetings_today,"#9cc9e8",()=>goSec("cal")],["Open tasks",s.tasks_open,"#45a843",()=>goSec("tasks")]];
  box.replaceChildren();
  defs.forEach(([label,n,color,fn])=>{const b=el("button","hstat");b.type="button";b.append(el("b","",String(n)));const l=el("span");const dot=el("i");dot.style.background=color;l.append(dot,label);b.append(l);b.onclick=fn;b.setAttribute("aria-label",n+" "+label);box.append(b)});
}
function renderHello(){
  try{$("styleNote").value=state.styleNote||"";$("styleSt").textContent=state.styleNote?(state.styleOwn?"Written by you.":"Learned from your sent emails, "+fmtWhen(state.styleAt||Date.now())+"."):"Not learned yet. It's learned the first time the AI writes a reply for you.";$("coRules").value=state.coRules!=null?state.coRules:CO_DEFAULT;$("quickArm").checked=state.quickArm!==false}catch(e){}
  try{$("pageName").value=state.pageName||"";applyPageName();renderTeam();$("autoDraft").checked=!!state.autoDraft;$("undoSecs").value=String(undoSecs());if($("autoSum"))$("autoSum").checked=state.autoSum!==false;if($("badgeOn"))$("badgeOn").checked=!state.badgeOff;$("alertsOn").checked=!!state.alertsOn&&"Notification" in window&&Notification.permission==="granted";$("autoSuggest").checked=state.autoSuggest!==false;$("tidyOn").checked=!!state.tidy;$("weeklyOn").checked=!state.noWeekly;$("quickList").value=Array.isArray(state.quick)?state.quick.join(", "):"";$("driveFolder").value=state.driveFolder||""}catch(e){}
  const h=new Date().getHours();
  $("hello").textContent=myName?(h<12?"Good morning, ":h<18?"Good afternoon, ":"Good evening, ")+myName.split(" ")[0]:"Your execution page";
  try{updateHero()}catch(e){}
  $("who").hidden=!uid;
  if(uid){$("whoName").textContent=email||myName;const a=$("avatar");if(pic){a.src=pic;a.hidden=false}else a.hidden=true}
}
let loopOn=false,lastAct=Date.now(),lastRef=Date.now();
async function afterConnect(){
  const p=await G.profile();
  uid=p.sub;myName=p.name||"";email=p.email||"";pic=p.picture||"";
  try{localStorage.setItem("wyz-last-name",myName)}catch(e){}
  LS="wyzcc-v1-"+uid;loadContactsCache();
  setTimeout(()=>{try{applyFocus();applySetOrder();sample=Connectors.makeSample();renderAI();renderSources();const r=document.querySelector('[data-sec="research"]');if(r)r.hidden=srcOff("research")}catch(e){}},0);
  $("welcome").hidden=true;renderHello();
  try{G.token().then(t=>fetch("/api/seen",{method:"POST",headers:{Authorization:"Bearer "+t}})).catch(()=>{})}catch(e){}
  const snap=lsGet();if(snap&&snap.state)restore(snap);
  await loadResearch();renderTasks();renderSetup();loadContacts();
  if(!state.onboarded)onbOpen();
  await refreshAll(false);
  setTimeout(()=>{try{autoWeekly()}catch(e){}try{autoTidy()}catch(e){}},4000);
  {const hm=location.hash.match(/^#thread=(.+)/);if(hm){openThread(decodeURIComponent(hm[1]));history.replaceState(null,"",location.pathname+location.search)}}
  if(!loopOn){loopOn=true;
    /* When to check for new email:
       - the moment you open the app or come back to it
       - every 10 minutes while you're using it (touched, typed or scrolled in the last 5 minutes)
       - every 30 minutes otherwise (open but idle, or in the background) */
    const since=()=>Date.now()-lastRef;
    ["pointerdown","keydown","scroll","touchstart","mousemove"].forEach(ev=>window.addEventListener(ev,()=>{lastAct=Date.now()},{passive:true}));
    setInterval(()=>{const active=!document.hidden&&Date.now()-lastAct<300000;if(since()>=(active?600000:1800000))refreshAll(false)},60000);
    const onOpen=()=>{lastAct=Date.now();if(!document.hidden&&since()>60000)refreshAll(false)};
    document.addEventListener("visibilitychange",onOpen);window.addEventListener("focus",onOpen);window.addEventListener("pageshow",onOpen)}
}
async function connectGoogle(consent){
  const b=$("wBtn"),old="Continue with Google";
  b.disabled=true;b.textContent="Opening Google...";$("wMsg").textContent="";
  try{await G.connect(true,!!consent);await afterConnect()}
  catch(e){$("wMsg").textContent=niceErr(e);showWelcome()}
  b.disabled=!G.configured();b.textContent=old;
}
function setTodoToken(){
  const t=prompt("Paste your Todoist API token. In Todoist: Settings, Integrations, Developer.");
  if(!t||!t.trim())return;
  Connectors.todoist.set(t);todo.state="unknown";loadTodoist();
}
/* connect an AI with the person's own key: checks it with a tiny question before keeping it */
async function connectAI(p,raw){
  const key=String(raw||"").trim(),A=Connectors.ai,name=A.names[p];
  if(!key)return {ok:false,msg:"Paste the key first."};
  if(p==="claude"&&!/^sk-ant-/.test(key))return {ok:false,msg:"Claude keys start with sk-ant-. Copy the key again."};
  if(p==="chatgpt"&&!/^sk-/.test(key))return {ok:false,msg:"OpenAI keys start with sk-. Copy the key again."};
  const had=A.active();
  p==="claude"?A.set(key):A.setOpenAI(key);sample=Connectors.makeSample();
  try{await sample("Reply with the single word OK.",{provider:p,cache:false,noFallback:true})}
  catch(e){p==="claude"?A.clear():A.clearOpenAI();sample=Connectors.makeSample();
    return {ok:false,msg:e&&e.code==="not_granted"?name+" rejected that key. Check it and try again.":e&&e.code==="rate_limited"?name+" is busy. Try again in a minute.":"Couldn't use "+name+" ("+clip((e&&e.message)||"unknown reason",110)+")."}}
  if(!had)A.setChosen(p);
  state.claudeOk=1;persist();renderSetup();renderAI();
  if(threads.length)triage(board&&board.sig||"",true);followups(true);
  return {ok:true};
}
function askKey(p){
  const k=prompt(p==="chatgpt"?"Paste your OpenAI API key (starts with sk-). It is stored on this device only.":"Paste your Claude API key (starts with sk-ant-). It is stored on this device only.");
  if(!k||!k.trim())return;
  connectAI(p,k).then(r=>{if(!r.ok)alert(r.msg)});
}
function removeAiKey(p){p==="chatgpt"?Connectors.ai.clearOpenAI():Connectors.ai.clear();sample=Connectors.makeSample();renderSetup();renderAI();if(threads.length)triage(board&&board.sig||"",true)}
/* every AI the person can pick, and what picking it does */
function aiOptions(){
  const A=Connectors.ai,out=[];
  [["claude","Claude","https://claude.ai/new?q={prompt}"],["chatgpt","ChatGPT","https://chatgpt.com/?q={prompt}"]].forEach(([id,name,url])=>{const ready=A.avail(id);out.push({id,name,kind:"builtin",ready,url,label:name+(ready?" (answers here)":" (opens in a new tab)")})});
  A.links().forEach(l=>out.push({id:"link:"+l.id,name:l.name,kind:"link",ready:false,url:l.url,label:l.name+" (opens in a new tab)"}));
  return out;
}
/* Everything stays on this page. Another site opens only when the person taps a button that says so. */
function outsideOffer(opt,text){
  const box=el("div","");
  box.append(el("p","status",opt.kind==="link"?opt.name+" opens on its own site.":"No AI is connected on this page yet, so it can't answer here. Connect one in Settings (an API key, or the company AI) and answers appear right here."));
  const b=el("button","btn small","Open in "+opt.name+" instead");b.type="button";b.onclick=()=>{box.replaceChildren(el("p","status",openOutside(opt,text)))};box.append(b);
  return box;
}
function openOutside(opt,text){
  const t=String(text);
  if(opt.url.includes("{prompt}")){window.open(opt.url.replace("{prompt}",encodeURIComponent(t.slice(0,1800))),"_blank","noopener");return "Opened "+opt.name+" in a new tab with your question filled in."}
  try{navigator.clipboard.writeText(t)}catch(e){}
  window.open(opt.url,"_blank","noopener");return "Opened "+opt.name+" in a new tab. Your question is copied, so paste it there."
}
const aiPickValue=()=>{const el_=$("thrAIpick");const v=el_&&el_.value;return v==="claude"||v==="chatgpt"?v:undefined};
function renderThrPick(){
  const sel=$("thrAIpick"),ready=aiOptions().filter(o=>o.kind==="builtin"&&o.ready);
  sel.replaceChildren();ready.forEach(o=>sel.append(new Option(o.name,o.id)));
  sel.append(new Option("Free chat (no credit)","free"));
  sel.hidden=false;const a=Connectors.ai.active();if(a)sel.value=a;else sel.value="free";
  setAIButton();
}
function setAIButton(){$("thrAI").textContent=!sample&&chatAI()?"Write it with "+CHAT[chatAI()].name:thr.mode==="new"?(sample?"Write it for me":"Use my note"):"Suggest an answer"}
$("thrAIpick").onchange=()=>{const v=$("thrAIpick").value;if(v==="free"){showFree();return}Connectors.ai.setChosen(v);renderAI()};
/* Settings, Personalise */
const baseTitle=()=>state.pageName&&state.pageName.trim()?state.pageName.trim():""+BR.co+" "+BR.app+"";
function applyPageName(){
  const n=state.pageName&&state.pageName.trim();
  document.querySelector(".hero .eyebrow").textContent=n||""+BR.co+" · "+BR.app+"";
  document.title=baseTitle();try{updateHero()}catch(e){}
}
/* brand from config.js: name, logo and colours (brand.html builds these settings) */
(function(){
  try{
    document.title=baseTitle();const eb=document.querySelector(".hero .eyebrow");if(eb&&!(state.pageName||"").trim())eb.textContent=BR.co+" · "+BR.app;
    const am=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(am)am.content=BR.app;
    if(/^https:\/\/|^[\w.\/-]+\.(png|jpe?g|svg|webp)$/i.test(BR.logo)){const svg=document.querySelector(".hero .logo");if(svg){const im=document.createElement("img");im.src=BR.logo;im.alt="";im.width=26;im.height=26;im.className="logo";im.style.cssText="border-radius:6px;object-fit:contain";svg.replaceWith(im)}}
    const hex=/^#[0-9a-f]{6}$/i;
    let own=false;try{const L=JSON.parse(localStorage.getItem("wyz-look")||"{}");own=!!(L.c1||L.c2||L.cH)}catch(e){}
    if(!own&&(hex.test(BR.c1)||hex.test(BR.c2))){const v=(hex.test(BR.c1)?"--navy:"+BR.c1+";--hero1:"+BR.c1+";":"")+(hex.test(BR.c2)?"--gold:"+BR.c2+";":"");
      const imp=v.replace(/;/g," !important;");const st=document.createElement("style");st.textContent="@media not (prefers-color-scheme: dark){:root:not([data-theme=\"dark\"]){"+imp+"}}:root[data-theme=\"light\"]{"+imp+"}";document.head.append(st);
      const tc=document.querySelector('meta[name="theme-color"]');if(tc&&hex.test(BR.c1))tc.content=BR.c1}
  }catch(e){}
})();
/* version and last update, shown at the very top (set in version.js) */
(function(){
  const v=window.WYZ_VERSION||{},bar=$("verBar");if(!bar||!v.version)return;
  let when="";
  try{const d=new Date(v.updated);if(!isNaN(d))when=d.toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"})+" (Dubai time)"}catch(e){}
  bar.append(el("b","","Version "+v.version),document.createTextNode(v.name?" · "+v.name:""),document.createTextNode(when?" · Updated "+when:""));
  bar.title="You are using version "+v.version+(when?", updated "+when:"")+". If it looks old, refresh the page.";
})();
/* colour palette and light/dark look, saved per device and applied before first paint by a tiny script in index.html */
const PAL_META={ocean:"#104b70",ivory:"#16324e",marina:"#0f6466",dune:"#7a3a22",graphite:"#1f2633"};
function lookNow(){try{return JSON.parse(localStorage.getItem("wyz-look")||"{}")}catch(e){return {}}}
function applyLook(l){
  const r=document.documentElement,p=PAL_META[l.p]?l.p:"ocean";
  r.setAttribute("data-palette",p);
  if(l.m==="light"||l.m==="dark")r.setAttribute("data-theme",l.m);else r.removeAttribute("data-theme");
  document.querySelectorAll("#swatches .swatch,.lookc").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pal===p)));
  $("lookMode").value=l.m==="light"||l.m==="dark"?l.m:"auto";
  const mt=document.querySelector('meta[name="theme-color"]');if(mt)mt.content=PAL_META[p];
  try{applyOwnColours(l)}catch(e){}
}
function applyOwnColours(l){
  let st=document.getElementById("ownCol");if(!st){st=document.createElement("style");st.id="ownCol";document.head.append(st)}
  const any=l.c1||l.c2||l.cH||l.cB||l.cP||l.cT;
  st.textContent=any&&window.ownColCss?window.ownColCss(l):"";
  /* show the colours actually on screen, so the pickers start from the chosen look */
  const cs=getComputedStyle(document.documentElement),VAR={cH:"--hero1",c1:"--navy",c2:"--gold",cB:"--bg",cP:"--panel",cT:"--fg"};
  const hex=v=>{v=String(v||"").trim();return /^#[0-9a-f]{6}$/i.test(v)?v:/^#[0-9a-f]{3}$/i.test(v)?"#"+v.slice(1).split("").map(c=>c+c).join(""):""};
  COLS.forEach(([id,k,def])=>{const e=$(id);if(e)e.value=l[k]||(k==="cH"&&l.c1)||hex(cs.getPropertyValue(VAR[k]))||def});
  try{if(window.wyzLookSync)window.wyzLookSync()}catch(e){}
  const mt=document.querySelector('meta[name="theme-color"]');if(mt&&l.c1)mt.content=l.c1;
}
const COLS=[["colHeader","cH","#104b70"],["colMain","c1","#104b70"],["colAccent","c2","#b8923c"],["colBg","cB","#f4f8fc"],["colPanel","cP","#ffffff"],["colText","cT","#0e2238"]];
COLS.forEach(([id,k])=>{$(id).oninput=()=>saveLook({[k]:$(id).value})});
$("colReset").onclick=()=>{saveLook({c1:"",c2:"",cH:"",cB:"",cP:"",cT:"",p:"ocean"})};
function saveLook(patch){const l=Object.assign({},lookNow(),patch);try{localStorage.setItem("wyz-look",JSON.stringify(l))}catch(e){}applyLook(l)}
document.querySelectorAll("#swatches .swatch").forEach(b=>b.onclick=()=>saveLook({p:b.dataset.pal,c1:"",c2:"",cH:"",cB:"",cP:"",cT:""}));
$("lookMode").onchange=()=>saveLook({m:$("lookMode").value});
applyLook(lookNow());
$("pageName").addEventListener("input",()=>{state.pageName=$("pageName").value;persist();applyPageName()});
$("pageNameReset").onclick=()=>{state.pageName="";$("pageName").value="";persist();applyPageName()};
function renderAI(){
  const A=Connectors.ai,msg=$("aiMsg");
  const st=(p,id,rm)=>{const m=A.mode(p),has=A.avail(p);$(id).textContent=m==="shared"?"Connected through the shared account. Nothing to paste.":m==="key"?"Connected with your own key (stored on this device only).":"Not connected.";$(rm).hidden=m!=="key"};
  st("claude","aiClaudeSt","aiClaudeRm");st("chatgpt","aiGptSt","aiGptRm");
  $("aiProv").value=A.chosen();
  const act=A.active();
  $("aiNote").textContent=!act?"No AI is connected yet. Connect one below.":act!==A.chosen()?A.names[A.chosen()]+" isn't connected, so answers come from "+A.names[act]+" for now.":"";
  const ms=$("modelSel");if(!ms.options.length)A.models.forEach(([id,label])=>ms.append(new Option(label,id)));ms.value=A.getModel();
  const dl=$("omodelList");if(!dl.childNodes.length)A.omodels.forEach(m=>dl.append(new Option(m)));$("omodelIn").value=A.getOModel();
  const ll=$("linkList");ll.replaceChildren();
  A.links().forEach(l=>{const r=el("div","tplrow");r.append(el("b","",l.name),el("span","status",l.url));const b=el("button","btn small ghost","Remove");b.type="button";b.onclick=()=>{A.removeLink(l.id);renderAI()};r.append(b);ll.append(r)});
  const pr=$("linkPresets");if(!pr.childNodes.length)[["Perplexity","https://www.perplexity.ai/search?q={prompt}"],["Microsoft Copilot","https://copilot.microsoft.com/?q={prompt}"],["Grok","https://grok.com/?q={prompt}"],["Gemini","https://gemini.google.com/app"]].forEach(([n,u])=>{const c=el("button","chip","+ "+n);c.type="button";c.onclick=()=>{if(!A.links().some(x=>x.name===n))A.addLink(n,u);renderAI()};pr.append(c)});
  try{renderThrPick()}catch(e){}
  try{renderAIStat()}catch(e){}
}
$("aiProv").onchange=()=>{Connectors.ai.setChosen($("aiProv").value);renderAI();if(threads.length&&sample)triage(board&&board.sig||"",true)};
$("modelSel").onchange=()=>{Connectors.ai.setModel($("modelSel").value)};
$("omodelIn").addEventListener("change",()=>{Connectors.ai.setOModel($("omodelIn").value)});
$("aiClaudeKey").onclick=async()=>{const b=$("aiClaudeKey");b.disabled=true;$("aiMsg").className="status";$("aiMsg").textContent="Checking your key...";const r=await connectAI("claude",$("aiClaudeIn").value);b.disabled=false;$("aiMsg").className="status"+(r.ok?"":" err");$("aiMsg").textContent=r.ok?"Claude is connected.":r.msg;if(r.ok)$("aiClaudeIn").value=""};
$("aiGptKey").onclick=async()=>{const b=$("aiGptKey");b.disabled=true;$("aiMsg").className="status";$("aiMsg").textContent="Checking your key...";const r=await connectAI("chatgpt",$("aiGptIn").value);b.disabled=false;$("aiMsg").className="status"+(r.ok?"":" err");$("aiMsg").textContent=r.ok?"ChatGPT is connected.":r.msg;if(r.ok)$("aiGptIn").value=""};
$("aiClaudeRm").onclick=()=>removeAiKey("claude");$("aiGptRm").onclick=()=>removeAiKey("chatgpt");
$("linkAdd").onclick=()=>{const n=$("linkName").value.trim(),u=$("linkUrl").value.trim();if(!n||!/^https:\/\/\S+\.\S+/.test(u)){$("aiMsg").className="status err";$("aiMsg").textContent="Give it a name and a full web address starting with https://";return}Connectors.ai.addLink(n,u);$("linkName").value="";$("linkUrl").value="";$("aiMsg").className="status";$("aiMsg").textContent=n+" added. It now shows in the Instruct AI list.";renderAI()};
const gateUi=()=>{};
$("wBtn").onclick=()=>connectGoogle();
$("wMs").onclick=async()=>{
  const b=$("wMs");if(!G.msConfigured()){$("wMsg").textContent="Microsoft sign-in isn't switched on yet. Ask the person who invited you, or use Google for now.";return}
  b.disabled=true;b.textContent="Opening Microsoft...";$("wMsg").textContent="";
  try{await G.connectMicrosoft();await afterConnect()}catch(e){$("wMsg").textContent=e&&e.code==="popup_closed"?"The Microsoft window was closed. Tap Continue with Microsoft to try again.":e&&e.code==="popup_failed_to_open"?"Your browser blocked the Microsoft window. Allow pop-ups for this site, then try again.":"Couldn't sign in with Microsoft ("+clip((e&&e.message)||"unknown reason",100)+")."}
  b.disabled=false;b.textContent="Continue with Microsoft";
};
const copyBtn=(id,text,label)=>{$(id).onclick=()=>navigator.clipboard.writeText(text()).then(()=>{$(id).textContent="Copied";setTimeout(()=>$(id).textContent=label,1500)}).catch(()=>{$(id).textContent="Copy by hand"})};
copyBtn("wFamCopy",()=>$("wFamLink").value,"Copy link");
copyBtn("wCopyOrigin",()=>location.origin,"Copy address");
copyBtn("wCopyScopes",()=>G.scopeUrls().join("\n"),"Copy scopes");
$("wSave").onclick=()=>{const v=$("wClient").value.trim();if(!/\.apps\.googleusercontent\.com$/.test(v)){$("wMsg").textContent="That doesn't look like a Client ID. It ends in .apps.googleusercontent.com";return}G.setClientId(v);location.reload()};
$("signOut").onclick=$("manage").onclick=async()=>{await G.signOut();try{localStorage.removeItem("wyz-last-name")}catch(e){}location.reload()};

/* ---------- calendar ---------- */
async function loadCal(){
  if(!mcp)return;
  const d=new Date();d.setHours(0,0,0,0);const e=new Date(d);e.setDate(e.getDate()+8);
  try{
    const r=await mcp.callTool("Google Calendar","list_events",{startTime:ymd(d)+"T00:00:00",endTime:ymd(e)+"T00:00:00",orderBy:"startTime",pageSize:40},{cache:false});
    const p=r.payload||{};events=(p.events||[]).filter(x=>x.status!=="cancelled");
    setConn("Google Calendar","ok");renderCal();
  }catch(err){if(!errToConn("Google Calendar",err)){$("cal").replaceChildren(el("p","status err","Couldn't read your calendar just now: "+(err&&err.message||"try Refresh now")))}else renderCal()}
}
function renderCal(){
  try{updateHero()}catch(e){}
  const host=$("cal");host.replaceChildren();
  if(connState["Google Calendar"]!=="ok"){host.append(el("p","sub","Your meetings show here once Google Calendar is connected."));return}
  const days=Array.from({length:7},(_,n)=>{const d=new Date();d.setDate(d.getDate()+n);return [ymd(d),n===0?"Today":n===1?"Tomorrow":niceDay(ymd(d)),n]});
  days.forEach(([day,lbl,n])=>{
    const list=(events||[]).filter(x=>{const s=x.start&&(x.start.dateTime||x.start.date);return s&&(x.start.date?x.start.date===day:ymd(new Date(s))===day)});
    if(n>1&&!list.length)return;
    host.append(el("div","daylbl",lbl));
    if(!list.length){host.append(el("p","sub","Nothing scheduled."));return}
    list.forEach(x=>{const r=el("div","ev");r.append(el("b","",x.start.date?"All day":fmtTime(x.start.dateTime)+(x.end&&x.end.dateTime?"–"+fmtTime(x.end.dateTime):"")));
      const s=el("span");const a=x.conferenceUrl||x.htmlLink;if(a){const l=el("a","",x.summary||"(No title)");l.href=a;l.target="_blank";l.rel="noopener";l.style.color="var(--fg)";s.append(l)}else s.append(x.summary||"(No title)");
      if(x.location)s.append(el("small",""," · "+x.location));if(x.start&&x.start.dateTime){const pb=el("button","btn small ghost","Prep brief");pb.type="button";pb.style.marginLeft="8px";pb.onclick=()=>openBrief(x);s.append(pb)}if(x.id&&x.start&&x.start.dateTime){const rs=el("button","btn small ghost","Reschedule");rs.type="button";rs.style.marginLeft="8px";rs.onclick=()=>openEvent(x);s.append(rs)}if(x.conferenceUrl){const j=el("a","btn small","Join");j.href=x.conferenceUrl;j.target="_blank";j.rel="noopener";j.style.marginLeft="8px";s.append(j)}
      if(x.start&&x.start.dateTime&&Date.parse(x.start.dateTime)<=Date.now()+30*60000){const has=state.meetNotes&&state.meetNotes[x.id]&&state.meetNotes[x.id].text;const nb=el("button","btn small"+(has?"":" ghost"),has?"📝 Notes ✓":"📝 Notes");nb.type="button";nb.style.marginLeft="8px";nb.onclick=()=>openNotes(x);s.append(nb)}
      r.append(s);host.append(r)});
  });
}

/* ---------- mail ---------- */
const nameOf=s=>{s=String(s||"");const m=s.match(/^\s*"?([^"<]+?)"?\s*</);return m?m[1]:s.replace(/@.*/,"")};
const addrOf=s=>{s=String(s||"");const m=s.match(/<([^>]+)>/);return (m?m[1]:s).trim()};
function slimThread(t){const ms=t.messages||[];const last=ms[ms.length-1]||{};const first=ms[0]||{};
  const mine=(last.labelIds||[]).includes("SENT");const lastOther=[...ms].reverse().find(m=>!(m.labelIds||[]).includes("SENT"))||{};
  const days=last.date?Math.floor((Date.now()-Date.parse(last.date))/86400000):null;
  const myLast=[...ms].reverse().find(m=>(m.labelIds||[]).includes("SENT"));
  return {account:t.account||"",mineAt:myLast&&myLast.date||"",id:t.id,from:mine?(lastOther.sender||first.sender||""):(last.sender||first.sender||""),subject:first.subject||last.subject||"(No subject)",snippet:(last.snippet||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").slice(0,280),date:last.date||first.date||"",count:t.messageCount||ms.length,unread:(last.labelIds||[]).includes("UNREAD"),important:(last.labelIds||[]).includes("IMPORTANT"),url:t.viewUrl||last.viewUrl||"",lastId:last.id||t.id,lastFromMe:mine,lastTo:mine?(last.toRecipients||[]).slice(0,3):[],daysSinceLast:days,auto:(last.labelIds||[]).some(l=>/^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l))}}
async function loadMail(force){
  if(!mcp||busy)return;busy=true;setFresh("load","Reading your inbox and sent mail");
  try{
    const g=await mcp.server("Gmail").catch(e=>{throw e});
    const [inb,snt,snt2]=await Promise.all([
      g.search_threads({query:inboxQuery(),pageSize:30},{cache:false}),
      g.search_threads({query:"in:sent newer_than:3d -to:me",pageSize:40},{cache:false}).catch(()=>({})),
      g.search_threads({query:"in:sent older_than:3d newer_than:21d -to:me",pageSize:40},{cache:false}).catch(()=>({}))
    ]);
    const map=new Map();
    ((inb&&inb.threads)||[]).forEach(t=>map.set(t.id,{t,inInbox:true}));
    [snt,snt2].forEach(x=>((x&&x.threads)||[]).forEach(t=>{if(!map.has(t.id))map.set(t.id,{t,inInbox:false})}));
    /* search previews hold only the oldest messages of a thread: fetch the rest where some are missing */
    const need=[...map.values()].filter(v=>(v.t.messageCount||0)>((v.t.messages||[]).length)).slice(0,30);
    await Promise.all(need.map(async v=>{try{const full=await g.get_thread({threadId:v.t.id,messageFormat:"MINIMAL"},{cache:false});if(full&&Array.isArray(full.messages)&&full.messages.length)v.t=Object.assign({},v.t,{messages:full.messages,messageCount:full.messages.length})}catch(e){}}));
    threads=[...map.values()].map(v=>Object.assign(slimThread(v.t),{inInbox:v.inInbox}));sent=[];
    setConn("Gmail","ok");
    const sig=threads.map(t=>t.id+":"+t.count).join("|");
    if(force||!board||board.sig!==sig||!board.v2)await triage(sig);else{renderBoard();setFresh("ok")}
  }catch(err){
    if(!errToConn("Gmail",err))setFresh("err","Couldn't read Gmail just now: "+(err&&err.message||"try Refresh now"));else setFresh("err","Gmail needs attention: see the setup steps");
    renderBoard();
  }finally{busy=false}
}
async function triage(sig,force){
  if(!threads.length){board={sig,items:[],headline:"Nothing in your inbox from the last 7 days.",at:Date.now()};persist();renderBoard();setFresh("ok");return}
  if(!sample){board=heuristicBoard(sig,true);persist();renderBoard();setFresh("ok");return}
  setFresh("load","Sorting your inbox with Claude");
  const now=new Date();
  const prompt="You are triaging one person's email for their daily run sheet. The person is "+(myName||"the reader")+" at "+BR.co+", "+BR.desc+". Today is "+now.toString()+".\n\n"+
  "Email threads (JSON). inInbox = in the inbox now. lastFromMe = the person sent the last message. lastTo = who they wrote to. daysSinceLast = days since the last message:\n"+JSON.stringify(threads.map(({url,lastId,...r})=>r))+
  "\n\nReturn JSON only: {\"headline\": one or two plain sentences on what matters today, \"items\": [{\"id\": thread id, \"st\": one of reply|follow|work|wait|fyi, \"g\": urgency 1-4 (4 critical), \"title\": short action-style title, \"summary\": one or two sentences saying what it is and what to do, \"when\": short timing note like 'You asked Tue, 3 days ago' }]}.\n"+
  "Statuses: reply = someone wrote and is waiting for this person's answer. work = a task to do that isn't a reply. wait = lastFromMe is true, they asked for something or are expecting an answer, and it's been under 3 days. follow = lastFromMe is true, they're still owed an answer, and it's been 3 days or more, so they should chase (name who to chase in the title). fyi = worth knowing, nothing to do. "+
  "Take follow and wait seriously: look through every lastFromMe thread and include each one where a reply, document, decision or update is still owed to them, even if it's older. Skip lastFromMe threads that were just thanks, confirmations or closing notes, and anything they sent to themselves. "+
  "Leave out pure marketing, newsletters, one-time passcodes and automatic notifications that need nothing. Write plainly, no em dashes. Most urgent first within each status.";
  try{
    const r=await sample.json(prompt,{modelTier:"default",cache:false});
    const items=(r&&r.items||[]).filter(x=>x&&threads.some(t=>t.id===x.id)&&ST[x.st]);
    state.claudeOk=1;board={sig,v2:1,items,headline:String(r&&r.headline||""),at:Date.now()};persist();renderSetup();renderBoard();setFresh("ok");
  }catch(err){
    const c=err&&err.code;
    {const hb=heuristicBoard(sig,false);hb.headline=(c==="not_granted"?"Your Claude API key was rejected, so your inbox is sorted by simple rules. ":c==="rate_limited"?"Claude is busy, so your inbox is sorted by simple rules for now. ":"Couldn't use Claude just now ("+clip((err&&err.message)||"unknown reason",110)+"), so your inbox is sorted by simple rules. ")+hb.headline;board=hb}
    renderBoard();setFresh("ok");
  }
}

/* ---------- simple sorting rules, used when no Claude key is set ---------- */
function heuristicBoard(sig,final){
  const auto=/no-?reply|noreply|do-?not-?reply|notifications?@|newsletter|mailer-daemon|updates?@|news@|marketing|billing@|invoice@|orders?@|alerts?@|security@|support@|account@/i;
  const autoSubj=/dispatched|shipped|out for delivery|your order|order #|receipt|invoice|statement|verification code|one-time|otp|password|security alert|sign-?in|payout|booking confirmation/i;
  const asks=/\?|please|kindly|could you|can you|let me know|confirm|send|share|update|waiting|asap|urgent|quote|follow/i;
  const items=[];let nReply=0,nFollow=0;
  threads.forEach(t=>{
    const who=nameOf(t.lastFromMe?(t.lastTo||[])[0]:t.from)||"them";
    const d=t.daysSinceLast==null?0:t.daysSinceLast;
    if(t.lastFromMe){
      if(d>21||t.auto||!asks.test(t.snippet+" "+t.subject))return;
      if(t.snippet.length<90&&/^(thanks|thank you|ok|okay|noted|great|perfect|received|sounds good)\b/i.test(t.snippet))return;
      const chase=d>=3;if(chase)nFollow++;
      items.push({id:t.id,st:chase?"follow":"wait",g:d>=7?3:2,title:(chase?"Chase ":"Waiting on ")+who+": "+t.subject,summary:"You wrote "+(d===0?"today":d+" day"+(d>1?"s":"")+" ago")+" and there's no reply yet.",when:d===0?"You wrote today":"You wrote "+d+" day"+(d>1?"s":"")+" ago"});
      return}
    if(!t.inInbox)return;
    if(t.auto||auto.test(t.from)||autoSubj.test(t.subject)){items.push({id:t.id,st:"fyi",g:1,title:t.subject,summary:t.snippet});return}
    if(t.unread||t.important){nReply++;items.push({id:t.id,st:"reply",g:t.important&&t.unread?3:2,title:"Reply to "+who+": "+t.subject,summary:t.snippet});return}
    items.push({id:t.id,st:"work",g:1,title:t.subject,summary:t.snippet||"Check whether this needs action."});
  });
  const hl=(nReply?nReply+" email"+(nReply>1?"s":"")+" to reply to":"Nothing waiting for a reply")+(nFollow?" and "+nFollow+" to chase":"")+". Add a Claude API key in the setup steps for smarter sorting.";
  const b={sig,items,headline:hl,at:Date.now()};if(final)b.v2=1;return b;
}
function templateDraft(i,chase){
  const t=tById(i.id)||{};const first=(nameOf(t.lastFromMe?(t.lastTo||[])[0]:t.from)||"").split(" ")[0];const me=(myName||"").split(" ")[0];
  return "Hi "+(first||"there")+",\n\n"+(chase?"Just following up on \""+(t.subject||"my last email")+"\". Could you let me know where this stands? [DETAIL]":"Thanks for your message about \""+(t.subject||"this")+"\". [DETAIL]")+(sigText()?"":"\n\nBest,\n"+me);
}

/* ---------- snooze: tomorrow, 3 days, 1 week or a date you pick ---------- */
const niceDay=s=>{try{return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}catch(e){return s}};
function snoozeUntil(id,days,date){let v=date;if(!v){const d=new Date();d.setDate(d.getDate()+days);v=ymd(d)}state.snooze[id]=v;persist();renderBoard()}
function snoozeDrop(id,after){
  const cur=state.snooze[id],active=cur&&cur>todayKey();
  const d=el("details","askdd");const sm=el("summary","",active?"Snoozed to "+niceDay(cur)+" ▾":"Snooze ▾");sm.title="Hide this until later";d.append(sm);
  const m=el("div","askmenu");
  const add=(t,fn)=>{const b=el("button","",t);b.type="button";b.onclick=()=>{d.open=false;fn();if(after)after()};m.append(b)};
  add("Tomorrow",()=>snoozeUntil(id,1));add("In 3 days",()=>snoozeUntil(id,3));add("In 1 week",()=>snoozeUntil(id,7));
  add(state.repeat&&state.repeat[id]?"Stop repeating weekly":"Repeat weekly",()=>{state.repeat=state.repeat||{};if(state.repeat[id])delete state.repeat[id];else state.repeat[id]=1;persist();renderBoard()});
  if(sample){
    const sb=el("button","","✨ Suggest a time");sb.type="button";
    sb.onclick=async()=>{
      sb.disabled=true;sb.textContent="Thinking...";
      try{
        const busy={};(events||[]).forEach(e=>{const s=e.start&&(e.start.date||(e.start.dateTime||"").slice(0,10));if(s)busy[s]=(busy[s]||0)+1});
        const days=Array.from({length:10},(_,n)=>{const x=new Date();x.setDate(x.getDate()+n+1);return ymd(x)+" "+x.toLocaleDateString("en-GB",{weekday:"short"})+(busy[ymd(x)]?" ("+busy[ymd(x)]+" meetings)":"")}).join(", ");
        const txt=await threadText(id);
        const r=await creditFallback(prov=>sample.json("Pick the best day to bring this email back to "+(myName||"me")+" at "+BR.co+". Today is "+new Date().toDateString()+". Days ahead: "+days+". Rules: if the email names a date or deadline, pick the day before it or the same morning. If it waits on someone else, pick the day they should have answered. Prefer days with few meetings. Never pick today. Do not pick a weekend (Friday and Saturday are the weekend in Dubai, prefer Sunday to Thursday) unless the email says so.\n\nThe email:\n"+String(txt).slice(0,3000)+"\n\nReturn JSON only: {\"date\":\"YYYY-MM-DD\",\"why\":\"one short reason, 12 words or fewer\"}",{cache:false,provider:prov}));
        const when=String(r.date||"");const max=new Date();max.setDate(max.getDate()+60);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(when)||when<=todayKey()||when>ymd(max))throw new Error("no sensible date");
        const ok=el("button","","Snooze to "+niceDay(when)+(r.why?", "+clip(String(r.why),60):""));ok.type="button";ok.title="Snooze to "+niceDay(when);
        ok.onclick=()=>{d.open=false;snoozeUntil(id,0,when);if(after)after()};
        sb.replaceWith(ok);
      }catch(e){sb.disabled=false;sb.textContent="Couldn't suggest a time. Try again"}
    };
    m.append(sb);
  }
  const row=el("div","snzrow");const dt=el("input","in");dt.type="date";const t=new Date();t.setDate(t.getDate()+1);dt.min=ymd(t);dt.setAttribute("aria-label","Pick a date");
  const go=el("button","","Set");go.type="button";go.onclick=()=>{if(!dt.value)return;d.open=false;snoozeUntil(id,0,dt.value);if(after)after()};
  row.append(dt,go);m.append(row);
  if(active)add("Wake it up now",()=>{delete state.snooze[id];persist();renderBoard()});
  d.append(m);return d;
}

/* ---------- learn their tone from recent sent mail ---------- */
let toneP=null;
function toneExamples(){
  if(toneP)return toneP;
  toneP=(async()=>{try{
    const g=await mcp.server("Gmail");const r=await g.search_threads({query:"in:sent newer_than:60d -to:me",pageSize:6});const out=[];
    for(const th of (r.threads||[]).slice(0,5)){
      const f=await g.get_thread({threadId:th.id,messageFormat:"PLAIN_TEXT"});
      const mine=(f.messages||[]).filter(m=>addrOf(m.sender).toLowerCase()===myAddr()).pop();
      if(mine){const b=String(mine.plaintextBody||"").split(/\nOn .{5,90} wrote:|\n-{2,} ?Forwarded/)[0].split("\n").filter(l=>!l.startsWith(">")).join("\n").trim().slice(0,500);if(b.length>30)out.push(b)}
    }
    if(sample&&(!state.styleNote||Date.now()-(state.styleAt||0)>30*86400000)&&!state.styleOwn)learnStyle(true).catch(()=>{});
    const note=state.styleNote?"Write in their own style. How they write: "+state.styleNote+"\n\n":"";
    return out.length?note+"Match the voice, warmth and length of how they usually write. Examples of their own emails:\n\n"+out.map((x,i)=>"Example "+(i+1)+":\n"+x).join("\n\n"):note;
  }catch(e){return ""}})();
  return toneP;
}
/* Learns how the person writes from up to 12 of their sent emails, and keeps a short style note used by every draft. */
async function learnStyle(quiet){
  if(!sample||!mcp)throw new Error("Connect Claude or ChatGPT first");
  if(learnStyle.busy)return learnStyle.busy;
  learnStyle.busy=(async()=>{try{
    const r=await mcp.callTool("Gmail","search_threads",{query:"in:sent newer_than:120d -to:me",pageSize:15},{cache:false});const out=[];
    for(const th of ((r.payload&&r.payload.threads)||[]).slice(0,12)){
      try{const f=await mcp.callTool("Gmail","get_thread",{threadId:th.id,messageFormat:"PLAIN_TEXT"},{cache:false});
        const mine=((f.payload&&f.payload.messages)||[]).filter(m=>addrOf(m.sender).toLowerCase()===myAddr()).pop();
        if(mine){const b=String(mine.plaintextBody||"").split(/\nOn .{5,90} wrote:|\n-{2,} ?Forwarded/)[0].split("\n").filter(l=>!l.startsWith(">")).join("\n").trim().slice(0,700);if(b.length>30)out.push(b)}}catch(e){}
    }
    if(out.length<3)throw new Error("not enough sent emails to learn from yet");
    const a=await creditFallback(prov=>sample("Here are emails one person wrote. Describe how they write, in at most 6 short lines a writer could follow: how they greet, how long their emails are, how formal or warm they are, how they sign off, phrases they often use, and when they use Arabic or English. Describe the style only, never the content or any names, numbers or private details. Plain English, no em dashes.\n\n"+out.map((x,i)=>"Email "+(i+1)+":\n"+x).join("\n\n"),{cache:false,provider:prov}));
    const t=String(a.text||"").trim().slice(0,900);if(!t)throw new Error("the AI sent back nothing");
    state.styleNote=t;state.styleAt=Date.now();state.styleOwn=false;persist();toneP=null;
    if($("styleNote"))$("styleNote").value=t;if($("styleSt"))$("styleSt").textContent="Learned from "+out.length+" of your sent emails, "+fmtWhen(Date.now())+".";
    return t;
  }finally{learnStyle.busy=null}})();
  return learnStyle.busy;
}
const gcalLink=ev=>{const f=v=>{let x=String(v||"").replace(/[-:]/g,"").slice(0,15);if(x.length===13)x+="00";return x};return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(ev.title||"Meeting")+"&dates="+f(ev.start)+"/"+f(ev.end||ev.start)+"&ctz=Asia%2FDubai"+(ev.location?"&location="+encodeURIComponent(ev.location):"")};

/* ---------- instruct AI on an email: tell it what to do, see the answer here ---------- */
const msgCache={};
const threadBlock=msgs=>msgs.slice(-6).map(x=>"From: "+(x.sender||"")+"\nDate: "+(x.date||"")+"\n"+String(x.plaintextBody||x.snippet||"").slice(0,3000)).join("\n\n---\n\n");
async function threadText(id){
  if(msgCache[id])return msgCache[id];
  let msgs=[];try{const r=await mcp.callTool("Gmail","get_thread",{threadId:id,messageFormat:"PLAIN_TEXT"},{cache:false});msgs=(r.payload&&r.payload.messages)||[]}catch(e){}
  return msgCache[id]=threadBlock(msgs)||((tById(id)||{}).snippet||"");
}
function buildInstruct(i,box,getText,useReply){
  box.replaceChildren();let cached="";Promise.resolve(getText()).then(t=>cached=t||"").catch(()=>{});
  const inp=el("textarea");inp.placeholder="Tell it what to do, for example: reply yes and suggest Tuesday at 10";inp.setAttribute("aria-label","Instruction for AI");
  const out=el("div","instrout"),chips=el("div","chips");
  const go=el("button","btn small solid","Do it");go.type="button";
  const pick=el("select","in");pick.setAttribute("aria-label","Which AI should answer");pick.style.flex="0 1 240px";
  aiOptions().forEach(o=>pick.append(new Option(o.label,o.id)));pick.value=Connectors.ai.active()||"claude";
  pick.onchange=()=>{const o=aiOptions().find(x=>x.id===pick.value);if(o&&o.kind==="builtin"&&o.ready){Connectors.ai.setChosen(o.id);renderAI()}};
  const result=r=>{
    out.replaceChildren();
    out.append(el("div","ans",String(r.answer||"Done.")));
    const acts=el("div","acts");
    if(r.reply&&String(r.reply).trim()){const b=el("button","btn small solid","Use as my reply");b.type="button";b.onclick=()=>useReply(String(r.reply));acts.append(b)}
    (Array.isArray(r.tasks)?r.tasks:[]).slice(0,3).forEach(t=>{if(!t||!t.title)return;const b=el("button","btn small","Add task: "+clip(t.title,40)+(t.due?" ("+t.due+")":""));b.type="button";b.onclick=()=>{addTask(String(t.title),"Email from "+nameOf((tById(i.id)||{}).from),/^\d{4}-\d{2}-\d{2}$/.test(t.due||"")?t.due:"");b.textContent="Task added";b.disabled=true};acts.append(b)});
    const n=Math.round(+r.snooze_days||0);
    if(n>0&&n<=60){const b=el("button","btn small","Snooze "+n+" day"+(n>1?"s":""));b.type="button";b.onclick=()=>snoozeUntil(i.id,n);acts.append(b)}
    if(r.event&&r.event.title&&r.event.start){const l=el("button","btn small","Add to calendar: "+clip(r.event.title,30));l.type="button";l.onclick=async()=>{l.disabled=true;l.textContent="Adding...";
      const fix=v=>String(v||"").slice(0,16),st=fix(r.event.start),en=fix(r.event.end)||(()=>{const d=new Date(st);d.setMinutes(d.getMinutes()+30);return ymd(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")})();
      try{await mcp.callTool("Google Calendar","create_event",{title:String(r.event.title),start:st,end:en,account:/^a(\d+)~/.test(i.id)?+i.id.match(/^a(\d+)~/)[1]:undefined});l.textContent="Added to your calendar";try{refreshAll(true)}catch(e){}}
      catch(e){l.disabled=false;l.textContent="Couldn't add it. Tap to try again"}};acts.append(l)}
    const c=el("button","btn small ghost","Copy answer");c.type="button";c.onclick=()=>navigator.clipboard.writeText(String(r.answer||"")).then(()=>c.textContent="Copied").catch(()=>c.textContent="Select the text to copy");acts.append(c);
    out.append(acts);
  };
  async function run(){
    const q=inp.value.trim();if(!q){inp.focus();return}
    let opt=aiOptions().find(o=>o.id===pick.value)||aiOptions()[0];
    if(opt.kind==="link"||!opt.ready){
      const here=aiOptions().find(o=>o.kind==="builtin"&&o.ready);
      if(here&&sample)opt=here;
      else{const txt0=cached||await getText();cached=txt0||"";out.replaceChildren(outsideOffer(opt,q+"\n\nEmail thread:\n"+cached.slice(0,2500)));return}}
    go.disabled=true;out.replaceChildren(el("p","status","Thinking..."));
    try{
      const txt=cached||await getText();cached=txt||"";
      const first=(myName||"").split(" ")[0];
      const tone=/reply|draft|write|answer|respond/i.test(q)?await toneExamples():"";
      const r=await sample.json("You are the personal assistant of "+(myName||"a manager")+" at "+BR.co+", "+BR.desc+". Today is "+new Date().toDateString()+".\n\nEmail thread (latest last):\n"+cached+"\n\nTheir instruction: "+q+"\n\nReturn JSON only: {\"answer\": a short plain answer, max 120 words, no em dashes, \"reply\": a ready-to-send reply email body in their voice (contractions, "+(sigText()?"no sign-off or name, their signature is added automatically":"signed with the first name"+(first?" "+first:""))+") or an empty string when no reply is needed, \"tasks\": [ {\"title\": short, \"due\": \"YYYY-MM-DD\" or \"\"} ] only when they ask for a task or one is clearly needed, \"snooze_days\": a whole number of days to snooze this email, or 0, \"event\": null, or {\"title\", \"start\": \"YYYY-MM-DDTHH:MM\", \"end\": \"YYYY-MM-DDTHH:MM\", \"location\"} only when the email proposes or confirms a meeting }."+(tone?"\n\n"+tone:""),{provider:opt.id,cache:false});
      result(r||{});
    }catch(e){out.replaceChildren(el("p","status err","Couldn't do that ("+clip((e&&e.message)||"unknown reason",110)+")."))}
    go.disabled=false;
  }
  [["Summarize","Summarize this in three short lines."],["Draft a reply","Write a short, warm reply."],["What should I do?","Tell me the best next step and why."],["Make it a task","Turn this into a task, with a due date if one is mentioned."]].forEach(([l,v])=>{const c=el("button","chip",l);c.type="button";c.onclick=()=>{inp.value=v;run()};chips.append(c)});
  go.onclick=run;
  const row=el("div","acts");row.append(pick,go);
  box.append(inp,chips,row,out);inp.focus();
}
function toggleInstruct(i,box){
  if(box.childNodes.length){box.replaceChildren();return}
  buildInstruct(i,box,()=>threadText(i.id),text=>openThread(i.id,{item:i,text}));
}

/* ---------- thread view: read the whole conversation and reply from the page ---------- */
let found=[];
let thr={id:"",msgs:[],item:null,armed:0,done:false,mode:"reply",files:[]};
const addrs=l=>(l||[]).map(addrOf).filter(Boolean);
const myAddr=()=>String(email||"").toLowerCase();
function lastMsg(){return thr.msgs[thr.msgs.length-1]||{}}
function replyTargets(all){
  const last=lastMsg(),mine=myAddr();
  const fromMe=addrOf(last.sender).toLowerCase()===mine;
  const to=fromMe?addrs(last.toRecipients):[addrOf(last.replyTo||last.sender)];
  const cc=all?addrs(last.ccRecipients).concat(fromMe?[]:addrs(last.toRecipients)):[];
  const seen=new Set([mine]);
  const clean=a=>a.filter(x=>x&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase()));
  const t=clean(to);
  return {to:t.length?t:to,cc:clean(cc)};
}
function quoteOf(m){
  const when=m.date?new Date(m.date).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"";
  const body=String(m.plaintextBody||m.snippet||"").split("\n").slice(0,40).join("\n").slice(0,3000).split("\n").map(l=>"> "+l).join("\n");
  return "\n\nOn "+when+", "+(nameOf(m.sender)||m.sender)+" wrote:\n"+body;
}
function fillTargets(){
  const all=$("thrAll").checked,t=replyTargets(all);$("thrAllSel").value=all?"all":"sender";
  const lc=x=>addrOf(x).toLowerCase(),auto=new Set((thr.autoCc||[]).map(lc));
  const extra=String($("thrCc").value||"").split(/[,;]/).map(x=>x.trim()).filter(x=>x&&/@/.test(x)&&!auto.has(lc(x)));
  const have=new Set(t.cc.map(lc).concat(t.to.map(lc)));
  thr.autoCc=t.cc.slice();
  $("thrTo").value=t.to.join(", ");$("thrCc").value=t.cc.concat(extra.filter(x=>!have.has(lc(x)))).join(", ");$("thrCcWrap").hidden=false;
}
/* Real email view: HTML mail goes in a locked iframe (no scripts, links open in a new tab), plain text gets clickable links. */
function linkify(txt){
  const out=document.createDocumentFragment();let last=0;const re=/https?:\/\/[^\s<>"')\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;let m;txt=String(txt);
  while((m=re.exec(txt))){
    let u=m[0];const tail=u.match(/[.,;:!?]+$/);if(tail){u=u.slice(0,-tail[0].length)}
    if(m.index>last)out.append(document.createTextNode(txt.slice(last,m.index)));
    const a=el("a","lnk");const mail=!/^https?:/.test(u);a.href=mail?"mailto:"+u:u;a.target="_blank";a.rel="noopener noreferrer";
    a.textContent=mail?u:u.replace(/^https?:\/\/(www\.)?/,"").replace(/^([^/?#]+)([/?#].*)?$/,(x,h,r)=>h+(r&&r.length>1?(r.length>22?r.slice(0,20)+"…":r):""));
    a.title=u;out.append(a);last=m.index+u.length;re.lastIndex=last;
  }
  if(last<txt.length)out.append(document.createTextNode(txt.slice(last)));
  return out;
}
function splitQuoted(txt){
  const lines=String(txt).split("\n");let cut=-1;
  for(let i=0;i<lines.length;i++){
    if(/^\s*(On .{5,120}wrote:|-{2,}\s*Original Message\s*-{2,}|-{3,}\s*Forwarded message)/i.test(lines[i])||(/^>/.test(lines[i])&&i>0&&lines.slice(i).filter(x=>x.trim()).every(x=>/^\s*>/.test(x)))){cut=i;break}
  }
  if(cut<=0)return {main:txt,quoted:""};
  return {main:lines.slice(0,cut).join("\n").trimEnd(),quoted:lines.slice(cut).join("\n")};
}
function cleanHtml(html,cid,images){
  const doc=new DOMParser().parseFromString(String(html),"text/html");
  doc.querySelectorAll("script,iframe,frame,frameset,object,embed,applet,form,meta,link,base,noscript,audio,video,portal,dialog").forEach(n=>n.remove());
  let blocked=0;
  doc.querySelectorAll("*").forEach(n=>{
    [...n.attributes].forEach(at=>{
      const k=at.name.toLowerCase(),v=at.value;
      if(k.startsWith("on")||k==="srcdoc"||k==="formaction"||k==="ping"){n.removeAttribute(at.name);return}
      if((k==="href"||k==="src"||k==="background"||k==="action"||k==="xlink:href"||k==="poster")&&/^\s*(javascript|vbscript|data:text|data:application)/i.test(v))n.removeAttribute(at.name);
    });
    if(n.tagName==="A"){
      const h=n.getAttribute("href")||"";
      if(/^(https?:|mailto:|tel:)/i.test(h)){n.target="_blank";n.rel="noopener noreferrer"}else if(!/^#/.test(h))n.removeAttribute("href");
    }
    if(n.tagName==="IMG"){
      const src=n.getAttribute("src")||"";
      if(/^cid:/i.test(src)){const d=cid[src.slice(4).replace(/[<>]/g,"")];if(d)n.setAttribute("src",d);else n.removeAttribute("src")}
      else if(/^https?:/i.test(src)){if(!images){n.setAttribute("data-src",src);n.removeAttribute("src");n.removeAttribute("srcset");blocked++}}
      else if(!/^data:image\//i.test(src))n.removeAttribute("src");
    }
    const st=n.getAttribute&&n.getAttribute("style");
    if(st){
      if(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(st))n.removeAttribute("style");
      else if(!images&&/url\s*\(/i.test(st)&&!/url\s*\(\s*['"]?data:image/i.test(st)){n.setAttribute("style",st.replace(/url\s*\([^)]*\)/gi,"none"));blocked++}
    }
  });
  const css=[...doc.querySelectorAll("style")].map(x=>{const t=x.textContent;x.remove();return images?t:t.replace(/url\s*\((?!\s*['"]?data:image)[^)]*\)/gi,"none")}).join("\n").replace(/@import[^;]*;?/gi,"");
  return {body:doc.body?doc.body.innerHTML:"",css,blocked};
}
const B64U=s=>String(s).replace(/-/g,"+").replace(/_/g,"/");
async function fetchFile(m,f){
  if(f.data)return B64U(f.data);
  const r=await mcp.callTool("Gmail","get_attachment",{messageId:m.id,attachmentId:f.id},{cache:false});
  return B64U((r&&(r.data||(r.payload&&r.payload.data)))||"");
}
async function inlineImages(m){
  const out={};const list=(m.files||[]).filter(f=>f.cid&&/^image\//.test(f.type)&&(!f.size||f.size<1500000)).slice(0,12);
  await Promise.all(list.map(async f=>{try{const d=await fetchFile(m,f);if(d)out[f.cid]="data:"+f.type+";base64,"+d}catch(e){}}));
  return out;
}
function mailFrame(m,box,cidMap,images){
  const c=cleanHtml(m.html,cidMap,images);
  const csp="default-src 'none'; img-src data:"+(images?" https: http:":"")+"; style-src 'unsafe-inline'; font-src data:";
  const fr=document.createElement("iframe");fr.className="mailframe";fr.title="Email from "+(nameOf(m.sender)||m.sender||"");
  fr.setAttribute("sandbox","allow-same-origin allow-popups allow-popups-to-escape-sandbox");fr.setAttribute("referrerpolicy","no-referrer");fr.loading="eager";
  fr.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}body{padding:14px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#202124;background:#fff;overflow-wrap:anywhere;overflow-x:auto}img{max-width:100%;height:auto}a{color:#1a56c4}table{max-width:100%}pre{white-space:pre-wrap}</style><style>'+c.css.replace(/<\/style/gi,"")+'</style></head><body>'+c.body+'</body></html>';
  const fit=()=>{try{const d=fr.contentDocument;if(d&&d.documentElement)fr.style.height=Math.min(Math.max(d.documentElement.scrollHeight,60),2400)+"px"}catch(e){}};
  fr.onload=()=>{fit();setTimeout(fit,300);setTimeout(fit,1200);try{fr.contentDocument.querySelectorAll("img").forEach(i=>i.addEventListener("load",fit))}catch(e){}};
  box.replaceChildren(fr);
  return c.blocked;
}
function msgBody(m,d){
  const box=el("div","mailbody");
  const files=(m.files||[]).filter(f=>f.name&&!(f.cid&&/^image\//.test(f.type)&&m.html&&m.html.includes(f.cid)));
  const draw=async()=>{
    box.replaceChildren(el("p","status","Opening the email..."));
    if(m.html&&m.html.trim()){
      const cidMap=m._cid||(m._cid=await inlineImages(m));
      const holder=el("div"),bar=el("div","mailbar");
      const blocked=mailFrame(m,holder,cidMap,!!m._img);
      box.replaceChildren(bar,holder);
      if(blocked&&!m._img){
        bar.append(document.createTextNode("Pictures are hidden to protect your privacy. "));
        const b=el("button","btn small","Show pictures");b.type="button";b.onclick=()=>{m._img=true;draw()};bar.append(b);
      }
      const t=el("button","btn small ghost","Show as plain text");t.type="button";t.onclick=()=>{m._plain=true;draw()};
      if(m.plaintextBody)bar.append(t);
      if(m._plain)return plain();
      return;
    }
    plain();
  };
  const plain=()=>{
    const {main,quoted}=splitQuoted(String(m.plaintextBody||m.snippet||"(No text in this message)").trim());
    const t=el("div","mailtext");t.append(linkify(main||"(No new text in this message)"));
    box.replaceChildren(t);
    if(m._plain){const bar=el("div","mailbar");const b=el("button","btn small ghost","Show the designed email");b.type="button";b.onclick=()=>{m._plain=false;draw()};bar.append(b);box.prepend(bar)}
    if(quoted){
      const q=el("details");q.append(el("summary","meta","Show earlier text in this message"));
      const qt=el("div","mailtext");qt.style.opacity=".75";qt.append(linkify(quoted));q.append(qt);box.append(q);
    }
  };
  let drawn=false;
  const go=()=>{if(drawn)return;drawn=true;draw()};
  d.addEventListener("toggle",()=>{if(d.open)go()});
  if(d.open)go();
  const wrap=el("div");wrap.append(box);
  if(files.length||(m.attachments||[]).length){
    const row=el("div","mailfiles");
    (files.length?files:(m.attachments||[]).map(n=>({name:n}))).forEach(f=>{
      const b=el("button","chip","📎 "+f.name+(f.size?" · "+(f.size>1048576?(f.size/1048576).toFixed(1)+" MB":Math.max(1,Math.round(f.size/1024))+" KB"):""));b.type="button";
      if(!f.id&&!f.data){b.disabled=true;b.title="Open in Gmail to download"}
      b.onclick=async()=>{
        const old=b.textContent;b.textContent="Downloading...";
        try{
          const bin=atob(await fetchFile(m,f));const u8=Uint8Array.from(bin,c=>c.charCodeAt(0));
          const url=URL.createObjectURL(new Blob([u8],{type:f.type||"application/octet-stream"}));
          const a=document.createElement("a");a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);b.textContent=old;
        }catch(e){b.textContent="Couldn't download, open in Gmail"}
      };
      row.append(b);
      if((f.id||f.data)&&fileKind(f.type,f.name)){const q=el("button","chip","Ask AI about it");q.type="button";q.onclick=()=>openFileAI(f.name,()=>attachmentLoader(m,f));row.append(q)}
      if(f.id||f.data){const sv=el("button","chip","Save to Drive");sv.type="button";sv.onclick=()=>saveToDrive(m,f,sv);row.append(sv)}
    });
    if(files.filter(f=>f.id||f.data).length>1){const all=el("button","chip","Save all to Drive");all.type="button";all.onclick=async()=>{all.disabled=true;let n=0;for(const b of [...row.querySelectorAll("button")].filter(x=>x.textContent==="Save to Drive")){await b.onclick();n++}all.textContent="Saved "+n+" file"+(n===1?"":"s")+" to Drive"};row.append(all)}
    wrap.append(row);
  }
  return wrap;
}
function renderThread(){
  const body=$("thrBody");body.replaceChildren();
  if(!thr.msgs.length){body.append(el("p","status err","Couldn't load this conversation. Try Open in Gmail."));return}
  const all=el("div","mailbar");
  if(thr.msgs.length>2){
    const ex=el("button","btn small ghost","Open all "+thr.msgs.length+" messages");ex.type="button";
    let open=false;ex.onclick=()=>{open=!open;body.querySelectorAll("details.msg").forEach(x=>{x.open=open});ex.textContent=open?"Collapse older messages":"Open all "+thr.msgs.length+" messages"};
    all.append(ex);body.append(all);
  }
  thr.msgs.forEach((m,ix)=>{
    const d=el("details","msg");if(ix>=thr.msgs.length-1||thr.msgs.length<=2)d.open=true;
    const s=el("summary");s.append(document.createTextNode((nameOf(m.sender)||m.sender||"Unknown")+" "),el("span","meta","· "+(m.date?fmtWhen(m.date):"")+(addrOf(m.sender).toLowerCase()===myAddr()?" · you":"")));
    if(ix<thr.msgs.length-1)s.append(el("span","meta"," · "+clip(String(m.snippet||"").replace(/\s+/g," "),70)));
    d.append(s);
    const to=(m.toRecipients||[]).map(x=>nameOf(x)||x).join(", ");
    {const line=el("div","meta");line.append(document.createTextNode((to?"To: "+to+((m.ccRecipients||[]).length?" · Cc: "+m.ccRecipients.map(x=>nameOf(x)||x).join(", "):"")+" · ":"")));const pb=el("button","lnk","About "+(nameOf(m.sender)||"sender"));pb.type="button";pb.style.cssText="background:none;border:0;padding:0;font:inherit;color:var(--navy);cursor:pointer;text-decoration:underline";pb.onclick=e=>{e.preventDefault();openPerson(m.sender)};line.append(pb);d.append(line)}
    d.append(msgBody(m,d));
    body.append(d);
  });
}
function threadNav(){
  const ids=[];const add=l=>(l||[]).forEach(x=>{if(x&&x.id&&!ids.includes(x.id))ids.push(x.id)});
  const board=typeof allItems==="function"?allItems():[];
  const inBoard=board.some(x=>x.id===thr.id);
  add(inBoard?board:found);if(!ids.includes(thr.id)){add(found);add(board)}
  const ix=ids.indexOf(thr.id);
  $("thrPos").textContent=ix>=0&&ids.length>1?(ix+1)+" of "+ids.length:"";
  $("thrPrev").disabled=ix<=0;$("thrNext").disabled=ix<0||ix>=ids.length-1;
  $("thrPrev").hidden=$("thrNext").hidden=ids.length<2||thr.mode==="new";
  return {ids,ix};
}
function thrStep(d){const {ids,ix}=threadNav(),n=ids[ix+d];if(n)openThread(n)}
$("thrPrev").onclick=()=>thrStep(-1);$("thrNext").onclick=()=>thrStep(1);
document.addEventListener("keydown",e=>{
  if($("thr").hidden||thr.mode==="new")return;
  const t=e.target&&e.target.tagName;if(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||(e.target&&e.target.isContentEditable))return;
  if(e.key==="ArrowLeft"&&!$("thrPrev").disabled)thrStep(-1);
  if(e.key==="ArrowRight"&&!$("thrNext").disabled)thrStep(1);
});
async function openThread(id,o){
  if(thr.counting){thrNote("Your email is about to be sent. Press Undo to stop it, or wait a few seconds.");return}
  o=o||{};const t=tById(id)||{};
  if(thr.counting&&!thr.bg){thr.bg=true;sendBar(thr,"tick")}
  thr={id,msgs:[],item:o.item||{id,st:"reply",title:t.subject||"",summary:t.snippet||""},armed:0,done:false,mode:"reply",files:[],autoCc:[]};$("thrCc").value="";
  setMode("reply");renderTplSelect();syncRuleBtns();renderThrPick();$("thrFiles").value="";$("thrFileList").textContent="";$("thrArchive").disabled=false;$("thrArchive").textContent="Archive";$("thrRemind").value="3";
  $("thr").hidden=false;$("thrTitle").textContent=(t.subject||"Conversation")+(t.account?" · in "+t.account:"");
  $("thrGmail").href=t.url||"https://mail.google.com/";
  $("thrSnooze").replaceChildren(snoozeDrop(id,thrClose));$("thrAIbox").hidden=true;$("thrAIbox").open=false;
  $("thrBody").replaceChildren(el("p","sub","Loading the conversation..."));drawTools();
  try{if(voice.on){voice.on=false;rec.abort()}}catch(e){}micState(false);$("thrCheckOut").hidden=true;setSendButtons(false);$("thrExact").hidden=true;
  $("thrFree").hidden=true;$("thrPaste").value="";$("thrReply").hidden=true;$("thrSt").textContent="";$("thrSt").className="status";$("thrText").value="";$("thrAll").checked=false;
  ["thrSend","thrSave","thrText","thrTo","thrCc"].forEach(k=>$(k).disabled=false);
  $("thrSend").textContent="Send";
  try{const r=await mcp.callTool("Gmail","get_thread",{threadId:id,messageFormat:"PLAIN_TEXT"},{cache:false});thr.msgs=(r.payload&&r.payload.messages)||[]}catch(e){thr.msgs=[]}
  thr.sug={state:"idle"};renderThread();threadNav();thrMore();drawQuick();drawSuggest();drawTools();drawThreadSummary();
  if(thr.msgs.length&&(lastMsg().labelIds||[]).includes("UNREAD"))mcp.callTool("Gmail","mark_read",{threadId:id}).catch(()=>{});
  if(thr.msgs.length){
    $("thrReply").hidden=false;fillTargets();syncRuleBtns();
    $("thrAIbox").hidden=false;
    buildInstruct(thr.item,$("thrInstruct"),()=>threadBlock(thr.msgs),text=>{$("thrText").value=text;$("thrSt").className="status";$("thrSt").textContent="Edit it, then send it or save it as a draft.";$("thrText").focus()});
    if(o.text){$("thrText").value=o.text;$("thrSt").textContent="Edit it, then send it or save it as a draft."}
    else if(o.draft)thrDraft();
    else if(state.autoSuggest!==false&&sample&&sugWanted())suggestReply({})
  }
  $("thr").querySelector(".pad").scrollTop=0;
}
/* A suggested answer, shown in the thread like a message, written by the AI you choose */
const sugCache={};
const sugKey=()=>thr.id+"|"+(lastMsg().id||"");
function sugWanted(){
  const l=lastMsg(),mine=addrOf(l.sender).toLowerCase()===myAddr();
  if(mine)return !!(state.chase&&state.chase[thr.id])||thr.item&&(thr.item.st==="follow"||thr.item.st==="wait");
  if(l.unsub||/no-?reply|donotreply|mailer-daemon|notifications?@/i.test(l.sender||""))return false;
  return true;
}
function drawSuggest(){
  const body=$("thrBody");let c=$("thrSug");if(c)c.remove();
  if(thr.mode!=="reply"||!thr.msgs.length)return;
  const S=thr.sug||{state:"idle"};if(S.dismissed)return;
  c=el("div","suggest");c.id="thrSug";
  const chase=thrChase();
  const head=el("div","sghead");head.append(el("b","","✨ "+(chase?"Suggested follow-up":"Suggested reply")));
  head.append(el("span","meta",S.state==="loading"?"Writing with "+(Connectors.ai.names[S.prov]||"your AI")+"...":S.state==="ready"?"Written by "+(Connectors.ai.names[S.prov]||"your AI")+(S.note?". "+S.note:""):""));
  const x=el("button","btn small ghost","Hide");x.type="button";x.onclick=()=>{S.dismissed=true;drawSuggest()};head.append(x);c.append(head);
  if(S.state==="ready"){
    const t=el("div","mailtext");t.textContent=S.text;c.append(t);
    const a=el("div","acts");
    const use=el("button","btn small solid","Use this reply");use.type="button";use.onclick=()=>{$("thrText").value=S.text;const st=$("thrSt");st.className="status";st.textContent="Edit it, then send it or save it as a draft.";$("thrReply").scrollIntoView({block:"nearest"});$("thrText").focus()};
    const cp=el("button","btn small ghost","Copy");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(S.text).then(()=>cp.textContent="Copied").catch(()=>cp.textContent="Select the text to copy");
    a.append(use,cp);c.append(a);
  }else if(S.state==="loading"){c.append(el("p","status","One moment..."))}
  else if(S.state==="error"){c.append(el("p","status err",S.error))}
  else{c.append(el("p","status",sample?"Pick an AI and it writes an answer here, ready for you to edit.":"No AI is connected yet. Use a free chat, or connect Claude or ChatGPT under Settings."))}
  const row=el("div","acts");row.append(el("span","status","Write it with:"));
  aiOptions().filter(o=>o.kind==="builtin"&&o.ready).forEach(o=>{
    const b=el("button","chip",o.name);b.type="button";b.setAttribute("aria-pressed",String(S.state==="ready"&&S.prov===o.id));
    b.onclick=()=>{Connectors.ai.setChosen(o.id);renderAI();renderThrPick();suggestReply({prov:o.id,force:true})};row.append(b)});
  const fr=el("button","chip","Free chat (no credit)");fr.type="button";fr.onclick=showFree;row.append(fr);
  c.append(row);
  body.insertBefore(c,$("thrQuick")||null);
}
/* One-tap replies: buttons under the email, each tells the AI what to say */
const QUICK_DEFAULT=["Yes","Not now","Need more info","Call me","Thanks"];
const QUICK_HINT={"yes":"Say yes and confirm, in one or two lines.","not now":"Politely say it is not possible right now and that you will come back to it.","need more info":"Ask for the specific details you need before you can decide.","call me":"Ask them to call you, and say you are free to talk soon.","thanks":"Thank them warmly and close the loop."};
const quickList=()=>{const q=Array.isArray(state.quick)&&state.quick.length?state.quick:QUICK_DEFAULT;return q.map(x=>String(x).trim()).filter(Boolean).slice(0,8)};
function drawQuick(){
  let q=$("thrQuick");if(q)q.remove();
  if(thr.mode!=="reply"||!thr.msgs.length)return;
  q=el("div","acts");q.id="thrQuick";q.append(el("span","status","One tap:"));
  quickList().forEach(label=>{
    const b=el("button","chip",label);b.type="button";
    b.onclick=async()=>{
      const all=[...q.querySelectorAll("button")];all.forEach(x=>x.disabled=true);const old=b.textContent;b.textContent="Writing...";
      const st=$("thrSt"),idAtStart=thr.id;
      try{
        const chase=thrChase(),tone=await toneExamples(),text=threadBlock(thr.msgs);
        const hint=QUICK_HINT[label.toLowerCase()]||"The reply should say: "+label+".";
        let t;
        if(!sample){t={yes:"Yes, that works for me.","not now":"Thanks for this. It's not possible right now, but I'll come back to you.","need more info":"Thanks. Could you send me a few more details so I can decide?","call me":"Could you give me a call when you have a moment?",thanks:"Thank you, I appreciate it."}[label.toLowerCase()]||label}
        else{
          const r=await creditFallback(prov=>sample(replyPrompt(chase,tone,text)+"\n\nThe reply is a one-tap answer: "+hint+" Keep it short.",{cache:false,provider:prov}));t=String(r.text||"").trim();
        }
        if(thr.id!==idAtStart)return;
        if(!t)throw new Error("the AI sent back nothing");
        if(!$("thrText").value.trim()){$("thrText").value=t;st.className="status";st.textContent="Edit it, then send it or save it as a draft.";$("thrText").focus();if(state.quickArm!==false){thr.armed=0;try{await thrAct("send")}catch(e){}}}
        else{thr.sug={state:"ready",prov:Connectors.ai.active()||"claude",text:t,note:"One tap: "+label};drawSuggest();st.className="status";st.textContent="Your reply box already had text, so the answer is in the suggestion above."}
      }catch(e){st.className="status err";st.textContent="Couldn't write it ("+clip((e&&e.message)||"unknown reason",90)+")."+(isCreditErr(e)?" Use a free chat below.":"");if(isCreditErr(e))showFree()}
      all.forEach(x=>x.disabled=false);b.textContent=old;
    };
    q.append(b);
  });
  $("thrBody").append(q);
}
$("styleLearn").onclick=async()=>{const b=$("styleLearn");b.disabled=true;b.textContent="Reading your sent emails...";$("styleSt").textContent="";try{await learnStyle()}catch(e){$("styleSt").textContent="Couldn't learn it ("+clip((e&&e.message)||"unknown reason",80)+")."}b.disabled=false;b.textContent="Learn my style again"};
$("styleNote").onchange=()=>{const v=$("styleNote").value.trim();state.styleNote=v||null;state.styleOwn=!!v;state.styleAt=Date.now();toneP=null;persist();$("styleSt").textContent=v?"Saved. Drafts follow your words from now on.":"Cleared. It will be learned again from your sent emails."};
$("quickArm").onchange=()=>{state.quickArm=$("quickArm").checked;persist()};
$("quickList").onchange=()=>{const v=$("quickList").value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,8);state.quick=v.length?v:null;persist();if(!$("thr").hidden)drawQuick()};
async function suggestReply(o){
  o=o||{};if(thr.mode!=="reply"||!thr.msgs.length)return;
  const key=sugKey(),idAtStart=thr.id;
  if(!sample){thr.sug={state:"idle"};drawSuggest();if(o.force)showFree();return}
  if(!o.force&&sugCache[key]){thr.sug=Object.assign({state:"ready"},sugCache[key]);drawSuggest();return}
  const pv=o.prov||Connectors.ai.active();
  thr.sug={state:"loading",prov:pv};drawSuggest();
  try{
    const chase=thrChase(),tone=await toneExamples(),text=threadBlock(thr.msgs);
    const run=p=>sample(replyPrompt(chase,tone,text),{cache:false,provider:p});
    const r=o.prov?await run(o.prov):await creditFallback(run);
    if(thr.id!==idAtStart)return;
    const t=String(r.text||"").trim();if(!t)throw new Error("the AI sent back nothing");
    const used=r.usedOther||pv;
    thr.sug={state:"ready",prov:used,text:t,note:r.usedOther?Connectors.ai.names[r.skipped]+" has no credit, so "+Connectors.ai.names[r.usedOther]+" wrote it.":""};
    sugCache[key]={prov:used,text:t,note:thr.sug.note};
    drawSuggest();
  }catch(e){
    if(thr.id!==idAtStart)return;
    const credit=isCreditErr(e);
    thr.sug={state:"error",prov:pv,error:credit?(e.message||"No credit left.")+" Pick another AI below, or use a free chat.":"Couldn't write it ("+clip((e&&e.message)||"unknown reason",100)+"). Try another AI below."};
    drawSuggest();
  }
}
$("autoSuggest").onchange=()=>{state.autoSuggest=$("autoSuggest").checked;persist()};
/* Writing without API credit: the person's own free ChatGPT or Claude chat on its website, then paste the answer back */
async function creditFallback(run){
  const first=aiPickValue()||Connectors.ai.active();
  try{return await run(first)}
  catch(e){
    const other=first==="claude"?"chatgpt":"claude";
    if(/no credit|credit left|billing|quota/i.test((e&&e.message)||"")&&Connectors.ai.avail(other)){const r=await run(other);r.usedOther=other;r.skipped=first;return r}
    throw e;
  }
}
const isCreditErr=e=>/no credit|credit left|billing|quota/i.test((e&&e.message)||"");
function freePrompt(){
  if(thr.mode==="new"){
    return "Write an email for "+(myName||"me")+" at "+BR.co+", "+BR.desc+".\nIt is to: "+($("thrTo").value.trim()||"someone")+".\nWhat it should say: "+($("thrBrief").value.trim()||"(describe it here)")+"\n\nPlain text only, short, warm, professional, with contractions. No em dashes. Give a subject line first, then the email body.";
  }
  const chase=thrChase();
  return (chase?"Write a short, polite follow-up email chasing an answer that is still owed":"Write a reply email")+" for "+(myName||"me")+" at "+BR.co+", "+BR.desc+". Plain text only, short, warm, professional, with contractions. No em dashes, no semicolons. Use [DATE] or [DETAIL] where a fact is unknown. Give only the email body.\n\nSubject: "+$("thrTitle").textContent+"\nThread (latest last):\n"+threadBlock(thr.msgs).slice(-6000);
}
function showFree(){
  $("thrFree").hidden=false;$("thrFree").scrollIntoView({block:"nearest"});
}
function openFree(url,name){
  const p=freePrompt();
  try{navigator.clipboard.writeText(p)}catch(e){}
  const short=p.length>1800;
  const msg=openOutside({url,name},p);
  $("thrSt").className="status";$("thrSt").textContent=msg+(short?" The email was long, so the full text is also copied. Paste it if the page looks cut.":"")+" Paste the answer in the box below when it's ready.";
  $("thrPaste").focus();
}
$("thrFreeBtn").onclick=showFree;
$("thrFreeGPT").onclick=()=>openFree("https://chatgpt.com/?q={prompt}","ChatGPT");
$("thrFreeClaude").onclick=()=>openFree("https://claude.ai/new?q={prompt}","Claude");
$("thrPasteUse").onclick=()=>{
  const v=$("thrPaste").value.trim();if(!v){$("thrPaste").focus();return}
  let body=v,subj="";
  if(thr.mode==="new"){const m=v.match(/^\s*Subject:\s*(.+)\n+/i);if(m){subj=m[1].trim();body=v.slice(m[0].length).trim()}}
  $("thrText").value=body;if(subj&&!$("thrSubj").value.trim())$("thrSubj").value=subj;
  $("thrFree").hidden=true;$("thrPaste").value="";$("thrSt").className="status";$("thrSt").textContent="Edit it, then send it or save it as a draft.";$("thrText").focus();
};
/* speak your reply: the browser's own speech recognition, then the AI tidies it into an email */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,voice={raw:"",on:false};
function micState(on){voice.on=on;$("thrMic").textContent=on?"⏹ Stop":"🎤 Speak";$("thrMic").setAttribute("aria-pressed",String(on))}
async function tidyVoice(){
  const raw=voice.raw.trim(),st=$("thrSt"),ta=$("thrText");
  if(!raw){st.className="status err";st.textContent="I didn't hear anything. Check your microphone and try again.";return}
  ta.value=raw;$("thrExact").hidden=true;
  if(!sample){st.className="status";st.textContent="Here is what you said. Edit it, then send it.";return}
  st.className="status";st.textContent="Turning what you said into an email...";
  try{
    const first=(myName||"").split(" ")[0],reply=thr.mode==="reply";
    const r=await creditFallback(prov=>sample("Turn this spoken note into a clean email "+(reply?"reply":"")+" for "+(myName||"me")+" at "+BR.co+". Keep every fact and the meaning. Fix grammar, remove filler words, make it short and warm. Use contractions. No em dashes, no semicolons. Plain text only. "+(sigText()?"No sign-off and no name, the signature is added automatically.":"Sign with the first name"+(first?" "+first:"")+".")+" Return only the email body.\n\nWhat they said:\n"+raw+(reply?"\n\nThe email they are answering:\n"+threadBlock(thr.msgs).slice(-2500):""),{cache:false,provider:prov}));
    const t=String(r.text||"").trim();if(t){ta.value=t;$("thrExact").hidden=false}
    st.className="status";st.textContent="Edit it, then send it or save it as a draft.";
  }catch(e){st.className="status err";st.textContent="I couldn't tidy it ("+clip((e&&e.message)||"unknown reason",90)+"). Your exact words are in the box."}
}
function startVoice(){
  if(!SR)return;
  voice.raw="";rec=new SR();rec.lang=$("thrLang").value;rec.continuous=true;rec.interimResults=true;
  let finals="";
  rec.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finals+=t+" ";else interim+=t}voice.raw=(finals+interim).trim();$("thrSt").className="status";$("thrSt").textContent="Listening: "+clip(voice.raw,200)};
  rec.onerror=e=>{micState(false);const st=$("thrSt");st.className="status err";st.textContent=e&&e.error==="not-allowed"?"The microphone is blocked. Allow it in your browser's address bar, then try again.":e&&e.error==="no-speech"?"I didn't hear anything.":"The microphone stopped ("+((e&&e.error)||"unknown reason")+")."};
  rec.onend=()=>{if(voice.on){micState(false);tidyVoice()}};
  try{rec.start();micState(true);$("thrSt").className="status";$("thrSt").textContent="Listening... speak now, then press Stop."}catch(e){micState(false)}
}
$("thrMic").onclick=()=>{if(voice.on){voice.on=false;micState(false);try{rec.stop()}catch(e){}tidyVoice()}else startVoice()};
$("thrExact").onclick=()=>{$("thrText").value=voice.raw.trim();$("thrExact").hidden=true};
if(SR){$("thrMic").hidden=false;$("thrLang").hidden=false;try{const l=localStorage.getItem("wyz-voice-lang");if(l)$("thrLang").value=l}catch(e){}}
$("thrLang").onchange=()=>{try{localStorage.setItem("wyz-voice-lang",$("thrLang").value)}catch(e){}};
function thrChase(){const l=lastMsg();return thr.item.st==="follow"||thr.item.st==="wait"||addrOf(l.sender).toLowerCase()===myAddr()}
/* the person's own direction overrides the AI's idea of the answer */
const dirNote=d=>d?"\n\nIMPORTANT. The person has decided what to answer. Follow this direction exactly and keep every point of it. Don't add commitments, numbers or dates they didn't give. Their direction: "+d:"";
async function writeMyWay(dir,chase,text,set,status,about){
  if(!dir.trim()){status("Type your direction first, for example: agree, ask for the contract by Thursday.",true);return}
  if(!sample){set(dir.trim());status(chatAI()?"No AI on this page yet, so your direction is in the box. Edit it, or use Write it with "+CHAT[chatAI()].name+".":"No AI is connected, so your words are in the box. Edit them, then send.");return}
  status("Writing it your way...");
  try{let tone="";try{tone=await toneExamples()}catch(x){}const r=await creditFallback(p=>sample(replyPrompt(chase,tone,text,about)+dirNote(dir),{cache:false,provider:p}));const t=String(r.text||"").trim();if(!t)throw new Error("the AI sent back nothing");set(t);status("Here it is, written your way. Edit anything, then send.")}
  catch(e){status("Couldn't write it ("+clip((e&&e.message)||"unknown reason",90)+"). Your direction is still in the box above.",true)}
}
function replyPrompt(chase,tone,text,about){const it=about||thr.item||{};return (chase?"Write a short, polite follow-up email chasing an answer that is still owed, ":"Write a reply email ")+"for "+(myName||"me")+" at "+BR.co+". Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject, no quoted text."+(tone?"\n\n"+tone:"")+"\n\nWhat it's about: "+(it.title||"")+". "+(it.summary||"")+"\n\nThread (latest last):\n"+text}
async function thrDraft(){
  const ta=$("thrText"),st=$("thrSt"),chase=thrChase();
  st.className="status";st.textContent=sample?"Writing a draft with Claude...":"";ta.value="";
  const text=threadBlock(thr.msgs);
  try{
    const tone=sample?await toneExamples():"";
    const r=!sample?{text:templateDraft(thr.item,chase)}:await creditFallback(prov=>sample(replyPrompt(chase,tone,text),{cache:false,provider:prov,onText:u=>{ta.value=u.text}}));
    ta.value=r.text;st.textContent=r.usedOther?Connectors.ai.names[r.skipped]+" has no credit, so "+Connectors.ai.names[r.usedOther]+" wrote this. Edit it, then send it or save it as a draft.":"Edit it, then send it or save it as a draft."
  }catch(e){st.className="status err";st.textContent="Couldn't write a draft ("+clip((e&&e.message)||"unknown reason",110)+")."+(isCreditErr(e)?" You can still use a free chat below, or write your own here.":" Write your own here.");if(isCreditErr(e))showFree()}
}
function thrArgs(){
  const last=lastMsg(),subj=String(tById(thr.id)&&tById(thr.id).subject||$("thrTitle").textContent||"");
  const split=v=>String(v||"").split(/[,;]/).map(x=>x.trim()).filter(Boolean);
  const files=thr.files.map(f=>({name:f.name,type:f.type,data:f.data}));
  const withSig=()=>{const t=$("thrText").value.trimEnd(),sg=sigText();return sg&&!t.includes(sg)?t+"\n\n"+sg:t};
  if(thr.mode==="new"){const o={to:split($("thrTo").value),cc:split($("thrCc").value),subject:$("thrSubj").value.trim(),body:withSig(),attachments:files};const fv=$("thrFromWrap").hidden?0:+$("thrFrom").value;if(fv)o.account=fv;return o}
  if(thr.mode==="forward")return {to:split($("thrTo").value),cc:split($("thrCc").value),subject:/^fwd?:/i.test(subj)?subj:"Fwd: "+subj,body:withSig()+forwardBlock(),attachments:files};
  return {to:split($("thrTo").value),cc:split($("thrCc").value),subject:/^re:/i.test(subj)?subj:"Re: "+subj,body:withSig()+quoteOf(last),replyToMessageId:last.id,attachments:files};
}
const withSigText=()=>{const t=$("thrText").value.trimEnd(),sg=sigText();return sg&&!t.includes(sg)?t+"\n\n"+sg:t};
function forwardBlock(){
  return "\n\n---------- Forwarded message ----------\n"+thr.msgs.slice(-3).map(m=>"From: "+(m.sender||"")+"\nDate: "+(m.date?new Date(m.date).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"")+"\nSubject: "+$("thrTitle").textContent+"\n\n"+String(m.plaintextBody||m.snippet||"").slice(0,6000)).join("\n\n---\n\n");
}
function setMode(m){
  thr.mode=m;const fwd=m==="forward",nw=m==="new";
  ["thrSnooze","thrMore","thrGmail","thrArchive","thrVip","thrMute"].forEach(k=>$(k).hidden=nw);
  $("thrBody").hidden=nw;if(nw){$("thrAIbox").hidden=true;$("thrPrev").hidden=$("thrNext").hidden=true;$("thrPos").textContent=""}
  $("thrSubjWrap").hidden=!nw;$("thrBrief").hidden=!nw;if(nw)$("thrCcWrap").hidden=false;$("thrDirRow").hidden=nw;$("thrDir").value="";
  $("thrFwd").hidden=nw;
  $("thrFwd").textContent=fwd?"Back to reply":"Forward";
  $("thrSumWrap").hidden=!(fwd&&sample);$("thrRemWrap").hidden=fwd;$("thrAll").parentElement.hidden=fwd||nw;
  $("thrAI").hidden=fwd;$("thrAIpick").hidden=fwd;setAIButton();$("thrFreeBtn").hidden=fwd;if(SR){$("thrMic").hidden=fwd;$("thrLang").hidden=fwd}if(fwd)$("thrFree").hidden=true;if(!fwd)$("thrSum").checked=false;
}
$("thrFwd").onclick=()=>{
  if(thr.mode==="forward"){setMode("reply");fillTargets();return}
  setMode("forward");$("thrTo").value="";$("thrCc").value="";$("thrCcWrap").hidden=true;$("thrText").value="";
  $("thrSt").className="status";$("thrSt").textContent="Type who to send it to and an optional note. The conversation is added below your note.";$("thrTo").focus();
};
$("thrFiles").onchange=async e=>{
  const files=[...e.target.files];let total=thr.files.reduce((n,f)=>n+f.size,0);
  for(const f of files){
    if(total+f.size>10*1024*1024){$("thrSt").className="status err";$("thrSt").textContent="Attachments can total 10 MB at most. "+f.name+" was left out.";continue}
    const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]||"");r.onerror=rej;r.readAsDataURL(f)});
    thr.files.push({name:f.name,type:f.type,size:f.size,data});total+=f.size;
  }
  e.target.value="";
  $("thrFileList").textContent=thr.files.map(f=>f.name+" ("+Math.max(1,Math.round(f.size/1024))+" KB)").join(", ");
};
/* Sending: quick local checks, then an Undo countdown, then the real send */
const undoSecs=()=>{const n=state.undoSecs;return Number.isInteger(n)&&n>=0&&n<=60?n:10};
function sendChecks(a){
  const issues=[],typed=$("thrText").value;
  if(/\b(attach(ed|ment|ments)?|enclosed|PFA)\b/i.test(typed.split(/\n\s*On .{5,120}wrote:/)[0])&&!thr.files.length)issues.push("You mention an attachment, but nothing is attached.");
  if(/\[(DATE|DETAIL)[^\]]*\]/i.test(typed))issues.push("There is still a [DATE] or [DETAIL] placeholder to fill in.");
  if(a.to.length>=5)issues.push("This goes to "+a.to.length+" people. Check that is what you want.");
  if(thr.mode==="reply"&&a.subject&&/^re:\s*$/i.test(a.subject))issues.push("The subject is empty.");
  return issues;
}
function setSendButtons(disabled){["thrSave","thrText","thrTo","thrCc","thrCheck","thrAI","thrMic"].forEach(k=>{const e=$(k);if(e)e.disabled=disabled})}
function cancelUndo(msg){
  clearInterval(thr.timer);thr.counting=false;setSendButtons(false);$("thrSend").textContent="Send";
  const st=$("thrSt");st.className="status";st.textContent=msg||"Cancelled. Nothing was sent.";
}
async function thrAct(kind){
  const st=$("thrSt"),a=thrArgs();st.className="status";
  if(thr.counting){cancelUndo();return}
  if(!$("thrText").value.trim()&&!thr.files.length){st.className="status err";st.textContent=thr.mode==="forward"?"Add a short note or an attachment first.":thr.mode==="new"?"Write the email first.":"Write your reply first.";return}
  if(thr.mode==="new"&&!a.subject){st.className="status err";st.textContent="Add a subject.";$("thrSubj").focus();return}
  if(!a.to.length||a.to.concat(a.cc||[]).some(x=>!/^\S+@\S+\.\S+$/.test(addrOf(x)))){st.className="status err";st.textContent="Check the To and Cc addresses.";return}
  if(kind!=="send")return thrDeliver(kind,a);
  if(!thr.skipChecks){
    const issues=sendChecks(a);
    if(issues.length){
      st.className="status err";st.replaceChildren(document.createTextNode("Before you send: "+issues.join(" ")+" "));
      const go=el("button","btn small","Send anyway");go.type="button";go.onclick=()=>{thr.skipChecks=true;thrAct("send")};st.append(go);return;
    }
  }
  thr.skipChecks=false;
  const who0=a.to[0]+(a.to.length>1?" +"+(a.to.length-1):"");
  if(!thr.armed){
    thr.armed=1;$("thrSend").textContent="Confirm: send to "+who0;
    st.className="status";st.replaceChildren(document.createTextNode("Check the email, then press Confirm to send it. "));
    const c=el("button","btn small ghost","Cancel");c.type="button";c.onclick=()=>{thr.armed=0;$("thrSend").textContent="Send";st.textContent="Not sent."};st.append(c);return;
  }
  thr.armed=0;
  const secs=undoSecs();
  if(!secs)return thrDeliver("send",a);
  /* 3.43: you can leave straight away. Close the email and the countdown carries on in a small bar at the bottom,
     with Undo and Send now. Or press Send now to skip the wait. */
  const T=thr;T.remind=+$("thrRemind").value||0;T.sum=!!($("thrSum")&&$("thrSum").checked);let left=secs;T.counting=true;setSendButtons(true);
  const who=a.to[0]+(a.to.length>1?" +"+(a.to.length-1):"");
  T.left=()=>left;T.who=who;
  T.fire=()=>{if(!T.counting)return;clearInterval(T.timer);T.counting=false;sendBar(T,null);thrDeliver("send",a,T)};
  const tick=()=>{if(T.bg){sendBar(T,"tick");return}$("thrSend").textContent="Undo ("+left+")";st.className="status";st.replaceChildren(document.createTextNode("Sending to "+who+" in "+left+" second"+(left===1?"":"s")+". Press Undo to stop it, or close this window, it still goes. "));
    const now=el("button","btn small solid","Send now");now.type="button";now.onclick=()=>T.fire();st.append(now)};
  tick();
  T.timer=setInterval(()=>{left--;if(left<=0)T.fire();else tick()},1000);
}
/* Small bar at the bottom while an email you left is counting down */
function sendBar(T,mode){
  let b=$("sendBar");
  if(!mode){if(b&&b.dataset.tid===String(T.id||"new"))b.remove();return}
  if(!b){b=el("div","updbar");b.id="sendBar";b.setAttribute("role","status");document.body.append(b)}
  b.dataset.tid=String(T.id||"new");b.replaceChildren(el("span","","Sending to "+T.who+" in "+T.left()+"s"));
  const u=el("button","btn small","Undo");u.type="button";u.onclick=()=>{clearInterval(T.timer);T.counting=false;T.bg=false;b.remove();toast("Not sent. Your email is still open, tap Undo again if you closed it by mistake.");reopenDraft(T)};
  const n=el("button","btn small solid","Send now");n.type="button";n.onclick=()=>T.fire();
  b.append(u,n);
}
/* after Undo from the bar, open the same email again with the text still in it */
function reopenDraft(T){if(thr!==T)return;$("thr").hidden=false;setSendButtons(false);$("thrSend").disabled=false;$("thrSend").textContent="Send";const st=$("thrSt");st.className="status";st.textContent="Cancelled. Nothing was sent."}
async function thrDeliver(kind,a,T){
  T=T||thr;
  if(T.bg||thr!==T)return bgDeliver(a,T);
  const st=$("thrSt"),btn=$(kind==="send"?"thrSend":"thrSave");
  thr.armed=0;btn.disabled=true;const old=btn.textContent;btn.textContent=kind==="send"?"Sending...":"Saving...";
  if(kind==="send")setSendButtons(true);
  try{
    if(thr.mode==="forward"&&$("thrSum").checked&&sample){
      const sm=await sample("Summarize this email conversation for someone who has not seen it, in 4 short bullet lines, plain words, no em dashes.\n\n"+threadBlock(thr.msgs),{cache:false});
      a.body=withSigText()+"\n\nSummary:\n"+sm.text.trim();
    }
    const r=await mcp.callTool("Gmail",kind==="send"?"send_message":"create_draft",a);
    thr.done=true;["thrSend","thrSave","thrText","thrTo","thrCc","thrCheck"].forEach(k=>$(k).disabled=true);
    btn.textContent=kind==="send"?"Sent":"Saved";
    st.className="status";st.textContent=kind==="send"?"Sent to "+a.to.join(", ")+". Marked as done.":"Saved to your Gmail drafts.";
    if(kind==="send"){
      const tid=thr.mode==="new"?(r.payload&&r.payload.threadId):thr.id;
      if(thr.mode==="new"){logDone({id:tid,title:"Sent: "+a.subject},"sent");st.textContent="Sent to "+a.to.join(", ")+"."}
      else{setDone(thr.id,true);logDone(thr.item)}
      const n=+$("thrRemind").value;if((thr.mode==="reply"||thr.mode==="new")&&n>0&&tid){const d=new Date();d.setDate(d.getDate()+n);state.chase=state.chase||{};state.chase[tid]={due:ymd(d),title:a.subject,at:Date.now(),to:a.to[0]};st.textContent+=" You'll be reminded on "+niceDay(ymd(d))+" if there's no reply."}
      persist();renderBoard()}
    else if(r.payload&&r.payload.viewUrl){const l=el("a","btn small","Open draft");l.href=r.payload.viewUrl;l.target="_blank";l.rel="noopener";$("thrSt").append(" ",l)}
  }catch(e){
    setSendButtons(false);btn.disabled=false;btn.textContent=old==="Sending..."?"Send":"Save to Gmail drafts";st.className="status err";
    st.textContent=e&&e.code==="consent_required"?"Google didn't allow sending. Sign out and back in, and tick every box.":"Couldn't "+(kind==="send"?"send":"save")+" it ("+clip((e&&e.message)||"unknown reason",100)+"). Check Gmail before trying again."
  }
}
/* sending after you closed the email: same steps, the result shows as a toast */
async function bgDeliver(a,T){
  try{
    if(T.mode==="forward"&&T.sum&&sample){const sm=await sample("Summarize this email conversation for someone who has not seen it, in 4 short bullet lines, plain words, no em dashes.\n\n"+threadBlock(T.msgs),{cache:false});a.body=withSigText()+"\n\nSummary:\n"+sm.text.trim()}
    const r=await mcp.callTool("Gmail","send_message",a);T.done=true;
    const tid=T.mode==="new"?(r.payload&&r.payload.threadId):T.id;
    if(T.mode==="new")logDone({id:tid,title:"Sent: "+a.subject},"sent");else{setDone(T.id,true);logDone(T.item)}
    let msg="Sent to "+a.to.join(", ")+".";
    const n=T.remind||0;if((T.mode==="reply"||T.mode==="new")&&n>0&&tid){const d=new Date();d.setDate(d.getDate()+n);state.chase=state.chase||{};state.chase[tid]={due:ymd(d),title:a.subject,at:Date.now(),to:a.to[0]};msg+=" Reminder set for "+niceDay(ymd(d))+"."}
    persist();renderBoard();try{renderTop3()}catch(e){}toast(msg);
  }catch(e){toast("Couldn't send your email to "+a.to[0]+" ("+clip((e&&e.message)||"unknown reason",80)+"). Open it again and resend.")}
}
/* The AI reads the email before it goes */
async function thrCheck(){
  const out=$("thrCheckOut"),btn=$("thrCheck"),a=thrArgs();
  out.hidden=false;
  if(!$("thrText").value.trim()){out.replaceChildren(el("p","","Write the email first, then check it."));return}
  const local=sendChecks(a);
  if(!sample){out.replaceChildren(el("p","",local.length?local.join(" "):"No obvious problems found. Connect Claude or ChatGPT under Settings for a deeper check."));return}
  btn.disabled=true;out.replaceChildren(el("p","status","Reading your email..."));
  try{
    const r=await creditFallback(prov=>sample.json("Check this email before "+(myName||"the sender")+" sends it. Look for: wrong or missing facts compared with the conversation, a tone that is too blunt or too soft for the situation, unclear asks, promises that were not meant, typos, a missing attachment, and anything that should be left out. Be strict but brief.\n\n"+(thr.mode==="new"?"To: "+a.to.join(", ")+"\nSubject: "+a.subject+"\n":"The conversation so far (latest last):\n"+threadBlock(thr.msgs).slice(-3500)+"\n\n")+"The email they are about to send:\n"+$("thrText").value.slice(0,4000)+"\n\nReturn JSON only: {\"ok\": true or false, \"issues\": [ short plain sentences, max 5 ], \"better\": a corrected version of the email only if you found real problems, else an empty string}. No em dashes.",{cache:false,provider:prov}));
    const issues=(Array.isArray(r.issues)?r.issues:[]).map(String).concat(local).filter(Boolean).slice(0,7);
    out.replaceChildren();
    out.append(el("p","",issues.length?"Things to look at before you send:":"Looks good. No problems found."));
    if(issues.length){const ul=el("ul");ul.style.margin="0";ul.style.paddingLeft="20px";issues.forEach(x=>ul.append(el("li","",x)));out.append(ul)}
    if(r.better&&String(r.better).trim()&&issues.length){const b=el("button","btn small","Use the corrected version");b.type="button";b.onclick=()=>{$("thrText").value=String(r.better).trim();out.hidden=true};out.append(b)}
  }catch(e){out.replaceChildren(el("p","status err","Couldn't check it ("+clip((e&&e.message)||"unknown reason",100)+")."+(local.length?" Quick checks found: "+local.join(" "):"")))}
  btn.disabled=false;
}
$("thrCheck").onclick=thrCheck;
$("undoSecs").onchange=()=>{state.undoSecs=+$("undoSecs").value;persist()};
async function thrArchive(){
  const b=$("thrArchive"),st=$("thrSt");b.disabled=true;b.textContent="Archiving...";
  try{await mcp.callTool("Gmail","archive_thread",{threadId:thr.id});b.textContent="Archived";setDone(thr.id);logDone(thr.item,"archived");persist();renderBoard();setTimeout(thrClose,600)}
  catch(e){b.disabled=false;b.textContent="Archive";st.className="status err";
    if(e&&e.code==="consent_required"){st.textContent="Archive needs one more Google permission. ";const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>connectGoogle(true);st.append(l)}
    else st.textContent="Couldn't archive it ("+clip((e&&e.message)||"unknown reason",90)+")."}
}
$("thrArchive").onclick=thrArchive;
/* more mail actions: star, unread, label, unsubscribe, bin */
function unsubTarget(){
  for(let i=thr.msgs.length-1;i>=0;i--){
    const m=thr.msgs[i];if(!m.unsub)continue;
    const parts=[...String(m.unsub).matchAll(/<([^>]+)>/g)].map(x=>x[1].trim());
    const https=parts.find(x=>/^https:\/\//i.test(x)),http=parts.find(x=>/^http:\/\//i.test(x)),mail=parts.find(x=>/^mailto:/i.test(x));
    if(https||http||mail)return {https,http,mail,oneClick:/one-click/i.test(m.unsubPost||"")};
  }
  return null;
}
function thrErr(e,what){
  const st=$("thrSt");st.className="status err";st.replaceChildren();
  if(e&&e.code==="consent_required"){st.append(document.createTextNode("That needs one more Google permission. "));const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>connectGoogle(true);st.append(l)}
  else st.textContent="Couldn't "+what+" ("+clip((e&&e.message)||"unknown reason",90)+").";
}
function thrNote(t){const st=$("thrSt");st.className="status";st.textContent=t}
function thrMore(){
  const host=$("thrMore");host.replaceChildren();if(!thr.msgs.length||thr.mode==="new")return;
  const d=el("details","askdd");d.append(el("summary","","More ▾"));const m=el("div","askmenu");d.append(m);
  const starred=thr.msgs.some(x=>(x.labelIds||[]).includes("STARRED"));
  const add=(t,fn)=>{const b=el("button","",t);b.type="button";b.onclick=async()=>{d.open=false;try{await fn()}catch(e){thrErr(e,t.toLowerCase())}};m.append(b);return b};
  add(starred?"Remove star":"Star this email",async()=>{
    await mcp.callTool("Gmail","modify_thread",{threadId:thr.id,add:starred?[]:["STARRED"],remove:starred?["STARRED"]:[]});
    thr.msgs.forEach(x=>{x.labelIds=(x.labelIds||[]).filter(l=>l!=="STARRED");if(!starred)x.labelIds.push("STARRED")});
    thrMore();thrNote(starred?"Star removed.":"Starred in Gmail.");
  });
  add("Mark as unread",async()=>{await mcp.callTool("Gmail","modify_thread",{threadId:thr.id,add:["UNREAD"],remove:[]});thrNote("Marked as unread in Gmail.")});
  add("Move to a label...",async()=>{
    m.replaceChildren(el("p","status","Loading your labels..."));d.open=true;
    let labels=[];try{labels=((await mcp.callTool("Gmail","list_labels",{},{cache:false})).payload||{}).labels||[]}catch(e){thrMore();return thrErr(e,"load your labels")}
    m.replaceChildren(el("p","meta",labels.length?"Pick a label. The email leaves your inbox.":"You have no labels yet. Make one below."));
    const mv=async(id,name)=>{d.open=false;try{await mcp.callTool("Gmail","modify_thread",{threadId:thr.id,add:[id],remove:["INBOX"]});setDone(thr.id);logDone(thr.item,"moved to "+name);persist();renderBoard();thrNote("Moved to "+name+".");setTimeout(thrClose,700)}catch(e){thrErr(e,"move it")}};
    labels.slice(0,40).forEach(l=>{const b=el("button","",l.name);b.type="button";b.onclick=()=>mv(l.id,l.name);m.append(b)});
    const row=el("div","snzrow");const inp=el("input","in");inp.placeholder="New label name";inp.setAttribute("aria-label","New label name");
    const go=el("button","","Create and move");go.type="button";go.onclick=async()=>{const n=inp.value.trim();if(!n)return;try{const r=(await mcp.callTool("Gmail","create_label",{name:n})).payload;mv(r.id,r.name)}catch(e){d.open=false;thrErr(e,"create the label")}};
    row.append(inp,go);m.append(row);
  });
  const u=unsubTarget();
  if(u)add("Unsubscribe",async()=>{
    const from=nameOf(lastMsg().sender)||"this sender";
    if(!confirm("Unsubscribe from "+from+"?\nThey may take a few days to stop. This sender will also be muted on your board."))return;
    if(u.https&&u.oneClick){await mcp.callTool("Gmail","unsubscribe_one_click",{url:u.https});thrNote("Unsubscribed. Muted on your board.")}
    else if(u.mail&&!u.https&&!u.http){
      const mt=u.mail.replace(/^mailto:/i,""),to=mt.split("?")[0],q=new URLSearchParams(mt.split("?")[1]||"");
      await mcp.callTool("Gmail","send_message",{to:[to],cc:[],subject:q.get("subject")||"unsubscribe",body:q.get("body")||"unsubscribe",attachments:[]});thrNote("Unsubscribe email sent. Muted on your board.")}
    else{window.open(u.https||u.http,"_blank","noopener");thrNote("The sender's page opened in a new tab. Confirm there. Muted on your board.")}
    const a=thrSender();if(a)addRule("mute",a);syncRuleBtns();
  });
  add("About this person",async()=>{const l=lastMsg(),mine=addrOf(l.sender).toLowerCase()===myAddr();const who=mine?(l.toRecipients||[])[0]:l.sender;openPerson(who)});
  add("Hand off to a team member...",async()=>openHandoff());
  add("Move to bin",async()=>{
    if(!confirm("Move this whole conversation to the bin in Gmail?"))return;
    await mcp.callTool("Gmail","trash_thread",{threadId:thr.id});setDone(thr.id);logDone(thr.item,"binned");persist();renderBoard();thrNote("Moved to the bin.");setTimeout(thrClose,600);
  });
  host.append(d);
}
function thrClose(){if(thr.counting){thr.bg=true;$("thr").hidden=true;sendBar(thr,"tick");return}$("thr").hidden=true}
$("thrClose").onclick=thrClose;$("thrAI").onclick=()=>{if(!sample&&chatAI()){showFree();return}if(thr.mode==="new")composeDraft();else if($("thrAIpick").value==="free")showFree();else suggestReply({prov:aiPickValue(),force:true})};$("thrAll").onchange=fillTargets;
$("thrSend").onclick=()=>thrAct("send");
$("thrAllSel").onchange=()=>{$("thrAll").checked=$("thrAllSel").value==="all";fillTargets()};
$("thrDirGo").onclick=async()=>{const b=$("thrDirGo"),st=$("thrSt");b.disabled=true;
  await writeMyWay($("thrDir").value,thrChase(),threadBlock(thr.msgs),t=>{$("thrText").value=t},(m,err)=>{st.className="status"+(err?" err":"");st.textContent=m});b.disabled=false};
$("thrDir").addEventListener("keydown",e=>{if(e.key==="Enter")$("thrDirGo").click()});
["thrText","thrTo","thrCc"].forEach(k=>$(k).addEventListener("input",()=>{if(thr.armed&&!thr.counting){thr.armed=0;$("thrSend").textContent="Send";$("thrSt").textContent=""}}));$("thrSave").onclick=()=>thrAct("save");
$("thrWA").onclick=()=>window.open(waLink($("thrText").value),"_blank","noopener");
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("thr").hidden)thrClose()});
$("thr").addEventListener("click",e=>{if(e.target===$("thr"))thrClose()});

/* ---------- search all mail ---------- */
async function searchMail(){
  const q=$("mailQ").value.trim(),host=$("mailRes");host.replaceChildren();
  if(!q)return;
  if(!G.connected()){host.append(el("p","status err","Connect Google first."));return}
  host.append(el("p","status","Searching..."));
  try{
    const g=await mcp.server("Gmail");const r=await g.search_threads({query:q,pageSize:20});
    found=(r.threads||[]).map(slimThread);host.replaceChildren();
    if(!found.length){host.append(el("p","status","Nothing found."));return}
    host.append(el("p","status",found.length+" conversation"+(found.length>1?"s":"")+" found."));
    found.forEach(t=>{
      const row=el("div","item");row.append(el("span","dot none"));const m=el("div","main");
      m.append(el("span","t",t.subject),el("span","s",t.snippet),el("span","m",(t.lastFromMe?"You wrote to "+(nameOf((t.lastTo||[])[0])||"them"):nameOf(t.from))+(t.date?" · "+fmtWhen(t.date):"")+(t.count>1?" · "+t.count+" messages":"")));
      const a=el("div","acts");
      a.append(onbBtn("Read thread",()=>openThread(t.id),"small"),onbBtn("Reply",()=>openThread(t.id,{draft:true}),"small solid"));
      m.append(a);row.append(m);host.append(row);
    });
  }catch(e){host.replaceChildren(el("p","status err","Couldn't search just now ("+clip((e&&e.message)||"unknown reason",100)+")."))}
}
$("mailGo").onclick=searchMail;$("mailQ").addEventListener("keydown",e=>{if(e.key==="Enter")searchMail()});

/* ---------- board ---------- */
const tById=id=>threads.find(t=>t.id===id)||found.find(t=>t.id===id);
const todayKey=()=>ymd(new Date());
/* Done is permanent (3.38). Once you press Done, Delete, Archive, Move or Bin, that email never comes back on its own:
   not when someone writes again, not after a refresh, not on another device.
   - Every Done email also gets the Gmail label "WYZ-Done", so phone, computer and every browser agree.
   - Another email on the same subject with the same person counts as the same issue and stays done too.
   - Only "Undo done" (under Show done and snoozed) or a reminder you set yourself brings it back.
   A reply you sent from the page is a soft done: it comes back only when the other person writes again. */
const DONE_LBL="WYZ-Done";
const normSubj=x=>String(x||"").toLowerCase().replace(/^\s*((re|fw|fwd|tr|aw|wg|rv)\s*(\[\d+\])?\s*:\s*)+/i,"").replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();
function issueKey(t){if(!t)return "";const sj=normSubj(t.subject);if(sj.length<8)return "";const who=addrOf(t.lastFromMe?(t.lastTo||[])[0]:t.from).toLowerCase();return who?sj+"|"+who:""}
function doneNow(i){
  const v=state.done[i.id],t=tById(i.id);
  if(v){
    if(state.soft&&state.soft[i.id]&&t&&!t.lastFromMe&&t.date){const at=v>1?v:Date.parse(t.mineAt||0)||0;if(at&&Date.parse(t.date)>at+1000){delete state.done[i.id];delete state.soft[i.id];return false}}
    return true}
  const k=issueKey(t);return !!(k&&state.doneIssue&&state.doneIssue[k])}
/* new message after it was marked done: the item stays off the board, it only shows a note under Show done */
function newSinceDone(i){const v=state.done[i.id],t=tById(i.id);return !!(v>1&&t&&!t.lastFromMe&&t.date&&Date.parse(t.date)>v+1000)}
const acctOf=id=>{const m=String(id||"").match(/^a(\d+)~/);return m?+m[1]:0};
async function doneLabelId(K){
  state.doneLbl=state.doneLbl||{};if(state.doneLbl[K])return state.doneLbl[K];
  const ls=((await mcp.callTool("Gmail","list_labels",{account:K},{cache:false})).payload||{}).labels||[];
  let l=ls.find(x=>String(x.name).toLowerCase()===DONE_LBL.toLowerCase());
  if(!l)l=(await mcp.callTool("Gmail","create_label",{name:DONE_LBL,account:K})).payload;
  if(l&&l.id){state.doneLbl[K]=l.id;persist()}return l&&l.id;
}
async function labelDone(id,on){
  if(!mcp||!id)return;try{const L=await doneLabelId(acctOf(id));if(!L)return;
    await mcp.callTool("Gmail","modify_thread",{threadId:id,add:on?[L]:[],remove:on?[]:[L]})}catch(e){if(state.doneLbl)delete state.doneLbl[acctOf(id)]}
}
/* setDone(id): permanent done. soft=true only for "you sent a reply". */
function setDone(id,soft){
  if(!id)return;state.done[id]=Date.now();state.soft=state.soft||{};
  if(soft){state.soft[id]=1;return}
  delete state.soft[id];if(state.chase)delete state.chase[id];
  const k=issueKey(tById(id));if(k){state.doneIssue=state.doneIssue||{};state.doneIssue[k]=Date.now();
    const ks=Object.keys(state.doneIssue);if(ks.length>800)ks.sort((a,b)=>state.doneIssue[a]-state.doneIssue[b]).slice(0,ks.length-800).forEach(x=>delete state.doneIssue[x])}
  labelDone(id,true);
}
function undoDone(id){
  delete state.done[id];if(state.soft)delete state.soft[id];
  const k=issueKey(tById(id));if(k&&state.doneIssue)delete state.doneIssue[k];
  state.undone=state.undone||{};state.undone[id]=Date.now();labelDone(id,false);persist();renderBoard();try{renderTop3()}catch(e){}
}
/* pull the WYZ-Done label from every connected Gmail, so Done on one device is Done everywhere */
let doneSyncAt=0;
async function syncDone(){
  if(!mcp||Date.now()-doneSyncAt<120000)return;doneSyncAt=Date.now();
  try{const r=await mcp.callTool("Gmail","search_threads",{query:"label:"+DONE_LBL,pageSize:100},{cache:false});
    let n=0;((r.payload&&r.payload.threads)||[]).forEach(x=>{const t=slimThread(x);const un=state.undone&&state.undone[t.id];
      if(!state.done[t.id]&&!(un&&un>Date.now()-600000)){state.done[t.id]=Date.parse(t.date)||Date.now();n++}
      const k=issueKey(t);if(k){state.doneIssue=state.doneIssue||{};if(!state.doneIssue[k])state.doneIssue[k]=state.done[t.id]||Date.now()}});
    if(n){persist();renderBoard();try{renderTop3()}catch(e){}}
  }catch(e){}
}
const isOff=i=>doneNow(i)||(state.snooze[i.id]&&state.snooze[i.id]>todayKey())||!!(state.handoffs&&state.handoffs[i.id]&&(state.handoffs[i.id].status==="waiting"||state.handoffs[i.id].status==="replied"));
function reminderItems(){
  const c=state.chase||{},today=todayKey(),out=[];
  Object.keys(c).forEach(id=>{
    const t=threads.find(x=>x.id===id);if(!t)return;
    const td=t.date?Date.parse(t.date):0;
    if(!t.lastFromMe&&td>(c[id].at||0)){delete c[id];return}   /* someone wrote back after we sent */
    if(c[id].due<=today&&!c[id].fired){c[id].fired=1;delete state.done[id];persist()}
    if(c[id].fired)out.push({id,st:"follow",g:3,title:"No reply yet: "+(t.subject||c[id].title),summary:"You asked to be reminded. Chase "+(nameOf(c[id].to||(t.lastTo||[])[0])||"them")+" or mark it done.",when:"Reminder set for "+niceDay(c[id].due)});
  });
  return out;
}
/* ---------- company tabs: WYZ Rent, SAMOCO, Personal, Other ---------- */
const CO_DEFAULT=""+BR.co+": wyzrent.com, hostaway, airbnb, booking.com, guest, owner, check-in, listing, holiday home\nSAMOCO: samoco, spc, deir, concession, ueg, petroleum, oil field\nPersonal: gmail.com, hotmail.com, icloud.com, yahoo.com, outlook.com";
function coRules(){return String(state.coRules!=null?state.coRules:CO_DEFAULT).split("\n").map(l=>{const m=l.match(/^\s*([^:]{1,30}):(.*)$/);return m?{name:m[1].trim(),keys:m[2].split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)}:null}).filter(r=>r&&r.name&&r.keys.length).slice(0,6)}
function coOf(i){const t=tById(i.id)||{};const h=[t.from,(t.lastTo||[]).join(" "),t.subject,t.snippet,i.title].join(" ").toLowerCase();for(const r of coRules()){if(r.keys.some(k=>h.indexOf(k)>=0))return r.name}return "Other"}
function drawCoChips(items){
  const f=$("coFilters");if(!f)return;f.replaceChildren();
  const live=items.filter(i=>!isOff(i)),names=coRules().map(r=>r.name).concat("Other"),n={};live.forEach(i=>{const c=coOf(i);n[c]=(n[c]||0)+1});
  if(coFlt&&!n[coFlt])coFlt=null;
  const used=names.filter(x=>n[x]);f.hidden=used.length<2&&!coFlt;if(f.hidden)return;
  const mk=(label,val,cnt)=>{const b=el("button","chip");b.type="button";b.append(el("span","",label));if(cnt!=null)b.append(el("b","",String(cnt)));b.setAttribute("aria-pressed",String(coFlt===val));b.onclick=()=>{coFlt=val;renderBoard()};f.append(b)};
  mk("All companies",null,live.length);used.forEach(x=>mk(x,x,n[x]));
}
$("coRules").onchange=()=>{const v=$("coRules").value.trim();state.coRules=v===CO_DEFAULT.trim()?null:v;coFlt=null;persist();renderBoard()};
/* ---------- who owes me a reply ---------- */
function renderOwed(){
  const c=$("owedCard"),h=$("owedList");if(!c||!h)return;h.replaceChildren();
  const by={};
  allItems().filter(i=>(i.st==="wait"||i.st==="follow")&&!isOff(i)).forEach(i=>{
    const t=tById(i.id);if(!t||!t.lastFromMe)return;
    const to=(t.lastTo||[])[0]||"",key=addrOf(to).toLowerCase()||to;if(!key)return;
    const d=t.daysSinceLast==null?0:t.daysSinceLast;
    (by[key]=by[key]||{name:nameOf(to)||key,max:0,list:[]}).list.push({i,t,d});by[key].max=Math.max(by[key].max,d);
  });
  const people=Object.values(by).sort((a,b)=>b.max-a.max).slice(0,12);
  c.hidden=!people.length;if(!people.length)return;
  people.forEach(p=>{
    const row=el("div","item");row.append(el("span","dot "+(p.max>=3?"follow":"wait")));const m=el("div","main");
    m.append(el("span","t",p.name+" · "+p.list.length+" email"+(p.list.length>1?"s":"")),el("span","m","Longest wait: "+(p.max===0?"since today":p.max+" day"+(p.max>1?"s":""))));
    p.list.sort((a,b)=>b.d-a.d).forEach(x=>{
      const a=el("div","acts");a.style.alignItems="center";
      const s=el("span","s",(x.t.subject||x.i.title||"")+" · "+(x.d===0?"today":x.d+"d"));s.style.flex="1 1 200px";
      const ch=el("button","btn small solid","Chase");ch.type="button";ch.onclick=()=>openThread(x.i.id,{item:x.i,draft:true});
      const rd=el("button","btn small ghost","Read");rd.type="button";rd.onclick=()=>openThread(x.i.id,{item:x.i});
      const dn=el("button","btn small ghost","Got it");dn.type="button";dn.title="They answered somewhere else, or it no longer matters";dn.onclick=()=>markDone(x.i);
      a.append(s,ch,rd,dn);m.append(a);
    });
    row.append(m);h.append(row);
  });
}
/* ---------- noise digest: newsletters and notifications from the last day, in a few lines ---------- */
const NOISE_Q="in:inbox newer_than:1d (category:promotions OR category:updates OR category:social OR category:forums OR from:noreply OR from:no-reply OR from:notifications OR from:newsletter)";
async function noiseDigest(){
  const host=infoOpen("📰 Noise digest");
  if(!mcp||G.mainType()==="ms"){host.append(el("p","status","This works with a Gmail account."));return}
  const st=el("p","status","Reading the last day's newsletters and notifications...");host.append(st);
  let list=[];
  try{const r=await mcp.callTool("Gmail","search_threads",{query:NOISE_Q,pageSize:40,account:0},{cache:false});const vip=(state.rules&&state.rules.vip)||[];list=((r.payload&&r.payload.threads)||[]).map(slimThread).filter(t=>!ruleHit(vip,addrOf(t.from).toLowerCase()))}
  catch(e){st.className="status err";st.textContent="Couldn't read Gmail just now ("+clip((e&&e.message)||"unknown reason",90)+").";return}
  if(!list.length){st.textContent="Nothing. No newsletters or notifications in the last day.";return}
  st.textContent=list.length+" newsletters and notifications in the last day.";
  const sum=el("div","out","");host.append(sum);
  if(sample){
    sum.textContent="Summing them up...";
    try{
      const r=await creditFallback(prov=>sample("These are newsletters and automatic notifications from one person's inbox in the last day. The person works at "+BR.co+", "+BR.desc+". Write at most 6 short lines. First anything that needs action (a payment due, a security alert, a booking or account problem), each starting with \"Action:\". Then the few things worth knowing. Skip pure marketing. Plain English, no em dashes, no headings.\n\n"+JSON.stringify(list.map(t=>({from:nameOf(t.from),subject:t.subject,snippet:t.snippet.slice(0,200)}))),{cache:false,provider:prov}));
      sum.textContent=String(r.text||"").trim()||"Nothing worth knowing.";
    }catch(e){sum.textContent="Couldn't sum them up ("+clip((e&&e.message)||"unknown reason",80)+"). The list is below."}
  }else sum.remove();
  const d=document.createElement("details");d.append(el("summary","status","See all "+list.length));
  list.forEach(t=>{const r=el("div","acts");r.style.alignItems="center";const s=el("span","s",nameOf(t.from)+": "+t.subject);s.style.flex="1 1 200px";r.append(s);if(t.url){const o=el("a","btn small ghost","Open");o.href=t.url;o.target="_blank";o.rel="noopener";r.append(o)}d.append(r)});
  host.append(d);
  const arch=el("button","btn small","Archive all "+list.length);arch.type="button";let armed=0;
  arch.onclick=async()=>{
    if(!armed){armed=1;arch.textContent="Confirm: archive "+list.length+" (not deleted)";return}
    arch.disabled=true;const done=[];
    for(const t of list){arch.textContent="Archiving "+(done.length+1)+" of "+list.length+"...";try{await mcp.callTool("Gmail","archive_thread",{threadId:t.id});done.push(t.id)}catch(e){if(e&&e.code==="consent_required")break}}
    arch.textContent="Archived "+done.length;
    toastUndo("Archived "+done.length+" newsletters and notifications.",async()=>{for(const id of done){try{await mcp.callTool("Gmail","modify_thread",{threadId:id,add:["INBOX"]})}catch(e){}}toast("Put back in your inbox.");refreshAll(true)});
    refreshAll(true);
  };
  const a=el("div","acts");a.append(arch);host.append(a);
}
/* ---------- report a problem to the owner, with a screenshot ---------- */
function openReport(){
  const owner=String((window.WYZ_CONFIG&&WYZ_CONFIG.OWNER_EMAIL)||"").trim();
  const host=infoOpen("🐞 Report a problem");
  if(!owner){host.append(el("p","status err","The owner's email isn't set yet (OWNER_EMAIL in config.js)."));return}
  host.append(el("p","status","Say what went wrong or what you'd like changed. It goes by email from your account to "+owner+", with the version of the page and your device, so it can be fixed fast."));
  const ta=el("textarea","in");ta.rows=5;ta.style.minHeight="110px";ta.placeholder="Example: when I press Reply here on my phone, the box is cut off at the bottom.";ta.setAttribute("aria-label","What went wrong");
  const file=document.createElement("input");file.type="file";file.accept="image/*";file.hidden=true;let shot=null;
  const pick=el("button","btn small ghost","📷 Add a screenshot");pick.type="button";pick.onclick=()=>file.click();
  const st=el("p","status","");
  file.onchange=()=>{const f=file.files&&file.files[0];if(!f)return;if(f.size>8000000){st.className="status err";st.textContent="That picture is too big. Use one under 8 MB.";return}const rd=new FileReader();rd.onload=()=>{const m=/^data:([^;]+);base64,(.*)$/.exec(String(rd.result));if(m){shot={name:f.name||"screenshot.png",type:m[1],data:m[2]};pick.textContent="📷 "+clip(shot.name,30)}};rd.readAsDataURL(f)};
  const send=el("button","btn small solid","Send report");send.type="button";let armed=0;
  send.onclick=async()=>{
    const t=ta.value.trim();if(t.length<5){st.className="status err";st.textContent="Describe the problem first.";ta.focus();return}
    if(!armed){armed=1;send.textContent="Confirm: send to "+owner;st.className="status";st.textContent="Press Confirm to send it.";return}
    send.disabled=true;send.textContent="Sending...";
    const v=window.WYZ_VERSION||{};
    const body=t+"\n\n---\nFrom: "+(myName||"")+" <"+(email||"")+">\nPage version: "+(v.version||"?")+"\nSent: "+new Date().toLocaleString("en-GB",{timeZone:"Asia/Dubai"})+" Dubai time\nDevice: "+navigator.userAgent+"\nScreen: "+innerWidth+" x "+innerHeight+"\n\nTo fix it: open the page, tap 🛠 Fix the app and paste the problem above.";
    try{await mcp.callTool("Gmail","send_message",{to:[owner],cc:[],subject:"Execution Page problem: "+clip(t,60),body,attachments:shot?[shot]:[]});send.textContent="Sent";st.className="status";st.textContent="Sent to "+owner+". Thank you."}
    catch(e){armed=0;send.disabled=false;send.textContent="Send report";st.className="status err";st.textContent="Couldn't send it ("+clip((e&&e.message)||"unknown reason",90)+")."}
  };
  const a=el("div","acts");a.append(send,pick,file);host.append(ta,a,st);
}
$("reportBtn").onclick=()=>{if(!G.connected()){showWelcome();return}openReport()};
$("noiseGo").onclick=()=>{if(!G.connected()){showWelcome();return}noiseDigest()};
const ruleAddr=t=>t?addrOf(t.lastFromMe?(t.lastTo||[])[0]:t.from).toLowerCase():"";
const ruleHit=(list,a)=>!!a&&(list||[]).some(r=>r===a||(r.charAt(0)==="@"&&a.endsWith(r)));
function applyRules(items){
  const r=state.rules||{};if(!(r.vip&&r.vip.length)&&!(r.mute&&r.mute.length))return items;
  return items.filter(i=>!ruleHit(r.mute,ruleAddr(tById(i.id)))).map(i=>ruleHit(r.vip,ruleAddr(tById(i.id)))?Object.assign({},i,{g:4,vip:1,st:(i.st==="fyi"||i.st==="wait"||i.st==="work")?"reply":i.st}):i);
}
const allItems=()=>{const rem=board?reminderItems():[];const ids=new Set(rem.map(r=>r.id));return applyRules((board&&board.items||[]).filter(x=>!ids.has(x.id)).concat(rem))};
const backFirst=i=>state.snooze[i.id]===todayKey()?1:0;
function logDone(i,kind){state.log=(state.log||[]).concat({t:String(i.title||i.id).slice(0,120),at:Date.now(),k:kind||""}).slice(-300)}
function markDone(i){
  if(state.repeat&&state.repeat[i.id]){logDone(i,"weekly");snoozeUntil(i.id,7);return}
  setDone(i.id);logDone(i);persist();renderBoard();try{renderTop3()}catch(e){}
}
function renderBoard(){
  try{updateHero()}catch(e){}
  const host=$("board");host.replaceChildren();
  if(!board){return}
  $("headline").textContent=board.headline||"";
  const itemsAll=allItems().slice().sort((a,b)=>ORDER.indexOf(a.st)-ORDER.indexOf(b.st)||backFirst(b)-backFirst(a)||b.g-a.g);
  try{drawCoChips(itemsAll)}catch(e){}
  const items=coFlt?itemsAll.filter(i=>coOf(i)===coFlt):itemsAll;
  const vis=items.filter(i=>showOff||!isOff(i));
  // filters
  const f=$("filters");f.replaceChildren();
  ORDER.forEach(k=>{const n=items.filter(i=>i.st===k&&!isOff(i)).length;if(!n)return;const b=el("button","chip");b.type="button";b.append(el("span","dot "+k),el("span","",ST[k]),el("b","",String(n)));b.setAttribute("aria-pressed",String(flt===k));b.onclick=()=>{flt=flt===k?null:k;renderBoard()};f.append(b)});
  const offN=items.filter(isOff).length;$("showOff").textContent=(showOff?"Hide":"Show")+" done and snoozed ("+offN+")";
  const pins=flt?[]:vis.filter(i=>isPinned(i.id)&&!isOff(i));
  if(pins.length){const g=el("div","card group");const h=el("h3");h.append(el("span","","📌 "),el("span","","Pinned"),el("span","n",pins.length+" item"+(pins.length>1?"s":"")));g.append(h);makeCollapsible(g,"g-pin",h);pins.forEach(i=>g.append(itemRow(i)));host.append(g)}
  ORDER.forEach(k=>{
    if(flt&&flt!==k)return;const list=vis.filter(i=>i.st===k&&!pins.includes(i));if(!list.length)return;
    const g=el("div","card group");const h=el("h3");h.append(el("span","dot "+k),el("span","",ST[k]),el("span","n",list.length+" item"+(list.length>1?"s":"")));g.append(h);makeCollapsible(g,"g-"+k,h);
    list.forEach(i=>g.append(itemRow(i)));host.append(g);
  });
  if(!vis.length&&(board.items||[]).length)host.append(el("p","sub","All clear. Everything is done or snoozed."));
  applyCol();updateBadge();
  try{renderTop3();renderHandoffs();renderOwed()}catch(e){}
}
/* select several emails and act on them together */
let selOn=false;const sel=new Set();
function visibleIds(){return allItems().filter(i=>showOff||!isOff(i)).filter(i=>!flt||i.st===flt).filter(i=>!coFlt||coOf(i)===coFlt).map(i=>i.id)}
async function bulkArchive(btn){
  const ids=[...sel];let ok=0,bad=0,first=null;btn.disabled=true;
  for(let n=0;n<ids.length;n++){
    btn.textContent="Archiving "+(n+1)+" of "+ids.length+"...";
    try{await mcp.callTool("Gmail","archive_thread",{threadId:ids[n]});setDone(ids[n]);logDone(allItems().find(x=>x.id===ids[n])||{id:ids[n]},"archived");ok++}catch(e){bad++;first=first||e;if(e&&e.code==="consent_required")break}
  }
  persist();sel.clear();renderBoard();bulkBar();
  const b=$("bulkBar");b.hidden=false;b.replaceChildren(el("span","status"+(bad?" err":""),ok+" archived"+(bad?", "+bad+" failed ("+clip((first&&first.message)||"unknown reason",70)+")":".")));
  if(first&&first.code==="consent_required"){const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>connectGoogle(true);b.append(l)}
  setTimeout(bulkBar,bad?6000:1800);
}
function bulkBar(){
  const b=$("bulkBar");b.replaceChildren();
  if(!selOn){b.hidden=true;return}
  b.hidden=false;
  const n=sel.size;b.append(el("b","",n?n+" selected":"Tick the emails you want"));
  const btn=(t,fn,cls)=>{const x=el("button","btn small"+(cls?" "+cls:""),t);x.type="button";x.onclick=()=>fn(x);b.append(x);return x};
  btn("Select all shown",()=>{visibleIds().forEach(id=>sel.add(id));renderBoard();bulkBar()},"ghost");
  if(n){
    btn("Done",()=>{allItems().filter(i=>sel.has(i.id)).forEach(i=>{if(state.repeat&&state.repeat[i.id]){logDone(i,"weekly");const d=new Date();d.setDate(d.getDate()+7);state.snooze[i.id]=ymd(d)}else{setDone(i.id);logDone(i)}});persist();sel.clear();renderBoard();bulkBar()},"solid");
    const d=el("details","askdd");d.append(el("summary","","Snooze ▾"));const m=el("div","askmenu");
    [["Tomorrow",1],["In 3 days",3],["In 1 week",7]].forEach(([t,days])=>{const x=el("button","",t);x.type="button";x.onclick=()=>{const dd=new Date();dd.setDate(dd.getDate()+days);const v=ymd(dd);sel.forEach(id=>{state.snooze[id]=v});persist();sel.clear();renderBoard();bulkBar()};m.append(x)});
    d.append(m);b.append(d);
    btn("Archive in Gmail",x=>{if(confirm("Archive "+n+" conversation"+(n>1?"s":"")+" in Gmail? They leave your inbox but are not deleted."))bulkArchive(x)});
    btn("Mute senders",()=>{let c=0;sel.forEach(id=>{const t=tById(id);const a=t&&addrOf(t.from);if(a&&addRule("mute",a))c++});sel.clear();renderBoard();bulkBar();const s=el("span","status","Muted "+c+" sender"+(c===1?"":"s")+".");b.append(s)},"ghost");
    btn("Clear",()=>{sel.clear();renderBoard();bulkBar()},"ghost");
  }
}
$("autoDraft").onchange=()=>{state.autoDraft=$("autoDraft").checked;persist()};
$("selMode").onclick=()=>{selOn=!selOn;sel.clear();$("selMode").setAttribute("aria-pressed",String(selOn));$("selMode").textContent=selOn?"Stop selecting":"Select several";renderBoard();bulkBar()};
/* draft a reply for every email that needs one, saved to Gmail drafts and never sent */
let drafting=false;
function targetsFor(msgs){
  const last=msgs[msgs.length-1]||{},mine=myAddr();
  const fromMe=addrOf(last.sender).toLowerCase()===mine;
  return (fromMe?addrs(last.toRecipients):[addrOf(last.replyTo||last.sender)]).filter(x=>x&&x.toLowerCase()!==mine);
}
async function draftOne(i){
  const full=await mcp.callTool("Gmail","get_thread",{threadId:i.id,messageFormat:"PLAIN_TEXT"},{cache:false});
  const msgs=(full.payload&&full.payload.messages)||[];if(!msgs.length)throw new Error("empty conversation");
  const last=msgs[msgs.length-1],to=targetsFor(msgs);if(!to.length)throw new Error("nobody to reply to");
  const t=tById(i.id)||{},subj=String(t.subject||i.title||"");
  const tone=await toneExamples();
  const r=await creditFallback(prov=>sample("Write a reply email for "+(myName||"me")+" at "+BR.co+". Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject, no quoted text."+(tone?"\n\n"+tone:"")+"\n\nWhat it's about: "+(i.title||"")+". "+(i.summary||"")+"\n\nThread (latest last):\n"+threadBlock(msgs),{cache:false,provider:prov}));
  let body=String(r.text||"").trim();if(!body)throw new Error("the AI sent back nothing");
  const sg=sigText();if(sg&&!body.includes(sg))body+="\n\n"+sg;
  await mcp.callTool("Gmail","create_draft",{to,cc:[],subject:/^re:/i.test(subj)?subj:"Re: "+subj,body:body+quoteOf(last),replyToMessageId:last.id,attachments:[]});
  state.drafted=state.drafted||{};state.drafted[i.id]=Date.now();persist();
}
async function draftAll(auto){
  const st=$("draftAllSt"),btn=$("draftAll");
  if(drafting)return;
  if(!sample){st.className="status err";st.textContent="Connect Claude or ChatGPT first, under Settings.";return}
  const todo=allItems().filter(i=>i.st==="reply"&&!isOff(i)&&!(state.drafted||{})[i.id]).slice(0,8);
  if(!todo.length){if(!auto){st.className="status";st.textContent="Nothing needs a new draft. Every reply-today email already has one or is done."}return}
  drafting=true;btn.disabled=true;let ok=0,bad=0,stop="";
  for(let n=0;n<todo.length;n++){
    st.className="status";st.textContent="Writing draft "+(n+1)+" of "+todo.length+"...";
    try{await draftOne(todo[n]);ok++}catch(e){
      bad++;
      if(e&&e.code==="consent_required"){stop="Google needs one more permission to save drafts. Sign out and in again and tick every box.";break}
      if(isCreditErr(e)||(e&&e.code==="rate_limited")){stop=(e.message||"The AI is unavailable right now")+" Stopped after "+ok+".";break}
    }
  }
  drafting=false;btn.disabled=false;renderBoard();
  st.className="status"+(stop||(bad&&!ok)?" err":"");st.replaceChildren();
  st.append(document.createTextNode(ok?ok+" draft"+(ok>1?"s":"")+" saved in your Gmail drafts. Check them there and send. ":"No drafts were saved. "));
  if(bad&&!stop)st.append(document.createTextNode(bad+" could not be written. "));
  if(stop)st.append(document.createTextNode(stop+" "));
  if(ok){const a=el("a","btn small","Open Gmail drafts");a.href="https://mail.google.com/mail/?authuser="+encodeURIComponent(email||"")+"#drafts";a.target="_blank";a.rel="noopener";st.append(a)}
}
$("draftAll").onclick=()=>draftAll(false);
function itemRow(i){
  const t=tById(i.id)||{};const row=el("div","item");if(isOff(i))row.style.opacity=".55";
  row.append(el("span","dot "+i.st));const m=el("div","main");
  {const ttl=el("span","t");if(selOn){const cb=el("input","selbox");cb.type="checkbox";cb.checked=sel.has(i.id);cb.setAttribute("aria-label","Select this email");cb.onchange=()=>{cb.checked?sel.add(i.id):sel.delete(i.id);bulkBar()};ttl.append(cb)}ttl.append(document.createTextNode(i.title||t.subject||""));m.append(ttl)}
  if(i.summary)m.append(el("span","s",i.summary));
  const meta=el("span","m");const u=el("span","urg u"+i.g,UR[i.g]||"");meta.append(u,(isPinned(i.id)?" · 📌 Pinned":"")+(i.vip?" · \u2605 VIP":"")+(state.snooze[i.id]===todayKey()?" · Back today":"")+(doneNow(i)?(newSinceDone(i)?" · Done. New message since, kept off your board":" · Done"):"")+(state.repeat&&state.repeat[i.id]?" · Weekly":"")+(state.drafted&&state.drafted[i.id]?" · Draft ready in Gmail":"")+" · "+(t.lastFromMe?"You wrote to "+(nameOf((t.lastTo||[])[0])||"them"):(nameOf(t.from)||""))+(i.when?" · "+i.when:t.date?" · "+fmtWhen(t.date):""));m.append(meta);
  const a=el("div","acts");
  if(t.url){const o=el("a","btn small","Open in Gmail");o.href=t.url;o.target="_blank";o.rel="noopener";a.append(o)}
  {const rd=el("button","btn small","Read thread");rd.type="button";rd.onclick=()=>openThread(i.id,{item:i});a.append(rd)}
  if(i.st==="reply"||i.st==="follow"||i.st==="work"||i.st==="wait"){const chase=i.st==="follow"||i.st==="wait";
    const q=el("button","btn small solid",chase?"Chase here":"Reply here");q.type="button";q.title="Write and send the answer right here";q.onclick=()=>draftFor(i,m,q);a.append(q);
    const d=el("button","btn small",chase?"Open to chase":"Open to reply");d.type="button";d.onclick=()=>openThread(i.id,{item:i,draft:true});a.append(d)}
  const dn=el("button","btn small ghost",(state.done[i.id]||doneNow(i))?"Undo done":"Done");dn.type="button";dn.onclick=()=>{if(state.done[i.id]||doneNow(i))undoDone(i.id);else markDone(i)};
  const pn=el("button","btn small ghost",isPinned(i.id)?"Unpin":"📌 Pin");pn.type="button";pn.title="Keep it at the top until it's done";pn.onclick=()=>togglePin(i.id);
  const sz=snoozeDrop(i.id);const ib=el("div","instr");const ins=el("button","btn small ghost","Instruct AI");ins.type="button";ins.onclick=()=>toggleInstruct(i,ib);
  const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask(i.title||t.subject,"Email from "+nameOf(t.from));at.textContent="Added";at.disabled=true};
  a.append(askDrop("I need help with an email. From: "+(t.lastFromMe?"me, to "+((t.lastTo||[]).join(", ")):(t.from||""))+". Subject: "+(t.subject||"")+". What it's about: "+(i.summary||t.snippet||"")+" What's the best way to handle it? If a reply or chaser is needed, draft one I can edit.",(i.title||t.subject||"")+(i.summary?"\n"+i.summary:"")),dn,sz,pn,at,ins);m.append(a,ib);row.append(m);return row;
}
async function draftFor(i,host,btn){
  btn.disabled=true;btn.textContent="Reading the thread";
  let full=null,msgs=[];
  try{full=await mcp.callTool("Gmail","get_thread",{threadId:i.id,messageFormat:"PLAIN_TEXT"},{cache:false});msgs=(full.payload&&full.payload.messages)||[]}catch(e){}
  const text=msgs.slice(-6).map(x=>"From: "+(x.sender||"")+"\nDate: "+(x.date||"")+"\n"+String(x.plaintextBody||x.plaintext_body||x.snippet||"").slice(0,3000)).join("\n\n---\n\n");
  const toRow=el("div","ask");const toSel=el("select","in");toSel.style.flex="0 1 220px";toSel.setAttribute("aria-label","Reply to");
  toSel.append(new Option("Reply to sender only","sender"),new Option("Reply to everyone (all)","all"));toRow.append(toSel);
  const remSel=el("select","in");remSel.style.flex="0 1 230px";remSel.setAttribute("aria-label","Remind me if no reply");
  [["0","No reminder"],["2","Remind me if no reply in 2 days"],["3","Remind me if no reply in 3 days"],["7","Remind me if no reply in 1 week"]].forEach(([v,t])=>remSel.append(new Option(t,v)));remSel.value="3";toRow.append(remSel);
  const ccRow=el("div","ask");const ccIn=el("input","in");ccIn.placeholder="Add people (Cc), type a name or email";ccIn.setAttribute("aria-label","Add people to Cc");ccIn.autocomplete="off";ccRow.append(el("span","status","Cc"),ccIn);
  const dirRow=el("div","ask");const dirIn=el("input","in");dirIn.placeholder="Your direction for the answer (optional)";dirIn.setAttribute("aria-label","Your direction for the answer");
  const dirGo=el("button","btn small","Write it my way");dirGo.type="button";dirRow.append(dirIn,dirGo);
  const box=el("div","draftbox");box.append(toRow,ccRow,dirRow);try{attachAutocomplete(ccIn)}catch(e){}const ta=el("textarea");ta.id="d-"+i.id;ta.value="";const st=el("span","status","Writing a draft");
  box.append(st,ta);host.append(box);btn.textContent="Writing";
  try{
    const chase=(i.st==="follow"||i.st==="wait");const tone=sample?await toneExamples().catch(()=>""):"";const r=!sample?{text:templateDraft(i,chase)}:await sample((chase?"Write a short, polite follow-up email chasing an answer that is still owed, ":"Write a reply email ")+"for "+(myName||"me")+" at "+BR.co+". Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject."+(tone?"\n\n"+tone:"")+"\n\nWhat it's about: "+(i.title||"")+". "+(i.summary||"")+"\n\nThread (latest last):\n"+(text||tById(i.id)?.snippet||""),{cache:false,provider:aiPickValue(),onText:u=>{ta.value=u.text}});
    ta.value=r.text;st.textContent="Edit it, then press Send. You confirm before it goes.";
  }catch(e){st.textContent="Couldn't write a draft just now ("+clip((e&&e.message)||"unknown reason",110)+"). Write your own here, then save it.";st.className="status err"}
  btn.remove();
  const acts=el("div","acts");const sv=el("button","btn small","Save as draft");sv.type="button";
  sv.onclick=async()=>{
    sv.disabled=true;sv.textContent="Saving";
    const last=msgs[msgs.length-1]||{};const t=tById(i.id)||{};
    const lastSent=(last.labelIds||[]).includes("SENT");const to=lastSent?addrOf((last.toRecipients||[])[0]||t.from):addrOf(last.sender||t.from);const subj=(t.subject||"").match(/^re:/i)?t.subject:"Re: "+(t.subject||"");
    try{const r=await mcp.callTool("Gmail","create_draft",{to:[to],subject:subj,body:ta.value,replyToMessageId:last.id||t.lastId});
      const p=r.payload||{};sv.textContent="Saved to drafts";if(p.viewUrl){const o=el("a","btn small","Open draft");o.href=p.viewUrl;o.target="_blank";o.rel="noopener";acts.append(o)}}
    catch(e){sv.disabled=false;sv.textContent="Save to Gmail drafts";st.textContent=e&&e.code==="not_in_manifest"?"Saving drafts is turned off for this page. Copy the text instead.":"Couldn't confirm the save. Check your Gmail drafts before trying again.";st.className="status err"}
  };
  const cp=el("button","btn small","Copy text");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(ta.value).then(()=>cp.textContent="Copied").catch(()=>{ta.focus();ta.select()});
  const wa=el("a","btn small","Send on WhatsApp");wa.target="_blank";wa.rel="noopener";wa.href="#";wa.onclick=()=>{wa.href=waLink(ta.value)};wa.onmousedown=wa.ontouchstart=()=>{wa.href=waLink(ta.value)};
  dirGo.onclick=async()=>{dirGo.disabled=true;await writeMyWay(dirIn.value,(i.st==="follow"||i.st==="wait"),text,t=>{ta.value=t;ta.dispatchEvent(new Event("input"))},(m,err)=>{st.className="status"+(err?" err":"");st.textContent=m},i);dirGo.disabled=false};
  dirIn.addEventListener("keydown",e=>{if(e.key==="Enter")dirGo.click()});
  /* Send from the list: Send, then Confirm, like in the email view */
  const sd=el("button","btn small solid","Send");sd.type="button";let armed=0,counting=false,cdT=0,goNow=false;
  const last=()=>msgs[msgs.length-1]||{};
  const target=()=>{const l=last(),t=tById(i.id)||{};const lastSent=(l.labelIds||[]).includes("SENT");return lastSent?addrOf((l.toRecipients||[])[0]||t.from):addrOf(l.replyTo||l.sender||t.from)};
  sd.onclick=async()=>{
    if(counting){clearInterval(cdT);counting=false;armed=0;sd.textContent="Send";ta.disabled=false;ccIn.disabled=false;st.className="status";st.textContent="Cancelled. Nothing was sent.";return}
    if(!ta.value.trim()){st.textContent="Write your reply first.";st.className="status err";return}
    if(/\[(DATE|DETAIL)[^\]]*\]/i.test(ta.value)){st.textContent="Fill in the [DATE] or [DETAIL] part first.";st.className="status err";ta.focus();return}
    const to=target();if(!/^\S+@\S+\.\S+$/.test(to)){st.textContent="Couldn't find who to send it to. Open the email instead.";st.className="status err";return}
    if(ccIn.value.trim()&&ccIn.value.split(/[,;]/).map(x=>x.trim()).filter(Boolean).some(x=>!/^\S+@\S+\.\S+$/.test(addrOf(x)))){armed=0;sd.textContent="Send";st.className="status err";st.textContent="Check the Cc addresses.";ccIn.focus();return}
    if(!armed){const nCc=ccIn.value.split(/[,;]/).filter(x=>/@/.test(x)).length;armed=1;sd.textContent="Confirm: send to "+to+(toSel.value==="all"?" and everyone":"")+(nCc?" + "+nCc+" in Cc":"");st.className="status";st.textContent="Check it, then press Confirm.";return}
    const secs=undoSecs();
    if(secs&&!goNow){counting=true;let left=secs;ta.disabled=true;ccIn.disabled=true;armed=0;
      const tick=()=>{sd.textContent="Undo ("+left+")";st.className="status";st.textContent="Sending to "+to+" in "+left+" second"+(left===1?"":"s")+". Press Undo to stop it."};tick();
      cdT=setInterval(()=>{left--;if(left<=0){clearInterval(cdT);counting=false;goNow=true;armed=1;sd.onclick()}else tick()},1000);return}
    goNow=false;
    sd.disabled=true;sd.textContent="Sending...";
    const mine=new Set(G.accounts().map(x=>String(x.email||"").toLowerCase()).concat([String(email||"").toLowerCase()]));
    const extraCc=ccIn.value.split(/[,;]/).map(x=>addrOf(x.trim()).toLowerCase()).filter(x=>/^\S+@\S+\.\S+$/.test(x));
    const cc0=toSel.value==="all"?[...new Set([addrOf(last().sender)].concat((last().toRecipients||[]).map(addrOf),(last().ccRecipients||[]).map(addrOf)).map(x=>String(x||"").toLowerCase()))].filter(x=>x&&x!==to.toLowerCase()&&!mine.has(x)):[];
    const cc=[...new Set(cc0.concat(extraCc))].filter(x=>x!==to.toLowerCase());
    const t=tById(i.id)||{},l=last(),sg=sigText(),body=ta.value.trimEnd()+(sg&&!ta.value.includes(sg)?"\n\n"+sg:"")+(l.id?quoteOf(l):"");
    const subj=(t.subject||"").match(/^re:/i)?t.subject:"Re: "+(t.subject||"");
    try{await mcp.callTool("Gmail","send_message",{to:[to],cc,subject:subj,body,replyToMessageId:l.id||t.lastId});
      sd.textContent="Sent";st.className="status";st.textContent="Sent to "+to+". Marked as done.";ta.disabled=true;sv.disabled=true;
      setDone(i.id,true);logDone(i);
      const rn=+remSel.value;if(rn>0){const d=new Date();d.setDate(d.getDate()+rn);state.chase=state.chase||{};state.chase[i.id]={due:ymd(d),title:subj,at:Date.now(),to};st.textContent+=" You'll be reminded on "+niceDay(ymd(d))+" if there's no reply."}
      persist();setTimeout(()=>{try{renderBoard()}catch(e){}},1500)}
    catch(e){armed=0;ta.disabled=false;sd.disabled=false;sd.textContent="Send";st.className="status err";st.textContent="Couldn't send it ("+clip((e&&e.message)||"unknown reason",90)+"). Check your sent mail before trying again."}
  };
  ta.addEventListener("input",()=>{if(armed){armed=0;sd.textContent="Send"}});ccIn.addEventListener("input",()=>{if(armed){armed=0;sd.textContent="Send"}});toSel.onchange=()=>{if(armed){armed=0;sd.textContent="Send"}};
  sv.className="btn small";
  acts.prepend(sd);acts.append(sv,cp,wa);box.append(acts);
}
$("showOff").onclick=()=>{showOff=!showOff;renderBoard()};

/* ---------- ask ---------- */
$("askGo").onclick=ask;$("askQ").addEventListener("keydown",e=>{if(e.key==="Enter")ask()});
async function ask(){
  const q=$("askQ").value.trim();if(!q)return;const out=$("askOut");out.hidden=false;
  if(!sample&&chatAI()){const ctx=(board&&board.items||[]).slice(0,25).map(i=>"- "+ST[i.st]+": "+i.title).join("\n");const c=CHAT[chatAI()];out.replaceChildren(outsideOffer({name:c.name,url:c.url,kind:"chat"},"I'm "+(myName||"a "+BR.co+" team member")+". My board today:\n"+ctx+"\n\nQuestion: "+q));return}
  if(!sample){out.textContent="Ask needs an AI connected. Connect Claude or ChatGPT in the setup steps.";return}
  out.textContent="Thinking...";
  let live=[];try{const w=q.replace(/[^\p{L}\p{N}@. ]/gu," ").split(/\s+/).filter(x=>x.length>2&&!/^(the|and|what|did|does|have|from|with|about|any|send|sent|email|emails|mail|today|this|that|who|when|where|why|how)$/i.test(x)).slice(0,4);
    if(w.length){const r=await mcp.callTool("Gmail","search_threads",{query:"("+w.join(" OR ")+") newer_than:90d",pageSize:12},{cache:false});const ts=((r.payload&&r.payload.threads)||[]).map(slimThread);ts.forEach(t=>{if(!tById(t.id))found.push(t)});live=ts.map(t=>({ref:t.id,from:nameOf(t.from)||t.from,subject:t.subject,when:t.date,latest:t.snippet,lastFromMe:t.lastFromMe}))}}catch(e){}
  const ctx={liveMailSearch:live,today:new Date().toString(),board:(board&&board.items||[]).map(i=>({status:ST[i.st],urgency:UR[i.g],title:i.title,summary:i.summary,from:nameOf((tById(i.id)||{}).from)})),calendar:(events||[]).map(e=>({when:e.start&&(e.start.dateTime||e.start.date),what:e.summary}))};
  try{const r=await sample("You help "+(myName||"a "+BR.co+" team member")+" run their day. Answer briefly and plainly, no em dashes. Their board, calendar and a live search of their mail for this question (liveMailSearch, newest mail included, last 90 days) (JSON):\n"+JSON.stringify(ctx)+"\n\nQuestion: "+q+"\n\nAt the very end, on its own line, write USED: followed by the ref values of the liveMailSearch emails your answer relies on, separated by commas, or USED: none.",{cache:false,onText:u=>{out.textContent=String(u.text||"").split(/\n?USED:/)[0]}});
    const parts=String(r.text||"").split(/\n?USED:/),refs=(parts[1]||"").split(",").map(x=>x.trim()).filter(x=>live.some(l=>l.ref===x));
    out.replaceChildren(document.createTextNode(parts[0].trim()));
    if(refs.length){const a=el("div","acts");a.append(el("span","status","From these emails:"));refs.slice(0,6).forEach(id=>{const l=live.find(x=>x.ref===id);const b=el("button","btn small ghost",clip(l.from+": "+l.subject,60));b.type="button";b.onclick=()=>openThread(id);a.append(b)});out.append(a)}}
  catch(e){out.textContent=e&&e.code==="not_granted"?"Allow Claude for this page to use Ask.":"Couldn't answer just now. Try again in a moment."}
}

/* ---------- research: Claude (live or import) + ChatGPT (import) ---------- */
const CLAUDE_SRV="claude_ai";
let claudeLive="no";   // Claude chat history has no connector yet, so it comes in through the export file
const decode=s=>String(s||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
const clip=(s,n)=>{s=String(s||"").replace(/\s+/g," ").trim();return s.length>n?s.slice(0,n-1)+"…":s};
const pick=convs=>{const cut=Date.now()-30*86400000;let r=convs.filter(c=>c.at>=cut);if(r.length<8)r=convs.slice();return r.sort((a,b)=>b.at-a.at).slice(0,25)};
function parseClaudeText(txt){
  const out=[];const re=/<chat url='([^']+)' updated_at='([^']+)'>([\s\S]*?)<\/chat>/g;let m;
  while((m=re.exec(String(txt)))){const body=decode(m[3]);const title=(body.match(/Title:\s*(.+)/)||[])[1]||"Untitled";
    const sum=(body.match(/Summary:\s*([\s\S]+)/)||[])[1]||"";const firstQ=(body.match(/\nH:\s*([\s\S]*?)(\nA:|$)/)||[])[1]||"";
    out.push({src:"claude",id:m[1],url:m[1],title:clip(title,120),at:Date.parse(m[2])||0,asks:[clip(firstQ.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g,""),300)].filter(Boolean),summary:clip(sum,700)})}
  return out;
}
async function readClaudeLive(force){
  if(!mcp){claudeLive="no";renderSetup();return}
  try{
    const r=await mcp.callTool(CLAUDE_SRV,"recent_chats",{n:20},{cache:false});
    const txt=typeof r.payload==="string"?r.payload:(r.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
    const convs=parseClaudeText(txt);claudeLive="yes";
    research.claude={at:Date.now(),via:"live",convs:pick(convs)};saveResearch();renderSetup();followups(force);
  }catch(e){claudeLive="no";renderSetup();renderResearch()}
}
function parseGpt(arr){
  return (Array.isArray(arr)?arr:[]).map(c=>{
    const ms=Object.values(c.mapping||{}).map(n=>n&&n.message).filter(m=>m&&m.author&&m.author.role==="user"&&m.content&&Array.isArray(m.content.parts))
      .sort((a,b)=>(a.create_time||0)-(b.create_time||0)).map(m=>m.content.parts.filter(p=>typeof p==="string").join(" ").trim()).filter(Boolean);
    const id=c.conversation_id||c.id||"";
    return {src:"chatgpt",id,url:id?"https://chatgpt.com/c/"+id:"https://chatgpt.com/",title:clip(c.title||"Untitled",120),at:((c.update_time||c.create_time||0)*1000),asks:[ms[0],ms.length>2?ms[ms.length-2]:null,ms.length>1?ms[ms.length-1]:null].filter(Boolean).map(s=>clip(s,300))};
  });
}
function parseClaudeExport(arr){
  return (Array.isArray(arr)?arr:[]).map(c=>{
    const hs=(c.chat_messages||[]).filter(m=>m.sender==="human").map(m=>m.text||((m.content||[]).map(x=>x.text||"").join(" "))).filter(Boolean);
    return {src:"claude",id:c.uuid||"",url:c.uuid?"https://claude.ai/chat/"+c.uuid:"https://claude.ai/",title:clip(c.name||"Untitled",120),at:Date.parse(c.updated_at||c.created_at)||0,asks:[hs[0],hs.length>1?hs[hs.length-1]:null].filter(Boolean).map(s=>clip(s,300)),summary:clip(c.summary||"",500)};
  });
}
async function readUpload(file){
  if(/\.zip$/i.test(file.name)||file.type.includes("zip")){
    if(!window.JSZip){await new Promise((ok,no)=>{const sc=document.createElement("script");sc.src="../../jszip.min.js";sc.onload=ok;sc.onerror=()=>no(new Error("Couldn't open the .zip here. Unzip it and choose conversations.json instead."));document.head.append(sc)})}
    const z=await JSZip.loadAsync(file);const f=Object.values(z.files).find(x=>/(^|\/)conversations\.json$/i.test(x.name));
    if(!f)throw new Error("That file has no conversations.json inside. Make sure it's the export from Settings.");
    return JSON.parse(await f.async("string"));
  }
  return JSON.parse(await file.text());
}
function wireImport(id,key){
  $(id).addEventListener("change",async e=>{
    const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
    $("resHead").textContent="Reading your "+(key==="chatgpt"?"ChatGPT":"Claude")+" file...";show("t-today");
    try{const data=await readUpload(file);const convs=key==="chatgpt"?parseGpt(data):parseClaudeExport(data);
      if(!convs.length)throw new Error("No conversations found in that file.");
      research[key]={at:Date.now(),via:"import",convs:pick(convs)};saveResearch();renderSetup();followups(true);
      try{const docs=key==="chatgpt"?gptDocs(data):claudeDocs(data);saveAiDocs(key,docs);renderDocs();if(docs.length)toast(docs.length+" "+(key==="chatgpt"?"ChatGPT":"Claude")+" documents added to Documents.")}catch(x){}}
    catch(err){$("resHead").textContent=(err&&err.message)||"Couldn't read that file. Choose the export file from Settings.";}
  });
}
wireImport("f-chatgpt","chatgpt");wireImport("f-claude","claude");

const allConvs=()=>[...((research.claude&&research.claude.convs)||[]),...((research.chatgpt&&research.chatgpt.convs)||[])].sort((a,b)=>b.at-a.at);
async function followups(force){
  const convs=allConvs();renderResearch();
  if(!convs.length)return;
  const sig=convs.map(c=>c.src+":"+c.id+":"+c.at).join("|");
  if(!force&&research.fu&&research.fu.sig===sig)return;
  if(!sample){return}
  $("resHead").replaceChildren(el("span","spin"),"Finding follow-ups in your research...");
  const prompt="You help "+(myName||"a "+BR.co+" team member")+" at "+BR.co+" ("+BR.desc+") pick up research they started in Claude and ChatGPT. Today is "+new Date().toDateString()+".\n\nTheir recent conversations (JSON, newest first; asks are their own questions):\n"+JSON.stringify(convs.map(c=>({key:c.src+":"+c.id,src:c.src,title:c.title,date:new Date(c.at).toDateString(),asks:c.asks,summary:c.summary||undefined})))+
    "\n\nReturn JSON only: {\"headline\": one plain sentence on the main threads of their research, \"items\": [{\"key\": the key, \"topic\": 3-6 word topic, \"where\": one sentence on where they left it, \"next\": one concrete next step to finish or act on it, \"prompt\": a ready-to-send follow-up question they could ask next, \"g\": priority 1-3 (3 = act this week)}]}. "+
    "Include only conversations with real unfinished work or a decision to make, up to 10, highest priority first. Skip small talk and finished one-off questions. Plain words, no em dashes.";
  try{const r=await sample.json(prompt,{modelTier:"default",cache:false});
    const keys=new Set(convs.map(c=>c.src+":"+c.id));
    research.fu={sig,headline:String(r&&r.headline||""),items:((r&&r.items)||[]).filter(x=>x&&keys.has(x.key)),at:Date.now()};
    state.claudeOk=1;saveResearch();renderSetup();renderResearch();}
  catch(e){$("resHead").textContent=e&&e.code==="not_granted"?"Allow Claude in the setup steps to get follow-ups. Your research is listed below meanwhile.":"Couldn't work out follow-ups just now. Your research is listed below.";renderResearch(true)}
}
function renderResearch(keepHead){
  const host=$("research");host.replaceChildren();const convs=allConvs();
  if(!convs.length){if(!keepHead)$("resHead").textContent="Your recent Claude and ChatGPT research shows here, each with a suggested follow-up, once you connect them in the setup steps above.";return}
  const byKey={};convs.forEach(c=>byKey[c.src+":"+c.id]=c);
  const fu=research.fu&&research.fu.items&&research.fu.items.length?research.fu.items:null;
  if(!keepHead)$("resHead").textContent=fu?(research.fu.headline||"Follow-ups from your recent research."):"Your recent research. Follow-ups appear once Claude is allowed.";
  const rows=fu?fu.map(f=>({f,c:byKey[f.key]})).filter(x=>x.c):convs.slice(0,10).map(c=>({f:null,c}));
  rows.forEach(({f,c})=>{
    const r=el("div","rs");const t=el("div","t");t.append(el("span","src",c.src==="claude"?"Claude":"ChatGPT"),el("span","",f?f.topic:c.title));r.append(t);
    if(f){r.append(el("span","s",f.where||""));const nx=el("span","f");nx.append(el("b","","Next: "),f.next||"");r.append(nx);if(f.prompt)r.append(el("span","q","Ask next: "+f.prompt))}
    else if(c.asks&&c.asks[0])r.append(el("span","q",c.asks[0]));
    r.append(el("span","m",c.title+" · "+new Date(c.at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})));
    const a=el("div","acts");
    const op=el("a","btn small ghost","Open conversation ↗");op.href=c.url;op.target="_blank";op.rel="noopener";a.append(op);
    if(f&&f.prompt){
      const q=encodeURIComponent(f.prompt);
      if(sample){const ans=el("div","out");ans.hidden=true;const here=el("button","btn small solid","Answer here");here.type="button";
        here.onclick=async()=>{here.disabled=true;ans.hidden=false;ans.textContent="Thinking...";try{const x=await sample(f.prompt+"\n\nAnswer plainly and briefly. No em dashes.",{cache:false,onText:u=>{ans.textContent=u.text}});ans.textContent=String(x.text||"").trim()}catch(e){ans.textContent="Couldn't answer just now ("+clip((e&&e.message)||"unknown reason",80)+")."}here.disabled=false};
        a.append(here);r.append(ans)}
      const ask=el("a","btn small"+(sample?" ghost":" solid"),(c.src==="claude"?"Continue in Claude":"Continue in ChatGPT")+" ↗");ask.href=c.src==="claude"?"https://claude.ai/new?q="+q:"https://chatgpt.com/?q="+q;ask.target="_blank";ask.rel="noopener";a.append(ask);
      const cp=el("button","btn small ghost","Copy question");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(f.prompt).then(()=>cp.textContent="Copied").catch(()=>cp.textContent="Select the text to copy");a.append(cp);
    }
    a.append(askDrop(f&&f.prompt?f.prompt:"I was researching: "+c.title+". "+((c.asks||[]).join(" ")).slice(0,600)+" Help me pick this up again and tell me the next step."));
    const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask(f?f.next||f.topic:c.title,(c.src==="claude"?"Claude":"ChatGPT")+" research");at.textContent="Added";at.disabled=true};a.append(at);
    r.append(a);host.append(r);
  });
}
let resT=0;
function saveResearch(){
  try{localStorage.setItem(LS+"-res",JSON.stringify(research))}catch(e){}
  if(db&&uid){clearTimeout(resT);resT=setTimeout(()=>{db.collection("data/users/"+uid).doc("research").set({json:JSON.stringify(research)}).catch(()=>{})},1200)}
}
async function loadResearch(){
  try{const l=JSON.parse(localStorage.getItem(LS+"-res")||"null");if(l)research=Object.assign(research,l)}catch(e){}
  if(db&&uid){try{const s=await db.collection("data/users/"+uid).doc("research").get();if(s.exists){const o=JSON.parse(s.data().json||"{}");research=Object.assign({claude:null,chatgpt:null,fu:null},o)}}catch(e){}}
  renderSetup();renderResearch();
}
$("wipeRes").onclick=async()=>{research={claude:null,chatgpt:null,fu:null};try{localStorage.removeItem(LS+"-res")}catch(e){}
  if(db&&uid){try{await db.collection("data/users/"+uid).doc("research").delete()}catch(e){}}$("wipeRes").textContent="Deleted";renderSetup();renderResearch()};

/* ---------- tasks: built-in list + Todoist (optional) ---------- */
const TODO="Todoist";
let todo={state:"unknown",tasks:[],note:""};   // state: unknown | ok | missing | denied | reauth | error
const newId=()=>Math.random().toString(36).slice(2,10);
function addTask(text,src,due,pri){
  text=clip(text,200);if(!text)return;
  state.tasks=state.tasks||[];state.tasks.unshift({id:newId(),t:text,src:src||"",due:due||"",p:+pri||1,done:0,at:Date.now()});
  persist();renderTasks();
  if(todo.state==="ok"&&$("toTodoist")&&$("toTodoist").checked)pushTodoist(text,due);
}
function findList(x,depth){
  if(depth>4||!x)return null;
  if(Array.isArray(x)&&x.length&&typeof x[0]==="object"&&("content" in x[0]||"title" in x[0]))return x;
  if(typeof x==="object")for(const v of Object.values(x)){const r=findList(v,(depth||0)+1);if(r)return r}
  return null;
}
async function loadTodoist(){
  if(!mcp)return;
  try{
    const d=new Date();let input={startDate:ymd(d),daysCount:1,limit:50};
    try{const desc=await mcp.describeTool(TODO,"find-tasks-by-date");const props=(desc&&desc.inputSchema&&desc.inputSchema.properties)||{};
      input={};if("startDate" in props)input.startDate="overdue" in props?ymd(d):"today";if("daysCount" in props)input.daysCount=1;if("limit" in props)input.limit=50;if("overdueOption" in props)input.overdueOption="include-overdue";}catch(e){}
    const r=await mcp.callTool(TODO,"find-tasks-by-date",input,{cache:false});
    const list=findList(r.structuredContent||r.payload,0);
    if(list){todo.tasks=list.slice(0,40).map(t=>({id:String(t.id||""),t:String(t.content||t.title||""),due:String((t.due&&(t.due.date||t.due.string))||t.dueDate||t.due||""),p:t.priority||1})).filter(t=>t.t)}
    else{const txt=typeof r.payload==="string"?r.payload:(r.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
      todo.tasks=txt.split("\n").map(s=>s.replace(/^[-*\d.\s]+/,"").trim()).filter(s=>s&&s.length>2).slice(0,40).map(s=>({id:"",t:s,due:""}))}
    todo.state="ok";todo.note="";
  }catch(e){
    const c=e&&e.code;todo.state=c==="server_not_connected"||c==="selection_required"?"missing":c==="needs_reauth"?"reauth":c==="not_in_manifest"||c==="consent_required"?"denied":"error";
    todo.note=todo.state==="error"?(e&&e.message)||"":"";todo.tasks=[];
  }
  renderTasks();renderSetup();
}
async function completeTodoist(t,btn){
  btn.disabled=true;btn.textContent="Completing";
  try{await mcp.callTool(TODO,"complete-tasks",{ids:[t.id]});todo.tasks=todo.tasks.filter(x=>x!==t);renderTasks()}
  catch(e){btn.disabled=false;btn.textContent="Couldn't complete. Do it in Todoist"}
}
async function pushTodoist(text,due){
  try{await mcp.callTool(TODO,"add-tasks",{tasks:[Object.assign({content:text},due?{dueString:due}:{})]});loadTodoist()}catch(e){$("taskNote").textContent="Saved here. Couldn't also add it to Todoist just now."}
}
function renderTasks(){
  try{updateHero()}catch(e){}
  const host=$("tasks");if(!host)return;host.replaceChildren();
  const mine=(state.tasks||[]).filter(t=>!t.done);
  const rows=[...mine.map(t=>({k:"me",t})),...(todo.state==="ok"?todo.tasks.map(t=>({k:"td",t})):[])];
  const dueOf=r=>String(r.t.due||"").slice(0,10)||"9999-99-99",priOf=r=>r.k==="td"?(r.t.p>=3?2:1):(r.t.p||1);
  rows.sort((a,b)=>dueOf(a)<dueOf(b)?-1:dueOf(a)>dueOf(b)?1:priOf(b)-priOf(a));
  if(!rows.length){const e=el("p","sub","No open tasks. Add one above, or tap Add to tasks on any email or research follow-up.");e.style.padding="0 14px 14px";host.append(e)}
  rows.forEach(({k,t})=>{
    const r=el("div","item");r.append(el("span","dot "+(k==="td"?"work":"follow")));const m=el("div","main");
    m.append(el("span","t",t.t));
    const dd=dueOf({t});const over=dd!=="9999-99-99"&&dd<todayKey();const meta=[k==="td"?"Todoist":"My list",priOf({k,t})>1?"High priority":"",t.src||"",dd!=="9999-99-99"?(over?"Overdue, was due ":"Due ")+niceDay(dd):""].filter(Boolean).join(" · ");const mm=el("span","m",meta);if(over)mm.style.color="var(--d-reply)";m.append(mm);
    const a=el("div","acts");const b=el("button","btn small ghost","Mark done");b.type="button";
    b.onclick=k==="td"?()=>completeTodoist(t,b):()=>{t.done=1;persist();renderTasks()};
    a.append(askDrop("Help me get this task done: "+t.t+(t.due?" (due "+t.due+")":"")+". Break it into concrete steps and tell me what to do first.","Task: "+t.t+(t.due?" (due "+t.due+")":"")),b);m.append(a);r.append(m);host.append(r);
  });
  const done=(state.tasks||[]).filter(t=>t.done).length;$("taskNote").textContent=done?done+" done on your list.":"";
  $("todoWrap").hidden=todo.state!=="ok";
}
$("taskAdd").onclick=()=>{addTask($("taskIn").value,"Added by you",$("taskDue").value,$("taskPri").value);$("taskIn").value="";$("taskDue").value="";$("taskPri").value="1"};
$("taskIn").addEventListener("keydown",e=>{if(e.key==="Enter")$("taskAdd").click()});

/* ---------- "Ask" dropdown on each line ---------- */
function waLink(text){return "https://wa.me/?text="+encodeURIComponent(String(text||"").slice(0,1800))}
function askDrop(prompt,waText){
  const q=encodeURIComponent(String(prompt||"").slice(0,1500));
  const d=el("details","askdd");const sm=el("summary","","Ask \u25BE");sm.title="Ask Claude or ChatGPT, or share on WhatsApp";sm.setAttribute("aria-label","Ask Claude or ChatGPT about this");d.append(sm);
  const m=el("div","askmenu");
  [["Ask Claude","https://claude.ai/new?q="+q],["Ask ChatGPT","https://chatgpt.com/?q="+q]].concat(waText?[["Share on WhatsApp",waLink(waText)]]:[]).forEach(([t,u])=>{const a=el("a","",t);a.href=u;a.target="_blank";a.rel="noopener";a.onclick=()=>{d.open=false};m.append(a)});
  d.append(m);return d;
}
document.addEventListener("click",e=>{document.querySelectorAll("details.askdd[open]").forEach(d=>{if(e.target.isConnected&&!d.contains(e.target))d.open=false})});

/* ---------- Google Drive: recent documents ---------- */
const DRIVE="Google Drive";
let drive={state:"unknown",files:[]};
const DOC_RANGES=[["today","Today"],["week","This week"],["lastweek","Last week"],["month","This month"],["all","All"],["pick","Pick dates"]];
const docRangeKey=()=>DOC_RANGES.some(r=>r[0]===state.docRange)?state.docRange:"week";
function docRange(k){
  const d0=new Date();d0.setHours(0,0,0,0);const mon=new Date(d0);mon.setDate(d0.getDate()-((d0.getDay()+6)%7));
  if(k==="today")return [d0,null];
  if(k==="week")return [mon,null];
  if(k==="lastweek"){const a=new Date(mon);a.setDate(mon.getDate()-7);return [a,mon]}
  if(k==="month")return [new Date(d0.getFullYear(),d0.getMonth(),1),null];
  if(k==="pick"){const f=state.docFrom,t=state.docTo;return [f?new Date(f+"T00:00:00"):null,t?new Date(new Date(t+"T00:00:00").getTime()+864e5):null]}
  return [null,null];
}
function docRangeLabel(k){if(k==="pick"){const f=state.docFrom,t=state.docTo;return f&&t?(f===t?"on "+niceDay(f):"from "+niceDay(f)+" to "+niceDay(t)):f?"since "+niceDay(f):t?"up to "+niceDay(t):"in the dates you pick"}return {today:"today",week:"this week",lastweek:"last week",month:"this month",all:""}[k]||""}
function drawDocRanges(){
  const h=$("docRanges");if(!h)return;h.replaceChildren();const k=docRangeKey();
  DOC_RANGES.forEach(([id,l])=>{const b=el("button","chip",l);b.type="button";b.setAttribute("aria-pressed",String(k===id));b.onclick=()=>{state.docRange=id;persist();drawDocRanges();if(id!=="pick")loadDrive()};h.append(b)});
  const pk=$("docPick");if(pk){pk.hidden=k!=="pick";$("docFrom").value=state.docFrom||"";$("docTo").value=state.docTo||""}
}
async function loadDrive(){
  if(!mcp)return;
  drawDocRanges();
  const k=docRangeKey(),[from,to]=docRange(k),name=($("docQ")&&$("docQ").value.trim())||"";
  if($("docsHead")&&drive.state==="ok")$("docsHead").textContent="Loading...";
  try{
    const r=await mcp.callTool(DRIVE,"list_files",{name,from:from?from.toISOString():"",to:to?to.toISOString():"",pageSize:k==="all"&&!name?25:60},{cache:false});
    const p=r.payload||{};drive.files=(Array.isArray(p.files)?p.files:[]).map(f=>({id:String(f.id||""),t:String(f.title||f.name||"Untitled"),mod:f.modifiedTime||"",ext:String(f.fileExtension||"").toUpperCase(),mime:String(f.mimeType||""),link:String(f.link||""),by:String(f.by||"")})).filter(f=>f.id);
    drive.state="ok";drive.at=Date.now();drive.rk=k;drive.name=name;
  }catch(e){const c=e&&e.code;drive.state=c==="server_not_connected"||c==="selection_required"?"missing":c==="needs_reauth"?"reauth":c==="not_in_manifest"||c==="consent_required"?"denied":"error";drive.files=[];drive.note=(e&&e.message)||""}
  renderDocs();renderSetup();
}
const kindOf=f=>/document/.test(f.mime)?"Doc":/spreadsheet/.test(f.mime)?"Sheet":/presentation/.test(f.mime)?"Slides":/folder/.test(f.mime)?"Folder":(f.ext||"File");
let docResults=null;
function renderDocs(){
  try{renderAiDocs()}catch(e){}
  const host=$("docs");if(!host)return;host.replaceChildren();
  if(drive.state!=="ok"){$("docsHead").textContent=drive.state==="error"?"Couldn't read Google Drive just now. Tap Refresh now.":"The Google Drive files you've been working on show here once Google Drive is connected in the setup steps.";return}
  const lbl=docRangeLabel(drive.rk||docRangeKey()),nm=drive.name?" matching \""+drive.name+"\"":"";
  $("docsHead").textContent=drive.files.length?drive.files.length+" file"+(drive.files.length>1?"s":"")+nm+" changed "+(lbl||"most recently")+", newest first. Updated "+fmtTime(new Date(drive.at||Date.now()).toISOString())+".":"No files"+nm+" changed "+(lbl||"yet")+".";
  (docResults||drive.files).forEach(f=>{
    const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");
    m.append(el("span","t",f.t));m.append(el("span","m",kindOf(f)+(f.mod?" · Changed "+fmtWhen(f.mod):"")+(f.by?" by "+f.by:"")));
    const a=el("div","acts");const o=el("a","btn small","Open");o.href=f.link||"https://drive.google.com/file/d/"+encodeURIComponent(f.id.replace(/^a\d+~/,""))+"/view";o.target="_blank";o.rel="noopener";
    const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask("Finish: "+f.t,"Google Drive");at.textContent="Added";at.disabled=true};
    a.append(o);
    if(fileKind(f.mime,f.t)){const rd=el("button","btn small","Ask AI about it");rd.type="button";rd.onclick=()=>openFileAI(f.t,()=>mcp.callTool("Google Drive","read_file",{fileId:f.id,mimeType:f.mime},{cache:false}).then(r=>r.payload));a.append(rd)}
    a.append(askDrop("I'm working on a document called \""+f.t+"\" ("+kindOf(f)+"). Help me plan what to finish in it next and what to check before I share it.","Document: "+f.t+" https://drive.google.com/file/d/"+f.id+"/view"),at);
    m.append(a);r.append(m);host.append(r);
  });
}

/* ---------- ask the AI about a file: an email attachment or a Google Drive file ---------- */
const IMG_EXT={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp"};
function fileKind(mime,name){
  mime=String(mime||"").toLowerCase();name=String(name||"").toLowerCase();const ext=(name.match(/\.([a-z0-9]+)$/)||[])[1]||"";
  if(mime==="application/pdf"||ext==="pdf")return "pdf";
  if(/^image\/(png|jpe?g|gif|webp)$/.test(mime)||IMG_EXT[ext])return "image";
  if(/^text\//.test(mime)||/^application\/(json|csv|xml)/.test(mime)||/^(txt|csv|md|json|xml)$/.test(ext)||/vnd\.google-apps\.(document|spreadsheet|presentation)$/.test(mime))return "text";
  return "";
}
let fileAI={name:"",load:null,cache:null,hist:[]};
function openFileAI(name,load){
  fileAI={name,load,cache:null,hist:[]};
  $("fileAITitle").textContent=name;$("fileAIQ").value="";$("fileAIOut").replaceChildren();
  $("fileAINote").textContent=sample?"The AI reads this file when you ask. Nothing is saved.":"Connect Claude first, under Settings.";
  const c=$("fileAIChips");c.replaceChildren();
  [["Summarize","Summarize this in five short lines."],["Key dates and amounts","List every date, deadline and amount of money in this file."],["What must I do?","What do I need to do or decide because of this file?"],["Anything risky?","Point out anything unusual, risky or missing that I should check before agreeing."],["Contract check","If this is a contract or offer: who the parties are, the term, fees and payment dates, how to end it, penalties, and anything one-sided against me. If it isn't one, say what kind of document it is."],["Draft my reply","Write a short email reply about this file that I can edit, covering what needs answering or confirming."]].forEach(([l,v])=>{const b=el("button","chip",l);b.type="button";b.onclick=()=>{$("fileAIQ").value=v;runFileAI()};c.append(b)});
  $("fileAI").hidden=false;$("fileAIQ").focus();
}
async function runFileAI(){
  const q=$("fileAIQ").value.trim(),out=$("fileAIOut");if(!q){$("fileAIQ").focus();return}
  if(!sample){out.replaceChildren(el("p","status err","No AI is connected. Connect Claude under Settings."));return}
  const go=$("fileAIGo");go.disabled=true;
  try{
    if(!fileAI.cache){out.replaceChildren(el("p","status","Opening the file..."));fileAI.cache=await fileAI.load()}
    const f=fileAI.cache,blocks=!f.text;
    if(blocks&&!Connectors.ai.avail("claude")){
      const p=el("p","status err","Reading PDFs and pictures needs Claude. ChatGPT here can only read text files. ");const a=el("a","btn small","Open Claude");a.href="https://claude.ai/new";a.target="_blank";a.rel="noopener";p.append(a," and attach the file there.");
      out.replaceChildren(p);go.disabled=false;return;
    }
    out.replaceChildren(el("p","status","Reading..."));
    const ask="You are the personal assistant of "+(myName||"a manager")+" at "+BR.co+", "+BR.desc+". Today is "+new Date().toDateString()+".\nThe file is called \""+fileAI.name+"\".\nTheir question: "+q+"\n\nAnswer in plain, simple words. Use short lines or a short list. No em dashes. If the file doesn't say, say so. Don't guess.";
    /* the file goes with the first question, later questions follow on from the earlier answers */
    const q1=fileAI.hist.length?fileAI.hist[0].q:q,ask1=ask.replace("Their question: "+q,"Their question: "+q1);
    const content=blocks?[{type:f.mime==="application/pdf"?"document":"image",source:{type:"base64",media_type:f.mime,data:f.data}},{type:"text",text:ask1}]:ask1+"\n\nFile text:\n"+String(f.text).slice(0,60000);
    const msgs=[{role:"user",content}];fileAI.hist.forEach((h,k)=>{msgs.push({role:"assistant",content:h.a});msgs.push({role:"user",content:k+1<fileAI.hist.length?fileAI.hist[k+1].q:q})});
    if(!fileAI.hist.length)msgs.length=1;
    const r=await sample(msgs,{cache:false,provider:blocks?"claude":aiPickValue()});
    const ans=String(r.text||"").trim()||"(The AI sent back nothing.)";fileAI.hist.push({q,a:ans});
    out.replaceChildren();
    fileAI.hist.forEach((h,k)=>{
      const box=el("div","");box.style.cssText="border-top:1px solid var(--line);padding-top:8px;margin-top:8px";
      box.append(el("div","status","You asked: "+clip(h.q,140)));const t=el("div","mailtext",h.a);box.append(t);
      if(k===fileAI.hist.length-1){const cp=el("button","btn small ghost","Copy");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(h.a).then(()=>cp.textContent="Copied").catch(()=>cp.textContent="Select the text to copy");const a=el("div","acts");a.append(cp,el("span","status","Ask a follow-up question above."));box.append(a)}
      out.append(box);
    });
    $("fileAIQ").value="";$("fileAIQ").placeholder="Ask a follow-up question";
  }catch(e){
    const p=el("p","status err");
    if(e&&e.code==="consent_required"){p.textContent="Reading files needs one more Google permission. ";const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>connectGoogle(true);p.append(l)}
    else p.textContent="Couldn't read that ("+clip((e&&e.message)||"unknown reason",120)+")."+(/credit/i.test((e&&e.message)||"")?" You can still download the file and attach it in your own Claude or ChatGPT chat.":"");
    out.replaceChildren(p);
  }
  go.disabled=false;
}
$("fileAIGo").onclick=runFileAI;$("fileAIQ").addEventListener("keydown",e=>{if(e.key==="Enter")runFileAI()});
const closeFileAI=()=>{$("fileAI").hidden=true};$("fileAIClose").onclick=closeFileAI;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("fileAI").hidden)closeFileAI()});
async function attachmentLoader(m,f){
  const kind=fileKind(f.type,f.name);
  const raw=await fetchFile(m,f);let b64=raw;
  if(Math.floor(b64.length*3/4)>3000000)throw new Error("That attachment is too big to read here (over 3 MB)");
  b64=b64.replace(/-/g,"+").replace(/_/g,"/");
  if(kind==="text")return {text:new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)))};
  const ext=((f.name||"").toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||"";
  return {data:b64,mime:kind==="pdf"?"application/pdf":(/^image\//.test(f.type)?f.type.replace("jpg","jpeg"):IMG_EXT[ext]||"image/png")};
}

/* ---------- install as an app (home screen icon, full screen) ---------- */
let installEv=null;
const standalone=()=>window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}))}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEv=e;$("installApp").hidden=false;$("installNote").textContent="One tap puts it on your home screen."});
window.addEventListener("appinstalled",()=>{installEv=null;$("installApp").hidden=true;$("installNote").textContent="Installed. Open it from your home screen or apps list."});
/* ---------- device-aware install guide, used in the first-run steps and the Install tab ---------- */
const SITE_URL=location.origin+"/";
const DEV=(()=>{const u=navigator.userAgent||"",ios=/iphone|ipad|ipod/i.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1);
  return {ios,android:/android/i.test(u),phone:ios||/android|mobile/i.test(u),iosOther:ios&&/CriOS|FxiOS|EdgiOS|OPiOS/.test(u),
    macSafari:!ios&&/Macintosh/.test(u)&&/Safari/.test(u)&&!/Chrome|Chromium|Edg\//.test(u),edge:/Edg\//.test(u),
    inApp:/FBAN|FBAV|Instagram|LinkedInApp|Line\/|Snapchat|TikTok|MicroMessenger|; wv\)/.test(u)}})();
function installGuide(host){
  const steps=(...t)=>{const ol=el("ol","steps");t.forEach(x=>ol.append(el("li","",x)));host.append(ol)};
  if(standalone()){host.append(el("p","status","✅ It's installed. You're using the app now."));return}
  if(installEv){const b=el("button","btn solid","Install now");b.type="button";b.onclick=async()=>{installEv.prompt();try{const c=await installEv.userChoice;if(c&&c.outcome==="accepted")b.replaceWith(el("p","status","✅ Installed. Open it from your "+(DEV.phone?"home screen":"apps")+"."))}catch(e){}installEv=null};host.append(b);return}
  if(DEV.ios&&DEV.iosOther)steps("Tap the Share button (square with an arrow) at the top or bottom.","Tap Add to Home Screen. If you don't see it, open this page in Safari instead.","Tap Add.");
  else if(DEV.ios)steps("Tap the Share button (square with an arrow) at the bottom of Safari.","Scroll down and tap Add to Home Screen.","Tap Add. The icon appears on your home screen.");
  else if(DEV.android)steps("Tap the three dots at the top right of Chrome.","Tap Install app (or Add to Home screen).","Tap Install.");
  else if(DEV.macSafari)steps("In the menu bar choose File, then Add to Dock.","Click Add. It opens from the Dock like any app.");
  else steps("Click the install icon at the right end of the address bar (a screen with an arrow).",DEV.edge?"Or open the three dots menu, Apps, then Install this site as an app.":"Or open the three dots menu, Cast, save and share, then Install page as app.","Click Install. Right-click its icon to pin it to the "+(/Mac/.test(navigator.platform)?"Dock":"taskbar")+".");
}
const renderInstHere=()=>{const h=$("instHere");if(h){h.replaceChildren();installGuide(h)}};
$("t-inst").addEventListener("click",renderInstHere);
$("installApp").onclick=async()=>{if(!installEv)return;installEv.prompt();try{await installEv.userChoice}catch(e){}installEv=null;$("installApp").hidden=true};
if(standalone())$("installNote").textContent="You are already using the installed app.";
else if(/iphone|ipad|ipod/i.test(navigator.userAgent))$("installNote").textContent="On iPhone or iPad: tap Share, then Add to Home Screen.";
if(location.hash==="#new-email"){window.addEventListener("load",()=>setTimeout(()=>{try{if(G.connected())openCompose()}catch(e){}},2500))}

/* save an email attachment to a Drive folder */
const safeFile=t=>String(t||"").replace(/[\\/:*?"<>|\u0000-\u001f]/g," ").replace(/\s+/g," ").trim();
async function saveToDrive(m,f,btn){
  const old="Save to Drive";btn.disabled=true;btn.textContent="Saving...";
  try{
    const raw=await fetchFile(m,f);
    if(Math.floor(raw.length*3/4)>15*1024*1024)throw new Error("That file is over 15 MB. Open it in Gmail.");
    const day=String(m.date||"").slice(0,10)||todayKey(),who=safeFile(nameOf(m.sender)||"sender").slice(0,40);
    const name=day+" "+who+" - "+safeFile(f.name||"attachment");
    const folder=(state.driveFolder&&state.driveFolder.trim())||""+BR.co+" Attachments";
    state.driveFolderIds=state.driveFolderIds||{};
    const r=await mcp.callTool("Google Drive","save_file",{name,mime:f.type||"application/octet-stream",data:raw,folder,folderId:state.driveFolderIds[folder]||""},{cache:false});
    const p=r.payload||{};if(p.folderId){state.driveFolderIds[folder]=p.folderId;persist()}
    btn.textContent="Saved to Drive";
    const a=el("a","chip","Open in Drive");a.href=p.link;a.target="_blank";a.rel="noopener";btn.after(a);
  }catch(e){
    btn.disabled=false;btn.textContent=old;
    const st=$("thrSt");st.className="status err";st.replaceChildren();
    if(e&&e.code==="consent_required"){st.append(document.createTextNode("Saving to Drive needs one more Google permission. "));const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>connectGoogle(true);st.append(l)}
    else st.textContent="Couldn't save it to Drive ("+clip((e&&e.message)||"unknown reason",90)+")."
  }
  return true;
}
$("driveFolder").onchange=()=>{state.driveFolder=$("driveFolder").value.trim();persist()};

/* ---------- Read my day aloud ---------- */
function dayScript(){
  const first=(myName||"").split(" ")[0]||"",h=new Date().getHours(),now=Date.now();
  const greet=h<12?"Good morning":h<18?"Good afternoon":"Good evening";
  const out=[greet+(first?", "+first:"")+". Today is "+new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})+"."];
  const open=allItems().filter(i=>!isOff(i));
  const rep=open.filter(i=>i.st==="reply").length,fol=open.filter(i=>i.st==="follow").length;
  out.push(rep||fol?"You have "+(rep?rep+" email"+(rep>1?"s":"")+" to reply to":"")+(rep&&fol?" and ":"")+(fol?fol+" to follow up":"")+".":"Your inbox needs nothing from you right now.");
  const rows=top3Rows().slice(0,5);
  if(rows.length){out.push("Your top "+(rows.length===1?"item":rows.length+" things")+" for today.");rows.forEach((x,i)=>out.push((i+1)+". "+x.title+(x.why?". "+x.why:"")+"."))}
  const ev=(events||[]).filter(e=>e.start&&e.start.dateTime&&ymd(new Date(e.start.dateTime))===todayKey()&&e.status!=="cancelled"&&Date.parse(e.end&&e.end.dateTime||e.start.dateTime)>=now).slice(0,6);
  out.push(ev.length?"You have "+ev.length+" meeting"+(ev.length>1?"s":"")+" left today.":"No more meetings today.");
  ev.forEach(e=>out.push("At "+new Date(e.start.dateTime).toLocaleTimeString("en-GB",{hour:"numeric",minute:"2-digit",hour12:true}).replace(/^0/,"")+", "+(e.summary||"a meeting")+(e.location?", at "+e.location:"")+"."));
  const today=todayKey(),due=(state.tasks||[]).filter(t=>!t.done&&t.due&&t.due<=today);
  if(due.length)out.push(due.length+" task"+(due.length>1?"s are":" is")+" due or overdue: "+due.slice(0,4).map(t=>t.t).join(", ")+".");
  out.push("That is your day.");
  return out.join("\n");
}
let dayTalk={stop:()=>{}};
function openReadDay(){
  const host=infoOpen("Your day, read aloud");
  const synth=window.speechSynthesis;
  if(!synth||!window.SpeechSynthesisUtterance){host.append(el("p","status err","This browser can't read aloud. Use Chrome, Edge or Safari."));return}
  const ctl=el("div","acts"),lang=el("select","in");lang.style.cssText="flex:0 1 140px;padding:5px 8px";lang.setAttribute("aria-label","Language");
  lang.append(new Option("English","en-GB"),new Option("العربية","ar-AE"));
  try{const l=localStorage.getItem("wyz-day-lang");if(l)lang.value=l}catch(e){}
  const play=el("button","btn solid small","⏸ Pause");play.type="button";const stop=el("button","btn small","⏹ Stop");stop.type="button";
  ctl.append(lang,play,stop);host.append(ctl);
  const note=el("p","status");host.append(note);
  const txt=el("div","mailtext");host.append(txt);
  let text=dayScript(),speaking=false,paused=false,runId=0;
  const pickVoice=l=>{const vs=synth.getVoices()||[];return vs.find(v=>v.lang===l)||vs.find(v=>v.lang&&v.lang.toLowerCase().startsWith(l.slice(0,2)))||null};
  const finish=()=>{speaking=false;paused=false;play.textContent="▶ Play again"};
  const say=()=>{
    synth.cancel();runId++;const mine=runId;speaking=true;paused=false;play.textContent="⏸ Pause";
    const lines=text.split("\n").map(x=>x.trim()).filter(Boolean),v=pickVoice(lang.value);
    note.className="status";note.textContent=v?"":(lang.value.startsWith("ar")?"This device has no Arabic voice. Add one in your device's speech settings. Reading in the default voice.":"");
    lines.forEach((ln,i)=>{const u=new SpeechSynthesisUtterance(ln);u.lang=lang.value;if(v)u.voice=v;u.rate=1;u.onend=()=>{if(mine===runId&&i===lines.length-1)finish()};u.onerror=()=>{if(mine===runId)finish()};synth.speak(u)});
  };
  const build=async()=>{
    text=dayScript();
    if(lang.value.startsWith("ar")){
      if(sample){
        note.className="status";note.textContent="Translating to Arabic...";
        try{const r=await creditFallback(prov=>sample("Translate this morning briefing into natural, warm spoken Arabic (Modern Standard, easy to listen to). Keep names, numbers and times. Return only the Arabic text, one line per original line.\n\n"+text,{cache:false,provider:prov}));const t=String(r.text||"").trim();if(t)text=t}
        catch(e){note.className="status err";note.textContent="Couldn't translate it ("+clip((e&&e.message)||"unknown reason",80)+"). Reading in English."}
      }else{note.className="status";note.textContent="Connect Claude or ChatGPT to hear it in Arabic. Reading in English."}
    }
    txt.textContent=text;txt.dir=lang.value.startsWith("ar")&&/[؀-ۿ]/.test(text)?"rtl":"ltr";
    if(!(lang.value.startsWith("ar")&&!/[؀-ۿ]/.test(text)))say();else{lang.value="en-GB";say()}
  };
  play.onclick=()=>{if(!speaking){say();return}if(paused){synth.resume();paused=false;play.textContent="⏸ Pause"}else{synth.pause();paused=true;play.textContent="▶ Resume"}};
  stop.onclick=()=>{synth.cancel();runId++;finish()};
  lang.onchange=()=>{try{localStorage.setItem("wyz-day-lang",lang.value)}catch(e){}synth.cancel();build()};
  dayTalk.stop=()=>{synth.cancel();runId++};
  build();
}
$("readDayBtn").onclick=()=>{if(!G.connected()){showWelcome();return}openReadDay()};

/* ---------- Alerts for urgent mail ---------- */
function alertCandidates(){return allItems().filter(i=>!isOff(i)&&["reply","follow","work"].includes(i.st)&&((i.g||0)>=4||i.vip))}
async function showAlert(title,opts){
  try{
    const reg=navigator.serviceWorker&&navigator.serviceWorker.getRegistration?await navigator.serviceWorker.getRegistration():null;
    if(reg&&reg.showNotification){await reg.showNotification(title,opts);return}
  }catch(e){}
  try{const n=new Notification(title,opts);n.onclick=()=>{window.focus();if(opts.data&&opts.data.thread)openThread(opts.data.thread);n.close()}}catch(e){}
}
function alertFor(i){
  const t=tById(i.id)||{};
  return showAlert((i.vip?"VIP":"Urgent")+": "+(nameOf(t.from)||"New email"),{body:clip((i.title||t.subject||"")+(i.summary?". "+i.summary:""),140),tag:"wyz-"+i.id,icon:"../../icon-192.png",badge:"../../icon-192.png",data:{thread:i.id}});
}
async function maybeAlert(){
  if(!state.alertsOn||!("Notification" in window)||Notification.permission!=="granted")return;
  const cur=alertCandidates();
  if(!state.alertSeeded){state.alerted=cur.map(i=>i.id);state.alertSeeded=1;persist();return}
  const seen=new Set(state.alerted||[]),fresh=cur.filter(i=>!seen.has(i.id));
  if(fresh.length>3){await showAlert(fresh.length+" urgent emails need you",{body:fresh.slice(0,3).map(i=>i.title).join(". "),tag:"wyz-many",icon:"../../icon-192.png"})}
  else for(const i of fresh)await alertFor(i);
  if(fresh.length){state.alerted=Array.from(new Set((state.alerted||[]).concat(cur.map(i=>i.id)))).slice(-300);persist()}
}
$("alertsOn").onchange=async()=>{
  const note=$("alertsNote"),box=$("alertsOn");note.className="status";
  if(!box.checked){state.alertsOn=false;persist();note.textContent="Alerts are off.";return}
  if(!("Notification" in window)){box.checked=false;note.className="status err";note.textContent="This browser can't show alerts. On iPhone, add the page to your Home Screen first, then try again.";return}
  let perm=Notification.permission;
  if(perm==="default"){try{perm=await Notification.requestPermission()}catch(e){}}
  if(perm!=="granted"){box.checked=false;state.alertsOn=false;persist();note.className="status err";note.textContent="Your browser blocked alerts. Allow them for this site in the address bar, then switch this on again.";return}
  state.alertsOn=true;state.alertSeeded=0;persist();note.textContent="Alerts are on. You will be told about new VIP and critical emails.";
  maybeAlert();
};
$("alertTest").onclick=async()=>{
  const note=$("alertsNote");
  if(!("Notification" in window)||Notification.permission!=="granted"){note.className="status err";note.textContent="Switch alerts on first.";return}
  await showAlert("Test alert",{body:"This is what an urgent email alert looks like.",tag:"wyz-test",icon:"../../icon-192.png"});note.className="status";note.textContent="Sent. Check your notifications."
};
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.thread&&G.connected())openThread(e.data.thread)});

/* ---------- PIN lock ---------- */
const LOCK_KEY="wyz-lock";
const lockData=()=>{try{return JSON.parse(localStorage.getItem(LOCK_KEY)||"null")}catch(e){return null}};
const lockSave=d=>{try{if(d)localStorage.setItem(LOCK_KEY,JSON.stringify(d));else localStorage.removeItem(LOCK_KEY)}catch(e){}};
const u8b64=u=>btoa(String.fromCharCode(...u)),b64u8=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
async function pinHash(pin,salt,iter){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
  return u8b64(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:b64u8(salt),iterations:iter},key,256)));
}
async function lockSetPin(pin){
  const old=lockData()||{},salt=u8b64(crypto.getRandomValues(new Uint8Array(16))),iter=150000;
  lockSave({salt,iter,hash:await pinHash(pin,salt,iter),mins:old.mins!=null?old.mins:5,cred:old.cred||"",fails:0,until:0});
}
async function lockCheck(pin){
  const d=lockData();if(!d)return true;
  const h=await pinHash(pin,d.salt,d.iter);let diff=h.length^d.hash.length;for(let i=0;i<h.length;i++)diff|=h.charCodeAt(i)^(d.hash.charCodeAt(i)||0);
  return diff===0;
}
let locked=false,lastActive=Date.now(),lockWait=null;
const bodyKids=()=>[...document.body.children].filter(x=>x.id!=="lock"&&x.tagName!=="SCRIPT");
function lockCover(on){bodyKids().forEach(x=>{if(on)x.setAttribute("inert","");else x.removeAttribute("inert")});$("lock").hidden=!on}
const bioSupported=async()=>{try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())}catch(e){return false}};
async function bioUnlock(){
  const d=lockData();if(!d||!d.cred)return false;
  try{const r=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:"public-key",id:b64u8(d.cred)}],userVerification:"required",timeout:60000}});return !!r}catch(e){return false}
}
/* Ask for the PIN. Resolves true when it is right, or false if the person cancels (only when cancelable). */
function askPin(title,cancelable){
  return new Promise(async resolve=>{
    const d=lockData();if(!d){resolve(true);return}
    $("lockTitle").textContent=title||"Enter your PIN";$("lockPin").value="";$("lockMsg").textContent="";$("lockCancel").hidden=!cancelable;
    $("lockForgot").hidden=!!cancelable;
    $("lockBio").hidden=!(d.cred&&await bioSupported());
    lockCover(true);setTimeout(()=>$("lockPin").focus(),50);
    const done=ok=>{lockWait=null;lockCover(false);resolve(ok)};
    const tryPin=async()=>{
      const dd=lockData()||d,now=Date.now();
      if(dd.until&&dd.until>now){$("lockMsg").textContent="Too many tries. Wait "+Math.ceil((dd.until-now)/1000)+" seconds.";return}
      const pin=$("lockPin").value.trim();if(!/^\d{4,8}$/.test(pin)){$("lockMsg").textContent="Type your 4 to 8 digit PIN.";return}
      $("lockGo").disabled=true;
      let ok=false;try{ok=await lockCheck(pin)}catch(e){}
      $("lockGo").disabled=false;
      if(ok){dd.fails=0;dd.until=0;lockSave(dd);done(true);return}
      dd.fails=(dd.fails||0)+1;if(dd.fails>=5)dd.until=Date.now()+30000*(dd.fails-4);lockSave(dd);
      $("lockPin").value="";$("lockMsg").textContent=dd.until>Date.now()?"Wrong PIN. Too many tries, wait "+Math.ceil((dd.until-Date.now())/1000)+" seconds.":"Wrong PIN. "+(5-dd.fails)+" tries left before a short wait.";
    };
    lockWait={tryPin,done};
    $("lockGo").onclick=tryPin;$("lockPin").onkeydown=e=>{if(e.key==="Enter")tryPin()};
    $("lockCancel").onclick=()=>done(false);
    $("lockBio").onclick=async()=>{if(await bioUnlock())done(true);else $("lockMsg").textContent="That didn't work. Use your PIN."};
    $("lockForgot").onclick=()=>{
      if(!confirm("Sign in with Google again to remove the lock?\nThis page signs you out. Your board stays saved on this device."))return;
      lockSave(null);try{G.signOut()}catch(e){}location.reload();
    };
    if(!cancelable&&d.cred&&await bioSupported())bioUnlock().then(ok=>{if(ok&&lockWait)done(true)});
  });
}
async function lockNow(){
  if(!lockData()||locked)return;
  locked=true;try{speechSynthesis.cancel()}catch(e){}
  await askPin("Enter your PIN",false);locked=false;lastActive=Date.now();
}
["mousemove","keydown","touchstart","click","scroll"].forEach(ev=>window.addEventListener(ev,()=>{if(!locked)lastActive=Date.now()},{passive:true}));
function idleMins(){const d=lockData();return d&&+d.mins>0?+d.mins:0}
setInterval(()=>{const m=idleMins();if(m&&!locked&&Date.now()-lastActive>m*60000)lockNow()},10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){const m=idleMins();if(m&&!locked&&Date.now()-lastActive>m*60000)lockNow()}});
async function lockGate(){if(lockData()){locked=true;await askPin("Enter your PIN",false);locked=false;lastActive=Date.now()}}
async function renderLockCard(){
  const d=lockData();$("lockSetup").hidden=!!d;$("lockOn").hidden=!d;
  if(d)$("lockMins").value=String(d.mins!=null?d.mins:5);
  $("lockBioSet").hidden=!(d&&await bioSupported());
  if(d)$("lockBioSet").textContent=d.cred?"Fingerprint or face: on (tap to remove)":"Use fingerprint or face";
}
$("lockOnBtn").onclick=async()=>{
  const m=$("lockSetMsg"),a=$("lockNew").value.trim(),b=$("lockNew2").value.trim();m.className="status err";
  if(!/^\d{4,8}$/.test(a)){m.textContent="Use 4 to 8 digits for the PIN.";return}
  if(a!==b){m.textContent="The two PINs don't match.";return}
  try{await lockSetPin(a)}catch(e){m.textContent="This browser can't set a PIN here.";return}
  $("lockNew").value="";$("lockNew2").value="";m.className="status";m.textContent="Lock is on. It asks for the PIN when the page opens and after you have been away.";renderLockCard();
};
$("lockMins").onchange=()=>{const d=lockData();if(d){d.mins=+$("lockMins").value;lockSave(d)}};
$("lockNowBtn").onclick=()=>lockNow();
$("lockOffBtn").onclick=async()=>{
  const ok=await askPin("Enter your PIN to turn off the lock",true);
  if(ok){lockSave(null);$("lockSetMsg").className="status";$("lockSetMsg").textContent="Lock is off.";renderLockCard()}
};
$("lockBioSet").onclick=async()=>{
  const d=lockData(),m=$("lockSetMsg");if(!d)return;
  if(d.cred){d.cred="";lockSave(d);m.className="status";m.textContent="Fingerprint or face is off. The PIN still works.";renderLockCard();return}
  try{
    const c=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"WYZ Execution Page"},user:{id:crypto.getRandomValues(new Uint8Array(16)),name:email||"user",displayName:myName||"You"},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required"},timeout:60000}});
    d.cred=u8b64(new Uint8Array(c.rawId));lockSave(d);m.className="status";m.textContent="Fingerprint or face is on. The PIN still works as a backup.";renderLockCard();
  }catch(e){m.className="status err";m.textContent="Couldn't set that up on this device ("+clip((e&&e.name)||"cancelled",40)+"). The PIN still works."}
};
renderLockCard();

/* ---------- quick test of the AI connections ---------- */
$("goCheck").onclick=()=>{
  const t=$("t-today");if(t&&t.getAttribute("aria-selected")!=="true")t.click();
  const c=$("c-test");c.scrollIntoView({behavior:"smooth",block:"start"});
};
$("aiTest").onclick=async()=>{
  const out=$("aiTestOut"),btn=$("aiTest");out.replaceChildren();btn.disabled=true;btn.textContent="Testing...";
  const A=Connectors.ai;
  const rows=[["claude","Claude"],["chatgpt","ChatGPT"]],res={};
  for(const [id,name] of rows){
    const line=el("p","status");out.append(line);
    if(!A.avail(id)){line.className="status err";const ms=A.missing(id);line.textContent=name+": not connected. "+(ms.length?"Vercel is missing "+ms.join(" and ")+". Add "+(ms.length>1?"them":"it")+" in Vercel under Settings, Environment Variables (tick Production), then open Deployments and press Redeploy. A new setting only works after a redeploy. Or paste your own key above.":(id==="claude"?"The owner has not added ANTHROPIC_API_KEY in Vercel, or you have not pasted your own key above.":"The owner has not added OPENAI_API_KEY in Vercel, or you have not pasted your own key above."));continue}
    const mode=A.mode(id)==="key"?"your own key":"the shared key";
    const model=id==="claude"?A.modelLabel():A.getOModel();
    line.textContent=name+" ("+model+", "+mode+"): testing...";
    try{
      const s=Connectors.makeSample();
      const t0=Date.now(),r=await s("Reply with exactly: OK",{cache:false,provider:id,noFallback:true});A.clearDown(id);res[id]="ok";
      line.className="status";line.textContent="✅ "+name+" ("+model+", "+mode+"): working. Answered in "+((Date.now()-t0)/1000).toFixed(1)+" seconds.";
    }catch(e){
      res[id]=/credit|billing|quota|insufficient/i.test((e&&e.message)||"")?"credit":"bad";
      line.className="status err";line.textContent="❌ "+name+" ("+model+", "+mode+"): "+((e&&e.message)||"failed");
      if(/no credit|credit|billing|quota|rejected/i.test((e&&e.message)||"")){const o=id==="claude"?"chatgpt":"claude";line.textContent+=A.avail(o)?" "+A.names[o]+" will answer instead.":" Nothing else is connected to answer instead."}
    }
  }
  for(const [p,o] of [["claude","chatgpt"],["chatgpt","claude"]]){
    if(res[p]==="credit"&&res[o]==="ok"&&A.chosen()===p){A.autoSwitch(p,o);out.append(el("p","status","✅ "+A.names[o]+" is now your main AI, because "+A.names[p]+" has no credit. "+A.names[p]+" takes over again by itself once its credit is fixed."))}
  }
  btn.disabled=false;btn.textContent="Test Claude and ChatGPT now";
};

/* ---------- AI status line at the top: which AI is connected and whether it works ---------- */
function renderAIStat(){
  const A=Connectors.ai,bar=$("aiStat");if(!bar)return;bar.replaceChildren();
  const one=(p,name)=>{
    const d=A.down(p),has=A.avail(p);
    const s=el("span","",(has?(d?"⚠ ":"✅ "):"⛔ ")+name+(has?(d?(d.credit?" no credit":" problem"):" ready"):" not connected"));
    s.title=has?(d?d.why:"Connected ("+(A.mode(p)==="key"?"your own key":"shared account")+"). Press Test under Settings to be sure."):"Not connected. See Settings.";return s;
  };
  bar.append(el("b","","AI"),document.createTextNode(" "),one("claude","Claude"),document.createTextNode(" · "),one("chatgpt","ChatGPT"));
  const c=A.down("claude"),g=A.down("chatgpt");
  if(c&&A.avail("chatgpt")&&!g)bar.append(document.createTextNode(" · ChatGPT is answering instead"));
  else if(g&&A.avail("claude")&&!c)bar.append(document.createTextNode(" · Claude is answering instead"));
  else if(c&&g)bar.append(document.createTextNode(" · both need attention, see Settings"));
}
window.addEventListener("wyz-ai-status",renderAIStat);
/* ---------- quick links ---------- */
const LINKS=[
  ["WYZ Dashboard","https://dashboard.wyzrent.com"],
  ["Hostaway","https://dashboard.hostaway.com"],
  ["Command Center build (Lovable)","https://lovable.dev/projects/1cc94a7d-8c35-4257-be82-df4aaf0d6def"],
  ["Wafeq","https://app.wafeq.com"],
  ["PriceLabs","https://app.pricelabs.co"],
  ["Gmail","https://mail.google.com"],
  ["Google Calendar","https://calendar.google.com"],
  ["Google Drive","https://drive.google.com"],
  ["WhatsApp","https://web.whatsapp.com"],
  ["wyzrent.com","https://wyzrent.com"]
];
function renderLinks(){
  const host=$("links");host.replaceChildren();
  const mine=(state.links||[]);
  /* Gmail, Calendar and Drive are already on this page: those chips jump to the section instead of leaving */
  const HERE={"mail.google.com":["inbox","Email"],"calendar.google.com":["cal","Calendar"],"drive.google.com":["docs","Files"],"outlook.office.com":["inbox","Email"],"outlook.live.com":["inbox","Email"]};
  [...LINKS.map(([n,u])=>({n,u})),...mine.map((l,ix)=>Object.assign({ix},l))].forEach(l=>{
    let host_="";try{host_=new URL(l.u).hostname}catch(e){}
    const here=HERE[host_];
    if(here){const b=el("button","chip solidchip",l.n+" (on this page)");b.type="button";b.title="Your "+here[1].toLowerCase()+" is already on this page";b.onclick=()=>{show("t-today");goSec(here[0])};host.append(b)}
    else{const a=el("a","chip",l.n+" ↗");a.href=l.u;a.target="_blank";a.rel="noopener";a.style.textDecoration="none";a.title="Opens "+l.n+" on its own site";host.append(a)}
    if(l.ix!=null){const x=el("button","chip","Remove "+l.n);x.type="button";x.style.fontSize="12px";x.onclick=()=>{state.links.splice(l.ix,1);persist();renderLinks()};host.append(x)}
  });
}
$("lnAdd").onclick=()=>{
  const n=clip($("lnName").value,40),u=$("lnUrl").value.trim();
  if(!n||!/^https:\/\/[^\s]+\.[^\s]+/i.test(u)){$("lnNote").textContent="Give it a name and a full address starting with https://";return}
  state.links=state.links||[];state.links.push({n,u});persist();renderLinks();$("lnName").value="";$("lnUrl").value="";$("lnNote").textContent="Added. It's saved to your page only.";
};

/* ---------- freshness ---------- */
function setFresh(k,txt){const f=$("fresh");f.className="status"+(k==="err"?" err":"");f.replaceChildren();
  if(k==="load"){f.append(el("span","spin"),txt+"...");return}
  if(k==="err"){f.textContent=txt;return}
  f.textContent="Updated "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}

/* ---------- collapse / expand ---------- */
var collapsed=new Set();try{collapsed=new Set(JSON.parse(localStorage.getItem(LS+"-col")||"[]"))}catch(e){}
function saveCol(){try{localStorage.setItem(LS+"-col",JSON.stringify([...collapsed]))}catch(e){}}
function applyCol(){document.querySelectorAll("[data-col]").forEach(c=>{const on=collapsed.has(c.dataset.col);c.classList.toggle("collapsed",on);const h=c.querySelector(".hdr");if(h)h.setAttribute("aria-expanded",String(!on))});
  const ib=collapsed.has("c-inbox");$("board").hidden=ib;$("showOff").parentElement.hidden=ib;}
function makeCollapsible(card,key,hdr){card.dataset.col=key;hdr.classList.add("hdr");hdr.tabIndex=0;hdr.setAttribute("role","button");
  const t=()=>{collapsed.has(key)?collapsed.delete(key):collapsed.add(key);saveCol();applyCol()};
  hdr.onclick=t;hdr.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();t()}}}
["setupCard","c-links","c-cal","c-tasks","c-inbox","c-res","c-docs"].forEach(id=>{const c=$(id);const h=c&&c.querySelector(".pad > h2");if(h)makeCollapsible(c,id,h)});
$("colAll").onclick=()=>{state.top3Col=1;persist();try{renderTop3()}catch(e){}document.querySelectorAll("section:not([hidden]) [data-col]").forEach(c=>collapsed.add(c.dataset.col));if(!$("p-today").hidden)ORDER.forEach(k=>collapsed.add("g-"+k));saveCol();applyCol()};
$("connCol").onclick=()=>{$("p-conn").querySelectorAll("[data-col]").forEach(c=>collapsed.add(c.dataset.col));saveCol();applyCol()};
$("connExp").onclick=()=>{$("p-conn").querySelectorAll("[data-col]").forEach(c=>collapsed.delete(c.dataset.col));saveCol();applyCol()};
$("expAll").onclick=()=>{state.top3Col=0;persist();try{renderTop3()}catch(e){}collapsed.clear();saveCol();applyCol()};
/* every other card on every tab gets the same tap-the-heading collapse */
document.querySelectorAll(".card").forEach(c=>{
  if(c.dataset.col||c.classList.contains("group")||c.closest(".onb,.thr,#report"))return;
  const h=c.querySelector(":scope > .pad > h2");if(!h)return;
  makeCollapsible(c,"x-"+(c.id||h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,30)),h);
});
/* ---------- move sections up and down ---------- */
const SEC_DEFAULT=["setup","inbox","cal","tasks","research","docs","links"];
let setupComplete=false;   /* once every setup step is done or skipped, the setup card drops to the last row */
function secOrder(){let o=((state&&state.order)||[]).filter(k=>SEC_DEFAULT.includes(k));if(!setupComplete&&!o.includes("setup"))o.unshift("setup");SEC_DEFAULT.forEach(k=>{if(!o.includes(k))o.push(k)});
  if(setupComplete)o=o.filter(k=>k!=="setup").concat("setup");return o}
const movableKeys=()=>secOrder().filter(k=>!(setupComplete&&k==="setup"));
function updMoveBtns(){const o=secOrder(),m=movableKeys();o.forEach(k=>{const ix=m.indexOf(k);const e=document.querySelector('[data-sec="'+k+'"]');if(!e)return;e.querySelectorAll(".mv button").forEach(b=>{b.disabled=ix<0||(b.dataset.d==="-1"&&ix===0)||(b.dataset.d==="1"&&ix===m.length-1)})})}
const SEC_LABEL={setup:"Setup",inbox:"Inbox",cal:"Your week",tasks:"My tasks",research:"Research",docs:"Documents",links:"Quick links"};
const SEC_CARD={setup:"setupCard",inbox:"c-inbox",cal:"c-cal",tasks:"c-tasks",research:"c-res",docs:"c-docs",links:"c-links"};
function renderNav(){const n=$("secNav");n.replaceChildren();secOrder().forEach(k=>{const b=el("button","navchip",SEC_LABEL[k]);b.type="button";
  b.onclick=()=>{collapsed.delete(SEC_CARD[k]);if(k==="inbox")ORDER.forEach(x=>collapsed.delete("g-"+x));saveCol();applyCol();
    const e=document.querySelector('[data-sec="'+k+'"]');if(e){const y=e.getBoundingClientRect().top+window.scrollY-$("toolbar").offsetHeight-8;window.scrollTo({top:y,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}};n.append(b)})}
function applyOrder(){const host=$("secs");secOrder().forEach(k=>{const e=host.querySelector('[data-sec="'+k+'"]');if(e)host.append(e)});updMoveBtns();renderNav()}
function moveSec(k,d){const o=movableKeys();const a=o.indexOf(k),b=a+d;if(a<0||b<0||b>=o.length)return;[o[a],o[b]]=[o[b],o[a]];state.order=o;persist();applyOrder();
  const btn=document.querySelector('[data-sec="'+k+'"] .mv button[data-d="'+d+'"]');if(btn&&!btn.disabled)btn.focus();}
document.querySelectorAll("[data-sec]").forEach(sec=>{const h=sec.querySelector(".pad > h2");if(!h)return;const name=h.textContent;const mv=el("span","mv");
  [["-1","\u2191","Move up"],["1","\u2193","Move down"]].forEach(([d,t,l])=>{const b=el("button","btn small ghost mvb",t);b.type="button";b.dataset.d=d;b.setAttribute("aria-label",l+": "+name);b.title=l;
    b.onclick=e=>{e.stopPropagation();moveSec(sec.dataset.sec,+d)};b.onkeydown=e=>e.stopPropagation();mv.append(b)});h.append(mv)});
applyCol();
/* ---------- Settings: move each card up or down (saved per person) ---------- */
function setCards(){return [...$("p-conn").children].filter(c=>c.classList.contains("card")&&c.dataset.col)}
function applySetOrder(){const host=$("p-conn"),cards=setCards(),o=state.setOrder||[];
  const sorted=cards.map((c,i)=>({c,i,r:o.indexOf(c.dataset.col)})).sort((x,y)=>(x.r<0?1000+x.i:x.r)-(y.r<0?1000+y.i:y.r)).map(x=>x.c);
  const anchor=cards[0]&&cards[0].previousElementSibling;let prev=anchor;sorted.forEach(c=>{if(prev)prev.after(c);else host.prepend(c);prev=c});
  sorted.forEach((c,i)=>{const m=c.querySelector(":scope > .pad > h2 .mv");if(m){m.children[0].disabled=i===0;m.children[1].disabled=i===sorted.length-1}})}
function moveSet(key,d){const keys=setCards().map(c=>c.dataset.col),a=keys.indexOf(key),b=a+d;if(a<0||b<0||b>=keys.length)return;[keys[a],keys[b]]=[keys[b],keys[a]];state.setOrder=keys;persist();applySetOrder()}
setCards().forEach(c=>{const h=c.querySelector(":scope > .pad > h2");if(!h)return;const mv=el("span","mv");
  [["-1","\u2191","Move up"],["1","\u2193","Move down"]].forEach(([d,t,l])=>{const b=el("button","btn small ghost mvb",t);b.type="button";b.setAttribute("aria-label",l+": "+h.textContent);b.title=l;
    b.onclick=e=>{e.stopPropagation();moveSet(c.dataset.col,+d)};b.onkeydown=e=>e.stopPropagation();mv.append(b)});h.append(mv)});
applySetOrder();

/* ---------- boot ---------- */
async function refreshAll(force){
  lastRef=Date.now();
  if(!G.connected()){showWelcome();setFresh("err","Connect Google to load your day.");return}
  await readConn();loadCal();
  if(!state.skipDrive||drive.state==="ok")loadDrive();
  if(!state.skipTodo||todo.state==="ok")loadTodoist();
  await loadMail(force);await syncDone();followups(false);checkHandoffs();maybeAlert();
  if(state.autoDraft&&sample&&state.autoDraftDay!==todayKey()){state.autoDraftDay=todayKey();persist();draftAll(true)}
  if(state.shareDash&&Date.now()-(state.dashAt||0)>1800000)shareSummary();
}
$("refresh").onclick=()=>refreshAll(false);
/* ---------- new version check: an open page or installed app never stays on an old copy ---------- */
let newVer="";
async function checkVersion(){
  try{const t=await (await fetch("version.js?t="+Date.now(),{cache:"no-store"})).text();const m=t.match(/version:\s*"([^"]+)"/);
    const cur=(window.WYZ_VERSION&&window.WYZ_VERSION.version)||"";
    if(m&&cur&&m[1]!==cur&&!newVer){newVer=m[1];
      const busy=()=>!$("thr").hidden||!$("onb").hidden;
      /* update by itself unless the person is in the middle of something (an open email, a draft, the setup steps) */
      const typing=()=>{const a=document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.value)};
      if(!busy()&&!typing()){location.reload();return}
      const bar=el("div","updbar");bar.setAttribute("role","status");bar.append(el("span","","A new version ("+newVer+") is ready."));
      const b=el("button","btn small solid","Update now");b.type="button";b.onclick=()=>{if(thr&&thr.counting)return;location.reload()};bar.append(b);document.body.append(bar);
      document.addEventListener("visibilitychange",()=>{if(document.hidden&&!busy())location.reload()})}}catch(e){}
}
setInterval(checkVersion,180000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkVersion()});window.addEventListener("focus",checkVersion);window.addEventListener("pageshow",checkVersion);
(async()=>{
  await lockGate();
  collapsed.delete("c-inbox");collapsed.delete("setupCard");ORDER.forEach(k=>collapsed.delete("g-"+k));saveCol();
  try{applyOrder();applyCol();renderLinks();renderSetup();renderTasks();renderResearch()}catch(e){}
  mcp=gateMcp(Connectors.mcp);perms=Connectors.perms;await Connectors.ai.detect();sample=Connectors.makeSample();try{renderAI()}catch(e){}
  renderHello();
  try{await Connectors.msPending}catch(e){}
  if(!G.configured()){showWelcome();setFresh("err","Google sign-in isn't set up yet.");return}
  if(G.wasConnected()){
    setFresh("load","Reconnecting to Google");
    try{await G.connect(false);await afterConnect();return}catch(e){}
  }
  showWelcome();setFresh("err","Connect Google to load your day.");
})();

/* ---------- search Drive, text size, invite, weekly review ---------- */
function searchDocs(){docResults=null;if(!G.connected())return;loadDrive()}
$("docGo").onclick=searchDocs;if($("docPickGo"))$("docPickGo").onclick=()=>{state.docFrom=$("docFrom").value;state.docTo=$("docTo").value;if(state.docFrom&&state.docTo&&state.docTo<state.docFrom){const x=state.docFrom;state.docFrom=state.docTo;state.docTo=x}persist();drawDocRanges();loadDrive()};$("docQ").addEventListener("keydown",e=>{if(e.key==="Enter")searchDocs()});
const ZOOMS=[1,1.15,1.3];
function applyZoom(){let z=1;try{z=+localStorage.getItem("wyz-zoom")||1}catch(e){}document.body.style.zoom=z;$("zoomBtn").textContent=z>1?"Text size "+Math.round(z*100)+"%":"Text size"}
$("zoomBtn").onclick=()=>{let z=1;try{z=+localStorage.getItem("wyz-zoom")||1}catch(e){}const n=ZOOMS[(ZOOMS.indexOf(z)+1)%ZOOMS.length];try{localStorage.setItem("wyz-zoom",String(n))}catch(e){}applyZoom()};
applyZoom();
function inviteText(){
  const txt="Hi! This is your own Execution Page. It sorts your inbox by what needs you, and shows today's meetings, tasks and recent files, all from your own Google account. Only you see your data.\n\n"+SITE_URL+"\n\n"+(G.msConfigured()?"It works with Gmail, Google work accounts, Outlook, Hotmail and Microsoft 365, and you can add a second account.":"It works with a Gmail or Google work account. If your email is Outlook, Hotmail or Microsoft, tell me before you start.")+"\n\n1. Open the link. On iPhone use Safari, on Android or a computer use Chrome.\n2. Tap Continue with "+(G.msConfigured()?"Google or Continue with Microsoft":"Google")+" and sign in with your own account.\n3. If Google says it hasn't verified the app, tap Advanced, then Go to (unsafe). That's normal for a private app. If Google says Access blocked, send me a screenshot so I can add you.\n4. Tick every box and tap Continue.\n5. Follow the short steps on screen. The last one puts it on your home screen or computer like an app.\n6. Then open the same link on your other device (phone or computer) and sign in there too.\n\nAny problem, send me a screenshot.";
  return txt;
}
$("inviteBtn").onclick=()=>{if(!G.connected()){const t=inviteText();if(DEV.phone&&navigator.share){navigator.share({title:"Your Execution Page",text:t}).catch(()=>{});return}window.open(waLink(t),"_blank","noopener");return}openInvite()};
function openInvite(){
  const host=infoOpen("📨 Invite someone");
  host.append(el("p","status","Send someone the link and the setup steps. They sign in with their own account and only see their own email and calendar."));
  const nm=el("input","in");nm.placeholder="Their first name (optional)";nm.setAttribute("aria-label","Their first name");
  const to=el("input","in");to.type="email";to.placeholder="Their email address";to.setAttribute("aria-label","Their email address");to.setAttribute("list","inviteList");to.autocomplete="off";
  const dl=document.createElement("datalist");dl.id="inviteList";try{(contacts||[]).slice(0,300).forEach(c=>{const o=document.createElement("option");o.value=c.email||c.e||"";o.label=c.name||c.n||"";if(o.value)dl.append(o)})}catch(e){}
  const ta=el("textarea","in");ta.rows=10;ta.style.minHeight="200px";ta.setAttribute("aria-label","Message");
  const base=inviteText();const fill=()=>{const n=nm.value.trim();ta.value=(n?"Hi "+n+"! ":"Hi! ")+base.replace(/^Hi! /,"")};fill();
  nm.oninput=()=>{if(!ta.dataset.edited)fill()};ta.oninput=()=>{ta.dataset.edited="1"};
  const st=el("p","status","");
  const row=(l,n)=>{const r=el("div","ask");const s=el("span","status",l);s.style.minWidth="54px";r.append(s,n);return r};
  host.append(row("Name",nm),row("Email",to),dl,ta);
  const send=el("button","btn small solid","Send by email");send.type="button";let armed=0;
  send.onclick=async()=>{
    const addr=to.value.trim();
    if(!/^\S+@\S+\.\S+$/.test(addr)){st.className="status err";st.textContent="Type their email address first.";to.focus();return}
    if(!armed){armed=1;send.textContent="Confirm: send to "+addr;st.className="status";st.textContent="Check the message, then press Confirm.";return}
    armed=0;send.disabled=true;send.textContent="Sending...";
    try{
      await mcp.callTool("Gmail","send_message",{to:[addr],cc:[],subject:"Your "+BR.co+" "+BR.app+"",body:ta.value.trim()+(sigText()?"\n\n"+sigText():""),attachments:[]});
      state.invites=state.invites||[];state.invites.unshift({to:addr,name:nm.value.trim(),at:Date.now()});state.invites=state.invites.slice(0,30);persist();
      send.textContent="Sent";st.className="status";st.textContent="Sent to "+addr+". If you limit the AI to certain people in Vercel, add this address to ALLOWED_EMAILS so Claude and ChatGPT work for them.";drawList();
      setTimeout(()=>{send.disabled=false;send.textContent="Send by email"},2500);
    }catch(e){send.disabled=false;send.textContent="Send by email";st.className="status err";st.textContent="Couldn't send it ("+clip((e&&e.message)||"unknown reason",90)+")."}
  };
  to.oninput=()=>{if(armed){armed=0;send.textContent="Send by email"}};
  const wa=el("a","btn small","💬 WhatsApp");wa.target="_blank";wa.rel="noopener";wa.href="#";const setWa=()=>{wa.href=waLink(ta.value)};wa.onmousedown=wa.ontouchstart=wa.onfocus=setWa;wa.onclick=setWa;
  const cp=el("button","btn small","Copy link");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(SITE_URL).then(()=>cp.textContent="Link copied").catch(()=>cp.textContent=SITE_URL);
  const cm=el("button","btn small ghost","Copy message");cm.type="button";cm.onclick=()=>navigator.clipboard.writeText(ta.value).then(()=>cm.textContent="Message copied").catch(()=>{ta.focus();ta.select()});
  const a=el("div","acts");a.append(send,wa,cp,cm);
  if(navigator.share){const sh=el("button","btn small ghost","Share...");sh.type="button";sh.onclick=()=>navigator.share({title:"Your Execution Page",text:ta.value}).catch(()=>{});a.append(sh)}
  host.append(a,st);
  const lst=el("div");host.append(lst);
  function drawList(){lst.replaceChildren();const v=state.invites||[];if(!v.length)return;const s=infoSection(lst,"Already invited");v.slice(0,10).forEach(x=>s.append(el("p","status",(x.name?x.name+" · ":"")+x.to+" · "+new Date(x.at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))))}
  drawList();(state.invites&&state.invites.length?to:nm).focus();
}
async function weeklyReview(){
  const host=$("mailRes");host.replaceChildren();
  const since=Date.now()-7*864e5,log=(state.log||[]).filter(x=>x.at>=since);
  const items=allItems(),open=items.filter(i=>!isOff(i)),snoozed=items.filter(i=>isOff(i)&&!doneNow(i)).length;
  const lines=["Finished this week: "+log.length,"Still to reply: "+open.filter(i=>i.st==="reply").length,"Still to chase: "+open.filter(i=>i.st==="follow").length,"Snoozed for later: "+snoozed];
  const card=el("div","ans",lines.join("\n"));host.append(el("p","status","Your week so far"),card);
  if(!sample){host.append(el("p","status","Add Claude in the setup steps to get a written review with advice for next week."));return}
  const wait=el("p","status","Writing your review...");host.append(wait);
  try{
    const r=await sample("Write a short weekly review for "+(myName||"the reader")+" at "+BR.co+", in plain words, no em dashes, 4 to 6 lines. Say what got finished, what is still open and the top two things to do first next week.\n\nFinished items: "+(log.map(x=>x.t).slice(-25).join("; ")||"none recorded")+"\nStill to reply: "+open.filter(i=>i.st==="reply").map(i=>i.title).slice(0,10).join("; ")+"\nStill to chase: "+open.filter(i=>i.st==="follow").map(i=>i.title).slice(0,10).join("; "),{cache:false});
    wait.replaceWith(el("div","ans",r.text));
  }catch(e){wait.textContent="Couldn't write the review ("+clip((e&&e.message)||"unknown reason",90)+")."}
}
$("weekGo").onclick=weeklyReview;
$("tidyOn").onchange=()=>{state.tidy=$("tidyOn").checked?1:0;persist();if(state.tidy)autoTidy(true)};
$("weeklyOn").onchange=()=>{state.noWeekly=$("weeklyOn").checked?0:1;persist()};
$("unsubFind").onclick=findUnsubs;
/* Sundays: the weekly review appears by itself, once */
function autoWeekly(){
  const d=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Dubai"}));
  if(d.getDay()!==0||state.weekAuto===todayKey()||state.noWeekly)return;
  state.weekAuto=todayKey();persist();weeklyReview();toast("It's Sunday: your weekly review is waiting in the Inbox section.");
}
/* ---------- auto-tidy: newsletters and social mail leave the inbox after 2 days (archived, never deleted) ---------- */
const TIDY_Q="in:inbox older_than:2d -is:starred -is:important (category:promotions OR category:social OR category:forums OR from:newsletter OR from:news@ OR from:marketing)";
async function autoTidy(force){
  if(!state.tidy||G.mainType()==="ms"||!mcp)return;
  if(!force&&state.tidyDay===todayKey())return;
  state.tidyDay=todayKey();persist();
  let r;try{r=await mcp.callTool("Gmail","search_threads",{query:TIDY_Q,pageSize:50,account:0},{cache:false})}catch(e){return}
  const vip=(state.rules&&state.rules.vip)||[],list=((r.payload&&r.payload.threads)||[]).map(slimThread).filter(t=>!ruleHit(vip,addrOf(t.from).toLowerCase()));
  const done=[];for(const t of list){try{await mcp.callTool("Gmail","archive_thread",{threadId:t.id});done.push(t.id)}catch(e){break}}
  if(!done.length)return;
  state.tidyLast={at:Date.now(),ids:done};persist();
  const n=$("tidyNote");if(n)n.textContent="Tidied "+done.length+" newsletter and social emails "+fmtWhen(Date.now())+". They're archived in Gmail, not deleted.";
  toastUndo("Tidied "+done.length+" newsletter emails out of your inbox.",async()=>{for(const id of done){try{await mcp.callTool("Gmail","modify_thread",{threadId:id,add:["INBOX"]})}catch(e){}}state.tidyLast=null;persist();toast("Put back in your inbox.");refreshAll(true)});
}
function toastUndo(t,fn){toast(t);const n=$("toastMsg");const b=el("button","btn small","Undo");b.type="button";b.style.marginLeft="10px";b.onclick=()=>{n.hidden=true;fn()};n.append(b);clearTimeout(toast.t);toast.t=setTimeout(()=>{n.hidden=true},12000)}
/* find newsletters and unsubscribe here */
async function findUnsubs(){
  const host=$("unsubList"),btn=$("unsubFind");host.replaceChildren(el("p","status","Looking through the last 30 days..."));btn.disabled=true;
  try{
    const r=await mcp.callTool("Gmail","search_threads",{query:"category:promotions newer_than:30d",pageSize:50,account:0},{cache:false});
    const by={};((r.payload&&r.payload.threads)||[]).map(slimThread).forEach(t=>{const a=addrOf(t.from).toLowerCase();if(!a)return;(by[a]=by[a]||{n:0,name:nameOf(t.from)||a,id:t.id}).n++});
    const top=Object.entries(by).sort((x,y)=>y[1].n-x[1].n).slice(0,12);
    host.replaceChildren();if(!top.length){host.append(el("p","status","No newsletters found in the last 30 days."));return}
    for(const [addr,s] of top){
      const row=el("div","srcrow");row.style.alignItems="center";const t=el("span","");t.style.flex="1";t.append(el("b","",s.name),el("span","status"," "+s.n+" email"+(s.n>1?"s":"")+" · "+addr));
      const b=el("button","btn small","Unsubscribe");b.type="button";
      b.onclick=async()=>{b.disabled=true;b.textContent="Working...";
        try{const th=await mcp.callTool("Gmail","get_thread",{threadId:s.id,messageFormat:"PLAIN_TEXT"},{cache:false});const m=((th.payload&&th.payload.messages)||[]).slice(-1)[0]||{};
          const u=String(m.unsub||""),https=(u.match(/<(https:[^>]+)>/)||[])[1],mail=(u.match(/<mailto:([^>]+)>/)||[])[1];
          if(https&&/One-Click/i.test(m.unsubPost||"")){await mcp.callTool("Gmail","unsubscribe_one_click",{url:https});b.textContent="Unsubscribed"}
          else if(mail){const [to,qs]=mail.split("?");const sub=(new URLSearchParams(qs||"").get("subject"))||"unsubscribe";await mcp.callTool("Gmail","send_message",{to:[decodeURIComponent(to)],subject:sub,body:"unsubscribe",account:0});b.textContent="Unsubscribed"}
          else if(https){b.textContent="Open their page ↗";b.disabled=false;b.onclick=()=>window.open(https,"_blank","noopener")}
          else{b.textContent="No unsubscribe link";}
        }catch(e){b.disabled=false;b.textContent="Try again"}};
      row.append(t,b);host.append(row);
    }
  }catch(e){host.replaceChildren(el("p","status err","Couldn't look just now ("+clip((e&&e.message)||"unknown reason",80)+")."))}
  btn.disabled=false;
}

/* ---------- system check: test every connection, read-only ---------- */
const SCOPE_LABEL={driveFile:"save attachments to your Drive",contacts:"see your contacts",otherContacts:"see people you have emailed",calEvents:"create and move calendar events",gmailRead:"read your email",gmailDraft:"save drafts and send replies",cal:"read your calendar",drive:"list your Drive files",driveRead:"read a Drive file when you ask the AI about it",gmailModify:"archive, star, label, bin and mark as read"};
let lastReport="";
async function testEverything(){
  const out=$("testOut"),sum=$("testSum"),btn=$("testGo");
  btn.disabled=true;btn.textContent="Testing...";out.replaceChildren();$("testCopy").hidden=true;sum.textContent="";
  const rows=[];
  const add=(name,status,detail,fix)=>{rows.push({name,status,detail});
    const r=el("div","chk-row");const ic=el("span","ic "+status,status==="ok"?"✓":status==="warn"?"!":status==="bad"?"✕":"–");
    r.append(ic,el("span","nm",name),el("span","ds",detail));
    if(fix){const g=el("div","go");const b=el("button","btn small solid",fix[0]);b.type="button";b.onclick=fix[1];g.append(b);r.append(g)}
    out.append(r)};
  const msg=e=>clip((e&&e.message)||"unknown reason",120);
  // 1 browser
  let ls=false;try{localStorage.setItem("wyz-test","1");localStorage.removeItem("wyz-test");ls=true}catch(e){}
  add("Browser storage",ls?"ok":"warn",ls?"Your board and settings can be saved on this device.":"Storage is blocked (private window?). Your board won't be remembered.");
  // 2 google
  if(!G.configured()){add("Google sign-in","bad","No Google Client ID is set up on this site (EXECUTION-PAGE.md, step 2).");}
  else if(!G.connected()){add("Google sign-in","bad","Not signed in.",["Continue with Google",()=>connectGoogle()])}
  else{
    try{const t=await G.token();const p=await G.profile();add("Google sign-in",t?"ok":"bad","Signed in as "+(p.email||"you")+".")}
    catch(e){add("Google sign-in","bad","Your sign-in ran out ("+msg(e)+").",["Sign in again",()=>connectGoogle()])}
    // 3 permissions
    const miss=G.scopeNames().filter(n=>!G.hasScope(n));
    add("Google permissions",miss.length?"warn":"ok",miss.length?"Not allowed yet: "+miss.map(n=>SCOPE_LABEL[n]||n).join(", ")+".":"All permissions are allowed (read mail, send replies, archive, calendar, Drive).",miss.length?["Allow them",()=>connectGoogle(true)]:null);
    // 4 gmail
    try{const g=await mcp.server("Gmail");const r=await g.search_threads({query:"in:inbox",pageSize:1});add("Gmail: read mail","ok","Reading works"+(r.threads&&r.threads[0]?" (latest: "+clip(slimThread(r.threads[0]).subject,50)+").":"."))}
    catch(e){add("Gmail: read mail","bad",e&&e.code==="api_disabled"?e.message:"Couldn't read Gmail ("+msg(e)+").")}
    // 5 calendar
    try{const d=new Date();d.setHours(0,0,0,0);const e2=new Date(d);e2.setDate(e2.getDate()+1);const r=await mcp.callTool("Google Calendar","list_events",{startTime:ymd(d)+"T00:00:00",endTime:ymd(e2)+"T00:00:00",pageSize:5},{cache:false});add("Google Calendar","ok","Reading works ("+((r.payload&&r.payload.events)||[]).length+" meetings today).")}
    catch(e){add("Google Calendar","bad","Couldn't read the calendar ("+msg(e)+").")}
    // contacts
    try{await loadContacts(true);
      if(contactsErr==="people_api")add("Google Contacts","warn","The People API is off in your Google Cloud project, so suggestions only use people from your recent mail. Turn it on, then test again.",["Turn it on",()=>window.open("https://console.cloud.google.com/apis/library/people.googleapis.com","_blank","noopener")]);
      else if(contactsErr==="consent")add("Google Contacts","warn","Not allowed yet, so suggestions only use your recent mail.",["Allow it",()=>connectGoogle(true)]);
      else if(contactsErr)add("Google Contacts","warn","Couldn't read contacts ("+contactsErr+"). Suggestions use your recent mail.");
      else add("Google Contacts","ok",contacts.length+" contacts and people you've emailed are available as suggestions.");
    }catch(e){add("Google Contacts","warn","Couldn't read contacts ("+msg(e)+").")}
    // 6 drive
    try{const r=await mcp.callTool("Google Drive","list_recent_files",{pageSize:1},{cache:false});add("Google Drive","ok","Reading works"+((r.payload&&r.payload.files||[])[0]?" (latest: "+clip(r.payload.files[0].name||r.payload.files[0].title||"file",40)+").":"."))}
    catch(e){add("Google Drive","bad","Couldn't read Drive ("+msg(e)+").")}
  }
  // 7 claude
  {const A=Connectors.ai,res={};
   for(const p of ["claude","chatgpt"]){
     const nm=A.names[p]+(p===A.active()?" (in use)":"");
     if(!A.avail(p)){const ms=A.missing(p);add(nm,ms.length?"warn":"na","Not connected"+(ms.length?". Vercel is missing "+ms.join(" and ")+". Add it under Settings, Environment Variables, then Redeploy.":(p==="chatgpt"?" (optional).":"."))+(!sample&&p==="claude"?" Sorting uses simple rules until an AI is connected.":""));continue}
     const mode=A.mode(p);
     try{const r=await sample("Reply with the single word OK.",{provider:p,cache:false,noFallback:true});Connectors.ai.clearDown(p);res[p]="ok";add(nm,"ok",(mode==="shared"?"Working through the shared connection":"Working with your own key")+", using "+(p==="chatgpt"?A.getOModel():A.modelLabel())+". It answered: "+clip(r.text,20)+".")}
     catch(e){res[p]=/credit|billing|quota|insufficient/i.test(msg(e))?"credit":"bad";add(nm,"bad",A.names[p]+" is switched on but failed ("+msg(e)+")."+(mode==="shared"?" Check the key, credit and ALLOWED_EMAILS in Vercel.":" Check your key, the model name and credit under Settings, Personalise."))}
   }
   for(const [p,o] of [["claude","chatgpt"],["chatgpt","claude"]]){
     if(res[p]==="credit"&&res[o]==="ok"&&A.chosen()===p){A.autoSwitch(p,o);add("AI in use","ok",A.names[p]+" has no credit, so "+A.names[o]+" is now your main AI. "+A.names[p]+" takes over again by itself once its credit is fixed.")}
   }}
  // 8 todoist
  if(!Connectors.todoist.has())add("Todoist","na","Not connected (optional).");
  else{try{await mcp.callTool("Todoist","find-tasks-by-date",{});add("Todoist","ok","Reading works.")}catch(e){add("Todoist","bad","Todoist failed ("+msg(e)+").",["Replace token",setTodoToken])}}
  // 9 dashboard
  if(!DASH)add("Company dashboard","na","Not set up yet (optional).");
  else add("Company dashboard",state.shareDash?(state.dashErr?"warn":"ok"):"na",state.shareDash?(state.dashErr?"Sharing is on but the last send failed: "+state.dashErr:"Sharing is on"+(state.dashAt?". Last sent "+fmtWhen(state.dashAt)+".":".")):"Sharing is off. You choose in the setup steps.");
  // 10 page data
  add("Today's board","ok",(board&&board.items?board.items.length:0)+" items sorted, "+(events?events.length:0)+" meetings loaded, "+((state.tasks||[]).filter(t=>!t.done).length)+" tasks.");
  const bad=rows.filter(r=>r.status==="bad").length,warn=rows.filter(r=>r.status==="warn").length,okn=rows.filter(r=>r.status==="ok").length;
  sum.className="status"+(bad?" err":"");
  sum.textContent=bad?bad+" problem"+(bad>1?"s":"")+" found. Fix the red items, then test again.":warn?"Working, with "+warn+" thing"+(warn>1?"s":"")+" to look at.":"Everything is working ("+okn+" checks passed).";
  lastReport="WYZ Execution Page system check, "+new Date().toLocaleString("en-GB")+"\n"+rows.map(r=>(r.status==="ok"?"OK    ":r.status==="warn"?"CHECK ":r.status==="bad"?"FAIL  ":"OFF   ")+r.name+": "+r.detail).join("\n");
  $("testCopy").hidden=false;btn.disabled=false;btn.textContent="Test everything again";
}
$("testGo").onclick=testEverything;
$("testCopy").onclick=()=>navigator.clipboard.writeText(lastReport).then(()=>{$("testCopy").textContent="Copied";setTimeout(()=>$("testCopy").textContent="Copy the report",1500)}).catch(()=>{$("testCopy").textContent="Select the text above"});

/* ---------- signature, reply templates, VIP and mute rules ---------- */
const sigText=()=>String(state.sig||"").trim();
const DEFAULT_TPLS=[
  {id:"t1",name:"Thanks, will do",text:"Hi {name},\n\nThanks for this. I'll take care of it and come back to you shortly."},
  {id:"t2",name:"Need a bit more time",text:"Hi {name},\n\nThanks for your message. I need a little more time on this and will get back to you by [DATE]."},
  {id:"t3",name:"Please send details",text:"Hi {name},\n\nCould you send me a few more details on this, please? [DETAIL]"}];
const tpls=()=>state.tpls||(state.tpls=DEFAULT_TPLS.map(x=>Object.assign({},x)));
function recipFirst(){const l=lastMsg(),fromMe=addrOf(l.sender).toLowerCase()===myAddr();return (nameOf(fromMe?(l.toRecipients||[])[0]:l.sender)||"").split(" ")[0]||"there"}
const fillTpl=t=>String(t).replace(/\{name\}/g,recipFirst()).replace(/\{me\}/g,(myName||"").split(" ")[0]);
function renderTplSelect(){
  const sel=$("thrTpl");sel.replaceChildren(new Option("Insert a template...",""));
  tpls().forEach(t=>sel.append(new Option(t.name,t.id)));
}
$("thrTpl").onchange=()=>{
  const t=tpls().find(x=>x.id===$("thrTpl").value);$("thrTpl").value="";if(!t)return;
  const ta=$("thrText"),add=fillTpl(t.text);ta.value=ta.value.trim()?ta.value.trimEnd()+"\n\n"+add:add;ta.focus();
};
$("thrTplSave").onclick=()=>{
  const text=$("thrText").value.trim();if(!text){$("thrSt").className="status err";$("thrSt").textContent="Write the reply first, then save it as a template.";return}
  const name=prompt("Name this template");if(!name||!name.trim())return;
  tpls().push({id:newId(),name:clip(name,40),text});persist();renderTplSelect();renderTplList();$("thrSt").className="status";$("thrSt").textContent="Saved as a template.";
};
function renderTplList(){
  const host=$("tplList");host.replaceChildren();
  tpls().forEach(t=>{const r=el("div","tplrow");r.append(el("b","",t.name),el("span","status",clip(t.text.replace(/\n+/g," "),90)));const b=el("button","btn small ghost","Delete");b.type="button";b.onclick=()=>{state.tpls=tpls().filter(x=>x.id!==t.id);persist();renderTplList();renderTplSelect()};r.append(b);host.append(r)});
}
$("tplAdd").onclick=()=>{const n=$("tplName").value.trim(),t=$("tplText").value.trim();if(!n||!t)return;tpls().push({id:newId(),name:clip(n,40),text:t});$("tplName").value="";$("tplText").value="";persist();renderTplList();renderTplSelect()};
$("sigText").addEventListener("input",()=>{state.sig=$("sigText").value;persist()});
function renderRules(){
  const host=$("ruleList");host.replaceChildren();const r=state.rules||{};
  [["vip","VIP"],["mute","Muted"]].forEach(([k,label])=>(r[k]||[]).forEach(a=>{const row=el("div","tplrow");row.append(el("b","",label),el("span","",a));const b=el("button","btn small ghost","Remove");b.type="button";b.onclick=()=>{state.rules[k]=state.rules[k].filter(x=>x!==a);persist();renderRules();renderBoard();syncRuleBtns()};row.append(b);host.append(row)}));
  if(!host.childNodes.length)host.append(el("p","status","No rules yet."));
}
function addRule(kind,addr){
  addr=String(addr||"").trim().toLowerCase();if(!/^@?[^\s@]+(\.[^\s@]+)+$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr))return false;
  state.rules=state.rules||{vip:[],mute:[]};const other=kind==="vip"?"mute":"vip";
  state.rules[other]=(state.rules[other]||[]).filter(x=>x!==addr);
  state.rules[kind]=state.rules[kind]||[];if(!state.rules[kind].includes(addr))state.rules[kind].push(addr);
  persist();renderRules();renderBoard();return true;
}
$("ruleAdd").onclick=()=>{if(addRule($("ruleKind").value,$("ruleIn").value))$("ruleIn").value=""};
const thrSender=()=>{const l=lastMsg(),fromMe=addrOf(l.sender).toLowerCase()===myAddr();return (addrOf(fromMe?(l.toRecipients||[])[0]:l.sender)||"").toLowerCase()};
function syncRuleBtns(){
  const a=thrSender(),r=state.rules||{};
  $("thrVip").textContent=ruleHit(r.vip,a)?"★ VIP on":"VIP";$("thrMute").textContent=ruleHit(r.mute,a)?"Muted":"Mute";
}
$("thrVip").onclick=()=>{const a=thrSender();if(!a)return;const r=state.rules||{};if(ruleHit(r.vip,a)){state.rules.vip=state.rules.vip.filter(x=>x!==a);persist();renderRules();renderBoard()}else addRule("vip",a);syncRuleBtns()};
$("thrMute").onclick=()=>{const a=thrSender();if(!a)return;const r=state.rules||{};if(ruleHit(r.mute,a)){state.rules.mute=state.rules.mute.filter(x=>x!==a);persist();renderRules();renderBoard();syncRuleBtns()}else{addRule("mute",a);syncRuleBtns();$("thrSt").className="status";$("thrSt").textContent="Muted. This sender is now hidden from your board. Undo it under Settings, Replies and rules."}};
renderTplSelect();renderTplList();renderRules();$("sigText").value=sigText();

/* ---------- create and move calendar events ---------- */
let evtEdit=null;
const two=n=>String(n).padStart(2,"0");
function openEvent(ev){
  evtEdit=ev||null;
  $("evtTitle").textContent=ev?"Reschedule meeting":"New meeting";$("evtSave").textContent=ev?"Move meeting":"Create meeting";
  $("evtMsg").textContent="";$("evtMsg").className="status";$("evtSave").disabled=false;
  const s=ev&&ev.start&&ev.start.dateTime?new Date(ev.start.dateTime):(()=>{const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d})();
  const e=ev&&ev.end&&ev.end.dateTime?new Date(ev.end.dateTime):new Date(s.getTime()+36e5);
  $("evtName").value=ev?(ev.summary||""):"";$("evtDate").value=ymd(s);$("evtStart").value=two(s.getHours())+":"+two(s.getMinutes());$("evtEnd").value=two(e.getHours())+":"+two(e.getMinutes());
  $("evtWhere").value=ev?(ev.location||""):"";$("evtGuests").value="";$("evtVideo").checked=false;
  [...document.querySelectorAll("#evt [data-new]")].forEach(x=>x.hidden=!!ev);
  $("evt").hidden=false;$("evtName").focus();
}
function closeEvent(){$("evt").hidden=true}
async function saveEvent(){
  const m=$("evtMsg"),b=$("evtSave");m.className="status";
  const title=$("evtName").value.trim(),date=$("evtDate").value,st=$("evtStart").value,en=$("evtEnd").value;
  if(!title||!date||!st||!en){m.className="status err";m.textContent="Add a title, a date and the start and end times.";return}
  if(en<=st){m.className="status err";m.textContent="The end time must be after the start time.";return}
  const guests=$("evtGuests").value.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
  if(guests.some(x=>!/^\S+@\S+\.\S+$/.test(x))){m.className="status err";m.textContent="Check the guest email addresses.";return}
  b.disabled=true;m.textContent=evtEdit?"Moving it...":"Creating it...";
  try{
    const a={title,start:date+"T"+st,end:date+"T"+en,location:$("evtWhere").value.trim()};
    if(evtEdit)await mcp.callTool("Google Calendar","move_event",Object.assign({eventId:evtEdit.id},a));
    else await mcp.callTool("Google Calendar","create_event",Object.assign({attendees:guests,video:$("evtVideo").checked},a));
    closeEvent();await loadCal();
  }catch(e){
    b.disabled=false;m.className="status err";
    if(e&&e.code==="consent_required"){m.textContent="Calendar changes need one more Google permission. ";const l=el("button","btn small solid","Allow");l.type="button";l.onclick=()=>{closeEvent();connectGoogle(true)};m.append(l)}
    else m.textContent="Couldn't save it ("+clip((e&&e.message)||"unknown reason",100)+"). Only the organiser can move a meeting."
  }
}
$("evtNew").onclick=()=>openEvent(null);$("evtCancel").onclick=closeEvent;$("evtSave").onclick=saveEvent;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("evt").hidden)closeEvent()});

/* ---------- plan my day and end-of-day wrap ---------- */
const hhmm=s=>fmtTime(s);
function reportData(){
  const today=ymd(new Date()),tm=new Date();tm.setDate(tm.getDate()+1);const tmr=ymd(tm);
  const onDay=day=>(events||[]).filter(x=>x.start&&(x.start.date?x.start.date===day:ymd(new Date(x.start.dateTime))===day)).sort((a,b)=>String(a.start.dateTime||a.start.date).localeCompare(String(b.start.dateTime||b.start.date)));
  const items=allItems().filter(i=>!isOff(i));
  const t0=new Date();t0.setHours(0,0,0,0);
  const doneToday=(state.log||[]).filter(x=>x.at>=t0.getTime());
  const tasks=[...(state.tasks||[]).filter(t=>!t.done).map(t=>({t:t.t,due:String(t.due||"").slice(0,10),p:t.p||1})),...(todo.state==="ok"?todo.tasks.map(t=>({t:t.t,due:String(t.due||"").slice(0,10),p:t.p>=3?2:1})):[])];
  return {today,meetings:onDay(today).map(x=>({time:x.start.date?"All day":hhmm(x.start.dateTime),title:x.summary||"Meeting"})),tomorrow:onDay(tmr).map(x=>({time:x.start.date?"All day":hhmm(x.start.dateTime),title:x.summary||"Meeting"})),
    reply:items.filter(i=>i.st==="reply").sort((a,b)=>b.g-a.g).slice(0,8).map(i=>({title:i.title,urgency:UR[i.g]||"",vip:!!i.vip})),
    chase:items.filter(i=>i.st==="follow").sort((a,b)=>b.g-a.g).slice(0,6).map(i=>({title:i.title})),
    tasksDue:tasks.filter(t=>t.due&&t.due<=today).map(t=>({title:t.t,due:t.due,high:t.p>1})),tasksOpen:tasks.length,doneToday:doneToday.map(x=>x.t)};
}
function plainReport(kind,d){
  const L=[];const head=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  if(kind==="plan"){
    L.push("Plan for "+head,"");
    L.push("Meetings");d.meetings.length?d.meetings.forEach(m=>L.push("  "+m.time+"  "+m.title)):L.push("  None today.");
    L.push("","Reply first");d.reply.length?d.reply.forEach((r,i)=>L.push("  "+(i+1)+". "+r.title+(r.vip?" (VIP)":r.urgency?" ("+r.urgency+")":""))):L.push("  Nothing waiting.");
    if(d.chase.length){L.push("","Chase");d.chase.forEach((r,i)=>L.push("  "+(i+1)+". "+r.title))}
    if(d.tasksDue.length){L.push("","Tasks due or overdue");d.tasksDue.forEach(t=>L.push("  "+t.title+(t.high?" (high priority)":"")+", due "+niceDay(t.due)))}
  }else{
    L.push("End of day, "+head,"");
    L.push("Finished today: "+d.doneToday.length);d.doneToday.slice(0,12).forEach(t=>L.push("  - "+t));
    L.push("","Still waiting");L.push("  "+d.reply.length+" to reply to, "+d.chase.length+" to chase, "+d.tasksOpen+" open tasks");
    L.push("","Tomorrow");d.tomorrow.length?d.tomorrow.forEach(m=>L.push("  "+m.time+"  "+m.title)):L.push("  No meetings.");
  }
  return L.join("\n");
}
async function aiReport(kind,d){
  const r=await sample((kind==="plan"?"Write a plan for today for ":"Write an end-of-day wrap for ")+(myName||"the reader")+" at "+BR.co+", "+BR.desc+". Plain text only, no markdown, no em dashes, short lines, max 18 lines. "+(kind==="plan"?"Put meetings in time order, then the order to tackle emails and tasks with a few words on why each comes first. Finish with one line on what to protect time for.":"Say what got done, what is still open and the top three things to do first tomorrow, using tomorrow's meetings.")+"\n\nData (JSON):\n"+JSON.stringify(d),{cache:false});
  return r.text.trim();
}
let repText="";
async function showReport(kind){
  const box=$("report"),body=$("repBody"),acts=$("repActs");
  box.hidden=false;$("repTitle").textContent=kind==="plan"?"Your plan for today":"End-of-day wrap";
  body.replaceChildren(el("p","status","Working on it..."));acts.replaceChildren();
  window.scrollTo({top:0,behavior:"smooth"});
  const d=reportData();let text;
  try{text=sample?await aiReport(kind,d):plainReport(kind,d)}catch(e){text=plainReport(kind,d)+"\n\n(Claude couldn't write this ("+clip((e&&e.message)||"unknown reason",80)+"), so this is the simple version.)"}
  repText=text;body.replaceChildren(el("div","ans",text));
  const btn=(t,fn,c)=>{const b=el("button","btn small "+(c||""),t);b.type="button";b.onclick=()=>fn(b);acts.append(b)};
  btn("Copy",b=>navigator.clipboard.writeText(repText).then(()=>b.textContent="Copied").catch(()=>b.textContent="Select the text to copy"));
  btn("Save as PDF",()=>{document.body.classList.add("printing");setTimeout(()=>{window.print();document.body.classList.remove("printing")},50)});
  btn("Send on WhatsApp",()=>window.open(waLink(repText),"_blank","noopener"));
  btn("Email it to me",async b=>{b.disabled=true;b.textContent="Sending...";try{await mcp.callTool("Gmail","send_message",{to:[email],subject:$("repTitle").textContent+", "+new Date().toLocaleDateString("en-GB"),body:repText});b.textContent="Sent to "+email}catch(e){b.disabled=false;b.textContent="Couldn't send. Try again"}},"solid");
}
$("planBtn").onclick=()=>{if(!G.connected()){showWelcome();return}showReport("plan")};
$("wrapBtn").onclick=()=>{if(!G.connected()){showWelcome();return}showReport("wrap")};
$("repClose").onclick=()=>{$("report").hidden=true};

/* ---------- write a new email from the page ---------- */
function fillFrom(){const w=$("thrFromWrap"),s=$("thrFrom");if(!w)return;const acc=G.accounts().filter(x=>x.email);w.hidden=!(thr.mode==="new"&&acc.length>1);if(w.hidden)return;const v=s.value;s.replaceChildren(...acc.map(x=>new Option(x.email,String(x.n))));if(v&&acc.some(x=>String(x.n)===v))s.value=v}
function openCompose(o){
  o=o||{};
  if(thr.counting&&!thr.bg){thr.bg=true;sendBar(thr,"tick")}
  thr={id:"",msgs:[],item:{id:"",st:"work",title:"New email",summary:""},armed:0,done:false,mode:"new",files:[]};
  $("thr").hidden=false;$("thrTitle").textContent="New email";
  setMode("new");renderTplSelect();renderThrPick();loadContacts();drawTools();
  $("thrReply").hidden=false;$("thrFiles").value="";$("thrFileList").textContent="";
  ["thrSend","thrSave","thrText","thrTo","thrCc","thrSubj"].forEach(k=>$(k).disabled=false);
  $("thrSend").textContent="Send";$("thrSt").textContent="";$("thrSt").className="status";$("thrRemind").value="3";
  $("thrTo").value=o.to||"";$("thrCc").value="";$("thrSubj").value=o.subject||"";$("thrText").value=o.body||"";$("thrBrief").value="";
  setAIButton();fillFrom();
  $("thr").querySelector(".pad").scrollTop=0;$("thrTo").focus();
}
async function composeDraft(){
  const brief=$("thrBrief").value.trim(),st=$("thrSt"),ta=$("thrText");
  if(!brief){st.className="status err";st.textContent="Tell the AI what the email should say first.";$("thrBrief").focus();return}
  if(!sample){ta.value=brief;st.className="status";st.textContent="No AI is connected, so your note was copied into the email. Edit it and add a subject.";return}
  st.className="status";st.textContent="Writing it...";
  try{
    const tone=await toneExamples(),first=(myName||"").split(" ")[0];
    const r=await creditFallback(prov=>sample.json("Write an email for "+(myName||"me")+" at "+BR.co+", "+BR.desc+".\nIt is to: "+($("thrTo").value.trim()||"someone")+".\nWhat it should say: "+brief+"\n\nPlain text, "+(sigText()?"no sign-off and no name, because the signature is added automatically":"signed with the first name"+(first?" "+first:""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return JSON only: {\"subject\": a short subject line, \"body\": the email body}."+(tone?"\n\n"+tone:""),{cache:false,provider:prov}));
    ta.value=String(r.body||"").trim();if(!$("thrSubj").value.trim())$("thrSubj").value=String(r.subject||"").trim();
    st.textContent="Edit it, then send it or save it as a draft."
  }catch(e){st.className="status err";st.textContent="Couldn't write it ("+clip((e&&e.message)||"unknown reason",110)+")."+(isCreditErr(e)?" You can still use a free chat below, or write your own here.":" Write your own here.");if(isCreditErr(e))showFree()}
}
$("newMailBtn").onclick=()=>{if(!G.connected()){showWelcome();return}openCompose()};
$("newMailBtn2").onclick=()=>{if(!G.connected()){showWelcome();return}openCompose()};

/* ---------- people suggestions: Google Contacts, people you have emailed, and your recent mail ---------- */
let contacts=[],contactsAt=0,contactsErr="";
function loadContactsCache(){try{const c=JSON.parse(localStorage.getItem(LS+"-contacts")||"null");if(c&&Array.isArray(c.people)){contacts=c.people;contactsAt=c.at||0}}catch(e){}}
async function loadContacts(force){
  if(!G.connected())return;
  if(!force&&contacts.length&&Date.now()-contactsAt<6*3600e3)return;
  try{
    const r=await mcp.callTool("Google Contacts","list_contacts",{});
    contacts=(r.payload&&r.payload.people)||[];contactsAt=Date.now();contactsErr="";
    try{localStorage.setItem(LS+"-contacts",JSON.stringify({at:contactsAt,people:contacts.slice(0,3000)}))}catch(e){}
  }catch(e){contactsErr=e&&e.code==="api_disabled"?"people_api":e&&e.code==="consent_required"?"consent":(clip((e&&e.message)||"unknown reason",90)||"error")}
}
function contactPool(){
  const m=new Map();
  const add=(name,addr,w)=>{addr=String(addr||"").trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(addr)||addr===myAddr())return;const e=m.get(addr)||{email:addr,name:"",w:0};if(name&&!e.name)e.name=String(name).trim();e.w+=w;m.set(addr,e)};
  contacts.forEach(c=>add(c.name,c.email,1));
  threads.concat(found).forEach(t=>{[t.from].concat(t.lastTo||[]).forEach(x=>{const named=/</.test(String(x||""));add(named?nameOf(x):"",addrOf(x),3)})});
  return [...m.values()];
}
const safeName=n=>String(n||"").replace(/["<>,;]/g,"").trim();
function attachAutocomplete(input,plain){
  const w=el("div","acwrap");input.parentNode.insertBefore(w,input);const box=el("div","acbox");box.hidden=true;w.append(input,box);
  let hits=[],sel=-1;
  const token=()=>{const p=input.value.split(/[,;]/);return {parts:p,q:p[p.length-1].trim().toLowerCase()}};
  const close=()=>{box.hidden=true;sel=-1};
  const pickIt=h=>{const {parts}=token();const val=plain||!h.name?h.email:safeName(h.name)+" <"+h.email+">";parts[parts.length-1]=" "+val;input.value=parts.map(x=>x.trim()).filter(Boolean).join(", ")+", ";close();input.focus();input.dispatchEvent(new Event("input",{bubbles:true}));close()};
  const draw=()=>{
    const {parts,q}=token();const used=new Set(parts.slice(0,-1).map(x=>addrOf(x).toLowerCase()));
    hits=contactPool().filter(c=>!used.has(c.email)&&(!q||c.email.includes(q)||c.name.toLowerCase().includes(q)))
      .sort((a,b)=>{const sa=(a.email.startsWith(q)||a.name.toLowerCase().startsWith(q))?1:0,sb=(b.email.startsWith(q)||b.name.toLowerCase().startsWith(q))?1:0;return sb-sa||b.w-a.w}).slice(0,8);
    box.replaceChildren();sel=hits.length?0:-1;
    hits.forEach((h,i)=>{const b=el("button",i===0?"on":"");b.type="button";b.append(el("b","",h.name||h.email),h.name?el("span","",h.email):document.createComment(""));b.onmousedown=e=>{e.preventDefault();pickIt(h)};box.append(b)});
    box.hidden=!hits.length;
  };
  const mark=()=>[...box.children].forEach((b,i)=>b.classList&&b.classList.toggle("on",i===sel));
  input.addEventListener("input",draw);input.addEventListener("focus",()=>{loadContacts();draw()});input.addEventListener("blur",()=>setTimeout(close,120));
  input.addEventListener("keydown",e=>{
    if(box.hidden)return;
    if(e.key==="ArrowDown"){e.preventDefault();sel=Math.min(sel+1,hits.length-1);mark()}
    else if(e.key==="ArrowUp"){e.preventDefault();sel=Math.max(sel-1,0);mark()}
    else if((e.key==="Enter"||e.key==="Tab")&&sel>=0){e.preventDefault();pickIt(hits[sel])}
    else if(e.key==="Escape"){e.stopPropagation();close()}
  });
}
attachAutocomplete($("thrTo"));attachAutocomplete($("thrCc"));attachAutocomplete($("evtGuests"),true);

/* =====================================================================================
   Info dialog, Top 3, Meeting brief, Person card, Search everything, Hand off to the team
   ===================================================================================== */
function infoOpen(title){
  $("infoTitle").textContent=title;const b=$("infoBody");b.replaceChildren();$("info").hidden=false;return b;
}
const infoClose=()=>{$("info").hidden=true;try{speechSynthesis.cancel()}catch(e){}};
$("infoClose").onclick=infoClose;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("info").hidden)infoClose()});
function infoSection(host,title){const d=el("div","infosec");d.append(el("h3","",title));const body=el("div");d.append(body);host.append(d);return body}
function threadRow(t,after){
  const row=el("div","item");row.append(el("span","dot none"));const m=el("div","main");
  m.append(el("span","t",t.subject||"(No subject)"),el("span","m",(t.lastFromMe?"You wrote to "+(nameOf((t.lastTo||[])[0])||"them"):nameOf(t.from))+(t.date?" · "+fmtWhen(t.date):"")));
  const a=el("div","acts");a.append(onbBtn("Read thread",()=>{if(after)after();openThread(t.id)},"small"));m.append(a);row.append(m);return row;
}
const myEmailLc=()=>String(email||"").toLowerCase();
async function gmailFind(q,n){
  const g=await mcp.server("Gmail");const r=await g.search_threads({query:q,pageSize:n||8});
  const list=(r.threads||[]).map(slimThread);list.forEach(t=>{if(!found.some(x=>x.id===t.id))found.push(t)});return list;
}

/* ---------- Top 3 for today ---------- */
function top3Candidates(){
  const out=[],today=todayKey(),in2=(()=>{const d=new Date();d.setDate(d.getDate()+2);return ymd(d)})();
  allItems().filter(i=>!isOff(i)&&["reply","follow","work","wait"].includes(i.st)).forEach(i=>{
    const t=tById(i.id)||{};
    out.push({kind:"mail",ref:i.id,title:i.title||t.subject||"(No subject)",why:(i.st==="wait"?"Waiting on them. ":"")+(i.summary||""),score:(i.g||1)*10+(i.st==="reply"?6:i.st==="follow"?4:i.st==="work"?2:-4)+(i.vip?8:0)+backFirst(i)*5,item:i});
  });
  (state.tasks||[]).filter(t=>!t.done).forEach(t=>{
    let sc=(t.p||1)*4,why="";
    if(t.due){if(t.due<today){sc+=40;why="Overdue, was due "+niceDay(t.due)}else if(t.due===today){sc+=30;why="Due today"}else if(t.due<=in2){sc+=10;why="Due "+niceDay(t.due)}}
    out.push({kind:"task",ref:t.id,title:t.t,why,score:sc});
  });
  const now=Date.now();
  (events||[]).forEach(e=>{
    const s=e.start&&e.start.dateTime&&Date.parse(e.start.dateTime);if(!s||s<now-15*60000||ymd(new Date(s))!==today||e.status==="cancelled")return;
    out.push({kind:"event",ref:e.id,title:e.summary||"(No title)",why:"Starts at "+fmtTime(e.start.dateTime)+(e.location?" · "+e.location:""),score:36-((s-now)/3600000)*3,ev:e});
  });
  const hide=(state.topHide&&state.topHide.day===today&&state.topHide.ids)||[],zz=state.topSnooze||{},nowT=Date.now();
  return out.filter(x=>!hide.includes(x.kind+":"+x.ref)&&!(zz[x.kind+":"+x.ref]>nowT)).sort((a,b)=>b.score-a.score);
}
let top3Busy=false,top3Fail=0;
const topN=()=>{const n=+state.topN;return Number.isInteger(n)&&n>=1&&n<=10?n:10};
async function pickTop3(force){
  if(top3Busy||!sample||(!force&&Date.now()-top3Fail<600000))return;
  const N=topN(),cand=top3Candidates().slice(0,Math.max(12,N*2));if(cand.length<=N)return;
  const c=state.top3;
  if(!force&&c&&c.day===todayKey()&&c.n===N&&Date.now()-c.at<3*3600000)return;
  top3Busy=true;
  try{
    const list=cand.map((x,i)=>"c"+i+" ["+x.kind+"] "+x.title+(x.why?" - "+x.why:"")).join("\n");
    const r=await creditFallback(prov=>sample.json("You are the chief of staff of "+(myName||"a manager")+" at "+BR.co+", "+BR.desc+". Today is "+new Date().toDateString()+", the time is "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})+".\nChoose the "+N+" things "+(myName||"they")+" should do first today, in order, from this list. Prefer things that block other people, owners or guests, money, and anything with a deadline. Give each a reason in 12 words or fewer. No em dashes.\n\n"+list+"\n\nReturn JSON only: {\"picks\":[{\"id\":\"c0\",\"why\":\"reason\"}]} with exactly "+N+" picks, best first.",{cache:false,provider:prov}));
    const picks=(r.picks||[]).map(p=>({x:cand[+String(p.id||"").replace(/\D/g,"")],why:String(p.why||"")})).filter(p=>p.x).slice(0,N);
    state.top3={day:todayKey(),at:Date.now(),n:N,picks:picks.map(p=>({kind:p.x.kind,ref:p.x.ref,why:p.why}))};persist();
  }catch(e){top3Fail=Date.now()}
  top3Busy=false;renderTop3();
}
function top3Rows(){
  const N=topN(),cand=top3Candidates();let rows=cand.slice(0,N);
  const c=state.top3;
  if(c&&c.day===todayKey()&&c.n===N&&c.picks&&c.picks.length){
    const mapped=c.picks.map(p=>{const x=cand.find(y=>y.kind===p.kind&&y.ref===p.ref);return x?Object.assign({},x,{why:p.why||x.why}):null}).filter(Boolean);
    if(mapped.length)rows=mapped.concat(cand.filter(y=>!mapped.some(m=>m.kind===y.kind&&m.ref===y.ref))).slice(0,N);
  }
  const pins=cand.filter(x=>x.kind==="mail"&&isPinned(x.ref));
  if(pins.length)rows=pins.concat(rows.filter(r=>!(r.kind==="mail"&&isPinned(r.ref)))).slice(0,Math.max(N,pins.length));
  return rows;
}
function renderTop3(){
  const card=$("top3"),host=$("top3List");
  if(!G.connected()||(!board&&!(state.tasks||[]).length)){card.hidden=true;return}
  const rows=top3Rows(),open=!state.top3Col;
  card.hidden=!rows.length;host.replaceChildren();
  $("top3Title").textContent=topN()===1?"Top priority for today":"Top "+topN()+" for today";
  if(open&&rows.length<topN()){const n=el("p","status","Only "+rows.length+" thing"+(rows.length>1?"s":"")+" need"+(rows.length>1?"":"s")+" you today. Everything else is done, snoozed or just for your information.");host.append(n)}$("top3N").value=String(topN());
  $("top3Tog").setAttribute("aria-expanded",String(open));host.hidden=!open;
  $("top3Sum").hidden=open;$("top3Sum").textContent=rows.length+" item"+(rows.length>1?"s":"")+". First: "+(rows[0]?rows[0].title:"")+". Tap the heading to open.";
  rows.forEach((x,i)=>{
    const r=el("div","t3row");r.append(el("span","t3n",String(i+1)));const m=el("div","main");
    m.append(el("span","t",(x.kind==="mail"&&isPinned(x.ref)?"📌 ":"")+x.title));if(x.why)m.append(el("span","s",x.why));
    const a=el("div","acts");
    a.append(onbBtn("✓ Done",()=>topDone(x),"small solid"),topSnoozeDrop(x),topDelBtn(x));
    if(x.kind==="mail"){a.append(onbBtn("Read thread",()=>openThread(x.ref,{item:x.item}),"small"),onbBtn("Draft a reply",()=>openThread(x.ref,{item:x.item,draft:true}),"small solid"))}
    else if(x.kind==="task"){}
    else{if(x.ev)a.append(onbBtn("Prep brief",()=>openBrief(x.ev),"small solid"));if(x.ev&&x.ev.conferenceUrl){const j=el("a","btn small","Join");j.href=x.ev.conferenceUrl;j.target="_blank";j.rel="noopener";a.append(j)}}
    m.append(a);r.append(m);host.append(r);
  });
  pickTop3(false);
}
function topHideToday(x){const d=todayKey();if(!state.topHide||state.topHide.day!==d)state.topHide={day:d,ids:[]};state.topHide.ids.push(x.kind+":"+x.ref)}
function topRefresh(){persist();try{renderBoard()}catch(e){}try{renderTasks()}catch(e){}renderTop3()}
function topDone(x){
  if(x.kind==="mail"){setDone(x.ref);logDone(x.item||{id:x.ref,title:x.title})}
  else if(x.kind==="task"){const t=(state.tasks||[]).find(y=>y.id===x.ref);if(t)t.done=1;logDone({id:x.ref,title:x.title},"task")}
  else{topHideToday(x);logDone({id:x.ref,title:x.title},"meeting")}
  topRefresh();
}
/* Delete asks once more, like Send. Emails leave the page but stay in Gmail. */
/* Snooze from the top list: the item leaves the list (and the board, for email) until the time you pick */
function topSnoozeDrop(x){
  const d=el("details","askdd");d.append(el("summary","","Snooze ▾"));const m=el("div","askmenu");
  const at=(h,dayOff)=>{const t=new Date();if(dayOff!=null){t.setDate(t.getDate()+dayOff);t.setHours(8,0,0,0)}else t.setTime(t.getTime()+h*3600000);return t};
  const nextSun=()=>{const t=new Date();t.setDate(t.getDate()+((7-t.getDay())%7||7));t.setHours(8,0,0,0);return t};
  const go=(when,label)=>{d.open=false;state.topSnooze=state.topSnooze||{};state.topSnooze[x.kind+":"+x.ref]=when.getTime();
    if(x.kind==="mail"&&ymd(when)>todayKey())state.snooze[x.ref]=ymd(when);
    persist();try{renderBoard()}catch(e){}renderTop3();toast("Snoozed until "+label+".")};
  [["1 hour",()=>at(1),"in an hour"],["3 hours",()=>at(3),"later today"],["Tomorrow morning",()=>at(0,1),"tomorrow 8am"],["In 3 days",()=>at(0,3),"in 3 days"],["Next week",nextSun,"next Sunday"]].forEach(([t,f,l])=>{const b=el("button","",t);b.type="button";b.onclick=()=>go(f(),l);m.append(b)});
  const pick=el("input","in");pick.type="date";pick.min=ymd(new Date(Date.now()+864e5));pick.setAttribute("aria-label","Pick a date");pick.onchange=()=>{if(!pick.value)return;const t=new Date(pick.value+"T08:00");go(t,niceDay(pick.value))};
  m.append(pick);d.append(m);return d;
}
function topDelBtn(x){
  const b=onbBtn("Delete",null,"small ghost");b.title=x.kind==="mail"?"Removes it from your page. The email stays in Gmail.":x.kind==="task"?"Deletes this task.":"Removes it from today's list.";
  let armed=0,tm=0;
  b.onclick=()=>{
    if(!armed){armed=1;b.textContent="Tap again to delete";tm=setTimeout(()=>{armed=0;b.textContent="Delete"},8000);return}
    clearTimeout(tm);
    if(x.kind==="mail"){setDone(x.ref);logDone(x.item||{id:x.ref,title:x.title},"removed")}
    else if(x.kind==="task"){state.tasks=(state.tasks||[]).filter(y=>y.id!==x.ref)}
    else topHideToday(x);
    topRefresh();
  };
  return b;
}
$("top3Tog").onclick=()=>{state.top3Col=state.top3Col?0:1;persist();renderTop3()};
$("top3N").onchange=()=>{state.topN=+$("top3N").value;state.top3Col=0;persist();renderTop3()};
$("top3Refresh").onclick=()=>{if(!sample){$("top3Refresh").textContent="Connect an AI first";return}$("top3Refresh").textContent="Choosing...";pickTop3(true).then(()=>{$("top3Refresh").textContent="Pick again"})};

/* ---------- Meeting prep brief ---------- */
async function openBrief(ev){
  const host=infoOpen("Prep brief: "+(ev.summary||"Meeting"));
  const when=ev.start&&ev.start.dateTime?new Date(ev.start.dateTime).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  host.append(el("p","status",when+(ev.location?" · "+ev.location:"")));
  const people=(ev.attendees||[]).filter(a=>a.email&&!a.self&&!a.resource&&a.email!==myEmailLc()).slice(0,6);
  if(people.length){
    const sec=infoSection(host,"Who is in it");const row=el("div","acts");
    people.forEach(p=>{const b=el("button","chip",p.name||p.email);b.type="button";b.title=p.email;b.onclick=()=>openPerson(p.email,p.name);row.append(b)});sec.append(row);
  }
  const out=el("div");host.append(out);out.append(el("p","status","Collecting the related emails and files..."));
  let threadsF=[],files=[];
  try{
    const parts=people.slice(0,4);
    if(parts.length)threadsF=await gmailFind("("+parts.map(p=>"from:"+p.email+" OR to:"+p.email).join(" OR ")+") newer_than:120d",6);
    else if(ev.summary)threadsF=await gmailFind('"'+String(ev.summary).replace(/"/g,"")+'" newer_than:120d',5);
  }catch(e){}
  try{
    const words=String(ev.summary||"").replace(/[^\p{L}\p{N} ]/gu," ").split(/\s+/).filter(w=>w.length>3).slice(0,2).join(" ");
    if(words){const r=await mcp.callTool("Google Drive","search_files",{query:words,pageSize:5});files=((r.payload&&r.payload.files)||[])}
  }catch(e){}
  out.replaceChildren();
  let text="";
  if(sample&&(threadsF.length||ev.description)){
    out.append(el("p","status","Writing your brief..."));
    try{
      let mail="";
      for(const t of threadsF.slice(0,3)){
        try{const full=await mcp.callTool("Gmail","get_thread",{threadId:t.id,messageFormat:"PLAIN_TEXT"},{cache:false});const ms=((full.payload&&full.payload.messages)||[]).slice(-2);
          mail+="Thread: "+t.subject+"\n"+ms.map(m=>"From: "+m.sender+" ("+(m.date||"").slice(0,10)+")\n"+String(m.plaintextBody||m.snippet||"").slice(0,1200)).join("\n---\n")+"\n\n"}catch(e){}
      }
      const r=await creditFallback(prov=>sample("Prepare "+(myName||"me")+" for a meeting at "+BR.co+", "+BR.desc+".\nMeeting: "+(ev.summary||"")+"\nWhen: "+when+"\nWho: "+people.map(p=>p.name||p.email).join(", ")+"\nNotes in the invite: "+(ev.description||"none")+"\n\nRecent emails with these people:\n"+(mail||"none found")+"\nFiles that may be related: "+(files.map(f=>f.title).join(", ")||"none")+"\n\nWrite a short brief in plain words with these headings: Context, What was agreed, Open points, Questions worth asking. Use short lines. Only use facts from the emails and invite. If something is unknown say so. No em dashes.",{cache:false,provider:prov}));
      text=String(r.text||"").trim();
    }catch(e){out.replaceChildren(el("p","status err","Couldn't write the brief ("+clip((e&&e.message)||"unknown reason",100)+"). The related emails and files are below."))}
  }
  if(text){out.replaceChildren();const t=el("div","mailtext");t.textContent=text;const cp=el("button","btn small ghost","Copy");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(text).then(()=>cp.textContent="Copied").catch(()=>cp.textContent="Select the text to copy");out.append(t,cp)}
  else if(!out.childNodes.length)out.append(el("p","status",sample?"Not enough to write a brief. Here is what I found.":"Connect Claude or ChatGPT under Settings for a written brief. Here is what I found."));
  const es=infoSection(host,"Related emails");
  if(!threadsF.length)es.append(el("p","status","No recent emails with these people."));
  threadsF.forEach(t=>es.append(threadRow(t,infoClose)));
  if(files.length){const fs=infoSection(host,"Files that may help");files.forEach(f=>{const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");m.append(el("span","t",f.title));const a=el("div","acts");const o=el("a","btn small","Open");o.href="https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";o.target="_blank";o.rel="noopener";a.append(o);m.append(a);r.append(m);fs.append(r)})}
}

/* ---------- Person card ---------- */
async function openPerson(raw,nameIn){
  const addr=String(addrOf(raw)||"").toLowerCase();if(!addr||!/@/.test(addr))return;
  const name=nameIn||nameOf(raw)||addr;
  const host=infoOpen(name);host.append(el("p","status",addr));
  const acts=el("div","acts");
  acts.append(onbBtn("New email",()=>{infoClose();thrClose();openCompose({to:addr})},"small solid"));
  host.append(acts);
  const wait=[];
  Object.keys(state.chase||{}).forEach(id=>{const c=state.chase[id];if(String(c.to||"").toLowerCase()===addr)wait.push({id,title:c.title||(tById(id)||{}).subject||"Email",due:c.due,kind:"Waiting for their reply"})});
  Object.keys(state.handoffs||{}).forEach(id=>{const h=state.handoffs[id];if(h.to===addr&&h.status==="waiting")wait.push({id,title:h.subject,kind:"Handed to them"})});
  if(wait.length){const s=infoSection(host,"Waiting on them");wait.forEach(w=>{const r=el("div","item");r.append(el("span","dot wait"));const m=el("div","main");m.append(el("span","t",w.title),el("span","m",w.kind+(w.due?" · reminder "+niceDay(w.due):"")));const a=el("div","acts");a.append(onbBtn("Open",()=>{infoClose();openThread(w.id)},"small"));m.append(a);r.append(m);s.append(r)})}
  const es=infoSection(host,"Recent emails"),ms=infoSection(host,"Meetings"),fs=infoSection(host,"Files shared with them or by them");
  [es,ms,fs].forEach(x=>x.append(el("p","status","Loading...")));
  let mails=[],evs=[],files=[];
  const jobs=[
    gmailFind("from:"+addr+" OR to:"+addr,8).then(l=>{mails=l;es.replaceChildren();if(!l.length)es.append(el("p","status","No emails found."));l.forEach(t=>es.append(threadRow(t,infoClose)))}).catch(e=>{es.replaceChildren(el("p","status err","Couldn't search mail ("+clip((e&&e.message)||"unknown reason",80)+")."))}),
    (async()=>{
      const a=new Date();a.setDate(a.getDate()-60);const b=new Date();b.setDate(b.getDate()+90);
      const r=await mcp.callTool("Google Calendar","list_events",{q:addr,startTime:ymd(a)+"T00:00:00",endTime:ymd(b)+"T00:00:00",pageSize:10},{cache:false});
      evs=((r.payload&&r.payload.events)||[]).filter(x=>x.status!=="cancelled");ms.replaceChildren();
      if(!evs.length)ms.append(el("p","status","No meetings found."));
      evs.forEach(x=>{const r=el("div","ev");const d=x.start&&(x.start.dateTime||x.start.date);r.append(el("b","",d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""));const sp=el("span");if(x.htmlLink){const l=el("a","",x.summary||"(No title)");l.href=x.htmlLink;l.target="_blank";l.rel="noopener";l.style.color="var(--fg)";sp.append(l)}else sp.append(x.summary||"(No title)");r.append(sp);ms.append(r)});
    })().catch(e=>{ms.replaceChildren(el("p","status err","Couldn't read the calendar ("+clip((e&&e.message)||"unknown reason",80)+")."))}),
    mcp.callTool("Google Drive","search_files",{raw:"trashed=false and ('"+addr.replace(/'/g,"")+"' in owners or '"+addr.replace(/'/g,"")+"' in writers or '"+addr.replace(/'/g,"")+"' in readers)",pageSize:6}).then(r=>{
      files=(r.payload&&r.payload.files)||[];fs.replaceChildren();if(!files.length)fs.append(el("p","status","No shared files found."));
      files.forEach(f=>{const row=el("div","item");row.append(el("span","dot none"));const m=el("div","main");m.append(el("span","t",f.title));const a=el("div","acts");const o=el("a","btn small","Open");o.href="https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";o.target="_blank";o.rel="noopener";a.append(o);m.append(a);row.append(m);fs.append(row)});
    }).catch(e=>{fs.replaceChildren(el("p","status err","Couldn't read Drive ("+clip((e&&e.message)||"unknown reason",80)+")."))})
  ];
  if(sample){
    const ss=infoSection(host,"Summary");const b=el("button","btn small","Summarise our history");b.type="button";ss.append(b);
    b.onclick=async()=>{
      b.disabled=true;b.textContent="Writing...";await Promise.allSettled(jobs);
      try{
        const r=await creditFallback(prov=>sample("Summarise "+(myName||"my")+" working relationship with "+name+" ("+addr+") at "+BR.co+", in 5 short lines. Say what we work on, what is open, and what I should do next. Use only the facts below. No em dashes.\n\nRecent emails (newest first):\n"+mails.slice(0,8).map(t=>"- "+t.subject+" ("+(t.date||"").slice(0,10)+"): "+t.snippet).join("\n")+"\n\nMeetings:\n"+evs.map(x=>"- "+(x.summary||"")+" ("+String((x.start||{}).dateTime||(x.start||{}).date||"").slice(0,10)+")").join("\n")+"\n\nFiles:\n"+files.map(f=>"- "+f.title).join("\n")+"\n\nWaiting on them:\n"+wait.map(w=>"- "+w.title+" ("+w.kind+")").join("\n"),{cache:false,provider:prov}));
        const t=el("div","mailtext");t.textContent=String(r.text||"").trim();ss.replaceChildren(el("h3","","Summary"),t);
      }catch(e){b.disabled=false;b.textContent="Summarise our history";ss.append(el("p","status err","Couldn't write it ("+clip((e&&e.message)||"unknown reason",90)+")."))}
    };
  }
}

/* ---------- Search everything ---------- */
async function searchAll(){
  const q=$("allQ").value.trim(),host=$("allRes");host.replaceChildren();if(!q)return;
  if(!G.connected()){host.append(el("p","status err","Connect Google first."));return}
  host.append(el("p","status","Searching your mail, files, meetings and tasks..."));
  const lc=q.toLowerCase();
  const a=new Date();a.setDate(a.getDate()-90);const b=new Date();b.setDate(b.getDate()+180);
  const [mail,drv,cal]=await Promise.allSettled([
    gmailFind(q,6),
    mcp.callTool("Google Drive","search_files",{query:q,pageSize:6}).then(r=>(r.payload&&r.payload.files)||[]),
    mcp.callTool("Google Calendar","list_events",{q,startTime:ymd(a)+"T00:00:00",endTime:ymd(b)+"T00:00:00",pageSize:8},{cache:false}).then(r=>((r.payload&&r.payload.events)||[]).filter(x=>x.status!=="cancelled"))
  ]);
  host.replaceChildren();
  const sec=(t,n)=>{const s=el("div","infosec");s.append(el("h3","",t+(n!=null?" ("+n+")":"")));host.append(s);return s};
  const note=(s,r,what)=>{if(r.status==="rejected")s.append(el("p","status err","Couldn't search "+what+" ("+clip((r.reason&&r.reason.message)||"unknown reason",70)+")."))};
  // people
  const people=contactPool().filter(c=>c.email.includes(lc)||c.name.toLowerCase().includes(lc)).slice(0,5);
  if(people.length){const s=sec("People",people.length);const row=el("div","acts");people.forEach(p=>{const x=el("button","chip",(p.name||p.email)+(p.name?" · "+p.email:""));x.type="button";x.onclick=()=>openPerson(p.email,p.name);row.append(x)});s.append(row)}
  // mail
  {const list=mail.status==="fulfilled"?mail.value:[];const s=sec("Mail",list.length);note(s,mail,"mail");if(mail.status==="fulfilled"&&!list.length)s.append(el("p","status","Nothing found."));list.forEach(t=>s.append(threadRow(t)))}
  // files
  {const list=drv.status==="fulfilled"?drv.value:[];const s=sec("Files",list.length);note(s,drv,"Drive");if(drv.status==="fulfilled"&&!list.length)s.append(el("p","status","Nothing found."));
   list.forEach(f=>{const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");m.append(el("span","t",f.title),el("span","m",(f.modifiedTime?"Changed "+fmtWhen(f.modifiedTime):"")));const ac=el("div","acts");const o=el("a","btn small","Open");o.href="https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";o.target="_blank";o.rel="noopener";ac.append(o);
     if(fileKind(f.mimeType,f.title)){const rd=el("button","btn small","Ask AI about it");rd.type="button";rd.onclick=()=>openFileAI(f.title,()=>mcp.callTool("Google Drive","read_file",{fileId:f.id,mimeType:f.mimeType},{cache:false}).then(x=>x.payload));ac.append(rd)}
     m.append(ac);r.append(m);s.append(r)})}
  // meetings
  {const list=cal.status==="fulfilled"?cal.value:[];const s=sec("Meetings",list.length);note(s,cal,"the calendar");if(cal.status==="fulfilled"&&!list.length)s.append(el("p","status","Nothing found."));
   list.forEach(x=>{const r=el("div","ev");const d=x.start&&(x.start.dateTime||x.start.date);r.append(el("b","",d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""));const sp=el("span");if(x.htmlLink){const l=el("a","",x.summary||"(No title)");l.href=x.htmlLink;l.target="_blank";l.rel="noopener";l.style.color="var(--fg)";sp.append(l)}else sp.append(x.summary||"(No title)");
     if(x.start&&x.start.dateTime){const pb=el("button","btn small ghost","Prep brief");pb.type="button";pb.style.marginLeft="8px";pb.onclick=()=>openBrief(x);sp.append(pb)}r.append(sp);s.append(r)})}
  // tasks
  {const list=(state.tasks||[]).filter(t=>String(t.t||"").toLowerCase().includes(lc)||String(t.src||"").toLowerCase().includes(lc));const s=sec("Tasks",list.length);if(!list.length)s.append(el("p","status","Nothing found."));
   list.slice(0,8).forEach(t=>{const r=el("div","item");r.append(el("span","dot "+(t.done?"none":"work")));const m=el("div","main");m.append(el("span","t",t.t),el("span","m",(t.done?"Done":"Open")+(t.due?" · due "+niceDay(t.due):"")+(t.src?" · "+t.src:"")));const ac=el("div","acts");ac.append(onbBtn("Show in my tasks",()=>{goSec("tasks")},"small"));m.append(ac);r.append(m);s.append(r)})}
  const clr=el("button","btn small ghost","Clear results");clr.type="button";clr.onclick=()=>{host.replaceChildren();$("allQ").value=""};host.append(clr);
}
$("allGo").onclick=searchAll;$("allQ").addEventListener("keydown",e=>{if(e.key==="Enter")searchAll()});

/* ---------- Hand off to a team member ---------- */
const DEFAULT_TEAM=[{name:"Karim",email:"karimhbahri@gmail.com"},{name:"Louloua",email:"louloua@wyzrent.com"}];
const teamList=()=>(Array.isArray(state.team)?state.team:DEFAULT_TEAM).filter(p=>p&&/^\S+@\S+\.\S+$/.test(p.email||"")&&p.email.toLowerCase()!==myEmailLc());
function renderTeam(){
  const h=$("teamList");h.replaceChildren();
  const all=Array.isArray(state.team)?state.team:DEFAULT_TEAM;
  all.forEach((p,i)=>{const r=el("div","acts");r.append(el("span","",p.name+" · "+p.email));const x=el("button","btn small ghost","Remove");x.type="button";x.onclick=()=>{state.team=all.filter((_,k)=>k!==i);persist();renderTeam()};r.append(x);h.append(r)});
  if(!all.length)h.append(el("p","status","No team members yet. Add one below."));
}
$("teamAdd").onclick=()=>{
  const n=$("teamName").value.trim(),e=$("teamEmail").value.trim();
  if(!n||!/^\S+@\S+\.\S+$/.test(e)){$("teamEmail").focus();return}
  state.team=(Array.isArray(state.team)?state.team:DEFAULT_TEAM).concat({name:n,email:e});persist();$("teamName").value="";$("teamEmail").value="";renderTeam();
};
attachAutocomplete($("teamEmail"),true);
function openHandoff(){
  const team=teamList();
  const host=infoOpen("Hand off: "+($("thrTitle").textContent||"this email"));
  if(!team.length){host.append(el("p","status","Add a team member first, under Settings, Replies and rules, Team."));return}
  host.append(el("p","status","They get this email with your note. It leaves your board until they answer, and you can nudge them from Waiting on the team."));
  host.append(el("span","status","Hand it to"));
  const sel=el("select","in");sel.setAttribute("aria-label","Team member");team.forEach(p=>sel.append(new Option(p.name+" ("+p.email+")",p.email)));host.append(sel);
  host.append(el("span","status","Your note to them"));
  const note=el("textarea","in");note.rows=4;note.placeholder="For example: Please arrange this today and tell me when it's done.";note.setAttribute("aria-label","Your note");host.append(note);
  const inc=el("label","status");const cb=el("input");cb.type="checkbox";cb.checked=true;inc.append(cb," Include the conversation below my note");inc.style.display="flex";inc.style.gap="8px";host.append(inc);
  const st=el("p","status");const go=el("button","btn solid","Send and track");go.type="button";host.append(go,st);
  go.onclick=async()=>{
    if(!note.value.trim()){st.className="status err";st.textContent="Write a short note first.";note.focus();return}
    const to=sel.value,person=team.find(p=>p.email===to),subj=$("thrTitle").textContent||"";
    go.disabled=true;st.className="status";st.textContent="Sending...";
    try{
      const sg=sigText(),body=note.value.trim()+(sg?"\n\n"+sg:"")+(cb.checked?forwardBlock():"");
      const r=await mcp.callTool("Gmail","send_message",{to:[to],cc:[],subject:/^(fwd?|please handle):/i.test(subj)?subj:"Please handle: "+subj,body,attachments:[]});
      state.handoffs=state.handoffs||{};
      state.handoffs[thr.id]={to:to.toLowerCase(),name:person.name,at:Date.now(),subject:subj,status:"waiting",note:note.value.trim(),watch:(r.payload&&r.payload.threadId)||"",msgId:(r.payload&&r.payload.id)||""};
      logDone(thr.item,"handed to "+person.name);persist();renderBoard();
      st.textContent="Sent to "+person.name+". It is now under Waiting on the team.";
      setTimeout(()=>{infoClose();thrClose()},900);
    }catch(e){go.disabled=false;st.className="status err";st.textContent=e&&e.code==="consent_required"?"Google didn't allow sending. Sign out and back in, and tick every box.":"Couldn't send it ("+clip((e&&e.message)||"unknown reason",90)+")."}
  };
}
function renderHandoffs(){
  const card=$("handoffCard"),host=$("handoffList");
  const list=Object.entries(state.handoffs||{}).filter(([,h])=>h.status==="waiting"||h.status==="replied").sort((a,b)=>b[1].at-a[1].at);
  card.hidden=!list.length;host.replaceChildren();
  list.forEach(([id,h])=>{
    const r=el("div","item");r.append(el("span","dot "+(h.status==="replied"?"fyi":"wait")));const m=el("div","main");
    m.append(el("span","t",h.subject||"Email"));
    const meta=el("span","m");meta.append(el("span","pill"+(h.status==="replied"?" ok":""),h.status==="replied"?h.name+" replied":"Waiting on "+h.name),document.createTextNode(" · handed over "+fmtWhen(new Date(h.at).toISOString())+(h.note?" · "+clip(h.note,70):"")));m.append(meta);
    const a=el("div","acts");
    a.append(onbBtn("Open the email",()=>openThread(id),"small"));
    if(h.status==="replied"&&h.watch)a.append(onbBtn("Read the reply",()=>openThread(h.watch),"small solid"));
    if(h.status==="waiting"){const n=el("button","btn small","Nudge");n.type="button";n.onclick=async()=>{
      n.disabled=true;n.textContent="Sending...";
      try{await mcp.callTool("Gmail","send_message",{to:[h.to],cc:[],subject:/^re:/i.test(h.subject)?h.subject:"Re: Please handle: "+h.subject,body:"Hi "+h.name+", a quick reminder about this one. Can you let me know where it stands?"+(sigText()?"\n\n"+sigText():""),replyToMessageId:h.msgId||undefined,attachments:[]});h.nudged=Date.now();persist();n.textContent="Nudged"}
      catch(e){n.disabled=false;n.textContent="Couldn't nudge"}};a.append(n)}
    const d=el("button","btn small ghost","Done");d.type="button";d.onclick=()=>{h.status="closed";setDone(id);persist();renderBoard()};
    const back=el("button","btn small ghost","Take it back");back.type="button";back.onclick=()=>{delete state.handoffs[id];persist();renderBoard()};
    a.append(d,back);m.append(a);r.append(m);host.append(r);
  });
}
async function checkHandoffs(){
  const list=Object.entries(state.handoffs||{}).filter(([,h])=>h.status==="waiting"&&h.watch).slice(0,8);
  let changed=false;
  for(const [id,h] of list){
    try{
      const r=await mcp.callTool("Gmail","get_thread",{threadId:h.watch},{cache:false});
      const ms=(r.payload&&r.payload.messages)||[];
      if(ms.some(m=>addrOf(m.sender).toLowerCase()===h.to&&(!h.at||Date.parse(m.date)>=h.at-1000))){h.status="replied";h.repliedAt=Date.now();changed=true}
    }catch(e){}
  }
  if(changed){persist();renderBoard()}
}

/* ---------- 3.31: pin, quick calendar and task, call or WhatsApp, long-thread summary, attachments, meeting notes, unread badge ---------- */
function isPinned(id){return !!(state.pin&&state.pin[id])}
function togglePin(id){state.pin=state.pin||{};if(state.pin[id])delete state.pin[id];else state.pin[id]=Date.now();persist();try{renderBoard()}catch(e){}}
function phonesIn(msgs){
  const me=myAddr(),out=[];
  msgs.slice().reverse().forEach(m=>{
    if(addrOf(m.sender).toLowerCase()===me)return;
    const txt=(splitQuoted(String(m.plaintextBody||"")).main)||"";
    (txt.match(/(?:\+|00)?\d[\d ().-]{7,18}\d/g)||[]).forEach(r=>{
      let d=r.replace(/[^\d+]/g,"");if(d.startsWith("00"))d="+"+d.slice(2);
      const n=d.replace(/\D/g,"");if(n.length<9||n.length>15)return;
      if(!d.startsWith("+")&&!/^0[1-9]/.test(d))return;
      if(/^(19|20)\d{6}$/.test(n))return;
      if(!out.some(x=>x.n===n))out.push({raw:r.trim(),plus:d.startsWith("+"),n,who:String(nameOf(m.sender)||"").split(" ")[0]});
    });
  });
  return out.slice(0,2);
}
function drawTools(){
  const host=$("thrTools"),box=$("thrToolBox");if(!host)return;host.replaceChildren();box.replaceChildren();
  if(!thr.msgs.length||thr.mode==="new"){host.hidden=true;return}
  host.hidden=false;
  const pinned=isPinned(thr.id);
  const pb=el("button","btn small"+(pinned?" solid":""),pinned?"📌 Pinned":"📌 Pin to top");pb.type="button";pb.title="Keep this email at the top until you mark it done";
  pb.onclick=()=>{togglePin(thr.id);drawTools();thrNote(isPinned(thr.id)?"Pinned. It stays at the top of your board and Top for today until it's done.":"Unpinned.")};
  const cb=el("button","btn small","📅 Add to calendar");cb.type="button";cb.onclick=()=>toolCalendar(box);
  const tb=el("button","btn small","✅ Make it a task");tb.type="button";tb.onclick=()=>toolTask(box);
  const dg=el("button","btn small","👥 Delegate");dg.type="button";dg.title="Send it to a team member with your note, and see when they answer";dg.onclick=()=>openHandoff();
  host.append(pb,cb,tb,dg);if(window.ccButton)host.append(window.ccButton());
  phonesIn(thr.msgs).forEach(p=>{
    const intl=p.plus?p.n:"971"+p.n.replace(/^0/,"");
    const c=el("a","btn small","📞 Call"+(p.who?" "+p.who:""));c.href="tel:"+(p.plus?"+":"")+p.n;c.title=p.raw;
    const w=el("a","btn small","💬 WhatsApp"+(p.who?" "+p.who:""));w.href="https://wa.me/"+intl;w.target="_blank";w.rel="noopener";w.title=p.raw;
    host.append(c,w);
  });
}
async function toolCalendar(box){
  box.replaceChildren();const f=el("div","freebox");box.append(f);
  const id0=thr.id,t=tById(thr.id)||{};
  const ti=el("input","in");ti.value=String(t.subject||thr.item.title||"Meeting").replace(/^(re|fwd?):\s*/i,"");ti.setAttribute("aria-label","Event title");
  const st=el("input","in");st.type="datetime-local";st.setAttribute("aria-label","Starts");
  const d0=new Date();d0.setDate(d0.getDate()+1);st.value=ymd(d0)+"T10:00";
  const du=el("select","in");[["15","15 min"],["30","30 min"],["60","1 hour"],["90","1.5 hours"],["120","2 hours"]].forEach(([v,l])=>du.append(new Option(l,v)));du.value="30";
  const lo=el("input","in");lo.placeholder="Where (optional)";lo.setAttribute("aria-label","Location");
  const inv=el("label","status chk");const ic=el("input");ic.type="checkbox";inv.append(ic," Invite the people on this email");
  const msg=el("p","status","");
  const row=(l,n)=>{const r=el("div","ask");const s=el("span","status",l);s.style.minWidth="60px";r.append(s,n);return r};
  const go=el("button","btn small solid","Add to calendar");go.type="button";
  const x=el("button","btn small ghost","Cancel");x.type="button";x.onclick=()=>box.replaceChildren();
  const a=el("div","acts");a.append(go,x);
  f.append(el("b","","📅 Add to your calendar"),row("Title",ti),row("Starts",st),row("Length",du),row("Where",lo),inv,msg,a);
  go.onclick=async()=>{
    if(!st.value){msg.className="status err";msg.textContent="Pick a start time.";return}
    const s=new Date(st.value),e=new Date(s.getTime()+(+du.value||30)*60000),fmt=d=>ymd(d)+"T"+pad2(d.getHours())+":"+pad2(d.getMinutes());
    const guests=ic.checked?[...new Set(thr.msgs.flatMap(m=>[addrOf(m.sender)].concat((m.toRecipients||[]).map(addrOf),(m.ccRecipients||[]).map(addrOf))).map(v=>String(v||"").toLowerCase()))].filter(v=>/^\S+@\S+\.\S+$/.test(v)&&v!==myAddr()):[];
    go.disabled=true;go.textContent="Adding...";
    const acct=/^a(\d+)~/.test(id0)?+id0.match(/^a(\d+)~/)[1]:undefined;
    try{
      await mcp.callTool("Google Calendar","create_event",Object.assign({title:ti.value.trim()||"Meeting",start:fmt(s),end:fmt(e),location:lo.value.trim(),account:acct},guests.length?{attendees:guests}:{}));
      f.replaceChildren(el("p","status","Added to your calendar: "+(ti.value.trim()||"Meeting")+", "+niceDay(ymd(s))+" at "+pad2(s.getHours())+":"+pad2(s.getMinutes())+(guests.length?". Invites sent to "+guests.length+" "+(guests.length===1?"person":"people")+".":".")));
      try{loadCal()}catch(_){}
    }catch(err){go.disabled=false;go.textContent="Add to calendar";msg.className="status err";msg.textContent="Couldn't add it ("+clip((err&&err.message)||"unknown reason",90)+")."}
  };
  if(sample){
    msg.textContent="Looking for a date and time in the email...";
    try{
      const r=await sample.json("Today is "+new Date().toDateString()+", Dubai time. Read this email thread and find the meeting, call, viewing, visit or deadline it proposes or confirms. Return JSON only: {\"found\": true or false, \"title\": short title, \"start\": \"YYYY-MM-DDTHH:MM\" Dubai time, \"minutes\": length in minutes, \"location\": \"\"}. If there's a day but no time, use 10:00.\n\n"+threadBlock(thr.msgs),{cache:false});
      if(thr.id!==id0||!f.isConnected)return;
      if(r&&r.found&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(r.start||""))){
        if(r.title)ti.value=String(r.title);st.value=String(r.start).slice(0,16);
        const m=String(Math.round(+r.minutes||30));if(![...du.options].some(o=>o.value===m))du.append(new Option(m+" min",m));du.value=m;
        if(r.location)lo.value=String(r.location);msg.textContent="Found it in the email. Check it, then press Add to calendar.";
      }else msg.textContent="No date in the email. Pick one, then press Add to calendar.";
    }catch(e){if(f.isConnected)msg.textContent="Pick the date and time, then press Add to calendar."}
  }
}
function toolTask(box){
  box.replaceChildren();const f=el("div","freebox");box.append(f);
  const t=tById(thr.id)||{};
  const ti=el("input","in");ti.value=thr.item.title||t.subject||"";ti.setAttribute("aria-label","Task");
  const du=el("input","in");du.type="date";du.setAttribute("aria-label","Due date");du.style.flex="0 1 180px";
  const quick=el("div","chips");
  [["Today",0],["Tomorrow",1],["In 3 days",3],["Next week",7]].forEach(([l,n])=>{const c=el("button","chip",l);c.type="button";c.onclick=()=>{const d=new Date();d.setDate(d.getDate()+n);du.value=ymd(d);quick.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b===c)))};quick.append(c)});
  const go=el("button","btn small solid","Add task");go.type="button";
  const x=el("button","btn small ghost","Cancel");x.type="button";x.onclick=()=>box.replaceChildren();
  go.onclick=()=>{const v=ti.value.trim();if(!v){ti.focus();return}
    addTask(v,"Email from "+(nameOf(t.from)||nameOf(lastMsg().sender)||"someone"),du.value||"");
    f.replaceChildren(el("p","status","Task added"+(du.value?", due "+niceDay(du.value):"")+". You'll find it under My tasks."))};
  const a=el("div","acts");a.append(go,x);
  const dr=el("div","ask");dr.append(el("span","status","Due"),du);
  f.append(el("b","","✅ Make it a task"),ti,quick,dr,a);ti.focus();
}
/* a 3-line summary at the top of long conversations */
const sumMem={};
async function drawThreadSummary(){
  let c=$("thrSum2");if(c)c.remove();
  if(thr.msgs.length<5||thr.mode==="new"||state.autoSum===false||!sample)return;
  const key=thr.id+"|"+(lastMsg().id||""),id0=thr.id;
  c=el("div","suggest");c.id="thrSum2";
  const h=el("div","sghead");h.append(el("b","","📝 Summary of "+thr.msgs.length+" messages"));
  const x=el("button","btn small ghost","Hide");x.type="button";x.onclick=()=>c.remove();h.append(x);c.append(h);
  const p=el("div","mailtext",sumMem[key]||"Summarising...");c.append(p);
  $("thrBody").prepend(c);
  if(sumMem[key])return;
  try{
    const r=await sample("Summarize this email conversation in 3 short lines for a busy manager: what it's about, where it stands now, and what's needed from them, if anything. Plain words, no em dashes, no semicolons. Start each line with a dash.\n\n"+threadBlock(thr.msgs),{cache:false});
    if(thr.id!==id0)return;sumMem[key]=String(r.text||"").trim();p.textContent=sumMem[key]||"No summary.";
  }catch(e){if(thr.id===id0&&c.isConnected)c.remove()}
}
/* every attachment from the last 60 days, in one place */
function fileDownload(m,f,b){
  const old=b.textContent;b.textContent="Downloading...";
  fetchFile(m,f).then(b64=>{
    const bin=atob(b64);const u8=Uint8Array.from(bin,c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([u8],{type:f.type||"application/octet-stream"}));
    const a=document.createElement("a");a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);b.textContent=old;
  }).catch(()=>{b.textContent="Couldn't download"});
}
async function openAttachments(q){
  const run=(openAttachments.run||0)+1;openAttachments.run=run;
  const kind=openAttachments.k||"all";
  const host=infoOpen("📎 Attachments");
  const row=el("div","ask");const inp=el("input","in");inp.placeholder="Search by file name, sender or subject";inp.value=q||"";inp.setAttribute("aria-label","Search attachments");
  const go=el("button","btn small solid","Search");go.type="button";row.append(inp,go);host.append(row);
  go.onclick=()=>openAttachments(inp.value.trim());inp.onkeydown=e=>{if(e.key==="Enter")go.click()};
  const chips=el("div","chips");
  [["all","All"],["pdf","PDFs"],["img","Pictures"],["office","Word and Excel"]].forEach(([k,l])=>{const c=el("button","chip",l);c.type="button";c.setAttribute("aria-pressed",String(kind===k));c.onclick=()=>{openAttachments.k=k;openAttachments(inp.value.trim())};chips.append(c)});
  host.append(chips);
  const list=el("div");host.append(list);list.append(el("p","status","Looking through the last 60 days..."));
  const ext={pdf:"filename:pdf",img:"(filename:jpg OR filename:jpeg OR filename:png OR filename:heic)",office:"(filename:doc OR filename:docx OR filename:xls OR filename:xlsx OR filename:csv)"}[kind]||"";
  const re={pdf:/\.pdf$/i,img:/\.(jpe?g|png|heic|gif|webp)$/i,office:/\.(docx?|xlsx?|csv|pptx?)$/i}[kind]||/./;
  let ths=[];
  try{const r=await mcp.callTool("Gmail","search_threads",{query:("has:attachment newer_than:60d -in:chats "+ext+(q?" "+q:"")).trim(),pageSize:12},{cache:false});ths=(r.payload&&r.payload.threads)||[]}
  catch(e){if(run===openAttachments.run)list.replaceChildren(el("p","status err","Couldn't search your mail ("+clip((e&&e.message)||"unknown reason",90)+")."));return}
  if(run!==openAttachments.run)return;
  if(!ths.length){list.replaceChildren(el("p","status","No attachments found."));return}
  list.replaceChildren();let shown=0;const wait=el("p","status","Reading "+ths.length+" emails...");list.append(wait);
  for(let n=0;n<ths.length;n+=3){
    const part=await Promise.all(ths.slice(n,n+3).map(t=>mcp.callTool("Gmail","get_thread",{threadId:t.id,messageFormat:"PLAIN_TEXT"},{cache:false}).then(r=>({id:t.id,msgs:(r.payload&&r.payload.messages)||[]})).catch(()=>null)));
    if(run!==openAttachments.run)return;
    part.filter(Boolean).forEach(th=>{
      th.msgs.slice().reverse().forEach(m=>{
        (m.files||[]).filter(f=>f.name&&!(f.cid&&/^image\//.test(f.type||"")&&(!f.size||f.size<60000))&&re.test(f.name)).forEach(f=>{
          shown++;
          const r=el("div","item");r.append(el("span","dot none"));const mm=el("div","main");
          mm.append(el("span","t","📎 "+f.name),el("span","m",(f.size?(f.size>1048576?(f.size/1048576).toFixed(1)+" MB":Math.max(1,Math.round(f.size/1024))+" KB")+" · ":"")+(nameOf(m.sender)||"")+(m.date?" · "+fmtWhen(m.date):"")+(m.subject?" · "+clip(m.subject,60):"")));
          const a=el("div","acts");
          if(f.id||f.data){const dl=el("button","btn small solid","Download");dl.type="button";dl.onclick=()=>fileDownload(m,f,dl);a.append(dl);
            if(fileKind(f.type,f.name)){a.append(onbBtn("Ask AI about it",()=>{infoClose();openFileAI(f.name,()=>attachmentLoader(m,f))},"small"))}
            const sv=el("button","btn small","Save to Drive");sv.type="button";sv.onclick=()=>saveToDrive(m,f,sv);a.append(sv)}
          a.append(onbBtn("Open the email",()=>{infoClose();openThread(th.id)},"small ghost"));
          mm.append(a);r.append(mm);list.insertBefore(r,wait);
        });
      });
    });
    wait.textContent=n+3<ths.length?"Reading more emails...":"";
  }
  if(!shown)wait.textContent="No matching files found.";else if(!wait.textContent)wait.remove();
}
/* notes for a meeting, turned into tasks or a follow-up email */
function openNotes(ev){
  state.meetNotes=state.meetNotes||{};const k=ev.id||ev.summary||"meeting";
  const title=ev.summary||"Meeting";
  const host=infoOpen("📝 Notes: "+title);
  const when=ev.start&&ev.start.dateTime;if(when)host.append(el("p","status",niceDay(ymd(new Date(when)))+" at "+fmtTime(when)));
  const ta=el("textarea","in");ta.rows=8;ta.style.minHeight="160px";ta.placeholder="What was agreed, who does what, and by when. Tap the mic on your keyboard to dictate.";ta.setAttribute("aria-label","Meeting notes");
  ta.value=(state.meetNotes[k]&&state.meetNotes[k].text)||"";
  ta.oninput=()=>{state.meetNotes[k]={text:ta.value,title,at:Date.now()};clearTimeout(openNotes.t);openNotes.t=setTimeout(persist,500)};
  const st=el("p","status","Saved on this device as you type.");const out=el("div");
  const people=(ev.attendees||[]).filter(a=>a.email&&!a.self&&!a.resource&&a.email!==myEmailLc()).map(a=>a.email);
  const tk=onbBtn("Turn into tasks",async()=>{
    const txt=ta.value.trim();if(!txt){ta.focus();return}
    tk.disabled=true;st.className="status";st.textContent="Finding the tasks...";let list=[];
    try{
      if(sample){const r=await sample.json("Today is "+new Date().toDateString()+". These are "+(myName||"a manager")+"'s notes from the meeting \""+title+"\". List the action items. Return JSON only: {\"tasks\": [ {\"title\": short task, \"owner\": first name or \"me\", \"due\": \"YYYY-MM-DD\" or \"\"} ] }.\n\nNotes:\n"+txt,{cache:false});list=(r&&r.tasks)||[]}
      else list=txt.split(/\n|\.\s+/).map(s=>s.replace(/^[-*\d.\s]+/,"").trim()).filter(s=>s.length>2).map(s=>({title:s,owner:"me",due:""}));
      list=list.filter(x=>x&&x.title).slice(0,12);
      list.forEach(x=>{const mine=!x.owner||/^me$/i.test(x.owner)||(myName&&String(x.owner).toLowerCase()===myName.split(" ")[0].toLowerCase());addTask((mine?"":x.owner+": ")+x.title,"Meeting: "+title,/^\d{4}-\d{2}-\d{2}$/.test(x.due||"")?x.due:"")});
      st.textContent=list.length?list.length+" task"+(list.length>1?"s":"")+" added under My tasks.":"No action items found in the notes.";
      out.replaceChildren();list.forEach(x=>out.append(el("p","status","✅ "+(x.owner&&!/^me$/i.test(x.owner)?x.owner+": ":"")+x.title+(x.due?" · due "+niceDay(x.due):""))));
    }catch(e){st.className="status err";st.textContent="Couldn't read the tasks ("+clip((e&&e.message)||"unknown reason",90)+")."}
    tk.disabled=false;
  },"small solid");
  const fu=onbBtn("Write follow-up email",async()=>{
    const txt=ta.value.trim();if(!txt){ta.focus();return}
    fu.disabled=true;st.className="status";st.textContent="Writing it...";let body="";
    try{
      if(sample){const tone=await toneExamples().catch(()=>"");const r=await sample("Write a short follow-up email from "+(myName||"me")+" at "+BR.co+" after the meeting \""+title+"\", to the people who attended. Thank them in one line, then list what was agreed and who does what by when, from the notes. Plain text, use contractions, no em dashes, no semicolons, "+(sigText()?"no sign-off, the signature is added automatically":"signed with the first name")+". Return only the email body.\n\nNotes:\n"+txt+(tone?"\n\n"+tone:""),{cache:false});body=String(r.text||"").trim()}
    }catch(e){}
    if(!body)body="Thanks for your time today. Here's what we agreed:\n\n"+txt;
    fu.disabled=false;infoClose();openCompose({to:people.join(", "),subject:"Follow-up: "+title,body});
  },"small");
  const a=el("div","acts");a.append(tk,fu);
  host.append(ta,a,st,out);ta.focus();
}
/* unread count on the app icon and the browser tab */
function updateBadge(){
  try{
    const n=(threads||[]).filter(t=>t.unread&&!t.lastFromMe&&!doneNow({id:t.id})&&!(state.snooze[t.id]&&state.snooze[t.id]>todayKey())).length;
    if(!updateBadge.base)updateBadge.base=document.title.replace(/^\(\d+\)\s*/,"");
    document.title=(n?"("+n+") ":"")+updateBadge.base;
    if(state.badgeOff){if("clearAppBadge" in navigator)navigator.clearAppBadge().catch(()=>{});return}
    if("setAppBadge" in navigator)(n?navigator.setAppBadge(n):navigator.clearAppBadge()).catch(()=>{});
  }catch(e){}
}
if($("attBtn"))$("attBtn").onclick=()=>{if(!G.connected()){showWelcome();return}openAttachments("")};
if($("autoSum"))$("autoSum").onchange=()=>{state.autoSum=$("autoSum").checked;persist()};
if($("badgeOn"))$("badgeOn").onchange=()=>{state.badgeOff=!$("badgeOn").checked;persist();updateBadge()};

/* ---------- 3.36: documents you made or shared in ChatGPT and Claude, read from their export files ---------- */
let aiDocs={chatgpt:[],claude:[]};
function loadAiDocs(){try{const v=JSON.parse(localStorage.getItem(LS+"-aidocs")||"null");if(v)aiDocs=Object.assign({chatgpt:[],claude:[]},v)}catch(e){}}
function saveAiDocs(key,docs){
  aiDocs[key]=docs.sort((a,b)=>b.at-a.at).slice(0,400);
  for(let cap=12000;cap>=1000;cap=Math.floor(cap/2)){
    const out=JSON.stringify({chatgpt:aiDocs.chatgpt.map(d=>Object.assign({},d,{text:(d.text||"").slice(0,cap)})),claude:aiDocs.claude.map(d=>Object.assign({},d,{text:(d.text||"").slice(0,cap)}))});
    if(out.length<2500000){try{localStorage.setItem(LS+"-aidocs",out);return}catch(e){}}
  }
}
function gptDocs(arr){
  const out=[],seen=new Map();
  (Array.isArray(arr)?arr:[]).forEach(c=>{
    const id=c.conversation_id||c.id||"",url=id?"https://chatgpt.com/c/"+id:"https://chatgpt.com/",chat=String(c.title||"Untitled");
    Object.values(c.mapping||{}).map(n=>n&&n.message).filter(Boolean).sort((a,b)=>(a.create_time||0)-(b.create_time||0)).forEach(m=>{
      const at=(m.create_time||c.update_time||c.create_time||0)*1000,parts=(m.content&&Array.isArray(m.content.parts))?m.content.parts:[];
      const rc=String(m.recipient||"");
      if(/^canmore\.(create|update)_textdoc$/.test(rc)){
        try{const j=JSON.parse(parts.filter(p=>typeof p==="string").join(""));
          if(rc.endsWith("create_textdoc")){const k="canvas:"+id+":"+(j.name||"");const d={src:"chatgpt",kind:"Canvas",title:String(j.name||"Canvas document"),at,url,chat,text:String(j.content||"")};seen.set(k,d);out.push(d)}
          else{const last=[...seen.entries()].filter(([k])=>k.startsWith("canvas:"+id+":")).pop();if(last){last[1].at=at;const u=(j.updates||[])[0];if(u&&u.pattern===".*"&&u.replacement)last[1].text=String(u.replacement)}}
        }catch(e){}
      }
      ((m.metadata&&m.metadata.attachments)||[]).forEach(a=>{if(a&&a.name&&!seen.has("att:"+id+":"+a.name)){const d={src:"chatgpt",kind:"You shared",title:String(a.name),at,url,chat,text:""};seen.set("att:"+id+":"+a.name,d);out.push(d)}});
      if(m.author&&m.author.role==="assistant")parts.filter(p=>typeof p==="string").forEach(p=>{(p.match(/sandbox:\/mnt\/data\/[^\s)\]"']+/g)||[]).forEach(u=>{const n=decodeURIComponent(u.split("/").pop());if(n&&!seen.has("made:"+id+":"+n)){const d={src:"chatgpt",kind:"Made by ChatGPT",title:n,at,url,chat,text:""};seen.set("made:"+id+":"+n,d);out.push(d)}})});
    });
  });
  return out;
}
function claudeDocs(arr){
  const out=[],seen=new Set();
  (Array.isArray(arr)?arr:[]).forEach(c=>{
    const url=c.uuid?"https://claude.ai/chat/"+c.uuid:"https://claude.ai/",chat=String(c.name||"Untitled");
    (c.chat_messages||[]).forEach(m=>{
      const at=Date.parse(m.created_at||c.updated_at||c.created_at)||0;
      (m.content||[]).forEach(x=>{if(x&&x.type==="tool_use"&&x.name==="artifacts"&&x.input&&(x.input.title||x.input.id)){const k=c.uuid+":"+(x.input.id||x.input.title);const prev=out.find(d=>d.k===k);if(prev){prev.at=at;if(x.input.content)prev.text=String(x.input.content)}else if(!seen.has(k)){seen.add(k);out.push({k,src:"claude",kind:"Artifact",title:String(x.input.title||x.input.id),at,url,chat,text:String(x.input.content||"")})}}});
      (m.attachments||[]).concat(m.files||[]).forEach(a=>{const n=a&&(a.file_name||a.name);if(n&&!seen.has(c.uuid+":f:"+n)){seen.add(c.uuid+":f:"+n);out.push({src:"claude",kind:"You shared",title:String(n),at,url,chat,text:""})}});
    });
  });
  return out;
}
function aiDocsInRange(){
  const k=docRangeKey(),[from,to]=docRange(k),name=(($("docQ")&&$("docQ").value)||"").trim().toLowerCase();
  return aiDocs.chatgpt.concat(aiDocs.claude).filter(d=>(!from||d.at>=from.getTime())&&(!to||d.at<to.getTime())&&(!name||d.title.toLowerCase().includes(name)||d.chat.toLowerCase().includes(name))).sort((a,b)=>b.at-a.at);
}
function renderAiDocs(){
  const host=$("aiDocs");if(!host)return;host.replaceChildren();
  const have=aiDocs.chatgpt.length+aiDocs.claude.length;
  const head=el("div","pad");const h=el("h3","","From ChatGPT and Claude");h.style.margin="0 0 4px";head.append(h);host.append(head);
  const EXP={chatgpt:{name:"ChatGPT",url:"https://chatgpt.com/#settings/DataControls",where:"Settings, Data controls, Export data, then Confirm export",q:"from:openai.com (export OR \"data export\") newer_than:14d",input:"f-chatgpt",n:aiDocs.chatgpt.length},
             claude:{name:"Claude",url:"https://claude.ai/settings/data-privacy-controls",where:"Settings, Privacy, then Export data",q:"from:anthropic.com (export OR \"data export\") newer_than:14d",input:"f-claude",n:aiDocs.claude.length}};
  const findMail=async x=>{const b=infoOpen("Your "+x.name+" export email");b.append(el("p","status","Open the email and tap its download link. Then come back and tap Import from "+x.name+"."));const l=el("div");b.append(l);l.append(el("p","status","Searching your mail..."));
    try{const t=await gmailFind(x.q,6);l.replaceChildren();if(!t.length){l.append(el("p","status","No export email yet. It usually arrives within a few minutes of asking. Check again shortly."));return}t.forEach(z=>l.append(threadRow(z,infoClose)))}catch(e){l.replaceChildren(el("p","status err","Couldn't search your mail ("+clip((e&&e.message)||"unknown reason",80)+")."))}};
  Object.values(EXP).forEach(x=>{
    const row=el("div","acts");row.style.padding="0 14px 6px";row.append(el("b","",x.name+":"));
    const a1=el("a","btn small","1. Ask "+x.name+" for the file ↗");a1.href=x.url;a1.target="_blank";a1.rel="noopener";a1.title=x.where;
    const a2=el("button","btn small","2. Find the email");a2.type="button";a2.onclick=()=>findMail(x);
    const a3=el("button","btn small"+(x.n?"":" solid"),"3. "+(x.n?"Update":"Import")+" from "+x.name);a3.type="button";a3.onclick=()=>$(x.input).click();
    row.append(a1,a2,a3);host.append(row);
  });
  const imp=el("div","acts");imp.style.padding="0 14px 8px";
  const how=el("button","btn small ghost","How it works");how.type="button";how.onclick=()=>{const b=infoOpen("Get your ChatGPT and Claude documents");
    Object.values(EXP).forEach(x=>{const s=infoSection(b,x.name);s.append(el("p","status","1. Tap the link. It opens "+x.where+". Ask for the export."),el("p","status","2. "+x.name+" emails you a download link, usually within minutes. Tap Find the email on your page, open it and download the .zip."),el("p","status","3. Tap Import from "+x.name+" and choose the .zip. No need to unzip it."));const a=el("a","btn small solid","Open "+x.name+" export settings ↗");a.href=x.url;a.target="_blank";a.rel="noopener";s.append(a)});
    const w=infoSection(b,"Why a file");w.append(el("p","status","ChatGPT and Claude don't let other apps read your chats directly, so the export file is the only way in. Repeat it whenever you want the list refreshed, about once a week is enough."))};
  imp.append(how);host.append(imp);
  if(!have){host.append(el("p","sub","Import your ChatGPT export to list the canvas documents you wrote there, the files you shared with it and the files it made for you. Claude works the same way.")) ;return}
  const list=aiDocsInRange(),lbl=docRangeLabel(docRangeKey());
  host.append(el("p","sub",list.length?list.length+" document"+(list.length>1?"s":"")+" from your chats "+(lbl||"in total")+". Imported "+fmtWhen(new Date(Math.max((research.chatgpt&&research.chatgpt.at)||0,(research.claude&&research.claude.at)||0)||Date.now()).toISOString())+".":"No ChatGPT or Claude documents "+(lbl||"found")+"."));
  list.slice(0,60).forEach(d=>{
    const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");
    m.append(el("span","t",d.title));m.append(el("span","m",(d.src==="chatgpt"?"ChatGPT":"Claude")+" · "+d.kind+(d.at?" · "+fmtWhen(new Date(d.at).toISOString()):"")+" · in \""+clip(d.chat,50)+"\""));
    const a=el("div","acts");
    if(d.text){
      a.append(onbBtn("Read",()=>{const b=infoOpen(d.title);b.append(el("p","status",(d.src==="chatgpt"?"ChatGPT":"Claude")+" "+d.kind.toLowerCase()+" · "+fmtWhen(new Date(d.at).toISOString())));const t=el("div","mailtext",d.text);b.append(t);const ac=el("div","acts");const cp=onbBtn("Copy text",()=>navigator.clipboard.writeText(d.text).then(()=>cp.textContent="Copied").catch(()=>{}),"small");ac.append(cp);b.append(ac)},"small solid"));
      a.append(onbBtn("Ask AI about it",()=>openFileAI(d.title,async()=>({text:d.text})),"small"));
    }
    const o=el("a","btn small ghost","Open the chat ↗");o.href=d.url;o.target="_blank";o.rel="noopener";a.append(o);
    m.append(a);r.append(m);host.append(r);
  });
}
loadAiDocs();
