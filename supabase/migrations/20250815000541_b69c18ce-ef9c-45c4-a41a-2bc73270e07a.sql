-- 1) Remove trigger/function that raises "CRITICAL SECURITY..." errors
do $$
declare r record;
begin
  for r in
    select t.tgname, p.oid::regprocedure as funcsig
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.invoices'::regclass
      and not t.tgisinternal
      and pg_get_functiondef(p.oid) ilike '%CRITICAL SECURITY%'
  loop
    execute format('drop trigger if exists %I on public.invoices', r.tgname);
    execute format('drop function if exists %s', r.funcsig);
  end loop;
end$$;

-- 2) Remove any unique index ONLY on gmail_message_id
do $$
declare idx text;
begin
  select indexname into idx
  from pg_indexes
  where schemaname='public'
    and tablename='invoices'
    and indexdef ilike '%unique%' and indexdef ilike '%(gmail_message_id)%';
  if idx is not null then
    execute format('drop index if exists %I', idx);
  end if;
end$$;

-- 3) Enforce per-user uniqueness
create unique index if not exists invoices_user_msg_uidx
  on public.invoices (user_id, gmail_message_id);

-- Add constraint (without if not exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'invoices_user_msg_uniq' 
    and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
    add constraint invoices_user_msg_uniq
    unique using index invoices_user_msg_uidx;
  end if;
end$$;