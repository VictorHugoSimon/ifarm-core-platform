-- iFarm Core / Neon — 0003
-- CORE-003: tenancy, Organizations, white-label, auditoria e boundary de escrita server-side.
-- O cliente nunca fornece tenant_id como fonte confiável. Toda operação deriva o tenant da identidade/membership.

-- Capability role sem login. O login real do Worker é criado somente no deploy e recebe este role.
create role ifarm_api_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;

create table public.configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  namespace text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, namespace, key)
);
create index configurations_tenant_namespace_idx on public.configurations(tenant_id, namespace);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_tenant_time_idx on public.audit_events(tenant_id, occurred_at desc);

alter table public.configurations enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.configurations, public.audit_events from anonymous, authenticated, ifarm_api_runtime;
grant select on public.configurations, public.audit_events to authenticated;

create policy configurations_read on public.configurations
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission('configuration.read') or public.app_has_permission('configuration.manage'))
);

create policy audit_events_read on public.audit_events
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and public.app_has_permission('audit.read')
);

-- Leitura de tenancy exposta apenas à própria identidade autenticada.
create or replace function public.app_my_tenants()
returns table(
  tenant_id uuid,
  slug text,
  legal_name text,
  trade_name text,
  role_code text,
  active boolean
)
language sql stable security definer
set search_path = ''
as 'select t.id, t.slug, t.legal_name, t.trade_name, r.code, (uc.active_tenant_id = t.id)
from public.memberships m
join public.tenants t on t.id = m.tenant_id
join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
left join public.user_contexts uc on uc.user_id = m.user_id
where m.user_id = public.app_current_user_id()
  and m.status = ''active''
order by t.trade_name nulls last, t.legal_name';

create or replace function public.app_current_tenant_details()
returns table(
  id uuid,
  slug text,
  legal_name text,
  trade_name text,
  status public.tenant_status,
  metadata jsonb
)
language sql stable security definer
set search_path = ''
as 'select t.id, t.slug, t.legal_name, t.trade_name, t.status, t.metadata
from public.tenants t
where t.id = public.app_current_tenant_id()
  and (
    public.app_is_ifarm_admin()
    or public.app_has_permission(''tenant.read'')
    or public.app_has_permission(''tenant.manage'')
  )
limit 1';

create or replace function public.app_list_organizations()
returns table(
  id uuid,
  tenant_id uuid,
  parent_id uuid,
  name text,
  document_number text,
  email text,
  phone text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select o.id, o.tenant_id, o.parent_id, o.name, o.document_number, o.email, o.phone,
           o.metadata, o.created_at, o.updated_at
from public.organizations o
where o.tenant_id = public.app_current_tenant_id()
  and o.deleted_at is null
  and (public.app_has_permission(''organization.read'') or public.app_has_permission(''organization.manage''))
order by o.name';

create or replace function public.app_get_organization(organization_id uuid)
returns table(
  id uuid,
  tenant_id uuid,
  parent_id uuid,
  name text,
  document_number text,
  email text,
  phone text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select o.id, o.tenant_id, o.parent_id, o.name, o.document_number, o.email, o.phone,
           o.metadata, o.created_at, o.updated_at
from public.organizations o
where o.id = organization_id
  and o.tenant_id = public.app_current_tenant_id()
  and o.deleted_at is null
  and (public.app_has_permission(''organization.read'') or public.app_has_permission(''organization.manage''))
limit 1';

create or replace function public.app_get_white_label()
returns jsonb
language sql stable security definer
set search_path = ''
as 'select coalesce((
  select c.value
  from public.configurations c
  where c.tenant_id = public.app_current_tenant_id()
    and c.namespace = ''core''
    and c.key = ''white_label''
    and (public.app_has_permission(''configuration.read'') or public.app_has_permission(''configuration.manage''))
  limit 1
), ''{}''::jsonb)';

revoke all on function public.app_my_tenants() from public, anonymous;
revoke all on function public.app_current_tenant_details() from public, anonymous;
revoke all on function public.app_list_organizations() from public, anonymous;
revoke all on function public.app_get_organization(uuid) from public, anonymous;
revoke all on function public.app_get_white_label() from public, anonymous;

