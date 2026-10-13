package com.icaroms.painel.auth;

import com.icaroms.painel.config.PainelProperties;
import com.icaroms.painel.usuario.Usuario;
import java.time.Clock;
import java.time.Instant;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Emite os tokens JWT do login.
 *
 * <p>Conteúdo do token: emissor (iss), conta (sub = id do usuário), e-mail,
 * emitido em (iat) e expira em (exp). Nenhum dado financeiro vai no token.
 */
@Service
public class TokenService {

    private final JwtEncoder codificador;
    private final PainelProperties propriedades;
    private final Clock relogio;

    public TokenService(JwtEncoder codificador, PainelProperties propriedades, Clock relogio) {
        this.codificador = codificador;
        this.propriedades = propriedades;
        this.relogio = relogio;
    }

    public TokenResponse emitir(Usuario usuario) {
        Instant agora = relogio.instant();
        Instant expiraEm = agora.plus(propriedades.jwt().validade());

        JwtClaimsSet dados = JwtClaimsSet.builder()
                .issuer(propriedades.jwt().emissor())
                .subject(usuario.getId().toString())
                .claim("email", usuario.getEmail())
                .issuedAt(agora)
                .expiresAt(expiraEm)
                .build();
        JwsHeader cabecalho = JwsHeader.with(MacAlgorithm.HS256).build();

        String token = codificador.encode(JwtEncoderParameters.from(cabecalho, dados)).getTokenValue();
        return TokenResponse.bearer(token, expiraEm);
    }
}
