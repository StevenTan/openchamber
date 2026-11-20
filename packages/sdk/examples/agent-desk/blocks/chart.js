(()=>{var S="openchamber.sdk",E=1;var Qe=`
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
`;var Ye=128,Ze=65536;var be=128;var Ae=65536;var et=8000,tt=192000,ot=120000;var zt=(e)=>{let r=[],n=0,d=0;return{push:(g)=>{r.push(g),d+=g.length;while(d-n>e&&r.length>1){let m=r.shift();d-=m?.length??0,n=0}},pull:(g)=>{let m=0;while(m<g.length&&r.length>0){let x=r[0],A=Math.min(g.length-m,x.length-n);if(g.set(x.subarray(n,n+A),m),m+=A,n+=A,n>=x.length)r.shift(),d-=x.length,n=0}g.fill(0,m)},clear:()=>{r.length=0,n=0,d=0},get size(){return d-n}}};var Zt=/^[a-z][a-z0-9-]{0,39}$/;var Jt=(e)=>Object(e)===e&&!Array.isArray(e),rt=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),Qt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Yt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,eo=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!Jt(n)||!Zt.test(n.id)||!Qt(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!rt(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!rt(n,["kind","id","label","value","options","disabled"]))return!1;if(!Yt(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let d=new Set;for(let g of n.options){if(!Jt(g)||!rt(g,["value","label"])||!Yt(g.value)||!Qt(g.label)||d.has(g.value))return!1;d.add(g.value)}if(!d.has(n.value))return!1}return!0};var to=["{id}","{segment}","{segments+}"];var gr=new Set(to);var oo=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Tr=new Set(oo);var Oe=20000000,xe=256;var st=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,ro=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var so=/^[A-Za-z0-9_-]{1,80}$/;var no=["left","right","top","bottom"];var io=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let d=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let g of d)if(!io(g,r+1,n))return!1;return!0},nt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(nt);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(nt)}return String(e)===e||Number.isFinite(e)},it=(e)=>{try{if(String(e.id)!==e.id||!so.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!no.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!io(e.data)||!nt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var lt=2000;var lo=["file","directory","other","missing"],ut=(e)=>Boolean(e&&"sessionId"in e),ct=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var uo=/^[0-9a-f]{7,64}$/i,pt=(e)=>uo.test(e),Ce=500,ke=32000,co=16000,po=128,So=200,Eo=2000,go=16000,_o=80,To=200,mo=16000;var Ro=2000;var dt=20000,Ie=1024,Pe=2000000;var Me=64000,Ge=8000,St=4000;var Et=960000;var fo=999,yo=1e4,Se=500,ho=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],vo=["stopped","starting","ready","failed"],Fo=new Set(ho),bo=(e)=>Fo.has(e),Ao=(e)=>e&&bo(e)?e:"HOST_REJECTED",te=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(te);if(Object(e)===e)return Object.values(e).every(te);return!1},Oo=(e)=>te(e)&&JSON.stringify(e).length<=mo,ao=(e)=>e?.trim().slice(0,To)??"",oe=(e)=>{let r=e.id.trim().slice(0,po),n=e.title.trim().slice(0,So),d=e.url.trim().slice(0,Eo),g=e.text?.trim().slice(0,go),m=e.author?.trim().slice(0,_o),x=e.kind==="pull"?"pull":"issue",A={providerId:e.providerId.trim(),id:r,title:n||r,url:d,kind:x};if(g)A.text=g;if(m)A.author=m;if(x==="pull"){let M=ao(e.branches?.head),W=ao(e.branches?.base);if(M&&W)A.branches={head:M,base:W}}if(Oo(e.data))A.data=e.data;return A},gt=(e)=>{let r=oe(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},_t=(e)=>{let r={text:e.text.trim().slice(0,co)};if(e.send)r.send=!0;return r},Tt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(fo,Math.max(0,Math.round(e)))},mt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(yo,Math.max(0,Math.ceil(e)))};var re=(e)=>e.length>0&&e.length<=Ie&&!e.includes("\x00")&&!e.includes("\\");var Ue=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Ro)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Bo=new Set(vo),Rt=(e)=>Boolean(e&&"status"in e&&Bo.has(String(e.status))&&!("body"in e)),we=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),ft=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),yt=(e)=>Boolean(e&&"written"in e&&e.written===!0),ht=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Vo=new Set(lo),vt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Vo.has(String(e.kind))&&Number.isFinite(e.size)),bt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Xo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),Wo=(e)=>Object(e)===e?e:null,at=(e)=>String(e)===e&&e.length>0,$o=(e)=>{if(!at(e.id))return null;if(e.ok===!0){let r={channel:S,v:E,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&at(e.error))return{channel:S,v:E,type:"result",id:e.id,ok:!1,error:e.error,code:Ao(at(e.code)?e.code:void 0)};return null},At=(e)=>{let r=Wo(e);if(!r||r.channel!==S||r.v!==E)return null;if(r.type==="result")return $o(r);if(!Xo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var xo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),qo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Co=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ne=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Ie} characters without NUL or backslash.`)),Le=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},p=(e)=>(e.value+=1,`oc-${e.value}`),Ot=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??((t)=>t===r.parent),d=e.requestTimeoutMs??dt,g=new Set,m=new Set,x=new Set,A=new Set,M=new Set,W=new Set,ie=new Set,ge=new Set,_e=new Set,Te=new Set,me=new Set,J=new Set,$e=[],ae=null,le=null,Re=new Set,fe=new Set,ue=null,ce=null,qe=!1,Q=new Map,Y=new Map,Z=new Map,D=!1,c={value:0},u=null,B=null,pe=!1,de=!1,Lt=null,w=null,Dt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},G=(t)=>{r.parent.postMessage(t,"*")},Ht=()=>{if(D||r.parent===r||J.size===0||u?.features?.lateGenerateResults!==!0)return;G({channel:S,v:E,type:"generate-late-listen"})},R=(t,o)=>{for(let a of t)try{a(o)}catch(i){console.error(i)}},Ft=(t)=>{if(!(t instanceof MessageEvent))return;if(!n(t.source))return;let o=At(t.data);if(!o)return;if(o.type==="workspace"){let i=Y.get(o.payload.subscriptionId);if(i)R([i],o.payload.snapshot);return}if(o.type==="shells"){let i=Z.get(o.payload.subscriptionId);if(i)R([i],o.payload.snapshot);return}if(o.type==="microphone-audio"){w?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let i=w;if(!i)return;w=null,i.release(),R(i.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(u=o.payload,B=Dt(o.payload.session),R(g,o.payload),R(m,o.payload.directory),R(x,o.payload.session),B)R(A,B);if(R(M,o.payload.connection),R(W,o.payload.settings),R(ie,o.payload.item),o.payload.block)R(ge,o.payload.block);Ht();return}if(o.type==="service-event"){R(_e,o.payload);return}if(o.type==="generate-late"){if(J.size===0)$e.push(o.payload);else R(J,o.payload);return}if(o.type==="directory"){if(u)u={...u,directory:o.payload.directory};R(m,o.payload.directory);return}if(o.type==="session"){if(u)u={...u,session:o.payload.session};if(!o.payload.session)B=null;else if(B?.sessionId!==o.payload.session.id)B=Dt(o.payload.session);R(x,o.payload.session);return}if(o.type==="session-lifecycle"){B=o.payload,R(A,o.payload);return}if(o.type==="connection"){if(u)u={...u,connection:o.payload.connection};R(M,o.payload.connection);return}if(o.type==="settings"){if(u)u={...u,settings:o.payload.settings};R(W,o.payload.settings);return}if(o.type==="item"){if(u)u={...u,item:o.payload.item};R(ie,o.payload.item);return}if(o.type==="status-control-event"){R(Te,o.payload);return}if(o.type==="popover-closed"){R(me,o.payload);return}if(o.type==="action"){let i=(T)=>{if(!D)G({channel:S,v:E,type:"action-result",id:o.id,payload:T})},_=le;if(!_){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>_(o.payload)).then(()=>i({ok:!0}),(T)=>{let f=(T instanceof Error?T.message:String(T)).trim();i({ok:!1,error:(f||"Action failed.").slice(0,Se)})});return}if(o.type==="file-open"){let i=o.payload;if(ce&&ro(ce,i))return;ce=i,R(Re,o.payload);return}if(o.type==="file-saved"){R(fe,o.payload.version);return}if(o.type==="file-snapshot"){let i=(f)=>{if(!D)G({channel:S,v:E,type:"file-snapshot-result",id:o.id,payload:f})},_=(f)=>i({error:(f.trim()||"Could not read the edited file.").slice(0,Se)}),T=ue;if(!T){_("This extension does not edit files.");return}Promise.resolve().then(()=>T(o.payload.purpose)).then((f)=>{if(st(f)>Oe){_(`The file is over ${Oe} ${"bytes"in f?"bytes":"characters"}.`);return}if(f.version.length>xe){_(`The snapshot version is over ${xe} characters.`);return}i({snapshot:"bytes"in f?{bytes:f.bytes,version:f.version}:{content:f.content,version:f.version}})},(f)=>_(f instanceof Error?f.message:String(f)));return}if(o.type==="resolve"){let i=(T)=>{G({channel:S,v:E,type:"resolve-result",id:o.id,payload:T})},_=ae;if(!_){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>_(o.payload)).then((T)=>i({item:T?oe(T):null}),(T)=>{let f=(T instanceof Error?T.message:String(T)).trim();i({error:(f||"Command failed.").slice(0,Se)})});return}let a=Q.get(o.id);if(!a)return;if(clearTimeout(a.timer),Q.delete(o.id),o.ok){a.resolve(o.payload);return}a.reject(new l(o.code,o.error))};r.addEventListener("message",Ft),G({channel:S,v:E,type:"hello"});let C=(t,o=d)=>{if(D||r.parent===r)return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((a,i)=>{let _=setTimeout(()=>{Q.delete(t.id),i(new l("HOST_TIMEOUT","Host did not answer in time."))},o);Q.set(t.id,{resolve:a,reject:i,timer:_}),G(t)})},O=(t)=>C(t).then(()=>{return}),h={channel:S,v:E},Ke=(t)=>{if(!D&&r.parent!==r)G(t)},Bt=()=>Ke({...h,type:"file-save"}),je=()=>{if(!D&&r.parent!==r)G({...h,type:"microphone-close",id:p(c)})},Lo=async()=>{if(w)throw new l("HOST_REJECTED","The microphone is already open in this frame.");if(u?.features?.microphone!==!0)throw new l("UNSUPPORTED","This OpenChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new l("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<et||o.sampleRate>tt)throw o.close().catch(()=>{return}),new l("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let a=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,i=zt(Math.round(o.sampleRate/4)),_=o.createScriptProcessor(1024,1,1);_.onaudioprocess=(L)=>i.pull(L.outputBuffer.getChannelData(0));let T=o.createMediaStreamDestination();_.connect(T);let f=new Set,ee={queue:i,endedListeners:f,release:()=>{_.onaudioprocess=null,_.disconnect(),i.clear();for(let L of T.stream.getTracks())L.stop();o.close().catch(()=>{return})}};w=ee;try{let L=await C({...h,type:"microphone-open",id:p(c),payload:{sampleRate:o.sampleRate}},ot);if(!L||!("opened"in L)||L.opened!==!0)throw new l("HOST_REJECTED","Host did not open the microphone.");if(await a,w!==ee)throw new l("DISCONNECTED","The microphone closed while it was opening.")}catch(L){if(w===ee)w=null;throw ee.release(),je(),L}return{stream:T.stream,close:()=>{if(w!==ee)return;w=null,ee.release(),je()},onEnded:(L)=>(f.add(L),()=>{f.delete(L)})}},Vt=(t)=>{if(!xo(t)||!qo(t))return;t.preventDefault(),Bt()},Xt=(t)=>{if(!xo(t)||t.key!=="Escape"||u?.surface!=="popover"||!u.popover)return;t.preventDefault(),Kt(u.popover.id,"escape").catch(()=>{return})},ye=()=>{let t=u?.surface==="popover"?u.popover:void 0;if(!t)return;let o=pe||de;if(Lt===o)return;Lt=o,jt(t.id,o).catch(()=>{return})},he=()=>{if(u?.surface!=="popover"||pe)return;pe=!0,ye()},Wt=(t)=>{if(u?.surface!=="popover"||t.relatedTarget!==null||!pe)return;pe=!1,ye()},$t=()=>{if(u?.surface!=="popover"||de)return;de=!0,ye()},qt=()=>{if(u?.surface!=="popover"||!de)return;de=!1,ye()},H=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},ze=async(t)=>{if(t.kind!=="projects")H(t.projectId);let o=await C({...h,type:"workspace-read",id:p(c),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},Je=async(t,o)=>{if(t.kind!=="projects")H(t.projectId);let a=p(c);Y.set(a,o);try{await O({...h,type:"workspace-subscribe",id:p(c),payload:{subscriptionId:a,query:t}})}catch(i){if(Y.delete(a),!D)G({...h,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:a}});throw i}return()=>{if(!Y.delete(a)||D)return;G({...h,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:a}})}},Do=async(t,o)=>{if(t.kind==="session")H(t.sessionId);if(t.kind==="project")H(t.projectId);let a=p(c);Z.set(a,o);try{await O({...h,type:"shells-subscribe",id:p(c),payload:{subscriptionId:a,scope:t}})}catch(i){if(Z.delete(a),!D)G({...h,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:a}});throw i}return()=>{if(!Z.delete(a)||D)return;G({...h,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:a}})}},ve=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>Ye))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!te(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Ze)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&u?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await C({...h,type:"storage",id:p(c),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},Kt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):O({...h,type:"popover-close",id:p(c),payload:o?{id:t,reason:o}:{id:t}}),jt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):O({...h,type:"popover-anchor",id:p(c),payload:{id:t,active:o}});return r.addEventListener("keydown",Xt,!0),r.addEventListener("pointerover",he),r.addEventListener("pointermove",he),r.addEventListener("pointerout",Wt),r.addEventListener("focus",$t),r.addEventListener("blur",qt),{onAction:(t)=>(le=t,()=>{if(le===t)le=null}),listProjects:async()=>{let t=await ze({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await ze({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await ze({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Je({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Je({kind:"worktrees",projectId:t},(a)=>{if(a.kind==="worktrees")o(a)}),onSessions:(t,o)=>Je({kind:"sessions",projectId:t},(a)=>{if(a.kind==="sessions")o(a)}),onRunningShells:(t,o)=>Do(t,o),readShellOutput:async(t,o)=>{H(t,be);let a=o?.cursor;if(a!==void 0&&(!Number.isInteger(a)||a<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>Ae))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ae}.`);let T=await C({...h,type:"shell-output",id:p(c),payload:{shellId:t,cursor:a,tailBytes:i}});if(!T||typeof T.output!=="string"||!Number.isFinite(T.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return T},stopShell:async(t)=>{if(H(t,be),(await C({...h,type:"shell-stop",id:p(c),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{H(t),await O({...h,type:"open-session",id:p(c),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let a=Le(o),i={op:"get",key:t};if(a)i.scope=a;let _=await ve(i);return _.op==="get"&&_.found?_.value:void 0},set:async(t,o,a)=>{let i=Le(a),_={op:"set",key:t,value:o};if(i)_.scope=i;await ve(_)},delete:async(t,o)=>{let a=Le(o),i={op:"delete",key:t};if(a)i.scope=a;await ve(i)},keys:async(t)=>{let o=Le(t),a={op:"keys"};if(o)a.scope=o;let i=await ve(a);if(i.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(g.add(t),u)t(u);return()=>{g.delete(t)}},onDirectory:(t)=>{if(m.add(t),u)t(u.directory);return()=>{m.delete(t)}},onSession:(t)=>{if(x.add(t),u)t(u.session);return()=>{x.delete(t)}},onSessionLifecycle:(t)=>{if(A.add(t),B)t(B);return()=>{A.delete(t)}},onConnection:(t)=>{if(M.add(t),u)t(u.connection);return()=>{M.delete(t)}},onSettings:(t)=>{if(W.add(t),u)t(u.settings);return()=>{W.delete(t)}},onItem:(t)=>{if(ie.add(t),u)t(u.item);return()=>{ie.delete(t)}},onBlock:(t)=>{if(ge.add(t),u?.block)t(u.block);return()=>{ge.delete(t)}},onServiceEvent:(t)=>(_e.add(t),()=>{_e.delete(t)}),onStatusControl:(t)=>(Te.add(t),()=>{Te.delete(t)}),onPopoverClosed:(t)=>(me.add(t),()=>{me.delete(t)}),setStatusControls:(t)=>{if(u?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!eo(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return O({...h,type:"status-controls",id:p(c),payload:{controls:t}})},openPopover:(t)=>{if(u?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!it(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return O({...h,type:"popover-open",id:p(c),payload:t})},closePopover:Kt,setPopoverAnchorActive:jt,onResolve:(t)=>(ae=t,()=>{if(ae===t)ae=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ce)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Ce} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>ke))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${ke} characters.`));return O({channel:S,v:E,type:"toast",id:p(c),payload:{...t,message:o}})},openUrl:(t)=>O({channel:S,v:E,type:"open-url",id:p(c),payload:{url:t}}),openCommit:(t)=>pt(t)?O({channel:S,v:E,type:"open-commit",id:p(c),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>O({channel:S,v:E,type:"block-answer",id:p(c),payload:{text:t.trim().slice(0,lt)}}),openSurface:(t)=>O({channel:S,v:E,type:"open-surface",id:p(c),payload:{surfaceId:t}}),writeClipboard:(t)=>O({channel:S,v:E,type:"clipboard-write",id:p(c),payload:{text:t}}),compose:(t)=>O({channel:S,v:E,type:"compose",id:p(c),payload:t}),attach:(t)=>O({channel:S,v:E,type:"attach",id:p(c),payload:oe(t)}),startSession:async(t)=>{if(t.projectId!==void 0)H(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")H(o.directory);else{if(o.name!==void 0)H(o.name,200);if(o.baseBranch!==void 0)H(o.baseBranch,200)}let a=await C({channel:S,v:E,type:"start-session",id:p(c),payload:gt(t)},e.requestTimeoutMs??180000);if(!ut(a))throw new l("HOST_REJECTED","Host did not return a session.");return a},prompt:(t)=>C({channel:S,v:E,type:"prompt",id:p(c),payload:_t(t)}).then((o)=>{if(!ct(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>O({channel:S,v:E,type:"session-link",id:p(c),payload:oe(t)}),close:()=>O({channel:S,v:E,type:"close",id:p(c)}),oauthStart:()=>O({channel:S,v:E,type:"oauth-start",id:p(c)}),oauthDisconnect:()=>O({channel:S,v:E,type:"oauth-disconnect",id:p(c)}),request:(t)=>(Ue(t.path)?C({channel:S,v:E,type:"request",id:p(c),payload:t}):Co()).then((o)=>{if(!we(o))throw new l("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ue(t.path)?C({channel:S,v:E,type:"service-request",id:p(c),payload:t}):Co()).then((o)=>{if(!we(o))throw new l("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>C({channel:S,v:E,type:"service-status",id:p(c)}).then((t)=>{if(!Rt(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(re(t)?C({channel:S,v:E,type:"file-read",id:p(c),payload:{path:t}}):Ne()).then((o)=>{if(!ft(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!re(t))return Ne();if(o.length>Pe)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${Pe} characters.`));return C({channel:S,v:E,type:"file-write",id:p(c),payload:{path:t,content:o}}).then((a)=>{if(!yt(a))throw new l("HOST_REJECTED","Host did not confirm the write.");return a})},listDir:(t)=>(re(t)?C({channel:S,v:E,type:"file-list",id:p(c),payload:{path:t}}):Ne()).then((o)=>{if(!ht(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(re(t)?C({channel:S,v:E,type:"file-stat",id:p(c),payload:{path:t}}):Ne()).then((o)=>{if(!vt(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),a=t.system?.trim();if(o.length===0||o.length>Me)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${Me} characters.`));if(a!==void 0&&(a.length===0||a.length>Ge))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${Ge} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(St,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let _={prompt:o};if(a!==void 0)_.system=a;if(i!==void 0)_.maxOutputTokens=i;return C({channel:S,v:E,type:"generate",id:p(c),payload:_},e.requestTimeoutMs??Et).then((T)=>{if(!bt(T))throw new l("HOST_REJECTED","Host did not return generated text.");return T})},onLateGenerateResult:(t)=>{J.add(t);for(let o of $e.splice(0))R([t],o);return Ht(),()=>{J.delete(t)}},openMicrophone:Lo,setBadge:(t)=>O({channel:S,v:E,type:"badge",id:p(c),payload:{count:Tt(t)}}),setHeight:(t)=>O({channel:S,v:E,type:"resize",id:p(c),payload:{height:mt(t)}}),onFileOpen:(t)=>{if(Re.add(t),!qe)qe=!0,r.addEventListener("keydown",Vt,!0);if(ce)t(ce);return()=>{Re.delete(t)}},onFileSnapshot:(t)=>(ue=t,()=>{if(ue===t)ue=null}),onFileSaved:(t)=>(fe.add(t),()=>{fe.delete(t)}),reportFileChange:(t)=>Ke({...h,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Bt,reportFileUnsupported:()=>Ke({...h,type:"file-unsupported"}),dispose:()=>{for(let t of Y.keys())G({...h,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:t}});Y.clear();for(let t of Z.keys())G({...h,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:t}});if(Z.clear(),w)je(),w.release(),w=null;if(D=!0,ae=null,le=null,ue=null,Re.clear(),fe.clear(),qe)r.removeEventListener("keydown",Vt,!0);r.removeEventListener("message",Ft),r.removeEventListener("keydown",Xt,!0),r.removeEventListener("pointerover",he),r.removeEventListener("pointermove",he),r.removeEventListener("pointerout",Wt),r.removeEventListener("focus",$t),r.removeEventListener("blur",qt);for(let t of Q.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));Q.clear(),g.clear(),m.clear(),x.clear(),A.clear(),M.clear(),W.clear(),ie.clear(),ge.clear(),_e.clear(),Te.clear(),me.clear(),J.clear(),$e.length=0}}};var ko=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close","browser.playwright"];var Ur=new Set(ko);var Io=["none","agent","user"];var Nr=new Set(Io);var Ko=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],jo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Po=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,d]of Ko)r.style.setProperty(n,e.tokens[d]);for(let[n,d,g]of jo){let m=e.tokens[g]??"";r.style.setProperty(n,m),r.style.setProperty(d,m)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},xt=(e,r)=>{if(Po(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var zo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},y=(e,r)=>`var(--${e}, var(--oc-${zo[e]}, ${r}))`,X=y("surface-background","transparent"),He=y("surface-elevated","transparent"),se=y("surface-elevated-foreground","inherit"),N=y("surface-foreground","inherit"),v=y("surface-muted-foreground","gray"),Jo=y("surface-muted","transparent"),K=y("interactive-border","currentColor"),U=y("interactive-hover","transparent"),j=y("interactive-active","transparent"),Ct=y("interactive-selection","transparent"),kt=y("interactive-selection-foreground","inherit"),V=y("primary","currentColor"),It=y("primary-text","inherit"),Pt=y("error-text","inherit"),Qo=y("font-sans","inherit"),Mt=y("font-mono","monospace"),wo=y("radius","9px"),Gt=`calc(${wo} - 2px)`,Mo=`calc(${wo} - 4px)`,b=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,Go=`background-image: linear-gradient(${U}, ${U});`,Ut=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,wt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Uo="box-shadow: var(--oc-sdk-lit);",Nt=`inset 0 0.5px 0 0 ${b(N,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,Yo=`
:root {
  --oc-sdk-edge: ${b(N,16)};
  --oc-sdk-field-bg: ${He};
  --oc-sdk-raised-bg: ${X};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${b(N,14)};
  --oc-sdk-field-bg: ${b(X,50,He)};
  --oc-sdk-raised-bg: ${He};
  --oc-sdk-field-lift: ${Nt};
  --oc-sdk-raised-lift: ${Nt};
  --oc-sdk-lit: ${Nt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,De=(e)=>{let r=y(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${y(`${e}-text`,"inherit")}; }`},s=(e)=>`calc(${e}rem / 14)`,Zo=`
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
`,No=`${Yo}
.oc-sdk { color: ${N}; font-family: ${Qo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Go} }
.oc-sdk-mono { font-family: ${Mt}; }
.oc-sdk-muted { color: ${v}; }
${De("success")}${De("warning")}${De("error")}${De("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${V}; --oc-sdk-tone-text: ${It}; }

.oc-sdk-btn { border-radius: ${Gt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Mo}; }
.oc-sdk-btn[data-variant="default"] { color: ${It}; background: ${b(V,10,X)}; border-color: ${b(V,12)}; ${Uo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${b(V,16,X)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${b(V,22,X)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Jo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${j}, ${j}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${se}; ${wt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${j}, ${j}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${U}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${j}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${y("status-error","red")}; color: ${Pt}; background: ${b("var(--oc-sdk-tone)",7,X)}; border-color: ${b("var(--oc-sdk-tone)",12)}; ${Uo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${b("var(--oc-sdk-tone)",9,X)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${b("var(--oc-sdk-tone)",11,X)}; box-shadow: none; }

.oc-sdk-field-note { color: ${v}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Pt}; }
.oc-sdk-input { border-radius: ${Gt}; background: var(--oc-sdk-field-bg); color: ${se}; ${Ut("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${v}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ut(b(N,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ut(y("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Mt}; }

.oc-sdk-search-icon { color: ${v}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${V}; }
.oc-sdk-search-clear { border-radius: ${Mo}; color: ${v}; }
.oc-sdk-search-clear:hover { background: ${U}; color: ${N}; }

.oc-sdk-trigger { border-radius: ${Gt}; background: var(--oc-sdk-raised-bg); color: ${se}; ${wt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${j}, ${j}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${v}; }
.oc-sdk-trigger-chevron { color: ${v}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${se}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${He}; background-clip: padding-box; color: ${se}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${U}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Ct}; color: ${kt}; }
.oc-sdk-option-check { color: ${N}; }
.oc-sdk-option[data-destructive="true"] { color: ${Pt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${b(y("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${v}; }
.oc-sdk-popup-empty { color: ${v}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${K}; border-radius: 4px; color: ${N}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${b(N,60,K)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${K}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${X}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${V}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Go} }
.oc-sdk-check-desc { color: ${v}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${b(N,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${v}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${N}; }
.oc-sdk-tab[aria-selected="true"] { color: ${kt}; background: ${Ct}; border-color: ${K}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${se}; background: var(--oc-sdk-raised-bg); ${wt} }
.oc-sdk-tab-count { color: ${v}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${b(N,6)}; color: ${v}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${b("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${U}; }
.oc-sdk-row[aria-selected="true"] { background: ${Ct}; color: ${kt}; }
.oc-sdk-row-lead { font-family: ${Mt}; color: ${v}; }
.oc-sdk-row-sub { color: ${v}; }
.oc-sdk-row-meta { color: ${v}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${v}; }

.oc-sdk-empty-body { color: ${v}; }

.oc-sdk-spinner { color: ${v}; }
.oc-sdk-spinner-ring { border-color: ${K}; border-top-color: ${V}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${b("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${v}; }

.oc-sdk-separator { color: ${v}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${b(K,40)}; }

.oc-sdk-progress-label { color: ${v}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${b(N,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${V}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${y("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${y("success-text","inherit")}; }

.oc-sdk-text a { color: ${It}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${b(K,60)}; }
`,k=`
${Qe}
${Zo}
${No}`;var I=(e)=>{let r=document.getElementById("oc-sdk-ui-style");if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}let n=document.createElement("style");n.id="oc-sdk-ui-style",n.textContent=e,document.head.appendChild(n)},P=(e,r)=>{let n=document.createElement(e);if(r)n.className=r;return n},q=(e)=>{let r=P("button",e);return r.type="button",r},F=(e,r)=>{let n=r??"";if(e.textContent!==n)e.textContent=n};var er=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},ne=(e,r)=>{I(k);let n=r,d=q("oc-sdk oc-sdk-btn"),g=er(),m=document.createElement("span");d.append(m),e.append(d);let x=()=>{if(d.dataset.variant=n.variant??"default",d.dataset.size=n.size??"default",d.disabled=Boolean(n.disabled)||Boolean(n.loading),d.dataset.loading=n.loading?"true":"false",d.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&g.parentNode!==d)d.prepend(g);else if(!n.loading&&g.parentNode===d)g.remove();F(m,n.label)},A=()=>{if(n.disabled||n.loading)return;n.onClick()};return d.addEventListener("click",A),x(),{update:(M)=>{n={...n,...M},x()},dispose:()=>{d.removeEventListener("click",A),d.remove()}}};var We=Ot(),z=document.querySelector("#root");if(!z)throw Error("DeskChart: missing root");z.style.padding="12px";We.onReady((e)=>xt(e,document.documentElement));We.onBlock(({args:e,answered:r})=>{let n=(e.values??"").split(",").map(Number).filter(Number.isFinite),d=Math.max(1,...n);z.replaceChildren();let g=document.createElement("div");g.textContent=e.title??"",g.style.font="600 13px var(--oc-font, system-ui)";let m=document.createElement("div");m.style.cssText="display:flex;align-items:flex-end;gap:6px;height:96px;margin-top:8px";for(let A of n){let M=document.createElement("div");M.style.cssText=`flex:1;height:${A/d*100}%;background:currentColor;opacity:.6;border-radius:3px 3px 0 0`,M.title=String(A),m.append(M)}z.append(g,m);let x=document.createElement("div");x.style.marginTop="10px",z.append(x),ne(x,{label:r??"Explain this",variant:"outline",size:"sm",disabled:r!==null,onClick:()=>{We.answerBlock("Explain this chart")}})});new ResizeObserver(()=>{We.setHeight(Math.ceil(z.getBoundingClientRect().height))}).observe(z);})();
