package com.icaroms.painel.dados.lancamento;

import com.icaroms.painel.dados.comum.ControladorDeRegistros;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rotas /api/lancamentos (as rotas estão em ControladorDeRegistros). */
@RestController
@RequestMapping("/api/lancamentos")
@Tag(name = "Lançamentos")
public class LancamentoController extends ControladorDeRegistros<LancamentoDto> {

    public LancamentoController(LancamentoService servico) {
        super(servico);
    }
}
