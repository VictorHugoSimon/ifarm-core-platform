-- iFarm Core — Migration 0004
-- Roles padrão de cada tenant e matriz inicial de menor privilégio.

create or replace function public.ensure_default_tenant_roles(target_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tenants t where t.id = target_tenant) then
    raise exception 'tenant not found' using errcode = '23503';
  end if;

  insert into public.roles(tenant_id, code, name, description, is_system)
  values
    (target_tenant, 'owner', 'Proprietário / Produtor', 'Responsável principal pelo tenant rural.', true),
    (target_tenant, 'tenant_admin', 'Administrador', 'Administração operacional do tenant.', true),
    (target_tenant, 'manager', 'Gestor', 'Gestão da operação e das equipes.', true),
    (target_tenant, 'technical', 'Técnico', 'Atuação técnica sobre propriedades, documentos e tarefas.', true),
    (target_tenant, 'operator', 'Operador', 'Execução operacional com acesso restrito.', true),
    (target_tenant, 'finance', 'Financeiro', 'Operações financeiras, contratos e documentação relacionada.', true),
    (target_tenant, 'partner', 'Parceiro', 'Acesso mínimo para integrações e jornadas de parceria.', true)
  on conflict (tenant_id, code) do update set
    name = excluded.name,
    description = excluded.description,
    is_system = true;

  -- Proprietário e Administrador: todas as capabilities tenant-scoped existentes.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.tenant_id = target_tenant
    and r.code in ('owner', 'tenant_admin')
  on conflict do nothing;

  -- Gestor: operação ampla, sem alterar RBAC estrutural nem integrações críticas.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  join public.permissions p on p.code = any(array[
    'tenant.read','organization.read','organization.manage',
    'user.read','user.manage','rbac.read',
    'property.read','property.manage','partner.read','partner.manage',
    'document.read','document.manage','task.read','task.manage',
    'notification.read','notification.manage','contract.read','contract.manage',
    'consent.read','audit.read','integration.read',
    'configuration.read'
  ])
  where r.tenant_id = target_tenant and r.code = 'manager'
  on conflict do nothing;

  -- Técnico.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  join public.permissions p on p.code = any(array[
    'tenant.read','organization.read','property.read','property.manage',
    'partner.read','document.read','document.manage','task.read','task.manage',
    'notification.read'
  ])
  where r.tenant_id = target_tenant and r.code = 'technical'
  on conflict do nothing;

  -- Operador.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  join public.permissions p on p.code = any(array[
    'tenant.read','organization.read','property.read','document.read',
    'task.read','task.manage','notification.read'
  ])
  where r.tenant_id = target_tenant and r.code = 'operator'
  on conflict do nothing;

  -- Financeiro.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  join public.permissions p on p.code = any(array[
    'tenant.read','organization.read','user.read','partner.read',
    'document.read','document.manage','notification.read',
    'contract.read','contract.manage','consent.read','integration.read'
  ])
  where r.tenant_id = target_tenant and r.code = 'finance'
  on conflict do nothing;

  -- Parceiro começa deliberadamente mínimo. Escopo por contrato/propriedade virá em ACL contextual.
  insert into public.role_permissions(tenant_id, role_id, permission_id)
  select target_tenant, r.id, p.id
  from public.roles r
  join public.permissions p on p.code = any(array[
    'tenant.read','notification.read'
  ])
  where r.tenant_id = target_tenant and r.code = 'partner'
  on conflict do nothing;
end;
$$;

revoke execute on function public.ensure_default_tenant_roles(uuid) from public, anon, authenticated;

create or replace function public.bootstrap_default_tenant_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_default_tenant_roles(new.id);
  return new;
end;
$$;

revoke execute on function public.bootstrap_default_tenant_roles() from public, anon, authenticated;

drop trigger if exists on_tenant_bootstrap_default_roles on public.tenants;
create trigger on_tenant_bootstrap_default_roles
after insert on public.tenants
for each row execute function public.bootstrap_default_tenant_roles();

-- Backfill seguro para tenants eventualmente criados pelas migrations anteriores.
do $$
declare
  tenant_row record;
begin
  for tenant_row in select id from public.tenants loop
    perform public.ensure_default_tenant_roles(tenant_row.id);
  end loop;
end $$;
