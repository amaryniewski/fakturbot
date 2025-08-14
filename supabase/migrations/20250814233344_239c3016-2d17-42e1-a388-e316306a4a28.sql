-- Add unique constraint on (user_id, gmail_message_id) for proper per-user deduplication
create unique index if not exists invoices_user_msg_uidx
  on public.invoices (user_id, gmail_message_id);

alter table public.invoices
  add constraint invoices_user_msg_uniq
  unique using index invoices_user_msg_uidx;