package com.icaroms.painel.dados;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.DocumentContext;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Regras próprias das contas fixas e dos lançamentos. */
class FixosLancamentosIntegracaoTest extends TesteDeDados {

    private static String fixo(String id, String mesInicial, String mesFinal) {
        String fim = mesFinal == null ? "null" : "\"" + mesFinal + "\"";
        return """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "nome": "Academia", "valorCentavos": 11990, "diaVencimento": 10,
                 "formaPagamento": "Nubank", "mesInicial": "%s", "mesFinal": %s,
                 "pagamentoAutomatico": true}
                """.formatted(id, T1, T1, mesInicial, fim);
    }

    @Test
    @DisplayName("Fixo mensal: volta igual, com mesFinal null presente no JSON")
    void fixoMensal() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, "/api/fixos/" + id, fixo(id, "2026-10", null));

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.valorCentavos", Long.class)).isEqualTo(11990L);
        assertThat(resposta.read("$.diaVencimento", Integer.class)).isEqualTo(10);
        assertThat(resposta.read("$.pagamentoAutomatico", Boolean.class)).isTrue();
        assertThat(resposta.read("$", Map.class)).containsKey("mesFinal");
        assertThat(resposta.read("$.mesFinal", String.class)).isNull();
    }

    @Test
    @DisplayName("Fixo parcelado com mês final antes do inicial: 400")
    void mesFinalAntesDoInicial() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, "/api/fixos/" + id, fixo(id, "2026-10", "2026-03"));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.mesFinal", String.class)).contains("antes do mês inicial");
    }

    @Test
    @DisplayName("Fixo com mês fora do formato AAAA-MM: 400")
    void mesForaDoFormato() throws Exception {
        String conta = novaConta();
        String id = novoId();

        MvcResult resultado = gravar(conta, "/api/fixos/" + id, fixo(id, "2026-13", null));

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.mesInicial", String.class)).isEqualTo("Use o formato AAAA-MM.");
    }

    @Test
    @DisplayName("Lançamento antigo sem parcelas e sem descrição: volta com parcelas 1 e descrição vazia")
    void lancamentoComPadroes() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String json = """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "valorCentavos": 4590, "categoriaId": "%s", "formaPagamento": "Pix", "data": "2026-10-12"}
                """.formatted(id, T1, T1, novoId());

        MvcResult resultado = gravar(conta, "/api/lancamentos/" + id, json);

        assertThat(status(resultado)).isEqualTo(201);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.parcelas", Integer.class)).isEqualTo(1);
        assertThat(resposta.read("$.descricao", String.class)).isEmpty();
        assertThat(resposta.read("$.data", String.class)).isEqualTo("2026-10-12");
        assertThat(resposta.read("$", Map.class)).doesNotContainKey("conversao");
    }

    @Test
    @DisplayName("Compra convertida de conta fixa: categoria especial e objeto 'conversao' voltam iguais")
    void lancamentoConvertido() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String fixoId = novoId();
        String json = """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "valorCentavos": 120000, "categoriaId": "conversao-de-conta-fixa", "formaPagamento": "Nubank",
                 "data": "2026-10-01", "descricao": "Notebook", "parcelas": 10,
                 "conversao": {"fixoId": "%s", "primeiraFatura": "2026-08", "parcelasPagas": 2, "mesFinalAnterior": "2027-05"}}
                """.formatted(id, T1, T1, fixoId);

        DocumentContext resposta = corpo(gravar(conta, "/api/lancamentos/" + id, json));

        assertThat(resposta.read("$.categoriaId", String.class)).isEqualTo("conversao-de-conta-fixa");
        assertThat(resposta.read("$.parcelas", Integer.class)).isEqualTo(10);
        assertThat(resposta.read("$.conversao.fixoId", String.class)).isEqualTo(fixoId);
        assertThat(resposta.read("$.conversao.parcelasPagas", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("Lançamento com valor zero ou 25 parcelas: 400")
    void lancamentoInvalido() throws Exception {
        String conta = novaConta();
        String id = novoId();
        String json = """
                {"id": "%s", "criadoEm": "%s", "atualizadoEm": "%s", "excluidoEm": null,
                 "valorCentavos": 0, "categoriaId": "x", "formaPagamento": "Pix", "data": "2026-10-12", "parcelas": 25}
                """.formatted(id, T1, T1);

        MvcResult resultado = gravar(conta, "/api/lancamentos/" + id, json);

        assertThat(status(resultado)).isEqualTo(400);
        assertThat(corpo(resultado).read("$.campos.valorCentavos", String.class)).contains("maior que zero");
        assertThat(corpo(resultado).read("$.campos.parcelas", String.class)).contains("1 a 24");
    }
}
