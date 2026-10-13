package com.icaroms.painel.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Configurações próprias do app, lidas do bloco {@code painel:} do
 * application.yml (que, por sua vez, lê as variáveis de ambiente).
 *
 * <p>São validadas na subida: se faltar algo obrigatório (ex.: o segredo do
 * JWT), a API nem inicia e a mensagem diz o que falta.
 *
 * @param jwt            assinatura e validade dos tokens de login
 * @param cors           sites (origens) que podem chamar a API pelo navegador
 * @param login          limite de tentativas erradas de login
 * @param usuarioInicial conta criada na primeira subida, se o banco estiver vazio
 */
@Validated
@ConfigurationProperties(prefix = "painel")
public record PainelProperties(
        @Valid @NotNull Jwt jwt,
        @Valid @NotNull Cors cors,
        @Valid @NotNull Login login,
        UsuarioInicial usuarioInicial) {

    /**
     * @param segredo  chave do HS256 (variável PAINEL_JWT_SEGREDO, mínimo 32 caracteres)
     * @param validade  quanto tempo um token de acesso vale (ex.: 15m)
     * @param renovacao quanto tempo um token de renovação vale (ex.: 30d)
     * @param emissor   nome gravado no token e conferido na leitura
     */
    public record Jwt(
            @NotBlank(message = "Defina a variável PAINEL_JWT_SEGREDO.")
            @Size(min = 32, message = "PAINEL_JWT_SEGREDO precisa ter pelo menos 32 caracteres.")
            String segredo,
            @NotNull Duration validade,
            @NotNull Duration renovacao,
            @NotBlank String emissor) {
    }

    /** @param origens endereços exatos do app (ex.: http://localhost:8080) */
    public record Cors(@NotEmpty(message = "Defina PAINEL_CORS_ORIGENS.") List<String> origens) {
    }

    /**
     * @param maxTentativas falhas permitidas dentro da janela
     * @param janela        período em que as falhas são contadas (ex.: 15m)
     */
    public record Login(@Min(1) int maxTentativas, @NotNull Duration janela) {
    }

    /**
     * Cadastro fechado: não existe rota de cadastro. A única conta é criada
     * na primeira subida a partir destas variáveis (PAINEL_USUARIO_EMAIL e
     * PAINEL_USUARIO_SENHA). Depois disso, elas podem ser apagadas do host.
     */
    public record UsuarioInicial(String email, String senha) {

        /** Esconde a senha caso o objeto apareça em algum log. */
        @Override
        public String toString() {
            return "UsuarioInicial[email=" + email + ", senha=***]";
        }
    }
}
