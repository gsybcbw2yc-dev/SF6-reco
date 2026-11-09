# SF6-reco: 試合履歴・セッション・キャラ相性分析 一括開発の実現可能性と実装要件
更新日: 2026-11-09 JST / 調査と既存コード照合に基づく設計メモ（未実装機能を実装済みと誤記しない）

## 結論
試合単位の履歴取得が成功すれば、同じ正規化試合データから (1) 試合一覧 (2) セッション集計 (3) キャラクター相性集計を同時に構築できる。現在のSF6-recoはログイン済みBuckler HTMLをGitHub Actionsで取得できるため土台はあるが、**同じSecretだけで battlelog の全ページが取れるかは未実証**。既存のMR/LP収集を壊さず、まず読み取り専用で検証すること。

## 既存実装との接点（確認済み）
- リポジトリ: https://github.com/gsybcbw2yc-dev/SF6-reco
- `collector/collect.py` の `collect()` は `BUCKLER_ID` を環境から受け取り、`https://www.streetfighter.com/6/buckler/profile/{CFN_PLAYER_ID}/battlelog/rank` のHTMLから `__NEXT_DATA__.props.pageProps` を読み、主に `fighter_banner_info` からMR/LPを取り出す。
- 新機能は `web/data/history.json` の時系列観測と区別し、`matches` の専用スキーマ・ファイル群に保存する。既存の `collect.yml`（外部 :00/:30 + 予備 :11/:41）と `BUCKLER_ID`、公開 Pages、60秒自動更新は維持する。
- `history.json` のMR差を1試合の確定MR差に振り分けてはいけない。

## Bucklerの公開Webフロントに関する外部資料（非公式・変更リスクあり）
1. https://github.com/sfstatsapp/buckler-api-docs/blob/main/docs/endpoints.md — `profile/{sid}/battlelog.json?page=1` と `.../battlelog/rank.json?page=1` の `pageProps.replay_list`、ページ上限は検証時10ページ前後、約100件。
2. https://github.com/sfstatsapp/buckler-api-docs/blob/main/docs/schemas.md — `replay_id`、`uploaded_at`、`replay_battle_type`、`player1_info/player2_info`、キャラ名、`master_rating`、`league_point`、`round_results` の例。例示値は実データではない。
3. https://github.com/sfstatsapp/buckler-api-docs/blob/main/docs/authentication.md — ログイン認証と401/403/HTMLログインページ/埋込statusCodeの扱い。
4. https://github.com/dyoshimitsu/sf6-battlegraph — `replay_id` 重複排除や100試合超の蓄積という先行実装。
5. https://sfstats.app/data/reference — 試合ごとのMR/LPは対戦前値。連続する対戦前値によるMR差でも欠損・フェーズ変更・他モード等で確定差にならない。

資料は参考情報であり、現在の対象アカウントにおけるAPI成功・フィールド存在は本プロジェクトで要検証。

## 段階的な実装ゲート

### A. まず実データ検証（読み取り専用、Secret再利用）
- 新しい認証情報を求める前に、既存の `BUCKLER_ID` と `CFN_PLAYER_ID=1866568348` をGitHub Actions内だけで使用する。
- 現行HTMLの `__NEXT_DATA__` から `buildId` と `pageProps.replay_list` の有無、対象プレイヤーのサイド識別、1ページの件数、`total_page` を安全に確認。必要なら `_next/data/{buildId}/{locale}/profile/{sid}/battlelog/rank.json?page=N` を使用し、`buildId` はHTMLから毎回再取得する。
- まず1ページだけ試す。成功時に範囲内で追加ページを低頻度・逐次で取得。HTTP 401/403、Bot対策、429、規約に反する制御を迂回しない。失敗時には停止して理由を記録する。
- 診断ログにはHTTP状態・件数・スキーマキー名・重複数のみ。**Cookie、ヘッダー、レスポンス本文、相手プレイヤーの識別情報を出力・保存しない**。
- 目的のフィールドが欠ける場合、勝敗やMR差を推定で補完しない。最初の実データ検証ができなければ本番収集は組み込まない。

