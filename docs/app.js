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
    {name:"Claude for smarter sorting (optional)",done:!!sample||!!state.skipAi,desc:sample?(Connectors.ai.mode()==="shared"?"Claude is on automatically with your Google sign-in. Nothing to connect.":"Claude is on. Your key is stored on this device only."):"Without a key, your inbox is sorted by simple rules. Add a Claude API key for smarter sorting, drafts and research follow-ups. It stays on this device.",btn:sample?(Connectors.ai.mode()==="key"?["Remove key",removeAiKey]:null):["Add key",setAiKey],btn2:sample||state.skipAi?null:skip("skipAi")},
    Object.assign({name:"Your Claude research"},imp("claude","Claude",CLAUDE_EXPORT,"f-claude","1. Tap Open Claude export page. 2. Under Your data, tap Export data and confirm. 3. Claude emails you a download link (usually within minutes). 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it.")),
    Object.assign({name:"Your ChatGPT research"},imp("chatgpt","ChatGPT",GPT_EXPORT,"f-chatgpt","1. Tap Open ChatGPT export page and sign in if asked. 2. In Data controls, tap Export data, then Confirm export. 3. OpenAI emails you a download link. 4. Download the .zip from that email, no need to unzip it. 5. Come back here, tap Import file and choose it. Repeat weekly to keep it current.")),
    optional("Google Drive (optional)",drive.state,"Connected. Your recent documents show under Documents.","skipDrive","Shows the documents you've been working on. Uses the same Google sign-in as Gmail.",["Connect Google",()=>connectGoogle(drive.state==="denied")],"Google didn't give this page access to Drive. Tap Allow and tick every box on Google's screen.",{note:drive.note,fn:loadDrive}),
    optional("Todoist (optional)",todo.state,"Connected. Your Todoist tasks for today show under My tasks.","skipTodo","Use Todoist? In Todoist open Settings, Integrations, Developer and copy your API token, then tap Add token. No Todoist? Tap Skip, the built-in task list already works.",["Add token",setTodoToken],"Todoist didn't accept the token. Tap Replace token and paste it again.",{note:todo.note,fn:loadTodoist}),
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
  $("setupCard").hidden=n===steps.length;
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
function onbOpen(){ONB=Connectors.ai.mode()==="shared"?["todoist","research","done"]:["claude","todoist","research","done"];onbI=0;$("onb").hidden=false;$("onbMsg").textContent="";onbRender()}
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
    $("onbTitle").textContent="Connect Claude";
    if(sample){p("Claude is connected. Your inbox is sorted smartly and drafts are written for you.");acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));return}
    p("Welcome, "+firstName()+". Google is connected. Next, connect Claude so your inbox is sorted by what needs you, replies are drafted for you and your research gets follow-ups.");
    p("Claude has no sign-in button for other websites, so it connects with your own API key. It is stored on this device only and sent only to Anthropic.");
    body.append(onbLink("https://console.anthropic.com/settings/keys","Get my Claude key"));
    const inp=el("input","in");inp.id="onbKey";inp.type="password";inp.placeholder="sk-ant-...";inp.autocomplete="off";inp.setAttribute("aria-label","Claude API key");body.append(inp);
    acts.append(onbBtn("Connect Claude",async function(){
      const v=inp.value.trim(),b=this;
      if(!/^sk-ant-/.test(v)){$("onbMsg").textContent="Claude keys start with sk-ant-. Copy the key again.";return}
      b.disabled=true;b.textContent="Checking your key...";$("onbMsg").textContent="";
      Connectors.ai.set(v);sample=Connectors.makeSample();
      try{await sample("Reply with the single word OK.",{modelTier:"quick",cache:false});state.claudeOk=1;persist();renderSetup();
        if(threads.length)triage(board&&board.sig||"",true);followups(true);onbGo(onbI+1)}
      catch(e){Connectors.ai.clear();sample=null;b.disabled=false;b.textContent="Connect Claude";
        $("onbMsg").textContent=e&&e.code==="not_granted"?"Claude rejected that key. Check it and try again.":e&&e.code==="rate_limited"?"Claude is busy. Try again in a minute.":"Couldn't reach Claude. Check your connection and try again."}
    },"solid"),onbBtn("Skip for now",()=>{state.skipAi=1;persist();onbGo(onbI+1)},"ghost"));
  }else if(k==="todoist"){
    $("onbTitle").textContent="Connect Todoist";
    if(todo.state==="ok"){p("Todoist is connected. Today's tasks show next to your email.");acts.append(onbBtn("Next",()=>onbGo(onbI+1),"solid"));return}
    if(onbI===0)p("Welcome, "+firstName()+". Google and Claude are connected, so your inbox is already being sorted for you. Two optional connections left.");
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
  }else{
    $("onbTitle").textContent="You're all set, "+firstName();
    const line=(ok,t)=>body.append(el("p","sub",(ok?"✓ ":"○ ")+t));
    line(true,"Google: Gmail, Calendar and Drive ("+(email||"signed in")+")");
    line(!!sample,sample?"Claude: connected, smart sorting and drafts on":"Claude: not connected, simple sorting for now");
    line(todo.state==="ok",todo.state==="ok"?"Todoist: connected":"Todoist: not connected");
    const n=((research.chatgpt&&research.chatgpt.convs)||[]).length+((research.claude&&research.claude.convs)||[]).length;
    line(n>0,n?"Research: "+n+" conversations imported":"Research: not imported yet");
    p("You can connect anything left from the Connections tab at any time.");
    acts.append(onbBtn("Open my page",()=>onbClose(true),"solid"));
  }
  const f=body.querySelector("input")||acts.querySelector("button");if(f)setTimeout(()=>f.focus(),30);
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("onb").hidden)onbClose(true)});
$("onbAgain").onclick=()=>{show("t-today");onbOpen()};

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
  const n=lastName();if(n){$("wTitle").textContent="Welcome back, "+n.split(" ")[0];$("wText").textContent="Tap Continue with Google to reconnect. Your board loads straight away."}
}
function renderHello(){
  const h=new Date().getHours();
  $("hello").textContent=myName?(h<12?"Good morning, ":h<18?"Good afternoon, ":"Good evening, ")+myName.split(" ")[0]:"Your execution page";
  $("who").hidden=!uid;
  if(uid){$("whoName").textContent=email||myName;const a=$("avatar");if(pic){a.src=pic;a.hidden=false}else a.hidden=true}
}
let loopOn=false;
async function afterConnect(){
  const p=await G.profile();
  uid=p.sub;myName=p.name||"";email=p.email||"";pic=p.picture||"";
  try{localStorage.setItem("wyz-last-name",myName)}catch(e){}
  LS="wyzcc-v1-"+uid;
  $("welcome").hidden=true;renderHello();
  const snap=lsGet();if(snap&&snap.state)restore(snap);
  await loadResearch();renderTasks();renderSetup();
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
function setAiKey(){
  const k=prompt("Paste your Claude API key (starts with sk-ant-). It is stored on this device only.");
  if(!k||!k.trim())return;
  Connectors.ai.set(k);sample=Connectors.makeSample();state.claudeOk=1;persist();renderSetup();
  if(threads.length)triage(board&&board.sig||"",true);followups(true);
}
function removeAiKey(){Connectors.ai.clear();sample=Connectors.makeSample();renderSetup();if(threads.length)triage(board&&board.sig||"",true)}
const gateUi=()=>{};
$("wBtn").onclick=()=>connectGoogle();
const copyBtn=(id,text,label)=>{$(id).onclick=()=>navigator.clipboard.writeText(text()).then(()=>{$(id).textContent="Copied";setTimeout(()=>$(id).textContent=label,1500)}).catch(()=>{$(id).textContent="Copy by hand"})};
copyBtn("wCopyOrigin",()=>location.origin,"Copy address");
copyBtn("wCopyScopes",()=>["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.compose","https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/drive.metadata.readonly"].join("\n"),"Copy scopes");
$("wSave").onclick=()=>{const v=$("wClient").value.trim();if(!/\.apps\.googleusercontent\.com$/.test(v)){$("wMsg").textContent="That doesn't look like a Client ID. It ends in .apps.googleusercontent.com";return}G.setClientId(v);location.reload()};
$("signOut").onclick=$("manage").onclick=async()=>{await G.signOut();try{localStorage.removeItem("wyz-last-name")}catch(e){}location.reload()};

/* ---------- calendar ---------- */
async function loadCal(){
  if(!mcp)return;
  const d=new Date();d.setHours(0,0,0,0);const e=new Date(d);e.setDate(e.getDate()+2);
  try{
    const r=await mcp.callTool("Google Calendar","list_events",{startTime:ymd(d)+"T00:00:00",endTime:ymd(e)+"T00:00:00",orderBy:"startTime",pageSize:40},{cache:false});
    const p=r.payload||{};events=(p.events||[]).filter(x=>x.status!=="cancelled");
    setConn("Google Calendar","ok");renderCal();
  }catch(err){if(!errToConn("Google Calendar",err)){$("cal").replaceChildren(el("p","status err","Couldn't read your calendar just now: "+(err&&err.message||"try Refresh now")))}else renderCal()}
}
function renderCal(){
  const host=$("cal");host.replaceChildren();
  if(connState["Google Calendar"]!=="ok"){host.append(el("p","sub","Your meetings show here once Google Calendar is connected."));return}
  const t=new Date(),tm=new Date();tm.setDate(tm.getDate()+1);
  [[ymd(t),"Today"],[ymd(tm),"Tomorrow"]].forEach(([day,lbl])=>{
    host.append(el("div","daylbl",lbl));
    const list=(events||[]).filter(x=>{const s=x.start&&(x.start.dateTime||x.start.date);return s&&(x.start.date?x.start.date===day:ymd(new Date(s))===day)});
    if(!list.length){host.append(el("p","sub","Nothing scheduled."));return}
    list.forEach(x=>{const r=el("div","ev");r.append(el("b","",x.start.date?"All day":fmtTime(x.start.dateTime)+(x.end&&x.end.dateTime?"–"+fmtTime(x.end.dateTime):"")));
      const s=el("span");const a=x.conferenceUrl||x.htmlLink;if(a){const l=el("a","",x.summary||"(No title)");l.href=a;l.target="_blank";l.rel="noopener";l.style.color="var(--fg)";s.append(l)}else s.append(x.summary||"(No title)");
      if(x.location)s.append(el("small",""," · "+x.location));r.append(s);host.append(r)});
  });
}

/* ---------- mail ---------- */
const nameOf=s=>{s=String(s||"");const m=s.match(/^\s*"?([^"<]+?)"?\s*</);return m?m[1]:s.replace(/@.*/,"")};
const addrOf=s=>{s=String(s||"");const m=s.match(/<([^>]+)>/);return (m?m[1]:s).trim()};
function slimThread(t){const ms=t.messages||[];const last=ms[ms.length-1]||{};const first=ms[0]||{};
  const mine=(last.labelIds||[]).includes("SENT");const lastOther=[...ms].reverse().find(m=>!(m.labelIds||[]).includes("SENT"))||{};
  const days=last.date?Math.floor((Date.now()-Date.parse(last.date))/86400000):null;
  return {id:t.id,from:mine?(lastOther.sender||first.sender||""):(last.sender||first.sender||""),subject:first.subject||last.subject||"(No subject)",snippet:(last.snippet||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").slice(0,280),date:last.date||first.date||"",count:t.messageCount||ms.length,unread:(last.labelIds||[]).includes("UNREAD"),important:(last.labelIds||[]).includes("IMPORTANT"),url:t.viewUrl||last.viewUrl||"",lastId:last.id||t.id,lastFromMe:mine,lastTo:mine?(last.toRecipients||[]).slice(0,3):[],daysSinceLast:days}}
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
    {const hb=heuristicBoard(sig,false);hb.headline=(c==="not_granted"?"Your Claude API key was rejected, so your inbox is sorted by simple rules. ":c==="rate_limited"?"Claude is busy, so your inbox is sorted by simple rules for now. ":"Couldn't use Claude just now, so your inbox is sorted by simple rules. ")+hb.headline;board=hb}
    renderBoard();setFresh("ok");
  }
}

/* ---------- simple sorting rules, used when no Claude key is set ---------- */
function heuristicBoard(sig,final){
  const auto=/no-?reply|noreply|do-?not-?reply|notification|newsletter|mailer-daemon|updates@|news@|marketing|billing@|invoice@/i;
  const items=[];let nReply=0,nFollow=0;
  threads.forEach(t=>{
    const who=nameOf(t.lastFromMe?(t.lastTo||[])[0]:t.from)||"them";
    const d=t.daysSinceLast==null?0:t.daysSinceLast;
    if(t.lastFromMe){
      if(d>21)return;
      if(t.snippet.length<90&&/^(thanks|thank you|ok|okay|noted|great|perfect|received|sounds good)\b/i.test(t.snippet))return;
      const chase=d>=3;if(chase)nFollow++;
      items.push({id:t.id,st:chase?"follow":"wait",g:d>=7?3:2,title:(chase?"Chase ":"Waiting on ")+who+": "+t.subject,summary:"You wrote "+(d===0?"today":d+" day"+(d>1?"s":"")+" ago")+" and there's no reply yet.",when:d===0?"You wrote today":"You wrote "+d+" day"+(d>1?"s":"")+" ago"});
      return}
    if(!t.inInbox)return;
    if(auto.test(t.from)){items.push({id:t.id,st:"fyi",g:1,title:t.subject,summary:t.snippet});return}
    if(t.unread||t.important){nReply++;items.push({id:t.id,st:"reply",g:t.important&&t.unread?3:2,title:"Reply to "+who+": "+t.subject,summary:t.snippet});return}
    items.push({id:t.id,st:"work",g:1,title:t.subject,summary:t.snippet||"Check whether this needs action."});
  });
  const hl=(nReply?nReply+" email"+(nReply>1?"s":"")+" to reply to":"Nothing waiting for a reply")+(nFollow?" and "+nFollow+" to chase":"")+". Add a Claude API key in the setup steps for smarter sorting.";
  const b={sig,items,headline:hl,at:Date.now()};if(final)b.v2=1;return b;
}
function templateDraft(i,chase){
  const t=tById(i.id)||{};const first=(nameOf(t.lastFromMe?(t.lastTo||[])[0]:t.from)||"").split(" ")[0];const me=(myName||"").split(" ")[0];
  return "Hi "+(first||"there")+",\n\n"+(chase?"Just following up on \""+(t.subject||"my last email")+"\". Could you let me know where this stands? [DETAIL]":"Thanks for your message about \""+(t.subject||"this")+"\". [DETAIL]")+"\n\nBest,\n"+me;
}

/* ---------- board ---------- */
const tById=id=>threads.find(t=>t.id===id);
const todayKey=()=>ymd(new Date());
const isOff=i=>!!state.done[i.id]||(state.snooze[i.id]&&state.snooze[i.id]>todayKey());
function renderBoard(){
  const host=$("board");host.replaceChildren();
  if(!board){return}
  $("headline").textContent=board.headline||"";
  const items=(board.items||[]).slice().sort((a,b)=>ORDER.indexOf(a.st)-ORDER.indexOf(b.st)||b.g-a.g);
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
function itemRow(i){
  const t=tById(i.id)||{};const row=el("div","item");if(isOff(i))row.style.opacity=".55";
  row.append(el("span","dot "+i.st));const m=el("div","main");
  m.append(el("span","t",i.title||t.subject||""));
  if(i.summary)m.append(el("span","s",i.summary));
  const meta=el("span","m");const u=el("span","urg u"+i.g,UR[i.g]||"");meta.append(u," · "+(t.lastFromMe?"You wrote to "+(nameOf((t.lastTo||[])[0])||"them"):(nameOf(t.from)||""))+(i.when?" · "+i.when:t.date?" · "+fmtWhen(t.date):""));m.append(meta);
  const a=el("div","acts");
  if(t.url){const o=el("a","btn small","Open in Gmail");o.href=t.url;o.target="_blank";o.rel="noopener";a.append(o)}
  if(i.st==="reply"||i.st==="follow"||i.st==="work"||i.st==="wait"){const d=el("button","btn small solid",i.st==="follow"||i.st==="wait"?"Draft a chaser":"Draft a reply");d.type="button";d.onclick=()=>draftFor(i,m,d);a.append(d)}
  const dn=el("button","btn small ghost",state.done[i.id]?"Undo done":"Done");dn.type="button";dn.onclick=()=>{if(state.done[i.id])delete state.done[i.id];else state.done[i.id]=1;persist();renderBoard()};
  const sz=el("button","btn small ghost",state.snooze[i.id]?"Unsnooze":"Snooze to tomorrow");sz.type="button";sz.onclick=()=>{if(state.snooze[i.id])delete state.snooze[i.id];else{const d=new Date();d.setDate(d.getDate()+1);state.snooze[i.id]=ymd(d)}persist();renderBoard()};
  const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask(i.title||t.subject,"Email from "+nameOf(t.from));at.textContent="Added";at.disabled=true};
  a.append(askDrop("I need help with an email. From: "+(t.lastFromMe?"me, to "+((t.lastTo||[]).join(", ")):(t.from||""))+". Subject: "+(t.subject||"")+". What it's about: "+(i.summary||t.snippet||"")+" What's the best way to handle it? If a reply or chaser is needed, draft one I can edit.",(i.title||t.subject||"")+(i.summary?"\n"+i.summary:"")),dn,sz,at);m.append(a);row.append(m);return row;
}
async function draftFor(i,host,btn){
  btn.disabled=true;btn.textContent="Reading the thread";
  let full=null,msgs=[];
  try{full=await mcp.callTool("Gmail","get_thread",{threadId:i.id,messageFormat:"PLAIN_TEXT"},{cache:false});msgs=(full.payload&&full.payload.messages)||[]}catch(e){}
  const text=msgs.slice(-6).map(x=>"From: "+(x.sender||"")+"\nDate: "+(x.date||"")+"\n"+String(x.plaintextBody||x.plaintext_body||x.snippet||"").slice(0,3000)).join("\n\n---\n\n");
  const box=el("div","draftbox");const ta=el("textarea");ta.id="d-"+i.id;ta.value="";const st=el("span","status","Writing a draft");
  box.append(st,ta);host.append(box);btn.textContent="Writing";
  try{
    const chase=(i.st==="follow"||i.st==="wait");const r=!sample?{text:templateDraft(i,chase)}:await sample((chase?"Write a short, polite follow-up email chasing an answer that is still owed, ":"Write a reply email ")+"for "+(myName||"me")+" at WYZ Rent. Plain text only, ready to edit, signed with their first name"+(myName?" ("+myName.split(" ")[0]+")":"")+". Short, warm, professional. Use contractions. No em dashes, no semicolons. Put [DATE] or [DETAIL] where a fact is unknown. Return only the email body, no subject.\n\nWhat it's about: "+(i.title||"")+". "+(i.summary||"")+"\n\nThread (latest last):\n"+(text||tById(i.id)?.snippet||""),{cache:false,onText:u=>{ta.value=u.text}});
    ta.value=r.text;st.textContent="Edit it, then save it to your Gmail drafts.";
  }catch(e){st.textContent="Couldn't write a draft just now. Write your own here, then save it.";st.className="status err"}
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
  if(!sample){out.textContent="Ask needs a Claude API key. Add one in the setup steps (Claude for smarter sorting).";return}
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
function addTask(text,src,due){
  text=clip(text,200);if(!text)return;
  state.tasks=state.tasks||[];state.tasks.unshift({id:newId(),t:text,src:src||"",due:due||"",done:0,at:Date.now()});
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
  const host=$("tasks");if(!host)return;host.replaceChildren();
  const mine=(state.tasks||[]).filter(t=>!t.done);
  const rows=[...mine.map(t=>({k:"me",t})),...(todo.state==="ok"?todo.tasks.map(t=>({k:"td",t})):[])];
  if(!rows.length){const e=el("p","sub","No open tasks. Add one above, or tap Add to tasks on any email or research follow-up.");e.style.padding="0 14px 14px";host.append(e)}
  rows.forEach(({k,t})=>{
    const r=el("div","item");r.append(el("span","dot "+(k==="td"?"work":"follow")));const m=el("div","main");
    m.append(el("span","t",t.t));
    const meta=[k==="td"?"Todoist":"My list",t.src||"",t.due?"Due "+t.due:""].filter(Boolean).join(" · ");m.append(el("span","m",meta));
    const a=el("div","acts");const b=el("button","btn small ghost","Mark done");b.type="button";
    b.onclick=k==="td"?()=>completeTodoist(t,b):()=>{t.done=1;persist();renderTasks()};
    a.append(askDrop("Help me get this task done: "+t.t+(t.due?" (due "+t.due+")":"")+". Break it into concrete steps and tell me what to do first.","Task: "+t.t+(t.due?" (due "+t.due+")":"")),b);m.append(a);r.append(m);host.append(r);
  });
  const done=(state.tasks||[]).filter(t=>t.done).length;$("taskNote").textContent=done?done+" done on your list.":"";
  $("todoWrap").hidden=todo.state!=="ok";
}
$("taskAdd").onclick=()=>{addTask($("taskIn").value,"Added by you",$("taskDue").value);$("taskIn").value="";$("taskDue").value=""};
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
document.addEventListener("click",e=>{document.querySelectorAll("details.askdd[open]").forEach(d=>{if(!d.contains(e.target))d.open=false})});

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
function renderDocs(){
  const host=$("docs");if(!host)return;host.replaceChildren();
  if(drive.state!=="ok"){$("docsHead").textContent=drive.state==="error"?"Couldn't read Google Drive just now. Tap Refresh now.":"The Google Drive files you've been working on show here once Google Drive is connected in the setup steps.";return}
  $("docsHead").textContent=drive.files.length?"The files you changed most recently.":"No recent files in your Google Drive.";
  drive.files.forEach(f=>{
    const r=el("div","item");r.append(el("span","dot none"));const m=el("div","main");
    m.append(el("span","t",f.t));m.append(el("span","m",kindOf(f)+(f.mod?" · Changed "+fmtWhen(f.mod):"")));
    const a=el("div","acts");const o=el("a","btn small","Open");o.href="https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";o.target="_blank";o.rel="noopener";
    const at=el("button","btn small ghost","Add to tasks");at.type="button";at.onclick=()=>{addTask("Finish: "+f.t,"Google Drive");at.textContent="Added";at.disabled=true};
    a.append(o,askDrop("I'm working on a document called \""+f.t+"\" ("+kindOf(f)+"). Help me plan what to finish in it next and what to check before I share it.","Document: "+f.t+" https://drive.google.com/file/d/"+f.id+"/view"),at);
    m.append(a);r.append(m);host.append(r);
  });
}

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
$("colAll").onclick=()=>{document.querySelectorAll("#p-today [data-col]").forEach(c=>collapsed.add(c.dataset.col));ORDER.forEach(k=>collapsed.add("g-"+k));saveCol();applyCol()};
$("expAll").onclick=()=>{collapsed.clear();saveCol();applyCol()};
/* ---------- move sections up and down ---------- */
const SEC_DEFAULT=["inbox","cal","tasks","research","docs","links"];
function secOrder(){const o=((state&&state.order)||[]).filter(k=>SEC_DEFAULT.includes(k));SEC_DEFAULT.forEach(k=>{if(!o.includes(k))o.push(k)});return o}
function updMoveBtns(){const o=secOrder();o.forEach((k,ix)=>{const e=document.querySelector('[data-sec="'+k+'"]');if(!e)return;e.querySelectorAll(".mv button").forEach(b=>{b.disabled=(b.dataset.d==="-1"&&ix===0)||(b.dataset.d==="1"&&ix===o.length-1)})})}
const SEC_LABEL={inbox:"Inbox",cal:"Today and tomorrow",tasks:"My tasks",research:"Research",docs:"Documents",links:"Quick links"};
const SEC_CARD={inbox:"c-inbox",cal:"c-cal",tasks:"c-tasks",research:"c-res",docs:"c-docs",links:"c-links"};
function renderNav(){const n=$("secNav");n.replaceChildren();secOrder().forEach(k=>{const b=el("button","navchip",SEC_LABEL[k]);b.type="button";
  b.onclick=()=>{collapsed.delete(SEC_CARD[k]);if(k==="inbox")ORDER.forEach(x=>collapsed.delete("g-"+x));saveCol();applyCol();
    const e=document.querySelector('[data-sec="'+k+'"]');if(e){const y=e.getBoundingClientRect().top+window.scrollY-$("toolbar").offsetHeight-8;window.scrollTo({top:y,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}};n.append(b)})}
function applyOrder(){const host=$("secs");secOrder().forEach(k=>{const e=host.querySelector('[data-sec="'+k+'"]');if(e)host.append(e)});updMoveBtns();renderNav()}
function moveSec(k,d){const o=secOrder();const a=o.indexOf(k),b=a+d;if(a<0||b<0||b>=o.length)return;[o[a],o[b]]=[o[b],o[a]];state.order=o;persist();applyOrder();
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
}
$("refresh").onclick=()=>refreshAll(false);
(async()=>{
  collapsed.delete("c-inbox");collapsed.delete("setupCard");ORDER.forEach(k=>collapsed.delete("g-"+k));saveCol();
  try{applyOrder();applyCol();renderLinks();renderSetup();renderTasks();renderResearch()}catch(e){}
  mcp=Connectors.mcp;perms=Connectors.perms;await Connectors.ai.detect();sample=Connectors.makeSample();
  renderHello();
  if(!G.configured()){showWelcome();setFresh("err","Google sign-in isn't set up yet.");return}
  if(G.wasConnected()){
    setFresh("load","Reconnecting to Google");
    try{await G.connect(false);await afterConnect();return}catch(e){}
  }
  showWelcome();setFresh("err","Connect Google to load your day.");
})();
