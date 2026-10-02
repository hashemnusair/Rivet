"use client";

import { CalendarClock, Dumbbell, StickyNote } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiError } from "@/lib/api/errors";
import { pickCurrentMembership, pickRenewalTarget } from "@/lib/domain/status";
import { MemberHeader } from "@/features/members/member-header";
import {
  CheckInsTab,
  MemberDetailsPanel,
  MemberTasksPanel,
  MembershipsTab,
  OverviewTab,
  PaymentsTab,
  PersonalTrainingTab,
  TimelineTab,
} from "@/features/members/member-tabs";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";
import { CreateTaskDialog } from "@/features/members/create-task-dialog";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { FollowUpContextPanel } from "@/features/followup/follow-up-context";

export default function MemberDetailPageClient() {
  const { memberId } = useParams<{ memberId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useApp();
  const { can } = usePermissions();
  const { t, isolate } = useLocale();
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  // Today and the queues link here with ?action=contact to record an outcome.
  const [contactOpen, setContactOpen] = useState(searchParams.get("action") === "contact");
  const requestedTab = searchParams.get("tab");
  const activeTab = MEMBER_TABS.some((tab) => tab.value === requestedTab) ? requestedTab! : "overview";

  const memberQuery = useRealtimeApiQuery({ queryKey: qk.member(memberId), query: (api) => api.getMember(memberId), subscribe: (api, onValue, onError) => api.subscribeMember(memberId, onValue, onError) });
  const membershipsQuery = useApiQuery(qk.memberships({ memberId }), (api) =>
    api.listMemberships({ memberId, pageSize: 20, sort: "-startDate" }),
  );
  const usersQuery = useApiQuery(qk.users({ role: "salesperson" }), (api) => api.listUsers({ role: "salesperson", pageSize: 20 }));

  if (memberQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (memberQuery.isError) {
    return isApiError(memberQuery.error) && memberQuery.error.code === "NOT_FOUND" ? (
      <NotFoundState title={t("memberProfile.page.notFoundTitle")} description={t("memberProfile.page.notFoundDescription")} />
    ) : (
      <ErrorState onRetry={() => memberQuery.refetch()} />
    );
  }
  if (!memberQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const member = memberQuery.data;
  const memberships = membershipsQuery.data?.items ?? [];
  // Rank terms exactly as the server ranks them for the status chip, so the
  // header never presents a scheduled successor as the term in force.
  const currentMembership = pickCurrentMembership(memberships.filter((m) => m.status !== "expired" && m.status !== "cancelled"));
  const renewalTarget = pickRenewalTarget(memberships);
  const upcomingMembership = memberships.find((m) => m.status === "scheduled" && m.id !== currentMembership?.id);
  const branchName = session?.branches.find((b) => b.id === member.homeBranchId)?.name ?? "—";
  const salesperson = usersQuery.data?.items.find((u) => u.id === member.assignedSalespersonId);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: t("nav.item.members"), href: "/members" }, { label: isolate(member.fullName) }]} />

      <MemberHeader member={member} currentMembership={currentMembership} renewalTarget={renewalTarget} upcomingMembership={upcomingMembership} branchName={branchName} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Tabs className="min-w-0" value={activeTab} onValueChange={(tab) => {
          const params = new URLSearchParams(searchParams.toString());
          if (tab === "overview") params.delete("tab");
          else params.set("tab", tab);
          const query = params.toString();
          router.replace(query ? `/members/${memberId}?${query}` : `/members/${memberId}`, { scroll: false });
        }}>
          <div className="min-w-0">
            <TabsList aria-label={t("memberProfile.page.sectionsLabel")}>
              {MEMBER_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} data-testid={tab.value === "timeline" ? "tab-timeline" : undefined}>
                  {tab.value === "pt" ? <Dumbbell className="size-3.5" /> : null}
                  {t(tab.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview">
            <OverviewTab member={member} />
          </TabsContent>
          <TabsContent value="timeline">
            <TimelineTab memberId={member.id} />
          </TabsContent>
          <TabsContent value="memberships">
            <MembershipsTab memberId={member.id} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsTab memberId={member.id} />
          </TabsContent>
          <TabsContent value="checkins">
            <CheckInsTab memberId={member.id} />
          </TabsContent>
          <TabsContent value="pt">
            {/* Keyed by the preselect so a "Book with" link works while the tab is already open. */}
            <PersonalTrainingTab key={`${searchParams.get("trainer") ?? ""}:${searchParams.get("book") ?? ""}`} membershipId={currentMembership?.id} preselectTrainerId={searchParams.get("trainer") ?? undefined} openBookingOnMount={searchParams.get("book") === "1"} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 self-start">
          {can("members.write") ? (
            <div className="flex flex-wrap gap-2" aria-label={t("memberProfile.page.contactActionsLabel")}>
              <WhatsAppHandoff subject="member" subjectId={member.id} recipientName={member.fullName} phone={member.phone} />
              <LogContactDialog subject="member" memberId={member.id} open={contactOpen} onOpenChange={(next) => { setContactOpen(next); if (!next && searchParams.get("action") === "contact") router.replace(`/members/${memberId}`, { scroll: false }); }} />
              <Button variant="secondary" size="sm" onClick={() => setNoteOpen(true)}>
                <StickyNote /> {t("memberProfile.page.addNote")}
              </Button>
              {can("crm.write") ? (
                <Button variant="secondary" size="sm" onClick={() => setTaskOpen(true)}>
                  <CalendarClock /> {t("memberProfile.page.createTask")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <section className="panel p-4">
            <h3 className="mb-3 font-display text-[13px] font-semibold">{t("memberProfile.page.detailsHeading")}</h3>
            <MemberDetailsPanel member={member} branchName={branchName} salespersonName={salesperson?.name} />
          </section>

          <section className="panel p-4">
            <h3 className="mb-3 font-display text-[13px] font-semibold">{t("memberProfile.shared.openTasks")}</h3>
            <MemberTasksPanel memberId={member.id} />
          </section>

          <section className="panel p-4">
            <h3 className="mb-3 font-display text-[13px] font-semibold">{t("memberProfile.page.renewalHeading")}</h3>
            <FollowUpContextPanel memberId={member.id} />
          </section>
        </aside>
      </div>

      <AddNoteDialog memberId={member.id} open={noteOpen} onOpenChange={setNoteOpen} />
      <CreateTaskDialog memberId={member.id} memberName={member.fullName} open={taskOpen} onOpenChange={setTaskOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add note
// ---------------------------------------------------------------------------
function AddNoteDialog({ memberId, open, onOpenChange }: { memberId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const invalidate = useInvalidate();
  const { t } = useLocale();
  const [body, setBody] = useState("");
  const mutation = useApiMutation((api) => api.addMemberNote(memberId, { body }), {
    onSuccess: async () => {
      toast.success(t("memberProfile.note.saved"));
      setBody("");
      onOpenChange(false);
      await invalidate();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("memberProfile.note.title")}</DialogTitle>
          <DialogDescription>{t("memberProfile.note.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("memberProfile.note.placeholder")} dir="auto" data-testid="note-body" />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button disabled={body.trim().length < 2} loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="save-note">
            {t("memberProfile.note.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MEMBER_TABS: ReadonlyArray<{ value: string; labelKey: TKey }> = [
  { value: "overview", labelKey: "memberProfile.tabs.overview" },
  { value: "timeline", labelKey: "memberProfile.tabs.timeline" },
  { value: "memberships", labelKey: "memberProfile.tabs.memberships" },
  { value: "payments", labelKey: "memberProfile.tabs.payments" },
  { value: "checkins", labelKey: "memberProfile.tabs.checkins" },
  { value: "pt", labelKey: "memberProfile.tabs.pt" },
];
