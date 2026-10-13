-- Fase 05, parte 5.3: sessões de login com token de renovação.
--
-- O token de acesso (JWT) dura pouco (15 min). Para não pedir a senha
-- de novo, o app guarda um "token de renovação" (30 dias) e troca por um
-- token de acesso novo quando o antigo vence.
--
-- Regras:
-- - só o HASH (SHA-256) do token de renovação é guardado, nunca o token;
-- - cada renovação troca o token de renovação por outro (rotação) e marca
--   o antigo como "renovada";
-- - se um token já renovado for usado de novo, alguém copiou o token:
--   todas as sessões da conta são encerradas ("reuso");
-- - "Sair" no app encerra a sessão ("saida").

CREATE TABLE sessoes (
    id                UUID         PRIMARY KEY,
    usuario_id        UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    hash_token        VARCHAR(64)  NOT NULL,
    criada_em         TIMESTAMPTZ  NOT NULL,
    expira_em         TIMESTAMPTZ  NOT NULL,
    revogada_em       TIMESTAMPTZ,
    motivo_revogacao  VARCHAR(20)  CHECK (motivo_revogacao IN ('renovada', 'saida', 'reuso')),
    CONSTRAINT uk_sessoes_hash UNIQUE (hash_token)
);
CREATE INDEX ix_sessoes_usuario ON sessoes (usuario_id);
