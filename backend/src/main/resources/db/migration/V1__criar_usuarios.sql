-- Fase 05, parte 5.1: conta de quem usa o app (cadastro fechado).
--
-- Regras:
-- - id em UUID, como os registros do front;
-- - e-mail único e sempre em minúsculas;
-- - só o hash da senha (BCrypt, formato "{bcrypt}$2a$..."), nunca a senha.

CREATE TABLE usuarios (
    id             UUID         PRIMARY KEY,
    email          VARCHAR(254) NOT NULL,
    senha_hash     VARCHAR(100) NOT NULL,
    criado_em      TIMESTAMPTZ  NOT NULL,
    atualizado_em  TIMESTAMPTZ  NOT NULL,

    CONSTRAINT uk_usuarios_email UNIQUE (email),
    CONSTRAINT ck_usuarios_email_minusculo CHECK (email = lower(email))
);
