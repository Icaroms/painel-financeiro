package com.icaroms.painel.auth;

import java.time.Instant;

/**
 * Resposta do login.
 *
 * @param token    JWT para mandar no cabeçalho {@code Authorization: Bearer <token>}
 * @param tipo     sempre "Bearer"
 * @param expiraEm momento (UTC) em que o token deixa de valer
 */
public record TokenResponse(String token, String tipo, Instant expiraEm) {

    public static TokenResponse bearer(String token, Instant expiraEm) {
        return new TokenResponse(token, "Bearer", expiraEm);
    }
}
