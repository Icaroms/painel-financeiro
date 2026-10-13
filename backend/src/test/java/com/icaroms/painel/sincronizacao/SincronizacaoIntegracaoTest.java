package com.icaroms.painel.sincronizacao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.icaroms.painel.dados.TesteDeDados;
import com.jayway.jsonpath.DocumentContext;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** POST /api/sync: envio, recebimento, cursor e resultados por registro. */
class SincronizacaoIntegracaoTest extends TesteDeDados {

    private static String categoria(String id, String nome, String atualizadoEm) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "nome": "%s", "orcamentoCentavos": 10000}
                """.formatted(id, T1, atualizadoEm, nome);
    }

    private static String configuracao(String atualizadoEm) {
        return """
                {"formasPagamento": ["Pix", "Nubank"], "cartoes": [], "atualizadoEm": "%s"}
                """.formatted(atualizadoEm);
    }

    private MvcResult sincronizar(String conta, String json) throws Exception {
        return mvc.perform(post("/api/sync").header(HttpHeaders.AUTHORIZATION, conta)
                .contentType(MediaType.APPLICATION_JSON).content(json)).andReturn();
    }

    @Test
    @DisplayName("Primeira sincronização: grava o que o aparelho mandou e devolve tudo, com cursor")
    void primeiraSincronizacao() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String pedido = """
                {"desde": null, "listas": {"categorias": [%s]}, "configuracao": %s}
                """.formatted(categoria(id, "iFood", T1), configuracao(T1));

        MvcResult resultado = sincronizar(conta, pedido);

        assertThat(status(resultado)).isEqualTo(200);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.cursor", String.class)).isNotBlank();
        assertThat(resposta.read("$.resultados.categorias[0].situacao", String.class)).isEqualTo("gravado");
        assertThat(resposta.read("$.resultados.categorias[0].id", String.class)).isEqualTo(id);
        assertThat(resposta.read("$.configuracao.situacao", String.class)).isEqualTo("gravado");
        List<String> ids = resposta.read("$.mudancas.categorias[*].id");
        assertThat(ids).containsExactly(id);
        assertThat(resposta.read("$.mudancas.lancamentos.length()", Integer.class)).isZero();
        List<String> formas = resposta.read("$.configuracaoAtual.formasPagamento");
        assertThat(formas).containsExactly("Pix", "Nubank");
    }

    @Test
    @DisplayName("Com o cursor: só chega o que foi gravado depois dele (outro aparelho)")
    void cursorTrazSoAsMudancas() throws Exception {
        String conta = novaConta();
        String antiga = novoId();
        sincronizar(conta, """
                {"listas": {"categorias": [%s]}}
                """.formatted(categoria(antiga, "Antiga", T1)));
        String cursor = corpo(sincronizar(conta, "{}")).read("$.cursor", String.class);

        String nova = novoId();
        gravar(conta, "/api/categorias/" + nova, categoria(nova, "Do outro aparelho", T1));
        DocumentContext comMudanca = corpo(sincronizar(conta, """
                {"desde": "%s"}
                """.formatted(cursor)));

        List<String> ids = comMudanca.read("$.mudancas.categorias[*].id");
        assertThat(ids).containsExactly(nova);
        assertThat(comMudanca.read("$.configuracaoAtual", Object.class)).isNull();

        String cursorNovo = comMudanca.read("$.cursor", String.class);
        DocumentContext semMudanca = corpo(sincronizar(conta, """
                {"desde": "%s"}
                """.formatted(cursorNovo)));
        assertThat(semMudanca.read("$.mudancas.categorias.length()", Integer.class)).isZero();
    }

    @Test
    @DisplayName("Conflito e registro inválido não impedem os outros de serem gravados")
    void resultadosPorRegistro() throws Exception {
        String conta = novaConta();
        String existente = novoId();
        gravar(conta, "/api/categorias/" + existente, categoria(existente, "Versão do servidor", T2));
        String invalida = novoId();
        String boa = novoId();
        String pedido = """
                {"listas": {"categorias": [%s, %s, %s]}}
                """.formatted(categoria(existente, "Versão antiga", T1), categoria(invalida, " ", T1),
                categoria(boa, "Nova", T1));

        DocumentContext resposta = corpo(sincronizar(conta, pedido));

        assertThat(resposta.read("$.resultados.categorias[0].situacao", String.class)).isEqualTo("conflito");
        assertThat(resposta.read("$.resultados.categorias[0].atual.nome", String.class)).isEqualTo("Versão do servidor");
        assertThat(resposta.read("$.resultados.categorias[1].situacao", String.class)).isEqualTo("recusado");
        assertThat(resposta.read("$.resultados.categorias[1].campos.nome", String.class))
                .isEqualTo("Informe o nome da categoria.");
        assertThat(resposta.read("$.resultados.categorias[2].situacao", String.class)).isEqualTo("gravado");
    }

    @Test
    @DisplayName("Configuração mais antiga que a do servidor: conflito com a versão do servidor")
    void configuracaoEmConflito() throws Exception {
        String conta = novaConta();
        sincronizar(conta, """
                {"configuracao": %s}
                """.formatted(configuracao(T2)));

        DocumentContext resposta = corpo(sincronizar(conta, """
                {"configuracao": %s}
                """.formatted(configuracao(T1).replace("\"Nubank\"", "\"Itaú\""))));

        assertThat(resposta.read("$.configuracao.situacao", String.class)).isEqualTo("conflito");
        List<String> formas = resposta.read("$.configuracao.atual.formasPagamento");
        assertThat(formas).containsExactly("Pix", "Nubank");
    }

    @Test
    @DisplayName("Lista desconhecida: 400; sem token: 401")
    void erros() throws Exception {
        MvcResult desconhecida = sincronizar(novaConta(), """
                {"listas": {"gatos": []}}
                """);
        assertThat(status(desconhecida)).isEqualTo(400);
        assertThat(corpo(desconhecida).read("$.campos.listas", String.class)).contains("gatos");

        MvcResult semToken = mvc.perform(post("/api/sync").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andReturn();
        assertThat(status(semToken)).isEqualTo(401);
    }
}
