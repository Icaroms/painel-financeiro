/**
 * Vista "Configurar": dinheiro do mês, contas fixas, categorias, formas
 * de pagamento, cartões de crédito e a conversão das parcelas antigas
 * em compras no cartão.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. As mudanças nos dados
 * são feitas pelas funções puras de src/configuracao.js (testadas no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega duas funções:
 * - obterDados(): devolve os dados atuais;
 * - aplicarMudanca(novosDados, mensagem): troca os dados, grava no
 *   aparelho e mostra a mensagem.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { buscarMes } from '../meses.js';
import { tituloDoMes } from '../painel.js';
import { ehPrimeiroMes } from '../inicio.js';
import { cartaoDaForma, salvarCartao, removerCartao, faturaDaCompra } from '../cartoes.js';
import { limiteDoCartao } from '../fluxo.js';
import {
  contasParaConverter, converterFixo, comprasConvertidas, desfazerConversao, avisoAoDesfazer,
} from '../conversao.js';
import {
  textoDoValor,
  lerValorComSinal,
  lerValorPositivo,
  salvarDinheiroDoMes,
  categoriasAtivas,
  adicionarCategoria,
  editarCategoria,
  removerCategoria,
  adicionarFormaPagamento,
  removerFormaPagamento,
} from '../configuracao.js';
import {
  fixosDoMes,
  adicionarFixo,
  editarFixo,
  encerrarFixo,
  definirValorNoMes,
  mesesDoParcelamento,
  parcelaNoMes,
} from '../fixos.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe e texto opcionais. */
function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** Mostra (ou limpa) o erro de um campo e marca o campo como inválido. */
function mostrarErro(campoErro, input, mensagem) {
  campoErro.textContent = mensagem;
  if (input) input.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
}

