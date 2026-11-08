package com.icaroms.painel.ia;

import com.icaroms.painel.config.PainelProperties;
import com.icaroms.painel.dados.comum.Erros;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * IA pelo servidor (parte 5.5): a chave do Gemini fica no servidor
 * (variável PAINEL_GEMINI_CHAVE) e cada conta tem um limite de pedidos por
 * dia, contado no banco.
 *
 * <p>A regra do app continua: os números são calculados no app; a IA só
 * explica e sugere. O servidor não guarda nem o pedido nem a resposta.
 */
@Service
public class IaService {

    /** O "dia" do limite é o de Brasília, como no app. */
    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final PainelProperties.Ia config;
    private final UsoIaRepository uso;
    private final ClienteGemini gemini;
    private final Clock relogio;

    public IaService(PainelProperties propriedades, UsoIaRepository uso, ClienteGemini gemini, Clock relogio) {
        this.config = propriedades.ia();
        this.uso = uso;
        this.gemini = gemini;
        this.relogio = relogio;
    }

    private LocalDate hoje() {
        return LocalDate.now(relogio.withZone(FUSO));
    }

    /** Quanto falta para a meia-noite de Brasília (quando o limite volta). */
    private Duration ateAmanha() {
        ZonedDateTime agora = ZonedDateTime.now(relogio.withZone(FUSO));
        return Duration.between(agora, agora.toLocalDate().plusDays(1).atStartOfDay(FUSO));
    }

    public SituacaoIa situacao(UUID usuarioId) {
        return new SituacaoIa(config.ligada(), config.modelos(), uso.usados(usuarioId, hoje()), config.limiteDiario());
    }

    /**
     * Confere o pedido, conta no limite do dia e pergunta ao Gemini.
     * O pedido conta mesmo se o Gemini falhar: assim o limite também protege
     * contra repetições seguidas.
     */
    public RespostaIa gerar(UUID usuarioId, PedidoIa pedido) {
        if (!config.ligada()) {
            throw new IaIndisponivelException();
        }
        int tamanho = pedido.instrucoes().length() + pedido.conteudo().length();
        new Erros()
                .se(tamanho > config.tamanhoMaximo(), "conteudo",
                        "O pedido passa do tamanho máximo (" + config.tamanhoMaximo() + " caracteres).")
                .lancarSeHouver();

        int usados = uso.registrar(usuarioId, hoje(), config.limiteDiario())
                .orElseThrow(() -> new LimiteIaException(config.limiteDiario(), ateAmanha()));
        String modelo = config.modelos().contains(pedido.modelo()) ? pedido.modelo() : config.modelos().get(0);
        String texto = gemini.gerar(modelo, pedido.instrucoes(), pedido.conteudo());
        return new RespostaIa(texto, usados, config.limiteDiario());
    }
}