grant execute on function public.app_my_tenants() to authenticated;
grant execute on function public.app_current_tenant_details() to authenticated;
grant execute on function public.app_list_organizations() to authenticated;
grant execute on function public.app_get_organization(uuid) to authenticated;
grant execute on function public.app_get_white_label() to authenticated;

-- Roles padrão. Usa INSERT ... RETURNING para que o mapa de permissões seja visível no mesmo statement.
create or replace function public.app_seed_default_roles(target_tenant uuid)
returns integer
language sql volatile security definer
set search_path = ''
as 'with role_seed(code, name, description) as (
  values
    (''owner'',''Proprietário'',''Controle total do tenant''),
    (''tenant_admin'',''Administrador'',''Administração do tenant''),
    (''manager'',''Gestor'',''Gestão operacional ampla''),
    (''technical'',''Técnico'',''Operação técnica rural''),
    (''operator'',''Operador'',''Execução operacional''),
    (''finance'',''Financeiro'',''Gestão financeira e contratos''),
    (''partner'',''Parceiro'',''Acesso restrito de parceiro'')
), seeded_roles as (
  insert into public.roles(tenant_id, code, name, description, is_system)
  select target_tenant, rs.code, rs.name, rs.description, true
  from role_seed rs
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        is_system = true
  returning id, code
), mapped as (
  select sr.id as role_id, p.id as permission_id
  from seeded_roles sr
  cross join public.permissions p
  where sr.code in (''owner'',''tenant_admin'')
     or (sr.code = ''manager'' and p.code in (
       ''tenant.read'',''organization.read'',''organization.manage'',''user.read'',''user.manage'',
       ''rbac.read'',''property.read'',''property.manage'',''partner.read'',''partner.manage'',
       ''document.read'',''document.manage'',''task.read'',''task.manage'',''notification.read'',
       ''notification.manage'',''contract.read'',''contract.manage'',''consent.read'',''audit.read'',
       ''integration.read'',''configuration.read'',''configuration.manage''
     ))
     or (sr.code = ''technical'' and p.code in (
       ''tenant.read'',''organization.read'',''user.read'',''property.read'',''property.manage'',
       ''partner.read'',''document.read'',''document.manage'',''task.read'',''task.manage'',
       ''notification.read'',''consent.read''
     ))
     or (sr.code = ''operator'' and p.code in (
       ''tenant.read'',''organization.read'',''property.read'',''document.read'',
       ''task.read'',''task.manage'',''notification.read''
     ))
     or (sr.code = ''finance'' and p.code in (
       ''tenant.read'',''organization.read'',''user.read'',''partner.read'',''document.read'',
       ''contract.read'',''contract.manage'',''notification.read'',''configuration.read''
     ))
     or (sr.code = ''partner'' and p.code in (
       ''tenant.read'',''organization.read'',''property.read'',''document.read'',''task.read'',''notification.read''
     ))
), inserted_permissions as (
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, m.role_id, m.permission_id
  from mapped m
  on conflict do nothing
  returning 1
)
select count(*)::int from inserted_permissions';

revoke all on function public.app_seed_default_roles(uuid)
from public, anonymous, authenticated, ifarm_api_runtime;

