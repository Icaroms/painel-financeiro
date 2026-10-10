/**
 * Vista "Investir" (Fase 04, partes 4.2a e 4.2b): a carteira de investimentos.
 *
 * - Resumo: valor atual da carteira, quanto foi aplicado, quanto rendeu e
 *   o total de cada grupo (renda fixa e fundos, ações, FIIs, imóveis).
 * - Lista: 5 investimentos por página, do maior valor para o menor.
 *   - Renda fixa, fundos e imóveis: Remover, Editar e Atualizar valor.
 *   - Ações e FIIs: Remover, Nova operação (compra ou venda), Cotação e
 *     a lista das operações (5 por página), com preço médio e lucro das vendas.
 * - Cadastro: os campos mudam com o tipo (valor aplicado ou primeira compra).
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. As regras ficam em
 * src/carteira.js e src/acoes.js (testados no Node). Todo texto entra com textContent.
 */

import { hojeLocal } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import { paginar } from '../historico.js';
import {
  TIPOS_DE_INVESTIMENTO,
  TAMANHO_MAXIMO_NOME,
  tipoDoInvestimento,
  adicionarInvestimento,
  editarInvestimento,
  atualizarValorAtual,
  removerInvestimento,
  rendimento,
  textoDoPercentual,
  resumoDaCarteira,
} from '../carteira.js';
import {
  ehPorOperacao,
  unidade,
  posicaoDoAtivo,
  adicionarAtivo,
  adicionarOperacao,
  removerOperacao,
  atualizarCotacao,
} from '../acoes.js';

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

/** "2026-03-10" → "10/03/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/** Valor com sinal: "+R$ 52,30" ou "−R$ 23,00". */
function valorComSinal(centavos) {
  if (centavos > 0) return `+${formatarCentavos(centavos)}`;
  if (centavos < 0) return `−${formatarCentavos(-centavos)}`;
  return formatarCentavos(0);
}

/** Classe da cor do rendimento: verde quando ganhou, vermelho quando perdeu. */
const classeDoRendimento = (centavos) => (centavos > 0 ? 'ganho' : centavos < 0 ? 'perda' : '');

/** "+R$ 52,30 (+5,2%)", na cor do rendimento. */
function trechoDoRendimento(aplicadoCentavos, atualCentavos) {
  const r = rendimento(aplicadoCentavos, atualCentavos);
  const percentual = textoDoPercentual(r.percentual);
  return criar('span', {
    classe: classeDoRendimento(r.rendimentoCentavos),
    texto: percentual ? `${valorComSinal(r.rendimentoCentavos)} (${percentual})` : valorComSinal(r.rendimentoCentavos),
  });
}

/** Quantidade com separador de milhar: 1000 → "1.000". */
const numero = (quantidade) => quantidade.toLocaleString('pt-BR');

/** Quantidade digitada: "1.000" ou "1000" → 1000. Texto inválido vira NaN (a regra explica o erro). */
function lerQuantidade(texto) {
  const limpo = String(texto ?? '').trim().replace(/\./g, '');
  return /^\d+$/.test(limpo) ? Number(limpo) : NaN;
}

/** Campo com rótulo. */
function campo(rotulo, controle, classeExtra = '') {
  const label = criar('label', { classe: `campo ${classeExtra}`.trim() });
  label.append(criar('span', { classe: 'secundario', texto: rotulo }), controle);
  return label;
}

/** Campo de dinheiro (com "R$" fixo à esquerda). */
function campoDinheiro(rotulo, nome, valorInicial = '', { classeExtra = '', placeholder = '0,00' } = {}) {
  const caixa = criar('span', { classe: 'campo-dinheiro' });
  const input = criar('input', { name: nome, inputmode: 'decimal', placeholder });
  input.value = valorInicial;
  caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
  return { rotulo: campo(rotulo, caixa, classeExtra), input };
}

/** Linha de botões Cancelar + enviar. */
function botoesDoFormulario(textoEnviar, aoCancelar) {
  const acoes = criar('div', { classe: 'acoes' });
  const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
  cancelar.addEventListener('click', aoCancelar);
  acoes.append(cancelar, criar('button', { classe: 'botao-pequeno', type: 'submit', texto: textoEnviar }));
  return acoes;
}

