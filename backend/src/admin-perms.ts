// What each admin may do. A role gives a default set; an owner can hand-pick a different set for
// anyone (stored in admin_users.permissions). Owners always have everything.
import { ApiError } from "./errors.js";

export const PERMISSIONS = {
  queue: "Review held stories and chitchats",
  reports: "Settle reports",
  terms: "Edit Goofy's word lists",
  members: "Look up members",
  ban: "Suspend and ban members and IPs",
  private: "See members' email and sign-in details",
  feedback: "Answer feedback and bugs",
  companies: "List and hide companies",
  donations: "See donations",
  audit: "Read the audit log",
  team: "Add admins and change their access",
  platform: "Change platform settings",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export type Role = "owner" | "admin" | "moderator" | "viewer";
export const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ["queue", "reports", "terms", "members", "ban", "feedback", "companies", "donations", "audit", "platform"],
  moderator: ["queue", "reports", "terms", "members", "feedback"],
  viewer: ["audit", "donations"],
};

export const effective = (a: { role: Role; permissions?: string[] | null }): Permission[] =>
  a.role === "owner" ? ALL : a.permissions ? (a.permissions.filter((p) => p in PERMISSIONS) as Permission[]) : ROLE_DEFAULTS[a.role];

export function need(a: { role: Role; permissions?: string[] | null }, p: Permission) {
  if (!effective(a).includes(p)) throw new ApiError(403, "no_permission", `You don't have access to that (${PERMISSIONS[p].toLowerCase()}). Ask an owner.`);
}
