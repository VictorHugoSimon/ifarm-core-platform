# Smart Farm iFarm — site institucional

## Arquitetura

- **GitHub:** monorepo `VictorHugoSimon/ifarm-core-platform`.
- **Site público:** `apps/site`, Vite estático.
- **Hospedagem:** Cloudflare Pages.
- **API:** `apps/api`, Hono em Cloudflare Workers.
- **Banco do site público:** Cloudflare D1 (SQLite serverless).
- **Captação de lead:** `POST /api/v1/public/leads` -> tabela `marketing_lead` no D1.

O site público fica separado do painel administrativo (`apps/web`) e compartilha a API central somente pelos endpoints explicitamente públicos.

> Decisão de arquitetura de 02/09/2026: não usar o projeto Supabase genérico existente para a Smart Farm. A captura de leads do site passa a usar Cloudflare D1, mantendo Git + Cloudflare + banco no mesmo ecossistema.

## Segurança

- O navegador não recebe credencial administrativa de banco.
- D1 é acessado pelo binding `DB` do Cloudflare Worker.
- O endpoint público valida payload com Zod e usa honeypot básico contra robôs.
- A tabela de leads não fica exposta diretamente ao cliente; as gravações passam pelo Worker.
- Em produção, configurar Cloudflare Turnstile antes de campanhas de mídia ou tráfego relevante.
- Configurar `SITE_ORIGIN` com os domínios permitidos, separados por vírgula.
- Dados do iFarm Core autenticado permanecem uma decisão separada; o código atual ainda possui integração Supabase para autenticação/contexto do Core, mas isso não é requisito para colocar o site público no ar.

## Variáveis

### Site / build

- `VITE_API_URL`: URL pública do Worker, sem barra final.

### API / Worker

- `APP_ENV`
- `SITE_ORIGIN`
- binding D1 `DB`

A integração autenticada do iFarm Core poderá, em fase própria, usar `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` ou ser reavaliada para outra solução.

## Cloudflare D1

Banco sugerido: `ifarm-smart-farm`.

Após criar o banco no painel Cloudflare ou via Wrangler:

```bash
npx wrangler d1 create ifarm-smart-farm
```

Copiar o `database_id` retornado e habilitar no `apps/api/wrangler.toml` o bloco:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ifarm-smart-farm"
database_id = "SEU_DATABASE_ID"
migrations_dir = "migrations"
```

Aplicar a migration:

```bash
cd apps/api
npx wrangler d1 migrations apply ifarm-smart-farm --remote
```

Migration atual:

```text
apps/api/migrations/0001_marketing_leads.sql
```

## Cloudflare Pages

Projeto sugerido: `ifarm-smart-farm-site`.

Build a partir da raiz do monorepo:

```bash
npm install
npm run build -w @ifarm/site
```

Diretório de saída:

```text
apps/site/dist
```

O workflow `deploy-smart-farm-site.yml` faz deploy em `stage` e `main` quando os secrets/variables do GitHub forem cadastrados.

## Pendências de infraestrutura

1. Criar D1 `ifarm-smart-farm` e copiar o `database_id`.
2. Habilitar o binding `DB` no `apps/api/wrangler.toml` e aplicar a migration D1.
3. Criar/configurar Worker API no Cloudflare.
4. Criar projeto Cloudflare Pages e definir `main` como production branch.
5. Cadastrar no GitHub `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e variável `SMART_FARM_API_URL`.
6. Configurar domínio oficial e `SITE_ORIGIN`.
7. Adicionar Turnstile e integração dos leads com CRM após o MVP.

## Observação de custo

A Cloudflare mantém D1 no plano Workers Free para prototipação e pequenos volumes. O desenho inicial do site usa somente operações simples e índices para reduzir leituras desnecessárias. Monitorar uso antes de escalar campanhas ou tráfego significativo.
