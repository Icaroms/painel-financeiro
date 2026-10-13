package com.icaroms.painel.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * Tokens JWT assinados com HS256 (chave simétrica).
 *
 * <p>Por que HS256: só esta API emite e confere os tokens, então uma única
 * chave secreta basta. A chave vem da variável de ambiente
 * PAINEL_JWT_SEGREDO e nunca fica no código nem no GitHub. Trocar a chave
 * invalida todos os tokens (útil se houver suspeita de vazamento).
 */
@Configuration(proxyBeanMethods = false)
public class JwtConfig {

    @Bean
    public SecretKey chaveJwt(PainelProperties propriedades) {
        byte[] bytes = propriedades.jwt().segredo().getBytes(StandardCharsets.UTF_8);
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    public JwtEncoder jwtEncoder(SecretKey chaveJwt) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(chaveJwt));
    }

    /**
     * Confere assinatura, validade (exp) e emissor (iss) de cada token recebido.
     */
    @Bean
    public JwtDecoder jwtDecoder(SecretKey chaveJwt, PainelProperties propriedades) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(chaveJwt)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(propriedades.jwt().emissor()));
        return decoder;
    }
}
