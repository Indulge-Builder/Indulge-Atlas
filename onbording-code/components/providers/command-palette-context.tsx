"use client";

import { createContext, useContext } from "react";

export type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  openPalette: () => void;
  closePalette: () => void;
};

export const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  }
  return ctx;
}
