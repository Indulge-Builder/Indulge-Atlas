import type { NextConfig } from "next";

// Sentry is installed but not yet configured — disabled until DSN + org are verified.
// To re-enable: import { withSentryConfig } from "@sentry/nextjs" and wrap nextConfig below.

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      /*
       * Academy chat attachments are uploaded through the
       * `uploadAcademyAttachment` server action, so the file travels in the
       * action's request body — and Next's DEFAULT ceiling for that body is
       * 1MB. Any real PDF or photo above 1MB was rejected before the action
       * ever ran, which surfaced as a thrown request rather than a validation
       * error, i.e. "could not be uploaded" with no reason attached.
       *
       * 50MB matches the `academy-attachments` bucket ceiling. Per-kind caps
       * stay tighter and are enforced in the action + composer
       * (lib/academy/attachments.ts): 10MB image / 50MB video / 20MB document.
       *
       * PLATFORM CEILING, WORTH KNOWING: Vercel caps a serverless function's
       * request body at 4.5MB regardless of this setting, so a file above that
       * will still 413 in production even though it uploads fine locally. The
       * fix for genuinely large files is a signed direct-to-storage upload,
       * which is a change to the upload mechanism rather than to this limit.
       */
      bodySizeLimit: "50mb",
    },
  },
  async redirects() {
    return [
      // Scout → Manager (legacy)
      { source: "/scout", destination: "/manager", permanent: true },
      { source: "/scout/dashboard", destination: "/manager/dashboard", permanent: true },
      { source: "/scout/campaigns", destination: "/manager/campaigns", permanent: true },
      { source: "/scout/campaigns/:id", destination: "/manager/campaigns/:id", permanent: true },
      { source: "/scout/planner", destination: "/manager/planner", permanent: true },
      { source: "/scout/roster", destination: "/manager/roster", permanent: true },
      { source: "/scout/team", destination: "/manager/team", permanent: true },
      { source: "/manager/tasks", destination: "/task-insights", permanent: true },
      // Projects → Tasks (Atlas Tasks migration)
      { source: "/projects", destination: "/tasks", permanent: true },
      { source: "/projects/:path*", destination: "/tasks/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
