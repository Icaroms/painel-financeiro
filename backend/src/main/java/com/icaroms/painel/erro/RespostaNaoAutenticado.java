package com.icaroms.painel.erro;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Resposta 401 em JSON (problem+json), igual às outras respostas de erro.
 *
 * <p>Sem isto, o Spring Security devolve 401 com o corpo vazio. A mensagem
 * diz se faltou o token ou se ele é inválido/expirado, sem detalhes internos.
 */
@Component
public class RespostaNaoAutenticado implements AuthenticationEntryPoint {

    private final ObjectMapper json;

    public RespostaNaoAutenticado(ObjectMapper json) {
        this.json = json;
    }

    @Override
    public void commence(HttpServletRequest pedido, HttpServletResponse resposta, AuthenticationException erro)
            throws IOException {
        boolean tokenInvalido = erro instanceof InvalidBearerTokenException;

        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("type", "about:blank");
        corpo.put("title", "Não autenticado");
        corpo.put("status", HttpStatus.UNAUTHORIZED.value());
        corpo.put("detail", tokenInvalido
                ? "Sessão inválida ou expirada. Entre de novo."
                : "Entre na sua conta para continuar.");
        corpo.put("instance", pedido.getRequestURI());

        resposta.setStatus(HttpStatus.UNAUTHORIZED.value());
        resposta.setHeader(HttpHeaders.WWW_AUTHENTICATE, tokenInvalido ? "Bearer error=\"invalid_token\"" : "Bearer");
        resposta.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        resposta.setCharacterEncoding("UTF-8");
        json.writeValue(resposta.getOutputStream(), corpo);
    }
}
