const PAGE_URL = location.href.split("#")[0];
const G = Connectors.google;
const ST = {reply:"Reply today",follow:"Follow up",work:"Work on",wait:"Waiting on others",fyi:"FYI"};
const ORDER = ["reply","follow","work","wait","fyi"];
const UR = {4:"Critical",3:"High",2:"Medium",1:"Low"};
const SRC = ["Gmail","Google Calendar"];
const $ = id => document.getElementById(id);
const el = (t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
let LS = "wyzcc-v1";
const state0={done:{},snooze:{},tasks:[]};
let mcp=null, sample=null, db=null, perms=null, uid=null, myName="", email="", pic="";
let threads=[], sent=[], events=null, board=null, state={done:{},snooze:{},tasks:[]}, flt=null, showOff=false;
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
    {name:"Signed in with Google",done:!!uid,desc:uid?"You're signed in as "+email+". Your board is private to you.":"Tap Continue with Google at the top of the page.",btn:uid?null:["Continue with Google",()=>connectGoogle()]},
    Object.assign({name:"Gmail"},mailStep("Gmail","Reads your inbox and sent mail, and saves reply drafts you approve.")),
    Object.assign({name:"Google Calendar"},mailStep("Google Calendar","Shows your meetings for today and tomorrow.")),
    {name:"AI assistant: Claude or ChatGPT (optional)",done:!!sample||!!state.skipAi,
      desc:sample?(Connectors.ai.label()+(Connectors.ai.mode()==="shared"?" is on automatically with your Google sign-in.":" is on with your own key (stored on this device only).")+" Change it under Connections, Personalise."):"Without an AI, your inbox is sorted by simple rules. Connect Claude or ChatGPT for smarter sorting, drafts and Instruct AI. Each connects with an API key and stays on this device.",
      btn:["Add Claude key",()=>askKey("claude")],btn2:sample||state.skipAi?["Add ChatGPT key",()=>askKey("chatgpt")]:null},
    Object.assign({name:"Your Claude research"},imp("claude","Claude",CLAUDE_EXPORT,"f-claude","1. Tap Open Claude export page. 2. Under Your data, tap Export data and confirm. 3. Claude emails you a download link (usually within minutes). 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it.")),
    Object.assign({name:"Your ChatGPT research"},imp("chatgpt","ChatGPT",GPT_EXPORT,"f-chatgpt","1. Tap Open ChatGPT export page and sign in if asked. 2. In Data controls, tap Export data, then Confirm export. 3. OpenAI emails you a download link. 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it. Repeat weekly to keep it current.")),
    optional("Google Drive (optional)",drive.state,"Connected. Your recent documents show under Documents.","skipDrive","Shows the documents you've been working on. Uses the same Google sign-in as Gmail.",["Connect Google",()=>connectGoogle(drive.state==="denied")],"Google didn't give this page access to Drive. Tap Allow and tick every box on Google's screen.",{note:drive.note,fn:loadDrive}),
    optional("Todoist (optional)",todo.state,"Connected. Your Todoist tasks for today show under My tasks.","skipTodo","Use Todoist? In Todoist open Settings, Integrations, Developer and copy your API token, then tap Add token. No Todoist? Tap Skip, the built-in task list already works.",["Add token",setTodoToken],"Todoist didn't accept the token. Tap Replace token and paste it again.",{note:todo.note,fn:loadTodoist}),
    ...(DASH?[{name:"WYZ Rent dashboard (optional)",done:!!state.shareDash||!!state.skipDash,
      desc:state.shareDash?(state.dashErr?"Couldn't share: "+state.dashErr:"Sharing is on. Only counts and your research topics and ideas go to the company dashboard, never email text."+(state.dashAt?" Last shared "+fmtWhen(state.dashAt)+".":"")):"Optional. Share a daily summary with the company dashboard. Only counts and research topics and ideas are sent, never email text. You can turn it off any time.",
      btn:state.shareDash?["Share now",()=>shareSummary()]:["Turn on sharing",()=>setShare(true)],
      btn2:state.shareDash?["Turn off",()=>setShare(false)]:(state.skipDash?null:["Not now",()=>{state.skipDash=1;persist();renderSetup()}])}]:[]),
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
  const steps=stepDefs();try{reportStatus(steps)}catch(e){}const n=steps.filter(s=>s.done).length;
  $("progBar").style.width=Math.round(n/steps.length*100)+"%";
  $("setupTxt").textContent=n===steps.length?"All set. Everything below runs on your own accounts.":n+" of "+steps.length+" done. Sign in to each account below, one time. Everything uses your own accounts and nobody else sees your board.";
  const allDone=n===steps.length;
  if(allDone!==setupComplete){setupComplete=allDone;if(allDone)collapsed.add("setupCard");else collapsed.delete("setupCard");saveCol();try{applyOrder();applyCol()}catch(e){}}
  try{gateUi()}catch(e){}
  ["setupList","setupList2"].forEach(id=>{
    const host=$(id);host.replaceChildren();
    steps.forEach((s,ix)=>{
      const r=el("div","stp"+(s.done?" done":""));r.append(el("span","num",s.done?"✓":String(ix+1)),el("span","nm",s.name));
      const go=el("div","go");
      if(s.link){const a=el("a","btn small",s.link[1]);a.href=s.link[0];a.target="_blank";a.rel="noopener";go.append(a)}
      if(s.btn){const b=el("button","btn small solid",s.btn[0]);b.type="button";b.onclick=s.btn[1];go.append(b)}
      if(s.btn2){const b=el("button","btn small ghost",s.btn2[0]);b.type="button";b.onclick=s.btn2[1];go.append(b)}
      r.append(go,el("span","ds",s.desc));host.append(r);
    });
  });
  try{if(!$("onb").hidden&&ONB[onbI]==="research")onbRender()}catch(e){}
}
/* ---------- guided connect: Claude, Todoist, research (shown right after Google sign-in) ---------- */
let ONB=["claude","todoist","research","done"];
let onbI=0;
const firstName=()=>(myName||"").split(" ")[0]||"there";
function onbOpen(){ONB=(Connectors.ai.mode()==="shared"?["todoist","research"]:["claude","todoist","research"]).concat(DASH?["dash"]:[],["done"]);onbI=0;$("onb").hidden=false;$("onbMsg").textContent="";onbRender()}
function onbClose(finished){$("onb").hidden=true;if(finished){state.onboarded=1;persist()}renderSetup()}
function onbGo(n){onbI=Math.min(n,ONB.length-1);$("onbMsg").textContent="";onbRender()}
function onbLink(href,text){const a=el("a","btn small",text);a.href=href;a.target="_blank";a.rel="noopener";return a}
function onbBtn(text,fn,cls){const b=el("button","btn "+(cls||""),text);b.type="button";b.onclick=fn;return b}
function onbRender(){
  const k=ONB[onbI],body=$("onbBody"),acts=$("onbActs");body.replaceChildren();acts.replaceChildren();
  $("onbStep").textContent=k==="done"?"All done":"Step "+(onbI+1)+" of "+(ONB.length-1);
  const dots=$("onbDots");dots.replaceChildren();ONB.forEach((_,i)=>dots.append(el("i",i<=onbI?"on":"")));
  const p=(t,c)=>body.append(el("p",c||"sub",t));
  if(k==="claude"){
    $("onbTitle").textContent="Connect an AI assistant";
    if(sample){p(Connectors.ai.label()+" is connected. Your inbox is sorted smartly and drafts are written for you.");acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));return}
    p("Welcome, "+firstName()+". Google is connected. Next, connect an AI so your inbox is sorted by what needs you, replies are drafted for you and your research gets follow-ups. Choose Claude or ChatGPT. You can add the other one later.");
    p("Neither has a sign-in button for other websites, so each connects with your own API key. It is stored on this device only and sent only to that company.");
    const sel=el("select","in");sel.id="onbProv";sel.setAttribute("aria-label","Which AI");sel.append(new Option("Claude (sk-ant-...)","claude"),new Option("ChatGPT (sk-...)","chatgpt"));body.append(sel);
    const lk=onbLink("https://console.anthropic.com/settings/keys","Get my Claude key");body.append(lk);
    sel.onchange=()=>{const g=sel.value==="chatgpt";lk.href=g?"https://platform.openai.com/api-keys":"https://console.anthropic.com/settings/keys";lk.textContent=g?"Get my OpenAI key":"Get my Claude key";inp.placeholder=g?"sk-...":"sk-ant-..."};
    const inp=el("input","in");inp.id="onbKey";inp.type="password";inp.placeholder="sk-ant-...";inp.autocomplete="off";inp.setAttribute("aria-label","API key");body.append(inp);
    acts.append(onbBtn("Connect",async function(){
      const b=this;b.disabled=true;b.textContent="Checking your key...";$("onbMsg").textContent="";
      const r=await connectAI(sel.value,inp.value);
      if(r.ok){onbGo(onbI+1);return}
      b.disabled=false;b.textContent="Connect";$("onbMsg").textContent=r.msg;
    },"solid"),onbBtn("Skip for now",()=>{state.skipAi=1;persist();onbGo(onbI+1)},"ghost"));
  }else if(k==="todoist"){
    $("onbTitle").textContent="Connect Todoist";
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
    },"solid"),onbBtn("I don't use Todoist",()=>{state.skipTodo=1;persist();onbGo(onbI+1)},"ghost"));
  }else if(k==="research"){
    $("onbTitle").textContent="Bring in your ChatGPT and Claude research";
    p("Optional. Export your chats from each service, then import the file here. The page then suggests a follow-up for each piece of unfinished research. ChatGPT and Claude only share chats through an export file, so this part takes a few minutes.");
    [["chatgpt","ChatGPT",GPT_EXPORT,"f-chatgpt"],["claude","Claude",CLAUDE_EXPORT,"f-claude"]].forEach(([key,label,url,fid])=>{
      const r=research[key],row=el("div","onbrow");
      row.append(el("b","",label+(r&&r.at?" ✓":"")));
      row.append(el("span","status",r&&r.at?(r.convs||[]).length+" conversations imported.":"Open the export page, request your data, then import the .zip from the email."));
      const a=el("div","acts");a.append(onbLink(url,"Open "+label+" export page"),onbBtn(r&&r.at?"Import again":"Import file",()=>$(fid).click()));row.append(a);body.append(row)});
    acts.append(onbBtn("Continue",()=>onbGo(onbI+1),"solid"));
  }else if(k==="dash"){
    $("onbTitle").textContent="Share a daily summary with the company";
    p("Optional. Turn this on to send a short daily summary to the WYZ Rent dashboard, so the team can see how the day is going.");
    p("What is sent: counts only (emails to reply, follow-ups, meetings today, open tasks) and your research topics and ideas. Never email text, names or files. You can turn it off at any time.");
    acts.append(onbBtn("Turn on sharing",()=>{setShare(true);onbGo(onbI+1)},"solid"),onbBtn("Not now",()=>{state.skipDash=1;persist();onbGo(onbI+1)},"ghost"));
  }else{
    $("onbTitle").textContent="You're all set, "+firstName();
    const line=(ok,t)=>body.append(el("p","sub",(ok?"✓ ":"○ ")+t));
    line(true,"Google: Gmail, Calendar and Drive ("+(email||"signed in")+")");
    line(!!sample,sample?"Claude: connected, smart sorting and drafts on":"Claude: not connected, simple sorting for now");
    line(todo.state==="ok",todo.state==="ok"?"Todoist: connected":"Todoist: not connected");
    const n=((research.chatgpt&&research.chatgpt.convs)||[]).length+((research.claude&&research.claude.convs)||[]).length;
    line(n>0,n?"Research: "+n+" conversations imported":"Research: not imported yet");
    if(DASH)line(!!state.shareDash,state.shareDash?"Company dashboard: sharing a daily summary":"Company dashboard: not sharing");
    p("You can connect anything left from the Connections tab at any time.");
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
  const w=$("welcome");w.hidden=false;
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
  try{$("pageName").value=state.pageName||"";applyPageName();$("autoDraft").checked=!!state.autoDraft}catch(e){}
  const h=new Date().getHours();
  $("hello").textContent=myName?(h<12?"Good morning, ":h<18?"Good afternoon, ":"Good evening, ")+myName.split(" ")[0]:"Your execution page";
  try{updateHero()}catch(e){}
  $("who").hidden=!uid;
  if(uid){$("whoName").textContent=email||myName;const a=$("avatar");if(pic){a.src=pic;a.hidden=false}else a.hidden=true}
}
let loopOn=false;
async function afterConnect(){
  const p=await G.profile();
  uid=p.sub;myName=p.name||"";email=p.email||"";pic=p.picture||"";
  try{localStorage.setItem("wyz-last-name",myName)}catch(e){}
  LS="wyzcc-v1-"+uid;loadContactsCache();
  $("welcome").hidden=true;renderHello();
  try{G.token().then(t=>fetch("/api/seen",{method:"POST",headers:{Authorization:"Bearer "+t}})).catch(()=>{})}catch(e){}
  const snap=lsGet();if(snap&&snap.state)restore(snap);
  await loadResearch();renderTasks();renderSetup();loadContacts();
  if(!state.onboarded)onbOpen();
  await refreshAll(false);
  if(!loopOn){loopOn=true;
    setInterval(()=>{if(!document.hidden)refreshAll(false)},600000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&board&&Date.now()-(board.at||0)>300000)refreshAll(false)})}
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
  try{await sample("Reply with the single word OK.",{provider:p,cache:false})}
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
  sel.hidden=ready.length<2;const a=Connectors.ai.active();if(a)sel.value=a;
  $("thrAI").textContent=sample?"Write it with "+Connectors.ai.names[a||"claude"]:"Fill a template";
}
$("thrAIpick").onchange=()=>{Connectors.ai.setChosen($("thrAIpick").value);renderAI();$("thrAI").textContent="Write it with "+Connectors.ai.names[$("thrAIpick").value]};
/* Connections, Personalise */
const baseTitle=()=>state.pageName&&state.pageName.trim()?state.pageName.trim():"WYZ Rent Execution Page";
function applyPageName(){
  const n=state.pageName&&state.pageName.trim();
  document.querySelector(".hero .eyebrow").textContent=n||"WYZ Rent · Execution Page";
  document.title=baseTitle();try{updateHero()}catch(e){}
}
/* colour palette and light/dark look, saved per device and applied before first paint by a tiny script in index.html */
const PAL_META={ocean:"#104b70",emerald:"#0f6b52",indigo:"#3b3fa8",sunset:"#b4492b",plum:"#7a2e8e"};
function lookNow(){try{return JSON.parse(localStorage.getItem("wyz-look")||"{}")}catch(e){return {}}}
function applyLook(l){
  const r=document.documentElement,p=PAL_META[l.p]?l.p:"ocean";
  r.setAttribute("data-palette",p);
  if(l.m==="light"||l.m==="dark")r.setAttribute("data-theme",l.m);else r.removeAttribute("data-theme");
  document.querySelectorAll("#swatches .swatch").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pal===p)));
  $("lookMode").value=l.m==="light"||l.m==="dark"?l.m:"auto";
  const mt=document.querySelector('meta[name="theme-color"]');if(mt)mt.content=PAL_META[p];
}
function saveLook(patch){const l=Object.assign({},lookNow(),patch);try{localStorage.setItem("wyz-look",JSON.stringify(l))}catch(e){}applyLook(l)}
document.querySelectorAll("#swatches .swatch").forEach(b=>b.onclick=()=>saveLook({p:b.dataset.pal}));
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
const copyBtn=(id,text,label)=>{$(id).onclick=()=>navigator.clipboard.writeText(text()).then(()=>{$(id).textContent="Copied";setTimeout(()=>$(id).textContent=label,1500)}).catch(()=>{$(id).textContent="Copy by hand"})};
copyBtn("wFamCopy",()=>$("wFamLink").value,"Copy link");
copyBtn("wCopyOrigin",()=>location.origin,"Copy address");
copyBtn("wCopyScopes",()=>["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.compose","https://www.googleapis.com/auth/gmail.modify","https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/drive.metadata.readonly"].join("\n"),"Copy scopes");
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
      if(x.location)s.append(el("small",""," · "+x.location));if(x.id&&x.start&&x.start.dateTime){const rs=el("button","btn small ghost","Reschedule");rs.type="button";rs.style.marginLeft="8px";rs.onclick=()=>openEvent(x);s.append(rs)}if(x.conferenceUrl){const j=el("a","btn small","Join");j.href=x.conferenceUrl;j.target="_blank";j.rel="noopener";j.style.marginLeft="8px";s.append(j)}r.append(s);host.append(r)});
  });
}

