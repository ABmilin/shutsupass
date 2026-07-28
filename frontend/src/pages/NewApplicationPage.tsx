import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";

interface RequiredField {
  key: string;
  label: string;
  type: string;
}

interface DocumentType {
  id: number;
  code: string;
  name: string;
  fee: number;
  required_fields: RequiredField[];
}

type Purpose = "job_hunting" | "other";

interface PrefillData {
  documentTypeId: number;
  copies: number;
  formData: Record<string, string>;
  purpose?: Purpose;
  purposeDetail?: string;
  needsSealing?: boolean;
}

interface CartItem {
  documentTypeId: number;
  documentTypeName: string;
  fee: number;
  copies: number;
  formData: Record<string, string>;
  purpose: Purpose;
  purposeDetail: string;
  needsSealing: boolean;
  sealGroupLabel: string;
}

interface BreakdownRow {
  id: number;
  copies: number;
  needsSealing: boolean;
  sealGroupLabel: string;
}

// Safariはinput type="month"に対応していないため、年・月それぞれのプルダウンで代用する
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function splitMonthValue(value: string): { year: string; month: string } {
  const [year, month] = (value || "").split("-");
  return { year: year || "", month: month || "" };
}

function joinMonthValue(year: string, month: string): string {
  if (!year || !month) return "";
  return `${year}-${month.padStart(2, "0")}`;
}

