/**
 * Telas do destino da sobra (Fase 04, parte 4.1):
 * - na aba Mês: quanto da sobra vai para cada destino e o progresso da reserva;
 * - em Configurar: as porcentagens, a meta da reserva, a reserva atual e o
 *   custo do mês (a base da meta).
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. As contas ficam em
 * src/destino.js (testado no Node).
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import {
  configuracaoDoDestino, salvarDestino, custoDoMes, dividirSobra,
} from '../destino.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe e texto opcionais. */
function criar(tag, { classe, texto } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  return novo;
}

/** Linha "nome · valor" no estilo do extrato da aba Mês. */
function linhaDoExtrato(nome, detalhe, valor) {
  const linha = criar('div', { classe: 'conta-linha' });
  const termo = criar('dt', { texto: `${nome} ` });
  termo.append(criar('span', { classe: 'secundario', texto: detalhe }));
  linha.append(termo, criar('dd', { texto: valor }));
  return linha;
}

/**
 * Seção "Destino da sobra" da aba Mês.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ renderizar: () => void }}
 */
export function iniciarDestinoMes({ obterDados }) {
  const el = {
    resumo: elemento('destino-mes-resumo'),
    lista: elemento('destino-mes-lista'),
    reserva: elemento('destino-mes-reserva'),
    regua: elemento('destino-mes-regua'),
    nota: elemento('destino-mes-nota'),
  };

  function renderizar() {
    const hoje = hojeLocal();
    const d = dividirSobra(obterDados(), mesDaData(hoje), hoje);
    const { porcentagens, reserva } = d;

    if (d.aDividirCentavos === 0) {
      el.resumo.textContent = `Este mês deve sobrar ${formatarCentavos(d.sobraCentavos)}: ` +
        `não há sobra acima da folga de ${formatarCentavos(d.folgaCentavos)} para dividir.`;
      el.lista.replaceChildren();
    } else {
      el.resumo.replaceChildren(
        `Sobra prevista acima da folga de ${formatarCentavos(d.folgaCentavos)}: `,
        criar('strong', { texto: formatarCentavos(d.aDividirCentavos) }),
      );
      // O texto de cada linha acompanha a regra "reserva primeiro":
      // - reserva completa: a parte dela vai inteira para Investir;
      // - reserva quase completa: ela recebe só o que falta, e o resto vai para Investir.
      let detalheReserva = `${porcentagens.reserva}%`;
      let detalheInvestir = `${porcentagens.investir}%`;
      if (reserva.completa) {
        detalheReserva = 'meta atingida';
        detalheInvestir = `${porcentagens.reserva + porcentagens.investir}%`;
      } else if (d.paraInvestirDaReservaCentavos > 0) {
        detalheReserva = 'só o que falta para a meta';
        detalheInvestir = `${porcentagens.investir}% + o que passou da meta`;
      }
      el.lista.replaceChildren(
        linhaDoExtrato('Reserva de emergência', detalheReserva, formatarCentavos(d.reservaCentavos)),
        linhaDoExtrato('Investir', detalheInvestir, formatarCentavos(d.investirCentavos)),
        linhaDoExtrato('Alívio do mês seguinte', `${porcentagens.alivio}%`, formatarCentavos(d.alivioCentavos)),
      );
    }

    // Progresso da reserva.
    el.reserva.textContent = reserva.metaCentavos === 0
      ? 'Reserva: cadastre contas fixas ou orçamentos para o app calcular a meta.'
      : `Reserva: ${formatarCentavos(reserva.reservaAtualCentavos)} de ${formatarCentavos(reserva.metaCentavos)} ` +
        `(${Math.floor(reserva.fracao * 100)}%) · meta de ${reserva.metaMeses} meses de custo.`;
    el.regua.style.width = `${Math.round(reserva.fracao * 100)}%`;

    // Explicação do que aconteceu com a parte da reserva.
    let nota = 'Sugestão do app com as porcentagens de Configurar: nada é movido sozinho. ' +
      'Quando guardar dinheiro na reserva, atualize a "Reserva atual" em Configurar.';
    if (reserva.completa && reserva.metaCentavos > 0) {
      nota = `Reserva completa: a parte dela vai para Investir. ${nota}`;
    } else if (d.paraInvestirDaReservaCentavos > 0) {
      nota = `Faltam só ${formatarCentavos(reserva.faltaCentavos)} para a meta da reserva; ` +
        `os outros ${formatarCentavos(d.paraInvestirDaReservaCentavos)} vão para Investir. ${nota}`;
    }
    el.nota.textContent = nota;
  }

  return { renderizar };
}

