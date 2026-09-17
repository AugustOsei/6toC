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

export type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

export interface Supporter {
  id: string;
  challengeId: string;
  name: string;
  email: string;
  status: InviteStatus;
  inviteToken: string;
  goalIds: string[];
  acceptedAt?: string;
  createdAt: string;
}

export type EncouragementKind = "cheer" | "comment";

/** A cheer or comment on a goal, or on one of its plan steps or milestones. */
export interface Encouragement {
  id: string;
  supporterId: string;
  goalId: string;
  planItemId?: string;
  milestoneId?: string;
  kind: EncouragementKind;
  message?: string;
  createdAt: string;
}

export interface EncouragementTarget {
  goalId: string;
  planItemId?: string;
  milestoneId?: string;
}

export interface BookData {
  profile: Profile;
  challenge: Challenge;
  goals: Goal[];
  planItems: PlanItem[];
  pocketItems: PocketItem[];
  milestones: Milestone[];
  /** Always empty in preview mode: supporters need real accounts. */
  supporters: Supporter[];
  encouragements: Encouragement[];
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

/** What a supporter can open: someone else's book, limited to the goals they were given. */
export interface SupportedBook {
  supporterId: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  goals: Goal[];
  planItems: PlanItem[];
  milestones: Milestone[];
  /** Only this supporter's own cheers and comments. */
  encouragements: Encouragement[];
}

export interface SupportedBookSummary {
  supporterId: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  goalCount: number;
}

export interface InviteDetails {
  supporterName: string;
  ownerName: string;
  emailHint: string;
  status: InviteStatus;
  goalCount: number;
}
