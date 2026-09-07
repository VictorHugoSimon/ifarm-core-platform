# iFarm Core — Release e rollback

## Objetivo

Padronizar implantação da API do iFarm Core em DEV, STAGE e PRODUCTION sem reutilizar recursos de outros projetos.

## Ambientes

| Ambiente | Git branch | Worker | Neon branch | Deploy |
|---|---|---|---|---|
| DEV | `develop` | `ifarm-core-api-dev` | `develop` | automático em push relevante |
| STAGE | `stage` | `ifarm-core-api-stage` | `stage` | automático em push relevante |
| PRODUCTION | `main` | `ifarm-core-api` | `main` | somente `workflow_dispatch` explícito |

## Secrets obrigatórios

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `IFARM_CORE_DATABASE_URL_DEV`
- `IFARM_CORE_DATABASE_URL_STAGE`
- `IFARM_CORE_DATABASE_URL_PROD`

Nunca registrar valores desses secrets em issue, PR, log, documentação ou chat.

## Gates antes do deploy

1. CI normal deve estar verde: install, typecheck, tests e build.
2. O pipeline valida presença dos secrets Cloudflare e do DATABASE_URL do ambiente.
3. O `DATABASE_URL` é consultado antes do deploy e precisa conter:
   - `public.contracts`;
   - `public.tenant_modules`;
   - `public.app_dashboard_summary()`;
   - `public.app_server_admin_dashboard_summary(uuid)`.
4. Se o banco não possuir o schema CORE-008 completo, o deploy é bloqueado antes de alterar o Worker.
5. O Worker secret `DATABASE_URL` é sincronizado somente após o gate de banco.

## Deploy

O workflow `.github/workflows/deploy-api.yml` executa `wrangler deploy` para o ambiente selecionado.

Após o deploy, o pipeline consulta o subdomínio `workers.dev` da conta Cloudflare e valida que o script do Worker está habilitado nesse subdomínio.

## Smoke test

O endpoint obrigatório é:

`GET /api/v1/health`

Critérios mínimos:

- HTTP 2xx;
- JSON válido;
- `ok = true`;
- `service = ifarm-core-api`.

Falha no smoke test reprova o release.

## Promoção

Fluxo recomendado:

`feature/* -> develop -> DEV smoke -> stage -> STAGE smoke -> main -> PRODUCTION manual`

Não promover para o próximo ambiente enquanto o ambiente anterior estiver com CI/deploy/smoke vermelho.

## Rollback

### Aplicação

1. Identificar o último commit/deployment saudável do mesmo Worker iFarm Core.
2. Reverter o commit causador no GitHub ou redeployar a revisão saudável.
3. Reexecutar o smoke test `/api/v1/health`.

### Banco

- Migrations são forward-only por padrão.
- Não executar `DROP`, reset de branch ou restauração destrutiva sem uma decisão explícita de incidente.
- Em DEV/STAGE, usar branches/snapshots Neon do próprio iFarm Core para recuperação.
- Em PRODUCTION, priorizar migration corretiva aditiva; restore só em incidente formal.

## Isolamento

Este runbook autoriza somente recursos do projeto iFarm Core. Não consultar, alterar, excluir, reaproveitar secrets, Workers, Pages, bancos, branches ou domínios de outros projetos.
