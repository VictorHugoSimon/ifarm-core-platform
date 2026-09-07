-- iFarm Core — Migration 0003
-- RBAC efetivo no PostgreSQL: remove a política genérica FOR ALL e aplica menor privilégio.

-- A decisão de administrador é confirmada no banco, e não apenas por claim potencialmente antiga.
create or replace function public.app_is_ifarm_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_ifarm_admin = true
  )
$$;

create or replace function public.app_is_active_tenant_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = public.app_current_tenant_id()
      and m.status = 'active'
  )
$$;

create or replace function public.app_has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.app_is_ifarm_admin()
    or exists (
      select 1
      from public.memberships m
      join public.role_permissions rp
        on rp.tenant_id = m.tenant_id
       and rp.role_id = m.role_id
      join public.permissions p
        on p.id = rp.permission_id
      where m.user_id = auth.uid()
        and m.tenant_id = public.app_current_tenant_id()
        and m.status = 'active'
        and p.code = requested_permission
    )
$$;

create or replace function public.app_my_permissions()
returns table(code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code
  from public.permissions p
  where public.app_is_ifarm_admin()

  union

  select p.code
  from public.memberships m
  join public.role_permissions rp
    on rp.tenant_id = m.tenant_id
   and rp.role_id = m.role_id
  join public.permissions p
    on p.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.tenant_id = public.app_current_tenant_id()
    and m.status = 'active'
$$;

revoke execute on function public.app_is_ifarm_admin() from public, anon;
revoke execute on function public.app_is_active_tenant_member() from public, anon;
revoke execute on function public.app_has_permission(text) from public, anon;
revoke execute on function public.app_my_permissions() from public, anon;
grant execute on function public.app_is_ifarm_admin() to authenticated, supabase_auth_admin;
grant execute on function public.app_is_active_tenant_member() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;
grant execute on function public.app_my_permissions() to authenticated;

-- Novas capabilities do Core.
insert into public.permissions(code, resource, action, description) values
('tenant.manage','tenant','manage','Administrar configurações estruturais do tenant'),
('organization.read','organization','read','Visualizar organizações'),
('user.read','user','read','Visualizar usuários do tenant'),
('rbac.read','rbac','read','Visualizar perfis e permissões'),
('partner.read','partner','read','Visualizar parceiros'),
('document.read','document','read','Visualizar documentos'),
('task.read','task','read','Visualizar tarefas'),
('task.manage','task','manage','Gerenciar tarefas'),
('notification.manage','notification','manage','Gerenciar notificações'),
('contract.read','contract','read','Visualizar contratos'),
('contract.manage','contract','manage','Gerenciar contratos'),
('consent.read','consent','read','Visualizar consentimentos'),
('consent.manage','consent','manage','Administrar consentimentos e evidências'),
('integration.read','integration','read','Visualizar integrações'),
('configuration.read','configuration','read','Visualizar configurações'),
('configuration.manage','configuration','manage','Gerenciar configurações')
on conflict (code) do nothing;

-- ACL explícita: a API utiliza token do usuário e RLS; anon não recebe acesso às entidades Core.
revoke all privileges on table
  public.tenants, public.organizations, public.users, public.roles, public.permissions,
  public.role_permissions, public.memberships, public.properties, public.fields, public.plots,
  public.crops, public.seasons, public.season_plots, public.partners, public.documents,
  public.tasks, public.notifications, public.contracts, public.consents, public.integrations,
  public.webhooks, public.configurations, public.audit_events
from anon;

grant select, insert, update, delete on table
  public.tenants, public.organizations, public.roles, public.role_permissions, public.memberships,
  public.properties, public.fields, public.plots, public.seasons, public.season_plots,
  public.partners, public.documents, public.tasks, public.contracts, public.integrations,
  public.webhooks, public.configurations, public.permissions, public.crops
 to authenticated;

grant select on table
  public.users, public.notifications, public.consents, public.audit_events
 to authenticated;

-- A política antiga era adequada apenas ao bootstrap: qualquer membro do tenant poderia escrever.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','roles','role_permissions','memberships','properties','fields','plots',
    'seasons','season_plots','partners','documents','tasks','notifications','contracts',
    'consents','integrations','webhooks','configurations','audit_events'
  ]
  loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
  end loop;
end $$;

-- Tenant: membros enxergam apenas o tenant ativo; alterações estruturais exigem tenant.manage.
drop policy if exists tenant_self_or_ifarm_admin on public.tenants;
create policy tenant_read on public.tenants for select to authenticated
using (
  public.app_is_ifarm_admin()
  or (id = public.app_current_tenant_id() and public.app_is_active_tenant_member())
);
create policy tenant_update on public.tenants for update to authenticated
using (id = public.app_current_tenant_id() and public.app_has_permission('tenant.manage'))
with check (id = public.app_current_tenant_id() and public.app_has_permission('tenant.manage'));
create policy tenant_ifarm_admin_insert on public.tenants for insert to authenticated
with check (public.app_is_ifarm_admin());
create policy tenant_ifarm_admin_delete on public.tenants for delete to authenticated
using (public.app_is_ifarm_admin());

-- Usuário: ninguém pode elevar is_ifarm_admin via Data API.
drop policy if exists users_visible_in_tenant on public.users;
drop policy if exists users_self_update on public.users;
create policy users_self_or_manager_read on public.users for select to authenticated
using (
  id = auth.uid()
  or public.app_is_ifarm_admin()
  or (
    public.app_has_permission('user.read')
    and exists (
      select 1 from public.memberships target_membership
      where target_membership.user_id = users.id
        and target_membership.tenant_id = public.app_current_tenant_id()
        and target_membership.status = 'active'
    )
  )
);
revoke insert, update, delete on public.users from authenticated;

