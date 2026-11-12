# SF6-reco — TERRY追加対応とキャラクター別表示の検証
作成日：2026-11-13 JST

## 依頼
「テリーも追加できますか？」への対応。既存AKUMA履歴を保持しつつ、TERRYのMR・LP・対戦履歴・分析・目標予測をキャラ別に選択できることを確認し、切り替え操作と表示の誤認を防ぐ。

## リポジトリ内の確認結果（修正前時点）
- `web/data/history.json` は既にAKUMA 144観測件、TERRY 53観測件を保存。
- TERRY最終観測値（2026-11-13 04:00:46 JST）：`mr:0`, `lp:22617`, `phase:'unknown'`。
- AKUMA最終観測値（2026-11-11 23:01:03 JST）：MR1373、LP113382。`mr:0` はTERRYの有効なMaster Ratingがまだ存在しない状態として表示上は「未計測」と扱い、取得元JSONは維持する。
- `web/data/matches/2026-11.json`：総570試合（AKUMA 480試合うちランク453、TERRY 90試合うちランク83、カスタム7）。
- `collector/collect.py` はfavorite等の取得元の候補を列挙する実装だが、直近の `status.json` `latest` にはTERRYのみ。**両キャラクターの同時・継続取得を保証するものではない**。お気に入りなどの表示を変えると取得対象が変わる可能性があり、最新の取得内容で確認する必要がある。

## 対応したコード
1. `web/app.js` — 概要と対戦履歴のキャラ選択連動。概要のTERRY選択時、試合一覧もTERRYへ切り替える。対戦履歴からの変更も概要側に反映。MRが0のキャラはMRを「未計測」と表示し、MRグラフ・MRトレンドから0の代用値を除外する。選択キャラ別の最終観測時刻と90分超の更新遅延を表示し、TERRYのみ更新中にAKUMAの値まで「取得正常」と表示する誤認を防ぐ。
2. `web/matches-ui.js` — 初期表示のキャラクターを概要の選択値に合わせ、試合側のキャラ変更を概要に同期する。
3. `web/match-goal-ui.js` — TERRYで有効なMRがないときは目標MR1500/1600の予測を保留し、「LP・対戦履歴は利用可能」と明記。
4. `web/time-analysis.js` — MR=0をマスターレートの有効な観測値とみなさず、時間分析から除外。取得元の履歴は変更しない。
5. `tests/test_dashboard.cjs` — TERRYのLP表示、MR未計測、MRグラフの空表示、概要⇄対戦キャラ連動、キャラ別の観測時刻の検証。
6. `tests/test_matches_ui.cjs` — TERRY試合フィルタと目標MR予測停止の検証。
7. `tests/test_time_analysis.cjs` — 0MRの窓を生成しない回帰テスト。

## 検証
- GitHub Actions `Collect SF6 ratings` run **43289097005**：`completed / success`（キャラ別の追加テスト成功）。
- GitHub Actions `Collect SF6 ratings` run **43289391387**：新しいキャラ別観測時刻のテストは `collect` ジョブで成功。公開ジョブの最終結果は確認して更新。
- GitHub Pages `Publish dashboard` run **43289306840**：`completed / success`（TERRY選択時の古いAKUMA観測表示の区別を公開）。
- 公開：https://gsybcbw2yc-dev.github.io/SF6-reco/
- iPhone/iPad Safari実機の表示・操作はユーザー側で再読み込みして確認する必要あり。

## 今後の確認事項
- 概要のCHARACTERでTERRYを選択し、LP22617の最新観測値、MR未計測、LP履歴と対戦履歴のTERRYのみ表示を確認する。
- 対戦履歴側でAKUMAに戻して、概要もAKUMAに同期すること、AKUMAが現在も定期収集されているかは選択キャラの最終観測時刻から確認する。
- TERRYがMasterへ到達して有効MRを取得した後は、MRグラフと必要試合数予測を通常表示する。
- 現状の取得元が1キャラしか返さないため、両キャラの**同時30分追跡**を希望する場合は、Bucklerで別キャラの値を同じ認証済みプロフィールから合法・安全に取得できるか別途調査する必要あり。データ欠損や架空のMRを補完しない。
