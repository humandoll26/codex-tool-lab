# Codex Tool Lab

GPTで仕様を相談し、Codex Cloudで複数の小ツールを試作するラボです。

## 仕様の位置づけ
**Notionは正本、GitHub上の仕様は実装時点のスナップショット**です。
NotionのURL・取得日時・版をSPEC.mdに記録し、実装に必要な内容をコピーします。CodexがNotionを取得できることは前提にしません。
実装中の判断や仕様変更はSPEC.mdとPRに記録し、採用後に人がNotionへ反映します。
GPTから直接登録したアイデアは出典を「GPT直接入力」、Notion URLを「未登録」と明記します。

## 構成
```
AGENTS.md                  Codex共通指示
repo.md                    実装指示テンプレート
ideas/                     実装前のアイデア
templates/project/         新規ツールのひな形
projects/<tool-id>/
  SPEC.md                  実装時点の仕様
  TASK.md                  今回の実装指示
  README.md                起動・検証・制約
  src/                     ソース
  tests/                   必要なテスト
  artifacts/               検証記録・小さなサンプル・画面画像
```

## 基本の流れ
1. GPTと相談してNotionで目的・MVP・受入条件を決める。未確定案はideas/に置く。
2. templates/project/をprojects/<tool-id>/へコピーする。IDは英小文字のkebab-case。SPEC.mdを記入する。
3. repo.mdを対象フォルダのTASK.mdへコピーして記入する。ルートrepo.mdはテンプレートとして残す。
4. GitHub連携でこのリポジトリのアクセスを許可し、Codex Cloudの環境に選択する。対象仕様をコミットしたブランチを使い、次のように依頼する。
5. 差分・動作を確認してPRをmainへマージし、採用した仕様変更をNotionへ反映する。

```text
AGENTS.md、projects/my-tool/SPEC.md、projects/my-tool/TASK.mdを読み、
projects/my-tool/内でMVPを実装してください。
受入条件を検証し、README.mdとartifacts/verification.mdに結果を残してください。
```

このリポジトリにはCloud環境の自動設定は含みません。環境のセットアップは対象ツールに必要なものだけ指定します。

## 技術選択と依存
- HTML/CSS/JS: src/index.htmlから開始。依存不要。HTTPが必要ならREADMEに起動方法を記載。
- Node: 対象ツール内にpackage.jsonを配置。必要ならNode標準テストを利用。対応Node版と実行コマンドをREADMEに記載。
- Astro/React: 必要なツールだけに導入。フレームワークの標準構成を尊重し、構成変更はSPECに記録。

ルートpackage.json、workspaces、共通依存、CIは初期導入しません。
インストール・起動・テストは各ツールのディレクトリで行い、lockfileを保存します。
lockfileがあれば対応する再現可能なインストール方法を使います。全ツールを一括インストールしません。

## 成果物
ソース・仕様・再現可能なテスト・小さな架空サンプルはGitへ保存します。
artifacts/に検証手順、期待結果、実測、未実施項目と必要な画像を保存します。
dist/build、依存、キャッシュ、一時出力はコミットしません。大きな配布物は必要時にReleases等へ保存します。
秘密情報、個人情報、Notion全文の無差別コピーは入れません。

## ブランチとコミット
mainは確認済みの基準。1タスク・1ツールを基本にします。
ブランチはtool/<tool-id>/<short-task>。Cloudが自動命名する場合はその名前でも可。
コミット例: docs(my-tool): snapshot MVP spec、feat(my-tool): add CSV export、test(my-tool): cover empty input。
PRに対象、仕様パス、変更、検証結果、既知の制約を記載し、確認後のsquash mergeを基本とします。
停止した実験はREADMEに停止理由を残します。

## 統合ツールとモジュール

複数の作業モジュールを束ねるツールは、親プロジェクト内の `modules/<module-id>/` で管理します。
[複数ツールの運用・配置](docs/repository-workflow.md)に配置、段階開発、仕様とアーカイブの扱いを定めています。

- [劇団制作OSの設計入口](projects/theater-production-os/index.md)
- [ツール一覧](projects/README.md)

現行SPECは実装後も残し、差し替えた旧仕様と完了TASKだけを必要に応じてdocs/archive/へ保存します。
