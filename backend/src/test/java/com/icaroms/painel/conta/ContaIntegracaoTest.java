package com.icaroms.painel.conta;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.icaroms.painel.dados.TesteDeDados;
import com.jayway.jsonpath.DocumentContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** DELETE /api/conta/dados e o aviso "zerados" na sincronização dos outros aparelhos. */
class ContaIntegracaoTest extends TesteDeDados {

    private static String categoria(String id, String nome) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "nome": "%s", "orcamentoCentavos": 10000}
                """.formatted(id, T1, T1, nome);
    }

    private MvcResult sincronizar(String conta, String json) throws Exception {
        return mvc.perform(post("/api/sync").header(HttpHeaders.AUTHORIZATION, conta)
                .contentType(MediaType.APPLICATION_JSON).content(json)).andReturn();
    }

    @Test
    @DisplayName("Apagar os dados: some tudo da conta, mas os backups continuam")
    void apagaOsDadosEMantemOsBackups() throws Exception {
        String conta = novaConta();
        String id = novoId();
        gravar(conta, "/api/categorias/" + id, categoria(id, "iFood"));
        gravar(conta, "/api/configuracao", """
                {"formasPagamento": ["Pix"], "cartoes": [], "atualizadoEm": "%s"}
                """.formatted(T1));
        mvc.perform(post("/api/backups").header(HttpHeaders.AUTHORIZATION, conta).contentType(MediaType.APPLICATION_JSON)
                .content("{\"formato\": \"painel-financeiro\", \"versao\": 3, \"dados\": {}}"));

        MvcResult resultado = excluir(conta, "/api/conta/dados");

        assertThat(status(resultado)).isEqualTo(200);
        assertThat(corpo(resultado).read("$.zeradosEm", String.class)).isNotBlank();
        assertThat(corpo(ler(conta, "/api/categorias")).read("$.length()", Integer.class)).isZero();
        assertThat(status(ler(conta, "/api/configuracao"))).isEqualTo(404);
        assertThat(corpo(ler(conta, "/api/backups")).read("$.backups.length()", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Só apaga os dados da própria conta")
    void naoMexeEmOutraConta() throws Exception {
        String minha = novaConta();
        String outra = novaConta();
        String id = novoId();
        gravar(outra, "/api/categorias/" + id, categoria(id, "Da outra"));

        excluir(minha, "/api/conta/dados");

        assertThat(corpo(ler(outra, "/api/categorias")).read("$.length()", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Aparelho que sincronizou antes de zerar: recebe 'zerados' e nada do que mandou é gravado")
    void aparelhoAntigoRecebeZerados() throws Exception {
        String conta = novaConta();
        String cursor = corpo(sincronizar(conta, "{}")).read("$.cursor", String.class);
        String zeradosEm = corpo(excluir(conta, "/api/conta/dados")).read("$.zeradosEm", String.class);
        String id = novoId();

        DocumentContext resposta = corpo(sincronizar(conta, """
                {"desde": "%s", "listas": {"categorias": [%s]}}
                """.formatted(cursor, categoria(id, "Dado antigo"))));

        assertThat(resposta.read("$.zerados", Boolean.class)).isTrue();
        assertThat(resposta.read("$.zeradosEm", String.class)).isEqualTo(zeradosEm);
        assertThat(resposta.read("$.cursor", String.class)).isNull();
        assertThat(status(ler(conta, "/api/categorias/" + id))).isEqualTo(404);
    }

    @Test
    @DisplayName("Aparelho que já sabe (zeradosEm igual) ou que começa do zero (sem desde): sincroniza normal")
    void quemJaSabeSincroniza() throws Exception {
        String conta = novaConta();
        String cursor = corpo(sincronizar(conta, "{}")).read("$.cursor", String.class);
        String zeradosEm = corpo(excluir(conta, "/api/conta/dados")).read("$.zeradosEm", String.class);

        DocumentContext jaSabe = corpo(sincronizar(conta, """
                {"desde": "%s", "zeradosEm": "%s"}
                """.formatted(cursor, zeradosEm)));
        String id = novoId();
        DocumentContext doZero = corpo(sincronizar(conta, """
                {"desde": null, "listas": {"categorias": [%s]}}
                """.formatted(categoria(id, "Começo novo"))));

        assertThat(jaSabe.read("$.zerados", Boolean.class)).isFalse();
        assertThat(doZero.read("$.zerados", Boolean.class)).isFalse();
        assertThat(doZero.read("$.zeradosEm", String.class)).isEqualTo(zeradosEm);
        assertThat(doZero.read("$.resultados.categorias[0].situacao", String.class)).isEqualTo("gravado");
    }

    @Test
    @DisplayName("Conta que nunca foi zerada: zeradosEm vem null e zerados false")
    void nuncaZerada() throws Exception {
        DocumentContext resposta = corpo(sincronizar(novaConta(), "{}"));

        assertThat(resposta.read("$.zeradosEm", String.class)).isNull();
        assertThat(resposta.read("$.zerados", Boolean.class)).isFalse();
    }
}
