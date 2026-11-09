begin;

alter table public.tasks enable row level security;
alter table public.tasks alter column movement_mode set default 'team';
alter table public.tasks drop constraint if exists tasks_movement_mode_check;
alter table public.tasks
  add constraint tasks_movement_mode_check
  check (movement_mode in ('lead', 'team', 'selected', 'everyone', 'all'));

create or replace function public.can_move_task(p_task_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tasks t
    join public.employees e
      on e.id = public.current_emp_id()
     and e.auth_user_id = auth.uid()
    where t.id = p_task_id
      and (
        public.is_manager_of(t.assignee_id)
        or (
          not t.archived
          and t.status <> 'Completed'
          and (
            t.assignee_id = e.id
            or t.movement_mode = 'all'
            or (
              public.is_on_task(t.id, auth.uid())
              and (
                t.movement_mode in ('team', 'everyone')
                or (
                  t.movement_mode = 'selected'
                  and e.id = any(t.movement_member_ids)
                )
              )
            )
          )
        )
      )
  );
$$;

drop policy if exists task_select on public.tasks;
create policy task_select on public.tasks
for select to authenticated
using (
  public."current_role"() in ('superadmin', 'executive')
  or assignee_id = public.current_emp_id()
  or supervisor_id = public.current_emp_id()
  or public.is_manager_of(assignee_id)
  or movement_mode = 'all'
);

drop policy if exists task_update on public.tasks;
create policy task_update on public.tasks
for update to authenticated
using (
  public."current_role"() in ('superadmin', 'executive')
  or public.is_manager_of(assignee_id)
  or (
    public."current_role"() = 'manager'
    and assignee_id = public.current_emp_id()
  )
)
with check (
  public."current_role"() in ('superadmin', 'executive')
  or public.is_manager_of(assignee_id)
  or (
    public."current_role"() = 'manager'
    and assignee_id = public.current_emp_id()
  )
);

drop policy if exists task_update_via_assignees on public.tasks;
create policy task_update_via_assignees on public.tasks
for update to authenticated
using (public.can_move_task(id))
with check (public.can_move_task(id));

create or replace function public.guard_task_move_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_task_manager boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  is_task_manager :=
    public."current_role"() in ('superadmin', 'executive')
    or public.is_manager_of(old.assignee_id)
    or (
      public."current_role"() = 'manager'
      and old.assignee_id = public.current_emp_id()
    );

  if is_task_manager then
    return new;
  end if;

  if not public.can_move_task(old.id) then
    raise exception 'You are not allowed to move this task'
      using errcode = '42501';
  end if;

  if old.archived or old.status = 'Completed' or new.status = 'Completed' then
    raise exception 'Only a manager can update a completed or archived task'
      using errcode = '42501';
  end if;

  new.completed_at := old.completed_at;

  if (to_jsonb(new) - array['status', 'progress', 'completed_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'progress', 'completed_at']) then
    raise exception 'Employees may only update task status and progress'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_a_guard_move_updates on public.tasks;
create trigger tasks_a_guard_move_updates
before update on public.tasks
for each row execute function public.guard_task_move_updates();

commit;