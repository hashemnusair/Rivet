"use client";

import { CalendarClock, Dumbbell, StickyNote } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiError } from "@/lib/api/errors";
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

export default function MemberDetailPageClient() {
  const { memberId } = useParams<{ memberId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useApp();
  const { can } = usePermissions();
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
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
      <NotFoundState title="Member not found" description="This member may have been archived, or the link is wrong." />
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
  const currentMembership = memberships.find(
    (m) => m.status === "active" || m.status === "expiring" || m.status === "frozen" || m.status === "depleted" || m.status === "scheduled",
  );
  const branchName = session?.branches.find((b) => b.id === member.homeBranchId)?.name ?? "—";
  const salesperson = usersQuery.data?.items.find((u) => u.id === member.assignedSalespersonId);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: member.fullName }]} />

      <MemberHeader member={member} currentMembership={currentMembership} branchName={branchName} />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Tabs value={activeTab} onValueChange={(tab) => {
          const params = new URLSearchParams(searchParams.toString());
          if (tab === "overview") params.delete("tab");
          else params.set("tab", tab);
          const query = params.toString();
          router.replace(query ? `/members/${memberId}?${query}` : `/members/${memberId}`, { scroll: false });
        }}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              {MEMBER_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} data-testid={tab.value === "timeline" ? "tab-timeline" : undefined}>
                  {tab.value === "pt" ? <Dumbbell className="size-3.5" /> : null}
                  {tab.label}
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
            <PersonalTrainingTab membershipId={currentMembership?.id} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 self-start">
          {can("members.write") ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setNoteOpen(true)}>
                <StickyNote /> Add note
              </Button>
              {can("crm.write") ? (
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setTaskOpen(true)}>
                  <CalendarClock /> Create task
                </Button>
              ) : null}
            </div>
          ) : null}

          <section className="panel p-4">
            <h3 className="mb-3 font-display text-[13px] font-semibold">Details</h3>
            <MemberDetailsPanel member={member} branchName={branchName} salespersonName={salesperson?.name} />
          </section>

          <section className="panel p-4">
            <h3 className="mb-3 font-display text-[13px] font-semibold">Open tasks</h3>
            <MemberTasksPanel memberId={member.id} />
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
  const [body, setBody] = useState("");
  const mutation = useApiMutation((api) => api.addMemberNote(memberId, { body }), {
    onSuccess: async () => {
      toast.success("Note added to the timeline.");
      setBody("");
      onOpenChange(false);
      await invalidate();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>Notes are plain text, timestamped, and visible to the whole team.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Asked about pausing during Ramadan — revisit next week" data-testid="note-body" />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={body.trim().length < 2} loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="save-note">
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create task
// ---------------------------------------------------------------------------
const taskSchema = z.object({
  title: z.string().min(3, "Title is required"),
  ownerId: z.string().min(1, "Choose an owner"),
  dueAt: z.string().min(1, "Choose a due date"),
  type: z.enum(["follow_up", "renewal_call", "payment_collection", "trial_follow_up", "general"]),
});
type TaskValues = z.infer<typeof taskSchema>;

function CreateTaskDialog({
  memberId,
  memberName,
  open,
  onOpenChange,
}: {
  memberId: string;
  memberName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const usersQuery = useApiQuery(qk.users({ staff: true }), (api) => api.listUsers({ status: "active", pageSize: 30 }));

  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: `Follow up — ${memberName}`,
      ownerId: session?.user.id ?? "",
      dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10),
      type: "follow_up",
    },
  });

  const mutation = useApiMutation(
    (api, v: TaskValues) =>
      api.createFollowUp({
        type: v.type,
        title: v.title,
        ownerId: v.ownerId,
        dueAt: new Date(`${v.dueAt}T10:00:00Z`).toISOString(),
        memberId,
      }),
    {
      onSuccess: async () => {
        toast.success("Task created.");
        onOpenChange(false);
        await invalidate();
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Linked to {memberName} — appears in queues and on the member timeline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <Field label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Owner" required>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Task owner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(usersQuery.data?.items ?? [])
                          .filter((u) => ["salesperson", "manager", "receptionist"].includes(u.role))
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Due date" required>
                <Input type="date" {...form.register("dueAt")} />
              </Field>
            </div>
            <Field label="Type">
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Task type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="renewal_call">Renewal call</SelectItem>
                      <SelectItem value="payment_collection">Payment collection</SelectItem>
                      <SelectItem value="trial_follow_up">Trial follow-up</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Create task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MEMBER_TABS = [
  { value: "overview", label: "Overview" },
  { value: "timeline", label: "Timeline" },
  { value: "memberships", label: "Memberships" },
  { value: "payments", label: "Payments" },
  { value: "checkins", label: "Check-ins" },
  { value: "pt", label: "PT" },
] as const;
