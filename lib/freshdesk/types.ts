export interface FreshdeskContact {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  custom_fields: {
    category: string | null;
    birthday: string | null;
    marital_status: string | null;
    anniversary: string | null;
    sport: string | null;
    favourite_brand: string | null;
    watch: string | null;
    stays: string | null;
    flight_seat: string | null;
    veg_non_veg: string | null;
    allergies: string | null;
    diet: string | null;
    drink: string | null;
    food: string | null;
    restaurant: string | null;
    cuisine: string | null;
    country: string | null;
    car: string | null;
    blood_group: string | null;
    need_assistance_with: string | null;
    company_and_designation: string | null;
    instagram: string | null;
    linkedin: string | null;
    periskope_chat_id: string | null;
    [key: string]: string | null;
  };
}

export interface FreshdeskTicket {
  id: number;
  subject: string;
  description: string | null;
  description_text: string | null;
  status: number;
  priority: number;
  type: string | null;
  source: number;
  created_at: string;
  updated_at: string;
  due_by: string | null;
  fr_due_by: string | null;
  is_escalated: boolean;
  requester_id: number;
  responder_id: number | null;
  group_id: number | null;
  tags: string[];
  stats: {
    agent_responded_at: string | null;
    requester_responded_at: string | null;
    first_responded_at: string | null;
    resolved_at: string | null;
    closed_at: string | null;
  } | null;
  custom_fields: {
    cf_client_name?: string | null;
    cf_queendom?: string | null;
    cf_pax?: string | null;
    cf_date?: string | null;
    cf_from_location?: string | null;
    cf_to_location?: string | null;
    cf_budget?: string | null;
    cf_request?: string | null;
    cf_product_details?: string | null;
    cf_events?: string | null;
    cf_note?: string | null;
    cf_poc?: string | null;
    cf_time?: string | null;
    cf_duration?: string | null;
    cf_luggage?: string | null;
    cf_airport?: string | null;
    cf_early_check_in?: string | null;
    cf_assistance_required?: string | null;
    cf_ticket_type?: string | null;
    cf_periskope_message_id?: string | null;
    cf_periskope_assignee?: string | null;
    cf_gift_specifications?: string | null;
    cf_location?: string | null;
    [key: string]: string | null | undefined;
  };
  requester?: FreshdeskContact;
}

export type TicketStatus =
  | "open"
  | "pending"
  | "resolved"
  | "closed"
  | "waiting";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export function mapStatus(status: number): TicketStatus {
  const map: Record<number, TicketStatus> = {
    2: "open",
    3: "pending",
    4: "resolved",
    5: "closed",
    6: "waiting",
  };
  return map[status] ?? "open";
}

export function mapPriority(priority: number): TicketPriority {
  const map: Record<number, TicketPriority> = {
    1: "low",
    2: "medium",
    3: "high",
    4: "urgent",
  };
  return map[priority] ?? "medium";
}

export interface ClientFreshdeskTicketStats {
  total: number;
  open: number;
  resolved: number;
  last_ticket_date: string | null;
}

export type ClientFreshdeskTicketsData =
  | {
      found: false;
      tickets: [];
    }
  | {
      found: true;
      contact: FreshdeskContact;
      tickets: FreshdeskTicket[];
      stats: ClientFreshdeskTicketStats;
    };
