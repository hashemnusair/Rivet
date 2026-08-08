"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Gate, PageHeader } from "@/components/shared/chrome";
import { ForbiddenState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BranchesSection,
  NotificationsSection,
  OperationalRulesSection,
  OrganizationSection,
  PaymentsSection,
  ReceiptsSection,
  RolesSection,
  UsersSection,
} from "@/features/settings/settings-sections";

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "organization";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Organization, branches, people, permissions and receipts. Everything sensitive here is audited."
      />
      <Gate permission={["settings.manage", "users.manage"]} fallback={<ForbiddenState description="Settings require owner-level permissions in the demo." />}>
        <Tabs defaultValue={section} key={section}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="receipts">Receipts & tax</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="operations">Rules & hours</TabsTrigger>
          </TabsList>
          <TabsContent value="organization">
            <OrganizationSection />
          </TabsContent>
          <TabsContent value="branches">
            <BranchesSection />
          </TabsContent>
          <TabsContent value="users">
            <UsersSection />
          </TabsContent>
          <TabsContent value="roles">
            <RolesSection />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsSection />
          </TabsContent>
          <TabsContent value="receipts">
            <ReceiptsSection />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>
          <TabsContent value="operations">
            <OperationalRulesSection />
          </TabsContent>
        </Tabs>
      </Gate>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
