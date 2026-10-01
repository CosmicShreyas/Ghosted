import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, docHead } from "@/components/legal-page";
import { communityDoc } from "@/content/legal";

export const Route = createFileRoute("/community")({
  head: () => docHead(communityDoc, "The rules that keep Ghosted honest, useful and fair."),
  component: () => <LegalPage doc={communityDoc} />,
});
