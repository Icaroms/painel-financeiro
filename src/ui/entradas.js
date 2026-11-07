/**
 * Telas das entradas de dinheiro (11/2026).
 *
 * - Configurar → "Entradas fixas": cadastrar, editar e remover o salário e
 *   o que entra todo mês; atalho para transformar a renda prevista antiga
 *   em salário fixo.
 * - Mês → "Entradas do mês": a situação de cada entrada fixa neste mês
 *   (Prevista, Recebida, Já estava no saldo, Não veio) e as entradas
 *   avulsas (um Pix recebido, um freela), com o formulário para registrar.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA: as regras estão em
 * src/entradas.js (testadas no Node).
 */

import { hojeLocal, mesDaData, tituloDoMes } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { buscarMes } from '../meses.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import {
  entradasFixasDe, entradasAtivasNoMes, situacaoDaEntradaNoMes, adicionarEntradaFixa, editarEntradaFixa,
  removerEntradaFixa, definirStatusDaEntrada, adicionarEntradaAvulsa, removerEntradaAvulsa, entradasAvulsasDe,
  transformarRendaEmEntradaFixa, STATUS_ENTRADA, ROTULO_STATUS_ENTRADA, TAMANHO_NOME_ENTRADA, TAMANHO_DESCRICAO_ENTRADA,
} from '../entradas.js';

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

/** Rótulo + controle. */
function campo(rotulo, controle, classeExtra = '') {
  const label = criar('label', { classe: `campo ${classeExtra}`.trim() });
  label.append(criar('span', { classe: 'secundario', texto: rotulo }), controle);
  return label;
}

/** Campo de dinheiro com "R$" fixo (a digitação de banco é ligada em src/ui/campo-dinheiro.js). */
function campoDinheiro(rotulo, valorInicial = '', classeExtra = '') {
  const caixa = criar('span', { classe: 'campo-dinheiro' });
  const input = criar('input', { inputmode: 'numeric', placeholder: '0,00', autocomplete: 'off' });
  input.value = valorInicial;
  caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
  return { rotulo: campo(rotulo, caixa, classeExtra), input };
}

/** Mensagem de erro de validação (outros erros sobem: são defeito). */
function mostrarFalha(destino, falha) {
  if (!(falha instanceof ErroValidacao)) throw falha;
  destino.textContent = falha.message;
}

/** "2026-11-03" → "03/11". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** Select com as situações da entrada neste mês. */
function selectDeSituacao(valor, rotulo) {
  const select = criar('select', { 'aria-label': rotulo });
  for (const status of STATUS_ENTRADA) {
    const opcao = criar('option', { value: status, texto: ROTULO_STATUS_ENTRADA[status] });
    opcao.selected = status === valor;
    select.append(opcao);
  }
  return select;
}

/* ================================================================== */
/* Configurar → Entradas fixas                                         */
/* ================================================================== */

