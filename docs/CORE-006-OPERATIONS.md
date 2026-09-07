# CORE-006 — Parceiros, Documentos, Notificações e Auditoria

## Objetivo
Completar o bloco operacional do MVP do iFarm Core com entidades compartilhadas e isolamento multi-tenant.

## Partner
CRUD tenant-scoped governado por `partner.read` e `partner.manage`. Exclusão é lógica e toda escrita gera AuditEvent.

## Document
Neste incremento, Document representa o registro governado de metadados: título, categoria, referência de storage, MIME type, tamanho, checksum, Organization/Property e autor.

O conteúdo binário não é enviado por estas rotas. `storagePath` é somente uma referência de metadado e **nunca deve ser usado isoladamente como autorização de download**. A futura integração de storage deverá gerar/validar referências no servidor, aplicar tenant scope e autorizar o acesso independentemente do caminho informado no registro.

## Notification
A inbox retorna apenas notificações do usuário autenticado no tenant ativo. Criação exige `notification.manage` e o destinatário precisa possuir membership ativa no mesmo tenant. A marcação de leitura é limitada à própria notificação do usuário.

## AuditEvent
`GET /audit-events` exige `audit.read`, é tenant-scoped e suporta paginação com no máximo 200 linhas por chamada.

## API
- `GET/POST /partners`
- `GET/PATCH/DELETE /partners/:id`
- `GET/POST /documents`
- `GET/PATCH/DELETE /documents/:id`
- `GET/POST /notifications`
- `POST /notifications/:id/read`
- `GET /audit-events?limit=100&offset=0`

## Segurança
- tenant nunca vem de header/payload como fonte confiável;
- leitura via JWT + RLS;
- escrita via Worker + `ifarm_api_runtime`;
- runtime sem DML direto nas tabelas;
- funções server-side não executáveis por `authenticated`;
- FKs tenant-aware para documentos e notificações;
- cross-tenant retorna ausência/404 sem revelar entidade remota;
- soft delete em Partner e Document;
- create/update/delete auditados.
