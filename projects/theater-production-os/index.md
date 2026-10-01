# 劇団制作OS — 設計の入口

- 状態: **OS MVP v0.3実装済み（7モジュール・カレンダー・ダッシュボード、PR採用前）**
- プロジェクトID: `theater-production-os`
- OS入口: `index.html`
- 予算の単体入口: `modules/budget/index.html`

## 読む順番

1. [README](README.md): 状況・利用方法
2. [統合仕様 v0.1](docs/specs/theater-production-os-spec-v0.1.md): Notionの全文
3. [構成・開発段階](docs/architecture.md): OSとモジュールの関係
4. [今回の実装仕様](SPEC.md): 共通データと予算モジュール
5. [今回の作業指示](TASK.md): Cloudへ渡す範囲
6. [共通データ契約 v0.1](docs/data-contract-v0.1.md)
7. [モジュール一覧](modules/README.md)
8. [検証記録](artifacts/verification.md)
9. [設計資料のアーカイブ](docs/archive/README.md)

## 最初の作業

公演マスター、共通保存、予算・料金・損益分岐を実装し、AC-01〜AC-12を検証済み。
起動・テストはREADME、実測は検証記録、再開時の状況は [作業記録](artifacts/progress.md) を参照。
[追加MVP仕様](docs/mvp-next.md)に基づき、チラシ・配布・SNS・販売進捗・カレンダー・逆算予定・ダッシュボードを実装。
次はiPhone実機確認と、稽古・提出物等の後続モジュール。

- [稽古・提出物の追加仕様](docs/mvp-v0.3.md)
