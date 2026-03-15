"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { TermTooltip } from "./TermTooltip";
import {
  AgentProfileSummaryModal,
  type Employee,
} from "./AgentProfileSummaryModal";

// ── Types ────────────────────────────────────────────────────────────────

type OrgPerson = {
  name: string;
  role?: string;
  isLead: boolean;
};

type DepartmentMember = OrgPerson & {
  subMembers?: string[];
};

type Department = {
  name: string;
  lead: OrgPerson;
  members: DepartmentMember[];
  /** When set (e.g. Concierge), renders two queen nodes instead of single lead */
  queens?: OrgPerson[];
};

const ORG_NODE_BASE =
  "relative rounded-2xl px-4 py-2.5 min-w-[120px] text-center bg-sidebar-active backdrop-blur-2xl ring-1 ring-stone-800/30 shadow-[0_4px_20px_rgb(0,0,0,0.15)] transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:ring-stone-200";

// ── OrgNode Component (Interactive) ────────────────────────────────────────

function OrgNode({
  employee,
  variants,
  onClick,
}: {
  employee: Employee;
  variants?: Variants;
  onClick: () => void;
}) {
  const { name, role, isLead } = employee;
  return (
    <motion.button
      type="button"
      variants={variants}
      onClick={onClick}
      className={`${ORG_NODE_BASE} ${isLead ? "ring-2 ring-[#D4AF37]/30" : ""}`}
    >
      <p
        className={
          isLead ? "text-[#D4AF37] font-medium" : "text-[#D4AF37]/90 text-sm"
        }
      >
        {name}
      </p>
      {role && (
        <p className="text-xs text-amber-200/90 mt-0.5">
          {role === "Queen" ? (
            <TermTooltip term="kingdom">Queen</TermTooltip>
          ) : role === "Jokers Lead" ? (
            <>
              <TermTooltip term="joker">Jokers</TermTooltip> Lead
            </>
          ) : (
            role
          )}
        </p>
      )}
    </motion.button>
  );
}

// ── Hierarchical Data Structure ───────────────────────────────────────────

const FOUNDERS: Employee[] = [
  { id: "karan", name: "Karan", role: "Founder", isLead: true },
  { id: "advita", name: "Advita", role: "Founder", isLead: true },
];

const POC: Employee = {
  id: "syndia",
  name: "Syndia",
  role: "POC",
  isLead: true,
};

const DEPARTMENTS: Department[] = [
  {
    name: "Tech",
    lead: { name: "Mallika", isLead: true },
    members: [
      { name: "Ethan", isLead: false },
      { name: "Charan", isLead: false },
      { name: "Arfam", isLead: false },
    ],
  },
  {
    name: "Finance",
    lead: { name: "Murtuza", isLead: true },
    members: [
      { name: "Vishal", isLead: false },
      { name: "Riya", isLead: false },
    ],
  },
  {
    name: "Performance Marketing",
    lead: { name: "Andreas", isLead: true },
    members: [],
  },
  {
    name: "Onboarding",
    lead: { name: "Samson", isLead: true },
    members: [
      { name: "Amit", isLead: false },
      { name: "Meghana", isLead: false },
      { name: "Kaniisha", isLead: false },
    ],
  },
  {
    name: "Shop",
    lead: { name: "Katya", isLead: true },
    members: [
      { name: "Harsh", isLead: false },
      { name: "Vikram", isLead: false },
      { name: "Nikita", isLead: false },
    ],
  },
  {
    name: "Concierge",
    lead: { name: "Ananyashree & Anishqa", role: "Queendoms", isLead: true },
    queens: [
      { name: "Ananyashree", role: "Queen", isLead: true },
      { name: "Anishqa", role: "Queen", isLead: true },
    ],
    members: [
      {
        name: "Shruti ",
        role: "Jokers Lead",
        isLead: true,
        subMembers: ["Lillian", "Anil"],
      },
    ],
  },
  {
    name: "Marketing",
    lead: { name: "Smruti", isLead: true },
    members: [
      { name: "Manaswini", isLead: false },
      { name: "Prajith", isLead: false },
      { name: "Pixel", isLead: false },
      { name: "Danish", isLead: false },
    ],
  },
  {
    name: "Legacy",
    lead: { name: "Manaswini", isLead: true },
    members: [],
  },
  {
    name: "House",
    lead: { name: "Viplav", isLead: true },
    members: [],
  },
];

// Display role mapping: agent, scout, lead, CTO, CFO, Queen, etc.
function getDisplayRole(p: OrgPerson, department?: string): string {
  if (p.role === "Queen" || p.role === "Queendoms") return "Queen";
  if (p.role === "Jokers Lead") return "Scout";
  if (p.role === "Founder") return "Founder";
  if (p.role === "POC") return "POC";

  if (department) {
    if (p.isLead) {
      if (department === "Tech") return "CTO";
      if (department === "Finance") return "CFO";
      return "Lead";
    }
    if (department === "Marketing" || department === "Performance Marketing")
      return "Scout";
    return "Agent";
  }
  return "Agent";
}

// Helper: convert OrgPerson + department to Employee
function toEmployee(p: OrgPerson, department?: string, id?: string): Employee {
  const slug = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and");
  const baseId =
    id ?? (department ? `${slug(department)}-${slug(p.name)}` : slug(p.name));
  return {
    id: baseId,
    name: p.name,
    role: getDisplayRole(p, department),
    department,
    isLead: p.isLead,
  };
}

// ── Animation Variants ───────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0 },
};

const departmentVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// ── OrgChart Component ──────────────────────────────────────────────────

