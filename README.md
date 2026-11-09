# SF6 Rating Archive

個人用 SF6 MR・LP 観測ダッシュボード。Buckler's Boot Camp のログイン済みプロフィール画面から、取得に成功した値を約30分間隔で観測する非公式ツールです。

## 検証状況と制限

解析、値の検証、重複排除、フェーズ別保存は単体テスト済みです。2026-11-07 現在、GitHub Actions・Pages・Buckler の実データ取得を確認しました。初回の403は認証設定後に解消しています。デモ値は入れていません。Buckler の `__NEXT_DATA__` は公式公開 API ではなく、ログイン期限切れ、画面構造変更、サーバー側ブロックで停止する可能性があります。認証回避やアクセス制限の突破は行いません。

画面内に個別キャラクターが見つからなければ、お気に入りキャラクターだけ記録します。フェーズを確認できなければ `unknown` とします。試合単位、勝率、対戦回数はこの取得経路では未検証で未実装です。観測値を試合結果として扱わず、過去の欠損を補間しません。

## セットアップ

1. ZIP を新規 GitHub リポジトリの `main` に配置します。公開リポジトリでは戦績履歴も公開されます。
2. 対象プロフィール `https://www.streetfighter.com/6/buckler/ja-jp/profile/1866568348` のプレイヤーIDは収集ワークフローに設定済みです。別のアカウントに変える場合は `CFN_PLAYER_ID` を編集します。
3. ログイン済みブラウザの `buckler_id` Cookie の値だけを同じ画面で `BUCKLER_ID` Secret に登録します。パスワードや Cookie をチャット、ソース、Issue に貼らないでください。期限切れ時は自分で更新します。
4. **Settings → Actions → General → Workflow permissions** を `Read and write permissions` にします。Actions の `Collect SF6 ratings` を手動実行し、`web/data/status.json` を確認します。
5. **Settings → Pages → Build and deployment → Source** を `GitHub Actions` にし、`Publish dashboard` を実行します。

GitHub の cron は遅延やスキップがあり、正確な30分間隔を保証しません。実行されなかった時刻は観測値として記録しません。401/403/404/429 は再試行せず、その他の一時エラーは最大3回。失敗は `status.json` に最大20件保存します。数値の変化は即座に記録し、同値が続く場合も6時間ごとに観測点を残します。成功・失敗を含む全実行の時刻、結果、キャラクター数、安全なエラー分類は `web/data/runs.json` に保存します。ワークフローが起動しなかった時刻はこのファイルにも残らず、画面では最終成功から90分超で更新遅延を表示します。

現在の cron は毎時00分・30分の外部起動を主枠、GitHub cron の11分・41分を予備枠としています。前回成功から25分未満の scheduled または外部起動は Buckler へアクセスせず `skipped_recent_success` として記録します。予備枠が起動しても30分間隔を保証しません。`scheduled_for_estimate` は cron 式と起動時刻から求めた**推定枠**であり、GitHub が正確な予定イベント時刻を渡さないため、曖昧な遅延時は null にします。実際の開始時刻は `started_at` です。公開後には Pages 上の実行IDとリポジトリ内の最終実行IDを照合します。失敗時は Actions の publish ジョブを確認してください。

GitHub schedule が欠落する環境では、[外部スケジューラー設定](docs/external-scheduler.md)の手順で cron-job.org から `workflow_dispatch` する構成に対応しています。外部の認証設定は本人が行う必要があり、設定前は未稼働です。外部起動は `runs.json` の `trigger: external_dispatch` で区別し、GitHub 側の直近成功と重なったら25分以内の取得を省きます。

## ローカル実行

```bash
python -m unittest discover -s tests -v
node tests/test_dashboard.cjs
node tests/test_time_analysis.cjs
python -m http.server 8000 --directory web
```

画面は表示中に60秒ごとに3つの公開JSONを `cache: no-store` と時刻付きURLで再取得します。Safariから別アプリへ移動した後は、復帰時に再確認します。バックグラウンドでは定期通信せず、iPadOSの制限でタイマーが止まっても復帰イベントで追いつきます。ページ全体は再読込せず、履歴が変わったときだけMR・LPの数値とグラフを再描画します。手動の「今すぐ更新」も使えます。通信失敗時は最後に取得できた表示を保持し、画面確認エラーを表示します。デプロイ前から開き続けていた古いページには新しいJavaScriptが載っていないため、**今回の公開後に一度だけSafariでページを再読み込み**してください。

収集成功時はMR・LPが同値でも各実測を `heartbeat` として `history.json` に保存します。同じ実行試行・キャラクターまたは同一観測時刻の再記録だけを除外し、取得失敗・25分以内の重複起動省略では観測を作りません。収集成功の時刻間隔と固定窓の有効率は画面に表示します。長期保存の月別分割案は [設計書](docs/monthly-history-plan.md) を参照してください。過去の欠測値は補いません。

