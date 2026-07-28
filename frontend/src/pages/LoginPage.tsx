import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, Role } from "../auth/AuthContext";
import PageLayout from "../components/PageLayout";

export default function LoginPage() {
  const [role, setRole] = useState<Role>("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginId, password);
      navigate(role === "student" ? "/student" : "/staff");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout narrow>
      <div className="card">
        <h1>ログイン</h1>
        <p className="text-muted" style={{ marginTop: 0 }}>証明書発行申請システム</p>

        <div className="tabs">
          <button
            type="button"
            className={`tab ${role === "student" ? "is-active" : ""}`}
            onClick={() => setRole("student")}
          >
            学生
          </button>
          <button
            type="button"
            className={`tab ${role === "staff" ? "is-active" : ""}`}
            onClick={() => setRole("staff")}
          >
            職員
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">{role === "student" ? "学籍番号" : "ユーザー名"}</label>
            <input
              type="text"
              className="input"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="label">パスワード</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <p className="text-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <Link to="/forgot-password">パスワードをお忘れの場合</Link>
        </p>

        <p className="text-muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
          アカウントがない場合は<Link to="/register">こちら</Link>
        </p>
      </div>
    </PageLayout>
  );
}