-- Organizações.
create policy organizations_read on public.organizations for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('organization.read') or public.app_has_permission('organization.manage')));
create policy organizations_insert on public.organizations for insert to authenticated
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('organization.manage'));
create policy organizations_update on public.organizations for update to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('organization.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('organization.manage'));
create policy organizations_delete on public.organizations for delete to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('organization.manage'));

-- RBAC e memberships.
create policy roles_read on public.roles for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('rbac.read') or public.app_has_permission('rbac.manage')));
create policy roles_write on public.roles for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('rbac.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('rbac.manage'));
create policy role_permissions_read on public.role_permissions for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('rbac.read') or public.app_has_permission('rbac.manage')));
create policy role_permissions_write on public.role_permissions for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('rbac.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('rbac.manage'));
create policy memberships_read on public.memberships for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (user_id = auth.uid() or public.app_has_permission('user.read') or public.app_has_permission('user.manage'))
);
create policy memberships_write on public.memberships for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('user.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('user.manage'));

-- Registro rural.
create policy properties_read on public.properties for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('property.read') or public.app_has_permission('property.manage')));
create policy properties_write on public.properties for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'));
create policy fields_read on public.fields for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('property.read') or public.app_has_permission('property.manage')));
create policy fields_write on public.fields for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'));
create policy plots_read on public.plots for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('property.read') or public.app_has_permission('property.manage')));
create policy plots_write on public.plots for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'));
create policy seasons_read on public.seasons for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('property.read') or public.app_has_permission('property.manage')));
create policy seasons_write on public.seasons for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'));
create policy season_plots_read on public.season_plots for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('property.read') or public.app_has_permission('property.manage')));
create policy season_plots_write on public.season_plots for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('property.manage'));

-- Parceiros, documentos e tarefas.
create policy partners_read on public.partners for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('partner.read') or public.app_has_permission('partner.manage')));
create policy partners_write on public.partners for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('partner.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('partner.manage'));
create policy documents_read on public.documents for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('document.read') or public.app_has_permission('document.manage')));
create policy documents_write on public.documents for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('document.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('document.manage'));
create policy tasks_read on public.tasks for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('task.read') or public.app_has_permission('task.manage')));
create policy tasks_write on public.tasks for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('task.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('task.manage'));

-- Notificações: leitura é própria; alteração direta é bloqueada e o ACK usa RPC restrita.
create policy notifications_read on public.notifications for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (user_id = auth.uid() or public.app_has_permission('notification.manage'))
);
revoke insert, update, delete on public.notifications from authenticated;

create or replace function public.mark_notification_read(notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = notification_id
    and n.tenant_id = public.app_current_tenant_id()
    and n.user_id = auth.uid();

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Contratos.
create policy contracts_read on public.contracts for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('contract.read') or public.app_has_permission('contract.manage')));
create policy contracts_write on public.contracts for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('contract.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('contract.manage'));

-- Consentimentos: leitura do próprio titular ou governança; escrita bruta bloqueada até RPC dedicada.
create policy consents_read on public.consents for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (user_id = auth.uid() or public.app_has_permission('consent.read') or public.app_has_permission('consent.manage'))
);
revoke insert, update, delete on public.consents from authenticated;

-- Integrações e configurações.
create policy integrations_read on public.integrations for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('integration.read') or public.app_has_permission('integration.manage')));
create policy integrations_write on public.integrations for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('integration.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('integration.manage'));
create policy webhooks_read on public.webhooks for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('integration.read') or public.app_has_permission('integration.manage')));
create policy webhooks_write on public.webhooks for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('integration.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('integration.manage'));
create policy configurations_read on public.configurations for select to authenticated
using (tenant_id = public.app_current_tenant_id() and (public.app_has_permission('configuration.read') or public.app_has_permission('configuration.manage')));
create policy configurations_write on public.configurations for all to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('configuration.manage'))
with check (tenant_id = public.app_current_tenant_id() and public.app_has_permission('configuration.manage'));

-- Auditoria é append-only para o cliente. A função deriva ator e tenant do JWT verificado.
create policy audit_events_read on public.audit_events for select to authenticated
using (tenant_id = public.app_current_tenant_id() and public.app_has_permission('audit.read'));
revoke insert, update, delete on public.audit_events from authenticated;

create or replace function public.record_audit_event(
  event_action text,
  event_entity_type text,
  event_entity_id text default null,
  event_before jsonb default null,
  event_after jsonb default null,
  event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.app_is_ifarm_admin() and not public.app_is_active_tenant_member() then
    raise exception 'active tenant membership required' using errcode = '42501';
  end if;

  if nullif(btrim(event_action), '') is null or nullif(btrim(event_entity_type), '') is null then
    raise exception 'action and entity type are required' using errcode = '22023';
  end if;

  insert into public.audit_events(
    tenant_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    public.app_current_tenant_id(), 'user', auth.uid()::text,
    left(event_action, 120), left(event_entity_type, 120), event_entity_id,
    event_before, event_after, coalesce(event_metadata, '{}'::jsonb)
  ) returning id into created_id;

  return created_id;
end;
$$;
revoke execute on function public.record_audit_event(text,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.record_audit_event(text,text,text,jsonb,jsonb,jsonb) to authenticated;
