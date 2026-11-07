/**
 * Vista "Início" (novo layout, 11/2026).
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA: o que mostrar e em que
 * ordem vem de resumoDoInicio (src/resumo-inicio.js, testado no Node).
 */

import { hojeLocal, tituloDoMes } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { resumoDoInicio } from '../resumo-inicio.js';

function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** "2026-11-10" → "10/11". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {() => boolean} [opcoes.backupAtrasado]
 * @returns {{ renderizar: () => void }}
 */
export function iniciarInicio({ obterDados, backupAtrasado = () => false }) {
  const el = {
    mes: elemento('inicio-mes'),
    dia: elemento('inicio-dia'),
    destaque: elemento('inicio-destaque'),
    sobra: elemento('inicio-sobra'),
    situacao: elemento('inicio-situacao'),
    naConta: elemento('inicio-na-conta'),
    aviso: elemento('inicio-aviso'),
    avisoTexto: elemento('inicio-aviso-texto'),
    avisoLink: elemento('inicio-aviso-link'),
    avisoProximo: elemento('inicio-aviso-proximo'),
    saidas: elemento('inicio-saidas'),
    categorias: elemento('inicio-categorias'),
  };

  /** Avisos da última renderização e qual está na tela. */
  let avisos = [];
  let indiceAviso = 0;

  function mostrarAviso() {
    el.aviso.hidden = avisos.length === 0;
    if (avisos.length === 0) return;
    const aviso = avisos[indiceAviso % avisos.length];
    el.aviso.dataset.cor = aviso.cor;
    el.avisoTexto.textContent = aviso.texto;
    el.avisoLink.textContent = aviso.rotulo;
    el.avisoLink.href = aviso.link;
    el.avisoProximo.hidden = avisos.length < 2;
    el.avisoProximo.textContent = `Próximo (${(indiceAviso % avisos.length) + 1} de ${avisos.length})`;
  }
  el.avisoProximo.addEventListener('click', () => {
    indiceAviso += 1;
    mostrarAviso();
  });

  function linhaVazia(texto) {
    return criar('li', { classe: 'vazio', texto });
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const hoje = hojeLocal();
    const r = resumoDoInicio(dados, hoje, { backupAtrasado: backupAtrasado() });

    el.mes.textContent = tituloDoMes(r.mes).replace(/ de \d{4}$/, '');
    el.dia.textContent = `Dia ${r.dia} de ${r.diasNoMes} · ${Math.round(r.fracaoDoMes * 100)}% do mês`;

    el.destaque.dataset.cor = r.cor;
    el.sobra.textContent = formatarCentavos(r.deveSobrarCentavos);
    el.situacao.textContent = r.situacao;
    el.naConta.textContent = formatarCentavos(r.naContaAgoraCentavos);

    // Avisos novos: volta para o primeiro (o mais importante).
    const chave = r.avisos.map((a) => a.id).join();
    if (chave !== avisos.map((a) => a.id).join()) indiceAviso = 0;
    avisos = r.avisos;
    mostrarAviso();

    el.saidas.replaceChildren(...(r.proximas.length === 0
      ? [linhaVazia('Nada previsto para sair este mês.')]
      : r.proximas.map((s) => {
        const li = criar('li');
        const nome = criar('span', { classe: 'nome', texto: s.nome });
        if (s.atrasada) nome.append(criar('span', { classe: 'etiqueta-atrasada', texto: 'atrasada' }));
        li.append(
          criar('span', { classe: 'data', texto: dataCurta(s.data) }),
          nome,
          criar('span', { classe: 'valor valor-sensivel', texto: formatarCentavos(s.valorCentavos) }),
        );
        return li;
      })));

    el.categorias.replaceChildren(...(r.categorias.length === 0
      ? [linhaVazia('Nenhuma categoria com orçamento.')]
      : r.categorias.map((c) => {
        const li = criar('li', { classe: 'categoria-inicio', 'data-cor': c.cor });
        const linha = criar('div', { classe: 'linha' });
        linha.append(
          criar('span', { texto: c.nome }),
          criar('span', { classe: 'valor-sensivel', texto: `${formatarCentavos(c.gastoCentavos)} de ${formatarCentavos(c.orcamentoCentavos)}` }),
        );
        const barra = criar('div', {
          classe: 'barra', role: 'img', 'aria-label': `${c.nome}: ${Math.round(c.fracaoUsada * 100)}% do orçamento usado`,
        });
        const uso = criar('div', { classe: 'barra-uso' });
        uso.style.width = `${Math.min(100, Math.round(c.fracaoUsada * 100))}%`;
        barra.append(uso);
        li.append(linha, barra);
        return li;
      })));
  }

  return { renderizar };
}
