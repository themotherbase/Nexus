begin;

alter table public.tasks
  add column if not exists completed_at timestamptz;

create or replace function public.capture_task_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Completed' then
    if tg_op = 'INSERT' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif old.status is distinct from 'Completed' then
      new.completed_at := now();
    else
      new.completed_at := coalesce(new.completed_at, old.completed_at);
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_capture_completed_at on public.tasks;
create trigger tasks_capture_completed_at
before insert or update on public.tasks
for each row execute function public.capture_task_completed_at();

commit;
