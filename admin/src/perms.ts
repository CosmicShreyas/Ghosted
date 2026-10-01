// Mirrors backend/src/admin-perms.ts. The server enforces these; the panel only uses them to hide
// what you can't open.
export type Permission = "queue" | "reports" | "terms" | "members" | "ban" | "private" | "feedback" | "companies" | "donations" | "audit" | "team" | "platform";
export const can = (me: { permissions: Permission[] }, p: Permission) => me.permissions.includes(p);
export const ROLE_LABEL = { owner: "Owner", admin: "Admin", moderator: "Moderator", viewer: "Viewer" } as const;
export const ROLE_COPY = {
  owner: "Everything, including the team and other owners.",
  admin: "Runs the platform: moderation, members, bans and settings.",
  moderator: "Moderation: the queue, reports, word lists and feedback.",
  viewer: "Read-only: the audit log and donations.",
} as const;
