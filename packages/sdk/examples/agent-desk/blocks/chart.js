(()=>{var d="openchamber.sdk",S=1;var Ke=`
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
`;var je=128,ze=65536;var ye=128;var he=65536;var $t=/^[a-z][a-z0-9-]{0,39}$/;var Vt=(e)=>Object(e)===e&&!Array.isArray(e),Je=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),Xt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Wt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,qt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!Vt(n)||!$t.test(n.id)||!Xt(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!Je(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!Je(n,["kind","id","label","value","options","disabled"]))return!1;if(!Wt(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let E=new Set;for(let g of n.options){if(!Vt(g)||!Je(g,["value","label"])||!Wt(g.value)||!Xt(g.label)||E.has(g.value))return!1;E.add(g.value)}if(!E.has(n.value))return!1}return!0};var Kt=["{id}","{segment}","{segments+}"];var nr=new Set(Kt);var jt=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var ar=new Set(jt);var ve=20000000,be=256;var Qe=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,zt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var Jt=/^[A-Za-z0-9_-]{1,80}$/;var Qt=["left","right","top","bottom"];var Yt=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let E=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let g of E)if(!Yt(g,r+1,n))return!1;return!0},Ye=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Ye);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Ye)}return String(e)===e||Number.isFinite(e)},Ze=(e)=>{try{if(String(e.id)!==e.id||!Jt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Qt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Yt(e.data)||!Ye(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var tt=2000;var eo=["file","directory","other","missing"],ot=(e)=>Boolean(e&&"sessionId"in e),rt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var to=/^[0-9a-f]{7,64}$/i,st=(e)=>to.test(e),Ae=500,Oe=32000,oo=16000,ro=128,so=200,no=2000,io=16000,ao=80,lo=200,uo=16000;var co=2000;var nt=20000,xe=1024,Ce=2000000;var ke=64000,Ie=8000,it=4000;var at=960000;var po=999,So=1e4,ce=500,Eo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],go=["stopped","starting","ready","failed"],Po=new Set(Eo),_o=(e)=>Po.has(e),To=(e)=>e&&_o(e)?e:"HOST_REJECTED",Y=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(Y);if(Object(e)===e)return Object.values(e).every(Y);return!1},mo=(e)=>Y(e)&&JSON.stringify(e).length<=uo,Zt=(e)=>e?.trim().slice(0,lo)??"",Z=(e)=>{let r=e.id.trim().slice(0,ro),n=e.title.trim().slice(0,so),E=e.url.trim().slice(0,no),g=e.text?.trim().slice(0,io),A=e.author?.trim().slice(0,ao),I=e.kind==="pull"?"pull":"issue",O={providerId:e.providerId.trim(),id:r,title:n||r,url:E,kind:I};if(g)O.text=g;if(A)O.author=A;if(I==="pull"){let M=Zt(e.branches?.head),V=Zt(e.branches?.base);if(M&&V)O.branches={head:M,base:V}}if(mo(e.data))O.data=e.data;return O},lt=(e)=>{let r=Z(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},ut=(e)=>{let r={text:e.text.trim().slice(0,oo)};if(e.send)r.send=!0;return r},ct=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(po,Math.max(0,Math.round(e)))},pt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(So,Math.max(0,Math.ceil(e)))};var ee=(e)=>e.length>0&&e.length<=xe&&!e.includes("\x00")&&!e.includes("\\");var Pe=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>co)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Mo=new Set(go),dt=(e)=>Boolean(e&&"status"in e&&Mo.has(String(e.status))&&!("body"in e)),Me=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),St=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),Et=(e)=>Boolean(e&&"written"in e&&e.written===!0),gt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Go=new Set(eo),_t=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Go.has(String(e.kind))&&Number.isFinite(e.size)),Tt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Uo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),wo=(e)=>Object(e)===e?e:null,et=(e)=>String(e)===e&&e.length>0,No=(e)=>{if(!et(e.id))return null;if(e.ok===!0){let r={channel:d,v:S,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&et(e.error))return{channel:d,v:S,type:"result",id:e.id,ok:!1,error:e.error,code:To(et(e.code)?e.code:void 0)};return null},mt=(e)=>{let r=wo(e);if(!r||r.channel!==d||r.v!==S)return null;if(r.type==="result")return No(r);if(!Uo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Ro=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Lo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var fo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ge=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${xe} characters without NUL or backslash.`)),Ue=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},p=(e)=>(e.value+=1,`oc-${e.value}`),Rt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??((t)=>t===r.parent),E=e.requestTimeoutMs??nt,g=new Set,A=new Set,I=new Set,O=new Set,M=new Set,V=new Set,re=new Set,de=new Set,Se=new Set,Ee=new Set,ge=new Set,j=new Set,Ve=[],se=null,ne=null,_e=new Set,Te=new Set,ie=null,ae=null,Xe=!1,z=new Map,J=new Map,Q=new Map,D=!1,c={value:0},l=null,H=null,le=!1,ue=!1,It=null,Pt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},U=(t)=>{r.parent.postMessage(t,"*")},Mt=()=>{if(D||r.parent===r||j.size===0||l?.features?.lateGenerateResults!==!0)return;U({channel:d,v:S,type:"generate-late-listen"})},R=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},Gt=(t)=>{if(!(t instanceof MessageEvent))return;if(!n(t.source))return;let o=mt(t.data);if(!o)return;if(o.type==="workspace"){let a=J.get(o.payload.subscriptionId);if(a)R([a],o.payload.snapshot);return}if(o.type==="shells"){let a=Q.get(o.payload.subscriptionId);if(a)R([a],o.payload.snapshot);return}if(o.type==="ready"){if(l=o.payload,H=Pt(o.payload.session),R(g,o.payload),R(A,o.payload.directory),R(I,o.payload.session),H)R(O,H);if(R(M,o.payload.connection),R(V,o.payload.settings),R(re,o.payload.item),o.payload.block)R(de,o.payload.block);Mt();return}if(o.type==="service-event"){R(Se,o.payload);return}if(o.type==="generate-late"){if(j.size===0)Ve.push(o.payload);else R(j,o.payload);return}if(o.type==="directory"){if(l)l={...l,directory:o.payload.directory};R(A,o.payload.directory);return}if(o.type==="session"){if(l)l={...l,session:o.payload.session};if(!o.payload.session)H=null;else if(H?.sessionId!==o.payload.session.id)H=Pt(o.payload.session);R(I,o.payload.session);return}if(o.type==="session-lifecycle"){H=o.payload,R(O,o.payload);return}if(o.type==="connection"){if(l)l={...l,connection:o.payload.connection};R(M,o.payload.connection);return}if(o.type==="settings"){if(l)l={...l,settings:o.payload.settings};R(V,o.payload.settings);return}if(o.type==="item"){if(l)l={...l,item:o.payload.item};R(re,o.payload.item);return}if(o.type==="status-control-event"){R(Ee,o.payload);return}if(o.type==="popover-closed"){R(ge,o.payload);return}if(o.type==="action"){let a=(_)=>{if(!D)U({channel:d,v:S,type:"action-result",id:o.id,payload:_})},T=ne;if(!T){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>T(o.payload)).then(()=>a({ok:!0}),(_)=>{let b=(_ instanceof Error?_.message:String(_)).trim();a({ok:!1,error:(b||"Action failed.").slice(0,ce)})});return}if(o.type==="file-open"){let a=o.payload;if(ae&&zt(ae,a))return;ae=a,R(_e,o.payload);return}if(o.type==="file-saved"){R(Te,o.payload.version);return}if(o.type==="file-snapshot"){let a=(b)=>{if(!D)U({channel:d,v:S,type:"file-snapshot-result",id:o.id,payload:b})},T=(b)=>a({error:(b.trim()||"Could not read the edited file.").slice(0,ce)}),_=ie;if(!_){T("This extension does not edit files.");return}Promise.resolve().then(()=>_(o.payload.purpose)).then((b)=>{if(Qe(b)>ve){T(`The file is over ${ve} ${"bytes"in b?"bytes":"characters"}.`);return}if(b.version.length>be){T(`The snapshot version is over ${be} characters.`);return}a({snapshot:"bytes"in b?{bytes:b.bytes,version:b.version}:{content:b.content,version:b.version}})},(b)=>T(b instanceof Error?b.message:String(b)));return}if(o.type==="resolve"){let a=(_)=>{U({channel:d,v:S,type:"resolve-result",id:o.id,payload:_})},T=se;if(!T){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>T(o.payload)).then((_)=>a({item:_?Z(_):null}),(_)=>{let b=(_ instanceof Error?_.message:String(_)).trim();a({error:(b||"Command failed.").slice(0,ce)})});return}let i=z.get(o.id);if(!i)return;if(clearTimeout(i.timer),z.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new u(o.code,o.error))};r.addEventListener("message",Gt),U({channel:d,v:S,type:"hello"});let P=(t,o=E)=>{if(D||r.parent===r)return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let T=setTimeout(()=>{z.delete(t.id),a(new u("HOST_TIMEOUT","Host did not answer in time."))},o);z.set(t.id,{resolve:i,reject:a,timer:T}),U(t)})},h=(t)=>P(t).then(()=>{return}),v={channel:d,v:S},We=(t)=>{if(!D&&r.parent!==r)U(t)},Ut=()=>We({...v,type:"file-save"}),wt=(t)=>{if(!Ro(t)||!Lo(t))return;t.preventDefault(),Ut()},Nt=(t)=>{if(!Ro(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),Ft(l.popover.id,"escape").catch(()=>{return})},me=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let o=le||ue;if(It===o)return;It=o,Bt(t.id,o).catch(()=>{return})},Re=()=>{if(l?.surface!=="popover"||le)return;le=!0,me()},Lt=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!le)return;le=!1,me()},Dt=()=>{if(l?.surface!=="popover"||ue)return;ue=!0,me()},Ht=()=>{if(l?.surface!=="popover"||!ue)return;ue=!1,me()},N=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},$e=async(t)=>{if(t.kind!=="projects")N(t.projectId);let o=await P({...v,type:"workspace-read",id:p(c),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},qe=async(t,o)=>{if(t.kind!=="projects")N(t.projectId);let i=p(c);J.set(i,o);try{await h({...v,type:"workspace-subscribe",id:p(c),payload:{subscriptionId:i,query:t}})}catch(a){if(J.delete(i),!D)U({...v,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:i}});throw a}return()=>{if(!J.delete(i)||D)return;U({...v,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:i}})}},ko=async(t,o)=>{if(t.kind==="session")N(t.sessionId);if(t.kind==="project")N(t.projectId);let i=p(c);Q.set(i,o);try{await h({...v,type:"shells-subscribe",id:p(c),payload:{subscriptionId:i,scope:t}})}catch(a){if(Q.delete(i),!D)U({...v,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:i}});throw a}return()=>{if(!Q.delete(i)||D)return;U({...v,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:i}})}},fe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>je))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!Y(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>ze)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await P({...v,type:"storage",id:p(c),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Ft=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):h({...v,type:"popover-close",id:p(c),payload:o?{id:t,reason:o}:{id:t}}),Bt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):h({...v,type:"popover-anchor",id:p(c),payload:{id:t,active:o}});return r.addEventListener("keydown",Nt,!0),r.addEventListener("pointerover",Re),r.addEventListener("pointermove",Re),r.addEventListener("pointerout",Lt),r.addEventListener("focus",Dt),r.addEventListener("blur",Ht),{onAction:(t)=>(ne=t,()=>{if(ne===t)ne=null}),listProjects:async()=>{let t=await $e({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await $e({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await $e({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>qe({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>qe({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>qe({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>ko(t,o),readShellOutput:async(t,o)=>{N(t,ye);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>he))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${he}.`);let _=await P({...v,type:"shell-output",id:p(c),payload:{shellId:t,cursor:i,tailBytes:a}});if(!_||typeof _.output!=="string"||!Number.isFinite(_.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return _},stopShell:async(t)=>{if(N(t,ye),(await P({...v,type:"shell-stop",id:p(c),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{N(t),await h({...v,type:"open-session",id:p(c),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Ue(o),a={op:"get",key:t};if(i)a.scope=i;let T=await fe(a);return T.op==="get"&&T.found?T.value:void 0},set:async(t,o,i)=>{let a=Ue(i),T={op:"set",key:t,value:o};if(a)T.scope=a;await fe(T)},delete:async(t,o)=>{let i=Ue(o),a={op:"delete",key:t};if(i)a.scope=i;await fe(a)},keys:async(t)=>{let o=Ue(t),i={op:"keys"};if(o)i.scope=o;let a=await fe(i);if(a.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(g.add(t),l)t(l);return()=>{g.delete(t)}},onDirectory:(t)=>{if(A.add(t),l)t(l.directory);return()=>{A.delete(t)}},onSession:(t)=>{if(I.add(t),l)t(l.session);return()=>{I.delete(t)}},onSessionLifecycle:(t)=>{if(O.add(t),H)t(H);return()=>{O.delete(t)}},onConnection:(t)=>{if(M.add(t),l)t(l.connection);return()=>{M.delete(t)}},onSettings:(t)=>{if(V.add(t),l)t(l.settings);return()=>{V.delete(t)}},onItem:(t)=>{if(re.add(t),l)t(l.item);return()=>{re.delete(t)}},onBlock:(t)=>{if(de.add(t),l?.block)t(l.block);return()=>{de.delete(t)}},onServiceEvent:(t)=>(Se.add(t),()=>{Se.delete(t)}),onStatusControl:(t)=>(Ee.add(t),()=>{Ee.delete(t)}),onPopoverClosed:(t)=>(ge.add(t),()=>{ge.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!qt(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return h({...v,type:"status-controls",id:p(c),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!Ze(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return h({...v,type:"popover-open",id:p(c),payload:t})},closePopover:Ft,setPopoverAnchorActive:Bt,onResolve:(t)=>(se=t,()=>{if(se===t)se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ae)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Ae} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Oe))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Oe} characters.`));return h({channel:d,v:S,type:"toast",id:p(c),payload:{...t,message:o}})},openUrl:(t)=>h({channel:d,v:S,type:"open-url",id:p(c),payload:{url:t}}),openCommit:(t)=>st(t)?h({channel:d,v:S,type:"open-commit",id:p(c),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>h({channel:d,v:S,type:"block-answer",id:p(c),payload:{text:t.trim().slice(0,tt)}}),openSurface:(t)=>h({channel:d,v:S,type:"open-surface",id:p(c),payload:{surfaceId:t}}),writeClipboard:(t)=>h({channel:d,v:S,type:"clipboard-write",id:p(c),payload:{text:t}}),compose:(t)=>h({channel:d,v:S,type:"compose",id:p(c),payload:t}),attach:(t)=>h({channel:d,v:S,type:"attach",id:p(c),payload:Z(t)}),startSession:async(t)=>{if(t.projectId!==void 0)N(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")N(o.directory);else{if(o.name!==void 0)N(o.name,200);if(o.baseBranch!==void 0)N(o.baseBranch,200)}let i=await P({channel:d,v:S,type:"start-session",id:p(c),payload:lt(t)},e.requestTimeoutMs??180000);if(!ot(i))throw new u("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:d,v:S,type:"prompt",id:p(c),payload:ut(t)}).then((o)=>{if(!rt(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>h({channel:d,v:S,type:"session-link",id:p(c),payload:Z(t)}),close:()=>h({channel:d,v:S,type:"close",id:p(c)}),oauthStart:()=>h({channel:d,v:S,type:"oauth-start",id:p(c)}),oauthDisconnect:()=>h({channel:d,v:S,type:"oauth-disconnect",id:p(c)}),request:(t)=>(Pe(t.path)?P({channel:d,v:S,type:"request",id:p(c),payload:t}):fo()).then((o)=>{if(!Me(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Pe(t.path)?P({channel:d,v:S,type:"service-request",id:p(c),payload:t}):fo()).then((o)=>{if(!Me(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>P({channel:d,v:S,type:"service-status",id:p(c)}).then((t)=>{if(!dt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ee(t)?P({channel:d,v:S,type:"file-read",id:p(c),payload:{path:t}}):Ge()).then((o)=>{if(!St(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ee(t))return Ge();if(o.length>Ce)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ce} characters.`));return P({channel:d,v:S,type:"file-write",id:p(c),payload:{path:t,content:o}}).then((i)=>{if(!Et(i))throw new u("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(ee(t)?P({channel:d,v:S,type:"file-list",id:p(c),payload:{path:t}}):Ge()).then((o)=>{if(!gt(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ee(t)?P({channel:d,v:S,type:"file-stat",id:p(c),payload:{path:t}}):Ge()).then((o)=>{if(!_t(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>ke)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${ke} characters.`));if(i!==void 0&&(i.length===0||i.length>Ie))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Ie} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(it,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let T={prompt:o};if(i!==void 0)T.system=i;if(a!==void 0)T.maxOutputTokens=a;return P({channel:d,v:S,type:"generate",id:p(c),payload:T},e.requestTimeoutMs??at).then((_)=>{if(!Tt(_))throw new u("HOST_REJECTED","Host did not return generated text.");return _})},onLateGenerateResult:(t)=>{j.add(t);for(let o of Ve.splice(0))R([t],o);return Mt(),()=>{j.delete(t)}},setBadge:(t)=>h({channel:d,v:S,type:"badge",id:p(c),payload:{count:ct(t)}}),setHeight:(t)=>h({channel:d,v:S,type:"resize",id:p(c),payload:{height:pt(t)}}),onFileOpen:(t)=>{if(_e.add(t),!Xe)Xe=!0,r.addEventListener("keydown",wt,!0);if(ae)t(ae);return()=>{_e.delete(t)}},onFileSnapshot:(t)=>(ie=t,()=>{if(ie===t)ie=null}),onFileSaved:(t)=>(Te.add(t),()=>{Te.delete(t)}),reportFileChange:(t)=>We({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Ut,reportFileUnsupported:()=>We({...v,type:"file-unsupported"}),dispose:()=>{for(let t of J.keys())U({...v,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:t}});J.clear();for(let t of Q.keys())U({...v,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:t}});if(Q.clear(),D=!0,se=null,ne=null,ie=null,_e.clear(),Te.clear(),Xe)r.removeEventListener("keydown",wt,!0);r.removeEventListener("message",Gt),r.removeEventListener("keydown",Nt,!0),r.removeEventListener("pointerover",Re),r.removeEventListener("pointermove",Re),r.removeEventListener("pointerout",Lt),r.removeEventListener("focus",Dt),r.removeEventListener("blur",Ht);for(let t of z.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));z.clear(),g.clear(),A.clear(),I.clear(),O.clear(),M.clear(),V.clear(),re.clear(),de.clear(),Se.clear(),Ee.clear(),ge.clear(),j.clear(),Ve.length=0}}};var yo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var vr=new Set(yo);var ho=["none","agent","user"];var Ar=new Set(ho);var Do=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Ho=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],vo=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,E]of Do)r.style.setProperty(n,e.tokens[E]);for(let[n,E,g]of Ho){let A=e.tokens[g]??"";r.style.setProperty(n,A),r.style.setProperty(E,A)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},ft=(e,r)=>{if(vo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Fo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},m=(e,r)=>`var(--${e}, var(--oc-${Fo[e]}, ${r}))`,B=m("surface-background","transparent"),Ne=m("surface-elevated","transparent"),te=m("surface-elevated-foreground","inherit"),w=m("surface-foreground","inherit"),f=m("surface-muted-foreground","gray"),Bo=m("surface-muted","transparent"),W=m("interactive-border","currentColor"),G=m("interactive-hover","transparent"),q=m("interactive-active","transparent"),yt=m("interactive-selection","transparent"),ht=m("interactive-selection-foreground","inherit"),F=m("primary","currentColor"),vt=m("primary-text","inherit"),bt=m("error-text","inherit"),Vo=m("font-sans","inherit"),At=m("font-mono","monospace"),xo=m("radius","9px"),Ot=`calc(${xo} - 2px)`,bo=`calc(${xo} - 4px)`,y=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,Ao=`background-image: linear-gradient(${G}, ${G});`,xt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Ct="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Oo="box-shadow: var(--oc-sdk-lit);",kt=`inset 0 0.5px 0 0 ${y(w,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,Xo=`
:root {
  --oc-sdk-edge: ${y(w,16)};
  --oc-sdk-field-bg: ${Ne};
  --oc-sdk-raised-bg: ${B};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${y(w,14)};
  --oc-sdk-field-bg: ${y(B,50,Ne)};
  --oc-sdk-raised-bg: ${Ne};
  --oc-sdk-field-lift: ${kt};
  --oc-sdk-raised-lift: ${kt};
  --oc-sdk-lit: ${kt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,we=(e)=>{let r=m(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${m(`${e}-text`,"inherit")}; }`},s=(e)=>`calc(${e}rem / 14)`,Wo=`
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
`,Co=`${Xo}
.oc-sdk { color: ${w}; font-family: ${Vo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ao} }
.oc-sdk-mono { font-family: ${At}; }
.oc-sdk-muted { color: ${f}; }
${we("success")}${we("warning")}${we("error")}${we("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${F}; --oc-sdk-tone-text: ${vt}; }

.oc-sdk-btn { border-radius: ${Ot}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${bo}; }
.oc-sdk-btn[data-variant="default"] { color: ${vt}; background: ${y(F,10,B)}; border-color: ${y(F,12)}; ${Oo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${y(F,16,B)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${y(F,22,B)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Bo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${q}, ${q}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${te}; ${Ct} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${q}, ${q}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${G}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${q}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${m("status-error","red")}; color: ${bt}; background: ${y("var(--oc-sdk-tone)",7,B)}; border-color: ${y("var(--oc-sdk-tone)",12)}; ${Oo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${y("var(--oc-sdk-tone)",9,B)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${y("var(--oc-sdk-tone)",11,B)}; box-shadow: none; }

.oc-sdk-field-note { color: ${f}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${bt}; }
.oc-sdk-input { border-radius: ${Ot}; background: var(--oc-sdk-field-bg); color: ${te}; ${xt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${f}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${xt(y(w,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${xt(m("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${At}; }

.oc-sdk-search-icon { color: ${f}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${F}; }
.oc-sdk-search-clear { border-radius: ${bo}; color: ${f}; }
.oc-sdk-search-clear:hover { background: ${G}; color: ${w}; }

.oc-sdk-trigger { border-radius: ${Ot}; background: var(--oc-sdk-raised-bg); color: ${te}; ${Ct} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${q}, ${q}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${f}; }
.oc-sdk-trigger-chevron { color: ${f}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${te}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ne}; background-clip: padding-box; color: ${te}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${G}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${yt}; color: ${ht}; }
.oc-sdk-option-check { color: ${w}; }
.oc-sdk-option[data-destructive="true"] { color: ${bt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${y(m("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${f}; }
.oc-sdk-popup-empty { color: ${f}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${W}; border-radius: 4px; color: ${w}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${y(w,60,W)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${W}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${B}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${F}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ao} }
.oc-sdk-check-desc { color: ${f}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${y(w,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${f}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${w}; }
.oc-sdk-tab[aria-selected="true"] { color: ${ht}; background: ${yt}; border-color: ${W}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${te}; background: var(--oc-sdk-raised-bg); ${Ct} }
.oc-sdk-tab-count { color: ${f}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${y(w,6)}; color: ${f}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${y("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${G}; }
.oc-sdk-row[aria-selected="true"] { background: ${yt}; color: ${ht}; }
.oc-sdk-row-lead { font-family: ${At}; color: ${f}; }
.oc-sdk-row-sub { color: ${f}; }
.oc-sdk-row-meta { color: ${f}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${f}; }

.oc-sdk-empty-body { color: ${f}; }

.oc-sdk-spinner { color: ${f}; }
.oc-sdk-spinner-ring { border-color: ${W}; border-top-color: ${F}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${y("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${f}; }

.oc-sdk-separator { color: ${f}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${y(W,40)}; }

.oc-sdk-progress-label { color: ${f}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${y(w,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${F}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${m("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${m("success-text","inherit")}; }

.oc-sdk-text a { color: ${vt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${y(W,60)}; }
`,x=`
${Ke}
${Wo}
${Co}`;var C=(e)=>{let r=document.getElementById("oc-sdk-ui-style");if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}let n=document.createElement("style");n.id="oc-sdk-ui-style",n.textContent=e,document.head.appendChild(n)},k=(e,r)=>{let n=document.createElement(e);if(r)n.className=r;return n},X=(e)=>{let r=k("button",e);return r.type="button",r},L=(e,r)=>{let n=r??"";if(e.textContent!==n)e.textContent=n};var $o=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},oe=(e,r)=>{C(x);let n=r,E=X("oc-sdk oc-sdk-btn"),g=$o(),A=document.createElement("span");E.append(A),e.append(E);let I=()=>{if(E.dataset.variant=n.variant??"default",E.dataset.size=n.size??"default",E.disabled=Boolean(n.disabled)||Boolean(n.loading),E.dataset.loading=n.loading?"true":"false",E.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&g.parentNode!==E)E.prepend(g);else if(!n.loading&&g.parentNode===E)g.remove();L(A,n.label)},O=()=>{if(n.disabled||n.loading)return;n.onClick()};return E.addEventListener("click",O),I(),{update:(M)=>{n={...n,...M},I()},dispose:()=>{E.removeEventListener("click",O),E.remove()}}};var Be=Rt(),K=document.querySelector("#root");if(!K)throw Error("DeskChart: missing root");K.style.padding="12px";Be.onReady((e)=>ft(e,document.documentElement));Be.onBlock(({args:e,answered:r})=>{let n=(e.values??"").split(",").map(Number).filter(Number.isFinite),E=Math.max(1,...n);K.replaceChildren();let g=document.createElement("div");g.textContent=e.title??"",g.style.font="600 13px var(--oc-font, system-ui)";let A=document.createElement("div");A.style.cssText="display:flex;align-items:flex-end;gap:6px;height:96px;margin-top:8px";for(let O of n){let M=document.createElement("div");M.style.cssText=`flex:1;height:${O/E*100}%;background:currentColor;opacity:.6;border-radius:3px 3px 0 0`,M.title=String(O),A.append(M)}K.append(g,A);let I=document.createElement("div");I.style.marginTop="10px",K.append(I),oe(I,{label:r??"Explain this",variant:"outline",size:"sm",disabled:r!==null,onClick:()=>{Be.answerBlock("Explain this chart")}})});new ResizeObserver(()=>{Be.setHeight(Math.ceil(K.getBoundingClientRect().height))}).observe(K);})();
