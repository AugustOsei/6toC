"use client";

import { hasSupabaseConfig } from "@/lib/config";
import type { BookData, Challenge, Goal, GoalAccent, GoalDraft, Milestone, OnboardingDraft, PlanItem, PocketItem, PocketItemType } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const BOOK_KEY = "6toc-preview-book";
export const DRAFT_KEY = "6toc-onboarding-draft";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function readPreview(): BookData | null {
  const raw = localStorage.getItem(BOOK_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as BookData; } catch { return null; }
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
      planItems: [], pocketItems: [], milestones: [],
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

  return {
    profile: { id: profile.id, name: profile.name, email: profile.email },
    challenge: { id: challenge.id, userId: challenge.user_id, title: challenge.title, startDate: challenge.start_date, endDate: challenge.end_date, status: challenge.status, createdAt: challenge.created_at },
    goals: goalRows.map((g): Goal => ({ id: g.id, challengeId: g.challenge_id, userId: g.user_id, title: g.title, description: g.description ?? "", successDefinition: g.success_definition, startDate: g.start_date, deadline: g.deadline, status: g.status, accentColor: g.accent_color, sortOrder: g.sort_order, completedAt: g.completed_at ?? undefined, createdAt: g.created_at })),
    planItems: (plans.data ?? []).map((p): PlanItem => ({ id: p.id, goalId: p.goal_id, title: p.title, description: p.description ?? "", type: p.type, dueDate: p.due_date ?? undefined, completed: p.completed, completedAt: p.completed_at ?? undefined, sortOrder: p.sort_order })),
    pocketItems: (pockets.data ?? []).map((p): PocketItem => ({ id: p.id, goalId: p.goal_id, userId: p.user_id, type: p.type, title: p.title, content: p.content ?? undefined, url: p.url ?? undefined, createdAt: p.created_at })),
    milestones: (milestones.data ?? []).map((m): Milestone => ({ id: m.id, goalId: m.goal_id, userId: m.user_id, title: m.title, description: m.description ?? "", achievedAt: m.achieved_at, shareable: m.shareable, createdAt: m.created_at })),
  };
}


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
