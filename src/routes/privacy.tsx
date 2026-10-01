import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, docHead } from "@/components/legal-page";
import { privacyDoc } from "@/content/legal";

export const Route = createFileRoute("/privacy")({
  head: () => docHead(privacyDoc, "How Ghosted collects, uses and protects your personal data under India's DPDP Act, 2023."),
  component: () => <LegalPage doc={privacyDoc} />,
});
