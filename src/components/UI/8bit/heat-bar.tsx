import type { ComponentProps } from "react";
import { BitProgressProps, Progress } from "@/components/ui/8bit/progress";

interface HeatBarProps extends ComponentProps<"div"> {
  className?: string;
  props?: BitProgressProps;
  variant?: "retro" | "default";
  value?: number;
}

export default function HeatBar({
  className,
  variant,
  value = 0,
  ...props
}: HeatBarProps) {
  // Color gradient based on heat level
  let progressBg = "bg-green-500"; // Low heat (0-25%)
  if (value >= 75) {
    progressBg = "bg-red-600"; // High heat (75-100%)
  } else if (value >= 50) {
    progressBg = "bg-orange-500"; // Medium-high heat (50-75%)
  } else if (value >= 25) {
    progressBg = "bg-yellow-500"; // Medium heat (25-50%)
  }

  return (
    <Progress
      {...props}
      value={value}
      variant={variant}
      className={className}
      progressBg={progressBg}
    />
  );
}