/**
 * Seção "Destino da sobra" de Configurar.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarDestinoConfig({ obterDados, aplicarMudanca }) {
  const el = {
    form: elemento('form-destino'),
    reserva: elemento('destino-reserva'),
    investir: elemento('destino-investir'),
    alivio: elemento('destino-alivio'),
    soma: elemento('destino-soma'),
    meta: elemento('destino-meta'),
    reservaAtual: elemento('destino-reserva-atual'),
    custo: elemento('destino-custo'),
    erro: elemento('destino-erro'),
  };

  /** Número inteiro digitado, ou NaN (a validação de src/destino.js explica o erro). */
  const inteiro = (input) => (/^\d{1,3}$/.test(input.value.trim()) ? Number(input.value.trim()) : NaN);

  /** Soma ao vivo das porcentagens. */
  function atualizarSoma() {
    const soma = inteiro(el.reserva) + inteiro(el.investir) + inteiro(el.alivio);
    el.soma.textContent = Number.isNaN(soma) ? 'Use números inteiros de 0 a 100.' : `Soma: ${soma}%${soma === 100 ? '' : ' (precisa dar 100%)'}`;
  }

  /** Custo do mês e meta da reserva, com a meta digitada (ao vivo). */
  function atualizarCusto() {
    const custo = custoDoMes(obterDados(), mesDaData(hojeLocal()));
    const meses = inteiro(el.meta);
    const meta = Number.isNaN(meses) ? '—' : formatarCentavos(custo.totalCentavos * meses);
    el.custo.replaceChildren(
      'Custo do mês: ', criar('strong', { texto: formatarCentavos(custo.totalCentavos) }),
      ` (contas fixas ${formatarCentavos(custo.contasFixasCentavos)} + orçamentos ${formatarCentavos(custo.orcamentosCentavos)}). ` +
        `Meta da reserva: ${meta}.`,
    );
  }

  el.form.addEventListener('input', () => {
    atualizarSoma();
    atualizarCusto();
  });

  el.form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    el.erro.textContent = '';
    try {
      const novos = salvarDestino(obterDados(), {
        porcentagens: { reserva: inteiro(el.reserva), investir: inteiro(el.investir), alivio: inteiro(el.alivio) },
        metaMeses: inteiro(el.meta),
        reservaAtualCentavos: el.reservaAtual.value.trim() === '' ? 0 : lerValorPositivo(el.reservaAtual.value, 'reservaAtualCentavos'),
      });
      await aplicarMudanca(novos, 'Destino da sobra salvo.');
      renderizar();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      el.erro.textContent = falha.message;
    }
  });

  /** Preenche o formulário com a configuração salva. */
  function renderizar() {
    const config = configuracaoDoDestino(obterDados());
    el.reserva.value = String(config.porcentagens.reserva);
    el.investir.value = String(config.porcentagens.investir);
    el.alivio.value = String(config.porcentagens.alivio);
    el.meta.value = String(config.metaMeses);
    el.reservaAtual.value = textoDoValor(config.reservaAtualCentavos);
    el.erro.textContent = '';
    atualizarSoma();
    atualizarCusto();
  }

  return { renderizar };
}
