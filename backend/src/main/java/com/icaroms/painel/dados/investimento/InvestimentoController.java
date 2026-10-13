package com.icaroms.painel.dados.investimento;

import com.icaroms.painel.dados.comum.ControladorDeRegistros;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rotas /api/investimentos (as rotas estão em ControladorDeRegistros). */
@RestController
@RequestMapping("/api/investimentos")
@Tag(name = "Investimentos")
public class InvestimentoController extends ControladorDeRegistros<InvestimentoDto> {

    public InvestimentoController(InvestimentoService servico) {
        super(servico);
    }
}
