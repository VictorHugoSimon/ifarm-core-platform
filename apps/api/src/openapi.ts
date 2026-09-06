const secured = { security: [{ bearerAuth: [] }] }
const response = (description: string) => ({ description })

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'iFarm Core API',
    version: '0.9.0',
    description: 'API central compartilhada do ecossistema iFarm.'
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': response('OK') } } },
    '/me': { get: { ...secured, summary: 'Identidade Neon Auth e contexto Core', responses: { '200': response('Identidade autenticada'), '401': response('Não autenticado') } } },
    '/me/permissions': { get: { ...secured, summary: 'Permissões efetivas no tenant ativo', responses: { '200': response('Permissões') } } },
    '/tenants': { get: { ...secured, summary: 'Tenants disponíveis à identidade', responses: { '200': response('Tenants') } } },
    '/me/active-tenant': { post: { ...secured, summary: 'Seleciona tenant com membership ativa', responses: { '200': response('Contexto atualizado') } } },
    '/tenant': { get: { ...secured, summary: 'Tenant ativo', responses: { '200': response('Tenant') } } },
    '/organizations': {
      get: { ...secured, summary: 'Lista organizações', responses: { '200': response('Organizações') } },
      post: { ...secured, summary: 'Cria organização', responses: { '201': response('Criada') } }
    },
    '/organizations/{id}': {
      get: { ...secured, summary: 'Consulta organização', responses: { '200': response('Organização') } },
      patch: { ...secured, summary: 'Atualiza organização', responses: { '200': response('Atualizada') } },
      delete: { ...secured, summary: 'Exclusão lógica de organização', responses: { '200': response('Excluída') } }
    },
    '/configuration/white-label': {
      get: { ...secured, summary: 'Consulta white-label', responses: { '200': response('Configuração') } },
      put: { ...secured, summary: 'Atualiza white-label', responses: { '200': response('Atualizada') } }
    },
    '/admin/tenants': {
      get: { ...secured, summary: 'Admin iFarm: lista tenants', responses: { '200': response('Tenants'), '403': response('MFA/privilégio obrigatório') } },
      post: { ...secured, summary: 'Admin iFarm: cria tenant com roles e Core ativo', responses: { '201': response('Tenant criado') } }
    },
    '/properties': {
      get: { ...secured, summary: 'Lista propriedades', responses: { '200': response('Propriedades') } },
      post: { ...secured, summary: 'Cria propriedade', responses: { '201': response('Criada') } }
    },
    '/properties/{id}': {
      get: { ...secured, summary: 'Consulta propriedade', responses: { '200': response('Propriedade') } },
      patch: { ...secured, summary: 'Atualiza propriedade', responses: { '200': response('Atualizada') } },
      delete: { ...secured, summary: 'Exclusão lógica de propriedade', responses: { '200': response('Excluída') } }
    },
    '/properties/{propertyId}/fields': {
      get: { ...secured, summary: 'Lista áreas', responses: { '200': response('Áreas') } },
      post: { ...secured, summary: 'Cria área', responses: { '201': response('Criada') } }
    },
    '/fields/{id}': {
      get: { ...secured, summary: 'Consulta área', responses: { '200': response('Área') } },
      patch: { ...secured, summary: 'Atualiza área', responses: { '200': response('Atualizada') } },
      delete: { ...secured, summary: 'Exclusão lógica de área', responses: { '200': response('Excluída') } }
    },
    '/fields/{fieldId}/plots': {
      get: { ...secured, summary: 'Lista talhões', responses: { '200': response('Talhões') } },
      post: { ...secured, summary: 'Cria talhão', responses: { '201': response('Criado') } }
    },
    '/plots/{id}': {
      get: { ...secured, summary: 'Consulta talhão', responses: { '200': response('Talhão') } },
      patch: { ...secured, summary: 'Atualiza talhão', responses: { '200': response('Atualizado') } },
      delete: { ...secured, summary: 'Exclusão lógica de talhão', responses: { '200': response('Excluído') } }
    },
    '/partners': {
      get: { ...secured, summary: 'Lista parceiros', responses: { '200': response('Parceiros') } },
      post: { ...secured, summary: 'Cria parceiro', responses: { '201': response('Criado') } }
    },
    '/partners/{id}': {
      get: { ...secured, summary: 'Consulta parceiro', responses: { '200': response('Parceiro') } },
      patch: { ...secured, summary: 'Atualiza parceiro', responses: { '200': response('Atualizado') } },
      delete: { ...secured, summary: 'Exclusão lógica de parceiro', responses: { '200': response('Excluído') } }
    },
    '/documents': {
      get: { ...secured, summary: 'Lista metadados de documentos', responses: { '200': response('Documentos') } },
      post: { ...secured, summary: 'Registra metadados de documento', responses: { '201': response('Registrado') } }
    },
    '/documents/{id}': {
      get: { ...secured, summary: 'Consulta documento', responses: { '200': response('Documento') } },
      patch: { ...secured, summary: 'Atualiza documento', responses: { '200': response('Atualizado') } },
      delete: { ...secured, summary: 'Exclusão lógica de documento', responses: { '200': response('Excluído') } }
    },
    '/notifications': {
      get: { ...secured, summary: 'Lista notificações do usuário', responses: { '200': response('Notificações') } },
      post: { ...secured, summary: 'Cria notificação interna', responses: { '201': response('Criada') } }
    },
    '/notifications/{id}/read': { post: { ...secured, summary: 'Marca notificação como lida', responses: { '200': response('Lida') } } },
    '/audit-events': { get: { ...secured, summary: 'Consulta eventos de auditoria', responses: { '200': response('Eventos') } } },
    '/roles': { get: { ...secured, summary: 'Lista roles', responses: { '200': response('Roles') } } },
    '/memberships': { get: { ...secured, summary: 'Lista memberships', responses: { '200': response('Memberships') } } },
    '/memberships/{id}': { patch: { ...secured, summary: 'Atualiza membership governada', responses: { '200': response('Atualizada'), '409': response('Governança rejeitou alteração') } } },
    '/membership-invitations': {
      get: { ...secured, summary: 'Lista convites sem token/hash', responses: { '200': response('Convites') } },
      post: { ...secured, summary: 'Cria convite e retorna token uma única vez', responses: { '201': response('Convite criado') } }
    },
    '/membership-invitations/{id}': { delete: { ...secured, summary: 'Revoga convite', responses: { '200': response('Revogado') } } },
    '/membership-invitations/accept': { post: { ...secured, summary: 'Aceita convite para e-mail verificado', responses: { '200': response('Membership ativada') } } },
    '/dashboard/summary': { get: { ...secured, summary: 'Dashboard executivo do tenant ativo', responses: { '200': response('KPIs, finanças, módulos e alertas') } } },
    '/admin/dashboard/summary': { get: { ...secured, summary: 'Dashboard global do Administrador iFarm', responses: { '200': response('KPIs globais'), '403': response('iFarm Admin + MFA obrigatórios') } } },
    '/contracts': {
      get: { ...secured, summary: 'Lista contratos do tenant', responses: { '200': response('Contratos') } },
      post: { ...secured, summary: 'Cria contrato com valor recorrente em centavos', responses: { '201': response('Contrato criado') } }
    },
    '/contracts/{id}/revenue': { post: { ...secured, summary: 'Registra receita prevista/recebida do contrato', responses: { '201': response('Receita registrada') } } },
    '/modules/{code}': { put: { ...secured, summary: 'Ativa ou atualiza módulo contratado', responses: { '200': response('Módulo atualizado') } } },
    '/integrations': {
      get: { ...secured, summary: 'Lista integrações do tenant', responses: { '200': response('Integrações') } },
      post: { ...secured, summary: 'Registra integração', responses: { '201': response('Integração criada') } }
    }
  }
} as const
