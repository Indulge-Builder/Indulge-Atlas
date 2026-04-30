import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "indulge",

  project: "indulge-atlas",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
