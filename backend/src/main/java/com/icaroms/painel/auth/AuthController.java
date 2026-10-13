package com.icaroms.painel.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rotas de autenticação.
 *
 * <ul>
 *   <li>POST /api/auth/login: e-mail + senha → token (público).</li>
 *   <li>GET /api/auth/eu: quem está logado (exige token).</li>
 * </ul>
 * Não existe rota de cadastro: a conta é criada pela variável de ambiente
 * (ver CriadorUsuarioInicial).
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Autenticação", description = "Login e conta logada")
public class AuthController {

    private final AuthService autenticacao;

    public AuthController(AuthService autenticacao) {
        this.autenticacao = autenticacao;
    }

    @PostMapping("/login")
    @SecurityRequirements
    @Operation(summary = "Entrar", description = "Devolve um token JWT. Após 5 erros em 15 minutos, bloqueia (429).")
    public TokenResponse entrar(@Valid @RequestBody LoginRequest pedido, HttpServletRequest requisicao) {
        return autenticacao.entrar(pedido, requisicao.getRemoteAddr());
    }

    @GetMapping("/eu")
    @Operation(summary = "Conta logada", description = "Mostra a conta dona do token e quando ele expira.")
    public ContaResponse eu(@AuthenticationPrincipal Jwt token) {
        return new ContaResponse(token.getSubject(), token.getClaimAsString("email"), token.getExpiresAt());
    }
}
