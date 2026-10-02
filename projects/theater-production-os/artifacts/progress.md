# 作業・再開記録

## 対象と基準

- 依頼: 劇団制作OSの初回実装。判断できない問題・仕様の矛盾があれば止めてユーザーへ確認する。
- 作業ブランチ: tool/theater-production-os/budget-mvp
- 仕様基準: PR #1、e9e82820f42f660496fc6574b21bae66d64c012e
- 変更範囲: projects/theater-production-os/ のみ。
- 2026-09-30: 仕様PRをfast-forwardで取り込み、統合仕様18章と初回SPEC/TASK/データ契約を確認。

## 完了した作業

- OS入口index.html、公演マスター編集、予算の単体入口modules/budget/index.html。
- shared/model.js: 共通検証・保存・JSON復元・専用キー削除。shared/app.js: OSの画面と共通操作。
- modules/budget/calculator.js: 安全な計算。editor.js: 予算固有の入力画面。
- 保存失敗・破損保護・書出し・確認付き復元/消去・未知公演IDの案内。
- 単体39件、ブラウザ11件成功。lockfileでのnpm ciを確認。起動コマンドとHTTP 200を実測。
- README、SPECの判断、状態、artifacts/verification.md、サンプルJSON、画面画像を更新。
- 実行時依存なし。ブラウザ検証のみ、OS内のPlaywrightを使用。

## 未完了・次の作業

- 実装PRの作成・レビュー・採用は別途確認。mainへマージしていない。
- Firefox/Safari/実機スマホ/スクリーンリーダーは未検証。
- カレンダー・ダッシュボード・他モジュールは後続SPEC/TASKの対象。全OS完成ではない。
- 販売用ZIP・ライセンス・課金方式は未定義。単体入口もOS内sharedを参照する。
- Notionへ反映する判断候補はSPEC末尾。Notion原本は編集していない。

## 再開手順

1. AGENTS.md、README.md、SPEC.md、TASK.md、データ契約、git statusと検証記録を読む。
2. 現在のブランチ・差分・PR状況を確認し、上記の未完了箇所から進める。既存の作業を上書きしない。
3. 起動はこのプロジェクトでPython HTTPサーバー。テストはnpm test / npm run test:browser。
4. PR採用後にTASKをdocs/archive/へ保存し、次の対象モジュールのTASKへ切り替える。
5. 不明な要件や仕様の矛盾は独断で埋めず、ユーザーへ確認する。


## 停止時の状況 — 2026-09-30

- 最終結果: npm test 39/39成功、npm run test:browser 11/11成功。相対リンク31件にリンク切れなし。
- 実装PRの準備で gh api repos/humandoll26/codex-tool-lab/pulls/1 を実行したところ、GitHub APIへのGETがForbiddenで失敗。
- 通常のGit読取は成功済みだが、GitHub APIのアクセス可否は別。通信制限かAPI権限かは未確定で、認証情報の不足とは断定していない。
- ユーザーの「困ったことがあれば止めて確認」に従って停止。新規実装ブランチのpush、実装PR作成、mainへのマージは行っていない。
- 作業差分はローカルブランチ上に未コミットで保持。未追跡ファイルを含め、次回git statusで確認する。
- 再開時はGitHub APIへのアクセスを確認し、差分の保存・push・仕様PRを基準にした実装PR作成を行う。


## GitHub APIの調査結果 — 2026-09-30

- ユーザーの調査指示により、設定メタデータと読み取り通信を確認。アプリコード・通信設定・秘密情報は変更していない。
- 保存されている環境設定はrestricted、package_managersプリセットのみ、追加のegress_rulesなし。
- 実環境ではGH_TOKENとHTTPS_PROXYの存在を確認。値は表示・コピーしていない。
- 認証なしの https://api.github.com/ とPR #1の読取URLの両方で、HTTPS CONNECTが Tunnel connection failed: 403 Forbidden。
- npmレジストリはHTTPS 200、既存HTTPS Git経由のmain・仕様ブランチ読取も成功。
- 結論: 現在のGitHub API操作は、GitHub APIのHTTP認証判定より前にクラウドのプロキシで拒否されている。トークン不足や失効が原因とは断定できない。
- 次の対応案: 環境設定でapi.github.comへのHTTPS通信許可を追加・反映し、その後同じ読取を再実行。通信が通ってからAPI認証・リポジトリ権限を確認する。
- 通信設定の変更、新たなトークン要求、push、PR作成はまだ行っていない。ユーザーの確認待ち。


## GitHubへの受渡し — 2026-09-30

