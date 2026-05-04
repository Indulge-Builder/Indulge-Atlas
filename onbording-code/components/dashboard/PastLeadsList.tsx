"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { History, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import type { Lead } from "@/lib/types/database";

interface PastLeadsListProps {
  leads: Lead[];
}

export function PastLeadsList({ leads }: PastLeadsListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="font-serif text-lg">Recent Activity</CardTitle>
          <p className="text-xs text-[#6B6B6B] mt-0.5">Your recent lead interactions</p>
        </div>
        <Link href="/leads">
          <Button variant="ghost" size="sm" className="text-[#B5A99A] text-xs gap-1">
            All leads <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#F2F2EE] flex items-center justify-center mb-2">
              <History className="w-4 h-4 text-[#B5A99A]" />
            </div>
            <p className="text-sm text-[#B5A99A]">No past activity yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {leads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link href={`/leads/${lead.id}`}>
                  <div className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F2F2EE] transition-colors cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-[#F2F2EE] flex items-center justify-center shrink-0 text-xs font-semibold text-[#8A8A6E] group-hover:bg-[#E5E4DF]">
                      {lead.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1A1A1A] font-medium truncate">
                        {lead.first_name} {lead.last_name ?? ""}
                      </p>
                      <p className="text-[10px] text-[#B5A99A]">
                        {formatRelativeTime(lead.updated_at)}
                      </p>
                    </div>
                    <LeadStatusBadge status={lead.status} size="sm" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
