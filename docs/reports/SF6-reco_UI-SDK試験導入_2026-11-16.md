# SF6-reco UI SDK 試験導入報告書

実施日：2026-11-16（JST）

## 実施範囲

分析 → 対戦互角MRの自分のキャラクター・ACT・集計窓（50/100/200試合）の3つだけを対象にする。通常UIを既定とし、ユーザーが「AI操作 試験版を使う」で切り替える。元のネイティブselectを保持し、試験版の操作を従来のchangeイベントに接続する。元の集計式・データ取得・保存・他画面に変更なし。ページ再読み込みで通常UIに戻る。

## 技術

- Vercel UI SDK Web / Core 0.1.0-beta.3（Apache-2.0）
- Web Componentsを使用し、Reactへの移行なし。
- 必要な部品をローカルで単一ES moduleにバンドルし、試験版の選択時のみ読み込む。外部CDNやAI API呼び出しなし。追加API料金なし。
- ベンダーバンドル 206,030 bytes、SHA-256: e8175864771828e8223db6da6086128f18cac5961c6f0fdcd5400f86f4a253cd
- SDKのcreateAgent/agentToolsを使用。内部ブリッジ SF6FairSDK: status / snapshot / query / act / report。スナップショットとqueryは3つのselectに限定。許可操作は有効な選択肢へのsetValueのみに限定する。通常UIや別画面表示中の操作を拒否する。
- document.modelContext対応ブラウザで sf6_fair_snapshot / sf6_fair_query / sf6_fair_act / sf6_fair_report を登録し、試験版を終了すると解除する。対応しない場合、内部ブリッジは使用可能。外部AIへの接続は別途環境の対応が必要。
- reportは選択中のキャラ、ACT、窓、試合数、推定値、参考区間、検証状態、最新ローリング値などの集計情報のみ。個別の対戦ログ・認証情報は公開しない。

## 検証

- 既存ローカルテスト6ファイル（dashboard / fair_rating / master_promotion / match_goal_forecast / matches_ui / view_navigation）成功。
- 新規 test_fair_sdk_pilot.mjs 成功。実際のベンダーSDKを使用し、DOMはhappy-dom、WebMCPは模擬API。3つの選択肢の取得、query、SDK経由の選択操作、nativeへの同期、集計レポート、無効値・不許可アクション・別画面での拒否、登録解除、通常UI復帰、再有効化を確認。
- ローカルChromiumは実行環境のソケット制限で起動できなかったが、公開後にChatGPTのクラウドChromeで実地検証に成功。
- 公開サイトでWebMCPの4ツールを認識。AIによるsnapshotで3つの選択項目を取得。actで100→200試合に切り替え、グラフのARIAラベルと最新推定1,384 MRを確認。reportで集計値を取得（豪鬼Act 14・567試合・全体1,389 MR）。
- 手動操作で200→50試合を選び、グラフが変更されることを確認。通常UIに戻すと50試合選択が保持され、WebMCPの4ツールが解除された。100試合に戻して再有効化も確認済み。
- GitHub Actions: Publish dashboard（43870024570）成功、Collect SF6 ratings（43870024447）成功。
- WebMCPは実験的仕様。今回のChatGPTクラウドChromeでは動作したが、iPad Safariや通常チャットが同じように直接ツールを認識することは未確認。iPadでのタッチ操作は要実機確認。

## 再現方法

リポジトリルートで実行する（Node.js 24）。

```sh
npm install --no-save --ignore-scripts --no-audit --no-fund --package-lock=false @ui-sdk/web@0.1.0-beta.3 @ui-sdk/core@0.1.0-beta.3 esbuild@0.25.12 happy-dom@20.0.11
node_modules/.bin/esbuild tools/ui-sdk/vendor-entry.mjs --bundle --minify --format=esm --platform=browser --target=es2022 --legal-comments=inline --outfile=web/vendor/fair-sdk-0.1.0-beta.3.mjs
node tests/test_fair_sdk_pilot.mjs
```

## 参考

- https://azukiazusa.dev/blog/ui-sdk-agent-ready-behaviors/
- https://ui-sdk.dev/
- https://www.npmjs.com/package/@ui-sdk/web/v/0.1.0-beta.3
- https://developer.chrome.com/blog/webmcp-epp
