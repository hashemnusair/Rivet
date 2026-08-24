"use client";

import { useState } from "react";
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
import { GymPublicProfileSection } from "@/features/settings/gym-public-profile-section";
import { OperationalEmailSection } from "@/features/settings/operational-email-section";
import { BrandKitSection } from "@/features/settings/brand-kit-section";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";

export function SettingsPageInner() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "organization";
  const [activeSection, setActiveSection] = useState(section);
  const { requestNavigation } = useUnsavedChanges();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Organization, branches, people, permissions and receipts. Everything sensitive here is audited."
      />
      <Gate permission={["settings.manage", "users.manage"]} fallback={<ForbiddenState description="Settings require owner-level permissions." />}>
        <Tabs value={activeSection} onValueChange={(nextSection) => requestNavigation(() => setActiveSection(nextSection))}>
          <TabsList className="max-w-full overflow-x-auto [scrollbar-width:thin]">
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="brand">Brand Kit</TabsTrigger>
            <TabsTrigger value="profile">Public profile</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="receipts">Receipts & tax</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="email">Operational email</TabsTrigger>
            <TabsTrigger value="operations">Rules & hours</TabsTrigger>
          </TabsList>
          <TabsContent value="organization">
            <OrganizationSection />
          </TabsContent>
          <TabsContent value="brand">
            <BrandKitSection />
          </TabsContent>
          <TabsContent value="profile">
            <GymPublicProfileSection />
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
          <TabsContent value="email">
            <OperationalEmailSection />
          </TabsContent>
          <TabsContent value="operations">
            <OperationalRulesSection />
          </TabsContent>
        </Tabs>
      </Gate>
    </div>
  );
}
