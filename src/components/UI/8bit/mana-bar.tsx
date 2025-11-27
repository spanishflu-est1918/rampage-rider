import type { ComponentProps } from "react";
import { BitProgressProps, Progress } from "@/components/UI/8bit/progress";

interface ManaBarProps extends ComponentProps<"div"> {
  className?: string;
  props?: BitProgressProps;
  variant?: "retro" | "default";
  value?: number;
}

export default function ManaBar({
  className,
  variant,
  value,
  ...props
}: ManaBarProps) {
  return (
    <Progress
      {...props}
      value={value}
      variant={variant}
      className={className}
      progressBg="bg-blue-500"
    />
  );
}
