/**
 * Entrega de arquivos para a pessoa (usado pelo backup).
 *
 * Dois caminhos, conforme o aparelho:
 * - Celular ou tablet: abre o menu de compartilhar do sistema. No iPhone,
 *   ele permite "Salvar em Arquivos", mandar para o iCloud Drive, e-mail etc.
 * - Computador: baixa o arquivo para a pasta de downloads.
 *
 * Só funciona no navegador (usa document e navigator).
 */

/**
 * Entrega um arquivo de texto.
 *
 * @param {string} nome  Nome do arquivo (ex.: "backup-painel-financeiro-2026-11-03.json").
 * @param {string} texto Conteúdo.
 * @returns {Promise<'compartilhado'|'baixado'|'cancelado'>}
 */
export async function entregarArquivo(nome, texto) {
  const arquivo = new File([texto], nome, { type: 'application/json' });

  // "pointer: coarse" = tela de toque como forma principal de uso (celular, tablet).
  const ehToque = window.matchMedia('(pointer: coarse)').matches;

  if (ehToque && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return 'compartilhado';
    } catch (erro) {
      // AbortError = a pessoa fechou o menu sem escolher nada.
      if (erro.name === 'AbortError') return 'cancelado';
      // Qualquer outro erro: tenta o download comum, logo abaixo.
    }
  }

  // Download comum: cria um link temporário apontando para o arquivo e "clica" nele.
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Libera a memória do arquivo depois que o navegador começou o download.
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);

  return 'baixado';
}
