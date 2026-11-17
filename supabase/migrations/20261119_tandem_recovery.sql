-- A recovery code lets a person choose a new password without any email service. Only a hash of the code is stored.
alter table public.tandem_accounts add column if not exists recovery_hash text;
