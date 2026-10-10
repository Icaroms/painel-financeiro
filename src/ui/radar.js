/**
 * Seção "Radar de opções" da aba Investir (Fase 04, partes 4.3a, 4.3b e 4.3c).
 *
 * - Ao abrir a aba, mostra o radar guardado no aparelho e, se a última
 *   busca tiver mais de 6 horas, busca o arquivo novo que o robô publicou.
 * - "Atualizar radar" busca na hora.
 * - Sem internet, continua mostrando o último radar guardado.
 * - Tesouro Direto do dia: filtro por tipo de rendimento e 5 títulos por página.
 * - Ações e FIIs (B3): maiores altas, maiores baixas e mais negociados, com
 *   filtros de período e de preço de 1 unidade (inclusive "cabe na parte
 *   Investir deste mês", do destino da sobra). 5 por página.
 * - FIIs por dividendos de 12 meses (informados à CVM), com o P/VP: a lista
 *   "Dividendos" aparece quando o tipo é FII.
 * - "Comentar esta lista com IA" (4.3d): a IA comenta a lista da tela com a
 *   carteira (src/radar-ia.js). Mudou um filtro, o comentário antigo some.
 *
 * A busca é só leitura de um arquivo público: nenhum dado da pessoa sai
 * do aparelho. Como em toda a pasta src/ui, aqui só fica a TELA; as regras
 * ficam em src/radar.js (testado no Node). Todo texto entra com textContent.
 */

import { formatarCentavos } from '../dinheiro.js';
import { hojeLocal } from '../datas.js';
import { chamarGemini, iaDisponivel } from '../ia.js';
import { blocosDaResposta } from '../analise.js';
import { mensagemDoRadar } from '../radar-ia.js';
import { elementosDosBlocos } from './blocos-ia.js';
import { ErroValidacao } from '../erros.js';
import { paginar } from '../historico.js';
import { quandoFoiFeita } from '../analise.js';
import {
  ENDERECO_RADAR,
  INDEXADORES,
  lerRadar,
  deveBuscarRadar,
  radarAtrasado,
  textoDaTaxa,
  titulosDoTesouro,
  LISTAS_DO_MERCADO,
  PERIODOS,
  FAIXAS_DE_PRECO,
  periodoDisponivel,
  listaDoMercado,
  textoDaVariacao,
  textoDoVolume,
  listaDeDividendos,
  textoDosDividendos,
  textoDoPvp,
  textoDoMes,
} from '../radar.js';

/** Tempo máximo esperando o arquivo do radar. */
const TEMPO_LIMITE_MS = 15_000;

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe, texto e atributos opcionais. */
function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** "2035-05-15" → "15/05/2035". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/**
 * Liga a seção do radar.
 *
 * @param {object} opcoes
 * @param {() => Promise<{ radar: object, buscadoEm: string }|undefined>} opcoes.lerGuardado
 * @param {(guardado: { radar: object, buscadoEm: string }) => Promise<void>} opcoes.guardar
 * @param {() => number} [opcoes.obterInvestirCentavos] Parte "Investir" da sobra deste mês (destino da sobra).
 * @param {() => object} [opcoes.obterDados] Dados do app (a carteira vai no comentário da IA).
 * @param {() => object} [opcoes.obterConfigIA] Configuração da IA (o botão só aparece com a IA disponível).
 * @param {typeof fetch} [opcoes.buscar] Para testes; padrão: fetch do navegador.
 * @returns {{ renderizar: () => void }}
 */
