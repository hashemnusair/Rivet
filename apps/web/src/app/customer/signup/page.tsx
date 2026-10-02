import { redirect } from "next/navigation";

/**
 * Member signup lives at `/login/member/create`, inside the sign-in frame.
 * This historical URL only forwards older links and bookmarks there, keeping
 * any gym or return-path context so the canonical page can validate it.
 */
export default async function CustomerSignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const query = params.toString();
  redirect(`/login/member/create${query ? `?${query}` : ""}`);
}
