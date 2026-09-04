-- iFarm Core / Neon — 0004
-- CORE-005: propriedades, áreas e talhões multi-tenant.
-- Leitura via JWT + RLS. Escrita exclusivamente pelas capabilities server-side.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  organization_id uuid not null,
  name text not null,
  registration_code text,
  municipality text,
  state_code char(2),
  country_code char(2) not null default 'BR',
  total_area_ha numeric(14,4),
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, organization_id) references public.organizations(tenant_id, id),
  check (total_area_ha is null or total_area_ha >= 0),
  check (latitude is null or (latitude >= -90 and latitude <= 90)),
  check (longitude is null or (longitude >= -180 and longitude <= 180))
);
create index properties_tenant_idx on public.properties(tenant_id);
create index properties_tenant_organization_idx on public.properties(tenant_id, organization_id);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  property_id uuid not null,
  name text not null,
  area_ha numeric(14,4),
  geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id),
  check (area_ha is null or area_ha >= 0),
  check (geometry is null or jsonb_typeof(geometry) = 'object')
);
create index fields_tenant_property_idx on public.fields(tenant_id, property_id);

create table public.plots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  field_id uuid not null,
  code text,
  name text not null,
  area_ha numeric(14,4),
  geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, field_id) references public.fields(tenant_id, id),
  check (area_ha is null or area_ha >= 0),
  check (geometry is null or jsonb_typeof(geometry) = 'object')
);
create index plots_tenant_field_idx on public.plots(tenant_id, field_id);

alter table public.properties enable row level security;
alter table public.fields enable row level security;
alter table public.plots enable row level security;

revoke all on public.properties, public.fields, public.plots from anonymous, authenticated, ifarm_api_runtime;
grant select on public.properties, public.fields, public.plots to authenticated;

create policy properties_read on public.properties
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('property.read') or public.app_has_permission('property.manage'))
);

create policy fields_read on public.fields
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('property.read') or public.app_has_permission('property.manage'))
  and exists (
    select 1 from public.properties p
    where p.id = fields.property_id
      and p.tenant_id = fields.tenant_id
      and p.deleted_at is null
  )
);

create policy plots_read on public.plots
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('property.read') or public.app_has_permission('property.manage'))
  and exists (
    select 1
    from public.fields f
    join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id
    where f.id = plots.field_id
      and f.tenant_id = plots.tenant_id
      and f.deleted_at is null
      and p.deleted_at is null
  )
);

