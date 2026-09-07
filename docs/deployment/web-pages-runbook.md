# iFarm Core Web — Cloudflare Pages Runbook

## Ambientes

| Ambiente | Git branch | Pages project | API | Neon Auth |
|---|---|---|---|---|
| DEV | `develop` | `ifarm-core-web-dev` | `ifarm-core-api-dev` | branch Neon `develop` |
| STAGE | `stage` | `ifarm-core-web-stage` | `ifarm-core-api-stage` | branch Neon `stage` |
| PROD | `main` | `ifarm-core-web` | `ifarm-core-api` | branch Neon `main` |

## Regras de segurança

- Todo recurso Cloudflare criado por este fluxo deve começar com `ifarm-core-`.
- O workflow consulta o Pages project pelo nome antes de criar qualquer recurso.
- Recursos existentes de outros projetos nunca devem ser reutilizados, alterados ou excluídos.
- `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` ficam somente em GitHub Actions Secrets.
- `VITE_API_URL` e `VITE_NEON_AUTH_URL` são endpoints públicos e são injetados somente no build.
- DEV e STAGE são automáticos após promoção das branches.
- PROD exige `workflow_dispatch` explícito com `target=production`.

## Fluxo

1. CI valida código.
2. O workflow seleciona o ambiente pela branch ou input manual.
3. Valida secrets Cloudflare.
4. Compila `@ifarm/web` com os endpoints do mesmo ambiente.
5. Consulta `GET /pages/projects/{project}`.
6. Se retornar 404, cria exclusivamente o Pages project iFarm Core.
7. Faz Direct Upload do `apps/web/dist` via Wrangler.
8. Executa smoke test no domínio `pages.dev` e exige `<title>iFarm Core</title>`.

## Gate de permissão Cloudflare

O token usado pelo repositório precisa de permissão Cloudflare Pages com Edit/Write. Se a consulta ou criação do Pages project retornar erro de autorização, não contornar o gate e não reutilizar token de outro projeto; atualizar somente o token exclusivo do iFarm Core.

## Produção

Antes do deploy web de PROD:

- API PROD deve estar verde em `/api/v1/health`;
- CORE-009 deve registrar o deploy de backend aprovado;
- Neon main deve permanecer no schema aprovado;
- registrar o domínio Pages PROD como trusted origin do Neon Auth;
- validar login, `/api/v1/me`, dashboard e logout.
