-- Supporters: people the owner invites to see chosen goals, their plans and milestones,
-- and to cheer or comment. Pocket stays owner-only. Run once, after the initial schema.

/* 1. Supporters get an account link, a secret invite token, and per-goal access. */

alter table public.supporters drop column goal_id;
alter table public.supporters
  add column user_id uuid references auth.users(id) on delete set null,
  add column invite_token uuid not null default gen_random_uuid() unique,
  add column accepted_at timestamptz,
  add constraint supporter_name_length check (char_length(trim(name)) between 1 and 80),
  add constraint supporter_email_shape check (email ~ '^\S+@\S+\.\S+$');
create unique index one_invite_per_email on public.supporters(challenge_id, lower(email));
create index supporters_user_idx on public.supporters(user_id) where user_id is not null;

create table public.supporter_goals (
  supporter_id uuid not null references public.supporters(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  primary key (supporter_id, goal_id)
);
create index supporter_goals_goal_idx on public.supporter_goals(goal_id);

-- Only accept_invite / leave_book may link an account or accept; the owner may withdraw
-- access, restore it, or edit a pending invite.
create or replace function public.guard_supporter_write() returns trigger language plpgsql as $$
begin
  if current_setting('sixtoc.invite_flow', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := null;
    new.accepted_at := null;
    new.invite_status := 'pending';
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.accepted_at is distinct from old.accepted_at
     or new.invite_token <> old.invite_token or new.challenge_id <> old.challenge_id then
    raise exception 'Only the invited person can accept an invite';
  end if;
  if new.invite_status <> old.invite_status then
    if old.invite_status = 'declined' then raise exception 'This person left the book. Remove them and send a new invite instead'; end if;
    if new.invite_status = 'declined' then raise exception 'Only the supporter can leave a book'; end if;
    if new.invite_status = 'accepted' and (old.user_id is null or old.invite_status <> 'revoked') then
      raise exception 'Only the invited person can accept an invite';
    end if;
    if new.invite_status = 'pending' and old.user_id is not null then raise exception 'This person already accepted; restore them instead'; end if;
  end if;
  if new.email is distinct from old.email and old.user_id is not null then
    raise exception 'The email can''t change after the invite was accepted';
  end if;
  return new;
end;
$$;
create trigger guard_supporter_before_write before insert or update on public.supporters
  for each row execute function public.guard_supporter_write();

create or replace function public.validate_supporter_goal() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists(
    select 1 from supporters s join goals g on g.challenge_id = s.challenge_id
    where s.id = new.supporter_id and g.id = new.goal_id
  ) then raise exception 'A supporter can only be given goals from the same six months'; end if;
  return new;
end;
$$;
create trigger validate_supporter_goal_before_write before insert or update on public.supporter_goals
  for each row execute function public.validate_supporter_goal();

/* 2. Who supports what. security definer so policies can ask without recursing. */

create or replace function public.supports_goal(candidate uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from supporter_goals sg join supporters s on s.id = sg.supporter_id
    where sg.goal_id = candidate and s.user_id = auth.uid() and s.invite_status = 'accepted'
  );
$$;
create or replace function public.supports_challenge(candidate uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from supporters where challenge_id = candidate and user_id = auth.uid() and invite_status = 'accepted');
$$;
create or replace function public.is_my_supporter_row(candidate uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from supporters where id = candidate and user_id = auth.uid() and invite_status = 'accepted');
$$;

/* 3. The invite flow. The token is the secret in the link; the email check is the lock. */

-- What the invite page may show before sign-in: names only, no goals, a masked email.
create or replace function public.invite_details(token uuid)
returns table (supporter_name text, owner_name text, email_hint text, status public.invite_status, goal_count int)
language sql stable security definer set search_path = public as $$
  select s.name, p.name, regexp_replace(s.email, '^(.)[^@]*(@.*)$', '\1•••\2'), s.invite_status,
         (select count(*)::int from supporter_goals sg where sg.supporter_id = s.id)
  from supporters s
  join six_month_challenges c on c.id = s.challenge_id
  join profiles p on p.id = c.user_id
  where s.invite_token = token;
$$;

create or replace function public.accept_invite(token uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare
  invite supporters;
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into invite from supporters where invite_token = token;
  if invite.id is null then raise exception 'This invite link doesn''t exist.'; end if;
  if invite.invite_status = 'revoked' then raise exception 'This invite was withdrawn.'; end if;
  if caller_email <> lower(invite.email) then raise exception 'This invite was sent to a different email address.'; end if;
  if invite.user_id is not null and invite.user_id <> auth.uid() then raise exception 'This invite was already used.'; end if;
  if exists(select 1 from six_month_challenges where id = invite.challenge_id and user_id = auth.uid()) then
    raise exception 'You can''t be a supporter of your own book.';
  end if;
  perform set_config('sixtoc.invite_flow', 'on', true);
  update supporters set user_id = auth.uid(), invite_status = 'accepted', accepted_at = coalesce(accepted_at, now())
  where id = invite.id;
  perform set_config('sixtoc.invite_flow', 'off', true);
  return invite.id;
end;
$$;

create or replace function public.leave_book(supporter uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('sixtoc.invite_flow', 'on', true);
  update supporters set invite_status = 'declined' where id = supporter and user_id = auth.uid();
  perform set_config('sixtoc.invite_flow', 'off', true);
end;
$$;

-- The books the signed-in person supports, with the owner's name (profiles stay private).
create or replace function public.my_supported_books()
returns table (supporter_id uuid, owner_name text, start_date date, end_date date, goal_count int)
language sql stable security definer set search_path = public as $$
  select s.id, p.name, c.start_date, c.end_date,
         (select count(*)::int from supporter_goals sg where sg.supporter_id = s.id)
  from supporters s
  join six_month_challenges c on c.id = s.challenge_id
  join profiles p on p.id = c.user_id
  where s.user_id = auth.uid() and s.invite_status = 'accepted'
  order by s.accepted_at desc;
$$;

revoke execute on function public.accept_invite(uuid), public.leave_book(uuid), public.my_supported_books() from public, anon;
grant execute on function public.accept_invite(uuid), public.leave_book(uuid), public.my_supported_books() to authenticated;
grant execute on function public.invite_details(uuid) to anon, authenticated;

/* 4. Encouragement: a cheer (no text) or a comment, on a goal, a plan step or a milestone. */

drop policy "owners read encouragements" on public.encouragements;
alter table public.encouragements drop constraint encouragements_message_check;
alter table public.encouragements alter column message drop not null;
alter table public.encouragements
  add column kind text not null check (kind in ('cheer', 'comment')),
  add column goal_id uuid not null references public.goals(id) on delete cascade,
  add column plan_item_id uuid references public.plan_items(id) on delete cascade,
  add column milestone_id uuid references public.milestones(id) on delete cascade,
  add constraint encouragement_single_target check (plan_item_id is null or milestone_id is null),
  add constraint encouragement_payload check (
    (kind = 'cheer' and message is null) or
    (kind = 'comment' and char_length(trim(message)) between 1 and 500)
  );
create unique index one_cheer_per_target on public.encouragements(supporter_id, coalesce(plan_item_id, milestone_id, goal_id)) where kind = 'cheer';
create index encouragements_challenge_idx on public.encouragements(challenge_id, created_at desc);
create index encouragements_goal_idx on public.encouragements(goal_id);

-- Fills challenge_id from the goal and checks the step / milestone really belongs to it.
create or replace function public.validate_encouragement() returns trigger language plpgsql security definer set search_path = public as $$
declare goal_challenge uuid;
begin
  select challenge_id into goal_challenge from goals where id = new.goal_id;
  if goal_challenge is null then raise exception 'Goal not found'; end if;
  new.challenge_id := goal_challenge;
  if not exists(select 1 from supporters where id = new.supporter_id and challenge_id = goal_challenge) then
    raise exception 'That supporter isn''t part of these six months';
  end if;
  if new.plan_item_id is not null and not exists(select 1 from plan_items where id = new.plan_item_id and goal_id = new.goal_id) then
    raise exception 'That step isn''t on this goal';
  end if;
  if new.milestone_id is not null and not exists(select 1 from milestones where id = new.milestone_id and goal_id = new.goal_id) then
    raise exception 'That milestone isn''t on this goal';
  end if;
  return new;
end;
$$;
create trigger validate_encouragement_before_insert before insert on public.encouragements
  for each row execute function public.validate_encouragement();

/* 5. Row-level security. Supporter policies are read-only and never touch pocket_items. */

alter table public.supporter_goals enable row level security;

create policy "supporters read their own invite" on public.supporters
  for select using (user_id = auth.uid());

create policy "owners manage supporter goals" on public.supporter_goals for all
  using (exists(select 1 from public.supporters s where s.id = supporter_id and public.owns_challenge(s.challenge_id)))
  with check (exists(select 1 from public.supporters s where s.id = supporter_id and public.owns_challenge(s.challenge_id)));
create policy "supporters read their goal list" on public.supporter_goals
  for select using (public.is_my_supporter_row(supporter_id));

create policy "supporters read shared challenges" on public.six_month_challenges
  for select using (public.supports_challenge(id));
create policy "supporters read shared goals" on public.goals
  for select using (public.supports_goal(id));
create policy "supporters read shared plans" on public.plan_items
  for select using (public.supports_goal(goal_id));
create policy "supporters read shared milestones" on public.milestones
  for select using (public.supports_goal(goal_id));

create policy "owners read encouragements" on public.encouragements
  for select using (public.owns_challenge(challenge_id));
create policy "owners remove encouragements" on public.encouragements
  for delete using (public.owns_challenge(challenge_id));
create policy "supporters read their own encouragements" on public.encouragements
  for select using (public.is_my_supporter_row(supporter_id));
create policy "supporters add encouragements" on public.encouragements
  for insert with check (public.is_my_supporter_row(supporter_id) and public.supports_goal(goal_id));
create policy "supporters remove their own encouragements" on public.encouragements
  for delete using (public.is_my_supporter_row(supporter_id));

comment on table public.plan_items is 'Owner-managed. Accepted supporters of the goal may read (not write) it.';
comment on table public.supporters is 'People an owner invites. user_id and acceptance are set only by accept_invite().';
