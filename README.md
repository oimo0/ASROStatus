# ASRO Status

ASROの公開ステータスページです。

- UI: GitHub Pages
- Live status: `status-data` branch の `status.json`
- Monitor: `ASROStatusBack` on the management server
- Hardware information / CPU usage is not published.

## Maintenance / notice

`data/notices.json` を編集すると、サーバーに接続せずGitHub Pages側だけでお知らせやメンテナンス表示を変更できます。

Status values: `operational`, `busy`, `maintenance`, `outage`, `building`, `unknown`.
