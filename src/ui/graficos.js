/**
 * Gráficos do app (11/2026), desenhados com HTML e CSS (sem biblioteca):
 * ficam nítidos em qualquer largura e funcionam sem internet.
 *
 * - colunas(): barras verticais com linha do zero (aceita valores negativos).
 *   Tocar, passar o mouse ou focar uma barra mostra o valor dela no topo
 *   (a barra marcada começa na indicada por "inicial"). "Ver em tabela"
 *   mostra todos os números.
 * - barrasHorizontais(): ranking (ex.: gastos por categoria), com nome e
 *   valor escritos em cada linha.
 *
 * Cores (validadas para claro e escuro, veja css/app.css): azul para os
 * dados; vermelho só para valores negativos, sempre com o texto "negativo".
 */

function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** Tabela com todos os números (acessível e boa para conferir). */
function tabela(cabecalhos, linhas) {
  const detalhes = criar('details', { classe: 'grafico-tabela' });
  detalhes.append(criar('summary', { texto: 'Ver em tabela' }));
  const t = criar('table', { classe: 'tabela-meses' });
  const thead = criar('thead');
  const tr = criar('tr');
  for (const c of cabecalhos) tr.append(criar('th', { texto: c, scope: 'col' }));
  thead.append(tr);
  const tbody = criar('tbody');
  for (const linha of linhas) {
    const l = criar('tr');
    for (const celula of linha) l.append(criar('td', { texto: celula }));
    tbody.append(l);
  }
  t.append(thead, tbody);
  detalhes.append(t);
  return detalhes;
}

/**
 * Barras verticais.
 *
 * @param {object} opcoes
 * @param {{ rotulo: string, rotuloLongo: string, valor: number, parcial?: boolean }[]} opcoes.dados
 * @param {(valor: number) => string} opcoes.formatar
 * @param {string} opcoes.nome Descrição do gráfico para leitores de tela.
 * @param {number} [opcoes.inicial] Índice da barra marcada no começo (padrão: a última).
 * @param {string} [opcoes.colunaValor] Cabeçalho da coluna de valores na tabela.
 * @returns {HTMLElement}
 */
export function colunas({ dados, formatar, nome, inicial = dados.length - 1, colunaValor = 'Valor' }) {
  const caixa = criar('div', { classe: 'grafico' });
  const leitura = criar('p', { classe: 'grafico-leitura', 'aria-live': 'polite' });
  const area = criar('div', { classe: 'grafico-colunas', role: 'group', 'aria-label': nome });

  const maximo = Math.max(0, ...dados.map((d) => d.valor));
  const minimo = Math.min(0, ...dados.map((d) => d.valor));
  const faixa = maximo - minimo || 1;
  // Altura da linha do zero, em % de baixo para cima.
  const zero = (-minimo / faixa) * 100;
  area.style.setProperty('--zero', String(zero)); // número puro: o CSS calcula a altura da linha do zero

  const botoes = dados.map((d, i) => {
    const negativo = d.valor < 0;
    const texto = `${d.rotuloLongo}${d.parcial ? ' (até hoje)' : ''}: ${formatar(d.valor)}${negativo ? ' (negativo)' : ''}`;
    const coluna = criar('button', {
      type: 'button', classe: 'grafico-coluna', 'aria-label': texto, 'aria-pressed': 'false',
    });
    const trilho = criar('span', { classe: 'grafico-trilho', 'aria-hidden': 'true' });
    const barra = criar('span', { classe: `grafico-barra${negativo ? ' negativa' : ''}${d.parcial ? ' parcial' : ''}` });
    barra.style.height = `${Math.max((Math.abs(d.valor) / faixa) * 100, d.valor === 0 ? 0 : 1.5)}%`;
    if (negativo) barra.style.top = `${100 - zero}%`;
    else barra.style.bottom = `${zero}%`;
    trilho.append(barra);
    coluna.append(trilho, criar('span', { classe: 'grafico-rotulo', texto: d.rotulo, 'aria-hidden': 'true' }));

    const marcar = () => {
      for (const outro of area.querySelectorAll('.grafico-coluna')) outro.setAttribute('aria-pressed', 'false');
      coluna.setAttribute('aria-pressed', 'true');
      leitura.replaceChildren(
        criar('span', { classe: 'secundario', texto: `${d.rotuloLongo}${d.parcial ? ' (até hoje)' : ''}` }),
        criar('strong', { classe: `valor-sensivel${negativo ? ' negativo' : ''}`, texto: `${formatar(d.valor)}${negativo ? ' · negativo' : ''}` }),
      );
    };
    coluna.addEventListener('click', marcar);
    coluna.addEventListener('mouseenter', marcar);
    coluna.addEventListener('focus', marcar);
    return { coluna, marcar };
  });

  for (const { coluna } of botoes) area.append(coluna);
  if (botoes.length > 0) botoes[Math.min(Math.max(inicial, 0), botoes.length - 1)].marcar();
  caixa.append(
    leitura,
    area,
    tabela(['Mês', colunaValor], dados.map((d) => [`${d.rotuloLongo}${d.parcial ? ' (até hoje)' : ''}`, formatar(d.valor)])),
  );
  return caixa;
}

/**
 * Barras horizontais em ranking.
 *
 * @param {object} opcoes
 * @param {{ nome: string, valor: number, detalhe: string }[]} opcoes.dados Do maior para o menor.
 * @param {(valor: number) => string} opcoes.formatar
 * @returns {HTMLElement}
 */
export function barrasHorizontais({ dados, formatar }) {
  const lista = criar('ul', { classe: 'grafico-ranking' });
  const maximo = Math.max(...dados.map((d) => d.valor), 1);
  for (const d of dados) {
    const li = criar('li');
    const linha = criar('div', { classe: 'grafico-ranking-linha' });
    linha.append(
      criar('span', { texto: d.nome }),
      criar('span', { classe: 'secundario valor-sensivel', texto: `${formatar(d.valor)} · ${d.detalhe}` }),
    );
    const trilho = criar('div', { classe: 'grafico-ranking-trilho', 'aria-hidden': 'true' });
    const barra = criar('div', { classe: 'grafico-ranking-barra' });
    barra.style.width = `${Math.max((d.valor / maximo) * 100, 1.5)}%`;
    trilho.append(barra);
    li.append(linha, trilho);
    lista.append(li);
  }
  return lista;
}
