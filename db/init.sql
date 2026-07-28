-- 初回起動時にPostgreSQLコンテナが自動実行する初期化スクリプト
-- 現時点では動作確認用のテーブルのみ。ユーザーテーブル等は次のステップで追加します。

CREATE TABLE IF NOT EXISTS schema_info (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_info (note) VALUES ('ShutsuPass DB initialized');

-- ユーザーテーブル(学生・職員共通)
-- login_id: 学生は学籍番号、職員は自由なユーザー名を格納する
-- security_question / security_answer_hash: 職員のパスワードリセット用(秘密の質問方式)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'staff')),
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  security_question TEXT,
  security_answer_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 動作確認用のテストアカウント(パスワードは共通で password123)
-- 学生: S0001 / password123
-- 職員: staff01 / password123 (秘密の質問の答え: テスト)
INSERT INTO users (role, login_id, password_hash, display_name, security_question, security_answer_hash) VALUES
  ('student', 'S0001', '$2b$10$Wy223c/vjY90U0KxwVyHuefJtaUts7wefsUjYQbebPAEJBRiU8ziu', 'テスト太郎', NULL, NULL),
  ('staff', 'staff01', '$2b$10$HDBi0TiQboNaYYDFK6aTMuERvgoMZrqvumRYWl/UR8JV8s6HD9z8.', 'テスト職員', '生まれた市区町村は?', '$2b$10$I1MW3DxVzDW8zN40W5ZXIedybr6DCBaa7XEiZsEcNgO.DKuB8wyki')
ON CONFLICT (login_id) DO NOTHING;

-- 証明書の種類マスタ
-- required_fields: [{ "key": "department", "label": "学部・学科", "type": "text" }, ...]
-- layout: 帳票プレビュー画面での各項目の配置(mm単位)。職員がクリックで配置を設定する
-- fee: 1部あたりの手数料(円)
CREATE TABLE IF NOT EXISTS document_types (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  fee INTEGER NOT NULL,
  required_fields JSONB NOT NULL DEFAULT '[]',
  layout JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO document_types (code, name, fee, required_fields) VALUES
  ('zaigaku', '在学証明書', 300,
    '[{"key":"department","label":"学部・学科","type":"text"}]'::jsonb),
  ('seiseki', '成績証明書', 300,
    '[{"key":"department","label":"学部・学科","type":"text"}]'::jsonb),
  ('sotsugyo_mikomi', '卒業見込証明書', 300,
    '[{"key":"department","label":"学部・学科","type":"text"},
      {"key":"expected_graduation","label":"卒業予定年月","type":"month"}]'::jsonb),
  ('sotsugyo', '卒業証明書', 300,
    '[{"key":"department","label":"学部・学科","type":"text"},
      {"key":"graduation_date","label":"卒業年月","type":"month"}]'::jsonb),
  ('gakuwari', '旅客運賃割引証', 0,
    '[{"key":"department","label":"学部・学科","type":"text"},
      {"key":"purpose","label":"用務・使用理由","type":"text"},
      {"key":"validity_start","label":"使用開始日","type":"date"},
      {"key":"validity_end","label":"使用終了日","type":"date"}]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 証明書の申請
-- form_data: document_typesのrequired_fieldsに対応する入力値
-- needs_sealing: 学生が申請時に選択する、厳封(開封できない状態での受け渡し)の希望
-- group_id: 「続けて申請」でまとめて出された複数の申請を束ねるID(同じ来庁機会にまとめて処理するため)
-- status: submitted(申請中) -> payment_confirmed(支払い確認済み) -> issued(発行済み) -> completed(受け渡し完了)
--         / rejected(却下)
-- ※証明書の実体(PDF等)はシステムでは生成しない。発行は大学の既存の方法で行い、
--   本システムはあくまで申請〜発行までの進捗管理を担う。
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  document_type_id INTEGER NOT NULL REFERENCES document_types(id),
  copies INTEGER NOT NULL DEFAULT 1,
  form_data JSONB NOT NULL DEFAULT '{}',
  receive_method TEXT NOT NULL CHECK (receive_method IN ('download', 'window')),
  purpose TEXT NOT NULL DEFAULT 'other' CHECK (purpose IN ('job_hunting', 'other')),
  purpose_detail TEXT,
  needs_sealing BOOLEAN NOT NULL DEFAULT false,
  seal_group_label TEXT,
  group_id UUID,
  total_fee INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'payment_confirmed', 'issued', 'completed', 'rejected')),
  reject_reason TEXT,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_group_id ON applications(group_id);

-- 通知(学生への発行完了連絡、職員への新規申請連絡など)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  application_id INTEGER REFERENCES applications(id),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 申請ごとのメッセージのやり取り(却下するほどではない、確認・連絡事項用)
CREATE TABLE IF NOT EXISTS application_comments (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('student', 'staff')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
