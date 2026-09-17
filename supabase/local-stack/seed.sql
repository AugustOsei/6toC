-- A small world: Olive owns a book, Sam is invited, Tess is a stranger.
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated to authenticator;
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'olive@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'tess@example.com');
insert into profiles values ('11111111-1111-1111-1111-111111111111', 'Olive', 'olive@example.com', now());
insert into six_month_challenges (id, user_id, start_date, end_date) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-08-01', '2027-02-01');
insert into goals (id, challenge_id, user_id, title, success_definition, start_date, deadline, accent_color, sort_order) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Run a half marathon', 'Cross the finish line of the Denver half in under 2:15.', '2026-08-01', '2026-10-18', 'tomato', 0),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pass the AWS exam', 'Solutions Architect Associate certificate in hand.', '2026-08-01', '2026-12-15', 'cobalt', 1),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Save £2,000', 'Emergency fund topped up.', '2026-08-01', '2027-01-31', 'leaf', 2);
insert into plan_items (id, goal_id, title, type, sort_order, completed, due_date, completed_at) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Buy proper running shoes', 'task', 0, true, null, now()),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Run 10k without stopping', 'task', 1, true, '2026-09-10', now()),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Long run: 16k', 'task', 2, false, '2026-09-27', null),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Finish the practice course', 'task', 0, false, null, null);
insert into pocket_items (goal_id, user_id, type, title, content) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'note', 'Private worry', 'My knee hurts after 12k.');
insert into milestones (id, goal_id, user_id, title, description, achieved_at) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'First 10k!', 'Slow, but no walking.', '2026-09-09');
