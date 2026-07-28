import { ReactNode } from "react";

export default function PageLayout({
  children,
  headerRight,
  narrow,
}: {
  children: ReactNode;
  headerRight?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark">証</span>
          ShutsuPass
        </div>
        {headerRight && <div className="app-header-user">{headerRight}</div>}
      </header>
      <main className={`app-content ${narrow ? "app-content--narrow" : ""}`}>{children}</main>
    </div>
  );
}
