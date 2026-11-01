package com.icaroms.painel.conta;

import com.icaroms.painel.dados.comum.Formatos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** DELETE /api/conta/dados: apaga os dados do app na conta (a conta e os backups continuam). */
@RestController
@RequestMapping("/api/conta")
@Tag(name = "Conta")
public class ContaController {

    private final ContaService servico;

    public ContaController(ContaService servico) {
        this.servico = servico;
    }

    @DeleteMapping("/dados")
    @Operation(summary = "Apagar os dados da conta",
            description = "Apaga registros e configuração. Os outros aparelhos recebem \"zerados\" na próxima sincronização.")
    public DadosZeradosResponse zerar(@AuthenticationPrincipal Jwt token) {
        return servico.zerarDados(Formatos.usuarioDo(token));
    }
}
