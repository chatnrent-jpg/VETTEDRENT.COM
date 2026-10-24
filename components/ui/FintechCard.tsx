"use client";

import type { CSSProperties, ReactNode } from "react";

export type FintechCardVariant =
  | "default"
  | "hero"
  | "gold"
  | "emerald"
  | "obsidian";

export type FintechBadgeTone = "active" | "warning" | "terminated" | "gold";

export interface FintechCardProps {
  children: ReactNode;
  id?: string;
  className?: string;
  variant?: FintechCardVariant;
  glow?: boolean;
  kicker?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  badgeTone?: FintechBadgeTone;
  headerRight?: ReactNode;
  footer?: ReactNode;
  as?: "article" | "section" | "div";
  style?: CSSProperties;
}

/**
 * Reusable high-end dark-mode fintech glassmorphism container.
 * Combines subtle radial lighting, top-edge specular border glow,
 * backdrop blur, and tabular financial typography.
 */
export function FintechCard({
  children,
  id,
  className = "",
  variant = "default",
  glow = true,
  kicker,
  title,
  subtitle,
  badge,
  badgeTone = "gold",
  headerRight,
  footer,
  as: Tag = "article",
  style,
}: FintechCardProps) {
  const hasHeader = Boolean(kicker || title || subtitle || badge || headerRight);

  const composedClassName = [
    "panel",
    "stay-card",
    "fintech-card",
    `fintech-card--${variant}`,
    glow ? "fintech-card--glow" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag id={id} className={composedClassName} style={style}>
      <div className="fintech-card__specular" aria-hidden="true" />
      {glow ? <div className="fintech-card__ambient" aria-hidden="true" /> : null}

      {hasHeader ? (
        <header className="stay-card-head fintech-card__header">
          <div className="fintech-card__heading">
            {kicker ? <p className="pass-kicker fintech-kicker">{kicker}</p> : null}
            {title ? <h2 className="fintech-card__title">{title}</h2> : null}
            {subtitle ? <p className="lede fintech-card__subtitle">{subtitle}</p> : null}
          </div>

          {headerRight ? (
            <div className="fintech-card__header-right">{headerRight}</div>
          ) : badge ? (
            <span
              className={
                badgeTone === "gold"
                  ? "chip fintech-chip"
                  : "stay-badge fintech-badge"
              }
              data-status={badgeTone === "gold" ? undefined : badgeTone}
            >
              {badge}
            </span>
          ) : null}
        </header>
      ) : null}

      <div className="fintech-card__body">{children}</div>

      {footer ? <footer className="fintech-card__footer">{footer}</footer> : null}
    </Tag>
  );
}

export function FintechMetricTile({
  label,
  value,
  subvalue,
  tone = "default",
  badge,
}: {
  label: ReactNode;
  value: ReactNode;
  subvalue?: ReactNode;
  tone?: "default" | "gold" | "emerald" | "muted";
  badge?: ReactNode;
}) {
  return (
    <div className={`fintech-metric-tile fintech-metric-tile--${tone}`}>
      <div className="fintech-metric-tile__top">
        <span className="fintech-metric-tile__label">{label}</span>
        {badge ? <span className="fintech-metric-tile__badge">{badge}</span> : null}
      </div>
      <strong className="fintech-metric-tile__value">{value}</strong>
      {subvalue ? <span className="fintech-metric-tile__sub">{subvalue}</span> : null}
    </div>
  );
}
