"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { RelatedTaskCheck } from "@/features/followup/related-task-check";

const taskSchema = z.object({
  title: z.string().min(3, "Title is required"),
  ownerId: z.string().min(1, "Choose an owner"),
  dueAt: z.string().min(1, "Choose a due date"),
  type: z.enum(["follow_up", "renewal_call", "payment_collection", "trial_follow_up", "general"]),
});
type TaskValues = z.infer<typeof taskSchema>;

/**
 * Create a task about a member. The person's open work is always listed;
 * an optional check asks whether the new task is the same work as one of
 * them. A task is only ever created by this form's own submit, either on
 * its own or explicitly linked as a follow-on to the task the person chose.
 */
export function CreateTaskDialog({
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
  const values = form.watch();
  const owner = (usersQuery.data?.items ?? []).find((u) => u.id === values.ownerId);

  const mutation = useApiMutation(
    (api, v: TaskValues & { relatedTaskId?: string }) =>
      api.createFollowUp({
        type: v.type,
        title: v.title,
        ownerId: v.ownerId,
        dueAt: new Date(`${v.dueAt}T10:00:00Z`).toISOString(),
        memberId,
        relatedTaskId: v.relatedTaskId,
      }),
    {
      onSuccess: async () => {
        toast.success("Task created.");
        onOpenChange(false);
        await invalidate();
      },
    },
  );
  const submitWith = (relatedTaskId?: string) => form.handleSubmit((v) => mutation.mutate({ ...v, relatedTaskId }))();

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
            {open ? (
              <RelatedTaskCheck
                subject="member"
                subjectId={memberId}
                personName={memberName}
                draft={{ type: values.type, title: values.title, dueDate: values.dueAt, ownerName: owner?.name }}
                onKeepExisting={() => { toast.success("Keeping the existing task; nothing was created."); onOpenChange(false); }}
                onLinkAndCreate={(task) => submitWith(task.id)}
                onCreateSeparately={() => submitWith(undefined)}
                pending={mutation.isPending}
              />
            ) : null}
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