create or replace function public.app_list_properties()
returns table(
  id uuid, tenant_id uuid, organization_id uuid, name text, registration_code text,
  municipality text, state_code char(2), country_code char(2), total_area_ha numeric,
  latitude numeric, longitude numeric, metadata jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select p.id, p.tenant_id, p.organization_id, p.name, p.registration_code,
           p.municipality, p.state_code, p.country_code, p.total_area_ha,
           p.latitude, p.longitude, p.metadata, p.created_at, p.updated_at
from public.properties p
where p.tenant_id = public.app_current_tenant_id()
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
order by p.name';

create or replace function public.app_get_property(property_id uuid)
returns table(
  id uuid, tenant_id uuid, organization_id uuid, name text, registration_code text,
  municipality text, state_code char(2), country_code char(2), total_area_ha numeric,
  latitude numeric, longitude numeric, metadata jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select p.id, p.tenant_id, p.organization_id, p.name, p.registration_code,
           p.municipality, p.state_code, p.country_code, p.total_area_ha,
           p.latitude, p.longitude, p.metadata, p.created_at, p.updated_at
from public.properties p
where p.id = property_id
  and p.tenant_id = public.app_current_tenant_id()
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
limit 1';

create or replace function public.app_list_fields(target_property_id uuid)
returns table(
  id uuid, tenant_id uuid, property_id uuid, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select f.id, f.tenant_id, f.property_id, f.name, f.area_ha, f.geometry, f.created_at, f.updated_at
from public.fields f
join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id
where f.property_id = target_property_id
  and f.tenant_id = public.app_current_tenant_id()
  and f.deleted_at is null
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
order by f.name';

create or replace function public.app_get_field(field_id uuid)
returns table(
  id uuid, tenant_id uuid, property_id uuid, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select f.id, f.tenant_id, f.property_id, f.name, f.area_ha, f.geometry, f.created_at, f.updated_at
from public.fields f
join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id
where f.id = field_id
  and f.tenant_id = public.app_current_tenant_id()
  and f.deleted_at is null
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
limit 1';

create or replace function public.app_list_plots(target_field_id uuid)
returns table(
  id uuid, tenant_id uuid, field_id uuid, code text, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select pl.id, pl.tenant_id, pl.field_id, pl.code, pl.name, pl.area_ha, pl.geometry, pl.created_at, pl.updated_at
from public.plots pl
join public.fields f on f.tenant_id = pl.tenant_id and f.id = pl.field_id
join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id
where pl.field_id = target_field_id
  and pl.tenant_id = public.app_current_tenant_id()
  and pl.deleted_at is null
  and f.deleted_at is null
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
order by pl.name';

create or replace function public.app_get_plot(plot_id uuid)
returns table(
  id uuid, tenant_id uuid, field_id uuid, code text, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select pl.id, pl.tenant_id, pl.field_id, pl.code, pl.name, pl.area_ha, pl.geometry, pl.created_at, pl.updated_at
from public.plots pl
join public.fields f on f.tenant_id = pl.tenant_id and f.id = pl.field_id
join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id
where pl.id = plot_id
  and pl.tenant_id = public.app_current_tenant_id()
  and pl.deleted_at is null
  and f.deleted_at is null
  and p.deleted_at is null
  and (public.app_has_permission(''property.read'') or public.app_has_permission(''property.manage''))
limit 1';

revoke all on function public.app_list_properties() from public, anonymous;
revoke all on function public.app_get_property(uuid) from public, anonymous;
revoke all on function public.app_list_fields(uuid) from public, anonymous;
revoke all on function public.app_get_field(uuid) from public, anonymous;
revoke all on function public.app_list_plots(uuid) from public, anonymous;
revoke all on function public.app_get_plot(uuid) from public, anonymous;

grant execute on function public.app_list_properties() to authenticated;
grant execute on function public.app_get_property(uuid) to authenticated;
grant execute on function public.app_list_fields(uuid) to authenticated;
grant execute on function public.app_get_field(uuid) to authenticated;
grant execute on function public.app_list_plots(uuid) to authenticated;
grant execute on function public.app_get_plot(uuid) to authenticated;

create or replace function public.app_server_create_property(
  actor_user uuid,
  target_organization_id uuid,
  property_name text,
  property_registration_code text,
  property_municipality text,
  property_state_code text,
  property_country_code text,
  property_total_area_ha numeric,
  property_latitude numeric,
  property_longitude numeric
)
returns table(
  id uuid, tenant_id uuid, organization_id uuid, name text, registration_code text,
  municipality text, state_code char(2), country_code char(2), total_area_ha numeric,
  latitude numeric, longitude numeric, metadata jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  join public.organizations o on o.tenant_id = c.tenant_id and o.id = target_organization_id and o.deleted_at is null
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
    and nullif(trim(property_name), '''') is not null
    and (property_total_area_ha is null or property_total_area_ha >= 0)
    and (property_latitude is null or property_latitude between -90 and 90)
    and (property_longitude is null or property_longitude between -180 and 180)
), inserted as (
  insert into public.properties(
    tenant_id, organization_id, name, registration_code, municipality, state_code,
    country_code, total_area_ha, latitude, longitude
  )
  select a.tenant_id, target_organization_id, trim(property_name),
         nullif(trim(property_registration_code), ''''), nullif(trim(property_municipality), ''''),
         nullif(upper(trim(property_state_code)), '''')::char(2),
         coalesce(nullif(upper(trim(property_country_code)), ''''), ''BR'')::char(2),
         property_total_area_ha, property_latitude, property_longitude
  from allowed a
  returning id, tenant_id, organization_id, name, registration_code, municipality, state_code,
            country_code, total_area_ha, latitude, longitude, metadata, created_at, updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.tenant_id, actor_user, ''property.create'', ''property'', i.id::text,
         jsonb_build_object(''name'', i.name, ''organizationId'', i.organization_id)
  from inserted i
  returning id
)
select i.* from inserted i cross join audited a';

create or replace function public.app_server_update_property(actor_user uuid, target_property_id uuid, patch jsonb)
returns table(
  id uuid, tenant_id uuid, organization_id uuid, name text, registration_code text,
  municipality text, state_code char(2), country_code char(2), total_area_ha numeric,
  latitude numeric, longitude numeric, metadata jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
), updated as (
  update public.properties p
  set name = case when patch ? ''name'' then nullif(trim(patch ->> ''name''), '''') else p.name end,
      registration_code = case when patch ? ''registrationCode'' then nullif(trim(patch ->> ''registrationCode''), '''') else p.registration_code end,
      municipality = case when patch ? ''municipality'' then nullif(trim(patch ->> ''municipality''), '''') else p.municipality end,
      state_code = case when patch ? ''stateCode'' then nullif(upper(trim(patch ->> ''stateCode'')), '''')::char(2) else p.state_code end,
      country_code = case when patch ? ''countryCode'' then coalesce(nullif(upper(trim(patch ->> ''countryCode'')), ''''), ''BR'')::char(2) else p.country_code end,
      total_area_ha = case when patch ? ''totalAreaHa'' then nullif(patch ->> ''totalAreaHa'', '''')::numeric else p.total_area_ha end,
      latitude = case when patch ? ''latitude'' then nullif(patch ->> ''latitude'', '''')::numeric else p.latitude end,
      longitude = case when patch ? ''longitude'' then nullif(patch ->> ''longitude'', '''')::numeric else p.longitude end,
      updated_at = now()
  from allowed a
  where p.id = target_property_id
    and p.tenant_id = a.tenant_id
    and p.deleted_at is null
    and (not (patch ? ''name'') or nullif(trim(patch ->> ''name''), '''') is not null)
    and (not (patch ? ''totalAreaHa'') or nullif(patch ->> ''totalAreaHa'', '''') is null or nullif(patch ->> ''totalAreaHa'', '''')::numeric >= 0)
    and (not (patch ? ''latitude'') or nullif(patch ->> ''latitude'', '''') is null or nullif(patch ->> ''latitude'', '''')::numeric between -90 and 90)
    and (not (patch ? ''longitude'') or nullif(patch ->> ''longitude'', '''') is null or nullif(patch ->> ''longitude'', '''')::numeric between -180 and 180)
  returning p.id, p.tenant_id, p.organization_id, p.name, p.registration_code, p.municipality,
            p.state_code, p.country_code, p.total_area_ha, p.latitude, p.longitude,
            p.metadata, p.created_at, p.updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''property.update'', ''property'', u.id::text,
         jsonb_build_object(''patchKeys'', coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k), ''[]''::jsonb))
  from updated u
  returning id
)
select u.* from updated u cross join audited a';

create or replace function public.app_server_delete_property(actor_user uuid, target_property_id uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
), deleted as (
  update public.properties p
  set deleted_at = now(), updated_at = now()
  from allowed a
  where p.id = target_property_id and p.tenant_id = a.tenant_id and p.deleted_at is null
  returning p.id, p.tenant_id, p.name
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select d.tenant_id, actor_user, ''property.delete'', ''property'', d.id::text, jsonb_build_object(''name'', d.name)
  from deleted d
  returning id
)
select d.id from deleted d cross join audited a';

create or replace function public.app_server_create_field(
  actor_user uuid, target_property_id uuid, field_name text, field_area_ha numeric, field_geometry jsonb
)
returns table(
  id uuid, tenant_id uuid, property_id uuid, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  join public.properties p on p.tenant_id = c.tenant_id and p.id = target_property_id and p.deleted_at is null
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
    and nullif(trim(field_name), '''') is not null
    and (field_area_ha is null or field_area_ha >= 0)
    and (field_geometry is null or jsonb_typeof(field_geometry) = ''object'')
), inserted as (
  insert into public.fields(tenant_id, property_id, name, area_ha, geometry)
  select a.tenant_id, target_property_id, trim(field_name), field_area_ha, field_geometry from allowed a
  returning id, tenant_id, property_id, name, area_ha, geometry, created_at, updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.tenant_id, actor_user, ''field.create'', ''field'', i.id::text,
         jsonb_build_object(''name'', i.name, ''propertyId'', i.property_id)
  from inserted i
  returning id
)
select i.* from inserted i cross join audited a';

create or replace function public.app_server_update_field(actor_user uuid, target_field_id uuid, patch jsonb)
returns table(
  id uuid, tenant_id uuid, property_id uuid, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
), updated as (
  update public.fields f
  set name = case when patch ? ''name'' then nullif(trim(patch ->> ''name''), '''') else f.name end,
      area_ha = case when patch ? ''areaHa'' then nullif(patch ->> ''areaHa'', '''')::numeric else f.area_ha end,
      geometry = case when patch ? ''geometry'' then patch -> ''geometry'' else f.geometry end,
      updated_at = now()
  from allowed a
  where f.id = target_field_id
    and f.tenant_id = a.tenant_id
    and f.deleted_at is null
    and exists (select 1 from public.properties p where p.id=f.property_id and p.tenant_id=f.tenant_id and p.deleted_at is null)
    and (not (patch ? ''name'') or nullif(trim(patch ->> ''name''), '''') is not null)
    and (not (patch ? ''areaHa'') or nullif(patch ->> ''areaHa'', '''') is null or nullif(patch ->> ''areaHa'', '''')::numeric >= 0)
    and (not (patch ? ''geometry'') or patch -> ''geometry'' is null or jsonb_typeof(patch -> ''geometry'') = ''object'')
  returning f.id, f.tenant_id, f.property_id, f.name, f.area_ha, f.geometry, f.created_at, f.updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''field.update'', ''field'', u.id::text,
         jsonb_build_object(''patchKeys'', coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k), ''[]''::jsonb))
  from updated u
  returning id
)
select u.* from updated u cross join audited a';

create or replace function public.app_server_delete_field(actor_user uuid, target_field_id uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id from ctx c
  where c.tenant_id is not null and public.app_has_permission_for_user(actor_user, ''property.manage'')
), deleted as (
  update public.fields f
  set deleted_at = now(), updated_at = now()
  from allowed a
  where f.id = target_field_id and f.tenant_id = a.tenant_id and f.deleted_at is null
  returning f.id, f.tenant_id, f.name
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select d.tenant_id, actor_user, ''field.delete'', ''field'', d.id::text, jsonb_build_object(''name'', d.name)
  from deleted d
  returning id
)
select d.id from deleted d cross join audited a';

create or replace function public.app_server_create_plot(
  actor_user uuid, target_field_id uuid, plot_code text, plot_name text, plot_area_ha numeric, plot_geometry jsonb
)
returns table(
  id uuid, tenant_id uuid, field_id uuid, code text, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  join public.fields f on f.tenant_id = c.tenant_id and f.id = target_field_id and f.deleted_at is null
  join public.properties p on p.tenant_id = f.tenant_id and p.id = f.property_id and p.deleted_at is null
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''property.manage'')
    and nullif(trim(plot_name), '''') is not null
    and (plot_area_ha is null or plot_area_ha >= 0)
    and (plot_geometry is null or jsonb_typeof(plot_geometry) = ''object'')
), inserted as (
  insert into public.plots(tenant_id, field_id, code, name, area_ha, geometry)
  select a.tenant_id, target_field_id, nullif(trim(plot_code), ''''), trim(plot_name), plot_area_ha, plot_geometry from allowed a
  returning id, tenant_id, field_id, code, name, area_ha, geometry, created_at, updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.tenant_id, actor_user, ''plot.create'', ''plot'', i.id::text,
         jsonb_build_object(''name'', i.name, ''fieldId'', i.field_id)
  from inserted i
  returning id
)
select i.* from inserted i cross join audited a';

create or replace function public.app_server_update_plot(actor_user uuid, target_plot_id uuid, patch jsonb)
returns table(
  id uuid, tenant_id uuid, field_id uuid, code text, name text, area_ha numeric,
  geometry jsonb, created_at timestamptz, updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id from ctx c
  where c.tenant_id is not null and public.app_has_permission_for_user(actor_user, ''property.manage'')
), updated as (
  update public.plots pl
  set code = case when patch ? ''code'' then nullif(trim(patch ->> ''code''), '''') else pl.code end,
      name = case when patch ? ''name'' then nullif(trim(patch ->> ''name''), '''') else pl.name end,
      area_ha = case when patch ? ''areaHa'' then nullif(patch ->> ''areaHa'', '''')::numeric else pl.area_ha end,
      geometry = case when patch ? ''geometry'' then patch -> ''geometry'' else pl.geometry end,
      updated_at = now()
  from allowed a
  where pl.id = target_plot_id
    and pl.tenant_id = a.tenant_id
    and pl.deleted_at is null
    and exists (
      select 1 from public.fields f
      join public.properties p on p.tenant_id=f.tenant_id and p.id=f.property_id
      where f.id=pl.field_id and f.tenant_id=pl.tenant_id and f.deleted_at is null and p.deleted_at is null
    )
    and (not (patch ? ''name'') or nullif(trim(patch ->> ''name''), '''') is not null)
    and (not (patch ? ''areaHa'') or nullif(patch ->> ''areaHa'', '''') is null or nullif(patch ->> ''areaHa'', '''')::numeric >= 0)
    and (not (patch ? ''geometry'') or patch -> ''geometry'' is null or jsonb_typeof(patch -> ''geometry'') = ''object'')
  returning pl.id, pl.tenant_id, pl.field_id, pl.code, pl.name, pl.area_ha, pl.geometry, pl.created_at, pl.updated_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''plot.update'', ''plot'', u.id::text,
         jsonb_build_object(''patchKeys'', coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k), ''[]''::jsonb))
  from updated u
  returning id
)
select u.* from updated u cross join audited a';

create or replace function public.app_server_delete_plot(actor_user uuid, target_plot_id uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id from ctx c
  where c.tenant_id is not null and public.app_has_permission_for_user(actor_user, ''property.manage'')
), deleted as (
  update public.plots pl
  set deleted_at = now(), updated_at = now()
  from allowed a
  where pl.id = target_plot_id and pl.tenant_id = a.tenant_id and pl.deleted_at is null
  returning pl.id, pl.tenant_id, pl.name
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select d.tenant_id, actor_user, ''plot.delete'', ''plot'', d.id::text, jsonb_build_object(''name'', d.name)
  from deleted d
  returning id
)
select d.id from deleted d cross join audited a';

revoke all on function public.app_server_create_property(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric) from public, anonymous, authenticated;
revoke all on function public.app_server_update_property(uuid,uuid,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_delete_property(uuid,uuid) from public, anonymous, authenticated;
revoke all on function public.app_server_create_field(uuid,uuid,text,numeric,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_update_field(uuid,uuid,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_delete_field(uuid,uuid) from public, anonymous, authenticated;
revoke all on function public.app_server_create_plot(uuid,uuid,text,text,numeric,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_update_plot(uuid,uuid,jsonb) from public, anonymous, authenticated;
revoke all on function public.app_server_delete_plot(uuid,uuid) from public, anonymous, authenticated;

revoke all on public.properties, public.fields, public.plots from ifarm_api_runtime;

grant execute on function public.app_server_create_property(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric) to ifarm_api_runtime;
grant execute on function public.app_server_update_property(uuid,uuid,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_delete_property(uuid,uuid) to ifarm_api_runtime;
grant execute on function public.app_server_create_field(uuid,uuid,text,numeric,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_update_field(uuid,uuid,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_delete_field(uuid,uuid) to ifarm_api_runtime;
grant execute on function public.app_server_create_plot(uuid,uuid,text,text,numeric,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_update_plot(uuid,uuid,jsonb) to ifarm_api_runtime;
grant execute on function public.app_server_delete_plot(uuid,uuid) to ifarm_api_runtime;