/**
 * Liga a vista Configurar.
 *
 * @param {object}   opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarConfigurar({ obterDados, aplicarMudanca }) {
  const el = {
    subtitulo: elemento('config-subtitulo'),
    alertaSaldo: elemento('alerta-saldo'),
    alertaSaldoTexto: elemento('alerta-saldo-texto'),
    formMes: elemento('form-mes'),
    saldoInicial: elemento('saldo-inicial'),
    rendaPrevista: elemento('renda-prevista'),
    erroSaldo: elemento('erro-saldo'),
    erroRenda: elemento('erro-renda'),
    resumoDinheiro: elemento('resumo-dinheiro'),
    botaoSalvarMes: elemento('botao-salvar-mes'),
    listaCategorias: elemento('lista-categorias'),
    formNovaCategoria: elemento('form-nova-categoria'),
    erroNovaCategoria: elemento('erro-nova-categoria'),
    listaFormas: elemento('lista-formas'),
    formNovaForma: elemento('form-nova-forma'),
    erroNovaForma: elemento('erro-nova-forma'),
    totalFixos: elemento('total-fixos'),
    listaFixos: elemento('lista-fixos'),
    areaNovoFixo: elemento('area-novo-fixo'),
    botaoNovoFixo: elemento('botao-novo-fixo'),
    listaCartoes: elemento('lista-cartoes'),
    areaCartao: elemento('area-cartao'),
    botaoNovoCartao: elemento('botao-novo-cartao'),
    listaConversao: elemento('lista-conversao'),
    tituloConvertidas: elemento('titulo-convertidas'),
    listaConvertidas: elemento('lista-convertidas'),
  };

  const mesAtual = () => mesDaData(hojeLocal());

  /* ---------------- Dinheiro do mês ---------------- */

  /** Atualiza a linha "Dinheiro do mês: R$ ..." enquanto a pessoa digita. */
  function atualizarResumo() {
    let texto;
    try {
      const saldo = lerValorComSinal(el.saldoInicial.value, 'saldo');
      const renda = lerValorPositivo(el.rendaPrevista.value, 'renda');
      texto = formatarCentavos(saldo + renda);
    } catch {
      texto = '—';
    }
    el.resumoDinheiro.replaceChildren(
      'Dinheiro do mês (saldo + renda): ',
      criar('strong', { texto }),
    );
  }

  function renderizarMes() {
    const mes = mesAtual();
    const registro = buscarMes(obterDados(), mes);

    el.subtitulo.textContent = tituloDoMes(mes);
    el.saldoInicial.value = textoDoValor(registro.saldoInicialCentavos);
    el.rendaPrevista.value = textoDoValor(registro.rendaPrevistaCentavos);
    mostrarErro(el.erroSaldo, el.saldoInicial, '');
    mostrarErro(el.erroRenda, el.rendaPrevista, '');

    el.alertaSaldo.hidden = registro.saldoConfirmado;
    el.alertaSaldoTexto.textContent = ehPrimeiroMes(obterDados(), mes)
      ? 'Informe quanto havia na sua conta no início do mês e a renda que ainda vai entrar, e confirme.'
      : `O saldo de ${formatarCentavos(registro.saldoInicialCentavos)} foi sugerido pelo app: ` +
        'é o que sobrou do mês anterior. Confira com o extrato do banco, corrija se precisar e confirme.';
    el.botaoSalvarMes.textContent = registro.saldoConfirmado ? 'Salvar' : 'Confirmar saldo';

    atualizarResumo();
  }

  el.saldoInicial.addEventListener('input', atualizarResumo);
  el.rendaPrevista.addEventListener('input', atualizarResumo);

  el.formMes.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro(el.erroSaldo, el.saldoInicial, '');
    mostrarErro(el.erroRenda, el.rendaPrevista, '');

    const mes = mesAtual();
    const confirmadoAntes = buscarMes(obterDados(), mes).saldoConfirmado;

    try {
      const saldoInicialCentavos = lerValorComSinal(el.saldoInicial.value, 'saldo');
      const rendaPrevistaCentavos = lerValorPositivo(el.rendaPrevista.value, 'renda');
      const novos = salvarDinheiroDoMes(obterDados(), mes, { saldoInicialCentavos, rendaPrevistaCentavos });
      await aplicarMudanca(novos, confirmadoAntes ? 'Dinheiro do mês salvo.' : 'Saldo confirmado.');
      renderizarMes();
    } catch (erro) {
      if (!(erro instanceof ErroValidacao)) throw erro;
      if (erro.campo === 'renda' || erro.campo === 'rendaPrevistaCentavos') {
        mostrarErro(el.erroRenda, el.rendaPrevista, erro.message);
        el.rendaPrevista.focus();
      } else {
        mostrarErro(el.erroSaldo, el.saldoInicial, erro.message);
        el.saldoInicial.focus();
      }
    }
  });

  /* ---------------- Contas fixas ---------------- */

  /**
   * Qual formulário de conta fixa está aberto (só um por vez):
   * null, { id: 'novo' }, { id, modo: 'editar' } ou { id, modo: 'valor-mes' }.
   */
  let fixoAberto = null;

  /** "Termina em agosto de 2027" para um mês final. */
  const textoTermino = (mesFinal) => `termina em ${tituloDoMes(mesFinal).toLowerCase()}`;

  /** Cria um par de botões de rádio no estilo dos chips da tela de lançamento. */
  function chipsDoTipo(nomeGrupo, tipoInicial) {
    const grupo = criar('div', { classe: 'chips chips-2', role: 'radiogroup', 'aria-label': 'Tipo de conta' });
    for (const [valor, rotulo] of [['mensal', 'Mensal'], ['parcelado', 'Parcelado']]) {
      const label = criar('label', { classe: 'chip' });
      const input = criar('input', { type: 'radio', name: nomeGrupo, value: valor });
      input.checked = valor === tipoInicial;
      label.append(input, criar('span', { texto: rotulo }));
      grupo.append(label);
    }
    return grupo;
  }

  /** Cria um campo com rótulo. */
  function campo(rotulo, controle, classeExtra = '') {
    const label = criar('label', { classe: `campo ${classeExtra}`.trim() });
    label.append(criar('span', { classe: 'secundario', texto: rotulo }), controle);
    return label;
  }

  /** Cria um campo de dinheiro (com "R$" fixo à esquerda). */
  function campoDinheiro(rotulo, nome, valorInicial, classeExtra = '') {
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const input = criar('input', { name: nome, inputmode: 'decimal', placeholder: '0,00' });
    if (valorInicial !== undefined) input.value = valorInicial;
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
    return { rotulo: campo(rotulo, caixa, classeExtra), input };
  }

  /**
   * Formulário de conta fixa, usado para cadastrar e para editar.
   *
   * @param {object|null} fixo       null para cadastro; o fixo para edição.
   * @param {string}      textoBotao "Adicionar" ou "Salvar".
   * @param {(dados: object) => Promise<void>} aoSalvar
   */
  function formularioDoFixo(fixo, textoBotao, aoSalvar) {
    const mes = mesAtual();
    const dados = obterDados();
    // Na edição de um parcelado, os campos já vêm com "parcela X de Y" deste mês.
    const parcelaInicial = fixo ? parcelaNoMes(fixo, mes) : null;

    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });

    const inputNome = criar('input', { name: 'nome', maxlength: '40', placeholder: 'Ex.: Faculdade' });
    inputNome.value = fixo ? fixo.nome : '';

    const valor = campoDinheiro('Valor', 'valor', fixo ? textoDoValor(fixo.valorCentavos) : '');

    const inputDia = criar('input', { name: 'dia', inputmode: 'numeric', placeholder: '1 a 31', maxlength: '2' });
    inputDia.value = fixo ? String(fixo.diaVencimento) : '';

    const select = criar('select', { name: 'forma' });
    for (const forma of dados.formasPagamento) {
      const opcao = criar('option', { texto: forma, value: forma });
      opcao.selected = fixo ? fixo.formaPagamento === forma : false;
      select.append(opcao);
    }

    const grupoTipo = criar('fieldset', { classe: 'grupo inteira' });
    grupoTipo.append(
      criar('legend', { classe: 'secundario', texto: 'Tipo' }),
      chipsDoTipo(`tipo-${fixo ? fixo.id : 'novo'}`, parcelaInicial ? 'parcelado' : 'mensal'),
    );

    const inputParcela = criar('input', { name: 'parcela', inputmode: 'numeric', placeholder: 'Ex.: 3', maxlength: '3' });
    const inputTotal = criar('input', { name: 'total', inputmode: 'numeric', placeholder: 'Ex.: 12', maxlength: '3' });
    if (parcelaInicial) {
      inputParcela.value = String(parcelaInicial.atual);
      inputTotal.value = String(parcelaInicial.total);
    }
    const campoParcela = campo('Parcela deste mês', inputParcela);
    const campoTotal = campo('Total de parcelas', inputTotal);
    const dica = criar('p', { classe: 'dica secundario' });

    // Pagamento automático: débito em conta ou cobrança no cartão.
    const campoAutomatico = criar('label', { classe: 'opcao-check inteira' });
    const inputAutomatico = criar('input', { type: 'checkbox', name: 'automatico' });
    inputAutomatico.checked = fixo ? fixo.pagamentoAutomatico === true : false;
    const textoAutomatico = criar('span');
    textoAutomatico.append(
      criar('strong', { texto: 'Pagamento automático' }),
      criar('span', {
        classe: 'secundario',
        texto: ' — débito ou cartão. A conta vira "Pago" sozinha no dia do vencimento.',
      }),
    );
    campoAutomatico.append(inputAutomatico, textoAutomatico);

    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });
    const botaoCancelar = criar('button', { classe: 'botao-pequeno', texto: 'Cancelar', type: 'button' });
    const botaoSalvar = criar('button', { classe: 'botao-pequeno', texto: textoBotao, type: 'submit' });
    acoes.append(botaoCancelar, botaoSalvar);

    /** Tipo escolhido nos chips. */
    const tipoEscolhido = () => form.querySelector('input[type="radio"]:checked')?.value ?? 'mensal';

    /** Mostra os campos de parcela só para parcelado, com a data de término ao vivo. */
    function atualizarParcelas() {
      const parcelado = tipoEscolhido() === 'parcelado';
      campoParcela.hidden = !parcelado;
      campoTotal.hidden = !parcelado;
      dica.hidden = !parcelado;
      if (!parcelado) return;
      try {
        const { mesFinal } = mesesDoParcelamento(mes, Number(inputParcela.value), Number(inputTotal.value));
        dica.textContent = `A conta ${textoTermino(mesFinal)}.`;
      } catch {
        dica.textContent = 'Informe a parcela que cai neste mês e o total, ex.: 3 de 12.';
      }
    }
    form.addEventListener('input', atualizarParcelas);
    form.addEventListener('change', atualizarParcelas);
    atualizarParcelas();

    botaoCancelar.addEventListener('click', () => {
      fixoAberto = null;
      renderizarFixos();
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        await aoSalvar({
          nome: inputNome.value,
          valorCentavos: lerValorPositivo(valor.input.value, 'valorCentavos'),
          diaVencimento: Number(inputDia.value.trim() || NaN),
          formaPagamento: select.value,
          tipo: tipoEscolhido(),
          parcelaAtual: Number(inputParcela.value.trim() || NaN),
          totalParcelas: Number(inputTotal.value.trim() || NaN),
          pagamentoAutomatico: inputAutomatico.checked,
        });
        fixoAberto = null;
        renderizarFixos();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
      }
    });

    form.append(
      campo('Nome', inputNome, 'inteira'),
      valor.rotulo,
      campo('Dia do vencimento', inputDia),
      campo('Pagamento', select, 'inteira'),
      grupoTipo,
      campoParcela,
      campoTotal,
      dica,
      campoAutomatico,
      erro,
      acoes,
    );
    return form;
  }

  /** Formulário "Valor deste mês": muda o valor só no mês atual. */
  function formularioValorDoMes(item) {
    const mes = mesAtual();
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });
    const valor = campoDinheiro(
      `Valor só em ${tituloDoMes(mes).toLowerCase()}`, 'valor', textoDoValor(item.valorCentavos), 'inteira',
    );
    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });

    const botaoCancelar = criar('button', { classe: 'botao-pequeno', texto: 'Cancelar', type: 'button' });
    botaoCancelar.addEventListener('click', () => {
      fixoAberto = null;
      renderizarFixos();
    });
    acoes.append(botaoCancelar);

    // O campo mostra o valor estipulado do mês, mesmo se a conta estiver dispensada.
    valor.input.value = textoDoValor(item.valorEstipuladoCentavos);

    if (item.ajustado) {
      const botaoPadrao = criar('button', {
        classe: 'botao-pequeno', type: 'button',
        texto: `Voltar ao padrão (${formatarCentavos(item.fixo.valorCentavos)})`,
      });
      botaoPadrao.addEventListener('click', async () => {
        await aplicarMudanca(definirValorNoMes(obterDados(), mes, item.fixo.id, null), 'Valor padrão restaurado.');
        fixoAberto = null;
        renderizarFixos();
      });
      acoes.append(botaoPadrao);
    }
    acoes.append(criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Salvar só neste mês' }));

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        const centavos = lerValorPositivo(valor.input.value, 'valorCentavos');
        await aplicarMudanca(
          definirValorNoMes(obterDados(), mes, item.fixo.id, centavos),
          `Valor de "${item.fixo.nome}" ajustado só neste mês.`,
        );
        fixoAberto = null;
        renderizarFixos();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, valor.input, falha.message);
      }
    });

    form.append(
      valor.rotulo,
      criar('p', { classe: 'dica secundario', texto: 'Os outros meses continuam com o valor padrão.' }),
      erro,
      acoes,
    );
    return form;
  }

  /** Monta o item de uma conta fixa na lista. */
  function itemDoFixo(item) {
    const { fixo, valorCentavos, ajustado, parcela, status } = item;
    const mes = mesAtual();
    // Dispensada neste mês: linha em segundo plano (marcar e desmarcar fica na aba Mês).
    const li = criar('li', { classe: status === 'dispensado' ? 'fixo fixo-fora' : 'fixo' });

    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: fixo.nome }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(valorCentavos) }),
    );

    let tipoTexto = parcela
      ? `Parcela ${parcela.atual} de ${parcela.total}, ${textoTermino(fixo.mesFinal)}`
      : 'Mensal';
    if (fixo.pagamentoAutomatico === true) tipoTexto += ' · automático';
    if (status === 'dispensado') tipoTexto += ' · dispensada neste mês';
    const detalhe = criar('p', {
      classe: 'fixo-detalhe secundario',
      texto: `Dia ${fixo.diaVencimento} · ${fixo.formaPagamento} · ${tipoTexto}`,
    });
    if (ajustado) detalhe.append(criar('span', { classe: 'etiqueta', texto: 'valor só deste mês' }));

    const acoes = criar('div', { classe: 'acoes' });
    const botaoEncerrar = criar('button', {
      classe: 'botao-pequeno perigo', type: 'button', texto: 'Encerrar',
      'aria-label': `Encerrar ${fixo.nome}`,
    });
    const botaoValor = criar('button', {
      classe: 'botao-pequeno', type: 'button',
      texto: 'Valor deste mês',
      'aria-label': `Mudar o valor de ${fixo.nome} só neste mês`,
    });
    const botaoEditar = criar('button', {
      classe: 'botao-pequeno', type: 'button', texto: 'Editar', 'aria-label': `Editar ${fixo.nome}`,
    });
    acoes.append(botaoEncerrar, botaoValor, botaoEditar);

    botaoEditar.addEventListener('click', () => {
      fixoAberto = { id: fixo.id, modo: 'editar' };
      renderizarFixos();
    });
    botaoValor.addEventListener('click', () => {
      fixoAberto = { id: fixo.id, modo: 'valor-mes' };
      renderizarFixos();
    });
    botaoEncerrar.addEventListener('click', async () => {
      const criadoAgora = fixo.mesInicial >= mes;
      const pergunta = criadoAgora
        ? `Excluir "${fixo.nome}"?

Ela foi cadastrada neste mês, então sai de vez.`
        : `Encerrar "${fixo.nome}"?

Ela deixa de contar a partir de ${tituloDoMes(mes).toLowerCase()}. Os meses anteriores não mudam.`;
      if (!window.confirm(pergunta)) return;

      const { estado, como } = encerrarFixo(obterDados(), fixo.id, mes);
      await aplicarMudanca(estado, como === 'excluido' ? `"${fixo.nome}" excluída.` : `"${fixo.nome}" encerrada.`);
      fixoAberto = null;
      renderizarFixos();
    });

    li.append(topo, detalhe, acoes);

    if (fixoAberto?.id === fixo.id && fixoAberto.modo === 'editar') {
      li.append(formularioDoFixo(fixo, 'Salvar', async (dados) => {
        await aplicarMudanca(editarFixo(obterDados(), fixo.id, dados, mes), 'Conta fixa salva.');
      }));
    }
    if (fixoAberto?.id === fixo.id && fixoAberto.modo === 'valor-mes') {
      li.append(formularioValorDoMes(item));
    }
    return li;
  }

  function renderizarFixos() {
    const mes = mesAtual();
    const itens = fixosDoMes(obterDados(), mes, hojeLocal());
    // O total não conta as contas dispensadas neste mês.
    const previstas = itens.filter((item) => item.status !== 'dispensado');
    const total = previstas.reduce((soma, item) => soma + item.valorCentavos, 0);

    el.totalFixos.replaceChildren(
      previstas.length === 0 ? 'Nenhuma conta fixa neste mês.' : `${previstas.length} conta(s) neste mês, total: `,
      ...(previstas.length === 0 ? [] : [criar('strong', { texto: formatarCentavos(total) })]),
    );
    el.listaFixos.replaceChildren(...itens.map(itemDoFixo));

    const cadastrando = fixoAberto?.id === 'novo';
    el.botaoNovoFixo.hidden = cadastrando;
    el.areaNovoFixo.replaceChildren(
      ...(cadastrando
        ? [formularioDoFixo(null, 'Adicionar', async (dados) => {
            await aplicarMudanca(adicionarFixo(obterDados(), dados, mes), `"${dados.nome.trim()}" adicionada.`);
          })]
        : []),
    );
  }

  el.botaoNovoFixo.addEventListener('click', () => {
    fixoAberto = { id: 'novo' };
    renderizarFixos();
    el.areaNovoFixo.querySelector('input')?.focus();
  });

  /* ---------------- Categorias ---------------- */

  /** Monta a linha de uma categoria: nome, orçamento, Salvar e Remover. */
  function linhaDaCategoria(categoria) {
    const item = criar('li');
    const form = criar('form', { classe: 'linha-categoria', autocomplete: 'off', novalidate: '' });

    const campoNome = criar('label', { classe: 'campo' });
    const inputNome = criar('input', { name: 'nome', maxlength: '40' });
    inputNome.value = categoria.nome;
    campoNome.append(criar('span', { classe: 'secundario', texto: 'Nome' }), inputNome);

    const campoOrcamento = criar('label', { classe: 'campo' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const inputOrcamento = criar('input', { name: 'orcamento', inputmode: 'decimal', placeholder: '0,00' });
    inputOrcamento.value = textoDoValor(categoria.orcamentoCentavos);
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), inputOrcamento);
    campoOrcamento.append(criar('span', { classe: 'secundario', texto: 'Orçamento' }), caixa);

    const acoes = criar('div', { classe: 'acoes' });
    const botaoRemover = criar('button', {
      classe: 'botao-pequeno perigo', texto: 'Remover', type: 'button',
      'aria-label': `Remover a categoria ${categoria.nome}`,
    });
    const botaoSalvar = criar('button', {
      classe: 'botao-pequeno', texto: 'Salvar', type: 'submit',
      'aria-label': `Salvar a categoria ${categoria.nome}`,
    });
    acoes.append(botaoRemover, botaoSalvar);

    const erro = criar('span', { classe: 'erro' });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        const novos = editarCategoria(obterDados(), categoria.id, {
          nome: inputNome.value,
          orcamentoCentavos: lerValorPositivo(inputOrcamento.value, 'orcamento'),
        });
        await aplicarMudanca(novos, 'Categoria salva.');
        renderizarCategorias();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, falha.campo === 'nome' ? inputNome : inputOrcamento, falha.message);
      }
    });

    botaoRemover.addEventListener('click', async () => {
      mostrarErro(erro, null, '');
      const confirmou = window.confirm(
        `Remover a categoria "${categoria.nome}"?\n\nOs gastos já lançados nela continuam guardados.`,
      );
      if (!confirmou) return;
      try {
        await aplicarMudanca(removerCategoria(obterDados(), categoria.id), 'Categoria removida.');
        renderizarCategorias();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
      }
    });

    form.append(campoNome, campoOrcamento, acoes, erro);
    item.append(form);
    return item;
  }

  function renderizarCategorias() {
    el.listaCategorias.replaceChildren(...categoriasAtivas(obterDados()).map(linhaDaCategoria));
  }

  el.formNovaCategoria.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const { nome, orcamento } = el.formNovaCategoria.elements;
    mostrarErro(el.erroNovaCategoria, null, '');
    try {
      const novos = adicionarCategoria(obterDados(), {
        nome: nome.value,
        orcamentoCentavos: lerValorPositivo(orcamento.value, 'orcamento'),
      });
      await aplicarMudanca(novos, `Categoria "${nome.value.trim()}" adicionada.`);
      el.formNovaCategoria.reset();
      renderizarCategorias();
      nome.focus();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(el.erroNovaCategoria, null, falha.message);
    }
  });

  /* ---------------- Formas de pagamento ---------------- */

  function renderizarFormas() {
    el.listaFormas.replaceChildren(
      ...obterDados().formasPagamento.map((forma) => {
        const item = criar('li', { classe: 'forma' });
        const botao = criar('button', { type: 'button', texto: '×', 'aria-label': `Remover ${forma}` });
        botao.addEventListener('click', async () => {
          mostrarErro(el.erroNovaForma, null, '');
          try {
            await aplicarMudanca(removerFormaPagamento(obterDados(), forma), `"${forma}" removida.`);
            renderizarFormas();
            renderizarCartoes(); // o cartão ligado à forma sai junto
          } catch (falha) {
            if (!(falha instanceof ErroValidacao)) throw falha;
            mostrarErro(el.erroNovaForma, null, falha.message);
          }
        });
        item.append(criar('span', { texto: forma }), botao);
        return item;
      }),
    );
  }

  el.formNovaForma.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const { nome } = el.formNovaForma.elements;
    mostrarErro(el.erroNovaForma, null, '');
    try {
      await aplicarMudanca(adicionarFormaPagamento(obterDados(), nome.value), `"${nome.value.trim()}" adicionada.`);
      el.formNovaForma.reset();
      renderizarFormas();
      renderizarCartoes(); // a forma nova pode virar cartão
      nome.focus();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(el.erroNovaForma, null, falha.message);
    }
  });

  /* ---------------- Cartões de crédito ---------------- */

  /** Forma de pagamento com o formulário aberto: o nome da forma, 'novo' ou null. */
  let cartaoAberto = null;

  /** "2026-11-10" → "10/11". */
  const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

  /**
   * Formulário do cartão (cadastro ou edição).
   *
   * @param {object|null} cartao null para cadastrar.
   */
  function formularioDoCartao(cartao) {
    const dados = obterDados();
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });

    // No cadastro, só as formas que ainda não são cartão; na edição, a forma fica fixa.
    const select = criar('select', { name: 'forma' });
    const formas = cartao
      ? [cartao.formaPagamento]
      : dados.formasPagamento.filter((f) => !cartaoDaForma(dados, f));
    for (const forma of formas) select.append(criar('option', { value: forma, texto: forma }));
    select.disabled = cartao !== null;

    const limite = campoDinheiro('Limite total', 'limite', cartao ? textoDoValor(cartao.limiteCentavos) : '', 'inteira');
    const inputFechamento = criar('input', { name: 'fechamento', inputmode: 'numeric', placeholder: '1 a 31', maxlength: '2' });
    const inputVencimento = criar('input', { name: 'vencimento', inputmode: 'numeric', placeholder: '1 a 31', maxlength: '2' });
    if (cartao) {
      inputFechamento.value = String(cartao.diaFechamento);
      inputVencimento.value = String(cartao.diaVencimento);
    }

    // Prévia ao vivo: em que dia uma compra feita hoje será paga.
    const dica = criar('p', { classe: 'dica secundario' });
    function atualizarPrevia() {
      const diaFechamento = Number(inputFechamento.value);
      const diaVencimento = Number(inputVencimento.value);
      const diaValido = (dia) => Number.isInteger(dia) && dia >= 1 && dia <= 31;
      if (!diaValido(diaFechamento) || !diaValido(diaVencimento) || diaFechamento === diaVencimento) {
        dica.textContent = 'Informe os dias de fechamento e de vencimento da fatura (dias diferentes).';
        return;
      }
      const { vencimento } = faturaDaCompra({ diaFechamento, diaVencimento }, hojeLocal());
      dica.textContent = `Uma compra feita hoje será paga em ${dataCurta(vencimento)}.`;
    }
    form.addEventListener('input', atualizarPrevia);
    atualizarPrevia();

    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    cancelar.addEventListener('click', () => {
      cartaoAberto = null;
      renderizarCartoes();
    });
    acoes.append(cancelar, criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Salvar' }));

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        const formaPagamento = select.value;
        const novos = salvarCartao(obterDados(), {
          formaPagamento,
          limiteCentavos: lerValorPositivo(limite.input.value, 'limiteCentavos'),
          diaFechamento: Number(inputFechamento.value.trim() || NaN),
          diaVencimento: Number(inputVencimento.value.trim() || NaN),
        });
        await aplicarMudanca(novos, cartao ? `Cartão "${formaPagamento}" salvo.` : `"${formaPagamento}" agora é um cartão.`);
        cartaoAberto = null;
        renderizarCartoes();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
      }
    });

    form.append(
      campo('Forma de pagamento', select, 'inteira'),
      limite.rotulo,
      campo('Dia do fechamento', inputFechamento),
      campo('Dia do vencimento', inputVencimento),
      dica,
      erro,
      acoes,
    );
    return form;
  }

  /** Item de um cartão cadastrado. */
  function itemDoCartao(cartao) {
    const li = criar('li', { classe: 'fixo' });
    const topo = criar('div', { classe: 'fixo-topo' });
    // Limite disponível = limite − o que está em aberto nas faturas (parte 2.4).
    const dados = obterDados();
    const limite = limiteDoCartao({
      cartao,
      lancamentos: dados.lancamentos,
      registroMes: buscarMes(dados, mesAtual()),
      fixos: dados.fixos,
      meses: dados.meses,
      hoje: hojeLocal(),
    });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: cartao.formaPagamento }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(limite.disponivelCentavos) }),
    );

    const { vencimento } = faturaDaCompra(cartao, hojeLocal());
    const detalhe = criar('p', {
      classe: 'fixo-detalhe secundario',
      texto: `Disponível de ${formatarCentavos(cartao.limiteCentavos)} ` +
        `(em aberto nas faturas: ${formatarCentavos(limite.emAbertoCentavos)}` +
        (limite.contasFixasCentavos > 0 ? `, ${formatarCentavos(limite.contasFixasCentavos)} de contas fixas` : '') +
        ') · ' +
        `fecha dia ${cartao.diaFechamento} · vence dia ${cartao.diaVencimento}. ` +
        `Compra feita hoje: paga em ${dataCurta(vencimento)}.`,
    });

    const acoes = criar('div', { classe: 'acoes' });
    const remover = criar('button', {
      classe: 'botao-pequeno perigo', type: 'button', texto: 'Deixar de ser cartão',
      'aria-label': `Deixar ${cartao.formaPagamento} de ser cartão`,
    });
    const editar = criar('button', {
      classe: 'botao-pequeno', type: 'button', texto: 'Editar', 'aria-label': `Editar o cartão ${cartao.formaPagamento}`,
    });
    const erro = criar('span', { classe: 'erro' });
    remover.addEventListener('click', async () => {
      mostrarErro(erro, null, '');
      const pergunta = `"${cartao.formaPagamento}" deixa de ser cartão?\n\nEla continua como forma de pagamento.`;
      if (!window.confirm(pergunta)) return;
      try {
        await aplicarMudanca(removerCartao(obterDados(), cartao.formaPagamento), `"${cartao.formaPagamento}" não é mais cartão.`);
      } catch (falha) {
        // Ex.: o cartão tem parcelas convertidas de contas fixas.
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
        return;
      }
      cartaoAberto = null;
      renderizar();
    });
    editar.addEventListener('click', () => {
      cartaoAberto = cartao.formaPagamento;
      renderizarCartoes();
    });
    acoes.append(remover, editar);

    li.append(topo, detalhe, acoes, erro);
    if (cartaoAberto === cartao.formaPagamento) li.append(formularioDoCartao(cartao));
    return li;
  }

  function renderizarCartoes() {
    const dados = obterDados();
    const cartoes = dados.cartoes ?? [];
    el.listaCartoes.replaceChildren(
      ...(cartoes.length === 0
        ? [criar('li', { classe: 'lista-vazia secundario', texto: 'Nenhum cartão cadastrado.' })]
        : cartoes.map(itemDoCartao)),
    );

    // Só dá para cadastrar se alguma forma de pagamento ainda não é cartão.
    const livres = dados.formasPagamento.filter((f) => !cartaoDaForma(dados, f));
    const cadastrando = cartaoAberto === 'novo' && livres.length > 0;
    el.botaoNovoCartao.hidden = cadastrando || livres.length === 0;
    el.areaCartao.replaceChildren(...(cadastrando ? [formularioDoCartao(null)] : []));
    // Cadastrar ou remover um cartão muda quais contas podem ser convertidas.
    renderizarConversao();
  }

  el.botaoNovoCartao.addEventListener('click', () => {
    cartaoAberto = 'novo';
    renderizarCartoes();
  });

  /* ---------------- Parcelas antigas no cartão (parte 2.3) ---------------- */

  /** id da conta fixa com a confirmação aberta, ou null. */
  let conversaoAberta = null;

  /** "2026-10" → "outubro de 2026". */
  const mesPorExtenso = (mes) => tituloDoMes(mes).toLowerCase();

  /** "outubro de 2026 a julho de 2027" ou só "outubro de 2026". */
  const periodo = (inicio, fim) => (inicio === fim ? mesPorExtenso(inicio) : `${mesPorExtenso(inicio)} a ${mesPorExtenso(fim)}`);

  /** "Parcelas 3 a 12 de 12" ou "Parcela 4 de 4". */
  const quaisParcelas = (primeira, total) =>
    (primeira === total ? `Parcela ${total} de ${total}` : `Parcelas ${primeira} a ${total} de ${total}`);

  /** Confirmação da conversão: diz exatamente o que vai mudar antes de mudar. */
  function confirmacaoDaConversao(plano) {
    const caixa = criar('div', { classe: 'form-fixo confirmacao-conversao' });
    const { fixo } = plano;
    const mes = mesAtual();

    const linhas = [
      `Vira uma compra de ${plano.total} x ${formatarCentavos(plano.valorParcelaCentavos)} no ${fixo.formaPagamento}.`,
      `${quaisParcelas(plano.primeiraParcela, plano.total)} (${formatarCentavos(plano.valorRestanteCentavos)}) ` +
        `entram nas faturas de ${periodo(plano.mesPrimeira, plano.mesUltima)}.`,
    ];
    if (fixo.mesInicial <= mes && plano.mesPrimeira > mes) {
      linhas.push(`A parcela de ${mesPorExtenso(mes)} já está paga e continua como conta fixa.`);
    }
    linhas.push(plano.fixoTerminaEm
      ? `A conta fixa termina em ${mesPorExtenso(plano.fixoTerminaEm)}; os meses anteriores não mudam.`
      : 'A conta fixa sai da lista: nenhuma parcela dela foi paga como conta fixa.');

    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    const confirmar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Confirmar conversão' });
    const erro = criar('span', { classe: 'erro' });
    cancelar.addEventListener('click', () => {
      conversaoAberta = null;
      renderizarConversao();
    });
    confirmar.addEventListener('click', async () => {
      try {
        const { estado } = converterFixo(obterDados(), fixo.id, mes, { hoje: hojeLocal() });
        conversaoAberta = null;
        await aplicarMudanca(estado, `"${fixo.nome}" agora é uma compra parcelada no ${fixo.formaPagamento}.`);
        renderizar(); // a conta fixa mudou: a lista de contas também
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
      }
    });
    acoes.append(cancelar, confirmar);

    caixa.append(...linhas.map((texto) => criar('p', { texto })), erro, acoes);
    return caixa;
  }

  /** Item de uma conta que pode ser convertida. */
  function itemParaConverter(plano) {
    const li = criar('li', { classe: 'fixo' });
    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: plano.fixo.nome }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(plano.valorParcelaCentavos) }),
    );
    const detalhe = criar('p', {
      classe: 'fixo-detalhe secundario',
      texto: `${quaisParcelas(plano.primeiraParcela, plano.total)} · ${plano.fixo.formaPagamento} · ` +
        `${periodo(plano.mesPrimeira, plano.mesUltima)}`,
    });
    li.append(topo, detalhe);

    if (plano.motivo) {
      li.append(criar('p', { classe: 'fixo-detalhe secundario', texto: plano.motivo }));
      return li;
    }
    if (conversaoAberta === plano.fixo.id) {
      li.append(confirmacaoDaConversao(plano));
      return li;
    }
    const acoes = criar('div', { classe: 'acoes' });
    const converter = criar('button', {
      classe: 'botao-pequeno', type: 'button', texto: 'Converter', 'aria-label': `Converter ${plano.fixo.nome} em compra no cartão`,
    });
    converter.addEventListener('click', () => {
      conversaoAberta = plano.fixo.id;
      renderizarConversao();
    });
    acoes.append(converter);
    li.append(acoes);
    return li;
  }

  /** Item de uma compra já convertida, com o botão Desfazer. */
  function itemConvertido(item) {
    const { lancamento } = item;
    const li = criar('li', { classe: 'fixo' });
    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: lancamento.descricao }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(item.valorParcelaCentavos) }),
    );
    const detalhe = criar('p', {
      classe: 'fixo-detalhe secundario',
      texto: `${quaisParcelas(item.parcelasPagas + 1, item.total)} nas faturas do ${lancamento.formaPagamento} · ` +
        `${periodo(item.mesPrimeira, item.mesUltima)}`,
    });

    const acoes = criar('div', { classe: 'acoes' });
    const desfazer = criar('button', {
      classe: 'botao-pequeno', type: 'button', texto: 'Desfazer', 'aria-label': `Desfazer a conversão de ${lancamento.descricao}`,
    });
    desfazer.addEventListener('click', async () => {
      // Se alguma fatura com parcela desta compra já foi paga, a confirmação avisa.
      const aviso = avisoAoDesfazer(obterDados(), lancamento.id);
      const pergunta = `Desfazer a conversão de "${lancamento.descricao}"?\n\n` +
        'A compra sai das faturas e a conta fixa volta como era.' +
        (aviso ? `\n\n${aviso}` : '');
      if (!window.confirm(pergunta)) return;
      await aplicarMudanca(desfazerConversao(obterDados(), lancamento.id), `"${lancamento.descricao}" voltou a ser conta fixa.`);
      renderizar();
    });
    acoes.append(desfazer);

    li.append(topo, detalhe, acoes);
    return li;
  }

  function renderizarConversao() {
    const dados = obterDados();
    const planos = contasParaConverter(dados, mesAtual(), hojeLocal());
    el.listaConversao.replaceChildren(
      ...(planos.length === 0
        ? [criar('li', {
            classe: 'lista-vazia secundario',
            texto: 'Nenhuma conta parcelada num cartão cadastrado. A conta aparece aqui quando a forma de pagamento dela é um cartão.',
          })]
        : planos.map(itemParaConverter)),
    );

    const convertidas = comprasConvertidas(dados);
    el.tituloConvertidas.hidden = convertidas.length === 0;
    el.listaConvertidas.hidden = convertidas.length === 0;
    el.listaConvertidas.replaceChildren(...convertidas.map(itemConvertido));
  }

  /* ---------------- Tudo ---------------- */

  function renderizar() {
    renderizarMes();
    renderizarFixos();
    renderizarCategorias();
    renderizarFormas();
    renderizarCartoes(); // também redesenha as parcelas antigas no cartão
  }

  return { renderizar };
}
