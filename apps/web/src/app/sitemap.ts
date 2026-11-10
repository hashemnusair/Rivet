import type { MetadataRoute } from "next";
import { publicSitemap } from "@/lib/routing/crawler-policy";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemap();
}
