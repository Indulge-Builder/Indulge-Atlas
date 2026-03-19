"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { Lead } from "@/lib/types/database";

interface ConversionsFeedProps {
  wonLeads: Lead[];
}

function DealValue({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="text-xs font-semibold text-brand-gold-dark shrink-0 tabular-nums">
      ₹{value.toLocaleString("en-IN")}
    </span>
  );
}

export function ConversionHistory({ wonLeads }: ConversionsFeedProps) {
  return (
    <Card className="relative overflow-hidden flex flex-col">
      {/* Ambient gold gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-brand-gold/5 via-transparent to-transparent pointer-events-none" />

      <CardHeader className="relative pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg">Conversions</CardTitle>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Latest closed deals — newest first
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-gold/15 rounded-full border border-brand-gold/20">
            <Trophy className="w-3.5 h-3.5 text-brand-gold" />
            <span className="text-sm font-bold text-brand-gold-dark">
              {wonLeads.length}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative pt-0 flex-1 min-h-0">
        {wonLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center mb-3">
              <Star className="w-5 h-5 text-brand-gold/60" />
            </div>
            <p className="text-sm text-muted-olive">Your first win awaits.</p>
            <p className="text-xs text-taupe mt-1">
              Closed deals will appear here.
            </p>
          </div>
        ) : (
          /*
           * Infinite scroll container.
           * max-h-[600px] caps the height; overflow-y-auto enables scrolling.
           * globals.css provides the ultra-thin webkit scrollbar styling globally.
           * scrollbarWidth + scrollbarColor cover Firefox.
           */
          <div
            className="max-h-[600px] overflow-y-auto space-y-0.5 pr-0.5"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#D0C8BE transparent",
            }}
          >
            {wonLeads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: Math.min(i, 8) * 0.03,
                  duration: 0.35,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Link href={`/leads/${lead.id}`}>
                  <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 hover:bg-brand-gold/8 hover:ring-brand-gold/20 hover:ring-inset">
                    {/* Trophy avatar */}
                    <div className="w-7 h-7 rounded-full bg-success-light flex items-center justify-center shrink-0">
                      <Trophy className="w-3.5 h-3.5 text-success" />
                    </div>

                    {/* Client name + time ago */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-hover truncate">
                        {lead.first_name}
                        {lead.last_name ? ` ${lead.last_name}` : ""}
                      </p>
                      <p className="text-[10px] text-taupe">
                        Closed{" "}
                        {formatDistanceToNow(new Date(lead.updated_at), {
                          addSuffix: true,
                        })}
                        {lead.city ? ` · ${lead.city}` : ""}
                      </p>
                    </div>

                    {/* Deal value in gold */}
                    <DealValue value={lead.deal_value} />
                  </div>
                </Link>
              </motion.div>
            ))}

            {/* Scroll end breath room */}
            <div className="h-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
