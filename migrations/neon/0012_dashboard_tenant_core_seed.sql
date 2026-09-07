-- iFarm Core / Neon — 0012
-- Garante que todo novo tenant criado pelo Core nasce com o módulo iFarm Core ativo.

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
), seeded_roles as (
  select i.id as tenant_id, public.app_seed_default_roles(i.id) as seeded_count
  from inserted i
), seeded_core as (
  select s.tenant_id, public.app_seed_core_module(s.tenant_id) as module_code
  from seeded_roles s
), branded as (
  insert into public.configurations(tenant_id, namespace, key, value, updated_by)
  select i.id, ''core'', ''white_label'', jsonb_build_object(''brandName'', coalesce(i.trade_name, i.legal_name)), actor_user
  from inserted i
  join seeded_core sc on sc.tenant_id = i.id
  returning tenant_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.id, actor_user, ''tenant.create'', ''tenant'', i.id::text,
         jsonb_build_object(''slug'', i.slug, ''coreModuleActive'', true)
  from inserted i
  join branded b on b.tenant_id = i.id
  returning id
)
select i.id, i.slug, i.legal_name, i.trade_name, i.status, i.created_at
from inserted i
join audited a on true';

revoke all on function public.app_server_create_tenant(uuid,text,text,text)
from public, anonymous, authenticated;
grant execute on function public.app_server_create_tenant(uuid,text,text,text)
to ifarm_api_runtime;
