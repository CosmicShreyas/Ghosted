import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, docHead } from "@/components/legal-page";
import { communityDoc } from "@/content/legal";

export const Route = createFileRoute("/community")({
  head: () => docHead(communityDoc, "The community rules that keep Ghosted's hiring experiences honest, useful and fair to candidates and companies.", "/community"),
  component: () => <LegalPage doc={communityDoc} />,
});
