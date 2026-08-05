import type { ComponentType, CSSProperties } from "react";

export type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

/**
 * Renders an icon component that was resolved at runtime — typically a Lucide
 * icon looked up from a `icon_key` string stored in the database.
 *
 * Binding that lookup to a capitalized local and using it directly as a JSX tag
 * (`const Icon = getIcon(key); … <Icon />`) trips `react-hooks/static-components`:
 * the compiler cannot see through the lookup to prove the tag is a stable
 * component, so it assumes a component is being created on every render. Taking
 * the component as a *prop* states the intent that this is one of a fixed set of
 * existing components being selected, not a new one being defined.
 */
export function DynamicIcon({
  icon: Icon,
  className,
  style,
}: {
  icon: IconComponent | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  if (!Icon) return null;
  return <Icon className={className} style={style} />;
}
