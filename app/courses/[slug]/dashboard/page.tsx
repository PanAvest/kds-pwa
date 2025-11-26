// app/courses/[slug]/dashboard/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CourseDashboardRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/knowledge/${encodeURIComponent(slug)}/dashboard`);
}
