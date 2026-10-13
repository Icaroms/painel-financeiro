package com.icaroms.painel.dados;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.DocumentContext;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Regras próprias dos investimentos: renda fixa por valor, ações e FIIs por operação. */
class InvestimentosIntegracaoTest extends TesteDeDados {

    private static final String CAMINHO = "/api/investimentos/";

    private static String rendaFixa(String id, String tipo, boolean reserva, String taxa) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "tipo": "%s", "nome": "CDB Banco X 2028", "dataAplicacao": "2026-03-10",
                 "valorAplicadoCentavos": 100000, "valorAtualCentavos": 105000, "valorAtualEm": "2026-10-01",
                 "reserva": %s, "taxa": %s}
                """.formatted(id, T1, T1, tipo, reserva, taxa);
    }

    private static String acao(String id, String codigo, String operacoes) {
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "tipo": "acao", "nome": "%s", "operacoes": %s, "cotacaoCentavos": null, "cotacaoEm": null}
                """.formatted(id, T1, T1, codigo, operacoes);
    }

    private static String compra(String id, long quantidade) {
        return """
                {"id": "%s", "tipo": "compra", "data": "2026-09-01", "quantidade": %d,
                 "precoCentavos": 3250, "custosCentavos": 0}
                """.formatted(id, quantidade);
    }

    @Test
    @DisplayName("Renda fixa com taxa: volta igual e sem campos de ação")
    void rendaFixaVoltaIgual() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id,
                rendaFixa(id, "cdb", true, "{\"indexador\": \"cdi\", \"percentual\": 110}"));

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.valorAtualCentavos", Long.class)).isEqualTo(105000L);
        assertThat(resposta.read("$.reserva", Boolean.class)).isTrue();
        assertThat(resposta.read("$.taxa.indexador", String.class)).isEqualTo("cdi");
        assertThat(resposta.read("$.taxa.percentual", Integer.class)).isEqualTo(110);
        assertThat(resposta.read("$", Map.class)).doesNotContainKeys("operacoes", "cotacaoCentavos");
    }

    @Test
    @DisplayName("Ação com operações: volta igual, na ordem, e sem campos de renda fixa")
    void acaoVoltaIgual() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String primeira = novoId();
        String venda = """
                {"id": "%s", "tipo": "venda", "data": "2026-10-05", "quantidade": 5,
                 "precoCentavos": 3500, "custosCentavos": 120}
                """.formatted(novoId());

        MvcResult resultado = gravar(conta, CAMINHO + id,
                acao(id, "PETR4", "[" + compra(primeira, 10) + "," + venda + "]"));

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.operacoes.length()", Integer.class)).isEqualTo(2);
        assertThat(resposta.read("$.operacoes[0].id", String.class)).isEqualTo(primeira);
        assertThat(resposta.read("$.operacoes[1].tipo", String.class)).isEqualTo("venda");
        assertThat(resposta.read("$.operacoes[1].custosCentavos", Long.class)).isEqualTo(120L);
        assertThat(resposta.read("$", Map.class)).doesNotContainKeys("valorAplicadoCentavos", "reserva", "taxa");

        MvcResult atualizada = gravar(conta, CAMINHO + id,
                acao(id, "PETR4", "[" + compra(primeira, 10) + "]").replace(T1 + "\", \"excluidoEm", T2 + "\", \"excluidoEm"));
        assertThat(corpo(atualizada).read("$.operacoes.length()", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Ação sem operações ou com código inválido: 400")
    void acaoInvalida() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id, acao(id, "PETROBRAS", "[]"));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.nome", String.class)).contains("Código inválido");
        assertThat(corpo(resultado).read("$.campos.operacoes", String.class)).contains("pelo menos uma operação");
    }

    @Test
    @DisplayName("Operação com quantidade zero: 400 apontando a operação")
    void operacaoInvalida() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id, acao(id, "ITUB4", "[" + compra(novoId(), 0) + "]"));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos['operacoes[0].quantidade']", String.class))
                .contains("maior que zero");
    }

    @Test
    @DisplayName("Imóvel como reserva e taxa em poupança: 400")
    void regrasDaRendaFixa() throws Exception {
        String conta = novaConta();
        String imovel = novoId();
        String poupanca = novoId();

        MvcResult comReserva = gravar(conta, CAMINHO + imovel, rendaFixa(imovel, "imovel", true, "null"));
        MvcResult comTaxa = gravar(conta, CAMINHO + poupanca,
                rendaFixa(poupanca, "poupanca", false, "{\"indexador\": \"cdi\", \"percentual\": 100}"));

        assertThat(status(comReserva)).isEqualTo(400);
        assertThat(corpo(comReserva).read("$.campos.reserva", String.class)).contains("Só renda fixa e fundos");
        assertThat(status(comTaxa)).isEqualTo(400);
        assertThat(corpo(comTaxa).read("$.campos.taxa", String.class)).contains("não aceita taxa");
    }

    @Test
    @DisplayName("Taxa fora da faixa do indexador: 400")
    void taxaForaDaFaixa() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, CAMINHO + id,
                rendaFixa(id, "cdb", false, "{\"indexador\": \"cdi\", \"percentual\": 900}"));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.taxa", String.class)).contains("fora da faixa");
    }
}
