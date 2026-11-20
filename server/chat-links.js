// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Traduz o LINK da live colado pelo usuário no tipo de fonte de chat certo.
//
// O que dá para puxar só com o link (sem login, sem extensão):
//   YouTube  → sim (leitor do chat da live)
//   Twitch   → sim (IRC público)
//   Kick     → sim (página do chatroom da live, leitura do DOM)
//   TikTok   → experimental (LIVE público; o TikTok às vezes exige login para ver o chat)
//   Facebook → só por API (revisão do Meta) ou Social Stream Ninja
//   Instagram/X/LinkedIn → só Social Stream Ninja
export const CHAT_LINKS = {
  youtube: { label: 'YouTube', kind: 'youtube' },
  twitch: { label: 'Twitch', kind: 'twitch' },
  kick: { label: 'Kick', kind: 'kick' },
  tiktok: { label: 'TikTok', kind: 'tiktok', experimental: true },
  facebook: { label: 'Facebook', kind: 'unsupported', reason: 'facebook' },
  instagram: { label: 'Instagram', kind: 'unsupported', reason: 'instagram' },
  x: { label: 'X', kind: 'unsupported', reason: 'x' },
  linkedin: { label: 'LinkedIn', kind: 'unsupported', reason: 'linkedin' },
};

const bad = (type, reason) => ({ ok: false, type, kind: 'unsupported', reason, label: CHAT_LINKS[type]?.label || type });

// Devolve { ok, kind, type, target, label, experimental? , reason? }
export function detectChatLink(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, kind: 'empty', reason: 'empty' };
  if (/socialstream\.ninja|[?&]session=/i.test(s)) return { ok: true, kind: 'ssn', type: 'ssn', target: s, label: 'Social Stream Ninja' };

  const youtube = s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (youtube) return { ok: true, kind: 'youtube', type: 'youtube', target: s, videoId: youtube[1], label: 'YouTube' };
  if (/youtube\.com\/@[^/]+\/live/i.test(s)) return { ok: true, kind: 'youtube', type: 'youtube', target: s, label: 'YouTube' };

  const twitch = s.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
  if (twitch) return { ok: true, kind: 'twitch', type: 'twitch', target: twitch[1], label: `Twitch (${twitch[1]})` };

  const kick = s.match(/kick\.com\/([A-Za-z0-9_.-]{2,30})/i);
  if (kick && !/^\/(video|category|clips|search|following|browse)/i.test(`/${kick[1]}`))
    return {
      ok: true,
      kind: 'kick',
      type: 'kick',
      target: kick[1].replace(/^@/, ''),
      label: `Kick (@${kick[1].replace(/^@/, '')})`,
      chatUrl: `https://kick.com/${kick[1].replace(/^@/, '')}/chatroom`,
    };

  const tiktok = s.match(/tiktok\.com\/@([\w.\-]{2,40})(?:\/live)?/i);
  if (tiktok)
    return {
      ok: true,
      kind: 'tiktok',
      type: 'tiktok',
      target: tiktok[1],
      label: `TikTok (@${tiktok[1]})`,
      experimental: true,
      chatUrl: `https://www.tiktok.com/@${tiktok[1]}/live`,
    };

  if (/facebook\.com|fb\.watch/i.test(s)) return bad('facebook', 'facebook');
  if (/instagram\.com/i.test(s)) return bad('instagram', 'instagram');
  if (/(^|\/\/)(x|twitter)\.com/i.test(s)) return bad('x', 'x');
  if (/linkedin\.com/i.test(s)) return bad('linkedin', 'linkedin');
  return { ok: false, kind: 'unknown', reason: 'unknown' };
}

// Mensagem de ajuda por motivo (PT; a UI traduz pelo dicionário).
export const UNSUPPORTED_HINT = {
  facebook: 'O Facebook não entrega os comentários da live só pelo link: precisa de um app aprovado pelo Meta. Use o Social Stream Ninja com a extensão do Facebook.',
  instagram: 'O Instagram não abre os comentários da live para outros programas. Use o Social Stream Ninja com a extensão do Instagram.',
  x: 'O X não oferece chat ao vivo por link. Use o Social Stream Ninja.',
  linkedin: 'O LinkedIn não oferece chat ao vivo por link. Use o Social Stream Ninja.',
  unknown: 'Não reconheci esse link. Cole o endereço da live (YouTube, Twitch, Kick ou TikTok) ou a sessão do Social Stream Ninja.',
  empty: 'Cole o link da live.',
};
