"use client";

import { useState, useEffect } from "react";

interface LiveTimerProps {
  dueDate: string;
  className?: string;
}

export function LiveTimer({ dueDate, className = "" }: LiveTimerProps) {
  const [label, setLabel] = useState<string>("");
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    function compute() {
      const due = new Date(dueDate).getTime();
      const now = Date.now();
      const diffMs = due - now;
      const diffMins = Math.abs(Math.floor(diffMs / 60_000));
      const diffHours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;

      if (diffMs > 0) {
        setIsOverdue(false);
        if (diffHours >= 1) {
          setLabel(mins > 0 ? `Due in ${diffHours}h ${mins}m` : `Due in ${diffHours}h`);
        } else {
          setLabel(mins > 0 ? `Due in ${mins}m` : "Due now");
        }
      } else {
        setIsOverdue(true);
        if (diffHours >= 1) {
          setLabel(mins > 0 ? `Overdue by ${diffHours}h ${mins}m` : `Overdue by ${diffHours}h`);
        } else {
          setLabel(mins > 0 ? `Overdue by ${mins}m` : "Overdue");
        }
      }
    }

    compute();
    const interval = setInterval(compute, 60_000);
    return () => clearInterval(interval);
  }, [dueDate]);

  if (!label) return null;

  return (
    <span
      className={className}
      style={{
        color: isOverdue ? "#B85C38" : "#D4AF37",
        textShadow: !isOverdue ? "0 0 12px rgba(212, 175, 55, 0.3)" : undefined,
      }}
    >
      {label}
    </span>
  );
}
