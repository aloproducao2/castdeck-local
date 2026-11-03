// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Leitura de feeds RSS 2.0 / Atom / RDF sem dependências externas.
const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, ' ') // tags reais
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d || 32))
    .replace(/&(lt|gt|quot|apos|nbsp);/g, (_, n) => ({ lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n])
    .replace(/<\/?[a-z][^>]*>/gi, ' ') // tags que vinham escapadas (&lt;i&gt;)
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();const tagText = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1]) : '';
};
export function parseFeed(xml) {
  const head = xml.slice(0, 2000).toLowerCase();
  if (!/<(rss|feed|rdf:rdf)\b/.test(head) && !/<(rss|feed|rdf:rdf)\b/i.test(xml.slice(0, 20000))) throw new Error('não é um feed RSS/Atom válido');
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const first = xml.search(/<(item|entry)\b/i);
  const channel = first > 0 ? xml.slice(0, first) : xml;
  const items = blocks
    .map((b) => ({
      title: tagText(b, 'title'),
      link: (b.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || tagText(b, 'link'),
      date: tagText(b, 'pubDate') || tagText(b, 'updated') || tagText(b, 'published') || tagText(b, 'dc:date'),
    }))
    .filter((i) => i.title);
  return { title: tagText(channel, 'title'), items: items.slice(0, 50) };
}
