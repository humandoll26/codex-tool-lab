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
