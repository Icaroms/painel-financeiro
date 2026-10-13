package com.icaroms.painel.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icaroms.painel.suporte.TesteIntegracao;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** A documentação OpenAPI sobe quando ligada (no perfil de teste, ligada). */
class DocumentacaoIntegracaoTest extends TesteIntegracao {

    @Test
    void documentacaoListaAsRotas() throws Exception {
        MvcResult resultado = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(corpo(resultado).read("$.info.title", String.class)).isEqualTo("Painel Financeiro API");
        assertThat(corpo(resultado).read("$.paths", java.util.Map.class)).containsKeys("/api/saude", "/api/auth/login", "/api/auth/eu");
    }
}