/* ---------- mail ---------- */
const nameOf=s=>{s=String(s||"");const m=s.match(/^\s*"?([^"<]+?)"?\s*</);return m?m[1]:s.replace(/@.*/,"")};
const addrOf=s=>{s=String(s||"");const m=s.match(/<([^>]+)>/);return (m?m[1]:s).trim()};
function slimThread(t){const ms=t.messages||[];const last=ms[ms.length-1]||{};const first=ms[0]||{};
  const mine=(last.labelIds||[]).includes("SENT");const lastOther=[...ms].reverse().find(m=>!(m.labelIds||[]).includes("SENT"))||{};
  const days=last.date?Math.floor((Date.now()-Date.parse(last.date))/86400000):null;
  return {id:t.id,from:mine?(lastOther.sender||first.sender||""):(last.sender||first.sender||""),subject:first.subject||last.subject||"(No subject)",snippet:(last.snippet||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").slice(0,280),date:last.date||first.date||"",count:t.messageCount||ms.length,unread:(last.labelIds||[]).includes("UNREAD"),important:(last.labelIds||[]).includes("IMPORTANT"),url:t.viewUrl||last.viewUrl||"",lastId:last.id||t.id,lastFromMe:mine,lastTo:mine?(last.toRecipients||[]).slice(0,3):[],daysSinceLast:days,auto:(last.labelIds||[]).some(l=>/^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l))}}
async function loadMail(force){
  if(!mcp||busy)return;busy=true;setFresh("load","Reading your inbox and sent mail");
  try{
    const g=await mcp.server("Gmail").catch(e=>{throw e});
    const [inb,snt,snt2]=await Promise.all([
      g.search_threads({query:"in:inbox newer_than:7d -category:promotions -category:social",pageSize:30},{cache:false}),
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
  const prompt="You are triaging one person's email for their daily run sheet. The person is "+(myName||"the reader")+" at WYZ Rent, a Dubai holiday home management company. Today is "+now.toString()+".\n\n"+
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
    return out.length?"Match the voice, warmth and length of how they usually write. Examples of their own emails:\n\n"+out.map((x,i)=>"Example "+(i+1)+":\n"+x).join("\n\n"):"";
  }catch(e){return ""}})();
  return toneP;
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
    if(r.event&&r.event.title&&r.event.start){const l=el("a","btn small","Add to calendar: "+clip(r.event.title,30));l.href=gcalLink(r.event);l.target="_blank";l.rel="noopener";acts.append(l)}
    const c=el("button","btn small ghost","Copy answer");c.type="button";c.onclick=()=>navigator.clipboard.writeText(String(r.answer||"")).then(()=>c.textContent="Copied").catch(()=>c.textContent="Select the text to copy");acts.append(c);
    out.append(acts);
  };
  async function run(){
    const q=inp.value.trim();if(!q){inp.focus();return}
    const opt=aiOptions().find(o=>o.id===pick.value)||aiOptions()[0];
    if(opt.kind==="link"||!opt.ready){
      const txt0=cached||await getText();cached=txt0||"";
      out.replaceChildren(el("p","status",openOutside(opt,q+"\n\nEmail thread:\n"+cached.slice(0,2500))));return}
    go.disabled=true;out.replaceChildren(el("p","status","Thinking..."));
    try{
      const txt=cached||await getText();cached=txt||"";
      const first=(myName||"").split(" ")[0];
      const tone=/reply|draft|write|answer|respond/i.test(q)?await toneExamples():"";
      const r=await sample.json("You are the personal assistant of "+(myName||"a manager")+" at WYZ Rent, a Dubai holiday home management company. Today is "+new Date().toDateString()+".\n\nEmail thread (latest last):\n"+cached+"\n\nTheir instruction: "+q+"\n\nReturn JSON only: {\"answer\": a short plain answer, max 120 words, no em dashes, \"reply\": a ready-to-send reply email body in their voice (contractions, "+(sigText()?"no sign-off or name, their signature is added automatically":"signed with the first name"+(first?" "+first:""))+") or an empty string when no reply is needed, \"tasks\": [ {\"title\": short, \"due\": \"YYYY-MM-DD\" or \"\"} ] only when they ask for a task or one is clearly needed, \"snooze_days\": a whole number of days to snooze this email, or 0, \"event\": null, or {\"title\", \"start\": \"YYYY-MM-DDTHH:MM\", \"end\": \"YYYY-MM-DDTHH:MM\", \"location\"} only when the email proposes or confirms a meeting }."+(tone?"\n\n"+tone:""),{provider:opt.id,cache:false});
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
  const all=$("thrAll").checked,t=replyTargets(all);
  $("thrTo").value=t.to.join(", ");$("thrCc").value=t.cc.join(", ");$("thrCcWrap").hidden=!all;
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
    });
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
    if(to)d.append(el("div","meta","To: "+to+((m.ccRecipients||[]).length?" · Cc: "+m.ccRecipients.map(x=>nameOf(x)||x).join(", "):"")));
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
  o=o||{};const t=tById(id)||{};
  thr={id,msgs:[],item:o.item||{id,st:"reply",title:t.subject||"",summary:t.snippet||""},armed:0,done:false,mode:"reply",files:[]};
  setMode("reply");renderTplSelect();syncRuleBtns();renderThrPick();$("thrFiles").value="";$("thrFileList").textContent="";$("thrArchive").disabled=false;$("thrArchive").textContent="Archive";$("thrRemind").value="3";
  $("thr").hidden=false;$("thrTitle").textContent=t.subject||"Conversation";
  $("thrGmail").href=t.url||"https://mail.google.com/";
  $("thrSnooze").replaceChildren(snoozeDrop(id,thrClose));$("thrAIbox").hidden=true;$("thrAIbox").open=false;
  $("thrBody").replaceChildren(el("p","sub","Loading the conversation..."));
  try{if(voice.on){voice.on=false;rec.abort()}}catch(e){}micState(false);$("thrExact").hidden=true;
  $("thrFree").hidden=true;$("thrPaste").value="";$("thrReply").hidden=true;$("thrSt").textContent="";$("thrSt").className="status";$("thrText").value="";$("thrAll").checked=false;
  ["thrSend","thrSave","thrText","thrTo","thrCc"].forEach(k=>$(k).disabled=false);
  $("thrSend").textContent="Send";
  try{const r=await mcp.callTool("Gmail","get_thread",{threadId:id,messageFormat:"PLAIN_TEXT"},{cache:false});thr.msgs=(r.payload&&r.payload.messages)||[]}catch(e){thr.msgs=[]}
  renderThread();threadNav();thrMore();
  if(thr.msgs.length&&(lastMsg().labelIds||[]).includes("UNREAD"))mcp.callTool("Gmail","mark_read",{threadId:id}).catch(()=>{});
  if(thr.msgs.length){
    $("thrReply").hidden=false;fillTargets();syncRuleBtns();
    $("thrAIbox").hidden=false;
    buildInstruct(thr.item,$("thrInstruct"),()=>threadBlock(thr.msgs),text=>{$("thrText").value=text;$("thrSt").className="status";$("thrSt").textContent="Edit it, then send it or save it as a draft.";$("thrText").focus()});
    if(o.text){$("thrText").value=o.text;$("thrSt").textContent="Edit it, then send it or save it as a draft."}
    else if(o.draft)thrDraft()
  }
  $("thr").querySelector(".pad").scrollTop=0;
}
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
    return "Write an email for "+(myName||"me")+" at WYZ Rent, a Dubai holiday home management company.\nIt is to: "+($("thrTo").value.trim()||"someone")+".\nWhat it should say: "+($("thrBrief").value.trim()||"(describe it here)")+"\n\nPlain text only, short, warm, professional, with contractions. No em dashes. Give a subject line first, then the email body.";
  }
  const chase=thrChase();
  return (chase?"Write a short, polite follow-up email chasing an answer that is still owed":"Write a reply email")+" for "+(myName||"me")+" at WYZ Rent, a Dubai holiday home management company. Plain text only, short, warm, professional, with contractions. No em dashes, no semicolons. Use [DATE] or [DETAIL] where a fact is unknown. Give only the email body.\n\nSubject: "+$("thrTitle").textContent+"\nThread (latest last):\n"+threadBlock(thr.msgs).slice(-6000);
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
    const r=await creditFallback(prov=>sample("Turn this spoken note into a clean email "+(reply?"reply":"")+" for "+(myName||"me")+" at WYZ Rent. Keep every fact and the meaning. Fix grammar, remove filler words, make it short and warm. Use contractions. No em dashes, no semicolons. Plain text only. "+(sigText()?"No sign-off and no name, the signature is added automatically.":"Sign with the first name"+(first?" "+first:"")+".")+" Return only the email body.\n\nWhat they said:\n"+raw+(reply?"\n\nThe email they are answering:\n"+threadBlock(thr.msgs).slice(-2500):""),{cache:false,provider:prov}));
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
async function thrDraft(){
  const ta=$("thrText"),st=$("thrSt"),chase=thrChase();
  st.className="status";st.textContent=sample?"Writing a draft with Claude...":"";ta.value="";
  const text=threadBlock(thr.msgs);
  try{
    const tone=sample?await toneExamples():"";
    const r=!sample?{text:templateDraft(thr.item,chase)}:await creditFallback(prov=>sample((chase?"Write a short, polite follow-up email chasing an answer that is still owed, ":"Write a reply email ")+"for "+(myName||"me")+" at WYZ Rent. Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject, no quoted text."+(tone?"\n\n"+tone:"")+"\n\nWhat it's about: "+(thr.item.title||"")+". "+(thr.item.summary||"")+"\n\nThread (latest last):\n"+text,{cache:false,provider:prov,onText:u=>{ta.value=u.text}}));
    ta.value=r.text;st.textContent=r.usedOther?Connectors.ai.names[r.skipped]+" has no credit, so "+Connectors.ai.names[r.usedOther]+" wrote this. Edit it, then send it or save it as a draft.":"Edit it, then send it or save it as a draft."
  }catch(e){st.className="status err";st.textContent="Couldn't write a draft ("+clip((e&&e.message)||"unknown reason",110)+")."+(isCreditErr(e)?" You can still use a free chat below, or write your own here.":" Write your own here.");if(isCreditErr(e))showFree()}
}
function thrArgs(){
  const last=lastMsg(),subj=String(tById(thr.id)&&tById(thr.id).subject||$("thrTitle").textContent||"");
  const split=v=>String(v||"").split(/[,;]/).map(x=>x.trim()).filter(Boolean);
  const files=thr.files.map(f=>({name:f.name,type:f.type,data:f.data}));
  const withSig=()=>{const t=$("thrText").value.trimEnd(),sg=sigText();return sg&&!t.includes(sg)?t+"\n\n"+sg:t};
  if(thr.mode==="new")return {to:split($("thrTo").value),cc:split($("thrCc").value),subject:$("thrSubj").value.trim(),body:withSig(),attachments:files};
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
  $("thrSubjWrap").hidden=!nw;$("thrBrief").hidden=!nw;if(nw)$("thrCcWrap").hidden=false;
  $("thrFwd").hidden=nw;
  $("thrFwd").textContent=fwd?"Back to reply":"Forward";
  $("thrSumWrap").hidden=!(fwd&&sample);$("thrRemWrap").hidden=fwd;$("thrAll").parentElement.hidden=fwd||nw;
  $("thrAI").hidden=fwd;$("thrFreeBtn").hidden=fwd;if(SR){$("thrMic").hidden=fwd;$("thrLang").hidden=fwd}if(fwd)$("thrFree").hidden=true;if(!fwd)$("thrSum").checked=false;
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
async function thrAct(kind){
  const st=$("thrSt"),a=thrArgs();st.className="status";
  if(!$("thrText").value.trim()&&!thr.files.length){st.className="status err";st.textContent=thr.mode==="forward"?"Add a short note or an attachment first.":thr.mode==="new"?"Write the email first.":"Write your reply first.";return}
  if(thr.mode==="new"&&!a.subject){st.className="status err";st.textContent="Add a subject.";$("thrSubj").focus();return}
  if(!a.to.length||a.to.concat(a.cc||[]).some(x=>!/^\S+@\S+\.\S+$/.test(addrOf(x)))){st.className="status err";st.textContent="Check the To and Cc addresses.";return}
  const btn=$(kind==="send"?"thrSend":"thrSave");
  if(kind==="send"&&!thr.armed){thr.armed=1;btn.textContent="Tap again to send to "+a.to[0]+(a.to.length>1?" +"+(a.to.length-1):"");setTimeout(()=>{if(thr.armed&&!thr.done){thr.armed=0;btn.textContent="Send"}},6000);return}
  thr.armed=0;btn.disabled=true;const old=btn.textContent;btn.textContent=kind==="send"?"Sending...":"Saving...";
  try{
    if(thr.mode==="forward"&&$("thrSum").checked&&sample){
      const sm=await sample("Summarize this email conversation for someone who has not seen it, in 4 short bullet lines, plain words, no em dashes.\n\n"+threadBlock(thr.msgs),{cache:false});
      a.body=withSigText()+"\n\nSummary:\n"+sm.text.trim();
    }
    const r=await mcp.callTool("Gmail",kind==="send"?"send_message":"create_draft",a);
    thr.done=true;["thrSend","thrSave","thrText","thrTo","thrCc"].forEach(k=>$(k).disabled=true);
    btn.textContent=kind==="send"?"Sent":"Saved";
    st.className="status";st.textContent=kind==="send"?"Sent to "+a.to.join(", ")+". Marked as done.":"Saved to your Gmail drafts.";
    if(kind==="send"){
      const tid=thr.mode==="new"?(r.payload&&r.payload.threadId):thr.id;
      if(thr.mode==="new"){logDone({id:tid,title:"Sent: "+a.subject},"sent");st.textContent="Sent to "+a.to.join(", ")+"."}
      else{state.done[thr.id]=1;logDone(thr.item)}
      const n=+$("thrRemind").value;if((thr.mode==="reply"||thr.mode==="new")&&n>0&&tid){const d=new Date();d.setDate(d.getDate()+n);state.chase=state.chase||{};state.chase[tid]={due:ymd(d),title:a.subject,at:Date.now(),to:a.to[0]};st.textContent+=" You'll be reminded on "+niceDay(ymd(d))+" if there's no reply."}
      persist();renderBoard()}
    else if(r.payload&&r.payload.viewUrl){const l=el("a","btn small","Open draft");l.href=r.payload.viewUrl;l.target="_blank";l.rel="noopener";$("thrSt").append(" ",l)}
  }catch(e){
    btn.disabled=false;btn.textContent=old==="Sending..."?"Send":"Save to Gmail drafts";st.className="status err";
    st.textContent=e&&e.code==="consent_required"?"Google didn't allow sending. Sign out and back in, and tick every box.":"Couldn't "+(kind==="send"?"send":"save")+" it ("+clip((e&&e.message)||"unknown reason",100)+"). Check Gmail before trying again."
  }
}
async function thrArchive(){
  const b=$("thrArchive"),st=$("thrSt");b.disabled=true;b.textContent="Archiving...";
  try{await mcp.callTool("Gmail","archive_thread",{threadId:thr.id});b.textContent="Archived";state.done[thr.id]=1;logDone(thr.item,"archived");persist();renderBoard();setTimeout(thrClose,600)}
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
    const mv=async(id,name)=>{d.open=false;try{await mcp.callTool("Gmail","modify_thread",{threadId:thr.id,add:[id],remove:["INBOX"]});state.done[thr.id]=1;logDone(thr.item,"moved to "+name);persist();renderBoard();thrNote("Moved to "+name+".");setTimeout(thrClose,700)}catch(e){thrErr(e,"move it")}};
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
  add("Move to bin",async()=>{
    if(!confirm("Move this whole conversation to the bin in Gmail?"))return;
    await mcp.callTool("Gmail","trash_thread",{threadId:thr.id});state.done[thr.id]=1;logDone(thr.item,"binned");persist();renderBoard();thrNote("Moved to the bin.");setTimeout(thrClose,600);
  });
  host.append(d);
}
function thrClose(){$("thr").hidden=true}
$("thrClose").onclick=thrClose;$("thrAI").onclick=()=>thr.mode==="new"?composeDraft():thrDraft();$("thrAll").onchange=fillTargets;
$("thrSend").onclick=()=>thrAct("send");$("thrSave").onclick=()=>thrAct("save");
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
const isOff=i=>!!state.done[i.id]||(state.snooze[i.id]&&state.snooze[i.id]>todayKey());
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
  state.done[i.id]=1;if(state.chase)delete state.chase[i.id];logDone(i);persist();renderBoard();
}
function renderBoard(){
  try{updateHero()}catch(e){}
  const host=$("board");host.replaceChildren();
  if(!board){return}
  $("headline").textContent=board.headline||"";
  const items=allItems().slice().sort((a,b)=>ORDER.indexOf(a.st)-ORDER.indexOf(b.st)||backFirst(b)-backFirst(a)||b.g-a.g);
  const vis=items.filter(i=>showOff||!isOff(i));
  // filters
  const f=$("filters");f.replaceChildren();
  ORDER.forEach(k=>{const n=items.filter(i=>i.st===k&&!isOff(i)).length;if(!n)return;const b=el("button","chip");b.type="button";b.append(el("span","dot "+k),el("span","",ST[k]),el("b","",String(n)));b.setAttribute("aria-pressed",String(flt===k));b.onclick=()=>{flt=flt===k?null:k;renderBoard()};f.append(b)});
  const offN=items.filter(isOff).length;$("showOff").textContent=(showOff?"Hide":"Show")+" done and snoozed ("+offN+")";
  ORDER.forEach(k=>{
    if(flt&&flt!==k)return;const list=vis.filter(i=>i.st===k);if(!list.length)return;
    const g=el("div","card group");const h=el("h3");h.append(el("span","dot "+k),el("span","",ST[k]),el("span","n",list.length+" item"+(list.length>1?"s":"")));g.append(h);makeCollapsible(g,"g-"+k,h);
    list.forEach(i=>g.append(itemRow(i)));host.append(g);
  });
  if(!vis.length&&(board.items||[]).length)host.append(el("p","sub","All clear. Everything is done or snoozed."));
  applyCol();
}
/* select several emails and act on them together */
let selOn=false;const sel=new Set();
function visibleIds(){return allItems().filter(i=>showOff||!isOff(i)).filter(i=>!flt||i.st===flt).map(i=>i.id)}
async function bulkArchive(btn){
  const ids=[...sel];let ok=0,bad=0,first=null;btn.disabled=true;
  for(let n=0;n<ids.length;n++){
    btn.textContent="Archiving "+(n+1)+" of "+ids.length+"...";
    try{await mcp.callTool("Gmail","archive_thread",{threadId:ids[n]});state.done[ids[n]]=1;logDone(allItems().find(x=>x.id===ids[n])||{id:ids[n]},"archived");ok++}catch(e){bad++;first=first||e;if(e&&e.code==="consent_required")break}
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
    btn("Done",()=>{allItems().filter(i=>sel.has(i.id)).forEach(i=>{if(state.repeat&&state.repeat[i.id]){logDone(i,"weekly");const d=new Date();d.setDate(d.getDate()+7);state.snooze[i.id]=ymd(d)}else{state.done[i.id]=1;logDone(i)}});persist();sel.clear();renderBoard();bulkBar()},"solid");
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
  const r=await creditFallback(prov=>sample("Write a reply email for "+(myName||"me")+" at WYZ Rent. Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject, no quoted text."+(tone?"\n\n"+tone:"")+"\n\nWhat it's about: "+(i.title||"")+". "+(i.summary||"")+"\n\nThread (latest last):\n"+threadBlock(msgs),{cache:false,provider:prov}));
  let body=String(r.text||"").trim();if(!body)throw new Error("the AI sent back nothing");
  const sg=sigText();if(sg&&!body.includes(sg))body+="\n\n"+sg;
  await mcp.callTool("Gmail","create_draft",{to,cc:[],subject:/^re:/i.test(subj)?subj:"Re: "+subj,body:body+quoteOf(last),replyToMessageId:last.id,attachments:[]});
  state.drafted=state.drafted||{};state.drafted[i.id]=Date.now();persist();
}
async function draftAll(auto){
  const st=$("draftAllSt"),btn=$("draftAll");
  if(drafting)return;
  if(!sample){st.className="status err";st.textContent="Connect Claude or ChatGPT first, under Connections.";return}
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
  const meta=el("span","m");const u=el("span","urg u"+i.g,UR[i.g]||"");meta.append(u,(i.vip?" · \u2605 VIP":"")+(state.snooze[i.id]===todayKey()?" · Back today":"")+(state.repeat&&state.repeat[i.id]?" · Weekly":"")+(state.drafted&&state.drafted[i.id]?" · Draft ready in Gmail":"")+" · "+(t.lastFromMe?"You wrote to "+(nameOf((t.lastTo||[])[0])||"them"):(nameOf(t.from)||""))+(i.when?" · "+i.when:t.date?" · "+fmtWhen(t.date):""));m.append(meta);
  const a=el("div","acts");
  if(t.url){const o=el("a","btn small","Open in Gmail");o.href=t.url;o.target="_blank";o.rel="noopener";a.append(o)}
  {const rd=el("button","btn small","Read thread");rd.type="button";rd.onclick=()=>openThread(i.id,{item:i});a.append(rd)}
  if(i.st==="reply"||i.st==="follow"||i.st==="work"||i.st==="wait"){const d=el("button","btn small solid",i.st==="follow"||i.st==="wait"?"Draft a chaser":"Draft a reply");d.type="button";d.onclick=()=>openThread(i.id,{item:i,draft:true});a.append(d)}
  const dn=el("button","btn small ghost",state.done[i.id]?"Undo done":"Done");dn.type="button";dn.onclick=()=>{if(state.done[i.id]){delete state.done[i.id];persist();renderBoard()}else markDone(i)};
  const sz=snoozeDrop(i.id);const ib=el("div","instr");const ins=el("button","btn small ghost","Instruct AI");ins.type="button";ins.onclick=()=>toggleInstruct(i,ib);
  const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask(i.title||t.subject,"Email from "+nameOf(t.from));at.textContent="Added";at.disabled=true};
  a.append(askDrop("I need help with an email. From: "+(t.lastFromMe?"me, to "+((t.lastTo||[]).join(", ")):(t.from||""))+". Subject: "+(t.subject||"")+". What it's about: "+(i.summary||t.snippet||"")+" What's the best way to handle it? If a reply or chaser is needed, draft one I can edit.",(i.title||t.subject||"")+(i.summary?"\n"+i.summary:"")),dn,sz,at,ins);m.append(a,ib);row.append(m);return row;
}
async function draftFor(i,host,btn){
  btn.disabled=true;btn.textContent="Reading the thread";
  let full=null,msgs=[];
  try{full=await mcp.callTool("Gmail","get_thread",{threadId:i.id,messageFormat:"PLAIN_TEXT"},{cache:false});msgs=(full.payload&&full.payload.messages)||[]}catch(e){}
  const text=msgs.slice(-6).map(x=>"From: "+(x.sender||"")+"\nDate: "+(x.date||"")+"\n"+String(x.plaintextBody||x.plaintext_body||x.snippet||"").slice(0,3000)).join("\n\n---\n\n");
  const box=el("div","draftbox");const ta=el("textarea");ta.id="d-"+i.id;ta.value="";const st=el("span","status","Writing a draft");
  box.append(st,ta);host.append(box);btn.textContent="Writing";
  try{
    const chase=(i.st==="follow"||i.st==="wait");const r=!sample?{text:templateDraft(i,chase)}:await sample((chase?"Write a short, polite follow-up email chasing an answer that is still owed, ":"Write a reply email ")+"for "+(myName||"me")+" at WYZ Rent. Plain text only, ready to edit, "+(sigText()?"with no sign-off and no name, because their signature is added automatically":"signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject.\n\nWhat it's about: "+(i.title||"")+". "+(i.summary||"")+"\n\nThread (latest last):\n"+(text||tById(i.id)?.snippet||""),{cache:false,provider:aiPickValue(),onText:u=>{ta.value=u.text}});
    ta.value=r.text;st.textContent="Edit it, then save it to your Gmail drafts.";
  }catch(e){st.textContent="Couldn't write a draft just now ("+clip((e&&e.message)||"unknown reason",110)+"). Write your own here, then save it.";st.className="status err"}
  btn.remove();
  const acts=el("div","acts");const sv=el("button","btn small solid","Save to Gmail drafts");sv.type="button";
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
  acts.append(sv,cp,wa);box.append(acts);
}
$("showOff").onclick=()=>{showOff=!showOff;renderBoard()};

/* ---------- ask ---------- */
$("askGo").onclick=ask;$("askQ").addEventListener("keydown",e=>{if(e.key==="Enter")ask()});
async function ask(){
  const q=$("askQ").value.trim();if(!q)return;const out=$("askOut");out.hidden=false;
  if(!sample){out.textContent="Ask needs an AI connected. Connect Claude or ChatGPT in the setup steps.";return}
  out.textContent="Thinking...";
  const ctx={today:new Date().toString(),board:(board&&board.items||[]).map(i=>({status:ST[i.st],urgency:UR[i.g],title:i.title,summary:i.summary,from:nameOf((tById(i.id)||{}).from)})),calendar:(events||[]).map(e=>({when:e.start&&(e.start.dateTime||e.start.date),what:e.summary}))};
  try{const r=await sample("You help "+(myName||"a WYZ Rent team member")+" run their day. Answer briefly and plainly, no em dashes. Their board and calendar (JSON):\n"+JSON.stringify(ctx)+"\n\nQuestion: "+q,{cache:false,onText:u=>{out.textContent=u.text}});out.textContent=r.text}
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
    if(!window.JSZip)throw new Error("Couldn't open the .zip here. Unzip it and choose conversations.json instead.");
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
      research[key]={at:Date.now(),via:"import",convs:pick(convs)};saveResearch();renderSetup();followups(true);}
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
  const prompt="You help "+(myName||"a WYZ Rent team member")+" at WYZ Rent (Dubai holiday home management) pick up research they started in Claude and ChatGPT. Today is "+new Date().toDateString()+".\n\nTheir recent conversations (JSON, newest first; asks are their own questions):\n"+JSON.stringify(convs.map(c=>({key:c.src+":"+c.id,src:c.src,title:c.title,date:new Date(c.at).toDateString(),asks:c.asks,summary:c.summary||undefined})))+
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
    const op=el("a","btn small","Open conversation");op.href=c.url;op.target="_blank";op.rel="noopener";a.append(op);
    if(f&&f.prompt){
      const q=encodeURIComponent(f.prompt);const ask=el("a","btn small solid",c.src==="claude"?"Ask in Claude":"Ask in ChatGPT");ask.href=c.src==="claude"?"https://claude.ai/new?q="+q:"https://chatgpt.com/?q="+q;ask.target="_blank";ask.rel="noopener";a.append(ask);
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
async function loadDrive(){
  if(!mcp)return;
  try{
    const r=await mcp.callTool(DRIVE,"list_recent_files",{pageSize:10,orderBy:"lastModifiedByMe",excludeContentSnippets:true},{cache:false});
    const p=r.payload||{};drive.files=(Array.isArray(p.files)?p.files:[]).map(f=>({id:String(f.id||""),t:String(f.title||f.name||"Untitled"),mod:f.modifiedTime||"",ext:String(f.fileExtension||"").toUpperCase(),mime:String(f.mimeType||"")})).filter(f=>f.id);
    drive.state="ok";
  }catch(e){const c=e&&e.code;drive.state=c==="server_not_connected"||c==="selection_required"?"missing":c==="needs_reauth"?"reauth":c==="not_in_manifest"||c==="consent_required"?"denied":"error";drive.files=[];drive.note=(e&&e.message)||""}
  renderDocs();renderSetup();
}
const kindOf=f=>/document/.test(f.mime)?"Doc":/spreadsheet/.test(f.mime)?"Sheet":/presentation/.test(f.mime)?"Slides":/folder/.test(f.mime)?"Folder":(f.ext||"File");
let docResults=null;
function renderDocs(){
  const host=$("docs");if(!host)return;host.replaceChildren();
  if(drive.state!=="ok"){$("docsHead").textContent=drive.state==="error"?"Couldn't read Google Drive just now. Tap Refresh now.":"The Google Drive files you've been working on show here once Google Drive is connected in the setup steps.";return}
  $("docsHead").textContent=drive.files.length?"The files you changed most recently.":"No recent files in your Google Drive.";
  (docResults||drive.files).forEach(f=>{
    const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");
    m.append(el("span","t",f.t));m.append(el("span","m",kindOf(f)+(f.mod?" · Changed "+fmtWhen(f.mod):"")));
    const a=el("div","acts");const o=el("a","btn small","Open");o.href="https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";o.target="_blank";o.rel="noopener";
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
let fileAI={name:"",load:null,cache:null};
function openFileAI(name,load){
  fileAI={name,load,cache:null};
  $("fileAITitle").textContent=name;$("fileAIQ").value="";$("fileAIOut").replaceChildren();
  $("fileAINote").textContent=sample?"The AI reads this file when you ask. Nothing is saved.":"Connect Claude first, under Connections.";
  const c=$("fileAIChips");c.replaceChildren();
  [["Summarize","Summarize this in five short lines."],["Key dates and amounts","List every date, deadline and amount of money in this file."],["What must I do?","What do I need to do or decide because of this file?"],["Anything risky?","Point out anything unusual, risky or missing that I should check before agreeing."]].forEach(([l,v])=>{const b=el("button","chip",l);b.type="button";b.onclick=()=>{$("fileAIQ").value=v;runFileAI()};c.append(b)});
  $("fileAI").hidden=false;$("fileAIQ").focus();
}
async function runFileAI(){
  const q=$("fileAIQ").value.trim(),out=$("fileAIOut");if(!q){$("fileAIQ").focus();return}
  if(!sample){out.replaceChildren(el("p","status err","No AI is connected. Connect Claude under Connections."));return}
  const go=$("fileAIGo");go.disabled=true;
  try{
    if(!fileAI.cache){out.replaceChildren(el("p","status","Opening the file..."));fileAI.cache=await fileAI.load()}
    const f=fileAI.cache,blocks=!f.text;
    if(blocks&&!Connectors.ai.avail("claude")){
      const p=el("p","status err","Reading PDFs and pictures needs Claude. ChatGPT here can only read text files. ");const a=el("a","btn small","Open Claude");a.href="https://claude.ai/new";a.target="_blank";a.rel="noopener";p.append(a," and attach the file there.");
      out.replaceChildren(p);go.disabled=false;return;
    }
    out.replaceChildren(el("p","status","Reading..."));
    const ask="You are the personal assistant of "+(myName||"a manager")+" at WYZ Rent, a Dubai holiday home management company. Today is "+new Date().toDateString()+".\nThe file is called \""+fileAI.name+"\".\nTheir question: "+q+"\n\nAnswer in plain, simple words. Use short lines or a short list. No em dashes. If the file doesn't say, say so. Don't guess.";
    const content=blocks?[{type:f.mime==="application/pdf"?"document":"image",source:{type:"base64",media_type:f.mime,data:f.data}},{type:"text",text:ask}]:ask+"\n\nFile text:\n"+String(f.text).slice(0,60000);
    const r=await sample([{role:"user",content}],{cache:false,provider:blocks?"claude":aiPickValue()});
    const t=el("div","mailtext");t.textContent=String(r.text||"").trim()||"(The AI sent back nothing.)";
    const cp=el("button","btn small ghost","Copy");cp.type="button";cp.onclick=()=>navigator.clipboard.writeText(t.textContent).then(()=>cp.textContent="Copied").catch(()=>cp.textContent="Select the text to copy");
    out.replaceChildren(t,cp);
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
$("installApp").onclick=async()=>{if(!installEv)return;installEv.prompt();try{await installEv.userChoice}catch(e){}installEv=null;$("installApp").hidden=true};
if(standalone())$("installNote").textContent="You are already using the installed app.";
else if(/iphone|ipad|ipod/i.test(navigator.userAgent))$("installNote").textContent="On iPhone or iPad: tap Share, then Add to Home Screen.";
if(location.hash==="#new-email"){window.addEventListener("load",()=>setTimeout(()=>{try{if(G.connected())openCompose()}catch(e){}},2500))}

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
  [...LINKS.map(([n,u])=>({n,u})),...mine.map((l,ix)=>Object.assign({ix},l))].forEach(l=>{
    const a=el("a","chip",l.n);a.href=l.u;a.target="_blank";a.rel="noopener";a.style.textDecoration="none";host.append(a);
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
$("colAll").onclick=()=>{document.querySelectorAll("section:not([hidden]) [data-col]").forEach(c=>collapsed.add(c.dataset.col));if(!$("p-today").hidden)ORDER.forEach(k=>collapsed.add("g-"+k));saveCol();applyCol()};
$("expAll").onclick=()=>{collapsed.clear();saveCol();applyCol()};
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

/* ---------- boot ---------- */
async function refreshAll(force){
  if(!G.connected()){showWelcome();setFresh("err","Connect Google to load your day.");return}
  await readConn();loadCal();
  if(!state.skipDrive||drive.state==="ok")loadDrive();
  if(!state.skipTodo||todo.state==="ok")loadTodoist();
  await loadMail(force);followups(false);
  if(state.autoDraft&&sample&&state.autoDraftDay!==todayKey()){state.autoDraftDay=todayKey();persist();draftAll(true)}
  if(state.shareDash&&Date.now()-(state.dashAt||0)>1800000)shareSummary();
}
$("refresh").onclick=()=>refreshAll(false);
(async()=>{
  collapsed.delete("c-inbox");collapsed.delete("setupCard");ORDER.forEach(k=>collapsed.delete("g-"+k));saveCol();
  try{applyOrder();applyCol();renderLinks();renderSetup();renderTasks();renderResearch()}catch(e){}
  mcp=Connectors.mcp;perms=Connectors.perms;await Connectors.ai.detect();sample=Connectors.makeSample();try{renderAI()}catch(e){}
  renderHello();
  if(!G.configured()){showWelcome();setFresh("err","Google sign-in isn't set up yet.");return}
  if(G.wasConnected()){
    setFresh("load","Reconnecting to Google");
    try{await G.connect(false);await afterConnect();return}catch(e){}
  }
  showWelcome();setFresh("err","Connect Google to load your day.");
})();

/* ---------- search Drive, text size, invite, weekly review ---------- */
async function searchDocs(){
  const q=$("docQ").value.trim();
  if(!q){docResults=null;renderDocs();return}
  if(!G.connected())return;
  try{
    const r=await mcp.callTool("Google Drive","search_files",{query:q,pageSize:15});
    docResults=((r.payload&&r.payload.files)||[]).map(f=>({id:String(f.id),t:String(f.title||"Untitled"),mod:f.modifiedTime||"",ext:String(f.fileExtension||"").toUpperCase(),mime:String(f.mimeType||"")}));
    renderDocs();$("docsHead").textContent=docResults.length?docResults.length+" file"+(docResults.length>1?"s":"")+" found. Clear the box and search to go back to recent files.":"No files found."
  }catch(e){$("docsHead").textContent="Couldn't search Drive just now ("+clip((e&&e.message)||"unknown reason",90)+")."}
}
$("docGo").onclick=searchDocs;$("docQ").addEventListener("keydown",e=>{if(e.key==="Enter")searchDocs()});
const ZOOMS=[1,1.15,1.3];
function applyZoom(){let z=1;try{z=+localStorage.getItem("wyz-zoom")||1}catch(e){}document.body.style.zoom=z;$("zoomBtn").textContent=z>1?"Text size "+Math.round(z*100)+"%":"Text size"}
$("zoomBtn").onclick=()=>{let z=1;try{z=+localStorage.getItem("wyz-zoom")||1}catch(e){}const n=ZOOMS[(ZOOMS.indexOf(z)+1)%ZOOMS.length];try{localStorage.setItem("wyz-zoom",String(n))}catch(e){}applyZoom()};
applyZoom();
$("inviteBtn").onclick=()=>{
  const txt="Hi! Here is the WYZ Rent Execution Page. It shows your inbox sorted by what needs action, today's meetings and recent files, all from your own Google account.\n\n1. Open this link in Chrome or Safari:\n"+PAGE_URL+"\n\n2. Tap \"Continue with Google\" and sign in with your own account.\n\n3. If Google says it hasn't verified the app, tap Advanced, then Go to WYZ Execution Page. That is normal.\n\n4. Tick every box and tap Continue, then follow the short steps on screen.\n\nOnly you can see your own data. If anything doesn't work, send me a screenshot.";
  window.open(waLink(txt),"_blank","noopener");
};
async function weeklyReview(){
  const host=$("mailRes");host.replaceChildren();
  const since=Date.now()-7*864e5,log=(state.log||[]).filter(x=>x.at>=since);
  const items=allItems(),open=items.filter(i=>!isOff(i)),snoozed=items.filter(i=>isOff(i)&&!state.done[i.id]).length;
  const lines=["Finished this week: "+log.length,"Still to reply: "+open.filter(i=>i.st==="reply").length,"Still to chase: "+open.filter(i=>i.st==="follow").length,"Snoozed for later: "+snoozed];
  const card=el("div","ans",lines.join("\n"));host.append(el("p","status","Your week so far"),card);
  if(!sample){host.append(el("p","status","Add Claude in the setup steps to get a written review with advice for next week."));return}
  const wait=el("p","status","Writing your review...");host.append(wait);
  try{
    const r=await sample("Write a short weekly review for "+(myName||"the reader")+" at WYZ Rent, in plain words, no em dashes, 4 to 6 lines. Say what got finished, what is still open and the top two things to do first next week.\n\nFinished items: "+(log.map(x=>x.t).slice(-25).join("; ")||"none recorded")+"\nStill to reply: "+open.filter(i=>i.st==="reply").map(i=>i.title).slice(0,10).join("; ")+"\nStill to chase: "+open.filter(i=>i.st==="follow").map(i=>i.title).slice(0,10).join("; "),{cache:false});
    wait.replaceWith(el("div","ans",r.text));
  }catch(e){wait.textContent="Couldn't write the review ("+clip((e&&e.message)||"unknown reason",90)+")."}
}
$("weekGo").onclick=weeklyReview;

/* ---------- system check: test every connection, read-only ---------- */
const SCOPE_LABEL={contacts:"see your contacts",otherContacts:"see people you have emailed",calEvents:"create and move calendar events",gmailRead:"read your email",gmailDraft:"save drafts and send replies",cal:"read your calendar",drive:"list your Drive files",driveRead:"read a Drive file when you ask the AI about it",gmailModify:"archive, star, label, bin and mark as read"};
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
  {const A=Connectors.ai;
   for(const p of ["claude","chatgpt"]){
     const nm=A.names[p]+(p===A.active()?" (in use)":"");
     if(!A.avail(p)){add(nm,"na","Not connected"+(p==="chatgpt"?" (optional).":".")+(!sample&&p==="claude"?" Sorting uses simple rules until an AI is connected.":""));continue}
     const mode=A.mode(p);
     try{const r=await sample("Reply with the single word OK.",{provider:p,cache:false});add(nm,"ok",(mode==="shared"?"Working through the shared connection":"Working with your own key")+", using "+(p==="chatgpt"?A.getOModel():A.modelLabel())+". It answered: "+clip(r.text,20)+".")}
     catch(e){add(nm,"bad",A.names[p]+" is switched on but failed ("+msg(e)+")."+(mode==="shared"?" Check the key, credit and ALLOWED_EMAILS in Vercel.":" Check your key, the model name and credit under Connections, Personalise."))}
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
$("thrMute").onclick=()=>{const a=thrSender();if(!a)return;const r=state.rules||{};if(ruleHit(r.mute,a)){state.rules.mute=state.rules.mute.filter(x=>x!==a);persist();renderRules();renderBoard();syncRuleBtns()}else{addRule("mute",a);syncRuleBtns();$("thrSt").className="status";$("thrSt").textContent="Muted. This sender is now hidden from your board. Undo it under Connections, Replies and rules."}};
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
  const r=await sample((kind==="plan"?"Write a plan for today for ":"Write an end-of-day wrap for ")+(myName||"the reader")+" at WYZ Rent, a Dubai holiday home management company. Plain text only, no markdown, no em dashes, short lines, max 18 lines. "+(kind==="plan"?"Put meetings in time order, then the order to tackle emails and tasks with a few words on why each comes first. Finish with one line on what to protect time for.":"Say what got done, what is still open and the top three things to do first tomorrow, using tomorrow's meetings.")+"\n\nData (JSON):\n"+JSON.stringify(d),{cache:false});
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
function openCompose(o){
  o=o||{};
  thr={id:"",msgs:[],item:{id:"",st:"work",title:"New email",summary:""},armed:0,done:false,mode:"new",files:[]};
  $("thr").hidden=false;$("thrTitle").textContent="New email";
  setMode("new");renderTplSelect();renderThrPick();loadContacts();
  $("thrReply").hidden=false;$("thrFiles").value="";$("thrFileList").textContent="";
  ["thrSend","thrSave","thrText","thrTo","thrCc","thrSubj"].forEach(k=>$(k).disabled=false);
  $("thrSend").textContent="Send";$("thrSt").textContent="";$("thrSt").className="status";$("thrRemind").value="3";
  $("thrTo").value=o.to||"";$("thrCc").value="";$("thrSubj").value=o.subject||"";$("thrText").value=o.body||"";$("thrBrief").value="";
  $("thrAI").textContent=sample?"Write it with "+Connectors.ai.names[Connectors.ai.active()||"claude"]:"Use my note";
  $("thr").querySelector(".pad").scrollTop=0;$("thrTo").focus();
}
async function composeDraft(){
  const brief=$("thrBrief").value.trim(),st=$("thrSt"),ta=$("thrText");
  if(!brief){st.className="status err";st.textContent="Tell the AI what the email should say first.";$("thrBrief").focus();return}
  if(!sample){ta.value=brief;st.className="status";st.textContent="No AI is connected, so your note was copied into the email. Edit it and add a subject.";return}
  st.className="status";st.textContent="Writing it...";
  try{
    const tone=await toneExamples(),first=(myName||"").split(" ")[0];
    const r=await creditFallback(prov=>sample.json("Write an email for "+(myName||"me")+" at WYZ Rent, a Dubai holiday home management company.\nIt is to: "+($("thrTo").value.trim()||"someone")+".\nWhat it should say: "+brief+"\n\nPlain text, "+(sigText()?"no sign-off and no name, because the signature is added automatically":"signed with the first name"+(first?" "+first:""))+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return JSON only: {\"subject\": a short subject line, \"body\": the email body}."+(tone?"\n\n"+tone:""),{cache:false,provider:prov}));
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
