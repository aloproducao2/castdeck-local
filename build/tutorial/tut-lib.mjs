// Biblioteca do tutorial em vídeo: dirige o Edge real via CDP (:9335) e grava a interface do CastDeck.
//   - câmera simulada: foto (build/tmp/tutorial/img/*-720.jpg) com leve movimento (respiração/zoom), por página
//   - cursor falso animado e legenda (desenhados na própria página, entram na gravação)
//   - gravação: Page.startScreencast da aba "em cena"; frames com horário real, montados depois pelo FFmpeg
import fs from 'node:fs';
import path from 'node:path';

export const CDP = process.env.CDP || 'http://127.0.0.1:9335';
export const BASE = process.env.BASE || 'http://localhost:3200';
export const W = 1600;
export const H = 900;
export const DIR = 'D:/REA/build/tmp/tutorial';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const img = (n) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, 'img', `${n}-720.jpg`)).toString('base64');

// câmera falsa: desenha a foto num canvas a 30 fps com um "respirar" suave para parecer vídeo
const camJs = (photo) => `(()=>{const SRC=${JSON.stringify(photo)};
 const mk=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');const im=new Image();im.src=SRC;const t0=performance.now();
  setInterval(()=>{if(!im.complete)return;const t=(performance.now()-t0)/1000;const s=1.03+0.012*Math.sin(t*0.9);const dx=6*Math.sin(t*0.5),dy=4*Math.sin(t*0.7+1);
   const w=1280*s,h=720*s;x.drawImage(im,(1280-w)/2+dx,(720-h)/2+dy,w,h);},33);return c.captureStream(30).getVideoTracks()[0]};
 const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(mk());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
 navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();const v=d.filter(x=>x.kind!=='videoinput');return [...v,{kind:'videoinput',deviceId:'webcam',label:'Webcam HD',groupId:'g',toJSON(){return this}}]};})()`;

// cursor + legenda dentro da página (ficam acima de tudo e não recebem clique)
const NO_CAPTION = process.env.NO_CAPTION === '1' || process.env.NO_CAPTION === 'true';

const OVERLAY = `(()=>{if(window.__tut)return;const st=document.createElement('style');st.textContent=\`
 #tut-cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:transform .9s cubic-bezier(.4,.1,.2,1);transform:translate(800px,450px)}
 #tut-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))}
 #tut-cur.click::after{content:'';position:absolute;left:-14px;top:-14px;width:30px;height:30px;border-radius:50%;border:3px solid #a78bfa;animation:tutp .5s ease-out forwards}
 @keyframes tutp{from{opacity:1;transform:scale(.3)}to{opacity:0;transform:scale(1.6)}}
 #tut-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:2147483646;pointer-events:none;max-width:1180px;
  background:rgba(12,10,24,.86);backdrop-filter:blur(8px);color:#fff;font:600 25px/1.35 Inter,Segoe UI,system-ui,sans-serif;padding:16px 28px;border-radius:16px;
  border:1px solid rgba(167,139,250,.45);box-shadow:0 10px 40px rgba(0,0,0,.45);text-align:center;transition:opacity .35s, transform .35s}
 #tut-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
 #tut-cap small{display:block;font-weight:500;font-size:18px;color:#c4b5fd;margin-top:4px}
 #tut-step{position:fixed;left:24px;top:70px;z-index:2147483646;pointer-events:none;background:linear-gradient(90deg,#7c3aed,#06b6d4);color:#fff;
  font:700 15px Inter,Segoe UI,sans-serif;padding:7px 14px;border-radius:999px;opacity:0;transition:opacity .3s;letter-spacing:.3px}
 #tut-step.on{opacity:.95}
 .tut-hl{outline:3px solid #a78bfa!important;outline-offset:3px;border-radius:8px;transition:outline-color .3s}
 ${NO_CAPTION ? '#tut-cap,#tut-step{display:none!important;visibility:hidden!important;opacity:0!important}' : ''}
\`;document.documentElement.appendChild(st);
 const c=document.createElement('div');c.id='tut-cur';c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
 const cap=document.createElement('div');cap.id='tut-cap';const stp=document.createElement('div');stp.id='tut-step';
 document.documentElement.append(c,cap,stp);
 window.__tut={x:800,y:450,
  move(x,y){this.x=x;this.y=y;c.style.transform='translate('+x+'px,'+y+'px)'},
  click(){c.classList.remove('click');void c.offsetWidth;c.classList.add('click')},
  cap(t,s){if(!t || ${NO_CAPTION}){cap.classList.remove('on');return}cap.innerHTML=t+(s?'<small>'+s+'</small>':'');cap.classList.add('on')},
  step(t){if(!t || ${NO_CAPTION}){stp.classList.remove('on');return}stp.textContent=t;stp.classList.add('on')}};})()`;

