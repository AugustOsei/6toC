"use client";

import { hasSupabaseConfig } from "@/lib/config";
import type { BookData, Challenge, Encouragement, EncouragementTarget, Goal, GoalAccent, GoalDraft, InviteDetails, InviteStatus, Milestone, OnboardingDraft, PlanItem, PocketItem, PocketItemType, Supporter, SupportedBook, SupportedBookSummary } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const BOOK_KEY = "6toc-preview-book";
export const DRAFT_KEY = "6toc-onboarding-draft";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function readPreview(): BookData | null {
  const raw = localStorage.getItem(BOOK_KEY);
  if (!raw) return null;
  // Books saved before supporters existed have no supporter lists.
  try {
    const book = JSON.parse(raw) as Partial<BookData>;
    return { ...book, supporters: book.supporters ?? [], encouragements: book.encouragements ?? [] } as BookData;
  } catch { return null; }
}

function writePreview(book: BookData): BookData {
  localStorage.setItem(BOOK_KEY, JSON.stringify(book));
  window.dispatchEvent(new Event("6toc:change"));
  return book;
}

/** `next` is where the callback sends the reader once the link has signed them in. */
export async function sendMagicLink(email: string, next = "/onboarding?resume=1"): Promise<void> {
  const supabase = createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function saveOnboarding(draft: OnboardingDraft): Promise<BookData | null> {
  if (!hasSupabaseConfig) {
    const userId = id();
    const challengeId = id();
    const book: BookData = {
      profile: { id: userId, name: draft.name, email: draft.email },
      challenge: {
        id: challengeId, userId, title: "My six months", startDate: draft.startDate,
        endDate: draft.endDate, status: "active", createdAt: now(),
      },
      goals: draft.goals.map((goal, index) => ({
        id: id(), challengeId, userId, title: goal.title, description: "",
        successDefinition: goal.successDefinition, startDate: draft.startDate,
        deadline: goal.deadline, status: "active", accentColor: (["tomato", "cobalt", "leaf"] as GoalAccent[])[index],
        sortOrder: index, createdAt: now(),
      })),
      planItems: [], pocketItems: [], milestones: [], supporters: [], encouragements: [],
    };
    return writePreview(book);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, name: draft.name, email: draft.email });
  if (profileError) throw profileError;
  const { data: existing } = await supabase.from("six_month_challenges").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!existing) {
    const { data: challenge, error: challengeError } = await supabase.from("six_month_challenges").insert({
      user_id: user.id, title: "My six months", start_date: draft.startDate, end_date: draft.endDate, status: "active",
    }).select("id").single();
    if (challengeError) throw challengeError;
    const { error: goalsError } = await supabase.from("goals").insert(draft.goals.map((goal, index) => ({
      challenge_id: challenge.id, user_id: user.id, title: goal.title,
      success_definition: goal.successDefinition, start_date: draft.startDate, deadline: goal.deadline,
      accent_color: (["tomato", "cobalt", "leaf"] as GoalAccent[])[index], sort_order: index,
    })));
    if (goalsError) throw goalsError;
  }
  localStorage.removeItem(DRAFT_KEY);
  return loadBook();
}

export async function loadBook(): Promise<BookData | null> {
  if (!hasSupabaseConfig) return readPreview();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: challenge }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("six_month_challenges").select("*").eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  if (!profile || !challenge) return null;
  const { data: goals = [] } = await supabase.from("goals").select("*").eq("challenge_id", challenge.id).order("sort_order");
  const goalRows = goals ?? [];
  const goalIds = goalRows.map((goal) => goal.id);
  const [plans, pockets, milestones] = goalIds.length ? await Promise.all([
    supabase.from("plan_items").select("*").in("goal_id", goalIds).order("sort_order"),
    supabase.from("pocket_items").select("*").in("goal_id", goalIds).order("created_at", { ascending: false }),
    supabase.from("milestones").select("*").in("goal_id", goalIds).order("achieved_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const [supporters, encouragements] = await Promise.all([
    supabase.from("supporters").select("*, supporter_goals(goal_id)").eq("challenge_id", challenge.id).order("created_at"),
    supabase.from("encouragements").select("*").eq("challenge_id", challenge.id).order("created_at", { ascending: false }),
  ]);
  check(supporters.error); check(encouragements.error);

  return {
    profile: { id: profile.id, name: profile.name, email: profile.email },
    challenge: { id: challenge.id, userId: challenge.user_id, title: challenge.title, startDate: challenge.start_date, endDate: challenge.end_date, status: challenge.status, createdAt: challenge.created_at },
    goals: goalRows.map(toGoal),
    planItems: (plans.data ?? []).map(toPlanItem),
    pocketItems: (pockets.data ?? []).map((p): PocketItem => ({ id: p.id, goalId: p.goal_id, userId: p.user_id, type: p.type, title: p.title, content: p.content ?? undefined, url: p.url ?? undefined, createdAt: p.created_at })),
    milestones: (milestones.data ?? []).map(toMilestone),
    supporters: (supporters.data ?? []).map(toSupporter),
    encouragements: (encouragements.data ?? []).map(toEncouragement),
  };
}

