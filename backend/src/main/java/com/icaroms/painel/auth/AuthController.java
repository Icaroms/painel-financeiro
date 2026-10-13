package com.icaroms.painel.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
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
 *   <li>POST /api/auth/renovar: token de renovação → token novo (público).</li>
 *   <li>POST /api/auth/sair: encerra a sessão do aparelho (público, 204).</li>
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
    @Operation(summary = "Entrar", description = "Devolve o token de acesso (curto) e o de renovação. Após 5 erros em 15 minutos, bloqueia (429).")
    public TokenResponse entrar(@Valid @RequestBody LoginRequest pedido, HttpServletRequest requisicao) {
        return autenticacao.entrar(pedido, requisicao.getRemoteAddr());
    }

    @PostMapping("/renovar")
    @SecurityRequirements
    @Operation(summary = "Renovar", description = "Troca o token de renovação por um token de acesso novo. O token usado deixa de valer.")
    public TokenResponse renovar(@Valid @RequestBody RenovarRequest pedido) {
        return autenticacao.renovar(pedido.tokenRenovacao());
    }

    @PostMapping("/sair")
    @SecurityRequirements
    @Operation(summary = "Sair", description = "Encerra a sessão deste aparelho (o token de renovação deixa de valer).")
    public ResponseEntity<Void> sair(@Valid @RequestBody RenovarRequest pedido) {
        autenticacao.sair(pedido.tokenRenovacao());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/eu")
    @Operation(summary = "Conta logada", description = "Mostra a conta dona do token e quando ele expira.")
    public ContaResponse eu(@AuthenticationPrincipal Jwt token) {
        return new ContaResponse(token.getSubject(), token.getClaimAsString("email"), token.getExpiresAt());
    }
}