-- Administração global. Estas funções só são executáveis pelo role server-side.
create or replace function public.app_server_list_tenants(actor_user uuid)
returns table(
  id uuid,
  slug text,
  legal_name text,
  trade_name text,
  status public.tenant_status,
  created_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select t.id, t.slug, t.legal_name, t.trade_name, t.status, t.created_at
from public.tenants t
where exists (
  select 1 from public.users u
  where u.id = actor_user and u.is_ifarm_admin
)
order by t.created_at desc';

create or replace function public.app_server_create_tenant(
  actor_user uuid,
  tenant_slug text,
  tenant_legal_name text,
  tenant_trade_name text
)
returns table(
  id uuid,
  slug text,
  legal_name text,
  trade_name text,
  status public.tenant_status,
  created_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with allowed as (
  select 1
  where exists (
    select 1 from public.users u
    where u.id = actor_user and u.is_ifarm_admin
  )
    and nullif(trim(tenant_slug), '''') is not null
    and nullif(trim(tenant_legal_name), '''') is not null
), inserted as (
  insert into public.tenants(slug, legal_name, trade_name, status)
  select lower(trim(tenant_slug)), trim(tenant_legal_name), nullif(trim(tenant_trade_name), ''''), ''trial''::public.tenant_status
  from allowed
  returning id, slug, legal_name, trade_name, status, created_at
), seeded as (
  select public.app_seed_default_roles(i.id) as seeded_count
  from inserted i
), branded as (
  insert into public.configurations(tenant_id, namespace, key, value, updated_by)
  select i.id, ''core'', ''white_label'', jsonb_build_object(''brandName'', coalesce(i.trade_name, i.legal_name)), actor_user
  from inserted i
  cross join seeded s
  returning tenant_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.id, actor_user, ''tenant.create'', ''tenant'', i.id::text, jsonb_build_object(''slug'', i.slug)
  from inserted i
  cross join branded b
  returning id
)
select i.id, i.slug, i.legal_name, i.trade_name, i.status, i.created_at
from inserted i
cross join audited a';

-- Escrita de Organization. actor_user vem do JWT validado pelo Worker, nunca do payload do cliente.
create or replace function public.app_server_create_organization(
  actor_user uuid,
  org_name text,
  parent_organization_id uuid,
  org_document_number text,
  org_email text,
  org_phone text
)
returns table(
  id uuid,
  tenant_id uuid,
  parent_id uuid,
  name text,
  document_number text,
  email text,
  phone text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''organization.manage'')
    and nullif(trim(org_name), '''') is not null
), inserted as (
  insert into public.organizations(tenant_id, parent_id, name, document_number, email, phone)
  select a.tenant_id, parent_organization_id, trim(org_name),
         nullif(trim(org_document_number), ''''), nullif(trim(org_email), ''''), nullif(trim(org_phone), '''')
  from allowed a
  returning id, tenant_id, parent_id, name, document_number, email, phone, metadata, created_at, updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.tenant_id, actor_user, ''organization.create'', ''organization'', i.id::text,
         jsonb_build_object(''name'', i.name)
  from inserted i
  returning id
)
select i.id, i.tenant_id, i.parent_id, i.name, i.document_number, i.email, i.phone,
       i.metadata, i.created_at, i.updated_at
from inserted i
cross join audited a';

create or replace function public.app_server_update_organization(
  actor_user uuid,
  organization_id uuid,
  patch jsonb
)
returns table(
  id uuid,
  tenant_id uuid,
  parent_id uuid,
  name text,
  document_number text,
  email text,
  phone text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''organization.manage'')
), updated as (
  update public.organizations o
  set parent_id = case when patch ? ''parentId'' then nullif(patch ->> ''parentId'', '''')::uuid else o.parent_id end,
      name = case when patch ? ''name'' then nullif(trim(patch ->> ''name''), '''') else o.name end,
      document_number = case when patch ? ''documentNumber'' then nullif(trim(patch ->> ''documentNumber''), '''') else o.document_number end,
      email = case when patch ? ''email'' then nullif(trim(patch ->> ''email''), '''') else o.email end,
      phone = case when patch ? ''phone'' then nullif(trim(patch ->> ''phone''), '''') else o.phone end,
      updated_at = now()
  from allowed a
  where o.id = organization_id
    and o.tenant_id = a.tenant_id
    and o.deleted_at is null
    and (
      not (patch ? ''parentId'')
      or nullif(patch ->> ''parentId'', '''') is null
      or nullif(patch ->> ''parentId'', '''')::uuid <> o.id
    )
  returning o.id, o.tenant_id, o.parent_id, o.name, o.document_number, o.email, o.phone,
            o.metadata, o.created_at, o.updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''organization.update'', ''organization'', u.id::text,
         jsonb_build_object(''patchKeys'', coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k), ''[]''::jsonb))
  from updated u
  returning id
)
select u.id, u.tenant_id, u.parent_id, u.name, u.document_number, u.email, u.phone,
       u.metadata, u.created_at, u.updated_at
from updated u
cross join audited a';

create or replace function public.app_server_delete_organization(actor_user uuid, organization_id uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''organization.manage'')
), deleted as (
  update public.organizations o
  set deleted_at = now(), updated_at = now()
  from allowed a
  where o.id = organization_id
    and o.tenant_id = a.tenant_id
    and o.deleted_at is null
  returning o.id, o.tenant_id, o.name
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select d.tenant_id, actor_user, ''organization.delete'', ''organization'', d.id::text,
         jsonb_build_object(''name'', d.name)
  from deleted d
  returning id
)
select d.id from deleted d cross join audited a';

create or replace function public.app_server_update_white_label(actor_user uuid, branding jsonb)
returns jsonb
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''configuration.manage'')
), upserted as (
  insert into public.configurations(tenant_id, namespace, key, value, updated_by)
  select a.tenant_id, ''core'', ''white_label'', branding, actor_user
  from allowed a
  on conflict (tenant_id, namespace, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning tenant_id, value
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''configuration.white_label.update'', ''configuration'', ''core:white_label'',
         jsonb_build_object(''keys'', coalesce((select jsonb_agg(k) from jsonb_object_keys(u.value) k), ''[]''::jsonb))
  from upserted u
  returning id
)
select u.value from upserted u cross join audited a';

-- Troca de tenant continua acessível ao usuário, mas somente para membership ativa e agora é auditada.
create or replace function public.app_set_active_tenant(requested_tenant uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with actor_ctx as (
  select public.app_current_user_id() as user_id
), previous as (
  select uc.active_tenant_id
  from public.user_contexts uc
  join actor_ctx a on a.user_id = uc.user_id
), valid as (
  select a.user_id, m.tenant_id
  from actor_ctx a
  join public.memberships m
    on m.user_id = a.user_id
   and m.tenant_id = requested_tenant
   and m.status = ''active''
), upserted as (
  insert into public.user_contexts(user_id, active_tenant_id)
  select user_id, tenant_id from valid
  on conflict (user_id) do update
    set active_tenant_id = excluded.active_tenant_id,
        updated_at = now()
  returning user_id, active_tenant_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.active_tenant_id, u.user_id, ''tenant.context.switch'', ''tenant'', u.active_tenant_id::text,
         jsonb_build_object(''previousTenantId'', (select p.active_tenant_id from previous p limit 1))
  from upserted u
  returning id
)
select u.active_tenant_id from upserted u cross join audited a';

revoke all on function public.app_server_list_tenants(uuid) from public, anonymous, authenticated;
revoke all on function public.app_server_create_tenant(uuid,text,text,text) from public, anonymous, authenticated;
revoke all on function public.app_server_create_organization(uuid,text,uuid,text,text,text) from public, anonymous, authenticated;
revoke all on function public.app_server_update_organization(uuid,uuid,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_delete_organization(uuid,uuid) from public, anonymous, authenticated;
revoke all on function public.app_server_update_white_label(uuid,jsonb) from public, anonymous, authenticated;

-- Runtime role não recebe qualquer privilégio direto em tabela.
revoke all on public.tenants, public.users, public.user_contexts, public.organizations,
  public.roles, public.permissions, public.role_permissions, public.memberships,
  public.configurations, public.audit_events
from ifarm_api_runtime;

grant execute on function public.app_server_list_tenants(uuid) to ifarm_api_runtime;
grant execute on function public.app_server_create_tenant(uuid,text,text,text) to ifarm_api_runtime;
grant execute on function public.app_server_create_organization(uuid,text,uuid,text,text,text) to ifarm_api_runtime;
grant execute on function public.app_server_update_organization(uuid,uuid,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_delete_organization(uuid,uuid) to ifarm_api_runtime;
grant execute on function public.app_server_update_white_label(uuid,jsonb) to ifarm_api_runtime;
