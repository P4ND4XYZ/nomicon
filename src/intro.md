<a id="the-rustonomicon"></a>

# Rust 裏本

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

<!-- japanese-edition-notice:start -->
## この日本語版について

本書は [The Rustonomicon](https://github.com/rust-lang/nomicon) の非公式日本語訳です。Rust プロジェクトによる公式翻訳・承認済みの翻訳ではありません。原文の基準コミットは [`5791ca9f5d671328af7a8fe87b42ca90c7211d28`](https://github.com/rust-lang/nomicon/commit/5791ca9f5d671328af7a8fe87b42ca90c7211d28) です。この日本語版では原文の本文・説明用コメントを翻訳し、表示・検索を日本語向けに調整しています。

原文の著作権表示は Copyright (c) 2010 The Rust Project Developers です。原文および本翻訳は、[MIT](https://github.com/rust-lang/nomicon/blob/5791ca9f5d671328af7a8fe87b42ca90c7211d28/LICENSE-MIT) または [Apache-2.0](https://github.com/rust-lang/nomicon/blob/5791ca9f5d671328af7a8fe87b42ca90c7211d28/LICENSE-APACHE) ライセンスの条件で利用できます。リンク先にライセンス全文を掲載しています。再配布時は、適用するライセンスの条件に従い、著作権表示とライセンス文を保持してください。

翻訳にあたり、[既存の日本語版](https://github.com/rust-lang-ja/rust-nomicon-ja/tree/1b23982de81bab6174f6e202f30437f315274ccd) と [対訳表](https://github.com/rust-lang-ja/the-rust-programming-language-ja/blob/2eaecee7a369fa354d6c3fe7e27d7332a74514ed/TranslationTable.md) を参考にしています。全章を固定した原文と照合していますが、誤訳がないことや最新の Rust 仕様との一致を保証するものではありません。原文由来の未完成部分や TODO は意図的に残しています。

翻訳の誤りは、章名・該当箇所・修正案を添えて、この日本語版の管理者へ報告してください（専用の報告先は未設定です）。日本語訳だけの問題を英語原文の Issue tracker に送らないでください。原文自体の問題は [英語原文の Issue tracker](https://github.com/rust-lang/nomicon/issues) へ報告してください。
<!-- japanese-edition-notice:end -->

<div class="warning">

警告:
この書籍は未完成です。
すべてを記述し、古くなった部分を書き直すには時間がかかります。
不足している点や古くなった点については[issue tracker]を確認してください。また、まだ報告されていない誤りやアイデアがあれば、気軽にそちらへ新しい Issue を登録してください。

</div>

[issue tracker]: https://github.com/rust-lang/nomicon/issues

<a id="the-dark-arts-of-unsafe-rust"></a>

## アンセーフ Rust の闇の技法

> 知識は「現状有姿」で提供され、明示・黙示を問わず、いかなる種類の保証もありません。あなたの精神を打ち砕いて未知なる無限の宇宙を漂流させる、言い表せない恐怖を解き放つことに関する保証も含まれますが、それに限りません。

Rust 裏本は、アンセーフな Rust プログラムを書くときに理解しておく必要がある、おぞましい詳細に踏み込みます。

Rust プログラムを書きながら長く幸せな職業人生を送りたいのであれば、今すぐ引き返し、この本を見たことを忘れてください。
この本は必要ありません。
しかし、アンセーフなコードを書くつもりがある場合、あるいは言語の内部を掘り下げたいだけの場合には、この本には多くの有用な情報があります。

*[The Rust Programming Language][trpl]*とは異なり、本書ではかなりの事前知識を前提とします。
特に、基本的なシステムプログラミングと Rust に慣れている必要があります。
これらの分野に不安があるなら、まず[The Book][trpl]を読むことを検討してください。
ただし、読了済みであることまでは前提としません。また、適切な箇所では基本事項を折に触れて復習できるようにします。
この本から読み始めても構いませんが、すべてを基礎から説明するわけではないことを覚えておいてください。

この本は主に[The Reference][ref]を高い視点から補うものです。
The Reference は言語のあらゆる部分の構文とセマンティクスを詳述するのに対し、Rust 裏本はそれらを組み合わせて使う方法と、その際に直面する問題を説明します。

The Reference は参照、デストラクタ、巻き戻しの構文とセマンティクスを説明しますが、それらを組み合わせることでどのように例外安全性の問題が生じるか、またその問題にどう対処するかまでは説明しません。

Rustnomicon と The Reference の同期は十分に取れていないため、内容が重複していることがあります。
一般に、両文書の記述が食い違う場合は、The Reference の方が正しいものとして扱ってください（The Reference はまだ規範的な文書とは見なされていませんが、よりよく保守されています）。

本書の対象には、安全性／アンセーフ性の意味、言語と標準ライブラリが提供するアンセーフなプリミティブ、それらのプリミティブを使って安全な抽象化を作る技法、サブタイピングと変性、例外安全性（パニック／巻き戻し安全性）、未初期化メモリの扱い、型パンニング（型の再解釈）、並行性、他言語との相互運用（FFI）、最適化の技法、構文要素がコンパイラ／OS／ハードウェアのプリミティブへどのように低レベル化されるか、メモリモデルに関わる人々を怒らせない方法、そしてどうすれば彼らを怒らせてしまうか、その他さまざまな話題が含まれます。

Rust 裏本は、標準ライブラリのすべての API のセマンティクスと保証を網羅的に説明する場所でも、Rust のすべての機能を網羅的に説明する場所でもありません。

特に断りのない限り、本書の Rust コードは Rust 2024 edition を使用します。

[trpl]: ../book/index.html
[ref]: ../reference/index.html
