import { redirect } from "next/navigation";

/** Old deep links keep working: /operations/checkout?… → /checkout?… */
export default async function LegacyCheckoutRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/checkout?${query}` : "/checkout");
}
