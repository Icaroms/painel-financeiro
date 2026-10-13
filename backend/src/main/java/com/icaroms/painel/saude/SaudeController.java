package com.icaroms.painel.saude;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Saúde da API: rota pública usada pelo app (para saber se o servidor está
 * no ar) e pela hospedagem (para reiniciar a API se ela travar).
 *
 * <p>Responde 200 quando o banco responde e 503 quando não. Não mostra nada
 * além disso (nem endereço do banco, nem mensagens de erro).
 */
@RestController
@Tag(name = "Saúde")
public class SaudeController {

    private final JdbcTemplate banco;
    private final Clock relogio;
    private final String versao;

    public SaudeController(JdbcTemplate banco, Clock relogio, @Value("${painel.versao}") String versao) {
        this.banco = banco;
        this.relogio = relogio;
        this.versao = versao;
    }

    @GetMapping("/api/saude")
    @SecurityRequirements
    @Operation(summary = "A API e o banco estão no ar?")
    public ResponseEntity<SaudeResponse> saude() {
        boolean bancoOk = bancoResponde();
        SaudeResponse corpo = new SaudeResponse(bancoOk ? "ok" : "banco-indisponivel", bancoOk, versao,
                relogio.instant());
        return ResponseEntity.status(bancoOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(corpo);
    }

    private boolean bancoResponde() {
        try {
            Integer um = banco.queryForObject("SELECT 1", Integer.class);
            return um != null && um == 1;
        } catch (DataAccessException erro) {
            return false;
        }
    }
}