### B. アーカイブ・重複排除
- 既存の `web/data/history.json` や `runs.json` の全データを維持。
- 対戦履歴は独立した `web/data/matches/` または月別のアーカイブに保存。各試合の一意性を `replay_id` を基準に検証する。重複して取り込まない（P1/P2のどちらでも本人を正しく照合）。
- 公開用の最小限の項目: 衝突しない試合キー、原資料由来の日時とその**意味**（uploaded_atは必ずしもプレイ開始時刻ではない）、モード、自キャラ、相手キャラ、入力方式（あれば）、確定可能な勝敗、対戦前MR/LP（あれば）、ソース/取得日時/データ品質。
- 相手のCFN名・ID・生レスポンス・Cookieは**デフォルトで公開しない**。試合キー自体も公開範囲を検討し、リンク用 `replay_id` の公開はユーザーの希望が確認できた場合のみ。
- レート値は欠損ならnull。別キャラ・別フェーズ・非連続試合のMR差を「確定した1試合のMR増減」と偽らない。前後2試合のpre-match MRから求める差は、条件が満たされても「前後観測差/参考値」として扱う。
- 約100件を超える過去の履歴はBucklerから自動復元できない。新規収集以降に継続蓄積する。再取得やページネーション移動で欠損の恐れがあれば明示する。
- 収集は短い差分取得を基本に、初回のみ最大10ページなど上限を設ける。429や規約・サービス負荷には慎重に対応。

### C. 3機能
1. **試合単位の戦績記録**: ランクマを既定とした試合一覧、時刻・使用キャラ・相手キャラ・勝敗・取得元・pre-match MR/LP。期間/キャラ/モードのフィルタ、実測・未確定・欠測を区別。既存のMR推移グラフと試合点を意味混同しない。
2. **プレイセッション分析**: 試合が連続している区間を例として45分以上の空白で分割（変更可能）。勝敗数・勝率・連勝/連敗、試合数、先頭/末尾の時刻、経過時間を表示。これは「記録された試合の間の経過時間」であり、実プレイ時間の厳密な値ではない。セッションMR純増減は十分な前後証拠がある場合だけ計算し、なければ「算定不可」や観測値差の参考表示にする。
3. **キャラ相性分析**: 自キャラ×相手キャラ別、ランクマ限定を既定として勝敗数・勝率・試合数・集計期間、入力方式/モード絞り込みを表示。ミラー/引き分け/不明結果を正確に扱い、母数が少ない組合せは「参考値」「データ不足」と明示。対戦相手の実力差や対戦頻度の交絡を認め、「苦手の原因」と断定しない。

### D. 統合・テスト・ロールアウト
- 開発用の模擬Buckler JSONで、1P/2P勝敗、引き分け、不明、短い/長いギャップ、フェーズ、重複、同一試合のページ間反復、認証拒否、スキーマ変更を単体試験。
- 既存Python試験、Node画面/分析試験を必ず実行。GitHub Actionsで本番検証を低負荷に行い、公開JSON、Pages、iPad Safari向け表示を照合。
- 先に切り戻し可能な任意の収集機能（feature flag）として導入し、MR/LP既存機能の障害から分離する。
- データ容量が増える場合は月別JSON/索引へ分割し、初回・60秒更新で全アーカイブを毎回送信しない。

## 現時点でユーザーに求めないこと
- Cookieの値、GitHub PAT、バトルログの生レスポンスをChatGPTのチャットに投稿しない。
- MacやPCは必須ではない。現在のGitHub Actions Secretsをまず再利用する。

## Workがユーザーに聞くべき条件
- 既存Secretだけでは認証できないことを実証したときのみ、iPad Safariでの追加操作を案内する。
- 対戦相手名/リプレイIDを公開サイトに表示・保存したいか（既定は非公開）。
- 1セッションの分割基準（既定45分）を希望に応じて変更可能にする。

## 完了条件
- 実際のBucklerデータでランクマッチ複数試合の取得→正規化→永続化→再取得で重複なしを検証。
- 3機能が同じ正規化データに基づいて表示され、実測/推定/不明の区分が正しい。
- GitHub ActionsとPagesと既存MR/LP自動更新に回帰がない。
- 実行ID・検証日・取得件数・データ範囲・欠損・公開範囲を含む報告書を `docs/reports/` に新規追加し、チャットにも共有。
