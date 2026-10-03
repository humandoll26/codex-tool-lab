# モジュール一覧

各モジュールはOSの子フォルダに置き、単体起動とOSからの起動の両方に対応する。
予算・チラシ・配布・SNS・販売進捗・稽古・提出物・受付・決算・パンフ・舞台進行・劇場・作品／権利・当日運営・アーカイブ・契約支払い・助成金協賛広告を実装。他は計画。

| ID | 役割 | 状態・予定 |
| --- | --- | --- |
| venue | 劇場・日時候補 | usable：OS MVP v0.5 |
| rights | 作品情報・上演権確認 | usable：OS MVP v0.5 |
| budget | 予算・料金・損益分岐 | usable：phase-1の受入条件を検証済み |
| flyer | チラシ掲載情報・校正・入稿 | usable：OS MVP v0.2 |
| distribution | チラシ配布先・部数 | usable：OS MVP v0.2 |
| publicity | SNS・告知計画 | usable：OS MVP v0.2 |
| tickets | ステージ別販売進捗 | usable：OS MVP v0.2 |
| program | パンフ原稿・校正 | usable：OS MVP v0.4 |
| rehearsal | 稽古・連絡調整 | usable：OS MVP v0.3 |
| stage-operations | 建込・舞台進行 | usable：OS MVP v0.4 |
| front-desk | 受付準備 | usable：OS MVP v0.4 |
| show-day | 当日運営・物販記録 | usable：OS MVP v0.5 |
| settlement | 決算 | usable：OS MVP v0.4 |
| contracts | 契約・支払い | usable：OS MVP v0.14 |
| funding | 助成金・協賛・広告 | usable：OS MVP v0.15 |
| travel | 交通・宿泊・ケータリング | planned：拡張 |
| submissions | 申請・劇場提出物 | usable：OS MVP v0.3 |
| archive | 公演資料・実績・引継ぎ | usable：OS MVP v0.9 |

公演マスター、カレンダー、ダッシュボードはOS側の機能。
将来の電子チケット・QR受付は独立サブシステムとして別仕様で扱う。

## モジュール追加時

`modules/<module-id>/` にREADME、必要なソース・テストを置く。対象が増えたらそのモジュールにSPEC/TASKを切り出し、OSのSPECと一覧からリンクする。
OS共通仕様とモジュール固有仕様の重複コピーを避け、共通データ契約を参照する。
状態は `planned / draft / implementing / usable / parked`。実装済みの判定には受入条件と検証記録が必要。
