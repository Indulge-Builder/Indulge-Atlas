"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  IndianRupee,
  Phone,
  Package,
  ChevronDown,
  TrendingUp,
  List,
  UsersRound,
  Search,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AdminCreateTaskModal } from "@/components/tasks/AdminCreateTaskModal";
import { cn } from "@/lib/utils";
import { useClientOnly } from "@/lib/hooks/useClientOnly";

const AgentPerformanceModal = dynamic(
  () =>
    import("@/components/team/AgentPerformanceModal").then((mod) => ({
      default: mod.AgentPerformanceModal,
    })),
  { ssr: false },
);

// ── Tab definitions ─────────────────────────────────────────
const TABS = [
  { id: "team", label: "Team Performance", icon: UsersRound },
  { id: "orders", label: "Ongoing Orders", icon: Package },
  { id: "leads", label: "Shop Leads", icon: List },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Timeframe options ───────────────────────────────────────
const TIMEFRAMES = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "year", label: "This Year" },
] as const;

// ── Mock: Ongoing Orders (procurement tracker) ──────────────
const MOCK_ORDERS = [
  {
    id: "1",
    clientName: "Rahul Mehta",
    product: "Rolex Daytona 116500LN",
    value: 2450000,
    status: "sourcing" as const,
    procurer: "Vikram",
  },
  {
    id: "2",
    clientName: "Priya Shah",
    product: "Coldplay VIP Experience",
    value: 890000,
    status: "in_transit" as const,
    procurer: "Harsh",
  },
  {
    id: "3",
    clientName: "Arjun Kapoor",
    product: "Hermès Birkin 25 Togo",
    value: 3200000,
    status: "sourcing" as const,
    procurer: "Vikram",
  },
  {
    id: "4",
    clientName: "Neha Verma",
    product: "Amanbagh Villa Stay",
    value: 1850000,
    status: "fulfilled" as const,
    procurer: "Harsh",
  },
  {
    id: "5",
    clientName: "Vikram Singh",
    product: "Patek Philippe Nautilus",
    value: 4200000,
    status: "in_transit" as const,
    procurer: "Vikram",
  },
  {
    id: "6",
    clientName: "Ananya Reddy",
    product: "Taylor Swift Eras Tour VIP",
    value: 1250000,
    status: "sourcing" as const,
    procurer: "Katya",
  },
];

// ── Mock: Shop Leads (app scan inquiries) ────────────────────
const MOCK_SHOP_LEADS = [
  {
    id: "1",
    name: "Aditya Nair",
    phone: "+91 98765 43210",
    requestedItem: "Rolex Submariner",
    scannedAt: "2025-03-14",
  },
  {
    id: "2",
    name: "Kavya Iyer",
    phone: "+91 91234 56789",
    requestedItem: "Chanel Classic Flap",
    scannedAt: "2025-03-13",
  },
  {
    id: "3",
    name: "Rohan Desai",
    phone: "+91 99887 66554",
    requestedItem: "Coldplay VIP",
    scannedAt: "2025-03-14",
  },
  {
    id: "4",
    name: "Ishita Patel",
    phone: "+91 98712 34567",
    requestedItem: "Hermès Kelly",
    scannedAt: "2025-03-12",
  },
  {
    id: "5",
    name: "Varun Malhotra",
    phone: "+91 97654 32109",
    requestedItem: "Amanbagh Villa",
    scannedAt: "2025-03-14",
  },
];

// ── Mock: Shop Team Performance ─────────────────────────────
const MOCK_TEAM = [
  {
    id: "vikram",
    name: "Vikram",
    leadsCalled: 312,
    ordersSourced: 48,
    revenue: 12500000,
    avatarColor: "bg-stone-200",
  },
  {
    id: "harsh",
    name: "Harsh",
    leadsCalled: 278,
    ordersSourced: 42,
    revenue: 9800000,
    avatarColor: "bg-stone-200",
  },
  {
    id: "katya",
    name: "Katya",
    leadsCalled: 156,
    ordersSourced: 38,
    revenue: 7200000,
    avatarColor: "bg-stone-200",
  },
  {
    id: "nikita",
    name: "Nikita",
    leadsCalled: 96,
    ordersSourced: 28,
    revenue: 4100000,
    avatarColor: "bg-stone-200",
  },
];

