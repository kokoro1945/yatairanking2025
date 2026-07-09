# 2025年度 屋台ランキング（アーカイブ）

第77回生駒祭で実際に使用した2025年度版一式です。ルート直下の`index.html`はここへの切り替え用リダイレクトになっているため、このディレクトリ内のファイルは基本的に変更しません。

## 主要ファイル

- `index.html`: 2025年度版の画面とメタ情報
- `style.css`: 2025年度版のスタイル
- `main.js`: 2025年度版の投票処理
- `booths.csv`: 2025年度版の屋台一覧
- `scripts/generate_qr.js`: 2025年度版QRコード生成スクリプト
- `sql/create_yatai_votes.sql`: 2025年度版Supabaseテーブル作成SQL

## 年度別に分離している設定

- 公開URL: `https://ikomasai.com/2025/`
- ローカルストレージキー: `voted_booths`
- Supabaseテーブル: `yatai_votes`
- QRコード生成ZIP: `booth-qr-codes.zip`
