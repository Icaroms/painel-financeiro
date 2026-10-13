package com.icaroms.painel.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icaroms.painel.suporte.TesteIntegracao;
import org.junit.jupiter.api.Test;

/** Só o app (origens configuradas) pode chamar a API pelo navegador. */
class CorsIntegracaoTest extends TesteIntegracao {

    @Test
    void origemDoAppEhAceita() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "http://localhost:8080")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8080"));
    }

    @Test
    void outraOrigemEhRecusada() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://site-estranho.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
