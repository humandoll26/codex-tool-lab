# 制作OS — 現在地と再開手順

更新: 2026-10-02。対象はprojects/theater-production-os/だけ。

## 最新の依頼：セキュリティ監査

ユーザーから無断のカード情報取得・危険な読込みの監査を依頼され、MVP追加より優先した。[手動監査結果](manual-security-audit.md)に配信コミット、根拠、実験と制約を記録。専用Codex Securityは必須参照とpreflight/完了ツールが利用できず未実施。手動監査では無断取得・外部送信の証拠は見つからないが、同一オリジンの別サイトからの保存読取り/改変と、共有JSONの共通拡張保持を再現した。Google警告の理由は未特定。

追加の監査用ブラウザテスト5件と既存の通信/攻撃入力テスト1件成功。今回アプリの実装・gh-pages配信は変更していない。機密データを扱う場合の保存隔離・共有用出力・JSON容量上限の改善は未実装。

## 現在の実装

OS MVP v0.11。15モジュールを子フォルダに配置し、共通マスター・保存・予定・ダッシュボードへ接続済み。

budget / flyer / distribution / publicity / tickets / rehearsal / submissions / front-desk / settlement / program / stage-operations / venue / rights / show-day / archive。

- 入力・状態・期限、JSONバックアップ、逆算予定、月の日選択、一覧検索・モジュール切替。
- テキスト／CSV、原稿コピー、予定ICS、収支・販売実績レポート、資料所在と反省／引継ぎ、保存時点の収支原稿。
- 複数タブ等の保存変更の検知と退避・再読込。排他ロック・自動マージではない。
- 同じ公演IDへのモジュール専用JSON。対象の入力・予定だけを置換し、マスター・他モジュール・documentsを保持。

[README](../README.md)、[検証結果](verification.md)、[詳細履歴](progress.md)、[原本転記](../docs/specs/theater-production-os-spec-v0.1.md)、[最新追加仕様](../docs/mvp-v0.11.md)を読む。初回TASKはPR採用前の履歴として保持。原本転記は変更していない。

## Gitと配信

- ソースブランチ: tool/theater-production-os/budget-mvp
- 最新実装: dc5c0a938d5f4b4db1567a1b50e8ff86f73e796d
- 配信: 294b38843bdd4a70572898ddaec821a6b1a9f1f1（gh-pages）
- 配信はコミット済みの62アプリファイル＋.nojekyll。テスト・文書・node_modulesは含めない。
- mainへのマージ・実装PR作成はしていない。公開URLのHTTP応答はクラウドの接続制約で未確認。

開始時はgit statusと現在のブランチを確認する。文書だけの後続コミットがある場合、上記の実装とアプリは同じ。

## 再現できる検証

Node.js 24、Python 3、Chromium 151、Playwright 1.63.0。実行時のnpm依存・秘密情報・外部APIは不要。

```bash
cd /workspace/codex-tool-lab/projects/theater-production-os
npm test
npm run test:browser
python3 -m http.server 8765 --bind 127.0.0.1
```

MVP実装時の全体実行は単体163件・ブラウザ53件成功。その後の監査追加5件は配信ツリーで個別実行し成功（全体58件を再実行した結果ではない）。全18入口と明示35書出しの既存セキュリティ試験も再実行して成功。架空データと独立したHTTPサーバーで検証。再実行は変更・不具合・新しい未確認事項がある場合に行う。

## 継続条件と未完事項

ユーザーの指示は「5時間枠の残量が30％になるまで継続」。ツールに残量の読取手段がなく、30％到達とは判断していない。現在の割合を非同期で質問したが、回答はまだない。ここに記載した実装・検証・コミットは完了している。

次の実装候補は、原本12章の受付用資料・舞台進行表の印刷／PDF保存。まず追加範囲と受入条件を記録し、既存JSON・入力保護を維持して進める。

残件: Google危険サイト警告の原因特定と解除、Safari／iPhone実機、暦アプリへの実機取込、販売用配布物・ライセンス、契約・助成金等の後続モジュール。実ファイル保管・クラウド同期・共同編集・決済・税務・個人名簿は未実装。Googleへの報告や警告回避はしていない。警告の詳細は[safe-browsing-investigation.md](safe-browsing-investigation.md)。

保存キーはcodex-tool-lab:theater-production-os:v1、schemaVersion:1。サンプル試用は公演全体を置換する確認付き。実データを使う前には全公演JSONを書き出し、モジュールJSONと混同しない。