/* Rows from Supabase, in the shapes the UI uses. */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toGoal = (g: Row): Goal => ({ id: g.id, challengeId: g.challenge_id, userId: g.user_id, title: g.title, description: g.description ?? "", successDefinition: g.success_definition, startDate: g.start_date, deadline: g.deadline, status: g.status, accentColor: g.accent_color, sortOrder: g.sort_order, completedAt: g.completed_at ?? undefined, createdAt: g.created_at });
const toPlanItem = (p: Row): PlanItem => ({ id: p.id, goalId: p.goal_id, title: p.title, description: p.description ?? "", type: p.type, dueDate: p.due_date ?? undefined, completed: p.completed, completedAt: p.completed_at ?? undefined, sortOrder: p.sort_order });
const toMilestone = (m: Row): Milestone => ({ id: m.id, goalId: m.goal_id, userId: m.user_id, title: m.title, description: m.description ?? "", achievedAt: m.achieved_at, shareable: m.shareable, createdAt: m.created_at });
const toSupporter = (s: Row): Supporter => ({ id: s.id, challengeId: s.challenge_id, name: s.name, email: s.email, status: s.invite_status, inviteToken: s.invite_token, goalIds: (s.supporter_goals ?? []).map((g: Row) => g.goal_id), acceptedAt: s.accepted_at ?? undefined, createdAt: s.created_at });
const toEncouragement = (e: Row): Encouragement => ({ id: e.id, supporterId: e.supporter_id, goalId: e.goal_id, planItemId: e.plan_item_id ?? undefined, milestoneId: e.milestone_id ?? undefined, kind: e.kind, message: e.message ?? undefined, createdAt: e.created_at });


// Every mutation has the same shape: in preview, edit the browser copy of the book;
// otherwise write to Supabase and let row-level security decide what is allowed.
function editPreview(change: (book: BookData) => void): void {
  const book = readPreview();
  if (!book) return;
  change(book);
  writePreview(book);
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  return user.id;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const ACCENTS: GoalAccent[] = ["tomato", "cobalt", "leaf"];

export async function signOut(): Promise<void> {
  if (!hasSupabaseConfig) return;
  check((await createClient().auth.signOut()).error);
}

export async function hasSession(): Promise<boolean> {
  if (!hasSupabaseConfig) return false;
  const { data: { user } } = await createClient().auth.getUser();
  return Boolean(user);
}

/* Goals */

export async function addGoal(challenge: Challenge, existing: Goal[], draft: GoalDraft): Promise<void> {
  const sortOrder = [0, 1, 2].find((slot) => !existing.some((goal) => goal.sortOrder === slot));
  if (sortOrder === undefined) throw new Error("All three spaces are already used.");
  const values = { title: draft.title, successDefinition: draft.successDefinition, deadline: draft.deadline, accentColor: ACCENTS[sortOrder], sortOrder };
  if (!hasSupabaseConfig) {
    return editPreview((book) => {
      book.goals.push({ ...values, id: id(), challengeId: challenge.id, userId: book.profile.id, description: "", startDate: challenge.startDate, status: "active", createdAt: now() });
      book.goals.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }
  const userId = await currentUserId();
  check((await createClient().from("goals").insert({
    challenge_id: challenge.id, user_id: userId, title: values.title, success_definition: values.successDefinition,
    start_date: challenge.startDate, deadline: values.deadline, accent_color: values.accentColor, sort_order: sortOrder,
  })).error);
}

export async function updateGoal(goalId: string, patch: GoalDraft): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.goals = book.goals.map((g) => g.id === goalId ? { ...g, ...patch } : g); });
  check((await createClient().from("goals").update({ title: patch.title, success_definition: patch.successDefinition, deadline: patch.deadline }).eq("id", goalId)).error);
}

