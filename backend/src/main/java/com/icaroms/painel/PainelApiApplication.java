package com.icaroms.painel;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Ponto de entrada da API do Painel Financeiro.
 *
 * <p>Organização dos pacotes (um pacote por assunto):
 * <ul>
 *   <li>{@code config}: configurações (segurança, CORS, JWT, OpenAPI, propriedades);</li>
 *   <li>{@code saude}: rota pública que diz se a API e o banco estão no ar;</li>
 *   <li>{@code usuario}: a conta de quem usa o app (cadastro fechado);</li>
 *   <li>{@code auth}: login, emissão de token e limite de tentativas;</li>
 *   <li>{@code erro}: respostas de erro padronizadas (RFC 9457, "problem+json").</li>
 * </ul>
 *
 * <p>Regra do projeto: as regras do app calculam no front; o backend guarda,
 * valida e protege os dados.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class PainelApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(PainelApiApplication.class, args);
    }
}
