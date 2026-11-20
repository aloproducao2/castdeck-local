// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Assinatura Authenticode dos executáveis do CastDeck (Windows).
//
// Por que existe: sem assinatura, o Windows Defender e outros antivírus colocam o .exe em quarentena e o
// SmartScreen mostra "aplicativo não reconhecido". Assinar (e assinar TAMBÉM o servidor embutido, que o
// lançador grava em disco e executa) é o que muda a reputação do arquivo.
//
// Como usar (o build chama automaticamente se as variáveis existirem):
//   PFX (OV/EV de qualquer CA, inclusive brasileiras):
//     CASTDECK_SIGN_PFX=C:\certs\castdeck.pfx
//     CASTDECK_SIGN_PASSWORD=segredo
//   Azure Trusted Signing / Artifact Signing (conta elegível):
//     CASTDECK_SIGN_DLIB=C:\dlib\Azure.CodeSigning.Dlib.dll
//     CASTDECK_SIGN_TS_ENDPOINT=https://eus.codesigning.azure.net/
//     CASTDECK_SIGN_TS_ACCOUNT=<conta>
//     CASTDECK_SIGN_TS_PROFILE=<perfil>
//   Comum: CASTDECK_SIGN_TIMESTAMP (padrão http://timestamp.digicert.com), SIGTOOL (caminho do signtool.exe)
//
// Também pode ser chamado direto:
//   node build/sign.mjs --check              (diz se há certificado configurado)
//   node build/sign.mjs arquivo.exe [...]    (assina)
//   node build/sign.mjs --verify arquivo.exe (confere a assinatura)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TIMESTAMP_PADRAO = 'http://timestamp.digicert.com';

export function signConfig(env = process.env) {
  const pfx = env.CASTDECK_SIGN_PFX || '';
  const senha = env.CASTDECK_SIGN_PASSWORD || '';
  const dlib = env.CASTDECK_SIGN_DLIB || '';
  const conta = env.CASTDECK_SIGN_TS_ACCOUNT || '';
  const perfil = env.CASTDECK_SIGN_TS_PROFILE || '';
  const endpoint = env.CASTDECK_SIGN_TS_ENDPOINT || 'https://eus.codesigning.azure.net/';
  const modo = dlib && conta && perfil ? 'trusted-signing' : pfx ? 'pfx' : null;
  return {
    modo,
    pfx,
    senha,
    dlib,
    conta,
    perfil,
    endpoint,
    timestamp: env.CASTDECK_SIGN_TIMESTAMP || TIMESTAMP_PADRAO,
    signtool: env.SIGTOOL || acharSigntool(),
  };
}

