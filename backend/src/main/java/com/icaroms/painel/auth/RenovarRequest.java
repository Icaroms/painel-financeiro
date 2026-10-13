package com.icaroms.painel.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Corpo do POST /api/auth/renovar e /api/auth/sair.
 *
 * @param tokenRenovacao o token de renovação recebido no login (ou na última renovação)
 */
public record RenovarRequest(
        @NotBlank(message = "Informe o token de renovação.")
        @Size(max = 200, message = "Token de renovação inválido.")
        String tokenRenovacao) {

    @Override
    public String toString() {
        return "RenovarRequest[tokenRenovacao=***]";
    }
}
