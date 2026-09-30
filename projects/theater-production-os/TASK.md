# 初回実装指示 — 公演マスターと予算モジュール

- 対象: projects/theater-production-os/
- 作業: phase-1 v0.1の実装
- 目的: 1公演の共通情報を保存し、予算ツールをOS入口と単体入口から使えるようにする。
- 変更可能範囲: projects/theater-production-os/内
- 技術: HTML/CSS/JavaScript。必要な依存はこのプロジェクト内
- 完了条件: SPEC.mdのAC-01〜AC-12。OS全体のMVP完成とはしない

## 先に読む

1. ルートAGENTS.md
2. このフォルダのREADME.md、SPEC.md、本TASK.md
3. docs/architecture.md、docs/data-contract-v0.1.md
4. docs/specs/theater-production-os-spec-v0.1.md
5. modules/budget/README.md

## 作業

1. OS入口のindex.html、公演マスターの最小UI、shared/の保存・検証アダプタを作る。
2. modules/budget/index.htmlに単体でも使える予算・料金・損益分岐を実装する。
3. OSからの公演ID受渡し、モジュール状態、JSON保存・復元・確認付き消去を実装する。
4. 計算・入力・復元の重要なケースを検証し、画面で起動・遷移・保存・モバイル操作を確認する。
5. READMEとmodules/budget/READMEに実際の起動・テスト方法、対応環境、制約を書く。
6. artifacts/verification.mdに受入条件ごとの手順・期待値・実測・未実施理由を残す。
7. SPECに判断や変更を記録し、index.mdとモジュール一覧の状態を実態に合わせる。

統合仕様の全18章を一度に実装しない。カレンダー、ダッシュボード、他モジュール、同期、決済、外部投稿、デプロイは今回の対象外。
予算の入力・計算・保存が安定するまで、余分なテスト基盤や全ツール共通基盤を追加しない。
ルートや別ツールを変更する必要が出たら理由を報告し、範囲を確認する。
公開や本番データの投入はこのTASKに含まれない。

## 成果物

- 起動できるOS入口と予算モジュール
- 共通保存アダプタと検証処理
- 必要なテストと架空サンプル
- README、SPECの判断記録、artifacts/verification.md
- 対象パス、仕様版、変更、検証、未対応事項を記したPR

PR採用後、完了したTASKをdocs/archive/へ保存して次のTASKに切り替える。現行SPECは残す。
