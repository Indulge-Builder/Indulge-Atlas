/**
 * Public origin used in Supabase `redirectTo` (invite, recovery) and absolute redirects.
 *
 * Set `NEXT_PUBLIC_SITE_URL` in every environment (local, staging, production).
 * Legacy: `NEXT_PUBLIC_APP_URL` is accepted as a fallback for existing deploys.
 */
export function getPublicSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Configure it to your app origin (e.g. http://localhost:3000 locally, https://your-domain.com in production) so auth email links use the correct host.",
    );
  }
  return raw.replace(/\/$/, "");
}
