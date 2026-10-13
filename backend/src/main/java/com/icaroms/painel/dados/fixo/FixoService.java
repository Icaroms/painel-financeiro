package com.icaroms.painel.dados.fixo;

import com.icaroms.painel.dados.comum.Erros;
import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Contas fixas: confere que o mês final não vem antes do inicial. */
@Service
public class FixoService extends ServicoDeRegistros<Fixo, FixoDto> {

    public FixoService(FixoRepository repositorio, Clock relogio) {
        super(repositorio, relogio);
    }

    @Override
    protected void validar(FixoDto dto, Erros erros) {
        erros.se(dto.getMesFinal() != null && dto.getMesInicial() != null
                        && dto.getMesFinal().compareTo(dto.getMesInicial()) < 0,
                "mesFinal", "O mês final não pode ser antes do mês inicial.");
    }

    @Override
    protected Fixo novaEntidade(UUID id, UUID usuarioId) {
        return new Fixo(id, usuarioId);
    }

    @Override
    protected FixoDto novoDto() {
        return new FixoDto();
    }

    @Override
    protected void copiarParaEntidade(FixoDto dto, Fixo entidade) {
        entidade.setNome(dto.getNome().trim());
        entidade.setValorCentavos(dto.getValorCentavos());
        entidade.setDiaVencimento(dto.getDiaVencimento());
        entidade.setFormaPagamento(dto.getFormaPagamento());
        entidade.setMesInicial(dto.getMesInicial());
        entidade.setMesFinal(dto.getMesFinal());
        entidade.setPagamentoAutomatico(dto.getPagamentoAutomatico());
    }

    @Override
    protected void copiarParaDto(Fixo entidade, FixoDto dto) {
        dto.setNome(entidade.getNome());
        dto.setValorCentavos(entidade.getValorCentavos());
        dto.setDiaVencimento(entidade.getDiaVencimento());
        dto.setFormaPagamento(entidade.getFormaPagamento());
        dto.setMesInicial(entidade.getMesInicial());
        dto.setMesFinal(entidade.getMesFinal());
        dto.setPagamentoAutomatico(entidade.isPagamentoAutomatico());
    }
}
