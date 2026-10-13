package com.icaroms.painel.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icaroms.painel.suporte.TesteIntegracao;
import com.icaroms.painel.usuario.UsuarioRepository;
import com.jayway.jsonpath.DocumentContext;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MvcResult;

/** Login, token e rotas protegidas, de ponta a ponta. */
class AuthIntegracaoTest extends TesteIntegracao {

    private static final String EMAIL = "teste@painel.local";
    private static final String SENHA = "senha-de-teste-123";

    @Autowired
    private LimiteTentativasLogin limite;

    @Autowired
    private JwtDecoder leitorDeToken;

    @Autowired
    private UsuarioRepository usuarios;

    @BeforeEach
    void zerarTentativas() {
        limite.limparTudo();
    }

    @Test
    @DisplayName("login certo devolve um token Bearer com a conta no 'sub'")
    void loginCertoDevolveToken() throws Exception {
        MvcResult resultado = mvc.perform(login(EMAIL, SENHA))
                .andExpect(status().isOk())
                .andReturn();

        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.tipo", String.class)).isEqualTo("Bearer");
        assertThat(resposta.read("$.expiraEm", String.class)).isNotBlank();

        Jwt token = leitorDeToken.decode(resposta.read("$.token", String.class));
        String idDaConta = usuarios.findByEmail(EMAIL).orElseThrow().getId().toString();
        assertThat(token.getSubject()).isEqualTo(idDaConta);
        assertThat(token.getClaimAsString("email")).isEqualTo(EMAIL);
        assertThat(token.getClaimAsString("iss")).isEqualTo("painel-financeiro-api");
    }

    @Test
    @DisplayName("e-mail com letras maiúsculas também entra")
    void emailSemDiferencaDeCaixa() throws Exception {
        mvc.perform(login("TESTE@Painel.Local", SENHA)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("senha errada: 401 com mensagem genérica")
    void senhaErrada() throws Exception {
        MvcResult resultado = mvc.perform(login(EMAIL, "senha-errada-123"))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertThat(corpo(resultado).read("$.detail", String.class)).isEqualTo("E-mail ou senha incorretos.");
    }

    @Test
    @DisplayName("e-mail inexistente: mesma resposta da senha errada")
    void emailInexistente() throws Exception {
        MvcResult resultado = mvc.perform(login("ninguem@painel.local", SENHA))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertThat(corpo(resultado).read("$.detail", String.class)).isEqualTo("E-mail ou senha incorretos.");
    }

    @Test
    @DisplayName("depois de 5 erros, bloqueia até com a senha certa (429 + Retry-After)")
    void bloqueiaDepoisDeCincoErros() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(login(EMAIL, "senha-errada-123")).andExpect(status().isUnauthorized());
        }

        MvcResult resultado = mvc.perform(login(EMAIL, SENHA))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andReturn();

        assertThat(corpo(resultado).read("$.title", String.class)).isEqualTo("Muitas tentativas");
    }

    @Test
    @DisplayName("rota protegida sem token: 401 em JSON")
    void rotaProtegidaSemToken() throws Exception {
        MvcResult resultado = mvc.perform(get("/api/auth/eu"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andReturn();

        assertThat(corpo(resultado).read("$.title", String.class)).isEqualTo("Não autenticado");
    }

    @Test
    @DisplayName("rota protegida com token: mostra a conta")
    void rotaProtegidaComToken() throws Exception {
        String token = entrar();

        MvcResult resultado = mvc.perform(get("/api/auth/eu").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(corpo(resultado).read("$.email", String.class)).isEqualTo(EMAIL);
    }

    @Test
    @DisplayName("token adulterado: 401 com aviso de sessão inválida")
    void tokenAdulterado() throws Exception {
        String token = entrar();
        String adulterado = token.substring(0, token.lastIndexOf('.') + 1) + "assinatura-falsa";

        MvcResult resultado = mvc.perform(get("/api/auth/eu").header(HttpHeaders.AUTHORIZATION, "Bearer " + adulterado))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertThat(corpo(resultado).read("$.detail", String.class)).contains("inválida ou expirada");
    }

    @Test
    @DisplayName("campos inválidos: 400 com a mensagem de cada campo")
    void camposInvalidos() throws Exception {
        MvcResult resultado = mvc.perform(login("nao-e-email", ""))
                .andExpect(status().isBadRequest())
                .andReturn();

        DocumentContext resposta = corpo(resultado);
        assertThat(resposta.read("$.title", String.class)).isEqualTo("Dados inválidos");
        assertThat(resposta.read("$.campos.email", String.class)).isEqualTo("Informe um e-mail válido.");
        assertThat(resposta.read("$.campos.senha", String.class)).isEqualTo("Informe a senha.");
    }

    @Test
    @DisplayName("JSON quebrado: 400 sem detalhes internos")
    void jsonQuebrado() throws Exception {
        MvcResult resultado = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest())
                .andReturn();

        assertThat(corpo(resultado).read("$.title", String.class)).isEqualTo("Pedido inválido");
    }

    /* ---------------------------------------------------------------- */

    private org.springframework.test.web.servlet.RequestBuilder login(String email, String senha) throws Exception {
        return post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "senha", senha)));
    }

    private String entrar() throws Exception {
        MvcResult resultado = mvc.perform(login(EMAIL, SENHA)).andExpect(status().isOk()).andReturn();
        return corpo(resultado).read("$.token", String.class);
    }
}
