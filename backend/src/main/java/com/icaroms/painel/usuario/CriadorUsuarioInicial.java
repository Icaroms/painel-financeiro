package com.icaroms.painel.usuario;

import com.icaroms.painel.config.PainelProperties;
import java.time.Clock;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cadastro fechado: cria a única conta na primeira subida da API.
 *
 * <ul>
 *   <li>Banco já tem usuário: não faz nada (as variáveis são ignoradas).</li>
 *   <li>Banco vazio e variáveis definidas: cria a conta com a senha em BCrypt.</li>
 *   <li>Banco vazio sem variáveis: só avisa no log; ninguém consegue entrar.</li>
 * </ul>
 */
@Component
public class CriadorUsuarioInicial implements ApplicationRunner {

    /** Senha mínima: 12 caracteres (frase-senha é o ideal). */
    static final int TAMANHO_MINIMO_SENHA = 12;

    private static final Logger LOG = LoggerFactory.getLogger(CriadorUsuarioInicial.class);

    private final UsuarioRepository usuarios;
    private final PasswordEncoder codificador;
    private final PainelProperties propriedades;
    private final Clock relogio;

    public CriadorUsuarioInicial(UsuarioRepository usuarios, PasswordEncoder codificador,
            PainelProperties propriedades, Clock relogio) {
        this.usuarios = usuarios;
        this.codificador = codificador;
        this.propriedades = propriedades;
        this.relogio = relogio;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments argumentos) {
        if (usuarios.count() > 0) {
            return;
        }

        PainelProperties.UsuarioInicial inicial = propriedades.usuarioInicial();
        if (inicial == null || vazio(inicial.email()) || vazio(inicial.senha())) {
            LOG.warn("Nenhuma conta cadastrada. Defina PAINEL_USUARIO_EMAIL e PAINEL_USUARIO_SENHA "
                    + "e reinicie a API para criar a conta.");
            return;
        }
        if (inicial.senha().length() < TAMANHO_MINIMO_SENHA) {
            throw new IllegalStateException(
                    "PAINEL_USUARIO_SENHA precisa ter pelo menos " + TAMANHO_MINIMO_SENHA + " caracteres.");
        }

        Usuario usuario = new Usuario(UUID.randomUUID(), inicial.email(),
                codificador.encode(inicial.senha()), relogio.instant());
        usuarios.save(usuario);
        LOG.info("Conta inicial criada para {}", mascarar(usuario.getEmail()));
    }

    private static boolean vazio(String texto) {
        return texto == null || texto.isBlank();
    }

    /** "icaro@gmail.com" vira "ic***@gmail.com" no log. */
    static String mascarar(String email) {
        int arroba = email.indexOf('@');
        if (arroba <= 2) {
            return "***" + email.substring(Math.max(arroba, 0));
        }
        return email.substring(0, 2) + "***" + email.substring(arroba);
    }
}