let bws;
let bid = 0;
const bp = new Map();
export async function bsend(method, params = {}) {
  if (!bws) {
    const v = await (await fetch(`${CDP}/json/version`)).json();
    bws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r) => (bws.onopen = r));
    bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
  }
  return new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
}

// ---------- gravação ----------
// Cada frame vira um arquivo com o horário real; "cut" marca onde o vídeo pode ser cortado (esperas longas).
export const rec = { on: false, frames: [], page: null, dir: path.join(DIR, 'frames'), paused: false };
export function recStart() {
  fs.rmSync(rec.dir, { recursive: true, force: true });
  fs.mkdirSync(rec.dir, { recursive: true });
  rec.on = true;
  rec.frames = [];
}
export async function recFocus(p) {
  // troca a aba gravada (ex.: estúdio → janela do convidado)
  if (rec.page && rec.page !== p) await rec.page.send('Page.stopScreencast').catch(() => {});
  rec.page = p;
  await p.send('Page.bringToFront');
  await p.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
}
export function recPause(v) { rec.paused = v; }
export async function recStop() {
  if (rec.page) await rec.page.send('Page.stopScreencast').catch(() => {});
  rec.on = false;
  fs.writeFileSync(path.join(rec.dir, 'frames.json'), JSON.stringify(rec.frames));
  return rec.frames.length;
}

let winN = 0;
export async function openPage(url, { cam = null, w = W, h = H, left = null } = {}) {
  const c = await bsend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const targetId = c.result.targetId;
  const win = await bsend('Browser.getWindowForTarget', { targetId });
  await bsend('Browser.setWindowBounds', { windowId: win.result.windowId, bounds: { windowState: 'normal', left: left ?? 20 + winN++ * 30, top: 10, width: w + 16, height: h + 140 } });
  const ws = new WebSocket(`${CDP.replace('http', 'ws')}/devtools/page/${targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  const p = { targetId, errors };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Page.screencastFrame') {
      p.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
      if (rec.on && !rec.paused && rec.page === p) {
        const f = path.join(rec.dir, `f${String(rec.frames.length).padStart(6, '0')}.jpg`);
        fs.writeFileSync(f, Buffer.from(m.params.data, 'base64'));
        rec.frames.push({ f: path.basename(f), t: Date.now() });
      }
    }
  };
  p.send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await p.send('Runtime.enable');
  await p.send('Page.enable');
  await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (cam) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: camJs(img(cam)) });
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{${OVERLAY}})` });
  p.ev = async (expr) => {
    const r = await p.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  p.go = async (u) => { await p.send('Page.navigate', { url: u }); };
  p.waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } throw new Error('tempo esgotado: ' + expr); };
  p.shot = async (file) => { const r = await p.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  p.overlay = () => p.ev(OVERLAY);
  // legenda e etiqueta de etapa
  p.cap = async (t, s = '') => { await p.overlay(); await p.ev(`__tut.cap(${JSON.stringify(t)},${JSON.stringify(s)})`); };
  p.step = async (t) => { await p.overlay(); await p.ev(`__tut.step(${JSON.stringify(t)})`); };
  // centro de um elemento (rola até ele se preciso)
  p.box = async (sel) => p.ev(`(()=>{const e=${sel.startsWith('js:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`};if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  p.moveTo = async (sel, wait = 1000) => { await p.overlay(); const b = await p.box(sel); if (!b) throw new Error('não achei ' + sel); await p.ev(`__tut.move(${b.x},${b.y})`); await sleep(wait); return b; };
  // clique "humano": move o cursor, pulso visual e clique real via eventos de mouse do CDP
  p.click = async (sel, { wait = 1000, after = 700 } = {}) => {
    const b = await p.moveTo(sel, wait);
    await p.ev('__tut.click()');
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(after);
  };
  p.type = async (sel, text, { delay = 55 } = {}) => {
    await p.click(sel, { after: 250 });
    await p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.select?.()})()`);
    for (const ch of text) { await p.send('Input.insertText', { text: ch }); await sleep(delay + Math.random() * 40); }
    await sleep(400);
  };
  p.close = () => bsend('Target.closeTarget', { targetId });
  await p.go(url);
  return p;
}
