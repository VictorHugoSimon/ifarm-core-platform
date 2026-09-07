# CORE-005 — Propriedades, Áreas e Talhões

## Hierarquia

Organization → Property → Field (Área) → Plot (Talhão)

Todas as entidades são tenant-scoped e usam FKs compostas com `tenant_id` para impedir referências cruzadas entre tenants.

## Segurança

- o tenant nunca é aceito por header ou payload como fonte confiável;
- leitura usa Neon Data API + JWT + RLS;
- escrita usa o Worker e funções `app_server_*`;
- `authenticated` não executa funções server-side;
- `ifarm_api_runtime` não possui DML direto nas tabelas;
- `property.read` controla leitura;
- `property.manage` controla criação, atualização e exclusão lógica;
- acessos cross-tenant retornam ausência/404 sem revelar o registro remoto;
- create/update/delete geram AuditEvent.

## Entidades

### Property
Vinculada a Organization. Campos principais: nome, matrícula/código, município, UF, país, área total em hectares, latitude e longitude.

### Field
Área física dentro da Property. Campos principais: nome, área em hectares e GeoJSON opcional.

### Plot
Talhão dentro de uma Field. Campos principais: código, nome, área em hectares e GeoJSON opcional.

## API v1

- `GET /properties`
- `POST /properties`
- `GET /properties/:id`
- `PATCH /properties/:id`
- `DELETE /properties/:id`
- `GET /properties/:propertyId/fields`
- `POST /properties/:propertyId/fields`
- `GET /fields/:id`
- `PATCH /fields/:id`
- `DELETE /fields/:id`
- `GET /fields/:fieldId/plots`
- `POST /fields/:fieldId/plots`
- `GET /plots/:id`
- `PATCH /plots/:id`
- `DELETE /plots/:id`

## Validação concluída no Neon iFarm Core

A migration `0004_properties_fields_plots.sql` foi testada em branch temporária derivada da `main` do próprio iFarm Core antes da promoção.

Foram validados:
- Tenant A e Tenant B isolados;
- criação válida de Property/Field/Plot;
- cross-tenant create/update bloqueado;
- FK composta cross-tenant bloqueada;
- área negativa rejeitada;
- latitude/longitude fora dos limites rejeitadas;
- GeoJSON inválido rejeitado;
- RLS fail-closed sem JWT;
- soft delete;
- auditoria;
- ACL mínima do runtime.
