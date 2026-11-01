package com.icaroms.painel.backup;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Um backup na lista (sem o conteúdo).
 *
 * @param id           id do backup
 * @param criadoEm     quando chegou ao servidor
 * @param salvoEm      "salvoEm" de dentro do pacote (quando o app o montou)
 * @param versao       versão do formato do pacote
 * @param tamanhoBytes tamanho do pacote como foi enviado
 * @param resumo       quantos registros de cada lista (sem os excluídos)
 */
public record BackupResumo(UUID id, Instant criadoEm, Instant salvoEm, int versao, int tamanhoBytes,
        Map<String, Integer> resumo) {
}
