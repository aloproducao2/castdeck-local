// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// CastDeck Local – servidor principal.
//  http://localhost:3000        -> painel + estúdio (somente neste PC)
//  https://<ip-lan>:3443        -> convidados na mesma rede
//  https://xxxx.trycloudflare.com -> convidados em qualquer lugar (túnel Cloudflare automático)
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { lanIps } from './net.js';
import { getCertificate } from './certs.js';
import { SignalingHub } from './signaling.js';
import { BroadcastManager, PRESETS } from './broadcast.js';
import { probeFfmpeg } from './ffmpeg.js';
import { Deps } from './deps.js';
import { Tunnel } from './tunnel.js';
import { Ingest } from './ingest.js';
import { TARGET, dataDir, recordingsDir, openFolder, revealFile, openFile, openBrowser, openAppWindow, pickFolder, setWindowTopmost } from './platform.js';
import { isFinalizing, cleanupTemp, isFragmented, finalizeRecording, needsCompatibility } from './recordings.js';
import { parseFeed } from './feeds.js';
import { PollHub } from './polls.js';
import { MsgHub } from './messages.js';
import { Updater } from './updater.js';
import { WhatsAppService } from './whatsapp.js';
import { Ytdlp } from './ytdlp.js';
import { DskHost } from './dsk.js';
import { SocialScraper } from './social-scraper.js';
import { ReplayStore } from './replay.js';
import { CaptionService } from './caption.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';

async function main() {

const packaged = !!process.pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public'); // dentro do .exe fica no snapshot
// CASTDECK_DATA/CASTDECK_RECORDINGS (só no modo dev): servidor com dados limpos, ex.: gravar o tutorial sem os estúdios dos testes
const DATA = packaged ? dataDir() : path.resolve(process.env.CASTDECK_DATA || path.join(ROOT, 'data'));
const DEFAULT_RECORDINGS = packaged ? recordingsDir() : path.resolve(process.env.CASTDECK_RECORDINGS || path.join(ROOT, 'recordings'));
const BIN = path.join(DATA, 'bin');
const HTTP_PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
// versão única (package.json): embutida pelo build-exe; em desenvolvimento, lida do arquivo
// eslint-disable-next-line no-undef
// rodando do código-fonte, CASTDECK_VERSION=1.0.0 simula uma versão antiga (teste do aviso de atualização)
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : process.env.CASTDECK_VERSION || await fs.readFile(path.join(ROOT, 'package.json'), 'utf8').then((t) => JSON.parse(t).version).catch(() => 'dev');

const isLoopback = (addr = '') => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

// "Local" = veio de fato deste PC. O cloudflared conecta via loopback, então o IP sozinho NÃO basta:
// tráfego do túnel traz cabeçalhos cf-*/x-forwarded-* e o Host é o domínio público.
// Checar o Host também bloqueia ataques de DNS rebinding contra o painel.
function isLocalReq(req) {
  const h = req.headers;
  if (!isLoopback(req.socket.remoteAddress)) return false;
  if (h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['x-forwarded-host']) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h.host || '');
}

// ---------- bootstrap ----------
const store = new Store(DATA);
// pasta das gravações: escolhida pelo usuário (Sistema → Pasta das gravações) ou a padrão
const recDir = () => store.getSettings().recordingsDir || DEFAULT_RECORDINGS;
await store.load();
cleanupTemp(recDir());
// FFmpeg e cloudflared vêm embutidos no executável (build/vendor/<sistema-arquitetura>/)
const deps = new Deps(BIN, path.join(ROOT, 'build', 'vendor', TARGET));
await deps.installBundled();
const tunnel = new Tunnel(deps, () => store.getSettings().tunnelProvider || 'cloudflare');

const ffmpegInfo = { path: 'ffmpeg', available: false, version: null, encoders: [], installing: false };
const ytdlp = new Ytdlp({ deps, ffmpegInfo, dataDir: DATA, recordingsDir: recDir });
async function detectFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, deps.exists('ffmpeg') ? deps.localPath('ffmpeg') : null, 'ffmpeg'].filter(Boolean);
  for (const c of candidates) {
    const info = await probeFfmpeg(c);
    if (info.available) {
      Object.assign(ffmpegInfo, info, { installing: false });
      if (!ffmpegInfo.encoders.some((e) => e.id === 'libx264')) ffmpegInfo.encoders.unshift({ id: 'libx264', label: 'CPU (x264)', hw: false });
      console.log(`[boot] FFmpeg ${info.version} | encoders: ${ffmpegInfo.encoders.map((e) => e.id).join(', ')}`);
      return true;
    }
  }
  return false;
}
console.log('[boot] verificando FFmpeg e encoders de hardware…');
if (!(await detectFfmpeg())) {
  console.warn('[boot] FFmpeg não encontrado – baixando automaticamente…');
  ffmpegInfo.installing = true;
  ffmpegInfo.error = 'Baixando o FFmpeg…';
  deps
    .ensure('ffmpeg')
    .then(detectFfmpeg)
    .catch((e) => {
      ffmpegInfo.installing = false;
      ffmpegInfo.error = 'Falha ao baixar o FFmpeg: ' + e.message;
      console.warn('[boot] ' + ffmpegInfo.error);
    });
}

const hub = new SignalingHub({ studioExists: (id) => !!store.getStudio(id), outKey: (id) => store.studioOutKey(id) });
const broadcasts = new BroadcastManager({ ffmpegInfo, recordingsDir: recDir, store });
const pollHub = new PollHub();
const msgHub = new MsgHub();
// entradas RTMP/SRT (drones e câmeras da rede local) pelo MediaMTX embutido
const ingest = new Ingest({ deps, store, ffmpegInfo, dataDir: DATA, lanIps });
const whatsapp = new WhatsAppService({ dataDir: DATA });
await whatsapp.init();
// nome da plataforma no releases.json do site (verificação/instalação de atualizações)
const UPDATE_TARGET = TARGET.replace(/^win-/, 'windows-') + (process.env.APPIMAGE ? '-appimage' : '');
const updater = new Updater({ dataDir: DATA, target: UPDATE_TARGET, version: APP_VERSION, packaged });

// ---------- HTTP app ----------
const app = express();
app.disable('x-powered-by');
// headers básicos: o painel não deve ser embutido por terceiros e respostas não devem ser "adivinhadas"
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});
// 2 MB cobre o áudio de recado (~1,2 MB em base64) sem deixar o parser global aceitar 25 MB do túnel.
app.use(express.json({ limit: '2mb' }));

const localOnly = (req, res, next) => {
  if (isLocalReq(req)) return next();
  res.status(403).json({ error: 'Disponível apenas no PC do estúdio (localhost).' });
};

