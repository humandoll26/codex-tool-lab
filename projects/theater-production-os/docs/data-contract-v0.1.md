# 共通データ契約 v0.1 — 初回の提案

これはNotion原本10章のフィールド案を、初回実装に必要な粒度へ具体化した実装用提案。
統合仕様の全文を書き換えない。採用後にNotionへ反映する。

## 保存の単位

JSONファイルとlocalStorageは同じラッパーを使う。

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "project-demo",
    "title": "架空公演",
    "companyName": "サンプル劇団",
    "timeZone": "Asia/Tokyo",
    "venue": { "name": "サンプル劇場" },
    "performanceDates": [
      { "id": "stage-1", "startsAt": "2026-11-30T14:00:00+09:00", "capacity": 100 },
      { "id": "stage-2", "startsAt": "2026-11-30T18:00:00+09:00", "capacity": 100 }
    ],
    "ticket": {
      "priceCategories": [
        { "id": "general", "name": "一般", "price": 3000 }
      ]
    },
    "modules": {
      "budget": {
        "id": "budget",
        "status": "in-progress",
        "startDate": null,
        "dueDate": null,
        "progress": 0,
        "alerts": [],
        "data": {
          "fixedCosts": [
            { "id": "cost-1", "name": "固定費合計", "amount": 100000 }
          ],
          "variableCostPerAttendee": 500,
          "plannedSales": [
            { "stageId": "stage-1", "priceCategoryId": "general", "quantity": 80 },
            { "stageId": "stage-2", "priceCategoryId": "general", "quantity": 80 }
          ],
          "referencePriceCategoryId": "general"
        }
      }
    },
    "calendarEvents": [],
    "documents": [],
    "updatedAt": "2026-09-30T20:00:00+09:00"
  }
}
```

サンプルは架空。IDは例示の文字列で、実データは生成した安定IDを使う。
初回は1公演。将来の複数公演対応はschemaVersionの移行を定義してから行う。

## フィールドと規則

| フィールド | 規則 |
| --- | --- |
| schemaVersion | 整数1。未知の版は取込み拒否 |
| project.id | 空でない安定文字列。公演名変更で変えない |
| title | 前後の空白を除き必須 |
| companyName / venue.name | 文字列。未入力可 |
| timeZone | 初回はAsia/Tokyo |
| performanceDates | 配列。ステージIDは公演内で一意 |
| startsAt | タイムゾーン付きISO 8601。初回は+09:00 |
| capacity | 販売可能席数、0以上の安全な整数 |
| ticket.priceCategories | 料金IDは公演内で一意、名称必須、料金0以上の安全な整数円 |
| modules | キーがモジュールIDのオブジェクト |
| module.id | modulesのキーと一致 |
| status | not-started / in-progress / completed / on-hold / not-needed |
| startDate / dueDate | YYYY-MM-DDまたはnull |
| progress | 0〜100の数値。初回は状態とは別に保管できればよい |
| alerts | 配列。初回は空配列でよい |
| data | モジュール固有のJSONオブジェクト |
| calendarEvents / documents | 初回は空配列。復元時は既存内容を保持 |
| updatedAt | 最後の妥当な更新のISO 8601日時 |

原本の「そろそろ開始」は将来の日付からの表示判定とし、初回の保存状態にしない。
原本のrehearsal、cast、staff、publicity等の拡張フィールドは初回未使用であり、インポートしたものはJSON値として保持する。
原本project.budget案は二重保存を防ぐため初回ではmodules.budget.dataへ集約する。これは原本からの具体化・変更提案。

## 予算の参照と検証

plannedSalesは（stageId, priceCategoryId）ごとに最大1行。欠けた組み合わせは0枚として扱う。
参照先IDは存在必須。ステージ別合計はcapacity以下。
fixedCostsは明細ID一意・名称必須・amountが0以上の安全な整数。
variableCostPerAttendeeとquantityも0以上の安全な整数。
referencePriceCategoryIdは存在する料金ID。料金値は公演マスターを都度参照する。
想定販売枚数は実績や予約者名簿とは別。税務計算はせず税込総額の試算。
計算式と境界値はSPEC.mdを正とする。

## 保存アダプタ

localStorageの専用キーは `codex-tool-lab:theater-production-os:v1`。
モジュールはアダプタを介して公演と自身のdataを読み書きし、他モジュールのデータを消さない。
保存時は入力と参照を検証し、妥当な状態のみ書く。データがない初期状態からは未完成入力を保存済み公演と扱わない。
JSON往復で安定ID、未実装モジュール、未使用の拡張フィールドを落とさない。
計算結果は入力から都度生成し保存しない。

読み込み・検証・置換確認が全部成功してから保存する。失敗時に元データを壊さない。
容量不足・保存利用不可を画面に示す。復元不能データは勝手に初期化しない。
全消去はこの専用キーだけ。別ツールのデータに触れない。
同じoriginの複数ページで共有する。複数タブ同時編集の競合処理は後続課題。

## 後続段階のイベント契約

原本のcalendarEventは id、projectId、moduleId、title、date、type、status、relatedItemIdを持つ。
後続のカレンダー実装で終日・時刻付き・範囲・重複生成防止・変更通知の詳細を決める。
日付だけの予定はYYYY-MM-DDとして扱い、UTC変換で前日になることを避ける。
type、statusの列挙や予定の置換ルールは未確定。初回は空配列を維持し、仮実装を入れない。

## MVP v0.3の追加データ

rehearsalとsubmissionsはmodules.<id>.data.version:1、itemsに安定ID付きの行を保持する。[追加MVP仕様](mvp-v0.3.md)と各モジュールmodel.jsが項目と妥当性を定義する。

稽古の履歴は各行のhistory配列。date、startTime、endTime、venue、recordedAt（UTC ISO時刻）を明示記録する。稽古日と開始／終了は日本時間の同日。提出物はdueDateと任意submittedDateをYYYY-MM-DDで保持し、submitted状態にはsubmittedDate必須。

既存のschemaVersion 1・保存キー・逆算6予定は維持。旧未実装形式はJSONで保持し、ユーザーの確認なしに置換しない。表示用の稽古／提出期限予定は都度生成し、calendarEventsへ重複保存しない。
