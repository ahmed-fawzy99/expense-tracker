import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  type ExpenseStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: ExpenseStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn(className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
