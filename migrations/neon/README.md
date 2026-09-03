# iFarm Core — Neon migrations

Este diretório contém as migrations canônicas do iFarm Core após a decisão de usar Neon PostgreSQL + Neon Auth + Data API.

## Ordem

1. `0001_identity_rbac_schema.sql`
2. `0002_identity_rbac_security.sql`

## Importante

As migrations `migrations/0001_core_foundation.sql` até `migrations/0004_default_roles.sql` foram produzidas para a arquitetura anterior com Supabase Auth/RLS e permanecem apenas como histórico de evolução do projeto. Elas **não devem ser aplicadas no Neon**.

O baseline Neon deve ser promovido primeiro em branch temporária de banco e validado antes de `main`.

### Princípios

- identidade: Neon Auth / Better Auth;
- validação do JWT: JWKS do Neon Auth;
- autorização: PostgreSQL/RBAC;
- tenant ativo: banco, não custom claim;
- cliente nunca envia `user_id` para decidir autorização;
- RLS fail-closed;
- helpers internos por usuário não têm `EXECUTE` para `anonymous`/`authenticated`;
- operações privilegiadas permanecem bloqueadas enquanto MFA verificável não estiver concluído.
