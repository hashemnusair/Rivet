import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { robotsForHost } from "@/lib/routing/crawler-policy";

/** Every RIVET host serves this file, so the answer depends on the host asked. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  return robotsForHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
}
