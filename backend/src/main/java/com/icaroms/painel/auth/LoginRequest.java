package com.icaroms.painel.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Corpo do POST /api/auth/login.
 *
 * @param email e-mail da conta (maiúsculas e espaços nas pontas são ignorados)
 * @param senha senha em texto; só é comparada com o hash, nunca gravada
 */
public record LoginRequest(
        @NotBlank(message = "Informe o e-mail.")
        @Email(message = "Informe um e-mail válido.")
        @Size(max = 254, message = "E-mail longo demais.")
        String email,

        @NotBlank(message = "Informe a senha.")
        @Size(max = 200, message = "Senha longa demais.")
        String senha) {

    /** Esconde a senha caso o pedido apareça em algum log. */
    @Override
    public String toString() {
        return "LoginRequest[email=" + email + ", senha=***]";
    }
}
