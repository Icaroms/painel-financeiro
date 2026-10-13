package com.icaroms.painel.dados.lancamento;

import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Lançamentos: aplica os valores padrão de campos antigos (parcelas 1, descrição vazia). */
@Service
public class LancamentoService extends ServicoDeRegistros<Lancamento, LancamentoDto> {

    public LancamentoService(LancamentoRepository repositorio, Clock relogio) {
        super(repositorio, relogio);
    }

    @Override
    protected Lancamento novaEntidade(UUID id, UUID usuarioId) {
        return new Lancamento(id, usuarioId);
    }

    @Override
    protected LancamentoDto novoDto() {
        return new LancamentoDto();
    }

    @Override
    protected void copiarParaEntidade(LancamentoDto dto, Lancamento entidade) {
        entidade.setValorCentavos(dto.getValorCentavos());
        entidade.setCategoriaId(dto.getCategoriaId());
        entidade.setFormaPagamento(dto.getFormaPagamento());
        entidade.setData(dto.getData());
        entidade.setDescricao(dto.getDescricao() == null ? "" : dto.getDescricao().trim());
        entidade.setParcelas(dto.getParcelas() == null ? 1 : dto.getParcelas());
        entidade.setConversao(dto.getConversao() == null ? null : Formatos.copiar(dto.getConversao()));
    }

    @Override
    protected void copiarParaDto(Lancamento entidade, LancamentoDto dto) {
        dto.setValorCentavos(entidade.getValorCentavos());
        dto.setCategoriaId(entidade.getCategoriaId());
        dto.setFormaPagamento(entidade.getFormaPagamento());
        dto.setData(entidade.getData());
        dto.setDescricao(entidade.getDescricao());
        dto.setParcelas(entidade.getParcelas());
        dto.setConversao(entidade.getConversao());
    }
}
