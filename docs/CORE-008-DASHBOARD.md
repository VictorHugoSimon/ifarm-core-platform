# CORE-008 — Dashboard administrativo e executivo

## Fonte dos indicadores

O dashboard nunca recebe MRR, ARR ou receita como números manuais. As métricas são calculadas a partir das entidades comerciais do iFarm Core.

### MRR
Soma de `contracts.recurring_monthly_cents` para contratos ativos na data atual, agrupada por moeda.

### ARR
`MRR × 12`, agrupado por moeda.

### Receita prevista — próximos 12 meses
Soma de `contract_revenue_entries.amount_cents` com status `scheduled` ou `overdue`, vencimento entre a data atual e os próximos 12 meses.

### Receita recebida — ano corrente
Soma de lançamentos com status `paid` e `paid_at` desde o início do ano corrente.

Nunca somar moedas diferentes. A API retorna `financialByCurrency`.

## Indicadores operacionais

Visão tenant: organizações, propriedades, usuários ativos, parceiros, documentos, integrações, contratos ativos, módulos ativos e alertas do tenant atual.

Visão Administrador iFarm: tenants, tenants ativos, organizações, propriedades, usuários ativos, parceiros, documentos, contratos, módulos e integrações de toda a plataforma.

## Alertas

- contratos ativos vencendo nos próximos 30 dias;
- integrações em estado `error`;
- convites vencendo em até 48 horas (tenant);
- convites pendentes (admin);
- notificações não lidas do usuário atual (tenant).

## Modelo comercial

- `module_catalog`: catálogo central dos módulos iFarm;
- `tenant_modules`: módulos contratados/ativos por tenant;
- `contracts`: contrato comercial e recorrência mensal;
- `contract_revenue_entries`: parcelas/receitas previstas ou recebidas;
- `integrations`: integrações operacionais do tenant.

Valores monetários são armazenados em centavos (`bigint`) e moeda ISO de três letras.

Todo tenant criado pelo Core nasce com `iFarm Core` ativo. Outros módulos são ativados explicitamente e podem ser associados a contratos.

## Segurança

- tenant sempre derivado da identidade/membership;
- leitura autenticada passa por RLS/RBAC;
- escrita comercial ocorre somente por capabilities server-side;
- `ifarm_api_runtime` não possui DML direto nas tabelas;
- visão global exige Administrador iFarm e política de MFA;
- AuditEvent registra criação de contrato, lançamento de receita, ativação de módulo e integração;
- nenhum dado de outro projeto é consumido pelo dashboard.

## Endpoints

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/admin/dashboard/summary`
- `GET|POST /api/v1/contracts`
- `POST /api/v1/contracts/{id}/revenue`
- `PUT /api/v1/modules/{code}`
- `GET|POST /api/v1/integrations`
