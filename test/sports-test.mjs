import fs from 'node:fs';
import { parseRoster } from '../public/js/studio/sports.js';

let ok = true;
const check = (title, condition, info = '') => {
  if (!condition) ok = false;
  console.log(condition ? 'PASS' : 'FAIL', title, info ? `(${info})` : '');
};

console.log('=== TESTE: REORGANIZAÇÃO DE ESPORTES E CADASTRO DE TIMES ===\n');

// 1. Validar CSS em public/css/app.css
const appCss = fs.readFileSync('public/css/app.css', 'utf8');
check('Regra global .grow definida com flex: 1 e min-width: 0', appCss.includes('.row > .grow, .grow { flex: 1; min-width: 0; }'));
check('Classe .sp-tm-fields definida para os campos do time', appCss.includes('.sp-tm-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }'));
check('Classe .sp-team-card definida para o confronto de mandante/visitante', appCss.includes('.sp-team-card { display: flex; align-items: center; gap: 6px;'));
check('.sp-match usa display: grid e align-items: stretch', appCss.includes('.sp-match { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch;'));

// 2. Validar ordenação da aba Esportes em public/js/studio/sports.js
const sportsJs = fs.readFileSync('public/js/studio/sports.js', 'utf8');

const renderIdx = sportsJs.indexOf('function render() {');
check('Função render() encontrada em sports.js', renderIdx !== -1);

if (renderIdx !== -1) {
  const nextFn = sportsJs.indexOf('function openAdjust() {', renderIdx);
  const renderCode = sportsJs.slice(renderIdx, nextFn !== -1 ? nextFn : renderIdx + 12000);
  const posPartida = renderCode.indexOf('<h4>Partida e times</h4>');
  const posPlacar = renderCode.indexOf('<h4>Placar e cronômetro</h4>');
  const posGcs = renderCode.indexOf('<h4>GCs esportivos</h4>');
  const posLog = renderCode.indexOf('<h4>Lance a lance</h4>');
  const posEscalacao = renderCode.indexOf('<h4>Escalação em campo</h4>');
  const posRegras = renderCode.indexOf('<h4>Relógio e regras da partida</h4>');

  check('Seção "Partida e times" está no topo (1º lugar)', posPartida !== -1 && posPartida < posPlacar);
  check('Seção "Placar e cronômetro" vem em 2º lugar', posPlacar !== -1 && posPlacar < posGcs);
  check('Seção "GCs esportivos" vem em 3º lugar', posGcs !== -1 && posGcs < posLog);
  check('Seção "Lance a lance" vem em 4º lugar', posLog !== -1 && posLog < posEscalacao);
  check('Seção "Escalação em campo" vem em 5º lugar', posEscalacao !== -1 && posEscalacao < posRegras);
  check('Seção "Relógio e regras da partida" vem em 6º lugar', posRegras !== -1);
}

// 3. Validar cards de confronto com botões de edição rápida
check('Card do Mandante tem botão de editar (sp-edit-home)', sportsJs.includes('id="sp-edit-home"'));
check('Card do Mandante tem botão de novo time (sp-new-home)', sportsJs.includes('id="sp-new-home"'));
check('Card do Visitante tem botão de editar (sp-edit-away)', sportsJs.includes('id="sp-edit-away"'));
check('Card do Visitante tem botão de novo time (sp-new-away)', sportsJs.includes('id="sp-new-away"'));
check('Botão de inversão de mandante/visitante existe (sp-swap)', sportsJs.includes('id="sp-swap"'));
check('Botão toggle de lista de times salvos existe (sp-lib-toggle)', sportsJs.includes('id="sp-lib-toggle"'));

// 4. Validar modal de cadastro de times
check('Modal usa container .sp-tm-fields grow', sportsJs.includes('class="sp-tm-fields grow"'));
check('Campo de nome do time tem id="tm-name" e autocomplete="off"', sportsJs.includes('id="tm-name"') && sportsJs.includes('autocomplete="off"'));
check('Campo de sigla tem id="tm-abbr"', sportsJs.includes('id="tm-abbr"'));
check('Foco automático garantido com requestAnimationFrame / setTimeout', sportsJs.includes('requestAnimationFrame') && sportsJs.includes('name?.focus()'));

// 5. Validar parser de elenco (parseRoster)
const rosterSample = `1 Rossi - Goleiro
10 Gabriel Barbosa - Atacante
14 De Arrascaeta - Meia`;
const parsed = parseRoster(rosterSample);
check('parseRoster extrai 3 jogadores', parsed.length === 3);
check('Jogador 1: Nº 1, Rossi, Goleiro', parsed[0].num === '1' && parsed[0].name === 'Rossi' && parsed[0].pos === 'Goleiro');
check('Jogador 2: Nº 10, Gabriel Barbosa, Atacante', parsed[1].num === '10' && parsed[1].name === 'Gabriel Barbosa' && parsed[1].pos === 'Atacante');

console.log(ok ? '\nTODOS OS TESTES DE ESPORTES PASSARAM COM SUCESSO!' : '\nHOUVE FALHAS NOS TESTES.');
process.exit(ok ? 0 : 1);
