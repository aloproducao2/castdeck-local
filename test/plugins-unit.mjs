// Testes unitários do núcleo de plugins: manifesto, faixa de versão, permissões, allowlist de rede,
// motor declarativo (gatilho/regex/cooldown/template) e leitor de ZIP.
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {
  validarManifesto,
  vence,
  normalizarPermissoes,
  hostPermitido,
  varrerCodigo,
  validarPacote,
  API_VERSION,
} from '../server/plugin-manifest.js';
import { MotorDeclarativo, regrasDo } from '../server/plugin-declarative.js';
import { readZip } from '../server/zip.js';

let falhas = 0;
const ok = (nome, cond, info = '') => {
  if (!cond) falhas++;
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + info));
};

// ---------- versões ----------
ok('vence >=1.8.25 com 1.8.25', vence('1.8.25', '>=1.8.25'));
ok('vence >=1.8.25 com 2.0.0', vence('2.0.0', '>=1.8.25'));
ok('não vence >=1.9.0 com 1.8.25', !vence('1.8.25', '>=1.9.0'));
ok('caret ^1.8.0 com 1.9.2', vence('1.9.2', '^1.8.0'));
ok('caret ^1.8.0 com 2.0.0 (não)', !vence('2.0.0', '^1.8.0'));
ok('faixa combinada', vence('1.9.0', '>=1.8.0 <2.0.0'));
ok('faixa * aceita tudo', vence('9.9.9', '*'));

// ---------- manifesto ----------
const bom = {
  id: 'castdeck.teste',
  name: 'Teste',
  description: 'x',
  version: '1.0.0',
  author: { name: 'flue.live — Miguel Kallemback' },
  license: 'AGPL-3.0-only',
  engines: { castdeck: '>=1.8.25', api: API_VERSION },
  tier: 'declarative',
  permissions: ['events:chat', 'chat:send', 'overlay:show'],
  rules: [{ on: 'chat.comando', comando: 'oi', do: [{ type: 'chat.send', texto: 'oi' }] }],
};
ok('manifesto válido passa', validarManifesto(bom, { castdeckVersion: '1.8.25' }).ok, JSON.stringify(validarManifesto(bom, { castdeckVersion: '1.8.25' }).erros));
ok('id inválido reprova', !validarManifesto({ ...bom, id: 'AB' }, { castdeckVersion: '1.8.25' }).ok);
ok('sem licença reprova', !validarManifesto({ ...bom, license: '' }, { castdeckVersion: '1.8.25' }).ok);
ok('api errada reprova', !validarManifesto({ ...bom, engines: { castdeck: '>=1.8.25', api: 2 } }, { castdeckVersion: '1.8.25' }).ok);
ok('versão do app incompatível reprova', !validarManifesto(bom, { castdeckVersion: '1.0.0' }).ok);
ok('permissão desconhecida reprova', !validarManifesto({ ...bom, permissions: ['root'] }, { castdeckVersion: '1.8.25' }).ok);
ok('caminho com .. reprova', !validarManifesto({ ...bom, tier: 'code', entry: '../x.js' }, { castdeckVersion: '1.8.25' }).ok);
ok('declarativo sem regras reprova', !validarManifesto({ ...bom, rules: undefined, triggers: undefined }, { castdeckVersion: '1.8.25' }).ok);

// ---------- permissões e rede ----------
const perms = normalizarPermissoes(['events:chat', 'network:http://127.0.0.1', 'network:https://api.exemplo.com/base']);
ok('caps normalizadas', perms.caps.has('events:chat') && perms.caps.has('network') && perms.hosts.length === 2, JSON.stringify([...perms.caps]));
ok('host direto permitido', hostPermitido('http://127.0.0.1:8080/x', ['http://127.0.0.1']));
ok('subdomínio permitido', hostPermitido('https://sub.api.exemplo.com/x', ['api.exemplo.com']));
ok('host estranho bloqueado', !hostPermitido('https://evil.example.com', ['api.exemplo.com']));
ok('protocolo file bloqueado', !hostPermitido('file:///etc/passwd', ['127.0.0.1']));
ok('http malformado bloqueado', !hostPermitido('nada', ['api.exemplo.com']));

