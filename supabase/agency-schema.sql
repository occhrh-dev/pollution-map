-- Run in a NEW Supabase project. Provision organizations and memberships
-- with a trusted administrator; never expose service_role credentials in HTML.
begin;
create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('admin','editor','viewer')),
 primary key (organization_id,user_id)
);
create table public.map_projects (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null,
 state jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create index on public.map_projects(organization_id);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.map_projects enable row level security;
revoke all on public.organizations,public.organization_members,public.map_projects from anon,authenticated;
grant select on public.organizations,public.organization_members to authenticated;
grant select,insert,update,delete on public.map_projects to authenticated;
create policy own_membership on public.organization_members for select to authenticated
 using (user_id = (select auth.uid()));
create policy member_organization on public.organizations for select to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=id and m.user_id=(select auth.uid())));
create policy read_projects on public.map_projects for select to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid())));
create policy create_projects on public.map_projects for insert to authenticated
 with check (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));
create policy edit_projects on public.map_projects for update to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')))
 with check (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));
create policy delete_projects on public.map_projects for delete to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role='admin'));
commit;
-- Private attachments require separate Storage policies before enabling uploads.
