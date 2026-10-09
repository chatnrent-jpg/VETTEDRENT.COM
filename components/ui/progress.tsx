import type { HTMLAttributes } from "react";

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value?: number;
};

export function Progress({ value = 0, style, ...props }: ProgressProps) {
  const percent = clampPercent(value);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ ...style, ["--progress" as string]: percent }}
      {...props}
    >
      <div className="progress-indicator" />
    </div>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 100;
  }
  return value;
}
