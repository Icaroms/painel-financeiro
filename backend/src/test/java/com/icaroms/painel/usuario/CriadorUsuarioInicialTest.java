package com.icaroms.painel.usuario;

import static org.assertj.core.api.Assertions.assertThat;

import com.icaroms.painel.suporte.TesteIntegracao;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Cadastro fechado: a conta nasce das variáveis, com a senha só em hash. */
class CriadorUsuarioInicialTest extends TesteIntegracao {

    @Autowired
    private UsuarioRepository usuarios;

    @Test
    void criaAContaComSenhaEmBcrypt() {
        Usuario conta = usuarios.findByEmail("teste@painel.local").orElseThrow();

        assertThat(usuarios.count()).isEqualTo(1);
        assertThat(conta.getSenhaHash()).startsWith("{bcrypt}").doesNotContain("senha-de-teste-123");
        assertThat(conta.getCriadoEm()).isNotNull();
    }

    @Test
    void mascaraOEmailNoLog() {
        assertThat(CriadorUsuarioInicial.mascarar("icaro@gmail.com")).isEqualTo("ic***@gmail.com");
        assertThat(CriadorUsuarioInicial.mascarar("ab@x.io")).isEqualTo("***@x.io");
    }
}
