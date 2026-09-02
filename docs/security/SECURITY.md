# Segurança e LGPD — baseline

## Controles obrigatórios

- isolamento entre tenants por RLS e testes automatizados;
- MFA obrigatório para administradores iFarm e acessos privilegiados;
- RBAC com princípio do menor privilégio;
- trilha de auditoria append-oriented;
- nenhuma senha ou token fixo no código;
- segredos separados por DEV, STAGE e PRODUCTION;
- criptografia TLS em trânsito e recursos gerenciados com criptografia em repouso;
- soft delete onde a retenção do domínio exigir histórico;
- rate limiting, validação de entrada e headers seguros na API;
- revisão periódica de acessos e integrações.

## LGPD

O Core armazenará consentimento/evidência quando consentimento for a base aplicável, além de finalidade e base legal. O desenho deve suportar acesso, correção, portabilidade quando aplicável, revogação de consentimento e processos de retenção/eliminação, sem apagar registros que devam ser preservados por obrigação legal legítima.

## Regra de implementação

Nenhum endpoint de negócio será considerado pronto sem teste negativo comprovando que um tenant não consegue acessar recurso de outro tenant.
