package com.icaroms.painel.dados.mes;

import com.icaroms.painel.dados.comum.ControladorDeRegistros;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rotas /api/meses (as rotas estão em ControladorDeRegistros). */
@RestController
@RequestMapping("/api/meses")
@Tag(name = "Meses")
public class MesController extends ControladorDeRegistros<MesDto> {

    public MesController(MesService servico) {
        super(servico);
    }
}
