/**
 * Maps Supabase Auth (and related) messages to user-safe copy.
 * Never surface raw provider errors in URLs.
 */
export function mapAuthError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again or contact support.";

  const m = message.trim();
  const lower = m.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "The email or password you entered is incorrect.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please check your email and click the confirmation link before signing in.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already exists")
  ) {
    return "An account with this email address already exists.";
  }
  if (
    lower.includes("password should be at least") ||
    lower.includes("password is known to be too weak") ||
    lower.includes("at least 6 characters")
  ) {
    return "Your password must be at least 8 characters long.";
  }
  if (
    lower.includes("token has expired") ||
    lower.includes("expired or is invalid") ||
    lower.includes("invalid token") ||
    lower.includes("otp expired")
  ) {
    return "This link has expired. Please request a new one.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("email rate limit") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("over_request_rate_limit")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch")) {
    return "Unable to connect. Please check your connection and try again.";
  }
  if (lower.includes("next_public_site_url") || lower.includes("not set")) {
    return "This server is missing URL configuration. Please contact support.";
  }

  // Preserve explicit admin / validation copy from our Server Actions (not Supabase).
  if (
    lower.includes("founder role cannot") ||
    lower.includes("user auth created but profile") ||
    lower.includes("profile update failed") ||
    lower.includes("contact support with user id") ||
    lower.includes("unauthorized:") ||
    lower.includes("unauthenticated")
  ) {
    return m;
  }

  return "Something went wrong. Please try again or contact support.";
}

/** Query param values from auth redirects — map to friendly copy without echoing raw errors. */
export function mapAuthQueryError(code: string | null): string | null {
  if (!code) return null;
  if (code === "auth_callback_failed" || code === "Invalid_Link") {
    return "This link is invalid or has expired. Please sign in again or request a new link.";
  }
  return mapAuthError(code.replace(/_/g, " "));
}
