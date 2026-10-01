import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import "./admin.css";
import { App } from "./app";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 15_000 } } });

createRoot(document.getElementById("root")!).render(<StrictMode>
  <QueryClientProvider client={qc}>
    <App />
    <Toaster position="bottom-right" />
  </QueryClientProvider>
</StrictMode>);
