package com.icaroms.painel.auth;

import java.time.Instant;

/**
 * Resposta do login e da renovação.
 *
 * @param token              JWT para mandar no cabeçalho {@code Authorization: Bearer <token>}
 * @param tipo               sempre "Bearer"
 * @param expiraEm           quando o token de acesso deixa de valer (curto, ex.: 15 min)
 * @param tokenRenovacao     troca por um token de acesso novo em POST /api/auth/renovar
 * @param renovacaoExpiraEm  quando o token de renovação deixa de valer (ex.: 30 dias)
 */
public record TokenResponse(String token, String tipo, Instant expiraEm, String tokenRenovacao,
        Instant renovacaoExpiraEm) {

    public static TokenResponse bearer(TokenService.TokenDeAcesso acesso, SessaoService.TokenDeRenovacao renovacao) {
        return new TokenResponse(acesso.token(), "Bearer", acesso.expiraEm(), renovacao.valor(), renovacao.expiraEm());
    }

    /** Esconde os tokens caso o objeto apareça em algum log. */
    @Override
    public String toString() {
        return "TokenResponse[token=***, expiraEm=" + expiraEm + ", tokenRenovacao=***]";
    }
}
