package com.icaroms.painel.ia;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.icaroms.painel.config.PainelProperties;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Conversa com a API do Gemini (generateContent), no mesmo formato que o app
 * usa quando a chave é do aparelho (src/ia.js): instruções em
 * "systemInstruction" e o conteúdo como mensagem do usuário.
 *
 * <p>A chave vai no cabeçalho "x-goog-api-key", nunca no endereço, e nunca
 * aparece em log nem em resposta.
 */
@Component
public class ClienteGemini {

    private static final Logger LOG = LoggerFactory.getLogger(ClienteGemini.class);

    private final PainelProperties.Ia config;
    private final ObjectMapper json;
    private final HttpClient http;

    public ClienteGemini(PainelProperties propriedades, ObjectMapper json) {
        this.config = propriedades.ia();
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(config.tempoLimite()).build();
    }

    /**
     * Envia o pedido e devolve o texto da resposta.
     *
     * @throws FalhaGeminiException com uma mensagem clara para a pessoa
     */
    public String gerar(String modelo, String instrucoes, String conteudo) {
        ObjectNode corpo = json.createObjectNode();
        corpo.putObject("systemInstruction").putArray("parts").addObject().put("text", instrucoes);
        ObjectNode mensagem = corpo.putArray("contents").addObject();
        mensagem.put("role", "user");
        mensagem.putArray("parts").addObject().put("text", conteudo);

        String endereco = config.url() + "/" + URLEncoder.encode(modelo, StandardCharsets.UTF_8) + ":generateContent";
        HttpRequest pedido = HttpRequest.newBuilder(URI.create(endereco))
                .timeout(config.tempoLimite())
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", config.chave())
                .POST(HttpRequest.BodyPublishers.ofString(corpo.toString(), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> resposta;
        try {
            resposta = http.send(pedido, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (HttpTimeoutException demora) {
            throw new FalhaGeminiException("O Gemini demorou demais para responder. Tente de novo.", true);
        } catch (IOException erro) {
            LOG.warn("Sem conexão com o Gemini: {}", erro.getMessage());
            throw new FalhaGeminiException("O servidor não conseguiu falar com o Gemini agora. Tente de novo em instantes.", false);
        } catch (InterruptedException interrompido) {
            Thread.currentThread().interrupt();
            throw new FalhaGeminiException("O pedido à IA foi interrompido. Tente de novo.", false);
        }
        return lerResposta(resposta.statusCode(), resposta.body());
    }

    /** Lê a resposta: o texto, ou uma mensagem clara (sem detalhes internos). */
    String lerResposta(int status, String corpo) {
        JsonNode raiz;
        try {
            raiz = json.readTree(corpo == null || corpo.isBlank() ? "{}" : corpo);
        } catch (IOException erro) {
            raiz = json.createObjectNode();
        }
        if (status >= 200 && status < 300) {
            StringBuilder texto = new StringBuilder();
            for (JsonNode parte : raiz.path("candidates").path(0).path("content").path("parts")) {
                // Partes de "pensamento" (thought) não são a resposta.
                if (parte.path("text").isTextual() && !parte.path("thought").asBoolean(false)) {
                    texto.append(parte.path("text").asText());
                }
            }
            if (!texto.toString().isBlank()) {
                return texto.toString().trim();
            }
            throw new FalhaGeminiException("O Gemini respondeu vazio. Tente de novo.", false);
        }
        LOG.warn("Gemini respondeu {}", status);
        String mensagem = switch (status) {
            case 429 -> "A cota do Gemini do servidor acabou por enquanto. Tente de novo mais tarde.";
            case 400, 401, 403 -> "A chave do Gemini do servidor foi recusada. Avise quem cuida do servidor.";
            case 404 -> "Este modelo não está disponível no Gemini agora. Escolha o outro modelo em Ajustes → IA.";
            default -> "O Gemini está com problemas agora. Tente de novo em alguns minutos.";
        };
        throw new FalhaGeminiException(mensagem, false);
    }
}
