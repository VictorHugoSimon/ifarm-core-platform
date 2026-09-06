# CORE-007 — Usuários, convites, memberships e papéis

## Objetivo
Permitir que owner/tenant_admin montem e governem equipes no iFarm Core sem manipulação manual do banco, mantendo identidade no Neon Auth e autorização no Core.

## Fluxo de convite
1. Administrador autenticado e autorizado cria convite para e-mail, role e Organization opcional.
2. Worker gera token aleatório de 256 bits.
3. Banco recebe somente SHA-256 hexadecimal do token.
4. Token bruto é retornado uma única vez ao chamador autorizado para entrega por adaptador transacional.
5. Usuário cria/autentica sua identidade Neon Auth e verifica o e-mail.
6. Aceite calcula novamente SHA-256 e chama RPC autenticada.
7. O banco valida token pendente, não expirado, e-mail verificado e e-mail idêntico ao convite.
8. Membership é criada/reativada e o evento é auditado.

## Regra de transporte de e-mail
O Core não usa Gmail pessoal nem armazena credenciais SMTP. O envio de e-mail é responsabilidade de um adaptador transacional futuro. Até ele existir, `POST /membership-invitations` informa `deliveryRequired: true` e retorna o token uma única vez. O token nunca deve ser logado, persistido no frontend ou salvo em analytics.

## Segurança
- tenant é sempre derivado da identidade/membership;
- `membership_invitations` não possui SELECT/INSERT/UPDATE/DELETE direto para `authenticated` ou `ifarm_api_runtime`;
- runtime executa apenas capabilities server-side;
- cliente autenticado não executa funções server-side de escrita;
- função interna de aceite por `target_user` não é executável por cliente/runtime;
- wrapper de aceite usa exclusivamente `auth.user_id()`;
- convite exige e-mail normalizado e token hash SHA-256 de 64 caracteres hexadecimais;
- somente um convite pendente por e-mail/tenant;
- manager mantém `user.read` e `rbac.read`, mas perde `user.manage`;
- tenant_admin não cria/atribui owner e não altera membership owner;
- owner pode administrar owner, mas não pode remover o último administrador ativo;
- suspensão/reativação usa `user.manage` e perfis privilegiados passam pelo gate MFA existente;
- convite para role/Organization de outro tenant é rejeitado sem vazar existência;
- aceite exige `emailVerified=true` no Neon Auth;
- membership `removed` pode ser reativada por novo convite; membership ativa/suspensa bloqueia novo convite;
- create/revoke/accept/update geram `AuditEvent`.

## Endpoints
- `GET /api/v1/roles`
- `GET /api/v1/memberships`
- `PATCH /api/v1/memberships/{id}`
- `GET /api/v1/membership-invitations`
- `POST /api/v1/membership-invitations`
- `DELETE /api/v1/membership-invitations/{id}`
- `POST /api/v1/membership-invitations/accept`

## Migrations
- `0007_user_management_schema.sql`
- `0008_user_management_rpc.sql`
- `0009_membership_acceptance_hardening.sql`

## E2E executado em branch temporário Neon
- manager: `user.read=true`, `rbac.read=true`, `user.manage=false`;
- owner/tenant_admin: `user.manage=true`;
- convite manager por owner: permitido;
- convite owner por tenant_admin: rejeitado;
- aceite por usuário com e-mail verificado: membership ativa e contexto definido;
- convite marcado `accepted` com `accepted_by/accepted_at`;
- AuditEvent de aceite criado;
- tenant_admin tentando alterar owner: rejeitado;
- owner suspendendo outro tenant_admin: permitido quando ainda existe administrador ativo;
- último administrador tentando se rebaixar: rejeitado;
- role de outro tenant em convite: rejeitado;
- authenticated não executa server-side invitation/update;
- authenticated não executa função interna de aceite;
- runtime não possui INSERT direto em invitation;
- runtime executa capabilities autorizadas.
