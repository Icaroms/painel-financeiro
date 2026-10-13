package com.icaroms.painel.dados;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.DocumentContext;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Regras comuns a todas as listas, testadas pelas categorias:
 * criar, atualizar, conflito de versão, listar, "desde", excluir,
 * isolamento entre contas e campos desconhecidos.
 */
class CategoriasIntegracaoTest extends TesteDeDados {

    private static final String CAMINHO = "/api/categorias/";

    private static String categoria(String id, String nome, long orcamento, String atualizadoEm) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "nome": "%s", "orcamentoCentavos": %d}
                """.formatted(id, T1, atualizadoEm, nome, orcamento);
    }

    @Test
    @DisplayName("PUT de um registro novo: 201 e o registro igual ao enviado")
    void criaRegistroNovo() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id, categoria(id, "iFood", 30000, T1));

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.id", String.class)).isEqualTo(id);
        assertThat(resposta.read("$.nome", String.class)).isEqualTo("iFood");
        assertThat(resposta.read("$.orcamentoCentavos", Long.class)).isEqualTo(30000L);
        assertThat(Instant.parse(resposta.read("$.criadoEm", String.class))).isEqualTo(Instant.parse(T1));
        assertThat(resposta.read("$", Map.class)).containsKey("excluidoEm");
        assertThat(resposta.read("$.excluidoEm", String.class)).isNull();
        assertThat(resposta.read("$.recebidoEm", String.class)).isNotBlank();
    }

    @Test
    @DisplayName("PUT com atualizadoEm mais novo: 200 e o registro atualizado")
    void atualizaRegistro() throws Exception {
        String conta = novaConta();
        String id = novoId();
        gravar(conta, CAMINHO + id, categoria(id, "iFood", 30000, T1));

        MvcResult resultado = gravar(conta, CAMINHO + id, categoria(id, "Delivery", 35000, T2));

        assertThat(status(resultado)).isEqualTo(200);
        assertThat(corpo(resultado).read("$.nome", String.class)).isEqualTo("Delivery");
        assertThat(corpo(ler(conta, CAMINHO + id)).read("$.orcamentoCentavos", Long.class)).isEqualTo(35000L);
    }

    @Test
    @DisplayName("PUT repetido com o mesmo atualizadoEm: aceito (reenvio do app)")
    void reenvioIgualEhAceito() throws Exception {
        String conta = novaConta();
        String id = novoId();
        gravar(conta, CAMINHO + id, categoria(id, "iFood", 30000, T1));

        assertThat(status(gravar(conta, CAMINHO + id, categoria(id, "iFood", 30000, T1)))).isEqualTo(200);
    }

    @Test
    @DisplayName("PUT com atualizadoEm mais antigo: 409 com a versão do servidor em 'atual'")
    void versaoAntigaDaConflito() throws Exception {
        String conta = novaConta();
        String id = novoId();
        gravar(conta, CAMINHO + id, categoria(id, "Versão nova", 1000, T2));

        MvcResult resultado = gravar(conta, CAMINHO + id, categoria(id, "Versão antiga", 500, T1));

        assertThat(status(resultado)).isEqualTo(409);
        assertThat(corpo(resultado).read("$.atual.nome", String.class)).isEqualTo("Versão nova");
        assertThat(corpo(ler(conta, CAMINHO + id)).read("$.nome", String.class)).isEqualTo("Versão nova");
    }

    @Test
    @DisplayName("GET da lista: só os da conta, inclusive os excluídos")
    void listaSoDaContaComExcluidos() throws Exception {
        String conta = novaConta();
        String outraConta = novaConta();
        String primeira = novoId();
        String segunda = novoId();
        gravar(conta, CAMINHO + primeira, categoria(primeira, "Mercado", 80000, T1));
        gravar(conta, CAMINHO + segunda, categoria(segunda, "Uber", 20000, T1));
        String daOutra = novoId();
        gravar(outraConta, CAMINHO + daOutra, categoria(daOutra, "Outra conta", 100, T1));
        excluir(conta, CAMINHO + segunda);

        MvcResult resultado = ler(conta, "/api/categorias");

        assertThat(status(resultado)).isEqualTo(200);
        List<String> ids = corpo(resultado).read("$[*].id");
        assertThat(ids).containsExactlyInAnyOrder(primeira, segunda);
        List<Object> excluidos = corpo(resultado).read("$[?(@.excluidoEm != null)].id");
        assertThat(excluidos).containsExactly(segunda);
    }

    @Test
    @DisplayName("GET ?desde=: só os gravados no servidor a partir daquele momento")
    void desdeTrazSoOsMaisNovos() throws Exception {
        String conta = novaConta();
        String antigo = novoId();
        gravar(conta, CAMINHO + antigo, categoria(antigo, "Antiga", 100, T1));
        Thread.sleep(20);
        String novo = novoId();
        String recebidoDoNovo = corpo(gravar(conta, CAMINHO + novo, categoria(novo, "Nova", 100, T1)))
                .read("$.recebidoEm", String.class);

        MvcResult resultado = mvc.perform(get("/api/categorias").param("desde", recebidoDoNovo)
                .header("Authorization", conta)).andReturn();

        List<String> ids = corpo(resultado).read("$[*].id");
        assertThat(ids).containsExactly(novo);
    }

    @Test
    @DisplayName("DELETE: exclusão suave, o registro volta com excluidoEm")
    void excluirEhSuave() throws Exception {
        String conta = novaConta();
        String id = novoId();
        gravar(conta, CAMINHO + id, categoria(id, "iFood", 30000, T1));

        MvcResult primeira = excluir(conta, CAMINHO + id);
        MvcResult segunda = excluir(conta, CAMINHO + id);

        assertThat(status(primeira)).isEqualTo(200);
        String excluidoEm = corpo(primeira).read("$.excluidoEm", String.class);
        assertThat(excluidoEm).isNotBlank();
        assertThat(corpo(segunda).read("$.excluidoEm", String.class)).isEqualTo(excluidoEm);
        assertThat(corpo(ler(conta, CAMINHO + id)).read("$.excluidoEm", String.class)).isEqualTo(excluidoEm);
    }

    @Test
    @DisplayName("Outra conta não vê nem sobrescreve o registro (404)")
    void outraContaNaoAcessa() throws Exception {
        String dona = novaConta();
        String intrusa = novaConta();
        String id = novoId();
        gravar(dona, CAMINHO + id, categoria(id, "Minha", 100, T1));

        assertThat(status(ler(intrusa, CAMINHO + id))).isEqualTo(404);
        assertThat(status(gravar(intrusa, CAMINHO + id, categoria(id, "Tomada", 1, T3)))).isEqualTo(404);
        assertThat(status(excluir(intrusa, CAMINHO + id))).isEqualTo(404);
        assertThat(corpo(ler(dona, CAMINHO + id)).read("$.nome", String.class)).isEqualTo("Minha");
    }

    @Test
    @DisplayName("Campos que o servidor não conhece voltam iguais; recebidoEm do app é ignorado")
    void camposDesconhecidosVoltam() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String json = """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "nome": "Lazer", "orcamentoCentavos": 5000,
                 "cor": "verde", "detalhes": {"icone": "bola", "ordem": 3},
                 "recebidoEm": "2000-01-01T00:00:00Z"}
                """.formatted(id, T1, T1);
        gravar(conta, CAMINHO + id, json);

        DocumentContext resposta = corpo(ler(conta, CAMINHO + id));

        assertThat(resposta.read("$.cor", String.class)).isEqualTo("verde");
        assertThat(resposta.read("$.detalhes.icone", String.class)).isEqualTo("bola");
        assertThat(resposta.read("$.detalhes.ordem", Integer.class)).isEqualTo(3);
        assertThat(resposta.read("$.recebidoEm", String.class)).doesNotStartWith("2000");
        assertThat(resposta.read("$", Map.class)).doesNotContainKey("extras");
    }

    @Test
    @DisplayName("Id do corpo diferente do id do endereço: 400")
    void idDiferente() throws Exception {
        String conta = novaConta();

        MvcResult resultado = gravar(conta, CAMINHO + novoId(), categoria(novoId(), "iFood", 1, T1));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.id", String.class)).contains("diferente");
    }

    @Test
    @DisplayName("Campos inválidos: 400 com a mensagem de cada campo")
    void camposInvalidos() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id, categoria(id, " ", -1, T1));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.nome", String.class)).isEqualTo("Informe o nome da categoria.");
        assertThat(corpo(resultado).read("$.campos.orcamentoCentavos", String.class))
                .isEqualTo("O orçamento não pode ser negativo.");
    }

    @Test
    @DisplayName("Sem token: 401; id que não é UUID: 400; registro inexistente: 404")
    void respostasDeErro() throws Exception {
        String conta = novaConta();

        assertThat(mvc.perform(get("/api/categorias")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(status(ler(conta, CAMINHO + "nao-e-uuid"))).isEqualTo(400);
        assertThat(status(ler(conta, CAMINHO + novoId()))).isEqualTo(404);
    }
}
