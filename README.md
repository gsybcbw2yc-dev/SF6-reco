# SF6 Rating Archive

個人用 SF6 MR・LP 観測ダッシュボード。Buckler's Boot Camp のログイン済みプロフィール画面から、取得に成功した値だけを30分間隔で保存する非公式ツールです。

## 検証状況と制限

解析、値の検証、重複排除、フェーズ別保存は単体テスト済みです。2026-11-07 現在、GitHub Actions と Pages は稼働確認済みですが、Buckler は GitHub-hosted runner から HTTP 403 を返し、実データ取得は未達です。Cookie の状態と実行環境の制限は未切り分けです。デモ値は入れていません。Buckler の `__NEXT_DATA__` は公式公開 API ではなく、ログイン期限切れ、画面構造変更、サーバー側ブロックで停止する可能性があります。認証回避やアクセス制限の突破は行いません。

画面内に個別キャラクターが見つからなければ、お気に入りキャラクターだけ記録します。フェーズを確認できなければ `unknown` とします。試合単位、勝率、対戦回数はこの取得経路では未検証で未実装です。観測値を試合結果として扱わず、過去の欠損を補間しません。

## セットアップ

1. ZIP を新規 GitHub リポジトリの `main` に配置します。公開リポジトリでは戦績履歴も公開されます。
2. 対象プロフィール `https://www.streetfighter.com/6/buckler/ja-jp/profile/1866568348` のプレイヤーIDは収集ワークフローに設定済みです。別のアカウントに変える場合は `CFN_PLAYER_ID` を編集します。
3. ログイン済みブラウザの `buckler_id` Cookie の値だけを同じ画面で `BUCKLER_ID` Secret に登録します。パスワードや Cookie をチャット、ソース、Issue に貼らないでください。期限切れ時は自分で更新します。
4. **Settings → Actions → General → Workflow permissions** を `Read and write permissions` にします。Actions の `Collect SF6 ratings` を手動実行し、`web/data/status.json` を確認します。
5. **Settings → Pages → Build and deployment → Source** を `GitHub Actions` にし、`Publish dashboard` を実行します。

GitHub の cron は遅延や停止があり、正確な30分間隔を保証しません。401/403/404/429 は再試行せず、その他の一時エラーは最大3回。失敗は `status.json` に最大20件保存します。同じ値は重複記録せず、変更時刻だけ残します。したがって全ポーリング時刻は残りません。

## ローカル実行

```bash
python -m unittest discover -s tests -v
python -m http.server 8000 --directory web
```

`http://localhost:8000/` を開きます。手動収集は環境変数 `CFN_PLAYER_ID` と `BUCKLER_ID` を設定し、`python collector/collect.py` を実行します。`.env` は Git 管理外です。`history.json` の各観測値は `observed_at` (UTC), `character`, `phase`, `mr`, `lp`, `source=periodic_buckler_snapshot` を持ちます。画面では JST 表示します。

参考: https://www.streetfighter.com/6/buckler/ · https://github.com/sfstatsapp/buckler-api-docs · https://github.com/LP0101/sf6-mr-tracker · https://github.com/SRGarciaVel/sf6-session-tracker

## iPad / iPhone のみで設定する場合（2026-11-07 調査）

公開サイト SF6 Stats はログイン不要の HTML データを出していますが、JSON API はキーが必要で、閲覧しても保存データは更新されません。対象 ID の公開データを実際に確認できなかったため、30分ごとの一次ソース取得の代替としては採用していません。iPadOS の Safari 標準 Web Inspector は Mac 接続を要します。

1. iPad の Safari で Buckler に通常ログインします。
2. Safari 拡張で Cookie を確認するなら、開発元・権限を確認した Cookie 管理アプリを利用し、アクセス許可を `www.streetfighter.com` のみに絞ります。たとえばオープンソースの Cookie-Editor (App Store ID `6446215341`) は iPad 対応ですが、Safari 制限により HttpOnly Cookie が表示されない場合があります。表示できない場合は無理に認証情報を回避・抽出しません。
3. `buckler_id` が表示されたときのみ**値だけ**をコピーし、Safari で `https://github.com/gsybcbw2yc-dev/SF6-reco/settings/secrets/actions` → `New repository secret` → Name `BUCKLER_ID` → Value に貼り付けて保存します。スクリーンショット、チャット、メモアプリ、共有シート、Cookie 全件エクスポートには残さないでください。コピー後は別の無害な文字列をコピーしてクリップボードを上書きします。
4. GitHub Settings → Actions → General → Workflow permissions を Read and write permissions に、Settings → Pages → Build and deployment → Source を GitHub Actions にします。Actions → Collect SF6 ratings → Run workflow を実行します。取得に失敗したら `web/data/status.json` のエラーを確認します。

Cookie が HttpOnly で表示できない場合は、対応を明示する独立ブラウザでログインして同ブラウザ内の Cookie インスペクタを使う方法もありますが、第三者アプリへログインすることになります。アプリの信頼性とプライバシーを確認できない場合は使用しないでください。

## 2026-11-07 運用状況

公開URL: https://gsybcbw2yc-dev.github.io/SF6-reco/ 。ページと静的データ配信は HTTP 200 を確認しました。収集ジョブは走りますが、Buckler が 403 を返すため、MR・LP の履歴は空です。status.json の応答種別診断に Cookie 値やレスポンス本文は保存しません。
