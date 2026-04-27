"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { PROJECT_STATUS_CONFIG } from "@/lib/types/database";
import type { Profile, Project } from "@/lib/types/database";
import { format } from "date-fns";
import {
  Briefcase,
  Code,
  Users,
  Star,
  Zap,
  Globe,
  BarChart3,
  Megaphone,
  ShoppingBag,
  Heart,
  Layers,
  Rocket,
  Settings,
  BookOpen,
  Camera,
  Music,
  Calendar,
  Lightbulb,
  Target,
  Award,
  FolderKanban,
} from "lucide-react";

const ICON_MAP: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  Briefcase, Code, Users, Star, Zap, Globe, BarChart3, Megaphone,
  ShoppingBag, Heart, Layers, Rocket, Settings, BookOpen, Camera,
  Music, Calendar, Lightbulb, Target, Award, FolderKanban,
};

interface ProjectCardProps {
  project: Project & { task_count?: number; completed_task_count?: number };
}

function ProgressRing({
  total,
  done,
  color,
}: {
  total: number;
  done: number;
  color: string;
}) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const dash = (pct / 100) * circ;

  return (
    <svg width={34} height={34} viewBox="0 0 34 34" className="-rotate-90">
      <circle cx={17} cy={17} r={r} fill="none" stroke="#F0F0ED" strokeWidth={3} />
      <circle
        cx={17}
        cy={17}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
      <text
        x={17}
        y={21}
        textAnchor="middle"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: "17px 17px",
          fontSize: "7px",
          fontWeight: 700,
          fill: pct === 100 ? "#10B981" : "#6B6B6B",
        }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function ProjectCard({ project }: ProjectCardProps) {
  const Icon = (project.icon ? ICON_MAP[project.icon] : null) ?? FolderKanban;
  const color = project.color ?? "#D4AF37";
  const statusConfig = PROJECT_STATUS_CONFIG[project.status] ?? PROJECT_STATUS_CONFIG.active;
  const members = (project.members ?? []).map((m) => m.profile).filter(
    (p): p is Pick<Profile, "id" | "full_name" | "role"> => !!p,
  );
  const taskCount = project.task_count ?? 0;
  const completedCount = project.completed_task_count ?? 0;

  return (
    <Link href={`/projects/${project.id}`} className="block group">
      <div
        className={cn(
          "rounded-2xl border border-[#E5E4DF] bg-white p-5",
          "shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]",
          "hover:shadow-[0_4px_20px_-4px_rgb(0_0_0/0.10)]",
          "hover:-translate-y-0.5",
          "transition-all duration-200",
          "overflow-hidden",
        )}
      >
        {/* Color accent strip */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
          style={{ background: color }}
        />

        <div className="relative">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${color}15`, border: `1.5px solid ${color}25` }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-[#1A1A1A] truncate group-hover:text-[#111] leading-snug">
                {project.title}
              </h3>
              {project.description && (
                <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                  {project.description}
                </p>
              )}
            </div>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0", statusConfig.className)}>
              {statusConfig.label}
            </span>
          </div>

          {/* Progress + members */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {members.length > 0 && (
                <AvatarStack assignees={members} maxVisible={4} size="sm" />
              )}
              {taskCount > 0 && (
                <span className="text-[10px] text-zinc-400">
                  {completedCount}/{taskCount} tasks
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {project.due_date && (
                <span className="text-[10px] text-zinc-400">
                  Due {format(new Date(project.due_date), "MMM d")}
                </span>
              )}
              {taskCount > 0 && (
                <ProgressRing total={taskCount} done={completedCount} color={color} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
