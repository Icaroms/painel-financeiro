/**
 * Vista "Mês": o que já saiu, o que ainda vai vencer, quanto deve sobrar,
 * a situação de cada categoria e as listas de contas fixas e de gastos.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. Os números vêm de
 * resumoDoMes (src/resumo-mes.js), testado no Node.
 *
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterDados(): devolve os dados atuais;
 * - aplicarMudanca(novosDados, mensagem): troca os dados, grava e avisa.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { tituloDoMes } from '../painel.js';
import { resumoDoMes, excluirLancamento } from '../resumo-mes.js';

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
    jaSaiu: elemento('mes-ja-saiu'),
    jaSaiuDetalhe: elemento('mes-ja-saiu-detalhe'),
    aVencer: elemento('mes-a-vencer'),
    linhaSobra: elemento('mes-linha-sobra'),
    sobra: elemento('mes-sobra'),
    avisoSaldo: elemento('mes-aviso-saldo'),
    categorias: elemento('mes-categorias'),
    fixos: elemento('mes-fixos'),
    gastos: elemento('mes-gastos'),
  };

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

    return li;
  }

  /** Linha de uma conta fixa: dia, nome, situação e valor. */
  function itemDoFixo({ fixo, valorCentavos, parcela, diaEfetivo, vencido }) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const detalhe = [
      vencido ? `Venceu dia ${diaEfetivo}` : `Vence dia ${diaEfetivo}`,
      fixo.formaPagamento,
      parcela ? `Parcela ${parcela.atual} de ${parcela.total}` : null,
    ].filter(Boolean).join(' · ');
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: fixo.nome }),
      criar('span', { classe: 'secundario linha-mes-detalhe', texto: detalhe }),
    );
    li.append(info, criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(valorCentavos) }));
    if (!vencido) li.classList.add('a-vencer');
    return li;
  }

  /** Linha de um gasto lançado, com o botão de excluir. */
  function itemDoGasto({ lancamento, nomeCategoria }) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const detalhe = [dataCurta(lancamento.data), lancamento.formaPagamento, lancamento.descricao || null]
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
    el.jaSaiu.textContent = `− ${formatarCentavos(r.jaSaiu.totalCentavos)}`;
    el.jaSaiuDetalhe.textContent =
      `contas ${formatarCentavos(r.jaSaiu.fixosCentavos)} + gastos ${formatarCentavos(r.jaSaiu.gastosCentavos)}`;
    el.aVencer.textContent = `− ${formatarCentavos(r.aVencerCentavos)}`;
    el.sobra.textContent = formatarCentavos(r.deveSobrarCentavos);
    el.linhaSobra.dataset.cor = r.corSaldo;
    el.avisoSaldo.hidden = r.saldoConfirmado;

    preencherLista(
      el.categorias,
      r.categorias.map((item) => itemDaCategoria(item, r.fracaoDoMes)),
      'Nenhuma categoria.',
    );
    preencherLista(el.fixos, r.fixos.map(itemDoFixo), 'Nenhuma conta fixa neste mês.');
    preencherLista(el.gastos, r.gastos.map(itemDoGasto), 'Nenhum gasto lançado neste mês.');
  }

  return { renderizar };
}
