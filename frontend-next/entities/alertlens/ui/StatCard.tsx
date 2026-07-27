import { Card, Icon, Metric, Text } from "@tremor/react";
import type { IconType } from "react-icons/lib";
import clsx from "clsx";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: IconType | React.ElementType;
  color?: "orange" | "red" | "blue" | "emerald" | "amber" | "gray";
  className?: string;
};

const ACCENT_BORDER: Record<NonNullable<StatCardProps["color"]>, string> = {
  orange: "border-t-orange-400",
  red: "border-t-red-400",
  blue: "border-t-blue-400",
  emerald: "border-t-emerald-400",
  amber: "border-t-amber-400",
  gray: "border-t-gray-300",
};

/** Adds thousands separators to a plain number; leaves everything else as-is. */
const formatValue = (value: string | number) =>
  typeof value === "number" ? value.toLocaleString() : value;

export function StatCard({
  label,
  value,
  hint,
  icon,
  color = "orange",
  className,
}: StatCardProps) {
  return (
    <Card
      className={clsx(
        "p-4 border-t-2 transition-shadow hover:shadow-md",
        ACCENT_BORDER[color],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Text className="truncate">{label}</Text>
          <Metric className="mt-1 text-2xl tabular-nums">
            {formatValue(value)}
          </Metric>
        </div>
        {icon && <Icon icon={icon} color={color} variant="light" size="sm" />}
      </div>
      {hint && (
        <Text className="mt-2 text-xs text-gray-500 line-clamp-2">{hint}</Text>
      )}
    </Card>
  );
}
