package com.icaroms.painel.ia;

import com.icaroms.painel.dados.comum.Formatos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * IA pelo servidor (parte 5.5).
 *
 * <ul>
 *   <li>GET /api/ia: se a IA do servidor está ligada, os modelos e o uso do dia;</li>
 *   <li>POST /api/ia/gerar: { instrucoes, conteudo, modelo? } → { texto, usadosHoje, limiteDiario }
 *       (503 sem chave configurada; 429 no limite do dia; 502/504 se o Gemini falhar).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ia")
@Tag(name = "IA pelo servidor")
public class IaController {

    private final IaService servico;

    public IaController(IaService servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Situação da IA do servidor")
    public SituacaoIa situacao(@AuthenticationPrincipal Jwt token) {
        return servico.situacao(Formatos.usuarioDo(token));
    }

    @PostMapping("/gerar")
    @Operation(summary = "Pedir uma resposta à IA", description = "O mesmo pedido que o app faria ao Gemini com a chave do aparelho.")
    public RespostaIa gerar(@AuthenticationPrincipal Jwt token, @Valid @RequestBody PedidoIa pedido) {
        return servico.gerar(Formatos.usuarioDo(token), pedido);
    }
}