/**
 * Liga o cartão "Entradas fixas" de Configurar.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarEntradasConfig({ obterDados, aplicarMudanca }) {
  const el = {
    alerta: elemento('alerta-sem-entradas'),
    alertaTexto: elemento('alerta-sem-entradas-texto'),
    total: elemento('total-entradas-fixas'),
    lista: elemento('lista-entradas-fixas'),
    area: elemento('area-entrada-fixa'),
    botaoNova: elemento('botao-nova-entrada'),
    botaoTransformar: elemento('botao-transformar-renda'),
  };
  const mesAtual = () => mesDaData(hojeLocal());

  /** Qual formulário está aberto: null, 'nova', 'transformar' ou o id de uma entrada (edição). */
  let aberto = null;

  /**
   * Formulário de entrada fixa (cadastro, edição ou "usar a renda prevista").
   *
   * @param {object|null} entrada A entrada em edição (null no cadastro).
   * @param {'nova'|'editar'|'transformar'} modo
   */
  function formulario(entrada, modo) {
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });
    const registro = buscarMes(obterDados(), mesAtual());
    const hojeDia = Number(hojeLocal().slice(8, 10));

    const inputNome = criar('input', { maxlength: String(TAMANHO_NOME_ENTRADA), placeholder: 'Ex.: Salário' });
    inputNome.value = entrada?.nome ?? (modo === 'nova' && entradasFixasDe(obterDados()).length === 0 ? 'Salário' : '');
    const valorInicial = entrada ? textoDoValor(entrada.valorCentavos)
      : (modo === 'transformar' ? textoDoValor(registro.rendaPrevistaCentavos) : '');
    const valor = campoDinheiro('Valor de sempre', valorInicial);
    if (modo === 'transformar') valor.input.disabled = true;
    const inputDia = criar('input', { inputmode: 'numeric', placeholder: '1 a 31', maxlength: '2' });
    inputDia.value = entrada ? String(entrada.dia) : '';

    // Situação NESTE mês: só no cadastro (depois, muda na aba Mês).
    const select = criar('select', { 'aria-label': 'Situação neste mês' });
    const opcoes = [
      ['prevista', 'Ainda vai cair'],
      ['no-saldo', 'Já caiu e já está no saldo do início do mês'],
      ['recebida', 'Já caiu depois do saldo do início do mês'],
    ];
    for (const [valorOpcao, texto] of opcoes) select.append(criar('option', { value: valorOpcao, texto }));
    const campoSituacao = campo(`Em ${tituloDoMes(mesAtual()).toLowerCase()}`, select, 'inteira');
    campoSituacao.hidden = modo === 'editar';
    // Sugestão: o dia já passou → provavelmente já está no saldo.
    const sugerirSituacao = () => {
      const dia = Number(inputDia.value);
      if (Number.isInteger(dia) && dia >= 1 && dia <= 31) select.value = dia <= hojeDia ? 'no-saldo' : 'prevista';
    };
    inputDia.addEventListener('input', sugerirSituacao);

    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    const salvar = criar('button', { classe: 'botao-pequeno', type: 'submit', texto: modo === 'editar' ? 'Salvar' : 'Adicionar' });
    acoes.append(cancelar, salvar);
    cancelar.addEventListener('click', () => {
      aberto = null;
      renderizar();
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const mes = mesAtual();
        const dia = Number(inputDia.value.trim() || NaN);
        let novos;
        let mensagem;
        if (modo === 'transformar') {
          novos = transformarRendaEmEntradaFixa(obterDados(), mes, { nome: inputNome.value, dia, statusNoMes: select.value });
          mensagem = 'A renda prevista virou entrada fixa.';
        } else {
          const dados = { nome: inputNome.value, valorCentavos: lerValorPositivo(valor.input.value, 'valorCentavos'), dia };
          novos = modo === 'editar'
            ? editarEntradaFixa(obterDados(), entrada.id, dados)
            : adicionarEntradaFixa(obterDados(), dados, mes, { statusNoMes: select.value });
          mensagem = modo === 'editar' ? 'Entrada fixa salva.' : `"${dados.nome.trim()}" adicionada.`;
        }
        aberto = null;
        await aplicarMudanca(novos, mensagem);
        renderizar();
      } catch (falha) {
        mostrarFalha(erro, falha);
      }
    });

    form.append(
      campo('Nome', inputNome, 'inteira'),
      valor.rotulo,
      campo('Dia em que cai', inputDia),
      campoSituacao,
      erro,
      acoes,
    );
    return form;
  }

  /** Uma entrada fixa da lista. */
  function item(entrada) {
    const mes = mesAtual();
    const registro = buscarMes(obterDados(), mes);
    const situacao = situacaoDaEntradaNoMes(entrada, registro);
    const li = criar('li', { classe: situacao.contaCentavos === 0 ? 'fixo fixo-fora' : 'fixo' });

    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: entrada.nome }),
      criar('span', { classe: 'fixo-valor valor-entrada', texto: `+${formatarCentavos(entrada.valorCentavos)}` }),
    );
    li.append(topo, criar('p', {
      classe: 'fixo-detalhe secundario',
      texto: `Dia ${entrada.dia} · todo mês · neste mês: ${ROTULO_STATUS_ENTRADA[situacao.status].toLowerCase()}`,
    }));

    const acoes = criar('div', { classe: 'acoes' });
    const remover = criar('button', {
      classe: 'botao-pequeno perigo', type: 'button', texto: 'Remover', 'aria-label': `Remover ${entrada.nome}`,
    });
    const editar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Editar', 'aria-label': `Editar ${entrada.nome}` });
    acoes.append(remover, editar);
    li.append(acoes);

    editar.addEventListener('click', () => {
      aberto = entrada.id;
      renderizar();
    });
    remover.addEventListener('click', async () => {
      const criadaAgora = entrada.mesInicial >= mes;
      const pergunta = criadaAgora
        ? `Remover "${entrada.nome}"?\n\nEla foi cadastrada neste mês, então sai de vez.`
        : `Remover "${entrada.nome}"?\n\nEla deixa de contar a partir de ${tituloDoMes(mes).toLowerCase()}. Os meses anteriores não mudam.`;
      if (!window.confirm(pergunta)) return;
      await aplicarMudanca(removerEntradaFixa(obterDados(), entrada.id, mes), `"${entrada.nome}" removida.`);
      renderizar();
    });

    if (aberto === entrada.id) li.append(formulario(entrada, 'editar'));
    return li;
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const mes = mesAtual();
    const registro = buscarMes(dados, mes);
    const ativas = entradasAtivasNoMes(entradasFixasDe(dados), mes);
    const total = ativas.reduce((soma, e) => soma + e.valorCentavos, 0);

    el.total.replaceChildren(
      ativas.length === 0 ? 'Nenhuma entrada fixa.' : `${ativas.length} entrada(s) fixa(s), total por mês: `,
      ...(ativas.length === 0 ? [] : [criar('strong', { texto: formatarCentavos(total) })]),
    );
    el.lista.replaceChildren(...ativas.map(item));

    // Sem entradas fixas: a previsão usa a renda deste mês (que pode estar em zero).
    const semFixas = entradasFixasDe(dados).length === 0;
    el.alerta.hidden = !semFixas;
    el.alertaTexto.textContent = registro.rendaPrevistaCentavos > 0
      ? `Sem entradas fixas, os próximos meses usam a renda prevista deste mês (${formatarCentavos(registro.rendaPrevistaCentavos)}) como salário. ` +
        'Se ela é o seu salário, use o botão abaixo para cadastrá-la como entrada fixa.'
      : 'Sem entradas fixas, os próximos meses são previstos SEM salário. Cadastre o seu salário para a previsão (e o Avaliar compra) fazerem sentido.';
    el.botaoTransformar.hidden = !(semFixas && registro.rendaPrevistaCentavos > 0) || aberto !== null;
    el.botaoNova.hidden = aberto !== null;

    const formAberto = aberto === 'nova' || aberto === 'transformar';
    el.area.replaceChildren(...(formAberto ? [formulario(null, aberto)] : []));
  }

  el.botaoNova.addEventListener('click', () => {
    aberto = 'nova';
    renderizar();
    el.area.querySelector('input')?.focus();
  });
  el.botaoTransformar.addEventListener('click', () => {
    aberto = 'transformar';
    renderizar();
    el.area.querySelector('input:not([disabled])')?.focus();
  });

  return { renderizar };
}

