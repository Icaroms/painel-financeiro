package com.icaroms.painel.saude;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icaroms.painel.suporte.TesteIntegracao;
import com.jayway.jsonpath.DocumentContext;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Rota pública de saúde e cabeçalhos de proteção. */
class SaudeIntegracaoTest extends TesteIntegracao {

    @Test
    void respondeOkComBancoNoAr() throws Exception {
        MvcResult resultado = mvc.perform(get("/api/saude"))
                .andExpect(status().isOk())
                .andReturn();

        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.status", String.class)).isEqualTo("ok");
        assertThat(resposta.read("$.banco", Boolean.class)).isTrue();
        assertThat(resposta.read("$.versao", String.class)).isEqualTo("0.5.0");
        assertThat(resposta.read("$.horario", String.class)).isNotBlank();
    }

    @Test
    void mandaOsCabecalhosDeProtecao() throws Exception {
        mvc.perform(get("/api/saude"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}
