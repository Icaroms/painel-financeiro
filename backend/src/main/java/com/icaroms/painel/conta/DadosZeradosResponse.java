package com.icaroms.painel.conta;

import java.time.Instant;

/**
 * Resposta do DELETE /api/conta/dados.
 *
 * @param zeradosEm quando os dados foram apagados; o app guarda e manda na
 *                  sincronização, para o servidor saber que ele já sabe disso
 */
public record DadosZeradosResponse(Instant zeradosEm) {
}