// ── Status badge styles ────────────────────────────────────
const STATUS_STYLES = {
  sourcing: "bg-amber-50 text-amber-700 ring-1 ring-amber-500/10",
  in_transit: "bg-blue-50 text-blue-700 ring-1 ring-blue-500/10",
  fulfilled: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/10",
} as const;

function formatInr(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function ShopOversightClient() {
  const [activeTab, setActiveTab] = useState<TabId>("team");
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(
    TIMEFRAMES[1],
  );
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [shopLeadsSearch, setShopLeadsSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<
    (typeof MOCK_TEAM)[number] | null
  >(null);
  const mounted = useClientOnly();

  const filteredLeads = useMemo(() => {
    if (!shopLeadsSearch.trim()) return MOCK_SHOP_LEADS;
    const q = shopLeadsSearch.toLowerCase();
    return MOCK_SHOP_LEADS.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.requestedItem.toLowerCase().includes(q),
    );
  }, [shopLeadsSearch]);

  const PILLOWY_CARD =
    "bg-white/80 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-[0_8px_30px_rgb(0,0,0,0.02)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]";

  return (
    <div className="min-h-screen bg-stone-50">
      <TopBar
        title="Shop Operations"
        subtitle="E-commerce, concierge procurement & shop sales oversight"
        actions={
          mounted ? (
            <Popover open={timeframeOpen} onOpenChange={setTimeframeOpen}>
              <PopoverTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm",
                    "bg-white/80 backdrop-blur-md ring-1 ring-black/[0.03]",
                    "text-stone-600",
                  )}
                >
                  {timeframe.label}
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-44 rounded-xl border-stone-200/60 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
              >
                <div className="flex flex-col gap-0.5">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.id}
                      onClick={() => {
                        setTimeframe(tf);
                        setTimeframeOpen(false);
                      }}
                      className={cn(
                        "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        timeframe.id === tf.id
                          ? "bg-stone-100 text-stone-900 font-medium"
                          : "text-stone-600 hover:bg-stone-50",
                      )}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <button
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm",
                "bg-white/80 backdrop-blur-md ring-1 ring-black/[0.03]",
                "text-stone-600",
              )}
            >
              {timeframe.label}
              <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
            </button>
          )
        }
      />

      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Phase 2: Apex Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
          {[
            {
              label: "Total Product Revenue",
              value: "₹45.2L",
              icon: IndianRupee,
              iconClass: "text-emerald-500/90",
              bgClass: "bg-emerald-50/80",
              trend: "+12% vs last month",
            },
            {
              label: "Total Shop Leads Called",
              value: "842",
              icon: Phone,
              iconClass: "text-violet-500/90",
              bgClass: "bg-violet-50/80",
              trend: "+8% vs last month",
            },
            {
              label: "Total Orders Fulfilled",
              value: "156",
              icon: Package,
              iconClass: "text-sky-500/90",
              bgClass: "bg-sky-50/80",
              trend: "+15% vs last month",
            },
          ].map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn("rounded-2xl p-5", PILLOWY_CARD)}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    metric.bgClass,
                  )}
                >
                  <metric.icon
                    className={cn("w-5 h-5", metric.iconClass)}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-stone-500 text-xs font-medium uppercase tracking-wider">
                    {metric.label}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-stone-900 text-xl font-semibold tabular-nums tracking-tight">
                      {metric.value}
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-medium">
                      <TrendingUp className="w-3 h-3" strokeWidth={2} />
                      {metric.trend}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Phase 3: Tab Navigation — scrollable on mobile if tabs overflow */}
        <div className="overflow-x-auto hidden-scrollbar whitespace-nowrap -mx-1">
          <div className="flex gap-1 p-1 rounded-2xl bg-stone-200/40 backdrop-blur-md ring-1 ring-stone-300/40 shadow-sm w-fit inline-flex">
          {TABS.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-[#D4AF37]"
                  : "text-stone-600 hover:text-stone-800",
              )}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="shop-tab-indicator"
                  className="absolute inset-0 rounded-xl bg-sidebar-active shadow-[0_2px_8px_rgb(0,0,0,0.15)] ring-1 ring-stone-800/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <tab.icon className="w-4 h-4" strokeWidth={1.5} />
                {tab.label}
              </span>
            </motion.button>
          ))}
          </div>
        </div>

        {/* Phase 4–6: Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "orders" && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={cn("rounded-2xl overflow-hidden", PILLOWY_CARD)}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: "720px" }}>
                  <thead>
                    <tr className="border-b border-stone-200/60 bg-stone-50/50">
                      <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Client Name
                      </th>
                      <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="text-right py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Value (₹)
                      </th>
                      <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Assigned Procurer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_ORDERS.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-stone-100/80 hover:bg-stone-50/50 transition-colors"
                      >
                        <td className="py-3.5 px-5 text-stone-900 font-medium">
                          {order.clientName}
                        </td>
                        <td className="py-3.5 px-5 text-stone-600">
                          {order.product}
                        </td>
                        <td className="py-3.5 px-5 text-right tabular-nums font-semibold text-stone-800">
                          {formatInr(order.value)}
                        </td>
                        <td className="py-3.5 px-5">
                          <span
                            className={cn(
                              "inline-flex px-2.5 py-1 rounded-lg text-xs font-medium capitalize",
                              STATUS_STYLES[order.status],
                            )}
                          >
                            {order.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-stone-600">
                          {order.procurer}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "leads" && (
            <motion.div
              key="leads"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input
                  placeholder="Search by name, phone, or requested item…"
                  value={shopLeadsSearch}
                  onChange={(e) => setShopLeadsSearch(e.target.value)}
                  className="pl-9 bg-white/60 backdrop-blur-md border-stone-200/50 focus-visible:ring-stone-200"
                />
              </div>
              <div className={cn("rounded-2xl overflow-hidden", PILLOWY_CARD)}>
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-sm"
                    style={{ minWidth: "640px" }}
                  >
                    <thead>
                      <tr className="border-b border-stone-200/60 bg-stone-50/50">
                        <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Requested Item
                        </th>
                        <th className="text-left py-3.5 px-5 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Scanned
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center py-16 text-stone-500 text-sm"
                          >
                            No shop leads found.
                          </td>
                        </tr>
                      ) : (
                        filteredLeads.map((lead, i) => (
                          <motion.tr
                            key={lead.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-stone-100/80 hover:bg-stone-50/50 transition-colors"
                          >
                            <td className="py-3.5 px-5 text-stone-900 font-medium">
                              {lead.name}
                            </td>
                            <td className="py-3.5 px-5 text-stone-600 tabular-nums font-semibold">
                              {lead.phone}
                            </td>
                            <td className="py-3.5 px-5 text-stone-600">
                              {lead.requestedItem}
                            </td>
                            <td className="py-3.5 px-5 text-stone-500 text-xs">
                              {lead.scannedAt}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "team" && (
            <motion.div
              key="team"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-lg font-semibold text-stone-800"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Team Performance
                </h2>
                <AdminCreateTaskModal defaultDepartment="shop" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {MOCK_TEAM.map((agent, i) => (
                  <motion.button
                    key={agent.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    onClick={() => setSelectedAgent(agent)}
                    className={cn(
                      "rounded-2xl p-5 text-left",
                      PILLOWY_CARD,
                      "hover:-translate-y-1 hover:shadow-[0_8px_40px_rgb(0,0,0,0.06)] transition-all duration-300 cursor-pointer",
                    )}
                  >
                    <div className="flex gap-4">
                      <Avatar
                        className={cn(
                          "w-14 h-14 rounded-full ring-2 ring-stone-200/50 shrink-0",
                        )}
                      >
                        <AvatarFallback
                          className={cn(
                            "bg-stone-200/80 text-stone-600 text-base font-medium",
                          )}
                        >
                          {getInitials(agent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className="text-stone-900 font-semibold text-sm truncate">
                          {agent.name}
                        </p>
                        <p className="text-stone-500 text-xs mt-0.5">
                          Leads Called: {agent.leadsCalled}
                        </p>
                        <p className="text-stone-500 text-xs mt-0.5">
                          Orders Sourced: {agent.ordersSourced}
                        </p>
                        <p className="text-emerald-600/95 text-sm font-semibold mt-1 tabular-nums tracking-tight">
                          Revenue: {formatInr(agent.revenue)}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AgentPerformanceModal
        agentId={null}
        agentData={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