/* ================================================================== */
/* Mês → Entradas do mês                                               */
/* ================================================================== */

/**
 * Liga a seção "Entradas do mês" da aba Mês.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @param {() => void} [opcoes.aoMudar] Redesenha o resto da aba (dinheiro do mês, sobra).
 * @returns {{ renderizar: () => void, focarNovaEntrada: () => void }}
 */
export function iniciarEntradasMes({ obterDados, aplicarMudanca, aoMudar = () => {} }) {
  const el = {
    total: elemento('mes-entradas-total'),
    fixas: elemento('mes-entradas-fixas'),
    avulsas: elemento('mes-entradas-avulsas'),
    form: elemento('form-entrada-avulsa'),
    valor: elemento('entrada-avulsa-valor'),
    descricao: elemento('entrada-avulsa-descricao'),
    data: elemento('entrada-avulsa-data'),
    erro: elemento('erro-entrada-avulsa'),
  };
  el.descricao.maxLength = TAMANHO_DESCRICAO_ENTRADA;
  const mesAtual = () => mesDaData(hojeLocal());

  async function mudar(novos, mensagem) {
    await aplicarMudanca(novos, mensagem);
    renderizar();
    aoMudar();
  }

  /** Uma entrada fixa neste mês: situação e, quando recebida, o valor real. */
  function itemFixa(entrada, registro) {
    const situacao = situacaoDaEntradaNoMes(entrada, registro);
    const li = criar('li', { classe: situacao.contaCentavos === 0 ? 'fixo fixo-fora' : 'fixo' });
    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: entrada.nome }),
      criar('span', {
        classe: 'fixo-valor valor-entrada',
        texto: situacao.contaCentavos === 0 ? formatarCentavos(0) : `+${formatarCentavos(situacao.contaCentavos)}`,
      }),
    );
    const explicacao = {
      prevista: `Cai por volta do dia ${situacao.dia}. Conta no dinheiro do mês.`,
      recebida: 'Já caiu. Conta no dinheiro do mês com o valor recebido.',
      'no-saldo': 'Já estava no saldo do início do mês: não é contada de novo.',
      'nao-veio': 'Não entra neste mês.',
    }[situacao.status];
    li.append(topo, criar('p', { classe: 'fixo-detalhe secundario', texto: explicacao }));

    const linha = criar('div', { classe: 'linha-situacao' });
    const select = selectDeSituacao(situacao.status, `Situação de ${entrada.nome} neste mês`);
    const valor = campoDinheiro('Valor recebido', textoDoValor(situacao.valorCentavos));
    valor.rotulo.hidden = situacao.status !== 'recebida';
    const salvar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Salvar valor' });
    salvar.hidden = situacao.status !== 'recebida';
    const erro = criar('span', { classe: 'erro' });

    const gravar = async (status) => {
      erro.textContent = '';
      try {
        const opcoes = status === 'recebida' ? { valorCentavos: lerValorPositivo(valor.input.value, 'valorCentavos') } : {};
        await mudar(definirStatusDaEntrada(obterDados(), mesAtual(), entrada.id, status, opcoes), `${entrada.nome}: ${ROTULO_STATUS_ENTRADA[status].toLowerCase()}.`);
      } catch (falha) {
        mostrarFalha(erro, falha);
      }
    };
    select.addEventListener('change', () => gravar(select.value));
    salvar.addEventListener('click', () => gravar('recebida'));

    linha.append(campo('Neste mês', select), valor.rotulo, salvar);
    li.append(linha, erro);
    return li;
  }

  /** Uma entrada avulsa: data, descrição, valor e Apagar. */
  function itemAvulsa(entrada) {
    const li = criar('li', { classe: 'fixo' });
    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: entrada.descricao || 'Entrada' }),
      criar('span', { classe: 'fixo-valor valor-entrada', texto: `+${formatarCentavos(entrada.valorCentavos)}` }),
    );
    const apagar = criar('button', {
      classe: 'botao-pequeno perigo', type: 'button', texto: 'Apagar', 'aria-label': `Apagar a entrada ${entrada.descricao || ''}`.trim(),
    });
    apagar.addEventListener('click', async () => {
      if (!window.confirm(`Apagar a entrada de ${formatarCentavos(entrada.valorCentavos)} (${dataCurta(entrada.data)})?`)) return;
      await mudar(removerEntradaAvulsa(obterDados(), mesAtual(), entrada.id), 'Entrada apagada.');
    });
    const acoes = criar('div', { classe: 'acoes' });
    acoes.append(apagar);
    li.append(topo, criar('p', { classe: 'fixo-detalhe secundario', texto: `Dia ${dataCurta(entrada.data)} · avulsa` }), acoes);
    return li;
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const mes = mesAtual();
    const registro = buscarMes(dados, mes);
    const fixas = entradasAtivasNoMes(entradasFixasDe(dados), mes);
    const avulsas = [...entradasAvulsasDe(registro)].sort((a, b) => b.data.localeCompare(a.data));

    const totalFixas = fixas.reduce((soma, e) => soma + situacaoDaEntradaNoMes(e, registro).contaCentavos, 0);
    const totalAvulsas = avulsas.reduce((soma, e) => soma + e.valorCentavos, 0);
    const outras = registro.rendaPrevistaCentavos;
    const partes = [`fixas ${formatarCentavos(totalFixas)}`, `avulsas ${formatarCentavos(totalAvulsas)}`];
    if (outras > 0) partes.push(`outras previstas ${formatarCentavos(outras)}`);
    el.total.replaceChildren(
      'Entram neste mês: ',
      criar('strong', { texto: formatarCentavos(totalFixas + totalAvulsas + outras) }),
      ` (${partes.join(' · ')})`,
    );

    el.fixas.replaceChildren(...(fixas.length > 0
      ? fixas.map((e) => itemFixa(e, registro))
      : [criar('li', { classe: 'vazio secundario', texto: 'Nenhuma entrada fixa. Cadastre o salário em Configurar → Entradas fixas.' })]));
    el.avulsas.replaceChildren(...(avulsas.length > 0
      ? avulsas.map(itemAvulsa)
      : [criar('li', { classe: 'vazio secundario', texto: 'Nenhuma entrada avulsa neste mês.' })]));

    // Data: só dias deste mês, até hoje.
    const hoje = hojeLocal();
    el.data.min = `${mes}-01`;
    el.data.max = hoje;
    if (!el.data.value || mesDaData(el.data.value) !== mes || el.data.value > hoje) el.data.value = hoje;
  }

  el.form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    el.erro.textContent = '';
    try {
      const novos = adicionarEntradaAvulsa(obterDados(), {
        valorCentavos: lerValorPositivo(el.valor.value, 'valorCentavos'),
        data: el.data.value,
        descricao: el.descricao.value,
      });
      const texto = el.valor.value;
      el.valor.value = '';
      el.descricao.value = '';
      await mudar(novos, `Entrada de R$ ${texto} registrada.`);
    } catch (falha) {
      mostrarFalha(el.erro, falha);
    }
  });

  return {
    renderizar,
    focarNovaEntrada: () => {
      el.form.scrollIntoView({ block: 'center' });
      el.valor.focus();
    },
  };
}