時間別MR分析は選択した7日・30日・90日・全期間の範囲で、JSTの30分・1時間・3時間・24時間境界から5分以内に実測点が両端にある窓だけを比較します。MR/hは固定窓の差を60分換算した値で、プレイ時間あたりの増減ではありません。欠測は補間せず「データ不足」と表示します。直近平均は有効な最大6窓の平均です。ドローダウンは選択中のキャラクターと最後の連続同一フェーズだけを比較し、`unknown` は実際のフェーズ同一性を保証しないため注意書きを表示します。

`http://localhost:8000/` を開きます。手動収集は環境変数 `CFN_PLAYER_ID` と `BUCKLER_ID` を設定し、`python collector/collect.py` を実行します。`.env` は Git 管理外です。`history.json` の各観測値は `observed_at` (UTC), `character`, `phase`, `mr`, `lp`, `delta_mr`, `delta_lp`, `observation_type`, `source` を持ちます。フェーズ変更では差分を空欄にし、旧形式の全行は推測値を作らず `legacy` として移行します。`status.json` は最新値と最終成功・最終変動・安全なフェーズ診断を保持します。画面では JST 表示します。

参考: https://www.streetfighter.com/6/buckler/ · https://github.com/sfstatsapp/buckler-api-docs · https://github.com/LP0101/sf6-mr-tracker · https://github.com/SRGarciaVel/sf6-session-tracker

## iPad / iPhone のみで設定する場合（2026-11-07 調査）

公開サイト SF6 Stats はログイン不要の HTML データを出していますが、JSON API はキーが必要で、閲覧しても保存データは更新されません。対象 ID の公開データを実際に確認できなかったため、30分ごとの一次ソース取得の代替としては採用していません。iPadOS の Safari 標準 Web Inspector は Mac 接続を要します。

1. iPad の Safari で Buckler に通常ログインします。
2. Safari 拡張で Cookie を確認するなら、開発元・権限を確認した Cookie 管理アプリを利用し、アクセス許可を `www.streetfighter.com` のみに絞ります。たとえばオープンソースの Cookie-Editor (App Store ID `6446215341`) は iPad 対応ですが、Safari 制限により HttpOnly Cookie が表示されない場合があります。表示できない場合は無理に認証情報を回避・抽出しません。
3. `buckler_id` が表示されたときのみ**値だけ**をコピーし、Safari で `https://github.com/gsybcbw2yc-dev/SF6-reco/settings/secrets/actions` → `New repository secret` → Name `BUCKLER_ID` → Value に貼り付けて保存します。スクリーンショット、チャット、メモアプリ、共有シート、Cookie 全件エクスポートには残さないでください。コピー後は別の無害な文字列をコピーしてクリップボードを上書きします。
4. GitHub Settings → Actions → General → Workflow permissions を Read and write permissions に、Settings → Pages → Build and deployment → Source を GitHub Actions にします。Actions → Collect SF6 ratings → Run workflow を実行します。取得に失敗したら `web/data/status.json` のエラーを確認します。

Cookie が HttpOnly で表示できない場合は、対応を明示する独立ブラウザでログインして同ブラウザ内の Cookie インスペクタを使う方法もありますが、第三者アプリへログインすることになります。アプリの信頼性とプライバシーを確認できない場合は使用しないでください。

## 2026-11-07 運用状況

公開URL: https://gsybcbw2yc-dev.github.io/SF6-reco/ 。ページと静的データ配信は HTTP 200 を確認しました。収集・履歴保存・公開サイトへの反映を実測で確認しました。2026-11-07 18:03 JST の初回観測は AKUMA MR 1411 / LP 99763。初回認証前の403はエラー履歴に残ります。status.json の応答種別診断に Cookie 値やレスポンス本文は保存しません。GitHub の schedule は遅延・欠落し得るため、30分間隔は保証されません。

## 履歴とフェーズ判定

`runs.json` はワークフロー内で収集処理に到達した実行のみを蓄積します。テスト、チェックアウト、GitHub 側での起動失敗は記録できません。取得失敗でも履歴と状態をコミットするために Actions のコミット手順を `always()` で実行します。収集と公開は同じワークフローにまとめ、同時実行を直列化し、コミット前に最新 main を取り込みます。

フェーズは `master_league_phase` / `phase_id` / `current_phase` / `current_phase_id` の明示的な数値が実データにある場合だけ採用します。`master_league` は階級なのでフェーズと誤認しません。候補のキー経路のみ `status.json` に記録し、レスポンス本文・Cookie・値の診断ログは保存しません。フェーズ不明時は `unknown` を維持します。

## 外部起動トークンの更新（期限 2026-12-08）

GitHub の fine-grained token は 2026年12月8日に期限切れとなる。期限の約14日前からダッシュボードに更新案内を表示するが、**トークン自体の残存有効性を読み取る仕組みではない**。期限前に GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens で、対象を SF6-reco、権限を Actions: Read and write のみにした新トークンを作る。iPad の cron-job.org 管理画面で対象ジョブの Authorization ヘッダー値だけを差し替え、Test run 後に `external_dispatch` の Actions 実行結果を確認する。旧トークンは不要になれば GitHub で失効させる。トークンはチャット・リポジトリ・報告書に貼らない。
