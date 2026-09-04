# CORE-005 — Matriz de Testes

| Cenário | Resultado esperado |
|---|---|
| Criar Property em Organization do tenant ativo | 201 |
| Criar Property usando Organization de outro tenant | 404/sem registro |
| Criar Field em Property do tenant ativo | 201 |
| Criar Field usando Property de outro tenant | 404/sem registro |
| Criar Plot em Field do tenant ativo | 201 |
| Criar Plot usando Field de outro tenant | 404/sem registro |
| Atualizar ID de outro tenant | 404/sem registro |
| Área negativa | 400 |
| Latitude fora de -90..90 | 400 |
| Longitude fora de -180..180 | 400 |
| GeoJSON sem estrutura mínima | 400 |
| authenticated sem JWT/contexto | zero leitura |
| authenticated executar app_server_* | negado |
| ifarm_api_runtime fazer DML direto | negado |
| ifarm_api_runtime executar capability | permitido |
| DELETE | soft delete + AuditEvent |
| create/update/delete | AuditEvent registrado |
