# Painel Financeiro API

Backend do Painel Financeiro (Fase 05): login, banco PostgreSQL e API REST para o app (PWA).

**Regra:** as regras do app calculam no front; o backend guarda, valida e protege os dados.

## Tecnologias

- Java 21 e Spring Boot 3.5
- Spring Security com senha em BCrypt e token JWT (HS256)
- PostgreSQL, Flyway (migrações) e JPA/Hibernate
- springdoc (Swagger UI) para documentar a API
- JUnit 5, MockMvc e PostgreSQL embutido (zonky) nos testes, sem Docker

## Rodar no seu computador

Pré-requisito: **Java 21** (`java -version`). O Maven não precisa ser instalado, porque o `mvnw` baixa sozinho na primeira vez.
Também não precisa instalar o PostgreSQL: o modo dev usa um PostgreSQL embutido.

```bat
cd backend
mvnw verify
mvnw spring-boot:test-run -Dspring-boot.run.main-class=com.icaroms.paineldev.PainelApiDev
```

- `mvnw verify` compila e roda todos os testes.
- O segundo comando sobe a API em modo dev, em http://localhost:8081.
  - Conta de desenvolvimento: `dev@painel.local` / `senha-dev-123456`.
  - Swagger: http://localhost:8081/swagger-ui.html
  - Os dados ficam em `backend/.banco-dev` (fora do Git). Para começar do zero, pare a API e apague essa pasta.

Teste rápido:

```bat
curl http://localhost:8081/api/saude
curl -X POST http://localhost:8081/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"dev@painel.local\",\"senha\":\"senha-dev-123456\"}"
```

## Rotas

| Método | Rota | Login? | O que faz |
|---|---|---|---|
| GET | `/api/saude` | não | 200 se a API e o banco estão no ar; 503 se o banco não responde |
| POST | `/api/auth/login` | não | E-mail e senha → token JWT. Depois de 5 erros em 15 min, responde 429 |
| GET | `/api/auth/eu` | sim | Conta dona do token e quando ele expira |

Os erros seguem o formato `application/problem+json` (RFC 9457), em português:

```json
{ "type": "about:blank", "title": "Dados inválidos", "status": 400,
  "detail": "Confira os campos destacados.", "campos": { "email": "Informe um e-mail válido." } }
```

## Variáveis de ambiente (produção)

Segredos **nunca** vão para o código, para arquivos do projeto ou para o chat. Na hospedagem, eles ficam nas variáveis de ambiente do serviço.

| Variável | Obrigatória | Exemplo / padrão |
|---|---|---|
| `PAINEL_DB_URL` | sim | `jdbc:postgresql://host:5432/painel?sslmode=require` |
| `PAINEL_DB_USUARIO` / `PAINEL_DB_SENHA` | sim | dados do banco |
| `PAINEL_JWT_SEGREDO` | sim | texto aleatório com 32+ caracteres (ver abaixo) |
| `PAINEL_CORS_ORIGENS` | sim | endereço do app, ex.: `https://meu-app.exemplo` (sem barra no fim; várias separadas por vírgula) |
| `PAINEL_USUARIO_EMAIL` / `PAINEL_USUARIO_SENHA` | 1ª subida | criam a única conta (senha com 12+ caracteres); depois podem ser apagadas |
| `PAINEL_JWT_VALIDADE` | não | `12h` |
| `PAINEL_DB_POOL` | não | `5` |
| `PAINEL_FORWARD_HEADERS` | não | `framework` quando estiver atrás do proxy da hospedagem |
| `PAINEL_SWAGGER` | não | `false` (deixe desligado em produção) |
| `PORT` | não | `8081` (a hospedagem costuma definir) |

Para gerar um segredo do JWT no PowerShell:

```powershell
$b = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

Trocar o `PAINEL_JWT_SEGREDO` desconecta todos os aparelhos. Faça isso se houver suspeita de vazamento.

## Segurança

- **Cadastro fechado:** não existe rota de cadastro. A conta nasce das variáveis na primeira subida.
- **Senha:** guardada só como hash BCrypt.
- **E-mail:** a mensagem é a mesma para e-mail inexistente e para senha errada, e o tempo de resposta é igualado.
- **Tentativas:** limite por IP e por e-mail.
- **Sessão:** sem sessão no servidor e sem cookies (por isso o CSRF fica desligado). O token vai no cabeçalho `Authorization`.
- **CORS:** só as origens configuradas podem chamar a API pelo navegador.
- **Cabeçalhos:** `X-Content-Type-Options`, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer`.
- **Erros:** respostas sem pilha de erro e sem SQL.

## Estrutura

```
backend/
├── pom.xml, mvnw, mvnw.cmd, .mvn/      Maven (com wrapper)
└── src/
    ├── main/java/com/icaroms/painel/
    │   ├── config/    segurança, CORS, JWT, OpenAPI, propriedades, relógio
    │   ├── saude/     GET /api/saude
    │   ├── usuario/   conta (entidade, repositório, criação inicial)
    │   ├── auth/      login, token, limite de tentativas
    │   └── erro/      respostas problem+json
    ├── main/resources/
    │   ├── application.yml
    │   └── db/migration/   V1__criar_usuarios.sql ...
    └── test/
        ├── java/com/icaroms/painel/    testes
        ├── java/com/icaroms/paineldev/ modo dev (PostgreSQL embutido)
        └── resources/                  perfis test e dev
```
