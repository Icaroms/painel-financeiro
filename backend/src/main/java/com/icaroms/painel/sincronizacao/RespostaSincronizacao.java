package com.icaroms.painel.sincronizacao;

import com.icaroms.painel.dados.configuracao.ConfiguracaoDto;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Resposta do POST /api/sync.
 *
 * @param cursor            guardar e mandar como "desde" na próxima vez
 * @param resultados        por lista, o resultado de cada registro enviado
 * @param configuracao      resultado da configuração enviada (null se não foi enviada)
 * @param mudancas          por lista, os registros gravados no servidor a partir de "desde"
 *                          (todos, se "desde" veio vazio), inclusive os que este aparelho enviou
 * @param configuracaoAtual a configuração do servidor, se mudou a partir de "desde" (ou null)
 */
public record RespostaSincronizacao(
        Instant cursor,
        Map<String, List<ResultadoDoItem>> resultados,
        ResultadoDoItem configuracao,
        Map<String, List<?>> mudancas,
        ConfiguracaoDto configuracaoAtual) {
}
