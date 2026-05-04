"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PhoneCall, ArrowRight, Clock, MapPin } from "lucide-react";
import { formatLeadSource } from "@/lib/utils/lead-source-mapper";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import type { Lead } from "@/lib/types/database";

interface UnattainedLeadsQueueProps {
  leads: Lead[];
}

export function UnattainedLeadsQueue({ leads }: UnattainedLeadsQueueProps) {
  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="font-serif text-lg">Unattained Leads</CardTitle>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Fresh leads awaiting your first contact
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#E8F0FA] text-[#2C6FAC] text-xs font-bold">
            {leads.length}
          </span>
          <Link href="/leads?status=NEW">
            <Button variant="ghost" size="sm" className="text-[#B5A99A] text-xs gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-[#EBF4EF] flex items-center justify-center mb-3">
              <PhoneCall className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <p className="text-sm font-medium text-[#4A7C59]">All clear!</p>
            <p className="text-xs text-[#B5A99A] mt-1">
              No new leads pending contact.
            </p>
          </div>
        ) : (
          <div
            className="space-y-2 max-h-[400px] overflow-y-auto pr-1"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(181,169,154,0.35) transparent",
            }}
          >
            {leads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 5) * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link href={`/leads/${lead.id}`}>
                  <div className="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 hover:bg-[#F2F2EE] hover:ring-[#E5E4DF]/60 hover:ring-inset">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#E8F0FA] flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-[#2C6FAC]">
                          {lead.first_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">
                          {lead.first_name} {lead.last_name ?? ""}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {lead.is_off_duty ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#E8E6E3] text-[#8A8A6E] font-medium">
                              🌙 Overnight
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3D0] text-[#C5830A] font-medium shadow-[0_0_8px_rgba(197,131,10,0.25)]">
                              🔥 LIVE
                            </span>
                          )}
                          {lead.city && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[#B5A99A]">
                              <MapPin className="w-2.5 h-2.5" />
                              {lead.city}
                            </span>
                          )}
                          {(lead.utm_source || lead.utm_campaign) && (
                            <span className="text-[10px] text-[#B5A99A]">
                              · {formatLeadSource(lead.utm_source, lead.utm_medium).channel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="flex items-center gap-0.5 text-[10px] text-[#B5A99A]">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(lead.created_at)}
                      </span>
                      <LeadStatusBadge status={lead.status} size="sm" />
                      <ArrowRight className="w-3.5 h-3.5 text-[#D0C8BE] group-hover:text-[#B5A99A] transition-colors" />
                    </div>
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
