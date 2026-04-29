import { Navigate, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ForbiddenPanel } from "@/components/ForbiddenPanel";
import { BackLink } from "@/components/BackLink";
import { Skeleton } from "@/components/ui/skeleton";
import { RequirePermission } from "@/lib/route-guards";
import { useMe } from "@/hooks/useMe";
import { PERMISSIONS } from "../../convex/lib/authConstants";

export const Route = createFileRoute("/new")({
  component: () => (
    <RequirePermission permission={PERMISSIONS.expensesCreate}>
      <NewExpensePage />
    </RequirePermission>
  ),
});

function NewExpensePage() {
  const me = useMe();
  if (me === undefined) return <Skeleton className="h-64 w-full" />;
  if (me === null) return <Navigate to="/auth/login" />;
  if (me.user.managerId === null) {
    return (
      <ForbiddenPanel message="You have no assigned manager, so you cannot submit expenses. Please contact your administrator." />
    );
  }

  return (
    <div className="space-y-4">
      <BackLink to="/" label="Back to my expenses" />
      <PageHeader
        title="New Expense"
        description="Fill in the details, attach the receipt, and submit for your manager's approval."
      />
      <Card>
        <CardContent className="pt-6">
          <ExpenseForm />
        </CardContent>
      </Card>
    </div>
  );
}
