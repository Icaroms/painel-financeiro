/**
 * Seção "Simulador de investimentos" da aba Investir (Fase 04, parte 4.5).
 *
 * - Valor inicial, valor mensal (já vem com a parte Investir da sobra deste
 *   mês), prazo em meses e a % do CDI do CDB e da LCI/LCA.
 * - Resultado: uma linha por opção (poupança, CDB, LCI/LCA e os títulos do
 *   Tesouro de hoje), da que termina com mais dinheiro líquido para a com
 *   menos: líquido, aportado, bruto, IR e o valor em reais de hoje.
 * - As taxas vêm do radar guardado no aparelho: com radar novo, a simulação
 *   é refeita sozinha.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA; as regras ficam em
 * src/simulador-investimentos.js (testado no Node). Todo texto entra com textContent.
 */

import { hojeLocal } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import { textoDoPercentual } from '../carteira.js';
import { lerPercentual } from '../renda-fixa.js';
import { PADROES, simularInvestimentos } from '../simulador-investimentos.js';

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

/** "2026-10-08" → "08/10/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/** "13.65" → "13,65%". */
const porcento = (n) => `${n.toFixed(2).replace('.', ',')}%`;

/**
 * Liga o simulador.
 *
 * @param {object} opcoes
 * @param {() => object|null} opcoes.obterRadar Radar guardado no aparelho (ou null).
 * @param {() => number} opcoes.obterInvestirCentavos Parte "Investir" da sobra deste mês.
 * @returns {{ renderizar: () => void }}
 */
export function iniciarSimuladorInvestimentos({ obterRadar, obterInvestirCentavos }) {
  const el = {
    form: elemento('form-sim-investimento'),
    inicial: elemento('sim-inv-inicial'),
    mensal: elemento('sim-inv-mensal'),
    meses: elemento('sim-inv-meses'),
    cdb: elemento('sim-inv-cdb'),
    lci: elemento('sim-inv-lci'),
    dica: elemento('sim-inv-dica'),
    erro: elemento('sim-inv-erro'),
    fonte: elemento('sim-inv-fonte'),
    resultado: elemento('sim-inv-resultado'),
  };

  let preenchido = false;

  /** Na primeira vez: valores padrão e o mensal vindo do destino da sobra. */
  function preencher() {
    if (preenchido) return;
    preenchido = true;
    el.meses.value = String(PADROES.meses);
    el.cdb.value = String(PADROES.cdiCdb);
    el.lci.value = String(PADROES.cdiLci);
    const investir = obterInvestirCentavos();
    if (investir > 0) {
      el.mensal.value = textoDoValor(investir);
      el.dica.textContent = 'O valor mensal veio da parte "Investir" da sobra deste mês (aba Mês). Mude à vontade.';
    } else {
      el.dica.textContent = 'Dica: a parte "Investir" da sobra do mês (aba Mês) é um bom ponto de partida para o valor mensal.';
    }
  }

  /** Lê o formulário. Campo inválido vira NaN: a regra explica o erro. */
  function lerPedido() {
    const meses = /^\d+$/.test(el.meses.value.trim()) ? Number(el.meses.value.trim()) : NaN;
    return {
      inicialCentavos: lerValorPositivo(el.inicial.value, 'inicial'),
      mensalCentavos: lerValorPositivo(el.mensal.value, 'mensal'),
      meses,
      cdiCdb: lerPercentual(el.cdb.value) ?? NaN,
      cdiLci: lerPercentual(el.lci.value) ?? NaN,
    };
  }

  /** Linha de uma opção. */
  function linha(r) {
    const li = criar('li', { classe: 'linha-mes sim-inv-linha' });
    const info = criar('div', { classe: 'linha-mes-info' });
    const real = textoDoPercentual(r.ganhoRealPercentual);
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: r.nome }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: r.taxa }),
      criar('span', {
        classe: 'linha-mes-detalhe secundario',
        texto: `Aportado ${formatarCentavos(r.aportadoCentavos)} · bruto ${formatarCentavos(r.brutoCentavos)} · ` +
          `${r.isento ? 'sem IR' : `IR ${formatarCentavos(r.irCentavos)}`}`,
      }),
      criar('span', {
        classe: 'linha-mes-detalhe secundario',
        texto: `Em reais de hoje: ${formatarCentavos(r.realCentavos)}${real ? ` (ganho real ${real})` : ''}`,
      }),
    );
    if (r.nota) info.append(criar('span', { classe: 'linha-mes-detalhe secundario sim-inv-nota', texto: r.nota }));
    const lado = criar('div', { classe: 'linha-mes-lado' });
    lado.append(
      criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(r.liquidoCentavos) }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: 'líquido' }),
    );
    li.append(info, lado);
    return li;
  }

  /** Simula com o que está no formulário e desenha o resultado (ou o erro). */
  function simular() {
    el.erro.textContent = '';
    try {
      const s = simularInvestimentos(obterRadar(), lerPedido(), hojeLocal());
      el.fonte.textContent =
        `Taxas de hoje: CDI ${porcento(s.cdi.anual)} ao ano (${dataLonga(s.cdi.data)}) · IPCA de 12 meses ${porcento(s.ipca12)}` +
        `${s.dataDoTesouro ? ` · Tesouro de ${dataLonga(s.dataDoTesouro)}` : ''}. Ordem: do maior valor líquido para o menor.`;
      el.resultado.replaceChildren(...s.resultados.map(linha));
    } catch (erro) {
      if (!(erro instanceof ErroValidacao)) throw erro;
      el.erro.textContent = erro.message;
      el.fonte.textContent = '';
      el.resultado.replaceChildren();
    }
  }

  el.form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    simular();
  });

  /** Mostra o simulador (chamado ao abrir a aba e quando chega radar novo). */
  function renderizar() {
    preencher();
    simular();
  }

  return { renderizar };
}
