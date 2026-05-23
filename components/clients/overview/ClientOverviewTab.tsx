"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientSummary } from "@/lib/actions/elia";
import {
  getClientFreshdeskMetrics,
  type ClientFreshdeskMetricsData,
} from "@/lib/actions/freshdesk";
import type { ClientDetail } from "@/lib/actions/clients";
import { ClientEliaChat } from "@/components/clients/overview/ClientEliaChat";
import {
  ClientMetricPills,
  type ClientFreshdeskMetricState,
} from "@/components/clients/overview/ClientMetricPills";
import {
  ClientSummaryCard,
  type ClientSummaryPhase,
} from "@/components/clients/overview/ClientSummaryCard";

function metricsToPillState(
  data: ClientFreshdeskMetricsData | undefined,
  loading: boolean,
  error: boolean,
): ClientFreshdeskMetricState {
  if (loading) {
    return {
      loading: true,
      error: false,
      found: false,
      total: 0,
      open: 0,
    };
  }
  if (error || !data) {
    return {
      loading: false,
      error: true,
      found: false,
      total: 0,
      open: 0,
    };
  }
  if (!data.found) {
    return {
      loading: false,
      error: false,
      found: false,
      total: 0,
      open: 0,
    };
  }
  return {
    loading: false,
    error: false,
    found: true,
    total: data.stats.total,
    open: data.stats.open,
  };
}

export interface ClientOverviewTabProps {
  clientId: string;
  detail: ClientDetail;
  isActive: boolean;
}

export function ClientOverviewTab({
  clientId,
  detail,
  isActive,
}: ClientOverviewTabProps) {
  const [summary, setSummary] = useState("");
  const [summaryPhase, setSummaryPhase] =
    useState<ClientSummaryPhase>("idle");
  const summaryGenRef = useRef(0);
  const [freshdesk, setFreshdesk] = useState<ClientFreshdeskMetricState>(() =>
    metricsToPillState(undefined, true, false),
  );
  const freshdeskHydratedRef = useRef(false);

  useEffect(() => {
    summaryGenRef.current += 1;
    setSummary("");
    setSummaryPhase("idle");
  }, [clientId]);

  const handleGenerateSummary = useCallback(async () => {
    const gen = summaryGenRef.current;
    setSummaryPhase("loading");
    setSummary("");
    const text = await getClientSummary(clientId);
    if (gen !== summaryGenRef.current) return;
    const trimmed = text.trim();
    if (trimmed) {
      setSummary(trimmed);
      setSummaryPhase("content");
    } else {
      setSummaryPhase("empty");
    }
  }, [clientId]);

  useEffect(() => {
    freshdeskHydratedRef.current = false;
    setFreshdesk(metricsToPillState(undefined, true, false));
  }, [clientId]);

  useEffect(() => {
    if (!isActive || freshdeskHydratedRef.current) return;
    let cancelled = false;
    void (async () => {
      const res = await getClientFreshdeskMetrics(clientId);
      if (cancelled) return;
      freshdeskHydratedRef.current = true;
      if (!res.success) {
        setFreshdesk(metricsToPillState(undefined, false, true));
        return;
      }
      setFreshdesk(metricsToPillState(res.data, false, false));
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, isActive]);

  const firstName = detail.first_name?.trim() || "Member";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div
        className="flex min-h-[160px] shrink-0 flex-col"
        style={{ flex: "0 0 35%", maxHeight: 280 }}
      >
        <ClientSummaryCard
          clientFirstName={firstName}
          summary={summary}
          phase={summaryPhase}
          onGenerateSummary={handleGenerateSummary}
        />
      </div>

      <ClientMetricPills detail={detail} freshdesk={freshdesk} />

      <div className="min-h-0 flex-1">
        <ClientEliaChat
          clientId={clientId}
          detail={detail}
          isActive={isActive}
        />
      </div>
    </div>
  );
}
