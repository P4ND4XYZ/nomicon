# 翻訳上の未解決事項

原文側の疑義と訳語・解釈の判断を記録します。原文の誤りらしき箇所は、確認なしに翻訳側で修正しません。状態が `open` の項目は対照レビュー・全体完了時に再確認します。

## 未解決

現時点で未解決の項目はありません。

## 解決済み

### SRC-001 — `Rustnomicon` の綴り

- **箇所:** `src/intro.md` の The Reference との同期に関する段落。
- **原文:** `we haven't synced The Rustnomicon and The Reference well`
- **所見:** 書名の一般的な表記 `Rustonomicon` と異なるため確認事項としていましたが、ユーザー確認により `Rustnomicon` の綴りで問題ないと判断しました。訳文は原文どおり維持します。
- **状態:** `closed` — 綴りの変更は不要です。
- **参照:** `src/intro.md`



### REV-001 — 試訳4章の独立対照レビュー

- **対象:** `src/intro.md`、`src/what-unsafe-does.md`、`src/aliasing.md`、`src/vec/vec-layout.md`。
- **所見:** `openai-codex/gpt-6.1-sol:low` による独立レビューを2パス実施しました。初回は `what-unsafe-does.md` の `*` 演算子説明の欠落、`may also derive` の断定化、部分否定の曖昧さを指摘され、訳文を修正しました。再レビューで3点の修正を確認し、忠実性を妨げる問題が残っていないことを確認しました。`src/vec/vec-layout.md` の `never` の明示もレビュー提案に従って反映しました。
- **状態:** `closed` — 4章すべてを原文と照合し、指摘を反映して再確認済み。台帳の状態を `contrast-reviewed` に更新しました。

## 検証記録

### 翻訳前の基準結果

- `mdbook build --dest-dir <一時ディレクトリ>`（mdBook `v0.5.1`）: 成功。
- `mdbook test` を既定の stable Rust `1.97.1 (8bab26f4f)` で実行: `dropck_eyepatch`、`allocator_api`、`ptr_internals`、`negative_impls`、`lang_items` などの feature gate による `E0554` で失敗。これは CI が指定する nightly ではなく stable を使ったためです。
- `rustup run nightly mdbook test`（Rust `1.101.0-nightly (c36f14571)`、mdBook `v0.5.1`）: 成功。現行 CI と同じ nightly 系統での基準テストに失敗はありません。
- CI の `linkcheck.sh --all nomicon` を実行: 成功。HTML 62,382 ファイル、リンク 2,988,279 件を検査し、エラー 0 件。

### 試訳後

- mdBook `v0.5.1` でビルド: 成功。
- Rust `1.101.0-nightly (c36f14571)` で `mdbook test`: 成功。
- 同じ CI linkcheck を再実行: 成功。エラー 0 件。
- 試訳4章の原文と訳文でコードフェンス、`ignore` 指定、リンク先、実行コードを比較: 一致。差分は翻訳可能な Rust コメントだけです。
- 作業群 A・バッチ A-1（`src/meet-safe-and-unsafe.md`、`src/safe-unsafe-meaning.md`、`src/working-with-unsafe.md`）を翻訳しました。旧訳も参照しましたが現行原文との内容・コード差があるため、本文は基準原文から訳しています。3章ともコードフェンス、隠し行、実行コード、リンク先が原文と一致し、未解決の訳上の疑問はありません。台帳状態は独立レビュー前の `translated` です。
- 作業群 B・バッチ B-1（`src/data.md`、`src/repr-rust.md`）を翻訳しました。旧訳には現行原文にない記述や誤記があるため、基準原文から訳しています。コードフェンス、`ignore` 指定、実行コード、リンク先が原文と一致し、未解決の訳上の疑問はありません。台帳状態は独立レビュー前の `translated` です。
- 作業群 B・バッチ B-2（`src/exotic-sizes.md`）を翻訳しました。旧訳とは内容が異なるため、基準原文を優先しています。コードフェンス、実行コード、リンク先は一致しています。日本語見出しにより自動生成アンカーが変わるため、他章から参照される `dynamically-sized-types-dsts` と `zero-sized-types-zsts` を明示的なアンカーとして維持しました。最初の linkcheck で ZST アンカーへの外部リンク2件の不一致を検出し、アンカー追加後に再実行してエラー0件を確認しました。未解決の訳上の疑問はなく、台帳状態は独立レビュー前の `translated` です。
- 作業群 B・バッチ B-3（`src/other-reprs.md`）を翻訳しました。旧訳は構成・内容とも現行原文と異なるため、基準原文から訳しています。コードフェンス、隠し行、実行コード、リンク先が一致し、未解決の訳上の疑問はありません。mdBook ビルド、nightly テスト、全体 linkcheck は成功し、エラー0件です。台帳状態は独立レビュー前の `translated` です。
- 作業群 C・バッチ C-1（`src/ownership.md`、`src/references.md`）を翻訳しました。旧訳ではコードフェンス属性や章の内容が現行原文と異なるため、現行原文から訳しています。フェンス、実行コード、リンク先が一致し、ビルド・nightly テスト・全体 linkcheck は成功しました。未解決の訳上の疑問はなく、台帳状態は独立レビュー前の `translated` です。
- 台帳 TOML を Python `tomllib` で解析し、64 Markdown ファイルの全件、固定原文スナップショットとの SHA-256 を検証: 成功。
- 独立した対照レビューで判明した訳文の問題を修正して再確認しました。ビルド・テスト・リンク検証の成功は、翻訳の技術的正確性を保証するものではありません。

## 対応関係の調査記録

次の点は既存訳の再利用範囲を判断するために確認済みです。未解決の技術的解釈として扱いません。

- 固定した旧訳リポジトリの README は翻訳元として `616b98444ff4eb5260deee95ee3e090dfd98b947` を記載しています。この README の記述だけで各章の原文基準が同一だとは判断せず、章ごとに現行原文との対応を確認します。
- 旧訳の `src/README.md` は導入章に対応します。現行原文では `src/intro.md` です。内容は同一と仮定せず、現行コミットから翻訳しました。
- 旧訳の `src/chapter_1.md` は見出し `Chapter 1` だけの空のプレースホルダーで、現行章に対応づけません。
- 旧訳の `src/arc-and-mutex.md` は TODO を残した導入部分です。現行の `src/arc-mutex/` 以下の分割章へ、旧訳本文を流用できるとは扱いません。
- Vec 章は現行で `src/vec/` 以下へ移動しています。ファイル名が対応していても訳文は現行原文と再照合します。
- 旧訳に存在しない章・現行構成の追加は `translation-status.toml` の空欄の旧訳対応先で示します。
