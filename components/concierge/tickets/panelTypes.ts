// Shared prop contracts for concierge ticket UI. Both the page RSCs / container and
// the individual client panels import from here so their interfaces never drift.
import type {
  TicketDetail,
  TicketListItem,
  ConciergeGroup,
  Vendor,
  ConciergeTicketChecklistItem,
  TicketInvoice,
  ConciergeTicketAttachment,
  ConciergeTicketStatus,
} from "@/lib/types/database";

export interface AgentOption {
  id: string;
  full_name: string;
  /** All concierge groups the agent belongs to (concierge_agent_groups). Empty if untagged. */
  groups: ConciergeGroup[];
}
export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}
export interface ClientOption {
  id: string;
  name: string;
  group: ConciergeGroup | null;
  phone?: string | null;
}
export interface CannedOption {
  id: string;
  name: string;
  shortcut: string | null;
}

export interface TicketsIndexProps {
  initialTickets: TicketListItem[];
  scope: "mine" | "queue";
  /** Can see the whole Queendom queue (admin/finance/watcher/concierge-manager). */
  canViewQueue: boolean;
  /** Can create/assign tickets — shows New/Reports/SLA actions (admin/concierge-manager). */
  canManageQueue: boolean;
  isAdmin: boolean;
  categories: CategoryOption[];
  agents: AgentOption[];
}

export interface NewTicketFormProps {
  /** First page of clients for the requester search's empty-query state. */
  initialClients: ClientOption[];
  categories: CategoryOption[];
  agents: AgentOption[];
  defaultGroup: ConciergeGroup | null;
  canPickGroup: boolean;
  /** Groups the caller may file under: all 11 for admins, the caller's own groups otherwise. */
  groupOptions: readonly ConciergeGroup[];
}

export interface ClientRequesterSearchProps {
  value: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
  /** Shown when the query is empty (recent/first page). */
  initial: ClientOption[];
  error?: string;
}

export interface TicketTagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Optional clickable preset chips (UI-only helpers). */
  presets?: string[];
}

export interface StatusControlProps {
  ticketId: string;
  status: ConciergeTicketStatus;
  statusChangedAt: string;
  isOverdue: boolean;
  primaryVendorId: string | null;
  canEdit: boolean;
  isAdmin: boolean;
  onRequireVendorFeedback: (vendorId: string) => void;
}

export interface TicketComposerProps {
  ticketId: string;
  canned: CannedOption[];
  canEdit: boolean;
}

export interface ChecklistPanelProps {
  items: ConciergeTicketChecklistItem[];
  canEdit: boolean;
}

export interface BillablePanelProps {
  ticketId: string;
  isBillable: boolean | null;
  invoiceNumber: string | null;
  invoice: TicketInvoice | null;
  attachments: ConciergeTicketAttachment[];
  vendors: Vendor[];
  canEdit: boolean;
}

export interface InvoiceModalProps {
  ticketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: TicketInvoice | null;
  attachments: ConciergeTicketAttachment[];
  vendors: Vendor[];
}

export interface VendorFeedbackModalProps {
  ticketId: string;
  vendorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface TransferModalProps {
  ticketId: string;
  agents: AgentOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface TicketDetailViewProps {
  detail: TicketDetail;
  canEdit: boolean;
  isAdmin: boolean;
  agents: AgentOption[];
  vendors: Vendor[];
  canned: CannedOption[];
}
