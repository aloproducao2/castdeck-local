// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Cliente ONVIF local: descoberta WS-Discovery, HTTPS self-signed, WS-Security/HTTP Digest,
// perfis, PTZ absoluto/contínuo, presets e GetStatus.
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

const NS = {
  s: 'http://www.w3.org/2003/05/soap-envelope',
  tds: 'http://www.onvif.org/ver10/device/wsdl',
  trt: 'http://www.onvif.org/ver10/media/wsdl',
  tptz: 'http://www.onvif.org/ver20/ptz/wsdl',
  tt: 'http://www.onvif.org/ver10/schema',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  digest: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest',
  text: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText',
  b64: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanHost = (host) => {
  const h = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!h || !/^[a-zA-Z0-9._:-]+$/.test(h)) throw new Error('IP/host ONVIF inválido.');
  return h;
};
const cleanPort = (port, secure = false) => {
  const n = Number(port || (secure ? 443 : 80));
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Porta ONVIF inválida.');
  return n;
};
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('base64');
const b64 = (s) => Buffer.from(s).toString('base64');

function security(username, password, mode = 'digest') {
  if (!username || mode === 'none' || mode === 'http') return '';
  const nonce = crypto.randomBytes(16);
  const created = new Date().toISOString();
  const pw = mode === 'text'
    ? `<wsse:Password Type="${NS.text}">${esc(password)}</wsse:Password>`
    : `<wsse:Password Type="${NS.digest}">${sha1(Buffer.concat([nonce, Buffer.from(created), Buffer.from(String(password || ''))]))}</wsse:Password><wsse:Nonce EncodingType="${NS.b64}">${nonce.toString('base64')}</wsse:Nonce><wsu:Created>${created}</wsu:Created>`;
  return `<wsse:Security xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}" s:mustUnderstand="1"><wsse:UsernameToken><wsse:Username>${esc(username)}</wsse:Username>${pw}</wsse:UsernameToken></wsse:Security>`;
}
function envelope(body, username = '', password = '', mode = 'digest') {
  return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="${NS.s}" xmlns:tds="${NS.tds}" xmlns:trt="${NS.trt}" xmlns:tptz="${NS.tptz}" xmlns:tt="${NS.tt}"><s:Header>${security(username, password, mode)}</s:Header><s:Body>${body}</s:Body></s:Envelope>`;
}

function request(url, body, headers = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...headers },
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('timeout ONVIF')));
    req.on('error', reject);
    req.end(body);
  });
}

function digestAuth(challenge, method, uri, username, password) {
  const params = {};
  const re = /(\w+)=("([^"]*)"|([^,\s]+))/g;
  let m;
  while ((m = re.exec(challenge))) params[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  if (!params.realm || !params.nonce) return '';
  const algorithm = (params.algorithm || 'MD5').toUpperCase();
  if (algorithm !== 'MD5') return '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${username}:${params.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const qop = /auth/i.test(params.qop || '') ? 'auth' : '';
  const response = qop ? md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${params.nonce}:${ha2}`);
  const parts = [`username="${username}"`, `realm="${params.realm}"`, `nonce="${params.nonce}"`, `uri="${uri}"`, `response="${response}"`, `algorithm=MD5`];
  if (qop) parts.push('qop=auth', `nc=${nc}`, `cnonce="${cnonce}"`);
  if (params.opaque) parts.push(`opaque="${params.opaque}"`);
  return 'Digest ' + parts.join(', ');
}

async function soap(url, body, { username = '', password = '', authMode = 'digest', timeout = 8000 } = {}) {
  const payload = envelope(body, username, password, authMode);
  let r = await request(url, payload, {}, timeout);
  if (r.status === 401) {
    const challenge = String(r.headers['www-authenticate'] || '');
    let auth = '';
    const u = new URL(url);
    if (/digest/i.test(challenge)) auth = digestAuth(challenge, 'POST', u.pathname + u.search, username, password);
    else if (/basic/i.test(challenge)) auth = 'Basic ' + b64(`${username}:${password}`);
    if (auth) r = await request(url, payload, { Authorization: auth }, timeout);
  }
  if (r.status < 200 || r.status >= 300) {
    const reason = r.body.match(/<(?:\w+:)?Text[^>]*>([\s\S]*?)<\/(?:\w+:)?Text>/)?.[1] || r.body.slice(0, 240);
    throw new Error(`ONVIF HTTP ${r.status}: ${reason.replace(/\s+/g, ' ').trim()}`);
  }
  if (/<(?:\w+:)?Fault\b/i.test(r.body)) {
    const reason = r.body.match(/<(?:\w+:)?Text[^>]*>([\s\S]*?)<\/(?:\w+:)?Text>/)?.[1] || 'SOAP Fault';
    throw new Error('ONVIF: ' + reason.replace(/\s+/g, ' ').trim());
  }
  return r.body;
}

