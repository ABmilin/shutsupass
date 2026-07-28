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
  document_type_id: number;
  document_type_name: string;
  required_fields: RequiredField[];
  copies: number;
  form_data: Record<string, string>;
  total_fee: number;
  purpose: "job_hunting" | "other";
  needs_sealing: boolean;
  seal_group_label: string | null;
  group_id: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

interface AppGroup {
  groupId: string;
  items: Application[];
}

function groupApplications(apps: Application[]): AppGroup[] {
  const map = new Map<string, Application[]>();
  for (const a of apps) {
    const key = a.group_id || `single-${a.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries()).map(([groupId, items]) => ({ groupId, items }));
}

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/api/applications/mine")
      .then((data) => setApplications(data.applications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    navigate("/");
  }

  async function handleDownloadReceipt(id: number, lang: "ja" | "en" | "zh" = "ja") {
    try {
      const query = lang === "ja" ? "" : `?lang=${lang}`;
      await downloadFile(`/api/applications/${id}/receipt-pdf${query}`, `shutsupass_receipt_${id}_${lang}.pdf`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "PDFのダウンロードに失敗しました");
    }
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>学生ダッシュボード</h1>
          <p className="text-muted mono" style={{ margin: 0 }}>学籍番号: {user?.loginId}</p>
        </div>
        <Link to="/student/new">
          <button className="btn btn-accent">＋ 証明書を新規申請</button>
        </Link>
      </div>

      <h2>申請一覧</h2>
      {loading && <p className="text-muted">読み込み中...</p>}
      {!loading && applications.length === 0 && (
        <div className="empty-state">まだ申請がありません。「証明書を新規申請」から申請できます。</div>
      )}

      {groupApplications(applications).map(({ groupId, items }) => {
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
              <div style={{ padding: "0 0.4rem 0.5rem", fontWeight: 700, fontSize: "0.85rem", color: "var(--color-primary)" }}>
                🔗 まとめて申請した{items.length}件（合計{items.reduce((sum, i) => sum + i.total_fee, 0)}円）
              </div>
            )}

            {items.map((a) => (
              <div key={a.id} className="card" style={isGrouped ? { marginBottom: "0.5rem" } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "1.05rem" }}>{a.document_type_name}</strong>
                  <span className="mono text-muted">#{a.id}</span>
                </div>

                <StatusStepper status={a.status} />

                <div className="app-meta">
                  <span><strong>{a.copies}</strong>部 / <strong>{a.total_fee}円</strong></span>
                  <span>受け取り: 窓口受取</span>
                  {a.needs_sealing && (
                    <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>
                      厳封希望{a.seal_group_label && `（${a.seal_group_label}）`}
                    </span>
                  )}
                  <span>{new Date(a.created_at).toLocaleString("ja-JP")}</span>
                </div>

                {formatFormData(a.required_fields, a.form_data).length > 0 && (
                  <div className="app-meta" style={{ marginTop: 0 }}>
                    {formatFormData(a.required_fields, a.form_data).map((f) => (
                      <span key={f.label}>{f.label}: <strong>{f.value}</strong></span>
                    ))}
                  </div>
                )}

                {a.status === "rejected" && a.reject_reason && (
                  <>
                    <p className="error-text" style={{ marginBottom: "0.75rem" }}>却下理由: {a.reject_reason}</p>
                    <div className="actions-row">
                      <button
                        onClick={() =>
                          navigate("/student/new", {
                            state: {
                              prefill: {
                                documentTypeId: a.document_type_id,
                                copies: a.copies,
                                formData: a.form_data,
                                purpose: a.purpose,
                                needsSealing: a.needs_sealing,
                              },
                            },
                          })
                        }
                        className="btn btn-accent btn-sm"
                      >
                        再申請する
                      </button>
                    </div>
                  </>
                )}

                <ApplicationComments applicationId={a.id} />

                <div className="actions-row">
                  <button onClick={() => handleDownloadReceipt(a.id)} className="btn btn-outline btn-sm">
                    申請控えPDF
                  </button>
                  <button onClick={() => handleDownloadReceipt(a.id, "en")} className="btn btn-outline btn-sm">
                    Receipt (English)
                  </button>
                  <button onClick={() => handleDownloadReceipt(a.id, "zh")} className="btn btn-outline btn-sm">
                    申请存根（中文参考译）
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </PageLayout>
  );
}
