# API compartilhada — iFarm Core

Base: `/api/v1`

## Convenções

- JSON UTF-8.
- IDs UUID.
- `requestId` em respostas e logs.
- Paginação por cursor será padrão para coleções de alto volume.
- Erros possuem código estável e mensagem humana.
- Endpoints protegidos recebem `Authorization: Bearer <access_token>`.
- O tenant vem de contexto autenticado e validado; não de um header arbitrário do cliente.

## Recursos planejados para o MVP

`/auth`, `/me`, `/tenants`, `/organizations`, `/users`, `/memberships`, `/teams`, `/roles`, `/permissions`, `/properties`, `/fields`, `/plots`, `/crops`, `/seasons`, `/partners`, `/documents`, `/tasks`, `/notifications`, `/contracts`, `/consents`, `/audit-events`, `/integrations`, `/webhooks`, `/configurations`, `/dashboard`.

## Implementado

### Público
- `GET /api/v1`
- `GET /api/v1/health`
- `GET /api/v1/openapi.json`

### Autenticado
- `GET /api/v1/me` — identidade, tenant selecionado, role e estado de MFA.
- `GET /api/v1/context` — diagnóstico mínimo do contexto autenticado em DEV.

## Próximo

- troca segura do tenant ativo para usuários multiempresa;
- `requirePermission()` no backend;
- CRUDs Tenant/Organization;
- auditoria de eventos de identidade.
