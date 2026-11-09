alter table public.task_comments
  add column if not exists parent_comment_id bigint
  references public.task_comments(id) on delete cascade;

alter table public.task_attachments
  add column if not exists comment_id bigint
  references public.task_comments(id) on delete cascade;

create index if not exists task_comments_parent_comment_id_idx
  on public.task_comments(parent_comment_id);

create index if not exists task_attachments_comment_id_idx
  on public.task_attachments(comment_id);

drop policy if exists comment_delete_own on public.task_comments;
create policy comment_delete_own
  on public.task_comments
  for delete
  to authenticated
  using (author_id = public.current_emp_id());

drop policy if exists attachment_insert on public.task_attachments;
create policy attachment_insert
  on public.task_attachments
  for insert
  to authenticated
  with check (
    uploaded_by = public.current_emp_id()
    and exists (
      select 1
      from public.tasks t
      where t.id = task_attachments.task_id
        and (
          t.assignee_id = public.current_emp_id()
          or t.supervisor_id = public.current_emp_id()
          or public.is_manager_of(t.assignee_id)
          or public.current_role() in ('superadmin', 'executive')
        )
    )
    and (
      comment_id is null
      or exists (
        select 1
        from public.task_comments c
        where c.id = task_attachments.comment_id
          and c.task_id = task_attachments.task_id
      )
    )
  );