export async function completeGoal(goalId: string): Promise<void> {
  const completedAt = now().slice(0, 10);
  if (!hasSupabaseConfig) return editPreview((book) => { book.goals = book.goals.map((g) => g.id === goalId ? { ...g, status: "completed", completedAt } : g); });
  check((await createClient().from("goals").update({ status: "completed", completed_at: completedAt }).eq("id", goalId)).error);
}

export async function reopenGoal(goalId: string): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.goals = book.goals.map((g) => g.id === goalId ? { ...g, status: "active", completedAt: undefined } : g); });
  check((await createClient().from("goals").update({ status: "active", completed_at: null }).eq("id", goalId)).error);
}

/* Plan */

export async function addPlanItem(goalId: string, title: string, dueDate: string | undefined, sortOrder: number): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.planItems.push({ id: id(), goalId, title, description: "", type: "task", dueDate, completed: false, sortOrder }); });
  check((await createClient().from("plan_items").insert({ goal_id: goalId, title, type: "task", due_date: dueDate || null, sort_order: sortOrder })).error);
}

export async function updatePlanItem(itemId: string, patch: { title?: string; completed?: boolean; dueDate?: string | null }): Promise<void> {
  const completedAt = patch.completed === undefined ? undefined : patch.completed ? now() : null;
  if (!hasSupabaseConfig) {
    return editPreview((book) => {
      book.planItems = book.planItems.map((x) => {
        if (x.id !== itemId) return x;
        const next = { ...x };
        if (patch.title !== undefined) next.title = patch.title;
        if (patch.dueDate !== undefined) next.dueDate = patch.dueDate ?? undefined;
        if (patch.completed !== undefined) { next.completed = patch.completed; next.completedAt = completedAt ?? undefined; }
        return next;
      });
    });
  }
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.dueDate !== undefined) values.due_date = patch.dueDate;
  if (patch.completed !== undefined) { values.completed = patch.completed; values.completed_at = completedAt; }
  check((await createClient().from("plan_items").update(values).eq("id", itemId)).error);
}

/** Saves a new order for a goal's plan. Only rows whose position changed are written. */
export async function reorderPlanItems(ordered: PlanItem[]): Promise<void> {
  const changed = ordered.map((item, index) => ({ item, index })).filter(({ item, index }) => item.sortOrder !== index);
  if (!hasSupabaseConfig) {
    return editPreview((book) => {
      const positions = new Map(changed.map(({ item, index }) => [item.id, index]));
      book.planItems = book.planItems.map((x) => positions.has(x.id) ? { ...x, sortOrder: positions.get(x.id)! } : x);
    });
  }
  const supabase = createClient();
  const results = await Promise.all(changed.map(({ item, index }) => supabase.from("plan_items").update({ sort_order: index }).eq("id", item.id)));
  results.forEach((result) => check(result.error));
}

export async function deletePlanItem(itemId: string): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.planItems = book.planItems.filter((x) => x.id !== itemId); });
  check((await createClient().from("plan_items").delete().eq("id", itemId)).error);
}

/* Pocket */

export async function addPocketItem(goalId: string, type: PocketItemType, title: string, value: string): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.pocketItems.unshift({ id: id(), goalId, userId: book.profile.id, type, title, ...(type === "note" ? { content: value } : { url: value }), createdAt: now() }); });
  const userId = await currentUserId();
  check((await createClient().from("pocket_items").insert({ goal_id: goalId, user_id: userId, type, title, content: type === "note" ? value : null, url: type === "url" ? value : null })).error);
}

