import type { NextConfig } from "next";

// Sentry is installed but not yet configured — disabled until DSN + org are verified.
// To re-enable: import { withSentryConfig } from "@sentry/nextjs" and wrap nextConfig below.

const nextConfig: NextConfig = {
  // NOTE: do NOT relocate `distDir` outside the project directory to dodge the
  // OneDrive `EPERM ... unlink .next\...` lock. Node resolves modules by walking
  // UP from the emitted file, so a build dir outside the repo cannot see
  // node_modules and every render dies with `Cannot find module
  // 'react/jsx-runtime'`. Fix OneDrive instead (exclude the folder from sync),
  // or kill stale node processes and delete `.next` before starting dev.
  turbopack: {
    root: process.cwd(),
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
