// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://21bcc878e1d4ab5e62c17c15ece47c95@o4511191483285504.ingest.de.sentry.io/4511191491346512",

  // 5% sampling is sufficient for production error visibility without excessive cost.
  // 100% sampling (the default) is prohibitively expensive at scale.
  tracesSampleRate: 0.05,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII includes request headers, cookies, and IP addresses — inappropriate to
  // forward for a CRM that handles high-net-worth client data.
  sendDefaultPii: false,
});
