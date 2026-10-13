package com.icaroms.painel.dados;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.DocumentContext;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Configuração do app: formas de pagamento, cartões e destino da sobra. */
class ConfiguracaoIntegracaoTest extends TesteDeDados {

    private static final String CAMINHO = "/api/configuracao";

    private static String configuracao(String atualizadoEm, String formaDoCartao, int reserva) {
        return """
                {"formasPagamento": ["Pix", "Débito", "Nubank"],
                 "cartoes": [{"formaPagamento": "%s", "limiteCentavos": 500000, "diaFechamento": 3,
                              "diaVencimento": 10, "criadoEm": "%s", "atualizadoEm": "%s"}],
                 "destinoSobra": {"porcentagens": {"reserva": %d, "investir": 20, "alivio": 10}, "metaMeses": 6},
                 "ultimoBackupEm": "2026-10-12T22:00:00.000Z",
                 "atualizadoEm": "%s",
                 "tema": "escuro"}
                """.formatted(formaDoCartao, T1, T1, reserva, atualizadoEm);
    }

    @Test
    @DisplayName("Antes de gravar: 404. Depois: 201 e o GET devolve igual")
    void gravaEDevolve() throws Exception {
        String conta = novaConta();
        assertThat(status(ler(conta, CAMINHO))).isEqualTo(404);

        MvcResult gravacao = gravar(conta, CAMINHO, configuracao(T1, "Nubank", 70));

        assertThat(status(gravacao)).isEqualTo(201);
        DocumentContext resposta = corpo(ler(conta, CAMINHO));
        List<String> formas = resposta.read("$.formasPagamento");
        assertThat(formas).containsExactly("Pix", "Débito", "Nubank");
        assertThat(resposta.read("$.cartoes[0].limiteCentavos", Long.class)).isEqualTo(500000L);
        assertThat(resposta.read("$.destinoSobra.porcentagens.reserva", Integer.class)).isEqualTo(70);
        assertThat(resposta.read("$.tema", String.class)).isEqualTo("escuro");
        assertThat(resposta.read("$.recebidoEm", String.class)).isNotBlank();
    }

    @Test
    @DisplayName("Versão mais antiga: 409 com a do servidor; mais nova: 200")
    void conflitoDeVersao() throws Exception {
        String conta = novaConta();
        gravar(conta, CAMINHO, configuracao(T2, "Nubank", 70));

        MvcResult antiga = gravar(conta, CAMINHO, configuracao(T1, "Nubank", 50).replace("\"alivio\": 10", "\"alivio\": 30"));
        MvcResult nova = gravar(conta, CAMINHO, configuracao(T3, "Nubank", 60).replace("\"alivio\": 10", "\"alivio\": 20"));

        assertThat(status(antiga)).isEqualTo(409);
        assertThat(corpo(antiga).read("$.atual.destinoSobra.porcentagens.reserva", Integer.class)).isEqualTo(70);
        assertThat(status(nova)).isEqualTo(200);
        assertThat(corpo(nova).read("$.destinoSobra.porcentagens.reserva", Integer.class)).isEqualTo(60);
    }

    @Test
    @DisplayName("Cartão de uma forma que não está na lista: 400")
    void cartaoForaDaLista() throws Exception {
        MvcResult resultado = gravar(novaConta(), CAMINHO, configuracao(T1, "Itaú", 70));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.cartoes", String.class)).contains("forma de pagamento da lista");
    }

    @Test
    @DisplayName("Porcentagens que não somam 100: 400")
    void porcentagensErradas() throws Exception {
        MvcResult resultado = gravar(novaConta(), CAMINHO, configuracao(T1, "Nubank", 90));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.destinoSobra", String.class)).contains("somar 100");
    }

    @Test
    @DisplayName("Sem nenhuma forma de pagamento: 400")
    void semFormas() throws Exception {
        String json = """
                {"formasPagamento": [], "cartoes": [], "atualizadoEm": "%s"}
                """.formatted(T1);

        MvcResult resultado = gravar(novaConta(), CAMINHO, json);

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.formasPagamento", String.class))
                .isEqualTo("Mantenha pelo menos uma forma de pagamento.");
    }
}
