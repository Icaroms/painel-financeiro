package com.icaroms.painel.auth;

import java.time.Instant;

/**
 * Resposta do GET /api/auth/eu: quem está logado e até quando.
 *
 * @param id             id da conta (UUID)
 * @param email          e-mail da conta
 * @param sessaoExpiraEm quando o token atual expira
 */
public record ContaResponse(String id, String email, Instant sessaoExpiraEm) {
}
