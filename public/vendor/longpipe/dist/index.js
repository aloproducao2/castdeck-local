import {b,a as a$1,c as c$1}from'./chunk-5J3JEPJZ.js';import {c as c$2,b as b$2,e,f,g,h}from'./chunk-ED63M5HJ.js';export{q as WebGPUBackend}from'./chunk-ED63M5HJ.js';import {a,b as b$1}from'./chunk-JXGR3YHT.js';var C=[{model:"xs",dtype:"f16",resolution:{w:384,h:240},skipFrames:2},{model:"small",dtype:"f16",resolution:{w:384,h:224},skipFrames:1},{model:"medium",dtype:"f16",resolution:{w:512,h:320},skipFrames:1},{model:"large",dtype:"f32",resolution:{w:640,h:400},skipFrames:0},{model:"xl",dtype:"f32",resolution:{w:1280,h:768},skipFrames:0}],ue={fast:0,balanced:2,quality:4,xs:0,small:1,medium:2,large:3,xl:4};function le(r){if(r==="auto")return null;let e=Object.hasOwn(ue,r)?ue[r]:void 0;return e===void 0?null:C[e]}var R=b("adaptive"),We=2e3,Le=1e4,q=30,ze=20,He=ze/q,Ne=5e3,Ge=.3,Ve=15e3,O=class{constructor(e,t=performance.now()){this.opts=e;this.currentPresetIdx=C.findIndex(n=>n.model===e.initialModel),this.lastSwapAt=t;}opts;timer=null;currentPresetIdx;lastSwapAt=0;overshootStart=0;headroomStart=0;get currentModel(){return C[this.currentPresetIdx]?.model??this.opts.initialModel}start(){R(`started; backend=${this.opts.backendKind} initial=${this.opts.initialModel} idx=${this.currentPresetIdx}`),this.timer=setInterval(()=>{this.tick().catch(e=>R("tick failed:",e));},We);}stop(){this.timer&&clearInterval(this.timer),this.timer=null;}async tick(e=performance.now()){if(typeof document<"u"&&document.hidden||e-this.lastSwapAt<Le)return;let t=await this.opts.getStats(),n=this.targetFps();if(t.fps<n*He?(this.overshootStart===0&&(this.overshootStart=e),e-this.overshootStart>=Ne&&this.tryDowngrade(t.fps,e)):this.overshootStart=0,this.opts.backendKind==="webgpu"&&t.modelMs>0){let a=1e3/n*Ge;t.modelMs<a?(this.headroomStart===0&&(this.headroomStart=e),e-this.headroomStart>=Ve&&this.tryUpgrade(t.modelMs,a,e)):this.headroomStart=0;}}targetFps(){let e=this.opts.getInputFps?.()??null;return e===null||!Number.isFinite(e)||e<=0?q:Math.max(5,Math.min(q,e))}tryDowngrade(e,t){if(this.currentPresetIdx<=0)return;let n=this.currentPresetIdx-1;R(`downgrade ${C[this.currentPresetIdx].model} \u2192 ${C[n].model} (fps=${e}, target=${this.targetFps().toFixed(1)})`),this.swap(n,t);}tryUpgrade(e,t,n){if(C[this.currentPresetIdx+1]?.model==="xl"||this.currentPresetIdx>=C.length-1)return;let a=this.currentPresetIdx+1;R(`upgrade ${C[this.currentPresetIdx].model} \u2192 ${C[a].model} (modelMs=${e.toFixed(1)} < ${t.toFixed(1)})`),this.swap(a,n);}async swap(e,t){let n=C[e];this.lastSwapAt=t,this.overshootStart=0,this.headroomStart=0;try{let a=await this.opts.fetchWeights(n.model);await this.opts.swapPreset(n,a),this.currentPresetIdx=e,R(`swap to ${n.model} done`);}catch(a){R("swap failed:",a),this.opts.onError?.({type:"adaptive",fatal:false,message:`adaptive preset swap failed: ${a.message??String(a)}`,source:"adaptive",recoverable:true,cause:a});}}};async function pe(r,e={}){let t,n=false;if(r instanceof HTMLVideoElement){if(t=r.currentSrc||r.src,!t)throw new Error("background video: HTMLVideoElement has no src")}else if(r instanceof Blob)t=URL.createObjectURL(r),n=true;else if(typeof r=="string")t=r;else throw new Error("background video: unsupported input shape");let a=document.createElement("video");a.crossOrigin="anonymous",a.muted=true,a.loop=true,a.playsInline=true,a.src=t;let i=p=>(a.removeAttribute("src"),a.load(),n&&URL.revokeObjectURL(t),new Error(p));try{await new Promise((p,f)=>{let g=e.timeoutMs?setTimeout(()=>f(new Error(`background video: timed out loading ${t}`)),e.timeoutMs):null;a.addEventListener("loadeddata",()=>{g&&clearTimeout(g),p();},{once:!0}),a.addEventListener("error",()=>{g&&clearTimeout(g),f(new Error(`background video: failed to load ${t}`));},{once:!0});});}catch(p){throw i(p.message)}try{await a.play();}catch(p){throw i(`background video: play() rejected \u2014 ${p.message}`)}a.addEventListener("error",()=>{u||e.onError?.(`background video stopped: ${a.error?.message||"decode/network error"} (${t})`);});let l=new MessageChannel,s=l.port1,o=l.port2,u=false,h=a.requestVideoFrameCallback?.bind(a);if(h){let p=(f,g)=>{if(u)return;let v=null;try{v=new VideoFrame(a,{timestamp:g.mediaTime*1e6}),s.postMessage({frame:v},[v]);}catch{v?.close();}h(p);};h(p);}else {let p=()=>{if(u)return;let f=null;try{f=new VideoFrame(a,{timestamp:performance.now()*1e3}),s.postMessage({frame:f},[f]);}catch{f?.close();}requestAnimationFrame(p);};requestAnimationFrame(p);}return {port:o,transferList:[o],cleanup:()=>{u=true,s.close(),a.pause(),a.removeAttribute("src"),a.load(),n&&URL.revokeObjectURL(t);}}}var $e=4,X=8,ce=16,de=15e3;async function fe(r,e={}){if(typeof r=="string")return r==="none"?{background:{kind:"none"}}:r==="blur"?{background:{kind:"blur",sigma:X}}:{background:{kind:"image",bitmap:await me(r)}};if(r instanceof ImageBitmap)return {background:{kind:"image",bitmap:r}};if(typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement)return {background:{kind:"image",bitmap:await createImageBitmap(r)}};if(typeof HTMLVideoElement<"u"&&r instanceof HTMLVideoElement)return await he(r,e);let t=r;if(t.color!==void 0)return {background:{kind:"color",rgb:je(t.color)}};if(t.blur!==void 0)return {background:{kind:"blur",sigma:qe(t.blur)}};if(t.image!==void 0)return {background:{kind:"image",bitmap:await Xe(t.image)}};if(t.video!==void 0)return await he(t.video,e);throw new Error(`background: unrecognized input shape \u2014 ${S(r)}`)}async function he(r,e){let t;if(typeof r=="string")t=r;else if(typeof HTMLVideoElement<"u"&&r instanceof HTMLVideoElement)t=r;else if(r&&typeof r=="object"&&"data"in r&&"type"in r)t=r.data instanceof Blob?r.data:new Blob([r.data],{type:r.type});else throw new Error(`background.video: unrecognized shape \u2014 ${S(r)}`);let n=await pe(t,{timeoutMs:de,onError:e.onVideoError});return {background:{kind:"video",port:n.port},transferList:n.transferList,cleanup:n.cleanup}}function je(r){if(typeof r=="string"){let e=r.trim().replace(/^#/,"");if(/^[0-9a-fA-F]{6}$/.test(e))return [parseInt(e.slice(0,2),16)/255,parseInt(e.slice(2,4),16)/255,parseInt(e.slice(4,6),16)/255];if(/^[0-9a-fA-F]{3}$/.test(e))return [parseInt(e[0]+e[0],16)/255,parseInt(e[1]+e[1],16)/255,parseInt(e[2]+e[2],16)/255];throw new Error(`background.color: hex must be #rgb or #rrggbb, got ${S(r)}`)}if(!Array.isArray(r)||r.length!==3||!r.every(e=>typeof e=="number"&&Number.isFinite(e)&&e>=0&&e<=1))throw new Error(`background.color: expected hex string or [r, g, b] floats in [0, 1], got ${S(r)}`);return [r[0],r[1],r[2]]}function qe(r){if(r===true)return X;if("sigma"in r){if(typeof r.sigma!="number"||!Number.isFinite(r.sigma)||r.sigma<0)throw new Error(`background.blur.sigma must be a non-negative number, got ${r.sigma}`);return r.sigma}if("strength"in r){let e=r.strength;if(typeof e=="number"){let t=Math.max(0,Math.min(1,e));return ce*t}if(e==="low")return $e;if(e==="medium")return X;if(e==="high")return ce;throw new Error(`background.blur.strength must be 'low' | 'medium' | 'high' | number, got ${S(e)}`)}throw new Error(`background.blur: must be true, { strength }, or { sigma } \u2014 got ${S(r)}`)}async function Xe(r){if(r instanceof ImageBitmap)return r;if(typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement)return createImageBitmap(r);if(typeof r=="string")return me(r);if(r&&typeof r=="object"&&"data"in r&&"type"in r){let e=r.data instanceof Blob?r.data:new Blob([r.data],{type:r.type});return createImageBitmap(e)}throw new Error(`background.image: unrecognized shape \u2014 ${S(r)}`)}async function me(r){let e=typeof AbortSignal<"u"&&"timeout"in AbortSignal?AbortSignal.timeout(de):void 0,t;try{t=await fetch(r,{signal:e});}catch(a){throw new Error(`background: failed to load image from ${r} (${a.name==="TimeoutError"?"timed out":a.message})`)}if(!t.ok)throw new Error(`background: failed to load image from ${r} (HTTP ${t.status})`);let n=await t.blob();try{return await createImageBitmap(n)}catch(a){throw new Error(`background: could not decode image from ${r} (${a.message})`)}}function S(r){return r===null?"null":typeof r!="object"?typeof r+"("+String(r)+")":`${r.constructor?.name??"Object"} ${JSON.stringify(r).slice(0,80)}`}var Ke={"no-backend":"worker","init-failed":"worker","background-load":"background","backend-lost":"backend-lost","worker-crash":"worker","recovery-failed":"worker","camera-ended":"camera","control-failed":"control","control-timeout":"control",adaptive:"adaptive",audio:"audio","audio-suspended":"audio"},Ye={"no-backend":false,"init-failed":true,"background-load":false,"backend-lost":false,"worker-crash":false,"recovery-failed":true,"camera-ended":true,"control-failed":false,"control-timeout":false,adaptive:false,audio:false,"audio-suspended":false},c=class extends Error{type;fatal;source;recoverable;cause;constructor(e,t,n={}){super(t),this.name="LongpipeError",this.type=e,this.fatal=n.fatal??Ye[e],this.source=n.source??Ke[e],this.recoverable=!this.fatal,this.cause=n.cause;}};function W(r){return r instanceof c}function A(r){return r?.message??String(r)}function L(r,e){return e.startsWith(`${r}:`)?e:`${r}: ${e}`}function ge(){return {input:"MediaStreamTrackProcessor"in self?"mstp":"rvfc-postmessage",output:"MediaStreamTrackGenerator"in self?"mstg":Qe()?"transfer-capture":"bitmap-shuttle"}}var z=null;function Qe(){return z!==null||(z=!/Firefox/.test(navigator.userAgent)),z}function _e(r){return r==="denoise"?{mode:"denoise",denoise:{}}:typeof r=="object"?{mode:"denoise",denoise:r.denoise}:{mode:r}}function ve(r,e,t,n){let a=[r];return t.mode==="passthrough"?a.push(...e.getAudioTracks()):t.mode==="denoise"&&n&&a.push(n),new MediaStream(a)}var xe=["longpipe","mediapipe-selfie","mediapipe-selfie-square","mediapipe-selfie-landscape"],P=r=>r.family==="mediapipe-selfie";function be(r,e){let t=r??"longpipe";if(!xe.includes(t))throw new Error(`longpipe: unknown model '${t}' (expected ${xe.map(a=>`'${a}'`).join(" | ")})`);return t==="longpipe"?{family:"longpipe"}:{family:"mediapipe-selfie",variant:t==="mediapipe-selfie-square"?"square":t==="mediapipe-selfie-landscape"?"landscape":c$2(e.w,e.h)}}function E(r,e,t="control-failed"){return new c(t,`longpipe: ${r} requires a Longpipe model; set model: 'longpipe' (model '${e}' is segmentation-only \u2014 background effects only)`)}function we(r,e){let t=r??"longpipe";if(t!=="longpipe"){if(e.touchup)throw E("touchup",t,"init-failed");if(e.reframe)throw E("reframe",t,"init-failed");if(e.preset!==void 0&&e.preset!=="auto")throw E(`preset ${JSON.stringify(e.preset)}`,t,"init-failed")}}var m={controlTimeoutMs:1e4,queueTimeoutMs:3e4,initTimeoutMs:3e4,heartbeatMs:1e3,watchdogMs:5e3,retireGraceMs:500,stallMs:3e3,maxRestarts:3,restartBackoffMs:[250,1e3,3e3],stableResetMs:6e4,forceTopology:null,forceBackend:null,simulateHiddenOrientation:null};({restartBackoffMs:[...m.restartBackoffMs]});var ye=b("worker_controller"),H=class{constructor(e,t){this.onCrash=t;this.worker=e,this.worker.addEventListener("message",this.handleMessage.bind(this)),this.worker.addEventListener("error",n=>{this.onCrash?.(`worker error: ${n.message||"uncaught exception / script failed to load"}`,n);}),this.worker.addEventListener("messageerror",n=>{this.onCrash?.("worker messageerror: a message could not be deserialized",n);}),ye("constructed; listeners attached");}onCrash;worker;pending=new Map;persistent=new Map;terminated=false;get isTerminated(){return this.terminated}handleMessage(e){let{request_id:t}=e.data,n=this.persistent.get(t);if(n){n(e.data.res);return}let a=this.pending.get(t);if(!a)return;this.pending.delete(t),a.timer&&clearTimeout(a.timer);let i=e.data;i.error?a.reject(new c("control-failed",i.error.message,{cause:i.error})):a.resolve(i.res);}addPersistentListener(e,t){this.persistent.set(e,t);}removePersistentListener(e){this.persistent.delete(e);}sendMessage(e,t,n=[],a={}){if(this.terminated)return Promise.reject(new c("worker-crash",`${e}: worker is not running`));let i=crypto.randomUUID();return ye("sendMessage:",e,"request_id=",i,"transferables=",n.length),new Promise((l,s)=>{let o=a.timeoutMs??m.controlTimeoutMs,u=o>0?setTimeout(()=>{this.pending.delete(i)&&s(new c("control-timeout",`${e}: no response from the worker after ${o} ms`));},o):null;this.pending.set(i,{cmd:e,resolve:l,reject:s,timer:u});let h={cmd:e,data:t,request_id:i};try{this.worker.postMessage(h,n);}catch(d){this.pending.delete(i),u&&clearTimeout(u),s(new c("control-failed",`${e}: could not send to the worker: ${d.message}`,{cause:d}));}})}terminate(e="worker terminated",t=0){if(!this.terminated){this.terminated=true,t>0?this.retire(t):this.worker.terminate();for(let[,n]of this.pending)n.timer&&clearTimeout(n.timer),n.reject(new c("worker-crash",`${n.cmd}: ${e}`));this.pending.clear(),this.persistent.clear();}}retire(e){let t=this.worker,n=crypto.randomUUID(),a=false,i=()=>{a||(a=true,clearTimeout(s),t.removeEventListener("message",l),t.terminate());},l=o=>{o.data?.request_id===n&&i();},s=setTimeout(i,e);t.addEventListener("message",l);try{let o={cmd:"destroy",data:{},request_id:n};t.postMessage(o);}catch{i();}}};var N=32,ke=1e3,Je=.8,Ze=2/255;function Te(){return typeof VideoFrame<"u"&&"rotation"in VideoFrame.prototype}function et(r,e,t){let n=e*t,a=new Float32Array(n),i=0;for(let o=0;o<n;o++){let u=(.299*r[o*4]+.587*r[o*4+1]+.114*r[o*4+2])/255;a[o]=u,i+=u;}i/=n;let l=0;for(let o=0;o<n;o++)l+=(a[o]-i)**2;let s=Math.sqrt(l/n);if(s<Ze)return null;for(let o=0;o<n;o++)a[o]=(a[o]-i)/s;return {w:e,h:t,data:a}}function tt(r){return (r?[90,270]:[0,180]).flatMap(t=>[{rotation:t,flip:false},{rotation:t,flip:true}])}function nt(r,e,t){let n=g(t),a=0;for(let i=0;i<r.h;i++)for(let l=0;l<r.w;l++){let[s,o]=h(n,(l+.5)/r.w,(i+.5)/r.h),u=Math.min(e.w-1,Math.max(0,Math.floor(s*e.w))),h$1=Math.min(e.h-1,Math.max(0,Math.floor(o*e.h)));a+=Math.abs(r.data[i*r.w+l]-e.data[h$1*e.w+u]);}return a/(r.w*r.h)}function rt(r,e,t,n){let a=tt(t).map(s=>({o:s,err:nt(r,e,s)})),i=a.reduce((s,o)=>o.err<s.err?o:s),l=a.find(s=>f(s.o,n));return l&&!(i.err<l.err*Je)?{orientation:l.o,errors:a}:{orientation:i.o,errors:a}}var Ce=(r,e)=>r>=e?{w:N,h:Math.max(1,Math.round(N*e/r))}:{w:Math.max(1,Math.round(N*r/e)),h:N};function Pe(r,e$1){let t=e,n=-1/0,a="",i=null,l=null,s=false,o=(u,h,d,p)=>(u.canvas.width=d,u.canvas.height=p,u.drawImage(h,0,0,d,p),et(u.getImageData(0,0,d,p).data,d,p));return {measure(u){if(s)return t;let h=r.videoWidth,d=r.videoHeight,p=u.displayWidth,f$1=u.displayHeight;if(!h||!d||!p||!f$1)return t;let g=`${h}x${d}/${p}x${f$1}`,v=performance.now();if(g===a&&v-n<ke)return t;a=g,n=v;let I=h>d!=p>f$1&&h!==d&&p!==f$1;try{i??=new OffscreenCanvas(1,1).getContext("2d",{willReadFrequently:!0}),l??=new OffscreenCanvas(1,1).getContext("2d",{willReadFrequently:!0});let T=Ce(h,d),_=Ce(p,f$1),y=o(i,r,T.w,T.h),x=o(l,u,_.w,_.h);if(!y||!x)return I!==(t.rotation===90||t.rotation===270)&&(t={rotation:I?90:0,flip:t.flip},e$1?.("orientation (inconclusive, axis from sizes):",t)),n=v-ke+200,t;let b=rt(y,x,I,t);f(b.orientation,t)||(e$1?.("orientation",t,"\u2192",b.orientation,"video",h,d,"frame",p,f$1,b.errors.map(F=>`${F.o.rotation}${F.o.flip?"f":""}:${F.err.toFixed(3)}`).join(" ")),t=b.orientation);}catch(T){s=true,e$1?.("orientation probe disabled:",T);}return t}}}var K=b("input-postmessage/main");function Ee(r){let e=document.createElement("video");e.srcObject=r,e.muted=true,e.autoplay=true,e.playsInline=true,e.play().catch(p=>{K.warn("video.play() rejected:",p);});let t=e.requestVideoFrameCallback?.bind(e);if(!t)throw new Error("setupPostMessageInput: requestVideoFrameCallback not supported on this browser");let n=new MessageChannel,a=n.port1,i=n.port2,l=Te()?null:Pe(e,K),s=false,o=0,u=0,h=(p,f)=>{if(s)return;u++,o=f.presentedFrames??u;let g=null;try{g=new VideoFrame(e,{timestamp:f.mediaTime*1e6});let v=m.simulateHiddenOrientation??l?.measure(g);a.postMessage({frame:g,orientation:v,sentAt:performance.timeOrigin+performance.now()},[g]);}catch(v){g?.close(),K.warn("VideoFrame() failed; skipping frame:",v);}t(h);};return t(h),{port:i,transferList:[i],framesIn:()=>o,cleanup:()=>{s=true,a.close(),e.srcObject=null,e.pause();}}}function Se(r){let e=r.getVideoTracks();if(e.length===0)throw new Error("setupMstpInput: input MediaStream has no video tracks");let t=e[0],n=self.MediaStreamTrackProcessor;if(!n)throw new Error("setupMstpInput: MediaStreamTrackProcessor not supported on this browser");let i=new n({track:t}).readable;return {readable:i,transferList:[i],cleanup:()=>{i.cancel().catch(()=>{});}}}function B(r,e){switch(r){case "mstp":{let t=Se(e);return {initFields:{inputReadable:t.readable},transferList:t.transferList,cleanup:t.cleanup}}case "rvfc-postmessage":{let t=Ee(e);return {initFields:{inputPort:t.port},transferList:t.transferList,framesIn:t.framesIn,cleanup:t.cleanup}}}}var at=b("bitmap-shuttle/main"),it=30,st=3;function Ae(r,e=it){let t=document.createElement("canvas");t.width=r.w,t.height=r.h;let n=t.getContext("bitmaprenderer");if(!n)throw new Error("setupBitmapShuttleOutput: bitmaprenderer context not available");let i=t.captureStream(e).getVideoTracks();if(i.length===0)throw new Error("setupBitmapShuttleOutput: captureStream produced no video tracks");let l=i[0],s=null,o=false,u=null,h=0,d=()=>{o=false,u&&(u.srcObject=null,u.pause(),u=null);},p=()=>{s&&(s.onmessage=null,s.close(),s=null);},f=()=>{p();let T=new MessageChannel,_=T.port1;return s=_,h=0,_.onmessage=y=>{if(s!==_){y.data.bmp.close();return}if(o){if(h++,h<st){y.data.bmp.close();return}d();}try{let x=y.data.bmp;(x.width!==t.width||x.height!==t.height)&&(t.width=x.width,t.height=x.height),n.transferFromImageBitmap(x);}catch(x){at.warn("transferFromImageBitmap failed:",x),y.data.bmp.close();}},_.start(),{port:T.port2,transferList:[T.port2]}},g=T=>{if(p(),d(),!T.getVideoTracks().some(b=>b.readyState!=="ended"))return  false;o=true,h=0;let _=document.createElement("video");_.srcObject=T,_.muted=true,_.playsInline=true,_.play().catch(()=>{}),u=_;let y="requestVideoFrameCallback"in _?b=>{_.requestVideoFrameCallback(b);}:b=>{requestAnimationFrame(b);},x=()=>{if(!o||u!==_)return;if(_.videoWidth===0){y(x);return}let b=_.videoWidth,F=_.videoHeight;if(b!==F&&t.width!==t.height&&b>F!=t.width>t.height){let M=t.width;t.width=t.height,t.height=M;}createImageBitmap(_,{resizeWidth:t.width,resizeHeight:t.height,resizeQuality:"medium"}).then(M=>{if(!o||u!==_){M.close();return}try{n.transferFromImageBitmap(M);}catch{M.close();}y(x);}).catch(()=>{y(x);});};return y(x),true},v=false,I=()=>{v||(v=true,d(),p(),l.stop());};return {videoTrack:l,attachWorker:f,startRaw:g,end:I,cleanup:I}}var ot=`
'use strict';
const HANDOFF_AT_FRAME = 3;
let writer = null;
let busy = false;
let raw = null;        // reader on the camera (kept across raw \u2194 worker switches)
let rawOn = false;     // raw frames go to the output (else they're dropped)
let port = null;       // active GPU-worker frame port
let workerFrames = 0;
let framesOut = 0;

function write(frame) {
  // Drop instead of queueing: a late frame is worse than a skipped one.
  if (!writer || busy) { frame.close(); return; }
  busy = true;
  framesOut++;
  writer.write(frame).then(() => { busy = false; }, () => { busy = false; });
}

function stopReader() {
  rawOn = false;
  if (!raw) return;
  const r = raw; raw = null;
  r.cancel().catch(() => {});
}

// One reader per camera track for the relay's lifetime. It keeps reading (and
// closing) while the GPU worker owns the output: cancelling a transferred
// camera readable and transferring a fresh one on every restart is what left
// unclosed VideoFrames behind in the page (Chromium), and an unread reader
// would pin camera buffers.
async function pump(reader) {
  for (;;) {
    let res;
    try { res = await reader.read(); } catch (e) { break; }
    if (res.done) break;
    if (raw === reader && rawOn) write(res.value);
    else res.value.close();
    if (raw !== reader) break;
  }
  if (raw === reader) { raw = null; rawOn = false; }
}

function startRaw(readable) {
  if (readable) {
    stopReader();
    raw = readable.getReader();
    pump(raw);
  }
  rawOn = !!raw;
  workerFrames = 0;
  postMessage({ type: 'mode', mode: 'raw' });
}

function detach() {
  if (port) { port.onmessage = null; port.close(); port = null; }
}

onmessage = (e) => {
  const d = e.data;
  if (d.type === 'init') {
    writer = d.writable.getWriter();
  } else if (d.type === 'raw') {
    if (d.detach) detach();
    startRaw(d.readable);
  } else if (d.type === 'worker') {
    detach();
    const p = d.port;
    port = p;
    workerFrames = 0;
    p.onmessage = (ev) => {
      const frame = ev.data.frame;
      if (port !== p) { frame.close(); return; }
      if (rawOn) {
        if (++workerFrames < HANDOFF_AT_FRAME) { frame.close(); return; }
        rawOn = false;
        postMessage({ type: 'mode', mode: 'worker' });
      }
      write(frame);
    };
    p.start();
  } else if (d.type === 'stats') {
    postMessage({ type: 'stats', framesOut, mode: rawOn ? 'raw' : (port ? 'worker' : 'idle') });
  } else if (d.type === 'close') {
    stopReader();
    detach();
    if (writer) writer.close().catch(() => {});
    writer = null;
    postMessage({ type: 'closed' });
  }
};
`;function Ie(){let r=URL.createObjectURL(new Blob([ot],{type:"application/javascript"})),e=new Worker(r);return URL.revokeObjectURL(r),e}var ut=b("mstg/main");function Fe(r){let e=self.MediaStreamTrackGenerator;if(!e)throw new Error("setupMstgOutput: MediaStreamTrackGenerator not supported on this browser");let t=new e({kind:"video"}),n=Ie();n.postMessage({type:"init",writable:t.writable},[t.writable]),n.onmessage=p=>{p.data.type==="mode"&&p.data.mode&&(ut("relay mode:",p.data.mode),r?.(p.data.mode));},n.onerror=p=>console.error("[longpipe/pipeline] output relay worker error:",p.message);let a=()=>{let p=new MessageChannel;return n.postMessage({type:"worker",port:p.port1},[p.port1]),{port:p.port2,transferList:[p.port2]}},i=null,l=p=>{let f=p.getVideoTracks()[0],g=self.MediaStreamTrackProcessor;if(!f||f.readyState==="ended"||!g)return  false;if(f===i)return n.postMessage({type:"raw",detach:true}),true;let{readable:v}=new g({track:f});return i=f,n.postMessage({type:"raw",readable:v,detach:true},[v]),true},s=false,o=null,u=()=>{s||(s=true,o=new Promise(p=>{let f=setTimeout(p,1e3);n.addEventListener("message",g=>{g.data.type==="closed"&&(clearTimeout(f),p());});}),n.postMessage({type:"close"}),t.stop());},h=false;return {videoTrack:t,attachWorker:a,startRaw:l,end:u,cleanup:()=>{u(),!h&&(h=true,o.then(()=>n.terminate()));}}}function Re(r,e=30){let t=document.createElement("canvas");t.width=r.w,t.height=r.h;let a=t.captureStream(e).getVideoTracks();if(a.length===0)throw new Error("setupTransferCaptureOutput: captureStream produced no video tracks");let i=a[0],l=t.transferControlToOffscreen();return {videoTrack:i,canvas:l,transferList:[l],cleanup:()=>{i.stop();}}}function Y(r,e){switch(r){case "mstg":{let t=Fe();return {path:r,videoTrack:t.videoTrack,reusable:true,attachWorker:()=>{let n=t.attachWorker();return {initFields:{outputFramePort:n.port},transferList:n.transferList}},startRaw:t.startRaw,end:t.end,cleanup:t.cleanup}}case "transfer-capture":{let t=Re(e),n=false;return {path:r,videoTrack:t.videoTrack,reusable:false,attachWorker:()=>{if(n)throw new Error("transfer-capture: output canvas already belongs to a worker");return n=true,{initFields:{outputCanvas:t.canvas},transferList:t.transferList}},startRaw:()=>false,end:t.cleanup,cleanup:t.cleanup}}case "bitmap-shuttle":{let t=Ae(e);return {path:r,videoTrack:t.videoTrack,reusable:true,attachWorker:()=>{let n=t.attachWorker();return {initFields:{outputPort:n.port},transferList:n.transferList}},startRaw:t.startRaw,end:t.end,cleanup:t.cleanup}}}}var G=class{constructor(e,t){this.getTrack=e;this.getFramesIn=t;}getTrack;getFramesIn;samples=[];totalFrames(){let e=this.getFramesIn();if(e)return e();let t=this.getTrack()?.stats;return typeof t?.totalFrames=="number"?t.totalFrames:null}sample(e=performance.now()){let t=this.totalFrames();if(t===null){this.samples=[];return}for(this.samples.push({t:e,frames:t});this.samples.length>1&&e-this.samples[0].t>3e3;)this.samples.shift();}fps(){let e=this.samples[0],t=this.samples[this.samples.length-1];if(e&&t&&t.t-e.t>=900&&t.frames>=e.frames)return (t.frames-e.frames)*1e3/(t.t-e.t);let n=this.getTrack()?.getSettings?.().frameRate;return typeof n=="number"&&n>0?n:null}reset(){this.samples=[];}};var Q=`var qi=Object.defineProperty;var Ki=(u,e,r)=>e in u?qi(u,e,{enumerable:!0,configurable:!0,writable:!0,value:r}):u[e]=r;var i=(u,e,r)=>Ki(u,typeof e!="symbol"?e+"":e,r);var Wr=!1;function Yr(u){Wr=u}function le(u){let e=\`[longpipe/\${u}]\`,r=((...t)=>{Wr&&console.log(e,...t)});return r.warn=(...t)=>{Wr&&console.warn(e,...t)},r}var Gr=[{model:"xs",dtype:"f16",resolution:{w:384,h:240},skipFrames:2},{model:"small",dtype:"f16",resolution:{w:384,h:224},skipFrames:1},{model:"medium",dtype:"f16",resolution:{w:512,h:320},skipFrames:1},{model:"large",dtype:"f32",resolution:{w:640,h:400},skipFrames:0},{model:"xl",dtype:"f32",resolution:{w:1280,h:768},skipFrames:0}],Qr={fast:0,balanced:2,quality:4,xs:0,small:1,medium:2,large:3,xl:4};function Ge(u){if(u==="auto")return null;let e=Object.hasOwn(Qr,u)?Qr[u]:void 0;return e===void 0?null:Gr[e]}function R(u,e){return u.batch?u.batch(e):e()}var Ue=class{constructor(e,r,t,a){i(this,"op");this.op=e.ops.BilinearUpsample(r,{outH:t,outW:a})}get output(){return this.op.output}run(){this.op.run()}};var Be=class{constructor(e,r,t,a){i(this,"op");this.op=e.ops.BicubicUpsample(r,{outH:t,outW:a})}get output(){return this.op.output}run(){this.op.run()}};var Se=class{constructor(e,r,t,a,o="main"){i(this,"presenter");this.presenter=e.presenters.CompositeSolid(r,t,a,o)}run(){this.presenter.run()}};var Le=class{constructor(e,r,t,a,o="main"){i(this,"presenter");this.presenter=e.presenters.CompositeImage(r,t,a,o)}run(){this.presenter.run()}};var Ae=class{constructor(e,r,t){i(this,"downs",[]);i(this,"ups",[]);let a=Yi(t),o=r;for(let s=0;s<a;s++){let n=e.ops.BilinearUpsample(o,{outH:Math.max(1,Math.floor(o.h/2)),outW:Math.max(1,Math.floor(o.w/2))});this.downs.push(n),o=n.output}for(let s=a-1;s>=1;s--){let n=this.downs[s-1].output,p=e.ops.BilinearUpsample(o,{outH:n.h,outW:n.w});this.ups.push(p),o=p.output}}get output(){return this.ups.length>0?this.ups[this.ups.length-1].output:this.downs[0].output}run(){for(let e of this.downs)e.run();for(let e of this.ups)e.run()}};function Yi(u){let e=Math.max(1,3*u);return Math.max(2,Math.min(6,Math.round(Math.log2(e))))}var Qi=.05,Ee=class{constructor(e,r,t,a,o="main"){i(this,"blur");i(this,"presenter");a<=Qi?(this.blur=null,this.presenter=e.presenters.CompositeImage(r,t,r,o)):(this.blur=new Ae(e,r,a),this.presenter=e.presenters.CompositeImageBilinear(r,t,this.blur.output,o))}run(){this.blur?.run(),this.presenter.run()}};var ye=class{constructor(e){i(this,"backend",e);i(this,"displayInput");i(this,"image");i(this,"network",null);i(this,"networkInput",null);i(this,"upscaler",null);i(this,"upscalerMode","bilinear");i(this,"bgConfig",{mode:"solid",color:[0,0,0]});i(this,"effectChain",[]);i(this,"viewRect",null);i(this,"viewFg",null);i(this,"viewAlpha",null);i(this,"displayDirty",!1);i(this,"compositors",new Map);let r=e.canvas;this.displayInput=e.ops.Input(r.height,r.width),this.image=this.displayInput.output}attachNetwork(e,r,t){this.network=e,this.networkInput=r,this.upscalerMode=t.upscaler,this.bgConfig=t.background,this.upscaler=this.makeUpscaler(),this.rebuildView(),this.compositors.clear()}hasNetwork(){return this.network!==null}setSource(e,r){this.networkInput?.setSource(e,r),this.displayInput.setSource(e,r),this.displayDirty=!0}setUpscaler(e){e!==this.upscalerMode&&(this.upscalerMode=e,this.network&&(this.upscaler=this.makeUpscaler(),this.rebuildView(),this.compositors.clear()))}setBackground(e){this.bgConfig=e}get displayImage(){return this.image}fgImage(){return this.viewFg?this.viewFg.output:this.chainTail()}chainTail(){return this.effectChain.length?this.effectChain[this.effectChain.length-1].output:this.image}alphaImage(){if(!this.upscaler)throw new Error("RenderOp.alphaImage called before attachNetwork");return this.viewAlpha?this.viewAlpha.output:this.upscaler.output}setViewTransform(e){this.viewRect=e,this.rebuildView(),this.compositors.clear()}rebuildView(){this.viewFg=null,this.viewAlpha=null,this.viewRect&&(this.viewFg=this.backend.ops.Reframe(this.chainTail(),this.viewRect),this.upscaler&&(this.viewAlpha=this.backend.ops.Reframe(this.upscaler.output,this.viewRect)))}setEffectChain(e){this.effectChain=e,this.rebuildView(),this.compositors.clear()}runEffects(){for(let e of this.effectChain)e.run();this.viewFg?.run(),this.viewAlpha?.run()}run(){R(this.backend,()=>{this.runModel(),this.runDisplay()})}runDisplay(){R(this.backend,()=>{this.refreshDisplayInput(),this.runEffects(),this.compositeMain("effect")})}runFgPassthrough(){R(this.backend,()=>{this.refreshDisplayInput(),this.runEffects(),this.compositeMain("fg")})}runPassthrough(){R(this.backend,()=>{this.refreshDisplayInput(),this.compositeMain("raw")})}compositeMain(e){let r=e==="effect"?this.bgConfig:e==="fg"?{mode:"fg-passthrough"}:{mode:"passthrough"};this.compositeTo("main",r)}refreshDisplayInput(){this.displayDirty&&(this.displayInput.run(),this.displayDirty=!1)}compositeTo(e,r){let t=this.compositors.get(e);if(t&&Ji(t.spec,r)){t.handle.run();return}let a=this.buildCompositor(e,r);this.compositors.set(e,{spec:r,handle:a}),a.run()}applyAlpha(e){if(!this.network||!this.upscaler)throw new Error("RenderOp.applyAlpha called before attachNetwork");R(this.backend,()=>{this.backend.copyTensor(e,this.network.output),this.upscaler.run()})}runModel(){if(!this.network||!this.networkInput||!this.upscaler)throw new Error("RenderOp.runModel called before attachNetwork");let{networkInput:e,network:r,upscaler:t}=this;R(this.backend,()=>{e.run(),r.run(),t.run()})}makeUpscaler(){if(!this.network)throw new Error("makeUpscaler called with no network");let{backend:e,network:r,image:t}=this;return this.upscalerMode==="bicubic"?new Be(e,r.output,t.h,t.w):new Ue(e,r.output,t.h,t.w)}buildCompositor(e,r){let{backend:t,image:a}=this;if(r.mode==="passthrough")return t.presenters.CompositePassthrough(a,e);let o=this.fgImage();if(r.mode==="fg-passthrough")return t.presenters.CompositePassthrough(o,e);if(!this.upscaler)throw new Error("RenderOp.compositeTo (effect spec) called before attachNetwork");let s=this.alphaImage();switch(r.mode){case"solid":return new Se(t,o,s,r.color,e);case"image":return new Le(t,o,s,r.image,e);case"blur":return new Ee(t,o,s,r.sigma,e)}}};function Ji(u,e){if(u.mode!==e.mode)return!1;switch(e.mode){case"passthrough":return!0;case"fg-passthrough":return!0;case"solid":{let r=u.color;return r[0]===e.color[0]&&r[1]===e.color[1]&&r[2]===e.color[2]}case"blur":return u.sigma===e.sigma;case"image":return u.image===e.image}}var Zi=u=>typeof u=="object"&&u!==null&&typeof u.offset=="number"&&typeof u.length=="number";function Fe(u){if(u.byteLength<4)throw new Error("weights buffer too small");let e=new DataView(u,0,4).getUint32(0,!0),r=4+e;if(u.byteLength<r)throw new Error("weights buffer truncated (header)");let t=new Uint8Array(u,4,e),a=JSON.parse(new TextDecoder().decode(t)),o=a.__dtype__??"f32",s=o==="f16"?2:4;if(r%s!==0)throw new Error(\`payload not \${s}-byte aligned (header=\${e})\`);let n=(u.byteLength-r)/s,p=c=>{if(Zi(c)){let{offset:l,length:d}=c;if(l+d>n)throw new Error(\`array ref out of range: offset=\${l} length=\${d}\`);let f=r+l*s;return o==="f16"?new Uint16Array(u,f,d):new Float32Array(u,f,d)}if(Array.isArray(c))return c.map(p);if(typeof c=="object"&&c!==null){let l={};for(let d of Object.keys(c))d!=="__dtype__"&&(l[d]=p(c[d]));return l}return c};return p(a)}function Jr(u,e,r,t){let a=t.variant,o=a==="E"||a==="D",s=a==="D",n=e.h,p=e.w,c=[],l=null,d=null,f=0,x=0,_;if(o)if(s){if(!r.down2)throw new Error("variant D requires w.down2");f=Math.round(n/1.25),x=Math.round(p/1.25);let b=u.ops.Conv2d(e,r.down1,{outChannels:t.cHigh,kernel:3,stride:1,padding:1,activation:"relu"});c.push(b),d=b.output;let v=u.ops.BilinearUpsample(d,{outH:f,outW:x});c.push(v),l=v.output;let y=u.ops.DownAdapter(l,r.down2,r.adapter,{stride:2});c.push(y),_=y.output}else{if(!r.down2)throw new Error("variant E requires w.down2");let b=u.ops.Conv2d(e,r.down1,{outChannels:t.cHigh,kernel:3,stride:2,padding:1,activation:"relu"});c.push(b),l=b.output,f=l.h,x=l.w;let v=u.ops.DownAdapter(l,r.down2,r.adapter,{stride:2});c.push(v),_=v.output}else{let b=a==="A"?2:3,v=u.ops.DownAdapter(e,r.down1,r.adapter,{stride:b});c.push(v),_=v.output}return{steps:c,adapted:_,d1:l,dFull:d,midH:f,midW:x}}function Zr(u,e,r,t,a,o,s,n,p){let c=p.variant,l=c==="E"||c==="D",d=c==="D",f=[],x=u.ops.ConvExpand(r,n.expandFeat);f.push(x);let _=x.output,b;if(l){if(!n.up1Combine)throw new Error("two-stage variant requires w.up1Combine");let y=u.ops.BilinearUpsample(_,{outH:o,outW:s});f.push(y);let k=u.ops.CatConv6to2(y.output,t,n.up1Combine);f.push(k);let P=u.ops.BilinearUpsample(k.output,{outH:e.h,outW:e.w});f.push(P),b=P.output}else{let y=u.ops.BilinearUpsample(_,{outH:e.h,outW:e.w});f.push(y),b=y.output}let v=d?u.ops.UpFinalSkip(b,a,e,n.upCombine):u.ops.UpFinal(b,e,n.upCombine);return f.push(v),{steps:f,alpha:v.output}}var Oe=class{constructor(e,r,t,a,o,s){i(this,"backend",e);i(this,"inputs");i(this,"output");i(this,"encoderTaps");i(this,"halfTap");i(this,"steps");this.inputs=[r];let n=Jr(e,r,a,o),p=new s(e,n.adapted,t),c=e.ops.BilinearUpsample(p.featLowRes,{outH:n.adapted.h,outW:n.adapted.w}),l=Zr(e,r,c.output,n.d1,n.dFull,n.midH,n.midW,a,o);this.steps=[...n.steps,p,c,...l.steps],this.output=l.alpha,this.encoderTaps=p.encoderTaps,this.halfTap=p.halfTap}run(){R(this.backend,()=>{for(let e of this.steps)e.run()})}};var es=[5,5,3,3],ts=[2,2,1,1];function Re(u,e,r,t){if(e.h===r.h&&e.w===r.w)return e;let a=u.ops.Crop(e,{outH:r.h,outW:r.w});return t.push(a),a.output}var De=class{constructor(e,r,t,a,o,s=16,n={}){i(this,"backend",e);i(this,"inputs");i(this,"output");i(this,"steps");this.inputs=[r,t,...a,...n.halfTap?[n.halfTap]:[]];let p=[],c=e.ops.ChannelConcat(r,t);p.push(c);let l=e.ops.Conv2d(c.output,o.stem,{outChannels:s,kernel:7,stride:2,padding:3,activation:"relu6"});p.push(l);let d=[],f=l.output;if(n.fuseStem&&n.halfTap){let v=Re(e,n.halfTap,l.output,p),y=e.ops.ChannelConcat(l.output,v);p.push(y),d.push(y.output),f=y.output}for(let v=0;v<a.length;v++){let y=e.ops.Conv2d(f,o.stages[v],{outChannels:s,kernel:es[v],stride:2,padding:ts[v],activation:"relu6"});p.push(y);let k=Re(e,a[v],y.output,p),P=e.ops.ChannelConcat(y.output,k);p.push(P),d.push(P.output),f=P.output}let x=e.ops.Conv2d(d[d.length-1],o.predictBot,{outChannels:4,kernel:3,stride:1,padding:1,activation:"none"});p.push(x);let _=x.output,b=d[d.length-1];for(let v=0;v<d.length-1;v++){let y=d.length-2-v,k=e.ops.BilinearUpsample(b,{outH:b.h*2,outW:b.w*2}),P=e.ops.Conv2d(k.output,o.deconv[v],{outChannels:s,kernel:3,stride:1,padding:1,activation:"relu6"}),S=e.ops.BilinearUpsample(_,{outH:_.h*2,outW:_.w*2});p.push(k,P,S);let C=Re(e,P.output,d[y],p),E=Re(e,S.output,d[y],p),F=e.ops.ChannelConcat(d[y],C),O=e.ops.ChannelConcat(F.output,E);p.push(F,O);let I=e.ops.Conv2d(O.output,o.predict[v],{outChannels:4,kernel:3,stride:1,padding:1,activation:"none"});p.push(I),_=I.output,b=O.output}this.output=_,this.steps=p}run(){R(this.backend,()=>{for(let e of this.steps)e.run()})}};var z=class{constructor(e,r,t,a,o){i(this,"inputs");i(this,"output");i(this,"upOp");i(this,"concatConvOp");i(this,"conv2Op");this.inputs=[r,t],this.upOp=e.ops.BilinearUpsample(r,{outH:t.h,outW:t.w}),this.concatConvOp=e.ops.ConcatConv2d(this.upOp.output,t,a.conv1,{outChannels:o.outChannels}),this.conv2Op=e.ops.Conv2d(this.concatConvOp.output,a.conv2,{outChannels:o.outChannels,kernel:3,stride:1,padding:1,activation:"relu6"}),this.output=this.conv2Op.output}run(){this.upOp.run(),this.concatConvOp.run(),this.conv2Op.run()}};var rs=64,os=48,as=32,is=8,Ie=class{constructor(e,r,t){i(this,"backend",e);i(this,"inputs");i(this,"output");i(this,"steps");if(r.length<3)throw new Error(\`FaceHeatmapNet: needs \\u22653 encoder taps, got \${r.length}\`);let a=r[r.length-1],o=r[r.length-2],s=r[r.length-3];this.inputs=[a,o,s];let n=[],p=e.ops.Conv2d(a,t.proj,{outChannels:rs,kernel:1,stride:1,padding:0,activation:"relu6"});n.push(p);let c=new z(e,p.output,o,t.block1,{outChannels:os}),l=new z(e,c.output,s,t.block2,{outChannels:as});n.push(c,l);let d=e.ops.Conv2d(l.output,t.out,{outChannels:is,kernel:1,stride:1,padding:0,activation:"none"}),f=e.ops.Sigmoid(d.output);n.push(d,f),this.output=f.output,this.steps=n}run(){R(this.backend,()=>{for(let e of this.steps)e.run()})}};var ss=8,we=[{c:12,stride:2},{c:12,stride:1},{c:24,stride:2},{c:24,stride:1},{c:48,stride:2},{c:48,stride:1},{c:48,stride:1},{c:64,stride:2},{c:64,stride:1},{c:96,stride:2}],ns=32,us=478,ps=us*2,Me=class{constructor(e,r,t){i(this,"backend",e);i(this,"inputs");i(this,"output");i(this,"steps");if(t.blocks.length!==we.length)throw new Error(\`LandmarkNet: expected \${we.length} block weights, got \${t.blocks.length}\`);this.inputs=[r];let a=[],o=e.ops.Conv2d(r,t.stem,{outChannels:ss,kernel:3,stride:2,padding:1,activation:"relu6"});a.push(o);let s=o.output;for(let c=0;c<we.length;c++){let l=e.ops.Conv2d(s,t.blocks[c],{outChannels:we[c].c,kernel:3,stride:we[c].stride,padding:1,activation:"relu6"});a.push(l),s=l.output}let n=e.ops.Conv2d(s,t.headConv,{outChannels:ns,kernel:1,stride:1,padding:0,activation:"relu6"});a.push(n);let p=e.ops.Conv2d(n.output,t.fc,{outChannels:ps,kernel:n.output.h,stride:1,padding:0,activation:"none"});a.push(p),this.output=p.output,this.steps=a}run(){R(this.backend,()=>{for(let e of this.steps)e.run()})}};var Z=class{constructor(e,r,t,a){i(this,"inputs");i(this,"output");i(this,"dwOp");i(this,"pwOp");this.inputs=[r],this.dwOp=e.ops.DepthwiseConv2d(r,t.dw,{kernel:a.kernel,stride:a.stride,padding:a.padding,activation:"relu6"}),this.pwOp=e.ops.Conv2d(this.dwOp.output,t.pw,{outChannels:a.outChannels,kernel:1,stride:1,padding:0,activation:"none"}),this.output=this.pwOp.output}run(){this.dwOp.run(),this.pwOp.run()}};var T=class{constructor(e,r,t,a){i(this,"inputs");i(this,"output");i(this,"expandOp");i(this,"dwOp");i(this,"projOp");this.inputs=[r];let o=a.midChannels!==a.inChannels,s=a.stride===1&&a.inChannels===a.outChannels;this.expandOp=o?e.ops.Conv2d(r,t.expand,{outChannels:a.midChannels,kernel:1,stride:1,padding:0,activation:"relu6"}):null;let n=this.expandOp?this.expandOp.output:r;this.dwOp=e.ops.DepthwiseConv2d(n,t.dw,{kernel:a.kernel,stride:a.stride,padding:a.padding,activation:"relu6"}),this.projOp=s?e.ops.ProjResidual(this.dwOp.output,r,t.proj,{outChannels:a.outChannels}):e.ops.Conv2d(this.dwOp.output,t.proj,{outChannels:a.outChannels,kernel:1,stride:1,padding:0,activation:"none"}),this.output=this.projOp.output}run(){this.expandOp?.run(),this.dwOp.run(),this.projOp.run()}};var ze=class{constructor(e,r,t){i(this,"output");i(this,"featLowRes");i(this,"encoderTaps");i(this,"halfTap");i(this,"stem");i(this,"s0");i(this,"s1b0");i(this,"s1b1");i(this,"s2b0");i(this,"s2b1");i(this,"s3b0");i(this,"s3b1");i(this,"s3b2");i(this,"s4b0");i(this,"s4b1");i(this,"s4b2");i(this,"bottleneck");i(this,"dec0");i(this,"dec1");i(this,"finalUp");i(this,"outConv");i(this,"alpha");this.stem=e.ops.Conv2d(r,t.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new Z(e,this.stem.output,t.encoder.s0,{outChannels:16,kernel:3,stride:1,padding:1}),this.s1b0=new T(e,this.s0.output,t.encoder.s1[0],{inChannels:16,midChannels:96,outChannels:24,kernel:3,stride:2,padding:"same"}),this.s1b1=new T(e,this.s1b0.output,t.encoder.s1[1],{inChannels:24,midChannels:144,outChannels:24,kernel:3,stride:1,padding:1}),this.s2b0=new T(e,this.s1b1.output,t.encoder.s2[0],{inChannels:24,midChannels:144,outChannels:40,kernel:5,stride:2,padding:"same"}),this.s2b1=new T(e,this.s2b0.output,t.encoder.s2[1],{inChannels:40,midChannels:240,outChannels:40,kernel:5,stride:1,padding:2}),this.s3b0=new T(e,this.s2b1.output,t.encoder.s3[0],{inChannels:40,midChannels:240,outChannels:80,kernel:3,stride:2,padding:"same"}),this.s3b1=new T(e,this.s3b0.output,t.encoder.s3[1],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s3b2=new T(e,this.s3b1.output,t.encoder.s3[2],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s4b0=new T(e,this.s3b2.output,t.encoder.s4[0],{inChannels:80,midChannels:480,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b1=new T(e,this.s4b0.output,t.encoder.s4[1],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b2=new T(e,this.s4b1.output,t.encoder.s4[2],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.bottleneck=e.ops.Conv2d(this.s4b2.output,t.bottleneck,{outChannels:128,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new z(e,this.bottleneck.output,this.s2b1.output,t.decoder.blocks[0],{outChannels:64}),this.dec1=new z(e,this.dec0.output,this.s1b1.output,t.decoder.blocks[1],{outChannels:32}),this.finalUp=e.ops.UpsampleConv1x1(this.dec1.output,t.decoder.finalUpsample,{outH:this.dec1.output.h*2,outW:this.dec1.output.w*2,outChannels:32,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[this.s1b1.output,this.s2b1.output,this.s4b2.output],this.halfTap=this.s0.output,this.outConv=e.ops.Conv2d(this.finalUp.output,t.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output}run(){this.stem.run(),this.s0.run(),this.s1b0.run(),this.s1b1.run(),this.s2b0.run(),this.s2b1.run(),this.s3b0.run(),this.s3b1.run(),this.s3b2.run(),this.s4b0.run(),this.s4b1.run(),this.s4b2.run(),this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run()}};var He=class{constructor(e,r,t){i(this,"output");i(this,"featLowRes");i(this,"encoderTaps");i(this,"stem");i(this,"s0");i(this,"s1b0");i(this,"s1b1");i(this,"s2b0");i(this,"s2b1");i(this,"s3b0");i(this,"s3b1");i(this,"s3b2");i(this,"s4b0");i(this,"s4b1");i(this,"s4b2");i(this,"s5b0");i(this,"s5b1");i(this,"s5b2");i(this,"s5b3");i(this,"s6b0");i(this,"bottleneck");i(this,"dec0");i(this,"dec1");i(this,"dec2");i(this,"finalUp");i(this,"outConv");i(this,"alpha");this.stem=e.ops.Conv2d(r,t.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new Z(e,this.stem.output,t.encoder.s0,{outChannels:16,kernel:3,stride:1,padding:1}),this.s1b0=new T(e,this.s0.output,t.encoder.s1[0],{inChannels:16,midChannels:96,outChannels:24,kernel:3,stride:2,padding:"same"}),this.s1b1=new T(e,this.s1b0.output,t.encoder.s1[1],{inChannels:24,midChannels:144,outChannels:24,kernel:3,stride:1,padding:1}),this.s2b0=new T(e,this.s1b1.output,t.encoder.s2[0],{inChannels:24,midChannels:144,outChannels:40,kernel:5,stride:2,padding:"same"}),this.s2b1=new T(e,this.s2b0.output,t.encoder.s2[1],{inChannels:40,midChannels:240,outChannels:40,kernel:5,stride:1,padding:2}),this.s3b0=new T(e,this.s2b1.output,t.encoder.s3[0],{inChannels:40,midChannels:240,outChannels:80,kernel:3,stride:2,padding:"same"}),this.s3b1=new T(e,this.s3b0.output,t.encoder.s3[1],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s3b2=new T(e,this.s3b1.output,t.encoder.s3[2],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s4b0=new T(e,this.s3b2.output,t.encoder.s4[0],{inChannels:80,midChannels:480,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b1=new T(e,this.s4b0.output,t.encoder.s4[1],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b2=new T(e,this.s4b1.output,t.encoder.s4[2],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s5b0=new T(e,this.s4b2.output,t.encoder.s5[0],{inChannels:112,midChannels:672,outChannels:192,kernel:5,stride:2,padding:"same"}),this.s5b1=new T(e,this.s5b0.output,t.encoder.s5[1],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s5b2=new T(e,this.s5b1.output,t.encoder.s5[2],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s5b3=new T(e,this.s5b2.output,t.encoder.s5[3],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s6b0=new T(e,this.s5b3.output,t.encoder.s6[0],{inChannels:192,midChannels:1152,outChannels:320,kernel:3,stride:1,padding:1}),this.bottleneck=e.ops.Conv2d(this.s6b0.output,t.bottleneck,{outChannels:128,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new z(e,this.bottleneck.output,this.s4b2.output,t.decoder.blocks[0],{outChannels:64}),this.dec1=new z(e,this.dec0.output,this.s2b1.output,t.decoder.blocks[1],{outChannels:32}),this.dec2=new z(e,this.dec1.output,this.s1b1.output,t.decoder.blocks[2],{outChannels:16}),this.finalUp=e.ops.UpsampleConv1x1(this.dec2.output,t.decoder.finalUpsample,{outH:this.dec2.output.h*2,outW:this.dec2.output.w*2,outChannels:16,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[this.s1b1.output,this.s2b1.output,this.s4b2.output,this.s6b0.output],this.outConv=e.ops.Conv2d(this.finalUp.output,t.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output}run(){this.stem.run(),this.s0.run(),this.s1b0.run(),this.s1b1.run(),this.s2b0.run(),this.s2b1.run(),this.s3b0.run(),this.s3b1.run(),this.s3b2.run(),this.s4b0.run(),this.s4b1.run(),this.s4b2.run(),this.s5b0.run(),this.s5b1.run(),this.s5b2.run(),this.s5b3.run(),this.s6b0.run(),this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.dec2.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run()}};var Ur=[[{in:24,mid:144,out:32,k:3,s:2},{in:32,mid:192,out:32,k:3,s:1},{in:32,mid:192,out:32,k:3,s:1}],[{in:32,mid:192,out:48,k:5,s:2},{in:48,mid:288,out:48,k:5,s:1},{in:48,mid:288,out:48,k:5,s:1}],[{in:48,mid:288,out:96,k:3,s:2},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1}],[{in:96,mid:576,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1}],[{in:136,mid:816,out:232,k:5,s:2},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1}],[{in:232,mid:1392,out:384,k:3,s:1}]],Ne=class{constructor(e,r,t){i(this,"output");i(this,"featLowRes");i(this,"encoderTaps");i(this,"stem");i(this,"s0");i(this,"stages");i(this,"bottleneck");i(this,"dec0");i(this,"dec1");i(this,"dec2");i(this,"finalUp");i(this,"outConv");i(this,"alpha");this.stem=e.ops.Conv2d(r,t.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new Z(e,this.stem.output,t.encoder.s0,{outChannels:24,kernel:3,stride:1,padding:1});let a=[t.encoder.s1,t.encoder.s2,t.encoder.s3,t.encoder.s4,t.encoder.s5,t.encoder.s6];this.stages=[];let o=this.s0.output;for(let d=0;d<Ur.length;d++){let f=[];for(let x=0;x<Ur[d].length;x++){let _=Ur[d][x],b=new T(e,o,a[d][x],{inChannels:_.in,midChannels:_.mid,outChannels:_.out,kernel:_.k,stride:_.s,padding:_.s===2?"same":(_.k-1)/2});f.push(b),o=b.output}this.stages.push(f)}let s=d=>this.stages[d][this.stages[d].length-1].output,n=s(0),p=s(1),c=s(3),l=s(5);this.bottleneck=e.ops.Conv2d(l,t.bottleneck,{outChannels:256,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new z(e,this.bottleneck.output,c,t.decoder.blocks[0],{outChannels:128}),this.dec1=new z(e,this.dec0.output,p,t.decoder.blocks[1],{outChannels:64}),this.dec2=new z(e,this.dec1.output,n,t.decoder.blocks[2],{outChannels:32}),this.finalUp=e.ops.UpsampleConv1x1(this.dec2.output,t.decoder.finalUpsample,{outH:this.dec2.output.h*2,outW:this.dec2.output.w*2,outChannels:32,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[n,p,c,l],this.outConv=e.ops.Conv2d(this.finalUp.output,t.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output}run(){this.stem.run(),this.s0.run();for(let e of this.stages)for(let r of e)r.run();this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.dec2.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run()}};var eo=ze,to=He,cs=Ne,ee={xs:{base:eo,wrapper:{variant:"B",cHigh:4,cLow:4,cUp:2},canvasRes:{w:384,h:240},baseRes:{w:128,h:80},flowFuseStem:!0},small:{base:eo,wrapper:{variant:"A",cHigh:4,cLow:4,cUp:2},canvasRes:{w:384,h:224},baseRes:{w:192,h:112}},medium:{base:to,wrapper:{variant:"A",cHigh:4,cLow:4,cUp:2},canvasRes:{w:512,h:320},baseRes:{w:256,h:160}},large:{base:to,wrapper:{variant:"D",cHigh:4,cLow:4,cUp:2},canvasRes:{w:640,h:400},baseRes:{w:256,h:160}},xl:{base:cs,wrapper:{variant:"E",cHigh:4,cLow:4,cUp:2},canvasRes:{w:1280,h:768},baseRes:{w:320,h:192}}};var ro={square:{inputRes:{w:256,h:256},file:"mediapipe_selfie_segmenter.f16.bin"},landscape:{inputRes:{w:256,h:144},file:"mediapipe_selfie_segmenter_landscape.f16.bin"}};var Ve=class{constructor(e,r,t){i(this,"backend",e);i(this,"w",t);i(this,"inputs");i(this,"output");i(this,"steps",[]);if(!t?.layers)throw new Error("MediaPipeSelfie: weights have no \`layers\` \\u2014 expected a mediapipe_selfie_*.bin pack");if(r.h%16||r.w%16)throw new Error(\`MediaPipeSelfie: input \${r.w}\\xD7\${r.h} must be a multiple of 16 (use MEDIAPIPE_SELFIE_CONFIG)\`);let a=t.meta?.input;a&&(a.w!==r.w||a.h!==r.h)&&console.warn(\`[longpipe] MediaPipeSelfie: input \${r.w}\\xD7\${r.h} differs from the \${a.w}\\xD7\${a.h} these weights were trained at\`),this.inputs=[r];let o=(_,b,v)=>this.scale(_,this.conv(this.conv(this.pool(_),b,"relu"),v,"sigmoid")),s=(_,b,v,y,k={})=>{let P=k.act??"relu",S=this.depthwise(this.conv(_,b,P),v,P,k.stride??1);return k.se&&(S=o(S,...k.se)),k.residual?this.projResidual(S,_,y):this.conv(S,y)},n=(_,b,v,[y,k],P,S)=>{let C=this.upsampleConv(_,v),E=this.conv(this.conv(this.pool(this.add(b,C)),y,"relu"),k,"sigmoid"),F=this.conv(this.add(this.scale(b,E),C),P,"relu");return this.add(F,this.depthwise(F,S,"relu"))},p=this.conv(r,"conv2d","hswish",2),c=this.depthwise(this.conv(p,"conv2d_1","relu"),"depthwise_conv2d","relu",2);c=o(c,"conv2d_2","conv2d_3");let l=this.conv(c,"conv2d_4");c=s(l,"conv2d_5","depthwise_conv2d_1","conv2d_6",{stride:2});let d=s(c,"conv2d_7","depthwise_conv2d_2","conv2d_8",{residual:!0});c=s(d,"conv2d_9","depthwise_conv2d_3","conv2d_12",{stride:2,se:["conv2d_10","conv2d_11"],act:"hswish"});for(let _=0;_<4;_++){let b=13+4*_;c=s(c,\`conv2d_\${b}\`,\`depthwise_conv2d_\${4+_}\`,\`conv2d_\${b+3}\`,{se:[\`conv2d_\${b+1}\`,\`conv2d_\${b+2}\`],act:"hswish",residual:!0})}c=this.scale(this.conv(c,"conv2d_29","relu"),this.conv(this.pool(c),"conv2d_30","sigmoid")),c=n(c,d,"conv2d_31",["conv2d_32","conv2d_33"],"conv2d_34","depthwise_conv2d_8"),c=n(c,l,"conv2d_35",["conv2d_36","conv2d_37"],"conv2d_38","depthwise_conv2d_9"),c=n(c,p,"conv2d_39",["conv2d_40","conv2d_41"],"conv2d_42","depthwise_conv2d_10");let f=this.layer("segment"),x=e.ops.ConvTranspose2d(c,f,{outChannels:4,kernel:2,stride:2,padding:0,activation:"sigmoid"});this.check("segment",f.weights.length,4*(c.c/4)*16),this.steps.push(x),this.output=x.output}run(){R(this.backend,()=>{for(let e of this.steps)e.run()})}get opCount(){return this.steps.length}layer(e){let r=this.w.layers[e];if(!r)throw new Error(\`MediaPipeSelfie: weights missing layer '\${e}'\`);return r}check(e,r,t){if(r!==t)throw new Error(\`MediaPipeSelfie: layer '\${e}' has \${r} weights, expected \${t} \\u2014 wrong weight file?\`)}push(e){return this.steps.push(e),e.output}conv(e,r,t="none",a=1){let o=this.layer(r),s=o.bias.length,n=o.weights.length/(s/4*(e.c/4)*16),p=Math.round(Math.sqrt(n));return this.check(r,o.weights.length,p*p*(s/4)*(e.c/4)*16),this.push(this.backend.ops.Conv2d(e,o,{outChannels:s,kernel:p,stride:a,padding:"same",activation:t}))}depthwise(e,r,t,a=1){let o=this.layer(r),s=Math.round(Math.sqrt(o.weights.length/e.c));return this.check(r,o.weights.length,s*s*e.c),this.check(r,o.bias.length,e.c),this.push(this.backend.ops.DepthwiseConv2d(e,o,{kernel:s,stride:a,padding:"same",activation:t}))}projResidual(e,r,t){let a=this.layer(t),o=a.bias.length;if(this.check(t,a.weights.length,o/4*(e.c/4)*16),o!==r.c)throw new Error(\`MediaPipeSelfie: '\${t}' residual has \${r.c} channels, expected \${o}\`);return this.push(this.backend.ops.ProjResidual(e,r,a,{outChannels:o}))}upsampleConv(e,r){let t=this.layer(r),a=t.bias.length;return this.check(r,t.weights.length,a/4*(e.c/4)*16),this.push(this.backend.ops.UpsampleConv1x1(e,t,{outH:e.h*2,outW:e.w*2,outChannels:a,activation:"none"}))}pool(e){return this.push(this.backend.ops.GlobalAvgPool(e))}scale(e,r){return this.push(this.backend.ops.ChannelScale(e,r))}add(e,r){return this.push(this.backend.ops.Add(e,r))}};var Br=Object.freeze({rotation:0,flip:!1});function Sr(u){return!u||u.rotation===0&&!u.flip}function oo(u,e){let r=u??Br,t=e??Br;return r.rotation===t.rotation&&r.flip===t.flip}function ao(u){let e=(Math.round(Number(u)/90)*90%360+360)%360;return Number.isFinite(e)?e:0}function Xe(u,e,r){return r&&(r.rotation===90||r.rotation===270)?{w:e,h:u}:{w:u,h:e}}function je(u){let e=u?.rotation??0,r;switch(e){case 90:r=[0,1,0,-1,0,1];break;case 180:r=[-1,0,1,0,-1,1];break;case 270:r=[0,-1,1,1,0,0];break;default:r=[1,0,0,0,1,0]}return u?.flip&&(r=[-r[0],r[1],r[0]+r[2],-r[3],r[4],r[3]+r[5]]),r}var io=new WeakMap;function so(u,e){e&&!Sr(e)&&io.set(u,e)}function $e(u){return io.get(u)??Br}var Lr={zoom:1.35,gravity:.5,margin:.04},ls={deadband:.09,ease:.07},no=0,uo=1,ds=2,fs=16,ms={tLo:.15,tHi:2.5,leak:.15,release:.9,tDiv:1,divScale:2},po=256,hs=[.485,.456,.406],gs=[.229,.224,.225],_s={win:3,thresh:.15,boxScale:2.4},bs=new Set(["medium","large","xl"]),vs=4,xs=.6,ys={webgpu:6,webgl:30},ws=15,ks=5,co=1e3,Ke=class Ke{constructor(e){i(this,"canvas");i(this,"backend");i(this,"backendKind");i(this,"topology");i(this,"preset",null);i(this,"mediapipe",null);i(this,"enabled");i(this,"currentBackground");i(this,"modelTimingCounter",0);i(this,"renderOp");i(this,"flow",null);i(this,"faceChain",null);i(this,"faceCfg",null);i(this,"reframe",null);i(this,"reframeCfg",null);i(this,"reframeSolveOnce",!1);i(this,"faceLive",0);i(this,"faceProbePending",!1);i(this,"faceProbeCounter",0);i(this,"tier",null);i(this,"tierInput",null);i(this,"lastTierWeights",null);i(this,"bgImageInputs",new Map);i(this,"bgVideoInputs",new Map);i(this,"bgVideoPorts",new Map);i(this,"previewCanvas",null);i(this,"previewCtx",null);i(this,"previewBg",null);i(this,"previewEffectSpec",null);i(this,"previewIntervalMs",1e3/ws);i(this,"lastPreviewAt",0);i(this,"skipCounter",0);i(this,"framesRenderedAt",[]);i(this,"modelRunSamples",[]);i(this,"displayRunSamples",[]);i(this,"skippedCount",0);i(this,"externalOk");i(this,"orientationMismatch",0);i(this,"lastWeightsBuf",null);i(this,"inFlight",[]);i(this,"glFences",[]);this.backend=e.backend,this.backendKind=e.backendKind,this.canvas=e.canvas,this.enabled=e.enabled,this.currentBackground=e.background,this.topology=e.topology,this.renderOp=new ye(this.backend)}process(e,r=e){let t=this.sourceOrientation(e,r);this.followOrientation(r,t),R(this.backend,()=>this.processFrame(r,t))}sourceOrientation(e,r){let t=$e(e);if(!(r instanceof ImageBitmap))return t;let a=e,o=ao(a.rotation??0);return(o===90||o===270)&&r.width>r.height!=e.displayWidth>e.displayHeight?{rotation:o,flip:!!a.flip}:t}followOrientation(e,r){let t=e instanceof ImageBitmap?e.width:e.displayWidth,a=e instanceof ImageBitmap?e.height:e.displayHeight,o=Xe(t,a,r),s=this.canvas.width,n=this.canvas.height;if(!(o.w!==o.h&&s!==n&&o.w>o.h!=s>n)){this.orientationMismatch=0;return}++this.orientationMismatch<Ke.ORIENTATION_DEBOUNCE||(this.orientationMismatch=0,this.resizeOutput(n,s))}resizeOutput(e,r){e===this.canvas.width&&r===this.canvas.height||(this.canvas.width=e,this.canvas.height=r,this.previewCanvas&&(this.previewCanvas.width=e,this.previewCanvas.height=r),this.renderOp=new ye(this.backend),this.bgImageInputs.clear(),this.bgVideoInputs.clear(),this.renderOp.setBackground(this.translateBackgroundFor("main",this.currentBackground)),this.preset&&this.lastWeightsBuf?this.setPreset(this.preset,this.lastWeightsBuf):this.mediapipe&&this.lastWeightsBuf&&this.setMediaPipeSelfie(this.mediapipe,this.lastWeightsBuf),this.previewBg&&(this.previewEffectSpec=this.previewBg.kind==="none"?null:this.translateBackgroundFor("preview",this.previewBg)))}orientRes(e){return this.canvas.height>this.canvas.width===e.h>e.w?e:{w:e.h,h:e.w}}async waitForGpu(e=1){if(this.backendKind==="webgpu"){for(;this.inFlight.length>=e;)await this.inFlight.shift();return}let r=this.glContext();for(;this.glFences.length>=e;){let t=this.glFences.shift();r&&await Cs(r,t)}}markSubmitted(){if(this.backendKind==="webgpu"){let t=this.backend.device;t&&this.inFlight.push(t.queue.onSubmittedWorkDone().catch(()=>{}));return}let e=this.glContext();if(!e||e.isContextLost())return;let r=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);r&&(e.flush(),this.glFences.push(r))}glContext(){return this.backend.gl??null}async prepareSource(e){if(this.backendKind!=="webgpu")return e;if(this.externalOk===void 0){let r=this.backend.device;try{r?.importExternalTexture({source:e}),this.externalOk=!0}catch(t){this.externalOk=!1,console.warn("[longpipe] WebGPU external textures unavailable; copying frames as ImageBitmaps:",t?.message??t)}}return this.externalOk?e:await createImageBitmap(e)}processFrame(e,r){this.renderOp.setSource(e,r);let t=performance.now(),a=this.renderOp.hasNetwork(),o=this.enabled&&a&&this.faceChain!==null,s=this.enabled&&a&&this.currentBackground.kind!=="none",n=s||o,p=this.isPreviewTick(t),c=p&&a&&this.previewBg!==null&&this.previewBg.kind!=="none",l=!1;n&&this.flow?l=this.stepFlow():n&&(this.shouldRunModel()?(this.runModelOnce(),l=!0):this.skippedCount++),!l&&c&&(this.runModelOnce(),l=!0),o&&this.stepFace(l);let d=performance.now();p&&this.previewCanvas?(this.backendKind==="webgl"?this.compositePreviewWebGL(s,c,o):(this.compositeMain(s,o),this.renderOp.compositeTo("preview",this.previewSpec(c))),this.lastPreviewAt=t):this.compositeMain(s,o),this.displayRunSamples.push({ts:performance.now(),ms:performance.now()-d}),this.trimSamples(this.displayRunSamples),this.framesRenderedAt.push(performance.now()),this.trim(this.framesRenderedAt)}compositeMain(e,r){e?this.renderOp.runDisplay():r?this.renderOp.runFgPassthrough():this.renderOp.runPassthrough()}compositePreviewWebGL(e,r,t){this.renderOp.refreshDisplayInput(),this.renderOp.runEffects(),this.renderOp.compositeTo("preview",this.previewSpec(r));let a=this.canvas.transferToImageBitmap();this.previewCtx.transferFromImageBitmap(a),this.renderOp.compositeMain(e?"effect":t?"fg":"raw")}previewSpec(e){return e&&this.previewEffectSpec?this.previewEffectSpec:{mode:"passthrough"}}runModelOnce(){let e=performance.now();this.renderOp.runModel(),this.backendKind==="webgpu"&&this.modelTimingCounter%ks===0&&this.backend.sync().then(()=>{this.modelRunSamples.push({ts:performance.now(),ms:performance.now()-e}),this.trimSamples(this.modelRunSamples)}).catch(()=>{}),this.modelTimingCounter++}stepFlow(){let e=this.flow,r=!1;return e.networkInput.run(),e.curBaseDown.run(),e.everyFrame?(e.net.run(),e.up.run(),this.runModelOnce(),r=!0,this.backend.copyTensor(e.curBaseDown.output,e.frameAHeld),this.backend.copyTensor(e.tier.output,e.predBuf)):this.shouldRunModel()?(this.runModelOnce(),r=!0,this.backend.copyTensor(e.curBaseDown.output,e.frameAHeld),this.backend.copyTensor(e.tier.output,e.alphaHeld),this.backend.copyTensor(e.tier.output,e.predBuf)):(this.skippedCount++,e.net.run(),e.up.run(),e.predWarp.run(),this.backend.copyTensor(e.predWarp.output,e.predBuf)),e.warm?(e.refWarp.run(),e.stab.run(),this.backend.copyTensor(e.stab.output,e.stabPrev),this.renderOp.applyAlpha(e.stab.output),r):(this.backend.copyTensor(e.tier.output,e.stabPrev),e.warm=r,r)}stepFace(e){let r=this.faceChain;if(e?(r.face.run(),this.backend.copyTensor(r.face.output,r.hmBuf),r.hmHeld&&this.backend.copyTensor(r.face.output,r.hmHeld)):r.hmWarp&&this.flow&&(r.hmFlowDown.run(),r.hmWarp.run(),this.backend.copyTensor(r.hmWarp.output,r.hmBuf)),r.boxOp.run(),this.backend.copyTensor(r.boxOp.output,r.boxStable),r.stage){this.probeFaceOccupancy(r);let t=r.crops.length===1?1:this.faceLive;for(let a=0;a<t;a++)r.crops[a].run(),r.lms[a].run();if(t>0)for(let a of r.packLm)a.run();r.stage.setActiveSlots(t)}if(this.reframe){let t=this.reframe,a=t.auto?t.cmdAuto:this.reframeSolveOnce?t.cmdSolve:t.cmdHold;this.backend.copyTensor(a,t.cmd),this.reframeSolveOnce=!1,t.stateOp.run(),this.backend.copyTensor(t.stateOp.output,t.state)}}buildReframe(){this.reframe=null,this.renderOp.setViewTransform(null);let e=this.faceChain,r=this.reframeCfg;if(!r||!e||!this.preset)return;let t=this.orientRes(ee[this.preset.model].canvasRes),a=r.auto??!0,o=a!==!1,s={...ls,...typeof a=="object"?a:{}},n=d=>this.backend.tensor(1,1,4,new Float32Array(d)),p=this.backend.tensor(1,1,8,new Float32Array(8)),c=n([o?no:uo,0,0,0]),l=this.backend.ops.ReframeState(e.boxStable,p,c,{zoom:r.zoom??Lr.zoom,gravity:r.gravity??Lr.gravity,margin:r.margin??Lr.margin,deadband:s.deadband,ease:s.ease,aspect:t.w/t.h});this.reframe={stateOp:l,state:p,cmd:c,auto:o,cmdAuto:n([no,0,0,0]),cmdHold:n([uo,0,0,0]),cmdSolve:n([ds,0,0,0])},this.renderOp.setViewTransform(p)}probeFaceOccupancy(e){let r=e.crops.length;if(r===1)return;let t=ys[this.backendKind];this.faceProbePending||this.faceProbeCounter++%t!==0||(this.faceProbePending=!0,this.backend.readback(e.boxStable).then(a=>{let o=0;for(;o<r&&a[o*4+3]>0;)o++;this.faceLive=o,this.faceProbePending=!1}).catch(()=>{this.faceProbePending=!1}))}isPreviewTick(e){return!this.previewCanvas||this.previewBg===null||!this.enabled?!1:e-this.lastPreviewAt>=this.previewIntervalMs}shouldRunModel(){return this.skipCounter===0?(this.skipCounter=this.preset?.skipFrames??0,!0):(this.skipCounter--,!1)}setBackground(e){this.currentBackground=e,this.renderOp.setBackground(this.translateBackgroundFor("main",e))}setEnabled(e){this.enabled=e}attachPreview(e){if(e.width=this.canvas.width,e.height=this.canvas.height,this.previewCanvas=e,this.backendKind==="webgpu")this.backend.attachCanvas("preview",e);else{let r=e.getContext("bitmaprenderer");if(!r)throw new Error("renderer: failed to get bitmaprenderer context for preview canvas");this.previewCtx=r}}setPreview(e,r){this.previewBg=e,this.previewEffectSpec=e.kind==="none"?null:this.translateBackgroundFor("preview",e),r?.fps&&r.fps>0&&(this.previewIntervalMs=1e3/r.fps),this.lastPreviewAt=0}clearPreview(){this.previewBg=null,this.previewEffectSpec=null;let e=this.bgVideoPorts.get("preview");e&&(e.close(),this.bgVideoPorts.delete("preview"))}setMediaPipeSelfie(e,r){let t=ro[e];if(!t)throw new Error(\`renderer: unknown MediaPipe selfie variant '\${e}'\`);let a=Fe(r);this.lastWeightsBuf=r;let o=this.backend.ops.Input(t.inputRes.h,t.inputRes.w),s=new Ve(this.backend,o.output,a);this.renderOp.attachNetwork(s,o,{upscaler:"bilinear",background:this.translateBackgroundFor("main",this.currentBackground)}),this.flow=null,this.preset=null,this.mediapipe=e,this.skipCounter=0,this.tier=null,this.tierInput=null,this.lastTierWeights=null,this.faceCfg=null,this.reframeCfg=null,this.buildFaceChain()}setPreset(e,r){let t=ee[e.model];if(!t)throw new Error(\`renderer: no TIER_CONFIG entry for model '\${e.model}'\`);let a=Fe(r);this.lastWeightsBuf=r;let o=this.orientRes(t.canvasRes),s=this.orientRes(t.baseRes),n=this.backend.ops.Input(o.h,o.w),p=new Oe(this.backend,n.output,a.base,a.wrapper,t.wrapper,t.base);if(this.renderOp.attachNetwork(p,n,{upscaler:"bilinear",background:this.translateBackgroundFor("main",this.currentBackground)}),this.flow=null,a.flow){let c=s,l=o,d=e.skipFrames===0,f=(N,D)=>this.backend.tensor(N,D,4,new Float32Array(N*D*4)),x=this.backend.ops.BilinearUpsample(n.output,{outH:c.h,outW:c.w}),_=f(c.h,c.w),b=new De(this.backend,_,x.output,p.encoderTaps,a.flow,fs,t.flowFuseStem?{fuseStem:!0,halfTap:p.halfTap}:{}),v=this.backend.ops.BilinearUpsample(b.output,{outH:l.h,outW:l.w}),y=l.w/c.w,k=f(l.h,l.w),P=f(l.h,l.w),S=this.backend.ops.Warp(P,v.output,{flowScale:y}),C=Math.max(1,Math.round(l.w/b.output.w)),E=Math.max(1,Math.round(l.h/b.output.h)),F=this.backend.ops.Stabilize(v.output,k,S.output,P,{...ms,stepX:C,stepY:E}),O=d?null:f(l.h,l.w),I=O?this.backend.ops.Warp(O,v.output,{flowScale:y}):null;this.flow={tier:p,everyFrame:d,warm:!1,networkInput:n,curBaseDown:x,frameAHeld:_,net:b,up:v,predBuf:k,stabPrev:P,refWarp:S,stab:F,alphaHeld:O,predWarp:I}}this.preset=e,this.mediapipe=null,this.skipCounter=0,this.tier=p,this.tierInput=n,this.lastTierWeights=a,this.buildFaceChain()}setFaceEffects(e){if(e&&this.mediapipe)throw new Error("renderer: touchup requires a Longpipe model (MediaPipe selfie is segmentation-only)");this.faceCfg=e,this.preset&&this.buildFaceChain()}setReframe(e){if(e&&this.mediapipe)throw new Error("renderer: reframe requires a Longpipe model (MediaPipe selfie is segmentation-only)");this.reframeCfg=e,this.preset&&this.buildFaceChain()}reframeNow(){this.reframeSolveOnce=!0}buildFaceChain(){this.faceChain=null,this.reframe=null,this.renderOp.setEffectChain([]),this.renderOp.setViewTransform(null);let e=this.faceCfg,r=this.lastTierWeights;if(!e&&!this.reframeCfg||!this.tier||!this.tierInput||!this.preset)return;if(!r?.face){console.warn(\`[longpipe/renderer] face effects configured but the '\${this.preset.model}' weights have no face blob \\u2014 disabled. Re-export the tier with a face-trained checkpoint.\`);return}let t=new Ie(this.backend,this.tier.encoderTaps,r.face),a=t.output,o=(C,E,F)=>this.backend.tensor(C,E,F,new Float32Array(C*E*F)),s=o(a.h,a.w,a.c),n=null,p=null,c=null;if(this.flow&&(this.preset.skipFrames??0)>0){let C=this.orientRes(ee[this.preset.model].baseRes).w;n=o(a.h,a.w,a.c),p=this.backend.ops.BilinearUpsample(this.flow.net.output,{outH:a.h,outW:a.w}),c=this.backend.ops.Warp(n,p.output,{flowScale:a.w/C})}let l=bs.has(this.preset.model)?vs:1,d={..._s,...e?.box??{}},f=l>1?this.backend.ops.FaceBoxesFromHeatmaps(s,{...d,maxFaces:l,tol:xs}):this.backend.ops.FaceBoxFromHeatmaps(s,d),x=o(1,l,4);if(!e){this.faceChain={face:t,hmBuf:s,hmHeld:n,hmFlowDown:p,hmWarp:c,boxOp:f,boxStable:x,crops:[],lms:[],packLm:[],stage:null},this.buildReframe();return}let _=Fe(e.landmarkWeights),b=this.tierInput.output,v=Array.from({length:l},(C,E)=>this.backend.ops.CropResample(b,x,{outH:po,outW:po,mean:hs,std:gs,slot:E})),y=v.map(C=>new Me(this.backend,C.output,_)),k=[],P=y[0].output;if(l>1){let C=y.map(E=>E.output);for(;C.length>1;){let E=[];for(let F=0;F<C.length;F+=2){let O=this.backend.ops.ChannelConcat(C[F],C[F+1]);k.push(O),E.push(O.output)}C=E}P=C[0]}let S=this.backend.ops.FaceTouchupStage(this.renderOp.displayImage,P,x,e.topology,{...e.touchup,slots:l});this.renderOp.setEffectChain([S]),this.faceLive=l,this.faceProbeCounter=0,this.faceChain={face:t,hmBuf:s,hmHeld:n,hmFlowDown:p,hmWarp:c,boxOp:f,boxStable:x,crops:v,lms:y,packLm:k,stage:S},this.buildReframe()}get backendHandle(){return this.backend}destroy(){for(let e of this.bgVideoPorts.values())e.close();this.bgVideoPorts.clear(),this.backend.destroy()}getStats(){let e=performance.now();return this.trimRecent(this.framesRenderedAt,e),this.trimSamplesAt(this.modelRunSamples,e),this.trimSamplesAt(this.displayRunSamples,e),{fps:this.framesRenderedAt.length,modelFps:this.modelRunSamples.length,modelMs:lo(this.modelRunSamples.map(r=>r.ms)),displayMs:lo(this.displayRunSamples.map(r=>r.ms)),skipped:this.skippedCount,preset:this.mediapipe?\`mediapipe-selfie-\${this.mediapipe}\`:this.preset?.model??"boot",skipFrames:this.preset?.skipFrames??0,enabled:this.enabled,inputPath:this.topology.input,outputPath:this.topology.output,backend:this.backendKind==="webgl"?"webgl2":"webgpu"}}translateBackgroundFor(e,r){let t=this.bgVideoPorts.get(e);switch(r.kind!=="video"&&t&&(t.close(),this.bgVideoPorts.delete(e)),r.kind){case"none":return{mode:"solid",color:[0,0,0]};case"color":return{mode:"solid",color:r.rgb};case"blur":return{mode:"blur",sigma:r.sigma};case"image":{let a=this.bgInputFor(this.bgImageInputs,e);return a.setSource(r.bitmap),a.run(),{mode:"image",image:a.output}}case"video":{let a=this.bgInputFor(this.bgVideoInputs,e);return t&&t!==r.port&&t.close(),this.bgVideoPorts.set(e,r.port),r.port.onmessage=o=>{let s=o.data.frame;try{a.setSource(s),a.run()}finally{s.close()}},r.port.start?.(),{mode:"image",image:a.output}}}}bgInputFor(e,r){let t=e.get(r);return t||(t=this.backend.ops.Input(this.canvas.height,this.canvas.width),e.set(r,t)),t}trim(e){e.length>240&&e.splice(0,e.length-240)}trimSamples(e){e.length>240&&e.splice(0,e.length-240)}trimRecent(e,r){let t=r-co,a=0;for(;a<e.length&&e[a]<t;)a++;a>0&&e.splice(0,a)}trimSamplesAt(e,r){let t=r-co,a=0;for(;a<e.length&&e[a].ts<t;)a++;a>0&&e.splice(0,a)}};i(Ke,"ORIENTATION_DEBOUNCE",2);var qe=Ke;function lo(u){if(u.length===0)return 0;let e=u.slice().sort((t,a)=>t-a),r=e.length>>1;return e.length%2?e[r]:(e[r-1]+e[r])/2}var Ts=1,Ps=1e3;async function Cs(u,e){let r=performance.now()+Ps;try{for(;;){if(u.isContextLost()||u.clientWaitSync(e,0,0)!==u.TIMEOUT_EXPIRED||performance.now()>r)return;await new Promise(a=>setTimeout(a,Ts))}}finally{u.isContextLost()||u.deleteSync(e)}}var de=new Float32Array(1),ke=new Uint32Array(de.buffer);function Ws(u){de[0]=u;let e=ke[0],r=e>>>16&32768,t=e&2147483647,a=(t>>>23)-127+15;if((e&2139095040)===2139095040)return(e&8388607)!==0?r|32256:r|31744;if(a>=31)return r|31744;if(a<=0){if(a<-10)return r;let c=t&8388607|8388608,l=14-a,d=c>>>l,f=c>>>l-1&1,x=(c&(1<<l-1)-1)!==0?1:0;return f&&(x||d&1)&&(d+=1),r|d}let o=t>>>13&1023,s=t>>>12&1,n=(t&4095)!==0?1:0,p=a<<10|o;return s&&(n||o&1)&&(p+=1,(p>>>10&31)===31)?r|31744:r|p}function Ar(u){let e=(u&32768)<<16,r=(u&31744)>>>10,t=u&1023;if(r===0){if(t===0)return ke[0]=e,de[0];let a=t,o=1;for(;(a&1024)===0;)a<<=1,o-=1;return a&=1023,ke[0]=e|o+127-15<<23|a<<13,de[0]}return r===31?(ke[0]=e|2139095040|t<<13,de[0]):(ke[0]=e|r+127-15<<23|t<<13,de[0])}function Ye(u){let e=new Uint16Array(u.length);for(let r=0;r<u.length;r++)e[r]=Ws(u[r]);return e}function fe(u){let e=new Float32Array(u.length);for(let r=0;r<u.length;r++)e[r]=Ar(u[r]);return e}var g=class{constructor(e){i(this,"backend",e);i(this,"shader","");i(this,"pipeline");i(this,"bindGroup");i(this,"uniformDefs",[]);i(this,"uniformBuffers",{})}createUniform(e,r){this.uniformDefs.push({name:e,type:r})}setUniform(e,r){let t=this.backend.device.createBuffer({size:r.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,mappedAtCreation:!0});r instanceof Uint32Array?new Uint32Array(t.getMappedRange()).set(r):new Float32Array(t.getMappedRange()).set(r),t.unmap(),this.uniformBuffers[e]=t}defaultBindGroup(){let e=[],r=0;for(let t of this.inputs)e.push({binding:r++,resource:{buffer:t.buffer}});for(let t of this.weights)e.push({binding:r++,resource:{buffer:t.buffer}});for(let t of this.uniformDefs)e.push({binding:r++,resource:{buffer:this.uniformBuffers[t.name]}});return e.push({binding:r,resource:{buffer:this.output.buffer}}),this.backend.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:e})}defaultSetup(){let e=this.backend.device.createShaderModule({code:this.shader});this.pipeline=this.backend.device.createComputePipeline({layout:"auto",compute:{module:e,entryPoint:"main"}}),this.bindGroup=this.defaultBindGroup()}run(){let e=this.backend.computePass();if(e){this.encode(e);return}let r=this.backend.device.createCommandEncoder(),t=r.beginComputePass();this.encode(t),t.end(),this.backend.device.queue.submit([r.finish()])}encode(e){e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.dispatchWorkgroups(...this.dispatch)}};var fo=\`// Conv2d, output-channel-blocked (K=2) \\u2014 drop-in replacement for conv2d.wgsl.
//
// Identical math, layout, and output to conv2d.wgsl, but each thread computes 2
// output channel-groups (8 channels) for one pixel, loading each input vec4 ONCE
// and reusing it across both groups' mat4x4 weight blocks in registers. Half the
// register pressure of the K=4 variant (2 accumulators vs 4). Output is bit-
// identical to conv2d.wgsl (\\u22641 ULP from FMA contraction). Dispatch
// ceil(out_groups / 2) in z (see conv2d.ts).
//
// Tensor layout: NHWC, channels in vec4 groups (same as conv2d.wgsl).
// Weight layout: [K*K][out_groups][in_groups] array of mat4x4 (same as conv2d.wgsl).

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,   // in_channels / 4
    out_groups  : u32,   // out_channels / 4
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky, 4 = hswish, 5 = sigmoid
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

const KB = 2u;

fn act(v: vec4<f32>, a: u32) -> vec4<f32> {
    if (a == 1u) { return clamp(v, vec4<f32>(0.0), vec4<f32>(6.0)); }
    if (a == 2u) { return max(v, vec4<f32>(0.0)); }
    if (a == 3u) { return max(v, 0.1 * v); }   // leaky relu (slope 0.1)
    if (a == 4u) { return v * clamp(v + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }   // hard-swish
    if (a == 5u) { return 1.0 / (1.0 + exp(-v)); }                                       // sigmoid
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x  = gid.x;       // output column
    let y  = gid.y;       // output row
    let o0 = gid.z * KB;  // first output channel group

    if (x >= params.out_w || y >= params.out_h || o0 >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    // Tail handling when out_groups is odd: clamp the spare lane to o0 (valid
    // index, no OOB) and just don't write it.
    let has1 = (o0 + 1u) < O;
    let o1 = select(o0, o0 + 1u, has1);

    var acc0 = bias_buf[o0];
    var acc1 = bias_buf[o1];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let z   = ky * params.kernel_w + kx;
            let inB = u32(in_y_s) * params.in_w * I + u32(in_x_s) * I;
            let wb0 = z * O * I + o0 * I;
            let wb1 = z * O * I + o1 * I;
            for (var i = 0u; i < I; i++) {
                let iv = input_buf[inB + i];   // loaded ONCE, reused across 2 groups
                acc0 += weight_buf[wb0 + i] * iv;
                acc1 += weight_buf[wb1 + i] * iv;
            }
        }
    }

    let baseO = y * params.out_w * O + x * O;
    output_buf[baseO + o0] = act(acc0, params.activation);
    if (has1) { output_buf[baseO + o1] = act(acc1, params.activation); }
}
\`;var mo=\`enable f16;

// Conv2d, output-channel-blocked (K=2) \\u2014 full f16. Drop-in replacement for
// conv2d_f16.wgsl. Each thread computes 2 output channel-groups for one pixel,
// loading each input vec4 ONCE and reusing it across both weight blocks. Half the
// register pressure of the K=4 variant (2 accumulators vs 4). Output is bit-
// identical to conv2d_f16.wgsl. Dispatch ceil(out_groups / 2) in z.

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

const KB = 2u;

fn act(v: vec4<f16>, a: u32) -> vec4<f16> {
    if (a == 1u) { return clamp(v, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    if (a == 2u) { return max(v, vec4<f16>(0.0h)); }
    if (a == 3u) { return max(v, 0.1h * v); }   // leaky relu (slope 0.1)
    if (a == 4u) { return v * clamp(v + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }   // hard-swish
    if (a == 5u) { return vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(v)))); }                     // sigmoid (f32 exp)
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x  = gid.x;
    let y  = gid.y;
    let o0 = gid.z * KB;

    if (x >= params.out_w || y >= params.out_h || o0 >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let has1 = (o0 + 1u) < O;
    let o1 = select(o0, o0 + 1u, has1);

    var acc0 = bias_buf[o0];
    var acc1 = bias_buf[o1];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let z   = ky * params.kernel_w + kx;
            let inB = u32(in_y_s) * params.in_w * I + u32(in_x_s) * I;
            let wb0 = z * O * I + o0 * I;
            let wb1 = z * O * I + o1 * I;
            for (var i = 0u; i < I; i++) {
                let iv = input_buf[inB + i];   // loaded ONCE, reused across 2 groups
                acc0 += weight_buf[wb0 + i] * iv;
                acc1 += weight_buf[wb1 + i] * iv;
            }
        }
    }

    let baseO = y * params.out_w * O + x * O;
    output_buf[baseO + o0] = act(acc0, params.activation);
    if (has1) { output_buf[baseO + o1] = act(acc1, params.activation); }
}
\`;function G(u,e,r,t){return typeof t=="number"?Math.floor((u+2*t-e)/r)+1:t==="same"?Math.ceil(u/r):Math.floor((u-e)/r)+1}function me(u,e,r,t){return(u-1)*r-2*t+e}function Bs(u,e,r,t){return Math.floor(Math.max((e-1)*t+r-u,0)/2)}function U(u,e,r,t,a){return typeof u=="number"?u:u==="same"?Bs(e,r,t,a):0}function X(u){switch(u){case"relu6":return 1;case"relu":return 2;case"leaky":return 3;case"hswish":return 4;case"sigmoid":return 5;default:return 0}}function m(u){return u instanceof Float32Array||u instanceof Uint16Array?u:new Float32Array(u)}function w(u){let e=Math.max(4,Math.ceil(u.length/4)*4),r=new Float32Array(e),t=u instanceof Uint16Array;for(let a=0;a<u.length;a++)r[a]=t?Ar(u[a]):u[a];return r}var Qe=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?mo:fo;let s=G(t.h,o.kernel,o.stride,o.padding),n=G(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=o.outChannels/4,l=U(o.padding,t.h,s,o.kernel,o.stride),d=U(o.padding,t.w,n,o.kernel,o.stride);this.output=r.tensor(s,n,o.outChannels),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(m(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,s,n,p,c,o.kernel,o.kernel,o.stride,l,d,X(o.activation)])),this.defaultSetup(),this.dispatch=[Math.ceil(n/8),Math.ceil(s/8),Math.ceil(c/2)]}};var ho=\`// ConvTranspose2d \\u2014 gather form, f32 variant. See conv_transpose2d_f16.wgsl for
// the math; this is the f32 storage build (mat4x4<f32>).

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    kernel_h   : u32,
    kernel_w   : u32,
    stride     : u32,
    pad_top    : u32,
    pad_left   : u32,
    activation : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

fn act(v: vec4<f32>, a: u32) -> vec4<f32> {
    if (a == 1u) { return clamp(v, vec4<f32>(0.0), vec4<f32>(6.0)); }
    if (a == 2u) { return max(v, vec4<f32>(0.0)); }
    if (a == 3u) { return max(v, 0.1 * v); }
    if (a == 4u) { return v * clamp(v + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }   // hard-swish
    if (a == 5u) { return 1.0 / (1.0 + exp(-v)); }                                       // sigmoid
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let o  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let s = i32(params.stride);

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let iy_num = i32(oy) + i32(params.pad_top)  - i32(ky);
            let ix_num = i32(ox) + i32(params.pad_left) - i32(kx);
            if (iy_num < 0 || ix_num < 0 || (iy_num % s) != 0 || (ix_num % s) != 0) {
                continue;
            }
            let iy = iy_num / s;
            let ix = ix_num / s;
            if (iy >= i32(params.in_h) || ix >= i32(params.in_w)) {
                continue;
            }

            let z = ky * params.kernel_w + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = u32(iy) * params.in_w * I + u32(ix) * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    output_buf[oy * params.out_w * O + ox * O + o] = act(result, params.activation);
}
\`;var go=\`enable f16;

// ConvTranspose2d \\u2014 gather form, full f16 variant.
// Each output (oy,ox) sums every input pixel + kernel tap that maps onto it:
//   iy = (oy + pad - ky) / stride   (must divide evenly and be in bounds)
// No explicit kernel flip \\u2014 the (oy + pad - ky) indexing carries it.
// Weight layout is IDENTICAL to conv2d (mat4x4[z][o][i], M[in_sub][out_sub] =
// W(in, out, ky, kx)), so the op uploads the flat buffer unchanged.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    kernel_h   : u32,
    kernel_w   : u32,
    stride     : u32,
    pad_top    : u32,
    pad_left   : u32,
    activation : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

fn act(v: vec4<f16>, a: u32) -> vec4<f16> {
    if (a == 1u) { return clamp(v, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    if (a == 2u) { return max(v, vec4<f16>(0.0h)); }
    if (a == 3u) { return max(v, 0.1h * v); }
    if (a == 4u) { return v * clamp(v + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }   // hard-swish
    if (a == 5u) { return vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(v)))); }                  // sigmoid (f32 exp)
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let o  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let s = i32(params.stride);

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let iy_num = i32(oy) + i32(params.pad_top)  - i32(ky);
            let ix_num = i32(ox) + i32(params.pad_left) - i32(kx);
            if (iy_num < 0 || ix_num < 0 || (iy_num % s) != 0 || (ix_num % s) != 0) {
                continue;
            }
            let iy = iy_num / s;
            let ix = ix_num / s;
            if (iy >= i32(params.in_h) || ix >= i32(params.in_w)) {
                continue;
            }

            let z = ky * params.kernel_w + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = u32(iy) * params.in_w * I + u32(ix) * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    output_buf[oy * params.out_w * O + ox * O + o] = act(result, params.activation);
}
\`;var Je=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?go:ho;let s=me(t.h,o.kernel,o.stride,o.padding),n=me(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=o.outChannels/4;this.output=r.tensor(s,n,o.outChannels),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(m(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,s,n,p,c,o.kernel,o.kernel,o.stride,o.padding,o.padding,X(o.activation)])),this.defaultSetup(),this.dispatch=[Math.ceil(n/8),Math.ceil(s/8),c]}};var _o=\`// Depthwise Conv2d \\u2014 groups = in_channels (each channel convolved independently).
//
// Weight layout: [K*K][channel_groups] array of vec4
//   weight index = (ky*kernel_w + kx) * channel_groups + c
//   Each vec4 holds the kernel weight for 4 consecutive channels at one spatial position.
//   Operation: element-wise multiply (each input channel multiplied by its own weight).
//
// Contrast with conv2d.wgsl which uses mat4x4 (dense cross-channel mixing).
// 4\\xD7 smaller weight buffer than a diagonal mat4x4 representation (4 floats vs 16 per group).
//
// Padding model: only \\\`pad_top\\\` and \\\`pad_left\\\` are applied to the input offset.
// Asymmetric SAME padding is handled implicitly via the in_h/in_w bounds check.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,   // channels / 4
    kernel_h       : u32,
    kernel_w       : u32,
    stride         : u32,
    pad_top        : u32,
    pad_left       : u32,
    activation     : u32,   // 0 none, 1 relu6, 2 relu, 3 leaky, 4 hswish, 5 sigmoid
    _pad0          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;  // output column
    let y = gid.y;  // output row
    let c = gid.z;  // channel group

    if (x >= params.out_w || y >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let C = params.channel_groups;

    var result = bias_buf[c];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            let in_idx = in_y * params.in_w * C + in_x * C + c;
            let w_idx  = z * C + c;
            result += weight_buf[w_idx] * input_buf[in_idx];
        }
    }

    let a = params.activation;
    if (a == 1u)      { result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0)); }
    else if (a == 2u) { result = max(result, vec4<f32>(0.0)); }
    else if (a == 3u) { result = max(result, 0.1 * result); }
    else if (a == 4u) { result = result * clamp(result + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }
    else if (a == 5u) { result = 1.0 / (1.0 + exp(-result)); }

    let out_idx = y * params.out_w * C + x * C + c;
    output_buf[out_idx] = result;
}
\`;var bo=\`enable f16;

// Depthwise conv2d \\u2014 full f16 variant. All buffers f16.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    kernel_h       : u32,
    kernel_w       : u32,
    stride         : u32,
    pad_top        : u32,
    pad_left       : u32,
    activation     : u32,   // 0 none, 1 relu6, 2 relu, 3 leaky, 4 hswish, 5 sigmoid
    _pad0          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;

    if (x >= params.out_w || y >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let C = params.channel_groups;

    var result = bias_buf[c];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            let in_idx = in_y * params.in_w * C + in_x * C + c;
            let w_idx  = z * C + c;
            result += weight_buf[w_idx] * input_buf[in_idx];
        }
    }

    let a = params.activation;
    if (a == 1u)      { result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    else if (a == 2u) { result = max(result, vec4<f16>(0.0h)); }
    else if (a == 3u) { result = max(result, 0.1h * result); }
    else if (a == 4u) { result = result * clamp(result + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }
    else if (a == 5u) { result = vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(result)))); }

    output_buf[y * params.out_w * C + x * C + c] = result;
}
\`;var Ze=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?bo:_o;let s=G(t.h,o.kernel,o.stride,o.padding),n=G(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=U(o.padding,t.h,s,o.kernel,o.stride),l=U(o.padding,t.w,n,o.kernel,o.stride);this.output=r.tensor(s,n,t.c),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(m(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,s,n,p,o.kernel,o.kernel,o.stride,c,l,X(o.activation),0])),this.defaultSetup(),this.dispatch=[Math.ceil(n/8),Math.ceil(s/8),p]}};var vo=\`// Element-wise add of two tensors \\u2014 used for residual connections in MBConv blocks.
// Operates on the flat float buffer directly; layout is irrelevant for a pure element-wise op.

struct Params {
    size  : u32,   // total number of f32 elements
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f32>;
@group(0) @binding(1) var<storage, read>       input_b : array<f32>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] + input_b[idx];
}
\`;var xo=\`enable f16;

// Element-wise add \\u2014 full f16 variant.
// array<f16> is binary-compatible with array<vec4<f16>> written by the f16 conv shaders.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f16>;
@group(0) @binding(1) var<storage, read>       input_b : array<f16>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f16>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] + input_b[idx];
}
\`;var et=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?xo:vo;let o=t.h*t.w*t.c;this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(o/256),1,1]}};var yo=\`// Element-wise sigmoid: output = 1 / (1 + exp(-x)).
// Operates on packed vec4 buffers (NHWC layout). exp() and arithmetic are element-wise on vec4.

struct Params {
    n_groups : u32,   // total vec4 elements (H * W * channel_groups)
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    output_buf[idx] = 1.0 / (1.0 + exp(-input_buf[idx]));
}
\`;var wo=\`enable f16;

// Sigmoid \\u2014 full f16 variant.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    let x = vec4<f32>(input_buf[idx]);
    output_buf[idx] = vec4<f16>(1.0 / (1.0 + exp(-x)));
}
\`;var tt=class extends g{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?wo:yo;let a=t.h*t.w*(t.c/4);this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([a,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a/256),1,1]}};var ko=\`// Element-wise tanh \\u2014 used by ConvGRU candidate activation.
// Operates on packed vec4 buffers (NHWC layout). tanh() is element-wise on vec4.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    output_buf[idx] = tanh(input_buf[idx]);
}
\`;var To=\`enable f16;

// Tanh \\u2014 full f16 variant.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    let x = vec4<f32>(input_buf[idx]);
    output_buf[idx] = vec4<f16>(tanh(x));
}
\`;var rt=class extends g{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?To:ko;let a=t.h*t.w*(t.c/4);this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([a,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a/256),1,1]}};var Po=\`// Element-wise multiply \\u2014 used in ConvGRU for r \\u2299 h_prev.
// Same flat-float layout as add.wgsl.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f32>;
@group(0) @binding(1) var<storage, read>       input_b : array<f32>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] * input_b[idx];
}
\`;var Co=\`enable f16;

// Element-wise multiply \\u2014 full f16 variant.
// array<f16> is binary-compatible with array<vec4<f16>> written by the f16 conv shaders.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f16>;
@group(0) @binding(1) var<storage, read>       input_b : array<f16>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f16>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] * input_b[idx];
}
\`;var ot=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Co:Po;let o=t.h*t.w*t.c;this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(o/256),1,1]}};var Wo=\`// Bilinear gather-warp (f32). See warp_f16.wgsl for the math.

struct Params {
    h          : u32,
    w          : u32,
    flow_scale : f32,
    groups     : u32,   // source/output channel groups (c/4); flow is always 1 group
}

@group(0) @binding(0) var<storage, read>       source_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       flow_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

fn samp(x: i32, y: i32, W: i32, H: i32, g: u32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return source_buf[(u32(cy) * u32(W) + u32(cx)) * params.groups + g];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.w || y >= params.h || g >= params.groups) { return; }

    let W = i32(params.w);
    let H = i32(params.h);

    let f  = flow_buf[y * params.w + x].xy;
    let sx = clamp(f32(x) + params.flow_scale * f.x, 0.0, f32(W - 1));
    let sy = clamp(f32(y) + params.flow_scale * f.y, 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H, g), samp(x0 + 1, y0, W, H, g), tx);
    let bot = mix(samp(x0, y0 + 1, W, H, g), samp(x0 + 1, y0 + 1, W, H, g), tx);
    output_buf[(y * params.w + x) * params.groups + g] = mix(top, bot, ty);
}
\`;var Go=\`enable f16;

// Bilinear gather-warp (f16 storage, f32 coordinate math). For each output pixel
// p, sample the source at p + flow_scale\\xB7flow[p].xy and bilinearly interpolate,
// clamping the sample to the edge (border-replicate). Source + flow are 4-ch
// (1 group), same resolution; flow vector is in .xy.

struct Params {
    h          : u32,
    w          : u32,
    flow_scale : f32,
    groups     : u32,   // source/output channel groups (c/4); flow is always 1 group
}

@group(0) @binding(0) var<storage, read>       source_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       flow_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

fn samp(x: i32, y: i32, W: i32, H: i32, g: u32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return vec4<f32>(source_buf[(u32(cy) * u32(W) + u32(cx)) * params.groups + g]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.w || y >= params.h || g >= params.groups) { return; }

    let W = i32(params.w);
    let H = i32(params.h);
    

    let f  = vec2<f32>(flow_buf[y * params.w + x].xy);
    let sx = clamp(f32(x) + params.flow_scale * f.x, 0.0, f32(W - 1));
    let sy = clamp(f32(y) + params.flow_scale * f.y, 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H, g), samp(x0 + 1, y0, W, H, g), tx);
    let bot = mix(samp(x0, y0 + 1, W, H, g), samp(x0 + 1, y0 + 1, W, H, g), tx);
    output_buf[(y * params.w + x) * params.groups + g] = vec4<f16>(mix(top, bot, ty));
}
\`;var at=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Go:Wo,this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t,a],this.createUniform("params","Params");let s=new Uint32Array(4);s[0]=t.h,s[1]=t.w,new Float32Array(s.buffer)[2]=o.flowScale,s[3]=t.c/4,this.setUniform("params",s),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),t.c/4]}};var Uo=\`// Face-box decode from 5-keypoint heatmaps (f32). One workgroup: threads 0-4
// each soft-argmax one channel (peak + windowed centroid \\u2014 hard argmax snaps
// to whole cells and jitters the crop); thread 0 combines the keypoint hull
// into a pixel-square box.
//
// Output (1 vec4): (cx, cy, halfSide, score) in FRAME FRACTIONS \\u2014 halfSide as
// a fraction of frame WIDTH. The heatmap grid shares the frame's aspect, so
// squaring in grid-cell px squares in frame px. score = min keypoint peak,
// forced to 0 if any peak < thresh.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f32>>;

var<workgroup> kp_x : array<f32, 5>;   // continuous cell coords
var<workgroup> kp_y : array<f32, 5>;
var<workgroup> kp_s : array<f32, 5>;   // peak scores

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \\u2192 2 vec4 groups
    return v[k % 4u];
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // Peak.
    var peak = -1.0;
    var pr = 0u;
    var pc = 0u;
    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v > peak) { peak = v; pr = y; pc = x; }
        }
    }

    // Windowed soft-argmax centroid around the peak.
    let r0 = u32(max(0, i32(pr) - params.win));
    let r1 = u32(min(i32(params.h), i32(pr) + params.win + 1));
    let c0 = u32(max(0, i32(pc) - params.win));
    let c1 = u32(min(i32(params.w), i32(pc) + params.win + 1));
    var wsum = 0.0;
    var sy = 0.0;
    var sx = 0.0;
    for (var y = r0; y < r1; y++) {
        for (var x = c0; x < c1; x++) {
            let v = hm_at(x, y, k);
            wsum += v;
            sy += v * f32(y);
            sx += v * f32(x);
        }
    }
    wsum = max(wsum, 1e-6);
    kp_x[k] = sx / wsum;
    kp_y[k] = sy / wsum;
    kp_s[k] = peak;
    workgroupBarrier();

    if (k != 0u) { return; }

    // Hull over the 5 keypoints, in grid-cell px.
    var x0 = 1e9; var x1 = -1e9;
    var y0 = 1e9; var y1 = -1e9;
    var score = 1e9;
    for (var i = 0u; i < 5u; i++) {
        x0 = min(x0, kp_x[i]); x1 = max(x1, kp_x[i]);
        y0 = min(y0, kp_y[i]); y1 = max(y1, kp_y[i]);
        score = min(score, kp_s[i]);
    }
    if (score < params.thresh) { score = 0.0; }

    // Square box: side = boxScale \\xD7 hull long side (grid px == frame-px aspect).
    let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
    let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \\u2192 center
    let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
    out_buf[0] = vec4<f32>(cx, cy, half_px / f32(params.w), score);
}
\`;var Bo=\`enable f16;

// Face-box decode from 5-keypoint heatmaps (f16 storage, f32 math). One workgroup: threads 0-4
// each soft-argmax one channel (peak + windowed centroid \\u2014 hard argmax snaps
// to whole cells and jitters the crop); thread 0 combines the keypoint hull
// into a pixel-square box.
//
// Output (1 vec4): (cx, cy, halfSide, score) in FRAME FRACTIONS \\u2014 halfSide as
// a fraction of frame WIDTH. The heatmap grid shares the frame's aspect, so
// squaring in grid-cell px squares in frame px. score = min keypoint peak,
// forced to 0 if any peak < thresh.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f16>>;

var<workgroup> kp_x : array<f32, 5>;   // continuous cell coords
var<workgroup> kp_y : array<f32, 5>;
var<workgroup> kp_s : array<f32, 5>;   // peak scores

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \\u2192 2 vec4 groups
    return f32(v[k % 4u]);
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // Peak.
    var peak = -1.0;
    var pr = 0u;
    var pc = 0u;
    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v > peak) { peak = v; pr = y; pc = x; }
        }
    }

    // Windowed soft-argmax centroid around the peak.
    let r0 = u32(max(0, i32(pr) - params.win));
    let r1 = u32(min(i32(params.h), i32(pr) + params.win + 1));
    let c0 = u32(max(0, i32(pc) - params.win));
    let c1 = u32(min(i32(params.w), i32(pc) + params.win + 1));
    var wsum = 0.0;
    var sy = 0.0;
    var sx = 0.0;
    for (var y = r0; y < r1; y++) {
        for (var x = c0; x < c1; x++) {
            let v = hm_at(x, y, k);
            wsum += v;
            sy += v * f32(y);
            sx += v * f32(x);
        }
    }
    wsum = max(wsum, 1e-6);
    kp_x[k] = sx / wsum;
    kp_y[k] = sy / wsum;
    kp_s[k] = peak;
    workgroupBarrier();

    if (k != 0u) { return; }

    // Hull over the 5 keypoints, in grid-cell px.
    var x0 = 1e9; var x1 = -1e9;
    var y0 = 1e9; var y1 = -1e9;
    var score = 1e9;
    for (var i = 0u; i < 5u; i++) {
        x0 = min(x0, kp_x[i]); x1 = max(x1, kp_x[i]);
        y0 = min(y0, kp_y[i]); y1 = max(y1, kp_y[i]);
        score = min(score, kp_s[i]);
    }
    if (score < params.thresh) { score = 0.0; }

    // Square box: side = boxScale \\xD7 hull long side (grid px == frame-px aspect).
    let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
    let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \\u2192 center
    let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
    out_buf[0] = vec4<f16>(vec4<f32>(cx, cy, half_px / f32(params.w), score));
}
\`;var it=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch",[1,1,1]);i(this,"shader");if(t.c!==8)throw new Error(\`FaceBoxFromHeatmaps: expected 8-ch heatmaps (5 real), got \${t.c}\`);this.shader=r.dtype==="f16"?Bo:Uo,this.output=r.tensor(1,1,4),this.inputs=[t],this.createUniform("params","Params");let o=new Uint32Array(5);o[0]=t.h,o[1]=t.w,new Int32Array(o.buffer)[2]=a.win;let s=new Float32Array(o.buffer);s[3]=a.thresh,s[4]=a.boxScale,this.setUniform("params",o),this.defaultSetup()}};var So=\`// MULTI-FACE box decode from 5-keypoint heatmaps (f32) \\u2192 1\\xD7K\\xD74 box tensor.
// The multi-face sibling of face_box.wgsl (which is single-face: one global
// argmax per channel + hull, so two faces merge into one box).
//
// Stage 1 (threads 0-4, one channel each): 3\\xD73 local-maximum candidates above
//   thresh, top-MAX_CAND by peak score, refined with the windowed soft-argmax
//   centroid (the required decode \\u2014 hard argmax cell-snaps and jitters the
//   crop), deduped by refined position.
// Stage 2 (thread 0): every (L-eye, R-eye) candidate pair is a face hypothesis.
//   The pair fixes the face's center, scale (interocular distance) and roll, so
//   nose + mouth corners are PREDICTED from the ArcFace canonical template and
//   matched against candidates within tol \\xD7 interocular. Cross-pairing (face A's
//   left eye with face B's right eye) survives stage 1 but dies here: the
//   implied scale is wrong and there's no nose/mouth support where the template
//   says there should be.
// Stage 3/4 (thread 0): score = mean matched peak \\u2212 LAMBDA \\xB7 mean normalized
//   residual; greedy NMS rejects any hypothesis reusing a consumed candidate.
//
// Output slot i: (cx, cy, halfSide, score) in FRAME FRACTIONS, halfSide as a
// fraction of frame WIDTH (the grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Slots past the face count are zeroed \\u2014 score 0
// means "no face", which every consumer already gates on.
//
// CPU reference (kept in sync deliberately): sdk/demo/face.ts findCandidates /
// groupFaces.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
    max_faces : u32,
    tol       : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f32>>;

const N_KP     : u32 = 5u;
const MAX_CAND : u32 = 5u;    // candidates per channel
const LAMBDA   : f32 = 0.5;   // geometric-residual weight
const MIN_SEP  : f32 = 1.0;   // cells \\u2014 closer refined centroids are one blob
const MIN_EYE  : f32 = 1.0;   // cells \\u2014 below this the grid can't resolve a pair

// Candidate table, N_KP \\xD7 MAX_CAND, filled by stage 1 (thread k owns row k).
var<workgroup> c_x : array<f32, 25>;   // refined cell coords
var<workgroup> c_y : array<f32, 25>;
var<workgroup> c_s : array<f32, 25>;   // peak scores
var<workgroup> c_n : array<u32, 5>;    // candidates found per channel

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \\u2192 2 vec4 groups
    return v[k % 4u];
}

// ArcFace canonical 5-point template in the EYE FRAME: origin = L-eye, +u along
// the L-eye\\u2192R-eye vector, +w perpendicular (image-down for an upright face),
// both normalized by interocular distance. t: 0 = nose, 1 = L-mouth, 2 = R-mouth.
fn tmpl_u(t: u32) -> f32 {
    if (t == 0u) { return 0.50002; }
    if (t == 1u) { return 0.08598; }
    return 0.91410;
}
fn tmpl_w(t: u32) -> f32 {
    if (t == 0u) { return 0.57150; }
    return 1.15462;   // both mouth corners sit at the same depth
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // \\u2500\\u2500 stage 1: local-maximum candidates for channel k \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var pr : array<u32, 5>;
    var pc : array<u32, 5>;
    var ps : array<f32, 5>;
    var n  = 0u;

    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v < params.thresh) { continue; }

            // 3\\xD73 strict local max. The index tiebreak keeps exactly one member
            // of a plateau (f16 heatmaps produce exact ties).
            var is_max = true;
            for (var dy: i32 = -1; dy <= 1; dy++) {
                for (var dx: i32 = -1; dx <= 1; dx++) {
                    if (dx == 0 && dy == 0) { continue; }
                    let rr = i32(y) + dy;
                    let cc = i32(x) + dx;
                    if (rr < 0 || rr >= i32(params.h) || cc < 0 || cc >= i32(params.w)) { continue; }
                    let u = hm_at(u32(cc), u32(rr), k);
                    if (u > v || (u == v && u32(rr) * params.w + u32(cc) < y * params.w + x)) {
                        is_max = false;
                    }
                }
            }
            if (!is_max) { continue; }

            // Insert into the score-ordered top-MAX_CAND list.
            var slot = n;
            if (n == MAX_CAND) {
                if (v <= ps[MAX_CAND - 1u]) { continue; }
                slot = MAX_CAND - 1u;
            } else {
                n = n + 1u;
            }
            while (slot > 0u && ps[slot - 1u] < v) {
                ps[slot] = ps[slot - 1u];
                pr[slot] = pr[slot - 1u];
                pc[slot] = pc[slot - 1u];
                slot = slot - 1u;
            }
            ps[slot] = v; pr[slot] = y; pc[slot] = x;
        }
    }

    // Refine each peak with the windowed soft-argmax centroid, dropping any that
    // lands on top of a higher-scoring one (two maxima on a single blob).
    var m = 0u;
    for (var i = 0u; i < n; i++) {
        var rx = f32(pc[i]);
        var ry = f32(pr[i]);
        if (params.win > 0) {
            let r0 = u32(max(0, i32(pr[i]) - params.win));
            let r1 = u32(min(i32(params.h), i32(pr[i]) + params.win + 1));
            let c0 = u32(max(0, i32(pc[i]) - params.win));
            let c1 = u32(min(i32(params.w), i32(pc[i]) + params.win + 1));
            var wsum = 0.0; var sy = 0.0; var sx = 0.0;
            for (var y = r0; y < r1; y++) {
                for (var x = c0; x < c1; x++) {
                    let v = hm_at(x, y, k);
                    wsum += v; sy += v * f32(y); sx += v * f32(x);
                }
            }
            wsum = max(wsum, 1e-6);
            rx = sx / wsum; ry = sy / wsum;
        }
        var dup = false;
        for (var j = 0u; j < m; j++) {
            let dx = c_x[k * MAX_CAND + j] - rx;
            let dy = c_y[k * MAX_CAND + j] - ry;
            if (sqrt(dx * dx + dy * dy) < MIN_SEP) { dup = true; }
        }
        if (dup) { continue; }
        c_x[k * MAX_CAND + m] = rx;
        c_y[k * MAX_CAND + m] = ry;
        c_s[k * MAX_CAND + m] = ps[i];
        m = m + 1u;
    }
    c_n[k] = m;

    workgroupBarrier();
    if (k != 0u) { return; }

    // \\u2500\\u2500 stage 2: eye-pair hypotheses \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var h_score : array<f32, 25>;
    var h_kp    : array<i32, 125>;   // hypothesis q, channel t \\u2192 candidate idx (-1 = unmatched)
    var nh = 0u;
    let max_eye = f32(params.w) * 0.45;   // a face wider than ~half the frame

    for (var i = 0u; i < c_n[0]; i++) {
        for (var j = 0u; j < c_n[1]; j++) {
            let ax = c_x[i];
            let ay = c_y[i];
            let bx = c_x[MAX_CAND + j];
            let by = c_y[MAX_CAND + j];
            let evx = bx - ax;
            let evy = by - ay;
            let len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > max_eye) { continue; }
            let ex = vec2<f32>(evx / len, evy / len);
            let ey = vec2<f32>(-ex.y, ex.x);

            var sc      = c_s[i] + c_s[MAX_CAND + j];
            var resid   = 0.0;
            var n_match = 2u;
            var mouths  = 0u;
            var nose    = -1;
            var mo      = array<i32, 2>(-1, -1);

            for (var t = 0u; t < 3u; t++) {
                let kk = t + 2u;
                let px = ax + len * (tmpl_u(t) * ex.x + tmpl_w(t) * ey.x);
                let py = ay + len * (tmpl_u(t) * ex.y + tmpl_w(t) * ey.y);
                var best   = -1;
                var best_d = params.tol * len;
                for (var q = 0u; q < c_n[kk]; q++) {
                    let dx = c_x[kk * MAX_CAND + q] - px;
                    let dy = c_y[kk * MAX_CAND + q] - py;
                    let d  = sqrt(dx * dx + dy * dy);
                    if (d < best_d) { best_d = d; best = i32(q); }
                }
                if (best < 0) { continue; }
                sc += c_s[kk * MAX_CAND + u32(best)];
                resid += best_d / len;
                n_match += 1u;
                if (t == 0u) { nose = best; } else { mo[t - 1u] = best; mouths += 1u; }
            }
            // Support floor: a hypothesis needs the nose and at least one mouth
            // corner, otherwise two stray eye peaks become a face.
            if (nose < 0 || mouths < 1u) { continue; }

            h_score[nh] = sc / f32(n_match) - LAMBDA * (resid / f32(n_match - 2u));
            h_kp[nh * N_KP + 0u] = i32(i);
            h_kp[nh * N_KP + 1u] = i32(j);
            h_kp[nh * N_KP + 2u] = nose;
            h_kp[nh * N_KP + 3u] = mo[0];
            h_kp[nh * N_KP + 4u] = mo[1];
            nh = nh + 1u;
        }
    }

    // \\u2500\\u2500 stage 3/4: greedy NMS by score \\u2192 boxes \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var used : array<bool, 25>;
    for (var i = 0u; i < N_KP * MAX_CAND; i++) { used[i] = false; }
    var out_n = 0u;

    for (var iter = 0u; iter < 25u; iter++) {
        if (out_n >= params.max_faces) { break; }

        // Best remaining hypothesis. Consumed ones are marked -1e9; real scores
        // are bounded well above -1e8 (mean peak \\u2208 [0,1] minus LAMBDA\\xB7tol).
        var best   = -1;
        var best_s = -1e8;
        for (var q = 0u; q < nh; q++) {
            if (h_score[q] > best_s) { best_s = h_score[q]; best = i32(q); }
        }
        if (best < 0) { break; }
        let q = u32(best);
        h_score[q] = -1e9;

        var clash = false;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            if (used[t * MAX_CAND + u32(ci)]) { clash = true; }
        }
        if (clash) { continue; }

        // Hull over this face's matched keypoints, in grid cells.
        var x0 = 1e9; var x1 = -1e9;
        var y0 = 1e9; var y1 = -1e9;
        var score = 1e9;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            let e = t * MAX_CAND + u32(ci);
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
        let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \\u2192 center
        let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
        out_buf[out_n] = vec4<f32>(cx, cy, half_px / f32(params.w), score);
        out_n = out_n + 1u;
    }

    for (var i = out_n; i < params.max_faces; i++) {
        out_buf[i] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
}
\`;var Lo=\`enable f16;

// MULTI-FACE box decode from 5-keypoint heatmaps (f16 storage, f32 math) \\u2192 1\\xD7K\\xD74 box tensor.
// The multi-face sibling of face_box.wgsl (which is single-face: one global
// argmax per channel + hull, so two faces merge into one box).
//
// Stage 1 (threads 0-4, one channel each): 3\\xD73 local-maximum candidates above
//   thresh, top-MAX_CAND by peak score, refined with the windowed soft-argmax
//   centroid (the required decode \\u2014 hard argmax cell-snaps and jitters the
//   crop), deduped by refined position.
// Stage 2 (thread 0): every (L-eye, R-eye) candidate pair is a face hypothesis.
//   The pair fixes the face's center, scale (interocular distance) and roll, so
//   nose + mouth corners are PREDICTED from the ArcFace canonical template and
//   matched against candidates within tol \\xD7 interocular. Cross-pairing (face A's
//   left eye with face B's right eye) survives stage 1 but dies here: the
//   implied scale is wrong and there's no nose/mouth support where the template
//   says there should be.
// Stage 3/4 (thread 0): score = mean matched peak \\u2212 LAMBDA \\xB7 mean normalized
//   residual; greedy NMS rejects any hypothesis reusing a consumed candidate.
//
// Output slot i: (cx, cy, halfSide, score) in FRAME FRACTIONS, halfSide as a
// fraction of frame WIDTH (the grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Slots past the face count are zeroed \\u2014 score 0
// means "no face", which every consumer already gates on.
//
// CPU reference (kept in sync deliberately): sdk/demo/face.ts findCandidates /
// groupFaces.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
    max_faces : u32,
    tol       : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f16>>;

const N_KP     : u32 = 5u;
const MAX_CAND : u32 = 5u;    // candidates per channel
const LAMBDA   : f32 = 0.5;   // geometric-residual weight
const MIN_SEP  : f32 = 1.0;   // cells \\u2014 closer refined centroids are one blob
const MIN_EYE  : f32 = 1.0;   // cells \\u2014 below this the grid can't resolve a pair

// Candidate table, N_KP \\xD7 MAX_CAND, filled by stage 1 (thread k owns row k).
var<workgroup> c_x : array<f32, 25>;   // refined cell coords
var<workgroup> c_y : array<f32, 25>;
var<workgroup> c_s : array<f32, 25>;   // peak scores
var<workgroup> c_n : array<u32, 5>;    // candidates found per channel

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \\u2192 2 vec4 groups
    return f32(v[k % 4u]);
}

// ArcFace canonical 5-point template in the EYE FRAME: origin = L-eye, +u along
// the L-eye\\u2192R-eye vector, +w perpendicular (image-down for an upright face),
// both normalized by interocular distance. t: 0 = nose, 1 = L-mouth, 2 = R-mouth.
fn tmpl_u(t: u32) -> f32 {
    if (t == 0u) { return 0.50002; }
    if (t == 1u) { return 0.08598; }
    return 0.91410;
}
fn tmpl_w(t: u32) -> f32 {
    if (t == 0u) { return 0.57150; }
    return 1.15462;   // both mouth corners sit at the same depth
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // \\u2500\\u2500 stage 1: local-maximum candidates for channel k \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var pr : array<u32, 5>;
    var pc : array<u32, 5>;
    var ps : array<f32, 5>;
    var n  = 0u;

    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v < params.thresh) { continue; }

            // 3\\xD73 strict local max. The index tiebreak keeps exactly one member
            // of a plateau (f16 heatmaps produce exact ties).
            var is_max = true;
            for (var dy: i32 = -1; dy <= 1; dy++) {
                for (var dx: i32 = -1; dx <= 1; dx++) {
                    if (dx == 0 && dy == 0) { continue; }
                    let rr = i32(y) + dy;
                    let cc = i32(x) + dx;
                    if (rr < 0 || rr >= i32(params.h) || cc < 0 || cc >= i32(params.w)) { continue; }
                    let u = hm_at(u32(cc), u32(rr), k);
                    if (u > v || (u == v && u32(rr) * params.w + u32(cc) < y * params.w + x)) {
                        is_max = false;
                    }
                }
            }
            if (!is_max) { continue; }

            // Insert into the score-ordered top-MAX_CAND list.
            var slot = n;
            if (n == MAX_CAND) {
                if (v <= ps[MAX_CAND - 1u]) { continue; }
                slot = MAX_CAND - 1u;
            } else {
                n = n + 1u;
            }
            while (slot > 0u && ps[slot - 1u] < v) {
                ps[slot] = ps[slot - 1u];
                pr[slot] = pr[slot - 1u];
                pc[slot] = pc[slot - 1u];
                slot = slot - 1u;
            }
            ps[slot] = v; pr[slot] = y; pc[slot] = x;
        }
    }

    // Refine each peak with the windowed soft-argmax centroid, dropping any that
    // lands on top of a higher-scoring one (two maxima on a single blob).
    var m = 0u;
    for (var i = 0u; i < n; i++) {
        var rx = f32(pc[i]);
        var ry = f32(pr[i]);
        if (params.win > 0) {
            let r0 = u32(max(0, i32(pr[i]) - params.win));
            let r1 = u32(min(i32(params.h), i32(pr[i]) + params.win + 1));
            let c0 = u32(max(0, i32(pc[i]) - params.win));
            let c1 = u32(min(i32(params.w), i32(pc[i]) + params.win + 1));
            var wsum = 0.0; var sy = 0.0; var sx = 0.0;
            for (var y = r0; y < r1; y++) {
                for (var x = c0; x < c1; x++) {
                    let v = hm_at(x, y, k);
                    wsum += v; sy += v * f32(y); sx += v * f32(x);
                }
            }
            wsum = max(wsum, 1e-6);
            rx = sx / wsum; ry = sy / wsum;
        }
        var dup = false;
        for (var j = 0u; j < m; j++) {
            let dx = c_x[k * MAX_CAND + j] - rx;
            let dy = c_y[k * MAX_CAND + j] - ry;
            if (sqrt(dx * dx + dy * dy) < MIN_SEP) { dup = true; }
        }
        if (dup) { continue; }
        c_x[k * MAX_CAND + m] = rx;
        c_y[k * MAX_CAND + m] = ry;
        c_s[k * MAX_CAND + m] = ps[i];
        m = m + 1u;
    }
    c_n[k] = m;

    workgroupBarrier();
    if (k != 0u) { return; }

    // \\u2500\\u2500 stage 2: eye-pair hypotheses \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var h_score : array<f32, 25>;
    var h_kp    : array<i32, 125>;   // hypothesis q, channel t \\u2192 candidate idx (-1 = unmatched)
    var nh = 0u;
    let max_eye = f32(params.w) * 0.45;   // a face wider than ~half the frame

    for (var i = 0u; i < c_n[0]; i++) {
        for (var j = 0u; j < c_n[1]; j++) {
            let ax = c_x[i];
            let ay = c_y[i];
            let bx = c_x[MAX_CAND + j];
            let by = c_y[MAX_CAND + j];
            let evx = bx - ax;
            let evy = by - ay;
            let len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > max_eye) { continue; }
            let ex = vec2<f32>(evx / len, evy / len);
            let ey = vec2<f32>(-ex.y, ex.x);

            var sc      = c_s[i] + c_s[MAX_CAND + j];
            var resid   = 0.0;
            var n_match = 2u;
            var mouths  = 0u;
            var nose    = -1;
            var mo      = array<i32, 2>(-1, -1);

            for (var t = 0u; t < 3u; t++) {
                let kk = t + 2u;
                let px = ax + len * (tmpl_u(t) * ex.x + tmpl_w(t) * ey.x);
                let py = ay + len * (tmpl_u(t) * ex.y + tmpl_w(t) * ey.y);
                var best   = -1;
                var best_d = params.tol * len;
                for (var q = 0u; q < c_n[kk]; q++) {
                    let dx = c_x[kk * MAX_CAND + q] - px;
                    let dy = c_y[kk * MAX_CAND + q] - py;
                    let d  = sqrt(dx * dx + dy * dy);
                    if (d < best_d) { best_d = d; best = i32(q); }
                }
                if (best < 0) { continue; }
                sc += c_s[kk * MAX_CAND + u32(best)];
                resid += best_d / len;
                n_match += 1u;
                if (t == 0u) { nose = best; } else { mo[t - 1u] = best; mouths += 1u; }
            }
            // Support floor: a hypothesis needs the nose and at least one mouth
            // corner, otherwise two stray eye peaks become a face.
            if (nose < 0 || mouths < 1u) { continue; }

            h_score[nh] = sc / f32(n_match) - LAMBDA * (resid / f32(n_match - 2u));
            h_kp[nh * N_KP + 0u] = i32(i);
            h_kp[nh * N_KP + 1u] = i32(j);
            h_kp[nh * N_KP + 2u] = nose;
            h_kp[nh * N_KP + 3u] = mo[0];
            h_kp[nh * N_KP + 4u] = mo[1];
            nh = nh + 1u;
        }
    }

    // \\u2500\\u2500 stage 3/4: greedy NMS by score \\u2192 boxes \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    var used : array<bool, 25>;
    for (var i = 0u; i < N_KP * MAX_CAND; i++) { used[i] = false; }
    var out_n = 0u;

    for (var iter = 0u; iter < 25u; iter++) {
        if (out_n >= params.max_faces) { break; }

        // Best remaining hypothesis. Consumed ones are marked -1e9; real scores
        // are bounded well above -1e8 (mean peak \\u2208 [0,1] minus LAMBDA\\xB7tol).
        var best   = -1;
        var best_s = -1e8;
        for (var q = 0u; q < nh; q++) {
            if (h_score[q] > best_s) { best_s = h_score[q]; best = i32(q); }
        }
        if (best < 0) { break; }
        let q = u32(best);
        h_score[q] = -1e9;

        var clash = false;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            if (used[t * MAX_CAND + u32(ci)]) { clash = true; }
        }
        if (clash) { continue; }

        // Hull over this face's matched keypoints, in grid cells.
        var x0 = 1e9; var x1 = -1e9;
        var y0 = 1e9; var y1 = -1e9;
        var score = 1e9;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            let e = t * MAX_CAND + u32(ci);
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
        let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \\u2192 center
        let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
        out_buf[out_n] = vec4<f16>(vec4<f32>(cx, cy, half_px / f32(params.w), score));
        out_n = out_n + 1u;
    }

    for (var i = out_n; i < params.max_faces; i++) {
        out_buf[i] = vec4<f16>(0.0h, 0.0h, 0.0h, 0.0h);
    }
}
\`;var st=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch",[1,1,1]);i(this,"shader");if(t.c!==8)throw new Error(\`FaceBoxesFromHeatmaps: expected 8-ch heatmaps (5 real), got \${t.c}\`);if(a.maxFaces<1||a.maxFaces>6)throw new Error(\`FaceBoxesFromHeatmaps: maxFaces must be 1..6, got \${a.maxFaces}\`);this.shader=r.dtype==="f16"?Lo:So,this.output=r.tensor(1,a.maxFaces,4),this.inputs=[t],this.createUniform("params","Params");let o=new ArrayBuffer(32),s=new Uint32Array(o),n=new Int32Array(o),p=new Float32Array(o);s[0]=t.h,s[1]=t.w,n[2]=a.win,p[3]=a.thresh,p[4]=a.boxScale,s[5]=a.maxFaces,p[6]=a.tol,this.setUniform("params",s),this.defaultSetup()}};var Ao=\`// Auto-reframe state update (f32) \\u2014 one thread, one frame of camera work.
// In:  boxes (1\\xD7K\\xD74, FaceBoxesFromHeatmaps), prev state, command.
// Out: new state, 1\\xD71\\xD78 = two vec4s:
//        [0] (cx, cy, size, moving)   \\u2014 the view rect; all FRAME FRACTIONS
//        [1] (subjX, subjY, subjHs, valid) \\u2014 the incumbent subject, for hysteresis
//
// The subject is remembered by POSITION, not by slot: FaceBoxesFromHeatmaps
// orders its slots by NMS score, so slot 1 can be a different person next frame.
//
// \\\`size\\\` is a fraction of BOTH width and height, which is what preserves the
// frame's aspect: equal fractions of a 640\\xD7400 frame is still 8:5.
//
// The rule (tuned in demo/reframe.ts):
//   centre = frameCentre + gravity\\xB7(subject \\u2212 frameCentre)   \\u2014 pull, never centre
//   crop   = frame / zoom
//   constraints: the crop stays INSIDE the frame AND contains the subject+margin
// Neither is a special case; "head in the corner does nothing" falls out of them:
// once the crop centre clamps to the frame edge, containment reduces to
// x >= half+margin regardless of zoom, so an edge subject simply never fits and
// the solve falls through to its full-frame fallback (= no reframe). The zoom
// relaxation earns its keep elsewhere \\u2014 backing off for a subject too BIG for
// the requested crop.
//
// Smoothing is deadband + ease: hold, move deliberately, hold. A plain EMA reads
// as swimming as the subject breathes.
//
// State is threaded across frames by the renderer with copyTensor \\u2014 same carrier
// pattern as the flow stabilizer's stabPrev. No readback anywhere.

struct Params {
    k        : u32,
    zoom     : f32,
    gravity  : f32,
    margin   : f32,
    deadband : f32,
    ease     : f32,
    aspect   : f32,   // frame w/h \\u2014 the box's halfSide is a fraction of WIDTH
    _pad     : f32,
}

// cmd.x \\u2014 0 auto (track), 1 manual-hold (frozen), 2 manual-solve (snap once).
const MODE_HOLD  : f32 = 1.0;
const MODE_SOLVE : f32 = 2.0;
// Subject hysteresis: a challenger must be this much bigger than the incumbent
// to take the camera, and the incumbent is re-found within this radius (or 2\\xD7
// its own halfSide, whichever is larger).
const SWITCH_RATIO     : f32 = 1.25;
const TRACK_RADIUS_MIN : f32 = 0.1;

@group(0) @binding(0) var<storage, read>       box_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       prev_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       cmd_buf  : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params   : Params;
@group(0) @binding(4) var<storage, read_write> out_buf  : array<vec4<f32>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
    let prev   = prev_buf[0];
    let prev_s = prev_buf[1];
    let mode   = cmd_buf[0].x;

    // \\u2500\\u2500 subject selection, with hysteresis \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    // Challenger = the largest live face.
    var chal = -1;
    var chal_hs = 0.0;
    for (var i = 0u; i < params.k; i++) {
        let b = box_buf[i];
        if (b.w > 0.0 && b.z > chal_hs) { chal_hs = b.z; chal = i32(i); }
    }
    if (chal < 0) {
        out_buf[0] = prev;
        out_buf[1] = prev_s;   // keep the memory: a one-frame detection miss must
        return;                // not hand the camera to someone else
    }

    // Incumbent = the live face nearest where the subject was, tracked by
    // position because slot indices aren't stable identities.
    var inc = -1;
    var inc_d = 1e9;
    if (prev_s.w > 0.5) {
        let radius = max(TRACK_RADIUS_MIN, prev_s.z * 2.0);
        for (var i = 0u; i < params.k; i++) {
            let b = box_buf[i];
            if (b.w <= 0.0) { continue; }
            let d = length(vec2<f32>(b.x - prev_s.x, b.y - prev_s.y));
            if (d < radius && d < inc_d) { inc_d = d; inc = i32(i); }
        }
    }

    // Stick with the incumbent unless the challenger is decisively bigger.
    // halfSide \\u2248 1/distance, so 1.25\\xD7 \\u2248 "20% closer to the camera" \\u2014 enough that
    // two people sitting side by side can't trade the camera back and forth.
    var pick = chal;
    if (inc >= 0 && chal_hs <= box_buf[u32(inc)].z * SWITCH_RATIO) { pick = inc; }
    let subj = box_buf[u32(pick)];
    out_buf[1] = vec4<f32>(subj.x, subj.y, subj.z, 1.0);

    // Solve. Stepped relaxation rather than closed-form: the frame-edge clamp
    // makes the centre depend on the crop size, so it's implicit.
    let half_x = subj.z;
    let half_y = subj.z * params.aspect;
    // Fallback = the FULL frame, i.e. no reframe at all. A subject too close to
    // the edge to contain can't be rescued by relaxing zoom (once the crop centre
    // clamps to the frame edge, the containment test reduces to x >= half+margin,
    // independent of zoom) \\u2014 so it falls through to this and eases out to the raw
    // frame. That IS "head in the corner does nothing"; holding the last crop
    // instead would freeze on a shot the subject is walking out of.
    //
    // What the relaxation actually buys is the other axis: a subject too BIG for
    // the requested zoom (a close-up) backs the crop off until they fit.
    var w_cx = 0.5; var w_cy = 0.5; var w_s = 1.0;
    for (var t = 0; t <= 25; t++) {
        let z = params.zoom + (1.0 - params.zoom) * (f32(t) / 25.0);
        let s = 1.0 / z;
        let cx = clamp(0.5 + params.gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        let cy = clamp(0.5 + params.gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + half_x + params.margin <= s * 0.5 &&
            abs(subj.y - cy) + half_y + params.margin <= s * 0.5) {
            w_cx = cx; w_cy = cy; w_s = s;
            break;
        }
    }
    // size 0 = uninitialised: snap rather than easing in from nothing. This is
    // also what makes manual mode "reframe once when enabled, then freeze".
    if (prev.z <= 0.0 || mode == MODE_SOLVE) {
        out_buf[0] = vec4<f32>(w_cx, w_cy, w_s, 0.0);
        return;
    }
    if (mode == MODE_HOLD) { out_buf[0] = prev; return; }

    let d = length(vec2<f32>(w_cx - prev.x, w_cy - prev.y)) + abs(w_s - prev.z);
    var moving = prev.w;
    if (d > params.deadband) { moving = 1.0; }
    else if (d < params.deadband * 0.3) { moving = 0.0; }
    if (moving < 0.5) { out_buf[0] = vec4<f32>(prev.xyz, 0.0); return; }

    out_buf[0] = vec4<f32>(
        mix(prev.x, w_cx, params.ease),
        mix(prev.y, w_cy, params.ease),
        mix(prev.z, w_s,  params.ease),
        1.0,
    );
}
\`;var Eo=\`enable f16;

// Auto-reframe state update (f16 storage, f32 math) \\u2014 one thread, one frame of camera work.
// NOTE f16: the ease step is ~0.07\\xB7d and only runs while d > deadband(0.09), so
// steps are ~1.9e-3 \\u2014 comfortably above f16's ~4.9e-4 resolution near 0.5. It
// converges to the deadband then holds exactly (prev is passed through, not
// re-lerped), so there's no slow drift.
// In:  boxes (1\\xD7K\\xD74, FaceBoxesFromHeatmaps), prev state, command.
// Out: new state, 1\\xD71\\xD78 = two vec4s:
//        [0] (cx, cy, size, moving)   \\u2014 the view rect; all FRAME FRACTIONS
//        [1] (subjX, subjY, subjHs, valid) \\u2014 the incumbent subject, for hysteresis
//
// The subject is remembered by POSITION, not by slot: FaceBoxesFromHeatmaps
// orders its slots by NMS score, so slot 1 can be a different person next frame.
//
// \\\`size\\\` is a fraction of BOTH width and height, which is what preserves the
// frame's aspect: equal fractions of a 640\\xD7400 frame is still 8:5.
//
// The rule (tuned in demo/reframe.ts):
//   centre = frameCentre + gravity\\xB7(subject \\u2212 frameCentre)   \\u2014 pull, never centre
//   crop   = frame / zoom
//   constraints: the crop stays INSIDE the frame AND contains the subject+margin
// Neither is a special case; "head in the corner does nothing" falls out of them:
// once the crop centre clamps to the frame edge, containment reduces to
// x >= half+margin regardless of zoom, so an edge subject simply never fits and
// the solve falls through to its full-frame fallback (= no reframe). The zoom
// relaxation earns its keep elsewhere \\u2014 backing off for a subject too BIG for
// the requested crop.
//
// Smoothing is deadband + ease: hold, move deliberately, hold. A plain EMA reads
// as swimming as the subject breathes.
//
// State is threaded across frames by the renderer with copyTensor \\u2014 same carrier
// pattern as the flow stabilizer's stabPrev. No readback anywhere.

struct Params {
    k        : u32,
    zoom     : f32,
    gravity  : f32,
    margin   : f32,
    deadband : f32,
    ease     : f32,
    aspect   : f32,   // frame w/h \\u2014 the box's halfSide is a fraction of WIDTH
    _pad     : f32,
}

// cmd.x \\u2014 0 auto (track), 1 manual-hold (frozen), 2 manual-solve (snap once).
const MODE_HOLD  : f32 = 1.0;
const MODE_SOLVE : f32 = 2.0;
// Subject hysteresis: a challenger must be this much bigger than the incumbent
// to take the camera, and the incumbent is re-found within this radius (or 2\\xD7
// its own halfSide, whichever is larger).
const SWITCH_RATIO     : f32 = 1.25;
const TRACK_RADIUS_MIN : f32 = 0.1;

@group(0) @binding(0) var<storage, read>       box_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       prev_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       cmd_buf  : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params   : Params;
@group(0) @binding(4) var<storage, read_write> out_buf  : array<vec4<f16>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
    let prev   = vec4<f32>(prev_buf[0]);
    let prev_s = vec4<f32>(prev_buf[1]);
    let mode   = f32(cmd_buf[0].x);

    // \\u2500\\u2500 subject selection, with hysteresis \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    // Challenger = the largest live face.
    var chal = -1;
    var chal_hs = 0.0;
    for (var i = 0u; i < params.k; i++) {
        let b = vec4<f32>(box_buf[i]);
        if (b.w > 0.0 && b.z > chal_hs) { chal_hs = b.z; chal = i32(i); }
    }
    if (chal < 0) {
        out_buf[0] = vec4<f16>(prev);
        out_buf[1] = vec4<f16>(prev_s);   // keep the memory: a one-frame detection miss must
        return;                // not hand the camera to someone else
    }

    // Incumbent = the live face nearest where the subject was, tracked by
    // position because slot indices aren't stable identities.
    var inc = -1;
    var inc_d = 1e9;
    if (prev_s.w > 0.5) {
        let radius = max(TRACK_RADIUS_MIN, prev_s.z * 2.0);
        for (var i = 0u; i < params.k; i++) {
            let b = vec4<f32>(box_buf[i]);
            if (b.w <= 0.0) { continue; }
            let d = length(vec2<f32>(b.x - prev_s.x, b.y - prev_s.y));
            if (d < radius && d < inc_d) { inc_d = d; inc = i32(i); }
        }
    }

    // Stick with the incumbent unless the challenger is decisively bigger.
    // halfSide \\u2248 1/distance, so 1.25\\xD7 \\u2248 "20% closer to the camera" \\u2014 enough that
    // two people sitting side by side can't trade the camera back and forth.
    var pick = chal;
    if (inc >= 0 && chal_hs <= f32(box_buf[u32(inc)].z) * SWITCH_RATIO) { pick = inc; }
    let subj = vec4<f32>(box_buf[u32(pick)]);
    out_buf[1] = vec4<f16>(vec4<f32>(subj.x, subj.y, subj.z, 1.0));

    // Solve. Stepped relaxation rather than closed-form: the frame-edge clamp
    // makes the centre depend on the crop size, so it's implicit.
    let half_x = subj.z;
    let half_y = subj.z * params.aspect;
    // Fallback = the FULL frame, i.e. no reframe at all. A subject too close to
    // the edge to contain can't be rescued by relaxing zoom (once the crop centre
    // clamps to the frame edge, the containment test reduces to x >= half+margin,
    // independent of zoom) \\u2014 so it falls through to this and eases out to the raw
    // frame. That IS "head in the corner does nothing"; holding the last crop
    // instead would freeze on a shot the subject is walking out of.
    //
    // What the relaxation actually buys is the other axis: a subject too BIG for
    // the requested zoom (a close-up) backs the crop off until they fit.
    var w_cx = 0.5; var w_cy = 0.5; var w_s = 1.0;
    for (var t = 0; t <= 25; t++) {
        let z = params.zoom + (1.0 - params.zoom) * (f32(t) / 25.0);
        let s = 1.0 / z;
        let cx = clamp(0.5 + params.gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        let cy = clamp(0.5 + params.gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + half_x + params.margin <= s * 0.5 &&
            abs(subj.y - cy) + half_y + params.margin <= s * 0.5) {
            w_cx = cx; w_cy = cy; w_s = s;
            break;
        }
    }
    // size 0 = uninitialised: snap rather than easing in from nothing. This is
    // also what makes manual mode "reframe once when enabled, then freeze".
    if (prev.z <= 0.0 || mode == MODE_SOLVE) {
        out_buf[0] = vec4<f16>(vec4<f32>(w_cx, w_cy, w_s, 0.0));
        return;
    }
    if (mode == MODE_HOLD) { out_buf[0] = vec4<f16>(prev); return; }

    let d = length(vec2<f32>(w_cx - prev.x, w_cy - prev.y)) + abs(w_s - prev.z);
    var moving = prev.w;
    if (d > params.deadband) { moving = 1.0; }
    else if (d < params.deadband * 0.3) { moving = 0.0; }
    if (moving < 0.5) { out_buf[0] = vec4<f16>(vec4<f32>(prev.xyz, 0.0)); return; }

    out_buf[0] = vec4<f16>(vec4<f32>(
        mix(prev.x, w_cx, params.ease),
        mix(prev.y, w_cy, params.ease),
        mix(prev.z, w_s,  params.ease),
        1.0,
    ));
}
\`;var nt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch",[1,1,1]);i(this,"shader");this.shader=r.dtype==="f16"?Eo:Ao,this.output=r.tensor(1,1,8),this.inputs=[t,a,o],this.createUniform("params","Params");let n=new ArrayBuffer(32);new Uint32Array(n,0,1)[0]=t.w*t.h;let p=new Float32Array(n,4,7);p[0]=s.zoom,p[1]=s.gravity,p[2]=s.margin,p[3]=s.deadband,p[4]=s.ease,p[5]=s.aspect,this.setUniform("params",new Uint32Array(n)),this.defaultSetup()}};var Fo=\`// Apply the reframe crop (f32): sample \\\`src\\\` through the view rect. Same shape
// in and out \\u2014 this is the geometric slot of the one-compositor design.
//
// Applied AFTER the effect chain (touch-up draws its mesh at FULL-frame landmark
// coords; reframing upstream would land every face effect in the wrong place),
// and to the foreground + alpha only. The background is bound separately by the
// compositor and deliberately does NOT move \\u2014 you zoom toward the person, the
// virtual backdrop behind them stays put. Blur backgrounds are derived from the
// foreground, so they follow for free; no per-mode special case.
//
// rect = (cx, cy, size, moving) in frame fractions; size is a fraction of BOTH
// dims (that's what preserves aspect). size \\u2264 0 means uninitialised \\u2192 identity.

struct Params {
    h : u32,
    w : u32,
}

@group(0) @binding(0) var<storage, read>       src_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       rect_buf : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params   : Params;
@group(0) @binding(3) var<storage, read_write> out_buf  : array<vec4<f32>>;

fn samp(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(params.w) - 1);
    let cy = clamp(y, 0, i32(params.h) - 1);
    return src_buf[u32(cy) * params.w + u32(cx)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.w || gid.y >= params.h) { return; }

    let r = rect_buf[0];
    var s = r.z; var rcx = r.x; var rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }   // identity until the first solve

    let fx = (rcx - s * 0.5) + ((f32(gid.x) + 0.5) / f32(params.w)) * s;
    let fy = (rcy - s * 0.5) + ((f32(gid.y) + 0.5) / f32(params.h)) * s;
    // frame fraction \\u2192 texel index (a texel's centre sits at index + 0.5), so an
    // identity rect samples each texel exactly and the op is a bit-exact copy.
    let sx = fx * f32(params.w) - 0.5;
    let sy = fy * f32(params.h) - 0.5;

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    let bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    out_buf[gid.y * params.w + gid.x] = mix(top, bot, ty);
}
\`;var Oo=\`enable f16;

// Apply the reframe crop (f16 storage, f32 math): sample \\\`src\\\` through the view rect. Same shape
// in and out \\u2014 this is the geometric slot of the one-compositor design.
//
// Applied AFTER the effect chain (touch-up draws its mesh at FULL-frame landmark
// coords; reframing upstream would land every face effect in the wrong place),
// and to the foreground + alpha only. The background is bound separately by the
// compositor and deliberately does NOT move \\u2014 you zoom toward the person, the
// virtual backdrop behind them stays put. Blur backgrounds are derived from the
// foreground, so they follow for free; no per-mode special case.
//
// rect = (cx, cy, size, moving) in frame fractions; size is a fraction of BOTH
// dims (that's what preserves aspect). size \\u2264 0 means uninitialised \\u2192 identity.

struct Params {
    h : u32,
    w : u32,
}

@group(0) @binding(0) var<storage, read>       src_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       rect_buf : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params   : Params;
@group(0) @binding(3) var<storage, read_write> out_buf  : array<vec4<f16>>;

fn samp(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(params.w) - 1);
    let cy = clamp(y, 0, i32(params.h) - 1);
    return vec4<f32>(src_buf[u32(cy) * params.w + u32(cx)]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.w || gid.y >= params.h) { return; }

    let r = vec4<f32>(rect_buf[0]);
    var s = r.z; var rcx = r.x; var rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }   // identity until the first solve

    let fx = (rcx - s * 0.5) + ((f32(gid.x) + 0.5) / f32(params.w)) * s;
    let fy = (rcy - s * 0.5) + ((f32(gid.y) + 0.5) / f32(params.h)) * s;
    // frame fraction \\u2192 texel index (a texel's centre sits at index + 0.5), so an
    // identity rect samples each texel exactly and the op is a bit-exact copy.
    let sx = fx * f32(params.w) - 0.5;
    let sy = fy * f32(params.h) - 0.5;

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    let bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    out_buf[gid.y * params.w + gid.x] = vec4<f16>(mix(top, bot, ty));
}
\`;var ut=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Oo:Fo,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var Ro=\`// Box-driven square crop + bilinear resample + channel normalization (f32).
// Reads the box tensor (FaceBoxFromHeatmaps output: cx, cy, halfSide, score in
// frame fractions; halfSide as a fraction of frame WIDTH) and emits the
// landmark model's input: ((rgb - mean) / std), .w = 0.
//
// Sampling mirrors landmark training's warpAffine: src = center + (u - out/2)
// \\xB7 side/out \\u2014 u is the integer output pixel index (cv2 convention).

struct Params {
    in_h  : u32,
    in_w  : u32,
    out_h : u32,
    out_w : u32,
    slot  : u32,        // box-tensor slot (multi-face); 0 for the single-face path
    pad0  : u32,
    pad1  : u32,
    pad2  : u32,
    mean  : vec4<f32>,   // .xyz used
    stdev : vec4<f32>,   // .xyz used
}

@group(0) @binding(0) var<storage, read>       frame_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       box_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params    : Params;
@group(0) @binding(3) var<storage, read_write> out_buf   : array<vec4<f32>>;

fn samp(x: i32, y: i32, W: i32, H: i32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return frame_buf[u32(cy) * u32(W) + u32(cx)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let W = i32(params.in_w);
    let H = i32(params.in_h);
    let box = box_buf[params.slot];
    let cx   = box.x * f32(params.in_w);
    let cy   = box.y * f32(params.in_h);
    let side = 2.0 * box.z * f32(params.in_w);   // square in frame px

    let sx = clamp(cx + (f32(x) - f32(params.out_w) * 0.5) * side / f32(params.out_w), 0.0, f32(W - 1));
    let sy = clamp(cy + (f32(y) - f32(params.out_h) * 0.5) * side / f32(params.out_h), 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H), samp(x0 + 1, y0, W, H), tx);
    let bot = mix(samp(x0, y0 + 1, W, H), samp(x0 + 1, y0 + 1, W, H), tx);
    let v = mix(top, bot, ty);

    let n = (v.rgb - params.mean.rgb) / params.stdev.rgb;
    out_buf[y * params.out_w + x] = vec4<f32>(n, 0.0);
}
\`;var Do=\`enable f16;

// Box-driven square crop + bilinear resample + channel normalization (f16 storage, f32 math).
// Reads the box tensor (FaceBoxFromHeatmaps output: cx, cy, halfSide, score in
// frame fractions; halfSide as a fraction of frame WIDTH) and emits the
// landmark model's input: ((rgb - mean) / std), .w = 0.
//
// Sampling mirrors landmark training's warpAffine: src = center + (u - out/2)
// \\xB7 side/out \\u2014 u is the integer output pixel index (cv2 convention).

struct Params {
    in_h  : u32,
    in_w  : u32,
    out_h : u32,
    out_w : u32,
    slot  : u32,        // box-tensor slot (multi-face); 0 for the single-face path
    pad0  : u32,
    pad1  : u32,
    pad2  : u32,
    mean  : vec4<f32>,   // .xyz used
    stdev : vec4<f32>,   // .xyz used
}

@group(0) @binding(0) var<storage, read>       frame_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       box_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params    : Params;
@group(0) @binding(3) var<storage, read_write> out_buf   : array<vec4<f16>>;

fn samp(x: i32, y: i32, W: i32, H: i32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return vec4<f32>(frame_buf[u32(cy) * u32(W) + u32(cx)]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let W = i32(params.in_w);
    let H = i32(params.in_h);
    let box = vec4<f32>(box_buf[params.slot]);
    let cx   = box.x * f32(params.in_w);
    let cy   = box.y * f32(params.in_h);
    let side = 2.0 * box.z * f32(params.in_w);   // square in frame px

    let sx = clamp(cx + (f32(x) - f32(params.out_w) * 0.5) * side / f32(params.out_w), 0.0, f32(W - 1));
    let sy = clamp(cy + (f32(y) - f32(params.out_h) * 0.5) * side / f32(params.out_h), 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H), samp(x0 + 1, y0, W, H), tx);
    let bot = mix(samp(x0, y0 + 1, W, H), samp(x0 + 1, y0 + 1, W, H), tx);
    let v = mix(top, bot, ty);

    let n = (v.rgb - params.mean.rgb) / params.stdev.rgb;
    out_buf[y * params.out_w + x] = vec4<f16>(vec4<f32>(n, 0.0));
}
\`;var pt=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Do:Ro,this.output=r.tensor(o.outH,o.outW,4),this.inputs=[t,a];let s=o.slot??0;if(s>=a.w*a.h)throw new Error(\`CropResample: slot \${s} out of range for a \${a.h}\\xD7\${a.w} box tensor\`);this.createUniform("params","Params");let n=new ArrayBuffer(64),p=new Uint32Array(n,0,5);p[0]=t.h,p[1]=t.w,p[2]=o.outH,p[3]=o.outW,p[4]=s,new Float32Array(n,32,4).set([...o.mean,0]),new Float32Array(n,48,4).set([...o.std,1]),this.setUniform("params",new Uint32Array(n)),this.defaultSetup(),this.dispatch=[Math.ceil(o.outW/8),Math.ceil(o.outH/8),1]}};var Io=\`// Landmark overlay (f32) \\u2014 draws the image, then VERTEX-PULLS landmark dots
// straight from the LandmarkNet output tensor: the vertex shader fetches
// landmark i from the storage buffer and transforms crop coords \\u2192 canvas NDC
// via the box tensor. The per-frame landmark data never touches the CPU.
//
// Entry points: vs_img/fs_img (fullscreen image, 6 verts) and vs_pts/fs_pts
// (count \\xD7 6 verts \\u2014 one quad per landmark; WebGPU has no point size).

struct Params {
    img_w      : u32,
    count      : u32,
    thresh     : f32,   // hide all dots when box score < thresh
    point_size : f32,   // dot diameter in canvas px
    slot       : u32,   // box-tensor slot to read (multi-face); 0 = single-face
    color      : vec4<f32>,
    canvas     : vec4<f32>,   // .xy = canvas w, h
}

@group(0) @binding(0) var<storage, read> image_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f32>>;   // 478 \\xD7 (x, y), [0,1] crop coords
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f32>>;   // (cx, cy, halfSide/W, score) frame fractions
@group(0) @binding(3) var<uniform>       params    : Params;

// \\u2500\\u2500 image pass \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct VOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs_img(@builtin(vertex_index) vi: u32) -> VOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

@fragment
fn fs_img(in: VOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * params.img_w + u32(in.pos.x);
    return vec4<f32>(image_buf[i].rgb, 1.0);
}

// \\u2500\\u2500 landmark dots \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

@vertex
fn vs_pts(@builtin(vertex_index) vi: u32) -> VOut {
    let i      = vi / 6u;
    let corner = vi % 6u;
    var out: VOut;

    let box = box_buf[params.slot];
    if (box.w < params.thresh || i >= params.count) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);   // clipped away
        return out;
    }

    // Landmark i: two (x, y) pairs per vec4.
    var g = lm_buf[i / 2u];
    let lx = g[(i % 2u) * 2u];
    let ly = g[(i % 2u) * 2u + 1u];

    // Crop coords [0,1] \\u2192 frame fractions. halfSide is a fraction of WIDTH;
    // the y half-extent rescales by the canvas aspect (the box is px-square).
    let hsx = box.z;
    let hsy = box.z * params.canvas.x / params.canvas.y;
    let px = (box.x - hsx) + lx * 2.0 * hsx;
    let py = (box.y - hsy) + ly * 2.0 * hsy;

    let corners = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    let off = corners[corner] * params.point_size / params.canvas.xy;   // NDC half-extents \\xD72
    out.pos = vec4<f32>(px * 2.0 - 1.0 + off.x, 1.0 - 2.0 * py + off.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_pts(in: VOut) -> @location(0) vec4<f32> {
    return vec4<f32>(params.color.rgb, 1.0);
}
\`;var Mo=\`enable f16;

// Landmark overlay (f16 storage, f32 math) \\u2014 draws the image, then VERTEX-PULLS landmark dots
// straight from the LandmarkNet output tensor: the vertex shader fetches
// landmark i from the storage buffer and transforms crop coords \\u2192 canvas NDC
// via the box tensor. The per-frame landmark data never touches the CPU.
//
// Entry points: vs_img/fs_img (fullscreen image, 6 verts) and vs_pts/fs_pts
// (count \\xD7 6 verts \\u2014 one quad per landmark; WebGPU has no point size).

struct Params {
    img_w      : u32,
    count      : u32,
    thresh     : f32,   // hide all dots when box score < thresh
    point_size : f32,   // dot diameter in canvas px
    slot       : u32,   // box-tensor slot to read (multi-face); 0 = single-face
    color      : vec4<f32>,
    canvas     : vec4<f32>,   // .xy = canvas w, h
}

@group(0) @binding(0) var<storage, read> image_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f16>>;   // 478 \\xD7 (x, y), [0,1] crop coords
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f16>>;   // (cx, cy, halfSide/W, score) frame fractions
@group(0) @binding(3) var<uniform>       params    : Params;

// \\u2500\\u2500 image pass \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct VOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs_img(@builtin(vertex_index) vi: u32) -> VOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

@fragment
fn fs_img(in: VOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * params.img_w + u32(in.pos.x);
    return vec4<f32>(vec3<f32>(image_buf[i].rgb), 1.0);
}

// \\u2500\\u2500 landmark dots \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

@vertex
fn vs_pts(@builtin(vertex_index) vi: u32) -> VOut {
    let i      = vi / 6u;
    let corner = vi % 6u;
    var out: VOut;

    let box = vec4<f32>(box_buf[params.slot]);
    if (box.w < params.thresh || i >= params.count) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);   // clipped away
        return out;
    }

    // Landmark i: two (x, y) pairs per vec4.
    var g = vec4<f32>(lm_buf[i / 2u]);
    let lx = g[(i % 2u) * 2u];
    let ly = g[(i % 2u) * 2u + 1u];

    // Crop coords [0,1] \\u2192 frame fractions. halfSide is a fraction of WIDTH;
    // the y half-extent rescales by the canvas aspect (the box is px-square).
    let hsx = box.z;
    let hsy = box.z * params.canvas.x / params.canvas.y;
    let px = (box.x - hsx) + lx * 2.0 * hsx;
    let py = (box.y - hsy) + ly * 2.0 * hsy;

    let corners = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    let off = corners[corner] * params.point_size / params.canvas.xy;   // NDC half-extents \\xD72
    out.pos = vec4<f32>(px * 2.0 - 1.0 + off.x, 1.0 - 2.0 * py + off.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_pts(in: VOut) -> @location(0) vec4<f32> {
    return vec4<f32>(params.color.rgb, 1.0);
}
\`;var ct=class{constructor(e,r,t,a,o){i(this,"backend",e);i(this,"imgPipeline");i(this,"ptsPipeline");i(this,"imgBindGroup");i(this,"ptsBindGroup");i(this,"count");i(this,"drawImage");i(this,"outputView",null);if(t.c<o.count*2)throw new Error(\`LandmarkOverlay: landmarks tensor holds \${t.c/2} points < count \${o.count}\`);let s=o.slot??0;if(s>=a.w*a.h)throw new Error(\`LandmarkOverlay: slot \${s} out of range for a \${a.h}\\xD7\${a.w} box tensor\`);this.count=o.count,this.drawImage=o.drawImage??!0;let n=e.device,p=n.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),c=new ArrayBuffer(64),l=new Uint32Array(c,0,2);l[0]=r.w,l[1]=o.count;let d=new Float32Array(c,8,2);d[0]=o.thresh,d[1]=o.pointSize,new Uint32Array(c,16,1)[0]=s,new Float32Array(c,32,4).set([...o.color,1]),new Float32Array(c,48,4).set([r.w,r.h,0,0]),n.queue.writeBuffer(p,0,c);let f=n.createShaderModule({code:e.dtype==="f16"?Mo:Io}),x=[{format:e.canvasFormat}];this.imgPipeline=n.createRenderPipeline({layout:"auto",vertex:{module:f,entryPoint:"vs_img"},fragment:{module:f,entryPoint:"fs_img",targets:x},primitive:{topology:"triangle-list"}}),this.ptsPipeline=n.createRenderPipeline({layout:"auto",vertex:{module:f,entryPoint:"vs_pts"},fragment:{module:f,entryPoint:"fs_pts",targets:x},primitive:{topology:"triangle-list"}}),this.imgBindGroup=n.createBindGroup({layout:this.imgPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.buffer}},{binding:3,resource:{buffer:p}}]}),this.ptsBindGroup=n.createBindGroup({layout:this.ptsPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:a.buffer}},{binding:3,resource:{buffer:p}}]})}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("LandmarkOverlayWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.backend.device.createCommandEncoder(),t=r.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:this.drawImage?"clear":"load",storeOp:"store"}]});this.drawImage&&(t.setPipeline(this.imgPipeline),t.setBindGroup(0,this.imgBindGroup),t.draw(6)),t.setPipeline(this.ptsPipeline),t.setBindGroup(0,this.ptsBindGroup),t.draw(this.count*6),t.end(),e||this.backend.device.queue.submit([r.finish()]),this.outputView=null}};var Er=\`// UV-space face touch-up (f32) \\u2014 five passes, one module:
//   unwrap    : canonical mesh \\u2192 512\\xB2 atlas; vertex at canonical UV, textured
//               by the frame at its landmark's position (vertex-pulled from the
//               landmark tensor, crop \\u2192 frame via the box tensor). The
//               rasterizer's barycentric interpolation IS the piecewise-affine
//               warp \\u2014 one draw call.
//   blur \\xD72   : separable gaussian on the atlas (freq-sep low band). Uses the
//               framebuffer-aligned vquad_fb so read row == write row and no
//               vertical flip accumulates across passes (WebGPU NDC-y is up,
//               texel rows are down).
//   combine   : low + (atlas \\u2212 low) \\xB7 detail \\u2014 smooths skin, keeps pores.
//   composite : frame passthrough, then the mesh drawn at landmark screen
//               positions sampling the smoothed atlas, blended by the static
//               weight mask \\xD7 strength. Score-gated: no face \\u2192 passthrough.
//
// Landmarks are [0,1] CROP coords; the box tensor (cx, cy, halfSide/W, score,
// frame fractions) turns them into frame fractions in the vertex shaders \\u2014
// the whole path stays GPU-resident.

struct Uni {
    frame_w  : u32,
    frame_h  : u32,
    sigma    : f32,
    detail   : f32,
    strength : f32,
    thresh   : f32,
    dir      : vec2<f32>,   // blur step (1/atlas, 0) or (0, 1/atlas)
    canvas   : vec2<f32>,   // frame w, h (aspect for the box y half-extent)
    slots    : u32,         // faces packed into lm_buf / box_buf (1 or 4)
    grid     : u32,         // atlas tile grid: 1 \\u2192 whole atlas, 2 \\u2192 2\\xD72 tiles
}

@group(0) @binding(0) var<storage, read> frame_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>       uni       : Uni;
@group(0) @binding(4) var samp : sampler;
@group(0) @binding(5) var tex0 : texture_2d<f32>;
@group(0) @binding(6) var tex1 : texture_2d<f32>;

// Bilinear sample of the frame tensor buffer at frame-fraction coords.
fn frame_at(px: i32, py: i32) -> vec3<f32> {
    let x = clamp(px, 0, i32(uni.frame_w) - 1);
    let y = clamp(py, 0, i32(uni.frame_h) - 1);
    return frame_buf[u32(y) * uni.frame_w + u32(x)].rgb;
}
fn frame_bilinear(f: vec2<f32>) -> vec3<f32> {
    let sx = clamp(f.x * f32(uni.frame_w) - 0.5, 0.0, f32(uni.frame_w - 1u));
    let sy = clamp(f.y * f32(uni.frame_h) - 0.5, 0.0, f32(uni.frame_h - 1u));
    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);
    let top = mix(frame_at(x0, y0),     frame_at(x0 + 1, y0),     tx);
    let bot = mix(frame_at(x0, y0 + 1), frame_at(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}

// Landmark i \\u2192 (frame-fraction x, y, score). halfSide is a fraction of frame
// WIDTH; the y half-extent rescales by the aspect (the box is px-square).
fn lm_frame(i: u32, face: u32) -> vec3<f32> {
    let box = box_buf[face];
    // lm_buf packs \\\`slots\\\` faces \\xD7 478 landmarks (ChannelConcat of the K
    // LandmarkNet outputs); 478 is even, so face f starts on a vec4 boundary.
    let gi = face * 478u + i;
    var g = lm_buf[gi / 2u];
    let lx = g[(gi % 2u) * 2u];
    let ly = g[(gi % 2u) * 2u + 1u];
    let hsx = box.z;
    let hsy = box.z * uni.canvas.x / uni.canvas.y;
    return vec3<f32>((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face \\\`face\\\` owns tile (face % grid, face / grid) of the atlas. grid=1 (K=1)
// maps to the whole atlas \\u2014 i.e. the single-face layout, unchanged.
fn tile_uv(uv: vec2<f32>, face: u32) -> vec2<f32> {
    let g = f32(uni.grid);
    return (uv + vec2<f32>(f32(face % uni.grid), f32(face / uni.grid))) / g;
}

// The tile containing \\\`uv\\\`, as (lo.x, lo.y, hi.x, hi.y) \\u2014 filter passes clamp
// their taps to it so one face's skin can't bleed into a neighbour's tile.
fn tile_bounds(uv: vec2<f32>) -> vec4<f32> {
    let g = f32(uni.grid);
    let t = floor(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.99999)) * g);
    return vec4<f32>(t / g, (t + vec2<f32>(1.0, 1.0)) / g);
}

// \\u2500\\u2500 unwrap: mesh \\u2192 atlas \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct UnwrapOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) src: vec2<f32>,   // frame-fraction sample position
};

@vertex
fn vs_unwrap(@builtin(instance_index) inst: u32,
             @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> UnwrapOut {
    var out: UnwrapOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.src = l.xy;
    let uv = tile_uv(a_uv, inst);
    out.pos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);   // atlas row == uv.y
    return out;
}

@fragment
fn fs_unwrap(in: UnwrapOut) -> @location(0) vec4<f32> {
    return vec4<f32>(frame_bilinear(in.src), 1.0);
}

// \\u2500\\u2500 fullscreen quads \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct QOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Framebuffer-aligned uv for FILTER passes: uv.y equals the output texel's
// row so read == write and no flip accumulates.
@vertex
fn vs_quad_fb(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
    return out;
}

@fragment
fn fs_blur(in: QOut) -> @location(0) vec4<f32> {
    // dir is always \\xB11/ATLAS, so this recovers the atlas texel size.
    let tb = tile_bounds(in.uv);
    let ht = max(uni.dir.x, uni.dir.y) * 0.5;
    let lo = tb.xy + ht;
    let hi = tb.zw - ht;
    let s = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(s * 2.5), 1.0, 48.0));
    var sum = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var i = -48; i <= 48; i++) {
        if (i < -R || i > R) { continue; }
        let w = exp(-f32(i * i) / (2.0 * s * s));
        sum += textureSample(tex0, samp, clamp(in.uv + uni.dir * f32(i), lo, hi)) * w;
        wsum += w;
    }
    return sum / wsum;
}

@fragment
fn fs_combine(in: QOut) -> @location(0) vec4<f32> {
    let a  = textureSample(tex0, samp, in.uv);
    let lo = textureSample(tex1, samp, in.uv);
    return clamp(lo + (a - lo) * uni.detail, vec4<f32>(0.0), vec4<f32>(1.0));
}

// Single-pass edge-preserving bilateral (style 'bilateral'). uni.dir carries
// the 2D texel size here; range sigma 0.15 (edge stop), spatial radius \\u2264 12.
@fragment
fn fs_bilateral(in: QOut) -> @location(0) vec4<f32> {
    let btb = tile_bounds(in.uv);
    let bht = max(uni.dir.x, uni.dir.y) * 0.5;
    let blo = btb.xy + bht;
    let bhi = btb.zw - bht;
    let ss = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(ss), 1.0, 12.0));
    let sr = 0.15;
    let c = textureSample(tex0, samp, in.uv).rgb;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var y = -12; y <= 12; y++) {
        if (y < -R || y > R) { continue; }
        for (var x = -12; x <= 12; x++) {
            if (x < -R || x > R) { continue; }
            let sc = textureSample(tex0, samp, clamp(in.uv + uni.dir * vec2<f32>(f32(x), f32(y)), blo, bhi)).rgb;
            let ws = exp(-f32(x * x + y * y) / (2.0 * ss * ss));
            let d = sc - c;
            let wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    return vec4<f32>(sum / wsum, 1.0);
}

// \\u2500\\u2500 composite: passthrough + mesh over the face \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

@vertex
fn vs_pass(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(0.0);
    return out;
}

@fragment
fn fs_pass(in: QOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * uni.frame_w + u32(in.pos.x);
    return vec4<f32>(frame_buf[i].rgb, 1.0);
}

struct CompOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,      // TILED atlas uv \\u2014 the atlas is per-face
    @location(1) src: vec2<f32>,     // frame-fraction position
    @location(2) uv_mask: vec2<f32>, // UNTILED canonical uv \\u2014 the weight mask is
                                     // one static 512\\xB2 asset shared by every face
};

@vertex
fn vs_comp(@builtin(instance_index) inst: u32,
           @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> CompOut {
    var out: CompOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.uv = tile_uv(a_uv, inst);
    out.uv_mask = a_uv;
    out.src = l.xy;
    out.pos = vec4<f32>(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_comp(in: CompOut) -> @location(0) vec4<f32> {
    let orig = frame_bilinear(in.src);
    let sm   = textureSample(tex0, samp, in.uv).rgb;                   // smoothed atlas \\u2014 TILED
    // The weight mask is NOT tiled: it's one canonical 512\\xB2 asset, so it must be
    // sampled with the untiled uv. Using the tiled uv here made every face read
    // only its quadrant OF THE MASK, stretched over the whole face \\u2014 invisible at
    // slots=1 (tile_uv is identity) and badly wrong at slots=4.
    let w    = textureSample(tex1, samp, in.uv_mask).r * uni.strength; // weight mask \\u2014 UNTILED
    return vec4<f32>(mix(orig, sm, w), 1.0);
}

// \\u2500\\u2500 stage mode: unpack the composited float texture into the output tensor \\u2500\\u2500
// (WebGPU tensors are storage buffers; the mesh passes need a raster target.
// copyTextureToBuffer has a 256-byte bytesPerRow constraint that arbitrary
// widths violate, so a tiny compute blit does the copy instead.)

@group(0) @binding(7) var<storage, read_write> unpack_out : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn cs_unpack(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= uni.frame_w || gid.y >= uni.frame_h) { return; }
    let v = textureLoad(tex0, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
    unpack_out[gid.y * uni.frame_w + gid.x] = v;
}
\`;var Fr=\`enable f16;

// UV-space face touch-up (f16 storage, f32 math) \\u2014 five passes, one module:
//   unwrap    : canonical mesh \\u2192 512\\xB2 atlas; vertex at canonical UV, textured
//               by the frame at its landmark's position (vertex-pulled from the
//               landmark tensor, crop \\u2192 frame via the box tensor). The
//               rasterizer's barycentric interpolation IS the piecewise-affine
//               warp \\u2014 one draw call.
//   blur \\xD72   : separable gaussian on the atlas (freq-sep low band). Uses the
//               framebuffer-aligned vquad_fb so read row == write row and no
//               vertical flip accumulates across passes (WebGPU NDC-y is up,
//               texel rows are down).
//   combine   : low + (atlas \\u2212 low) \\xB7 detail \\u2014 smooths skin, keeps pores.
//   composite : frame passthrough, then the mesh drawn at landmark screen
//               positions sampling the smoothed atlas, blended by the static
//               weight mask \\xD7 strength. Score-gated: no face \\u2192 passthrough.
//
// Landmarks are [0,1] CROP coords; the box tensor (cx, cy, halfSide/W, score,
// frame fractions) turns them into frame fractions in the vertex shaders \\u2014
// the whole path stays GPU-resident.

struct Uni {
    frame_w  : u32,
    frame_h  : u32,
    sigma    : f32,
    detail   : f32,
    strength : f32,
    thresh   : f32,
    dir      : vec2<f32>,   // blur step (1/atlas, 0) or (0, 1/atlas)
    canvas   : vec2<f32>,   // frame w, h (aspect for the box y half-extent)
    slots    : u32,         // faces packed into lm_buf / box_buf (1 or 4)
    grid     : u32,         // atlas tile grid: 1 \\u2192 whole atlas, 2 \\u2192 2\\xD72 tiles
}

@group(0) @binding(0) var<storage, read> frame_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>       uni       : Uni;
@group(0) @binding(4) var samp : sampler;
@group(0) @binding(5) var tex0 : texture_2d<f32>;
@group(0) @binding(6) var tex1 : texture_2d<f32>;

// Bilinear sample of the frame tensor buffer at frame-fraction coords.
fn frame_at(px: i32, py: i32) -> vec3<f32> {
    let x = clamp(px, 0, i32(uni.frame_w) - 1);
    let y = clamp(py, 0, i32(uni.frame_h) - 1);
    return vec3<f32>(frame_buf[u32(y) * uni.frame_w + u32(x)].rgb);
}
fn frame_bilinear(f: vec2<f32>) -> vec3<f32> {
    let sx = clamp(f.x * f32(uni.frame_w) - 0.5, 0.0, f32(uni.frame_w - 1u));
    let sy = clamp(f.y * f32(uni.frame_h) - 0.5, 0.0, f32(uni.frame_h - 1u));
    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);
    let top = mix(frame_at(x0, y0),     frame_at(x0 + 1, y0),     tx);
    let bot = mix(frame_at(x0, y0 + 1), frame_at(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}

// Landmark i \\u2192 (frame-fraction x, y, score). halfSide is a fraction of frame
// WIDTH; the y half-extent rescales by the aspect (the box is px-square).
fn lm_frame(i: u32, face: u32) -> vec3<f32> {
    let box = vec4<f32>(box_buf[face]);
    // lm_buf packs \\\`slots\\\` faces \\xD7 478 landmarks (ChannelConcat of the K
    // LandmarkNet outputs); 478 is even, so face f starts on a vec4 boundary.
    let gi = face * 478u + i;
    var g = vec4<f32>(lm_buf[gi / 2u]);
    let lx = g[(gi % 2u) * 2u];
    let ly = g[(gi % 2u) * 2u + 1u];
    let hsx = box.z;
    let hsy = box.z * uni.canvas.x / uni.canvas.y;
    return vec3<f32>((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face \\\`face\\\` owns tile (face % grid, face / grid) of the atlas. grid=1 (K=1)
// maps to the whole atlas \\u2014 i.e. the single-face layout, unchanged.
fn tile_uv(uv: vec2<f32>, face: u32) -> vec2<f32> {
    let g = f32(uni.grid);
    return (uv + vec2<f32>(f32(face % uni.grid), f32(face / uni.grid))) / g;
}

// The tile containing \\\`uv\\\`, as (lo.x, lo.y, hi.x, hi.y) \\u2014 filter passes clamp
// their taps to it so one face's skin can't bleed into a neighbour's tile.
fn tile_bounds(uv: vec2<f32>) -> vec4<f32> {
    let g = f32(uni.grid);
    let t = floor(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.99999)) * g);
    return vec4<f32>(t / g, (t + vec2<f32>(1.0, 1.0)) / g);
}

// \\u2500\\u2500 unwrap: mesh \\u2192 atlas \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct UnwrapOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) src: vec2<f32>,   // frame-fraction sample position
};

@vertex
fn vs_unwrap(@builtin(instance_index) inst: u32,
             @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> UnwrapOut {
    var out: UnwrapOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.src = l.xy;
    let uv = tile_uv(a_uv, inst);
    out.pos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);   // atlas row == uv.y
    return out;
}

@fragment
fn fs_unwrap(in: UnwrapOut) -> @location(0) vec4<f32> {
    return vec4<f32>(frame_bilinear(in.src), 1.0);
}

// \\u2500\\u2500 fullscreen quads \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

struct QOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Framebuffer-aligned uv for FILTER passes: uv.y equals the output texel's
// row so read == write and no flip accumulates.
@vertex
fn vs_quad_fb(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
    return out;
}

@fragment
fn fs_blur(in: QOut) -> @location(0) vec4<f32> {
    // dir is always \\xB11/ATLAS, so this recovers the atlas texel size.
    let tb = tile_bounds(in.uv);
    let ht = max(uni.dir.x, uni.dir.y) * 0.5;
    let lo = tb.xy + ht;
    let hi = tb.zw - ht;
    let s = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(s * 2.5), 1.0, 48.0));
    var sum = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var i = -48; i <= 48; i++) {
        if (i < -R || i > R) { continue; }
        let w = exp(-f32(i * i) / (2.0 * s * s));
        sum += textureSample(tex0, samp, clamp(in.uv + uni.dir * f32(i), lo, hi)) * w;
        wsum += w;
    }
    return sum / wsum;
}

@fragment
fn fs_combine(in: QOut) -> @location(0) vec4<f32> {
    let a  = textureSample(tex0, samp, in.uv);
    let lo = textureSample(tex1, samp, in.uv);
    return clamp(lo + (a - lo) * uni.detail, vec4<f32>(0.0), vec4<f32>(1.0));
}

// Single-pass edge-preserving bilateral (style 'bilateral'). uni.dir carries
// the 2D texel size here; range sigma 0.15 (edge stop), spatial radius \\u2264 12.
@fragment
fn fs_bilateral(in: QOut) -> @location(0) vec4<f32> {
    let btb = tile_bounds(in.uv);
    let bht = max(uni.dir.x, uni.dir.y) * 0.5;
    let blo = btb.xy + bht;
    let bhi = btb.zw - bht;
    let ss = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(ss), 1.0, 12.0));
    let sr = 0.15;
    let c = textureSample(tex0, samp, in.uv).rgb;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var y = -12; y <= 12; y++) {
        if (y < -R || y > R) { continue; }
        for (var x = -12; x <= 12; x++) {
            if (x < -R || x > R) { continue; }
            let sc = textureSample(tex0, samp, clamp(in.uv + uni.dir * vec2<f32>(f32(x), f32(y)), blo, bhi)).rgb;
            let ws = exp(-f32(x * x + y * y) / (2.0 * ss * ss));
            let d = sc - c;
            let wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    return vec4<f32>(sum / wsum, 1.0);
}

// \\u2500\\u2500 composite: passthrough + mesh over the face \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500

@vertex
fn vs_pass(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(0.0);
    return out;
}

@fragment
fn fs_pass(in: QOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * uni.frame_w + u32(in.pos.x);
    return vec4<f32>(vec3<f32>(frame_buf[i].rgb), 1.0);
}

struct CompOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,      // TILED atlas uv \\u2014 the atlas is per-face
    @location(1) src: vec2<f32>,     // frame-fraction position
    @location(2) uv_mask: vec2<f32>, // UNTILED canonical uv \\u2014 the weight mask is
                                     // one static 512\\xB2 asset shared by every face
};

@vertex
fn vs_comp(@builtin(instance_index) inst: u32,
           @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> CompOut {
    var out: CompOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.uv = tile_uv(a_uv, inst);
    out.uv_mask = a_uv;
    out.src = l.xy;
    out.pos = vec4<f32>(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_comp(in: CompOut) -> @location(0) vec4<f32> {
    let orig = frame_bilinear(in.src);
    let sm   = textureSample(tex0, samp, in.uv).rgb;                   // smoothed atlas \\u2014 TILED
    // The weight mask is NOT tiled: it's one canonical 512\\xB2 asset, so it must be
    // sampled with the untiled uv. Using the tiled uv here made every face read
    // only its quadrant OF THE MASK, stretched over the whole face \\u2014 invisible at
    // slots=1 (tile_uv is identity) and badly wrong at slots=4.
    let w    = textureSample(tex1, samp, in.uv_mask).r * uni.strength; // weight mask \\u2014 UNTILED
    return vec4<f32>(mix(orig, sm, w), 1.0);
}

// \\u2500\\u2500 stage mode: unpack the composited float texture into the output tensor \\u2500\\u2500
// (WebGPU tensors are storage buffers; the mesh passes need a raster target.
// copyTextureToBuffer has a 256-byte bytesPerRow constraint that arbitrary
// widths violate, so a tiny compute blit does the copy instead.)

@group(0) @binding(7) var<storage, read_write> unpack_out : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn cs_unpack(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= uni.frame_w || gid.y >= uni.frame_h) { return; }
    let v = textureLoad(tex0, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
    unpack_out[gid.y * uni.frame_w + gid.x] = vec4<f16>(v);
}
\`;var he=512,lt=class{constructor(e,r,t,a,o,s){i(this,"backend",e);i(this,"device");i(this,"passes");i(this,"uvBuf");i(this,"idxBuf");i(this,"slots");i(this,"activeSlots");i(this,"outputView",null);let n=s.slots??1;if(n!==1&&n!==4)throw new Error(\`FaceTouchup: slots must be 1 or 4, got \${n}\`);let p=n===4?2:1;if(a.w*a.h<n)throw new Error(\`FaceTouchup: slots \${n} exceeds the \${a.h}\\xD7\${a.w} box tensor\`);if(t.c<n*956)throw new Error(\`FaceTouchup: landmarks tensor holds \${t.c/956} faces < slots \${n}\`);this.slots=n,this.activeSlots=n;let c=e.device;this.device=c,this.uvBuf=c.createBuffer({size:o.uv.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),c.queue.writeBuffer(this.uvBuf,0,o.uv.buffer,o.uv.byteOffset,o.uv.byteLength),this.idxBuf=c.createBuffer({size:o.idx.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),c.queue.writeBuffer(this.idxBuf,0,o.idx.buffer,o.idx.byteOffset,o.idx.byteLength);let l=()=>c.createTexture({size:[he,he],format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),d=l(),f=l(),x=l(),_=l(),b=c.createTexture({size:[o.weightMask.width,o.weightMask.height],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});c.queue.copyExternalImageToTexture({source:o.weightMask},{texture:b},[o.weightMask.width,o.weightMask.height]);let v=c.createSampler({magFilter:"linear",minFilter:"linear"}),y=L=>{let M=c.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),K=new ArrayBuffer(48),W=new Uint32Array(K,0,2);W[0]=r.w,W[1]=r.h;let A=new Float32Array(K,8,8);return A[0]=L.sigma??0,A[1]=s.detail,A[2]=s.strength,A[3]=s.thresh,A[4]=L.dirX??0,A[5]=L.dirY??0,A[6]=r.w,A[7]=r.h,new Uint32Array(K,40,2).set([n,p]),c.queue.writeBuffer(M,0,K),M},k=y({}),P=y({sigma:s.amount,dirX:1/he}),S=y({sigma:s.amount,dirY:1/he}),C=y({sigma:s.amount,dirX:1/he,dirY:1/he}),E=c.createShaderModule({code:e.dtype==="f16"?Fr:Er}),F=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,attributes:[{shaderLocation:1,offset:0,format:"float32"}]}],O=(L,M,K,W)=>c.createRenderPipeline({layout:"auto",vertex:{module:E,entryPoint:L,buffers:W?F:[]},fragment:{module:E,entryPoint:M,targets:[{format:K}]},primitive:{topology:"triangle-list"}}),I=(L,M,K)=>c.createBindGroup({layout:L.getBindGroupLayout(0),entries:[...K,{binding:3,resource:{buffer:M}}]}),N=(L,M)=>({binding:L,resource:{buffer:M}}),D=(L,M)=>({binding:L,resource:M.createView()}),V=r.buffer,$=t.buffer,q=a.buffer,ce=O("vs_unwrap","fs_unwrap","rgba8unorm",!0),ve=O("vs_pass","fs_pass",e.canvasFormat,!1),xe=O("vs_comp","fs_comp",e.canvasFormat,!0),Ce=(s.style??"freq-sep")==="bilateral"?(()=>{let L=O("vs_quad_fb","fs_bilateral","rgba8unorm",!1);return[{pipeline:L,target:_.createView(),verts:3,mesh:!1,load:!1,bind:I(L,C,[{binding:4,resource:v},D(5,d)])}]})():(()=>{let L=O("vs_quad_fb","fs_blur","rgba8unorm",!1),M=O("vs_quad_fb","fs_combine","rgba8unorm",!1);return[{pipeline:L,target:f.createView(),verts:3,mesh:!1,load:!1,bind:I(L,P,[{binding:4,resource:v},D(5,d)])},{pipeline:L,target:x.createView(),verts:3,mesh:!1,load:!1,bind:I(L,S,[{binding:4,resource:v},D(5,f)])},{pipeline:M,target:_.createView(),verts:3,mesh:!1,load:!1,bind:I(M,k,[{binding:4,resource:v},D(5,d),D(6,x)])}]})();this.passes=[{pipeline:ce,target:d.createView(),verts:o.count,mesh:!0,load:!1,bind:I(ce,k,[N(0,V),N(1,$),N(2,q)])},...Ce,{pipeline:ve,target:null,verts:3,mesh:!1,load:!1,bind:I(ve,k,[N(0,V)])},{pipeline:xe,target:null,verts:o.count,mesh:!0,load:!0,bind:I(xe,k,[N(0,V),N(1,$),N(2,q),{binding:4,resource:v},D(5,_),D(6,b)])}]}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("FaceTouchupWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.device.createCommandEncoder();for(let t of this.passes){let a=r.beginRenderPass({colorAttachments:[{view:t.target??this.outputView,clearValue:[0,0,0,1],loadOp:t.load?"load":"clear",storeOp:"store"}]});a.setPipeline(t.pipeline),a.setBindGroup(0,t.bind),t.mesh&&(a.setVertexBuffer(0,this.uvBuf),a.setVertexBuffer(1,this.idxBuf)),a.draw(t.verts,t.mesh?this.activeSlots:1),a.end()}e||this.device.queue.submit([r.finish()]),this.outputView=null}},dt=class{constructor(e,r,t,a,o,s){i(this,"backend",e);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"device");i(this,"passes");i(this,"unpackPipeline");i(this,"unpackBind");i(this,"unpackDispatch");i(this,"uvBuf");i(this,"idxBuf");i(this,"meshCount");i(this,"slots");i(this,"activeSlots");let p=s.slots??1;if(p!==1&&p!==4)throw new Error(\`FaceTouchup: slots must be 1 or 4, got \${p}\`);let c=p===4?2:1;if(a.w*a.h<p)throw new Error(\`FaceTouchup: slots \${p} exceeds the \${a.h}\\xD7\${a.w} box tensor\`);if(t.c<p*956)throw new Error(\`FaceTouchup: landmarks tensor holds \${t.c/956} faces < slots \${p}\`);this.slots=p,this.activeSlots=p;let l=e.device;this.device=l,this.inputs=[r,t,a],this.output=e.tensor(r.h,r.w,4),this.meshCount=o.count,this.uvBuf=l.createBuffer({size:o.uv.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),l.queue.writeBuffer(this.uvBuf,0,o.uv.buffer,o.uv.byteOffset,o.uv.byteLength),this.idxBuf=l.createBuffer({size:o.idx.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),l.queue.writeBuffer(this.idxBuf,0,o.idx.buffer,o.idx.byteOffset,o.idx.byteLength);let d=()=>l.createTexture({size:[512,512],format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),f=d(),x=d(),_=d(),b=d(),v=e.dtype==="f16"?"rgba16float":"rgba32float",y=l.createTexture({size:[r.w,r.h],format:v,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),k=l.createTexture({size:[o.weightMask.width,o.weightMask.height],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});l.queue.copyExternalImageToTexture({source:o.weightMask},{texture:k},[o.weightMask.width,o.weightMask.height]);let P=l.createSampler({magFilter:"linear",minFilter:"linear"}),S=W=>{let A=l.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),Q=new ArrayBuffer(48),We=new Uint32Array(Q,0,2);We[0]=r.w,We[1]=r.h;let J=new Float32Array(Q,8,8);return J[0]=W.sigma??0,J[1]=s.detail,J[2]=s.strength,J[3]=s.thresh,J[4]=W.dirX??0,J[5]=W.dirY??0,J[6]=r.w,J[7]=r.h,new Uint32Array(Q,40,2).set([p,c]),l.queue.writeBuffer(A,0,Q),A},C=S({}),E=S({sigma:s.amount,dirX:1/512}),F=S({sigma:s.amount,dirY:1/512}),O=S({sigma:s.amount,dirX:1/512,dirY:1/512}),I=l.createShaderModule({code:e.dtype==="f16"?Fr:Er}),N=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,attributes:[{shaderLocation:1,offset:0,format:"float32"}]}],D=(W,A,Q,We)=>l.createRenderPipeline({layout:"auto",vertex:{module:I,entryPoint:W,buffers:We?N:[]},fragment:{module:I,entryPoint:A,targets:[{format:Q}]},primitive:{topology:"triangle-list"}}),V=(W,A,Q)=>l.createBindGroup({layout:W.getBindGroupLayout(0),entries:[...Q,{binding:3,resource:{buffer:A}}]}),$=(W,A)=>({binding:W,resource:{buffer:A}}),q=(W,A)=>({binding:W,resource:A.createView()}),ce=r.buffer,ve=t.buffer,xe=a.buffer,Ce=D("vs_unwrap","fs_unwrap","rgba8unorm",!0),L=D("vs_pass","fs_pass",v,!1),M=D("vs_comp","fs_comp",v,!0),K=(s.style??"freq-sep")==="bilateral"?(()=>{let W=D("vs_quad_fb","fs_bilateral","rgba8unorm",!1);return[{pipeline:W,target:b.createView(),verts:3,mesh:!1,load:!1,bind:V(W,O,[{binding:4,resource:P},q(5,f)])}]})():(()=>{let W=D("vs_quad_fb","fs_blur","rgba8unorm",!1),A=D("vs_quad_fb","fs_combine","rgba8unorm",!1);return[{pipeline:W,target:x.createView(),verts:3,mesh:!1,load:!1,bind:V(W,E,[{binding:4,resource:P},q(5,f)])},{pipeline:W,target:_.createView(),verts:3,mesh:!1,load:!1,bind:V(W,F,[{binding:4,resource:P},q(5,x)])},{pipeline:A,target:b.createView(),verts:3,mesh:!1,load:!1,bind:V(A,C,[{binding:4,resource:P},q(5,f),q(6,_)])}]})();this.passes=[{pipeline:Ce,target:f.createView(),verts:o.count,mesh:!0,load:!1,bind:V(Ce,C,[$(0,ce),$(1,ve),$(2,xe)])},...K,{pipeline:L,target:y.createView(),verts:3,mesh:!1,load:!1,bind:V(L,C,[$(0,ce)])},{pipeline:M,target:y.createView(),verts:o.count,mesh:!0,load:!0,bind:V(M,C,[$(0,ce),$(1,ve),$(2,xe),{binding:4,resource:P},q(5,b),q(6,k)])}],this.unpackPipeline=l.createComputePipeline({layout:"auto",compute:{module:I,entryPoint:"cs_unpack"}}),this.unpackBind=V(this.unpackPipeline,C,[q(5,y),$(7,this.output.buffer)]),this.unpackDispatch=[Math.ceil(r.w/8),Math.ceil(r.h/8)]}setActiveSlots(e){this.activeSlots=Math.max(0,Math.min(e,this.slots))}run(){let e=this.backend.batchEncoder(),r=e??this.device.createCommandEncoder();for(let a of this.passes){let o=r.beginRenderPass({colorAttachments:[{view:a.target,clearValue:[0,0,0,1],loadOp:a.load?"load":"clear",storeOp:"store"}]});o.setPipeline(a.pipeline),o.setBindGroup(0,a.bind),a.mesh&&(o.setVertexBuffer(0,this.uvBuf),o.setVertexBuffer(1,this.idxBuf)),o.draw(a.verts,a.mesh?this.activeSlots:1),o.end()}let t=r.beginComputePass();t.setPipeline(this.unpackPipeline),t.setBindGroup(0,this.unpackBind),t.dispatchWorkgroups(this.unpackDispatch[0],this.unpackDispatch[1],1),t.end(),e||this.device.queue.submit([r.finish()])}};var zo=\`// Flow-gated temporal stabilizer (f32). See stabilize_f16.wgsl for the math.

struct Params {
    h        : u32,
    w        : u32,
    t_lo     : f32,
    t_hi     : f32,
    leak     : f32,
    release  : f32,
    t_div    : f32,
    div_scale: f32,
    step_x   : u32,
    step_y   : u32,
}

@group(0) @binding(0) var<storage, read>       flow_buf     : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       pred_buf     : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       ref_buf      : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       env_prev_buf : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params       : Params;
@group(0) @binding(5) var<storage, read_write> output_buf   : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }
    let idx = y * params.w + x;

    let mag      = length(flow_buf[idx].xy);
    let env_prev = env_prev_buf[idx].y;
    let env      = max(mag, params.release * env_prev);

    let xr = min(x + params.step_x, params.w - 1u);
    let xl = select(x - params.step_x, 0u, x < params.step_x);
    let yd = min(y + params.step_y, params.h - 1u);
    let yu = select(y - params.step_y, 0u, y < params.step_y);
    let dfx = flow_buf[y * params.w + xr].x - flow_buf[y * params.w + xl].x;
    let dfy = flow_buf[yd * params.w + x].y - flow_buf[yu * params.w + x].y;
    let divg = abs(dfx + dfy);

    let g_mag = clamp((env - params.t_lo) / max(params.t_hi - params.t_lo, 1e-3), 0.0, 1.0);
    let g_div = clamp((divg - params.t_div) / max(params.div_scale, 1e-3), 0.0, 1.0);
    let g = max(max(g_mag, g_div), params.leak);

    let pred = pred_buf[idx].x;
    let refv = ref_buf[idx].x;
    let stab = g * pred + (1.0 - g) * refv;

    output_buf[idx] = vec4<f32>(stab, env, 0.0, 0.0);
}
\`;var Ho=\`enable f16;

// Flow-gated temporal stabilizer (f16 storage, f32 gate math). Per pixel:
//   env = max(|flow.xy|, release\\xB7envPrev.y)      peak-hold (fast attack, slow release)
//   div = |\\u2202fx/\\u2202x + \\u2202fy/\\u2202y|                       flow divergence (occlusion seam)
//   g   = max(clamp((env-tLo)/(tHi-tLo),0,1), clamp((div-tDiv)/divScale,0,1), leak)
//   out = vec4((g\\xB7pred + (1-g)\\xB7ref).x, env, 0, 0)
// The divergence term opens the gate at occlusion/disocclusion boundaries (where
// the flow tears but the revealed-background magnitude is ~0). Finite-difference
// step spans ~1 base/4 pixel. alpha is in .x of pred/ref; env threads via .y.

struct Params {
    h        : u32,
    w        : u32,
    t_lo     : f32,
    t_hi     : f32,
    leak     : f32,
    release  : f32,
    t_div    : f32,
    div_scale: f32,
    step_x   : u32,
    step_y   : u32,
}

@group(0) @binding(0) var<storage, read>       flow_buf     : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       pred_buf     : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       ref_buf      : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       env_prev_buf : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params       : Params;
@group(0) @binding(5) var<storage, read_write> output_buf   : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }
    let idx = y * params.w + x;

    let mag      = length(vec2<f32>(flow_buf[idx].xy));
    let env_prev = f32(env_prev_buf[idx].y);
    let env      = max(mag, params.release * env_prev);

    // Flow divergence over a \\xB1step finite-difference (clamped to the edges).
    let xr = min(x + params.step_x, params.w - 1u);
    let xl = select(x - params.step_x, 0u, x < params.step_x);
    let yd = min(y + params.step_y, params.h - 1u);
    let yu = select(y - params.step_y, 0u, y < params.step_y);
    let dfx = f32(flow_buf[y * params.w + xr].x) - f32(flow_buf[y * params.w + xl].x);
    let dfy = f32(flow_buf[yd * params.w + x].y) - f32(flow_buf[yu * params.w + x].y);
    let divg = abs(dfx + dfy);

    let g_mag = clamp((env - params.t_lo) / max(params.t_hi - params.t_lo, 1e-3), 0.0, 1.0);
    let g_div = clamp((divg - params.t_div) / max(params.div_scale, 1e-3), 0.0, 1.0);
    let g = max(max(g_mag, g_div), params.leak);

    let pred = f32(pred_buf[idx].x);
    let refv = f32(ref_buf[idx].x);
    let stab = g * pred + (1.0 - g) * refv;

    output_buf[idx] = vec4<f16>(f16(stab), f16(env), 0.0h, 0.0h);
}
\`;var ft=class extends g{constructor(r,t,a,o,s,n){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Ho:zo,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a,o,s],this.createUniform("params","Params");let p=new Uint32Array(10);p[0]=t.h,p[1]=t.w;let c=new Float32Array(p.buffer);c[2]=n.tLo,c[3]=n.tHi,c[4]=n.leak,c[5]=n.release,c[6]=n.tDiv,c[7]=n.divScale,p[8]=n.stepX,p[9]=n.stepY,this.setUniform("params",p),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var No=\`// Bilinear upsample (arbitrary ratio), align_corners=False (matches PyTorch default).
// Input/output in NHWC vec4 format: index = y*W*(C/4) + x*(C/4) + c_group.
// Each thread computes one output pixel for one channel group (vec4 = 4 channels).

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    // align_corners=False: src = (out + 0.5) * (in / out) - 0.5
    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    // Clamp to [0, in-1] for border replication. Use i32 intermediates so that
    // floor() returning -1.0 doesn't produce an invalid u32 conversion.
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = input_buf[y0 * IW * C + x0 * C + c];
    let tr = input_buf[y0 * IW * C + x1 * C + c];
    let bl = input_buf[y1 * IW * C + x0 * C + c];
    let br = input_buf[y1 * IW * C + x1 * C + c];

    // Bilinear blend \\u2014 vec4 ops are element-wise, so all 4 channels blend identically.
    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = result;
}
\`;var Vo=\`enable f16;

// Bilinear upsample 2\\xD7 \\u2014 full f16 variant.
// Interpolation weights (wx, wy) and intermediate blends computed in f32 for
// accuracy; result cast to f16 on write.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec4<f32>(input_buf[y0 * IW * C + x0 * C + c]);
    let tr = vec4<f32>(input_buf[y0 * IW * C + x1 * C + c]);
    let bl = vec4<f32>(input_buf[y1 * IW * C + x0 * C + c]);
    let br = vec4<f32>(input_buf[y1 * IW * C + x1 * C + c]);

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(result);
}
\`;var mt=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Vo:No;let o=t.c/4;this.output=r.tensor(a.outH,a.outW,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,a.outH,a.outW,o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a.outW/8),Math.ceil(a.outH/8),o]}};var Xo=\`// Top-left crop (f32). See crop_f16.wgsl.

struct Params {
    in_w   : u32,
    out_h  : u32,
    out_w  : u32,
    groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.out_w || y >= params.out_h || g >= params.groups) { return; }
    let G = params.groups;
    output_buf[y * params.out_w * G + x * G + g] = input_buf[y * params.in_w * G + x * G + g];
}
\`;var jo=\`enable f16;

// Top-left crop: output[y,x,g] = input[y,x,g] for y<outH, x<outW (training crop_like).

struct Params {
    in_w   : u32,
    out_h  : u32,
    out_w  : u32,
    groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.out_w || y >= params.out_h || g >= params.groups) { return; }
    let G = params.groups;
    output_buf[y * params.out_w * G + x * G + g] = input_buf[y * params.in_w * G + x * G + g];
}
\`;var ht=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?jo:Xo;let o=t.c/4;this.output=r.tensor(a.outH,a.outW,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.w,a.outH,a.outW,o])),this.defaultSetup(),this.dispatch=[Math.ceil(a.outW/8),Math.ceil(a.outH/8),o]}};var $o=\`// Bicubic upsample (arbitrary scale) \\u2014 Keys cubic, a=-0.75 (PyTorch default
// for mode='bicubic', align_corners=False). Direct 2D, 4\\xD74 = 16 taps per
// output pixel. NHWC vec4 layout: index = y*W*(C/4) + x*(C/4) + c_group.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

const A: f32 = -0.75;

fn wcubic(d: f32) -> f32 {
    let ad = abs(d);
    if (ad <= 1.0) { return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0; }
    if (ad <  2.0) { return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A; }
    return 0.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = i32(floor(src_x));
    let y0 = i32(floor(src_y));
    let fx = src_x - f32(x0);
    let fy = src_y - f32(y0);

    var wx: array<f32, 4>;
    var wy: array<f32, 4>;
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx); wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy); wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    var acc: vec4<f32> = vec4<f32>(0.0);
    for (var j: i32 = 0; j < 4; j = j + 1) {
        let sy = u32(clamp(y0 + j - 1, 0, i32(IH) - 1));
        for (var i: i32 = 0; i < 4; i = i + 1) {
            let sx = u32(clamp(x0 + i - 1, 0, i32(IW) - 1));
            let v  = input_buf[sy * IW * C + sx * C + c];
            acc = acc + (wx[i] * wy[j]) * v;
        }
    }

    output_buf[oy * params.out_w * C + ox * C + c] = acc;
}
\`;var qo=\`enable f16;

// Bicubic upsample \\u2014 full f16 storage variant. Bicubic weights and the per-
// pixel accumulator are computed in f32 (cheap to keep precision around the
// kernel arithmetic), then demoted to f16 when written to the output buffer.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

const A: f32 = -0.75;

fn wcubic(d: f32) -> f32 {
    let ad = abs(d);
    if (ad <= 1.0) { return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0; }
    if (ad <  2.0) { return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A; }
    return 0.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = i32(floor(src_x));
    let y0 = i32(floor(src_y));
    let fx = src_x - f32(x0);
    let fy = src_y - f32(y0);

    var wx: array<f32, 4>;
    var wy: array<f32, 4>;
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx); wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy); wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    var acc: vec4<f32> = vec4<f32>(0.0);
    for (var j: i32 = 0; j < 4; j = j + 1) {
        let sy = u32(clamp(y0 + j - 1, 0, i32(IH) - 1));
        for (var i: i32 = 0; i < 4; i = i + 1) {
            let sx = u32(clamp(x0 + i - 1, 0, i32(IW) - 1));
            let v  = vec4<f32>(input_buf[sy * IW * C + sx * C + c]);
            acc = acc + (wx[i] * wy[j]) * v;
        }
    }

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(acc);
}
\`;var gt=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?qo:$o;let o=t.c/4;this.output=r.tensor(a.outH,a.outW,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,a.outH,a.outW,o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a.outW/8),Math.ceil(a.outH/8),o]}};var Ko=\`// Channel concatenation: output = cat(A, B, dim=channel).
// Both A and B must share the same H\\xD7W and be in NHWC vec4 format.
// Output layout: for each (y, x), the first a_groups vec4s come from A,
// followed by b_groups vec4s from B.

struct Params {
    height    : u32,
    width     : u32,
    a_groups  : u32,  // Ca / 4
    b_groups  : u32,  // Cb / 4
    out_groups: u32,  // a_groups + b_groups
    _pad0     : u32,
    _pad1     : u32,
    _pad2     : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;  // output channel group

    let W   = params.width;
    let Ag  = params.a_groups;
    let Bg  = params.b_groups;
    let Cg  = params.out_groups;

    if (x >= W || y >= params.height || c >= Cg) {
        return;
    }

    let out_idx = y * W * Cg + x * Cg + c;

    if (c < Ag) {
        output_buf[out_idx] = input_a[y * W * Ag + x * Ag + c];
    } else {
        let c_b = c - Ag;
        output_buf[out_idx] = input_b[y * W * Bg + x * Bg + c_b];
    }
}
\`;var Yo=\`enable f16;

// Channel concatenation \\u2014 full f16 variant.

struct Params {
    height    : u32,
    width     : u32,
    a_groups  : u32,
    b_groups  : u32,
    out_groups: u32,
    _pad0     : u32,
    _pad1     : u32,
    _pad2     : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;

    let W  = params.width;
    let Ag = params.a_groups;
    let Bg = params.b_groups;
    let Cg = params.out_groups;

    if (x >= W || y >= params.height || c >= Cg) { return; }

    let out_idx = y * W * Cg + x * Cg + c;
    if (c < Ag) {
        output_buf[out_idx] = input_a[y * W * Ag + x * Ag + c];
    } else {
        let c_b = c - Ag;
        output_buf[out_idx] = input_b[y * W * Bg + x * Bg + c_b];
    }
}
\`;var _t=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Yo:Ko;let o=t.c/4,s=a.c/4,n=o+s;this.output=r.tensor(t.h,t.w,t.c+a.c),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,o,s,n,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),n]}};var Qo=\`// Conv2d + skip add fused.
// Identical to conv2d.wgsl except skip is an activation input (binding 1),
// added element-wise to the conv result at write time.
// Eliminates the separate add dispatch and its intermediate buffer round-trip.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.out_w || y >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            for (var i = 0u; i < I; i++) {
                let in_idx = in_y * params.in_w * I + in_x * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    } else if (params.activation == 2u) {
        result = max(result, vec4<f32>(0.0));
    }

    let out_idx = y * params.out_w * O + x * O + o;
    output_buf[out_idx] = result + skip_buf[out_idx];
}
\`;var Jo=\`enable f16;

// Conv2d + skip add fused \\u2014 full f16 variant.

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

// Binding order matches conv2d_add.wgsl: input(0), skip(1), weight(2), bias(3),
// params(4), output(5).
@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.out_w || y >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            for (var i = 0u; i < I; i++) {
                let in_idx = in_y * params.in_w * I + in_x * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    } else if (params.activation == 2u) {
        result = max(result, vec4<f16>(0.0h));
    }

    let out_idx = y * params.out_w * O + x * O + o;
    output_buf[out_idx] = result + skip_buf[out_idx];
}
\`;var bt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Jo:Qo;let n=G(t.h,s.kernel,s.stride,s.padding),p=G(t.w,s.kernel,s.stride,s.padding),c=t.c/4,l=s.outChannels/4,d=U(s.padding,t.h,n,s.kernel,s.stride),f=U(s.padding,t.w,p,s.kernel,s.stride);this.output=r.tensor(n,p,s.outChannels),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(m(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,n,p,c,l,s.kernel,s.kernel,s.stride,d,f,s.activation==="relu6"?1:0])),this.defaultSetup(),this.dispatch=[Math.ceil(p/8),Math.ceil(n/8),l]}};var Zo=\`// proj_residual: bespoke 1\\xD71 conv (no activation) + residual add, fused.
// Specializes conv2d_add to kernel=1 / stride=1 / pad=0 / no activation: drops
// the kernel loop, the padding checks, and the activation branch. Used by the
// MBConv project+residual tail. Both inputs share the same spatial resolution.
//
// Weight layout: [out_groups][in_groups] mat4x4 (no K*K dim since K=1).
// Bias: [out_groups] vec4.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    in_groups  : u32,
    out_groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.w || y >= params.h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let pix = y * params.w + x;

    var result = bias_buf[o];
    for (var i = 0u; i < I; i++) {
        result += weight_buf[o * I + i] * input_buf[pix * I + i];
    }
    result += skip_buf[pix * O + o];

    output_buf[pix * O + o] = result;
}
\`;var ea=\`enable f16;

// proj_residual \\u2014 full f16 variant. See proj_residual.wgsl for layout details.
// Bespoke 1\\xD71 conv (no activation) + residual add, fused.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    in_groups  : u32,
    out_groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.w || y >= params.h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let pix = y * params.w + x;

    var result = bias_buf[o];
    for (var i = 0u; i < I; i++) {
        result += weight_buf[o * I + i] * input_buf[pix * I + i];
    }
    result += skip_buf[pix * O + o];

    output_buf[pix * O + o] = result;
}
\`;var vt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ea:Zo;let n=t.c/4,p=s.outChannels/4;this.output=r.tensor(t.h,t.w,s.outChannels),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(m(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,n,p])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),p]}};var ta=\`// concat_conv2d: fuses [concat(a, b) \\u2192 conv 3\\xD73 (pad 1) \\u2192 relu6] into one
// dispatch. Both inputs are already at the output resolution (the upstream
// upsample stays a separate dispatch writing a clean intermediate, so the conv
// reads are plain-indexed). Identical math to conv2d; the only difference is
// that input channels are split across two buffers: weight cols [0, a_groups)
// read a, [a_groups, I) read b.
//
// Weight layout matches conv2d: [kpos][out_groups][in_groups] mat4x4, where
// in_groups = a_groups + b_groups and the input channel order is [a, b].
// Binding order: a(0), b(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,   // a, b and output all share this shape
    w          : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
    _pad1      : u32,
    _pad2      : u32,
}

@group(0) @binding(0) var<storage, read>       buf_a      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       buf_b      : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             p          : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y; let o = gid.z;
    if (x >= p.w || y >= p.h || o >= p.out_groups) { return; }

    let A = p.a_groups;
    let B = p.b_groups;
    let I = A + B;
    let O = p.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let nx = i32(x + kx) - 1;
            let ny = i32(y + ky) - 1;
            if (nx < 0 || ny < 0 || u32(nx) >= p.w || u32(ny) >= p.h) { continue; }
            let z   = ky * 3u + kx;
            let pix = u32(ny) * p.w + u32(nx);
            for (var i = 0u; i < A; i++) {
                result += weight_buf[z * O * I + o * I + i] * buf_a[pix * A + i];
            }
            for (var i = 0u; i < B; i++) {
                result += weight_buf[z * O * I + o * I + (A + i)] * buf_b[pix * B + i];
            }
        }
    }

    result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    output_buf[(y * p.w + x) * O + o] = result;
}
\`;var ra=\`enable f16;

// concat_conv2d \\u2014 full f16 variant. See concat_conv2d.wgsl for layout details.
// Fuses [concat(a, b) \\u2192 conv 3\\xD73 (pad 1) \\u2192 relu6] into one dispatch.
// Binding order: a(0), b(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
    _pad1      : u32,
    _pad2      : u32,
}

@group(0) @binding(0) var<storage, read>       buf_a      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       buf_b      : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             p          : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y; let o = gid.z;
    if (x >= p.w || y >= p.h || o >= p.out_groups) { return; }

    let A = p.a_groups;
    let B = p.b_groups;
    let I = A + B;
    let O = p.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let nx = i32(x + kx) - 1;
            let ny = i32(y + ky) - 1;
            if (nx < 0 || ny < 0 || u32(nx) >= p.w || u32(ny) >= p.h) { continue; }
            let z   = ky * 3u + kx;
            let pix = u32(ny) * p.w + u32(nx);
            for (var i = 0u; i < A; i++) {
                result += weight_buf[z * O * I + o * I + i] * buf_a[pix * A + i];
            }
            for (var i = 0u; i < B; i++) {
                result += weight_buf[z * O * I + o * I + (A + i)] * buf_b[pix * B + i];
            }
        }
    }

    result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    output_buf[(y * p.w + x) * O + o] = result;
}
\`;var xt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ra:ta;let n=t.c/4,p=a.c/4,c=s.outChannels/4;this.output=r.tensor(t.h,t.w,s.outChannels),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(m(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,n,p,c,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),c]}};var oa=\`// gates_fused: ConvGRU z + r gates, fused into one dispatch.
// Production config (c_up=2, split_ratio=0.5 \\u2192 passthrough=1, recurrent=1):
//   u_in   : c_up=2 packed in a vec4 (.x = passthrough a, .y = recurrent b)
//   h_prev : hidden carrier \\u2014 recurrent state in .z (see cand_update_fused: the
//            GRU output tensor doubles as next frame's h_prev, hidden in .z)
// Weight: 9 vec4 per kpos = (z_w_b, z_w_h, r_w_b, r_w_h). Bias .xy = (z, r).
// Output: vec4(z, r, 0, 0) \\u2014 consumed by cand_update_fused.
// Binding order: u_in(0), h_prev(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf   : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f32>>;   // 9 vec4
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy = (z, r)
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    let bias = bias_buf[0].xy;
    var z_pre = bias.x;
    var r_pre = bias.y;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let w    = weight_buf[kpos];
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    let z = 1.0 / (1.0 + exp(-z_pre));
    let r = 1.0 / (1.0 + exp(-r_pre));
    output_buf[y * params.w + x] = vec4<f32>(z, r, 0.0, 0.0);
}
\`;var aa=\`enable f16;

// gates_fused \\u2014 full f16 variant. See gates_fused.wgsl for layout details.
// ConvGRU z + r gates (production config c_up=2, recurrent=1).
// Binding order: u_in(0), h_prev(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf   : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    let bias = bias_buf[0].xy;
    var z_pre = bias.x;
    var r_pre = bias.y;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let w    = weight_buf[kpos];
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    let z = 1.0h / (1.0h + exp(-z_pre));
    let r = 1.0h / (1.0h + exp(-r_pre));
    output_buf[y * params.w + x] = vec4<f16>(z, r, 0.0h, 0.0h);
}
\`;var yt=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?aa:oa,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(w(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var ia=\`// cand_update_fused: ConvGRU candidate path + state update + output, fused.
// Production config (c_up=2, recurrent=1):
//   u_in      : c_up=2 (.x = a passthrough, .y = b recurrent)
//   h_prev    : hidden carrier \\u2014 recurrent state in .z (the previous frame's
//               output of THIS op; on frame 0 it is a zero tensor)
//   gates_out : (.x = z, .y = r) from gates_fused
// cand_pre = bias + \\u03A3_kpos (b_w*b_n + rh_w*(r_n*h_n));  h_til = tanh(cand_pre);
//   h_new = (1-z)*h_prev + z*h_til;  b_out = b + gamma*h_new.
// Output: vec4(a, b_out, h_new, 0) \\u2014 .xy is the c_up=2 feature consumed
// downstream; .z carries h_new so the same tensor is fed back as next h_prev
// (no separate hidden-state buffer). Cand weight: 9 vec4 per kpos, .xy = (b_w, rh_w).
// Binding order: u_in(0), h_prev(1), gates_out(2), weight(3), bias(4), gamma(5), params(6), output(7)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf    : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       gates_out_buf : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       weight_buf    : array<vec4<f32>>;   // 9 vec4
@group(0) @binding(4) var<storage, read>       bias_buf      : array<vec4<f32>>;   // .x = cand_bias
@group(0) @binding(5) var<storage, read>       gamma_buf     : array<vec4<f32>>;   // .x = gamma
@group(0) @binding(6) var<uniform>             params        : Params;
@group(0) @binding(7) var<storage, read_write> output_buf    : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var cand_pre = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let r_n  = gates_out_buf[idx].y;
            let w    = weight_buf[kpos].xy;
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    let h_til      = tanh(cand_pre);
    let cur        = y * params.w + x;
    let u_cur      = u_in_buf[cur];
    let z_cur      = gates_out_buf[cur].x;
    let h_prev_cur = h_prev_buf[cur].z;
    let h_new      = (1.0 - z_cur) * h_prev_cur + z_cur * h_til;
    let b_out      = u_cur.y + gamma_buf[0].x * h_new;
    output_buf[cur] = vec4<f32>(u_cur.x, b_out, h_new, 0.0);
}
\`;var sa=\`enable f16;

// cand_update_fused \\u2014 full f16 variant. See cand_update_fused.wgsl for details.
// ConvGRU candidate + state update + output (production config c_up=2, recurrent=1).
// Binding order: u_in(0), h_prev(1), gates_out(2), weight(3), bias(4), gamma(5), params(6), output(7)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf    : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       gates_out_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       weight_buf    : array<vec4<f16>>;
@group(0) @binding(4) var<storage, read>       bias_buf      : array<vec4<f16>>;
@group(0) @binding(5) var<storage, read>       gamma_buf     : array<vec4<f16>>;
@group(0) @binding(6) var<uniform>             params        : Params;
@group(0) @binding(7) var<storage, read_write> output_buf    : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var cand_pre = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let r_n  = gates_out_buf[idx].y;
            let w    = weight_buf[kpos].xy;
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    let h_til      = tanh(cand_pre);
    let cur        = y * params.w + x;
    let u_cur      = u_in_buf[cur];
    let z_cur      = gates_out_buf[cur].x;
    let h_prev_cur = h_prev_buf[cur].z;
    let h_new      = (1.0h - z_cur) * h_prev_cur + z_cur * h_til;
    let b_out      = u_cur.y + gamma_buf[0].x * h_new;
    output_buf[cur] = vec4<f16>(u_cur.x, b_out, h_new, 0.0h);
}
\`;var wt=class extends g{constructor(r,t,a,o,s,n){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?sa:ia,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a,o],this.weights=[r.upload(m(s.weights)),r.upload(w(s.bias)),r.upload(w(n))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var na=\`// conv_expand: bespoke N\\u21922 conv 3\\xD73 (pad 1) + relu (wrapper expand_feat).
// Expands feat_lr (in_c, mult of 4) to the c_up=2 carrier \\u2014 output .xy = the 2
// native channels, .zw = 0. mat4x2 per (kpos, in_group) with a vec2 accumulator.
// Weight: 9 * in_groups mat4x2 (8 floats each, col-major). Bias .xy.
// Binding order: input(0), weights(1), bias(2), params(3), output(4)

struct Params { h: u32, w: u32, in_groups: u32, _pad: u32 }

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x2<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy used
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    let I = params.in_groups;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = (u32(iy) * params.w + u32(ix)) * I + i;
                result += weight_buf[kpos * I + i] * input_buf[in_idx];
            }
        }
    }

    result = max(result, vec2<f32>(0.0));   // expand_feat is F.relu
    output_buf[y * params.w + x] = vec4<f32>(result, 0.0, 0.0);
}
\`;var ua=\`enable f16;

// conv_expand \\u2014 full f16 variant. See conv_expand.wgsl for layout details.
// Bespoke N\\u21922 conv 3\\xD73 (pad 1) + relu (wrapper expand_feat).
// Binding order: input(0), weights(1), bias(2), params(3), output(4)

struct Params { h: u32, w: u32, in_groups: u32, _pad: u32 }

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x2<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    let I = params.in_groups;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = (u32(iy) * params.w + u32(ix)) * I + i;
                result += weight_buf[kpos * I + i] * input_buf[in_idx];
            }
        }
    }

    result = max(result, vec2<f16>(0.0h));
    output_buf[y * params.w + x] = vec4<f16>(result, 0.0h, 0.0h);
}
\`;var kt=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ua:na;let o=t.c/4;this.output=r.tensor(t.h,t.w,4),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(w(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,o,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var pa=\`// cat_conv_6to2: fused concat(u, d) + 6\\u21922 conv 3\\xD73 (pad 1) + relu (E up1_combine).
// u = c_up=2 carrier (.xy); d = c_high=4 (full vec4). Both same resolution.
// Channel order concat([u, d]) = (u.x, u.y, d.x, d.y, d.z, d.w), split into
//   v3a = (u.x, u.y, d.x)   v3b = d.yzw
// Weight: 9 * 2 mat3x2 (6 floats each, col-major). Bias .xy. Output c_up=2 carrier.
// Binding order: u(0), d(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_buf      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       d_buf      : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat3x2<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy used
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let pix = u32(iy) * params.w + u32(ix);
            let u = u_buf[pix];
            let d = d_buf[pix];
            let v3a = vec3<f32>(u.xy, d.x);
            let v3b = d.yzw;
            result += weight_buf[kpos * 2u + 0u] * v3a;
            result += weight_buf[kpos * 2u + 1u] * v3b;
        }
    }

    result = max(result, vec2<f32>(0.0));   // up1_combine is F.relu
    output_buf[y * params.w + x] = vec4<f32>(result, 0.0, 0.0);
}
\`;var ca=\`enable f16;

// cat_conv_6to2 \\u2014 full f16 variant. See cat_conv_6to2.wgsl for layout details.
// Fused concat(u, d) + 6\\u21922 conv 3\\xD73 (pad 1) + relu (E up1_combine).
// Binding order: u(0), d(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_buf      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       d_buf      : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat3x2<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let pix = u32(iy) * params.w + u32(ix);
            let u = u_buf[pix];
            let d = d_buf[pix];
            let v3a = vec3<f16>(u.xy, d.x);
            let v3b = d.yzw;
            result += weight_buf[kpos * 2u + 0u] * v3a;
            result += weight_buf[kpos * 2u + 1u] * v3b;
        }
    }

    result = max(result, vec2<f16>(0.0h));
    output_buf[y * params.w + x] = vec4<f16>(result, 0.0h, 0.0h);
}
\`;var Tt=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ca:pa,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(w(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var la=\`// down_adapter: fused stride-N 3\\xD73 conv (4\\u21924) + relu + 1\\xD71 adapter (4\\u21923, no
// act) into one dispatch. E variant: down2 (c_high=4 \\u2192 c_low=4, stride 2) +
// adapter. A/B variant: down1 (RGB .xyz \\u2192 4, stride 2/3) + adapter (the down
// weight's 4th input column is zeroed at export for RGB input). Symmetric pad.
//
// down_w: 9 mat4x4 (3\\xD73, 4\\u21924). adapt_w: 1 mat4x4 (1\\xD71, 4\\u21924 padded from 4\\u21923,
// last row 0). adapt_b: .xyz used. Output: vec4(adapter.xyz, 0).
// Binding order: input(0), down_w(1), down_b(2), adapt_w(3), adapt_b(4), params(5), output(6)

struct Params {
    in_h     : u32,
    in_w     : u32,
    out_h    : u32,
    out_w    : u32,
    stride   : u32,
    pad_top  : u32,
    pad_left : u32,
    _pad     : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       down_w     : array<mat4x4<f32>>;   // 9 mat4x4
@group(0) @binding(2) var<storage, read>       down_b     : array<vec4<f32>>;     // 1 vec4
@group(0) @binding(3) var<storage, read>       adapt_w    : array<mat4x4<f32>>;   // 1 mat4x4
@group(0) @binding(4) var<storage, read>       adapt_b    : array<vec4<f32>>;     // .xyz used
@group(0) @binding(5) var<uniform>             p          : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= p.out_w || y >= p.out_h) { return; }

    var down_out = down_b[0];
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y * p.stride + ky) - i32(p.pad_top);
            let ix = i32(x * p.stride + kx) - i32(p.pad_left);
            if (iy < 0 || ix < 0 || u32(iy) >= p.in_h || u32(ix) >= p.in_w) { continue; }
            let kpos = ky * 3u + kx;
            down_out += down_w[kpos] * input_buf[u32(iy) * p.in_w + u32(ix)];
        }
    }
    down_out = max(down_out, vec4<f32>(0.0));   // F.relu

    let adapt_out = adapt_w[0] * down_out + adapt_b[0];
    output_buf[y * p.out_w + x] = vec4<f32>(adapt_out.xyz, 0.0);
}
\`;var da=\`enable f16;

// down_adapter \\u2014 full f16 variant. See down_adapter.wgsl for layout details.
// Fused stride-N 3\\xD73 conv (4\\u21924) + relu + 1\\xD71 adapter (4\\u21923, no act).
// Binding order: input(0), down_w(1), down_b(2), adapt_w(3), adapt_b(4), params(5), output(6)

struct Params {
    in_h     : u32,
    in_w     : u32,
    out_h    : u32,
    out_w    : u32,
    stride   : u32,
    pad_top  : u32,
    pad_left : u32,
    _pad     : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       down_w     : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       down_b     : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       adapt_w    : array<mat4x4<f16>>;
@group(0) @binding(4) var<storage, read>       adapt_b    : array<vec4<f16>>;
@group(0) @binding(5) var<uniform>             p          : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= p.out_w || y >= p.out_h) { return; }

    var down_out = down_b[0];
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y * p.stride + ky) - i32(p.pad_top);
            let ix = i32(x * p.stride + kx) - i32(p.pad_left);
            if (iy < 0 || ix < 0 || u32(iy) >= p.in_h || u32(ix) >= p.in_w) { continue; }
            let kpos = ky * 3u + kx;
            down_out += down_w[kpos] * input_buf[u32(iy) * p.in_w + u32(ix)];
        }
    }
    down_out = max(down_out, vec4<f16>(0.0h));

    let adapt_out = adapt_w[0] * down_out + adapt_b[0];
    output_buf[y * p.out_w + x] = vec4<f16>(adapt_out.xyz, 0.0h);
}
\`;var Pt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?da:la;let n=G(t.h,3,s.stride,1),p=G(t.w,3,s.stride,1),c=U(1,t.h,n,3,s.stride),l=U(1,t.w,p,3,s.stride);this.output=r.tensor(n,p,4),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(w(a.bias)),r.upload(m(o.weights)),r.upload(w(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,n,p,s.stride,c,l,0])),this.defaultSetup(),this.dispatch=[Math.ceil(p/8),Math.ceil(n/8),1]}};var fa=\`// up_final: fused concat(u, rgb) \\u2192 conv 3\\xD73 5\\u21921 \\u2192 sigmoid (A/B alpha head).
// u = c_up=2 carrier (.xy); rgb = x_hr (.xyz). 5 inputs \\u2192 1 alpha (output .x).
// Weight: 18 vec4 \\u2014 [0..8] = (w0, w1, 0, 0) for u per kpos; [9..17] =
// (w2, w3, w4, 0) for rgb per kpos. Bias .x.
// Binding order: u(0), rgb(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f32>>;   // .xy
@group(0) @binding(1) var<storage, read>       rgb        : array<vec4<f32>>;   // .xyz
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f32>>;   // 18 vec4
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .x
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;   // .x = alpha

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos].xy,       u_gru[p].xy);
            acc += dot(weight_buf[9u + kpos].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f32>(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
\`;var ma=\`enable f16;

// up_final \\u2014 full f16 variant. See up_final.wgsl for layout details.
// Fused concat(u, rgb) \\u2192 conv 3\\xD73 5\\u21921 \\u2192 sigmoid (A/B alpha head).
// Binding order: u(0), rgb(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       rgb        : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos].xy,       u_gru[p].xy);
            acc += dot(weight_buf[9u + kpos].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f16>(1.0h / (1.0h + exp(-acc)), 0.0h, 0.0h, 0.0h);
}
\`;var Ct=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ma:fa,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a],this.weights=[r.upload(m(o.weights)),r.upload(w(o.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var ha=\`// up_final_skip: C/D alpha head. Fused concat(u, d_full, rgb) \\u2192 conv 3\\xD73 9\\u21921
// \\u2192 sigmoid. u = c_up=2 (.xy); d_full = c_high=4 full-res skip (full vec4);
// rgb = x_hr (.xyz). Channel order concat = 2 + 4 + 3 = 9. Output .x = alpha.
// Weight: 27 vec4 (3 per kpos): [kpos*3+0]=(w0,w1,0,0) u; [kpos*3+1]=(w2..w5)
// d_full; [kpos*3+2]=(w6,w7,w8,0) rgb. Bias .x.
// Binding order: u(0), d_full(1), rgb(2), weights(3), bias(4), params(5), output(6)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f32>>;   // .xy
@group(0) @binding(1) var<storage, read>       d_full     : array<vec4<f32>>;   // full vec4
@group(0) @binding(2) var<storage, read>       rgb        : array<vec4<f32>>;   // .xyz
@group(0) @binding(3) var<storage, read>       weight_buf : array<vec4<f32>>;   // 27 vec4
@group(0) @binding(4) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .x
@group(0) @binding(5) var<uniform>             params     : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos * 3u + 0u].xy,  u_gru[p].xy);
            acc += dot(weight_buf[kpos * 3u + 1u],     d_full[p]);
            acc += dot(weight_buf[kpos * 3u + 2u].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f32>(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
\`;var ga=\`enable f16;

// up_final_skip \\u2014 full f16 variant. See up_final_skip.wgsl for layout details.
// C/D alpha head: fused concat(u, d_full, rgb) \\u2192 conv 3\\xD73 9\\u21921 \\u2192 sigmoid.
// Binding order: u(0), d_full(1), rgb(2), weights(3), bias(4), params(5), output(6)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       d_full     : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       rgb        : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(4) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(5) var<uniform>             params     : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos * 3u + 0u].xy,  u_gru[p].xy);
            acc += dot(weight_buf[kpos * 3u + 1u],     d_full[p]);
            acc += dot(weight_buf[kpos * 3u + 2u].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f16>(1.0h / (1.0h + exp(-acc)), 0.0h, 0.0h, 0.0h);
}
\`;var Wt=class extends g{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ga:ha,this.output=r.tensor(t.h,t.w,4),this.inputs=[t,a,o],this.weights=[r.upload(m(s.weights)),r.upload(w(s.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.w/8),Math.ceil(t.h/8),1]}};var _a=\`// Bilinear upsample + channel concat fused.
// input_a is the decoder tensor at small spatial resolution (in_h \\xD7 in_w).
// input_b is the encoder skip feature already at output resolution (out_h \\xD7 out_w).
// For output channels 0..a_groups-1: bilinearly interpolate from input_a.
// For output channels a_groups..out_groups-1: copy directly from input_b.
// Eliminates the intermediate upsample buffer and the separate concat dispatch.

struct Params {
    in_h       : u32,   // input_a spatial height
    in_w       : u32,   // input_a spatial width
    out_h      : u32,
    out_w      : u32,
    a_groups   : u32,   // input_a channel groups (upsampled)
    b_groups   : u32,   // input_b channel groups (encoder feature)
    out_groups : u32,   // a_groups + b_groups
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.out_groups) { return; }

    let out_idx = oy * params.out_w * params.out_groups + ox * params.out_groups + c;

    if (c < params.a_groups) {
        let IH = params.in_h;
        let IW = params.in_w;
        let AG = params.a_groups;

        let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
        let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

        let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
        let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
        let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
        let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

        let wx = src_x - floor(src_x);
        let wy = src_y - floor(src_y);

        let tl = input_a[y0 * IW * AG + x0 * AG + c];
        let tr = input_a[y0 * IW * AG + x1 * AG + c];
        let bl = input_a[y1 * IW * AG + x0 * AG + c];
        let br = input_a[y1 * IW * AG + x1 * AG + c];

        output_buf[out_idx] = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                            +        wy  * ((1.0 - wx) * bl + wx * br);
    } else {
        let c_b = c - params.a_groups;
        output_buf[out_idx] = input_b[oy * params.out_w * params.b_groups + ox * params.b_groups + c_b];
    }
}
\`;var ba=\`enable f16;

// Bilinear upsample + channel concat fused \\u2014 full f16 variant.
// Bilinear weights (wx, wy) and intermediate blends computed in f32; result cast to f16.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.out_groups) { return; }

    let out_idx = oy * params.out_w * params.out_groups + ox * params.out_groups + c;

    if (c < params.a_groups) {
        let IH = params.in_h;
        let IW = params.in_w;
        let AG = params.a_groups;

        let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
        let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

        let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
        let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
        let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
        let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

        let wx = src_x - floor(src_x);
        let wy = src_y - floor(src_y);

        let tl = vec4<f32>(input_a[y0 * IW * AG + x0 * AG + c]);
        let tr = vec4<f32>(input_a[y0 * IW * AG + x1 * AG + c]);
        let bl = vec4<f32>(input_a[y1 * IW * AG + x0 * AG + c]);
        let br = vec4<f32>(input_a[y1 * IW * AG + x1 * AG + c]);

        let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                   +        wy  * ((1.0 - wx) * bl + wx * br);
        output_buf[out_idx] = vec4<f16>(result);
    } else {
        let c_b = c - params.a_groups;
        output_buf[out_idx] = input_b[oy * params.out_w * params.b_groups + ox * params.b_groups + c_b];
    }
}
\`;var Gt=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?ba:_a;let s=t.c/4,n=a.c/4,p=s+n;this.output=r.tensor(o.outH,o.outW,t.c+a.c),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,o.outH,o.outW,s,n,p,0])),this.defaultSetup(),this.dispatch=[Math.ceil(o.outW/8),Math.ceil(o.outH/8),p]}};var va=\`// Bilinear upsample + 1\\xD71 pointwise conv fused.
// For each output pixel, bilinearly samples the small input for each in_group,
// immediately applies the 1\\xD71 conv weights, and writes the activated result.
// Eliminates the intermediate full-resolution upsample buffer.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    activation : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let og = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || og >= params.out_groups) { return; }

    let IH = params.in_h;
    let IW = params.in_w;
    let IG = params.in_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    var result = bias_buf[og];

    for (var ig = 0u; ig < IG; ig++) {
        let tl = input_buf[y0 * IW * IG + x0 * IG + ig];
        let tr = input_buf[y0 * IW * IG + x1 * IG + ig];
        let bl = input_buf[y1 * IW * IG + x0 * IG + ig];
        let br = input_buf[y1 * IW * IG + x1 * IG + ig];

        let sampled = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                    +        wy  * ((1.0 - wx) * bl + wx * br);

        result += weight_buf[og * IG + ig] * sampled;
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    } else if (params.activation == 2u) {
        result = result * clamp(result + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0;
    }

    output_buf[oy * params.out_w * params.out_groups + ox * params.out_groups + og] = result;
}
\`;var xa=\`enable f16;

// Bilinear upsample + 1\\xD71 pointwise conv fused \\u2014 full f16 variant.
// Bilinear weights and intermediate blends computed in f32; conv accumulation in f16.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    activation : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let og = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || og >= params.out_groups) { return; }

    let IH = params.in_h;
    let IW = params.in_w;
    let IG = params.in_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    var result = bias_buf[og];

    for (var ig = 0u; ig < IG; ig++) {
        let tl = vec4<f32>(input_buf[y0 * IW * IG + x0 * IG + ig]);
        let tr = vec4<f32>(input_buf[y0 * IW * IG + x1 * IG + ig]);
        let bl = vec4<f32>(input_buf[y1 * IW * IG + x0 * IG + ig]);
        let br = vec4<f32>(input_buf[y1 * IW * IG + x1 * IG + ig]);

        let sampled = vec4<f16>((1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                              +        wy  * ((1.0 - wx) * bl + wx * br));

        result += weight_buf[og * IG + ig] * sampled;
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    } else if (params.activation == 2u) {
        result = result * clamp(result + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h;
    }

    output_buf[oy * params.out_w * params.out_groups + ox * params.out_groups + og] = result;
}
\`;var Ut=class extends g{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?xa:va;let s=t.c/4,n=o.outChannels/4;this.output=r.tensor(o.outH,o.outW,o.outChannels),this.inputs=[t],this.weights=[r.upload(m(a.weights)),r.upload(m(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,o.outH,o.outW,s,n,o.activation==="relu6"?1:0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(o.outW/8),Math.ceil(o.outH/8),n]}};var ya=\`// Bilinear upsample + sigmoid fused.
// Identical to bilinear_upsample.wgsl except sigmoid is applied at write time.
// Eliminates the intermediate full-resolution buffer and the separate sigmoid dispatch.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = input_buf[y0 * IW * C + x0 * C + c];
    let tr = input_buf[y0 * IW * C + x1 * C + c];
    let bl = input_buf[y1 * IW * C + x0 * C + c];
    let br = input_buf[y1 * IW * C + x1 * C + c];

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = 1.0 / (1.0 + exp(-result));
}
\`;var wa=\`enable f16;

// Bilinear upsample + sigmoid fused \\u2014 full f16 variant.
// Interpolation computed in f32 for accuracy; sigmoid and result cast to f16.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec4<f32>(input_buf[y0 * IW * C + x0 * C + c]);
    let tr = vec4<f32>(input_buf[y0 * IW * C + x1 * C + c]);
    let bl = vec4<f32>(input_buf[y1 * IW * C + x0 * C + c]);
    let br = vec4<f32>(input_buf[y1 * IW * C + x1 * C + c]);

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(1.0 / (1.0 + exp(-result)));
}
\`;var Bt=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?wa:ya;let o=t.c/4;this.output=r.tensor(a.outH,a.outW,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h,t.w,a.outH,a.outW,o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a.outW/8),Math.ceil(a.outH/8),o]}};var ka=\`// Composite an RGBA image over a solid background, gated by a 1-ch alpha.
// Fragment writes the canvas's swapchain texture (premultiplied output).
//
// Caller invariants (matched in CompositeSolidWebGPU):
//   - image and alpha are NHWC vec4 storage buffers, same h \\xD7 w
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width:    u32,           // image width in pixels (= canvas width)
    _pad0:    u32,
    _pad1:    u32,
    _pad2:    u32,
    bgColor:  vec4<f32>,     // .rgb used; .a ignored
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg = image[i].rgb;
    let a  = alpha[i].r;
    let rgb = fg * a + params.bgColor.rgb * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var Ta=\`enable f16;

// Composite an RGBA image over a solid background, gated by a 1-ch alpha.
// f16 variant: image and alpha are stored as f16; values promote to f32 on
// read and the fragment writes f32 to the canvas swapchain (color attachment
// format is the swapchain's preferred format, always f32-equivalent).
//
// Caller invariants (matched in CompositeSolidWebGPU):
//   - image and alpha are NHWC vec4 storage buffers, same h \\xD7 w
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width:    u32,
    _pad0:    u32,
    _pad1:    u32,
    _pad2:    u32,
    bgColor:  vec4<f32>,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg = vec3<f32>(image[i].rgb);
    let a  = f32(alpha[i].r);
    let rgb = fg * a + params.bgColor.rgb * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var St=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"pipeline");i(this,"bindGroup");i(this,"uniformBuffer");i(this,"outputView",null);if(r.h!==t.h||r.w!==t.w)throw new Error(\`CompositeSolid: image (\${r.h}\\xD7\${r.w}) and alpha (\${t.h}\\xD7\${t.w}) must match. Run the upscaler first.\`);let o=e.device;this.uniformBuffer=o.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let s=new ArrayBuffer(32);new Uint32Array(s,0,1)[0]=r.w,new Float32Array(s,16,4).set([a[0],a[1],a[2],0]),o.queue.writeBuffer(this.uniformBuffer,0,s);let n=e.dtype==="f16"?Ta:ka,p=o.createShaderModule({code:n});this.pipeline=o.createRenderPipeline({layout:"auto",vertex:{module:p,entryPoint:"vs"},fragment:{module:p,entryPoint:"fs",targets:[{format:e.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=o.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}}]})}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("CompositeSolidWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.backend.device.createCommandEncoder(),t=r.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),e||this.backend.device.queue.submit([r.finish()]),this.outputView=null}};var Pa=\`// Like composite_solid but bg is an NHWC vec4 storage buffer (e.g. virtual
// background image, or a blurred copy of the input).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f32>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg  = image[i].rgb;
    let a   = alpha[i].r;
    let bgc = bg[i].rgb;
    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var Ca=\`enable f16;

// Like composite_solid_f16 but bg is an NHWC vec4<f16> storage buffer (e.g. a
// virtual background image, or a blurred copy of the input).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f16>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg  = vec3<f32>(image[i].rgb);
    let a   = f32(alpha[i].r);
    let bgc = vec3<f32>(bg[i].rgb);
    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var Lt=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"pipeline");i(this,"bindGroup");i(this,"uniformBuffer");i(this,"outputView",null);if(r.h!==t.h||r.w!==t.w||r.h!==a.h||r.w!==a.w)throw new Error(\`CompositeImage: image (\${r.h}\\xD7\${r.w}), alpha (\${t.h}\\xD7\${t.w}), and bg (\${a.h}\\xD7\${a.w}) must all match. Run upscaler / resizer first.\`);let o=e.device;this.uniformBuffer=o.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let s=new ArrayBuffer(16);new Uint32Array(s,0,1)[0]=r.w,o.queue.writeBuffer(this.uniformBuffer,0,s);let n=e.dtype==="f16"?Ca:Pa,p=o.createShaderModule({code:n});this.pipeline=o.createRenderPipeline({layout:"auto",vertex:{module:p,entryPoint:"vs"},fragment:{module:p,entryPoint:"fs",targets:[{format:e.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=o.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:a.buffer}}]})}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("CompositeImageWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.backend.device.createCommandEncoder(),t=r.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),e||this.backend.device.queue.submit([r.finish()]),this.outputView=null}};var Wa=\`// Like composite_image but bg is sampled bilinearly \\u2014 bg may be smaller than
// (image, alpha). Used by CompositorBlur to skip the final full-res upsample
// in the blur pyramid and let this shader's own per-pixel scan do the
// expansion (the work is already happening here for the composite anyway).
//
// Layout invariant: image, alpha share output dims (canvas h \\xD7 w); bg is
// at a smaller resolution (bg_h \\xD7 bg_w). All NHWC vec4 storage buffers,
// channelGroups = 1 (RGB padded to vec4).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    out_w: u32,
    out_h: u32,
    bg_w:  u32,
    bg_h:  u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f32>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.out_w + x;

    let fg = image[i].rgb;
    let a  = alpha[i].r;

    // Bilinear sample bg at the corresponding location. align_corners=False.
    let src_x = (f32(x) + 0.5) * (f32(params.bg_w) / f32(params.out_w)) - 0.5;
    let src_y = (f32(y) + 0.5) * (f32(params.bg_h) / f32(params.out_h)) - 0.5;
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(params.bg_w) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(params.bg_w) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(params.bg_h) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(params.bg_h) - 1));
    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = bg[y0 * params.bg_w + x0].rgb;
    let tr = bg[y0 * params.bg_w + x1].rgb;
    let bl = bg[y1 * params.bg_w + x0].rgb;
    let br = bg[y1 * params.bg_w + x1].rgb;
    let bgc = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var Ga=\`enable f16;

// f16 storage variant of composite_image_bilinear. bg is at a smaller
// resolution and is bilinearly sampled to match (image, alpha) at full res.
// Computation in f32; storage in f16.

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    out_w: u32,
    out_h: u32,
    bg_w:  u32,
    bg_h:  u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f16>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.out_w + x;

    let fg = vec3<f32>(image[i].rgb);
    let a  = f32(alpha[i].r);

    let src_x = (f32(x) + 0.5) * (f32(params.bg_w) / f32(params.out_w)) - 0.5;
    let src_y = (f32(y) + 0.5) * (f32(params.bg_h) / f32(params.out_h)) - 0.5;
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(params.bg_w) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(params.bg_w) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(params.bg_h) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(params.bg_h) - 1));
    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec3<f32>(bg[y0 * params.bg_w + x0].rgb);
    let tr = vec3<f32>(bg[y0 * params.bg_w + x1].rgb);
    let bl = vec3<f32>(bg[y1 * params.bg_w + x0].rgb);
    let br = vec3<f32>(bg[y1 * params.bg_w + x1].rgb);
    let bgc = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
\`;var At=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"pipeline");i(this,"bindGroup");i(this,"uniformBuffer");i(this,"outputView",null);if(r.h!==t.h||r.w!==t.w)throw new Error(\`CompositeImageBilinear: image (\${r.h}\\xD7\${r.w}) and alpha (\${t.h}\\xD7\${t.w}) must match.\`);let o=e.device;this.uniformBuffer=o.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let s=new ArrayBuffer(16),n=new Uint32Array(s);n[0]=r.w,n[1]=r.h,n[2]=a.w,n[3]=a.h,o.queue.writeBuffer(this.uniformBuffer,0,s);let p=e.dtype==="f16"?Ga:Wa,c=o.createShaderModule({code:p});this.pipeline=o.createRenderPipeline({layout:"auto",vertex:{module:c,entryPoint:"vs"},fragment:{module:c,entryPoint:"fs",targets:[{format:e.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=o.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:a.buffer}}]})}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("CompositeImageBilinearWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.backend.device.createCommandEncoder(),t=r.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),e||this.backend.device.queue.submit([r.finish()]),this.outputView=null}};var Ua=\`// Passthrough "compositor" \\u2014 writes the image directly to the canvas
// swapchain texture with no alpha math and no background. Used by RenderOp
// when the renderer is in disabled state, so the output canvas reflects
// the unmodified input frame instead of a stale matted result.
//
// Caller invariants (matched in CompositePassthroughWebGPU):
//   - image is an NHWC vec4 storage buffer
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;
    return vec4<f32>(image[i].rgb, 1.0);
}
\`;var Ba=\`enable f16;

// Passthrough "compositor" \\u2014 f16 variant. Image is stored as f16; values
// promote to f32 on read and the fragment writes f32 to the canvas
// swapchain (color attachment is the swapchain's preferred f32-equivalent
// format). See composite_passthrough.wgsl for the f32 version.

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;
    return vec4<f32>(vec3<f32>(image[i].rgb), 1.0);
}
\`;var Et=class{constructor(e,r){i(this,"backend",e);i(this,"pipeline");i(this,"bindGroup");i(this,"uniformBuffer");i(this,"outputView",null);let t=e.device;this.uniformBuffer=t.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let a=new ArrayBuffer(16);new Uint32Array(a,0,1)[0]=r.w,t.queue.writeBuffer(this.uniformBuffer,0,a);let o=e.dtype==="f16"?Ba:Ua,s=t.createShaderModule({code:o});this.pipeline=t.createRenderPipeline({layout:"auto",vertex:{module:s,entryPoint:"vs"},fragment:{module:s,entryPoint:"fs",targets:[{format:e.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=t.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.buffer}},{binding:1,resource:{buffer:this.uniformBuffer}}]})}setOutput(e){this.outputView=e.createView()}run(){if(!this.outputView)throw new Error("CompositePassthroughWebGPU.run() called before setOutput()");let e=this.backend.batchEncoder(),r=e??this.backend.device.createCommandEncoder(),t=r.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),e||this.backend.device.queue.submit([r.finish()]),this.outputView=null}};var Sa=\`// Input op \\u2014 sample a regular 2D source texture (RGBA8 unorm) into the NHWC
// vec4<f32> output buffer at the target resolution. Used for ImageBitmap
// sources, which are uploaded into a persistent staging texture via
// copyExternalImageToTexture before each dispatch.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
    // Orientation: upright uv \\u2192 source uv (see model/orientation.ts).
    // su = dot(uv_x.xyz, (u, v, 1)), sv = dot(uv_y.xyz, (u, v, 1)).
    uv_x  : vec4<f32>,
    uv_y  : vec4<f32>,
}

@group(0) @binding(0) var                       src_tex     : texture_2d<f32>;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let out_uv = vec3<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
        1.0,
    );
    let uv = vec2<f32>(dot(params.uv_x.xyz, out_uv), dot(params.uv_y.xyz, out_uv));
    let rgba = textureSampleLevel(src_tex, src_sampler, uv, 0.0);
    output_buf[y * params.out_w + x] = rgba;
}
\`;var La=\`enable f16;

// Input op \\u2014 f16 storage variant. Source is sampled as vec4<f32>; only the
// store is demoted to vec4<f16>.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
    // Orientation: upright uv \\u2192 source uv (see model/orientation.ts).
    // su = dot(uv_x.xyz, (u, v, 1)), sv = dot(uv_y.xyz, (u, v, 1)).
    uv_x  : vec4<f32>,
    uv_y  : vec4<f32>,
}

@group(0) @binding(0) var                       src_tex     : texture_2d<f32>;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let out_uv = vec3<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
        1.0,
    );
    let uv = vec2<f32>(dot(params.uv_x.xyz, out_uv), dot(params.uv_y.xyz, out_uv));
    let rgba = textureSampleLevel(src_tex, src_sampler, uv, 0.0);
    output_buf[y * params.out_w + x] = vec4<f16>(rgba);
}
\`;var Aa=\`// Input op \\u2014 sample a GPUExternalTexture (zero-copy VideoFrame import) into
// the NHWC vec4<f32> output buffer at the target resolution. Used when the
// caller passes a VideoFrame to setSource(); requires importExternalTexture
// to be called in the same task as the dispatch (the texture is invalidated
// after the current task completes).

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
    // Orientation: upright uv \\u2192 source uv (see model/orientation.ts).
    // su = dot(uv_x.xyz, (u, v, 1)), sv = dot(uv_y.xyz, (u, v, 1)).
    uv_x  : vec4<f32>,
    uv_y  : vec4<f32>,
}

@group(0) @binding(0) var                       src_tex     : texture_external;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let out_uv = vec3<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
        1.0,
    );
    let uv = vec2<f32>(dot(params.uv_x.xyz, out_uv), dot(params.uv_y.xyz, out_uv));
    let rgba = textureSampleBaseClampToEdge(src_tex, src_sampler, uv);
    output_buf[y * params.out_w + x] = rgba;
}
\`;var Ea=\`enable f16;

// Input op \\u2014 texture_external + f16 storage. Sample in f32, store as f16.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
    // Orientation: upright uv \\u2192 source uv (see model/orientation.ts).
    // su = dot(uv_x.xyz, (u, v, 1)), sv = dot(uv_y.xyz, (u, v, 1)).
    uv_x  : vec4<f32>,
    uv_y  : vec4<f32>,
}

@group(0) @binding(0) var                       src_tex     : texture_external;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let out_uv = vec3<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
        1.0,
    );
    let uv = vec2<f32>(dot(params.uv_x.xyz, out_uv), dot(params.uv_y.xyz, out_uv));
    let rgba = textureSampleBaseClampToEdge(src_tex, src_sampler, uv);
    output_buf[y * params.out_w + x] = vec4<f16>(rgba);
}
\`;var Or=u=>typeof VideoFrame<"u"&&u instanceof VideoFrame,Ft=class{constructor(e,r,t){i(this,"output");i(this,"backend");i(this,"device");i(this,"dtype");i(this,"sampler");i(this,"uniformBuffer");i(this,"dispatch");i(this,"pipeline2d",null);i(this,"pipelineExternal",null);i(this,"stagingTex",null);i(this,"stagingW",0);i(this,"stagingH",0);i(this,"source",null);i(this,"outW");i(this,"outH");i(this,"orientation",null);i(this,"externalUnsupported",!1);this.backend=e,this.device=e.device,this.dtype=e.dtype,this.output=e.tensor(r,t,4),this.sampler=this.device.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),this.uniformBuffer=this.device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.outW=t,this.outH=r,this.writeParams(null),this.dispatch=[Math.ceil(t/8),Math.ceil(r/8),1],this.pipeline2d=this.buildPipeline(this.dtype==="f16"?La:Sa)}setSource(e,r){this.source=e,oo(r,this.orientation)||this.writeParams(r??null)}writeParams(e){let r=new ArrayBuffer(48);new Uint32Array(r,0,2).set([this.outW,this.outH]);let t=je(e);new Float32Array(r,16,8).set([t[0],t[1],t[2],0,t[3],t[4],t[5],0]),this.device.queue.writeBuffer(this.uniformBuffer,0,r),this.orientation=e}run(){if(!this.source)throw new Error("InputWebGPU.run() called before setSource()");if(Or(this.source)){if(!this.externalUnsupported)try{this.runExternal(this.source);return}catch(e){this.externalUnsupported=!0,console.warn("[longpipe] importExternalTexture unavailable, using copyExternalImageToTexture:",e?.message??e)}this.run2d(this.source)}else this.run2d(this.source)}run2d(e){let r=Or(e)?e.displayWidth:e.width,t=Or(e)?e.displayHeight:e.height;this.ensureStagingTexture(r,t),this.backend.flush(),this.device.queue.copyExternalImageToTexture({source:e,flipY:!1},{texture:this.stagingTex},[r,t]);let a=this.device.createBindGroup({layout:this.pipeline2d.getBindGroupLayout(0),entries:[{binding:0,resource:this.stagingTex.createView()},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:this.output.buffer}}]});this.dispatchOnce(this.pipeline2d,a)}runExternal(e){if(typeof this.device.importExternalTexture!="function")throw new Error("importExternalTexture not supported");this.pipelineExternal||(this.pipelineExternal=this.buildPipeline(this.dtype==="f16"?Ea:Aa));let r=this.device.importExternalTexture({source:e}),t=this.device.createBindGroup({layout:this.pipelineExternal.getBindGroupLayout(0),entries:[{binding:0,resource:r},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:this.output.buffer}}]});this.dispatchOnce(this.pipelineExternal,t)}ensureStagingTexture(e,r){this.stagingTex&&this.stagingW===e&&this.stagingH===r||(this.stagingTex?.destroy(),this.stagingTex=this.device.createTexture({size:[e,r,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.stagingW=e,this.stagingH=r)}buildPipeline(e){let r=this.device.createShaderModule({code:e});return this.device.createComputePipeline({layout:"auto",compute:{module:r,entryPoint:"main"}})}dispatchOnce(e,r){let t=this.backend.computePass();if(t){t.setPipeline(e),t.setBindGroup(0,r),t.dispatchWorkgroups(...this.dispatch);return}let a=this.device.createCommandEncoder(),o=a.beginComputePass();o.setPipeline(e),o.setBindGroup(0,r),o.dispatchWorkgroups(...this.dispatch),o.end(),this.device.queue.submit([a.finish()])}};var Fa=\`// Global average pool: (H, W, C) \\u2192 (1, 1, C). One 256-thread workgroup per
// channel group; each thread sums a strided slice of the plane, then the
// partials are tree-reduced in workgroup memory. Accumulates in f32 for both
// storage dtypes. Ported from the webrtcHacks selfie-segmentation demo (a
// single thread walking the plane was 80% of that network's GPU time).

struct Params {
    n  : u32,   // H * W
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

var<workgroup> partial : array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3<u32>) {
    let c = wg.x;
    var sum = vec4<f32>(0.0);
    for (var i = t; i < params.n; i += 256u) { sum += input_buf[i * params.g + c]; }
    partial[t] = sum;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride >>= 1u) {
        if (t < stride) { partial[t] += partial[t + stride]; }
        workgroupBarrier();
    }
    if (t == 0u) { output_buf[c] = partial[0] / f32(params.n); }
}
\`;var Oa=\`enable f16;
// Global average pool: (H, W, C) \\u2192 (1, 1, C). One 256-thread workgroup per
// channel group; each thread sums a strided slice of the plane, then the
// partials are tree-reduced in workgroup memory. Accumulates in f32 for both
// storage dtypes. Ported from the webrtcHacks selfie-segmentation demo (a
// single thread walking the plane was 80% of that network's GPU time).

struct Params {
    n  : u32,   // H * W
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

var<workgroup> partial : array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3<u32>) {
    let c = wg.x;
    var sum = vec4<f32>(0.0);
    for (var i = t; i < params.n; i += 256u) { sum += vec4<f32>(input_buf[i * params.g + c]); }
    partial[t] = sum;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride >>= 1u) {
        if (t < stride) { partial[t] += partial[t + stride]; }
        workgroupBarrier();
    }
    if (t == 0u) { output_buf[c] = vec4<f16>(partial[0] / f32(params.n)); }
}
\`;var Ot=class extends g{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");this.shader=r.dtype==="f16"?Oa:Fa;let a=t.c/4;this.output=r.tensor(1,1,t.c),this.inputs=[t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t.h*t.w,a,0,0])),this.defaultSetup(),this.dispatch=[a,1,1]}};var Ra=\`// Per-channel scale: out[y, x, c] = x[y, x, c] * scale[c], scale is (1, 1, C).
// The broadcast multiply behind squeeze-excite / attention gates.

struct Params {
    n  : u32,   // H * W * channel groups (vec4 count)
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       scale_buf  : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    output_buf[i] = input_buf[i] * scale_buf[i % params.g];
}
\`;var Da=\`enable f16;
// Per-channel scale: out[y, x, c] = x[y, x, c] * scale[c], scale is (1, 1, C).
// The broadcast multiply behind squeeze-excite / attention gates.

struct Params {
    n  : u32,   // H * W * channel groups (vec4 count)
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       scale_buf  : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    output_buf[i] = input_buf[i] * scale_buf[i % params.g];
}
\`;var Rt=class extends g{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader");if(a.h!==1||a.w!==1||a.c!==t.c)throw new Error(\`ChannelScale: scale must be 1\\xD71\\xD7\${t.c}, got \${a.h}\\xD7\${a.w}\\xD7\${a.c}\`);this.shader=r.dtype==="f16"?Da:Ra;let o=t.c/4,s=t.h*t.w*o;this.output=r.tensor(t.h,t.w,t.c),this.inputs=[t,a],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([s,o,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(s/256),1,1]}};var au=navigator.gpu?GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST:0,ge=class u{constructor(e,r,t){i(this,"device",e);i(this,"canvas",r);i(this,"dtype",t);i(this,"ops");i(this,"presenters");i(this,"canvasContext");i(this,"canvasFormat");i(this,"bytesPerElement");i(this,"contexts",new Map);i(this,"batchState",{depth:0,enc:null,pass:null});this.bytesPerElement=t==="f16"?2:4;let a=r.getContext("webgpu");if(!a)throw new Error("Failed to get WebGPU context from canvas");this.canvasFormat=navigator.gpu.getPreferredCanvasFormat(),this.configureContext(a),this.canvasContext=a,this.contexts.set("main",a),this.ops={Conv2d:(o,s,n)=>new Qe(this,o,s,n),ConvTranspose2d:(o,s,n)=>new Je(this,o,s,n),DepthwiseConv2d:(o,s,n)=>new Ze(this,o,s,n),Add:(o,s)=>new et(this,o,s),Sigmoid:o=>new tt(this,o),Tanh:o=>new rt(this,o),ElementwiseMul:(o,s)=>new ot(this,o,s),GlobalAvgPool:o=>new Ot(this,o),ChannelScale:(o,s)=>new Rt(this,o,s),Warp:(o,s,n)=>new at(this,o,s,n),FaceBoxFromHeatmaps:(o,s)=>new it(this,o,s),FaceBoxesFromHeatmaps:(o,s)=>new st(this,o,s),ReframeState:(o,s,n,p)=>new nt(this,o,s,n,p),Reframe:(o,s)=>new ut(this,o,s),CropResample:(o,s,n)=>new pt(this,o,s,n),FaceTouchupStage:(o,s,n,p,c)=>new dt(this,o,s,n,p,c),Stabilize:(o,s,n,p,c)=>new ft(this,o,s,n,p,c),BilinearUpsample:(o,s)=>new mt(this,o,s),Crop:(o,s)=>new ht(this,o,s),BicubicUpsample:(o,s)=>new gt(this,o,s),ChannelConcat:(o,s)=>new _t(this,o,s),Conv2dAdd:(o,s,n,p)=>new bt(this,o,s,n,p),ProjResidual:(o,s,n,p)=>new vt(this,o,s,n,p),ConcatConv2d:(o,s,n,p)=>new xt(this,o,s,n,p),GatesFused:(o,s,n)=>new yt(this,o,s,n),CandUpdateFused:(o,s,n,p,c)=>new wt(this,o,s,n,p,c),ConvExpand:(o,s)=>new kt(this,o,s),CatConv6to2:(o,s,n)=>new Tt(this,o,s,n),DownAdapter:(o,s,n,p)=>new Pt(this,o,s,n,p),UpFinal:(o,s,n)=>new Ct(this,o,s,n),UpFinalSkip:(o,s,n,p)=>new Wt(this,o,s,n,p),UpsampleConcat:(o,s,n)=>new Gt(this,o,s,n),UpsampleConv1x1:(o,s,n)=>new Ut(this,o,s,n),UpsampleSigmoid:(o,s)=>new Bt(this,o,s),Input:(o,s)=>new Ft(this,o,s)},this.presenters={CompositeSolid:(o,s,n,p="main")=>{let c=new St(this,o,s,n);return{run:()=>{c.setOutput(this.getCurrentDisplayTexture(p)),c.run()}}},CompositeImage:(o,s,n,p="main")=>{let c=new Lt(this,o,s,n);return{run:()=>{c.setOutput(this.getCurrentDisplayTexture(p)),c.run()}}},CompositeImageBilinear:(o,s,n,p="main")=>{let c=new At(this,o,s,n);return{run:()=>{c.setOutput(this.getCurrentDisplayTexture(p)),c.run()}}},CompositePassthrough:(o,s="main")=>{let n=new Et(this,o);return{run:()=>{n.setOutput(this.getCurrentDisplayTexture(s)),n.run()}}},LandmarkOverlay:(o,s,n,p,c="main")=>{let l=new ct(this,o,s,n,p);return{run:()=>{l.setOutput(this.getCurrentDisplayTexture(c)),l.run()}}},FaceTouchup:(o,s,n,p,c,l="main")=>{let d=new lt(this,o,s,n,p,c);return{run:()=>{d.setOutput(this.getCurrentDisplayTexture(l)),d.run()}}}}}batch(e){let r=this.batchState;r.depth++;try{return e()}finally{--r.depth===0&&this.flush()}}computePass(){let e=this.batchState;return e.depth===0?null:(e.pass||(e.pass=this.batchEncoder().beginComputePass()),e.pass)}batchEncoder(){let e=this.batchState;return e.depth===0?null:(e.pass&&(e.pass.end(),e.pass=null),e.enc??(e.enc=this.device.createCommandEncoder()))}flush(){let e=this.batchState;if(e.pass&&(e.pass.end(),e.pass=null),e.enc){let r=e.enc;e.enc=null,this.device.queue.submit([r.finish()])}}configureContext(e){e.configure({device:this.device,format:this.canvasFormat,alphaMode:"premultiplied"})}attachCanvas(e,r){if(e==="main")throw new Error("attachCanvas: 'main' is reserved for the create() canvas");let t=r.getContext("webgpu");if(!t)throw new Error(\`attachCanvas: failed to get WebGPU context for target '\${e}'\`);this.configureContext(t),this.contexts.set(e,t)}static async isAvailable(){return navigator.gpu?await navigator.gpu.requestAdapter()!==null:!1}static async hasF16Support(){if(!navigator.gpu)return!1;let e=await navigator.gpu.requestAdapter();return e?e.features.has("shader-f16"):!1}static async create(e){let r=e.dtype??"f32",t=e.device;if(t){if(r==="f16"&&!t.features.has("shader-f16"))throw new Error("WebGPU dtype='f16' requested but supplied device lacks \`shader-f16\`")}else{let a=await navigator.gpu.requestAdapter();if(!a)throw new Error("WebGPU adapter not available");if(r==="f16"&&!a.features.has("shader-f16"))throw new Error("WebGPU dtype='f16' requested but adapter lacks \`shader-f16\` feature");t=await a.requestDevice({requiredFeatures:r==="f16"?["shader-f16"]:[]})}return new u(t,e.canvas,r)}getCurrentDisplayTexture(e="main"){let r=this.contexts.get(e);if(!r)throw new Error(\`getCurrentDisplayTexture: no canvas attached for target '\${e}'\`);try{return r.getCurrentTexture()}catch{return this.configureContext(r),r.getCurrentTexture()}}tensor(e,r,t,a){let s=e*r*t*this.bytesPerElement,n=this.device.createBuffer({size:s,usage:au,mappedAtCreation:a!==void 0});if(a!==void 0){let p=n.getMappedRange();this.writeView(p,a),n.unmap()}return{h:e,w:r,c:t,buffer:n}}upload(e){let t=e.length*this.bytesPerElement,a=this.device.createBuffer({size:t,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,mappedAtCreation:!0});return this.writeView(a.getMappedRange(),e),a.unmap(),{buffer:a}}writeView(e,r){let t=this.dtype==="f16",a=r instanceof Uint16Array;if(t===a){t?new Uint16Array(e).set(r):new Float32Array(e).set(r);return}t?new Uint16Array(e).set(Ye(r)):new Float32Array(e).set(fe(r))}async readback(e){this.flush();let r=this.device.createBuffer({size:e.buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),t=this.device.createCommandEncoder();t.copyBufferToBuffer(e.buffer,0,r,0,e.buffer.size),this.device.queue.submit([t.finish()]),await r.mapAsync(GPUMapMode.READ);let a=r.getMappedRange(),o=this.dtype==="f16"?fe(new Uint16Array(a.slice(0))):new Float32Array(a.slice(0));return r.unmap(),r.destroy(),o}copyTensor(e,r){if(e.buffer.size!==r.buffer.size)throw new Error(\`copyTensor: size mismatch (src \${e.buffer.size} vs dst \${r.buffer.size})\`);let t=this.batchEncoder(),a=t??this.device.createCommandEncoder();a.copyBufferToBuffer(e.buffer,0,r.buffer,0,e.buffer.size),t||this.device.queue.submit([a.finish()])}async sync(){this.flush(),await this.device.queue.onSubmittedWorkDone()}destroy(){this.batchState.pass=null,this.batchState.enc=null,this.device.destroy()}};var iu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,h=class{constructor(e){i(this,"backend",e);i(this,"shader","");i(this,"program");i(this,"samplers",[]);i(this,"uniformInts",{});i(this,"uniformFloats",{});i(this,"glCache",null)}makeTexture(e,r,t){let a=this.backend.gl,o=this.backend.textureFormat,s=this.backend.toTextureView(e),n=a.createTexture();return a.bindTexture(a.TEXTURE_2D,n),a.texImage2D(a.TEXTURE_2D,0,o.internalFormat,r,t,0,o.format,o.type,s),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),n}defaultSetup(){let e=this.backend.gl,r=e.createShader(e.VERTEX_SHADER);e.shaderSource(r,iu),e.compileShader(r);let t=e.createShader(e.FRAGMENT_SHADER);if(e.shaderSource(t,this.shader),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw new Error(\`GLSL compile error: \${e.getShaderInfoLog(t)}\`);if(this.program=e.createProgram(),e.attachShader(this.program,r),e.attachShader(this.program,t),e.linkProgram(this.program),!e.getProgramParameter(this.program,e.LINK_STATUS))throw new Error(\`GLSL link error: \${e.getProgramInfoLog(this.program)}\`)}run(){let e=this.backend.gl;e.useProgram(this.program);let r=this.glCache;if(!r||r.target!==this.output.texture){r&&e.deleteFramebuffer(r.fbo);let t=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,t),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.output.texture,0),r=this.glCache={samplerLocs:this.samplers.map(({name:a},o)=>{let s=e.getUniformLocation(this.program,a);return e.uniform1i(s,o),s}),ints:new Map,floats:new Map,fbo:t,target:this.output.texture}}this.samplers.forEach(({name:t,texture:a},o)=>{if(o>=r.samplerLocs.length){let s=e.getUniformLocation(this.program,t);e.uniform1i(s,o),r.samplerLocs.push(s)}e.activeTexture(e.TEXTURE0+o),e.bindTexture(e.TEXTURE_2D,a)});for(let[t,a]of Object.entries(this.uniformInts)){let o=r.ints.get(t);o||r.ints.set(t,o={loc:e.getUniformLocation(this.program,t),val:void 0}),o.val!==a&&(e.uniform1i(o.loc,a),o.val=a)}for(let[t,a]of Object.entries(this.uniformFloats)){let o=r.floats.get(t);o||r.floats.set(t,o={loc:e.getUniformLocation(this.program,t),val:void 0}),o.val!==a&&(e.uniform1f(o.loc,a),o.val=a)}e.bindFramebuffer(e.FRAMEBUFFER,r.fbo),e.viewport(0,0,this.dispatch[0],this.dispatch[1]),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Ia=\`#version 300 es
// Conv2d \\u2014 handles all variants: 1\\xD71 (pointwise), 3\\xD73, 5\\xD75, strided, BN-fused.
//
// Tensor layout: NHWC vec4 \\u2014 texture dimensions (W * C/4, H).
//   texel (x * C_groups + c_group, y) = channels [c_group*4 .. c_group*4+3] at pixel (x,y).
//
// Weight layout: (I_groups * 4, K\\xB2 * O_groups) RGBA32F texture.
//   Row  = z * u_out_c_groups + o_group   (kernel_pos outer, out_group inner)
//   Col  = i_group * 4 + mat_col          (4 texels per mat4)
//   mat4[col][row] = weight(in_channel=col, out_channel=row)
//   Operation: (mat4 * in_val)[r] = \\u03A3_c weight(in=c, out=r) * in_val[c]  \\u2014 same as WGSL.
//
// Bias layout: (O_groups, 1).
//
// Padding model: pad_top / pad_left applied to input offset; right/bottom asymmetry
// is handled implicitly by the bounds check, same as the WGSL implementation.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * in_C_groups, in_H)
uniform sampler2D u_weights;  // (in_C_groups * 4, K\\xB2 * out_C_groups)
uniform sampler2D u_bias;     // (out_C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;   // hard-swish
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));                      // sigmoid

    fragColor = result;
}
\`;var Dt=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",Ia);let s=G(t.h,o.kernel,o.stride,o.padding),n=G(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=o.outChannels/4,l=U(o.padding,t.h,s,o.kernel,o.stride),d=U(o.padding,t.w,n,o.kernel,o.stride),f=m(a.weights),x=m(a.bias),_=this.makeTexture(f,p*4,o.kernel*o.kernel*c),b=this.makeTexture(x,c,1),v=n*c,y=this.makeTexture(null,v,s);this.output={h:s,w:n,c:o.outChannels,texture:y,texW:v,texH:s},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:_},{name:"u_bias",texture:b}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:p,u_out_c_groups:c,u_kernel_h:o.kernel,u_kernel_w:o.kernel,u_stride:o.stride,u_pad_top:l,u_pad_left:d,u_activation:X(o.activation)},this.defaultSetup(),this.dispatch=[v,s]}};var Ma=\`#version 300 es
// ConvTranspose2d \\u2014 gather form. Identical texture layouts + mat4 weight
// semantics as conv2d.glsl; only the spatial mapping differs:
//   in_y = (y_out + pad - ky) / stride   (must divide evenly + be in bounds)
// No explicit kernel flip \\u2014 the (y_out + pad - ky) indexing carries it.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * in_C_groups, in_H)
uniform sampler2D u_weights;  // (in_C_groups * 4, K\\xB2 * out_C_groups)
uniform sampler2D u_bias;     // (out_C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int iy_num = y_out + u_pad_top  - ky;
            int ix_num = x_out + u_pad_left - kx;
            if (iy_num < 0 || ix_num < 0) continue;
            if ((iy_num % u_stride) != 0 || (ix_num % u_stride) != 0) continue;
            int in_y = iy_num / u_stride;
            int in_x = ix_num / u_stride;
            if (in_y >= u_in_h || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;   // hard-swish
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));                      // sigmoid

    fragColor = result;
}
\`;var It=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",Ma);let s=me(t.h,o.kernel,o.stride,o.padding),n=me(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=o.outChannels/4,l=m(a.weights),d=m(a.bias),f=this.makeTexture(l,p*4,o.kernel*o.kernel*c),x=this.makeTexture(d,c,1),_=n*c,b=this.makeTexture(null,_,s);this.output={h:s,w:n,c:o.outChannels,texture:b,texW:_,texH:s},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:f},{name:"u_bias",texture:x}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:p,u_out_c_groups:c,u_kernel_h:o.kernel,u_kernel_w:o.kernel,u_stride:o.stride,u_pad_top:o.padding,u_pad_left:o.padding,u_activation:X(o.activation)},this.defaultSetup(),this.dispatch=[_,s]}};var za=\`#version 300 es
// Depthwise Conv2d \\u2014 groups = in_channels (each channel convolved independently).
//
// Weight layout: (C_groups, K\\xB2) RGBA32F texture \\u2014 contrast with conv2d which uses mat4.
//   texel (c_group, z) = vec4 kernel weights for 4 channels at kernel position z.
//   Operation: element-wise multiply (not matmul). 4\\xD7 smaller than a mat4 approach.
//
// Padding model: same asymmetric SAME-pad handling as conv2d.glsl.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * C_groups, in_H)
uniform sampler2D u_weights;  // (C_groups, K\\xB2)
uniform sampler2D u_bias;     // (C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;    // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_c_groups;
    int y_out   = fy;
    int c_group = fx - x_out * u_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(c_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z = ky * u_kernel_w + kx;

            vec4 in_val = texelFetch(u_input,   ivec2(in_x * u_c_groups + c_group, in_y), 0);
            vec4 w      = texelFetch(u_weights, ivec2(c_group, z), 0);

            result += w * in_val;  // element-wise multiply, not matmul
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));

    fragColor = result;
}
\`;var Mt=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",za);let s=G(t.h,o.kernel,o.stride,o.padding),n=G(t.w,o.kernel,o.stride,o.padding),p=t.c/4,c=U(o.padding,t.h,s,o.kernel,o.stride),l=U(o.padding,t.w,n,o.kernel,o.stride),d=m(a.weights),f=m(a.bias),x=this.makeTexture(d,p,o.kernel*o.kernel),_=this.makeTexture(f,p,1),b=n*p,v=this.makeTexture(null,b,s);this.output={h:s,w:n,c:t.c,texture:v,texW:b,texH:s},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:x},{name:"u_bias",texture:_}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_c_groups:p,u_kernel_h:o.kernel,u_kernel_w:o.kernel,u_stride:o.stride,u_pad_top:c,u_pad_left:l,u_activation:X(o.activation)},this.defaultSetup(),this.dispatch=[b,s]}};var Ha=\`#version 300 es
// Element-wise add \\u2014 both inputs and output share the same texture dimensions.
// Works for any 2D layout; used here with a flat (nVec4, 1) texture.

precision highp float;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;

out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input_a, fc, 0) + texelFetch(u_input_b, fc, 0);
}
\`;var zt=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Ha);let o=t,s=this.makeTexture(null,o.texW,o.texH);this.output={h:t.h,w:t.w,c:t.c,texture:s,texW:o.texW,texH:o.texH},this.inputs=[t,a],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:a.texture}],this.defaultSetup(),this.dispatch=[o.texW,o.texH]}};var Na=\`#version 300 es
// Element-wise sigmoid \\u2014 works on any texture layout (flat or spatial).

precision highp float;

uniform sampler2D u_input;

out vec4 fragColor;

void main() {
    vec4 x = texelFetch(u_input, ivec2(gl_FragCoord.xy), 0);
    fragColor = 1.0 / (1.0 + exp(-x));
}
\`;var Ht=class extends h{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Na);let a=t,o=this.makeTexture(null,a.texW,a.texH);this.output={h:t.h,w:t.w,c:t.c,texture:o,texW:a.texW,texH:a.texH},this.inputs=[t],this.samplers=[{name:"u_input",texture:a.texture}],this.defaultSetup(),this.dispatch=[a.texW,a.texH]}};var Va=\`#version 300 es
// Element-wise tanh \\u2014 used by ConvGRU candidate activation.
// Layout-agnostic (flat or spatial); GLSL tanh is element-wise on vec4.

precision highp float;

uniform sampler2D u_input;

out vec4 fragColor;

void main() {
    fragColor = tanh(texelFetch(u_input, ivec2(gl_FragCoord.xy), 0));
}
\`;var Nt=class extends h{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Va);let a=t,o=this.makeTexture(null,a.texW,a.texH);this.output={h:t.h,w:t.w,c:t.c,texture:o,texW:a.texW,texH:a.texH},this.inputs=[t],this.samplers=[{name:"u_input",texture:a.texture}],this.defaultSetup(),this.dispatch=[a.texW,a.texH]}};var Xa=\`#version 300 es
// Element-wise multiply \\u2014 used in ConvGRU for r \\u2299 h_prev.
// Same shape constraint as add.glsl.

precision highp float;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;

out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input_a, fc, 0) * texelFetch(u_input_b, fc, 0);
}
\`;var Vt=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Xa);let o=t,s=this.makeTexture(null,o.texW,o.texH);this.output={h:t.h,w:t.w,c:t.c,texture:s,texW:o.texW,texH:o.texH},this.inputs=[t,a],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:a.texture}],this.defaultSetup(),this.dispatch=[o.texW,o.texH]}};var ja=\`#version 300 es
// Bilinear gather-warp. out[p] = sample(source, p + flow_scale\\xB7flow[p].xy),
// edge-clamped. Source/output are (W\\xB7G, H) with G = c/4 channel groups
// (fragment x decomposes to pixel + group, like conv); flow is 4-ch, same
// spatial resolution, vector in .xy.

precision highp float;
precision highp int;

uniform sampler2D u_source;   // (W * G, H)
uniform sampler2D u_flow;     // (W, H), flow in .xy
uniform int   u_w;
uniform int   u_h;
uniform int   u_groups;
uniform float u_flow_scale;

out vec4 fragColor;

vec4 samp(int x, int y, int g) {
    int cx = clamp(x, 0, u_w - 1);
    int cy = clamp(y, 0, u_h - 1);
    return texelFetch(u_source, ivec2(cx * u_groups + g, cy), 0);
}

void main() {
    int fx = int(gl_FragCoord.x);
    int y  = int(gl_FragCoord.y);
    int x  = fx / u_groups;
    int g  = fx - x * u_groups;

    vec2 f  = texelFetch(u_flow, ivec2(x, y), 0).xy;
    float sx = clamp(float(x) + u_flow_scale * f.x, 0.0, float(u_w - 1));
    float sy = clamp(float(y) + u_flow_scale * f.y, 0.0, float(u_h - 1));

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0, g), samp(x0 + 1, y0, g), tx);
    vec4 bot = mix(samp(x0, y0 + 1, g), samp(x0 + 1, y0 + 1, g), tx);
    fragColor = mix(top, bot, ty);
}
\`;var Xt=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",ja);let s=t.w,n=t.h,p=t.c/4,c=this.makeTexture(null,s*p,n);this.output={h:n,w:s,c:t.c,texture:c,texW:s*p,texH:n},this.inputs=[t,a],this.samplers=[{name:"u_source",texture:t.texture},{name:"u_flow",texture:a.texture}],this.uniformInts={u_w:s,u_h:n,u_groups:p},this.uniformFloats={u_flow_scale:o.flowScale},this.defaultSetup(),this.dispatch=[s*p,n]}};var $a=\`#version 300 es
// Face-box decode from 5-keypoint heatmaps. Output is a 1\\xD71 texture:
// (cx, cy, halfSide, score) in FRAME FRACTIONS (halfSide as a fraction of
// frame WIDTH; the heatmap grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Peaks refined with a windowed soft-argmax
// centroid \\u2014 NEVER hard argmax (whole-cell snapping jitters the crop).
//
// Single fragment does all 5 channels serially \\u2014 the grid is tiny (\\u2264 ~48\\xD728).
// Heatmap texture: (w * 2, h) \\u2014 8 channels = 2 vec4 groups per pixel.

precision highp float;
precision highp int;

uniform sampler2D u_hm;
uniform int u_h;
uniform int u_w;
uniform int u_win;
uniform float u_thresh;
uniform float u_box_scale;

out vec4 fragColor;

float hmAt(int x, int y, int k) {
    vec4 v = texelFetch(u_hm, ivec2(x * 2 + k / 4, y), 0);
    return v[k % 4];
}

void main() {
    float x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, score = 1e9;

    for (int k = 0; k < 5; k++) {
        // Peak.
        float peak = -1.0;
        int pr = 0, pc = 0;
        for (int y = 0; y < u_h; y++) {
            for (int x = 0; x < u_w; x++) {
                float v = hmAt(x, y, k);
                if (v > peak) { peak = v; pr = y; pc = x; }
            }
        }
        // Windowed soft-argmax centroid.
        int r0 = max(0, pr - u_win), r1 = min(u_h, pr + u_win + 1);
        int c0 = max(0, pc - u_win), c1 = min(u_w, pc + u_win + 1);
        float wsum = 0.0, sy = 0.0, sx = 0.0;
        for (int y = r0; y < r1; y++) {
            for (int x = c0; x < c1; x++) {
                float v = hmAt(x, y, k);
                wsum += v; sy += v * float(y); sx += v * float(x);
            }
        }
        wsum = max(wsum, 1e-6);
        float kx = sx / wsum, ky = sy / wsum;
        x0 = min(x0, kx); x1 = max(x1, kx);
        y0 = min(y0, ky); y1 = max(y1, ky);
        score = min(score, peak);
    }
    if (score < u_thresh) score = 0.0;

    float halfPx = 0.5 * u_box_scale * max(x1 - x0, y1 - y0);
    float cx = ((x0 + x1) * 0.5 + 0.5) / float(u_w);
    float cy = ((y0 + y1) * 0.5 + 0.5) / float(u_h);
    fragColor = vec4(cx, cy, halfPx / float(u_w), score);
}
\`;var jt=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch",[1,1]);i(this,"shader",$a);if(t.c!==8)throw new Error(\`FaceBoxFromHeatmaps: expected 8-ch heatmaps (5 real), got \${t.c}\`);let o=this.makeTexture(null,1,1);this.output={h:1,w:1,c:4,texture:o,texW:1,texH:1},this.inputs=[t],this.samplers=[{name:"u_hm",texture:t.texture}],this.uniformInts={u_h:t.h,u_w:t.w,u_win:a.win},this.uniformFloats={u_thresh:a.thresh,u_box_scale:a.boxScale},this.defaultSetup()}};var qa=\`#version 300 es
// MULTI-FACE box decode from 5-keypoint heatmaps \\u2192 1\\xD7K texture, slot i =
// (cx, cy, halfSide, score) in FRAME FRACTIONS (halfSide a fraction of frame
// WIDTH). The multi-face sibling of face_box.glsl. See face_boxes.wgsl for the
// full algorithm commentary \\u2014 this mirrors it exactly.
//
// WebGL has no compute and no shared memory, so each fragment (= one face slot)
// independently redoes the ENTIRE decode \\u2014 candidates for all 5 channels,
// hypotheses, NMS \\u2014 and emits the slot matching its own x. That's K\\xD7 redundant
// work, which is fine here: the grid is \\u2264 ~48\\xD728 and K \\u2264 6, and it keeps the
// WGSL and GLSL paths line-for-line comparable.
//
// Heatmap texture: (w * 2, h) \\u2014 8 channels = 2 vec4 groups per pixel.

precision highp float;
precision highp int;

uniform sampler2D u_hm;
uniform int u_h;
uniform int u_w;
uniform int u_win;
uniform float u_thresh;
uniform float u_box_scale;
uniform int u_max_faces;
uniform float u_tol;

out vec4 fragColor;

const int N_KP     = 5;
const int MAX_CAND = 5;
const float LAMBDA  = 0.5;
const float MIN_SEP = 1.0;
const float MIN_EYE = 1.0;

float c_x[25];
float c_y[25];
float c_s[25];
int   c_n[5];

float hmAt(int x, int y, int k) {
    vec4 v = texelFetch(u_hm, ivec2(x * 2 + k / 4, y), 0);
    return v[k % 4];
}

// ArcFace canonical template in the eye frame (origin = L-eye, +u along the
// L\\u2192R eye vector, +w perpendicular), normalized by interocular distance.
float tmplU(int t) { return t == 0 ? 0.50002 : (t == 1 ? 0.08598 : 0.91410); }
float tmplW(int t) { return t == 0 ? 0.57150 : 1.15462; }

void main() {
    int myFace = int(gl_FragCoord.x);

    // \\u2500\\u2500 stage 1: local-maximum candidates, per channel \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    for (int k = 0; k < N_KP; k++) {
        int   pr[5];
        int   pc[5];
        float ps[5];
        int n = 0;

        for (int y = 0; y < u_h; y++) {
            for (int x = 0; x < u_w; x++) {
                float v = hmAt(x, y, k);
                if (v < u_thresh) continue;

                bool isMax = true;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (dx == 0 && dy == 0) continue;
                        int rr = y + dy, cc = x + dx;
                        if (rr < 0 || rr >= u_h || cc < 0 || cc >= u_w) continue;
                        float u = hmAt(cc, rr, k);
                        if (u > v || (u == v && rr * u_w + cc < y * u_w + x)) isMax = false;
                    }
                }
                if (!isMax) continue;

                int slot = n;
                if (n == MAX_CAND) {
                    if (v <= ps[MAX_CAND - 1]) continue;
                    slot = MAX_CAND - 1;
                } else {
                    n++;
                }
                while (slot > 0 && ps[slot - 1] < v) {
                    ps[slot] = ps[slot - 1]; pr[slot] = pr[slot - 1]; pc[slot] = pc[slot - 1];
                    slot--;
                }
                ps[slot] = v; pr[slot] = y; pc[slot] = x;
            }
        }

        int m = 0;
        for (int i = 0; i < n; i++) {
            float rx = float(pc[i]);
            float ry = float(pr[i]);
            if (u_win > 0) {
                int r0 = max(0, pr[i] - u_win), r1 = min(u_h, pr[i] + u_win + 1);
                int c0 = max(0, pc[i] - u_win), c1 = min(u_w, pc[i] + u_win + 1);
                float wsum = 0.0, sy = 0.0, sx = 0.0;
                for (int y = r0; y < r1; y++) {
                    for (int x = c0; x < c1; x++) {
                        float v = hmAt(x, y, k);
                        wsum += v; sy += v * float(y); sx += v * float(x);
                    }
                }
                wsum = max(wsum, 1e-6);
                rx = sx / wsum; ry = sy / wsum;
            }
            bool dup = false;
            for (int j = 0; j < m; j++) {
                float dx = c_x[k * MAX_CAND + j] - rx;
                float dy = c_y[k * MAX_CAND + j] - ry;
                if (sqrt(dx * dx + dy * dy) < MIN_SEP) dup = true;
            }
            if (dup) continue;
            c_x[k * MAX_CAND + m] = rx;
            c_y[k * MAX_CAND + m] = ry;
            c_s[k * MAX_CAND + m] = ps[i];
            m++;
        }
        c_n[k] = m;
    }

    // \\u2500\\u2500 stage 2: eye-pair hypotheses \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    float h_score[25];
    int   h_kp[125];
    int nh = 0;
    float maxEye = float(u_w) * 0.45;

    for (int i = 0; i < c_n[0]; i++) {
        for (int j = 0; j < c_n[1]; j++) {
            float ax = c_x[i], ay = c_y[i];
            float bx = c_x[MAX_CAND + j], by = c_y[MAX_CAND + j];
            float evx = bx - ax, evy = by - ay;
            float len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > maxEye) continue;
            vec2 ex = vec2(evx / len, evy / len);
            vec2 ey = vec2(-ex.y, ex.x);

            float sc = c_s[i] + c_s[MAX_CAND + j];
            float resid = 0.0;
            int nMatch = 2, mouths = 0, nose = -1;
            int mo[2];
            mo[0] = -1; mo[1] = -1;

            for (int t = 0; t < 3; t++) {
                int kk = t + 2;
                float px = ax + len * (tmplU(t) * ex.x + tmplW(t) * ey.x);
                float py = ay + len * (tmplU(t) * ex.y + tmplW(t) * ey.y);
                int best = -1;
                float bestD = u_tol * len;
                for (int q = 0; q < c_n[kk]; q++) {
                    float dx = c_x[kk * MAX_CAND + q] - px;
                    float dy = c_y[kk * MAX_CAND + q] - py;
                    float d = sqrt(dx * dx + dy * dy);
                    if (d < bestD) { bestD = d; best = q; }
                }
                if (best < 0) continue;
                sc += c_s[kk * MAX_CAND + best];
                resid += bestD / len;
                nMatch++;
                if (t == 0) nose = best; else { mo[t - 1] = best; mouths++; }
            }
            if (nose < 0 || mouths < 1) continue;

            h_score[nh] = sc / float(nMatch) - LAMBDA * (resid / float(nMatch - 2));
            h_kp[nh * N_KP + 0] = i;
            h_kp[nh * N_KP + 1] = j;
            h_kp[nh * N_KP + 2] = nose;
            h_kp[nh * N_KP + 3] = mo[0];
            h_kp[nh * N_KP + 4] = mo[1];
            nh++;
        }
    }

    // \\u2500\\u2500 stage 3/4: greedy NMS \\u2192 the box for slot myFace \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
    bool used[25];
    for (int i = 0; i < N_KP * MAX_CAND; i++) used[i] = false;
    int outN = 0;

    for (int iter = 0; iter < 25; iter++) {
        if (outN >= u_max_faces) break;

        int best = -1;
        float bestS = -1e8;
        for (int q = 0; q < nh; q++) {
            if (h_score[q] > bestS) { bestS = h_score[q]; best = q; }
        }
        if (best < 0) break;
        h_score[best] = -1e9;

        bool clash = false;
        for (int t = 0; t < N_KP; t++) {
            int ci = h_kp[best * N_KP + t];
            if (ci < 0) continue;
            if (used[t * MAX_CAND + ci]) clash = true;
        }
        if (clash) continue;

        float x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, score = 1e9;
        for (int t = 0; t < N_KP; t++) {
            int ci = h_kp[best * N_KP + t];
            if (ci < 0) continue;
            int e = t * MAX_CAND + ci;
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        if (outN == myFace) {
            float halfPx = 0.5 * u_box_scale * max(x1 - x0, y1 - y0);
            float cx = ((x0 + x1) * 0.5 + 0.5) / float(u_w);
            float cy = ((y0 + y1) * 0.5 + 0.5) / float(u_h);
            fragColor = vec4(cx, cy, halfPx / float(u_w), score);
            return;
        }
        outN++;
    }

    fragColor = vec4(0.0);   // no face in this slot
}
\`;var $t=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",qa);if(t.c!==8)throw new Error(\`FaceBoxesFromHeatmaps: expected 8-ch heatmaps (5 real), got \${t.c}\`);if(a.maxFaces<1||a.maxFaces>6)throw new Error(\`FaceBoxesFromHeatmaps: maxFaces must be 1..6, got \${a.maxFaces}\`);let o=a.maxFaces;this.dispatch=[o,1];let s=this.makeTexture(null,o,1);this.output={h:1,w:o,c:4,texture:s,texW:o,texH:1},this.inputs=[t],this.samplers=[{name:"u_hm",texture:t.texture}],this.uniformInts={u_h:t.h,u_w:t.w,u_win:a.win,u_max_faces:o},this.uniformFloats={u_thresh:a.thresh,u_box_scale:a.boxScale,u_tol:a.tol},this.defaultSetup()}};var Ka=\`#version 300 es
// Auto-reframe state update \\u2192 1\\xD71\\xD78 tensor, i.e. a 2\\xD71 texture of vec4 groups:
//   x=0  (cx, cy, size, moving)          \\u2014 the view rect
//   x=1  (subjX, subjY, subjHs, valid)   \\u2014 the incumbent subject, for hysteresis
// See reframe_state.wgsl for the full commentary \\u2014 this mirrors it.
//
// A fragment shader writes ONE vec4, so both fragments redo the whole (tiny)
// computation and each emits its own group \\u2014 same shape as face_boxes.glsl.

precision highp float;
precision highp int;

uniform sampler2D u_box;    // 1\\xD7K \\u2014 (cx, cy, halfSide/W, score)
uniform sampler2D u_prev;   // 1\\xD71 \\u2014 previous state
uniform sampler2D u_cmd;    // 1\\xD71 \\u2014 .x = mode
uniform int   u_k;
uniform float u_zoom;
uniform float u_gravity;
uniform float u_margin;
uniform float u_deadband;
uniform float u_ease;
uniform float u_aspect;     // frame w/h

out vec4 fragColor;

const float MODE_HOLD  = 1.0;
const float MODE_SOLVE = 2.0;
const float SWITCH_RATIO     = 1.25;
const float TRACK_RADIUS_MIN = 0.1;

void main() {
    int group = int(gl_FragCoord.x);   // 0 = view rect, 1 = subject memory
    vec4 prev  = texelFetch(u_prev, ivec2(0, 0), 0);
    vec4 prevS = texelFetch(u_prev, ivec2(1, 0), 0);
    float mode = texelFetch(u_cmd, ivec2(0, 0), 0).x;

    // Challenger = largest live face.
    int chal = -1;
    float chalHs = 0.0;
    for (int i = 0; i < u_k; i++) {
        vec4 b = texelFetch(u_box, ivec2(i, 0), 0);
        if (b.w > 0.0 && b.z > chalHs) { chalHs = b.z; chal = i; }
    }
    if (chal < 0) {
        // Hold, and keep the subject memory \\u2014 a one-frame detection miss must not
        // hand the camera to someone else.
        fragColor = (group == 0) ? prev : prevS;
        return;
    }

    // Incumbent = the live face nearest where the subject was (slot indices are
    // not stable identities, so it's tracked by position).
    int inc = -1;
    float incD = 1e9;
    if (prevS.w > 0.5) {
        float radius = max(TRACK_RADIUS_MIN, prevS.z * 2.0);
        for (int i = 0; i < u_k; i++) {
            vec4 b = texelFetch(u_box, ivec2(i, 0), 0);
            if (b.w <= 0.0) continue;
            float d = length(vec2(b.x - prevS.x, b.y - prevS.y));
            if (d < radius && d < incD) { incD = d; inc = i; }
        }
    }

    int pick = chal;
    if (inc >= 0 && chalHs <= texelFetch(u_box, ivec2(inc, 0), 0).z * SWITCH_RATIO) pick = inc;
    vec4 subj = texelFetch(u_box, ivec2(pick, 0), 0);
    if (group == 1) { fragColor = vec4(subj.x, subj.y, subj.z, 1.0); return; }

    float halfX = subj.z;
    float halfY = subj.z * u_aspect;
    // Fallback = the full frame (no reframe) \\u2014 see reframe_state.wgsl.
    float wcx = 0.5, wcy = 0.5, ws = 1.0;
    for (int t = 0; t <= 25; t++) {
        float z = u_zoom + (1.0 - u_zoom) * (float(t) / 25.0);
        float s = 1.0 / z;
        float cx = clamp(0.5 + u_gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        float cy = clamp(0.5 + u_gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + halfX + u_margin <= s * 0.5 &&
            abs(subj.y - cy) + halfY + u_margin <= s * 0.5) {
            wcx = cx; wcy = cy; ws = s;
            break;
        }
    }
    if (prev.z <= 0.0 || mode == MODE_SOLVE) { fragColor = vec4(wcx, wcy, ws, 0.0); return; }
    if (mode == MODE_HOLD) { fragColor = prev; return; }

    float d = length(vec2(wcx - prev.x, wcy - prev.y)) + abs(ws - prev.z);
    float moving = prev.w;
    if (d > u_deadband) moving = 1.0;
    else if (d < u_deadband * 0.3) moving = 0.0;
    if (moving < 0.5) { fragColor = vec4(prev.xyz, 0.0); return; }

    fragColor = vec4(
        mix(prev.x, wcx, u_ease),
        mix(prev.y, wcy, u_ease),
        mix(prev.z, ws,  u_ease),
        1.0
    );
}
\`;var qt=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch",[2,1]);i(this,"shader",Ka);let n=this.makeTexture(null,2,1);this.output={h:1,w:1,c:8,texture:n,texW:2,texH:1},this.inputs=[t,a,o],this.samplers=[{name:"u_box",texture:t.texture},{name:"u_prev",texture:a.texture},{name:"u_cmd",texture:o.texture}],this.uniformInts={u_k:t.w*t.h},this.uniformFloats={u_zoom:s.zoom,u_gravity:s.gravity,u_margin:s.margin,u_deadband:s.deadband,u_ease:s.ease,u_aspect:s.aspect},this.defaultSetup()}};var Ya=\`#version 300 es
// Apply the reframe crop: sample \\\`src\\\` through the view rect. Same shape in and
// out. See reframe.wgsl for why this sits after the effect chain and touches
// only the foreground + alpha (never the background).
//
// rect = (cx, cy, size, moving), frame fractions; size \\u2264 0 \\u2192 identity.

precision highp float;
precision highp int;

uniform sampler2D u_src;
uniform sampler2D u_rect;   // 1\\xD71
uniform int u_h;
uniform int u_w;

out vec4 fragColor;

vec4 samp(int x, int y) {
    return texelFetch(u_src, ivec2(clamp(x, 0, u_w - 1), clamp(y, 0, u_h - 1)), 0);
}

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 r = texelFetch(u_rect, ivec2(0, 0), 0);
    float s = r.z, rcx = r.x, rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }

    float fx = (rcx - s * 0.5) + ((float(x) + 0.5) / float(u_w)) * s;
    float fy = (rcy - s * 0.5) + ((float(y) + 0.5) / float(u_h)) * s;
    // fraction \\u2192 texel index; an identity rect lands exactly on texel centres,
    // making the op a bit-exact copy.
    float sx = fx * float(u_w) - 0.5;
    float sy = fy * float(u_h) - 0.5;

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    vec4 bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    fragColor = mix(top, bot, ty);
}
\`;var Kt=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Ya);let o=this.makeTexture(null,t.w,t.h);this.output={h:t.h,w:t.w,c:4,texture:o,texW:t.w,texH:t.h},this.inputs=[t,a],this.samplers=[{name:"u_src",texture:t.texture},{name:"u_rect",texture:a.texture}],this.uniformInts={u_h:t.h,u_w:t.w},this.defaultSetup(),this.dispatch=[t.w,t.h]}};var Qa=\`#version 300 es
// Box-driven square crop + bilinear resample + ((rgb - mean)/std) normalize.
// Reads the box tensor (face_box output: cx, cy, halfSide, score in frame
// fractions; halfSide as a fraction of frame WIDTH) and emits the landmark
// model's input, .w = 0. Sampling mirrors landmark training's warpAffine:
// src = center + (u - out/2) \\xB7 side/out.
//
// frame texture: (w, h) \\u2014 4-ch, 1 group. box texture: 1\\xD71.

precision highp float;
precision highp int;

uniform sampler2D u_frame;
uniform sampler2D u_box;
uniform int u_in_h;
uniform int u_in_w;
uniform int u_out_h;
uniform int u_out_w;
uniform int u_slot;   // box-tensor slot (multi-face); 0 for the single-face path
uniform float u_mean_r;
uniform float u_mean_g;
uniform float u_mean_b;
uniform float u_std_r;
uniform float u_std_g;
uniform float u_std_b;

out vec4 fragColor;

vec4 samp(int x, int y) {
    return texelFetch(u_frame, ivec2(clamp(x, 0, u_in_w - 1), clamp(y, 0, u_in_h - 1)), 0);
}

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 box = texelFetch(u_box, ivec2(u_slot, 0), 0);
    float cx   = box.x * float(u_in_w);
    float cy   = box.y * float(u_in_h);
    float side = 2.0 * box.z * float(u_in_w);

    float sx = clamp(cx + (float(x) - float(u_out_w) * 0.5) * side / float(u_out_w), 0.0, float(u_in_w - 1));
    float sy = clamp(cy + (float(y) - float(u_out_h) * 0.5) * side / float(u_out_h), 0.0, float(u_in_h - 1));

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    vec4 bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    vec4 v = mix(top, bot, ty);

    vec3 mean = vec3(u_mean_r, u_mean_g, u_mean_b);
    vec3 std  = vec3(u_std_r, u_std_g, u_std_b);
    fragColor = vec4((v.rgb - mean) / std, 0.0);
}
\`;var Yt=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Qa);let s=o.slot??0;if(s>=a.w*a.h)throw new Error(\`CropResample: slot \${s} out of range for a \${a.h}\\xD7\${a.w} box tensor\`);let n=this.makeTexture(null,o.outW,o.outH);this.output={h:o.outH,w:o.outW,c:4,texture:n,texW:o.outW,texH:o.outH},this.inputs=[t,a],this.samplers=[{name:"u_frame",texture:t.texture},{name:"u_box",texture:a.texture}],this.uniformInts={u_in_h:t.h,u_in_w:t.w,u_out_h:o.outH,u_out_w:o.outW,u_slot:s},this.uniformFloats={u_mean_r:o.mean[0],u_mean_g:o.mean[1],u_mean_b:o.mean[2],u_std_r:o.std[0],u_std_g:o.std[1],u_std_b:o.std[2]},this.defaultSetup(),this.dispatch=[o.outW,o.outH]}};var Qt=\`#version 300 es
// Passthrough "compositor": writes the image directly to the canvas
// (default framebuffer). No alpha math, no background. Used by RenderOp
// when the renderer is in disabled state.
//
// Caller invariants:
//   - canvas (viewport) === image h \\xD7 w (no resampling here)

precision highp float;

uniform sampler2D u_image;   // image as NHWC vec4 (RGBA)

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left; tensor textures are stored
    // top-down. Flip y so the displayed image is upright. (Matches what the
    // existing composite_solid.glsl does.)
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    vec3  rgb = texelFetch(u_image, px, 0).rgb;
    fragColor = vec4(rgb, 1.0);
}
\`;var xu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,yu=\`#version 300 es
precision highp float;
uniform sampler2D u_lm;
uniform sampler2D u_box;
uniform int u_slot;
uniform float u_thresh;
uniform float u_point_size;
uniform float u_canvas_w;
uniform float u_canvas_h;

void main() {
    int i = gl_VertexID;
    vec4 box = texelFetch(u_box, ivec2(u_slot, 0), 0);
    if (box.w < u_thresh) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // clipped away
        gl_PointSize = 0.0;
        return;
    }
    vec4 g = texelFetch(u_lm, ivec2(i / 2, 0), 0);
    float lx = g[(i % 2) * 2];
    float ly = g[(i % 2) * 2 + 1];

    float hsx = box.z;
    float hsy = box.z * u_canvas_w / u_canvas_h;
    float px = (box.x - hsx) + lx * 2.0 * hsx;
    float py = (box.y - hsy) + ly * 2.0 * hsy;

    gl_Position = vec4(px * 2.0 - 1.0, 1.0 - 2.0 * py, 0.0, 1.0);
    gl_PointSize = u_point_size;
}\`,wu=\`#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 1.0); }\`;function Ja(u,e,r,t){let a=u.createShader(u.VERTEX_SHADER);if(u.shaderSource(a,e),u.compileShader(a),!u.getShaderParameter(a,u.COMPILE_STATUS))throw new Error(\`\${t} vert compile error: \${u.getShaderInfoLog(a)}\`);let o=u.createShader(u.FRAGMENT_SHADER);if(u.shaderSource(o,r),u.compileShader(o),!u.getShaderParameter(o,u.COMPILE_STATUS))throw new Error(\`\${t} frag compile error: \${u.getShaderInfoLog(o)}\`);let s=u.createProgram();if(u.attachShader(s,a),u.attachShader(s,o),u.linkProgram(s),!u.getProgramParameter(s,u.LINK_STATUS))throw new Error(\`\${t} link error: \${u.getProgramInfoLog(s)}\`);return s}var Jt=class{constructor(e,r,t,a,o){i(this,"backend",e);i(this,"imgProgram");i(this,"ptsProgram");i(this,"imageTex");i(this,"lmTex");i(this,"boxTex");i(this,"params");i(this,"canvasW");i(this,"canvasH");i(this,"slot");if(t.c<o.count*2)throw new Error(\`LandmarkOverlay: landmarks tensor holds \${t.c/2} points < count \${o.count}\`);if(this.slot=o.slot??0,this.slot>=a.w*a.h)throw new Error(\`LandmarkOverlay: slot \${this.slot} out of range for a \${a.h}\\xD7\${a.w} box tensor\`);this.imageTex=r.texture,this.lmTex=t.texture,this.boxTex=a.texture,this.params=o,this.canvasW=r.w,this.canvasH=r.h;let s=e.gl;this.imgProgram=Ja(s,xu,Qt,"landmark_overlay img"),this.ptsProgram=Ja(s,yu,wu,"landmark_overlay pts")}run(){let e=this.backend.gl;this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),(this.params.drawImage??!0)&&(e.useProgram(this.imgProgram),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.imgProgram,"u_image"),0),e.drawArrays(e.TRIANGLES,0,6)),e.useProgram(this.ptsProgram),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.lmTex),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_lm"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.boxTex),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_box"),1),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_slot"),this.slot),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_thresh"),this.params.thresh),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_point_size"),this.params.pointSize),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_canvas_w"),this.canvasW),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_canvas_h"),this.canvasH),e.uniform3f(e.getUniformLocation(this.ptsProgram,"u_color"),this.params.color[0],this.params.color[1],this.params.color[2]),e.drawArrays(e.POINTS,0,this.params.count)}};var te=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,Rr=\`
uniform sampler2D u_lm;
uniform sampler2D u_box;
uniform float u_thresh;
uniform float u_canvas_w;
uniform float u_canvas_h;
uniform int u_grid;

vec3 lmFrame(int i, int face) {
    vec4 box = texelFetch(u_box, ivec2(face, 0), 0);
    int gi = face * 478 + i;
    vec4 g = texelFetch(u_lm, ivec2(gi / 2, 0), 0);
    float lx = g[(gi % 2) * 2];
    float ly = g[(gi % 2) * 2 + 1];
    float hsx = box.z;
    float hsy = box.z * u_canvas_w / u_canvas_h;
    return vec3((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face 'face' owns tile (face % grid, face / grid). grid=1 (K=1) -> the whole
// atlas, i.e. the single-face layout unchanged.
vec2 tileUv(vec2 uv, int face) {
    float g = float(u_grid);
    return (uv + vec2(float(face % u_grid), float(face / u_grid))) / g;
}\`,Za=\`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
\${Rr}
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_src = l.xy;
    gl_Position = vec4(tileUv(a_uv, gl_InstanceID) * 2.0 - 1.0, 0.0, 1.0);
}\`,ei=\`
uniform sampler2D u_frame;
uniform float u_frame_w;
uniform float u_frame_h;

vec3 frameAt(int x, int y) {
    return texelFetch(u_frame, ivec2(clamp(x, 0, int(u_frame_w) - 1), clamp(y, 0, int(u_frame_h) - 1)), 0).rgb;
}
vec3 frameBilinear(vec2 f) {
    float sx = clamp(f.x * u_frame_w - 0.5, 0.0, u_frame_w - 1.0);
    float sy = clamp(f.y * u_frame_h - 0.5, 0.0, u_frame_h - 1.0);
    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);
    vec3 top = mix(frameAt(x0, y0),     frameAt(x0 + 1, y0),     tx);
    vec3 bot = mix(frameAt(x0, y0 + 1), frameAt(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}\`,ti=\`#version 300 es
precision highp float;
precision highp int;
in vec2 v_src;
\${ei}
out vec4 fragColor;
void main() { fragColor = vec4(frameBilinear(v_src), 1.0); }\`,ri=\`#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform float u_sigma;
uniform int u_grid;
// The tile containing 'uv', as (lo.xy, hi.zw) - filter taps clamp to it so one
// face's skin can't bleed into a neighbour's tile.
vec4 tileBounds(vec2 uv) {
    float g = float(u_grid);
    vec2 t = floor(clamp(uv, vec2(0.0), vec2(0.99999)) * g);
    return vec4(t / g, (t + vec2(1.0)) / g);
}
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec4 tb = tileBounds(uv);
    float ht = 0.5 / 512.0;
    vec2 lo = tb.xy + ht, hi = tb.zw - ht;
    float s = max(u_sigma, 0.001);
    int R = int(clamp(ceil(s * 2.5), 1.0, 48.0));
    vec4 sum = vec4(0.0);
    float wsum = 0.0;
    for (int i = -48; i <= 48; i++) {
        if (i < -R || i > R) continue;
        float w = exp(-float(i * i) / (2.0 * s * s));
        sum += texture(u_tex, clamp(uv + u_dir * float(i), lo, hi)) * w;
        wsum += w;
    }
    fragColor = sum / wsum;
}\`,oi=\`#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform sampler2D u_low;
uniform float u_detail;
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec4 a  = texture(u_atlas, uv);
    vec4 lo = texture(u_low, uv);
    fragColor = clamp(lo + (a - lo) * u_detail, 0.0, 1.0);
}\`,ai=\`#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_sigma;
uniform int u_grid;
vec4 tileBounds(vec2 uv) {
    float g = float(u_grid);
    vec2 t = floor(clamp(uv, vec2(0.0), vec2(0.99999)) * g);
    return vec4(t / g, (t + vec2(1.0)) / g);
}
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec2 texel = vec2(1.0 / 512.0);
    vec4 tb = tileBounds(uv);
    vec2 blo = tb.xy + texel * 0.5, bhi = tb.zw - texel * 0.5;
    float ss = max(u_sigma, 0.001);
    int R = int(clamp(ceil(ss), 1.0, 12.0));
    float sr = 0.15;
    vec3 c = texture(u_tex, uv).rgb;
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int y = -12; y <= 12; y++) {
        if (y < -R || y > R) continue;
        for (int x = -12; x <= 12; x++) {
            if (x < -R || x > R) continue;
            vec3 sc = texture(u_tex, clamp(uv + texel * vec2(float(x), float(y)), blo, bhi)).rgb;
            float ws = exp(-float(x * x + y * y) / (2.0 * ss * ss));
            vec3 d = sc - c;
            float wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    fragColor = vec4(sum / wsum, 1.0);
}\`,ku=\`#version 300 es
precision highp float;
uniform sampler2D u_image;
out vec4 fragColor;
void main() {
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    fragColor = vec4(texelFetch(u_image, px, 0).rgb, 1.0);
}\`,Tu=\`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
\${Rr}
out vec2 v_uv;        // TILED atlas uv \\u2014 the atlas is per-face
out vec2 v_uv_mask;   // UNTILED canonical uv \\u2014 the weight mask is one shared asset
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_uv = tileUv(a_uv, gl_InstanceID);
    v_uv_mask = a_uv;
    v_src = l.xy;
    gl_Position = vec4(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
}\`,ii=\`#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
in vec2 v_uv_mask;
in vec2 v_src;
uniform sampler2D u_smoothed;
uniform sampler2D u_weight;
uniform float u_strength;
\${ei}
out vec4 fragColor;
void main() {
    vec3 orig = frameBilinear(v_src);
    vec3 sm   = texture(u_smoothed, v_uv).rgb;
    // v_uv_mask, not v_uv: the atlas is tiled per face, the weight mask is one
    // shared canonical asset. See face_touchup.wgsl fs_comp.
    float w   = texture(u_weight, v_uv_mask).r * u_strength;
    fragColor = vec4(mix(orig, sm, w), 1.0);
}\`;function j(u,e,r,t){let a=(s,n,p)=>{let c=u.createShader(s);if(u.shaderSource(c,n),u.compileShader(c),!u.getShaderParameter(c,u.COMPILE_STATUS))throw new Error(\`\${t} \${p} compile error: \${u.getShaderInfoLog(c)}\`);return c},o=u.createProgram();if(u.attachShader(o,a(u.VERTEX_SHADER,e,"vert")),u.attachShader(o,a(u.FRAGMENT_SHADER,r,"frag")),u.linkProgram(o),!u.getProgramParameter(o,u.LINK_STATUS))throw new Error(\`\${t} link error: \${u.getProgramInfoLog(o)}\`);return o}var Zt=class{constructor(e,r,t,a,o,s){i(this,"backend",e);i(this,"progs");i(this,"meshVao");i(this,"fbo");i(this,"atlas");i(this,"ping");i(this,"low");i(this,"smoothed");i(this,"weight");i(this,"frame");i(this,"lm");i(this,"box");i(this,"count");i(this,"params");i(this,"slots");i(this,"grid");i(this,"activeSlots");let n=e.gl;if(this.frame=r,this.lm=t,this.box=a,this.count=o.count,this.params=s,this.slots=s.slots??1,this.slots!==1&&this.slots!==4)throw new Error(\`FaceTouchup: slots must be 1 or 4, got \${this.slots}\`);if(this.grid=this.slots===4?2:1,this.activeSlots=this.slots,a.w*a.h<this.slots)throw new Error(\`FaceTouchup: slots \${this.slots} exceeds the \${a.h}\\xD7\${a.w} box tensor\`);if(t.c<this.slots*956)throw new Error(\`FaceTouchup: landmarks tensor holds \${t.c/956} faces < slots \${this.slots}\`);this.progs={unwrap:j(n,Za,ti,"touchup unwrap"),blur:j(n,te,ri,"touchup blur"),combine:j(n,te,oi,"touchup combine"),bilateral:j(n,te,ai,"touchup bilateral"),blit:j(n,te,ku,"touchup blit"),comp:j(n,Tu,ii,"touchup comp")},this.meshVao=n.createVertexArray(),n.bindVertexArray(this.meshVao);let p=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,p),n.bufferData(n.ARRAY_BUFFER,o.uv,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0);let c=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,c),n.bufferData(n.ARRAY_BUFFER,o.idx,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,1,n.FLOAT,!1,0,0),n.bindVertexArray(null);let l=d=>{let f=n.createTexture();return n.bindTexture(n.TEXTURE_2D,f),d?n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,n.RGBA,n.UNSIGNED_BYTE,d):n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,512,512,0,n.RGBA,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),f};this.atlas=l(null),this.ping=l(null),this.low=l(null),this.smoothed=l(null),this.weight=l(o.weightMask),this.fbo=n.createFramebuffer()}bindTex(e,r,t,a){let o=this.backend.gl;o.activeTexture(o.TEXTURE0+r),o.bindTexture(o.TEXTURE_2D,a),o.uniform1i(o.getUniformLocation(e,t),r)}lmUniforms(e){let r=this.backend.gl;this.bindTex(e,4,"u_lm",this.lm.texture),this.bindTex(e,5,"u_box",this.box.texture),r.uniform1f(r.getUniformLocation(e,"u_thresh"),this.params.thresh),r.uniform1f(r.getUniformLocation(e,"u_canvas_w"),this.frame.w),r.uniform1f(r.getUniformLocation(e,"u_canvas_h"),this.frame.h),r.uniform1i(r.getUniformLocation(e,"u_grid"),this.grid)}frameUniforms(e){let r=this.backend.gl;this.bindTex(e,0,"u_frame",this.frame.texture),r.uniform1f(r.getUniformLocation(e,"u_frame_w"),this.frame.w),r.uniform1f(r.getUniformLocation(e,"u_frame_h"),this.frame.h)}atlasPass(e,r){let t=this.backend.gl;t.bindFramebuffer(t.FRAMEBUFFER,this.fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,e,0),t.viewport(0,0,512,512),r()}run(){let e=this.backend.gl;if(this.atlasPass(this.atlas,()=>{e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.progs.unwrap),this.frameUniforms(this.progs.unwrap),this.lmUniforms(this.progs.unwrap),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null)}),(this.params.style??"freq-sep")==="bilateral")this.atlasPass(this.smoothed,()=>{e.useProgram(this.progs.bilateral),this.bindTex(this.progs.bilateral,0,"u_tex",this.atlas),e.uniform1f(e.getUniformLocation(this.progs.bilateral,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.bilateral,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6)});else{let r=(t,a,o,s)=>this.atlasPass(a,()=>{e.useProgram(this.progs.blur),this.bindTex(this.progs.blur,0,"u_tex",t),e.uniform2f(e.getUniformLocation(this.progs.blur,"u_dir"),o,s),e.uniform1f(e.getUniformLocation(this.progs.blur,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.blur,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6)});r(this.atlas,this.ping,1/512,0),r(this.ping,this.low,0,1/512),this.atlasPass(this.smoothed,()=>{e.useProgram(this.progs.combine),this.bindTex(this.progs.combine,0,"u_atlas",this.atlas),this.bindTex(this.progs.combine,1,"u_low",this.low),e.uniform1f(e.getUniformLocation(this.progs.combine,"u_detail"),this.params.detail),e.drawArrays(e.TRIANGLES,0,6)})}this.backend.bindDisplayFramebuffer(),e.viewport(0,0,this.frame.w,this.frame.h),e.useProgram(this.progs.blit),this.bindTex(this.progs.blit,0,"u_image",this.frame.texture),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6),e.useProgram(this.progs.comp),this.frameUniforms(this.progs.comp),this.lmUniforms(this.progs.comp),this.bindTex(this.progs.comp,1,"u_smoothed",this.smoothed),this.bindTex(this.progs.comp,2,"u_weight",this.weight),e.uniform1f(e.getUniformLocation(this.progs.comp,"u_strength"),this.params.strength),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null)}},Pu=\`#version 300 es
precision highp float;
uniform sampler2D u_image;
out vec4 fragColor;
void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    fragColor = vec4(texelFetch(u_image, px, 0).rgb, 1.0);
}\`,Cu=\`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
\${Rr}
out vec2 v_uv;        // TILED atlas uv \\u2014 the atlas is per-face
out vec2 v_uv_mask;   // UNTILED canonical uv \\u2014 the weight mask is one shared asset
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_uv = tileUv(a_uv, gl_InstanceID);
    v_uv_mask = a_uv;
    v_src = l.xy;
    gl_Position = vec4(l.x * 2.0 - 1.0, l.y * 2.0 - 1.0, 0.0, 1.0);
}\`,er=class{constructor(e,r,t,a,o,s){i(this,"backend",e);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"progs");i(this,"meshVao");i(this,"fbo");i(this,"atlas");i(this,"ping");i(this,"low");i(this,"smoothed");i(this,"weightTex");i(this,"frame");i(this,"lm");i(this,"box");i(this,"count");i(this,"params");i(this,"slots");i(this,"grid");i(this,"activeSlots");let n=e.gl;if(this.inputs=[r,t,a],this.frame=r,this.lm=t,this.box=a,this.count=o.count,this.params=s,this.slots=s.slots??1,this.slots!==1&&this.slots!==4)throw new Error(\`FaceTouchup: slots must be 1 or 4, got \${this.slots}\`);if(this.grid=this.slots===4?2:1,this.activeSlots=this.slots,a.w*a.h<this.slots)throw new Error(\`FaceTouchup: slots \${this.slots} exceeds the \${a.h}\\xD7\${a.w} box tensor\`);if(t.c<this.slots*956)throw new Error(\`FaceTouchup: landmarks tensor holds \${t.c/956} faces < slots \${this.slots}\`);this.output=e.tensor(r.h,r.w,4),this.progs={unwrap:j(n,Za,ti,"touchup-stage unwrap"),blur:j(n,te,ri,"touchup-stage blur"),combine:j(n,te,oi,"touchup-stage combine"),bilateral:j(n,te,ai,"touchup-stage bilateral"),blitT:j(n,te,Pu,"touchup-stage blitT"),compT:j(n,Cu,ii,"touchup-stage compT")},this.meshVao=n.createVertexArray(),n.bindVertexArray(this.meshVao);let p=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,p),n.bufferData(n.ARRAY_BUFFER,o.uv,n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0);let c=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,c),n.bufferData(n.ARRAY_BUFFER,o.idx,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,1,n.FLOAT,!1,0,0),n.bindVertexArray(null);let l=d=>{let f=n.createTexture();return n.bindTexture(n.TEXTURE_2D,f),d?n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,n.RGBA,n.UNSIGNED_BYTE,d):n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,512,512,0,n.RGBA,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),f};this.atlas=l(null),this.ping=l(null),this.low=l(null),this.smoothed=l(null),this.weightTex=l(o.weightMask),this.fbo=n.createFramebuffer()}bindTex(e,r,t,a){let o=this.backend.gl;o.activeTexture(o.TEXTURE0+r),o.bindTexture(o.TEXTURE_2D,a),o.uniform1i(o.getUniformLocation(e,t),r)}lmUniforms(e){let r=this.backend.gl;this.bindTex(e,4,"u_lm",this.lm.texture),this.bindTex(e,5,"u_box",this.box.texture),r.uniform1f(r.getUniformLocation(e,"u_thresh"),this.params.thresh),r.uniform1f(r.getUniformLocation(e,"u_canvas_w"),this.frame.w),r.uniform1f(r.getUniformLocation(e,"u_canvas_h"),this.frame.h),r.uniform1i(r.getUniformLocation(e,"u_grid"),this.grid)}frameUniforms(e){let r=this.backend.gl;this.bindTex(e,0,"u_frame",this.frame.texture),r.uniform1f(r.getUniformLocation(e,"u_frame_w"),this.frame.w),r.uniform1f(r.getUniformLocation(e,"u_frame_h"),this.frame.h)}pass(e,r,t,a){let o=this.backend.gl;o.bindFramebuffer(o.FRAMEBUFFER,this.fbo),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,e,0),o.viewport(0,0,r,t),a()}setActiveSlots(e){this.activeSlots=Math.max(0,Math.min(e,this.slots))}run(){let e=this.backend.gl;if(this.pass(this.atlas,512,512,()=>{e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.progs.unwrap),this.frameUniforms(this.progs.unwrap),this.lmUniforms(this.progs.unwrap),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null)}),(this.params.style??"freq-sep")==="bilateral")this.pass(this.smoothed,512,512,()=>{e.useProgram(this.progs.bilateral),this.bindTex(this.progs.bilateral,0,"u_tex",this.atlas),e.uniform1f(e.getUniformLocation(this.progs.bilateral,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.bilateral,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6)});else{let r=(t,a,o,s)=>this.pass(a,512,512,()=>{e.useProgram(this.progs.blur),this.bindTex(this.progs.blur,0,"u_tex",t),e.uniform2f(e.getUniformLocation(this.progs.blur,"u_dir"),o,s),e.uniform1f(e.getUniformLocation(this.progs.blur,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.blur,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6)});r(this.atlas,this.ping,1/512,0),r(this.ping,this.low,0,1/512),this.pass(this.smoothed,512,512,()=>{e.useProgram(this.progs.combine),this.bindTex(this.progs.combine,0,"u_atlas",this.atlas),this.bindTex(this.progs.combine,1,"u_low",this.low),e.uniform1f(e.getUniformLocation(this.progs.combine,"u_detail"),this.params.detail),e.drawArrays(e.TRIANGLES,0,6)})}this.pass(this.output.texture,this.frame.w,this.frame.h,()=>{e.useProgram(this.progs.blitT),this.bindTex(this.progs.blitT,0,"u_image",this.frame.texture),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6),e.useProgram(this.progs.compT),this.frameUniforms(this.progs.compT),this.lmUniforms(this.progs.compT),this.bindTex(this.progs.compT,1,"u_smoothed",this.smoothed),this.bindTex(this.progs.compT,2,"u_weight",this.weightTex),e.uniform1f(e.getUniformLocation(this.progs.compT,"u_strength"),this.params.strength),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null)})}};var si=\`#version 300 es
// Flow-gated temporal stabilizer. Per pixel:
//   env = max(|flow.xy|, release\\xB7envPrev.y)   peak-hold
//   g   = max(clamp((env - tLo)/(tHi - tLo), 0, 1), leak)
//   out = vec4((g\\xB7pred + (1-g)\\xB7ref).x, env, 0, 0)

precision highp float;
precision highp int;

uniform sampler2D u_flow;
uniform sampler2D u_pred;
uniform sampler2D u_ref;
uniform sampler2D u_env_prev;
uniform int   u_w;
uniform int   u_h;
uniform float u_t_lo;
uniform float u_t_hi;
uniform float u_leak;
uniform float u_release;
uniform float u_t_div;
uniform float u_div_scale;
uniform int   u_step_x;
uniform int   u_step_y;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float mag     = length(texelFetch(u_flow, ivec2(x, y), 0).xy);
    float envPrev = texelFetch(u_env_prev, ivec2(x, y), 0).y;
    float env     = max(mag, u_release * envPrev);

    // Flow divergence over a \\xB1step finite-difference (clamped to the edges).
    int xr = min(x + u_step_x, u_w - 1);
    int xl = max(x - u_step_x, 0);
    int yd = min(y + u_step_y, u_h - 1);
    int yu = max(y - u_step_y, 0);
    float dfx = texelFetch(u_flow, ivec2(xr, y), 0).x - texelFetch(u_flow, ivec2(xl, y), 0).x;
    float dfy = texelFetch(u_flow, ivec2(x, yd), 0).y - texelFetch(u_flow, ivec2(x, yu), 0).y;
    float divg = abs(dfx + dfy);

    float gMag = clamp((env - u_t_lo) / max(u_t_hi - u_t_lo, 1e-3), 0.0, 1.0);
    float gDiv = clamp((divg - u_t_div) / max(u_div_scale, 1e-3), 0.0, 1.0);
    float g = max(max(gMag, gDiv), u_leak);

    float pred = texelFetch(u_pred, ivec2(x, y), 0).x;
    float refv = texelFetch(u_ref,  ivec2(x, y), 0).x;
    float stab = g * pred + (1.0 - g) * refv;

    fragColor = vec4(stab, env, 0.0, 0.0);
}
\`;var tr=class extends h{constructor(r,t,a,o,s,n){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",si);let p=t.w,c=t.h,l=this.makeTexture(null,p,c);this.output={h:c,w:p,c:4,texture:l,texW:p,texH:c},this.inputs=[t,a,o,s],this.samplers=[{name:"u_flow",texture:t.texture},{name:"u_pred",texture:a.texture},{name:"u_ref",texture:o.texture},{name:"u_env_prev",texture:s.texture}],this.uniformInts={u_w:p,u_h:c,u_step_x:n.stepX,u_step_y:n.stepY},this.uniformFloats={u_t_lo:n.tLo,u_t_hi:n.tHi,u_leak:n.leak,u_release:n.release,u_t_div:n.tDiv,u_div_scale:n.divScale},this.defaultSetup(),this.dispatch=[p,c]}};var ni=\`#version 300 es
// Bilinear upsample (arbitrary scale) \\u2014 align_corners=False.
//
// Hardware texture filtering can't be used: adjacent texels in x belong to
// different channel groups, not spatial neighbours. Manual 4-tap blend.
//
// Input:  (in_W  * c_groups, in_H)
// Output: (out_W * c_groups, out_H)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 v00 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y0), 0);
    vec4 v10 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y0), 0);
    vec4 v01 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y1), 0);
    vec4 v11 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y1), 0);

    fragColor = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
}
\`;var rr=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",ni);let o=t.c/4,s=a.outW*o,n=this.makeTexture(null,s,a.outH);this.output={h:a.outH,w:a.outW,c:t.c,texture:n,texW:s,texH:a.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:a.outW,u_out_h:a.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[s,a.outH]}};var ui=\`#version 300 es
// Top-left crop: the output viewport is smaller than the input texture, so reading
// the same fragment coord yields the top-left subregion (channel groups packed in
// the x axis line up because group count is unchanged).

precision highp float;
precision highp int;

uniform sampler2D u_input;
out vec4 fragColor;

void main() {
    fragColor = texelFetch(u_input, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0);
}
\`;var or=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",ui);let o=t.c/4,s=a.outW*o,n=this.makeTexture(null,s,a.outH);this.output={h:a.outH,w:a.outW,c:t.c,texture:n,texW:s,texH:a.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.defaultSetup(),this.dispatch=[s,a.outH]}};var pi=\`#version 300 es
// Bicubic upsample (arbitrary scale) \\u2014 Keys cubic, a=-0.75 (PyTorch default
// for mode='bicubic', align_corners=False).
//
// Direct 2D, 4\\xD74 = 16 taps per output pixel. Hardware texture filtering
// can't be used (NHWC vec4 layout means adjacent texels in x belong to
// different channel groups, not spatial neighbours).

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

const float A = -0.75;

float wcubic(float d) {
    float ad = abs(d);
    if (ad <= 1.0) return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0;
    if (ad <  2.0) return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A;
    return 0.0;
}

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float src_x = (float(x_out) + 0.5) * float(u_in_w) / float(u_out_w) - 0.5;
    float src_y = (float(y_out) + 0.5) * float(u_in_h) / float(u_out_h) - 0.5;

    int   x0 = int(floor(src_x));
    int   y0 = int(floor(src_y));
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    // Weights for offsets {-1, 0, 1, 2} from x0/y0.
    float wx[4];
    float wy[4];
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx);       wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy);       wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    vec4 acc = vec4(0.0);
    for (int j = 0; j < 4; j++) {
        int sy = clamp(y0 + j - 1, 0, u_in_h - 1);
        for (int i = 0; i < 4; i++) {
            int sx = clamp(x0 + i - 1, 0, u_in_w - 1);
            vec4 v = texelFetch(u_input, ivec2(sx * u_c_groups + c_group, sy), 0);
            acc += (wx[i] * wy[j]) * v;
        }
    }
    fragColor = acc;
}
\`;var ar=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",pi);let o=t.c/4,s=a.outW*o,n=this.makeTexture(null,s,a.outH);this.output={h:a.outH,w:a.outW,c:t.c,texture:n,texW:s,texH:a.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:a.outW,u_out_h:a.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[s,a.outH]}};var ci=\`#version 300 es
// Channel concat \\u2014 concatenates two NHWC textures along the channel dimension.
// Both inputs must share the same spatial dimensions (W, H). Channel counts are
// multiples of 4 so each "group" is one vec4 texel.
//
// Input  A: (W * a_c_groups, H)
// Input  B: (W * b_c_groups, H)
// Output:   (W * (a_c_groups + b_c_groups), H)

precision highp float;
precision highp int;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;
uniform int u_a_c_groups;
uniform int u_b_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc       = ivec2(gl_FragCoord.xy);
    int out_groups = u_a_c_groups + u_b_c_groups;
    int x_spatial  = fc.x / out_groups;
    int c_out      = fc.x - x_spatial * out_groups;
    int y          = fc.y;

    if (c_out < u_a_c_groups) {
        fragColor = texelFetch(u_input_a, ivec2(x_spatial * u_a_c_groups + c_out, y), 0);
    } else {
        int c_b = c_out - u_a_c_groups;
        fragColor = texelFetch(u_input_b, ivec2(x_spatial * u_b_c_groups + c_b, y), 0);
    }
}
\`;var ir=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",ci);let o=t.c/4,s=a.c/4,n=o+s,p=t.c+a.c,c=t.w*n,l=this.makeTexture(null,c,t.h);this.output={h:t.h,w:t.w,c:p,texture:l,texW:c,texH:t.h},this.inputs=[t,a],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:a.texture}],this.uniformInts={u_a_c_groups:o,u_b_c_groups:s},this.defaultSetup(),this.dispatch=[c,t.h]}};var li=\`#version 300 es
// Bilinear upsample + sigmoid fused \\u2014 sigmoid applied at write time, no intermediate buffer.
// See bilinear_upsample.glsl for the manual 4-tap blend rationale.
//
// Input:  (in_W  * c_groups, in_H)
// Output: (out_W * c_groups, out_H)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 v00 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y0), 0);
    vec4 v10 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y0), 0);
    vec4 v01 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y1), 0);
    vec4 v11 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y1), 0);

    vec4 result = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
    fragColor = 1.0 / (1.0 + exp(-result));
}
\`;var sr=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",li);let o=t.c/4,s=a.outW*o,n=this.makeTexture(null,s,a.outH);this.output={h:a.outH,w:a.outW,c:t.c,texture:n,texW:s,texH:a.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:a.outW,u_out_h:a.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[s,a.outH]}};var di=\`#version 300 es
// Bilinear upsample (input_a) + channel concat (with input_b) fused.
// input_a is the decoder tensor at small spatial res (in_h \\xD7 in_w), bilinearly resized to (out_h \\xD7 out_w).
// input_b is the encoder skip feature already at output resolution.
// Output channels [0..a_groups-1] come from upsampled input_a.
// Output channels [a_groups..out_groups-1] come from input_b (passthrough).

precision highp float;
precision highp int;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_a_c_groups;
uniform int u_b_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc       = ivec2(gl_FragCoord.xy);
    int out_groups = u_a_c_groups + u_b_c_groups;
    int x_out      = fc.x / out_groups;
    int c_out      = fc.x - x_out * out_groups;
    int y_out      = fc.y;

    if (c_out < u_a_c_groups) {
        // Bilinear sample from input_a at (x_out, y_out) for channel group c_out.
        float scale_x = float(u_in_w) / float(u_out_w);
        float scale_y = float(u_in_h) / float(u_out_h);
        float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
        float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

        int x0 = int(floor(src_x));
        int y0 = int(floor(src_y));
        int x1 = x0 + 1;
        int y1 = y0 + 1;
        float fx = src_x - float(x0);
        float fy = src_y - float(y0);

        x0 = clamp(x0, 0, u_in_w - 1);
        y0 = clamp(y0, 0, u_in_h - 1);
        x1 = clamp(x1, 0, u_in_w - 1);
        y1 = clamp(y1, 0, u_in_h - 1);

        vec4 v00 = texelFetch(u_input_a, ivec2(x0 * u_a_c_groups + c_out, y0), 0);
        vec4 v10 = texelFetch(u_input_a, ivec2(x1 * u_a_c_groups + c_out, y0), 0);
        vec4 v01 = texelFetch(u_input_a, ivec2(x0 * u_a_c_groups + c_out, y1), 0);
        vec4 v11 = texelFetch(u_input_a, ivec2(x1 * u_a_c_groups + c_out, y1), 0);

        fragColor = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
    } else {
        int c_b = c_out - u_a_c_groups;
        fragColor = texelFetch(u_input_b, ivec2(x_out * u_b_c_groups + c_b, y_out), 0);
    }
}
\`;var nr=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",di);let s=t.c/4,n=a.c/4,p=s+n,c=t.c+a.c,l=o.outW*p,d=this.makeTexture(null,l,o.outH);this.output={h:o.outH,w:o.outW,c,texture:d,texW:l,texH:o.outH},this.inputs=[t,a],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:a.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:o.outW,u_out_h:o.outH,u_a_c_groups:s,u_b_c_groups:n},this.defaultSetup(),this.dispatch=[l,o.outH]}};var fi=\`#version 300 es
// Bilinear upsample + 1\\xD71 pointwise conv fused.
// For each output pixel + out group, bilinearly samples each in_group from input,
// applies the 1\\xD71 conv weight, and writes the activated result.
//
// Input:   (in_W  * in_groups,  in_H)
// Output:  (out_W * out_groups, out_H)
// Weights: (in_groups * 4, out_groups)  (K=1, so kernel-row dimension collapses)
//          mat4[col][row] = weight(in_channel=col, out_channel=row)
// Bias:    (out_groups, 1)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx_w = src_x - float(x0);
    float fy_w = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int i = 0; i < u_in_c_groups; i++) {
        vec4 v00 = texelFetch(u_input, ivec2(x0 * u_in_c_groups + i, y0), 0);
        vec4 v10 = texelFetch(u_input, ivec2(x1 * u_in_c_groups + i, y0), 0);
        vec4 v01 = texelFetch(u_input, ivec2(x0 * u_in_c_groups + i, y1), 0);
        vec4 v11 = texelFetch(u_input, ivec2(x1 * u_in_c_groups + i, y1), 0);

        vec4 sampled = mix(mix(v00, v10, fx_w), mix(v01, v11, fx_w), fy_w);

        int base = i * 4;
        mat4 w = mat4(
            texelFetch(u_weights, ivec2(base,     o_group), 0),
            texelFetch(u_weights, ivec2(base + 1, o_group), 0),
            texelFetch(u_weights, ivec2(base + 2, o_group), 0),
            texelFetch(u_weights, ivec2(base + 3, o_group), 0)
        );
        result += w * sampled;
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));

    fragColor = result;
}
\`;var ur=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",fi);let s=t.c/4,n=o.outChannels/4,p=m(a.weights),c=m(a.bias),l=this.makeTexture(p,s*4,n),d=this.makeTexture(c,n,1),f=o.outW*n,x=this.makeTexture(null,f,o.outH);this.output={h:o.outH,w:o.outW,c:o.outChannels,texture:x,texW:f,texH:o.outH},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:l},{name:"u_bias",texture:d}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:o.outW,u_out_h:o.outH,u_in_c_groups:s,u_out_c_groups:n,u_activation:o.activation==="relu6"?1:0},this.defaultSetup(),this.dispatch=[f,o.outH]}};var mi=\`#version 300 es
// Conv2d + skip add fused \\u2014 identical to conv2d.glsl with a skip texture added at write time.
// See conv2d.glsl for tensor/weight layout details.

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_skip;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));

    fragColor = result + texelFetch(u_skip, ivec2(fx, fy), 0);
}
\`;var pr=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",mi);let n=G(t.h,s.kernel,s.stride,s.padding),p=G(t.w,s.kernel,s.stride,s.padding),c=t.c/4,l=s.outChannels/4,d=U(s.padding,t.h,n,s.kernel,s.stride),f=U(s.padding,t.w,p,s.kernel,s.stride),x=m(o.weights),_=m(o.bias),b=this.makeTexture(x,c*4,s.kernel*s.kernel*l),v=this.makeTexture(_,l,1),y=p*l,k=this.makeTexture(null,y,n);this.output={h:n,w:p,c:s.outChannels,texture:k,texW:y,texH:n},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_skip",texture:a.texture},{name:"u_weights",texture:b},{name:"u_bias",texture:v}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:c,u_out_c_groups:l,u_kernel_h:s.kernel,u_kernel_w:s.kernel,u_stride:s.stride,u_pad_top:d,u_pad_left:f,u_activation:s.activation==="relu6"?1:0},this.defaultSetup(),this.dispatch=[y,n]}};var hi=\`#version 300 es
// proj_residual: bespoke 1\\xD71 conv (no activation) + residual add, fused.
// Specializes conv2d_add to kernel=1 / stride=1 / pad=0 / no activation. Both
// inputs share the same spatial resolution. See conv2d.glsl for the weight
// texture layout (here K=1, so the weight texture is (inGroups*4, outGroups)).

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_skip;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_c_groups;
uniform int u_out_c_groups;

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int i = 0; i < u_in_c_groups; i++) {
        vec4 in_val = texelFetch(u_input, ivec2(x_out * u_in_c_groups + i, fy), 0);

        int base = i * 4;
        mat4 w = mat4(
            texelFetch(u_weights, ivec2(base,     o_group), 0),
            texelFetch(u_weights, ivec2(base + 1, o_group), 0),
            texelFetch(u_weights, ivec2(base + 2, o_group), 0),
            texelFetch(u_weights, ivec2(base + 3, o_group), 0)
        );
        result += w * in_val;
    }

    fragColor = result + texelFetch(u_skip, ivec2(fx, fy), 0);
}
\`;var cr=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",hi);let n=t.c/4,p=s.outChannels/4,c=m(o.weights),l=m(o.bias),d=this.makeTexture(c,n*4,p),f=this.makeTexture(l,p,1),x=t.w*p,_=this.makeTexture(null,x,t.h);this.output={h:t.h,w:t.w,c:s.outChannels,texture:_,texW:x,texH:t.h},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_skip",texture:a.texture},{name:"u_weights",texture:d},{name:"u_bias",texture:f}],this.uniformInts={u_in_c_groups:n,u_out_c_groups:p},this.defaultSetup(),this.dispatch=[x,t.h]}};var gi=\`#version 300 es
// concat_conv2d: fuses [concat(a, b) \\u2192 conv 3\\xD73 (pad 1) \\u2192 relu6] into one pass.
// Both inputs already at output resolution. Weight cols [0, a_groups) read a,
// [a_groups, I) read b. Weight texture layout matches conv2d.glsl
// ((in_groups*4, 9*out_groups), in_groups = a_groups + b_groups).

precision highp float;
precision highp int;

uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_w;
uniform int u_h;
uniform int u_a_groups;
uniform int u_b_groups;
uniform int u_out_c_groups;

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int o_group = fx - x_out * u_out_c_groups;
    int A = u_a_groups;
    int B = u_b_groups;
    int I = A + B;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int in_y = fy    + ky - 1;
            int in_x = x_out + kx - 1;
            if (in_x < 0 || in_y < 0 || in_x >= u_w || in_y >= u_h) continue;

            int z     = ky * 3 + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < I; i++) {
                vec4 in_val = (i < A)
                    ? texelFetch(u_a, ivec2(in_x * A + i,       in_y), 0)
                    : texelFetch(u_b, ivec2(in_x * B + (i - A), in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    fragColor = clamp(result, 0.0, 6.0);
}
\`;var lr=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",gi);let n=t.c/4,p=a.c/4,c=n+p,l=s.outChannels/4,d=m(o.weights),f=m(o.bias),x=this.makeTexture(d,c*4,9*l),_=this.makeTexture(f,l,1),b=t.w*l,v=this.makeTexture(null,b,t.h);this.output={h:t.h,w:t.w,c:s.outChannels,texture:v,texW:b,texH:t.h},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_a",texture:t.texture},{name:"u_b",texture:a.texture},{name:"u_weights",texture:x},{name:"u_bias",texture:_}],this.uniformInts={u_w:t.w,u_h:t.h,u_a_groups:n,u_b_groups:p,u_out_c_groups:l},this.defaultSetup(),this.dispatch=[b,t.h]}};var _i=\`#version 300 es
// gates_fused: ConvGRU z + r gates, fused. Production config (c_up=2,
// recurrent=1). u_in (.x=a, .y=b), h_prev (.x). weights 9 vec4 =
// (z_w_b, z_w_h, r_w_b, r_w_h) in a (9,1) texture. bias .xy. output (z, r, 0, 0).

precision highp float;
precision highp int;

uniform sampler2D u_u_in;     // (W, H)
uniform sampler2D u_h_prev;   // (W, H)
uniform sampler2D u_weights;  // (9, 1)
uniform sampler2D u_bias;     // (1, 1)
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 b = texelFetch(u_bias, ivec2(0, 0), 0).xy;
    float z_pre = b.x;
    float r_pre = b.y;

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos  = ky * 3 + kx;
            float b_n = texelFetch(u_u_in,   ivec2(ix, iy), 0).y;
            float h_n = texelFetch(u_h_prev, ivec2(ix, iy), 0).z;
            vec4 w    = texelFetch(u_weights, ivec2(kpos, 0), 0);
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    float z = 1.0 / (1.0 + exp(-z_pre));
    float r = 1.0 / (1.0 + exp(-r_pre));
    fragColor = vec4(z, r, 0.0, 0.0);
}
\`;var dr=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",_i);let s=this.makeTexture(m(o.weights),9,1),n=this.makeTexture(w(o.bias),1,1),p=t.w,c=this.makeTexture(null,p,t.h);this.output={h:t.h,w:t.w,c:4,texture:c,texW:p,texH:t.h},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_h_prev",texture:a.texture},{name:"u_weights",texture:s},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[p,t.h]}};var bi=\`#version 300 es
// cand_update_fused: ConvGRU candidate + state update + output, fused.
// Production config (c_up=2, recurrent=1). u_in (.x=a, .y=b), h_prev (.x),
// gates_out (.x=z, .y=r). weights 9 vec4 (.xy = b_w, rh_w) in a (9,1) texture.
// bias .x, gamma .x. output (a, b_out, 0, 0).

precision highp float;
precision highp int;

uniform sampler2D u_u_in;       // (W, H)
uniform sampler2D u_h_prev;     // (W, H)
uniform sampler2D u_gates_out;  // (W, H)
uniform sampler2D u_weights;    // (9, 1)
uniform sampler2D u_bias;       // (1, 1)
uniform sampler2D u_gamma;      // (1, 1)
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float cand_pre = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos  = ky * 3 + kx;
            float b_n = texelFetch(u_u_in,      ivec2(ix, iy), 0).y;
            float h_n = texelFetch(u_h_prev,    ivec2(ix, iy), 0).z;
            float r_n = texelFetch(u_gates_out, ivec2(ix, iy), 0).y;
            vec4 w    = texelFetch(u_weights,   ivec2(kpos, 0), 0);
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    float h_til      = tanh(cand_pre);
    vec4  u_cur      = texelFetch(u_u_in,      ivec2(x, y), 0);
    float z_cur      = texelFetch(u_gates_out, ivec2(x, y), 0).x;
    float h_prev_cur = texelFetch(u_h_prev,    ivec2(x, y), 0).z;
    float h_new      = (1.0 - z_cur) * h_prev_cur + z_cur * h_til;
    float gamma      = texelFetch(u_gamma,     ivec2(0, 0), 0).x;
    float b_out      = u_cur.y + gamma * h_new;
    fragColor = vec4(u_cur.x, b_out, h_new, 0.0);
}
\`;var fr=class extends h{constructor(r,t,a,o,s,n){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",bi);let p=this.makeTexture(m(s.weights),9,1),c=this.makeTexture(w(s.bias),1,1),l=this.makeTexture(w(n),1,1),d=t.w,f=this.makeTexture(null,d,t.h);this.output={h:t.h,w:t.w,c:4,texture:f,texW:d,texH:t.h},this.inputs=[t,a,o],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_h_prev",texture:a.texture},{name:"u_gates_out",texture:o.texture},{name:"u_weights",texture:p},{name:"u_bias",texture:c},{name:"u_gamma",texture:l}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[d,t.h]}};var vi=\`#version 300 es
// conv_expand: bespoke N\\u21922 conv 3\\xD73 (pad 1) + relu (wrapper expand_feat).
// Input N ch (in_groups vec4); output 2ch in .xy (.zw = 0). Weights: 9 *
// in_groups mat4x2 (8 floats each, col-major c0r0,c0r1,...,c3r0,c3r1) in a
// 1-row texture \\u2014 bounded small (feat_ch \\u2264 32).

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (W*in_groups, H)
uniform sampler2D u_weights;  // (ceil(9*in_groups*8/4), 1)
uniform sampler2D u_bias;     // (1, 1) \\u2014 .xy
uniform int u_w;
uniform int u_h;
uniform int u_in_groups;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 result = texelFetch(u_bias, ivec2(0, 0), 0).xy;

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            for (int ig = 0; ig < u_in_groups; ig++) {
                vec4 v = texelFetch(u_input, ivec2(ix * u_in_groups + ig, iy), 0);
                int base = (kpos * u_in_groups + ig) * 8;  // mat4x2 = 8 floats
                result.x += wf(base + 0) * v.x + wf(base + 2) * v.y + wf(base + 4) * v.z + wf(base + 6) * v.w;
                result.y += wf(base + 1) * v.x + wf(base + 3) * v.y + wf(base + 5) * v.z + wf(base + 7) * v.w;
            }
        }
    }

    fragColor = vec4(max(result, vec2(0.0)), 0.0, 0.0);   // expand_feat is F.relu
}
\`;var mr=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",vi);let o=t.c/4,s=this.makeTexture(m(a.weights),18*o,1),n=this.makeTexture(w(a.bias),1,1),p=t.w,c=this.makeTexture(null,p,t.h);this.output={h:t.h,w:t.w,c:4,texture:c,texW:p,texH:t.h},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:s},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h,u_in_groups:o},this.defaultSetup(),this.dispatch=[p,t.h]}};var xi=\`#version 300 es
// cat_conv_6to2: fused concat(u[2], d[4]) \\u2192 6\\u21922 conv 3\\xD73 (pad 1) + relu
// (E up1_combine). Channel order v3a=(u.x,u.y,d.x), v3b=d.yzw. weights = 9*2
// mat3x2 (6 floats each, col-major) in a 1-row (27-texel) texture.

precision highp float;
precision highp int;

uniform sampler2D u_u_in;     // (W, H) \\u2014 .xy
uniform sampler2D u_d_in;     // (W, H) \\u2014 full vec4
uniform sampler2D u_weights;  // (27, 1)
uniform sampler2D u_bias;     // (1, 1) \\u2014 .xy
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 result = texelFetch(u_bias, ivec2(0, 0), 0).xy;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u = texelFetch(u_u_in, ivec2(ix, iy), 0);
            vec4 d = texelFetch(u_d_in, ivec2(ix, iy), 0);
            vec3 v3a = vec3(u.x, u.y, d.x);
            vec3 v3b = d.yzw;
            for (int ig = 0; ig < 2; ig++) {
                int base = (kpos * 2 + ig) * 6;
                vec3 v3 = (ig == 0) ? v3a : v3b;
                for (int col = 0; col < 3; col++) {
                    result.x += wf(base + col * 2 + 0) * v3[col];
                    result.y += wf(base + col * 2 + 1) * v3[col];
                }
            }
        }
    }

    fragColor = vec4(max(result, vec2(0.0)), 0.0, 0.0);   // up1_combine is F.relu
}
\`;var hr=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",xi);let s=this.makeTexture(m(o.weights),27,1),n=this.makeTexture(w(o.bias),1,1),p=t.w,c=this.makeTexture(null,p,t.h);this.output={h:t.h,w:t.w,c:4,texture:c,texW:p,texH:t.h},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_d_in",texture:a.texture},{name:"u_weights",texture:s},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[p,t.h]}};var yi=\`#version 300 es
// down_adapter: stride-N 3\\xD73 conv (mat4x4, 4\\u21924) + relu, then 1\\xD71 adapter
// (4\\u21923, last row 0). down_w = 9 mat4x4 (1-row, 36 texels); adapt_w = 1 mat4x4
// (4 texels). Output 3ch in .xyz (.w=0). Symmetric pad. Weight packing matches
// conv2d (col-major mat4x4 via the flat accessor).

precision highp float;
precision highp int;

uniform sampler2D u_input;     // (in_W, in_H) \\u2014 in_c padded to 1 vec4
uniform sampler2D u_down_w;    // (36, 1)
uniform sampler2D u_down_b;    // (1, 1)
uniform sampler2D u_adapt_w;   // (4, 1)
uniform sampler2D u_adapt_b;   // (1, 1) \\u2014 .xyz
uniform int u_in_w;
uniform int u_in_h;
uniform int u_stride;
uniform int u_pad;

out vec4 fragColor;

float dwf(int i) { return texelFetch(u_down_w,  ivec2(i / 4, 0), 0)[i & 3]; }
float awf(int i) { return texelFetch(u_adapt_w, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 d = texelFetch(u_down_b, ivec2(0, 0), 0);
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y * u_stride + ky - u_pad;
            int ix = x * u_stride + kx - u_pad;
            if (iy < 0 || ix < 0 || iy >= u_in_h || ix >= u_in_w) continue;
            int kpos = ky * 3 + kx;
            vec4 v = texelFetch(u_input, ivec2(ix, iy), 0);
            int m = kpos * 16;
            d.x += dwf(m + 0) * v.x + dwf(m + 4) * v.y + dwf(m + 8)  * v.z + dwf(m + 12) * v.w;
            d.y += dwf(m + 1) * v.x + dwf(m + 5) * v.y + dwf(m + 9)  * v.z + dwf(m + 13) * v.w;
            d.z += dwf(m + 2) * v.x + dwf(m + 6) * v.y + dwf(m + 10) * v.z + dwf(m + 14) * v.w;
            d.w += dwf(m + 3) * v.x + dwf(m + 7) * v.y + dwf(m + 11) * v.z + dwf(m + 15) * v.w;
        }
    }
    d = max(d, vec4(0.0));   // relu

    vec4 ab = texelFetch(u_adapt_b, ivec2(0, 0), 0);
    vec4 a;
    a.x = awf(0) * d.x + awf(4) * d.y + awf(8)  * d.z + awf(12) * d.w + ab.x;
    a.y = awf(1) * d.x + awf(5) * d.y + awf(9)  * d.z + awf(13) * d.w + ab.y;
    a.z = awf(2) * d.x + awf(6) * d.y + awf(10) * d.z + awf(14) * d.w + ab.z;
    fragColor = vec4(a.xyz, 0.0);
}
\`;var gr=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",yi);let n=G(t.h,3,s.stride,1),p=G(t.w,3,s.stride,1),c=U(1,t.h,n,3,s.stride),l=this.makeTexture(m(a.weights),36,1),d=this.makeTexture(w(a.bias),1,1),f=this.makeTexture(m(o.weights),4,1),x=this.makeTexture(w(o.bias),1,1),_=p,b=this.makeTexture(null,_,n);this.output={h:n,w:p,c:4,texture:b,texW:_,texH:n},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_down_w",texture:l},{name:"u_down_b",texture:d},{name:"u_adapt_w",texture:f},{name:"u_adapt_b",texture:x}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_stride:s.stride,u_pad:c},this.defaultSetup(),this.dispatch=[_,n]}};var wi=\`#version 300 es
// up_final: cat(u[2], rgb[3]) \\u2192 conv 3\\xD73 5\\u21921 \\u2192 sigmoid (A/B alpha head).
// weights 18 vec4 (1-row): [kpos]=(w0,w1,0,0) for u, [9+kpos]=(w2,w3,w4,0) rgb.

precision highp float;
precision highp int;

uniform sampler2D u_u_gru;    // (W, H) \\u2014 .xy
uniform sampler2D u_rgb;      // (W, H) \\u2014 .xyz
uniform sampler2D u_weights;  // (18, 1)
uniform sampler2D u_bias;     // (1, 1) \\u2014 .x
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float acc = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u  = texelFetch(u_u_gru,   ivec2(ix, iy), 0);
            vec4 r  = texelFetch(u_rgb,     ivec2(ix, iy), 0);
            vec4 wu = texelFetch(u_weights, ivec2(kpos, 0), 0);
            vec4 wr = texelFetch(u_weights, ivec2(9 + kpos, 0), 0);
            acc += dot(wu.xy, u.xy);
            acc += dot(wr.xyz, r.xyz);
        }
    }

    fragColor = vec4(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
\`;var _r=class extends h{constructor(r,t,a,o){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",wi);let s=this.makeTexture(m(o.weights),18,1),n=this.makeTexture(w(o.bias),1,1),p=t.w,c=this.makeTexture(null,p,t.h);this.output={h:t.h,w:t.w,c:4,texture:c,texW:p,texH:t.h},this.inputs=[t,a],this.weights=[],this.samplers=[{name:"u_u_gru",texture:t.texture},{name:"u_rgb",texture:a.texture},{name:"u_weights",texture:s},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[p,t.h]}};var ki=\`#version 300 es
// up_final_skip (C/D alpha head): cat(u[2], d_full[4], rgb[3]) \\u2192 conv 9\\u21921 \\u2192
// sigmoid. Weights = 27 vec4 (3 per kpos): [kpos*3+0]=(w0,w1,0,0) u;
// [kpos*3+1]=(w2..w5) d_full; [kpos*3+2]=(w6,w7,w8,0) rgb.

precision highp float;
precision highp int;

uniform sampler2D u_u_gru;    // (W, H) \\u2014 .xy
uniform sampler2D u_d_full;   // (W, H) \\u2014 full vec4
uniform sampler2D u_rgb;      // (W, H) \\u2014 .xyz
uniform sampler2D u_weights;  // (27, 1)
uniform sampler2D u_bias;     // (1, 1) \\u2014 .x
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float acc = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u = texelFetch(u_u_gru,  ivec2(ix, iy), 0);
            vec4 d = texelFetch(u_d_full, ivec2(ix, iy), 0);
            vec4 r = texelFetch(u_rgb,    ivec2(ix, iy), 0);
            int b0 = (kpos * 3 + 0) * 4, b1 = (kpos * 3 + 1) * 4, b2 = (kpos * 3 + 2) * 4;
            acc += wf(b0 + 0) * u.x + wf(b0 + 1) * u.y;
            acc += wf(b1 + 0) * d.x + wf(b1 + 1) * d.y + wf(b1 + 2) * d.z + wf(b1 + 3) * d.w;
            acc += wf(b2 + 0) * r.x + wf(b2 + 1) * r.y + wf(b2 + 2) * r.z;
        }
    }

    fragColor = vec4(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
\`;var br=class extends h{constructor(r,t,a,o,s){super(r);i(this,"inputs");i(this,"weights");i(this,"output");i(this,"dispatch");i(this,"shader",ki);let n=this.makeTexture(m(s.weights),27,1),p=this.makeTexture(w(s.bias),1,1),c=t.w,l=this.makeTexture(null,c,t.h);this.output={h:t.h,w:t.w,c:4,texture:l,texW:c,texH:t.h},this.inputs=[t,a,o],this.weights=[],this.samplers=[{name:"u_u_gru",texture:t.texture},{name:"u_d_full",texture:a.texture},{name:"u_rgb",texture:o.texture},{name:"u_weights",texture:n},{name:"u_bias",texture:p}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[c,t.h]}};var Ti=\`#version 300 es
// Composite an RGBA image over a solid background color, gated by a
// 1-channel alpha mask. Output: premultiplied RGBA.
//
// Assumes image and alpha textures are the same h\\xD7w and that the canvas
// (viewport) matches that resolution \\u2014 no resampling here. The upscaler op
// (separate) handles aligning alpha to the image resolution upstream.

precision highp float;

uniform sampler2D u_image;   // image as NHWC vec4 (RGBA in vec4)
uniform sampler2D u_alpha;   // alpha as NHWC vec4 (value in .r)
uniform vec3      u_bgColor; // straight-alpha background color, [0,1]

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left, but tensor textures are
    // stored top-down (matches NHWC + getImageData). Flip y when sampling so
    // the displayed image is upright. (WebGPU's @builtin(position) is already
    // top-down, so its compositor doesn't need this.)
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    vec3  fg = texelFetch(u_image, px, 0).rgb;
    float a  = texelFetch(u_alpha, px, 0).r;

    // Straight-alpha composite, then premultiply for the canvas's
    // premultiplied surface format.
    vec3 rgb = fg * a + u_bgColor * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
\`;var ju=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,vr=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"program");i(this,"imageTex");i(this,"alphaTex");i(this,"bgColor");if(r.h!==t.h||r.w!==t.w)throw new Error(\`CompositeSolid: image (\${r.h}\\xD7\${r.w}) and alpha (\${t.h}\\xD7\${t.w}) must match. Run the upscaler first.\`);let o=r,s=t;this.imageTex=o.texture,this.alphaTex=s.texture,this.bgColor=a;let n=e.gl,p=n.createShader(n.VERTEX_SHADER);n.shaderSource(p,ju),n.compileShader(p);let c=n.createShader(n.FRAGMENT_SHADER);if(n.shaderSource(c,Ti),n.compileShader(c),!n.getShaderParameter(c,n.COMPILE_STATUS))throw new Error(\`composite_solid GLSL compile error: \${n.getShaderInfoLog(c)}\`);if(this.program=n.createProgram(),n.attachShader(this.program,p),n.attachShader(this.program,c),n.linkProgram(this.program),!n.getProgramParameter(this.program,n.LINK_STATUS))throw new Error(\`composite_solid GLSL link error: \${n.getProgramInfoLog(this.program)}\`)}run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.uniform3f(e.getUniformLocation(this.program,"u_bgColor"),this.bgColor[0],this.bgColor[1],this.bgColor[2]),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Pi=\`#version 300 es
// Same as composite_solid but bg is a texture (NHWC vec4 tensor) instead of
// a uniform color. Caller invariants: image, alpha, bg all share h \\xD7 w, and
// canvas dimensions match.

precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_alpha;
uniform sampler2D u_bg;

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left; tensor textures are top-down.
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));

    vec3  fg = texelFetch(u_image, px, 0).rgb;
    float a  = texelFetch(u_alpha, px, 0).r;
    vec3  bg = texelFetch(u_bg,    px, 0).rgb;

    vec3 rgb = fg * a + bg * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
\`;var qu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,xr=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"program");i(this,"imageTex");i(this,"alphaTex");i(this,"bgTex");if(r.h!==t.h||r.w!==t.w||r.h!==a.h||r.w!==a.w)throw new Error(\`CompositeImage: image (\${r.h}\\xD7\${r.w}), alpha (\${t.h}\\xD7\${t.w}), and bg (\${a.h}\\xD7\${a.w}) must all match. Run upscaler / resizer first.\`);this.imageTex=r.texture,this.alphaTex=t.texture,this.bgTex=a.texture;let o=e.gl,s=o.createShader(o.VERTEX_SHADER);o.shaderSource(s,qu),o.compileShader(s);let n=o.createShader(o.FRAGMENT_SHADER);if(o.shaderSource(n,Pi),o.compileShader(n),!o.getShaderParameter(n,o.COMPILE_STATUS))throw new Error(\`composite_image GLSL compile error: \${o.getShaderInfoLog(n)}\`);if(this.program=o.createProgram(),o.attachShader(this.program,s),o.attachShader(this.program,n),o.linkProgram(this.program),!o.getProgramParameter(this.program,o.LINK_STATUS))throw new Error(\`composite_image GLSL link error: \${o.getProgramInfoLog(this.program)}\`)}run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.bgTex),e.uniform1i(e.getUniformLocation(this.program,"u_bg"),2),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Ci=\`#version 300 es
// Like composite_image but bg is bilinearly sampled \\u2014 bg is at a smaller
// resolution than (image, alpha) at canvas h \\xD7 w. Used by CompositorBlur to
// skip the final full-res upsample in the blur pyramid.
//
// Tensor textures are top-down (origin at top-left of the source image),
// while gl_FragCoord origin is bottom-left \\u2014 flip y when computing px.

precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_alpha;
uniform sampler2D u_bg;

uniform int u_out_w;
uniform int u_out_h;
uniform int u_bg_w;
uniform int u_bg_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = u_out_h - 1 - int(gl_FragCoord.y);

    vec3  fg = texelFetch(u_image, ivec2(x, y), 0).rgb;
    float a  = texelFetch(u_alpha, ivec2(x, y), 0).r;

    // Bilinear sample bg at the corresponding location. align_corners=False.
    float src_x = (float(x) + 0.5) * (float(u_bg_w) / float(u_out_w)) - 0.5;
    float src_y = (float(y) + 0.5) * (float(u_bg_h) / float(u_out_h)) - 0.5;
    int x0 = clamp(int(floor(src_x)),     0, u_bg_w - 1);
    int x1 = clamp(int(floor(src_x)) + 1, 0, u_bg_w - 1);
    int y0 = clamp(int(floor(src_y)),     0, u_bg_h - 1);
    int y1 = clamp(int(floor(src_y)) + 1, 0, u_bg_h - 1);
    float wx = src_x - floor(src_x);
    float wy = src_y - floor(src_y);

    vec3 tl = texelFetch(u_bg, ivec2(x0, y0), 0).rgb;
    vec3 tr = texelFetch(u_bg, ivec2(x1, y0), 0).rgb;
    vec3 bl = texelFetch(u_bg, ivec2(x0, y1), 0).rgb;
    vec3 br = texelFetch(u_bg, ivec2(x1, y1), 0).rgb;
    vec3 bg = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    vec3 rgb = fg * a + bg * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
\`;var Yu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,yr=class{constructor(e,r,t,a){i(this,"backend",e);i(this,"program");i(this,"imageTex");i(this,"alphaTex");i(this,"bgTex");i(this,"outW");i(this,"outH");i(this,"bgW");i(this,"bgH");if(r.h!==t.h||r.w!==t.w)throw new Error(\`CompositeImageBilinear: image (\${r.h}\\xD7\${r.w}) and alpha (\${t.h}\\xD7\${t.w}) must match.\`);this.imageTex=r.texture,this.alphaTex=t.texture,this.bgTex=a.texture,this.outW=r.w,this.outH=r.h,this.bgW=a.w,this.bgH=a.h;let o=e.gl,s=o.createShader(o.VERTEX_SHADER);o.shaderSource(s,Yu),o.compileShader(s);let n=o.createShader(o.FRAGMENT_SHADER);if(o.shaderSource(n,Ci),o.compileShader(n),!o.getShaderParameter(n,o.COMPILE_STATUS))throw new Error(\`composite_image_bilinear GLSL compile error: \${o.getShaderInfoLog(n)}\`);if(this.program=o.createProgram(),o.attachShader(this.program,s),o.attachShader(this.program,n),o.linkProgram(this.program),!o.getProgramParameter(this.program,o.LINK_STATUS))throw new Error(\`composite_image_bilinear GLSL link error: \${o.getProgramInfoLog(this.program)}\`)}run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.bgTex),e.uniform1i(e.getUniformLocation(this.program,"u_bg"),2),e.uniform1i(e.getUniformLocation(this.program,"u_out_w"),this.outW),e.uniform1i(e.getUniformLocation(this.program,"u_out_h"),this.outH),e.uniform1i(e.getUniformLocation(this.program,"u_bg_w"),this.bgW),e.uniform1i(e.getUniformLocation(this.program,"u_bg_h"),this.bgH),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Qu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,wr=class{constructor(e,r){i(this,"backend",e);i(this,"program");i(this,"imageTex");this.imageTex=r.texture;let t=e.gl,a=t.createShader(t.VERTEX_SHADER);t.shaderSource(a,Qu),t.compileShader(a);let o=t.createShader(t.FRAGMENT_SHADER);if(t.shaderSource(o,Qt),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS))throw new Error(\`composite_passthrough GLSL compile error: \${t.getShaderInfoLog(o)}\`);if(this.program=t.createProgram(),t.attachShader(this.program,a),t.attachShader(this.program,o),t.linkProgram(this.program),!t.getProgramParameter(this.program,t.LINK_STATUS))throw new Error(\`composite_passthrough GLSL link error: \${t.getProgramInfoLog(this.program)}\`)}run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Wi=\`#version 300 es
precision highp float;

// Input op \\u2014 bilinear-sample a source texture (RGBA8 unorm uploaded from an
// ImageBitmap or VideoFrame) at the target resolution. Output texture format
// is RGBA32F or RGBA16F depending on backend.dtype; the framebuffer write
// stores fragColor into whatever format is bound.

uniform sampler2D u_src;
uniform int       u_out_w;
uniform int       u_out_h;
// Orientation: upright uv \\u2192 source uv (see model/orientation.ts).
uniform vec3      u_uv_x;
uniform vec3      u_uv_y;

out vec4 fragColor;

void main() {
    // gl_FragCoord is already at the pixel centre (x.5).
    vec3 o = vec3(gl_FragCoord.xy / vec2(float(u_out_w), float(u_out_h)), 1.0);
    fragColor = texture(u_src, vec2(dot(u_uv_x, o), dot(u_uv_y, o)));
}
\`;var Zu=\`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }\`,kr=class{constructor(e,r,t){i(this,"backend",e);i(this,"output");i(this,"gl");i(this,"program");i(this,"srcTex");i(this,"uOutW");i(this,"uOutH");i(this,"uSrc");i(this,"uUvX");i(this,"uUvY");i(this,"orientation",null);i(this,"source",null);let a=e.gl;this.gl=a,this.output=e.tensor(r,t,4),this.srcTex=a.createTexture(),a.bindTexture(a.TEXTURE_2D,this.srcTex),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE);let o=a.createShader(a.VERTEX_SHADER);a.shaderSource(o,Zu),a.compileShader(o);let s=a.createShader(a.FRAGMENT_SHADER);if(a.shaderSource(s,Wi),a.compileShader(s),!a.getShaderParameter(s,a.COMPILE_STATUS))throw new Error(\`Input GLSL compile error: \${a.getShaderInfoLog(s)}\`);if(this.program=a.createProgram(),a.attachShader(this.program,o),a.attachShader(this.program,s),a.linkProgram(this.program),!a.getProgramParameter(this.program,a.LINK_STATUS))throw new Error(\`Input GLSL link error: \${a.getProgramInfoLog(this.program)}\`);this.uSrc=a.getUniformLocation(this.program,"u_src"),this.uOutW=a.getUniformLocation(this.program,"u_out_w"),this.uOutH=a.getUniformLocation(this.program,"u_out_h"),this.uUvX=a.getUniformLocation(this.program,"u_uv_x"),this.uUvY=a.getUniformLocation(this.program,"u_uv_y")}setSource(e,r){this.source=e,this.orientation=r??null}run(){if(!this.source)throw new Error("InputWebGL.run() called before setSource()");let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.srcTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.source),e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.srcTex),e.uniform1i(this.uSrc,0),e.uniform1i(this.uOutW,this.output.w),e.uniform1i(this.uOutH,this.output.h);let r=je(this.orientation);e.uniform3f(this.uUvX,r[0],r[1],r[2]),e.uniform3f(this.uUvY,r[3],r[4],r[5]),e.bindFramebuffer(e.FRAMEBUFFER,this.backend.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.output.texture,0),e.viewport(0,0,this.output.texW,this.output.texH),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6)}};var Gi=\`#version 300 es
// Global average pool, pass 1 of 2: mean over x for each (row, channel group).
// Fragment shaders can't share work across pixels, so the pool is split into a
// row pass (out: (C_groups, H)) and a column pass (pool_cols.glsl).
precision highp float;
precision highp int;

uniform sampler2D u_input;   // (in_W * C_groups, in_H)
uniform int u_in_w;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    int c = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);
    vec4 sum = vec4(0.0);
    for (int x = 0; x < u_in_w; x++) sum += texelFetch(u_input, ivec2(x * u_c_groups + c, y), 0);
    fragColor = sum / float(u_in_w);
}
\`;var Ui=\`#version 300 es
// Global average pool, pass 2 of 2: mean of the row means \\u2192 (C_groups, 1).
precision highp float;
precision highp int;

uniform sampler2D u_input;   // (C_groups, in_H) \\u2014 pool_rows output
uniform int u_in_h;

out vec4 fragColor;

void main() {
    int c = int(gl_FragCoord.x);
    vec4 sum = vec4(0.0);
    for (int y = 0; y < u_in_h; y++) sum += texelFetch(u_input, ivec2(c, y), 0);
    fragColor = sum / float(u_in_h);
}
\`;var Dr=class extends h{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Gi);let a=t.c/4;this.output={h:t.h,w:1,c:t.c,texture:this.makeTexture(null,a,t.h),texW:a,texH:t.h},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_c_groups:a},this.defaultSetup(),this.dispatch=[a,t.h]}},Ir=class extends h{constructor(r,t){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Ui);let a=t.c/4;this.output={h:1,w:1,c:t.c,texture:this.makeTexture(null,a,1),texW:a,texH:1},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_h:t.h},this.defaultSetup(),this.dispatch=[a,1]}},Tr=class{constructor(e,r){i(this,"inputs");i(this,"output");i(this,"rows");i(this,"cols");this.inputs=[r],this.rows=new Dr(e,r),this.cols=new Ir(e,this.rows.output),this.output=this.cols.output}run(){this.rows.run(),this.cols.run()}};var Bi=\`#version 300 es
// Per-channel scale: x (W * C_groups, H) * scale (C_groups, 1), broadcast over H\\xD7W.
precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_scale;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input, p, 0) * texelFetch(u_scale, ivec2(p.x % u_c_groups, 0), 0);
}
\`;var Pr=class extends h{constructor(r,t,a){super(r);i(this,"inputs");i(this,"weights",[]);i(this,"output");i(this,"dispatch");i(this,"shader",Bi);if(a.h!==1||a.w!==1||a.c!==t.c)throw new Error(\`ChannelScale: scale must be 1\\xD71\\xD7\${t.c}, got \${a.h}\\xD7\${a.w}\\xD7\${a.c}\`);let o=t;this.output={h:t.h,w:t.w,c:t.c,texture:this.makeTexture(null,o.texW,o.texH),texW:o.texW,texH:o.texH},this.inputs=[t,a],this.samplers=[{name:"u_input",texture:o.texture},{name:"u_scale",texture:a.texture}],this.uniformInts={u_c_groups:t.c/4},this.defaultSetup(),this.dispatch=[o.texW,o.texH]}};var se=class u{constructor(e,r,t){i(this,"gl",e);i(this,"canvas",r);i(this,"dtype",t);i(this,"ops");i(this,"presenters");i(this,"fbo");i(this,"textureFormat");this.fbo=e.createFramebuffer(),this.textureFormat=t==="f16"?{internalFormat:e.RGBA16F,format:e.RGBA,type:e.HALF_FLOAT,bytesPerElement:2}:{internalFormat:e.RGBA32F,format:e.RGBA,type:e.FLOAT,bytesPerElement:4},this.ops={Conv2d:(a,o,s)=>new Dt(this,a,o,s),ConvTranspose2d:(a,o,s)=>new It(this,a,o,s),DepthwiseConv2d:(a,o,s)=>new Mt(this,a,o,s),Add:(a,o)=>new zt(this,a,o),Sigmoid:a=>new Ht(this,a),Tanh:a=>new Nt(this,a),ElementwiseMul:(a,o)=>new Vt(this,a,o),GlobalAvgPool:a=>new Tr(this,a),ChannelScale:(a,o)=>new Pr(this,a,o),Warp:(a,o,s)=>new Xt(this,a,o,s),FaceBoxFromHeatmaps:(a,o)=>new jt(this,a,o),FaceBoxesFromHeatmaps:(a,o)=>new $t(this,a,o),ReframeState:(a,o,s,n)=>new qt(this,a,o,s,n),Reframe:(a,o)=>new Kt(this,a,o),CropResample:(a,o,s)=>new Yt(this,a,o,s),FaceTouchupStage:(a,o,s,n,p)=>new er(this,a,o,s,n,p),Stabilize:(a,o,s,n,p)=>new tr(this,a,o,s,n,p),BilinearUpsample:(a,o)=>new rr(this,a,o),Crop:(a,o)=>new or(this,a,o),BicubicUpsample:(a,o)=>new ar(this,a,o),ChannelConcat:(a,o)=>new ir(this,a,o),Conv2dAdd:(a,o,s,n)=>new pr(this,a,o,s,n),ProjResidual:(a,o,s,n)=>new cr(this,a,o,s,n),ConcatConv2d:(a,o,s,n)=>new lr(this,a,o,s,n),GatesFused:(a,o,s)=>new dr(this,a,o,s),CandUpdateFused:(a,o,s,n,p)=>new fr(this,a,o,s,n,p),ConvExpand:(a,o)=>new mr(this,a,o),CatConv6to2:(a,o,s)=>new hr(this,a,o,s),DownAdapter:(a,o,s,n)=>new gr(this,a,o,s,n),UpFinal:(a,o,s)=>new _r(this,a,o,s),UpFinalSkip:(a,o,s,n)=>new br(this,a,o,s,n),UpsampleConcat:(a,o,s)=>new nr(this,a,o,s),UpsampleConv1x1:(a,o,s)=>new ur(this,a,o,s),UpsampleSigmoid:(a,o)=>new sr(this,a,o),Input:(a,o)=>new kr(this,a,o)},this.presenters={CompositeSolid:(a,o,s)=>new vr(this,a,o,s),CompositeImage:(a,o,s)=>new xr(this,a,o,s),CompositeImageBilinear:(a,o,s)=>new yr(this,a,o,s),CompositePassthrough:a=>new wr(this,a),LandmarkOverlay:(a,o,s,n)=>new Jt(this,a,o,s,n),FaceTouchup:(a,o,s,n,p)=>new Zt(this,a,o,s,n,p)}}static isAvailable(){let e=null;try{return e=new OffscreenCanvas(1,1).getContext("webgl2"),!(!e||!e.getExtension("EXT_color_buffer_float"))}catch{return!1}finally{e?.getExtension("WEBGL_lose_context")?.loseContext()}}static create(e){let r=e.canvas.getContext("webgl2");if(!r)throw new Error("WebGL2 not available");if(!r.getExtension("EXT_color_buffer_float"))throw new Error("EXT_color_buffer_float not available");return new u(r,e.canvas,e.dtype??"f32")}attachCanvas(e){throw new Error(\`WebGLBackend.attachCanvas('\${e}'): WebGL cannot render to a second canvas; use the renderer's snapshot-and-present path for preview output\`)}bindDisplayFramebuffer(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null),this.gl.viewport(0,0,this.canvas.width,this.canvas.height)}toTextureView(e){if(e===null)return null;let r=this.dtype==="f16",t=e instanceof Uint16Array;return r===t?e:r?Ye(e):fe(e)}tensor(e,r,t,a){let o=r*(t/4),s=e,n=this.gl,p=n.createTexture(),c=this.textureFormat,l=this.toTextureView(a??null);return n.bindTexture(n.TEXTURE_2D,p),n.texImage2D(n.TEXTURE_2D,0,c.internalFormat,o,s,0,c.format,c.type,l),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),{h:e,w:r,c:t,texture:p,texW:o,texH:s}}upload(e){return{data:e}}async readback(e){let r=this.gl,t=this.textureFormat;if(r.bindFramebuffer(r.FRAMEBUFFER,this.fbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,e.texture,0),this.dtype==="f16"){let o=new Uint16Array(e.texW*e.texH*4);return r.readPixels(0,0,e.texW,e.texH,t.format,r.HALF_FLOAT,o),r.bindFramebuffer(r.FRAMEBUFFER,null),fe(o)}let a=new Float32Array(e.texW*e.texH*4);return r.readPixels(0,0,e.texW,e.texH,t.format,r.FLOAT,a),r.bindFramebuffer(r.FRAMEBUFFER,null),a}copyTensor(e,r){if(e.texW!==r.texW||e.texH!==r.texH)throw new Error(\`copyTensor: size mismatch (src \${e.texW}\\xD7\${e.texH} vs dst \${r.texW}\\xD7\${r.texH})\`);let t=this.gl;t.bindFramebuffer(t.FRAMEBUFFER,this.fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,e.texture,0),t.bindTexture(t.TEXTURE_2D,r.texture),t.copyTexSubImage2D(t.TEXTURE_2D,0,0,0,0,0,e.texW,e.texH),t.bindFramebuffer(t.FRAMEBUFFER,null)}async sync(){let e=this.gl,r=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);if(!r){e.finish();return}for(e.flush();;){let t=e.clientWaitSync(r,0,0);if(t===e.ALREADY_SIGNALED||t===e.CONDITION_SATISFIED){e.deleteSync(r);return}if(t===e.WAIT_FAILED)throw e.deleteSync(r),new Error("WebGLBackend.sync: clientWaitSync returned WAIT_FAILED");await new Promise(a=>setTimeout(a,1))}}destroy(){this.gl.deleteFramebuffer(this.fbo),this.gl.getExtension("WEBGL_lose_context")?.loseContext()}};var Mr=le("setup_backend");async function Si(u,e,r={}){let t=u.backend==="webgpu"||u.backend==="auto",a=!!u.outputCanvas,o=()=>u.outputCanvas??new OffscreenCanvas(e.w,e.h),s=null;if(t&&await ge.isAvailable()){let p=u.dtype==="f16"&&!await ge.hasF16Support()?"f32":u.dtype,c=o();try{let l=await ge.create({canvas:c,dtype:p});return l.device.lost.then(d=>{r.isShuttingDown?.()||r.onContextLost?.({type:"backend-lost",message:\`WebGPU device lost: \${d.reason}\${d.message?" \\u2014 "+d.message:""}\`,source:"backend-lost",cause:{reason:d.reason,message:d.message}})}).catch(()=>{}),{backend:l,resolvedBackend:"webgpu",resolvedDtype:p,canvas:c}}catch(l){Mr.warn("WebGPU isAvailable but create() threw; trying WebGL fallback:",l),s=l,a&&Mr.warn("transfer-capture topology: WebGL fallback may also fail on the same canvas")}}if(se.isAvailable()){let p=o();try{let c=se.create({canvas:p,dtype:u.dtype});return p.addEventListener("webglcontextlost",()=>{r.isShuttingDown?.()||r.onContextLost?.({type:"backend-lost",message:"WebGL context lost",source:"backend-lost"})}),{backend:c,resolvedBackend:"webgl",resolvedDtype:u.dtype,canvas:p}}catch(c){Mr.warn("WebGL create() threw:",c),s=c}}let n=s?\` (last error: \${s.message??s})\`:"";throw new Error(\`setup_backend: no usable GPU backend\${n}\`)}var Li=.5,op=3,Ai=10,ap=30,ne=le("autotune");async function Ei(u,e=ap){let r=u instanceof se?Li*.5:Li,t=1e3/e*r;ne(\`start; budget per source frame: \${t.toFixed(1)}ms (source \${e}fps \\xD7 \${r} safety)\`),ne("backend dtype:",u.dtype);let a=null;for(let o of Gr)if(o.model!=="xl"){if(!ee[o.model]){ne("skip",o.model,"(no TIER_CONFIG entry)");continue}try{let s=ee[o.model].baseRes;ne(\`bench \${o.model} base @ \${s.w}\\xD7\${s.h} skipFrames=\${o.skipFrames} \\u2026\`);let n=await np(u,o),p=n<=t;if(ne(\`  \${o.model}: \${n.toFixed(1)}ms / source frame \${p?"\\u2713 within budget":"\\u2717 over budget"}\`),(p||a===null)&&(a=o),!p)break}catch(s){ne("  bench failed for",o.model,":",s);break}}if(!a)throw new Error("autotune: no implementable preset available");return ne("picked",a.model),a}function ip(u){let e=Object.create(u);return e.ops={...u.ops,Conv2d:(r,t,a)=>{let o={weights:new Float32Array(a.kernel*a.kernel*r.c*a.outChannels),bias:new Float32Array(a.outChannels)};return u.ops.Conv2d(r,o,a)},DepthwiseConv2d:(r,t,a)=>{let o={weights:new Float32Array(a.kernel*a.kernel*r.c),bias:new Float32Array(r.c)};return u.ops.DepthwiseConv2d(r,o,a)},Conv2dAdd:(r,t,a,o)=>{let s={weights:new Float32Array(o.kernel*o.kernel*r.c*o.outChannels),bias:new Float32Array(o.outChannels)};return u.ops.Conv2dAdd(r,t,s,o)},UpsampleConv1x1:(r,t,a)=>{let o={weights:new Float32Array(r.c*a.outChannels),bias:new Float32Array(a.outChannels)};return u.ops.UpsampleConv1x1(r,o,a)},ProjResidual:(r,t,a,o)=>{let s={weights:new Float32Array(r.c*o.outChannels),bias:new Float32Array(o.outChannels)};return u.ops.ProjResidual(r,t,s,o)},ConcatConv2d:(r,t,a,o)=>{let s={weights:new Float32Array(9*(r.c+t.c)*o.outChannels),bias:new Float32Array(o.outChannels)};return u.ops.ConcatConv2d(r,t,s,o)}},e}function sp(){let u=new Proxy({},{get:()=>u});return u}async function np(u,e){let r=ee[e.model];if(!r)throw new Error(\`microbench: no TIER_CONFIG entry for '\${e.model}'\`);let t=r.base,a=ip(u),o=a.tensor(r.baseRes.h,r.baseRes.w,4),s=new t(a,o,sp());for(let l=0;l<op;l++)s.run(),await u.sync();let n=e.skipFrames+1,p=performance.now();for(let l=0;l<Ai;l++)l%n===0&&s.run();return await u.sync(),(performance.now()-p)/Ai}async function Fi(u,e,r){let t;if(u==="auto")t=await Ei(r);else if(typeof u=="string"){let a=Ge(u);if(!a)throw new Error(\`resolve_preset: unknown preset name '\${u}'\`);t=a}else t=u;return t.dtype!==e?{...t,dtype:e}:t}var Oi=new WeakMap;function Ri(u,e){typeof e=="number"&&Oi.set(u,e-performance.timeOrigin)}function re(u,e){return Oi.get(u)??e}var up=1e3,ue=[];function Di(u){if(u===void 0)return;let e=performance.now(),r=e-u;r>=0&&r<1e4&&(ue.push({t:e,ms:r}),Ii(e))}function zr(){if(Ii(performance.now()),ue.length===0)return 0;let u=0;for(let e of ue)u+=e.ms;return Math.round(u/ue.length*10)/10}function Ii(u){for(;ue.length&&u-ue[0].t>up;)ue.shift()}function Mi(u){let e=null,r=null,t=!1;return u.onmessage=a=>{let{frame:o,orientation:s,sentAt:n}=a.data;if(t){o?.close();return}if(Ri(o,n),so(o,s),r){let p=r;r=null,p(o)}else e&&e.close(),e=o},u.start?.(),new ReadableStream({pull(a){if(e){a.enqueue(e),e=null;return}return new Promise(o=>{r=s=>{if(t){s.close(),o();return}try{a.enqueue(s)}catch{t=!0,s.close()}o()}})},cancel(){t=!0,r=null,e&&(e.close(),e=null),u.close()}},{highWaterMark:0})}function Hr(u){switch(u.topology.input){case"mstp":if(!u.inputReadable)throw new Error("create_input: topology.input='mstp' but InitData.inputReadable missing");return u.inputReadable;case"rvfc-postmessage":if(!u.inputPort)throw new Error("create_input: topology.input='rvfc-postmessage' but InitData.inputPort missing");return Mi(u.inputPort)}}function zi(u,e,r){return new WritableStream({async write(t){let a=re(t,performance.now()),o;try{let s=await u.prepareSource(t);try{u.process(t,s)}finally{s!==t&&s.close()}o=new VideoFrame(u.canvas,{timestamp:t.timestamp})}finally{t.close()}e.postMessage({frame:o},[o]),r(a)},close(){e.close()}})}function Hi(u,e=()=>{}){return new WritableStream({async write(r){let t=re(r,performance.now());try{let a=await u.prepareSource(r);try{u.process(r,a)}finally{a!==r&&a.close()}u.markSubmitted()}finally{r.close()}e(t),await u.waitForGpu(1)}})}function Ni(u,e,r=()=>{}){return new WritableStream({async write(t){let a=re(t,performance.now());try{let s=await u.prepareSource(t);try{u.process(t,s)}finally{s!==t&&s.close()}u.markSubmitted()}finally{t.close()}let o=u.canvas.transferToImageBitmap();e.postMessage({bmp:o},[o]),r(a),await u.waitForGpu(1)},close(){e.close()}})}function Vi(u,e,r){switch(u.topology.output){case"mstg":{if(!u.outputFramePort)throw new Error("create_output: topology.output='mstg' but InitData.outputFramePort missing");return zi(e,u.outputFramePort,r)}case"transfer-capture":return Hi(e,r);case"bitmap-shuttle":{if(!u.outputPort)throw new Error("create_output: topology.output='bitmap-shuttle' but InitData.outputPort missing");return Ni(e,u.outputPort,r)}}}function Xi(u,e){if(u.topology.output!=="transfer-capture"||!u.outputCanvas)return null;let r=u.outputCanvas,t=null;try{t=r.getContext("2d")}catch{t=null}if(!t)return null;let a=t;return new WritableStream({write(o){let s=re(o,performance.now());try{pp(a,r,o)}finally{o.close()}e(s)}})}function pp(u,e,r){let t=$e(r),a=Xe(r.displayWidth,r.displayHeight,t);if(a.w!==a.h&&e.width!==e.height&&a.w>a.h!=e.width>e.height){let l=e.width;e.width=e.height,e.height=l}let o=e.width,s=e.height;if(Sr(t)){u.drawImage(r,0,0,o,s);return}u.save(),t.flip&&(u.translate(o,0),u.scale(-1,1)),u.translate(o/2,s/2),u.rotate(t.rotation*Math.PI/180);let n=t.rotation===90||t.rotation===270,p=n?s:o,c=n?o:s;u.drawImage(r,-p/2,-c/2,p,c),u.restore()}var B=le("worker");B("script loaded");var H=null,Y=null,Te=null,Nr=null,jr=null,Cr=0,Pe=!1,Vr=!1,$r=!1,$i=0,oe=[],ji=u=>{if($i++,Di(u),$r){let e=performance.now();for(oe.push(e);oe.length&&e-oe[0]>1e3;)oe.shift()}},_e=null,ae=null,pe={family:"longpipe"};self.onmessage=async function(u){let{cmd:e,data:r,request_id:t}=u.data;B("cmd received:",e,"request_id:",t);try{let a=await cp(e,r);B("cmd ok:",e),Cp(t,a)}catch(a){B("cmd FAILED:",e,a),Wp(t,\`\${e} failed: \${a?.message??String(a)}\`)}};self.addEventListener("unhandledrejection",u=>{console.error("[longpipe/worker] unhandled rejection:",u.reason)});async function cp(u,e){switch(u){case"init":return fp(e);case"startRender":return mp(e);case"setBackground":return hp(e);case"setEnabled":return gp(e.enabled);case"setPreset":return xp(e);case"getStats":return wp();case"destroy":return Tp();case"attachPreview":return _p(e);case"setPreview":return bp(e);case"clearPreview":return vp();case"setTouchup":return Bp(e);case"setReframe":return Gp(e);case"reframeNow":return Up();case"setInput":return yp(e);case"debug":return kp(e);default:throw new Error(\`unknown cmd: \${u}\`)}}function lp(u){_e&&clearInterval(_e),_e=setInterval(()=>be("heartbeat",{framesOut:$i}),u)}function Xr(u,e){let r=++Cr,t=new AbortController;Nr=t,jr=dp(u,e,t.signal).then(()=>{r!==Cr||Pe||(B("pipe completed (input ended)"),be("inputEnded",void 0))}).catch(a=>{if(r!==Cr||t.signal.aborted||Pe||Vr){B("pipe stopped (expected):",a?.message);return}B("pipe FAILED:",a),be("error",{type:"worker-crash",message:\`pipe failed: \${a?.message??String(a)}\`,source:"worker"})})}async function dp(u,e,r){let t=u.getReader(),a=e.getWriter(),o=()=>{t.cancel().catch(()=>{})};r.addEventListener("abort",o);let s=!1;try{for(;;){if(await a.ready,r.aborted)return;let{value:n,done:p}=await t.read();if(p){s=!0;return}if(r.aborted){n.close();return}try{await a.write(n)}catch(c){throw n.close(),c}}}finally{r.removeEventListener("abort",o),s||await t.cancel().catch(()=>{}),t.releaseLock(),a.releaseLock()}}async function qr(u){if(!u||u.locked)return;let e=u.getReader(),r=e.read().then(t=>{t.value?.close()},()=>{});await Promise.race([r,new Promise(t=>setTimeout(t,200))]),await e.cancel().catch(()=>{})}function Kr(){Cr++,Nr?.abort(),Nr=null}async function fp(u){if(Yr(!!u.debug),B("handleInit: start; topology=",u.topology,"preset=",u.preset,"backend=",u.backend,"dtype=",u.dtype),Y)throw new Error("handleInit: already initialized");Y=u,lp(u.heartbeatMs??1e3),B("handleInit: setupBackend\\u2026");let e=null,r;if(u.backend==="none")r="GPU backend disabled";else try{e=await Si(u,u.canvasSize,{onContextLost:o=>{Vr||(Vr=!0,B("GPU context lost:",o.message),Kr(),be("error",o))},isShuttingDown:()=>Pe})}catch(o){r=o?.message??String(o)}if(Pe)throw e?.backend.destroy(),new Error("handleInit: worker destroyed during init");let t=Hr(u);if(!e){$r=!0,B("handleInit: no backend \\u2014",r);let o=Xi(u,ji);return o?(Te=o,Xr(t,o)):qr(t),ae=null,{resolvedPreset:null,resolvedBackend:"none",resolvedDtype:u.dtype,workerDrawsRaw:!!o,backendError:r}}if(B("handleInit: backend ready:",e.resolvedBackend,e.resolvedDtype,"canvas:",e.canvas.width,"x",e.canvas.height),B("handleInit: constructing Renderer (boot mode)\\u2026"),H=new qe({backend:e.backend,backendKind:e.resolvedBackend,canvas:e.canvas,background:u.background,enabled:u.enabled,topology:u.topology}),B("handleInit: createOutputSink\\u2026"),Te=Vi(u,H,ji),B("handleInit: starting pipe (passthrough)\\u2026"),Xr(t,Te),pe=u.model??{family:"longpipe"},pe.family==="mediapipe-selfie")return B("handleInit: MediaPipe selfie",pe.variant,"\\u2014 skipping autotune"),ae=null,{resolvedPreset:null,resolvedBackend:e.resolvedBackend,resolvedDtype:e.resolvedDtype};B("handleInit: resolvePreset\\u2026");let a=await Fi(u.preset,e.resolvedDtype,e.backend);return B("handleInit: preset resolved:",a),ae=a,B("handleInit: done; returning InitResponse, awaiting startRender"),{resolvedPreset:a,resolvedBackend:e.resolvedBackend,resolvedDtype:e.resolvedDtype}}async function mp({weights:u,preset:e}){if(B("handleStartRender: start; weights bytes:",u.byteLength),e&&(ae=e),!H)throw new Error("handleStartRender: handleInit not completed");if(pe.family==="mediapipe-selfie")B("handleStartRender: attaching MediaPipe selfie",pe.variant),H.setMediaPipeSelfie(pe.variant,u);else{if(!ae)throw new Error("handleStartRender: handleInit not completed");B("handleStartRender: attaching network via setPreset\\u2026"),H.setPreset(ae,u)}B("handleStartRender: ready (effect mode active)"),be("ready",void 0)}function ie(u){if(!H)throw new Error($r?\`\${u}: no GPU backend\`:\`\${u}: not initialized\`);return H}async function hp(u){ie("setBackground").setBackground(u)}async function gp(u){H?.setEnabled(u)}async function _p(u){ie("attachPreview").attachPreview(u.canvas)}async function bp(u){ie("setPreview").setPreview(u.background,u.fps!==void 0?{fps:u.fps}:void 0)}async function vp(){H?.clearPreview()}async function xp(u){let e=ie("setPreset");if(pe.family==="mediapipe-selfie")throw new Error("handleSetPreset: presets select Longpipe tiers; not available with a MediaPipe model");if(!u.weights)throw new Error("handleSetPreset: weights required for runtime preset swap");if(u.preset==="auto")throw new Error("handleSetPreset: 'auto' not supported on runtime swap (use at init for autotune)");let r=typeof u.preset=="string"?Ge(u.preset)??Pp(u.preset):u.preset;return e.setPreset(r,u.weights),ae=r,{resolvedPreset:r}}async function yp(u){if(!Y)throw new Error("setInput: not initialized");let e={...Y,inputReadable:u.inputReadable,inputPort:u.inputPort},r=Hr(e);if(Y=e,!Te){qr(r);return}let t=jr;Kr(),await t?.catch(()=>{}),Xr(r,Te)}function wp(){if(H)return{...H.getStats(),latencyMs:zr()};if(!Y)return null;let u=performance.now();for(;oe.length&&u-oe[0]>1e3;)oe.shift();return{fps:oe.length,modelFps:0,modelMs:0,displayMs:0,skipped:0,preset:"none",skipFrames:0,enabled:!1,inputPath:Y.topology.input,outputPath:Y.topology.output,backend:"none",latencyMs:zr()}}async function kp(u){switch(u.action){case"lose-backend":{let e=ie("debug").backendHandle;if(e.device)e.device.destroy();else if(e.gl){let r=e.gl.getExtension("WEBGL_lose_context");if(!r)throw new Error("WEBGL_lose_context unavailable");r.loseContext()}else throw new Error("debug: unknown backend");return}case"hang":return new Promise(()=>{});case"throw":throw new Error("debug: simulated failure")}}async function Tp(){Pe=!0,_e&&clearInterval(_e),_e=null;let u=jr;Kr(),await Promise.race([Promise.all([u?.catch(()=>{}),qr(Y?.inputReadable)]),new Promise(e=>setTimeout(e,300))]),H?.destroy(),H=null,ae=null}function Pp(u){throw new Error(\`handleSetPreset: unknown preset '\${u}'\`)}function Cp(u,e){let r={request_id:u,res:e};self.postMessage(r)}function Wp(u,e){let r={request_id:u,error:{message:e}};self.postMessage(r)}function be(u,e){let r={request_id:u,res:e};try{self.postMessage(r)}catch{let t=e;t&&typeof t=="object"&&"cause"in t&&self.postMessage({request_id:u,res:{...t,cause:void 0}})}}function dw(u){be("stats",u)}function Gp(u){ie("setReframe").setReframe(u)}function Up(){ie("reframeNow").reframeNow()}function Bp(u){ie("setTouchup").setFaceEffects(u===null?null:{landmarkWeights:u.landmarkWeights,topology:{count:u.topoCount,uv:u.topoUv,idx:u.topoIdx,weightMask:u.weightMask},touchup:u.params})}export{dw as emitStats};
`;var w=b("pipeline");function lt(){{let r=new Blob([Q],{type:"application/javascript"}),e=URL.createObjectURL(r),t=new Worker(e,{type:"module"});return URL.revokeObjectURL(e),t}}function pt(r,e){if(e==="webgl"&&r!=="none")return "webgl";switch(r){case "webgl2":return "webgl";case "webgpu":return "webgpu";case "none":return "none";default:return "auto"}}var V={strength:.6,amount:8,detail:.35,style:"freq-sep"},ct=.15,ht={background:"blur",preset:"auto",weightsBaseUrl:a,audio:"passthrough",enabled:true,adaptive:true,debug:false},De={w:1280,h:720};function dt(r,e){if(e)return e;let n=r.getVideoTracks()[0]?.getSettings()??{};return {w:n.width||De.w,h:n.height||De.h}}function Me(r,e,t){let n=t==="f16"?".f16.bin":".bin";return `${r.replace(/\/$/,"")}/model_${e}${n}`}async function ft(r,e){let t=`${r.replace(/\/$/,"")}/${b$2[e].file}`,n=await fetch(t);if(!n.ok)throw new Error(`weights fetch failed: ${n.status} ${t}`);return n.arrayBuffer()}async function J(r,e,t){if(t==="f16"){let i=await fetch(Me(r,e,"f16"));if(i.ok)return i.arrayBuffer()}let n=Me(r,e,"f32"),a=await fetch(n);if(!a.ok)throw new Error(`weights fetch failed: ${a.status} ${n}`);return a.arrayBuffer()}async function mt(r,e){let t=r.replace(/\/$/,""),n=(async()=>{if(e==="f16"){let d=await fetch(`${t}/model_landmark_mesh.f16.bin`);if(d.ok)return d.arrayBuffer()}let u=`${t}/model_landmark_mesh.bin`,h=await fetch(u);if(!h.ok)throw new Error(`touchup: landmark weights fetch failed: ${h.status} ${u}`);return h.arrayBuffer()})(),a=fetch(`${t}/face_topology.json`).then(u=>{if(!u.ok)throw new Error(`touchup: face_topology.json fetch failed: ${u.status}`);return u.json()}),i=fetch(`${t}/weight_mask.png`).then(async u=>{if(!u.ok)throw new Error(`touchup: weight_mask.png fetch failed: ${u.status}`);return createImageBitmap(await u.blob())}),[l,s,o]=await Promise.all([n,a,i]);return {landmarkWeights:l,topoCount:s.count,topoUv:new Float32Array(s.uv),topoIdx:new Float32Array(s.idx),weightMask:o}}function Be(){let r,e,t={settled:false};return t.promise=new Promise((n,a)=>{r=n,e=a;}),t.promise.catch(()=>{}),t.resolve=()=>{t.settled||(t.settled=true,r());},t.reject=n=>{t.settled||(t.settled=true,e(n));},t}function Z(r){return r.catch(()=>{}),r}var gt=r=>r==="webgl"?"webgl2":r,ee=class{stream;ready;opts;inputStream;topology;outputSize;output;retiredOutputs=[];input=null;pendingInput=null;worker=null;controller=null;gen=0;status="starting";passthroughError=null;readyResolve;readyReject;readySettled=false;op=Be();desired;presetOverride=null;adaptiveEligible;activeBackend=null;backendKind=null;resolvedPreset=null;modelLoaded=false;modelLoading=null;pendingWeights=null;resolvedDtype="f32";preferBackend="auto";webgpuLosses=0;workerBackendKind=null;attemptBackend=null;restarts=0;recoveryReason=null;recoveryAttempts=0;restartTimer=null;healthySince=0;watchdog=null;busy=0;lastHeartbeat=0;lastFramesOut=-1;lastProgressAt=0;inputAtProgress=null;meter;unwatchInput=null;adaptive=null;denoiser=null;touchupAssets=null;weightsBaseUrl=a;modelBaseUrl=a;model;modelName;bgCleanup=null;previewBgCleanup=null;previewAttached=false;constructor(e,t){let n=Object.fromEntries(Object.entries(t).filter(([,s])=>s!==void 0)),a={...ht,...n};this.opts=a,a$1(a.debug),we(t.model,t),this.modelName=t.model??"longpipe",this.inputStream=e,this.topology={...ge()},this.pendingInput=B(this.topology.input,e),this.outputSize=dt(e,a.outputResolution),this.model=be(t.model,this.outputSize),this.output=Y(this.topology.output,this.outputSize);let i=_e(a.audio),l;if(i.mode==="denoise"){let s=e.getAudioTracks()[0];if(s)try{this.denoiser=new c$1(s,{model:i.denoise?.model??"auto",weightsBaseUrl:a.weightsBaseUrl,postFilterBeta:i.denoise?.postFilterBeta,gruLeak:i.denoise?.gruLeak,enabled:i.denoise?.enabled,onError:o=>this.emitError(new c("audio",o)),onSuspended:()=>this.emitError(new c("audio-suspended","audio: the AudioContext is suspended by the autoplay policy, so the output carries the original (not denoised) audio on a new track (onAudioTrackChanged); denoise starts on the next user gesture, or call pipeline.resumeAudio() from one")),onOutputTrackChanged:(o,u,h)=>this.swapAudioTrack(o,u,h)}),l=this.denoiser.outputTrack;}catch(o){this.denoiser=null,i={mode:"passthrough"},queueMicrotask(()=>this.emitError(new c("audio",`audio denoise unavailable (${A(o)}); passing the original audio through`,{cause:o})));}else queueMicrotask(()=>this.emitError(new c("audio",'audio: "denoise" requested but the input stream has no audio track')));}this.stream=ve(this.output.videoTrack,e,i,l),this.output.startRaw(e),this.desired={background:a.background,enabled:a.enabled,touchup:t.touchup??null,reframe:t.reframe??null},this.adaptiveEligible=a.preset==="auto"&&a.adaptive&&!P(this.model),this.ready=new Promise((s,o)=>{this.readyResolve=s,this.readyReject=o;}),this.weightsBaseUrl=a.weightsBaseUrl,this.modelBaseUrl=P(this.model)&&t.weightsBaseUrl===void 0?b$1:a.weightsBaseUrl,this.meter=new G(()=>this.inputStream.getVideoTracks()[0],()=>this.input?.framesIn??this.pendingInput?.framesIn),this.watchInputTrack(),this.watchdog=setInterval(()=>this.watchdogTick(),1e3),this.startWorker();}swapAudioTrack(e,t,n){this.status!=="destroyed"&&(this.stream.removeTrack(t),this.stream.addTrack(e),w(`audio output track changed (${n?"denoised":"original audio: AudioContext not running"})`),D(()=>this.opts.onAudioTrackChanged?.({stream:this.stream,audioTrack:e,previousTrack:t,denoised:n})));}static unlockAudio(){c$1.unlock();}get backend(){return this.activeBackend}then(e,t){return this.ready.then(()=>e?e(this):this,t)}async startWorker(){if(this.status==="destroyed"||this.status==="ended")return;let e=++this.gen,t=this.recoveryReason!==null,n=this.pendingInput??B(this.topology.input,this.inputStream);this.pendingInput=null,this.input=n,!this.output.reusable&&this.worker&&this.takeoverOutput(this.recoveryReason??"worker-crash");let a=this.output.attachWorker();this.workerBackendKind=null;let i=lt(),l=new H(i,(s,o)=>{e===this.gen&&this.recover("worker-crash",s,o);});this.worker=i,this.controller=l,l.addPersistentListener("error",s=>this.onWorkerError(e,s)),l.addPersistentListener("heartbeat",s=>this.onHeartbeat(e,s.framesOut)),l.addPersistentListener("inputEnded",()=>{e===this.gen&&this.checkInputEnded();}),this.lastHeartbeat=performance.now();try{w(t?"restarting worker\u2026":"starting worker\u2026");let s=await this.normalizeDesiredBackground();if(e!==this.gen){s.cleanup?.();return}this.bgCleanup?.(),this.bgCleanup=s.cleanup??null;let o=this.presetOverride??(t&&this.resolvedPreset&&this.backendKind===this.lastBackendKindFor(this.preferBackend)?this.resolvedPreset:this.opts.preset),u={topology:this.topology,model:this.model,preset:o,background:s.background,enabled:this.desired.enabled,backend:this.attemptBackend=m.forceBackend??pt(this.opts.backend,this.preferBackend),dtype:this.opts.dtype??"f16",canvasSize:this.outputSize,debug:this.opts.debug,heartbeatMs:m.heartbeatMs,...n.initFields,...a.initFields},h=[...n.transferList,...a.transferList,...s.transferList??[]];w("sending init\u2026");let d=await this.busyCall(()=>l.sendMessage("init",u,h,{timeoutMs:m.initTimeoutMs}));if(e!==this.gen)return;if(w("init resolved:",d),this.resolvedDtype=d.resolvedDtype,this.workerBackendKind=d.resolvedBackend==="none"?null:d.resolvedBackend,d.resolvedBackend==="none"){this.onNoBackend(d,t);return}if(this.resolvedPreset=d.resolvedPreset,this.modelLoaded=!1,this.modelLoading=null,this.desired.enabled&&(await this.loadModel(l,e),e!==this.gen))return;this.backendKind=d.resolvedBackend,this.activeBackend=gt(d.resolvedBackend),this.onRunning(e);}catch(s){let o=this.status;if(e!==this.gen||o==="destroyed"||o==="ended")return;if(W(s)&&(s.type==="worker-crash"||s.type==="control-timeout")){this.recover("worker-crash",s.message,s,{silent:t});return}let u=new c("init-failed",L("init failed",A(s)),{cause:s});if(t){w("restart attempt failed:",u.message),this.recover(this.recoveryReason??"worker-crash",u.message,s,{silent:true});return}console.error("[longpipe/pipeline] bootstrap failed:",s),this.enterPassthrough(u);}}lastBackendKindFor(e){return e==="webgl"?"webgl":this.backendKind}async loadModel(e,t){let n=this.resolvedPreset,a=this.pendingWeights;if(this.pendingWeights=null,a||(a=P(this.model)?await ft(this.modelBaseUrl,this.model.variant):await J(this.modelBaseUrl,n.model,this.resolvedDtype)),t!==this.gen)return;w("weights bytes:",a.byteLength),w("sending startRender\u2026");let i=a;await this.busyCall(()=>e.sendMessage("startRender",{weights:i,preset:n??void 0},[i],{timeoutMs:m.initTimeoutMs})),t===this.gen&&(this.modelLoaded=true);}onRunning(e){let t=this.recoveryReason,n=this.recoveryAttempts;this.status="running",this.passthroughError=null,this.healthySince=performance.now(),this.lastHeartbeat=performance.now(),this.lastProgressAt=performance.now(),this.inputAtProgress=this.meter.totalFrames(),this.recoveryReason=null,this.recoveryAttempts=0,this.replayFeatures(e),this.startAdaptive(),this.op.resolve();let a=this.readyInfo();this.readySettled||(this.readySettled=true,w("ready:",a),D(()=>this.opts.onReady?.(a)),this.readyResolve(a)),t&&(w("recovered after",t,"attempts:",n),this.previewAttached&&(this.previewAttached=false,this.emitError(new c("control-failed","preview: the preview canvas was lost when the worker restarted; call attachPreview() with a new canvas"))),D(()=>this.opts.onRecovered?.({reason:t,backend:this.activeBackend??"none",attempts:n})));}onNoBackend(e,t){this.activeBackend="none",this.backendKind=null,this.output.path==="transfer-capture"&&!e.workerDrawsRaw&&this.takeoverOutput("no-backend"),e.workerDrawsRaw||(this.input?.cleanup(),this.input=null);let n=e.backendError?` (${e.backendError})`:"",a=t?new c("recovery-failed",`recovery failed: no usable GPU backend after ${this.recoveryReason}${n}; output is the raw camera`):new c("no-backend",`no usable GPU backend${n}; output is the raw camera, effects are off`);this.enterPassthrough(a);}enterPassthrough(e){if(this.status="passthrough",this.passthroughError=e,this.recoveryReason=null,this.adaptive?.stop(),this.adaptive=null,this.emitError(e),this.op.reject(e),!this.readySettled)if(this.readySettled=true,e.fatal)this.readyReject(e);else {let t=this.readyInfo();D(()=>this.opts.onReady?.(t)),this.readyResolve(t);}}recover(e,t,n,a={}){if(this.status==="destroyed"||this.status==="ended"||(w("recover:",e,t),this.checkInputEnded()))return;this.recoveryReason===null&&(this.recoveryReason=e);let l=this.status==="starting"||this.status==="recovering";if(a.silent||this.emitError(new c(e,`${t}; output switched to the raw camera, restarting`,{cause:n})),this.gen++,this.adaptive?.stop(),this.adaptive=null,this.controller?.terminate(e==="backend-lost"?"GPU backend lost":"worker restarted",m.retireGraceMs),this.input?.cleanup(),this.input=null,this.restartTimer&&clearTimeout(this.restartTimer),this.restartTimer=null,this.status="recovering",this.op.settled&&(this.op=Be()),this.output.startRaw(this.inputStream)||this.takeoverOutput(e),(this.workerBackendKind==="webgpu"||this.workerBackendKind===null&&this.attemptBackend!==null&&this.attemptBackend!=="webgl"&&this.attemptBackend!=="none")&&(e==="backend-lost"||l)&&(this.webgpuLosses++,this.webgpuLosses>=2&&(this.preferBackend="webgl")),this.restarts>=m.maxRestarts){let u=new c("recovery-failed",`recovery failed after ${this.restarts} restarts (${this.recoveryReason}: ${t}); output stays on the raw camera`,{cause:n});this.controller=null,this.worker=null,this.activeBackend="none",this.enterPassthrough(u);return}let o=m.restartBackoffMs[Math.min(this.restarts,m.restartBackoffMs.length-1)]??1e3;this.restarts++,this.recoveryAttempts++,w(`restart #${this.restarts} in ${o} ms (prefer ${this.preferBackend})`),this.restartTimer=setTimeout(()=>{this.restartTimer=null,this.startWorker();},o);}takeoverOutput(e){let t=this.output,n=Y("bitmap-shuttle",this.outputSize);this.retiredOutputs.push(t),this.output=n,this.topology={...this.topology,output:"bitmap-shuttle"},n.startRaw(this.inputStream),this.stream.removeTrack(t.videoTrack),this.stream.addTrack(n.videoTrack),w("output moved to bitmap-shuttle (track changed):",e),D(()=>this.opts.onTrackChanged?.({stream:this.stream,videoTrack:n.videoTrack,previousTrack:t.videoTrack,reason:e}));}onWorkerError(e,t){if(e===this.gen){if(t.type==="backend-lost"){this.recover("backend-lost",t.message,t.cause);return}if(t.type==="worker-crash"){this.recover("worker-crash",t.message,t.cause);return}this.emitError(new c(t.type,t.message,{fatal:t.fatal,source:t.source,cause:t.cause}));}}onHeartbeat(e,t){if(e!==this.gen)return;let n=performance.now();this.lastHeartbeat=n,t!==this.lastFramesOut&&(this.lastFramesOut=t,this.lastProgressAt=n,this.inputAtProgress=this.meter.totalFrames());}async busyCall(e){this.busy++;try{return await e()}finally{this.busy--,this.lastHeartbeat=Math.max(this.lastHeartbeat,performance.now()),this.lastProgressAt=Math.max(this.lastProgressAt,performance.now()),this.inputAtProgress=this.meter.totalFrames();}}watchdogTick(){if(this.status==="destroyed"||(this.meter.sample(),this.checkInputEnded())||this.status!=="running"||this.busy>0||!this.controller)return;let e=performance.now();if(e-this.healthySince>m.stableResetMs&&(this.restarts=0),e-this.lastHeartbeat>m.watchdogMs){this.recover("worker-crash",`worker unresponsive for ${Math.round(e-this.lastHeartbeat)} ms`);return}let t=this.meter.totalFrames();t!==null&&this.inputAtProgress!==null&&t-this.inputAtProgress>=5&&e-this.lastProgressAt>m.stallMs&&this.recover("worker-crash",`worker output stalled for ${Math.round(e-this.lastProgressAt)} ms while the camera kept delivering`);}watchInputTrack(){this.unwatchInput?.();let e=this.inputStream.getVideoTracks()[0];if(!e){this.unwatchInput=null;return}let t=()=>this.checkInputEnded();e.addEventListener("ended",t),this.unwatchInput=()=>e.removeEventListener("ended",t);}checkInputEnded(){if(this.status==="ended")return  true;if(this.status==="destroyed")return  false;let e=this.inputStream.getVideoTracks()[0];return !e||e.readyState!=="ended"?false:(this.onCameraEnded(),true)}onCameraEnded(){w("input video track ended"),this.status="ended",this.gen++,this.restartTimer&&clearTimeout(this.restartTimer),this.restartTimer=null,this.adaptive?.stop(),this.adaptive=null,this.controller?.terminate("camera ended",m.retireGraceMs),this.controller=null,this.input?.cleanup(),this.input=null,this.pendingInput?.cleanup(),this.pendingInput=null,this.output.end();for(let t of this.retiredOutputs)t.end();let e=new c("camera-ended","the input video track ended; the output video track has ended too. Create a new pipeline (or call setInputStream() before stopping the old camera to switch cameras)");this.op.reject(e),this.emitError(e),this.readySettled||(this.readySettled=true,this.readyReject(e));}setInputStream(e){return Z(this.switchInput(e).catch(t=>{throw this.reportControlError("setInputStream",t)}))}async switchInput(e){let t=e.getVideoTracks()[0];if(!t||t.readyState==="ended")throw new c("control-failed","setInputStream: the stream has no live video track");if(this.status==="destroyed"||this.status==="ended")throw new c("control-failed",`setInputStream: pipeline is ${this.status}`);if(this.inputStream=e,this.watchInputTrack(),this.meter.reset(),(this.status==="recovering"||this.status==="passthrough"&&this.activeBackend==="none")&&this.output.startRaw(e),this.pendingInput){this.pendingInput.cleanup(),this.pendingInput=B(this.topology.input,e);return}if(this.status==="passthrough"&&this.activeBackend==="none"&&!this.input)return;let a=this.controller;if(!a||a.isTerminated||this.status==="recovering")return;let i=B(this.topology.input,e),l=this.gen;try{await a.sendMessage("setInput",i.initFields,i.transferList);}catch(s){if(i.cleanup(),l!==this.gen)return;throw s}if(l!==this.gen){i.cleanup();return}this.input?.cleanup(),this.input=i;}async whenOperational(e){for(;;){switch(this.status){case "running":if(this.controller&&!this.controller.isTerminated)return this.controller;break;case "destroyed":throw new c("control-failed",`${e}: pipeline destroyed`);case "ended":throw new c("camera-ended",`${e}: the input camera ended`);case "passthrough":{let a=this.passthroughError;throw new c(a?.type??"no-backend",`${e}: effects are unavailable \u2014 ${a?.message??"no GPU backend"}`,{fatal:a?.fatal})}}let t=null,n=new Promise((a,i)=>{t=setTimeout(()=>i(new c("control-timeout",`${e}: the pipeline did not become ready within ${m.queueTimeoutMs} ms`)),m.queueTimeoutMs);});try{await Promise.race([this.op.promise,n]);}finally{t&&clearTimeout(t);}}}control(e,t){return Z((async()=>{try{let n=await this.whenOperational(e);return await t(n)}catch(n){throw this.reportControlError(e,n)}})())}reportControlError(e,t){let n=W(t)?t:new c("control-failed",L(`${e} failed`,A(t)),{cause:t});return (n.type==="control-failed"||n.type==="control-timeout"||n.type==="background-load")&&this.emitError(n),n}refuse(e,t){return Z(Promise.reject(this.reportControlError(e,t)))}async normalizeOrFail(e,t){try{return await fe(e,{onVideoError:n=>this.emitError(new c("background-load",`${n}; showing its last frame`))})}catch(n){throw new c("background-load",`${t}: ${A(n)}; keeping the previous background`,{cause:n})}}async normalizeDesiredBackground(){try{return await this.normalizeOrFail(this.desired.background,"background")}catch(e){let t=e;return this.emitError(new c("background-load",t.message.replace("keeping the previous background","using 'none'"),{cause:t.cause})),this.desired.background="none",{background:{kind:"none"}}}}setBackground(e){return this.control("setBackground",async t=>{let n=await this.normalizeOrFail(e,"setBackground"),a=this.gen,i=this.desired.background;this.desired.background=e;try{await t.sendMessage("setBackground",n.background,n.transferList??[]);}catch(s){throw n.cleanup?.(),a===this.gen&&(this.desired.background=i),s}if(a!==this.gen){n.cleanup?.();return}let l=this.bgCleanup;this.bgCleanup=n.cleanup??null,l?.();})}setTouchup(e){return e!==null&&P(this.model)?this.refuse("setTouchup",E("touchup",this.modelName)):this.control("setTouchup",async t=>{await this.sendTouchup(t,e),this.desired.touchup=e;})}async sendTouchup(e,t){if(t===null){await e.sendMessage("setTouchup",null);return}this.touchupAssets||(this.touchupAssets=await mt(this.weightsBaseUrl,this.resolvedDtype));let n={strength:t.strength??V.strength,amount:t.amount??V.amount,detail:t.detail??V.detail,style:t.style??V.style,thresh:ct},a=this.touchupAssets;await this.busyCall(()=>e.sendMessage("setTouchup",{...a,params:n}));}setReframe(e){return e&&P(this.model)?this.refuse("setReframe",E("reframe",this.modelName)):this.control("setReframe",async t=>{await this.busyCall(()=>t.sendMessage("setReframe",Ue(e))),this.desired.reframe=e||null;})}reframe(){return P(this.model)?this.refuse("reframe",E("reframe",this.modelName)):this.control("reframe",e=>e.sendMessage("reframeNow",void 0))}replayFeatures(e){let t=this.controller;if(!t)return;let n=a=>i=>{e===this.gen&&this.emitError(new c("control-failed",`${a} init failed: ${A(i)}`,{cause:i}));};this.desired.reframe&&this.busyCall(()=>t.sendMessage("setReframe",Ue(this.desired.reframe))).catch(n("reframe")),this.desired.touchup&&this.sendTouchup(t,this.desired.touchup).catch(n("touchup"));}setPreset(e,t){return P(this.model)?this.refuse("setPreset",E("setPreset",this.modelName)):(this.adaptive?.stop(),this.adaptive=null,this.control("setPreset",async n=>{if(e==="auto")throw new c("control-failed","setPreset('auto') isn't supported at runtime; pass preset: 'auto' at construction");let a=typeof e=="string"?le(e):e;if(!a)throw new c("control-failed",`setPreset: unknown preset '${String(e)}'`);let i={...a,dtype:this.resolvedDtype};if(!this.modelLoaded&&!this.modelLoading){this.resolvedPreset=i,this.presetOverride=i,this.pendingWeights=t??null;return}let l=t??await J(this.modelBaseUrl,i.model,this.resolvedDtype),s=await this.busyCall(()=>n.sendMessage("setPreset",{preset:i,weights:l},[l],{timeoutMs:m.initTimeoutMs}));this.resolvedPreset=s.resolvedPreset,this.presetOverride=s.resolvedPreset;}))}startAdaptive(){if(this.adaptive?.stop(),this.adaptive=null,!this.adaptiveEligible||this.presetOverride||!this.resolvedPreset||!this.backendKind||!this.modelLoaded)return;let e=this.resolvedDtype;this.adaptive=new O({backendKind:this.backendKind,initialModel:this.resolvedPreset.model,getInputFps:()=>this.meter.fps(),fetchWeights:t=>J(this.modelBaseUrl,t,e),getStats:()=>this.getStats(),swapPreset:async(t,n)=>{let a=await this.whenOperational("adaptive"),i=await this.busyCall(()=>a.sendMessage("setPreset",{preset:t,weights:n},[n],{timeoutMs:m.initTimeoutMs}));this.resolvedPreset=i.resolvedPreset;},onError:t=>{W(t.cause)&&t.cause.type==="worker-crash"||this.emitError(new c("adaptive",t.message,{cause:t.cause}));}}),this.adaptive.start();}attachPreview(e){let t;try{t=e.transferControlToOffscreen();}catch(n){return this.refuse("attachPreview",n)}return this.control("attachPreview",async n=>{await n.sendMessage("attachPreview",{canvas:t},[t]),this.previewAttached=true;})}setPreview(e){return this.control("setPreview",async t=>{let n=await this.normalizeOrFail(e.background,"setPreview");try{await t.sendMessage("setPreview",{background:n.background,fps:e.fps},n.transferList??[]);}catch(i){throw n.cleanup?.(),i}let a=this.previewBgCleanup;this.previewBgCleanup=n.cleanup??null,a?.();})}clearPreview(){return this.control("clearPreview",async e=>{await e.sendMessage("clearPreview",{}),this.previewBgCleanup?.(),this.previewBgCleanup=null;})}setEnabled(e){return this.control("setEnabled",async t=>{if(e&&!this.modelLoaded){let n=this.gen;this.modelLoading??=this.loadModel(t,n).finally(()=>{this.modelLoading=null;}),await this.modelLoading,n===this.gen&&this.startAdaptive();}await t.sendMessage("setEnabled",{enabled:e}),this.desired.enabled=e;})}async getStats(){let e=this.meter.fps(),t={status:this.status,inputFps:e,restarts:this.restarts,backend:(this.status==="running"?this.activeBackend:"none")??"none"},n=this.controller,a=null;if(n&&!n.isTerminated&&this.status!=="recovering")try{a=await n.sendMessage("getStats",{},[],{timeoutMs:2e3});}catch{a=null;}let i=this.status==="recovering"||this.status==="passthrough"&&(!a||a.backend==="none"&&a.fps===0);return {fps:i||!a?Math.round(e??0):a.fps,modelFps:a?.modelFps??0,modelMs:a?.modelMs??0,displayMs:a?.displayMs??0,skipped:a?.skipped??0,preset:a?.preset??"none",skipFrames:a?.skipFrames??0,latencyMs:i?0:a?.latencyMs??0,enabled:a?.enabled??false,inputPath:this.topology.input,outputPath:this.output.path,...t}}readyInfo(){return {backend:this.activeBackend??"none",dtype:this.activeBackend&&this.activeBackend!=="none"?this.resolvedDtype:null,preset:this.activeBackend==="none"||!this.modelLoaded?null:P(this.model)?`mediapipe-selfie-${this.model.variant}`:this.resolvedPreset?.model??null}}emitError(e){e.fatal?console.error(`[longpipe/pipeline] ${e.type}:`,e.message):console.warn(`[longpipe/pipeline] ${e.type}:`,e.message),D(()=>this.opts.onError?.(e));}setDenoise(e){if(this.denoiser){if(typeof e=="boolean"){this.denoiser.setEnabled(e);return}(e.postFilterBeta!=null||e.gruLeak!=null)&&this.denoiser.setConfig({postFilterBeta:e.postFilterBeta,gruLeak:e.gruLeak}),e.enabled!=null&&this.denoiser.setEnabled(e.enabled);}}async resumeAudio(){try{await this.denoiser?.resume();}catch(e){let t=new c("audio",L("resumeAudio failed",A(e)),{cause:e});throw this.emitError(t),t}}getAudioStats(){return this.denoiser?.getStats()??null}_debug(e){return e==="terminate"?(this.worker?.terminate(),Promise.resolve()):this.controller?this.controller.sendMessage("debug",{action:e}).then(()=>{}):Promise.reject(new c("control-failed","_debug: no worker"))}destroy(){if(this.status!=="destroyed"){this.status="destroyed",this.gen++,this.watchdog&&clearInterval(this.watchdog),this.watchdog=null,this.restartTimer&&clearTimeout(this.restartTimer),this.restartTimer=null,this.unwatchInput?.(),this.adaptive?.stop(),this.adaptive=null,this.denoiser?.destroy(),this.denoiser=null,this.bgCleanup?.(),this.bgCleanup=null,this.previewBgCleanup?.(),this.previewBgCleanup=null,this.controller?.terminate("pipeline destroyed",m.retireGraceMs),this.controller=null,this.input?.cleanup(),this.pendingInput?.cleanup(),this.output.cleanup();for(let e of this.retiredOutputs)e.cleanup();this.op.reject(new c("control-failed","pipeline destroyed"));}}};function Ue(r){return r===true?{}:r===false||r===null?null:r}function D(r){try{r();}catch(e){console.error("[longpipe/pipeline] callback threw:",e);}}export{ee as EffectsPipeline,c as LongpipeError,C as PRESETS};