/**
 * Vista "Mês": o que já saiu, o que ainda vai vencer, quanto deve sobrar,
 * a situação de cada categoria e as listas de contas fixas e de gastos.
 *
 * As contas fixas têm três situações no mês (src/fixos.js):
 * - Previsto: ainda vai sair (estipulado);
 * - Pago: já saiu (concretizado), com o valor real;
 * - Dispensado: não vai sair este mês e não conta.
 *
 * As listas de contas fixas e de gastos mostram 5 por página, como no Histórico.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. Os números vêm de
 * resumoDoMes (src/resumo-mes.js), testado no Node.
 *
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterDados(): devolve os dados atuais;
 * - aplicarMudanca(novosDados, mensagem): troca os dados, grava e avisa.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos, reaisParaCentavos } from '../dinheiro.js';
import { tituloDoMes } from '../painel.js';
import { resumoDoMes, excluirLancamento } from '../resumo-mes.js';
import { gastoDaSemanaAtual, paginar } from '../historico.js';
import { definirStatusDoFixo } from '../fixos.js';
import { definirStatusDaFatura } from '../fluxo.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor } from '../configuracao.js';

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

/** "2026-11-03" → "03/11". */
function dataCurta(data) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * Liga a vista Mês.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarMes({ obterDados, aplicarMudanca }) {
  const el = {
    titulo: elemento('mes-titulo'),
    dia: elemento('mes-dia'),
    dinheiro: elemento('mes-dinheiro'),
    jaPago: elemento('mes-ja-pago'),
    jaPagoDetalhe: elemento('mes-ja-pago-detalhe'),
    previsto: elemento('mes-previsto'),
    naConta: elemento('mes-na-conta'),
    contagemFixos: elemento('mes-contagem-fixos'),
    paginacaoFixos: elemento('paginacao-mes-fixos'),
    secaoFaturas: elemento('secao-faturas'),
    faturas: elemento('mes-faturas'),
    linhaSobra: elemento('mes-linha-sobra'),
    sobra: elemento('mes-sobra'),
    avisoSaldo: elemento('mes-aviso-saldo'),
    categorias: elemento('mes-categorias'),
    fixos: elemento('mes-fixos'),
    gastos: elemento('mes-gastos'),
    paginacaoGastos: elemento('paginacao-mes-gastos'),
  };

  /** Página atual de cada lista (começa em 1). */
  const paginas = { fixos: 1, gastos: 1 };

  /** Conta fixa com o campo "Pago" aberto (só uma por vez), ou null. */
  let pagandoId = null;

  /**
   * Monta os botões "Anterior" e "Próxima" de uma lista. Com uma página só, eles somem.
   *
   * @param {HTMLElement} nav
   * @param {'fixos'|'gastos'} lista
   * @param {{ pagina: number, totalPaginas: number }} resultado
   */
  function montarPaginacao(nav, lista, { pagina, totalPaginas }) {
    if (totalPaginas <= 1) {
      nav.replaceChildren();
      return;
    }
    const anterior = criar('button', { classe: 'botao-pequeno', type: 'button', texto: '‹ Anterior' });
    const proxima = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Próxima ›' });
    anterior.disabled = pagina === 1;
    proxima.disabled = pagina === totalPaginas;
    anterior.addEventListener('click', () => {
      paginas[lista] = pagina - 1;
      renderizar();
    });
    proxima.addEventListener('click', () => {
      paginas[lista] = pagina + 1;
      renderizar();
    });
    nav.replaceChildren(
      anterior,
      criar('span', { classe: 'pagina-atual secundario', texto: `Página ${pagina} de ${totalPaginas}` }),
      proxima,
    );
  }

  /** Grava a situação nova de uma conta e redesenha a vista. */
  async function mudarStatus(fixo, status, mensagem, valorCentavos) {
    const mes = mesDaData(hojeLocal());
    await aplicarMudanca(definirStatusDoFixo(obterDados(), mes, fixo.id, status, { valorCentavos }), mensagem);
    pagandoId = null;
    renderizar();
  }

  /** Régua de uma categoria: barra de uso e o triângulo de "hoje". */
  function itemDaCategoria(item, fracaoDoMes) {
    const { categoria, gastoCentavos, orcamentoCentavos, margemCentavos, fracaoUsada, cor } = item;
    const li = criar('li', { classe: 'regua-item', 'data-cor': cor });

    const topo = criar('div', { classe: 'regua-topo' });
    topo.append(
      criar('span', { classe: 'regua-nome', texto: categoria.nome }),
      criar('span', {
        classe: 'regua-valores',
        texto: orcamentoCentavos > 0
          ? `${formatarCentavos(gastoCentavos)} de ${formatarCentavos(orcamentoCentavos)}`
          : formatarCentavos(gastoCentavos),
      }),
    );
    li.append(topo);

    if (orcamentoCentavos > 0) {
      const regua = criar('div', { classe: 'regua', 'aria-hidden': 'true' });
      const preenchido = criar('span', { classe: 'regua-uso' });
      preenchido.style.width = `${Math.min(fracaoUsada, 1) * 100}%`;
      const hoje = criar('span', { classe: 'regua-hoje' });
      hoje.style.left = `${fracaoDoMes * 100}%`;
      regua.append(preenchido, hoje);
      li.append(regua);
    }

    let situacao;
    if (orcamentoCentavos === 0) situacao = 'Sem orçamento: vale só o saldo do mês.';
    else if (margemCentavos < 0) situacao = `Passou ${formatarCentavos(-margemCentavos)} do orçamento.`;
    else if (cor === 'amarelo') situacao = `Acelerado: sobram ${formatarCentavos(margemCentavos)}.`;
    else situacao = `Sobram ${formatarCentavos(margemCentavos)}.`;
    li.append(criar('p', { classe: 'regua-situacao secundario', texto: situacao }));

    // Quanto a categoria gastou na semana de hoje (segunda a domingo).
    const semana = gastoDaSemanaAtual(obterDados(), categoria.id, hojeLocal());
    li.append(criar('p', {
      classe: 'regua-semana secundario',
      texto: `Nesta semana (${dataCurta(semana.inicio)} a ${dataCurta(semana.fim)}): ${formatarCentavos(semana.totalCentavos)}`,
    }));

    return li;
  }

  /** Linha de uma fatura: cartão, vencimento, total, as compras dela e Previsto | Pago. */
  function itemDaFatura(fatura) {
    const status = fatura.status;
    const li = criar('li', { classe: `fixo-mes status-${status}` });
    if (fatura.atrasada) li.classList.add('atrasada');

    const linha = criar('div', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const situacao = status === 'pago'
      ? 'Paga'
      : (fatura.atrasada ? `Atrasada: venceu ${dataCurta(fatura.vencimento)}` : `Vence ${dataCurta(fatura.vencimento)}`);
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: fatura.formaPagamento }),
      criar('span', { classe: 'situacao-fixo', texto: situacao }),
    );
    linha.append(info, criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(fatura.totalCentavos) }));

    // As compras da fatura, com a parcela de cada uma (até 5; o resto resumido).
    const nomes = new Map(obterDados().categorias.map((c) => [c.id, c.nome]));
    const itens = criar('ul', { classe: 'itens-fatura secundario' });
    for (const item of fatura.itens.slice(0, 5)) {
      const parcela = item.total > 1 ? ` · ${item.numero}/${item.total}` : '';
      const li2 = criar('li');
      li2.append(
        criar('span', { texto: `${nomes.get(item.lancamento.categoriaId) ?? 'Sem categoria'} ${dataCurta(item.lancamento.data)}${parcela}` }),
        criar('span', { texto: formatarCentavos(item.valorCentavos) }),
      );
      itens.append(li2);
    }
    if (fatura.itens.length > 5) itens.append(criar('li', { texto: `e mais ${fatura.itens.length - 5} compra(s)` }));

    const grupo = criar('div', { classe: 'seletor-status duas', role: 'group', 'aria-label': `Situação da fatura ${fatura.formaPagamento}` });
    for (const [valor, rotulo] of [['previsto', 'Previsto'], ['pago', 'Pago']]) {
      const botao = criar('button', {
        classe: 'opcao-status', type: 'button', texto: rotulo, 'aria-pressed': String(status === valor),
      });
      botao.addEventListener('click', async () => {
        const mes = mesDaData(hojeLocal());
        await aplicarMudanca(
          definirStatusDaFatura(obterDados(), mes, fatura.formaPagamento, valor),
          valor === 'pago' ? `Fatura ${fatura.formaPagamento} paga.` : `Fatura ${fatura.formaPagamento} voltou para prevista.`,
        );
        renderizar();
      });
      grupo.append(botao);
    }

    li.append(linha, itens, grupo);
    return li;
  }

  /** Texto da situação de uma conta fixa. */
  function textoDoStatus({ status, automatico, atrasado, diaEfetivo }) {
    if (status === 'pago') return automatico ? 'Pago (automático)' : 'Pago';
    if (status === 'dispensado') return 'Dispensado este mês';
    return atrasado ? `Atrasada: venceu dia ${diaEfetivo}` : `Previsto para o dia ${diaEfetivo}`;
  }

  /** Campo "Pago" aberto: o valor estipulado já vem preenchido para confirmar ou corrigir. */
  function formularioDePagamento(item) {
    const form = criar('form', { classe: 'form-pago', autocomplete: 'off', novalidate: '' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const input = criar('input', { name: 'valor', inputmode: 'decimal', 'aria-label': `Valor pago de ${item.fixo.nome}` });
    input.value = textoDoValor(item.valorEstipuladoCentavos);
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);

    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    cancelar.addEventListener('click', () => {
      pagandoId = null;
      renderizar();
    });
    const confirmar = criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Confirmar pago' });
    const erro = criar('span', { classe: 'erro' });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const valorCentavos = reaisParaCentavos(input.value);
        await mudarStatus(item.fixo, 'pago', `"${item.fixo.nome}" pago: ${formatarCentavos(valorCentavos)}.`, valorCentavos);
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
        input.setAttribute('aria-invalid', 'true');
      }
    });

    const acoes = criar('div', { classe: 'acoes' });
    acoes.append(cancelar, confirmar);
    form.append(
      criar('label', { classe: 'secundario dica', texto: 'Valor pago (confirme ou corrija):' }),
      caixa,
      acoes,
      erro,
    );
    return form;
  }

  /** Linha de uma conta fixa: nome, situação, valor e os três botões de status. */
  function itemDoFixo(item) {
    const { fixo, valorCentavos, valorEstipuladoCentavos, parcela, status, atrasado } = item;
    const li = criar('li', { classe: `fixo-mes status-${status}` });
    if (atrasado) li.classList.add('atrasada');

    const linha = criar('div', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const detalhe = [
      fixo.formaPagamento,
      parcela ? `Parcela ${parcela.atual} de ${parcela.total}` : null,
    ].filter(Boolean).join(' · ');
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: fixo.nome }),
      criar('span', { classe: 'situacao-fixo', texto: textoDoStatus(item) }),
      criar('span', { classe: 'secundario linha-mes-detalhe', texto: detalhe }),
    );
    // Dispensada: mostra o valor estipulado riscado, para lembrar quanto ela custaria.
    const valor = criar('span', {
      classe: 'linha-mes-valor',
      texto: formatarCentavos(status === 'dispensado' ? valorEstipuladoCentavos : valorCentavos),
    });
    linha.append(info, valor);

    // Três botões, como um seletor: o status atual fica marcado.
    const grupo = criar('div', { classe: 'seletor-status', role: 'group', 'aria-label': `Situação de ${fixo.nome}` });
    const opcoes = [
      ['previsto', 'Previsto', () => mudarStatus(fixo, 'previsto', `"${fixo.nome}" voltou para previsto.`)],
      ['pago', 'Pago', () => {
        pagandoId = fixo.id;
        renderizar();
      }],
      ['dispensado', 'Dispensado', () => mudarStatus(fixo, 'dispensado', `"${fixo.nome}" dispensado este mês.`)],
    ];
    for (const [valorStatus, rotulo, acao] of opcoes) {
      const botao = criar('button', {
        classe: 'opcao-status', type: 'button', texto: rotulo,
        'aria-pressed': String(status === valorStatus),
      });
      botao.addEventListener('click', acao);
      grupo.append(botao);
    }

    li.append(linha, grupo);
    if (pagandoId === fixo.id) li.append(formularioDePagamento(item));
    return li;
  }

  /** Linha de um gasto lançado, com o botão de excluir. */
  function itemDoGasto({ lancamento, nomeCategoria }) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const detalhe = [dataCurta(lancamento.data), lancamento.formaPagamento + ((lancamento.parcelas ?? 1) > 1 ? ` em ${lancamento.parcelas}x` : ''), lancamento.descricao || null]
      .filter(Boolean).join(' · ');
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: nomeCategoria }),
      criar('span', { classe: 'secundario linha-mes-detalhe', texto: detalhe }),
    );

    const lado = criar('div', { classe: 'linha-mes-lado' });
    const botao = criar('button', {
      classe: 'botao-texto perigo', type: 'button', texto: 'Excluir',
      'aria-label': `Excluir o gasto de ${formatarCentavos(lancamento.valorCentavos)} em ${nomeCategoria}`,
    });
    botao.addEventListener('click', async () => {
      const confirmou = window.confirm(
        `Excluir o gasto de ${formatarCentavos(lancamento.valorCentavos)} em ${nomeCategoria} (${dataCurta(lancamento.data)})?`,
      );
      if (!confirmou) return;
      await aplicarMudanca(excluirLancamento(obterDados(), lancamento.id), 'Gasto excluído.');
      renderizar();
    });
    lado.append(criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(lancamento.valorCentavos) }), botao);

    li.append(info, lado);
    return li;
  }

  /** Lista ou, se vazia, uma frase explicando. */
  function preencherLista(lista, itens, textoVazio) {
    lista.replaceChildren(
      ...(itens.length > 0 ? itens : [criar('li', { classe: 'lista-vazia secundario', texto: textoVazio })]),
    );
  }

  function renderizar() {
    const hoje = hojeLocal();
    const r = resumoDoMes(obterDados(), mesDaData(hoje), hoje);

    el.titulo.textContent = tituloDoMes(r.mes);
    el.dia.textContent = `Dia ${r.dia} de ${r.diasNoMes}`;

    el.dinheiro.textContent = formatarCentavos(r.dinheiroDoMesCentavos);
    el.jaPago.textContent = `− ${formatarCentavos(r.jaPago.totalCentavos)}`;
    el.jaPagoDetalhe.textContent = [
      `contas ${formatarCentavos(r.jaPago.fixosCentavos)}`,
      `gastos à vista ${formatarCentavos(r.jaPago.gastosCentavos)}`,
      r.faturas.length > 0 ? `faturas ${formatarCentavos(r.jaPago.faturasCentavos)}` : null,
    ].filter(Boolean).join(' + ');

    // Faturas do cartão que vencem neste mês (a seção some quando não há nenhuma).
    el.secaoFaturas.hidden = r.faturas.length === 0;
    el.faturas.replaceChildren(...r.faturas.map(itemDaFatura));
    el.previsto.textContent = `− ${formatarCentavos(r.previstoCentavos)}`;
    el.naConta.replaceChildren(
      'Pelo app, a conta deve ter agora ',
      criar('strong', { texto: formatarCentavos(r.naContaAgoraCentavos) }),
      '. Confira com o saldo do banco.',
    );
    el.sobra.textContent = formatarCentavos(r.deveSobrarCentavos);
    el.linhaSobra.dataset.cor = r.corSaldo;
    el.avisoSaldo.hidden = r.saldoConfirmado;

    preencherLista(
      el.categorias,
      r.categorias.map((item) => itemDaCategoria(item, r.fracaoDoMes)),
      'Nenhuma categoria.',
    );
    // Contas fixas: as que pedem ação (atrasadas e previstas) vêm primeiro.
    const c = r.contagemFixos;
    el.contagemFixos.textContent = r.fixos.length === 0
      ? ''
      : [
          `${c.pagas} paga${c.pagas === 1 ? '' : 's'}`,
          `${c.previstas} prevista${c.previstas === 1 ? '' : 's'}${c.atrasadas > 0 ? ` (${c.atrasadas} atrasada${c.atrasadas === 1 ? '' : 's'})` : ''}`,
          c.dispensadas > 0 ? `${c.dispensadas} dispensada${c.dispensadas === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ');
    const paginaFixos = paginar(r.fixos, paginas.fixos);
    paginas.fixos = paginaFixos.pagina;
    montarPaginacao(el.paginacaoFixos, 'fixos', paginaFixos);
    preencherLista(el.fixos, paginaFixos.itens.map(itemDoFixo), 'Nenhuma conta fixa neste mês.');

    // Gastos: 5 por página. Depois de excluir o último gasto de uma página,
    // paginar() volta sozinha para a última página que ainda existe.
    const paginaGastos = paginar(r.gastos, paginas.gastos);
    paginas.gastos = paginaGastos.pagina;
    montarPaginacao(el.paginacaoGastos, 'gastos', paginaGastos);
    preencherLista(el.gastos, paginaGastos.itens.map(itemDoGasto), 'Nenhum gasto lançado neste mês.');
  }

  return { renderizar };
}
