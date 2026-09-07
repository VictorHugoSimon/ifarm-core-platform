# Arquitetura — iFarm Core

## Decisão principal

O Core nasce como **Modular Monolith API-first**. O objetivo é preservar fronteiras de domínio desde o início sem assumir prematuramente o custo operacional de microsserviços.

## Contextos

1. Identity & Access — User, Membership, Role, Permission, MFA.
2. Tenancy — Tenant, Organization, configuração white-label.
3. Rural Registry — Property, Field, Plot, Crop, Season.
4. Business Network — Partner, Contract.
5. Operations — Document, Task, Notification.
6. Governance — Consent, AuditEvent.
7. Platform — Integration, Webhook, Configuration, API.

## Regras

- Todo dado de negócio tenant-scoped possui `tenant_id`.
- Módulos consumidores referenciam IDs do Core; não duplicam entidades compartilhadas.
- A API pública é versionada em `/api/v1`.
- Segredos ficam em secret stores do ambiente, nunca em Git.
- Ações privilegiadas exigirão MFA.
- Toda mutação sensível deverá gerar `AuditEvent`.
- DEV, STAGE e PRODUCTION possuem infraestrutura e credenciais separadas.

## Evolução

Extrair um contexto para serviço independente somente quando houver justificativa mensurável: escala, isolamento operacional, ciclo de deploy, disponibilidade ou requisitos regulatórios distintos.
