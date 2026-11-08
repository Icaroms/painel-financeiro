package com.icaroms.painel.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.icaroms.painel.dados.TesteDeDados;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

/**
 * IA pelo servidor (parte 5.5), com um "Gemini de mentira" local: confere a
 * chave no cabeçalho, o formato do pedido, o limite diário e os erros.
 */
class IaIntegracaoTest extends TesteDeDados {

    private static final String CHAVE = "chave-so-de-teste";
    private static final AtomicReference<String> ULTIMO_PEDIDO = new AtomicReference<>();
    private static final AtomicReference<String> ULTIMO_CAMINHO = new AtomicReference<>();
    private static final AtomicReference<String> ULTIMA_CHAVE = new AtomicReference<>();
    private static final HttpServer GEMINI = iniciarGemini();

    @DynamicPropertySource
    static void ligarIa(DynamicPropertyRegistry registro) {
        registro.add("painel.ia.chave", () -> CHAVE);
        registro.add("painel.ia.url", () -> "http://localhost:" + GEMINI.getAddress().getPort() + "/v1beta/models");
        registro.add("painel.ia.modelos", () -> "gemini-teste,gemini-cota");
        registro.add("painel.ia.limite-diario", () -> 3);
        registro.add("painel.ia.tamanho-maximo", () -> 2000);
    }

    /** Responde como o Gemini: com "gemini-cota" devolve 429; senão, um pensamento e o texto. */
    private static HttpServer iniciarGemini() {
        try {
            HttpServer servidor = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            servidor.createContext("/", troca -> {
                ULTIMO_CAMINHO.set(troca.getRequestURI().getPath());
                ULTIMA_CHAVE.set(troca.getRequestHeaders().getFirst("x-goog-api-key"));
                ULTIMO_PEDIDO.set(new String(troca.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                boolean cota = troca.getRequestURI().getPath().contains("gemini-cota");
                byte[] resposta = (cota
                        ? "{\"error\":{\"code\":429,\"message\":\"Resource exhausted\"}}"
                        : """
                        {"candidates":[{"content":{"role":"model","parts":[
                          {"text":"pensando...","thought":true},
                          {"text":"Dá para comprar à vista em dezembro."}]}}]}
                        """).getBytes(StandardCharsets.UTF_8);
                troca.getResponseHeaders().add("Content-Type", "application/json");
                troca.sendResponseHeaders(cota ? 429 : 200, resposta.length);
                troca.getResponseBody().write(resposta);
                troca.close();
            });
            servidor.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> servidor.stop(0)));
            return servidor;
        } catch (IOException erro) {
            throw new UncheckedIOException(erro);
        }
    }

    private MvcResult gerar(String conta, String corpo) throws Exception {
        return mvc.perform(post("/api/ia/gerar").header(HttpHeaders.AUTHORIZATION, conta)
                .contentType(MediaType.APPLICATION_JSON).content(corpo.getBytes(StandardCharsets.UTF_8))).andReturn();
    }

    private static final String PEDIDO = """
            {"instrucoes": "Você é o assistente do Painel Financeiro.",
             "conteudo": "Posso comprar um tablet de R$ 2.569,00?", "modelo": "gemini-teste"}
            """;

    @Test
    @DisplayName("Gerar: devolve só o texto (sem o pensamento) e conta o uso do dia")
    void gera() throws Exception {
        String conta = novaConta();

        MvcResult resultado = gerar(conta, PEDIDO);

        assertThat(status(resultado)).isEqualTo(200);
        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.texto", String.class)).isEqualTo("Dá para comprar à vista em dezembro.");
        assertThat(resposta.read("$.usadosHoje", Integer.class)).isEqualTo(1);
        assertThat(resposta.read("$.limiteDiario", Integer.class)).isEqualTo(3);
    }

