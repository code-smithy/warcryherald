import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Tone = "neutral" | "ember" | "order" | "shadow" | "verdant" | "steel";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function HeraldPanel({
  children,
  className,
  tone = "neutral",
  ...props
}: ComponentPropsWithoutRef<"section"> & { tone?: Tone }) {
  return (
    <section
      className={joinClassNames("panel", "herald-panel", `tone-${tone}`, className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function ParchmentCard({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"article">) {
  return (
    <article className={joinClassNames("parchment-card", className)} {...props}>
      {children}
    </article>
  );
}

export function SectionBanner({
  eyebrow,
  title,
  children,
  action,
  className
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClassNames("section-banner", className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
      {action ? <div className="section-banner__action">{action}</div> : null}
    </div>
  );
}

export function WaxSealBadge({
  children,
  className,
  tone = "ember",
  ...props
}: ComponentPropsWithoutRef<"span"> & { tone?: Tone }) {
  return (
    <span
      className={joinClassNames("status-pill", "wax-seal-badge", `tone-${tone}`, className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatBlock({
  stats,
  className,
  compact = false
}: {
  stats: Array<{ label: string; value: ReactNode; note?: ReactNode }>;
  className?: string;
  compact?: boolean;
}) {
  return (
    <dl className={joinClassNames(compact ? "mini-stat-grid" : "stat-grid", "stat-block", className)}>
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
          {stat.note ? <small>{stat.note}</small> : null}
        </div>
      ))}
    </dl>
  );
}

export function RunemarkBadge({
  children,
  className,
  tone = "neutral",
  ...props
}: ComponentPropsWithoutRef<"span"> & { tone?: Tone }) {
  return (
    <span className={joinClassNames("runemark-badge", `tone-${tone}`, className)} {...props}>
      <span aria-hidden="true" className="runemark-badge__mark">
        ◆
      </span>
      {children}
    </span>
  );
}

export function FighterCard({
  name,
  subtitle,
  stats,
  badges,
  actions,
  children,
  className
}: {
  name: string;
  subtitle?: ReactNode;
  stats?: Array<{ label: string; value: ReactNode; note?: ReactNode }>;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article className={joinClassNames("fighter-card", "fighter-card--themed", className)}>
      <div className="fighter-card__header">
        <div>
          <h4>{name}</h4>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {badges ? <div className="tag-list">{badges}</div> : null}
      </div>
      {stats ? <StatBlock stats={stats} compact /> : null}
      {children}
      {actions ? <div className="fighter-card__actions">{actions}</div> : null}
    </article>
  );
}

export function WarbandBanner({
  name,
  faction,
  status,
  children,
  className
}: {
  name: string;
  faction?: string;
  status?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClassNames("warband-banner", className)}>
      <div>
        {faction ? <p className="eyebrow">{faction}</p> : null}
        <h3>{name}</h3>
        {children ? <p>{children}</p> : null}
      </div>
      {status ? <div className="warband-banner__status">{status}</div> : null}
    </div>
  );
}

export function CampaignTimeline({
  entries,
  emptyMessage
}: {
  entries: Array<{
    id: string;
    title: ReactNode;
    meta?: ReactNode;
    time?: string;
  }>;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="activity-feed campaign-timeline">
      {entries.map((entry) => (
        <article className="activity-entry campaign-timeline__entry" key={entry.id}>
          <span>
            <strong>{entry.title}</strong>
            {entry.meta ? <small>{entry.meta}</small> : null}
          </span>
          {entry.time ? <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time> : null}
        </article>
      ))}
    </div>
  );
}

export function LedgerTable({
  caption,
  columns,
  rows,
  emptyMessage
}: {
  caption: string;
  columns: string[];
  rows: Array<{ id: string; cells: ReactNode[] }>;
  emptyMessage: string;
}) {
  return (
    <div className="reference-table-wrap ledger-table">
      <table className="reference-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) =>
                  index === 0 ? (
                    <th key={`${row.id}-${columns[index]}`} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={`${row.id}-${columns[index]}`}>{cell}</td>
                  )
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ConfirmationScroll({
  title,
  children,
  actions,
  className,
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <section className={joinClassNames("confirmation-scroll", className)} {...props}>
      <h2>{title}</h2>
      <div>{children}</div>
      {actions ? <div className="confirmation-scroll__actions">{actions}</div> : null}
    </section>
  );
}
