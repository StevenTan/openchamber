(()=>{var E="openchamber.sdk",g=1;var ot=`
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
`;var rt=128,st=65536;var xe=128;var Ce=65536;var nt=8000,it=192000,at=120000;var so=(e)=>{let r=[],s=0,l=0;return{push:(p)=>{r.push(p),l+=p.length;while(l-s>e&&r.length>1){let _=r.shift();l-=_?.length??0,s=0}},pull:(p)=>{let _=0;while(_<p.length&&r.length>0){let m=r[0],T=Math.min(p.length-_,m.length-s);if(p.set(m.subarray(s,s+T),_),_+=T,s+=T,s>=m.length)r.shift(),l-=m.length,s=0}p.fill(0,_)},clear:()=>{r.length=0,s=0,l=0},get size(){return l-s}}};var lo=/^[a-z][a-z0-9-]{0,39}$/;var no=(e)=>Object(e)===e&&!Array.isArray(e),lt=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),io=(e)=>String(e)===e&&e.length>=1&&e.length<=60,ao=(e)=>String(e)===e&&e.length>=1&&e.length<=80,uo=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!no(s)||!lo.test(s.id)||!io(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!lt(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!lt(s,["kind","id","label","value","options","disabled"]))return!1;if(!ao(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let l=new Set;for(let p of s.options){if(!no(p)||!lt(p,["value","label"])||!ao(p.value)||!io(p.label)||l.has(p.value))return!1;l.add(p.value)}if(!l.has(s.value))return!1}return!0};var co=["{id}","{segment}","{segments+}"];var kr=new Set(co);var po=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Pr=new Set(po);var ke=20000000,Ie=256;var ut=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,So=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0},Pe=(e)=>{let r=e,s=e;return{observe:(l)=>{let p=l!==s;return s=l,{edited:p,dirty:l!==r}},markSaved:(l)=>(r=l,s!==l)}};var Eo=/^[A-Za-z0-9_-]{1,80}$/;var go=["left","right","top","bottom"];var _o=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let l=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let p of l)if(!_o(p,r+1,s))return!1;return!0},ct=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(ct);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(ct)}return String(e)===e||Number.isFinite(e)},pt=(e)=>{try{if(String(e.id)!==e.id||!Eo.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!go.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!_o(e.data)||!ct(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var St=2000;var mo=["file","directory","other","missing"],Et=(e)=>Boolean(e&&"sessionId"in e),gt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var Ro=/^[0-9a-f]{7,64}$/i,_t=(e)=>Ro.test(e),Me=500,Ge=32000,fo=16000,yo=128,ho=200,vo=2000,bo=16000,Ao=80,Oo=200,xo=16000;var Co=2000;var Tt=20000,Ue=1024,we=2000000;var Ne=64000,Le=8000,mt=4000;var Rt=960000;var ko=999,Io=1e4,_e=500,Po=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Mo=["stopped","starting","ready","failed"],Zo=new Set(Po),Go=(e)=>Zo.has(e),Uo=(e)=>e&&Go(e)?e:"HOST_REJECTED",se=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(se);if(Object(e)===e)return Object.values(e).every(se);return!1},wo=(e)=>se(e)&&JSON.stringify(e).length<=xo,To=(e)=>e?.trim().slice(0,Oo)??"",ne=(e)=>{let r=e.id.trim().slice(0,yo),s=e.title.trim().slice(0,ho),l=e.url.trim().slice(0,vo),p=e.text?.trim().slice(0,bo),_=e.author?.trim().slice(0,Ao),m=e.kind==="pull"?"pull":"issue",T={providerId:e.providerId.trim(),id:r,title:s||r,url:l,kind:m};if(p)T.text=p;if(_)T.author=_;if(m==="pull"){let k=To(e.branches?.head),w=To(e.branches?.base);if(k&&w)T.branches={head:k,base:w}}if(wo(e.data))T.data=e.data;return T},ft=(e)=>{let r=ne(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},yt=(e)=>{let r={text:e.text.trim().slice(0,fo)};if(e.send)r.send=!0;return r},ht=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(ko,Math.max(0,Math.round(e)))},vt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Io,Math.max(0,Math.ceil(e)))};var ie=(e)=>e.length>0&&e.length<=Ue&&!e.includes("\x00")&&!e.includes("\\");var De=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Co)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},er=new Set(Mo),bt=(e)=>Boolean(e&&"status"in e&&er.has(String(e.status))&&!("body"in e)),He=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),At=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),Ot=(e)=>Boolean(e&&"written"in e&&e.written===!0),xt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),tr=new Set(mo),Ct=(e)=>Boolean(e&&"kind"in e&&"size"in e&&tr.has(String(e.kind))&&Number.isFinite(e.size)),kt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),or=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),rr=(e)=>Object(e)===e?e:null,dt=(e)=>String(e)===e&&e.length>0,sr=(e)=>{if(!dt(e.id))return null;if(e.ok===!0){let r={channel:E,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&dt(e.error))return{channel:E,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:Uo(dt(e.code)?e.code:void 0)};return null},It=(e)=>{let r=rr(e);if(!r||r.channel!==E||r.v!==g)return null;if(r.type==="result")return sr(r);if(!or.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var No=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),nr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Lo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Fe=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Ue} characters without NUL or backslash.`)),Be=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},S=(e)=>(e.value+=1,`oc-${e.value}`),Pt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??((t)=>t===r.parent),l=e.requestTimeoutMs??Tt,p=new Set,_=new Set,m=new Set,T=new Set,k=new Set,w=new Set,ue=new Set,me=new Set,Re=new Set,fe=new Set,ye=new Set,Z=new Set,Je=[],ce=null,pe=null,he=new Set,ve=new Set,de=null,Se=null,Qe=!1,ee=new Map,te=new Map,oe=new Map,F=!1,d={value:0},c=null,V=null,Ee=!1,ge=!1,qt=null,N=null,Kt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},G=(t)=>{r.parent.postMessage(t,"*")},jt=()=>{if(F||r.parent===r||Z.size===0||c?.features?.lateGenerateResults!==!0)return;G({channel:E,v:g,type:"generate-late-listen"})},y=(t,o)=>{for(let a of t)try{a(o)}catch(i){console.error(i)}},zt=(t)=>{if(!(t instanceof MessageEvent))return;if(!s(t.source))return;let o=It(t.data);if(!o)return;if(o.type==="workspace"){let i=te.get(o.payload.subscriptionId);if(i)y([i],o.payload.snapshot);return}if(o.type==="shells"){let i=oe.get(o.payload.subscriptionId);if(i)y([i],o.payload.snapshot);return}if(o.type==="microphone-audio"){N?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let i=N;if(!i)return;N=null,i.release(),y(i.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(c=o.payload,V=Kt(o.payload.session),y(p,o.payload),y(_,o.payload.directory),y(m,o.payload.session),V)y(T,V);if(y(k,o.payload.connection),y(w,o.payload.settings),y(ue,o.payload.item),o.payload.block)y(me,o.payload.block);jt();return}if(o.type==="service-event"){y(Re,o.payload);return}if(o.type==="generate-late"){if(Z.size===0)Je.push(o.payload);else y(Z,o.payload);return}if(o.type==="directory"){if(c)c={...c,directory:o.payload.directory};y(_,o.payload.directory);return}if(o.type==="session"){if(c)c={...c,session:o.payload.session};if(!o.payload.session)V=null;else if(V?.sessionId!==o.payload.session.id)V=Kt(o.payload.session);y(m,o.payload.session);return}if(o.type==="session-lifecycle"){V=o.payload,y(T,o.payload);return}if(o.type==="connection"){if(c)c={...c,connection:o.payload.connection};y(k,o.payload.connection);return}if(o.type==="settings"){if(c)c={...c,settings:o.payload.settings};y(w,o.payload.settings);return}if(o.type==="item"){if(c)c={...c,item:o.payload.item};y(ue,o.payload.item);return}if(o.type==="status-control-event"){y(fe,o.payload);return}if(o.type==="popover-closed"){y(ye,o.payload);return}if(o.type==="action"){let i=(f)=>{if(!F)G({channel:E,v:g,type:"action-result",id:o.id,payload:f})},R=pe;if(!R){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>i({ok:!0}),(f)=>{let h=(f instanceof Error?f.message:String(f)).trim();i({ok:!1,error:(h||"Action failed.").slice(0,_e)})});return}if(o.type==="file-open"){let i=o.payload;if(Se&&So(Se,i))return;Se=i,y(he,o.payload);return}if(o.type==="file-saved"){y(ve,o.payload.version);return}if(o.type==="file-snapshot"){let i=(h)=>{if(!F)G({channel:E,v:g,type:"file-snapshot-result",id:o.id,payload:h})},R=(h)=>i({error:(h.trim()||"Could not read the edited file.").slice(0,_e)}),f=de;if(!f){R("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((h)=>{if(ut(h)>ke){R(`The file is over ${ke} ${"bytes"in h?"bytes":"characters"}.`);return}if(h.version.length>Ie){R(`The snapshot version is over ${Ie} characters.`);return}i({snapshot:"bytes"in h?{bytes:h.bytes,version:h.version}:{content:h.content,version:h.version}})},(h)=>R(h instanceof Error?h.message:String(h)));return}if(o.type==="resolve"){let i=(f)=>{G({channel:E,v:g,type:"resolve-result",id:o.id,payload:f})},R=ce;if(!R){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((f)=>i({item:f?ne(f):null}),(f)=>{let h=(f instanceof Error?f.message:String(f)).trim();i({error:(h||"Command failed.").slice(0,_e)})});return}let a=ee.get(o.id);if(!a)return;if(clearTimeout(a.timer),ee.delete(o.id),o.ok){a.resolve(o.payload);return}a.reject(new u(o.code,o.error))};r.addEventListener("message",zt),G({channel:E,v:g,type:"hello"});let M=(t,o=l)=>{if(F||r.parent===r)return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((a,i)=>{let R=setTimeout(()=>{ee.delete(t.id),i(new u("HOST_TIMEOUT","Host did not answer in time."))},o);ee.set(t.id,{resolve:a,reject:i,timer:R}),G(t)})},x=(t)=>M(t).then(()=>{return}),b={channel:E,v:g},Ye=(t)=>{if(!F&&r.parent!==r)G(t)},Jt=()=>Ye({...b,type:"file-save"}),Ze=()=>{if(!F&&r.parent!==r)G({...b,type:"microphone-close",id:S(d)})},Jo=async()=>{if(N)throw new u("HOST_REJECTED","The microphone is already open in this frame.");if(c?.features?.microphone!==!0)throw new u("UNSUPPORTED","This OpenChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new u("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<nt||o.sampleRate>it)throw o.close().catch(()=>{return}),new u("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let a=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,i=so(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(H)=>i.pull(H.outputBuffer.getChannelData(0));let f=o.createMediaStreamDestination();R.connect(f);let h=new Set,re={queue:i,endedListeners:h,release:()=>{R.onaudioprocess=null,R.disconnect(),i.clear();for(let H of f.stream.getTracks())H.stop();o.close().catch(()=>{return})}};N=re;try{let H=await M({...b,type:"microphone-open",id:S(d),payload:{sampleRate:o.sampleRate}},at);if(!H||!("opened"in H)||H.opened!==!0)throw new u("HOST_REJECTED","Host did not open the microphone.");if(await a,N!==re)throw new u("DISCONNECTED","The microphone closed while it was opening.")}catch(H){if(N===re)N=null;throw re.release(),Ze(),H}return{stream:f.stream,close:()=>{if(N!==re)return;N=null,re.release(),Ze()},onEnded:(H)=>(h.add(H),()=>{h.delete(H)})}},Qt=(t)=>{if(!No(t)||!nr(t))return;t.preventDefault(),Jt()},Yt=(t)=>{if(!No(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover)return;t.preventDefault(),oo(c.popover.id,"escape").catch(()=>{return})},be=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=Ee||ge;if(qt===o)return;qt=o,ro(t.id,o).catch(()=>{return})},Ae=()=>{if(c?.surface!=="popover"||Ee)return;Ee=!0,be()},Zt=(t)=>{if(c?.surface!=="popover"||t.relatedTarget!==null||!Ee)return;Ee=!1,be()},eo=()=>{if(c?.surface!=="popover"||ge)return;ge=!0,be()},to=()=>{if(c?.surface!=="popover"||!ge)return;ge=!1,be()},B=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},et=async(t)=>{if(t.kind!=="projects")B(t.projectId);let o=await M({...b,type:"workspace-read",id:S(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},tt=async(t,o)=>{if(t.kind!=="projects")B(t.projectId);let a=S(d);te.set(a,o);try{await x({...b,type:"workspace-subscribe",id:S(d),payload:{subscriptionId:a,query:t}})}catch(i){if(te.delete(a),!F)G({...b,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw i}return()=>{if(!te.delete(a)||F)return;G({...b,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},Qo=async(t,o)=>{if(t.kind==="session")B(t.sessionId);if(t.kind==="project")B(t.projectId);let a=S(d);oe.set(a,o);try{await x({...b,type:"shells-subscribe",id:S(d),payload:{subscriptionId:a,scope:t}})}catch(i){if(oe.delete(a),!F)G({...b,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw i}return()=>{if(!oe.delete(a)||F)return;G({...b,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},Oe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>rt))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!se(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>st)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await M({...b,type:"storage",id:S(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},oo=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...b,type:"popover-close",id:S(d),payload:o?{id:t,reason:o}:{id:t}}),ro=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...b,type:"popover-anchor",id:S(d),payload:{id:t,active:o}});return r.addEventListener("keydown",Yt,!0),r.addEventListener("pointerover",Ae),r.addEventListener("pointermove",Ae),r.addEventListener("pointerout",Zt),r.addEventListener("focus",eo),r.addEventListener("blur",to),{onAction:(t)=>(pe=t,()=>{if(pe===t)pe=null}),listProjects:async()=>{let t=await et({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await et({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await et({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>tt({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>tt({kind:"worktrees",projectId:t},(a)=>{if(a.kind==="worktrees")o(a)}),onSessions:(t,o)=>tt({kind:"sessions",projectId:t},(a)=>{if(a.kind==="sessions")o(a)}),onRunningShells:(t,o)=>Qo(t,o),readShellOutput:async(t,o)=>{B(t,xe);let a=o?.cursor;if(a!==void 0&&(!Number.isInteger(a)||a<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>Ce))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ce}.`);let f=await M({...b,type:"shell-output",id:S(d),payload:{shellId:t,cursor:a,tailBytes:i}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(B(t,xe),(await M({...b,type:"shell-stop",id:S(d),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{B(t),await x({...b,type:"open-session",id:S(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let a=Be(o),i={op:"get",key:t};if(a)i.scope=a;let R=await Oe(i);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,a)=>{let i=Be(a),R={op:"set",key:t,value:o};if(i)R.scope=i;await Oe(R)},delete:async(t,o)=>{let a=Be(o),i={op:"delete",key:t};if(a)i.scope=a;await Oe(i)},keys:async(t)=>{let o=Be(t),a={op:"keys"};if(o)a.scope=o;let i=await Oe(a);if(i.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(p.add(t),c)t(c);return()=>{p.delete(t)}},onDirectory:(t)=>{if(_.add(t),c)t(c.directory);return()=>{_.delete(t)}},onSession:(t)=>{if(m.add(t),c)t(c.session);return()=>{m.delete(t)}},onSessionLifecycle:(t)=>{if(T.add(t),V)t(V);return()=>{T.delete(t)}},onConnection:(t)=>{if(k.add(t),c)t(c.connection);return()=>{k.delete(t)}},onSettings:(t)=>{if(w.add(t),c)t(c.settings);return()=>{w.delete(t)}},onItem:(t)=>{if(ue.add(t),c)t(c.item);return()=>{ue.delete(t)}},onBlock:(t)=>{if(me.add(t),c?.block)t(c.block);return()=>{me.delete(t)}},onServiceEvent:(t)=>(Re.add(t),()=>{Re.delete(t)}),onStatusControl:(t)=>(fe.add(t),()=>{fe.delete(t)}),onPopoverClosed:(t)=>(ye.add(t),()=>{ye.delete(t)}),setStatusControls:(t)=>{if(c?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!uo(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...b,type:"status-controls",id:S(d),payload:{controls:t}})},openPopover:(t)=>{if(c?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!pt(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...b,type:"popover-open",id:S(d),payload:t})},closePopover:oo,setPopoverAnchorActive:ro,onResolve:(t)=>(ce=t,()=>{if(ce===t)ce=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Me)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Me} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ge))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Ge} characters.`));return x({channel:E,v:g,type:"toast",id:S(d),payload:{...t,message:o}})},openUrl:(t)=>x({channel:E,v:g,type:"open-url",id:S(d),payload:{url:t}}),openCommit:(t)=>_t(t)?x({channel:E,v:g,type:"open-commit",id:S(d),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:E,v:g,type:"block-answer",id:S(d),payload:{text:t.trim().slice(0,St)}}),openSurface:(t)=>x({channel:E,v:g,type:"open-surface",id:S(d),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:E,v:g,type:"clipboard-write",id:S(d),payload:{text:t}}),compose:(t)=>x({channel:E,v:g,type:"compose",id:S(d),payload:t}),attach:(t)=>x({channel:E,v:g,type:"attach",id:S(d),payload:ne(t)}),startSession:async(t)=>{if(t.projectId!==void 0)B(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")B(o.directory);else{if(o.name!==void 0)B(o.name,200);if(o.baseBranch!==void 0)B(o.baseBranch,200)}let a=await M({channel:E,v:g,type:"start-session",id:S(d),payload:ft(t)},e.requestTimeoutMs??180000);if(!Et(a))throw new u("HOST_REJECTED","Host did not return a session.");return a},prompt:(t)=>M({channel:E,v:g,type:"prompt",id:S(d),payload:yt(t)}).then((o)=>{if(!gt(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:E,v:g,type:"session-link",id:S(d),payload:ne(t)}),close:()=>x({channel:E,v:g,type:"close",id:S(d)}),oauthStart:()=>x({channel:E,v:g,type:"oauth-start",id:S(d)}),oauthDisconnect:()=>x({channel:E,v:g,type:"oauth-disconnect",id:S(d)}),request:(t)=>(De(t.path)?M({channel:E,v:g,type:"request",id:S(d),payload:t}):Lo()).then((o)=>{if(!He(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(De(t.path)?M({channel:E,v:g,type:"service-request",id:S(d),payload:t}):Lo()).then((o)=>{if(!He(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>M({channel:E,v:g,type:"service-status",id:S(d)}).then((t)=>{if(!bt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ie(t)?M({channel:E,v:g,type:"file-read",id:S(d),payload:{path:t}}):Fe()).then((o)=>{if(!At(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ie(t))return Fe();if(o.length>we)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${we} characters.`));return M({channel:E,v:g,type:"file-write",id:S(d),payload:{path:t,content:o}}).then((a)=>{if(!Ot(a))throw new u("HOST_REJECTED","Host did not confirm the write.");return a})},listDir:(t)=>(ie(t)?M({channel:E,v:g,type:"file-list",id:S(d),payload:{path:t}}):Fe()).then((o)=>{if(!xt(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ie(t)?M({channel:E,v:g,type:"file-stat",id:S(d),payload:{path:t}}):Fe()).then((o)=>{if(!Ct(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),a=t.system?.trim();if(o.length===0||o.length>Ne)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${Ne} characters.`));if(a!==void 0&&(a.length===0||a.length>Le))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Le} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(mt,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(a!==void 0)R.system=a;if(i!==void 0)R.maxOutputTokens=i;return M({channel:E,v:g,type:"generate",id:S(d),payload:R},e.requestTimeoutMs??Rt).then((f)=>{if(!kt(f))throw new u("HOST_REJECTED","Host did not return generated text.");return f})},onLateGenerateResult:(t)=>{Z.add(t);for(let o of Je.splice(0))y([t],o);return jt(),()=>{Z.delete(t)}},openMicrophone:Jo,setBadge:(t)=>x({channel:E,v:g,type:"badge",id:S(d),payload:{count:ht(t)}}),setHeight:(t)=>x({channel:E,v:g,type:"resize",id:S(d),payload:{height:vt(t)}}),onFileOpen:(t)=>{if(he.add(t),!Qe)Qe=!0,r.addEventListener("keydown",Qt,!0);if(Se)t(Se);return()=>{he.delete(t)}},onFileSnapshot:(t)=>(de=t,()=>{if(de===t)de=null}),onFileSaved:(t)=>(ve.add(t),()=>{ve.delete(t)}),reportFileChange:(t)=>Ye({...b,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Jt,reportFileUnsupported:()=>Ye({...b,type:"file-unsupported"}),dispose:()=>{for(let t of te.keys())G({...b,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:t}});te.clear();for(let t of oe.keys())G({...b,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:t}});if(oe.clear(),N)Ze(),N.release(),N=null;if(F=!0,ce=null,pe=null,de=null,he.clear(),ve.clear(),Qe)r.removeEventListener("keydown",Qt,!0);r.removeEventListener("message",zt),r.removeEventListener("keydown",Yt,!0),r.removeEventListener("pointerover",Ae),r.removeEventListener("pointermove",Ae),r.removeEventListener("pointerout",Zt),r.removeEventListener("focus",eo),r.removeEventListener("blur",to);for(let t of ee.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));ee.clear(),p.clear(),_.clear(),m.clear(),T.clear(),k.clear(),w.clear(),ue.clear(),me.clear(),Re.clear(),fe.clear(),ye.clear(),Z.clear(),Je.length=0}}};var Do=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close","browser.playwright"];var jr=new Set(Do);var Ho=["none","agent","user"];var Jr=new Set(Ho);var ir=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],ar=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Fo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,l]of ir)r.style.setProperty(s,e.tokens[l]);for(let[s,l,p]of ar){let _=e.tokens[p]??"";r.style.setProperty(s,_),r.style.setProperty(l,_)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Mt=(e,r)=>{if(Fo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var lr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},v=(e,r)=>`var(--${e}, var(--oc-${lr[e]}, ${r}))`,W=v("surface-background","transparent"),Xe=v("surface-elevated","transparent"),ae=v("surface-elevated-foreground","inherit"),L=v("surface-foreground","inherit"),A=v("surface-muted-foreground","gray"),ur=v("surface-muted","transparent"),z=v("interactive-border","currentColor"),U=v("interactive-hover","transparent"),J=v("interactive-active","transparent"),Gt=v("interactive-selection","transparent"),Ut=v("interactive-selection-foreground","inherit"),X=v("primary","currentColor"),wt=v("primary-text","inherit"),Nt=v("error-text","inherit"),cr=v("font-sans","inherit"),Lt=v("font-mono","monospace"),Wo=v("radius","9px"),Dt=`calc(${Wo} - 2px)`,Bo=`calc(${Wo} - 4px)`,O=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Vo=`background-image: linear-gradient(${U}, ${U});`,Ht=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Ft="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Xo="box-shadow: var(--oc-sdk-lit);",Bt=`inset 0 0.5px 0 0 ${O(L,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,pr=`
:root {
  --oc-sdk-edge: ${O(L,16)};
  --oc-sdk-field-bg: ${Xe};
  --oc-sdk-raised-bg: ${W};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${O(L,14)};
  --oc-sdk-field-bg: ${O(W,50,Xe)};
  --oc-sdk-raised-bg: ${Xe};
  --oc-sdk-field-lift: ${Bt};
  --oc-sdk-raised-lift: ${Bt};
  --oc-sdk-lit: ${Bt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ve=(e)=>{let r=v(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${v(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,dr=`
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
`,$o=`${pr}
.oc-sdk { color: ${L}; font-family: ${cr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Vo} }
.oc-sdk-mono { font-family: ${Lt}; }
.oc-sdk-muted { color: ${A}; }
${Ve("success")}${Ve("warning")}${Ve("error")}${Ve("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${X}; --oc-sdk-tone-text: ${wt}; }

.oc-sdk-btn { border-radius: ${Dt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Bo}; }
.oc-sdk-btn[data-variant="default"] { color: ${wt}; background: ${O(X,10,W)}; border-color: ${O(X,12)}; ${Xo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(X,16,W)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(X,22,W)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${ur}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ae}; ${Ft} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${J}, ${J}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${U}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${J}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error","red")}; color: ${Nt}; background: ${O("var(--oc-sdk-tone)",7,W)}; border-color: ${O("var(--oc-sdk-tone)",12)}; ${Xo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,W)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,W)}; box-shadow: none; }

.oc-sdk-field-note { color: ${A}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Nt}; }
.oc-sdk-input { border-radius: ${Dt}; background: var(--oc-sdk-field-bg); color: ${ae}; ${Ht("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${A}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ht(O(L,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ht(v("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Lt}; }

.oc-sdk-search-icon { color: ${A}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${X}; }
.oc-sdk-search-clear { border-radius: ${Bo}; color: ${A}; }
.oc-sdk-search-clear:hover { background: ${U}; color: ${L}; }

.oc-sdk-trigger { border-radius: ${Dt}; background: var(--oc-sdk-raised-bg); color: ${ae}; ${Ft} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${A}; }
.oc-sdk-trigger-chevron { color: ${A}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ae}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Xe}; background-clip: padding-box; color: ${ae}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${U}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Gt}; color: ${Ut}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${Nt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(v("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${A}; }
.oc-sdk-popup-empty { color: ${A}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${z}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(L,60,z)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${W}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${X}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Vo} }
.oc-sdk-check-desc { color: ${A}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${O(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${A}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Ut}; background: ${Gt}; border-color: ${z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ae}; background: var(--oc-sdk-raised-bg); ${Ft} }
.oc-sdk-tab-count { color: ${A}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${O(L,6)}; color: ${A}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${U}; }
.oc-sdk-row[aria-selected="true"] { background: ${Gt}; color: ${Ut}; }
.oc-sdk-row-lead { font-family: ${Lt}; color: ${A}; }
.oc-sdk-row-sub { color: ${A}; }
.oc-sdk-row-meta { color: ${A}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${A}; }

.oc-sdk-empty-body { color: ${A}; }

.oc-sdk-spinner { color: ${A}; }
.oc-sdk-spinner-ring { border-color: ${z}; border-top-color: ${X}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${A}; }

.oc-sdk-separator { color: ${A}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${O(z,40)}; }

.oc-sdk-progress-label { color: ${A}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${O(L,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${X}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${v("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${v("success-text","inherit")}; }

.oc-sdk-text a { color: ${wt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${O(z,60)}; }
`,I=`
${ot}
${dr}
${$o}`;var P=(e)=>{let r=document.getElementById("oc-sdk-ui-style");if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}let s=document.createElement("style");s.id="oc-sdk-ui-style",s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},q=(e)=>{let r=C("button",e);return r.type="button",r},D=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var Sr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},K=(e,r)=>{P(I);let s=r,l=q("oc-sdk oc-sdk-btn"),p=Sr(),_=document.createElement("span");l.append(_),e.append(l);let m=()=>{if(l.dataset.variant=s.variant??"default",l.dataset.size=s.size??"default",l.disabled=Boolean(s.disabled)||Boolean(s.loading),l.dataset.loading=s.loading?"true":"false",l.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&p.parentNode!==l)l.prepend(p);else if(!s.loading&&p.parentNode===l)p.remove();D(_,s.label)},T=()=>{if(s.disabled||s.loading)return;s.onClick()};return l.addEventListener("click",T),m(),{update:(k)=>{s={...s,...k},m()},dispose:()=>{l.removeEventListener("click",T),l.remove()}}};var Vt=(e,r)=>{P(I);let s=r,l=C("div","oc-sdk oc-sdk-empty"),p=C("h2","oc-sdk-empty-title"),_=C("p","oc-sdk-empty-body"),m=C("div","oc-sdk-empty-action");l.append(p,_,m),e.append(l);let T=null,k=()=>{if(D(p,s.title),D(_,s.body),_.hidden=!s.body,m.hidden=!s.action,!s.action){T?.dispose(),T=null;return}let w={label:s.action.label,onClick:s.action.onClick};if(T)T.update(w);else T=K(m,{...w,variant:"outline",size:"sm"})};return k(),{update:(w)=>{s={...s,...w},k()},dispose:()=>{T?.dispose(),T=null,l.remove()}}};var mr=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,qo=(e)=>e.split(`
`).map((r)=>{let s=mr.exec(r);return s?{kind:"item",prefix:s[1]??"- ",done:s[2]!==" ",text:s[3]??""}:{kind:"text",text:r}}),Ko=(e)=>e.map((r)=>r.kind==="text"?r.text:`${r.prefix}[${r.done?"x":" "}] ${r.text}`).join(`
`),je=(e)=>{let r=2166136261;for(let s=0;s<e.length;s+=1)r^=e.charCodeAt(s),r=Math.imul(r,16777619);return`${e.length}:${(r>>>0).toString(16)}`},jo=(e,r)=>{let s=-1,l="- ";e.forEach((T,k)=>{if(T.kind!=="item")return;s=k,l=T.prefix});let p={kind:"item",prefix:l,done:!1,text:r};if(s>=0)return[...e.slice(0,s+1),p,...e.slice(s+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],p,{kind:"text",text:""}]};var Y=Pt(),Q=document.querySelector("#root");if(!Q)throw Error("Missing root");var zo=document.createElement("style");zo.textContent=`
  html, body { margin: 0; height: 100%; background: var(--oc-bg); color: var(--oc-fg); font-family: var(--oc-font); font-size: 13px; }
  #root { box-sizing: border-box; height: 100%; overflow: auto; padding: 16px 20px; }
  .note { margin: 2px 0; color: var(--oc-muted); white-space: pre-wrap; min-height: 1em; }
  .item { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
  .item input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--oc-primary); }
  .item input[type="text"] { flex: 1; min-width: 0; border: 1px solid transparent; border-radius: var(--oc-radius); padding: 4px 6px;
    background: transparent; color: inherit; font: inherit; }
  .item input[type="text"]:hover { border-color: var(--oc-border); }
  .item input[type="text"]:focus { outline: none; border-color: var(--oc-focus); background: var(--oc-elevated); }
  .item.done input[type="text"] { color: var(--oc-muted); text-decoration: line-through; }
  .item .remove { visibility: hidden; }
  .item:hover .remove, .item:focus-within .remove { visibility: visible; }
  .actions { margin-top: 12px; }
`;document.head.append(zo);Y.onReady((e)=>Mt(e,document.documentElement));var j=[],le=!1,Wt=Pe(null),$t=()=>Ko(j),ze=()=>{Y.reportFileChange(Wt.observe(je($t())))},Xt=()=>{if(Q.replaceChildren(),!j.some((r)=>r.kind==="item")&&le){Vt(Q,{title:"No items",body:"This checklist is empty."});return}if(j.forEach((r,s)=>{if(r.kind==="text"){let m=document.createElement("p");m.className="note",m.textContent=r.text,Q.append(m);return}let l=document.createElement("div");l.className=r.done?"item done":"item";let p=document.createElement("input");p.type="checkbox",p.checked=r.done,p.disabled=le,p.addEventListener("change",()=>{r.done=p.checked,l.className=r.done?"item done":"item",ze()});let _=document.createElement("input");if(_.type="text",_.value=r.text,_.readOnly=le,_.setAttribute("aria-label","Item"),_.addEventListener("input",()=>{r.text=_.value,ze()}),l.append(p,_),!le){let m=document.createElement("span");m.className="remove",K(m,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{j=j.filter((T,k)=>k!==s),ze(),Xt()}}),l.append(m)}Q.append(l)}),le)return;let e=document.createElement("div");e.className="actions",K(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{j=jo(j,""),ze(),Xt();let r=Q.querySelectorAll('.item input[type="text"]');r.item(r.length-1)?.focus()}}),Q.append(e)};Y.onFileOpen((e)=>{if(e.encoding!=="text"){Y.reportFileUnsupported();return}j=qo(e.content),le=e.readOnly,Wt=Pe(je($t())),Xt()});Y.onFileSnapshot(()=>{let e=$t();return{content:e,version:je(e)}});Y.onFileSaved((e)=>{Y.reportFileChange({dirty:Wt.markSaved(e),edited:!1})});})();
