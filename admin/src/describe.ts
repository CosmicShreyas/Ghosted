// Turns audit-log rows into plain sentences ("switched new sign-ups off", "banned 350567669420236
// for 30 days"), so nobody has to read raw JSON.
const SETTING: Record<string, string> = { signupsOpen: "new sign-ups", postingOpen: "new stories", chitchatsOpen: "chitchats", donationsOpen: "donations", reportsOpen: "reports", readOnly: "read-only mode", readOnlyMessage: "the read-only message", announcement: "the announcement" };

export const ACTION: Record<string, string> = {
  signed_in: "signed in", signed_out: "signed out", password_set: "set their password", password_changed: "changed their password",
  revoked_other_sessions: "signed out their other sessions", session_reuse_blocked: "had a copied session blocked", settings_update: "updated their settings",
  mfa_on: "turned on two-step sign-in", mfa_off: "turned off two-step sign-in", mfa_recovery_regenerated: "made new recovery codes",
  queue_approve: "approved", queue_redact: "approved with names hidden", queue_remove: "removed", report_upheld: "upheld reports on", report_dismissed: "dismissed reports on",
  term_add: "added a word", term_update: "changed a word", feedback_update: "updated feedback", company_listed: "listed", company_hidden: "hid",
  member_paused: "paused posting for", member_unpaused: "lifted the pause on", member_banned: "banned", member_unbanned: "lifted the ban on",
  member_private_viewed: "looked at private details of", member_emailed: "emailed", ip_banned: "blocked a connection", ip_unbanned: "unblocked a connection",
  team_added: "added to the team", team_removed: "removed from the team", team_access_changed: "changed access for", team_sign_in_off: "switched sign-in off for",
  team_sign_in_on: "switched sign-in back on for", team_signed_out: "signed out everywhere", platform_update: "changed the platform", goofy_controls_update: "changed Goofy's controls", company_added: "listed a new company", companies_bulk_added: "listed companies in bulk", goofy_job_run: "ran a Goofy job",
};
export const actionText = (a: string) => ACTION[a] ?? a.replace(/_/g, " ");

const show = (v: unknown): string => {
  if (v === null || v === undefined) return "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.length ? v.map(show).join(", ") : "none";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== "").map(([k, x]) => (k === "text" ? `“${String(x)}”` : `${k} ${show(x)}`)).join(", ");
  return String(v);
};

// One line per change for platform updates; short phrases for everything else.
export function detailLines(action: string, d: Record<string, unknown> | null): string[] {
  if (!d) return [];
  if (action === "platform_update") return Object.entries(d).map(([k, v]) => {
    const name = SETTING[k] ?? k;
    if (k === "announcement") return v ? `Announcement set to ${show(v)}` : "Announcement taken down";
    if (typeof v === "boolean") return k === "readOnly" ? `Read-only mode ${v ? "on" : "off"}` : `${name[0]!.toUpperCase()}${name.slice(1)} ${v ? "opened" : "paused"}`;
    return `${name[0]!.toUpperCase()}${name.slice(1)} set to “${show(v)}”`;
  });
  const out: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "fields") out.push(`Changed ${show(v).replace(/_/g, " ")}`);
    else if (k === "days") out.push(v ? `for ${v} day${v === 1 ? "" : "s"}` : "permanently");
    else if (k === "reason" || k === "note") out.push(`“${String(v)}”`);
    else if (k === "via") out.push(`via ${String(v)}`);
    else out.push(`${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${show(v)}`);
  }
  return out;
}