/** The item keeps its type; `value` is the note text or the URL. */
export async function updatePocketItem(item: PocketItem, title: string, value: string): Promise<void> {
  const payload = item.type === "note" ? { content: value } : { url: value };
  if (!hasSupabaseConfig) return editPreview((book) => { book.pocketItems = book.pocketItems.map((x) => x.id === item.id ? { ...x, title, ...payload } : x); });
  check((await createClient().from("pocket_items").update({ title, ...payload }).eq("id", item.id)).error);
}

export async function deletePocketItem(itemId: string): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.pocketItems = book.pocketItems.filter((x) => x.id !== itemId); });
  check((await createClient().from("pocket_items").delete().eq("id", itemId)).error);
}

/* Milestones */

function byNewest(a: Milestone, b: Milestone): number {
  return b.achievedAt.localeCompare(a.achievedAt) || b.createdAt.localeCompare(a.createdAt);
}

export async function addMilestone(goalId: string, title: string, description: string, achievedAt: string): Promise<void> {
  if (!hasSupabaseConfig) {
    return editPreview((book) => {
      book.milestones.push({ id: id(), goalId, userId: book.profile.id, title, description, achievedAt, shareable: false, createdAt: now() });
      book.milestones.sort(byNewest);
    });
  }
  const userId = await currentUserId();
  check((await createClient().from("milestones").insert({ goal_id: goalId, user_id: userId, title, description, achieved_at: achievedAt })).error);
}

export async function updateMilestone(itemId: string, patch: { title: string; description: string; achievedAt: string }): Promise<void> {
  if (!hasSupabaseConfig) {
    return editPreview((book) => {
      book.milestones = book.milestones.map((x) => x.id === itemId ? { ...x, ...patch } : x);
      book.milestones.sort(byNewest);
    });
  }
  check((await createClient().from("milestones").update({ title: patch.title, description: patch.description, achieved_at: patch.achievedAt }).eq("id", itemId)).error);
}

export async function deleteMilestone(itemId: string): Promise<void> {
  if (!hasSupabaseConfig) return editPreview((book) => { book.milestones = book.milestones.filter((x) => x.id !== itemId); });
  check((await createClient().from("milestones").delete().eq("id", itemId)).error);
}

/* Supporters. They need real accounts, so none of this runs in preview mode. */

const NEEDS_ACCOUNTS = "Supporters need real accounts, so they aren’t part of the local preview.";

function requireAccounts(): void {
  if (!hasSupabaseConfig) throw new Error(NEEDS_ACCOUNTS);
}

