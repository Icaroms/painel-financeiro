package com.icaroms.painel.dados.configuracao;

import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.Gravacao;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rotas /api/configuracao (um documento por conta).
 *
 * <ul>
 *   <li>GET: a configuração guardada (404 se ainda não houver);</li>
 *   <li>PUT: cria (201) ou substitui (200); 409 se o servidor tem versão mais nova.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/configuracao")
@Tag(name = "Configuração")
public class ConfiguracaoController {

    private final ConfiguracaoService servico;

    public ConfiguracaoController(ConfiguracaoService servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Buscar a configuração")
    public ConfiguracaoDto buscar(@AuthenticationPrincipal Jwt token) {
        return servico.buscar(Formatos.usuarioDo(token));
    }

    @PutMapping
    @Operation(summary = "Gravar a configuração", description = "Vale o atualizadoEm mais recente (senão, 409).")
    public ResponseEntity<ConfiguracaoDto> gravar(@AuthenticationPrincipal Jwt token,
            @Valid @RequestBody ConfiguracaoDto corpo) {
        Gravacao<ConfiguracaoDto> gravacao = servico.gravar(Formatos.usuarioDo(token), corpo);
        return ResponseEntity.status(gravacao.criado() ? HttpStatus.CREATED : HttpStatus.OK).body(gravacao.registro());
    }
}
