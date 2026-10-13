package com.icaroms.painel.dados.categoria;

import com.icaroms.painel.dados.comum.ControladorDeRegistros;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rotas /api/categorias (as rotas estão em ControladorDeRegistros). */
@RestController
@RequestMapping("/api/categorias")
@Tag(name = "Categorias")
public class CategoriaController extends ControladorDeRegistros<CategoriaDto> {

    public CategoriaController(CategoriaService servico) {
        super(servico);
    }
}
