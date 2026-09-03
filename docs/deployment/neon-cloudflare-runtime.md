# iFarm Core — Neon + Cloudflare Runtime

## Escopo e isolamento

Este runbook é exclusivo do projeto `VictorHugoSimon/ifarm-core-platform` e dos recursos Cloudflare/Neon criados especificamente para o iFarm Core.

Não reutilizar, alterar, excluir ou pausar recursos de outros projetos.

## Neon por ambiente

| Ambiente | Branch Neon | Branch ID | Worker |
| --- | --- | --- | --- |
| DEV | `develop` | `br-summer-silence-ar95ei5r` | `ifarm-core-api-dev` |
| STAGE | `stage` | `br-billowing-grass-arleupsp` | `ifarm-core-api-stage` |
| PRODUCTION | `main` | `br-steep-math-arz1uwnu` | `ifarm-core-api` |

Neon Auth, JWKS e Data API são configurados em `apps/api/wrangler.toml` porque são endpoints públicos. Nenhuma senha PostgreSQL deve ser versionada.

## Boundary de escrita

A migration `migrations/neon/0003_tenancy_organizations.sql` cria o role de capabilities:

`ifarm_api_runtime`

Características obrigatórias:
- `NOLOGIN`;
- `NOINHERIT`;
- `NOSUPERUSER`;
- sem DML direto nas tabelas;
- `EXECUTE` somente nas funções `app_server_*` necessárias.

O Worker deve usar um login PostgreSQL próprio em cada ambiente, membro de `ifarm_api_runtime`. Não usar `neondb_owner`, `neon_superuser` ou credencial de outro projeto no runtime.

## Ação humana única para credenciais PostgreSQL

No Neon, selecione cada branch do iFarm Core e crie um login exclusivo com senha forte gerada fora do chat. Exemplo de SQL, substituindo apenas o nome e a senha localmente:

```sql
create role ifarm_worker_dev login inherit nosuperuser nocreatedb nocreaterole noreplication password '<SENHA_FORTE_LOCAL>';
grant ifarm_api_runtime to ifarm_worker_dev;
```

Use nomes equivalentes para STAGE e PRODUCTION:
- `ifarm_worker_stage`
- `ifarm_worker_prod`

Depois, no painel Neon, use **Connect** selecionando a branch, banco `neondb` e o role correspondente para copiar a connection string. Não cole a connection string em issues, commits, PRs ou chats.

## GitHub Secrets necessários

Cadastrar somente no repositório `VictorHugoSimon/ifarm-core-platform`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `IFARM_CORE_DATABASE_URL_DEV`
- `IFARM_CORE_DATABASE_URL_STAGE`
- `IFARM_CORE_DATABASE_URL_PROD`

O token Cloudflare deve ser exclusivo do iFarm Core e limitado aos Workers deste projeto sempre que a plataforma permitir escopo granular.

## Deploy

O workflow `.github/workflows/deploy-api.yml` é manual (`workflow_dispatch`) enquanto o setup de infraestrutura não estiver homologado.

Sequência:
1. executar CI;
2. selecionar o ambiente no workflow **Deploy iFarm Core API**;
3. o workflow valida os secrets necessários;
4. sincroniza `DATABASE_URL` como Worker Secret;
5. executa `wrangler deploy` no Worker correto;
6. executar smoke tests de `/api/v1/health`, autenticação, `/api/v1/me`, tenancy e Organizations.

Não habilitar deploy automático para `main` antes da homologação completa de STAGE.

## Critério de aceite do runtime

- DEV, STAGE e PROD usam branches Neon distintas;
- cada Worker usa login PostgreSQL distinto e mínimo;
- nenhum Worker utiliza owner/superuser;
- JWT é validado via JWKS do ambiente correspondente;
- Data API do ambiente correspondente está ativa;
- escrita passa apenas pelo Worker + `app_server_*`;
- leitura tenant-scoped continua protegida por RLS;
- cross-tenant retorna 404/403 sem vazamento;
- MFA privilegiado continua fail-closed;
- secrets não aparecem em logs, Git ou frontend.
