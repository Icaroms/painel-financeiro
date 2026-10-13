package com.icaroms.painel.dados.categoria;

import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Categorias: só conversão de campos; as regras comuns estão na classe mãe. */
@Service
public class CategoriaService extends ServicoDeRegistros<Categoria, CategoriaDto> {

    public CategoriaService(CategoriaRepository repositorio, Clock relogio) {
        super(repositorio, relogio);
    }

    @Override
    protected Categoria novaEntidade(UUID id, UUID usuarioId) {
        return new Categoria(id, usuarioId);
    }

    @Override
    protected CategoriaDto novoDto() {
        return new CategoriaDto();
    }

    @Override
    protected void copiarParaEntidade(CategoriaDto dto, Categoria entidade) {
        entidade.setNome(dto.getNome().trim());
        entidade.setOrcamentoCentavos(dto.getOrcamentoCentavos());
    }

    @Override
    protected void copiarParaDto(Categoria entidade, CategoriaDto dto) {
        dto.setNome(entidade.getNome());
        dto.setOrcamentoCentavos(entidade.getOrcamentoCentavos());
    }
}
