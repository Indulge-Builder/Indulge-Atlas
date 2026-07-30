"use client";

/**
 * Keeps a failed panel from becoming a locked screen.
 *
 * A Radix Sheet renders its overlay and its content as siblings in a portal. If
 * the content subtree throws during render, React unmounts that subtree — but
 * the overlay is already committed and stays. The result is a dimmed, blurred
 * page with no visible panel and nothing obvious to dismiss: the app looks
 * broken rather than reporting a broken panel.
 *
 * Wrapping each panel body means a throw shows a readable message *inside* the
 * sheet, with the sheet's own close button still reachable. The user is never
 * stranded, and the error reaches the console instead of vanishing.
 *
 * A class component because React error boundaries have no hook equivalent.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Names the panel in the fallback copy, e.g. "ticket". */
  label: string;
}

interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[academy] ${this.props.label} panel failed to render:`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-danger">
            This {this.props.label} panel could not be displayed
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-danger/85">
            Close this panel and carry on — your conversation is unaffected. The
            details are in the browser console.
          </p>
          <p className="mt-2 break-words font-mono text-[11px] text-danger/70">
            {error.message}
          </p>
        </div>
      </div>
    );
  }
}
