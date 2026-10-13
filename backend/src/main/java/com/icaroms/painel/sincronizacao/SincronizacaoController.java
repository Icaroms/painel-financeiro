package com.icaroms.painel.sincronizacao;

import com.icaroms.painel.dados.comum.Formatos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** POST /api/sync: envia o que mudou no aparelho e recebe o que mudou no servidor. */
@RestController
@RequestMapping("/api/sync")
@Tag(name = "Sincronização")
public class SincronizacaoController {

    private final SincronizacaoService sincronizacao;

    public SincronizacaoController(SincronizacaoService sincronizacao) {
        this.sincronizacao = sincronizacao;
    }

    @PostMapping
    @Operation(summary = "Sincronizar",
            description = "Grava os registros enviados (vale o atualizadoEm mais recente) e devolve o que mudou desde \"desde\".")
    public RespostaSincronizacao sincronizar(@AuthenticationPrincipal Jwt token,
            @RequestBody PedidoSincronizacao pedido) {
        return sincronizacao.sincronizar(Formatos.usuarioDo(token), pedido);
    }
}
