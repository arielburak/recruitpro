"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null | undefined;
  onChange?: (score: number) => void;
  size?: "sm" | "md" | "lg";
  readonly?: boolean;
  showEmpty?: boolean;
  className?: string;
};

const SIZE_CLASSES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function RatingStars({
  value,
  onChange,
  size = "md",
  readonly = false,
  showEmpty = true,
  className,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;

  if (!value && readonly && !showEmpty) {
    return null;
  }

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display;
        return (
          <button
            key={n}
            type="button"
            disabled={readonly}
            onClick={(e) => {
              e.stopPropagation();
              if (!readonly) onChange?.(n);
            }}
            onMouseEnter={() => !readonly && setHover(n)}
            onMouseLeave={() => !readonly && setHover(null)}
            className={cn(
              "transition-transform",
              !readonly && "hover:scale-110 cursor-pointer",
              readonly && "cursor-default"
            )}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            <Star
              className={cn(
                SIZE_CLASSES[size],
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-gray-300"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
