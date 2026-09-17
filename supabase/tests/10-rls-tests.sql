-- Every check either raises (and stops the run) or prints "ok". See run.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create function public.t_expect_error(statement text, fragment text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm not ilike '%' || fragment || '%' then raise exception 'wrong error for %: %', statement, sqlerrm; end if;
    return;
  end;
  raise exception 'expected an error from: %', statement;
end $$;
create function public.t_eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '% : got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function public.t_as(uid text, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail)::text, false);
$$;
set client_min_messages = notice;

-- Fixtures, as the database owner.
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'owner@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'sup@x.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@x.com');
insert into profiles values
  ('11111111-1111-1111-1111-111111111111', 'Olive Owner', 'owner@x.com', now()),
  ('22222222-2222-2222-2222-222222222222', 'Sam Supporter', 'sup@x.com', now());
insert into six_month_challenges (id, user_id, start_date, end_date) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-09-01', '2027-03-01'),
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '2026-09-01', '2027-03-01');
insert into goals (id, challenge_id, user_id, title, success_definition, start_date, deadline, accent_color, sort_order) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Shared goal', 'done', '2026-09-01', '2026-12-01', 'tomato', 0),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Private goal', 'done', '2026-09-01', '2026-12-01', 'cobalt', 1),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Sam own goal', 'done', '2026-09-01', '2026-12-01', 'tomato', 0);
insert into plan_items (id, goal_id, title, type, sort_order) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'shared step', 'task', 0),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'private step', 'task', 0);
insert into pocket_items (goal_id, user_id, type, title, content) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'note', 'secret', 'never shared');
insert into milestones (id, goal_id, user_id, title, achieved_at) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'shared win', '2026-09-10'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'private win', '2026-09-10');

set role authenticated;

-- Owner invites Sam to the shared goal only.
select t_as('11111111-1111-1111-1111-111111111111', 'owner@x.com');
insert into supporters (id, challenge_id, name, email, user_id, invite_status) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Sam', 'Sup@X.com',
   '33333333-3333-3333-3333-333333333333', 'accepted');
select t_eq('insert ignores user_id and status', (select count(*) from supporters where user_id is null and invite_status = 'pending'), 1);
insert into supporter_goals values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
select t_expect_error($$insert into supporter_goals values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003')$$, 'same six months');
select t_expect_error($$update supporters set invite_status = 'accepted'$$, 'Only the invited person');
select t_expect_error($$update supporters set user_id = '11111111-1111-1111-1111-111111111111'$$, 'Only the invited person');
select t_expect_error($$update supporters set invite_token = gen_random_uuid()$$, 'Only the invited person');
select t_expect_error($$insert into supporters (challenge_id, name, email) values ('c0000000-0000-0000-0000-000000000001', 'Dup', 'sup@x.com')$$, 'one_invite_per_email');
select t_expect_error($$insert into supporters (challenge_id, name, email) values ('c0000000-0000-0000-0000-000000000002', 'Nope', 'n@x.com')$$, 'row-level security');
insert into supporters (id, challenge_id, name, email) values ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'Me', 'owner@x.com');
select t_expect_error($$select accept_invite((select invite_token from supporters where id = 'e0000000-0000-0000-0000-000000000009'))$$, 'own book');
delete from supporters where id = 'e0000000-0000-0000-0000-000000000009';
update supporters set name = 'Sam S.' where id = 'e0000000-0000-0000-0000-000000000001';
select invite_token as token from supporters where id = 'e0000000-0000-0000-0000-000000000001' \gset

-- Anyone with the link sees names and a masked email, nothing else.
reset role; set role anon; select set_config('request.jwt.claims', '', false);
select t_eq('anon invite details', (select count(*) from invite_details(:'token') where owner_name = 'Olive Owner' and email_hint = 'S•••@X.com' and goal_count = 1), 1);
select t_eq('anon sees no goals', (select count(*) from goals), 0);
select t_expect_error(format('select accept_invite(%L)', :'token'), 'permission denied');
reset role; set role authenticated;

-- A stranger can't use the link.
select t_as('33333333-3333-3333-3333-333333333333', 'stranger@x.com');
select t_expect_error(format('select accept_invite(%L)', :'token'), 'different email');
select t_eq('stranger sees no supporters', (select count(*) from supporters), 0);

