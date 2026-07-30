package global.indulge.academy;

import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Confines the shell to Academy.
 *
 * Academy shares a domain with the full Atlas dashboard, and Capacitor's
 * `allowNavigation` matches on HOST only — it cannot express "this path but not
 * that one". Without this, a deep link or a redirect to /leads or /clients would
 * load the whole CRM inside the Academy app, wearing Academy's icon and holding
 * its session.
 *
 * Any main-frame navigation outside the Academy surface is swallowed, so the app
 * simply stays where it is.
 *
 * NOTE: this only catches full page loads. Next.js client-side navigation never
 * reaches a WebViewClient, so the app ALSO hides its own cross-app links when it
 * detects the shell (via the `academy-shell` user-agent token — see
 * capacitor.config.ts and AcademyNav). Both halves are needed; neither is
 * sufficient alone.
 *
 * If this ever fails to compile, reverting to the Capacitor default restores a
 * working build:  public class MainActivity extends BridgeActivity {}
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();

        bridge
            .getWebView()
            .setWebViewClient(
                new BridgeWebViewClient(bridge) {

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        if (isAllowed(request)) {
                            return super.shouldOverrideUrlLoading(view, request);
                        }
                        // true = "we handled it"; we deliberately do nothing,
                        // which leaves the user on the current Academy page.
                        return true;
                    }
                }
            );
    }

    /** Academy's own surface, plus the framework and auth traffic it needs. */
    private boolean isAllowed(WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return false;

        String host = request.getUrl().getHost();
        String path = request.getUrl().getPath();

        // Supabase serves auth redirects and signed storage URLs off-domain.
        if (host != null && host.endsWith(".supabase.co")) return true;

        if (path == null) return false;

        // "/" is the Atlas dashboard — the one route the in-app nav used to link
        // to, and the reason this guard exists.
        if (path.equals("/")) return false;

        return (
            path.startsWith("/academy") ||
            path.startsWith("/_next") ||
            path.startsWith("/api/academy") ||
            path.startsWith("/auth/") ||
            // Reachable from the Academy login screen.
            path.startsWith("/forgot-password") ||
            path.startsWith("/update-password")
        );
    }
}
