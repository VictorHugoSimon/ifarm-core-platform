# CORE-006 — Matriz de Testes

| Cenário | Resultado esperado |
|---|---|
| Criar Partner no tenant ativo | 201 + AuditEvent |
| Atualizar Partner de outro tenant | 404/sem registro |
| Excluir Partner | soft delete + AuditEvent |
| Criar Document com Organization/Property do tenant ativo | 201 + AuditEvent |
| Criar Document com relação de outro tenant | 404/sem registro |
| Criar Document com sizeBytes negativo | 400/sem registro |
| Atualizar/excluir Document | tenant-scoped + AuditEvent |
| Criar Notification para membro ativo do mesmo tenant | 201 + AuditEvent |
| Criar Notification para usuário de outro tenant | 404/sem registro |
| Listar Notification | somente próprio usuário |
| Marcar Notification de outro usuário como lida | 404/sem alteração |
| Ler AuditEvent sem `audit.read` | negado/zero |
| Paginação AuditEvent acima de 200 | 400 na API |
| authenticated executar app_server_* | negado |
| ifarm_api_runtime fazer DML direto | negado |
| ifarm_api_runtime executar capability | permitido |
| chamadas sem JWT | leitura zero / fail-closed |
