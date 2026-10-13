package com.icaroms.painel.dados.investimento;

import com.icaroms.painel.dados.comum.Erros;
import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Investimentos: confere os campos de cada grupo, com as mesmas listas do app
 * (src/carteira.js, src/acoes.js e src/renda-fixa.js).
 */
@Service
public class InvestimentoService extends ServicoDeRegistros<Investimento, InvestimentoDto> {

    /** Tipos aceitos (TIPOS_DE_INVESTIMENTO). */
    static final Set<String> TIPOS = Set.of(
            "cdb", "tesouro", "lci-lca", "poupanca", "fundo", "outro-renda-fixa", "imovel", "acao", "fii");

    /** Registrados por operação (TIPOS_POR_OPERACAO). */
    static final Set<String> POR_OPERACAO = Set.of("acao", "fii");

    /** Podem ser reserva de emergência: o grupo "renda-fixa". */
    static final Set<String> PODEM_SER_RESERVA = Set.of(
            "cdb", "tesouro", "lci-lca", "poupanca", "fundo", "outro-renda-fixa");

    /** Aceitam taxa contratada (TIPOS_COM_TAXA). */
    static final Set<String> COM_TAXA = Set.of("cdb", "tesouro", "lci-lca", "outro-renda-fixa");

    /** Faixa aceita do número de cada indexador (INDEXADORES_CONTRATADOS). */
    static final Map<String, double[]> FAIXA_DA_TAXA = Map.of(
            "cdi", new double[] {1, 300},
            "prefixado", new double[] {0, 60},
            "ipca", new double[] {-5, 30});

    /** Código da bolsa, como PETR4, ITUB4 ou HGLG11. */
    private static final Pattern CODIGO = Pattern.compile("^[A-Z]{4}\\d{1,2}F?$");

    public InvestimentoService(InvestimentoRepository repositorio, Clock relogio) {
        super(repositorio, relogio);
    }

    @Override
    protected void validar(InvestimentoDto dto, Erros erros) {
        if (dto.getTipo() == null || !TIPOS.contains(dto.getTipo())) {
            erros.se(true, "tipo", "Escolha um tipo de investimento válido.");
            return;
        }
        if (POR_OPERACAO.contains(dto.getTipo())) {
            validarPorOperacao(dto, erros);
        } else {
            validarPorValor(dto, erros);
        }
    }

    private void validarPorOperacao(InvestimentoDto dto, Erros erros) {
        erros.se(dto.getNome() != null && !CODIGO.matcher(dto.getNome()).matches(),
                "nome", "Código inválido. Use o código da bolsa, como PETR4, ITUB4 ou HGLG11.");
        erros.se(dto.getOperacoes() == null || dto.getOperacoes().isEmpty(),
                "operacoes", "Ações e FIIs precisam de pelo menos uma operação.");
        erros.se(Boolean.TRUE.equals(dto.getReserva()),
                "reserva", "Ações e FIIs não podem ser a reserva de emergência.");
        erros.se(dto.getTaxa() != null, "taxa", "Ações e FIIs não têm taxa contratada.");
        erros.se(dto.getCotacaoCentavos() != null && dto.getCotacaoCentavos() <= 0,
                "cotacaoCentavos", "A cotação deve ser maior que zero.");
    }

    private void validarPorValor(InvestimentoDto dto, Erros erros) {
        erros.se(dto.getDataAplicacao() == null, "dataAplicacao", "Informe a data da aplicação.");
        erros.se(dto.getValorAplicadoCentavos() == null || dto.getValorAplicadoCentavos() <= 0,
                "valorAplicadoCentavos", "O valor aplicado deve ser maior que zero.");
        erros.se(dto.getValorAtualCentavos() == null || dto.getValorAtualCentavos() < 0,
                "valorAtualCentavos", "O valor atual deve ser zero ou mais.");
        erros.se(dto.getValorAtualEm() == null, "valorAtualEm", "Informe a data do valor atual.");
        erros.se(dto.getValorAtualEm() != null && dto.getDataAplicacao() != null
                        && dto.getValorAtualEm().isBefore(dto.getDataAplicacao()),
                "valorAtualEm", "A data do valor atual não pode ser antes da aplicação.");
        erros.se(Boolean.TRUE.equals(dto.getReserva()) && !PODEM_SER_RESERVA.contains(dto.getTipo()),
                "reserva", "Só renda fixa e fundos podem ser a reserva de emergência.");
        erros.se(dto.getOperacoes() != null && !dto.getOperacoes().isEmpty(),
                "operacoes", "Só ações e FIIs têm operações.");
        if (dto.getTaxa() != null) {
            validarTaxa(dto, erros);
        }
    }

