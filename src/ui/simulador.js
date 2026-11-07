/**
 * Vista "Avaliar compra" (Fase 02, parte 2.5; à vista e sugestão da IA desde 11/2026).
 *
 * A pessoa diz o que é (opcional), o preço à vista e como vai pagar:
 * - num cartão, pode somar até 4 opções de parcelamento (parcelas e total);
 * - no Pix, débito ou dinheiro, a compra é à vista (sai da conta no dia).
 * A cada tecla, o app mostra uma ficha por opção: juros, limite, pior mês,
 * melhor momento e o mês a mês. Com a IA ligada, o botão "Avaliar com IA"
 * compara as opções e sugere a melhor e o melhor momento.
 *
 * É uma CONSULTA: nada é gravado. Como em toda a pasta src/ui, aqui só
 * fica a tela; os números vêm de src/simulador.js (testado no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega obterDados() e pode chamar
 * preencher({ formaPagamento, valorTexto, descricao, origem }) antes de abrir a vista,
 * para trazer o valor e o cartão da tela de onde a pessoa veio (Lançar ou
 * Configurar). "origem" é o endereço do botão Voltar (ex.: "#configurar").
 */

import { hojeLocal, mesDaData, tituloDoMes, somarMeses } from '../datas.js';
import { formatarCentavos, reaisParaCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { MAXIMO_PARCELAS_COMPRA } from '../modelo.js';
import { dadosDoMes } from '../meses.js';
import { simularCompra, MAXIMO_OPCOES, MESES_DE_ESPERA_MAXIMOS } from '../simulador.js';
import { projetarMeses, premissasDaPrevisao } from '../fluxo.js';
import { mensagemDaOpcaoSimulada, mensagemDaAvaliacao } from '../explicacoes.js';
import { resumoDoMes } from '../resumo-mes.js';
import { blocosDaResposta } from '../analise.js';
import { chamarGemini, iaDisponivel } from '../ia.js';
import { blocoExplicar } from './explicar.js';
import { elementosDosBlocos } from './blocos-ia.js';

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

/** "2026-12" → "dezembro de 2026". */
const mesPorExtenso = (mes) => tituloDoMes(mes).toLowerCase();

/** "2026-12" → "dez/26" (para a tabela mês a mês, que é estreita). */
const mesCurto = (mes) => {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
};

/** "2026-12-10" → "10/12". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** 0.02625 → "2,6%". */
const porcentagem = (taxa) => `${(taxa * 100).toFixed(1).replace('.', ',')}%`;

/** O que cada cor quer dizer, na mesma língua do veredito. */
const SELO = { verde: 'Cabe', amarelo: 'Atenção', vermelho: 'Passou' };

/**
 * Liga a vista Avaliar compra.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {() => object} [opcoes.obterConfigIA] Configuração da IA (botão "Explicar esta opção").
 * @returns {{ renderizar: () => void, preencher: (inicial: object) => void }}
 */
export function iniciarSimulador({ obterDados, obterConfigIA = () => null }) {
  const el = {
    descricao: elemento('simular-descricao'),
    cartao: elemento('simular-cartao'),
    parcelamento: elemento('simular-parcelamento'),
    soAVista: elemento('simular-so-avista'),
    ia: elemento('simular-ia'),
    iaDesligada: elemento('simular-ia-desligada'),
    iaConteudo: elemento('simular-ia-conteudo'),
    comprarEm: elemento('simular-comprar-em'),
    voltar: elemento('simular-voltar'),
    aVista: elemento('simular-avista'),
    opcoes: elemento('simular-opcoes'),
    adicionar: elemento('simular-adicionar'),
    erro: elemento('simular-erro'),
    resultado: elemento('simular-resultado'),
  };

  /* ---------------- Opções de parcelamento ---------------- */

  /** Uma linha de opção: parcelas, total parcelado e Remover. */
  function linhaDeOpcao(parcelasIniciais = 10) {
    const li = criar('li', { classe: 'linha-opcao' });

    const select = criar('select', { 'aria-label': 'Número de parcelas' });
    for (let n = 2; n <= MAXIMO_PARCELAS_COMPRA; n += 1) {
      select.append(criar('option', { value: String(n), texto: `${n}x` }));
    }
    select.value = String(parcelasIniciais);

    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const total = criar('input', {
      inputmode: 'numeric', placeholder: 'sem juros', autocomplete: 'off', 'aria-label': 'Total parcelado',
    });
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), total);

    const remover = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Remover', 'aria-label': 'Remover esta opção' });
    remover.addEventListener('click', () => {
      li.remove();
      atualizarBotaoAdicionar();
      calcular();
    });

    const campoParcelas = criar('label', { classe: 'campo' });
    campoParcelas.append(criar('span', { classe: 'secundario', texto: 'Parcelas' }), select);
    const campoTotal = criar('label', { classe: 'campo' });
    campoTotal.append(criar('span', { classe: 'secundario', texto: 'Total parcelado' }), caixa);

    li.append(campoParcelas, campoTotal, remover);
    return li;
  }

  function atualizarBotaoAdicionar() {
    el.adicionar.hidden = el.opcoes.children.length >= MAXIMO_OPCOES;
  }

  el.adicionar.addEventListener('click', () => {
    // Sugere um número de parcelas diferente das que já estão na lista.
    const usadas = [...el.opcoes.querySelectorAll('select')].map((s) => Number(s.value));
    const sugestao = [10, 12, 6, 3, 24].find((n) => !usadas.includes(n)) ?? 2;
    el.opcoes.append(linhaDeOpcao(sugestao));
    atualizarBotaoAdicionar();
    calcular();
  });

  /* ---------------- Leitura do formulário ---------------- */

  /**
   * Lê o formulário. Campo vazio ou incompleto não é erro: só não há resultado.
   *
   * @returns {object|null} Entrada para simularCompra, ou null sem preço à vista.
   */
  function lerEntrada(aVistaCentavos, ehCartao) {
    // Fora do cartão não há parcelamento: só a opção à vista.
    const opcoes = !ehCartao ? [] : [...el.opcoes.children].map((li) => {
      const parcelas = Number(li.querySelector('select').value);
      const texto = li.querySelector('input').value.trim();
      // Total vazio = sem juros: o mesmo preço à vista, dividido nas parcelas.
      const totalCentavos = texto === '' ? aVistaCentavos : reaisParaCentavos(texto);
      return { parcelas, totalCentavos };
    });
    return {
      formaPagamento: el.cartao.value, aVistaCentavos, opcoes, hoje: hojeLocal(), comprarEm: el.comprarEm.value,
    };
  }

  /* ---------------- Resultado ---------------- */

  /**
   * Quadro "Quando comprar": a resposta em uma linha e, embaixo, o porquê.
   *
   * Três casos:
   * - cabe agora: "Quando comprar: agora";
   * - cabe mais tarde: "a partir de dezembro de 2026", comparando com comprar
   *   agora e dizendo o que termina até lá;
   * - não cabe nos próximos 12 meses.
   */
  function quadroQuandoComprar({ esperaMeses, mesDaCompra, piorMes, piorMesAgora, terminam }) {
    const quadro = criar('div', { classe: 'quando-comprar' });
    const paragrafo = (texto) => quadro.append(criar('p', { texto }));
    const folga = 'pelo menos R$ 200,00 de sobra';
    const valor = formatarCentavos;

    if (esperaMeses === 0) {
      quadro.append(criar('strong', { texto: 'Quando comprar: agora' }));
      paragrafo(`Comprando agora, todos os meses com parcela ficam com ${folga}.`);
      paragrafo(`O mês mais apertado é ${mesPorExtenso(piorMes.mes)}, com ${valor(piorMes.sobraCentavos)}.`);
      return quadro;
    }

    if (esperaMeses === null) {
      const ultimo = mesPorExtenso(somarMeses(mesDaData(hojeLocal()), MESES_DE_ESPERA_MAXIMOS));
      quadro.append(criar('strong', { texto: `Quando comprar: não cabe nos próximos ${MESES_DE_ESPERA_MAXIMOS} meses` }));
      paragrafo(`Comprando em qualquer mês até ${ultimo}, algum mês com parcela fica com menos de R$ 200,00 de sobra.`);
      paragrafo(`Se comprar agora, o mais apertado seria ${mesPorExtenso(piorMesAgora.mes)}, com ${valor(piorMesAgora.sobraCentavos)}.`);
      return quadro;
    }

    quadro.append(criar('strong', { texto: `Quando comprar: a partir de ${mesPorExtenso(mesDaCompra)}` }));
    paragrafo(`Se comprar agora, ${mesPorExtenso(piorMesAgora.mes)} ficaria com ${valor(piorMesAgora.sobraCentavos)} ` +
      'de sobra (menos que os R$ 200,00 mínimos).');
    paragrafo(`Comprando em ${mesPorExtenso(mesDaCompra)}, todos os meses com parcela ficam com ${folga}. ` +
      `O mais apertado é ${mesPorExtenso(piorMes.mes)}, com ${valor(piorMes.sobraCentavos)}.`);
    if (terminam.length > 0) {
      const lista = terminam.map((t) => `${t.nome} termina em ${mesPorExtenso(t.mes)}`).join('; ');
      paragrafo(`O que abre espaço até lá: ${lista}.`);
    }
    return quadro;
  }

  /** Tabela mês a mês: parcela e sobra prevista, sem e com a compra. */
  function tabelaMesAMes(meses) {
    const detalhes = criar('details', { classe: 'mes-a-mes' });
    detalhes.append(criar('summary', { texto: 'Ver mês a mês (saldo acumulado)' }));

    const tabela = criar('table', { classe: 'tabela-meses' });
    const cabecalho = criar('tr');
    // "Saldo": o que deve haver na conta no fim do mês, somando os meses anteriores.
    for (const titulo of ['Mês', 'Parcela', 'Saldo sem', 'Saldo com']) cabecalho.append(criar('th', { texto: titulo, scope: 'col' }));
    tabela.append(criar('thead'));
    tabela.tHead.append(cabecalho);

    const corpo = criar('tbody');
    for (const m of meses) {
      const tr = criar('tr');
      const celula = (centavos) => criar('td', {
        texto: formatarCentavos(centavos), classe: centavos < 0 ? 'negativo' : undefined,
      });
      tr.append(
        criar('td', { texto: mesCurto(m.mes) }),
        criar('td', { texto: formatarCentavos(m.parcelaCentavos) }),
        celula(m.semCompraCentavos),
        celula(m.comCompraCentavos),
      );
      corpo.append(tr);
    }
    tabela.append(corpo);
    detalhes.append(tabela);
    return detalhes;
  }

  /** A ficha de uma opção simulada. */
  function fichaDaOpcao(opcao, formaPagamento, aVistaCentavos) {
    const ficha = criar('section', { classe: 'cartao opcao-simulada', 'data-cor': opcao.cor });

    let titulo = `${opcao.parcelas}x de ${formatarCentavos(opcao.valorParcelaCentavos)}`;
    if (opcao.parcelas === 1) titulo = opcao.limite === null ? `À vista no ${formaPagamento}` : 'À vista no cartão';
    const topo = criar('div', { classe: 'opcao-topo' });
    topo.append(criar('h2', { texto: titulo }), criar('span', { classe: 'selo-opcao', texto: SELO[opcao.cor] }));

    const linhas = criar('ul', { classe: 'opcao-linhas' });
    const linha = (texto, classe) => linhas.append(criar('li', { texto, classe }));

    // Compra num mês futuro: deixa claro de quando são os números.
    if (opcao.compraFutura) {
      linha(`Compra simulada em ${dataCurta(opcao.dataDaCompra)}/${opcao.dataDaCompra.slice(0, 4)}`);
    }

    // Total e quando começa.
    const primeira = opcao.primeiraParcelaCentavos !== opcao.valorParcelaCentavos
      ? ` (a 1ª é ${formatarCentavos(opcao.primeiraParcelaCentavos)})`
      : '';
    linha(opcao.limite === null
      ? `Total ${formatarCentavos(opcao.totalCentavos)} · sai da conta em ${dataCurta(opcao.primeiroVencimento)}`
      : `Total ${formatarCentavos(opcao.totalCentavos)} · 1ª parcela paga em ${dataCurta(opcao.primeiroVencimento)}${primeira}`);

    // Juros.
    if (opcao.parcelas > 1) {
      linha(opcao.jurosCentavos > 0
        ? `Juros: ${formatarCentavos(opcao.jurosCentavos)} · cerca de ${porcentagem(opcao.taxaMensal)} ao mês`
        : 'Sem juros');
    }

    // Limite (só no cartão).
    if (opcao.limite !== null) {
      const { limiteCentavos, disponivelDepoisCentavos, estimativa: limiteEstimado } = opcao.limite;
      const sufixoLimite = limiteEstimado ? ' (estimativa)' : '';
      if (disponivelDepoisCentavos < 0) {
        linha(`Passa do limite do ${formaPagamento} em ${formatarCentavos(-disponivelDepoisCentavos)}${sufixoLimite}`, 'linha-alerta');
      } else {
        linha(`Limite do ${formaPagamento} depois: ${formatarCentavos(disponivelDepoisCentavos)} de ` +
          `${formatarCentavos(limiteCentavos)}${sufixoLimite}`);
      }
    }

    // Mês mais apertado (o pior entre os meses com parcela); à vista fora do cartão, o mês da compra.
    const estimativa = opcao.estimativa ? ' (estimativa)' : '';
    const rotuloMes = opcao.limite === null ? 'Fim do mês' : 'Mês mais apertado';
    linha(`${rotuloMes}: ${mesPorExtenso(opcao.piorMes.mes)}, saldo previsto de ${formatarCentavos(opcao.piorMes.sobraCentavos)}${estimativa}`,
      opcao.piorMes.sobraCentavos < 0 ? 'linha-alerta' : undefined);

    ficha.append(topo, linhas, quadroQuandoComprar(opcao.melhorMomento), tabelaMesAMes(opcao.meses));

    // IA (Fase 03): explica esta opção com os números da ficha. Só aparece com a IA ligada.
    const explicar = blocoExplicar({
      obterConfigIA,
      rotulo: 'Explicar esta opção com IA',
      montarMensagem: () => mensagemDaOpcaoSimulada(opcao, { formaPagamento, aVistaCentavos, hoje: hojeLocal() }),
    });
    if (explicar) ficha.append(explicar);
    return ficha;
  }

  /* ---------------- O que a previsão supõe (11/2026) ---------------- */

  /**
   * Avisos sobre a previsão: sem salário, dia a dia pelos orçamentos e
   * saldo negativo mesmo SEM a compra.
   *
   * @returns {{ texto: string, grave: boolean, link?: boolean }[]}
   */
  function avisosDaPrevisao(visao, premissas) {
    const avisos = [];
    if (premissas.entrada.fonte === 'renda-do-mes') {
      avisos.push(premissas.entrada.centavos === 0
        ? {
          grave: true, link: true,
          texto: 'Os próximos meses estão sendo previstos SEM salário: não há entrada fixa cadastrada e a renda prevista deste mês é R$ 0,00.',
        }
        : {
          grave: false, link: true,
          texto: `Sem entradas fixas, os próximos meses usam a renda deste mês (${formatarCentavos(premissas.entrada.centavos)}) como salário.`,
        });
    }
    if (premissas.diaADia.fonte === 'orcamentos') {
      avisos.push({
        grave: false,
        texto: `Ainda não há meses anteriores para tirar a média: o dia a dia é a soma dos orçamentos (${formatarCentavos(premissas.diaADia.centavos)}). ` +
          'Orçamento é limite, não gasto certo: se eles estão altos, a previsão fica pessimista.',
      });
    }
    const negativo = projetarMeses(visao, MESES_DE_ESPERA_MAXIMOS).find((m) => m.sobraCentavos < 0);
    if (negativo) {
      avisos.push({
        grave: true,
        texto: `Mesmo SEM esta compra, a previsão fica negativa em ${mesPorExtenso(negativo.mes)} (${formatarCentavos(negativo.sobraCentavos)}). ` +
          'Confira as entradas fixas e os orçamentos antes de decidir.',
      });
    }
    return avisos;
  }

  /** Quadro "Como o app prevê": a conta de cada mês seguinte e os avisos. */
  function quadroPremissas(premissas, avisos) {
    const quadro = criar('section', { classe: 'cartao premissas', 'aria-label': 'Como o app prevê os próximos meses' });
    const fonteEntrada = premissas.entrada.fonte === 'entradas-fixas' ? 'entradas fixas' : 'renda deste mês';
    const fonteDiaADia = premissas.diaADia.fonte === 'media'
      ? `média de ${premissas.diaADia.meses} ${premissas.diaADia.meses === 1 ? 'mês' : 'meses'}`
      : 'soma dos orçamentos';
    quadro.append(criar('p', {
      texto: `Como o app prevê cada mês seguinte: + ${formatarCentavos(premissas.entrada.centavos)} (${fonteEntrada}) ` +
        `− ${formatarCentavos(premissas.contasCentavos)} (contas fixas) − ${formatarCentavos(premissas.diaADia.centavos)} ` +
        `(dia a dia, ${fonteDiaADia}) − faturas já comprometidas. O saldo passa de um mês para o outro: um mês negativo ` +
        'puxa os seguintes.',
    }));
    for (const aviso of avisos) {
      const p = criar('p', { classe: `aviso-previsao${aviso.grave ? ' grave' : ''}`, texto: `${aviso.texto} ` });
      if (aviso.link) p.append(criar('a', { href: '#configurar', texto: 'Cadastrar o salário em Configurar →' }));
      quadro.append(p);
    }
    return quadro;
  }

  /* ---------------- Sugestão da IA (compra inteira) ---------------- */

  /** Última simulação válida (a IA avalia exatamente o que está na tela). */
  let ultima = null;

  /** Botão "Avaliar com IA" e a resposta em blocos (Sugestão, Por quê, Cuidados). */
  function blocoAvaliar() {
    const botao = criar('button', { classe: 'botao-pequeno botao-ia', type: 'button', texto: 'Avaliar com IA' });
    const resposta = criar('div', { classe: 'ia-resposta', 'aria-live': 'polite', hidden: '' });
    botao.addEventListener('click', async () => {
      if (ultima === null) return;
      botao.disabled = true;
      resposta.hidden = false;
      resposta.dataset.estado = 'carregando';
      resposta.replaceChildren(criar('p', { texto: 'Avaliando…' }));

      const resultado = await chamarGemini(obterConfigIA(), ultima.mensagem());
      botao.disabled = false;
      botao.textContent = 'Avaliar de novo';
      if (resultado.ok) {
        resposta.dataset.estado = 'ok';
        resposta.replaceChildren(
          ...elementosDosBlocos(blocosDaResposta(resultado.texto)),
          criar('p', { classe: 'ia-selo', texto: 'Texto gerado por IA. Confira os números nas fichas abaixo.' }),
        );
      } else {
        resposta.dataset.estado = 'erro';
        resposta.replaceChildren(criar('p', { texto: resultado.erro }));
      }
    });
    return [botao, resposta];
  }

  /** Mostra o quadro da IA: o botão (IA ligada) ou como ligar (IA desligada). */
  function atualizarQuadroIA(temResultado) {
    el.ia.hidden = !temResultado;
    if (!temResultado) {
      el.iaConteudo.replaceChildren();
      return;
    }
    const ligada = iaDisponivel(obterConfigIA());
    el.iaDesligada.hidden = ligada;
    // Recria o botão a cada mudança: uma resposta antiga não vale para números novos.
    el.iaConteudo.replaceChildren(...(ligada ? blocoAvaliar() : []));
  }

  /** Recalcula e redesenha o resultado (a cada tecla). */
  function calcular() {
    el.erro.textContent = '';
    el.resultado.replaceChildren();
    ultima = null;

    const dados = obterDados();
    const ehCartao = (dados?.cartoes ?? []).some((c) => c.formaPagamento === el.cartao.value);
    el.parcelamento.hidden = !ehCartao;
    el.soAVista.hidden = ehCartao || el.cartao.value === '';
    if (!dados || el.cartao.value === '') {
      atualizarQuadroIA(false);
      return;
    }

    let aVistaCentavos;
    try {
      aVistaCentavos = reaisParaCentavos(el.aVista.value);
    } catch {
      atualizarQuadroIA(false);
      return; // ainda digitando: sem resultado, sem erro
    }
    if (aVistaCentavos <= 0) {
      atualizarQuadroIA(false);
      return;
    }

    try {
      const hoje = hojeLocal();
      const visao = dadosDoMes(dados, mesDaData(hoje));
      const resultado = simularCompra(visao, lerEntrada(aVistaCentavos, ehCartao));
      const formaPagamento = el.cartao.value;
      const premissas = premissasDaPrevisao(visao);
      const avisos = avisosDaPrevisao(visao, premissas);
      el.resultado.replaceChildren(
        quadroPremissas(premissas, avisos),
        ...resultado.opcoes.map((o) => fichaDaOpcao(o, formaPagamento, aVistaCentavos)),
      );
      const descricao = el.descricao.value;
      ultima = {
        // Montada só no clique, com os números deste momento.
        mensagem: () => {
          let mes = null;
          try {
            mes = resumoDoMes(dados, mesDaData(hoje), hoje);
          } catch {
            mes = null; // sem resumo (ex.: mês ainda sem registro): a IA usa só as opções
          }
          return mensagemDaAvaliacao(resultado, {
            formaPagamento, aVistaCentavos, hoje, descricao, mes, premissas, avisos: avisos.map((a) => a.texto),
          });
        },
      };
      atualizarQuadroIA(true);
    } catch (falha) {
      atualizarQuadroIA(false);
      // Erros de digitação (ex.: total parcelado "12,3,4") viram mensagem; outros são defeito.
      if (!(falha instanceof ErroValidacao)) throw falha;
      el.erro.textContent = falha.campo === 'valor'
        ? 'Total parcelado inválido. Use o formato 1.150,00.'
        : falha.message;
    }
  }

  el.cartao.addEventListener('change', calcular);
  // O nome não muda os números: só a sugestão da IA, que lê o nome no clique.
  el.descricao.addEventListener('input', () => {
    if (ultima !== null) atualizarQuadroIA(true);
  });
  el.comprarEm.addEventListener('change', calcular);
  el.aVista.addEventListener('input', calcular);
  el.opcoes.addEventListener('input', calcular);
  el.opcoes.addEventListener('change', calcular);

  /* ---------------- Abrir a vista ---------------- */

  /** Valor e cartão vindos da tela de lançamento (usados no próximo renderizar). */
  let inicial = null;

  /**
   * Guarda o valor, o cartão e a tela de origem para preencher o simulador.
   *
   * @param {{ formaPagamento?: string, valorTexto?: string, descricao?: string, origem?: string }} dadosIniciais
   */
  function preencher(dadosIniciais) {
    inicial = dadosIniciais;
  }

  /** Monta a lista de formas de pagamento e recalcula. Chamado ao abrir a vista. */
  function renderizar() {
    const dados = obterDados();
    const cartoes = (dados?.cartoes ?? []).map((c) => c.formaPagamento);
    // Cartões primeiro (podem parcelar); depois Pix, débito, dinheiro... (à vista).
    const outras = (dados?.formasPagamento ?? []).filter((f) => !cartoes.includes(f));
    const escolhido = inicial?.formaPagamento ?? el.cartao.value;

    const grupo = (rotulo, formas) => {
      const g = criar('optgroup', { label: rotulo });
      g.append(...formas.map((f) => criar('option', { value: f, texto: f })));
      return g;
    };
    const grupos = [];
    if (cartoes.length > 0) grupos.push(grupo('Cartão (à vista ou parcelado)', cartoes));
    if (outras.length > 0) grupos.push(grupo('À vista (sai da conta)', outras));
    el.cartao.replaceChildren(...grupos);
    if ([...cartoes, ...outras].includes(escolhido)) el.cartao.value = escolhido;

    if (inicial?.valorTexto) el.aVista.value = inicial.valorTexto;
    if (inicial && 'descricao' in inicial) el.descricao.value = inicial.descricao ?? '';

    // Botão Voltar: para a tela de onde a pessoa veio (Lançar ou Configurar).
    if (inicial?.origem) {
      el.voltar.href = inicial.origem;
      el.voltar.textContent = inicial.origem === '#configurar' ? '‹ Configurar' : '‹ Lançar';
    }
    inicial = null;

    // "Comprar em": agora e os próximos 12 meses (a lista acompanha a virada do mês).
    const mesAtual = mesDaData(hojeLocal());
    const escolhidoMes = el.comprarEm.value;
    el.comprarEm.replaceChildren(...Array.from({ length: MESES_DE_ESPERA_MAXIMOS + 1 }, (_, i) => {
      const mes = somarMeses(mesAtual, i);
      return criar('option', { value: mes, texto: i === 0 ? `Agora (${mesPorExtenso(mes)})` : mesPorExtenso(mes) });
    }));
    if (escolhidoMes >= mesAtual && escolhidoMes <= somarMeses(mesAtual, MESES_DE_ESPERA_MAXIMOS)) {
      el.comprarEm.value = escolhidoMes;
    }

    if (el.opcoes.children.length === 0) el.opcoes.append(linhaDeOpcao(10));
    atualizarBotaoAdicionar();
    calcular();
  }

  return { renderizar, preencher };
}
