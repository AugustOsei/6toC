"use client";

import { hasSupabaseConfig } from "@/lib/config";
import type { BookData, Goal, GoalAccent, Milestone, OnboardingDraft, PlanItem, PocketItem } from "@/lib/types";
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

export async function sendMagicLink(email: string): Promise<void> {
  const supabase = createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback`;
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

export async function addPlanItem(goalId: string, title: string, dueDate?: string): Promise<void> {
  if (!hasSupabaseConfig) { const book = readPreview(); if (!book) return; book.planItems.push({ id: id(), goalId, title, description: "", type: "task", dueDate, completed: false, sortOrder: book.planItems.filter((x) => x.goalId === goalId).length }); writePreview(book); return; }
  const supabase = createClient(); const { error } = await supabase.from("plan_items").insert({ goal_id: goalId, title, type: "task", due_date: dueDate || null }); if (error) throw error;
}

export async function updatePlanItem(itemId: string, patch: { title?: string; completed?: boolean }): Promise<void> {
  const completedAt = patch.completed === undefined ? undefined : patch.completed ? now() : null;
  if (!hasSupabaseConfig) { const book = readPreview(); if (!book) return; book.planItems = book.planItems.map((x) => x.id === itemId ? { ...x, ...patch, completedAt: completedAt ?? undefined } : x); writePreview(book); return; }
  const supabase = createClient(); const values = { ...patch, ...(completedAt !== undefined ? { completed_at: completedAt } : {}) }; const { error } = await supabase.from("plan_items").update(values).eq("id", itemId); if (error) throw error;
}

export async function addPocketItem(goalId: string, type: "note" | "url", title: string, value: string): Promise<void> {
  if (!hasSupabaseConfig) { const book = readPreview(); if (!book) return; book.pocketItems.unshift({ id: id(), goalId, userId: book.profile.id, type, title, ...(type === "note" ? { content: value } : { url: value }), createdAt: now() }); writePreview(book); return; }
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Please sign in again."); const { error } = await supabase.from("pocket_items").insert({ goal_id: goalId, user_id: user.id, type, title, content: type === "note" ? value : null, url: type === "url" ? value : null }); if (error) throw error;
}

export async function addMilestone(goalId: string, title: string, description: string): Promise<void> {
  if (!hasSupabaseConfig) { const book = readPreview(); if (!book) return; book.milestones.unshift({ id: id(), goalId, userId: book.profile.id, title, description, achievedAt: now().slice(0, 10), shareable: false, createdAt: now() }); writePreview(book); return; }
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Please sign in again."); const { error } = await supabase.from("milestones").insert({ goal_id: goalId, user_id: user.id, title, description }); if (error) throw error;
}

export async function completeGoal(goalId: string): Promise<void> {
  if (!hasSupabaseConfig) { const book = readPreview(); if (!book) return; book.goals = book.goals.map((g) => g.id === goalId ? { ...g, status: "completed", completedAt: now().slice(0, 10) } : g); writePreview(book); return; }
  const supabase = createClient(); const { error } = await supabase.from("goals").update({ status: "completed", completed_at: now().slice(0, 10) }).eq("id", goalId); if (error) throw error;
}
