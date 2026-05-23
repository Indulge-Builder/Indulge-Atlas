"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const DEFAULT_INDICATOR_LAYOUT_ID = "atlas-tab-indicator";

type TabsContextValue = {
  value: string;
  layoutId: string;
  animatedContent: boolean;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error("Tabs compound components must be used within <Tabs>");
  }
  return ctx;
}

interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Unique layoutId when multiple tab groups share one viewport (Framer shared layout). */
  indicatorLayoutId?: string;
  /** Fade/slide panel transitions (default true). */
  animatedContent?: boolean;
}

function Tabs({
  indicatorLayoutId,
  animatedContent = true,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? "",
  );

  const activeValue = value ?? uncontrolledValue;

  const handleValueChange = React.useCallback(
    (next: string) => {
      setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider
      value={{
        value: activeValue,
        layoutId: indicatorLayoutId ?? DEFAULT_INDICATOR_LAYOUT_ID,
        animatedContent,
      }}
    >
      <TabsPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto w-fit min-w-0 flex-wrap items-center gap-1 rounded-2xl bg-stone-200/40 p-1 shadow-sm ring-1 ring-stone-300/40 backdrop-blur-md",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const { value: activeValue, layoutId } = useTabsContext();
  const isActive = value === activeValue;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "text-stone-600 hover:text-stone-800 data-[state=active]:text-[#D4AF37]",
        className,
      )}
      {...props}
    >
      {isActive && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-xl bg-sidebar-active shadow-[0_2px_8px_rgb(0,0,0,0.15)] ring-1 ring-stone-800/30"
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          aria-hidden
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
  animated?: boolean;
}

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, children, value, animated, ...props }, ref) => {
  const { value: activeValue, animatedContent } = useTabsContext();
  const isActive = value === activeValue;
  const shouldAnimate = animated ?? animatedContent;

  if (!shouldAnimate) {
    return (
      <TabsPrimitive.Content
        ref={ref}
        value={value}
        className={cn(
          "mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
          className,
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.Content>
    );
  }

  return (
    <TabsPrimitive.Content
      ref={ref}
      value={value}
      forceMount
      className={cn("mt-6 focus-visible:outline-none", !isActive && "hidden", className)}
      {...props}
    >
      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div
            key={value}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </TabsPrimitive.Content>
  );
});
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