// signtool vem com o Windows SDK; procura nos caminhos usuais (x64 antes de x86).
export function acharSigntool() {
  const raizes = [
    'C:/Program Files (x86)/Windows Kits/10/bin',
    'C:/Program Files/Windows Kits/10/bin',
  ];
  for (const raiz of raizes) {
    if (!fs.existsSync(raiz)) continue;
    let versoes = [];
    try {
      versoes = fs.readdirSync(raiz).filter((v) => /^\d+\.\d+/.test(v)).sort().reverse();
    } catch {
      continue;
    }
    for (const v of versoes) {
      for (const arch of ['x64', 'x86']) {
        const p = path.join(raiz, v, arch, 'signtool.exe');
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return '';
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

export function assinaturaDisponivel(env = process.env) {
  const cfg = signConfig(env);
  return { ...cfg, pronto: !!cfg.modo && (cfg.modo !== 'pfx' || fs.existsSync(cfg.pfx)) && !!cfg.signtool };
}

// Assina um arquivo. Devolve { ok, motivo }.
export function assinarArquivo(arquivo, env = process.env) {
  const cfg = signConfig(env);
  if (!cfg.modo) return { ok: false, motivo: 'sem certificado configurado (CASTDECK_SIGN_PFX ou Azure Trusted Signing)' };
  if (!cfg.signtool) return { ok: false, motivo: 'signtool.exe não encontrado (instale o Windows SDK ou defina SIGTOOL)' };
  if (!fs.existsSync(arquivo)) return { ok: false, motivo: `arquivo não existe: ${arquivo}` };

  const args = ['sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', cfg.timestamp];
  if (cfg.modo === 'pfx') {
    if (!fs.existsSync(cfg.pfx)) return { ok: false, motivo: `PFX não encontrado: ${cfg.pfx}` };
    args.push('/f', cfg.pfx);
    if (cfg.senha) args.push('/p', cfg.senha);
  } else {
    args.push(
      '/dlib', cfg.dlib,
      '/dmdf', `/{ "Endpoint": "${cfg.endpoint}", "CodeSigningAccountName": "${cfg.conta}", "CertificateProfileName": "${cfg.perfil}" }`,
    );
  }
  args.push(arquivo);
  const r = run(cfg.signtool, args);
  if (r.code !== 0) return { ok: false, motivo: r.out.split('\n').slice(-3).join(' ') };
  return { ok: true, motivo: '' };
}

// Confere a assinatura: `ok` = existe assinatura; `valida` = a cadeia é confiável (CA pública).
// Certificado de teste (autoassinado) tem assinatura mas não a cadeia — útil só para validar o pipeline.
export function verificarAssinatura(arquivo, env = process.env) {
  const cfg = signConfig(env);
  if (!cfg.signtool) {
    const ps = run('powershell', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${arquivo}').Status`]);
    const ok = /Valid|UnknownError|NotTrusted|UntrustedRoot/i.test(ps.out);
    return { ok, valida: /Valid/i.test(ps.out), motivo: ps.out };
  }
  const r = run(cfg.signtool, ['verify', '/pa', '/q', arquivo]);
  if (r.code === 0) return { ok: true, valida: true, motivo: '' };
  // assinatura presente, mas cadeia não confiável (certificado de teste)
  const semCadeia = /not trusted|UntrustedRoot|terminated in a root|0x800B0109/i.test(r.out);
  const ps = semCadeia
    ? run('powershell', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${arquivo}').SignerCertificate.Subject`])
    : { out: '' };
  return { ok: semCadeia && !!ps.out.trim(), valida: false, motivo: r.out.split('\n').slice(-2).join(' ') };
}

// Assina vários arquivos e para no primeiro erro (o build não deve publicar sem assinatura quando há cert).
export function assinarArquivos(lista, { env = process.env, log = console.log } = {}) {
  const cfg = assinaturaDisponivel(env);
  if (!cfg.pronto) {
    log(`[sign] sem assinatura (${cfg.motivo || 'certificado não configurado'}) — seguindo sem assinar`);
    return { assinados: 0, ignorado: true };
  }
  const aceitarSemCadeia = String(env.CASTDECK_SIGN_ALLOW_UNTRUSTED || '') === '1';
  let assinados = 0;
  for (const arquivo of lista) {
    if (!arquivo || !fs.existsSync(arquivo)) continue;
    const r = assinarArquivo(arquivo, env);
    if (!r.ok) throw new Error(`falha ao assinar ${path.basename(arquivo)}: ${r.motivo}`);
    const v = verificarAssinatura(arquivo, env);
    if (!v.ok) throw new Error(`assinatura ausente em ${path.basename(arquivo)}: ${v.motivo}`);
    if (!v.valida && !aceitarSemCadeia) {
      throw new Error(
        `assinatura de ${path.basename(arquivo)} não tem cadeia confiável (certificado de teste?). ` +
          'Use o certificado de produção ou defina CASTDECK_SIGN_ALLOW_UNTRUSTED=1 apenas para testar o pipeline.',
      );
    }
    log(`[sign] ✔ ${path.basename(arquivo)}${v.valida ? '' : ' (cadeia não confiável — teste)'}`);
    assinados++;
  }
  return { assinados, ignorado: false };
}

// CLI
const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDireto) {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--check') {
    const cfg = assinaturaDisponivel();
    console.log('modo:', cfg.modo || 'nenhum');
    console.log('signtool:', cfg.signtool || 'não encontrado');
    console.log('timestamp:', cfg.timestamp);
    console.log(cfg.pronto ? 'pronto para assinar ✔' : `faltando: ${cfg.motivo || 'certificado'}`);
    process.exit(0);
  }
  if (args[0] === '--verify') {
    let falhou = false;
    for (const f of args.slice(1)) {
      const v = verificarAssinatura(f);
      console.log(`${v.ok ? 'OK   ' : 'FALHA'} ${path.basename(f)} — ${v.motivo}`);
      if (!v.ok) falhou = true;
    }
    process.exit(falhou ? 1 : 0);
  }
  const { assinados } = assinarArquivos(args);
  process.exit(assinados > 0 ? 0 : 1);
}
