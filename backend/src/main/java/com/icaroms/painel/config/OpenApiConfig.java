package com.icaroms.painel.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Documentação da API (OpenAPI 3). Com PAINEL_SWAGGER=true, a tela fica em
 * /swagger-ui.html; o botão "Authorize" aceita o token do login.
 * Em produção fica desligada.
 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    private static final String ESQUEMA_TOKEN = "token";

    @Bean
    public OpenAPI documentacaoDaApi(@Value("${painel.versao}") String versao) {
        return new OpenAPI()
                .info(new Info()
                        .title("Painel Financeiro API")
                        .version(versao)
                        .description("Backend do Painel Financeiro: login e dados do app."))
                .components(new Components().addSecuritySchemes(ESQUEMA_TOKEN, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(ESQUEMA_TOKEN));
    }
}