// ---------- varredura de código ----------
ok('detecta child_process', varrerCodigo("import x from 'node:child_process';").length > 0);
ok('detecta fs', varrerCodigo("const fs = require('fs');").length > 0);
ok('detecta eval', varrerCodigo('eval("1")').length > 0);
ok('código limpo passa', varrerCodigo('export default function activate(cd) { cd.log("ok"); }').length === 0);

// ---------- pacote ----------
function zipStored(arquivos) {
  const locais = [];
  const central = [];
  let offset = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo, 'utf8');
    const nomeBuf = Buffer.from(nome, 'utf8');
    const crc = (() => {
      let c = ~0;
      for (const b of dados) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
      return ~c >>> 0;
    })();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, dados);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(dados.length, 20);
    cen.writeUInt32LE(dados.length, 24);
    cen.writeUInt16LE(nomeBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nomeBuf);
    offset += local.length + nomeBuf.length + dados.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(dir.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, dir, fim]);
}

const zip = zipStored({ 'plugin.json': JSON.stringify(bom), 'README.md': 'oi' });
const lido = readZip(zip);
ok('zip: lê entradas', lido.length === 2, JSON.stringify(lido.map((e) => e.name)));
ok('zip: conteúdo íntegro', lido.find((e) => e.name === 'README.md').data.toString() === 'oi');
ok('pacote válido passa', validarPacote(lido, { castdeckVersion: '1.8.25' }).ok, JSON.stringify(validarPacote(lido, { castdeckVersion: '1.8.25' }).erros));
const zipMalicioso = zipStored({ 'plugin.json': JSON.stringify(bom), 'src/x.js': "require('child_process').exec('calc')" });
ok('pacote com código perigoso reprova', !validarPacote(readZip(zipMalicioso), { castdeckVersion: '1.8.25' }).ok);
const zipExe = zipStored({ 'plugin.json': JSON.stringify(bom), 'malware.exe': 'MZ' });
ok('pacote com .exe reprova', !validarPacote(readZip(zipExe), { castdeckVersion: '1.8.25' }).ok);

// ---------- motor declarativo ----------
const executadas = [];
let agora = 1000;
const motor = new MotorDeclarativo({
  executarAcao: async (ctx) => {
    executadas.push(ctx.acao);
    return { ok: true };
  },
  log: () => {},
  agora: () => agora,
});
motor.registrar({
  ...bom,
  rules: [
    { on: 'chat.comando', comando: 'discord', cooldownSeg: 30, do: [{ type: 'chat.send', texto: 'link {{arg1}}' }, { type: 'chat.send', texto: 'eco: {{texto}}' }] },
    { on: 'chat.regex', padrao: '^oi\\b', cooldownSeg: 10, do: [{ type: 'overlay.show', titulo: 'Oi', texto: '{{usuario}} chegou' }] },
    { on: 'stage.entrou', do: [{ type: 'overlay.show', titulo: 'Palco', texto: '{{fonte}} entrou' }] },
  ],
});
await motor.emitir({ tipo: 'chat', usuario: 'ana', texto: '!discord https://d.gg/x', args: ['https://d.gg/x'] });
ok('comando casou e interpolar arg1', executadas.some((a) => a.texto === 'link https://d.gg/x'), JSON.stringify(executadas));
ok('texto completo disponível em {{texto}}', executadas.some((a) => a.texto === 'eco: !discord https://d.gg/x'), JSON.stringify(executadas));
agora += 1000;
const antes = executadas.length;
await motor.emitir({ tipo: 'chat', usuario: 'ana', texto: '!discord https://d.gg/x', args: ['https://d.gg/x'] });
ok('cooldown evita repetir', executadas.length === antes, `${executadas.length} vs ${antes}`);
await motor.emitir({ tipo: 'chat', usuario: 'bia', texto: 'oi pessoal' });
ok('regex casa e usa {{usuario}}', executadas.some((a) => a.texto === 'bia chegou'), JSON.stringify(executadas.slice(-2)));
await motor.emitir({ tipo: 'stage', acao: 'entrou', fonte: 'cam2' });
ok('evento de palco casou', executadas.some((a) => a.texto === 'cam2 entrou'), JSON.stringify(executadas.slice(-2)));
ok('regrasDo aceita formato antigo', regrasDo({ triggers: [{ on: 'chat' }], actions: [{ type: 'chat.send' }] }).length === 1);

console.log(falhas ? `\nPLUGINS_UNIT_FAIL (${falhas})` : '\nPLUGINS_UNIT_OK');
process.exit(falhas ? 1 : 0);
