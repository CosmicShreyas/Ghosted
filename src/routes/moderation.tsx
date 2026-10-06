import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, docHead } from "@/components/legal-page";
import { moderationDoc } from "@/content/legal";

// How moderation works: every automatic check, what happens to held posts, reports, strikes and
// where people step in. Public and indexable, linked from the footer.
export const Route = createFileRoute("/moderation")({
  head: () => docHead(moderationDoc, "How Ghosted moderates posts: the automatic checks, what gets held or turned away, how reports and strikes work, and where a person steps in.", "/moderation"),
  component: () => <LegalPage doc={moderationDoc} />,
});