export function inviteLink(token: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/invite/${token}`;
}

/** Creates a pending invite for the chosen goals and returns its token for the link. */
export async function inviteSupporter(challengeId: string, name: string, email: string, goalIds: string[]): Promise<string> {
  requireAccounts();
  const supabase = createClient();
  const { data, error } = await supabase.from("supporters").insert({ challenge_id: challengeId, name, email }).select("id, invite_token").single();
  if (error) throw new Error(error.code === "23505" ? "You’ve already invited that email." : error.message);
  const { error: goalsError } = await supabase.from("supporter_goals").insert(goalIds.map((goalId) => ({ supporter_id: data.id, goal_id: goalId })));
  if (goalsError) {
    await supabase.from("supporters").delete().eq("id", data.id);
    throw new Error(goalsError.message);
  }
  return data.invite_token;
}

export async function updateSupporter(supporter: Supporter, patch: { name: string; goalIds: string[] }): Promise<void> {
  requireAccounts();
  const supabase = createClient();
  const added = patch.goalIds.filter((goalId) => !supporter.goalIds.includes(goalId));
  const removed = supporter.goalIds.filter((goalId) => !patch.goalIds.includes(goalId));
  if (patch.name !== supporter.name) check((await supabase.from("supporters").update({ name: patch.name }).eq("id", supporter.id)).error);
  if (added.length) check((await supabase.from("supporter_goals").insert(added.map((goalId) => ({ supporter_id: supporter.id, goal_id: goalId })))).error);
  if (removed.length) check((await supabase.from("supporter_goals").delete().eq("supporter_id", supporter.id).in("goal_id", removed)).error);
}

/** Withdraw ("revoked") or restore access. Restoring goes back to wherever the invite had got to. */
export async function setSupporterAccess(supporter: Supporter, open: boolean): Promise<void> {
  requireAccounts();
  const status: InviteStatus = !open ? "revoked" : supporter.acceptedAt ? "accepted" : "pending";
  check((await createClient().from("supporters").update({ invite_status: status }).eq("id", supporter.id)).error);
}

/** Removing someone also removes everything they wrote in the book. */
export async function removeSupporter(supporterId: string): Promise<void> {
  requireAccounts();
  check((await createClient().from("supporters").delete().eq("id", supporterId)).error);
}

/** Owners can tear out any cheer or comment; supporters can take back their own. */
export async function removeEncouragement(encouragementId: string): Promise<void> {
  requireAccounts();
  check((await createClient().from("encouragements").delete().eq("id", encouragementId)).error);
}

export async function getInvite(token: string): Promise<InviteDetails | null> {
  requireAccounts();
  // A malformed token would make Postgres complain about the uuid; it's just a bad link.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;
  const { data, error } = await createClient().rpc("invite_details", { token });
  check(error);
  const row = (data as Row[] | null)?.[0];
  return row ? { supporterName: row.supporter_name, ownerName: row.owner_name, emailHint: row.email_hint, status: row.status, goalCount: row.goal_count } : null;
}

/** Returns the supporter id to open. The database checks the signed-in email matches. */
export async function acceptInvite(token: string): Promise<string> {
  requireAccounts();
  const { data, error } = await createClient().rpc("accept_invite", { token });
  check(error);
  return data as string;
}

export async function leaveBook(supporterId: string): Promise<void> {
  requireAccounts();
  check((await createClient().rpc("leave_book", { supporter: supporterId })).error);
}

export async function listSupportedBooks(): Promise<SupportedBookSummary[]> {
  if (!hasSupabaseConfig) return [];
  const { data, error } = await createClient().rpc("my_supported_books");
  check(error);
  return ((data as Row[] | null) ?? []).map((b) => ({ supporterId: b.supporter_id, ownerName: b.owner_name, startDate: b.start_date, endDate: b.end_date, goalCount: b.goal_count }));
}

/** Someone else's book, as far as they've opened it to this supporter. Null once access ends. */
export async function loadSupportedBook(supporterId: string): Promise<SupportedBook | null> {
  requireAccounts();
  const supabase = createClient();
  const summary = (await listSupportedBooks()).find((book) => book.supporterId === supporterId);
  if (!summary) return null;
  const { data: links, error } = await supabase.from("supporter_goals").select("goal_id").eq("supporter_id", supporterId);
  check(error);
  const goalIds = (links ?? []).map((link) => link.goal_id as string);
  if (!goalIds.length) return { ...summary, goals: [], planItems: [], milestones: [], encouragements: [] };
  const [goals, plans, milestones, encouragements] = await Promise.all([
    supabase.from("goals").select("*").in("id", goalIds).order("sort_order"),
    supabase.from("plan_items").select("*").in("goal_id", goalIds).order("sort_order"),
    supabase.from("milestones").select("*").in("goal_id", goalIds).order("achieved_at", { ascending: false }),
    supabase.from("encouragements").select("*").eq("supporter_id", supporterId).order("created_at", { ascending: false }),
  ]);
  [goals, plans, milestones, encouragements].forEach((result) => check(result.error));
  return {
    supporterId, ownerName: summary.ownerName, startDate: summary.startDate, endDate: summary.endDate,
    goals: (goals.data ?? []).map(toGoal),
    planItems: (plans.data ?? []).map(toPlanItem),
    milestones: (milestones.data ?? []).map(toMilestone),
    encouragements: (encouragements.data ?? []).map(toEncouragement),
  };
}

export async function cheer(supporterId: string, target: EncouragementTarget): Promise<void> {
  requireAccounts();
  const { error } = await createClient().from("encouragements").insert({ supporter_id: supporterId, kind: "cheer", ...targetColumns(target) });
  // A double tap races the first insert; one cheer is all that was meant.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function comment(supporterId: string, target: EncouragementTarget, message: string): Promise<void> {
  requireAccounts();
  check((await createClient().from("encouragements").insert({ supporter_id: supporterId, kind: "comment", message, ...targetColumns(target) })).error);
}

function targetColumns(target: EncouragementTarget) {
  return { goal_id: target.goalId, plan_item_id: target.planItemId ?? null, milestone_id: target.milestoneId ?? null };
}