    private void validarTaxa(InvestimentoDto dto, Erros erros) {
        if (!COM_TAXA.contains(dto.getTipo())) {
            erros.se(true, "taxa", "Este tipo de investimento não aceita taxa contratada.");
            return;
        }
        Object indexador = dto.getTaxa().get("indexador");
        Object percentual = dto.getTaxa().get("percentual");
        double[] faixa = indexador == null ? null : FAIXA_DA_TAXA.get(indexador.toString());
        if (faixa == null) {
            erros.se(true, "taxa", "Escolha o indexador da taxa: cdi, prefixado ou ipca.");
            return;
        }
        boolean numeroValido = percentual instanceof Number numero
                && numero.doubleValue() >= faixa[0] && numero.doubleValue() <= faixa[1];
        erros.se(!numeroValido, "taxa", "O número da taxa está fora da faixa aceita.");
    }

    @Override
    protected Investimento novaEntidade(UUID id, UUID usuarioId) {
        return new Investimento(id, usuarioId);
    }

    @Override
    protected InvestimentoDto novoDto() {
        return new InvestimentoDto();
    }

    @Override
    protected void copiarParaEntidade(InvestimentoDto dto, Investimento entidade) {
        boolean porOperacao = POR_OPERACAO.contains(dto.getTipo());
        entidade.setTipo(dto.getTipo());
        entidade.setNome(dto.getNome().trim());

        entidade.setDataAplicacao(porOperacao ? null : dto.getDataAplicacao());
        entidade.setValorAplicadoCentavos(porOperacao ? null : dto.getValorAplicadoCentavos());
        entidade.setValorAtualCentavos(porOperacao ? null : dto.getValorAtualCentavos());
        entidade.setValorAtualEm(porOperacao ? null : dto.getValorAtualEm());
        entidade.setReserva(!porOperacao && Boolean.TRUE.equals(dto.getReserva()));
        entidade.setTaxa(porOperacao || dto.getTaxa() == null ? null : Formatos.copiar(dto.getTaxa()));

        entidade.setCotacaoCentavos(porOperacao ? dto.getCotacaoCentavos() : null);
        entidade.setCotacaoEm(porOperacao ? dto.getCotacaoEm() : null);
        List<OperacaoInvestimento> operacoes = porOperacao
                ? dto.getOperacoes().stream().map(InvestimentoService::paraOperacao).toList()
                : List.of();
        entidade.trocarOperacoes(operacoes);
    }

    @Override
    protected void copiarParaDto(Investimento entidade, InvestimentoDto dto) {
        boolean porOperacao = POR_OPERACAO.contains(entidade.getTipo());
        dto.setTipo(entidade.getTipo());
        dto.setNome(entidade.getNome());
        if (porOperacao) {
            dto.setCotacaoCentavos(entidade.getCotacaoCentavos());
            dto.setCotacaoEm(entidade.getCotacaoEm());
            dto.setOperacoes(entidade.getOperacoes().stream().map(InvestimentoService::operacaoParaDto).toList());
        } else {
            dto.setDataAplicacao(entidade.getDataAplicacao());
            dto.setValorAplicadoCentavos(entidade.getValorAplicadoCentavos());
            dto.setValorAtualCentavos(entidade.getValorAtualCentavos());
            dto.setValorAtualEm(entidade.getValorAtualEm());
            dto.setReserva(entidade.isReserva());
            dto.setTaxa(entidade.getTaxa());
        }
    }

    private static OperacaoInvestimento paraOperacao(OperacaoDto dto) {
        long custos = dto.getCustosCentavos() == null ? 0L : dto.getCustosCentavos();
        return new OperacaoInvestimento(dto.getId(), dto.getTipo(), dto.getData(), dto.getQuantidade(),
                dto.getPrecoCentavos(), custos, dto.getExtras());
    }

    private static OperacaoDto operacaoParaDto(OperacaoInvestimento operacao) {
        OperacaoDto dto = new OperacaoDto();
        dto.setId(operacao.getId());
        dto.setTipo(operacao.getTipo());
        dto.setData(operacao.getData());
        dto.setQuantidade(operacao.getQuantidade());
        dto.setPrecoCentavos(operacao.getPrecoCentavos());
        dto.setCustosCentavos(operacao.getCustosCentavos());
        if (operacao.getExtras() != null) {
            operacao.getExtras().forEach(dto::guardarExtra);
        }
        return dto;
    }
}
