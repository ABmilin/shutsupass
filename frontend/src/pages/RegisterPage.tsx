import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, Role } from "../auth/AuthContext";
import PageLayout from "../components/PageLayout";

const SECURITY_QUESTIONS = [
  "生まれた市区町村は?",
  "母親の旧姓は?",
  "初めて飼ったペットの名前は?",
  "好きな食べ物は?",
  "出身小学校の名前は?",
];

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(role, loginId, password, displayName, role === "staff" ? securityQuestion : undefined, role === "staff" ? securityAnswer : undefined);
      navigate(role === "student" ? "/student" : "/staff");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout narrow>
      <div className="card">
        <h1>アカウント作成</h1>
        <p className="text-muted" style={{ marginTop: 0 }}>
          ※ 現段階は動作確認用の画面です。将来的には職員アカウントの発行方法を別途検討します。
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">区分</label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="student">学生</option>
              <option value="staff">職員</option>
            </select>
          </div>

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
            <label className="label">氏名</label>
            <input
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="label">パスワード（8文字以上）</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {role === "staff" && (
            <>
              <div className="field">
                <label className="label">秘密の質問（パスワードを忘れた時に使用）</label>
                <select
                  className="input"
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                >
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">上記の答え</label>
                <input
                  type="text"
                  className="input"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? "作成中..." : "アカウントを作成"}
          </button>
        </form>

        <p className="text-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          すでにアカウントがある場合は<Link to="/">こちら</Link>
        </p>
      </div>
    </PageLayout>
  );
}