- ユーザーの依頼により、実装をコミットし、Gitの既存認証でpushを実行。
- 実装コミット: bdd4dbf（feat(theater-production-os): add project master and budget module）。
- git push --set-upstream origin tool/theater-production-os/budget-mvp が成功し、GitHubに同名ブランチを作成。
- GitHub APIへの接続拒否はGit pushを妨げなかった。通信設定や認証情報は変更していない。
- コードはGitHubから取得可能。初回取得は git clone --branch tool/theater-production-os/budget-mvp https://github.com/humandoll26/codex-tool-lab.git 。
- 既存の手元リポジトリではgit fetch origin後、この作業ブランチへ切り替える。未コミットの手元変更がある場合は先に保管する。
- PRは未作成、mainへのマージも未実施。GitHubのWeb画面からPRを作成できる。
- 前項の「未コミット・未push・ユーザー確認待ち」は停止時点の履歴。本項でコミットとpushの成功を記録した。


## iPhone確認用のPages配信準備 — 2026-09-30

- ユーザーがリポジトリを公開し、Pages公開を依頼。
- アプリ7ファイルと.nojekyllだけの配信ツリーを作り、gh-pagesブランチへpush成功。remoteのコミット一致を確認。
- 配信コミット: f79477c8c8ed27351975b5dc8c46b82a011906d2
- 実装の基準コミット: b817beca86c3f61f32128f192c02c9298b772853
- OS入口は配信ルート/index.html、予算入口は/modules/budget/index.html。相対パスを維持。
- GitHub Pages設定APIへのPOSTはForbiddenで拒否され、設定変更を確認できていない。
- 公開先URLへの読取もクラウドのプロキシでCONNECT 403。公開完了やHTTP 200は未確認。
- ユーザーの必要操作: GitHub Settings → Pages → Deploy from a branch → gh-pages / (root) → Save。
- 設定・配信完了後の想定URL: https://humandoll26.github.io/codex-tool-lab/
- アプリコード・mainブランチ・GitHubの通信設定や認証情報は変更していない。

## 継続MVP — 作業中

- 2026-09-30: ユーザーから継続実装の許可。docs/mvp-next.mdに範囲・判断・受入条件を追加。
- 予算＋flyer/distribution/publicity/ticketsの5モジュール、カレンダー・逆算予定・ダッシュボードを順次実装する。
- 旧phase-1保存契約とデータを保持。実装PR未採用のため初回TASKをアーカイブしない。
- この項目時点では追加モジュール・OS横断機能の実装検証は未完了。

## 継続MVP — 実装・検証完了

- 2026-09-30: MVP v0.2として5モジュール（予算・チラシ・配布・SNS広報・販売進捗）、ダッシュボード、月間／今週／今日カレンダー、逆算テンプレートを実装。
- modules/<id>/に単体入口・固有モデル・画面・READMEを配置。共通保存・マスター連動はshared/に集約。
- モジュール状態／開始日／期限／進捗、部数／販売集計、原稿テキストとCSV出力、該当作業への予定リンクを追加。
- JSONはschemaVersion 1と旧保存キーを保持。未知拡張・旧予定を保持し、互換性のない旧モジュールは確認なしに初期化しない。
- samples/demo.jsonと「サンプル公演を試す」を追加。既存公演の置換は確認を要求する。
- 単体66件、ブラウザ21件成功。375px表示の横溢れなし。詳細はverification.md。
- scripts/publish-pages.pyでコミット済みアプリだけをgh-pagesへ配信できる。mainへのマージとPR作成は未実施。
- 今後の候補: 実機Safari確認、稽古・提出物のモジュール化、販売用の独立パッケージ構成。共同編集・クラウド同期・決済は未実装。
- 再開: README、docs/mvp-next.md、artifacts/verification.mdを読み、作業ブランチでnpm test／npm run test:browserを実行。単体販売向けのライセンスや配布形態はユーザーと決める。

## MVP v0.2 — GitHub・Pages配信記録

- 実装コミット: 29ab2a0e1f26816ce2040c23c5e52157f6913a14
- 実装ブランチ: tool/theater-production-os/budget-mvp。originへのpush成功。
- 配信コミット: 065c77b8eaacf11bca444e8f114b551cc76e70b9。gh-pagesへのpush成功、ls-remoteで一致を確認。
- 配信内容: アプリ28ファイル＋.nojekyll。仕様・テスト・node_modulesは含まない。
- 配信コミットを別の一時ディレクトリへ取り出し、HTTP配信してサンプル取込みと全8画面をChromiumで起動。HTTPエラー・JavaScript例外0。
- Pages設定はgh-pages / (root)。想定公開URLは https://humandoll26.github.io/codex-tool-lab/ 。クラウドから公開サイトのHTTP応答は未確認。
- 「サンプル公演を試す」は既存公演の置換確認あり。ユーザーは必要に応じJSONを書き出してから試す。

## Chrome危険サイト警告の調査