/**
 * Liga a vista Investir.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarInvestir({ obterDados, aplicarMudanca }) {
  const el = {
    total: elemento('investir-total'),
    rendimento: elemento('investir-rendimento'),
    grupos: elemento('investir-grupos'),
    lista: elemento('lista-investimentos'),
    paginacao: elemento('paginacao-investimentos'),
    area: elemento('area-investimento'),
    botaoNovo: elemento('botao-novo-investimento'),
  };

  /**
   * O que está aberto: null, 'novo', ou { id, modo }.
   * modo: 'editar' | 'valor' (renda fixa) · 'operacao' | 'cotacao' | 'operacoes' (ações e FIIs).
   */
  let aberto = null;
  /** Página atual da lista de investimentos e da lista de operações aberta. */
  let pagina = 1;
  let paginaOperacoes = 1;

  /** Fecha o que estiver aberto e redesenha. */
  function fechar() {
    aberto = null;
    renderizar();
  }

  /** Abre um formulário (ou a lista de operações) num item. Tocar de novo no mesmo botão fecha. */
  function abrir(id, modo) {
    aberto = aberto?.id === id && aberto.modo === modo ? null : { id, modo };
    paginaOperacoes = 1;
    renderizar();
  }

  /**
   * Envia um formulário: aplica a mudança, fecha e redesenha; erro de
   * validação aparece no próprio formulário.
   *
   * @param {HTMLElement} erro    Onde mostrar o erro.
   * @param {() => [object, string]} montar Devolve [estado novo, mensagem].
   * @param {object|null} [abertoDepois] O que fica aberto depois de salvar (padrão: nada).
   */
  async function enviar(erro, montar, abertoDepois = null) {
    erro.textContent = '';
    try {
      const [novos, mensagem] = montar();
      aberto = abertoDepois;
      await aplicarMudanca(novos, mensagem);
      renderizar();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      erro.textContent = falha.message;
    }
  }

  /* ---------------- Cadastro e edição ---------------- */

  /**
   * Formulário de investimento. No cadastro, os campos mudam com o tipo:
   * renda fixa/fundo/imóvel pedem o valor aplicado; ação/FII pedem a primeira compra.
   *
   * @param {object|null} item null para cadastrar; um investimento de renda fixa/imóvel para editar.
   */
  function formularioDoInvestimento(item) {
    const hoje = hojeLocal();
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });

    // Na edição não dá para virar ação/FII (eles são registrados por operação).
    const tipo = criar('select', { name: 'tipo' });
    for (const t of TIPOS_DE_INVESTIMENTO.filter((t) => !item || !ehPorOperacao(t.id))) {
      tipo.append(criar('option', { value: t.id, texto: t.nome }));
    }
    tipo.value = item?.tipo ?? TIPOS_DE_INVESTIMENTO[0].id;

    // Campos de renda fixa, fundo e imóvel.
    const nome = criar('input', { name: 'nome', maxlength: String(TAMANHO_MAXIMO_NOME), placeholder: 'Ex.: CDB Banco X 2028' });
    nome.value = item?.nome ?? '';
    const dataAplicacao = criar('input', { name: 'dataAplicacao', type: 'date', max: hoje });
    dataAplicacao.value = item?.dataAplicacao ?? hoje;
    const aplicado = campoDinheiro('Valor aplicado', 'valorAplicado', item ? textoDoValor(item.valorAplicadoCentavos) : '');
    const atual = campoDinheiro('Valor atual', 'valorAtual', item ? textoDoValor(item.valorAtualCentavos) : '', { placeholder: 'opcional' });
    const dataAtual = criar('input', { name: 'valorAtualEm', type: 'date', max: hoje });
    dataAtual.value = item?.valorAtualEm ?? hoje;
    const camposDeValor = [
      campo('Nome', nome, 'inteira'),
      campo('Data da aplicação', dataAplicacao),
      aplicado.rotulo,
      atual.rotulo,
      campo('Data do valor atual', dataAtual),
      criar('p', {
        classe: 'dica secundario',
        texto: 'O valor atual é o que aparece hoje no app ou no extrato do banco. Deixe vazio se ainda é igual ao aplicado.',
      }),
    ];

    // Campos de ação e FII: o código e a primeira compra.
    const codigo = criar('input', { name: 'codigo', maxlength: '7', placeholder: 'Ex.: PETR4', autocapitalize: 'characters' });
    const dataCompra = criar('input', { name: 'dataCompra', type: 'date', max: hoje });
    dataCompra.value = hoje;
    const quantidade = criar('input', { name: 'quantidade', inputmode: 'numeric', placeholder: 'Ex.: 100' });
    const preco = campoDinheiro('Preço de cada uma', 'preco', '');
    const custos = campoDinheiro('Custos (corretagem, taxas)', 'custos', '', { placeholder: 'opcional' });
    const rotuloQuantidade = campo('Quantidade', quantidade);
    const camposDeCompra = [
      campo('Código na bolsa', codigo, 'inteira'),
      campo('Data da compra', dataCompra),
      rotuloQuantidade,
      preco.rotulo,
      custos.rotulo,
      criar('p', {
        classe: 'dica secundario',
        texto: 'A primeira compra, como está na nota de corretagem. As outras compras e as vendas entram depois, em "Nova operação".',
      }),
    ];

    /** Mostra só os campos do tipo escolhido. */
    function mostrarCamposDoTipo() {
      const porOperacao = ehPorOperacao(tipo.value);
      for (const c of camposDeValor) c.hidden = porOperacao;
      for (const c of camposDeCompra) c.hidden = !porOperacao;
      rotuloQuantidade.firstChild.textContent = tipo.value === 'fii' ? 'Quantidade de cotas' : 'Quantidade de ações';
    }
    tipo.addEventListener('change', mostrarCamposDoTipo);

    const erro = criar('span', { classe: 'erro', role: 'alert' });
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviar(erro, () => {
        const estado = obterDados();
        const opcoes = { hoje: hojeLocal() };
        if (ehPorOperacao(tipo.value)) {
          const novos = adicionarAtivo(estado, {
            tipo: tipo.value,
            codigo: codigo.value,
            compra: {
              data: dataCompra.value,
              quantidade: lerQuantidade(quantidade.value),
              precoCentavos: lerValorPositivo(preco.input.value, 'precoCentavos'),
              custosCentavos: lerValorPositivo(custos.input.value, 'custosCentavos'),
            },
          }, opcoes);
          return [novos, `${codigo.value.trim().toUpperCase()} adicionado à carteira.`];
        }
        const semValorAtual = atual.input.value.trim() === '';
        const dados = {
          tipo: tipo.value,
          nome: nome.value,
          dataAplicacao: dataAplicacao.value,
          valorAplicadoCentavos: lerValorPositivo(aplicado.input.value, 'valorAplicadoCentavos'),
          valorAtualCentavos: semValorAtual ? null : lerValorPositivo(atual.input.value, 'valorAtualCentavos'),
          valorAtualEm: semValorAtual ? null : dataAtual.value,
        };
        return item
          ? [editarInvestimento(estado, item.id, dados, opcoes), `"${dados.nome.trim()}" salvo.`]
          : [adicionarInvestimento(estado, dados, opcoes), `"${dados.nome.trim()}" adicionado à carteira.`];
      });
    });

    form.append(campo('Tipo', tipo, 'inteira'), ...camposDeValor, ...camposDeCompra, erro,
      botoesDoFormulario(item ? 'Salvar' : 'Adicionar', fechar));
    mostrarCamposDoTipo();
    return form;
  }

  /**
   * Formulário curto de um valor só (valor atual da renda fixa ou cotação da ação).
   *
   * @param {object} opcoes
   * @param {string} opcoes.rotulo   Texto do campo (para leitores de tela).
   * @param {string} opcoes.dica
   * @param {number|null} opcoes.inicial Centavos para preencher, ou null.
   * @param {(centavos: number) => [object, string]} opcoes.aoSalvar
   */
  function formularioDeUmValor({ rotulo, dica, inicial, aoSalvar }) {
    const form = criar('form', { classe: 'form-pago', autocomplete: 'off', novalidate: '' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const input = criar('input', { name: 'valor', inputmode: 'decimal', placeholder: '0,00', 'aria-label': rotulo });
    input.value = inicial === null ? '' : textoDoValor(inicial);
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
    const erro = criar('span', { classe: 'erro', role: 'alert' });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviar(erro, () => aoSalvar(lerValorPositivo(input.value, 'valor')));
    });
    form.append(caixa, botoesDoFormulario('Salvar', fechar), criar('p', { classe: 'dica secundario', texto: dica }), erro);
    return form;
  }

  /* ---------------- Ações e FIIs: operações ---------------- */

  /** Formulário de uma compra ou venda. */
  function formularioDaOperacao(ativo) {
    const hoje = hojeLocal();
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });

    const tipoOperacao = criar('select', { name: 'tipoOperacao' });
    tipoOperacao.append(criar('option', { value: 'compra', texto: 'Compra' }), criar('option', { value: 'venda', texto: 'Venda' }));
    const data = criar('input', { name: 'data', type: 'date', max: hoje });
    data.value = hoje;
    const quantidade = criar('input', { name: 'quantidade', inputmode: 'numeric', placeholder: 'Ex.: 10' });
    const preco = campoDinheiro(`Preço de cada ${ativo.tipo === 'fii' ? 'cota' : 'ação'}`, 'preco', '');
    const custos = campoDinheiro('Custos (corretagem, taxas)', 'custos', '', { placeholder: 'opcional' });
    const erro = criar('span', { classe: 'erro', role: 'alert' });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviar(erro, () => {
        const operacao = {
          tipo: tipoOperacao.value,
          data: data.value,
          quantidade: lerQuantidade(quantidade.value),
          precoCentavos: lerValorPositivo(preco.input.value, 'precoCentavos'),
          custosCentavos: lerValorPositivo(custos.input.value, 'custosCentavos'),
        };
        const novos = adicionarOperacao(obterDados(), ativo.id, operacao, { hoje: hojeLocal() });
        return [novos, `${operacao.tipo === 'compra' ? 'Compra' : 'Venda'} de ${ativo.nome} registrada.`];
      });
    });

    form.append(
      campo('Operação', tipoOperacao),
      campo('Data', data),
      campo(`Quantidade de ${unidade(ativo.tipo, 2)}`, quantidade),
      preco.rotulo,
      custos.rotulo,
      criar('p', { classe: 'dica secundario', texto: 'Como está na nota de corretagem. Os custos entram no preço médio (compra) ou saem do lucro (venda).' }),
      erro,
      botoesDoFormulario('Registrar', fechar),
    );
    return form;
  }

  /** Lista das operações do ativo (mais recentes primeiro), 5 por página, com Remover. */
  function listaDeOperacoes(ativo) {
    const caixa = criar('div', { classe: 'operacoes' });
    const operacoes = [...ativo.operacoes].sort((a, b) => b.data.localeCompare(a.data));
    const paginaAtual = paginar(operacoes, paginaOperacoes);
    paginaOperacoes = paginaAtual.pagina;
    const erro = criar('span', { classe: 'erro', role: 'alert' });

    const lista = criar('ul', { classe: 'lista-mes' });
    for (const op of paginaAtual.itens) {
      const li = criar('li', { classe: 'linha-mes' });
      const info = criar('div', { classe: 'linha-mes-info' });
      info.append(
        criar('span', { classe: 'linha-mes-nome', texto: `${op.tipo === 'compra' ? 'Compra' : 'Venda'} · ${dataLonga(op.data)}` }),
        criar('span', {
          classe: 'linha-mes-detalhe secundario',
          texto: `${numero(op.quantidade)} × ${formatarCentavos(op.precoCentavos)}` +
            (op.custosCentavos > 0 ? ` · custos ${formatarCentavos(op.custosCentavos)}` : ''),
        }),
      );
      const lado = criar('div', { classe: 'linha-mes-lado' });
      const remover = criar('button', {
        classe: 'botao-texto perigo', type: 'button', texto: 'Remover',
        'aria-label': `Remover a ${op.tipo} de ${dataLonga(op.data)}`,
      });
      remover.addEventListener('click', () => {
        if (!window.confirm(`Remover a ${op.tipo} de ${numero(op.quantidade)} ${unidade(ativo.tipo, op.quantidade)} em ${dataLonga(op.data)}?`)) return;
        // Depois de remover, a lista de operações continua aberta.
        enviar(erro, () => [removerOperacao(obterDados(), ativo.id, op.id), 'Operação removida.'], { id: ativo.id, modo: 'operacoes' });
      });
      lado.append(criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(op.quantidade * op.precoCentavos) }), remover);
      li.append(info, lado);
      lista.append(li);
    }

    const nav = criar('nav', { classe: 'paginacao', 'aria-label': `Páginas das operações de ${ativo.nome}` });
    montarPaginacao(nav, paginaAtual, (nova) => {
      paginaOperacoes = nova;
      renderizar();
    });
    caixa.append(lista, nav, erro);
    return caixa;
  }

  /* ---------------- Itens da lista ---------------- */

  /** Botão pequeno de ação de um item. */
  function botao(texto, rotulo, aoClicar, classeExtra = '') {
    const b = criar('button', { classe: `botao-pequeno ${classeExtra}`.trim(), type: 'button', texto, 'aria-label': rotulo });
    b.addEventListener('click', aoClicar);
    return b;
  }

  /** Botão Remover (com confirmação) de um investimento. */
  function botaoRemover(investimento, erro) {
    return botao('Remover', `Remover ${investimento.nome}`, () => {
      const pergunta = ehPorOperacao(investimento.tipo)
        ? `Remover ${investimento.nome} da carteira, com todas as operações?`
        : `Remover "${investimento.nome}" da carteira?`;
      if (!window.confirm(pergunta)) return;
      enviar(erro, () => [removerInvestimento(obterDados(), investimento.id), `${investimento.nome} removido da carteira.`]);
    }, 'perigo');
  }

  /** Item de renda fixa, fundo ou imóvel. */
  function itemDeValor({ investimento: item }) {
    const li = criar('li', { classe: 'fixo investimento' });
    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: item.nome }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(item.valorAtualCentavos) }),
    );

    const detalhe = criar('p', { classe: 'fixo-detalhe secundario' });
    detalhe.append(
      `${tipoDoInvestimento(item.tipo)?.nome ?? item.tipo} · aplicado ${formatarCentavos(item.valorAplicadoCentavos)} ` +
        `em ${dataLonga(item.dataAplicacao)} · rendeu `,
      trechoDoRendimento(item.valorAplicadoCentavos, item.valorAtualCentavos),
      ` · valor de ${dataLonga(item.valorAtualEm)}`,
    );

    const erro = criar('span', { classe: 'erro', role: 'alert' });
    const acoes = criar('div', { classe: 'acoes' });
    acoes.append(
      botaoRemover(item, erro),
      botao('Editar', `Editar ${item.nome}`, () => abrir(item.id, 'editar')),
      botao('Atualizar valor', `Atualizar o valor de ${item.nome}`, () => abrir(item.id, 'valor')),
    );

    li.append(topo, detalhe, acoes, erro);
    if (aberto?.id === item.id && aberto.modo === 'editar') li.append(formularioDoInvestimento(item));
    if (aberto?.id === item.id && aberto.modo === 'valor') {
      li.append(formularioDeUmValor({
        rotulo: `Valor atual de ${item.nome}`,
        dica: 'Valor de hoje, como aparece no banco.',
        inicial: item.valorAtualCentavos,
        aoSalvar: (centavos) => [atualizarValorAtual(obterDados(), item.id, centavos, { hoje: hojeLocal() }), `Valor de "${item.nome}" atualizado.`],
      }));
    }
    return li;
  }

  /** Item de ação ou FII. */
  function itemDoAtivo({ investimento: ativo, aplicadoCentavos, atualCentavos, semCotacao, encerrado }) {
    const li = criar('li', { classe: `fixo investimento${encerrado ? ' encerrado' : ''}` });
    const p = posicaoDoAtivo(ativo);
    const tipoNome = tipoDoInvestimento(ativo.tipo)?.nome ?? ativo.tipo;

    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: ativo.nome }),
      criar('span', { classe: 'fixo-valor', texto: encerrado ? 'zerada' : formatarCentavos(atualCentavos) }),
    );

    const detalhe = criar('p', { classe: 'fixo-detalhe secundario' });
    if (encerrado) {
      detalhe.append(`${tipoNome} · posição zerada: tudo foi vendido.`);
    } else {
      detalhe.append(
        `${tipoNome} · ${numero(p.quantidade)} ${unidade(ativo.tipo, p.quantidade)} · preço médio ${formatarCentavos(p.precoMedioCentavos)} · `,
      );
      if (semCotacao) {
        detalhe.append('sem cotação: toque em "Cotação" para ver quanto rendeu.');
      } else {
        detalhe.append(
          `cotação ${formatarCentavos(ativo.cotacaoCentavos)} em ${dataLonga(ativo.cotacaoEm)} · rendeu `,
          trechoDoRendimento(aplicadoCentavos, atualCentavos),
        );
      }
    }

    const linhas = [topo, detalhe];
    if (p.vendas.length > 0) {
      const vendas = criar('p', { classe: 'fixo-detalhe secundario' });
      vendas.append(
        `${p.vendas.length === 1 ? '1 venda' : `${p.vendas.length} vendas`} · ${p.lucroVendasCentavos < 0 ? 'prejuízo' : 'lucro'} `,
        criar('span', { classe: classeDoRendimento(p.lucroVendasCentavos), texto: valorComSinal(p.lucroVendasCentavos) }),
      );
      linhas.push(vendas);
    }

    const erro = criar('span', { classe: 'erro', role: 'alert' });
    if (p.problema) erro.textContent = p.problema; // dados inconsistentes (ex.: backup editado à mão)
    const acoes = criar('div', { classe: 'acoes' });
    acoes.append(
      botaoRemover(ativo, erro),
      botao('Nova operação', `Registrar compra ou venda de ${ativo.nome}`, () => abrir(ativo.id, 'operacao')),
      ...(encerrado ? [] : [botao('Cotação', `Atualizar a cotação de ${ativo.nome}`, () => abrir(ativo.id, 'cotacao'))]),
      botao(`Operações (${ativo.operacoes.length})`, `Ver as operações de ${ativo.nome}`, () => abrir(ativo.id, 'operacoes')),
    );

    li.append(...linhas, acoes, erro);
    if (aberto?.id === ativo.id) {
      if (aberto.modo === 'operacao') li.append(formularioDaOperacao(ativo));
      if (aberto.modo === 'operacoes') li.append(listaDeOperacoes(ativo));
      if (aberto.modo === 'cotacao') {
        li.append(formularioDeUmValor({
          rotulo: `Cotação de ${ativo.nome}`,
          dica: `Preço de 1 ${ativo.tipo === 'fii' ? 'cota' : 'ação'} hoje, como aparece no app da corretora.`,
          inicial: ativo.cotacaoCentavos ?? null,
          aoSalvar: (centavos) => [atualizarCotacao(obterDados(), ativo.id, centavos, { hoje: hojeLocal() }), `Cotação de ${ativo.nome} atualizada.`],
        }));
      }
    }
    return li;
  }

  /* ---------------- Paginação, resumo e tela inteira ---------------- */

  /** Botões "Anterior" e "Próxima". Com uma página só, a paginação some. */
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

  function renderizarResumo(r) {
    el.total.textContent = formatarCentavos(r.atualCentavos);
    if (r.itens.length === 0) {
      el.rendimento.textContent = 'Nenhum investimento cadastrado ainda.';
      el.grupos.replaceChildren();
      return;
    }
    const trecho = trechoDoRendimento(r.aplicadoCentavos, r.atualCentavos);
    const forte = criar('strong', { classe: trecho.className, texto: trecho.textContent });
    el.rendimento.replaceChildren(`Aplicado ${formatarCentavos(r.aplicadoCentavos)} · rendeu `, forte);
    el.grupos.replaceChildren(...r.grupos.map((g) => {
      const linha = criar('div', { classe: 'conta-linha' });
      const termo = criar('dt', { texto: `${g.nome} ` });
      termo.append(criar('span', {
        classe: 'secundario',
        texto: `${g.quantidade} ${g.quantidade === 1 ? 'investimento' : 'investimentos'} · aplicado ${formatarCentavos(g.aplicadoCentavos)}`,
      }));
      linha.append(termo, criar('dd', { texto: formatarCentavos(g.atualCentavos) }));
      return linha;
    }));
  }

  function renderizar() {
    const r = resumoDaCarteira(obterDados());
    renderizarResumo(r);

    const paginaAtual = paginar(r.itens, pagina);
    pagina = paginaAtual.pagina; // paginar() volta sozinha para a última página que ainda existe
    el.lista.replaceChildren(
      ...(r.itens.length === 0
        ? [criar('li', { classe: 'lista-vazia secundario', texto: 'Cadastre o que você já tem aplicado: CDB, Tesouro, poupança, fundos, ações, FIIs ou imóvel.' })]
        : paginaAtual.itens.map((entrada) => (ehPorOperacao(entrada.investimento.tipo) ? itemDoAtivo(entrada) : itemDeValor(entrada)))),
    );
    montarPaginacao(el.paginacao, paginaAtual, (nova) => {
      pagina = nova;
      aberto = null;
      renderizar();
    });

    el.botaoNovo.hidden = aberto === 'novo';
    el.area.replaceChildren(...(aberto === 'novo' ? [formularioDoInvestimento(null)] : []));
  }

  el.botaoNovo.addEventListener('click', () => {
    aberto = 'novo';
    renderizar();
    el.area.querySelector('select')?.focus();
  });

  return { renderizar };
}
