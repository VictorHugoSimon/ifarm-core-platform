# iFarm Core Platform

Núcleo compartilhado do ecossistema iFarm.

## Objetivo

O iFarm Core centraliza identidade, multiempresa, organizações, propriedades rurais, áreas/talhões, usuários, RBAC, parceiros, documentos, notificações, auditoria, LGPD, contratos, configurações, APIs, webhooks e integrações.

Os módulos iFarm IoT, Logistics, Services, Store, Finance, Insurance e Academy devem consumir as entidades compartilhadas do Core em vez de duplicá-las.

## Arquitetura

- Modular Monolith API-first
- TypeScript
- Hono / Cloudflare Workers para API
- React + Vite para Web
- PostgreSQL/Supabase com Row Level Security
- OpenAPI em `/api/v1`
- ambientes DEV, STAGE e PRODUCTION
- CI/CD via GitHub Actions

## Governança de branches

- `main`: produção
- `stage`: homologação
- `develop`: desenvolvimento integrado
- `feature/*`: trabalho de funcionalidades

Nenhum segredo deve ser versionado no repositório.

## Estado

Sprint 0 — Fundação técnica em construção.

Baseline atual em `develop`: monorepo, API v1, painel web, schema relacional multi-tenant, RLS, documentação técnica e CI de validação.
