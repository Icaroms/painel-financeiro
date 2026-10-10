/**
 * Vista "Simular compra" (Fase 02, parte 2.5).
 *
 * A pessoa escolhe o cartão, digita o preço à vista e até 4 opções de
 * parcelamento (parcelas e total parcelado). A cada tecla, o app mostra
 * uma ficha por opção: juros, limite, pior mês, melhor momento e o mês a mês.
 *
 * É uma CONSULTA: nada é gravado. Como em toda a pasta src/ui, aqui só
 * fica a tela; os números vêm de src/simulador.js (testado no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega obterDados() e pode chamar
 * preencher({ formaPagamento, valorTexto, origem }) antes de abrir a vista,
 * para trazer o valor e o cartão da tela de onde a pessoa veio (Lançar ou
 * Configurar). "origem" é o endereço do botão Voltar (ex.: "#configurar").
 */

import { hojeLocal, mesDaData, tituloDoMes, somarMeses } from '../datas.js';
import { formatarCentavos, reaisParaCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { MAXIMO_PARCELAS_COMPRA } from '../modelo.js';
import { dadosDoMes } from '../meses.js';
import { simularCompra, MAXIMO_OPCOES, MESES_DE_ESPERA_MAXIMOS } from '../simulador.js';

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
 * Liga a vista Simular compra.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ renderizar: () => void, preencher: (inicial: object) => void }}
 */
export function iniciarSimulador({ obterDados }) {
  const el = {
    semCartao: elemento('simular-sem-cartao'),
    cartao: elemento('simular-cartao'),
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
      inputmode: 'decimal', placeholder: 'sem juros', autocomplete: 'off', 'aria-label': 'Total parcelado',
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
  function lerEntrada(aVistaCentavos) {
    const opcoes = [...el.opcoes.children].map((li) => {
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
    detalhes.append(criar('summary', { texto: 'Ver mês a mês' }));

    const tabela = criar('table', { classe: 'tabela-meses' });
    const cabecalho = criar('tr');
    for (const titulo of ['Mês', 'Parcela', 'Sobra sem', 'Sobra com']) cabecalho.append(criar('th', { texto: titulo, scope: 'col' }));
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
  function fichaDaOpcao(opcao, formaPagamento) {
    const ficha = criar('section', { classe: 'cartao opcao-simulada', 'data-cor': opcao.cor });

    const titulo = opcao.parcelas === 1
      ? 'À vista no cartão'
      : `${opcao.parcelas}x de ${formatarCentavos(opcao.valorParcelaCentavos)}`;
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
    linha(`Total ${formatarCentavos(opcao.totalCentavos)} · 1ª parcela paga em ${dataCurta(opcao.primeiroVencimento)}${primeira}`);

    // Juros.
    if (opcao.parcelas > 1) {
      linha(opcao.jurosCentavos > 0
        ? `Juros: ${formatarCentavos(opcao.jurosCentavos)} · cerca de ${porcentagem(opcao.taxaMensal)} ao mês`
        : 'Sem juros');
    }

    // Limite.
    const { limiteCentavos, disponivelDepoisCentavos, estimativa: limiteEstimado } = opcao.limite;
    const sufixoLimite = limiteEstimado ? ' (estimativa)' : '';
    if (disponivelDepoisCentavos < 0) {
      linha(`Passa do limite do ${formaPagamento} em ${formatarCentavos(-disponivelDepoisCentavos)}${sufixoLimite}`, 'linha-alerta');
    } else {
      linha(`Limite do ${formaPagamento} depois: ${formatarCentavos(disponivelDepoisCentavos)} de ` +
        `${formatarCentavos(limiteCentavos)}${sufixoLimite}`);
    }

    // Mês mais apertado (o pior entre os meses com parcela).
    const estimativa = opcao.estimativa ? ' (estimativa)' : '';
    linha(`Mês mais apertado: ${mesPorExtenso(opcao.piorMes.mes)}, com ${formatarCentavos(opcao.piorMes.sobraCentavos)} de sobra${estimativa}`,
      opcao.piorMes.sobraCentavos < 0 ? 'linha-alerta' : undefined);

    ficha.append(topo, linhas, quadroQuandoComprar(opcao.melhorMomento), tabelaMesAMes(opcao.meses));
    return ficha;
  }

  /** Recalcula e redesenha o resultado (a cada tecla). */
  function calcular() {
    el.erro.textContent = '';
    el.resultado.replaceChildren();

    const dados = obterDados();
    if (!dados || el.cartao.value === '') return;

    let aVistaCentavos;
    try {
      aVistaCentavos = reaisParaCentavos(el.aVista.value);
    } catch {
      return; // ainda digitando: sem resultado, sem erro
    }
    if (aVistaCentavos <= 0) return;

    try {
      const visao = dadosDoMes(dados, mesDaData(hojeLocal()));
      const { opcoes } = simularCompra(visao, lerEntrada(aVistaCentavos));
      el.resultado.replaceChildren(...opcoes.map((o) => fichaDaOpcao(o, el.cartao.value)));
    } catch (falha) {
      // Erros de digitação (ex.: total parcelado "12,3,4") viram mensagem; outros são defeito.
      if (!(falha instanceof ErroValidacao)) throw falha;
      el.erro.textContent = falha.campo === 'valor'
        ? 'Total parcelado inválido. Use o formato 1.150,00.'
        : falha.message;
    }
  }

  el.cartao.addEventListener('change', calcular);
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
   * @param {{ formaPagamento?: string, valorTexto?: string, origem?: string }} dadosIniciais
   */
  function preencher(dadosIniciais) {
    inicial = dadosIniciais;
  }

  /** Monta a lista de cartões e recalcula. Chamado ao abrir a vista. */
  function renderizar() {
    const cartoes = obterDados()?.cartoes ?? [];
    const escolhido = inicial?.formaPagamento ?? el.cartao.value;

    el.semCartao.hidden = cartoes.length > 0;
    el.cartao.replaceChildren(...cartoes.map((c) => criar('option', { value: c.formaPagamento, texto: c.formaPagamento })));
    if (cartoes.some((c) => c.formaPagamento === escolhido)) el.cartao.value = escolhido;

    if (inicial?.valorTexto) el.aVista.value = inicial.valorTexto;

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
