package com.icaroms.painel.auth;

import com.icaroms.painel.erro.CredenciaisInvalidasException;
import com.icaroms.painel.usuario.Usuario;
import com.icaroms.painel.usuario.UsuarioRepository;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login: confere e-mail e senha e devolve um token.
 *
 * <p>Cuidados:
 * <ul>
 *   <li>Mesma mensagem para e-mail inexistente e senha errada.</li>
 *   <li>Mesmo quando o e-mail não existe, uma senha é comparada com um hash
 *       falso, para o tempo de resposta não denunciar quais e-mails existem.</li>
 *   <li>Limite de tentativas por IP e por e-mail.</li>
 * </ul>
 */
@Service
public class AuthService {

    private final UsuarioRepository usuarios;
    private final PasswordEncoder codificador;
    private final TokenService tokens;
    private final LimiteTentativasLogin limite;

    /** Hash de uma senha que ninguém usa, só para igualar o tempo de resposta. */
    private final String hashFalso;

    public AuthService(UsuarioRepository usuarios, PasswordEncoder codificador, TokenService tokens,
            LimiteTentativasLogin limite) {
        this.usuarios = usuarios;
        this.codificador = codificador;
        this.tokens = tokens;
        this.limite = limite;
        this.hashFalso = codificador.encode("senha-que-nao-pertence-a-ninguem");
    }

    @Transactional(readOnly = true)
    public TokenResponse entrar(LoginRequest pedido, String ip) {
        String email = Usuario.normalizarEmail(pedido.email());
        String chaveIp = "ip:" + ip;
        String chaveEmail = "email:" + email;

        limite.verificar(chaveIp, chaveEmail);

        Optional<Usuario> encontrado = usuarios.findByEmail(email);
        String hash = encontrado.map(Usuario::getSenhaHash).orElse(hashFalso);
        boolean senhaConfere = codificador.matches(pedido.senha(), hash);

        if (encontrado.isEmpty() || !senhaConfere) {
            limite.registrarFalha(chaveIp, chaveEmail);
            throw new CredenciaisInvalidasException();
        }

        limite.limpar(chaveIp, chaveEmail);
        return tokens.emitir(encontrado.get());
    }
}
