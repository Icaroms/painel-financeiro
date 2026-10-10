/**
 * Radar de opções (Fase 04, parte 4.3).
 *
 * O radar mostra opções do mercado por números objetivos, sempre com a fonte
 * e a data. Não é recomendação: o app não diz o que comprar ou vender.
 *
 * De onde vem: um robô no GitHub (.github/workflows/radar.yml) baixa dados
 * públicos uma vez por dia e publica o arquivo radar.json na branch
 * "radar-dados". O app busca esse arquivo (só leitura: nenhum dado da
 * pessoa sai do aparelho) e guarda uma cópia no aparelho, fora do backup,
 * para mostrar sem internet.
 *
 * Partes:
 * - 4.3a: Tesouro Direto do dia (taxas do Tesouro Nacional).
 * - 4.3b, 4.3c, 4.3d: ações e FIIs, dividendos e o comentário da IA (próximas).
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/radar.js.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida } from './datas.js';

/** Onde o robô publica o radar (arquivo público do repositório). */
export const ENDERECO_RADAR = 'https://raw.githubusercontent.com/Icaroms/painel-financeiro/radar-dados/radar.json';

/** Identificação do arquivo: a mesma de scripts/radar/gerar-radar.js (um teste confere). */
export const FORMATO_RADAR = 'painel-financeiro-radar';
export const VERSAO_RADAR = 1;

/** Depois de quantas horas o app busca o radar de novo ao abrir a aba Investir. */
export const HORAS_PARA_BUSCAR_DE_NOVO = 6;

/** Radar com mais de 4 dias: o app avisa que pode estar desatualizado (ex.: o robô parou). */
export const DIAS_PARA_AVISAR_ATRASO = 4;

/** Tipos de rendimento dos títulos do Tesouro, para o filtro da tela. */
export const INDEXADORES = Object.freeze([
  Object.freeze({ id: 'selic', nome: 'Selic' }),
  Object.freeze({ id: 'prefixado', nome: 'Prefixado' }),
  Object.freeze({ id: 'ipca', nome: 'IPCA+' }),
  Object.freeze({ id: 'igpm', nome: 'IGP-M+' }),
]);

/** Um título do Tesouro com os campos que a tela usa. */
function tituloValido(t) {
  return t && typeof t.nome === 'string' && typeof t.indexador === 'string'
    && ehDataValida(t.vencimento) && Number.isFinite(t.taxaCompra)
    && Number.isSafeInteger(t.precoCompraCentavos) && t.precoCompraCentavos > 0;
}

/**
 * Confere o arquivo baixado e devolve o radar.
 * Qualquer problema lança ErroValidacao com uma mensagem clara.
 *
 * @param {unknown} dados O JSON já convertido em objeto.
 * @returns {object} O radar.
 */
export function lerRadar(dados) {
  if (!dados || typeof dados !== 'object' || dados.formato !== FORMATO_RADAR) {
    throw new ErroValidacao('radar', 'O arquivo do radar não é do Painel Financeiro.');
  }
  if (!Number.isInteger(dados.versao) || dados.versao > VERSAO_RADAR) {
    throw new ErroValidacao('radar', 'O radar foi gerado por uma versão mais nova do app: toque em "Procurar atualização" em Configurar.');
  }
  if (Number.isNaN(Date.parse(dados.geradoEm))) {
    throw new ErroValidacao('radar', 'O arquivo do radar não diz quando foi gerado.');
  }
  const tesouro = dados.tesouro;
  if (!tesouro || !ehDataValida(tesouro.dataBase) || !Array.isArray(tesouro.titulos) || !tesouro.titulos.every(tituloValido)) {
    throw new ErroValidacao('radar', 'A parte do Tesouro Direto do radar está incompleta.');
  }
  return dados;
}

/**
 * Já é hora de buscar o radar de novo?
 *
 * @param {string|null|undefined} buscadoEm ISO de quando o app buscou pela última vez.
 * @param {Date} [agora]
 * @returns {boolean} true sem busca anterior ou depois de HORAS_PARA_BUSCAR_DE_NOVO.
 */
export function deveBuscarRadar(buscadoEm, agora = new Date()) {
  const momento = Date.parse(buscadoEm ?? '');
  if (Number.isNaN(momento)) return true;
  return agora.getTime() - momento >= HORAS_PARA_BUSCAR_DE_NOVO * 60 * 60 * 1000;
}

/**
 * O radar está atrasado (o robô pode ter parado)?
 *
 * @param {object} radar
 * @param {Date} [agora]
 * @returns {boolean}
 */
export function radarAtrasado(radar, agora = new Date()) {
  return agora.getTime() - Date.parse(radar.geradoEm) > DIAS_PARA_AVISAR_ATRASO * 24 * 60 * 60 * 1000;
}

/** 13.5 → "13,50%"; -0.01 → "0,01%" (o sinal vai no texto da taxa). */
function porcentagem(valor) {
  return `${Math.abs(valor).toFixed(2).replace('.', ',')}%`;
}

/**
 * Texto da taxa de compra, do jeito que o Tesouro Direto mostra:
 * - Selic:     "Selic + 0,07% ao ano"
 * - IPCA:      "IPCA + 7,20% ao ano"
 * - IGP-M:     "IGP-M + 6,00% ao ano"
 * - prefixado: "13,52% ao ano"
 *
 * @param {{ indexador: string, taxaCompra: number }} titulo
 * @returns {string}
 */
export function textoDaTaxa({ indexador, taxaCompra }) {
  const sinal = taxaCompra < 0 ? '−' : '+';
  if (indexador === 'selic') return `Selic ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  if (indexador === 'ipca') return `IPCA ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  if (indexador === 'igpm') return `IGP-M ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  return `${taxaCompra < 0 ? '−' : ''}${porcentagem(taxaCompra)} ao ano`;
}

/**
 * Títulos do Tesouro do radar, com filtro por tipo de rendimento.
 *
 * @param {object} radar
 * @param {string} [indexador] '' (todos) ou um dos INDEXADORES.
 * @returns {object[]}
 */
export function titulosDoTesouro(radar, indexador = '') {
  return radar.tesouro.titulos.filter((t) => !indexador || t.indexador === indexador);
}
