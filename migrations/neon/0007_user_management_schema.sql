-- iFarm Core / Neon — 0007
-- CORE-007: convites de membership e hardening de gestão de usuários.

create table public.membership_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  email text not null,
  role_id uuid not null,
  organization_id uuid,
  token_hash char(64) not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid not null,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  foreign key (tenant_id,role_id) references public.roles(tenant_id,id),
  foreign key (tenant_id,organization_id) references public.organizations(tenant_id,id),
  foreign key (tenant_id,invited_by) references public.memberships(tenant_id,user_id),
  foreign key (tenant_id,accepted_by) references public.memberships(tenant_id,user_id),
  check (email = lower(trim(email))),
  check (expires_at > created_at)
);
create index membership_invitations_tenant_status_idx on public.membership_invitations(tenant_id,status,created_at desc);
create index membership_invitations_email_idx on public.membership_invitations(email,status);

alter table public.membership_invitations enable row level security;
revoke all on public.membership_invitations from public, anonymous, authenticated, ifarm_api_runtime;

-- Least privilege: managers podem visualizar usuários/RBAC, mas não administrar memberships.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.tenant_id=r.tenant_id
  and rp.role_id=r.id
  and rp.permission_id=p.id
  and r.code='manager'
  and p.code='user.manage';

-- Atualiza o seed para novos tenants com a mesma política de least privilege.
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
       ''tenant.read'',''organization.read'',''organization.manage'',''user.read'',
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