-- Sam, before accepting, sees nothing of Olive's.
select t_as('22222222-2222-2222-2222-222222222222', 'sup@x.com');
select t_eq('sam pre-accept goals', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 0);
select t_expect_error(format('select accept_invite(%L)', gen_random_uuid()), 'doesn''t exist');
select t_eq('accept returns supporter id', (select count(*) from accept_invite(:'token') x where x = 'e0000000-0000-0000-0000-000000000001'), 1);
select t_eq('accept is repeatable', (select count(*) from accept_invite(:'token')), 1);
select t_eq('sam sees shared goal only', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 1);
select t_eq('sam sees shared goal title', (select count(*) from goals where title = 'Shared goal'), 1);
select t_eq('sam sees challenge', (select count(*) from six_month_challenges where id = 'c0000000-0000-0000-0000-000000000001'), 1);
select t_eq('sam sees shared plan only', (select count(*) from plan_items where goal_id <> 'a0000000-0000-0000-0000-000000000003'), 1);
select t_eq('sam sees shared milestone only', (select count(*) from milestones), 1);
select t_eq('sam sees no pocket', (select count(*) from pocket_items), 0);
select t_eq('sam cannot read owner profile', (select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111'), 0);
select t_eq('sam sees own supporter row', (select count(*) from supporters), 1);
select t_eq('sam sees goal list', (select count(*) from supporter_goals), 1);
select t_eq('my_supported_books', (select count(*) from my_supported_books() where owner_name = 'Olive Owner' and goal_count = 1), 1);
with u as (update goals set title = 'hacked' where id = 'a0000000-0000-0000-0000-000000000001' returning 1) select t_eq('sam cannot edit goal', (select count(*) from u), 0);
with u as (update plan_items set completed = true where id = 'b0000000-0000-0000-0000-000000000001' returning 1) select t_eq('sam cannot tick step', (select count(*) from u), 0);
with u as (update supporters set invite_status = 'declined' returning 1) select t_eq('sam cannot update row directly', (select count(*) from u), 0);
select t_expect_error($$insert into supporter_goals values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')$$, 'row-level security');

-- Encouragement.
insert into encouragements (supporter_id, goal_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cheer');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cheer')$$, 'one_cheer_per_target');
insert into encouragements (supporter_id, goal_id, plan_item_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cheer');
insert into encouragements (supporter_id, goal_id, milestone_id, kind, message) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'comment', 'Nice one!');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind, message) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'comment', 'hi')$$, 'row-level security');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, plan_item_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'cheer')$$, 'isn''t on this goal');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, milestone_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'cheer')$$, 'isn''t on this goal');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind, message) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'comment', '   ')$$, 'encouragement_payload');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind, message) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cheer', 'text')$$, 'encouragement_payload');
select t_eq('sam reads own encouragements', (select count(*) from encouragements), 3);
with d as (delete from encouragements where plan_item_id is not null returning 1) select t_eq('sam removes own cheer', (select count(*) from d), 1);

-- The stranger can't write as Sam.
select t_as('33333333-3333-3333-3333-333333333333', 'stranger@x.com');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cheer')$$, 'row-level security');
select t_eq('stranger reads no encouragements', (select count(*) from encouragements), 0);

-- Owner reads encouragement, withdraws and restores access.
select t_as('11111111-1111-1111-1111-111111111111', 'owner@x.com');
select t_eq('owner reads encouragements', (select count(*) from encouragements), 2);
select t_expect_error($$update supporters set email = 'new@x.com'$$, 'can''t change');
update supporters set invite_status = 'revoked';
select t_as('22222222-2222-2222-2222-222222222222', 'sup@x.com');
select t_eq('revoked sam sees no goals', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 0);
select t_eq('revoked sam sees no plans', (select count(*) from plan_items where goal_id <> 'a0000000-0000-0000-0000-000000000003'), 0);
select t_eq('revoked sam: no books', (select count(*) from my_supported_books()), 0);
select t_expect_error(format('select accept_invite(%L)', :'token'), 'withdrawn');
select t_expect_error($$insert into encouragements (supporter_id, goal_id, kind, message) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'comment', 'still here?')$$, 'row-level security');
select t_as('11111111-1111-1111-1111-111111111111', 'owner@x.com');
update supporters set invite_status = 'accepted';

-- Sam leaves; Olive can't pull them back, but Sam can rejoin with the link.
select t_as('22222222-2222-2222-2222-222222222222', 'sup@x.com');
select leave_book('e0000000-0000-0000-0000-000000000001');
select t_eq('left sam sees no goals', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 0);
select t_as('11111111-1111-1111-1111-111111111111', 'owner@x.com');
select t_expect_error($$update supporters set invite_status = 'revoked'$$, 'left the book');
select t_expect_error($$update supporters set invite_status = 'accepted'$$, 'left the book');
select t_as('22222222-2222-2222-2222-222222222222', 'sup@x.com');
select accept_invite(:'token');
select t_eq('sam rejoined', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 1);

-- Pending invites: owner can revoke and restore to pending, and remove.
select t_as('11111111-1111-1111-1111-111111111111', 'owner@x.com');
insert into supporters (id, challenge_id, name, email) values ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Pat', 'pat@x.com');
update supporters set invite_status = 'revoked' where id = 'e0000000-0000-0000-0000-000000000002';
update supporters set invite_status = 'pending' where id = 'e0000000-0000-0000-0000-000000000002';
select t_expect_error($$update supporters set invite_status = 'pending' where id = 'e0000000-0000-0000-0000-000000000001'$$, 'already accepted');
update supporters set email = 'pat2@x.com' where id = 'e0000000-0000-0000-0000-000000000002';
delete from supporters where id = 'e0000000-0000-0000-0000-000000000001';
select t_eq('removing a supporter clears their encouragement', (select count(*) from encouragements), 0);
select t_as('22222222-2222-2222-2222-222222222222', 'sup@x.com');
select t_eq('removed sam sees nothing', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000001'), 0);
select t_eq('sam still sees own goal', (select count(*) from goals where challenge_id = 'c0000000-0000-0000-0000-000000000002'), 1);

reset role;
\echo ALL TESTS PASSED
