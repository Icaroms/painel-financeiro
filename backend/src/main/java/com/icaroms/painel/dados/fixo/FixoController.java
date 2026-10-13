package com.icaroms.painel.dados.fixo;

import com.icaroms.painel.dados.comum.ControladorDeRegistros;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rotas /api/fixos (as rotas estão em ControladorDeRegistros). */
@RestController
@RequestMapping("/api/fixos")
@Tag(name = "Contas fixas")
public class FixoController extends ControladorDeRegistros<FixoDto> {

    public FixoController(FixoService servico) {
        super(servico);
    }
}
