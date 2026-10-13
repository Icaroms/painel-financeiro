package com.icaroms.painel.dados;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.icaroms.painel.auth.TokenService;
import com.icaroms.painel.suporte.TesteIntegracao;
import com.icaroms.painel.usuario.Usuario;
import com.icaroms.painel.usuario.UsuarioRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Base dos testes das listas de dados: cada teste cria a sua própria conta,
 * para uma lista não interferir na outra.
 */
public abstract class TesteDeDados extends TesteIntegracao {

    /** Momentos fixos usados como criadoEm/atualizadoEm nos registros de teste. */
    protected static final String T1 = "2026-10-13T12:00:00.000Z";
    protected static final String T2 = "2026-10-13T13:00:00.000Z";
    protected static final String T3 = "2026-10-13T14:00:00.000Z";

    /** Hash de senha qualquer: estes testes entram pelo token, não pelo login. */
    private static final String HASH_QUALQUER = "{noop}nao-usada";

    @Autowired
    private UsuarioRepository usuarios;

    @Autowired
    private TokenService tokens;

    /** Cria uma conta nova e devolve o cabeçalho "Bearer ..." dela. */
    protected String novaConta() {
        String email = "conta-" + UUID.randomUUID() + "@teste.local";
        Usuario conta = usuarios.save(new Usuario(UUID.randomUUID(), email, HASH_QUALQUER, Instant.now()));
        return "Bearer " + tokens.emitir(conta).token();
    }

    protected static String novoId() {
        return UUID.randomUUID().toString();
    }

    protected MvcResult gravar(String conta, String caminho, String json) throws Exception {
        return mvc.perform(put(caminho).header(HttpHeaders.AUTHORIZATION, conta)
                .contentType(MediaType.APPLICATION_JSON).content(json)).andReturn();
    }

    protected MvcResult ler(String conta, String caminho) throws Exception {
        return mvc.perform(get(caminho).header(HttpHeaders.AUTHORIZATION, conta)).andReturn();
    }

    protected MvcResult excluir(String conta, String caminho) throws Exception {
        return mvc.perform(delete(caminho).header(HttpHeaders.AUTHORIZATION, conta)).andReturn();
    }

    protected static int status(MvcResult resultado) {
        return resultado.getResponse().getStatus();
    }
}