export function iniciarRadar({
  lerGuardado, guardar, obterInvestirCentavos = () => 0, obterDados = () => null, obterConfigIA = () => null,
  buscar = (...args) => fetch(...args),
}) {
  const el = {
    situacao: elemento('radar-situacao'),
    fonte: elemento('radar-tesouro-fonte'),
    filtro: elemento('radar-tesouro-filtro'),
    lista: elemento('radar-tesouro'),
    paginacao: elemento('paginacao-radar-tesouro'),
    botao: elemento('botao-atualizar-radar'),
    mercado: {
      fonte: elemento('radar-mercado-fonte'),
      filtros: elemento('radar-mercado-filtros'),
      tipo: elemento('radar-mercado-tipo'),
      lista: elemento('radar-mercado-lista'),
      periodo: elemento('radar-mercado-periodo'),
      campoPeriodo: elemento('radar-mercado-periodo-campo'),
      preco: elemento('radar-mercado-preco'),
      itens: elemento('radar-mercado'),
      paginacao: elemento('paginacao-radar-mercado'),
      nota: elemento('radar-mercado-nota'),
    },
    ia: {
      bloco: elemento('radar-ia'),
      pedir: elemento('radar-ia-pedir'),
      resposta: elemento('radar-ia-resposta'),
    },
  };

  /** A lista que está na tela (vai para a IA): filtros e itens. null sem lista. */
  let visaoAtual = null;
  /** Assinatura da lista comentada: se a lista mudar, o comentário some. */
  let comentada = '';

  /** O que está guardado no aparelho: { radar, buscadoEm } ou null. */
  let guardado = null;
  let carregou = false;
  let buscando = false;
  let pagina = 1;
  let paginaMercado = 1;

  /* ---------------- Desenho ---------------- */

  /**
   * Botões "Anterior" e "Próxima". Com uma página só, a paginação some.
   * @param {HTMLElement} nav
   * @param {{ pagina: number, totalPaginas: number }} resultado
   * @param {(nova: number) => void} irPara
   */
  function montarPaginacao(nav, { pagina: atual, totalPaginas }, irPara) {
    if (totalPaginas <= 1) {
      nav.replaceChildren();
      return;
    }
    const anterior = criar('button', { classe: 'botao-pequeno', type: 'button', texto: '‹ Anterior' });
    const proxima = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Próxima ›' });
    anterior.disabled = atual === 1;
    proxima.disabled = atual === totalPaginas;
    anterior.addEventListener('click', () => irPara(atual - 1));
    proxima.addEventListener('click', () => irPara(atual + 1));
    nav.replaceChildren(
      anterior,
      criar('span', { classe: 'pagina-atual secundario', texto: `Página ${atual} de ${totalPaginas}` }),
      proxima,
    );
  }

  /** Opções do filtro: "Todos" e só os tipos que existem no radar. */
  function preencherFiltro(radar) {
    const escolhido = el.filtro.value;
    const existentes = INDEXADORES.filter((i) => radar.tesouro.titulos.some((t) => t.indexador === i.id));
    el.filtro.replaceChildren(
      criar('option', { value: '', texto: 'Todos os tipos' }),
      ...existentes.map((i) => criar('option', { value: i.id, texto: i.nome })),
    );
    el.filtro.value = existentes.some((i) => i.id === escolhido) ? escolhido : '';
  }

  /** Linha de um título do Tesouro. */
  function linhaDoTitulo(titulo) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: titulo.nome }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: `${textoDaTaxa(titulo)} · vence em ${dataLonga(titulo.vencimento)}` }),
    );
    const lado = criar('div', { classe: 'linha-mes-lado' });
    lado.append(
      criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(titulo.precoCompraCentavos) }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: 'por título' }),
    );
    li.append(info, lado);
    return li;
  }

  /** Aviso de lista vazia. */
  const vazio = (texto) => criar('li', { classe: 'lista-vazia secundario', texto });

  /** Linha "fonte e data" com o link da fonte. */
  function linhaDaFonte(destino, prefixo, parte) {
    destino.replaceChildren(
      `${prefixo} · fonte: `,
      criar('a', { href: parte.link, target: '_blank', rel: 'noopener noreferrer', texto: parte.fonte }),
      '.',
    );
  }

  /** Parte do Tesouro Direto. */
  function desenharTesouro(radar) {
    if (!radar?.tesouro) {
      el.fonte.textContent = '';
      el.filtro.hidden = true;
      el.lista.replaceChildren(vazio(buscando ? 'Buscando o radar…' : 'Ainda não há taxas do Tesouro neste aparelho.'));
      el.paginacao.replaceChildren();
      return;
    }
    linhaDaFonte(el.fonte, `Taxas de ${dataLonga(radar.tesouro.dataBase)}`, radar.tesouro);
    el.filtro.hidden = false;
    preencherFiltro(radar);

    const paginaAtual = paginar(titulosDoTesouro(radar, el.filtro.value), pagina);
    pagina = paginaAtual.pagina; // paginar() volta sozinha para a última página que ainda existe
    el.lista.replaceChildren(...paginaAtual.itens.map(linhaDoTitulo));
    montarPaginacao(el.paginacao, paginaAtual, (nova) => { pagina = nova; desenhar(); });
  }

  /** Opções do filtro de preço: as fixas + "cabe na parte Investir deste mês". */
  function preencherPrecos() {
    const escolhido = el.mercado.preco.value;
    const investir = obterInvestirCentavos();
    const opcaoInvestir = criar('option', {
      value: 'investir',
      texto: investir > 0 ? `Cabe no Investir deste mês (${formatarCentavos(investir)})` : 'Investir deste mês: R$ 0,00',
    });
    opcaoInvestir.disabled = investir <= 0;
    el.mercado.preco.replaceChildren(
      ...FAIXAS_DE_PRECO.map((f) => criar('option', { value: f.id, texto: f.nome })),
      opcaoInvestir,
    );
    const valido = escolhido === 'investir' ? investir > 0 : FAIXAS_DE_PRECO.some((f) => f.id === escolhido);
    el.mercado.preco.value = valido ? escolhido : '';
  }

  /** Preço máximo de 1 unidade pela escolha do filtro (null = qualquer). */
  function precoMaximo() {
    if (el.mercado.preco.value === 'investir') return obterInvestirCentavos();
    return FAIXAS_DE_PRECO.find((f) => f.id === el.mercado.preco.value)?.maximoCentavos ?? null;
  }

  /** Linha de uma ação ou FII. */
  function linhaDoAtivo(ativo, lista, periodo) {
    const unidade = ativo.tipo === 'fii' ? 'por cota' : 'por ação';
    const periodoTexto = PERIODOS.find((p) => p.id === periodo).texto;
    const valorDoPeriodo = ativo.variacoes[periodo];
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const detalhe = lista === 'negociados'
      ? `${formatarCentavos(ativo.precoCentavos)} ${unidade} · ${textoDaVariacao(valorDoPeriodo)} ${periodoTexto}`
      : `${formatarCentavos(ativo.precoCentavos)} ${unidade} · ${textoDoVolume(ativo.volumeCentavos)} negociados no dia`;
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: `${ativo.codigo} · ${ativo.nome}` }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: detalhe }),
    );
    const lado = criar('div', { classe: 'linha-mes-lado' });
    if (lista === 'negociados') {
      lado.append(
        criar('span', { classe: 'linha-mes-valor', texto: textoDoVolume(ativo.volumeCentavos) }),
        criar('span', { classe: 'linha-mes-detalhe secundario', texto: 'no dia' }),
      );
    } else {
      lado.append(
        criar('span', { classe: `linha-mes-valor ${valorDoPeriodo > 0 ? 'ganho' : 'perda'}`, texto: textoDaVariacao(valorDoPeriodo) }),
        criar('span', { classe: 'linha-mes-detalhe secundario', texto: periodoTexto }),
      );
    }
    li.append(info, lado);
    return li;
  }

  /** Linha de um FII na lista de dividendos. */
  function linhaDoFii(fii) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: `${fii.codigo} · ${fii.nome}` }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: `${formatarCentavos(fii.precoCentavos)} por cota · ${textoDoPvp(fii.pvp)}` }),
    );
    const lado = criar('div', { classe: 'linha-mes-lado' });
    lado.append(
      criar('span', { classe: 'linha-mes-valor', texto: textoDosDividendos(fii.dividendos12m) }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: 'em 12 meses' }),
    );
    li.append(info, lado);
    return li;
  }

  /** Opções da Lista conforme o tipo (a de dividendos é só de FIIs). */
  function preencherListas() {
    const escolhida = el.mercado.lista.value;
    const listas = LISTAS_DO_MERCADO.filter((l) => l.tipos.includes(el.mercado.tipo.value));
    el.mercado.lista.replaceChildren(...listas.map((l) => criar('option', { value: l.id, texto: l.nome })));
    el.mercado.lista.value = listas.some((l) => l.id === escolhida) ? escolhida : listas[0].id;
  }

  /** Parte de ações e FIIs. */
  function desenharMercado(radar) {
    const m = el.mercado;
    if (!radar?.mercado) {
      m.fonte.textContent = '';
      m.filtros.hidden = true;
      m.nota.hidden = true;
      m.itens.replaceChildren(vazio(buscando ? 'Buscando o radar…' : 'Ainda não há cotações da B3 neste aparelho.'));
      m.paginacao.replaceChildren();
      return;
    }
    m.filtros.hidden = false;
    m.nota.hidden = false;
    preencherListas();
    preencherPrecos();

    // Lista de dividendos (FIIs): dados da CVM + preço da B3, sem período.
    if (m.lista.value === 'dividendos') {
      m.campoPeriodo.hidden = true;
      if (!radar.fiis) {
        m.fonte.textContent = '';
        m.itens.replaceChildren(vazio('Ainda não há os dividendos dos FIIs neste aparelho.'));
        m.paginacao.replaceChildren();
        return;
      }
      const ate = radar.fiis.mesReferencia ? `até ${textoDoMes(radar.fiis.mesReferencia)}` : '';
      linhaDaFonte(m.fonte, `Dividendos informados à CVM ${ate} · preços de ${dataLonga(radar.fiis.dataBase)}`, radar.fiis);
      const fiis = listaDeDividendos(radar, { precoMaximoCentavos: precoMaximo() });
      visaoAtual = { tipo: 'fii', lista: 'dividendos', periodo: 'mes', precoMaximoCentavos: precoMaximo(), itens: fiis };
      const paginaFiis = paginar(fiis, paginaMercado);
      paginaMercado = paginaFiis.pagina;
      m.itens.replaceChildren(...(fiis.length === 0 ? [vazio('Nenhum FII com esses filtros.')] : paginaFiis.itens.map(linhaDoFii)));
      montarPaginacao(m.paginacao, paginaFiis, (nova) => { paginaMercado = nova; desenhar(); });
      return;
    }

    linhaDaFonte(m.fonte, `Fechamento de ${dataLonga(radar.mercado.dataBase)}`, radar.mercado);

    // Períodos que o robô conseguiu calcular; a lista "Mais negociados" não usa período.
    const periodos = PERIODOS.filter((p) => periodoDisponivel(radar, p.id));
    const periodoEscolhido = m.periodo.value;
    m.periodo.replaceChildren(...periodos.map((p) => criar('option', { value: p.id, texto: p.nome })));
    m.periodo.value = periodos.some((p) => p.id === periodoEscolhido) ? periodoEscolhido : (periodos.find((p) => p.id === 'mes') ?? periodos[0])?.id ?? '';
    m.campoPeriodo.hidden = m.lista.value === 'negociados' || periodos.length === 0;

    const lista = m.lista.value;
    const periodo = m.periodo.value || 'mes';
    const itens = (lista !== 'negociados' && periodos.length === 0)
      ? []
      : listaDoMercado(radar, { tipo: m.tipo.value, lista, periodo, precoMaximoCentavos: precoMaximo() });
    visaoAtual = { tipo: m.tipo.value, lista, periodo, precoMaximoCentavos: precoMaximo(), itens };
    const paginaAtual = paginar(itens, paginaMercado);
    paginaMercado = paginaAtual.pagina;
    m.itens.replaceChildren(...(itens.length === 0
      ? [vazio('Nenhum ativo com esses filtros.')]
      : paginaAtual.itens.map((a) => linhaDoAtivo(a, lista, periodo))));
    montarPaginacao(m.paginacao, paginaAtual, (nova) => { paginaMercado = nova; desenhar(); });
  }

  /** Assinatura da lista na tela (filtros + códigos), para saber se o comentário ainda vale. */
  const assinatura = (visao) => (visao
    ? JSON.stringify([visao.tipo, visao.lista, visao.periodo, visao.precoMaximoCentavos, visao.itens.map((i) => i.codigo)])
    : '');

  /** Botão da IA: só com a IA disponível e uma lista na tela; comentário velho some. */
  function desenharIA(radar) {
    const disponivel = iaDisponivel(obterConfigIA()) && Boolean(radar?.mercado) && visaoAtual !== null;
    el.ia.bloco.hidden = !disponivel;
    if (!disponivel || assinatura(visaoAtual) !== comentada) {
      el.ia.resposta.hidden = true;
      el.ia.resposta.replaceChildren();
      el.ia.pedir.textContent = 'Comentar esta lista com IA';
      comentada = '';
    }
  }

  /** Desenha o radar guardado (ou o aviso de que ainda não há radar). */
  function desenhar() {
    el.botao.disabled = buscando;
    const radar = guardado?.radar ?? null;
    visaoAtual = null;
    desenharTesouro(radar);
    desenharMercado(radar);
    desenharIA(radar);
  }

  el.ia.pedir.addEventListener('click', async () => {
    if (!guardado?.radar || !visaoAtual) return;
    const visao = visaoAtual;
    el.ia.pedir.disabled = true;
    el.ia.resposta.hidden = false;
    el.ia.resposta.dataset.estado = 'carregando';
    el.ia.resposta.replaceChildren(criar('p', { texto: 'Comentando a lista…' }));

    const resultado = await chamarGemini(obterConfigIA(), mensagemDoRadar(guardado.radar, visao, obterDados(), hojeLocal()));

    el.ia.pedir.disabled = false;
    el.ia.pedir.textContent = 'Comentar de novo';
    if (!resultado.ok) {
      el.ia.resposta.dataset.estado = 'erro';
      el.ia.resposta.replaceChildren(criar('p', { texto: resultado.erro }));
      return;
    }
    comentada = assinatura(visao);
    el.ia.resposta.dataset.estado = 'ok';
    el.ia.resposta.replaceChildren(
      ...elementosDosBlocos(blocosDaResposta(resultado.texto)),
      criar('p', { classe: 'ia-selo', texto: 'Texto gerado por IA com a lista e a carteira deste momento. Não é recomendação de investimento: confira os números no app.' }),
    );
  });

  /** Linha de situação: quando o robô gerou o radar, e aviso se está atrasado. */
  function textoDaSituacao(complemento = '') {
    if (!guardado) return complemento;
    const { radar } = guardado;
    let texto = `Radar gerado ${quandoFoiFeita(radar.geradoEm)}.`;
    if (radarAtrasado(radar)) texto += ' Ele não é atualizado há alguns dias: os números podem estar velhos.';
    return complemento ? `${complemento} ${texto}` : texto;
  }

  /* ---------------- Busca ---------------- */

  /**
   * Busca o radar publicado pelo robô e guarda no aparelho.
   * Em qualquer falha, o radar guardado continua na tela.
   */
  async function buscarRadar() {
    if (buscando) return;
    buscando = true;
    el.situacao.textContent = 'Buscando o radar…';
    desenhar();
    let mensagem = '';
    try {
      const resposta = await buscar(ENDERECO_RADAR, {
        cache: 'no-cache',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (resposta.status === 404) {
        mensagem = 'O radar ainda não foi gerado. No GitHub: aba Actions → Radar → Run workflow.';
      } else if (!resposta.ok) {
        mensagem = `O GitHub respondeu com erro (${resposta.status}). Tente de novo mais tarde.`;
      } else {
        const radar = lerRadar(await resposta.json());
        guardado = { radar, buscadoEm: new Date().toISOString() };
        await guardar(guardado);
        mensagem = 'Radar atualizado.';
      }
    } catch (falha) {
      mensagem = falha instanceof ErroValidacao
        ? falha.message
        : 'Sem internet ou o GitHub não respondeu.';
      if (guardado) mensagem += ' Mostrando o radar guardado neste aparelho.';
    } finally {
      buscando = false;
    }
    el.situacao.textContent = textoDaSituacao(mensagem);
    desenhar();
  }

  el.botao.addEventListener('click', () => buscarRadar());
  el.filtro.addEventListener('change', () => { pagina = 1; desenhar(); });
  for (const filtro of [el.mercado.tipo, el.mercado.lista, el.mercado.periodo, el.mercado.preco]) {
    filtro.addEventListener('change', () => { paginaMercado = 1; desenhar(); });
  }
  // Opções da Lista desde o começo (depois elas acompanham o Tipo escolhido).
  preencherListas();

  /** Mostra o guardado e, se já passou da hora, busca o novo. */
  async function renderizar() {
    if (!carregou) {
      carregou = true;
      try {
        guardado = (await lerGuardado()) ?? null;
      } catch {
        guardado = null; // sem IndexedDB: o radar só fica na memória
      }
    }
    el.situacao.textContent = textoDaSituacao();
    desenhar();
    if (deveBuscarRadar(guardado?.buscadoEm)) buscarRadar();
  }

  return { renderizar: () => { renderizar(); } };
}