export function OrgChart() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col items-center"
      >
        {/* Tier 1: The Apex — Founders (split into two nodes) */}
        <motion.div
          variants={itemVariants}
          className="relative flex flex-col items-center"
        >
          <div className="relative flex flex-row justify-center gap-8 items-center">
            {FOUNDERS.map((founder) => (
              <OrgNode
                key={founder.id}
                employee={founder}
                variants={itemVariants}
                onClick={() => setSelectedEmployee(founder)}
              />
            ))}
            {/* Horizontal bracket between Karan and Advita */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-px border-t-2 border-dashed border-stone-800 pointer-events-none"
              aria-hidden
            />
          </div>
          {/* Vertical line down from center of founders container to Sindhya */}
          <div
            className="w-0 h-20 border-l-2 border-dashed border-stone-800 self-center"
            aria-hidden
          />
        </motion.div>

        {/* Tier 2: The Gateway — POC Sindhya */}
        <motion.div variants={itemVariants} className="relative mt-0">
          <OrgNode
            employee={POC}
            variants={itemVariants}
            onClick={() => setSelectedEmployee(POC)}
          />
          {/* Vertical line down from Sindhya to branch */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-16 border-l-2 border-dashed border-stone-800"
            aria-hidden
          />
        </motion.div>

        {/* Tier 3 & 4: Departments — horizontal scroll with branch connector */}
        <div className="w-full mt-0 overflow-x-auto scrollbar-hide pb-6 -mx-2 px-2">
          <div className="flex flex-col items-center min-w-max">
            {/* Vertical stem from Sindhya down to horizontal branch */}
            <div
              className="w-0 h-12 border-l-2 border-dashed border-stone-800 self-center"
              aria-hidden
            />
            {/* Horizontal branch line — soft dashed */}
            <div
              className="w-full h-px border-t-2 border-dashed border-stone-800"
              aria-hidden
            />
            {/* Department columns — each with vertical connector from branch */}
            <div className="flex gap-10 mt-0">
              {DEPARTMENTS.map((dept) => (
                <motion.div
                  key={dept.name}
                  variants={departmentVariants}
                  className="flex flex-col items-center shrink-0"
                >
                  {/* Vertical connector from horizontal branch to department lead */}
                  <div
                    className="w-0 h-5 border-l-2 border-dashed border-stone-800 shrink-0"
                    aria-hidden
                  />
                  {/* Department label */}
                  <p className="text-xs text-stone-700 font-medium uppercase tracking-wider mb-2">
                    {dept.name}
                  </p>
                  {/* Lead node(s) — single lead or two queens for Concierge */}
                  <div className="relative flex flex-col items-center">
                    {dept.queens ? (
                      <>
                        <div className="relative flex flex-row justify-center gap-6 items-center">
                          {dept.queens.map((q) => {
                            const emp = toEmployee(q, dept.name);
                            return (
                              <OrgNode
                                key={emp.id}
                                employee={emp}
                                variants={departmentVariants}
                                onClick={() => setSelectedEmployee(emp)}
                              />
                            );
                          })}
                          <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-px border-t-2 border-dashed border-stone-800 pointer-events-none"
                            aria-hidden
                          />
                        </div>
                        {dept.members.length > 0 && (
                          <div
                            className="w-0 h-3 border-l-2 border-dashed border-stone-800 self-center"
                            aria-hidden
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <OrgNode
                          employee={toEmployee(dept.lead, dept.name)}
                          variants={departmentVariants}
                          onClick={() =>
                            setSelectedEmployee(
                              toEmployee(dept.lead, dept.name),
                            )
                          }
                        />
                        {dept.members.length > 0 && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-3 border-l-2 border-dashed border-stone-800"
                            aria-hidden
                          />
                        )}
                      </>
                    )}
                  </div>
                  {/* Members — vertical stack with connectors */}
                  {dept.members.length > 0 && (
                    <div className="flex flex-col items-center mt-2 gap-2">
                      {dept.members.map((member, j) => (
                        <div key={j} className="flex flex-col items-center">
                          <div
                            className="w-0 h-2 border-l-2 border-dashed border-stone-800"
                            aria-hidden
                          />
                          <OrgNode
                            employee={toEmployee(member, dept.name)}
                            variants={departmentVariants}
                            onClick={() =>
                              setSelectedEmployee(toEmployee(member, dept.name))
                            }
                          />
                          {/* Sub-members (Concierge: Shruti -> Lillian, Anil) */}
                          {member.subMembers &&
                            member.subMembers.length > 0 && (
                              <div className="flex flex-col items-center mt-2 gap-2">
                                <div
                                  className="w-0 h-2 border-l-2 border-dashed border-stone-800"
                                  aria-hidden
                                />
                                <div className="flex gap-2">
                                  {member.subMembers.map((sub, k) => (
                                    <div
                                      key={k}
                                      className="flex flex-col items-center"
                                    >
                                      <div
                                        className="w-0 h-2 border-l-2 border-dashed border-stone-800"
                                        aria-hidden
                                      />
                                      <OrgNode
                                        employee={toEmployee(
                                          { name: sub, isLead: false },
                                          dept.name,
                                          `${dept.name.toLowerCase().replace(/\s+/g, "-")}-${sub.toLowerCase()}-${k}`,
                                        )}
                                        variants={departmentVariants}
                                        onClick={() =>
                                          setSelectedEmployee(
                                            toEmployee(
                                              { name: sub, isLead: false },
                                              dept.name,
                                              `${dept.name.toLowerCase().replace(/\s+/g, "-")}-${sub.toLowerCase()}-${k}`,
                                            ),
                                          )
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <AgentProfileSummaryModal
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />
    </>
  );
}
