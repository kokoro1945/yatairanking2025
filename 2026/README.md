# 2026年度 屋台ランキング

2026年度版の評価フォーム一式です。2025年度版のルート直下ファイルは変更せず、このディレクトリ内で年度更新を進めます。

## 主要ファイル

- `index.html`: 2026年度版の画面とメタ情報
- `style.css`: 2026年度版のスタイル
- `main.js`: 2026年度版の投票処理
- `booths.csv`: 2026年度版の屋台一覧
- `scripts/generate_qr.js`: 2026年度版QRコード生成スクリプト
- `sql/create_yatai_votes_2026.sql`: 2026年度版Supabaseテーブル作成SQL

## 年度別に分離している設定

- 公開URL: `https://ikomasai.com/2026/`
- ローカルストレージキー: `voted_booths_2026`
- Supabaseテーブル: `yatai_votes_2026`
- QRコード生成ZIP: `booth-qr-codes-2026.zip`

## 2026年度の本番化前に更新するもの

1. `booths.csv` を2026年度の屋台一覧に差し替える。
2. `main.js` の `FORM_URL` に2026年度用GoogleフォームURLを設定する。Googleフォームを使わない場合は空のままでよい。
3. Supabaseを使う場合は `sql/create_yatai_votes_2026.sql` をSupabase SQL Editorで実行する。
4. QRコードを作る場合は、このディレクトリの `scripts/generate_qr.js` を実行する。
