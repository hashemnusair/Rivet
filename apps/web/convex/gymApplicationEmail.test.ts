import { describe, expect, it } from "vitest";
import { applicantReceivedEmail, applicantReviewEmail } from "./gymApplicationEmail";

// The applicant copies exactly as they were written before the Arabic work
// (convex/gymApplications.ts at 843824f), kept here to prove English is byte-identical.
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
type ApplicationInput = { gymName: string; gymAddress: string; ownerName: string; email: string; contactNumber: string; plan: "Starter" | "Growth" | "Pro" | "Enterprise"; billingInterval?: "monthly" | "annual" };
function oldDetailsHtml(values: ApplicationInput): string {
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Arial,sans-serif;font-size:14px">
    <tr><td style="padding:8px 0;color:#777">Gym name</td><td style="padding:8px 0;font-weight:600">${escapeHtml(values.gymName)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Gym address</td><td style="padding:8px 0">${escapeHtml(values.gymAddress)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Owner name</td><td style="padding:8px 0;font-weight:600">${escapeHtml(values.ownerName)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Email</td><td style="padding:8px 0"><a href="mailto:${encodeURIComponent(values.email)}">${escapeHtml(values.email)}</a></td></tr>
    <tr><td style="padding:8px 0;color:#777">Contact number</td><td style="padding:8px 0">${escapeHtml(values.contactNumber)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Chosen plan</td><td style="padding:8px 0">${escapeHtml(values.plan)} (${escapeHtml(values.billingInterval ?? "monthly")} billing)</td></tr>
  </table>`;
}
function oldReviewEmail(values: { gymName: string; ownerName: string; plan: "Starter" | "Growth" | "Pro" | "Enterprise" }, decision: "approved" | "rejected") {
  const approved = decision === "approved";
  const heading = approved ? "Your RIVET application is approved" : "An update on your RIVET application";
  const message = approved
    ? "Our team will contact you soon to finish setup and provide your gym access."
    : "We are unable to approve the application at this time. Our team will contact you if more information is needed.";
  return {
    subject: approved ? `RIVET application approved · ${values.gymName}` : `RIVET application update · ${values.gymName}`,
    html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>${heading}</h2><p>Hi ${escapeHtml(values.ownerName)},</p><p>${message}</p><p><strong>Gym:</strong> ${escapeHtml(values.gymName)}<br/><strong>Plan:</strong> ${escapeHtml(values.plan)}</p><p style="color:#777;font-size:12px">This message was sent by RIVET. Please contact our team directly if you have questions.</p></div>`,
    text: `${heading}\n\nHi ${values.ownerName},\n\n${message}\n\nGym: ${values.gymName}\nPlan: ${values.plan}`,
  };
}
function oldReceived(values: ApplicationInput) { const summary = oldDetailsHtml(values); return {
      subject: "RIVET gym application received",
      html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>Application received</h2><p>Thanks for applying to bring <strong>${escapeHtml(values.gymName)}</strong> onto RIVET.</p><p>Our team will review your application and contact you soon. There is no gym account to create yet; approved gyms receive access directly from RIVET.</p>${summary}</div>`,
      text: `Application received for ${values.gymName}. Our team will review it and contact you soon.\n\nGym: ${values.gymName}\nAddress: ${values.gymAddress}\nOwner: ${values.ownerName}\nEmail: ${values.email}\nContact: ${values.contactNumber}\nPlan: ${values.plan}`,
}; }

const values: ApplicationInput = { gymName: "Iron & Co <نادي الحديد>", gymAddress: "Wasfi Al-Tal St 12, عمّان", ownerName: "Rania O'Neil رانيا", email: "owner@example.test", contactNumber: "+962 79 555 0101", plan: "Growth", billingInterval: "annual" };

describe("gym application applicant emails", () => {
  it("keeps the English copies byte-identical", () => {
    expect(applicantReceivedEmail(values, "en")).toEqual(oldReceived(values));
    expect(applicantReceivedEmail(values)).toEqual(oldReceived(values));
    expect(applicantReviewEmail(values, "approved", "en")).toEqual(oldReviewEmail(values, "approved"));
    expect(applicantReviewEmail(values, "rejected", "en")).toEqual(oldReviewEmail(values, "rejected"));
  });

  it("writes the applicant's Arabic copies right to left with their details exactly as typed", () => {
    const received = applicantReceivedEmail(values, "ar");
    expect(received.subject).toBe("تم استلام طلب تسجيل النادي في RIVET");
    expect(received.html).toContain('dir="rtl" lang="ar"');
    expect(received.html).toContain("<strong>Iron &amp; Co &lt;نادي الحديد&gt;</strong>");
    expect(received.html).toContain("Rania O&#39;Neil رانيا");
    expect(received.html).toContain('dir="ltr">+962 79 555 0101');
    expect(received.html).toContain("Growth (فوترة سنوية)");
    expect(received.text).toContain("رقم التواصل: +962 79 555 0101");
    expect(received.html).not.toMatch(/Gym name|Chosen plan|Thanks for applying/);
    const approved = applicantReviewEmail(values, "approved", "ar");
    expect(approved.subject).toBe("تم قبول طلب RIVET · Iron & Co <نادي الحديد>");
    expect(approved.html).toContain("مرحبًا Rania O&#39;Neil رانيا،");
    const rejected = applicantReviewEmail(values, "rejected", "ar");
    expect(rejected.text).toContain("لا يمكننا قبول الطلب في الوقت الحالي.");
  });
});
