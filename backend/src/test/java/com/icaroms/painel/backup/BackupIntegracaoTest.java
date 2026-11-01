package com.icaroms.painel.backup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.icaroms.painel.dados.TesteDeDados;
import com.jayway.jsonpath.DocumentContext;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** Backups na nuvem: enviar, listar, baixar, apagar, limites e isolamento entre contas. */
class BackupIntegracaoTest extends TesteDeDados {

    private static String pacote(String descricao) {
        return """
                {"formato": "painel-financeiro", "versao": 3, "salvoEm": "2026-10-14T12:00:00.000Z",
                 "dados": {"meses": [{"id": "m1", "excluidoEm": null}],
                           "lancamentos": [{"id": "l1", "excluidoEm": null, "descricao": "%s"},
                                           {"id": "l2", "excluidoEm": "2026-10-14T11:00:00.000Z"}],
                           "categorias": [], "fixos": [], "formasPagamento": ["Pix"], "cartoes": []}}
                """.formatted(descricao);
    }

    private MvcResult enviar(String conta, String corpo) throws Exception {
        return mvc.perform(post("/api/backups").header(HttpHeaders.AUTHORIZATION, conta)
                .contentType(MediaType.APPLICATION_JSON).content(corpo.getBytes(StandardCharsets.UTF_8))).andReturn();
    }

    @Test
    @DisplayName("Enviar: 201 com o resumo (sem contar os excluídos)")
    void enviaEResume() throws Exception {
        String corpo = pacote("Farmácia");

        MvcResult resultado = enviar(novaConta(), corpo);

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.id", String.class)).isNotBlank();
        assertThat(resposta.read("$.versao", Integer.class)).isEqualTo(3);
        assertThat(resposta.read("$.tamanhoBytes", Integer.class)).isEqualTo(corpo.getBytes(StandardCharsets.UTF_8).length);
        assertThat(resposta.read("$.salvoEm", String.class)).startsWith("2026-10-14T12:00");
        assertThat(resposta.read("$.resumo.meses", Integer.class)).isEqualTo(1);
        assertThat(resposta.read("$.resumo.lancamentos", Integer.class)).isEqualTo(1);
        assertThat(resposta.read("$.resumo.investimentos", Integer.class)).isZero();
    }

    @Test
    @DisplayName("Baixar: o pacote volta com o mesmo conteúdo (acentos inclusos)")
    void baixaOPacote() throws Exception {
        String conta = novaConta();
        String id = corpo(enviar(conta, pacote("Farmácia e pão"))).read("$.id", String.class);

        MvcResult resultado = ler(conta, "/api/backups/" + id);

        assertThat(status(resultado)).isEqualTo(200);
        DocumentContext baixado = corpo(resultado);
        assertThat(baixado.read("$.formato", String.class)).isEqualTo("painel-financeiro");
        assertThat(baixado.read("$.dados.lancamentos[0].descricao", String.class)).isEqualTo("Farmácia e pão");
        List<String> formas = baixado.read("$.dados.formasPagamento");
        assertThat(formas).containsExactly("Pix");
    }

    @Test
    @DisplayName("Listar: do mais novo para o mais antigo, com o máximo e o tamanho máximo")
    void listaDoMaisNovo() throws Exception {
        String conta = novaConta();
        String primeiro = corpo(enviar(conta, pacote("1"))).read("$.id", String.class);
        String segundo = corpo(enviar(conta, pacote("2"))).read("$.id", String.class);

        DocumentContext lista = corpo(ler(conta, "/api/backups"));

        List<String> ids = lista.read("$.backups[*].id");
        assertThat(ids).containsExactly(segundo, primeiro);
        assertThat(lista.read("$.maximo", Integer.class)).isEqualTo(10);
        assertThat(lista.read("$.tamanhoMaximoBytes", Long.class)).isEqualTo(5L * 1024 * 1024);
        assertThat(lista.read("$.backups[0]", java.util.Map.class)).doesNotContainKey("pacote");
    }

    @Test
    @DisplayName("Guarda só os 10 mais novos: o 11º apaga o mais antigo")
    void guardaSoOsDezMaisNovos() throws Exception {
        String conta = novaConta();
        String maisAntigo = corpo(enviar(conta, pacote("0"))).read("$.id", String.class);
        for (int i = 1; i <= 10; i++) {
            enviar(conta, pacote(String.valueOf(i)));
        }

        List<String> ids = corpo(ler(conta, "/api/backups")).read("$.backups[*].id");

        assertThat(ids).hasSize(10).doesNotContain(maisAntigo);
        assertThat(status(ler(conta, "/api/backups/" + maisAntigo))).isEqualTo(404);
    }

    @Test
    @DisplayName("Apagar: 204, e depois some da lista (404 ao baixar)")
    void apaga() throws Exception {
        String conta = novaConta();
        String id = corpo(enviar(conta, pacote("x"))).read("$.id", String.class);

        assertThat(status(excluir(conta, "/api/backups/" + id))).isEqualTo(204);
        assertThat(status(ler(conta, "/api/backups/" + id))).isEqualTo(404);
        assertThat(status(excluir(conta, "/api/backups/" + id))).isEqualTo(404);
    }

    @Test
    @DisplayName("Outra conta não vê, não baixa e não apaga")
    void outraContaNaoAcessa() throws Exception {
        String dona = novaConta();
        String intrusa = novaConta();
        String id = corpo(enviar(dona, pacote("meu"))).read("$.id", String.class);

        assertThat(corpo(ler(intrusa, "/api/backups")).read("$.backups.length()", Integer.class)).isZero();
        assertThat(status(ler(intrusa, "/api/backups/" + id))).isEqualTo(404);
        assertThat(status(excluir(intrusa, "/api/backups/" + id))).isEqualTo(404);
        assertThat(status(ler(dona, "/api/backups/" + id))).isEqualTo(200);
    }

    @Test
    @DisplayName("Conteúdo que não é backup do app: 400")
    void conteudoInvalido() throws Exception {
        String conta = novaConta();

        MvcResult naoEhJson = enviar(conta, "isto não é json");
        MvcResult outroFormato = enviar(conta, "{\"formato\": \"outro-app\", \"versao\": 1, \"dados\": {}}");
        MvcResult semVersao = enviar(conta, "{\"formato\": \"painel-financeiro\", \"dados\": {}}");
        MvcResult vazio = enviar(conta, "");

        assertThat(status(naoEhJson)).isEqualTo(400);
        assertThat(corpo(naoEhJson).read("$.campos.pacote", String.class)).contains("JSON válido");
        assertThat(status(outroFormato)).isEqualTo(400);
        assertThat(status(semVersao)).isEqualTo(400);
        assertThat(corpo(semVersao).read("$.campos.pacote", String.class)).contains("versão");
        assertThat(status(vazio)).isEqualTo(400);
    }

    @Test
    @DisplayName("Backup maior que o limite: 413 com o tamanho máximo")
    void grandeDemais() throws Exception {
        String recheio = "x".repeat(5 * 1024 * 1024);

        MvcResult resultado = enviar(novaConta(), pacote(recheio));

        assertThat(status(resultado)).isEqualTo(413);
        assertThat(corpo(resultado).read("$.tamanhoMaximoBytes", Long.class)).isEqualTo(5L * 1024 * 1024);
    }
}
