import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, downloadFile } from "../api";
import PageLayout from "../components/PageLayout";
import StatusStepper from "../components/StatusStepper";
import NotificationBell from "../components/NotificationBell";
import { RequiredField, formatFormData } from "../utils/formatField";
import ApplicationComments from "../components/ApplicationComments";

interface Application {
  id: number;
  document_type_name: string;
  required_fields: RequiredField[];
  form_data: Record<string, string>;
  student_login_id: string;
  student_name: string;
  copies: number;
  total_fee: number;
  receive_method: "download" | "window";
  group_id: string;
  purpose: "job_hunting" | "other";
  purpose_detail: string | null;
  needs_sealing: boolean;
  seal_group_label: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

const STATUS_OPTIONS: Record<string, string> = {
  submitted: "申請中（支払い待ち）",
  payment_confirmed: "支払い確認済み（発行準備中）",
  issued: "発行済み（受け取り可能）",
  completed: "受け取り完了",
  rejected: "却下（差し戻し）",
};

function daysElapsed(createdAt: string): number {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

interface AppGroup {
  groupId: string;
  items: Application[];
}

// group_idごとに申請をまとめる(同じ来庁機会にまとめて申請されたもの)
function groupApplications(apps: Application[]): AppGroup[] {
  const map = new Map<string, Application[]>();
  for (const a of apps) {
    const key = a.group_id || `single-${a.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries()).map(([groupId, items]) => ({ groupId, items }));
}

// グループ内の全件が同じステータスの時だけ、一括操作を提案する
function getGroupBulkAction(items: Application[]): { action: string; label: string } | null {
  if (items.length < 2) return null;
  const statuses = new Set(items.map((i) => i.status));
  if (statuses.size !== 1) return null;
  const status = items[0].status;
  if (status === "submitted") return { action: "confirm_payment", label: `${items.length}件まとめて支払い確認` };
  if (status === "payment_confirmed") return { action: "issue", label: `${items.length}件まとめて発行` };
  if (status === "issued" && items.every((i) => i.receive_method === "window")) {
    return { action: "complete", label: `${items.length}件まとめて受け渡し完了` };
  }
  return null;
}

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [todaySummary, setTodaySummary] = useState<Record<string, number> | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dialogChecks, setDialogChecks] = useState({ content: false, count: false });
  const [issueDialogTarget, setIssueDialogTarget] = useState<{ ids: number[]; groupId?: string } | null>(null);

  async function loadSummary() {
    try {
      const data = await apiRequest("/api/applications/summary");
      setSummary(data.counts);
      setTodaySummary(data.todayCounts);
    } catch {
      // 概況表示の取得失敗は画面全体をブロックしない
    }
  }

  async function loadApplications(overrideStatus?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const statusToUse = overrideStatus !== undefined ? overrideStatus : statusFilter;
    if (statusToUse) params.set("status", statusToUse);
    try {
      const data = await apiRequest(`/api/applications?${params.toString()}`);
      setApplications(data.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(id: number, action: string, reason?: string) {
    setError("");
    try {
      await apiRequest(`/api/applications/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      loadApplications();
      loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  }

  async function handleGroupAction(groupId: string, action: string) {
    setError("");
    try {
      await apiRequest(`/api/applications/group/${groupId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      loadApplications();
      loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "一括更新に失敗しました");
    }
  }

  function openIssueDialog(ids: number[], groupId?: string) {
    setDialogChecks({ content: false, count: false });
    setIssueDialogTarget({ ids, groupId });
  }

  async function handleConfirmIssue() {
    if (!issueDialogTarget) return;
    if (issueDialogTarget.groupId) {
      await handleGroupAction(issueDialogTarget.groupId, "issue");
    } else {
      await handleAction(issueDialogTarget.ids[0], "issue");
    }
    setIssueDialogTarget(null);
  }

  function applyStatusFilter(status: string) {
    setStatusFilter(status);
    loadApplications(status);
  }

  async function handleExportCsv() {
    setError("");
    setExporting(true);
    const params = new URLSearchParams();
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);
    try {
      const filenamePart = exportFrom || exportTo ? `${exportFrom || "先頭"}_${exportTo || "末尾"}` : "全期間";
      const today = new Date().toISOString().slice(0, 10);
      await downloadFile(`/api/applications/export?${params.toString()}`, `shutsupass_${filenamePart}_出力日${today}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV出力に失敗しました");
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadReceipt(id: number) {
    setError("");
    try {
      await downloadFile(`/api/applications/${id}/receipt-pdf`, `shutsupass_receipt_${id}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請控えPDFの出力に失敗しました");
    }
  }

  async function handleDownloadWorkSheet(id: number) {
    setError("");
    try {
      await downloadFile(`/api/applications/${id}/work-sheet-pdf`, `shutsupass_work_sheet_${id}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "職員作業票PDFの出力に失敗しました");
    }
  }

  function handleReject(id: number) {
    const reason = window.prompt("却下理由を入力してください");
    if (reason) {
      handleAction(id, "reject", reason);
    }
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <PageLayout
      headerRight={
        <>
          <NotificationBell />
          <span>{user?.displayName} さん</span>
          <Link to="/change-password" style={{ color: "rgba(255,255,255,0.85)" }}>パスワード変更</Link>
          <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.35)" }}>
            ログアウト
          </button>
        </>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>職員ダッシュボード</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to="/staff/reset-password">
            <button className="btn btn-outline btn-sm">学生のパスワードをリセット</button>
          </Link>
          <Link to="/staff/document-types">
            <button className="btn btn-outline btn-sm">申請書の種類を管理</button>
          </Link>
        </div>
      </div>

      {summary && (
        <div style={{ display: "flex", gap: "0.75rem", margin: "1.25rem 0 0.75rem", flexWrap: "wrap" }}>
          {[
            { key: "submitted", label: "支払い確認待ち", color: "var(--status-submitted)" },
            { key: "payment_confirmed", label: "発行待ち", color: "var(--status-payment)" },
            { key: "issued", label: "受け渡し待ち", color: "var(--status-issued)" },
          ].map((s) => {
            const count = summary[s.key] ?? 0;
            const isBacklogged = count >= 6;
            return (
              <button
                key={s.key}
                onClick={() => applyStatusFilter(s.key)}
                className="card"
                style={{
                  flex: "1 1 160px",
                  minWidth: 150,
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderLeft: `4px solid ${isBacklogged ? "var(--status-rejected)" : s.color}`,
                  margin: 0,
                  fontFamily: "var(--font-body)",
                }}
              >
                <div style={{ fontSize: "1.9rem", fontWeight: 900, color: isBacklogged ? "var(--status-rejected)" : "var(--color-primary)" }}>
                  {count}
                  <span style={{ fontSize: "1rem", fontWeight: 500, color: "var(--color-text-muted)" }}> 件</span>
                  {isBacklogged && <span style={{ fontSize: "0.8rem", marginLeft: "0.4rem" }}>⚠️ 滞留中</span>}
                </div>
                <div className="text-muted" style={{ fontSize: "0.85rem" }}>{s.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {todaySummary && (
        <div style={{ display: "flex", gap: "0.75rem", margin: "0 0 1.5rem", flexWrap: "wrap" }}>
          {[
            { key: "completed", label: "本日の受け取り完了", color: "var(--status-completed)" },
            { key: "new", label: "本日の新規申請", color: "var(--status-payment)" },
          ].map((s) => (
            <div
              key={s.key}
              className="card"
              style={{
                flex: "1 1 160px",
                minWidth: 150,
                border: "none",
                borderLeft: `4px solid ${s.color}`,
                margin: 0,
                background: "var(--color-bg)",
              }}
            >
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-text)" }}>
                {todaySummary[s.key] ?? 0}
                <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--color-text-muted)" }}> 件</span>
              </div>
              <div className="text-muted" style={{ fontSize: "0.8rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: "0 1 auto" }}>
          <label className="label">開始日（任意）</label>
          <input type="date" className="input" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
        </div>
        <div style={{ flex: "0 1 auto" }}>
          <label className="label">終了日（任意）</label>
          <input type="date" className="input" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
        </div>
        <button onClick={handleExportCsv} disabled={exporting} className="btn btn-primary">
          {exporting ? "出力中..." : "支払い済みデータをCSV出力"}
        </button>
        <span className="text-muted" style={{ fontSize: "0.8rem" }}>
          日付を指定しなければ全期間が対象になります（総務課の集計用）
        </span>
      </div>

      <div className="search-row">
        <input
          type="text"
          className="input"
          placeholder="学籍番号または氏名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadApplications()}
        />
        <select className="input" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">すべてのステータス</option>
          {Object.entries(STATUS_OPTIONS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button onClick={() => loadApplications()} className="btn btn-primary">検索</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="text-muted">読み込み中...</p>}
      {!loading && applications.length === 0 && (
        <div className="empty-state">該当する申請がありません。</div>
      )}

      {groupApplications(applications).map(({ groupId, items }) => {
        const bulkAction = getGroupBulkAction(items);
        const isGrouped = items.length > 1;
        return (
          <div
            key={groupId}
            style={
              isGrouped
                ? { border: "2px solid var(--color-primary)", borderRadius: "var(--radius-lg)", padding: "0.75rem", marginBottom: "1rem" }
                : undefined
            }
          >
            {isGrouped && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0.4rem 0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--color-primary)" }}>
                  🔗 まとめて申請（{items.length}件・合計{items.reduce((sum, i) => sum + i.total_fee, 0)}円）
                </span>
                {bulkAction && (
                  <button
                    onClick={() =>
                      bulkAction.action === "issue"
                        ? openIssueDialog(items.map((i) => i.id), groupId)
                        : handleGroupAction(groupId, bulkAction.action)
                    }
                    className="btn btn-primary btn-sm"
                  >
                    {bulkAction.label}
                  </button>
                )}
              </div>
            )}

            {items.map((a) => (
              <div key={a.id} className="card" style={isGrouped ? { marginBottom: "0.5rem" } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <strong style={{ fontSize: "1.05rem" }}>{a.student_name}</strong>
                    <span className="mono text-muted" style={{ marginLeft: "0.5rem" }}>{a.student_login_id}</span>
                  </div>
                  <span className="mono text-muted">#{a.id}</span>
                </div>
                <p style={{ margin: "0.25rem 0 0" }}>{a.document_type_name}</p>

                {a.needs_sealing && (
                  <p style={{ margin: "0.4rem 0 0", color: "var(--color-accent)", fontWeight: 700, fontSize: "0.85rem" }}>
                    ⚠️ 厳封が必要です{a.seal_group_label && `（まとめ方の目印: ${a.seal_group_label}）`}
                  </p>
                )}

                <StatusStepper status={a.status} />

                <div className="app-meta">
                  <span><strong>{a.copies}</strong>部 / <strong>{a.total_fee}円</strong></span>
                  <span>受け取り: {a.receive_method === "window" ? "窓口受取" : "ダウンロード"}</span>
                  <span>{new Date(a.created_at).toLocaleString("ja-JP")}（経過{daysElapsed(a.created_at)}日）</span>
                </div>

                {formatFormData(a.required_fields, a.form_data).length > 0 && (
                  <div className="app-meta" style={{ marginTop: 0 }}>
                    {formatFormData(a.required_fields, a.form_data).map((f) => (
                      <span key={f.label}>{f.label}: <strong>{f.value}</strong></span>
                    ))}
                  </div>
                )}

                {a.status === "rejected" && a.reject_reason && (
                  <p className="error-text" style={{ marginBottom: 0 }}>却下理由: {a.reject_reason}</p>
                )}

                <div className="actions-row">
                  {a.status === "submitted" && (
                    <>
                      <button onClick={() => handleAction(a.id, "confirm_payment")} className="btn btn-primary btn-sm">
                        支払い確認
                      </button>
                      <button onClick={() => handleReject(a.id)} className="btn btn-danger-text btn-sm">
                        却下
                      </button>
                    </>
                  )}
                  {a.status === "payment_confirmed" && (
                    <button onClick={() => openIssueDialog([a.id])} className="btn btn-accent btn-sm">
                      発行済みにする
                    </button>
                  )}
                  {a.status === "issued" && a.receive_method === "window" && (
                    <button onClick={() => handleAction(a.id, "complete")} className="btn btn-primary btn-sm">
                      受け渡し完了
                    </button>
                  )}
                  <button onClick={() => handleDownloadReceipt(a.id)} className="btn btn-outline btn-sm">
                    申請控えPDF
                  </button>
                  <button onClick={() => handleDownloadWorkSheet(a.id)} className="btn btn-outline btn-sm">
                    職員作業票PDF
                  </button>
                </div>

                <ApplicationComments applicationId={a.id} />
              </div>
            ))}
          </div>
        );
      })}

      {issueDialogTarget !== null && (() => {
        const targets = applications.filter((a) => issueDialogTarget.ids.includes(a.id));
        if (targets.length === 0) return null;
        const checks = dialogChecks;
        return (
          <div className="modal-overlay" onClick={() => setIssueDialogTarget(null)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>発行前確認</h2>
              <p className="text-muted" style={{ marginTop: 0 }}>
                以下の内容を、証明書の現物と照らし合わせて確認してください。
              </p>

              {targets.map((t) => (
                <div key={t.id} className="card" style={{ background: "var(--color-bg)", boxShadow: "none", marginBottom: "0.5rem" }}>
                  <div><strong>{t.student_name}</strong> <span className="mono text-muted">{t.student_login_id}</span></div>
                  <div>{t.document_type_name} ／ {t.copies}部</div>
                  {t.needs_sealing && (
                    <div style={{ color: "var(--color-accent)", fontWeight: 700 }}>
                      ⚠️ 厳封が必要です{t.seal_group_label && `（まとめ方の目印: ${t.seal_group_label}）`}
                    </div>
                  )}
                </div>
              ))}

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0 0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checks.content}
                  onChange={(e) => setDialogChecks((prev) => ({ ...prev, content: e.target.checked }))}
                />
                申請内容を確認した
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checks.count}
                  onChange={(e) => setDialogChecks((prev) => ({ ...prev, count: e.target.checked }))}
                />
                部数を確認した
              </label>

              <div className="actions-row" style={{ marginTop: 0 }}>
                <button onClick={() => setIssueDialogTarget(null)} className="btn btn-outline">
                  キャンセル
                </button>
                <button
                  onClick={handleConfirmIssue}
                  disabled={!(checks.content && checks.count)}
                  className="btn btn-accent"
                >
                  発行済みにする
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </PageLayout>
  );
}
