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
 *   <li>O login abre uma sessão com token de renovação (ver SessaoService):
 *       o token de acesso dura pouco e o app renova sozinho.</li>
 * </ul>
 */
@Service
public class AuthService {

    private final UsuarioRepository usuarios;
    private final PasswordEncoder codificador;
    private final TokenService tokens;
    private final LimiteTentativasLogin limite;
    private final SessaoService sessoes;

    /** Hash de uma senha que ninguém usa, só para igualar o tempo de resposta. */
    private final String hashFalso;

    public AuthService(UsuarioRepository usuarios, PasswordEncoder codificador, TokenService tokens,
            LimiteTentativasLogin limite, SessaoService sessoes) {
        this.usuarios = usuarios;
        this.codificador = codificador;
        this.tokens = tokens;
        this.limite = limite;
        this.sessoes = sessoes;
        this.hashFalso = codificador.encode("senha-que-nao-pertence-a-ninguem");
    }

    @Transactional
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
        Usuario usuario = encontrado.get();
        return TokenResponse.bearer(tokens.emitir(usuario), sessoes.abrir(usuario.getId()));
    }

    /**
     * Troca o token de renovação por um token de acesso novo (e um token de
     * renovação novo: o usado deixa de valer).
     */
    @Transactional(noRollbackFor = SessaoInvalidaException.class)
    public TokenResponse renovar(String tokenRenovacao) {
        SessaoService.Renovacao renovacao = sessoes.renovar(tokenRenovacao);
        Usuario usuario = usuarios.findById(renovacao.usuarioId()).orElseThrow(SessaoInvalidaException::new);
        return TokenResponse.bearer(tokens.emitir(usuario), renovacao.novo());
    }

    /** "Sair": encerra a sessão deste aparelho. */
    public void sair(String tokenRenovacao) {
        sessoes.encerrar(tokenRenovacao);
    }
}
