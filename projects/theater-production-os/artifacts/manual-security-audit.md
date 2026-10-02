# 制作OS v0.11 — 手動セキュリティ監査（2026-10-02 UTC）

## 結論

確認した制作OSには、カード情報・ブラウザの保存パスワード・Cookie・クリップボードを勝手に読み取る処理、ユーザーデータの外部送信、外部スクリプトの読込みは見つからなかった。これは下記のソース確認と隔離したChromiumによる検証の結果であり、公開サイト全体の安全保証やGoogle警告の誤判定という結論ではない。

保存先の同一オリジン共有と、JSON共有時の平文情報には実際に再現できるリスクがある。Google/Safariの警告理由との因果関係は不明。

## 対象と方法

- 対象：`projects/theater-production-os` のブラウザ実行コード、HTML/CSS、サンプル、配信スクリプトと保存・取込・出力の境界。
- ソース：`dc5c0a938d5f4b4db1567a1b50e8ff86f73e796d`。監査開始時の作業ブランチHEADは記録更新の `b80e3933cf80697fcd3ab27393085951ba5ed542`。
- 配信ブランチ：`294b38843bdd4a70572898ddaec821a6b1a9f1f1`。Gitから取得・展開し、全62アプリファイルを手元の実装とバイト単位で比較して一致。内訳はHTML18、JS42、CSS1、JSON1。別に `.nojekyll` 1。
- 実験：配信ツリーを専用ローカルHTTPサーバーで提供。合成データだけを新規ブラウザコンテキストに保存し、外部リクエストを記録して遮断。実際のカード番号・認証情報・ユーザーのブラウザデータは使っていない。
- 信頼境界：入力・選択JSON・既存保存値・URL引数を信用しない。別オリジンと同一オリジン内の別パスを区別する。共有されたJSONの受取人は信頼境界の外。

## 情報取得・送信・コード実行の確認

| 経路 | 根拠と結果 |
| --- | --- |
| 保存データ | `shared/model.js:7,170–198` と `shared/app.js:30–32`。読み書き・消去はOS専用キーのみ。全18入口で `Storage.getItem` を監視し、別の合成カードキーへの読取り0。 |
| カード・認証・Cookie等 | 実行コードにPaymentRequest、credentials、Cookie読取り、IndexedDB利用は見つからない。各入口でこれらとクリップボード読取り・ファイルピッカーを監視し、呼出し0。Cookie読取りとPaymentRequest生成の監視は陽性対照でも検証。 |
| クリップボード | `shared/app.js:134–150`。原稿コピーのボタンから `writeText` を呼ぶ。読取りAPIは使わない。 |
| ファイル | `shared/app.js:159–189,413–421`。利用者が選んだJSONを `file.text()` で読む。無断のディレクトリ走査・端末ファイル取得は見つからない。 |
| 通信・外部素材 | 唯一の明示的fetchは `shared/app.js:186` の固定相対URL `samples/demo.json`。18入口のJS/CSSも相対URL。入力された公式URL・資料所在URLは文字情報として扱い、取得しない。監視範囲で外部通信0、GET以外の送信0。 |
| ダウンロード | `shared/app.js:127–132`。BlobからJSON/CSV/TXT/ICSを利用者のボタン操作で出力。18入口閲覧で自動ダウンロード0。既存試験で明示35出力を確認。 |
| 入力からの実行 | `shared/app.js:53–63` のDOM生成は文字ノードを使う。innerHTML/eval/Function/外部iframe等の危険な実行経路は見つからない。HTML攻撃入力を表示してもスクリプト・画像の実体化や外部送信は起きない。 |
| JSON特殊キー | JSON.parseとstructuredClone、限定した対象への代入を確認。合成 `__proto__` / `constructor.prototype` はデータのままでObject.prototypeを汚染せず、特殊キーをモジュールIDにした取込みを拒否。 |
| CSV・ICS | `shared/common.js:32–39` の数式開始文字対策・引用符処理、`shared/calendar-outputs.js:6–8` の改行等エスケープを攻撃文字列で確認。ICSに余分なVEVENT/ATTENDEE/URL/ATTACH行を挿入できなかった。実際のExcel/カレンダー製品での解釈検証は対象外。 |

ランタイムの外部依存はなく、Playwrightは開発・検証用。配信スクリプトはコミット済みの静的ファイルを選択してGitで公開する。これらの確認は依存パッケージ全体や実行環境自体の侵害調査ではない。

## 再現したリスクと改善案

### R1：同じGitHub Pagesドメインの別ページから保存データを読める・改変できる

