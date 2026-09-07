# RBAC — iFarm Core

## Princípio

Autorização é aplicada em duas camadas com a mesma fonte de verdade:

1. API: `requirePermission('resource.action')` antes de executar a operação.
2. PostgreSQL RLS: `app_has_permission('resource.action')` protege a tabela mesmo se alguém chamar o Supabase Data API diretamente.

Esconder menu ou botão nunca é considerado controle de segurança.

## Resolução

`User -> Membership ativa -> Role -> RolePermission -> Permission`.

O tenant é o `tenant_id` assinado no JWT pelo Auth Hook. `app_has_permission` confirma que o usuário ainda possui membership ativa naquele tenant, reduzindo o risco de uma claim antiga manter acesso após remoção.

## Perfis padrão

Todo novo tenant recebe automaticamente, por migration/trigger:

- `owner` — Proprietário / Produtor;
- `tenant_admin` — Administrador;
- `manager` — Gestor;
- `technical` — Técnico;
- `operator` — Operador;
- `finance` — Financeiro;
- `partner` — Parceiro.

A matriz inicial é versionada em `0004_default_roles.sql`. `owner` e `tenant_admin` recebem o conjunto tenant-scoped completo; os demais seguem menor privilégio. O perfil Partner começa deliberadamente restrito até existirem ACLs contextuais por contrato/propriedade.

## Administrador iFarm

`app_is_ifarm_admin()` consulta o banco usando `auth.uid()`; não depende exclusivamente da claim `is_ifarm_admin`. A claim continua útil para UX/MFA, mas a autorização crítica é confirmada na fonte de dados.

## Menor privilégio

- `users.is_ifarm_admin` não pode ser alterado pelo usuário autenticado via Data API.
- Notification update bruto é bloqueado; leitura é confirmada por `mark_notification_read()`.
- Consent e AuditEvent não aceitam escrita bruta do cliente.
- AuditEvent é append-only para usuários e criado por `record_audit_event()`.
- Roles e memberships exigem capabilities administrativas.
- A role `partner` não recebe acesso amplo a documentos/contratos enquanto não houver escopo contextual.

## API

`GET /api/v1/me/permissions` retorna as capabilities efetivas do tenant ativo.

Endpoints de negócio deverão declarar explicitamente a permission requerida.

## Testes obrigatórios E2E

Para cada novo recurso:
- usuário autorizado recebe sucesso;
- usuário sem permission recebe 403;
- Tenant A não lê/escreve Tenant B;
- usuário removido/suspenso perde acesso;
- ação privilegiada com `aal1` é bloqueada quando MFA é obrigatório.
