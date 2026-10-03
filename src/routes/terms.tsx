import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, docHead } from "@/components/legal-page";
import { termsDoc } from "@/content/legal";

export const Route = createFileRoute("/terms")({
  head: () => docHead(termsDoc, "The terms and conditions for using Ghosted, the anonymous hiring experience platform.", "/terms"),
  component: () => <LegalPage doc={termsDoc} />,
});
