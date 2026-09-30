# 複数ツールの運用・配置

## プロジェクトの境界

既存の `projects/<tool-id>/` を1ツールまたは1ツール群の管理単位として使う。
劇団制作OSのような統合システムは `projects/theater-production-os/` に置き、その子に `modules/<module-id>/` を置く。
OSのモジュールをルートの別プロジェクトへ分散させない。無関係のツールは別の `projects/<tool-id>/` に置く。

```text
codex-tool-lab/
  AGENTS.md
  README.md
  docs/repository-workflow.md
  ideas/                          まだ実装対象にしていない案
  templates/project/              既存の単体ツール用ひな形
  projects/
    README.md                     ツール一覧
    theater-production-os/
      index.md                    設計・実装状況の入口
      README.md
      SPEC.md                     現在の実装範囲と受入条件
      TASK.md                     今回の作業指示
      docs/
        specs/                    出典と版を持つ統合仕様
        architecture.md
        data-contract-v0.1.md
        archive/                  差し替えた旧仕様・完了した作業指示
      artifacts/                  検証記録
      index.html                  実装時に作るOSの入口
      shared/                     OS内の共通データ・保存処理
      modules/
        budget/                   予算モジュール
          README.md
          index.html              実装時に作る単体起動の入口
        <module-id>/              必要になった順に追加
    <another-tool>/               OSとは独立した別ツール
```

図の `index.html` は実装予定。仕様登録の段階では動くアプリや空の実装ファイルを作らない。
静的な統合ツールはルートの `index.html` と子モジュールの入口を揃える。既存の単体ツールは `src/index.html` の規約をそのまま使える。
フレームワークが必要になった場合は、論理的な親子関係を保ちながら標準のソース配置に変更し、プロジェクト内の設計書と起動手順を更新する。

## 仕様とアーカイブ

- Notionは正本。GitHubには取得日時・版・出典を持つスナップショットを保存する。
- `docs/specs/` の原本転記と、実装判断を含む `SPEC.md` を区別する。原本転記を実装上の都合で書き換えない。
- 現行の `SPEC.md` は実装後も残す。完了状態、対応PR、残る制約を更新する。
- 差し替える前の `SPEC.md` と完了済み `TASK.md` を必要に応じて `docs/archive/YYYY-MM-DD-<topic>/` に保存し、後継ファイル・対応PR・廃止理由を記録する。
- ビルド成功だけを理由に仕様を移動しない。受入条件の検証とPRの採用をもって作業完了とする。
- `docs/archive/` は設計資料の履歴。`dist/`、`build/`、依存、個人の公演データの保管場所にはしない。
- モジュール内の「公演アーカイブ」は将来のアプリ機能であり、設計資料アーカイブとは別のもの。

## Cloudでの作業単位

1. 仕様と作業指示をコミットする。初回は仕様追加PRで構成を確認する。
2. 1タスクは1プロジェクト、その中の1モジュールまたは1つの統合機能を基本にする。
3. 指示には対象パス、読む仕様、受入条件、変更可能範囲を記す。
4. 初回の共通データ・保存処理はOS内の `shared/` に置く。モジュール間の契約を変える作業は、対象と影響を明記する。
5. 次の作業に移る前に検証記録・README・仕様の状態を更新する。旧TASKの保管後に新TASKを書く。
6. 各作業はブランチとPRで確認し、確認済みのものをmainへ反映する。

ブランチ例: `tool/theater-production-os/budget-mvp`。
別ツールへの波及、ルート依存管理、一括ビルド、CI、公開設定は、それが必要なタスクで扱う。
最初から全ツールを共通基盤に依存させない。各ツールの依存・起動・検証はそのフォルダ内で完結させる。

## 一覧の状態

`projects/README.md` の状態は `draft / implementing / usable / parked`。
OS全体と各モジュールの状態は別に管理する。予算だけ動いてもOS全体を `usable` にしない。
未実装モジュールには将来予定と分かる表示を付け、実装済み画面への導線と混同させない。
