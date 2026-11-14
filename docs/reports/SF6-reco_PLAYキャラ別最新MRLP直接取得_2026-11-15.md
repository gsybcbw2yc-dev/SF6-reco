# SF6-reco — PLAY「キャラクター別MR/LP」直接取得の実装・検証報告
日付：2026年11月15日（JST）

## 依頼と結論
Buckler公式PLAY画面「キャラクター別マスターレート／リーグポイント」を使い、**お気に入りに設定していない豪鬼・テリー両方の直近MR/LPを取得したい**という依頼。既存の `BUCKLER_ID` GitHub Secret を再利用し、公式PLAYのキャラクター別リーグ情報を定期収集に統合した。

**実現：** `/6/buckler/profile/{player}/play` のNext.js埋込データ `pageProps.play.character_league_infos[]` に33キャラクター分のレコードがあり、各レコードの `character_alpha`、`league_info.master_rating`、`league_info.league_point` を取得できることを認証済みGitHub Actionsで確認した。画面の「直近」選択に対応するデフォルトのPLAYページで、豪鬼の実際の値はユーザー画像と同じ **1403 MR** だった。

## 実測結果
2026-11-15 07:25:07 JST、定期収集の1回の実行で両キャラを取得。

| キャラ | MR | LP | 備考 |
|---|---:|---:|---|
| AKUMA（GOUKI） | **1403** | **114705** | お気に入りの選択によらずPLAYページから取得 |
| TERRY | 0（未マスター） | **23033** | MR=0はレーティング未計測として扱う |

- `web/data/play-source.json`：`result=success`、`characters_available=2`、`characters=["AKUMA","TERRY"]`。
- `web/data/status.json`：`latest` に両者があり、`last_error=null`。
- `web/data/history.json`：従来の履歴を残し、両キャラそれぞれの時刻07:25:07 JSTの新しい定期観測を保存。
- 2026-11-15 05:00の豪鬼更新停止問題は、現時点で公式PLAYから「お気に入り以外の豪鬼も取得できる」ことを実データで解消した。今後は既存の外部 :00/:30 + GitHub予備 :11/:41 の定期実行で同じ経路を利用する。ただしActionsのスケジュール遅延や公式サイトのアクセス障害はあり得る。

## 設計と変更
- `collector/play_leagues.py`：PLAYからの取得・スキーマ検証・候補の正常化。GOUKI→AKUMAとし、LP0のプレイ済みルーキーは有効、MR0/LP nullの無効な空レコードは収集しない。
- `collector/collect.py`：元のプロフィールバナー・バトルログ取得のあと、新しいPLAY取得で該当キャラの値を上書きし、残るバナー値をフォールバックとして保持。PLAY取得が不可能なときは既存のバナー収集を継続し、`play-source.json` に安全な状況を記録。
- `tests/test_play_leagues.py`（新規）：33件相当の一部合成データを使い、複数キャラ解析、MR0、LP0、欠損、フェーズ、出力安全性を検証。
- `.github/workflows/collect.yml`：一時的なPLAY構造調査を削除し、通常の収集処理に統合。追加の認証情報、外部サービスは不要。
- `web/data/play-source.json`（自動生成）：PLAY収集の成否、キャラ数、対象名を表示可能な形式で保存。
- `web/data/history.json`：初期統合の検証過程で32キャラのうち一部からMR0/LP-nullの無効な空レコード60件が混入したことを発見。明確に `rating_source=play_character_league_infos` かつ `mr=0` かつ `lp=null` の60件のみを削除。既存の実測・バトルログや、豪鬼・テリーの実データは変更しなかった。
- `web/data/play-probe.json` は一時的な構造診断ファイルだったため、検証終了後に削除。無用な追加の外部リクエストを止めた。

## 根拠の意味
- PLAYで取得したMR/LPは**キャラ別表示の公式最新スナップショット**。プロフィールのお気に入り表示より複数キャラ追跡に適する。
- バトルログの個別試合アップロード日時・対戦前MR/LPは別系列であり、従来どおり保存。PLAYのスナップショット時刻を実際の試合時刻として扱わない。
- PLAY `pageProps` には、今回の取得時点で検証可能な明示的フェーズIDが無かったため、データ内フェーズは `unknown` のまま維持。ユーザー申告のAct14暫定表示と混同しない。
- キャラごとの値は公式ページの更新タイミング、対象Act、Buckler側の反映遅延に依存。ユーザーが画像を撮影した時点と値が異なる可能性がある。

## 検証と公開
- GitHub Actions `Collect SF6 ratings` **run 43647970250: completed / success**。Python・Node回帰テスト、実際のPLAY取得、データ保存、GitHub Pages公開・公開データ照合はすべて成功。
- https://github.com/gsybcbw2yc-dev/SF6-reco/actions/runs/43647970250
- サイト：https://gsybcbw2yc-dev.github.io/SF6-reco/
- iPhone Safariの修正後表示と次の予定スロットでの追跡継続は、まだ実機・将来の収集で検証する必要がある。
