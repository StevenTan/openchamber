(()=>{var S="openchamber.sdk",E=1;var $e=`
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
`;var qe=128,Ke=65536;var fe=128;var ye=65536;var $t=/^[a-z][a-z0-9-]{0,39}$/;var Vt=(e)=>Object(e)===e&&!Array.isArray(e),je=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),Xt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Wt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,qt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!Vt(s)||!$t.test(s.id)||!Xt(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!je(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!je(s,["kind","id","label","value","options","disabled"]))return!1;if(!Wt(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let d=new Set;for(let _ of s.options){if(!Vt(_)||!je(_,["value","label"])||!Wt(_.value)||!Xt(_.label)||d.has(_.value))return!1;d.add(_.value)}if(!d.has(s.value))return!1}return!0};var Kt=["{id}","{segment}","{segments+}"];var ar=new Set(Kt);var jt=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var ur=new Set(jt);var he=20000000,ve=256;var ze=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,zt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var Jt=/^[A-Za-z0-9_-]{1,80}$/;var Qt=["left","right","top","bottom"];var Yt=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let d=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let _ of d)if(!Yt(_,r+1,s))return!1;return!0},Je=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Je);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Je)}return String(e)===e||Number.isFinite(e)},Qe=(e)=>{try{if(String(e.id)!==e.id||!Jt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Qt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Yt(e.data)||!Je(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var Ze=2000;var eo=["file","directory","other","missing"],et=(e)=>Boolean(e&&"sessionId"in e),tt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var to=/^[0-9a-f]{7,64}$/i,ot=(e)=>to.test(e),be=500,Ae=32000,oo=16000,ro=128,so=200,no=2000,io=16000,ao=80,lo=200,uo=16000;var co=2000;var rt=20000,Oe=1024,xe=2000000;var Ce=64000,ke=8000,st=4000;var nt=960000;var po=999,So=1e4,ce=500,Eo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],go=["stopped","starting","ready","failed"],Go=new Set(Eo),_o=(e)=>Go.has(e),To=(e)=>e&&_o(e)?e:"HOST_REJECTED",Z=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(Z);if(Object(e)===e)return Object.values(e).every(Z);return!1},mo=(e)=>Z(e)&&JSON.stringify(e).length<=uo,Zt=(e)=>e?.trim().slice(0,lo)??"",ee=(e)=>{let r=e.id.trim().slice(0,ro),s=e.title.trim().slice(0,so),d=e.url.trim().slice(0,no),_=e.text?.trim().slice(0,io),g=e.author?.trim().slice(0,ao),C=e.kind==="pull"?"pull":"issue",y={providerId:e.providerId.trim(),id:r,title:s||r,url:d,kind:C};if(_)y.text=_;if(g)y.author=g;if(C==="pull"){let k=Zt(e.branches?.head),U=Zt(e.branches?.base);if(k&&U)y.branches={head:k,base:U}}if(mo(e.data))y.data=e.data;return y},it=(e)=>{let r=ee(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},at=(e)=>{let r={text:e.text.trim().slice(0,oo)};if(e.send)r.send=!0;return r},lt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(po,Math.max(0,Math.round(e)))},ut=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(So,Math.max(0,Math.ceil(e)))};var te=(e)=>e.length>0&&e.length<=Oe&&!e.includes("\x00")&&!e.includes("\\");var Ie=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>co)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},Uo=new Set(go),ct=(e)=>Boolean(e&&"status"in e&&Uo.has(String(e.status))&&!("body"in e)),Pe=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),pt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),dt=(e)=>Boolean(e&&"written"in e&&e.written===!0),St=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),wo=new Set(eo),Et=(e)=>Boolean(e&&"kind"in e&&"size"in e&&wo.has(String(e.kind))&&Number.isFinite(e.size)),gt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),No=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),Lo=(e)=>Object(e)===e?e:null,Ye=(e)=>String(e)===e&&e.length>0,Do=(e)=>{if(!Ye(e.id))return null;if(e.ok===!0){let r={channel:S,v:E,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&Ye(e.error))return{channel:S,v:E,type:"result",id:e.id,ok:!1,error:e.error,code:To(Ye(e.code)?e.code:void 0)};return null},_t=(e)=>{let r=Lo(e);if(!r||r.channel!==S||r.v!==E)return null;if(r.type==="result")return Do(r);if(!No.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Ro=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Ho=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var fo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Me=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Oe} characters without NUL or backslash.`)),Ge=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},p=(e)=>(e.value+=1,`oc-${e.value}`),Tt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??((t)=>t===r.parent),d=e.requestTimeoutMs??rt,_=new Set,g=new Set,C=new Set,y=new Set,k=new Set,U=new Set,X=new Set,pe=new Set,de=new Set,Se=new Set,Ee=new Set,z=new Set,Fe=[],se=null,ne=null,ge=new Set,_e=new Set,ie=null,ae=null,Be=!1,J=new Map,Q=new Map,Y=new Map,H=!1,c={value:0},l=null,F=null,le=!1,ue=!1,It=null,Pt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},w=(t)=>{r.parent.postMessage(t,"*")},Mt=()=>{if(H||r.parent===r||z.size===0||l?.features?.lateGenerateResults!==!0)return;w({channel:S,v:E,type:"generate-late-listen"})},f=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},Gt=(t)=>{if(!(t instanceof MessageEvent))return;if(!s(t.source))return;let o=_t(t.data);if(!o)return;if(o.type==="workspace"){let a=Q.get(o.payload.subscriptionId);if(a)f([a],o.payload.snapshot);return}if(o.type==="shells"){let a=Y.get(o.payload.subscriptionId);if(a)f([a],o.payload.snapshot);return}if(o.type==="ready"){if(l=o.payload,F=Pt(o.payload.session),f(_,o.payload),f(g,o.payload.directory),f(C,o.payload.session),F)f(y,F);if(f(k,o.payload.connection),f(U,o.payload.settings),f(X,o.payload.item),o.payload.block)f(pe,o.payload.block);Mt();return}if(o.type==="service-event"){f(de,o.payload);return}if(o.type==="generate-late"){if(z.size===0)Fe.push(o.payload);else f(z,o.payload);return}if(o.type==="directory"){if(l)l={...l,directory:o.payload.directory};f(g,o.payload.directory);return}if(o.type==="session"){if(l)l={...l,session:o.payload.session};if(!o.payload.session)F=null;else if(F?.sessionId!==o.payload.session.id)F=Pt(o.payload.session);f(C,o.payload.session);return}if(o.type==="session-lifecycle"){F=o.payload,f(y,o.payload);return}if(o.type==="connection"){if(l)l={...l,connection:o.payload.connection};f(k,o.payload.connection);return}if(o.type==="settings"){if(l)l={...l,settings:o.payload.settings};f(U,o.payload.settings);return}if(o.type==="item"){if(l)l={...l,item:o.payload.item};f(X,o.payload.item);return}if(o.type==="status-control-event"){f(Se,o.payload);return}if(o.type==="popover-closed"){f(Ee,o.payload);return}if(o.type==="action"){let a=(T)=>{if(!H)w({channel:S,v:E,type:"action-result",id:o.id,payload:T})},m=ne;if(!m){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>m(o.payload)).then(()=>a({ok:!0}),(T)=>{let x=(T instanceof Error?T.message:String(T)).trim();a({ok:!1,error:(x||"Action failed.").slice(0,ce)})});return}if(o.type==="file-open"){let a=o.payload;if(ae&&zt(ae,a))return;ae=a,f(ge,o.payload);return}if(o.type==="file-saved"){f(_e,o.payload.version);return}if(o.type==="file-snapshot"){let a=(x)=>{if(!H)w({channel:S,v:E,type:"file-snapshot-result",id:o.id,payload:x})},m=(x)=>a({error:(x.trim()||"Could not read the edited file.").slice(0,ce)}),T=ie;if(!T){m("This extension does not edit files.");return}Promise.resolve().then(()=>T(o.payload.purpose)).then((x)=>{if(ze(x)>he){m(`The file is over ${he} ${"bytes"in x?"bytes":"characters"}.`);return}if(x.version.length>ve){m(`The snapshot version is over ${ve} characters.`);return}a({snapshot:"bytes"in x?{bytes:x.bytes,version:x.version}:{content:x.content,version:x.version}})},(x)=>m(x instanceof Error?x.message:String(x)));return}if(o.type==="resolve"){let a=(T)=>{w({channel:S,v:E,type:"resolve-result",id:o.id,payload:T})},m=se;if(!m){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>m(o.payload)).then((T)=>a({item:T?ee(T):null}),(T)=>{let x=(T instanceof Error?T.message:String(T)).trim();a({error:(x||"Command failed.").slice(0,ce)})});return}let i=J.get(o.id);if(!i)return;if(clearTimeout(i.timer),J.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new u(o.code,o.error))};r.addEventListener("message",Gt),w({channel:S,v:E,type:"hello"});let M=(t,o=d)=>{if(H||r.parent===r)return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let m=setTimeout(()=>{J.delete(t.id),a(new u("HOST_TIMEOUT","Host did not answer in time."))},o);J.set(t.id,{resolve:i,reject:a,timer:m}),w(t)})},b=(t)=>M(t).then(()=>{return}),O={channel:S,v:E},Ve=(t)=>{if(!H&&r.parent!==r)w(t)},Ut=()=>Ve({...O,type:"file-save"}),wt=(t)=>{if(!Ro(t)||!Ho(t))return;t.preventDefault(),Ut()},Nt=(t)=>{if(!Ro(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),Ft(l.popover.id,"escape").catch(()=>{return})},Te=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let o=le||ue;if(It===o)return;It=o,Bt(t.id,o).catch(()=>{return})},me=()=>{if(l?.surface!=="popover"||le)return;le=!0,Te()},Lt=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!le)return;le=!1,Te()},Dt=()=>{if(l?.surface!=="popover"||ue)return;ue=!0,Te()},Ht=()=>{if(l?.surface!=="popover"||!ue)return;ue=!1,Te()},D=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Xe=async(t)=>{if(t.kind!=="projects")D(t.projectId);let o=await M({...O,type:"workspace-read",id:p(c),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},We=async(t,o)=>{if(t.kind!=="projects")D(t.projectId);let i=p(c);Q.set(i,o);try{await b({...O,type:"workspace-subscribe",id:p(c),payload:{subscriptionId:i,query:t}})}catch(a){if(Q.delete(i),!H)w({...O,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:i}});throw a}return()=>{if(!Q.delete(i)||H)return;w({...O,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:i}})}},Po=async(t,o)=>{if(t.kind==="session")D(t.sessionId);if(t.kind==="project")D(t.projectId);let i=p(c);Y.set(i,o);try{await b({...O,type:"shells-subscribe",id:p(c),payload:{subscriptionId:i,scope:t}})}catch(a){if(Y.delete(i),!H)w({...O,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:i}});throw a}return()=>{if(!Y.delete(i)||H)return;w({...O,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:i}})}},Re=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>qe))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!Z(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Ke)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await M({...O,type:"storage",id:p(c),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Ft=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):b({...O,type:"popover-close",id:p(c),payload:o?{id:t,reason:o}:{id:t}}),Bt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):b({...O,type:"popover-anchor",id:p(c),payload:{id:t,active:o}});return r.addEventListener("keydown",Nt,!0),r.addEventListener("pointerover",me),r.addEventListener("pointermove",me),r.addEventListener("pointerout",Lt),r.addEventListener("focus",Dt),r.addEventListener("blur",Ht),{onAction:(t)=>(ne=t,()=>{if(ne===t)ne=null}),listProjects:async()=>{let t=await Xe({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Xe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Xe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>We({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>We({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>We({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Po(t,o),readShellOutput:async(t,o)=>{D(t,fe);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>ye))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${ye}.`);let T=await M({...O,type:"shell-output",id:p(c),payload:{shellId:t,cursor:i,tailBytes:a}});if(!T||typeof T.output!=="string"||!Number.isFinite(T.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return T},stopShell:async(t)=>{if(D(t,fe),(await M({...O,type:"shell-stop",id:p(c),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{D(t),await b({...O,type:"open-session",id:p(c),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Ge(o),a={op:"get",key:t};if(i)a.scope=i;let m=await Re(a);return m.op==="get"&&m.found?m.value:void 0},set:async(t,o,i)=>{let a=Ge(i),m={op:"set",key:t,value:o};if(a)m.scope=a;await Re(m)},delete:async(t,o)=>{let i=Ge(o),a={op:"delete",key:t};if(i)a.scope=i;await Re(a)},keys:async(t)=>{let o=Ge(t),i={op:"keys"};if(o)i.scope=o;let a=await Re(i);if(a.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(_.add(t),l)t(l);return()=>{_.delete(t)}},onDirectory:(t)=>{if(g.add(t),l)t(l.directory);return()=>{g.delete(t)}},onSession:(t)=>{if(C.add(t),l)t(l.session);return()=>{C.delete(t)}},onSessionLifecycle:(t)=>{if(y.add(t),F)t(F);return()=>{y.delete(t)}},onConnection:(t)=>{if(k.add(t),l)t(l.connection);return()=>{k.delete(t)}},onSettings:(t)=>{if(U.add(t),l)t(l.settings);return()=>{U.delete(t)}},onItem:(t)=>{if(X.add(t),l)t(l.item);return()=>{X.delete(t)}},onBlock:(t)=>{if(pe.add(t),l?.block)t(l.block);return()=>{pe.delete(t)}},onServiceEvent:(t)=>(de.add(t),()=>{de.delete(t)}),onStatusControl:(t)=>(Se.add(t),()=>{Se.delete(t)}),onPopoverClosed:(t)=>(Ee.add(t),()=>{Ee.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!qt(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return b({...O,type:"status-controls",id:p(c),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!Qe(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return b({...O,type:"popover-open",id:p(c),payload:t})},closePopover:Ft,setPopoverAnchorActive:Bt,onResolve:(t)=>(se=t,()=>{if(se===t)se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>be)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${be} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ae))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Ae} characters.`));return b({channel:S,v:E,type:"toast",id:p(c),payload:{...t,message:o}})},openUrl:(t)=>b({channel:S,v:E,type:"open-url",id:p(c),payload:{url:t}}),openCommit:(t)=>ot(t)?b({channel:S,v:E,type:"open-commit",id:p(c),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>b({channel:S,v:E,type:"block-answer",id:p(c),payload:{text:t.trim().slice(0,Ze)}}),openSurface:(t)=>b({channel:S,v:E,type:"open-surface",id:p(c),payload:{surfaceId:t}}),writeClipboard:(t)=>b({channel:S,v:E,type:"clipboard-write",id:p(c),payload:{text:t}}),compose:(t)=>b({channel:S,v:E,type:"compose",id:p(c),payload:t}),attach:(t)=>b({channel:S,v:E,type:"attach",id:p(c),payload:ee(t)}),startSession:async(t)=>{if(t.projectId!==void 0)D(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")D(o.directory);else{if(o.name!==void 0)D(o.name,200);if(o.baseBranch!==void 0)D(o.baseBranch,200)}let i=await M({channel:S,v:E,type:"start-session",id:p(c),payload:it(t)},e.requestTimeoutMs??180000);if(!et(i))throw new u("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>M({channel:S,v:E,type:"prompt",id:p(c),payload:at(t)}).then((o)=>{if(!tt(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>b({channel:S,v:E,type:"session-link",id:p(c),payload:ee(t)}),close:()=>b({channel:S,v:E,type:"close",id:p(c)}),oauthStart:()=>b({channel:S,v:E,type:"oauth-start",id:p(c)}),oauthDisconnect:()=>b({channel:S,v:E,type:"oauth-disconnect",id:p(c)}),request:(t)=>(Ie(t.path)?M({channel:S,v:E,type:"request",id:p(c),payload:t}):fo()).then((o)=>{if(!Pe(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ie(t.path)?M({channel:S,v:E,type:"service-request",id:p(c),payload:t}):fo()).then((o)=>{if(!Pe(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>M({channel:S,v:E,type:"service-status",id:p(c)}).then((t)=>{if(!ct(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(te(t)?M({channel:S,v:E,type:"file-read",id:p(c),payload:{path:t}}):Me()).then((o)=>{if(!pt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!te(t))return Me();if(o.length>xe)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${xe} characters.`));return M({channel:S,v:E,type:"file-write",id:p(c),payload:{path:t,content:o}}).then((i)=>{if(!dt(i))throw new u("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(te(t)?M({channel:S,v:E,type:"file-list",id:p(c),payload:{path:t}}):Me()).then((o)=>{if(!St(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(te(t)?M({channel:S,v:E,type:"file-stat",id:p(c),payload:{path:t}}):Me()).then((o)=>{if(!Et(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Ce)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${Ce} characters.`));if(i!==void 0&&(i.length===0||i.length>ke))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${ke} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(st,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let m={prompt:o};if(i!==void 0)m.system=i;if(a!==void 0)m.maxOutputTokens=a;return M({channel:S,v:E,type:"generate",id:p(c),payload:m},e.requestTimeoutMs??nt).then((T)=>{if(!gt(T))throw new u("HOST_REJECTED","Host did not return generated text.");return T})},onLateGenerateResult:(t)=>{z.add(t);for(let o of Fe.splice(0))f([t],o);return Mt(),()=>{z.delete(t)}},setBadge:(t)=>b({channel:S,v:E,type:"badge",id:p(c),payload:{count:lt(t)}}),setHeight:(t)=>b({channel:S,v:E,type:"resize",id:p(c),payload:{height:ut(t)}}),onFileOpen:(t)=>{if(ge.add(t),!Be)Be=!0,r.addEventListener("keydown",wt,!0);if(ae)t(ae);return()=>{ge.delete(t)}},onFileSnapshot:(t)=>(ie=t,()=>{if(ie===t)ie=null}),onFileSaved:(t)=>(_e.add(t),()=>{_e.delete(t)}),reportFileChange:(t)=>Ve({...O,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Ut,reportFileUnsupported:()=>Ve({...O,type:"file-unsupported"}),dispose:()=>{for(let t of Q.keys())w({...O,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:t}});Q.clear();for(let t of Y.keys())w({...O,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:t}});if(Y.clear(),H=!0,se=null,ne=null,ie=null,ge.clear(),_e.clear(),Be)r.removeEventListener("keydown",wt,!0);r.removeEventListener("message",Gt),r.removeEventListener("keydown",Nt,!0),r.removeEventListener("pointerover",me),r.removeEventListener("pointermove",me),r.removeEventListener("pointerout",Lt),r.removeEventListener("focus",Dt),r.removeEventListener("blur",Ht);for(let t of J.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));J.clear(),_.clear(),g.clear(),C.clear(),y.clear(),k.clear(),U.clear(),X.clear(),pe.clear(),de.clear(),Se.clear(),Ee.clear(),z.clear(),Fe.length=0}}};var yo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Ar=new Set(yo);var ho=["none","agent","user"];var xr=new Set(ho);var Fo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Bo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],vo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,d]of Fo)r.style.setProperty(s,e.tokens[d]);for(let[s,d,_]of Bo){let g=e.tokens[_]??"";r.style.setProperty(s,g),r.style.setProperty(d,g)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},mt=(e,r)=>{if(vo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Vo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},R=(e,r)=>`var(--${e}, var(--oc-${Vo[e]}, ${r}))`,V=R("surface-background","transparent"),we=R("surface-elevated","transparent"),oe=R("surface-elevated-foreground","inherit"),N=R("surface-foreground","inherit"),h=R("surface-muted-foreground","gray"),Xo=R("surface-muted","transparent"),q=R("interactive-border","currentColor"),G=R("interactive-hover","transparent"),K=R("interactive-active","transparent"),Rt=R("interactive-selection","transparent"),ft=R("interactive-selection-foreground","inherit"),B=R("primary","currentColor"),yt=R("primary-text","inherit"),ht=R("error-text","inherit"),Wo=R("font-sans","inherit"),vt=R("font-mono","monospace"),xo=R("radius","9px"),bt=`calc(${xo} - 2px)`,bo=`calc(${xo} - 4px)`,v=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Ao=`background-image: linear-gradient(${G}, ${G});`,At=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Ot="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Oo="box-shadow: var(--oc-sdk-lit);",xt=`inset 0 0.5px 0 0 ${v(N,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,$o=`
:root {
  --oc-sdk-edge: ${v(N,16)};
  --oc-sdk-field-bg: ${we};
  --oc-sdk-raised-bg: ${V};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${v(N,14)};
  --oc-sdk-field-bg: ${v(V,50,we)};
  --oc-sdk-raised-bg: ${we};
  --oc-sdk-field-lift: ${xt};
  --oc-sdk-raised-lift: ${xt};
  --oc-sdk-lit: ${xt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ue=(e)=>{let r=R(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${R(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,qo=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${n(8)}; min-height: ${n(32)}; padding: .25em ${n(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1.45; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${n(6)}; min-height: ${n(28)}; padding: .25em ${n(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${n(4)}; min-height: ${n(24)}; padding: .25em ${n(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${n(14)}; height: ${n(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: auto; min-height: ${n(32)}; padding: .25em ${n(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${n(8)} ${n(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${n(34)}; padding-right: ${n(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${n(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${n(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${n(24)}; height: ${n(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${n(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; min-height: ${n(28)}; padding: .25em ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${n(2)}; min-width: ${n(160)}; max-width: calc(100vw - ${n(16)}); max-height: min(${n(320)}, calc(100vh - ${n(16)})); overflow: auto; padding: ${n(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${n(2)} ${n(2)} ${n(4)}; }
.oc-sdk-popup-search .oc-sdk-input { min-height: ${n(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${n(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${n(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${n(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${n(14)}; height: ${n(14)}; margin-top: ${n(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${n(36)}; height: ${n(20)}; --oc-sdk-thumb-travel: ${n(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${n(2)}; left: ${n(2)}; width: ${n(16)}; height: ${n(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${n(2)}; padding: ${n(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${n(6)}; min-height: ${n(28)}; padding: .125em ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${n(1)} ${n(6)}; font-size: ${n(11)}; font-weight: 500; line-height: ${n(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${n(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${n(16)} ${n(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${n(4)}; padding: ${n(40)} ${n(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${n(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${n(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${n(16)}; height: ${n(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${n(12)}; height: ${n(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${n(12)}; padding: ${n(8)} ${n(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${n(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${n(8)}; width: 100%; margin: ${n(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${n(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${n(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${n(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${n(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { min-height: ${n(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { min-height: ${n(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${n(36)}; height: ${n(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${n(44)}; }
  .oc-sdk-check { min-height: ${n(36)}; padding: ${n(8)} 0; }
}
`,Co=`${$o}
.oc-sdk { color: ${N}; font-family: ${Wo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ao} }
.oc-sdk-mono { font-family: ${vt}; }
.oc-sdk-muted { color: ${h}; }
${Ue("success")}${Ue("warning")}${Ue("error")}${Ue("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${B}; --oc-sdk-tone-text: ${yt}; }

.oc-sdk-btn { border-radius: ${bt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${bo}; }
.oc-sdk-btn[data-variant="default"] { color: ${yt}; background: ${v(B,10,V)}; border-color: ${v(B,12)}; ${Oo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${v(B,16,V)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${v(B,22,V)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Xo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${oe}; ${Ot} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${K}, ${K}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${G}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${K}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${R("status-error","red")}; color: ${ht}; background: ${v("var(--oc-sdk-tone)",7,V)}; border-color: ${v("var(--oc-sdk-tone)",12)}; ${Oo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${v("var(--oc-sdk-tone)",9,V)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${v("var(--oc-sdk-tone)",11,V)}; box-shadow: none; }

.oc-sdk-field-note { color: ${h}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${ht}; }
.oc-sdk-input { border-radius: ${bt}; background: var(--oc-sdk-field-bg); color: ${oe}; ${At("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${h}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${At(v(N,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${At(R("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${vt}; }

.oc-sdk-search-icon { color: ${h}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${B}; }
.oc-sdk-search-clear { border-radius: ${bo}; color: ${h}; }
.oc-sdk-search-clear:hover { background: ${G}; color: ${N}; }

.oc-sdk-trigger { border-radius: ${bt}; background: var(--oc-sdk-raised-bg); color: ${oe}; ${Ot} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${h}; }
.oc-sdk-trigger-chevron { color: ${h}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${oe}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${we}; background-clip: padding-box; color: ${oe}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${G}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Rt}; color: ${ft}; }
.oc-sdk-option-check { color: ${N}; }
.oc-sdk-option[data-destructive="true"] { color: ${ht}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${v(R("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${h}; }
.oc-sdk-popup-empty { color: ${h}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${q}; border-radius: 4px; color: ${N}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${v(N,60,q)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${q}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${V}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${B}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ao} }
.oc-sdk-check-desc { color: ${h}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${v(N,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${h}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${N}; }
.oc-sdk-tab[aria-selected="true"] { color: ${ft}; background: ${Rt}; border-color: ${q}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${oe}; background: var(--oc-sdk-raised-bg); ${Ot} }
.oc-sdk-tab-count { color: ${h}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${v(N,6)}; color: ${h}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${v("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${G}; }
.oc-sdk-row[aria-selected="true"] { background: ${Rt}; color: ${ft}; }
.oc-sdk-row-lead { font-family: ${vt}; color: ${h}; }
.oc-sdk-row-sub { color: ${h}; }
.oc-sdk-row-meta { color: ${h}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${h}; }

.oc-sdk-empty-body { color: ${h}; }

.oc-sdk-spinner { color: ${h}; }
.oc-sdk-spinner-ring { border-color: ${q}; border-top-color: ${B}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${v("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${h}; }

.oc-sdk-separator { color: ${h}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${v(q,40)}; }

.oc-sdk-progress-label { color: ${h}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${v(N,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${B}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${R("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${R("success-text","inherit")}; }

.oc-sdk-text a { color: ${yt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${v(q,60)}; }
`,I=`
${$e}
${qo}
${Co}`;var P=(e)=>{let r=document.getElementById("oc-sdk-ui-style");if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}let s=document.createElement("style");s.id="oc-sdk-ui-style",s.textContent=e,document.head.appendChild(s)},A=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},W=(e)=>{let r=A("button",e);return r.type="button",r},L=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s},j=(e,r,s)=>{if(s===void 0||s===null||s==="")e.removeAttribute(r);else if(e.getAttribute(r)!==s)e.setAttribute(r,s)};var Ko=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},re=(e,r)=>{P(I);let s=r,d=W("oc-sdk oc-sdk-btn"),_=Ko(),g=document.createElement("span");d.append(g),e.append(d);let C=()=>{if(d.dataset.variant=s.variant??"default",d.dataset.size=s.size??"default",d.disabled=Boolean(s.disabled)||Boolean(s.loading),d.dataset.loading=s.loading?"true":"false",d.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&_.parentNode!==d)d.prepend(_);else if(!s.loading&&_.parentNode===d)_.remove();L(g,s.label)},y=()=>{if(s.disabled||s.loading)return;s.onClick()};return d.addEventListener("click",y),C(),{update:(k)=>{s={...s,...k},C()},dispose:()=>{d.removeEventListener("click",y),d.remove()}}};var Ct=(e,r)=>{P(I);let s=r,d=A("label","oc-sdk oc-sdk-field"),_=A("span","oc-sdk-field-label"),g=s.multiline?A("textarea","oc-sdk-input"):A("input","oc-sdk-input"),C=A("span","oc-sdk-field-note");d.append(_,g,C),e.append(d);let y=()=>{if(L(_,s.label),_.hidden=!s.label,g instanceof HTMLInputElement)g.type=s.password?"password":"text";else g.rows=s.rows??3;if(g.value!==s.value)g.value=s.value;g.disabled=Boolean(s.disabled),j(g,"placeholder",s.placeholder),g.dataset.mono=s.mono?"true":"false";let U=Boolean(s.error);d.dataset.invalid=U?"true":"false",g.setAttribute("aria-invalid",U?"true":"false");let X=s.error??s.helper??"";L(C,X),C.hidden=X===""},k=()=>{s.onChange(g.value)};return g.addEventListener("input",k),y(),{update:(U)=>{s={...s,...U},y()},dispose:()=>{g.removeEventListener("input",k),d.remove()}}};var kt=Tt(),Io=document.querySelector("#root");if(!Io)throw Error("Missing root");var ko=!1;kt.onReady((e)=>{if(mt(e,document.documentElement),ko)return;ko=!0;let r=document.createElement("div");r.style.cssText="display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;",Io.append(r);let s="",d=document.createElement("div");d.style.flex="1",r.append(d);let _=Ct(d,{value:s,placeholder:"https://example.com",mono:!0,onChange:(y)=>{s=y,_.update({value:y})}}),g=re(r,{label:"Go",size:"sm",onClick:()=>{if(!s.trim())return;g.update({loading:!0}),kt.serviceRequest({method:"POST",path:"/navigate",body:JSON.stringify({url:s.trim()})}).then(()=>C()).finally(()=>g.update({loading:!1}))}}),C=async()=>{try{let y=await kt.serviceRequest({method:"GET",path:"/state"}),k=JSON.parse(y.body);if(String(k.url)===k.url&&k.url!==s)s=k.url==="about:blank"?"":k.url,_.update({value:s})}catch{}};C(),setInterval(()=>{C()},2000)});})();