function xaddrs(xml) {
  return [...xml.matchAll(/<(?:\w+:)?XAddr>([^<]+)<\/\w*:?XAddr>/g)].map((m) => m[1].trim()).filter(Boolean);
}
function textOf(xml, tag) {
  const m = xml.match(new RegExp(`<(?:(?:\\w+):)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}
function profiles(xml) {
  const out = [];
  const re = /<(?:\w+:)?Profiles\b[^>]*\btoken="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?Profiles>/gi;
  let m;
  while ((m = re.exec(xml))) out.push({ token: m[1], name: textOf(m[2], 'Name') || m[1], ptz: /PTZConfiguration/i.test(m[2]) });
  return out;
}

export async function onvifProbe(input = {}) {
  const secure = !!input.https;
  const host = cleanHost(input.host);
  const port = cleanPort(input.port, secure);
  const scheme = secure ? 'https' : 'http';
  const base = `${scheme}://${host}:${port}`;
  const deviceUrl = `${base}/onvif/device_service`;
  const username = String(input.username || '');
  const password = String(input.password || '');
  const modes = username ? ['digest', 'text', 'http'] : ['none'];
  let capsXml = '';
  let authMode = modes[0];
  let lastErr = null;
  for (const mode of modes) {
    try {
      capsXml = await soap(deviceUrl, '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>', { username, password, authMode: mode });
      authMode = mode;
      lastErr = null;
      break;
    } catch (e) { lastErr = e; }
  }
  if (!capsXml) throw lastErr || new Error('A câmera não respondeu ao ONVIF.');
  const urls = xaddrs(capsXml);
  const ptzUrl = urls.find((u) => /ptz/i.test(u)) || `${base}/onvif/ptz_service`;
  const mediaUrl = urls.find((u) => /media/i.test(u) && !/ptz/i.test(u)) || `${base}/onvif/media_service`;
  const auth = { username, password, authMode };
  const devXml = await soap(deviceUrl, '<tds:GetDeviceInformation/>', auth).catch(() => '');
  const mediaXml = await soap(mediaUrl, '<trt:GetProfiles/>', auth);
  const list = profiles(mediaXml);
  if (!list.length) throw new Error('A câmera não retornou perfis ONVIF.');
  const chosen = list.find((p) => p.ptz) || list[0];
  return {
    ok: true, host, port, https: secure, authMode, ptzUrl, mediaUrl,
    profileToken: chosen.token, profiles: list,
    device: { manufacturer: textOf(devXml, 'Manufacturer'), model: textOf(devXml, 'Model'), firmware: textOf(devXml, 'FirmwareVersion'), serial: textOf(devXml, 'SerialNumber') },
  };
}

function endpoint(input = {}) {
  const secure = !!input.https;
  const host = cleanHost(input.host);
  const port = cleanPort(input.port, secure);
  const scheme = secure ? 'https' : 'http';
  const ptzUrl = String(input.ptzUrl || `${scheme}://${host}:${port}/onvif/ptz_service`);
  return {
    host, port, https: secure, scheme,
    ptzUrl, profileToken: String(input.profileToken || ''),
    username: String(input.username || ''), password: String(input.password || ''),
    authMode: ['digest', 'text', 'http', 'none'].includes(input.authMode) ? input.authMode : 'digest',
  };
}

export async function onvifCommand(input = {}) {
  const ep = endpoint(input.endpoint || input);
  if (!ep.profileToken) throw new Error('Perfil ONVIF não configurado.');
  let ptz;
  try { ptz = new URL(ep.ptzUrl); } catch { throw new Error('URL do serviço PTZ inválida.'); }
  if (!['http:', 'https:'].includes(ptz.protocol) || ptz.hostname.toLowerCase() !== ep.host.toLowerCase()) throw new Error('URL PTZ fora do host configurado.');
  if (Number(ptz.port || (ptz.protocol === 'https:' ? 443 : 80)) !== ep.port) throw new Error('URL PTZ fora da porta configurada.');
  const action = String(input.action || '');
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const pan = num(input.pan, -1, 1, 0);
  const tilt = num(input.tilt, -1, 1, 0);
  const zoom = num(input.zoom, 0, 1, 0.5);
  const profile = `<tptz:ProfileToken>${esc(ep.profileToken)}</tptz:ProfileToken>`;
  const auth = { username: ep.username, password: ep.password, authMode: ep.authMode };
  if (action === 'status') {
    const xml = await soap(ep.ptzUrl, `<tptz:GetStatus>${profile}</tptz:GetStatus>`, auth);
    const pt = xml.match(/<(?:\w+:)?PanTilt\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"/i);
    const z = xml.match(/<(?:\w+:)?Zoom\b[^>]*\bx="([^"]+)"/i);
    return { ok: true, action, position: { pan: pt ? num(pt[1], -1, 1, 0) : null, tilt: pt ? num(pt[2], -1, 1, 0) : null, zoom: z ? num(z[1], 0, 1, 0.5) : null } };
  }
  if (action === 'absolute') {
    await soap(ep.ptzUrl, `<tptz:AbsoluteMove>${profile}<tptz:Position><tt:PanTilt x="${pan.toFixed(4)}" y="${tilt.toFixed(4)}"/><tt:Zoom x="${zoom.toFixed(4)}"/></tptz:Position></tptz:AbsoluteMove>`, auth);
  } else if (action === 'continuous') {
    const speed = num(input.speed, 0.05, 1, 0.35);
    await soap(ep.ptzUrl, `<tptz:ContinuousMove>${profile}<tptz:Velocity><tt:PanTilt x="${(pan * speed).toFixed(4)}" y="${(tilt * speed).toFixed(4)}"/><tt:Zoom x="${(zoom * speed).toFixed(4)}"/></tptz:Velocity></tptz:ContinuousMove>`, auth);
  } else if (action === 'stop') {
    await soap(ep.ptzUrl, `<tptz:Stop>${profile}<tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`, auth);
  } else if (action === 'preset_set') {
    const n = Math.max(1, Math.min(99, Math.round(Number(input.preset) || 1)));
    const xml = await soap(ep.ptzUrl, `<tptz:SetPreset>${profile}<tptz:PresetName>CastDeck ${n}</tptz:PresetName></tptz:SetPreset>`, auth);
    const token = xml.match(/<(?:(?:\w+):)?PresetToken[^>]*>([^<]+)<\/(?:(?:\w+):)?PresetToken>/i)?.[1] || '';
    return { ok: true, action, presetToken: token };
  } else if (action === 'preset_goto') {
    const token = String(input.presetToken || '').trim();
    if (!token) throw new Error('Preset ONVIF sem token.');
    await soap(ep.ptzUrl, `<tptz:GotoPreset>${profile}<tptz:PresetToken>${esc(token)}</tptz:PresetToken></tptz:GotoPreset>`, auth);
  } else if (action === 'preset_remove') {
    const token = String(input.presetToken || '').trim();
    if (!token) throw new Error('Preset ONVIF sem token.');
    await soap(ep.ptzUrl, `<tptz:RemovePreset>${profile}<tptz:PresetToken>${esc(token)}</tptz:PresetToken></tptz:RemovePreset>`, auth);
  } else if (action === 'home') {
    try {
      await soap(ep.ptzUrl, `<tptz:GotoHomePosition>${profile}</tptz:GotoHomePosition>`, auth);
    } catch {
      await soap(ep.ptzUrl, `<tptz:AbsoluteMove>${profile}<tptz:Position><tt:PanTilt x="0" y="0"/><tt:Zoom x="0.5"/></tptz:Position></tptz:AbsoluteMove>`, auth);
    }
  } else {
    throw new Error('Comando ONVIF desconhecido.');
  }
  return { ok: true, action };
}

// WS-Discovery: encontra câmeras ONVIF na LAN sem digitar IP.
export function onvifDiscover({ timeout = 2500 } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    let sock;
    try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch { return resolve([]); }
    const msgId = 'uuid:' + crypto.randomUUID();
    const probe = `<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>${msgId}</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`;
    const finish = () => { try { sock.close(); } catch {} resolve([...found.values()]); };
    const timer = setTimeout(finish, timeout);
    sock.on('error', () => { clearTimeout(timer); finish(); });
    sock.on('message', (buf) => {
      const xml = buf.toString('utf8');
      const urls = [...xml.matchAll(/<(?:\w+:)?XAddrs>([\s\S]*?)<\/(?:\w+:)?XAddrs>/gi)].flatMap((m) => m[1].trim().split(/\s+/)).filter(Boolean);
      const scopes = textOf(xml, 'Scopes');
      for (const raw of urls) {
        try {
          const u = new URL(raw);
          if (!['http:', 'https:'].includes(u.protocol)) continue;
          const host = u.hostname;
          const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
          const key = host + ':' + port;
          if (!found.has(key)) found.set(key, { host, port, https: u.protocol === 'https:', url: raw, scopes, name: scopes.split(/\s+/).find((x) => /name=/i.test(x))?.replace(/^.*name=/i, '') || host });
        } catch {}
      }
    });
    sock.bind(0, () => {
      try {
        sock.setMulticastTTL(1);
        sock.addMembership('239.255.255.250');
        sock.send(Buffer.from(probe), 3702, '239.255.255.250', (err) => { if (err) { clearTimeout(timer); finish(); } });
      } catch { clearTimeout(timer); finish(); }
    });
  });
}

export const onvifInternals = { cleanHost, cleanPort, envelope, profiles, digestAuth, xaddrs };
