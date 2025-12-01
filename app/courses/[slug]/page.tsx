// app/courses/[slug]/page.tsx
import Image from "next/image";
import EnrollCTA from "@/components/EnrollCTA";
import NoInternet from "@/components/NoInternet";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  img: string | null;
  price: number | null;
  cpd_points: number | null;
  published: boolean | null;
};

export const dynamic = "force-dynamic";

export default async function CoursePreviewPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;

  const sb = getSupabaseAdmin();
  const { data: course } = await sb
    .from("courses")
    .select("id,slug,title,description,img,price,cpd_points,published")
    .eq("slug", slug)
    .maybeSingle<Course>();

  if (!course || course.published !== true) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-[var(--color-text-muted)]">This course is unavailable.</p>
      </div>
    );
  }

  return (
    <NoInternet>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-[1fr_420px]">
          {/* Left */}
          <div className="rounded-2xl bg-white border border-[color:var(--color-light)] overflow-hidden">
            <div className="relative w-full aspect-video bg-[color:var(--color-light)]/40">
              <Image
                src={course.img || "/project-management.png"}
                alt={course.title}
                fill
                sizes="(max-width:768px) 100vw, 60vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="p-5">
              <h1 className="text-2xl font-semibold">{course.title}</h1>
              {course.description && (
                <p className="mt-2 text-[var(--color-text-muted)]">{course.description}</p>
              )}
            </div>
          </div>

          {/* Right */}
          <aside className="rounded-2xl bg-white border border-[color:var(--color-light)] p-5 h-max">
            <div className="text-sm text-[var(--color-text-muted)]">Price</div>
            <div className="mt-1 text-2xl font-semibold">
              GHS {Number(course.price ?? 0).toFixed(2)}
            </div>
            <div className="mt-2 text-sm">
              CPPD: <b>{course.cpd_points ?? 0}</b>
            </div>

            <EnrollCTA courseId={course.id} slug={course.slug} className="mt-5 w-full text-center block" />

            <div className="mt-4 text-xs text-[var(--color-text-muted)]">
              One-time payment. Access tied to your account.
            </div>
          </aside>
        </div>
      </div>
    </NoInternet>
  );
}
