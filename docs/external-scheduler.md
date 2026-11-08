# 外部スケジューラー設定（iPad / iPhone）

GitHub 側の `schedule` が連続して起動しない場合、cron-job.org の無料ジョブから `workflow_dispatch` API を呼ぶ。Buckler Cookie は引き続き GitHub Secret `BUCKLER_ID` のみに置く。cron-job.org に登録するのは **GitHub の対象リポジトリ限定 Actions write トークン**であり、Cookie ではない。

## 本人が行う設定

1. Safari で [cron-job.org](https://cron-job.org/) の無料アカウントを作成し、可能なら二要素認証を有効にする。
2. GitHub の **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** で、新しいトークンを作成する。Resource owner は `gsybcbw2yc-dev`、Repository access は **Only select repositories → SF6-reco**、Repository permissions は **Actions: Read and write** を指定し、ほかの書込権限を付けない。期限を選び、更新予定を自分で管理する。トークンは一度しか表示されないので、そのまま次の設定へ使う。
3. cron-job.org で新しいジョブを作成する。URL は `https://api.github.com/repos/gsybcbw2yc-dev/SF6-reco/actions/workflows/collect.yml/dispatches`。HTTP method は **POST**。スケジュールのタイムゾーンを **Asia/Tokyo**、毎時 **00分と30分**、全時間・全曜日にする。GitHub 側の11・41分は予備として維持する。
4. リクエストヘッダーを追加する。

   | Header | Value |
   |---|---|
   | `Authorization` | `Bearer ` に続けて手順2のトークンを貼る |
   | `Accept` | `application/vnd.github+json` |
   | `Content-Type` | `application/json` |
   | `X-GitHub-Api-Version` | `2022-11-28` |

5. Request body を次のとおり指定する。`%cjo:unixtime%` は cron-job.org が実行時刻で置換する変数なので、文字列を変えない。

   ```json
   {"ref":"main","inputs":{"origin":"cron_job_org","external_trigger_unix":"%cjo:unixtime%"}}
   ```

6. cron-job.org の **response body 保存を無効**にし、失敗通知を有効にする。設定を保存・有効化し、**Test run** を1回行う。成功時に GitHub API は通常 **204** を返すが、それだけでは収集成功を意味しない。
7. [Collect SF6 ratings のActions](https://github.com/gsybcbw2yc-dev/SF6-reco/actions/workflows/collect.yml)で `workflow_dispatch` 実行を確認し、[公開 `runs.json`](https://gsybcbw2yc-dev.github.io/SF6-reco/data/runs.json) の `trigger: external_dispatch`、`external_trigger_at`、`result` を確認する。直前に GitHub schedule が成功していれば `skipped_recent_success` は正常な重複抑制。次の00分・30分枠で複数回の実行を確認する。

**秘密情報をチャット、GitHub Issue、ソース、スクリーンショットに貼らない。** トークンの期限切れや漏洩時は GitHub 側で失効し、新しい限定トークンに差し替える。外部サービスには Actions write 権限が渡るため、アカウントと二要素認証を保護する。cron-job.org からの起動も GitHub Actions の実行待ちや GitHub 側障害までは解消しない。

## 根拠

- [GitHub workflow_dispatch API と必要な Actions write 権限](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
- [GitHub fine-grained token 作成](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [cron-job.org FAQ: ヘッダーと POST body](https://cron-job.org/en/faq/)
- [cron-job.org の実行時変数](https://docs.cron-job.org/creating-cron-jobs.html)

料金・UI・API仕様は変更され得るため、登録時に各公式ページを確認する。現状ではこの外部ジョブは**本人の設定前で未稼働**。
