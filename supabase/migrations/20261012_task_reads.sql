create table if not exists public.task_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id bigint not null,
  read_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table public.task_reads
  alter column task_id type bigint using task_id::bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_reads'::regclass
      and conname = 'task_reads_task_id_fkey'
  ) then
    alter table public.task_reads
      add constraint task_reads_task_id_fkey
      foreign key (task_id) references public.tasks(id) on delete cascade;
  end if;
end
$$;

alter table public.task_reads enable row level security;

drop policy if exists "Users can read their task reads" on public.task_reads;
create policy "Users can read their task reads"
  on public.task_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their task reads" on public.task_reads;
create policy "Users can insert their task reads"
  on public.task_reads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their task reads" on public.task_reads;
create policy "Users can update their task reads"
  on public.task_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.task_reads to authenticated;
revoke all on public.task_reads from anon;