create extension if not exists pgcrypto;

create type public.challenge_status as enum ('active', 'completed', 'archived');
create type public.goal_status as enum ('active', 'completed', 'paused');
create type public.goal_accent as enum ('tomato', 'cobalt', 'leaf');
create type public.plan_item_type as enum ('month', 'week', 'day', 'task');
create type public.pocket_item_type as enum ('note', 'url');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null,
  created_at timestamptz not null default now()
);

create table public.six_month_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'My six months',
  start_date date not null,
  end_date date not null,
  status public.challenge_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint challenge_is_six_calendar_months check (end_date = (start_date + interval '6 months')::date)
);
create unique index one_active_challenge_per_user on public.six_month_challenges(user_id) where status = 'active';

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.six_month_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '',
  success_definition text not null check (char_length(trim(success_definition)) > 0),
  start_date date not null,
  deadline date not null,
  status public.goal_status not null default 'active',
  accent_color public.goal_accent not null,
  sort_order smallint not null check (sort_order between 0 and 2),
  completed_at date,
  created_at timestamptz not null default now(),
  unique(challenge_id, sort_order),
  constraint goal_dates_in_order check (deadline >= start_date),
  constraint completion_has_date check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  type public.plan_item_type not null default 'task',
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint plan_completion_consistent check ((completed and completed_at is not null) or (not completed and completed_at is null))
);

create table public.pocket_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.pocket_item_type not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  content text,
  url text,
  created_at timestamptz not null default now(),
  constraint pocket_payload_matches_type check (
    (type = 'note' and content is not null and url is null) or
    (type = 'url' and url is not null and content is null)
  )
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  achieved_at date not null default current_date,
  shareable boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.supporters (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.six_month_challenges(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  name text not null,
  email text not null,
  invite_status public.invite_status not null default 'pending',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.encouragements (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporters(id) on delete cascade,
  challenge_id uuid not null references public.six_month_challenges(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  reminder_frequency text not null default 'weekly' check (reminder_frequency in ('off', 'weekly', 'twice_weekly')),
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table public.vision_images (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.six_month_challenges(id) on delete cascade,
  image_url text not null,
  prompt text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.validate_goal_scope() returns trigger language plpgsql security definer set search_path = public as $$
declare parent public.six_month_challenges;
begin
  select * into parent from public.six_month_challenges where id = new.challenge_id;
  if parent.id is null then raise exception 'Challenge not found'; end if;
  if new.user_id <> parent.user_id then raise exception 'Goal owner must match challenge owner'; end if;
  if new.start_date < parent.start_date or new.deadline > parent.end_date then raise exception 'Goal dates must remain inside the six-month challenge'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.goals where challenge_id = new.challenge_id) >= 3 then raise exception 'A 6TOC challenge can have at most three goals'; end if;
  return new;
end;
$$;
create trigger validate_goal_before_write before insert or update on public.goals for each row execute function public.validate_goal_scope();

create or replace function public.owns_goal(candidate uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.goals where id = candidate and user_id = auth.uid());
$$;
create or replace function public.owns_challenge(candidate uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.six_month_challenges where id = candidate and user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.six_month_challenges enable row level security;
alter table public.goals enable row level security;
alter table public.plan_items enable row level security;
alter table public.pocket_items enable row level security;
alter table public.milestones enable row level security;
alter table public.supporters enable row level security;
alter table public.encouragements enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.vision_images enable row level security;

create policy "profiles are private" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "owners manage challenges" on public.six_month_challenges for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage goals" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_challenge(challenge_id));
create policy "owners manage plan items" on public.plan_items for all using (public.owns_goal(goal_id)) with check (public.owns_goal(goal_id));
create policy "owners manage private pocket items" on public.pocket_items for all using (user_id = auth.uid() and public.owns_goal(goal_id)) with check (user_id = auth.uid() and public.owns_goal(goal_id));
create policy "owners manage milestones" on public.milestones for all using (user_id = auth.uid() and public.owns_goal(goal_id)) with check (user_id = auth.uid() and public.owns_goal(goal_id));
create policy "owners manage supporters" on public.supporters for all using (public.owns_challenge(challenge_id)) with check (public.owns_challenge(challenge_id));
create policy "owners read encouragements" on public.encouragements for select using (public.owns_challenge(challenge_id));
create policy "owners manage preferences" on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage vision images" on public.vision_images for all using (public.owns_challenge(challenge_id)) with check (public.owns_challenge(challenge_id));

create index goals_challenge_order_idx on public.goals(challenge_id, sort_order);
create index plan_items_goal_order_idx on public.plan_items(goal_id, sort_order);
create index pocket_items_goal_created_idx on public.pocket_items(goal_id, created_at desc);
create index milestones_goal_achieved_idx on public.milestones(goal_id, achieved_at desc);

comment on table public.pocket_items is 'Strictly private owner content. Supporter policies must never be added here.';
comment on table public.plan_items is 'Strictly private owner content. Supporters have no access.';