- ユーザー提供URL https://humandoll26.github.io/codex-tool-lab/ を対象に、配信ブランチと実装の一致、ローカルでの全8画面の通信経路を確認。
- 外部通信・GET以外の送信・JavaScript例外0。公開サイトやGoogle判定情報はプロキシ403により未取得。誤検知との断定はしない。
- 詳細と再開手順はartifacts/safe-browsing-investigation.md。Googleへの報告や設定変更は未実施。

- 追加調査: 公開前は正常だったとのユーザー情報から制作OSを第一候補として再確認。悪意あるHTML文字列を投入した8画面でも実行・外部通信・自動ダウンロードなし。具体的な警告原因は未特定。security-scanは参照／実行ツール不足で正式実行できず、手作業の確認として記録。Google判定の詳細情報が必要。

- 手元限定の検証をテスト化: 全8入口、悪性文字列、外部通信遮断と検知、手動の5書出し形式を確認。単体66件／ブラウザ22件成功。アプリコードを変更する根拠となる原因は未発見。テスト・記録だけを更新し、公開内容は維持。

## 2026-10-01 — MVP v0.3作業中

- ユーザーの継続実装指示により稽古・提出物を追加。docs/mvp-v0.3.mdと各モジュールSPEC/TASKに範囲を記録。
- 2子フォルダに入口・固有モデル・編集画面を実装し、7モジュールを登録。稽古日時と提出期限をカレンダーに集約。
- 日時／場所の明示変更履歴、全体連絡文、CSV、提出日必須、差戻し・再提出、サンプル7モジュール化を追加。
- 既存のGoogle警告は別件として未解決。警告解除の申請や回避は行っていない。
- この時点で単体83件成功。ブラウザ確認と配信は進行中。

## MVP v0.3 — 検証完了

- 単体83件／ブラウザ24件成功。全10入口で悪性文字列の非実行、外部通信・自動ダウンロードなしを確認。
- 375pxで入力・作業リンクを検証、稽古・提出物の画面をartifactsに保存。NEXT-01〜NEXT-06の実測はverification.md。
- 稽古予定の変更履歴は明示操作で保存。同じ記録は重複せず、JSONで保持。完了・中止稽古と提出済み書類は期限超過から除外。
- 再開時はREADME、docs/mvp-v0.3.md、2モジュールのSPEC/TASK、検証記録を確認。npm test／npm run test:browserで再現できる。
- 次の候補は受付準備・決算。Google警告対応、実機Safari検証、販売用配布物とライセンスは残件。Notion原本は未変更。

## MVP v0.3 — GitHub・配信完了

- 実装コミット: 0a213c4601f7056792ced2fbf7775fa8d57f6b46。tool/theater-production-os/budget-mvpへのpush成功。
- 配信コミット: 730628a58e325c6a14c5a18fc1e0ed6eafa4984e。gh-pagesへのpushとremote一致確認成功。
- アプリ34ファイル＋.nojekyll。公開ツリーを読み出してローカルHTTPでサンプル導入と全10画面を起動。ソース一致、HTTPエラー・JavaScript例外0。
- mainへのマージとPR作成は未実施。公開URLのHTTP応答・Google警告解除・実機iPhoneは未確認。

## 2026-10-02 — MVP v0.4継続

- ユーザーは「5時間制限が30%になるまで継続」を指示。環境に使用枠残量の読取手段はなく、割合を推定せず機能ごとに検証とコミットを行う。
- 受付、決算、パンフ、舞台進行を4子フォルダに実装。登録・予定集約はshared、固有モデル・画面は各子フォルダ。
- 決算は収入／経費と入出金を区別、未収／未払を集計。釣銭と参考売上は別。舞台の時間重複は同部署・同場所に注意。
- 単体105件成功。ブラウザ確認と配信は作業中。Google警告は別件で未解除。

- v0.4の単体105件／ブラウザ28件が成功。今回の4モジュールの受入結果をverification.mdへ記録。次工程開始前にコミット・配信を行う。

- v0.4実装0d5052011e8dce8c161f25857409f121764db28eを作業ブランチへpush成功。配信169823f69928cff5ff365d932116f578042cdde1をgh-pagesへpush、remote一致確認。次に劇場・作品権利・当日運営を実装する。

## 2026-10-02 — MVP v0.5作業中

- 追加3モジュールで12工程＋稽古／提出物の14入口。会場候補、本予約・支払、権利確認、当日記録・物販を実装。
- 同じ会場行の候補日・仮押さえ期限・支払期限は異なる予定IDを生成。作業行IDは維持。
- 作品許諾の確認日と根拠を検証、物販売上と未対応トラブルを集計。決算やステージ日時を無言で変更しない。
- 単体125件成功。ブラウザ・画面・配信の確認を進める。Google警告と使用枠残量の読取不能は継続。

- v0.5の単体125件／ブラウザ31件成功。14モジュール・17画面と安全な手動書出しを確認。追加7画面の375pxスクリーンショットを記録。次はモジュール切替と画面の軽量化を進める。
