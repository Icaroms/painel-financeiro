-- Fase 05, parte 5.5: IA pelo servidor.
--
-- A chave do Gemini fica numa variável de ambiente do servidor
-- (PAINEL_GEMINI_CHAVE), nunca no banco. Aqui só se conta quantos pedidos
-- cada conta fez em cada dia (no fuso de Brasília), para o limite diário
-- (painel.ia.limite-diario) proteger a cota do Gemini.

CREATE TABLE uso_ia (
    usuario_id  UUID     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    dia         DATE     NOT NULL,
    pedidos     INTEGER  NOT NULL CHECK (pedidos >= 0),
    PRIMARY KEY (usuario_id, dia)
);
