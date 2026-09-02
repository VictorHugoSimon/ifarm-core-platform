begin;

create table if not exists public.marketing_lead (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 30),
  organization text check (organization is null or char_length(organization) <= 160),
  profile text not null check (profile in ('farm','institutional','investor','technology','research','other')),
  message text not null check (char_length(message) between 10 and 4000),
  source text not null default 'smart-farm-site' check (char_length(source) <= 80),
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','discarded')),
  privacy_consent boolean not null default true,
  consent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists marketing_lead_created_at_idx on public.marketing_lead (created_at desc);
create index if not exists marketing_lead_status_idx on public.marketing_lead (status, created_at desc);
create index if not exists marketing_lead_email_idx on public.marketing_lead (lower(email));

alter table public.marketing_lead enable row level security;
revoke all on table public.marketing_lead from anon, authenticated;
grant select, insert, update, delete on table public.marketing_lead to service_role;

comment on table public.marketing_lead is 'Leads do site institucional iFarm. Acesso somente por backend autorizado.';
comment on column public.marketing_lead.privacy_consent is 'Consentimento informado no formulário para retorno sobre a solicitação.';

commit;
