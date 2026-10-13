package com.icaroms.painel.config;

import com.icaroms.painel.erro.RespostaNaoAutenticado;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Regras de segurança da API.
 *
 * <ul>
 *   <li>Sem sessão no servidor (stateless): cada pedido traz o token no
 *       cabeçalho {@code Authorization: Bearer ...}.</li>
 *   <li>CSRF desligado: ele protege cookies de sessão, e aqui não há cookies.</li>
 *   <li>Rotas públicas: saúde, login e (se ligada) a documentação Swagger.
 *       Todo o resto exige token válido.</li>
 *   <li>CORS: só as origens listadas em PAINEL_CORS_ORIGENS podem chamar a API
 *       pelo navegador.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
public class SegurancaConfig {

    /** Rotas que não pedem login. */
    private static final String[] ROTAS_DOCUMENTACAO = {"/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html"};

    @Bean
    public SecurityFilterChain filtrosDeSeguranca(HttpSecurity http, RespostaNaoAutenticado naoAutenticado)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(sessao -> sessao.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(regras -> regras
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/saude").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers(ROTAS_DOCUMENTACAO).permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(recurso -> recurso
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(naoAutenticado))
                .exceptionHandling(erros -> erros.authenticationEntryPoint(naoAutenticado))
                .headers(cabecalhos -> cabecalhos
                        .frameOptions(moldura -> moldura.deny())
                        .referrerPolicy(origem -> origem.policy(ReferrerPolicy.NO_REFERRER)));
        return http.build();
    }

    /**
     * Senhas guardadas com BCrypt, no formato "{bcrypt}$2a$...". O prefixo
     * permite trocar o algoritmo no futuro sem invalidar senhas antigas.
     */
    @Bean
    public PasswordEncoder codificadorDeSenha() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /**
     * CORS: o app (PWA) roda em outra origem (outra porta ou outro domínio),
     * então o navegador pergunta antes (pedido OPTIONS) se pode chamar a API.
     * Só as origens configuradas recebem "sim".
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(PainelProperties propriedades) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(propriedades.cors().origens().stream().map(String::trim).toList());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setExposedHeaders(List.of("Retry-After"));
        cors.setAllowCredentials(false);
        cors.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource fonte = new UrlBasedCorsConfigurationSource();
        fonte.registerCorsConfiguration("/api/**", cors);
        return fonte;
    }
}
