(()=>{var S="openchamber.sdk",E=1;var qe=`
:root { scrollbar-gutter: stable; }
:root, :root * {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--oc-fg, currentColor) 6%, transparent) transparent;
}
:root:hover, :root:active, :root *:hover, :root *:active {
  scrollbar-color: light-dark(
    color-mix(in oklab, var(--oc-fg, currentColor) 10%, transparent),
    color-mix(in oklab, var(--oc-fg, currentColor) 12%, transparent)
  ) transparent;
}
@media (forced-colors: active) {
  :root, :root *, :root:hover, :root:active, :root *:hover, :root *:active { scrollbar-color: auto; }
}
`;var Ke=128,je=65536;var ye=128;var he=65536;var Kt=/^[a-z][a-z0-9-]{0,39}$/;var Wt=(e)=>Object(e)===e&&!Array.isArray(e),ze=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),$t=(e)=>String(e)===e&&e.length>=1&&e.length<=60,qt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,jt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!Wt(n)||!Kt.test(n.id)||!$t(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!ze(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!ze(n,["kind","id","label","value","options","disabled"]))return!1;if(!qt(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let c=new Set;for(let _ of n.options){if(!Wt(_)||!ze(_,["value","label"])||!qt(_.value)||!$t(_.label)||c.has(_.value))return!1;c.add(_.value)}if(!c.has(n.value))return!1}return!0};var zt=["{id}","{segment}","{segments+}"];var dr=new Set(zt);var Jt=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Er=new Set(Jt);var ve=20000000,be=256;var Je=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,Qt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var Yt=/^[A-Za-z0-9_-]{1,80}$/;var Zt=["left","right","top","bottom"];var eo=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let c=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let _ of c)if(!eo(_,r+1,n))return!1;return!0},Qe=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Qe);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Qe)}return String(e)===e||Number.isFinite(e)},Ye=(e)=>{try{if(String(e.id)!==e.id||!Yt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Zt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!eo(e.data)||!Qe(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var et=2000;var oo=["file","directory","other","missing"],tt=(e)=>Boolean(e&&"sessionId"in e),ot=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var ro=/^[0-9a-f]{7,64}$/i,rt=(e)=>ro.test(e),Ae=500,Oe=32000,so=16000,no=128,io=200,ao=2000,lo=16000,uo=80,co=200,po=16000;var So=2000;var st=20000,xe=1024,Ce=2000000;var ke=64000,Ie=8000,nt=4000;var it=960000;var Eo=999,go=1e4,ce=500,_o=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],To=["stopped","starting","ready","failed"],No=new Set(_o),mo=(e)=>No.has(e),Ro=(e)=>e&&mo(e)?e:"HOST_REJECTED",Q=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(Q);if(Object(e)===e)return Object.values(e).every(Q);return!1},fo=(e)=>Q(e)&&JSON.stringify(e).length<=po,to=(e)=>e?.trim().slice(0,co)??"",Y=(e)=>{let r=e.id.trim().slice(0,no),n=e.title.trim().slice(0,io),c=e.url.trim().slice(0,ao),_=e.text?.trim().slice(0,lo),x=e.author?.trim().slice(0,uo),T=e.kind==="pull"?"pull":"issue",g={providerId:e.providerId.trim(),id:r,title:n||r,url:c,kind:T};if(_)g.text=_;if(x)g.author=x;if(T==="pull"){let L=to(e.branches?.head),V=to(e.branches?.base);if(L&&V)g.branches={head:L,base:V}}if(fo(e.data))g.data=e.data;return g},at=(e)=>{let r=Y(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},lt=(e)=>{let r={text:e.text.trim().slice(0,so)};if(e.send)r.send=!0;return r},ut=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Eo,Math.max(0,Math.round(e)))},ct=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(go,Math.max(0,Math.ceil(e)))};var Z=(e)=>e.length>0&&e.length<=xe&&!e.includes("\x00")&&!e.includes("\\");var Pe=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>So)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Lo=new Set(To),pt=(e)=>Boolean(e&&"status"in e&&Lo.has(String(e.status))&&!("body"in e)),Me=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),dt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),St=(e)=>Boolean(e&&"written"in e&&e.written===!0),Et=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Do=new Set(oo),gt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Do.has(String(e.kind))&&Number.isFinite(e.size)),_t=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Ho=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),Fo=(e)=>Object(e)===e?e:null,Ze=(e)=>String(e)===e&&e.length>0,Bo=(e)=>{if(!Ze(e.id))return null;if(e.ok===!0){let r={channel:S,v:E,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&Ze(e.error))return{channel:S,v:E,type:"result",id:e.id,ok:!1,error:e.error,code:Ro(Ze(e.code)?e.code:void 0)};return null},Tt=(e)=>{let r=Fo(e);if(!r||r.channel!==S||r.v!==E)return null;if(r.type==="result")return Bo(r);if(!Ho.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var yo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Vo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var ho=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ge=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${xe} characters without NUL or backslash.`)),Ue=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},d=(e)=>(e.value+=1,`oc-${e.value}`),mt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??((t)=>t===r.parent),c=e.requestTimeoutMs??st,_=new Set,x=new Set,T=new Set,g=new Set,L=new Set,V=new Set,re=new Set,de=new Set,Se=new Set,Ee=new Set,ge=new Set,K=new Set,Be=[],se=null,ne=null,_e=new Set,Te=new Set,ie=null,ae=null,Ve=!1,j=new Map,z=new Map,J=new Map,D=!1,p={value:0},l=null,H=null,le=!1,ue=!1,Mt=null,Gt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},G=(t)=>{r.parent.postMessage(t,"*")},Ut=()=>{if(D||r.parent===r||K.size===0||l?.features?.lateGenerateResults!==!0)return;G({channel:S,v:E,type:"generate-late-listen"})},y=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},wt=(t)=>{if(!(t instanceof MessageEvent))return;if(!n(t.source))return;let o=Tt(t.data);if(!o)return;if(o.type==="workspace"){let a=z.get(o.payload.subscriptionId);if(a)y([a],o.payload.snapshot);return}if(o.type==="shells"){let a=J.get(o.payload.subscriptionId);if(a)y([a],o.payload.snapshot);return}if(o.type==="ready"){if(l=o.payload,H=Gt(o.payload.session),y(_,o.payload),y(x,o.payload.directory),y(T,o.payload.session),H)y(g,H);if(y(L,o.payload.connection),y(V,o.payload.settings),y(re,o.payload.item),o.payload.block)y(de,o.payload.block);Ut();return}if(o.type==="service-event"){y(Se,o.payload);return}if(o.type==="generate-late"){if(K.size===0)Be.push(o.payload);else y(K,o.payload);return}if(o.type==="directory"){if(l)l={...l,directory:o.payload.directory};y(x,o.payload.directory);return}if(o.type==="session"){if(l)l={...l,session:o.payload.session};if(!o.payload.session)H=null;else if(H?.sessionId!==o.payload.session.id)H=Gt(o.payload.session);y(T,o.payload.session);return}if(o.type==="session-lifecycle"){H=o.payload,y(g,o.payload);return}if(o.type==="connection"){if(l)l={...l,connection:o.payload.connection};y(L,o.payload.connection);return}if(o.type==="settings"){if(l)l={...l,settings:o.payload.settings};y(V,o.payload.settings);return}if(o.type==="item"){if(l)l={...l,item:o.payload.item};y(re,o.payload.item);return}if(o.type==="status-control-event"){y(Ee,o.payload);return}if(o.type==="popover-closed"){y(ge,o.payload);return}if(o.type==="action"){let a=(m)=>{if(!D)G({channel:S,v:E,type:"action-result",id:o.id,payload:m})},R=ne;if(!R){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>a({ok:!0}),(m)=>{let O=(m instanceof Error?m.message:String(m)).trim();a({ok:!1,error:(O||"Action failed.").slice(0,ce)})});return}if(o.type==="file-open"){let a=o.payload;if(ae&&Qt(ae,a))return;ae=a,y(_e,o.payload);return}if(o.type==="file-saved"){y(Te,o.payload.version);return}if(o.type==="file-snapshot"){let a=(O)=>{if(!D)G({channel:S,v:E,type:"file-snapshot-result",id:o.id,payload:O})},R=(O)=>a({error:(O.trim()||"Could not read the edited file.").slice(0,ce)}),m=ie;if(!m){R("This extension does not edit files.");return}Promise.resolve().then(()=>m(o.payload.purpose)).then((O)=>{if(Je(O)>ve){R(`The file is over ${ve} ${"bytes"in O?"bytes":"characters"}.`);return}if(O.version.length>be){R(`The snapshot version is over ${be} characters.`);return}a({snapshot:"bytes"in O?{bytes:O.bytes,version:O.version}:{content:O.content,version:O.version}})},(O)=>R(O instanceof Error?O.message:String(O)));return}if(o.type==="resolve"){let a=(m)=>{G({channel:S,v:E,type:"resolve-result",id:o.id,payload:m})},R=se;if(!R){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((m)=>a({item:m?Y(m):null}),(m)=>{let O=(m instanceof Error?m.message:String(m)).trim();a({error:(O||"Command failed.").slice(0,ce)})});return}let i=j.get(o.id);if(!i)return;if(clearTimeout(i.timer),j.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new u(o.code,o.error))};r.addEventListener("message",wt),G({channel:S,v:E,type:"hello"});let P=(t,o=c)=>{if(D||r.parent===r)return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let R=setTimeout(()=>{j.delete(t.id),a(new u("HOST_TIMEOUT","Host did not answer in time."))},o);j.set(t.id,{resolve:i,reject:a,timer:R}),G(t)})},b=(t)=>P(t).then(()=>{return}),A={channel:S,v:E},Xe=(t)=>{if(!D&&r.parent!==r)G(t)},Nt=()=>Xe({...A,type:"file-save"}),Lt=(t)=>{if(!yo(t)||!Vo(t))return;t.preventDefault(),Nt()},Dt=(t)=>{if(!yo(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),Vt(l.popover.id,"escape").catch(()=>{return})},me=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let o=le||ue;if(Mt===o)return;Mt=o,Xt(t.id,o).catch(()=>{return})},Re=()=>{if(l?.surface!=="popover"||le)return;le=!0,me()},Ht=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!le)return;le=!1,me()},Ft=()=>{if(l?.surface!=="popover"||ue)return;ue=!0,me()},Bt=()=>{if(l?.surface!=="popover"||!ue)return;ue=!1,me()},w=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},We=async(t)=>{if(t.kind!=="projects")w(t.projectId);let o=await P({...A,type:"workspace-read",id:d(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},$e=async(t,o)=>{if(t.kind!=="projects")w(t.projectId);let i=d(p);z.set(i,o);try{await b({...A,type:"workspace-subscribe",id:d(p),payload:{subscriptionId:i,query:t}})}catch(a){if(z.delete(i),!D)G({...A,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw a}return()=>{if(!z.delete(i)||D)return;G({...A,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},Uo=async(t,o)=>{if(t.kind==="session")w(t.sessionId);if(t.kind==="project")w(t.projectId);let i=d(p);J.set(i,o);try{await b({...A,type:"shells-subscribe",id:d(p),payload:{subscriptionId:i,scope:t}})}catch(a){if(J.delete(i),!D)G({...A,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw a}return()=>{if(!J.delete(i)||D)return;G({...A,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},fe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>Ke))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!Q(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>je)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await P({...A,type:"storage",id:d(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Vt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):b({...A,type:"popover-close",id:d(p),payload:o?{id:t,reason:o}:{id:t}}),Xt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):b({...A,type:"popover-anchor",id:d(p),payload:{id:t,active:o}});return r.addEventListener("keydown",Dt,!0),r.addEventListener("pointerover",Re),r.addEventListener("pointermove",Re),r.addEventListener("pointerout",Ht),r.addEventListener("focus",Ft),r.addEventListener("blur",Bt),{onAction:(t)=>(ne=t,()=>{if(ne===t)ne=null}),listProjects:async()=>{let t=await We({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await We({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await We({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>$e({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>$e({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>$e({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Uo(t,o),readShellOutput:async(t,o)=>{w(t,ye);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>he))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${he}.`);let m=await P({...A,type:"shell-output",id:d(p),payload:{shellId:t,cursor:i,tailBytes:a}});if(!m||typeof m.output!=="string"||!Number.isFinite(m.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return m},stopShell:async(t)=>{if(w(t,ye),(await P({...A,type:"shell-stop",id:d(p),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{w(t),await b({...A,type:"open-session",id:d(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Ue(o),a={op:"get",key:t};if(i)a.scope=i;let R=await fe(a);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,i)=>{let a=Ue(i),R={op:"set",key:t,value:o};if(a)R.scope=a;await fe(R)},delete:async(t,o)=>{let i=Ue(o),a={op:"delete",key:t};if(i)a.scope=i;await fe(a)},keys:async(t)=>{let o=Ue(t),i={op:"keys"};if(o)i.scope=o;let a=await fe(i);if(a.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(_.add(t),l)t(l);return()=>{_.delete(t)}},onDirectory:(t)=>{if(x.add(t),l)t(l.directory);return()=>{x.delete(t)}},onSession:(t)=>{if(T.add(t),l)t(l.session);return()=>{T.delete(t)}},onSessionLifecycle:(t)=>{if(g.add(t),H)t(H);return()=>{g.delete(t)}},onConnection:(t)=>{if(L.add(t),l)t(l.connection);return()=>{L.delete(t)}},onSettings:(t)=>{if(V.add(t),l)t(l.settings);return()=>{V.delete(t)}},onItem:(t)=>{if(re.add(t),l)t(l.item);return()=>{re.delete(t)}},onBlock:(t)=>{if(de.add(t),l?.block)t(l.block);return()=>{de.delete(t)}},onServiceEvent:(t)=>(Se.add(t),()=>{Se.delete(t)}),onStatusControl:(t)=>(Ee.add(t),()=>{Ee.delete(t)}),onPopoverClosed:(t)=>(ge.add(t),()=>{ge.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!jt(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return b({...A,type:"status-controls",id:d(p),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!Ye(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return b({...A,type:"popover-open",id:d(p),payload:t})},closePopover:Vt,setPopoverAnchorActive:Xt,onResolve:(t)=>(se=t,()=>{if(se===t)se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ae)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Ae} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Oe))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Oe} characters.`));return b({channel:S,v:E,type:"toast",id:d(p),payload:{...t,message:o}})},openUrl:(t)=>b({channel:S,v:E,type:"open-url",id:d(p),payload:{url:t}}),openCommit:(t)=>rt(t)?b({channel:S,v:E,type:"open-commit",id:d(p),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>b({channel:S,v:E,type:"block-answer",id:d(p),payload:{text:t.trim().slice(0,et)}}),openSurface:(t)=>b({channel:S,v:E,type:"open-surface",id:d(p),payload:{surfaceId:t}}),writeClipboard:(t)=>b({channel:S,v:E,type:"clipboard-write",id:d(p),payload:{text:t}}),compose:(t)=>b({channel:S,v:E,type:"compose",id:d(p),payload:t}),attach:(t)=>b({channel:S,v:E,type:"attach",id:d(p),payload:Y(t)}),startSession:async(t)=>{if(t.projectId!==void 0)w(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")w(o.directory);else{if(o.name!==void 0)w(o.name,200);if(o.baseBranch!==void 0)w(o.baseBranch,200)}let i=await P({channel:S,v:E,type:"start-session",id:d(p),payload:at(t)},e.requestTimeoutMs??180000);if(!tt(i))throw new u("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:S,v:E,type:"prompt",id:d(p),payload:lt(t)}).then((o)=>{if(!ot(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>b({channel:S,v:E,type:"session-link",id:d(p),payload:Y(t)}),close:()=>b({channel:S,v:E,type:"close",id:d(p)}),oauthStart:()=>b({channel:S,v:E,type:"oauth-start",id:d(p)}),oauthDisconnect:()=>b({channel:S,v:E,type:"oauth-disconnect",id:d(p)}),request:(t)=>(Pe(t.path)?P({channel:S,v:E,type:"request",id:d(p),payload:t}):ho()).then((o)=>{if(!Me(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Pe(t.path)?P({channel:S,v:E,type:"service-request",id:d(p),payload:t}):ho()).then((o)=>{if(!Me(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>P({channel:S,v:E,type:"service-status",id:d(p)}).then((t)=>{if(!pt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(Z(t)?P({channel:S,v:E,type:"file-read",id:d(p),payload:{path:t}}):Ge()).then((o)=>{if(!dt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!Z(t))return Ge();if(o.length>Ce)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ce} characters.`));return P({channel:S,v:E,type:"file-write",id:d(p),payload:{path:t,content:o}}).then((i)=>{if(!St(i))throw new u("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(Z(t)?P({channel:S,v:E,type:"file-list",id:d(p),payload:{path:t}}):Ge()).then((o)=>{if(!Et(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(Z(t)?P({channel:S,v:E,type:"file-stat",id:d(p),payload:{path:t}}):Ge()).then((o)=>{if(!gt(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>ke)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${ke} characters.`));if(i!==void 0&&(i.length===0||i.length>Ie))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Ie} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(nt,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(i!==void 0)R.system=i;if(a!==void 0)R.maxOutputTokens=a;return P({channel:S,v:E,type:"generate",id:d(p),payload:R},e.requestTimeoutMs??it).then((m)=>{if(!_t(m))throw new u("HOST_REJECTED","Host did not return generated text.");return m})},onLateGenerateResult:(t)=>{K.add(t);for(let o of Be.splice(0))y([t],o);return Ut(),()=>{K.delete(t)}},setBadge:(t)=>b({channel:S,v:E,type:"badge",id:d(p),payload:{count:ut(t)}}),setHeight:(t)=>b({channel:S,v:E,type:"resize",id:d(p),payload:{height:ct(t)}}),onFileOpen:(t)=>{if(_e.add(t),!Ve)Ve=!0,r.addEventListener("keydown",Lt,!0);if(ae)t(ae);return()=>{_e.delete(t)}},onFileSnapshot:(t)=>(ie=t,()=>{if(ie===t)ie=null}),onFileSaved:(t)=>(Te.add(t),()=>{Te.delete(t)}),reportFileChange:(t)=>Xe({...A,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Nt,reportFileUnsupported:()=>Xe({...A,type:"file-unsupported"}),dispose:()=>{for(let t of z.keys())G({...A,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:t}});z.clear();for(let t of J.keys())G({...A,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:t}});if(J.clear(),D=!0,se=null,ne=null,ie=null,_e.clear(),Te.clear(),Ve)r.removeEventListener("keydown",Lt,!0);r.removeEventListener("message",wt),r.removeEventListener("keydown",Dt,!0),r.removeEventListener("pointerover",Re),r.removeEventListener("pointermove",Re),r.removeEventListener("pointerout",Ht),r.removeEventListener("focus",Ft),r.removeEventListener("blur",Bt);for(let t of j.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));j.clear(),_.clear(),x.clear(),T.clear(),g.clear(),L.clear(),V.clear(),re.clear(),de.clear(),Se.clear(),Ee.clear(),ge.clear(),K.clear(),Be.length=0}}};var vo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Ir=new Set(vo);var bo=["none","agent","user"];var Mr=new Set(bo);var Xo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Wo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Ao=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,c]of Xo)r.style.setProperty(n,e.tokens[c]);for(let[n,c,_]of Wo){let x=e.tokens[_]??"";r.style.setProperty(n,x),r.style.setProperty(c,x)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Rt=(e,r)=>{if(Ao(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var $o={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},f=(e,r)=>`var(--${e}, var(--oc-${$o[e]}, ${r}))`,B=f("surface-background","transparent"),Ne=f("surface-elevated","transparent"),ee=f("surface-elevated-foreground","inherit"),U=f("surface-foreground","inherit"),h=f("surface-muted-foreground","gray"),qo=f("surface-muted","transparent"),W=f("interactive-border","currentColor"),M=f("interactive-hover","transparent"),q=f("interactive-active","transparent"),ft=f("interactive-selection","transparent"),yt=f("interactive-selection-foreground","inherit"),F=f("primary","currentColor"),ht=f("primary-text","inherit"),vt=f("error-text","inherit"),Ko=f("font-sans","inherit"),bt=f("font-mono","monospace"),ko=f("radius","9px"),At=`calc(${ko} - 2px)`,Oo=`calc(${ko} - 4px)`,v=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,xo=`background-image: linear-gradient(${M}, ${M});`,Ot=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,xt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Co="box-shadow: var(--oc-sdk-lit);",Ct=`inset 0 0.5px 0 0 ${v(U,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,jo=`
:root {
  --oc-sdk-edge: ${v(U,16)};
  --oc-sdk-field-bg: ${Ne};
  --oc-sdk-raised-bg: ${B};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${v(U,14)};
  --oc-sdk-field-bg: ${v(B,50,Ne)};
  --oc-sdk-raised-bg: ${Ne};
  --oc-sdk-field-lift: ${Ct};
  --oc-sdk-raised-lift: ${Ct};
  --oc-sdk-lit: ${Ct};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,we=(e)=>{let r=f(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${f(`${e}-text`,"inherit")}; }`},s=(e)=>`calc(${e}rem / 14)`,zo=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${s(8)}; min-height: ${s(32)}; padding: .25em ${s(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1.45; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${s(6)}; min-height: ${s(28)}; padding: .25em ${s(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${s(4)}; min-height: ${s(24)}; padding: .25em ${s(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${s(14)}; height: ${s(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: auto; min-height: ${s(32)}; padding: .25em ${s(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${s(8)} ${s(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${s(34)}; padding-right: ${s(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${s(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${s(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${s(24)}; height: ${s(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${s(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; min-height: ${s(28)}; padding: .25em ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${s(2)}; min-width: ${s(160)}; max-width: calc(100vw - ${s(16)}); max-height: min(${s(320)}, calc(100vh - ${s(16)})); overflow: auto; padding: ${s(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${s(2)} ${s(2)} ${s(4)}; }
.oc-sdk-popup-search .oc-sdk-input { min-height: ${s(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${s(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${s(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${s(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${s(14)}; height: ${s(14)}; margin-top: ${s(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${s(36)}; height: ${s(20)}; --oc-sdk-thumb-travel: ${s(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${s(2)}; left: ${s(2)}; width: ${s(16)}; height: ${s(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${s(2)}; padding: ${s(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${s(6)}; min-height: ${s(28)}; padding: .125em ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${s(1)} ${s(6)}; font-size: ${s(11)}; font-weight: 500; line-height: ${s(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${s(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${s(16)} ${s(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${s(4)}; padding: ${s(40)} ${s(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${s(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${s(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${s(16)}; height: ${s(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${s(12)}; height: ${s(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${s(12)}; padding: ${s(8)} ${s(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${s(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${s(8)}; width: 100%; margin: ${s(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${s(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${s(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${s(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${s(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { min-height: ${s(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { min-height: ${s(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${s(36)}; height: ${s(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${s(44)}; }
  .oc-sdk-check { min-height: ${s(36)}; padding: ${s(8)} 0; }
}
`,Io=`${jo}
.oc-sdk { color: ${U}; font-family: ${Ko}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${xo} }
.oc-sdk-mono { font-family: ${bt}; }
.oc-sdk-muted { color: ${h}; }
${we("success")}${we("warning")}${we("error")}${we("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${F}; --oc-sdk-tone-text: ${ht}; }

.oc-sdk-btn { border-radius: ${At}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Oo}; }
.oc-sdk-btn[data-variant="default"] { color: ${ht}; background: ${v(F,10,B)}; border-color: ${v(F,12)}; ${Co} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${v(F,16,B)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${v(F,22,B)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${qo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${M}, ${M}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${q}, ${q}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ee}; ${xt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${M}, ${M}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${q}, ${q}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${M}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${q}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${f("status-error","red")}; color: ${vt}; background: ${v("var(--oc-sdk-tone)",7,B)}; border-color: ${v("var(--oc-sdk-tone)",12)}; ${Co} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${v("var(--oc-sdk-tone)",9,B)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${v("var(--oc-sdk-tone)",11,B)}; box-shadow: none; }

.oc-sdk-field-note { color: ${h}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${vt}; }
.oc-sdk-input { border-radius: ${At}; background: var(--oc-sdk-field-bg); color: ${ee}; ${Ot("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${h}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${M}, ${M}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ot(v(U,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ot(f("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${bt}; }

.oc-sdk-search-icon { color: ${h}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${F}; }
.oc-sdk-search-clear { border-radius: ${Oo}; color: ${h}; }
.oc-sdk-search-clear:hover { background: ${M}; color: ${U}; }

.oc-sdk-trigger { border-radius: ${At}; background: var(--oc-sdk-raised-bg); color: ${ee}; ${xt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${M}, ${M}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${q}, ${q}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${h}; }
.oc-sdk-trigger-chevron { color: ${h}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ee}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ne}; background-clip: padding-box; color: ${ee}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${M}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${ft}; color: ${yt}; }
.oc-sdk-option-check { color: ${U}; }
.oc-sdk-option[data-destructive="true"] { color: ${vt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${v(f("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${h}; }
.oc-sdk-popup-empty { color: ${h}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${W}; border-radius: 4px; color: ${U}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${v(U,60,W)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${W}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${B}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${F}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${xo} }
.oc-sdk-check-desc { color: ${h}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${v(U,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${h}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${U}; }
.oc-sdk-tab[aria-selected="true"] { color: ${yt}; background: ${ft}; border-color: ${W}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ee}; background: var(--oc-sdk-raised-bg); ${xt} }
.oc-sdk-tab-count { color: ${h}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${v(U,6)}; color: ${h}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${v("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${M}; }
.oc-sdk-row[aria-selected="true"] { background: ${ft}; color: ${yt}; }
.oc-sdk-row-lead { font-family: ${bt}; color: ${h}; }
.oc-sdk-row-sub { color: ${h}; }
.oc-sdk-row-meta { color: ${h}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${h}; }

.oc-sdk-empty-body { color: ${h}; }

.oc-sdk-spinner { color: ${h}; }
.oc-sdk-spinner-ring { border-color: ${W}; border-top-color: ${F}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${v("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${h}; }

.oc-sdk-separator { color: ${h}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${v(W,40)}; }

.oc-sdk-progress-label { color: ${h}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${v(U,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${F}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${f("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${f("success-text","inherit")}; }

.oc-sdk-text a { color: ${ht}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${v(W,60)}; }
`,k=`
${qe}
${zo}
${Io}`;var te=(e)=>{while(e.firstChild)e.removeChild(e.firstChild)},I=(e)=>{let r=document.getElementById("oc-sdk-ui-style");if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}let n=document.createElement("style");n.id="oc-sdk-ui-style",n.textContent=e,document.head.appendChild(n)},C=(e,r)=>{let n=document.createElement(e);if(r)n.className=r;return n},X=(e)=>{let r=C("button",e);return r.type="button",r},N=(e,r)=>{let n=r??"";if(e.textContent!==n)e.textContent=n};var Jo=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},oe=(e,r)=>{I(k);let n=r,c=X("oc-sdk oc-sdk-btn"),_=Jo(),x=document.createElement("span");c.append(x),e.append(c);let T=()=>{if(c.dataset.variant=n.variant??"default",c.dataset.size=n.size??"default",c.disabled=Boolean(n.disabled)||Boolean(n.loading),c.dataset.loading=n.loading?"true":"false",c.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&_.parentNode!==c)c.prepend(_);else if(!n.loading&&_.parentNode===c)_.remove();N(x,n.label)},g=()=>{if(n.disabled||n.loading)return;n.onClick()};return c.addEventListener("click",g),T(),{update:(L)=>{n={...n,...L},T()},dispose:()=>{c.removeEventListener("click",g),c.remove()}}};var tr=/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,or=(e)=>{try{let r=new URL(e);return r.protocol==="http:"||r.protocol==="https:"}catch{return!1}},Po=(e)=>{let r=[],n=0;for(let c of e.matchAll(tr)){let _=c.index??0;if(_>n)r.push({kind:"text",text:e.slice(n,_)});let x=c[1]??"",T=(c[2]??"").trim(),g=c[3]??"";if(!or(g))r.push({kind:"text",text:c[0]});else if(x==="!")r.push({kind:"image",src:g,alt:T});else r.push({kind:"link",href:g,label:T||g});n=_+c[0].length}if(n<e.length)r.push({kind:"text",text:e.slice(n)});return r},kt=(e,r)=>{I(k);let n=r,c=C("div","oc-sdk oc-sdk-text");e.append(c);let _=(T)=>{if(!(T.target instanceof HTMLAnchorElement)||!n.onOpenUrl)return;T.preventDefault(),n.onOpenUrl(T.target.href)},x=()=>{te(c);for(let T of Po(n.text))if(T.kind==="text")c.append(document.createTextNode(T.text));else if(T.kind==="link"){let g=C("a");g.href=T.href,g.rel="noopener noreferrer",g.target="_blank",g.textContent=T.label,c.append(g)}else{let g=C("img");g.src=T.src,g.alt=T.alt,g.loading="lazy",g.referrerPolicy="no-referrer",c.append(g)}};return c.addEventListener("click",_),x(),{update:(T)=>{n={...n,...T},x()},dispose:()=>{c.removeEventListener("click",_),c.remove()}}};var It=mt(),Fe=document.querySelector("#root");if(!Fe)throw Error("Agent Desk: missing root");var Go=document.createElement("div"),Pt=(e)=>{let r=document.createElement("div");r.textContent=e,Go.prepend(r)},Mo=!1;It.onReady((e)=>{if(Rt(e,document.documentElement),Mo)return;Mo=!0,kt(Fe,{text:"Agent Desk"}),oe(Fe,{label:"Start a session",onClick:()=>{It.serviceRequest({method:"POST",path:"/start",body:JSON.stringify({directory:e.directory})}).then((r)=>Pt(r.body)).catch(()=>Pt("The service did not answer."))}}),Fe.append(Go)});It.onServiceEvent(({topic:e,data:r})=>Pt(`${e}: ${JSON.stringify(r)}`));})();
