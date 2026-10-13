package com.icaroms.painel.suporte;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Base dos testes de integração: a API inteira (segurança, banco, Flyway)
 * contra um PostgreSQL de verdade, embutido.
 *
 * <p>O banco sobe uma vez por execução dos testes (em uma porta livre e numa
 * pasta temporária) e é apagado no fim. Todas as classes que herdam desta
 * compartilham a mesma API em memória, então a subida acontece uma vez só.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class TesteIntegracao {

    private static final EmbeddedPostgres BANCO = iniciarBanco();

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @DynamicPropertySource
    static void apontarParaOBancoEmbutido(DynamicPropertyRegistry registro) {
        registro.add("spring.datasource.url", () -> BANCO.getJdbcUrl("postgres", "postgres"));
        registro.add("spring.datasource.username", () -> "postgres");
        registro.add("spring.datasource.password", () -> "");
    }

    /** Lê o corpo da resposta como UTF-8 (as mensagens têm acentos). */
    protected static DocumentContext corpo(MvcResult resultado) throws IOException {
        return JsonPath.parse(resultado.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static EmbeddedPostgres iniciarBanco() {
        try {
            EmbeddedPostgres banco = EmbeddedPostgres.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    banco.close();
                } catch (IOException ignorado) {
                    // Fim da execução: não há o que fazer.
                }
            }));
            return banco;
        } catch (IOException erro) {
            throw new UncheckedIOException("Não foi possível iniciar o PostgreSQL embutido dos testes.", erro);
        }
    }
}
