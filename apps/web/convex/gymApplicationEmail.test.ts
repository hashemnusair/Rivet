import { describe, expect, it } from "vitest";
import { applicantReceivedEmail, applicantReviewEmail, applicationInternalEmail } from "./gymApplicationEmail";

type ApplicationInput = { gymName: string; gymAddress: string; ownerName: string; email: string; contactNumber: string; plan: "Starter" | "Growth" | "Pro" | "Enterprise"; billingInterval?: "monthly" | "annual" };

const values: ApplicationInput = { gymName: "Iron & Co <نادي الحديد>", gymAddress: "Wasfi Al-Tal St 12, عمّان", ownerName: "Rania O'Neil رانيا", email: "owner@example.test", contactNumber: "+962 79 555 0101", plan: "Growth", billingInterval: "annual" };

describe("gym application emails", () => {
  it("sends the applicant's English copies on the branded template, with their details exactly as typed", () => {
    const received = applicantReceivedEmail(values);
    expect(received).toEqual(applicantReceivedEmail(values, "en"));
    expect(received.subject).toBe("RIVET gym application received");
    expect(received.html).toContain("/brand/rivet-lockup.png");
    expect(received.html).toContain('class="rv-beta rv-secondary"');
    expect(received.html).toContain("Application received");
    expect(received.html).toContain("Thanks for applying to bring Iron &amp; Co &lt;نادي الحديد&gt; onto RIVET.");
    expect(received.html).toContain("Rania O&#39;Neil رانيا");
    expect(received.html).toContain("Growth (annual billing)");
    expect(received.text).toContain("Contact number: +962 79 555 0101");
    expect(received.text).toContain("This message was sent by RIVET. Please contact our team directly if you have questions.");
    // An applicant has no gym settings and no RIVET account yet.
    expect(received.html).not.toContain("Email preferences");
    expect(received.text).not.toContain("This is a service message about your RIVET account.");

    const approved = applicantReviewEmail(values, "approved", "en");
    expect(approved.subject).toBe("RIVET application approved · Iron & Co <نادي الحديد>");
    expect(approved.text).toContain("Your RIVET application is approved");
    expect(approved.text).toContain("Hi Rania O'Neil رانيا,");
    expect(approved.text).toContain("Gym: Iron & Co <نادي الحديد>");
    expect(approved.text).toContain("Plan: Growth");
    const rejected = applicantReviewEmail(values, "rejected", "en");
    expect(rejected.subject).toBe("RIVET application update · Iron & Co <نادي الحديد>");
    expect(rejected.text).toContain("We are unable to approve the application at this time.");
    expect(rejected.html).toContain('class="rv-beta rv-secondary"');
  });

  it("writes the applicant's Arabic copies right to left with their details exactly as typed", () => {
    const received = applicantReceivedEmail(values, "ar");
    expect(received.subject).toBe("تم استلام طلب تسجيل النادي في RIVET");
    expect(received.html).toContain('<html dir="rtl" lang="ar">');
    expect(received.html).toContain("Iron &amp; Co &lt;نادي الحديد&gt;");
    expect(received.html).toContain("Rania O&#39;Neil رانيا");
    // The phone number is an identifier, so it stays left to right.
    expect(received.html).toMatch(/dir="ltr"[^>]*>\+962 79 555 0101</);
    expect(received.html).toContain("Growth (فوترة سنوية)");
    expect(received.html).toContain(">تجريبي</span>");
    expect(received.text).toContain("رقم التواصل: +962 79 555 0101");
    expect(received.html).not.toMatch(/Gym name|Chosen plan|Thanks for applying/);
    const approved = applicantReviewEmail(values, "approved", "ar");
    expect(approved.subject).toBe("تم قبول طلب RIVET · Iron & Co <نادي الحديد>");
    expect(approved.html).toContain("مرحبًا Rania O&#39;Neil رانيا،");
    const rejected = applicantReviewEmail(values, "rejected", "ar");
    expect(rejected.text).toContain("لا يمكننا قبول الطلب في الوقت الحالي.");
  });

  it("gives RIVET's applications inbox the same template, in English, with a way into the console", () => {
    const notice = applicationInternalEmail(values, "https://staging.rivetjo.com/");
    expect(notice.subject).toBe("New RIVET gym application · Iron & Co <نادي الحديد>");
    expect(notice.html).toContain('<html dir="ltr" lang="en">');
    expect(notice.html).toContain('class="rv-beta rv-secondary"');
    expect(notice.text).toContain("Email: owner@example.test");
    expect(notice.text).toContain("Open in the console: https://staging.rivetjo.com/platform/applications");
    expect(notice.text).toContain("Sent to RIVET's applications inbox from the form on rivetjo.com.");
    expect(applicationInternalEmail(values).text).toContain("https://www.rivetjo.com/platform/applications");
  });
});
