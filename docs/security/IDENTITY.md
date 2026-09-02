# Identity — iFarm Core

## Fonte de identidade

O MVP usa Supabase Auth. O Core não armazena senha nem implementa algoritmo próprio de hash. `public.users.id` espelha `auth.users.id`.

## Fluxo de confiança

1. Cliente autentica no Supabase Auth.
2. Supabase emite access token JWT.
3. O Custom Access Token Hook acrescenta somente contexto validado (`tenant_id`, membership, role e exigência de MFA).
4. A API recebe `Authorization: Bearer <JWT>`.
5. `supabase.auth.getClaims(jwt)` verifica o token antes do Core confiar nas claims.
6. A API usa `sub` como identidade do usuário; tenant nunca é aceito de um header não validado.
7. PostgreSQL RLS usa as mesmas claims para defesa em profundidade.

## Multiempresa

- Usuário com uma única membership ativa recebe automaticamente aquele `tenant_id`.
- Usuário com múltiplas memberships precisa possuir `active_tenant_id` definido de forma segura no `app_metadata` e renovar o token.
- O cliente nunca ganha acesso simplesmente enviando um Tenant ID diferente.

## MFA

Supabase representa o nível de autenticação na claim `aal`:
- `aal1`: autenticação convencional;
- `aal2`: segundo fator concluído.

O hook marca `requires_mfa=true` para administrador iFarm e roles privilegiadas (`owner`, `tenant_admin`, `admin`). Endpoints privilegiados deverão executar `assertPrivilegedMfa()` além do RBAC.

## Ação de implantação

Após executar `0002_identity.sql`, habilitar no projeto Supabase:
`Authentication > Hooks > Custom Access Token > public.custom_access_token_hook`.

Nenhuma secret key deve ser exposta ao frontend ou versionada.
