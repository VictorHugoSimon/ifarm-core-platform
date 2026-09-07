-- iFarm Core / Neon — 0005
-- CORE-006: tabelas de parceiros, documentos e notificações.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  document_number text,
  partner_type text not null,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id)
);
create index partners_tenant_idx on public.partners(tenant_id);
create index partners_tenant_type_idx on public.partners(tenant_id, partner_type);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  organization_id uuid,
  property_id uuid,
  title text not null,
  category text,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, organization_id) references public.organizations(tenant_id, id),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id),
  foreign key (tenant_id, created_by) references public.memberships(tenant_id, user_id),
  check (size_bytes is null or size_bytes >= 0)
);
create index documents_tenant_idx on public.documents(tenant_id);
create index documents_tenant_property_idx on public.documents(tenant_id, property_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id)
);
create index notifications_tenant_user_idx on public.notifications(tenant_id, user_id, created_at desc);
create index notifications_unread_idx on public.notifications(tenant_id, user_id, created_at desc) where read_at is null;

alter table public.partners enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;

revoke all on public.partners, public.documents, public.notifications from anonymous, authenticated, ifarm_api_runtime;
grant select on public.partners, public.documents, public.notifications to authenticated;

create policy partners_read on public.partners
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('partner.read') or public.app_has_permission('partner.manage'))
);

create policy documents_read on public.documents
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('document.read') or public.app_has_permission('document.manage'))
);

create policy notifications_own_read on public.notifications
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and user_id = public.app_current_user_id()
  and (public.app_has_permission('notification.read') or public.app_has_permission('notification.manage'))
);
