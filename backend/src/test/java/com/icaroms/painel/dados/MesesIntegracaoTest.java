package com.icaroms.painel.dados;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.DocumentContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Regras próprias dos meses. */
class MesesIntegracaoTest extends TesteDeDados {

    private static String mes(String id, String mes, String status) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "mes": "%s", "saldoInicialCentavos": -15000, "rendaPrevistaCentavos": 450000,
                 "saldoConfirmado": false,
                 "ajustesFixos": {"fixo-dentista": 25000},
                 "statusFixos": {"fixo-dentista": "%s"},
                 "statusFaturas": {"Nubank": "pago"}}
                """.formatted(id, T1, T1, mes, status);
    }

    @Test
    @DisplayName("Mês volta igual: saldo negativo, ajustes, situações e statusFaturas (extra)")
    void mesVoltaIgual() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, "/api/meses/" + id, mes(id, "2026-10", "pago"));

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.saldoInicialCentavos", Long.class)).isEqualTo(-15000L);
        assertThat(resposta.read("$.saldoConfirmado", Boolean.class)).isFalse();
        assertThat(resposta.read("$.ajustesFixos['fixo-dentista']", Long.class)).isEqualTo(25000L);
        assertThat(resposta.read("$.statusFixos['fixo-dentista']", String.class)).isEqualTo("pago");
        assertThat(resposta.read("$.statusFaturas.Nubank", String.class)).isEqualTo("pago");
    }

    @Test
    @DisplayName("Mesmo mês com outro id (dois aparelhos): 409 com o mês que já está no servidor")
    void mesRepetidoDaConflito() throws Exception {
        String conta = novaConta();
        String primeiro = novoId();
        gravar(conta, "/api/meses/" + primeiro, mes(primeiro, "2026-11", "previsto"));
        String segundo = novoId();

        MvcResult resultado = gravar(conta, "/api/meses/" + segundo, mes(segundo, "2026-11", "previsto"));

        assertThat(status(resultado)).isEqualTo(409);
        assertThat(corpo(resultado).read("$.atual.id", String.class)).isEqualTo(primeiro);
    }

    @Test
    @DisplayName("O mesmo mês em contas diferentes é permitido")
    void mesmoMesEmOutraConta() throws Exception {
        String id1 = novoId();
        String id2 = novoId();

        assertThat(status(gravar(novaConta(), "/api/meses/" + id1, mes(id1, "2026-12", "previsto")))).isEqualTo(201);
        assertThat(status(gravar(novaConta(), "/api/meses/" + id2, mes(id2, "2026-12", "previsto")))).isEqualTo(201);
    }

    @Test
    @DisplayName("Situação de conta fixa desconhecida: 400")
    void situacaoInvalida() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, "/api/meses/" + id, mes(id, "2026-10", "talvez"));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.statusFixos", String.class)).contains("previsto, pago ou dispensado");
    }
}
