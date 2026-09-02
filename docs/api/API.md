# API compartilhada — iFarm Core

Base: `/api/v1`

## Convenções

- JSON UTF-8.
- IDs UUID.
- `requestId` em respostas e logs.
- Paginação por cursor será padrão para coleções de alto volume.
- Erros possuem código estável e mensagem humana.
- Endpoints tenant-scoped exigem contexto de tenant autenticado.

## Recursos planejados para o MVP

`/auth`, `/me`, `/tenants`, `/organizations`, `/users`, `/memberships`, `/teams`, `/roles`, `/permissions`, `/properties`, `/fields`, `/plots`, `/crops`, `/seasons`, `/partners`, `/documents`, `/tasks`, `/notifications`, `/contracts`, `/consents`, `/audit-events`, `/integrations`, `/webhooks`, `/configurations`, `/dashboard`.

## Implementado na Sprint 0

- `GET /api/v1`
- `GET /api/v1/health`
- `GET /api/v1/openapi.json`
- `GET /api/v1/context` para validar propagação inicial de tenant/request ID em DEV.