- 評価：中、条件付き。ブラウザの仕様に由来する配置・保存方式のリスク。現在の不正送信の証拠ではない。
- 根拠：`shared/model.js:7,170–198`、`shared/app.js:30–32`。localStorageはパスごとではなくオリジンごとに共有される。
- 攻撃経路：利用者が同じ `https://humandoll26.github.io` の別ページを開く → そのページで悪意のあるJSが実行される → OS専用キーを読取り・書換えできる。別ページが侵害されるか、攻撃者が同一オリジンでJSを実行できることが前提。
- 再現：OSを開いた同じコンテキストから `/other-project/` に移動し、合成の私的メモを読み取り、公演名を書換えた。OSに戻ると変更が表示された。別ポートの別オリジンではOSキーを読めなかった。
- 影響：入力済みの予算・決算・メモ等の機密性と完全性。別ページのJSが送信処理を持てば外部流出も可能。現在のOSコードが他ページのカード情報を読んでいるという意味ではない。
- 改善：OSを信頼できない別アプリと異なるオリジンに配置する。機密情報を扱う製品では保存方式と認証を改めて設計する。キー名やサブフォルダの変更だけでは隔離できず、単純なIndexedDB移行でも同じ境界問題が残る。

### R2：モジュール専用JSONにも共通情報の追加項目が平文で残る

- 評価：低、利用者による共有が前提の情報開示リスク。
- 根拠：`shared/module-backup.js:8–17`。対象以外のモジュールとdocumentsは除くが、共通projectの未知の追加項目は保持する。`shared/app.js:422` に共有前の確認案内がある。
- 再現：共通projectに合成の私的メモを追加し、チラシ専用JSONを書き出すとメモが残った。
- 影響：受取人へ意図以上の共通情報を渡す可能性。全体JSONやCSV等も暗号化された秘密保管ではない。出力は明示操作で、無断送信は確認していない。
- 改善：共有用出力をバックアップと別に設け、必要な項目だけの許可リスト・内容プレビュー・個人情報除外を設計する。現状は共有前に出力内容を確認する。

### R3：JSON取込みに容量・深さ・行数の制限がない

- 評価：低、可用性の改善事項。大容量での画面停止は今回実証していない。
- 根拠：`shared/app.js:159–175` のファイル全読込み、`shared/model.js:59–65` の再帰検証、`shared/work-editor.js:8–14` の行DOM生成。舞台進行の重複チェックも行数に対して二重ループになる。
- 再現：12,000段の合成JSONは再帰検証でスタック上限エラーになった。取込みのcatchがエラーを表示し、元の保存データと画面を保持した。コード実行・送信・既存データ破壊は起きていない。
- 改善：ファイル容量・深さ・行数の上限を設け、再帰を上限付きの処理にする。知らない相手からの大きなJSONは取り込まない。

HTMLにCSPのmeta指定はない。これは追加防御の検討事項であり、単独で今回の情報流出を示すものではない。公開HTTPヘッダーは取得できていないため、CSPやframe制限の有無を断定していない。

## 検証と再実行

配信ツリーで `tests/browser/security-audit.test.js` の5件成功。18入口の情報取得・通信、同一/別オリジンの保存境界、深いJSONの拒否、平文共有範囲、prototype/CSV/ICS攻撃文字列を確認。既存 `local security checks` の1件も成功し、18入口と明示35出力を確認した。

```bash
git -C /workspace/codex-tool-lab archive 294b38843bdd4a70572898ddaec821a6b1a9f1f1 | tar -x -C /tmp/os-security-audit-20261002/deployed
OS_AUDIT_RUNTIME_ROOT=/tmp/os-security-audit-20261002/deployed node --test tests/browser/security-audit.test.js
node --test --test-name-pattern='local security checks' tests/browser/app.test.js
```

最初の展開先は事前に作成する。環境変数を省くと現在の作業ツリーを対象に実行する。テストは合成データだけを使用し、再現用の別パスHTMLは検証サーバーで生成する。監査用コードと記録はアプリ配信対象外で、今回アプリの実装・公開内容は変更していない。

## 未確認事項と正式スキャンの制約

- 公開URLへのHTTP要求は環境のプロキシで `CONNECT tunnel failed, response 403`。配信ブランチを検証したが、GitHub Pagesが実際に返すHTML・ヘッダー・リダイレクトは未検証。
- Search Consoleのセキュリティ問題・Googleの検出URL/理由、アカウント上の他のPagesサイト、実機Safari/Chrome・拡張機能・端末侵害は未確認。Google警告の原因特定・解除は完了していない。
- 正式な `codex-security:security-scan` は実行できなかった。[SKILL.md](skill://Plugin_1e648473be9c8191a91ac3947151af55/security-scan/SKILL.md) は “Start source review and launch scan workers only after preflight returns `ready`.” と指定するが、必須の参照 `scan-prologue.md` / `core-scan.md`、preflight・完了ツール/スクリプトを利用できなかった。
- その正式ワークフローは未実施。この文書とテストは別途行った手動監査であり、正式Codex Securityの生成レポート・完了証明ではない。検証済み範囲に無断取得を示す証拠はないが、未知の脆弱性がないとは保証しない。
