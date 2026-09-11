import { expect, test } from "@playwright/test";

// Actual Next Proxy responses with production host headers, backed exclusively
// by the local server. Clerk production sessions are checked separately live.
test("production deep links reach their owner with query strings intact", async ({ request }) => {
  for (const [source, path, destination] of [
    ["www.rivetjo.com", "/members/123?tab=payments", "https://dashboard.rivetjo.com/members/123?tab=payments"],
    ["app.rivetjo.com", "/platform/gyms", "https://platform.rivetjo.com/platform/gyms"],
    ["dashboard.rivetjo.com", "/customer/my-gyms", "https://app.rivetjo.com/customer/my-gyms"],
    ["www.rivetjo.com", "/login/gym", "https://dashboard.rivetjo.com/login/gym"],
    ["www.rivetjo.com", "/login/member", "https://app.rivetjo.com/login/member"],
    ["www.rivetjo.com", "/login/admin", "https://platform.rivetjo.com/login/admin"],
    ["app.rivetjo.com", "/signup?returnTo=%2Fcustomer%2Fmy-gyms", "https://app.rivetjo.com/login/member/create?returnTo=%2Fcustomer%2Fmy-gyms"],
    ["rivetjo.com", "/", "https://www.rivetjo.com/"],
    ["admin.rivetjo.com", "/", "https://platform.rivetjo.com/"],
  ]) {
    const response = await request.get(path!, { headers: { "x-forwarded-host": source! }, maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(destination);
  }
});

test("canonical hosts serve their root and shared login without redirect loops", async ({ request }) => {
  for (const host of ["www.rivetjo.com", "dashboard.rivetjo.com", "app.rivetjo.com", "platform.rivetjo.com"]) {
    for (const path of ["/", "/login"]) {
      const response = await request.get(path, { headers: { "x-forwarded-host": host }, maxRedirects: 0 });
      expect(response.status(), `${host}${path}`).toBe(200);
      expect(response.headers().location).toBeUndefined();
    }
  }
});
