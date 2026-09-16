export type GoalAccent = "tomato" | "cobalt" | "leaf";
export type GoalStatus = "active" | "completed" | "paused";
export type PlanItemType = "month" | "week" | "day" | "task";
export type PocketItemType = "note" | "url";

export interface Profile {
  id: string;
  name: string;
  email: string;
}

export interface Challenge {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: "active" | "completed" | "archived";
  createdAt: string;
}

export interface Goal {
  id: string;
  challengeId: string;
  userId: string;
  title: string;
  description: string;
  successDefinition: string;
  startDate: string;
  deadline: string;
  status: GoalStatus;
  accentColor: GoalAccent;
  sortOrder: number;
  completedAt?: string;
  createdAt: string;
}

export interface PlanItem {
  id: string;
  goalId: string;
  title: string;
  description: string;
  type: PlanItemType;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  sortOrder: number;
}

export interface PocketItem {
  id: string;
  goalId: string;
  userId: string;
  type: PocketItemType;
  title: string;
  content?: string;
  url?: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  userId: string;
  title: string;
  description: string;
  achievedAt: string;
  shareable: boolean;
  createdAt: string;
}

export interface BookData {
  profile: Profile;
  challenge: Challenge;
  goals: Goal[];
  planItems: PlanItem[];
  pocketItems: PocketItem[];
  milestones: Milestone[];
}

export interface GoalDraft {
  title: string;
  successDefinition: string;
  deadline: string;
}

export interface OnboardingDraft {
  name: string;
  email: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
}
