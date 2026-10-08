/**
 * Vista "Configurar": dinheiro do mês, contas fixas, categorias e formas
 * de pagamento.
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

    // Conta opcional: nem todo mês acontece (ex.: dentista).
    const campoOpcional = criar('label', { classe: 'opcao-opcional inteira' });
    const inputOpcional = criar('input', { type: 'checkbox', name: 'opcional' });
    inputOpcional.checked = fixo ? fixo.opcional === true : false;
    const textoOpcional = criar('span');
    textoOpcional.append(
      criar('strong', { texto: 'Conta opcional' }),
      criar('span', {
        classe: 'secundario',
        texto: ' — nem todo mês acontece. Só conta no mês em que você tocar em "Vou usar este mês".',
      }),
    );
    campoOpcional.append(inputOpcional, textoOpcional);

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
          opcional: inputOpcional.checked,
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
      campoOpcional,
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

    const opcional = item.fixo.opcional === true;

    // Conta opcional ainda não prevista: o campo já vem com o valor de sempre, como sugestão.
    if (opcional && !item.ajustado) valor.input.value = textoDoValor(item.fixo.valorCentavos);

    if (item.ajustado) {
      const botaoPadrao = criar('button', {
        classe: 'botao-pequeno', type: 'button',
        texto: opcional
          ? 'Não vou usar este mês'
          : `Voltar ao padrão (${formatarCentavos(item.fixo.valorCentavos)})`,
      });
      botaoPadrao.addEventListener('click', async () => {
        await aplicarMudanca(
          definirValorNoMes(obterDados(), mes, item.fixo.id, null),
          opcional ? `"${item.fixo.nome}" não conta mais neste mês.` : 'Valor padrão restaurado.',
        );
        fixoAberto = null;
        renderizarFixos();
      });
      acoes.append(botaoPadrao);
    }
    acoes.append(criar('button', {
      classe: 'botao-pequeno', type: 'submit', texto: opcional ? 'Usar neste mês' : 'Salvar só neste mês',
    }));

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        const centavos = lerValorPositivo(valor.input.value, 'valorCentavos');
        await aplicarMudanca(
          definirValorNoMes(obterDados(), mes, item.fixo.id, centavos),
          opcional
            ? `"${item.fixo.nome}" entra nas contas deste mês.`
            : `Valor de "${item.fixo.nome}" ajustado só neste mês.`,
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
      criar('p', {
        classe: 'dica secundario',
        texto: opcional
          ? 'Ela conta só neste mês. No mês seguinte, volta a ficar de fora.'
          : 'Os outros meses continuam com o valor padrão.',
      }),
      erro,
      acoes,
    );
    return form;
  }

  /** Monta o item de uma conta fixa na lista. */
  function itemDoFixo(item) {
    const { fixo, valorCentavos, ajustado, parcela, previsto } = item;
    const mes = mesAtual();
    // Opcional não prevista no mês: linha discreta, com o botão para ativar.
    const li = criar('li', { classe: previsto ? 'fixo' : 'fixo fixo-fora' });

    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: fixo.nome }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(valorCentavos) }),
    );

    let tipoTexto = parcela
      ? `Parcela ${parcela.atual} de ${parcela.total}, ${textoTermino(fixo.mesFinal)}`
      : 'Mensal';
    if (fixo.opcional === true) tipoTexto += previsto ? ' · opcional' : ' · opcional, não prevista este mês';
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
      texto: previsto ? 'Valor deste mês' : 'Vou usar este mês',
      'aria-label': previsto ? `Mudar o valor de ${fixo.nome} só neste mês` : `Usar ${fixo.nome} neste mês`,
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
    const itens = fixosDoMes(obterDados(), mes);
    // O total conta só as previstas: opcional sem valor no mês não conta.
    const previstas = itens.filter((item) => item.previsto);
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
      nome.focus();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(el.erroNovaForma, null, falha.message);
    }
  });

  /* ---------------- Tudo ---------------- */

  function renderizar() {
    renderizarMes();
    renderizarFixos();
    renderizarCategorias();
    renderizarFormas();
  }

  return { renderizar };
}
