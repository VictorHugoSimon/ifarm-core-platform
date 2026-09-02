# Smart Farm iFarm — site institucional

## Arquitetura

- **GitHub:** monorepo `VictorHugoSimon/ifarm-core-platform`.
- **Site público:** `apps/site`, Vite estático.
- **Hospedagem:** Cloudflare Pages.
- **API:** `apps/api`, Hono em Cloudflare Workers.
- **Banco:** Supabase/PostgreSQL.
- **Captação de lead:** `POST /api/v1/public/leads` -> tabela `public.marketing_lead`.

O site público fica separado do painel administrativo (`apps/web`) e compartilha a API central somente pelos endpoints explicitamente públicos.

## Segurança

- A chave `SUPABASE_SERVICE_ROLE_KEY` nunca vai para o navegador ou para o Git.
- O endpoint público valida payload com Zod e usa honeypot básico contra robôs.
- A tabela de leads tem RLS habilitado e privilégios removidos de `anon` e `authenticated`.
- O backend usa `service_role` somente no Worker.
- Em produção, configurar Cloudflare Turnstile antes de campanhas de mídia ou tráfego relevante.
- Configurar `SITE_ORIGIN` com os domínios permitidos, separados por vírgula.

## Variáveis

### Site / build

- `VITE_API_URL`: URL pública do Worker, sem barra final.

### API / Worker

- `APP_ENV`
- `SITE_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` **secret**

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

1. Criar projeto Supabase dedicado à iFarm e aplicar migrations `0001` a `0005`.
2. Configurar Worker API no Cloudflare com URL/keys do Supabase.
3. Criar projeto Cloudflare Pages e definir `main` como production branch.
4. Cadastrar no GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e variável `SMART_FARM_API_URL`.
5. Configurar domínio oficial e `SITE_ORIGIN`.
6. Adicionar Turnstile e integração dos leads com CRM após o MVP.
