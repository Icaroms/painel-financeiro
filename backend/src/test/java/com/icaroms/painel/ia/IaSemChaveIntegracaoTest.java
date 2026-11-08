package com.icaroms.painel.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.icaroms.painel.dados.TesteDeDados;
import com.jayway.jsonpath.DocumentContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** Sem PAINEL_GEMINI_CHAVE (o padrão): a IA do servidor fica desligada, sem erro na subida. */
class IaSemChaveIntegracaoTest extends TesteDeDados {

    @Test
    @DisplayName("Situação: disponível = false, uso zero")
    void situacao() throws Exception {
        DocumentContext situacao = corpo(ler(novaConta(), "/api/ia"));

        assertThat(situacao.read("$.disponivel", Boolean.class)).isFalse();
        assertThat(situacao.read("$.usadosHoje", Integer.class)).isZero();
        assertThat(situacao.read("$.limiteDiario", Integer.class)).isEqualTo(50);
    }

    @Test
    @DisplayName("Gerar: 503 explicando que a chave pode ficar no aparelho")
    void gerarSemChave() throws Exception {
        MvcResult resultado = mvc.perform(post("/api/ia/gerar").header(HttpHeaders.AUTHORIZATION, novaConta())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"instrucoes\": \"x\", \"conteudo\": \"y\"}")).andReturn();

        assertThat(status(resultado)).isEqualTo(503);
        assertThat(corpo(resultado).read("$.detail", String.class)).contains("Ajustes → IA");
    }
}
