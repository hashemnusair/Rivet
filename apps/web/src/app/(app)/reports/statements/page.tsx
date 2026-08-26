import { redirect } from "next/navigation";
import { managementStatementsRedirectTarget } from "./legacy-statements-route";

export default async function ManagementStatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(managementStatementsRedirectTarget(await searchParams));
}
