# ShutsuPass

大学の証明書発行申請を中心とした、**窓口業務のデジタル化プラットフォーム**です。

証明書そのものの電子発行や、現金決済のオンライン化は行わず、**申請から支払い確認・発行・受け渡しまでの進捗管理と情報共有**に特化しています。開志専門職大学 学生課への2回にわたるヒアリングをもとに、要件定義・実装・改善を重ねました。

## 概要

- 学生はオンラインで証明書を申請し、職員は支払い確認・発行・受け渡しの進捗を一元管理できます
- 証明書の作成自体、窓口での現金授受といった既存の運用は維持しています
- 職員は画面から証明書（申請書）の種類を自由に追加・編集でき、証明書に限らない窓口業務全般に応用できます

## 主な機能

| 機能 | 概要 |
|---|---|
| 認証 | 学生・職員それぞれ独立したログイン、パスワードリセット |
| カート形式の証明書申請 | 複数種類・複数部数をまとめて申請。部数の内訳ごとに厳封希望・まとめ方の目印を指定可能 |
| 申請の進捗管理 | 支払い確認・発行前確認・受け渡し完了。同じ来庁機会の申請はグループとして一括処理可能 |
| 申請書の種類の管理 | 職員が証明書（申請書）の種類・手数料・入力項目を画面から追加・編集 |
| 通知・メッセージ | システム内通知、申請ごとの学生⇄職員のメッセージ機能 |
| 職員ダッシュボード | 対応待ち件数の概況表示、総務課向けCSV出力 |
| PDF出力 | 申請控え（学生向け）・作業票（職員向け、確認チェック欄付き）。いずれも「公式な証明書ではない」ことを明記 |
| 多言語の参考翻訳 | 通知・メッセージ・申請控えPDFを、英語・中国語へAIによる参考翻訳（LibreTranslate、オプションでOllama） |

## 技術構成

| 区分 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite |
| バックエンド | Node.js + Express |
| データベース | PostgreSQL |
| コンテナ | Docker Compose（frontend / backend / db / libretranslate / ollama の構成） |
| PDF生成 | PDFKit（Chromium等の外部プロセス不要の軽量な構成） |
| 翻訳エンジン | LibreTranslate（自己完結・既定）、Ollama（オプション、LLMによる高精度な参考訳） |

外部の商用クラウドサービス・APIには依存せず、大学が自前のサーバーで運用できる自己完結型の構成です。

## セットアップ

### 必要なもの

- Docker Desktop または OrbStack

### 手順

```bash
git clone https://github.com/ABmilin/shutsupass.git
cd shutsupass
cp .env.example .env
docker compose up --build
```

起動したら、ブラウザで以下にアクセスしてください。

```
http://localhost:5173
```

### テストアカウント

| 区分 | ログインID | パスワード |
|---|---|---|
| 学生 | `S0001` | `password123` |
| 職員 | `staff01` | `password123` |

### 停止方法

```bash
docker compose down
```

データを初期化したい場合のみ、`-v`を付けてください（学生・申請データが消えます）。

```bash
docker compose down -v
```

## Ollama（LLMによる高精度な参考翻訳）を使う場合（オプション）

既定ではLibreTranslateのみを使用します。より高精度な翻訳を試したい場合は、以下の手順でOllamaを有効化できます。

```bash
# 1. Ollamaコンテナを起動
docker compose up -d ollama

# 2. 翻訳モデルを取得（初回のみ、数GBあります）
docker exec -it shutsupass-ollama ollama pull gemma2:2b

# 3. .env に以下を追記
echo "TRANSLATION_PROVIDER=ollama" >> .env

# 4. backendを再起動
docker compose up -d --build backend
```

Ollamaでの翻訳に失敗した場合は、自動的にLibreTranslateへフォールバックします。`.env`の`TRANSLATION_PROVIDER=ollama`を削除（または`libretranslate`に変更）すれば、いつでも既定の動作に戻せます。

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `TRANSLATION_PROVIDER` | `libretranslate` | `ollama`に変更するとOllamaを優先的に使用（失敗時はLibreTranslateへフォールバック） |
| `OLLAMA_MODEL` | `gemma2:2b` | Ollamaで使用するモデル名 |
| `JWT_SECRET` | (開発用の既定値) | 本番運用時は必ず変更してください |

その他は`.env.example`を参照してください。

## プロジェクト構成

```
shutsupass/
├── backend/          # Node.js + Express API
│   └── src/
│       ├── routes/       # 申請・認証・通知・翻訳などのAPIルート
│       ├── pdf/          # PDF生成（PDFKit）
│       └── translation/  # LibreTranslate / Ollama 呼び出し
├── frontend/         # React + TypeScript
│   └── src/
│       ├── pages/        # 画面ごとのコンポーネント
│       └── components/   # 通知・メッセージなど共通部品
├── db/               # 初期化SQL
└── docker-compose.yml
```

## 生成AIの活用について

本プロジェクトは、要件定義・設計判断の議論から実装・動作確認まで、Claude・Codexとの対話を通じて開発しています。

## 既知の制約・スコープ外事項

以下は、時間的制約による未実装ではなく、実際のヒアリングと業界事例（他大学の証明書発行サービスの実情）を踏まえた、意図的な設計判断です。

- **証明書PDFの公式な自動発行**: 電子証明書の原本性への懸念から非対応。申請控え・作業票としての参考PDF出力のみ実装
- **オンライン決済**: 実際の運用が窓口現金払いであるため非対応
- **複数部署・複数職員による正式な承認フロー**: 職員1名で完結する設計
- **証明書発行システムとの統合**: 連携対象となる外部システムが存在しないため対応不可
- **自動テスト**: 未整備。動作確認は手動で行っている

詳細は要件定義書（レポート5）を参照してください。