// CSRF: loopback + Host não impedem uma página externa de fazer POST em localhost. Exige que a
// origem do navegador seja o próprio painel. Requisições de processos locais (sem Origin) continuam válidas.
function apiOriginGuard(req, res, next) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return res.status(403).json({ error: 'Origem não permitida.' });
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (!/^https?:$/.test(u.protocol) || u.host.toLowerCase() !== String(req.headers.host || '').toLowerCase()) {
        return res.status(403).json({ error: 'Origem não permitida.' });
      }
    } catch {
      return res.status(403).json({ error: 'Origem não permitida.' });
    }
  }
  next();
}

// Limite de escrita administrativa: evita que uma página/aba em loop ou um script local sature o servidor.
const apiRate = new Map();
function apiWriteLimit(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const key = req.socket.remoteAddress || 'local';
  const now = Date.now();
  const b = apiRate.get(key);
  if (!b || now - b.start > 60_000) apiRate.set(key, { start: now, n: 1 });
  else if (++b.n > 600) return res.status(429).json({ error: 'Muitas alterações em pouco tempo. Aguarde.' });
  next();
}

// Painel e estúdio: só no próprio PC. Convidados só acessam /join.
app.get(['/', '/index.html'], localOnly, (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/studio/:id', localOnly, (req, res) => res.sendFile(path.join(PUBLIC, 'studio.html')));
app.get(['/replay', '/replay.html'], localOnly, (req, res) => res.sendFile(path.join(PUBLIC, 'replay.html')));
app.get('/join/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'join.html')));
// câmera remota: celular/aparelho que só envia vídeo para o estúdio (link/QR em "＋ Câmera")
app.get('/cam/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'cam.html')));
// intercom de produção (câmeras/repórteres): página própria, áudio bidirecional
app.get('/intercom/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'intercom.html')));
// página pública de votação (QR Code da enquete)
app.get('/vote/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'vote.html')));
// página pública de mensagens do público (QR Code da caixa de mensagens: texto curto ou áudio)
app.get('/msg/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'msg.html')));
// saídas individuais para OBS/vMix (fonte de navegador); fora deste PC exigem a chave do link
app.get('/out/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'out.html')));
app.get('/remote/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'remote.html')));
// as p\u00e1ginas do host tamb\u00e9m seriam servidas pelo static (/studio.html, /index.html): bloqueia para quem n\u00e3o \u00e9 local
app.use((req, res, next) => (/^\/(index|studio|replay)(\.html)?\/?$/i.test(req.path) ? localOnly(req, res, next) : next()));
app.use(express.static(PUBLIC, { index: false, extensions: ['html'] }));

// API pública mínima para convidados
app.get('/api/public/studios/:id', (req, res) => {
  const s = store.getStudio(req.params.id);
  if (!s) return res.status(404).json({ error: 'Estúdio não encontrado' });
  res.json({ id: s.id, name: s.name, color: s.brand?.color || null });
});

// votação do público pelo celular
const clientIp = (req) => (isLoopback(req.socket.remoteAddress) && req.headers['cf-connecting-ip']) || req.socket.remoteAddress || '';
app.get('/api/public/vote/:id', (req, res) => {
  const s = store.getStudio(req.params.id);
  if (!s) return res.status(404).json({ error: 'Estúdio não encontrado' });
  res.set('Cache-Control', 'no-store').json({ studio: { name: s.name, color: s.brand?.color || null, logo: null }, poll: pollHub.view(s.id, req.query.voter) });
});
app.post('/api/public/vote/:id', (req, res) => {
  if (!store.getStudio(req.params.id)) return res.status(404).json({ error: 'Estúdio não encontrado' });
  const { status, ...out } = pollHub.vote(req.params.id, req.body, clientIp(req));
  res.status(status).set('Cache-Control', 'no-store').json(out);
});
// mensagens do público pelo celular (texto curto ou áudio)
app.get('/api/public/msg/:id', (req, res) => {
  const s = store.getStudio(req.params.id);
  if (!s) return res.status(404).json({ error: 'Estúdio não encontrado' });
  res.set('Cache-Control', 'no-store').json({ studio: { name: s.name, color: s.brand?.color || null }, box: msgHub.view(s.id) });
});
app.post('/api/public/msg/:id', (req, res) => {
  if (!store.getStudio(req.params.id)) return res.status(404).json({ error: 'Estúdio não encontrado' });
  const { status, ...out } = msgHub.send(req.params.id, req.body, clientIp(req));
  res.status(status).set('Cache-Control', 'no-store').json(out);
});

// Servidores ICE: STUN gratuito + TURN opcional configurado pelo usuário (para redes que bloqueiam P2P)
// TURN oficial do CastDeck (turn.flue.live): credenciais temporárias, renovadas antes de expirar
const OFFICIAL_TURN = 'https://cast.flue.live/api/turn';
let officialTurn = { servers: null, until: 0, pending: null };
async function getOfficialTurn() {
  if (officialTurn.servers && Date.now() < officialTurn.until) return officialTurn.servers;
  officialTurn.pending ||= (async () => {
    try {
      const r = await fetch(OFFICIAL_TURN, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.iceServers)) throw new Error('resposta inválida');
      officialTurn = { servers: j.iceServers, until: Date.now() + Math.max(60, (j.ttl || 3600) / 2) * 1000, pending: null };
    } catch {
      // fora do ar/sem internet: tenta de novo em 1 min (mantém as últimas credenciais se ainda valerem)
      officialTurn = { ...officialTurn, until: officialTurn.servers ? officialTurn.until : Date.now() + 60_000, pending: null };
    }
    return officialTurn.servers;
  })();
  return officialTurn.pending;
}

app.get('/api/public/ice', async (req, res) => {
  const servers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const t = store.getSettings().turn;
  if (t?.urls) {
    servers.push({ urls: t.urls.split(/[\s,]+/).filter(Boolean), username: t.username || undefined, credential: t.credential || undefined });
  } else {
    // sem TURN próprio: relay oficial do CastDeck e, como reserva, relays públicos gratuitos (melhor esforço)
    const official = await getOfficialTurn().catch(() => null);
    if (official) servers.push(...official);
    servers.push({
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  res.set('Cache-Control', 'no-store').json({ iceServers: servers });
});

// ---------- legenda ao vivo ----------
// worker Rust embutido (castdeck-caption) + modelo do Whisper baixado na 1ª vez; texto vai ao estúdio (PGM)
// e ao link público /cc/<estúdio>?k=<chave> (só leitura, chave própria)
const caption = new CaptionService({ deps, dataDir: DATA });
app.get('/cc/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'cc.html')));
app.get('/api/cc/:id/stream', (req, res) => {
  const id = String(req.params.id || '');
  const s = store.getStudio(id);
  if (!s) return res.status(404).json({ error: 'Estúdio não encontrado' });
  if (!isLocalReq(req) && String(req.query.k || '') !== store.studioCcKey(id)) return res.status(403).json({ error: 'Link da legenda inválido ou trocado pelo estúdio.' });
  caption.addViewer(req, res, id);
});
app.get('/api/cc/:id/info', (req, res) => {
  const id = String(req.params.id || '');
  const s = store.getStudio(id);
  if (!s) return res.status(404).json({ error: 'Estúdio não encontrado' });
  if (!isLocalReq(req) && String(req.query.k || '') !== store.studioCcKey(id)) return res.status(403).json({ error: 'Link da legenda inválido ou trocado pelo estúdio.' });
  const cc = s.brand?.cc || {};
  const style = {
    posH: cc.posH || { y: 'b', x: 'c' },
    size: cc.size || 'm',
    color: cc.color || '#ffffff',
    bgColor: cc.bgColor || '#000000',
    bg: typeof cc.bg === 'number' ? cc.bg : 0.72,
    lines: Math.max(1, Math.min(3, Number(cc.lines) || 2)),
    upper: !!cc.upper,
    appear: cc.appear || 'word',
    delay: typeof cc.delay === 'number' ? cc.delay : 0.6,
    wordMs: typeof cc.wordMs === 'number' ? cc.wordMs : 170,
  };
  res.set('Cache-Control', 'no-store').json({ name: s.name, color: s.brand?.color || null, langs: caption.cfg?.studioId === id ? (caption.cfg.mode === 'both' ? [caption.cfg.lang, 'en'] : [caption.cfg.mode === 'en' ? 'en' : caption.cfg.lang]) : [], style });
});

// API administrativa (somente localhost – contém chaves de transmissão)
const api = express.Router();
api.use(localOnly);
api.use(apiOriginGuard);
api.use(apiWriteLimit);

// legenda ao vivo (controle pelo estúdio)
api.get('/caption', (req, res) => res.set('Cache-Control', 'no-store').json(caption.info(String(req.query.studio || ''))));
api.post('/caption/model', (req, res) => {
  const id = String(req.body?.model || '');
  caption.downloadModel(id).catch(() => {});
  res.json(caption.info());
});
api.get('/caption/models', (req, res) => res.set('Cache-Control', 'no-store').json({ models: caption.modelsInfo() }));
api.post('/caption/models/delete', (req, res) => {
  try {
    res.json({ models: caption.deleteModel(String(req.body?.id || '')) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
api.post('/caption/start', async (req, res) => {
  try {
    res.json(await caption.start(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message, ...caption.info() });
  }
});
api.post('/caption/stop', (req, res) => {
  caption.stop();
  res.json(caption.info());
});
api.get('/caption/link/:id', (req, res) => {
  const id = String(req.params.id || '');
  if (!store.getStudio(id)) return res.status(404).json({ error: 'Estúdio não encontrado' });
  const k = store.studioCcKey(id, req.query.regen === '1');
  if (req.query.regen === '1') caption.dropViewers(id);
  const path_ = `/cc/${encodeURIComponent(id)}?k=${k}`;
  const lan = lanIps().map((i) => ({ label: `Rede local · ${i.name}`, url: `https://${i.address}:${HTTPS_PORT}${path_}` }));
  const pub = tunnel.url ? [{ label: 'Internet', url: `${tunnel.url}${path_}` }] : [];
  res.set('Cache-Control', 'no-store').json({ key: k, path: path_, local: `http://localhost:${HTTP_PORT}${path_}`, links: [...pub, ...lan], viewers: caption.info(id).viewers });
});

// DSK por endereço web: páginas renderizadas num navegador sem janela, quadros PNG pelo WS /dsk
const dsk = new DskHost({ dataDir: DATA });
const dskKey = (k) => String(k || '').replace(/[^\w.-]/g, '').slice(0, 80);
api.get('/dsk', (req, res) => res.set('Cache-Control', 'no-store').json(dsk.info()));
api.put('/dsk/:key', async (req, res) => {
  try {
    const b = req.body || {};
    res.json(await dsk.set(dskKey(req.params.key), {
      url: b.url,
      width: b.width,
      height: b.height,
      jpeg: !!b.jpeg,
      fps: b.fps,
      quality: b.quality,
    }, { force: !!b.force }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
api.post('/dsk/:key/reload', async (req, res) => {
  try {
    res.json(await dsk.reload(dskKey(req.params.key)));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
api.delete('/dsk/:key', async (req, res) => {
  await dsk.remove(dskKey(req.params.key)).catch(() => {});
  res.json({ ok: true });
});
// Imagens dos overlays (DSK): guardadas no DATA/dsk-assets, não no JSON do estúdio.
// Aceita o corpo binário direto (Content-Type image/png, image/jpeg, image/webp ou image/gif).
api.post('/dsk/assets', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'], limit: '25mb' }), (req, res) => {
  try {
    const meta = dsk.saveAsset(req.body, req.query.name || req.headers['x-file-name']);
    res.json({ ok: true, ...meta });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
api.delete('/dsk/assets/:file', (req, res) => {
  res.json({ ok: dsk.removeAsset(req.params.file) });
});
api.use('/dsk/assets', express.static(dsk.assetsDir, { maxAge: '7d', immutable: true, fallthrough: true }));

// Central de Redes Sociais: YouTube, Twitch e outras em simultâneo com zero cota
const socialScraper = new SocialScraper(DATA);
api.get('/social/sources', (req, res) => res.set('Cache-Control', 'no-store').json(socialScraper.listSources()));
api.post('/social/sources', async (req, res) => {
  try {
    const { type, target } = req.body || {};
    res.json(await socialScraper.addSource({ type, target }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
api.delete('/social/sources/:id', async (req, res) => {
  res.json({ ok: await socialScraper.removeSource(req.params.id) });
});
api.post('/social/feature', (req, res) => {
  socialScraper.featureMessage(req.body?.message || null);
  res.json({ ok: true, featured: socialScraper.currentFeatured });
});
api.post('/social/hide', (req, res) => {
  socialScraper.hideMessage();
  res.json({ ok: true });
});
api.post('/social/clear-all', (req, res) => {
  socialScraper.clearAllMessages();
  res.json({ ok: true });
});
api.get('/social/queue', (req, res) => res.set('Cache-Control', 'no-store').json(socialScraper.queue));
api.post('/social/queue', (req, res) => {
  socialScraper.addToQueue(req.body?.message);
  res.json({ ok: true, queue: socialScraper.queue });
});
api.delete('/social/queue/:id', (req, res) => {
  socialScraper.removeFromQueue(req.params.id);
  res.json({ ok: true, queue: socialScraper.queue });
});
api.post('/social/queue/clear', (req, res) => {
  socialScraper.clearQueue();
  res.json({ ok: true });
});

// Central de Replay & VAR: persistência, quotas de disco e exportação de clipes
const replayStore = new ReplayStore({ recordingsDir: recDir, ffmpegInfo, dataDir: DATA });
// Partidas que ficaram `inProgress` de uma execução anterior não podem bloquear cota/REC.
await replayStore.recoverInterruptedSessions().catch((err) => console.warn('[replay] Recuperação falhou:', err.message));
api.get('/replay/clips', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(await replayStore.listClips());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
api.get('/replay/config', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(await replayStore.getStorageUsage());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
api.post('/replay/config', async (req, res) => {
  try {
    const { maxDiskMb, maxBufferSecs, customReplayDir, replayDir } = req.body || {};
    const updated = await replayStore.saveConfig({
      maxDiskMb: typeof maxDiskMb === 'number' ? maxDiskMb : (maxDiskMb !== undefined ? Number(maxDiskMb) : undefined),
      maxBufferSecs: typeof maxBufferSecs === 'number' ? maxBufferSecs : (maxBufferSecs !== undefined ? Number(maxBufferSecs) : undefined),
      customReplayDir: customReplayDir !== undefined ? customReplayDir : replayDir,
    });
    res.json({ ok: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
api.post('/replay/clear', async (req, res) => {
  try {
    res.json(await replayStore.clearAllClips());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Abre o diretório de replays ativo no gerenciador de arquivos do sistema operacional
api.post('/replay/open-folder', async (req, res) => {
  try {
    const dir = replayStore.dir;
    await openFolder(dir);
    res.json({ ok: true, dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Diálogo nativo para escolher a pasta de gravação de replays
api.post('/replay/pick-folder', async (req, res) => {
  try {
    const chosen = await pickFolder(replayStore.dir, 'Escolha a pasta para salvar replays e gravações de jogos');
    if (chosen) {
      const updated = await replayStore.saveConfig({ customReplayDir: chosen });
      return res.json({ ok: true, dir: chosen, config: updated });
    }
    res.json({ ok: false, canceled: true, dir: replayStore.dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Servidor de arquivos de replay e partidas contínuas com suporte HTTP 206 (Range requests para seek suave)
api.get('/replay/file/:name', (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    const filePath = path.join(replayStore.dir, safeName);
    if (!existsSync(filePath)) {
      // Fallback para o diretório padrão se foi movido recentemente
      const fallbackPath = path.join(replayStore.defaultDir, safeName);
      if (existsSync(fallbackPath)) {
        return res.sendFile(fallbackPath, { acceptRanges: true });
      }
      return res.status(404).send('Arquivo não encontrado');
    }
    res.sendFile(filePath, { acceptRanges: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// Miniatura JPEG do lance (a lista carrega instantânea depois de reiniciar)
api.get('/replay/thumb/:id', (req, res) => {
  try {
    const safeId = path.basename(String(req.params.id || '')).replace(/\.jpg$/i, '');
    const filePath = path.join(replayStore.dir, `${safeId}.jpg`);
    if (!existsSync(filePath)) return res.status(404).send('Miniatura não encontrada');
    res.sendFile(filePath, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
api.post('/replay/thumb/:id', express.raw({ type: 'image/jpeg', limit: '400kb' }), async (req, res) => {
  try {
    const url = await replayStore.saveThumb(req.params.id, req.body);
    if (!url) return res.status(400).json({ ok: false, error: 'Miniatura inválida' });
    res.json({ ok: true, thumbUrl: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Inicia gravação contínua de jogo/partida (estilo futebol 90min+ direto no disco)
api.post('/replay/match/start', async (req, res) => {
  try {
    const { sourceId, title } = req.body || {};
    const result = await replayStore.startMatchRecording({ sourceId, title });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Recebe chunk contínuo do navegador e anexa atômico ao arquivo da partida
api.post('/replay/match/chunk', express.raw({ type: ['video/webm', 'application/octet-stream'], limit: '64mb' }), async (req, res) => {
  try {
    const result = await replayStore.appendMatchChunk(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Encerra a gravação contínua de jogo/partida
api.post('/replay/match/stop', async (req, res) => {
  try {
    const result = await replayStore.stopMatchRecording();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Consulta status da gravação contínua de jogo
api.get('/replay/match/status', async (req, res) => {
  // Console aberto depois de crash: a sessão antiga está sem heartbeat — finaliza antes de responder.
  if (replayStore.isMatchStale()) {
    await replayStore.stopMatchRecording().catch(() => {});
  }
  res.json(replayStore.getMatchStatus());
});
// Heartbeat da janela do console: sessão viva sem novo pedaço (evita partida órfã ao fechar/cair).
api.post('/replay/match/heartbeat', (req, res) => {
  res.json(replayStore.touchMatchSession());
});
api.post('/replay/save', express.raw({ type: ['video/webm', 'application/octet-stream'], limit: '120mb' }), async (req, res) => {
  try {
    const metaHeader = req.headers['x-replay-meta'];
    let meta = {};
    if (metaHeader) {
      try { meta = JSON.parse(decodeURIComponent(metaHeader)); } catch {}
    }
    const saved = await replayStore.saveClip(req.body, meta);
    res.json({ ok: true, clip: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
api.delete('/replay/clips/:id', async (req, res) => {
  try {
    res.json({ ok: await replayStore.deleteClip(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Renomear lance na playlist (persistido no JSON do clipe)
api.put('/replay/clips/:id', async (req, res) => {
  try {
    const meta = await replayStore.updateClip(req.params.id, { title: req.body?.title });
    if (!meta) return res.status(404).json({ ok: false, error: 'Clipe não encontrado' });
    res.json({ ok: true, clip: meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
api.post('/social/auto', (req, res) => {
  const { autoSequence, autoDur } = req.body || {};
  socialScraper.setAutoConfig({ autoSequence, autoDur });
  res.json({ ok: true, autoSequence: socialScraper.autoSequence, autoDur: socialScraper.autoDur });
});

// Compatibilidade com atalhos do YouTube
api.get('/social/youtube', (req, res) => res.set('Cache-Control', 'no-store').json(socialScraper.info()));
api.post('/social/youtube/start', async (req, res) => {
  try {
    const { url, videoId } = req.body || {};
    res.json(await socialScraper.start({ url, videoId }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
api.post('/social/youtube/stop', async (req, res) => {
  await socialScraper.stop();
  res.json({ ok: true });
});

api.get('/system', (req, res) => {
  const ips = lanIps();
  res.json({
    version: APP_VERSION,
    updateTarget: UPDATE_TARGET,
    ffmpeg: { ...ffmpegInfo, download: deps.state.ffmpeg },
    ytdlp: { ...ytdlp.info(), download: deps.state['yt-dlp'] },
    presets: PRESETS,
    httpPort: HTTP_PORT,
    httpsPort: HTTPS_PORT,
    lan: ips.map((i) => ({ ...i, url: `https://${i.address}:${HTTPS_PORT}` })),
    tunnel: tunnel.info(),
    settings: store.getSettings(),
    rooms: hub.roomStats(),
    broadcasts: broadcasts.list(),
    recordingsDir: recDir(),
    recordingsDefault: DEFAULT_RECORDINGS,
  });
});

// ---------- download de vídeo do YouTube (yt-dlp + FFmpeg) ----------
api.post('/media/ytdl', localOnly, async (req, res) => {
  try {
    const job = await ytdlp.start(req.body?.url);
    res.status(202).json(job);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Falha ao iniciar o download.' });
  }
});
api.get('/media/ytdl/:id', localOnly, (req, res) => {
  const job = ytdlp.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
  res.set('Cache-Control', 'no-store').json(job);
});
api.get('/media/ytdl/:id/file', localOnly, async (req, res) => {
  const f = ytdlp.file(req.params.id);
  if (!f) return res.status(404).json({ error: 'Arquivo ainda não está pronto.' });
  try {
    const st = await fs.stat(f.file);
    if (!st.isFile() || !st.size) return res.status(404).json({ error: 'Arquivo vazio ou ausente.' });
    // sendFile trata Range/abort/Content-Length corretamente. O stream manual derrubava a conexão no meio
    // (o navegador reportava "Failed to fetch") quando o arquivo era grande ou o cliente pedia pedaços.
    res.sendFile(path.resolve(f.file), { headers: { 'Content-Type': f.mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' } }, (err) => {
      if (!err) return;
      if (err.code === 'ECONNABORTED' || res.headersSent) return;
      console.warn('[ytdlp] falha ao servir arquivo:', err.message);
      if (!res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado: ' + err.message });
    });
  } catch (e) {
    if (!res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado: ' + e.message });
  }
});
api.delete('/media/ytdl/:id', localOnly, async (req, res) => {
  await ytdlp.remove(req.params.id);
  res.json({ ok: true });
});

api.get('/settings', (req, res) => res.json(store.getSettings()));
// espaço livre na pasta das gravações (checagem antes de entrar ao vivo / gravar). Só leitura; o Android não tem
// esta rota e o estúdio simplesmente pula o item quando ela falta.
api.get('/disk', async (req, res) => {
  const dir = recDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    const st = await fs.statfs(dir);
    res.json({ dir, free: st.bavail * st.bsize, total: st.blocks * st.bsize });
  } catch (e) {
    res.status(500).json({ error: e.message, dir });
  }
});
api.put('/settings', async (req, res) => {
  const body = { ...(req.body || {}) };
  // pasta das gravações: precisa ser um caminho absoluto onde dá para escrever ('' volta para a padrão)
  if (typeof body.recordingsDir === 'string') {
    const dir = body.recordingsDir.trim();
    if (dir) {
      if (!path.isAbsolute(dir)) return res.status(400).json({ error: 'Use o caminho completo da pasta (ex.: D:\\Gravações).' });
      try {
        await fs.mkdir(dir, { recursive: true });
        const probe = path.join(dir, '.castdeck-teste');
        await fs.writeFile(probe, 'ok');
        await fs.unlink(probe);
      } catch (e) {
        return res.status(400).json({ error: 'Não foi possível gravar nessa pasta: ' + e.message });
      }
      body.recordingsDir = path.resolve(dir);
    }
  }
  res.json(store.updateSettings(body));
});
// abre a janela nativa de "escolher pasta" do sistema (Windows/macOS/Linux) e devolve o caminho escolhido
api.post('/pick-folder', async (req, res) => {
  try {
    const dir = await pickFolder(String(req.body?.start || recDir()), String(req.body?.title || 'Escolha a pasta'));
    res.json({ dir: dir || null });
  } catch (e) {
    res.status(501).json({ error: e.message });
  }
});
api.get('/tunnel', (req, res) => res.json(tunnel.info()));
api.post('/tunnel/start', (req, res) => {
  tunnel.start(HTTP_PORT);
  res.json(tunnel.info());
});
api.post('/tunnel/restart', (req, res) => {
  tunnel.restart();
  res.json(tunnel.info());
});
api.post('/tunnel/stop', (req, res) => {
  tunnel.stop();
  res.json(tunnel.info());
});

// ---------- entradas RTMP/SRT (drones e câmeras) ----------
api.get('/ingest', (req, res) => res.json(ingest.info()));
api.post('/ingest/enable', async (req, res) => {
  if (req.body?.on && !ingest.available()) return res.status(501).json({ error: 'Esta versão não traz o MediaMTX.' });
  res.json(await ingest.setEnabled(!!req.body?.on));
});
api.post('/ingest/sources', (req, res) => {
  try {
    res.status(201).json(ingest.addSource(req.body?.name));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
api.put('/ingest/sources/:key', (req, res) => {
  const s = ingest.renameSource(req.params.key, req.body?.name);
  s ? res.json(s) : res.status(404).json({ error: 'Entrada não encontrada.' });
});
api.delete('/ingest/sources/:key', (req, res) => res.json({ ok: ingest.removeSource(req.params.key) }));
// WHEP: o estúdio manda a oferta SDP e recebe a resposta do MediaMTX (que só escuta em 127.0.0.1)
api.post('/ingest/whep/:key', express.text({ type: ['application/sdp', 'text/plain'], limit: '256kb' }), async (req, res) => {
  try {
    const r = await ingest.whep(req.params.key, String(req.body || ''));
    res.status(r.status).set('Content-Type', r.status < 300 ? 'application/sdp' : 'text/plain; charset=utf-8');
    if (r.play) res.set('X-Ingest-Path', r.play);
    res.send(r.body);
  } catch (e) {
    res.status(502).type('text/plain').send('MediaMTX não respondeu: ' + e.message);
  }
});
api.post('/open', (req, res) => {
  const mode = req.body?.mode === 'app' ? 'app' : 'browser';
  openApp(mode);
  res.json({ ok: true, mode, url: `http://localhost:${HTTP_PORT}` });
});
// abre no navegador padrão um endereço do site oficial (download de atualização)
api.post('/open-url', (req, res) => {
  const url = String(req.body?.url || '');
  if (!/^https:\/\/cast\.flue\.live\/[A-Za-z0-9._\/-]*$/.test(url)) return res.status(400).json({ error: 'Endereço não permitido' });
  openBrowser(url);
  res.json({ ok: true });
});
// atualização dentro do app: baixa (com progresso), confere o SHA-256, troca o executável e reinicia
api.get('/update/status', (req, res) => res.set('Cache-Control', 'no-store').json(updater.status()));
api.post('/update/download', (req, res) => res.json(updater.download()));
api.post('/update/install', async (req, res) => {
  if (broadcasts.list().length) return res.status(409).json({ error: 'Encerre a transmissão/gravação antes de atualizar.' });
  try {
    await updater.install();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, ...updater.status() });
  setTimeout(() => shutdown(), 400);
});
// usados pelo CastDeck.exe (janela nativa/splash/bandeja)
// exe: nome do executável extraído pelo lançador (castdeck-server-<versão>-<hash>.exe). O lançador compara com o
// próprio build para não reaproveitar um servidor antigo que ficou aberto (senão a versão nova abre com o código velho)
api.get('/health', (req, res) => res.json({ ok: true, app: 'castdeck', live: broadcasts.list?.().length || 0, exe: path.basename(process.execPath) }));
// WhatsApp local (Baileys/WhatsApp Web, experimental): só neste PC; a live não depende dele.
api.get('/whatsapp/status', (req, res) => res.set('Cache-Control', 'no-store').json(whatsapp.info()));
api.get('/whatsapp/media/:id', async (req, res) => {
  const m = whatsapp.media(String(req.params.id || ''));
  if (!m) return res.status(404).json({ error: 'Mídia não encontrada' });
  try {
    const buf = await fs.readFile(m.file);
    res.set('Cache-Control', 'no-store').type(m.mime).send(buf);
  } catch {
    res.status(404).json({ error: 'Mídia não encontrada' });
  }
});
api.post('/whatsapp/connect', async (req, res) => {
  try {
    res.json(await whatsapp.connect());
  } catch (e) {
    res.status(500).json({ error: e.message || 'Falha ao conectar o WhatsApp.' });
  }
});
api.post('/whatsapp/disconnect', async (req, res) => res.json(await whatsapp.disconnect()));
api.post('/whatsapp/logout', async (req, res) => res.json(await whatsapp.logout()));
api.delete('/whatsapp/messages', async (req, res) => res.json(await whatsapp.clear()));
// Diagnóstico para suporte: somente dados operacionais, sem chaves de transmissão nem credenciais TURN.
api.get('/diagnostics', (req, res) => {
  const mem = process.memoryUsage();
  const s = store.getSettings();
  res.set('Cache-Control', 'no-store').json({
    generatedAt: new Date().toISOString(),
    app: {
      version: APP_VERSION,
      target: UPDATE_TARGET,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      packaged,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: os.cpus()?.[0]?.model || '',
      cores: os.cpus()?.length || 0,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      load: os.loadavg(),
    },
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
    paths: { data: DATA, recordings: recDir(), public: PUBLIC },
    settings: {
      tunnelProvider: s.tunnelProvider,
      autoTunnel: s.autoTunnel,
      openMode: s.openMode,
      rawMic: !!s.rawMic,
      recordingsDir: s.recordingsDir || '',
      ingestEnabled: !!s.ingest?.enabled,
    },
    ffmpeg: { available: ffmpegInfo.available, version: ffmpegInfo.version, encoders: ffmpegInfo.encoders?.map((e) => e.id) || [], error: ffmpegInfo.error || null },
    tunnel: tunnel.info(),
    ingest: ingest.info(),
    dsk: dsk.info(),
    whatsapp: { status: whatsapp.status, experimental: true, messages: whatsapp.messages.length, chats: whatsapp.chats.size },
    updater: updater.status(),
    rooms: hub.roomStats(),
    broadcasts: broadcasts.list(),
    counts: { studios: store.listStudios().length, destinations: store.listDestinations().length },
  });
});
api.post('/quit', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => shutdown(), 50);
});

api.get('/studios', (req, res) => res.json(store.listStudios()));
api.post('/studios', (req, res) => res.status(201).json(store.createStudio(req.body?.name)));
api.get('/studios/:id', (req, res) => {
  const s = store.getStudio(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'not found' });
});
api.put('/studios/:id', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'corpo inválido' });
  const rev = store.conflictFor(req.params.id, body);
  if (rev !== null) return res.status(409).json({ error: 'O estúdio foi alterado em outra janela', rev });
  const s = store.updateStudio(req.params.id, body);
  s ? res.json({ id: s.id, name: s.name, rev: s.rev || 0, updatedAt: s.updatedAt }) : res.status(404).json({ error: 'not found' });
});
api.delete('/studios/:id', (req, res) => res.json({ ok: store.deleteStudio(req.params.id) }));
// o estúdio publica a enquete no ar e recebe os votos que chegaram pela página /vote
api.post('/studios/:id/poll', (req, res) => res.json({ votes: pollHub.sync(req.params.id, req.body?.poll) }));
// o estúdio publica a caixa de mensagens e recebe as que chegaram pela página /msg
api.post('/studios/:id/msgs', (req, res) => res.json({ msgs: msgHub.sync(req.params.id, req.body?.box) }));

const maskKey = (d) => ({ ...d, key: d.key ? d.key.slice(0, 4) + '•'.repeat(Math.max(4, d.key.length - 4)) : '', hasKey: !!d.key });
api.get('/destinations', (req, res) => res.json(store.listDestinations().map(maskKey)));
api.post('/destinations', (req, res) => {
  const d = store.upsertDestination({ ...req.body, id: undefined });
  res.status(201).json(maskKey(d));
});
api.put('/destinations/:id', (req, res) => {
  const body = { ...req.body, id: req.params.id };
  const current = store.getDestination(req.params.id);
  if (!current) return res.status(404).json({ error: 'not found' });
  if (body.key === undefined || body.key === null || /•/.test(body.key)) body.key = current.key; // não sobrescreve chave mascarada
  res.json(maskKey(store.upsertDestination(body)));
});
api.delete('/destinations/:id', (req, res) => res.json({ ok: store.deleteDestination(req.params.id) }));

api.get('/recordings', async (req, res) => {
  try {
    await fs.mkdir(recDir(), { recursive: true });
    const files = await fs.readdir(recDir());
    // arquivos sendo gravados agora (o player avisa que ainda está em andamento)
    const live = new Set(broadcasts.list().flatMap((b) => b.outputs.filter((o) => o.kind === 'record' && o.file && !['stopped', 'failed'].includes(o.state)).map((o) => o.file)));
    const list = await Promise.all(
      files.filter((f) => /\.(mp4|mkv|webm)$/i.test(f)).map(async (f) => {
        const st = await fs.stat(path.join(recDir(), f));
        return { name: f, size: st.size, mtime: st.mtimeMs, url: `/recordings/${encodeURIComponent(f)}`, recording: live.has(f), processing: isFinalizing(path.join(recDir(), f)) };
      }),
    );
    res.json(list.sort((a, b) => b.mtime - a.mtime));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
api.post('/recordings/open-folder', async (req, res) => {
  await fs.mkdir(recDir(), { recursive: true });
  openFolder(recDir());
  res.json({ ok: true });
});
// só aceita um nome de arquivo de vídeo que exista na pasta das gravações (nada de caminhos)
const recFile = async (name) => {
  const f = path.basename(String(name || ''));
  if (!/\.(mp4|mkv|webm)$/i.test(f)) return null;
  const full = path.join(recDir(), f);
  try { await fs.access(full); return full; } catch { return null; }
};
api.post('/recordings/reveal', async (req, res) => {
  const full = await recFile(req.body?.name);
  if (!full) return res.status(404).json({ error: 'Gravação não encontrada.' });
  revealFile(full);
  res.json({ ok: true });
});
api.post('/recordings/open', async (req, res) => {
  const full = await recFile(req.body?.name);
  if (!full) return res.status(404).json({ error: 'Gravação não encontrada.' });
  openFile(full);
  res.json({ ok: true });
});
// Fixa uma janela no topo (Always-on-Top / HWND_TOPMOST) do Windows pelo título
api.post('/window/topmost', (req, res) => {
  const { title, top } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const ok = setWindowTopmost(title, top !== false);
  res.json({ ok, title, top: top !== false });
});
// antes de tocar no player: gravações antigas (MP4 fragmentado, sem índice) são finalizadas para ter duração e busca
api.post('/recordings/prepare', async (req, res) => {
  const full = await recFile(req.body?.name);
  if (!full) return res.status(404).json({ error: 'Gravação não encontrada.' });
  const name = path.basename(full);
  const live = broadcasts.list().some((b) => b.outputs.some((o) => o.kind === 'record' && o.file === name && !['stopped', 'failed'].includes(o.state)));
  if (live) return res.json({ ok: true, recording: true });
  let finalized = false;
  if (isFinalizing(full)) {
    while (isFinalizing(full)) await new Promise((r) => setTimeout(r, 300));
  } else if ((await isFragmented(full)) || (await needsCompatibility(ffmpegInfo.path, full))) {
    finalized = await finalizeRecording(ffmpegInfo.path, full);
  }
  const st = await fs.stat(full).catch(() => null);
  res.json({ ok: true, finalized, size: st?.size || 0 });
});
api.delete('/recordings/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  try {
    await fs.unlink(path.join(recDir(), name));
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// ---------- Armazenamento e limpeza ----------
// Gravações e cache de mídias convertidas. Arquivos mexidos nos últimos 2 min ficam (gravação em andamento).
const CACHE_DIR = path.join(DATA, 'media-cache');
const BUSY_MS = 2 * 60 * 1000;
async function scanDir(dir, filter = () => true) {
  try {
    const names = await fs.readdir(dir);
    const out = [];
    for (const n of names) {
      if (!filter(n)) continue;
      try {
        const st = await fs.stat(path.join(dir, n));
        if (st.isFile()) out.push({ name: n, size: st.size, mtime: st.mtimeMs });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}
const isRec = (n) => /\.(mp4|mkv|webm|flv|ts)$/i.test(n);
const sum = (l) => l.reduce((a, f) => a + f.size, 0);
api.get('/storage', async (req, res) => {
  const recs = await scanDir(recDir(), isRec);
  const cache = await scanDir(CACHE_DIR);
  const day = 86400000;
  const older = (d) => recs.filter((f) => Date.now() - f.mtime > d * day);
  res.json({
    recordings: { dir: recDir(), count: recs.length, bytes: sum(recs), older7: sum(older(7)), older30: sum(older(30)), older90: sum(older(90)), n7: older(7).length, n30: older(30).length, n90: older(90).length },
    cache: { count: cache.length, bytes: sum(cache) },
  });
});
api.post('/storage/clean', async (req, res) => {
  const { recordings, cache } = req.body || {};
  let freed = 0;
  let removed = 0;
  let skipped = 0;
  const kill = async (dir, list) => {
    for (const f of list) {
      if (Date.now() - f.mtime < BUSY_MS) {
        skipped++;
        continue;
      }
      try {
        await fs.unlink(path.join(dir, f.name));
        freed += f.size;
        removed++;
      } catch {
        skipped++;
      }
    }
  };
  // recordings: 'all' ou número de dias (apaga as mais antigas que isso)
  if (recordings === 'all' || Number(recordings) > 0) {
    const recs = await scanDir(recDir(), isRec);
    const days = recordings === 'all' ? 0 : Number(recordings);
    await kill(recDir(), recs.filter((f) => Date.now() - f.mtime >= days * 86400000));
  }
  if (cache) await kill(CACHE_DIR, await scanDir(CACHE_DIR));
  res.json({ ok: true, freed, removed, skipped });
});

// Proxy de imagens (avatares/emotes do chat de redes sociais). Mesma origem => o canvas do programa não fica "tainted".
// Proteções: só http(s), bloqueia IPs privados/loopback (SSRF), só image/*, até 3 MB, no máximo 3 redirecionamentos.
const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.');
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};
async function fetchPublic(raw, { maxBytes, okType, notOk }, hops = 0) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error('protocolo inválido');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('endereço não permitido');
  const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 CastDeck/1.0', Accept: '*/*' } });
  if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
    if (hops >= 3) throw new Error('redirecionamentos demais');
    return fetchPublic(new URL(r.headers.get('location'), u).href, { maxBytes, okType, notOk }, hops + 1);
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const type = r.headers.get('content-type') || '';
  if (okType && !okType.test(type)) throw new Error(notOk || 'tipo de conteúdo não permitido');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('conteúdo grande demais');
  return { type, buf, url: u.href };
}
const fetchPublicImage = (raw) => fetchPublic(raw, { maxBytes: 3 * 1024 * 1024, okType: /^image\//i, notOk: 'não é imagem' });
const imgProxyCache = new Map(); // url -> { type, buf, at }
api.get('/img-proxy', async (req, res) => {
  try {
    const rawUrl = String(req.query.u || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'url ausente' });
    let hit = imgProxyCache.get(rawUrl);
    if (!hit || Date.now() - hit.at > 86400000) {
      const data = await fetchPublicImage(rawUrl);
      hit = { type: data.type, buf: data.buf, at: Date.now() };
      imgProxyCache.set(rawUrl, hit);
      if (imgProxyCache.size > 800) imgProxyCache.delete(imgProxyCache.keys().next().value);
    }
    res.set({
      'Content-Type': hit.type,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    }).send(hit.buf);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


// ---------- Notícias (RSS / Atom / RDF) para o letreiro ----------
const feedCache = new Map(); // url -> { at, data }
// Decodifica o corpo respeitando o charset (cabeçalho HTTP, declaração <?xml?> ou <meta>); sem declaração,
// usa UTF-8 e cai para windows-1252 se houver bytes inválidos (feeds latin1 sem aviso).
function decodeBody(buf, type = '') {
  const head = buf.subarray(0, 1024).toString('latin1');
  let enc = (type.match(/charset=([\w-]+)/i) || head.match(/^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  enc = enc?.toLowerCase();
  if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'iso-8859-15') enc = 'windows-1252';
  if (enc && !/^utf-?8$/.test(enc)) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {}
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
async function loadFeed(raw) {
  const hit = feedCache.get(raw);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const opts = { maxBytes: 3 * 1024 * 1024 };
  let r = await fetchPublic(raw, opts);
  let text = decodeBody(r.buf, r.type);
  // o usuário colou a página do site: tenta achar o feed declarado no <head>
  if (/<html[\s>]/i.test(text.slice(0, 3000)) && !/<(rss|feed|rdf:rdf)\b/i.test(text.slice(0, 3000))) {
    const link = text.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0];
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) throw new Error('nenhum feed RSS encontrado nessa página');
    r = await fetchPublic(new URL(href, r.url).href, opts);
    text = decodeBody(r.buf, r.type);
  }
  const data = { ...parseFeed(text), url: r.url };
  feedCache.set(raw, { at: Date.now(), data });
  return data;
}
api.get('/rss', localOnly, async (req, res) => {
  try {
    res.json(await loadFeed(String(req.query.u || '')));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.use('/api', api);
app.use('/recordings', localOnly, (req, res, next) => express.static(recDir())(req, res, next));

// ---------- Conversão de mídia local ----------
// O navegador não decodifica alguns áudios comuns em filmes (AC3/E-AC3/DTS) nem HEVC: converte para MP4 H.264 + AAC.
const MEDIA_CACHE = path.join(DATA, 'media-cache');
app.use('/media-cache', localOnly, express.static(MEDIA_CACHE));
app.post('/api/media/convert', localOnly, async (req, res) => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const src = path.join(MEDIA_CACHE, `${id}.src`);
  const out = path.join(MEDIA_CACHE, `${id}.mp4`);
  try {
    await fs.mkdir(MEDIA_CACHE, { recursive: true });
    const ff = ffmpegInfo.path || 'ffmpeg';
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(req, createWriteStream(src));
    const runFf = (args) =>
      new Promise((resolve) => {
        const p = spawn(ff, args, { windowsHide: true });
        let err = '';
        p.stderr.on('data', (d) => (err += d));
        p.on('error', (e) => resolve({ code: -1, err: e.message }));
        p.on('close', (code) => resolve({ code, err }));
      });
    const probe = (await runFf(['-hide_banner', '-i', src])).err;
    const hasAudio = /Stream #\d+:\d+.*: Audio:/.test(probe);
    const hasVideo = /Stream #\d+:\d+.*: Video:/.test(probe);
    const vcodec = (probe.match(/: Video: (\w+)/) || [])[1] || '';
    const acodec = (probe.match(/: Audio: (\w+)/) || [])[1] || '';
    if (!hasAudio) {
      await fs.unlink(src).catch(() => {});
      return res.json({ silent: true });
    }
    const args = ['-hide_banner', '-v', 'error', '-y', '-i', src, '-map', '0:v:0?', '-map', '0:a:0'];
    if (hasVideo) {
      if (vcodec === 'h264') args.push('-c:v', 'copy');
      else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');
    }
    args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', out);
    const r = await runFf(args);
    await fs.unlink(src).catch(() => {});
    if (r.code !== 0) throw new Error(r.err.trim().split('\n').slice(-2).join(' ') || 'falha no FFmpeg');
    res.json({ url: `/media-cache/${id}.mp4`, vcodec, acodec });
  } catch (e) {
    await fs.unlink(src).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// ---------- WebSockets ----------
const wssSignal = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const wssIngest = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024, perMessageDeflate: false });
// PNG já é comprimido: deflate só gastaria CPU
const wssDsk = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
const wssSocial = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
// áudio da legenda: PCM 16 kHz mono em blocos pequenos (~100 ms = 3,2 KB); sem deflate
const wssCaption = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false });

function attachUpgrade(server) {
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://x');
    const local = isLocalReq(req);
    if (pathname === '/ws') {
      wssSignal.handleUpgrade(req, socket, head, (ws) => hub.handle(ws, { isLocal: local }));
    } else if (pathname === '/ingest' && local) {
      wssIngest.handleUpgrade(req, socket, head, (ws) => broadcasts.handleIngest(ws));
    } else if (pathname === '/dsk' && local) {
      wssDsk.handleUpgrade(req, socket, head, (ws) => dsk.handleClient(ws));
    } else if (pathname === '/social-stream' && local) {
      wssSocial.handleUpgrade(req, socket, head, (ws) => socialScraper.handleClient(ws));
    } else if (pathname === '/caption' && local) {
      wssCaption.handleUpgrade(req, socket, head, (ws) => caption.handleStudio(ws));
    } else {
      socket.destroy();
    }
  });
}

const httpServer = http.createServer(app);
attachUpgrade(httpServer);
// Importar vídeo do YouTube é uma leitura longa (arquivo grande): não deixa o timeout padrão do Node
// derrubar a conexão no meio, o que o navegador reportava como "Failed to fetch".
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 120000;
httpServer.keepAliveTimeout = 65000;
httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  ✖ A porta ${HTTP_PORT} já está em uso. O CastDeck já está aberto?\n`);
  else console.error(e);
  process.exit(1);
});
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`\n  🎬 CastDeck Local v${APP_VERSION} pronto`);
  console.log(`  Estúdio (este PC):   http://localhost:${HTTP_PORT}`);
  if (store.getSettings().autoTunnel) tunnel.start(HTTP_PORT);
  if (ingest.cfg().enabled) ingest.start();
  if ((packaged || process.argv.includes('--open')) && process.env.NO_OPEN !== '1') openApp();
});

try {
  const ips = lanIps();
  const tls = await getCertificate(path.join(DATA, 'certs'), ips.map((i) => i.address));
  const httpsServer = https.createServer(tls, app);
  attachUpgrade(httpsServer);
  httpsServer.on('error', () => {});
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    for (const i of ips) console.log(`  Convidados (LAN):    https://${i.address}:${HTTPS_PORT}   (${i.name})`);
    console.log('');
  });
} catch (e) {
  console.warn('[https] não foi possível iniciar HTTPS para convidados:', e.message);
}

function openApp(mode = store.getSettings().openMode || 'app') {
  if (mode === 'none') return;
  const url = `http://localhost:${HTTP_PORT}`;
  if (mode === 'browser') return openBrowser(url);
  // janela sem abas num navegador Chromium (Edge/Chrome/...); cai para o navegador padrão
  openAppWindow(url);
}

const shutdown = () => {
  console.log('\n[shutdown] encerrando…');
  broadcasts.stopAll();
  tunnel.stop();
  // MediaMTX e conversões rodam como processos filhos: sem isso ficariam órfãos segurando as portas 1935/8890
  try { ingest.stop(); } catch {}
  // o navegador sem janela do DSK também é filho: fecha junto
  try { dsk.stop(); } catch {}
  try { socialScraper.stop(); } catch {}
  try { caption.stop(); } catch {}
  try { whatsapp.disconnect(); } catch {}
  store.flush().finally(() => setTimeout(() => process.exit(0), 1500));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Windows: fechar a janela do console (SIGHUP) ou Ctrl+Break
process.on('SIGHUP', shutdown);
process.on('SIGBREAK', shutdown);
// última linha de defesa: grava o que estiver pendente antes do processo terminar
process.on('exit', () => {
  store.flushSync();
  try { dsk.stop(); } catch {}
  try { socialScraper.stop(); } catch {}
  try { caption.kill(true); } catch {}
});
}

main().catch((e) => {
  console.error('Falha ao iniciar:', e);
  process.exit(1);
});
