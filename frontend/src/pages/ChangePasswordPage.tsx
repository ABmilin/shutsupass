import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "変更に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout narrow>
      <div className="card">
        <h1>パスワード変更</h1>

        {done ? (
          <div>
            <p>パスワードを変更しました。</p>
            <button
              onClick={() => navigate(user?.role === "staff" ? "/staff" : "/student")}
              className="btn btn-primary btn-block"
            >
              ダッシュボードに戻る
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">現在のパスワード</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
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
              {loading ? "変更中..." : "パスワードを変更"}
            </button>
          </form>
        )}
      </div>
    </PageLayout>
  );
}
