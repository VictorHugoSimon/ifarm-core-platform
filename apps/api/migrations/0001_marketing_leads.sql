create table if not exists marketing_lead (
  id text primary key,
  created_at text not null,
  name text not null check (length(name) between 2 and 120),
  email text not null check (length(email) <= 200),
  phone text check (phone is null or length(phone) <= 30),
  organization text check (organization is null or length(organization) <= 160),
  profile text not null check (profile in ('farm','institutional','investor','technology','research','other')),
  message text not null check (length(message) between 10 and 4000),
  source text not null default 'smart-farm-site' check (length(source) <= 80),
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','discarded')),
  privacy_consent integer not null default 1 check (privacy_consent in (0,1)),
  consent_at text not null,
  metadata text not null default '{}'
);

create index if not exists marketing_lead_created_at_idx
  on marketing_lead (created_at desc);

create index if not exists marketing_lead_status_idx
  on marketing_lead (status, created_at desc);

create index if not exists marketing_lead_email_idx
  on marketing_lead (email);