    @Test
    @DisplayName("Gerar: o pedido ao Gemini leva a chave no cabeçalho e o formato do app")
    void montaOPedido() throws Exception {
        gerar(novaConta(), PEDIDO);

        assertThat(ULTIMA_CHAVE.get()).isEqualTo(CHAVE);
        assertThat(ULTIMO_CAMINHO.get()).isEqualTo("/v1beta/models/gemini-teste:generateContent");
        DocumentContext pedido = JsonPath.parse(ULTIMO_PEDIDO.get());
        assertThat(pedido.read("$.systemInstruction.parts[0].text", String.class)).startsWith("Você é o assistente");
        assertThat(pedido.read("$.contents[0].role", String.class)).isEqualTo("user");
        assertThat(pedido.read("$.contents[0].parts[0].text", String.class)).contains("R$ 2.569,00");
    }

    @Test
    @DisplayName("Gerar: modelo fora da lista usa o padrão (o primeiro)")
    void modeloForaDaLista() throws Exception {
        gerar(novaConta(), PEDIDO.replace("gemini-teste", "modelo-qualquer"));

        assertThat(ULTIMO_CAMINHO.get()).isEqualTo("/v1beta/models/gemini-teste:generateContent");
    }

    @Test
    @DisplayName("Limite do dia: o 4º pedido recebe 429 com Retry-After; a situação mostra o uso")
    void limiteDoDia() throws Exception {
        String conta = novaConta();
        for (int i = 0; i < 3; i++) {
            assertThat(status(gerar(conta, PEDIDO))).isEqualTo(200);
        }

        MvcResult resultado = gerar(conta, PEDIDO);

        assertThat(status(resultado)).isEqualTo(429);
        assertThat(Integer.parseInt(resultado.getResponse().getHeader(HttpHeaders.RETRY_AFTER))).isPositive();
        assertThat(corpo(resultado).read("$.detail", String.class)).contains("3 pedidos de IA de hoje");

        DocumentContext situacao = corpo(ler(conta, "/api/ia"));
        assertThat(situacao.read("$.disponivel", Boolean.class)).isTrue();
        assertThat(situacao.read("$.usadosHoje", Integer.class)).isEqualTo(3);
        assertThat(situacao.read("$.modelos", List.class)).containsExactly("gemini-teste", "gemini-cota");
    }

    @Test
    @DisplayName("Limite é por conta: outra conta continua podendo pedir")
    void limitePorConta() throws Exception {
        String uma = novaConta();
        for (int i = 0; i < 3; i++) {
            gerar(uma, PEDIDO);
        }

        assertThat(status(gerar(novaConta(), PEDIDO))).isEqualTo(200);
    }

    @Test
    @DisplayName("Gemini sem cota: 502 com uma mensagem clara (sem detalhes internos)")
    void falhaDoGemini() throws Exception {
        MvcResult resultado = gerar(novaConta(), PEDIDO.replace("gemini-teste", "gemini-cota"));

        assertThat(status(resultado)).isEqualTo(502);
        assertThat(corpo(resultado).read("$.detail", String.class)).contains("cota do Gemini");
        assertThat(resultado.getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain(CHAVE);
    }

    @Test
    @DisplayName("Validação: sem conteúdo → 400; grande demais → 400")
    void valida() throws Exception {
        String conta = novaConta();
        assertThat(status(gerar(conta, "{\"instrucoes\": \"x\", \"conteudo\": \"\"}"))).isEqualTo(400);

        MvcResult grande = gerar(conta, "{\"instrucoes\": \"x\", \"conteudo\": \"" + "a".repeat(2500) + "\"}");
        assertThat(status(grande)).isEqualTo(400);
        assertThat(corpo(grande).read("$.campos.conteudo", String.class)).contains("tamanho máximo");
        assertThat(corpo(ler(conta, "/api/ia")).read("$.usadosHoje", Integer.class)).isZero();
    }

    @Test
    @DisplayName("Sem login: 401")
    void exigeLogin() throws Exception {
        MvcResult resultado = mvc.perform(post("/api/ia/gerar")
                .contentType(MediaType.APPLICATION_JSON).content(PEDIDO)).andReturn();

        assertThat(status(resultado)).isEqualTo(401);
    }
}