export default function NewApplicationPage() {
  const location = useLocation();
  const prefill = (location.state as { prefill?: PrefillData } | null)?.prefill;

  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(prefill?.documentTypeId ?? null);
  const [formData, setFormData] = useState<Record<string, string>>(prefill?.formData ?? {});
  const [purpose, setPurpose] = useState<Purpose>(prefill?.purpose ?? "other");
  const [purposeDetail, setPurposeDetail] = useState(prefill?.purposeDetail ?? "");
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([
    { id: 1, copies: prefill?.copies ?? 1, needsSealing: prefill?.needsSealing ?? false, sealGroupLabel: "" },
  ]);
  const nextBreakdownId = useRef(2);
  const [monthDrafts, setMonthDrafts] = useState<Record<string, { year: string; month: string }>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ totalFee: number; count: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest("/api/document-types")
      .then((data) => {
        setDocumentTypes(data.documentTypes);
        if (!prefill && data.documentTypes.length > 0) {
          setSelectedId(data.documentTypes[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "取得に失敗しました"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedType = documentTypes.find((d) => d.id === selectedId);
  const cartTotal = cart.reduce((sum, item) => sum + item.fee * item.copies, 0);

  function handleFieldChange(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setSelectedId(documentTypes.length > 0 ? documentTypes[0].id : null);
    setFormData({});
    setPurpose("other");
    setPurposeDetail("");
    setBreakdown([{ id: nextBreakdownId.current++, copies: 1, needsSealing: false, sealGroupLabel: "" }]);
    setMonthDrafts({});
  }

  function addBreakdownRow() {
    setBreakdown((prev) => [...prev, { id: nextBreakdownId.current++, copies: 1, needsSealing: false, sealGroupLabel: "" }]);
  }

  function removeBreakdownRow(id: number) {
    setBreakdown((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function updateBreakdownRow(id: number, patch: Partial<BreakdownRow>) {
    setBreakdown((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const breakdownTotalCopies = breakdown.reduce((sum, r) => sum + (r.copies || 0), 0);

  function handleAddToCart(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedType) {
      setError("証明書の種類を選択してください");
      return;
    }
    const missing = selectedType.required_fields.filter((f) => !formData[f.key]);
    if (missing.length > 0) {
      setError(`未入力の項目があります: ${missing.map((f) => f.label).join("、")}`);
      return;
    }
    if (breakdown.some((r) => r.copies < 1)) {
      setError("内訳の部数は、それぞれ1以上を指定してください");
      return;
    }

    const newItems: CartItem[] = breakdown.map((r) => ({
      documentTypeId: selectedType.id,
      documentTypeName: selectedType.name,
      fee: selectedType.fee,
      copies: r.copies,
      formData,
      purpose,
      purposeDetail,
      needsSealing: r.needsSealing,
      sealGroupLabel: r.needsSealing ? r.sealGroupLabel : "",
    }));
    setCart((prev) => [...prev, ...newItems]);
    resetForm();
  }

  function handleRemoveFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitCart() {
    if (cart.length === 0) return;
    setError("");
    setLoading(true);
    try {
      let currentGroupId: string | undefined;
      let lastData: { groupTotal: number; groupCount: number } | null = null;
      for (const item of cart) {
        const data = await apiRequest("/api/applications", {
          method: "POST",
          body: JSON.stringify({
            documentTypeId: item.documentTypeId,
            copies: item.copies,
            formData: item.formData,
            receiveMethod: "window",
            purpose: item.purpose,
            purposeDetail: item.purpose === "other" ? item.purposeDetail : undefined,
            needsSealing: item.needsSealing,
            sealGroupLabel: item.sealGroupLabel || undefined,
            groupId: currentGroupId,
          }),
        });
        currentGroupId = data.application.group_id;
        lastData = data;
      }
      setResult({ totalFee: lastData!.groupTotal, count: lastData!.groupCount });
      setCart([]);
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : "申請に失敗しました") +
          "（一部の申請がすでに送信されている可能性があります。お手数ですがダッシュボードをご確認ください）"
      );
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setResult(null);
    resetForm();
  }

  if (result) {
    return (
      <PageLayout narrow>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="app-brand-mark" style={{ width: 48, height: 48, fontSize: "1.1rem", margin: "0 auto 1rem" }}>済</div>
          <h1>申請を受け付けました</h1>
          <p style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--color-primary)", margin: "0.5rem 0" }}>
            {result.totalFee}円
          </p>
          {result.count > 1 && (
            <p className="text-muted" style={{ marginTop: 0 }}>（{result.count}件まとめての合計金額です）</p>
          )}
          <p className="text-muted">この金額を、事務局窓口にてお支払いください。</p>
          <p className="text-muted">お釣りのないよう、ご協力をお願いいたします。</p>
          <p className="text-muted">証明書の発行までの目安は2営業日です。窓口でお受け取りください。</p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
            <button onClick={handleStartOver} className="btn btn-accent">
              もう一度申請する
            </button>
            <button onClick={() => navigate("/student")} className="btn btn-outline">
              ダッシュボードに戻る
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout narrow>
      <p><Link to="/student">← ダッシュボードに戻る</Link></p>

      {cart.length > 0 && (
        <div className="card" style={{ borderColor: "var(--color-primary)" }}>
          <h2 style={{ marginTop: 0 }}>🛒 カート（{cart.length}件）</h2>
          {cart.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: i < cart.length - 1 ? "1px solid var(--color-border)" : "none" }}>
              <div>
                <strong>{item.documentTypeName}</strong>
                <span className="text-muted"> ／ {item.copies}部 ／ {item.fee * item.copies}円</span>
                {item.needsSealing && (
                  <span style={{ color: "var(--color-accent)", fontWeight: 700, marginLeft: "0.5rem" }}>
                    厳封{item.sealGroupLabel && `（${item.sealGroupLabel}）`}
                  </span>
                )}
              </div>
              <button type="button" onClick={() => handleRemoveFromCart(i)} className="btn btn-danger-text btn-sm">
                削除
              </button>
            </div>
          ))}
          <p style={{ fontWeight: 700, margin: "0.75rem 0 0", textAlign: "right" }}>
            カート合計: {cartTotal}円
          </p>
          <button onClick={handleSubmitCart} disabled={loading} className="btn btn-accent btn-block" style={{ marginTop: "0.75rem" }}>
            {loading ? "送信中..." : `この内容でまとめて申請する（${cart.length}件・${cartTotal}円）`}
          </button>
        </div>
      )}

      <div className="card">
        <h1>証明書の新規申請</h1>

        {prefill && (
          <p className="text-muted" style={{ background: "var(--color-primary-soft)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
            却下された申請の内容を引き継いでいます。内容を確認・修正のうえ、再度申請してください。
          </p>
        )}

        <form onSubmit={handleAddToCart}>
          <div className="field">
            <label className="label">証明書の種類</label>
            <select
              className="input"
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(Number(e.target.value));
                setFormData({});
              }}
            >
              {documentTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}（1部 {d.fee}円）
                </option>
              ))}
            </select>
          </div>

          {selectedType?.required_fields.map((field) => (
            <div key={field.key} className="field">
              <label className="label">{field.label}</label>
              {field.type === "month" ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    className="input"
                    value={(monthDrafts[field.key] ?? splitMonthValue(formData[field.key] ?? "")).year}
                    onChange={(e) => {
                      const current = monthDrafts[field.key] ?? splitMonthValue(formData[field.key] ?? "");
                      const next = { year: e.target.value, month: current.month };
                      setMonthDrafts((prev) => ({ ...prev, [field.key]: next }));
                      handleFieldChange(field.key, joinMonthValue(next.year, next.month));
                    }}
                  >
                    <option value="">年</option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={(monthDrafts[field.key] ?? splitMonthValue(formData[field.key] ?? "")).month}
                    onChange={(e) => {
                      const current = monthDrafts[field.key] ?? splitMonthValue(formData[field.key] ?? "");
                      const next = { year: current.year, month: e.target.value };
                      setMonthDrafts((prev) => ({ ...prev, [field.key]: next }));
                      handleFieldChange(field.key, joinMonthValue(next.year, next.month));
                    }}
                  >
                    <option value="">月</option>
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m} value={String(m).padStart(2, "0")}>{m}月</option>
                    ))}
                  </select>
                </div>
              ) : (
                <input
                  type={field.type === "date" ? "date" : "text"}
                  className="input"
                  value={formData[field.key] ?? ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  required
                />
              )}
            </div>
          ))}

          <div className="field">
            <label className="label">部数・厳封の内訳</label>
            <p className="text-muted" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
              部数の一部だけを厳封にしたい場合は、「内訳を追加」で分けて指定できます。
            </p>

            {breakdown.map((row, i) => (
              <div key={row.id} className="card" style={{ background: "var(--color-bg)", boxShadow: "none", padding: "0.75rem", marginBottom: "0.6rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 100px" }}>
                    <label className="label">部数</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={row.copies}
                      onChange={(e) => updateBreakdownRow(row.id, { copies: Number(e.target.value) })}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", paddingBottom: "0.6rem" }}>
                    <input
                      type="checkbox"
                      checked={row.needsSealing}
                      onChange={(e) => updateBreakdownRow(row.id, { needsSealing: e.target.checked })}
                    />
                    <span style={{ fontSize: "0.9rem" }}>厳封を希望する</span>
                  </label>
                  {breakdown.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBreakdownRow(row.id)}
                      className="btn btn-danger-text btn-sm"
                      style={{ marginLeft: "auto" }}
                    >
                      この内訳を削除
                    </button>
                  )}
                </div>
                {row.needsSealing && (
                  <input
                    type="text"
                    className="input"
                    style={{ marginTop: "0.5rem" }}
                    placeholder="まとめ方の目印（任意・例: A社提出用）"
                    value={row.sealGroupLabel}
                    onChange={(e) => updateBreakdownRow(row.id, { sealGroupLabel: e.target.value })}
                  />
                )}
              </div>
            ))}

            <button type="button" onClick={addBreakdownRow} className="btn btn-outline btn-sm">
              ＋ 内訳を追加（部数を分ける）
            </button>
            <p className="text-muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              同じ目印を付けた内訳同士は、まとめて1つの封筒でお渡しします。就職活動などで開封していないことを証明する必要がある場合に「厳封」をご利用ください。
            </p>
          </div>

          <div className="field">
            <label className="label">使用目的</label>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`tab ${purpose === "job_hunting" ? "is-active" : ""}`}
                onClick={() => setPurpose("job_hunting")}
              >
                就職活動
              </button>
              <button
                type="button"
                className={`tab ${purpose === "other" ? "is-active" : ""}`}
                onClick={() => setPurpose("other")}
              >
                その他
              </button>
            </div>
            {purpose === "other" && (
              <input
                type="text"
                className="input"
                style={{ marginTop: "0.5rem" }}
                placeholder="具体的な用途（任意）"
                value={purposeDetail}
                onChange={(e) => setPurposeDetail(e.target.value)}
              />
            )}
          </div>

          <p className="text-muted">受け取り方法: 窓口受取（事務局窓口にてお渡しします）</p>

          {selectedType && (
            <p className="text-muted">
              手数料目安: {selectedType.fee}円 × 合計{breakdownTotalCopies}部 ={" "}
              <strong style={{ color: "var(--color-text)" }}>{selectedType.fee * breakdownTotalCopies}円</strong>
            </p>
          )}

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block">
            ＋ カートに追加する
          </button>
          <p className="text-muted" style={{ textAlign: "center", marginTop: "0.5rem", marginBottom: 0 }}>
            他にも証明書が必要な場合は、続けてカートに追加できます。
          </p>
        </form>
      </div>
    </PageLayout>
  );
}
