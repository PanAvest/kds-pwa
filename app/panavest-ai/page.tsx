import type { Metadata } from "next";
import PanavestAiClient from "@/components/panavest-ai/PanavestAiClient";

export const metadata: Metadata = {
  title: "PanAvest AI | KDS Learning",
  description: "Mobile PanAvest AI supply chain dictionary inside KDS Learning.",
};

export default function PanavestAiPage() {
  return <PanavestAiClient />;
}
