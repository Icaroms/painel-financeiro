package com.icaroms.painel.sincronizacao;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Corpo do POST /api/sync.
 *
 * <pre>
 * { "desde": "2026-10-13T12:00:00.123456Z",          ← cursor da última sincronização (null na primeira)
 *   "listas": { "categorias": [ {...}, ... ],         ← registros alterados no aparelho
 *               "lancamentos": [ ... ] },
 *   "configuracao": { "formasPagamento": [...], ... } ← null se não mudou
 *   "zeradosEm": "2026-10-14T10:00:00Z"              ← última vez que o aparelho soube que a conta foi zerada
 * }
 * </pre>
 *
 * @param desde        o "cursor" devolvido pela sincronização anterior
 * @param listas       por nome da lista, os registros a gravar (no mesmo JSON do app)
 * @param configuracao a configuração a gravar, ou null
 * @param zeradosEm    o "zeradosEm" que o aparelho já conhece (null se nunca soube de nenhum)
 */
public record PedidoSincronizacao(
        Instant desde,
        Map<String, List<Map<String, Object>>> listas,
        Map<String, Object> configuracao,
        Instant zeradosEm) {
}
