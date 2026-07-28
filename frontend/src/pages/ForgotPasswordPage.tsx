import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";

type Tab = "student" | "staff";
type Step = "enterId" | "answer" | "done";

export default function ForgotPasswordPage() {
  const [tab, setTab] = useState<Tab>("student");
  const [step, setStep] = useState<Step>("enterId");
  const [loginId, setLoginId] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleFetchQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/api/auth/forgot-password/question", {
        method: "POST",
        body: JSON.stringify({ loginId }),
      });
      setSecurityQuestion(data.securityQuestion);
      setStep("answer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("/api/auth/forgot-password/reset", {
        method: "POST",
        body: JSON.stringify({ loginId, answer, newPassword }),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "再設定に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout narrow>
      <div className="card">
        <h1>パスワードをお忘れの場合</h1>

        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === "student" ? "is-active" : ""}`}
            onClick={() => { setTab("student"); setStep("enterId"); setError(""); }}
          >
            学生
          </button>
          <button
            type="button"
            className={`tab ${tab === "staff" ? "is-active" : ""}`}
            onClick={() => { setTab("staff"); setStep("enterId"); setError(""); }}
          >
            職員
          </button>
        </div>

        {tab === "student" && (
          <div>
            <p>
              学生の方は、お手数ですが<strong>事務局窓口</strong>までお越しください。
              職員が本人確認を行った上で、一時的なパスワードを発行します。
            </p>
            <p className="text-muted">
              発行された一時パスワードでログイン後、ダッシュボードの「パスワード変更」から
              ご自身のパスワードに変更できます。
            </p>
          </div>
        )}

        {tab === "staff" && step === "enterId" && (
          <form onSubmit={handleFetchQuestion}>
            <div className="field">
              <label className="label">ユーザー名</label>
              <input
                type="text"
                className="input"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? "確認中..." : "次へ"}
            </button>
          </form>
        )}

        {tab === "staff" && step === "answer" && (
          <form onSubmit={handleReset}>
            <div className="field">
              <label className="label">{securityQuestion}</label>
              <input
                type="text"
                className="input"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label">新しいパスワード（8文字以上）</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? "設定中..." : "パスワードを再設定"}
            </button>
          </form>
        )}

        {tab === "staff" && step === "done" && (
          <div>
            <p>パスワードを再設定しました。新しいパスワードでログインしてください。</p>
            <button onClick={() => navigate("/")} className="btn btn-primary btn-block">
              ログイン画面へ
            </button>
          </div>
        )}

        <p className="text-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <Link to="/">ログイン画面に戻る</Link>
        </p>
      </div>
    </PageLayout>
  );
}
