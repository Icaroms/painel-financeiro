package com.icaroms.painel.saude;

import java.time.Instant;

/**
 * Resposta do GET /api/saude.
 *
 * @param status  "ok" ou "banco-indisponivel"
 * @param banco   true se o PostgreSQL respondeu
 * @param versao  versão da API (a do pom.xml)
 * @param horario hora do servidor (UTC)
 */
public record SaudeResponse(String status, boolean banco, String versao, Instant horario) {
}
