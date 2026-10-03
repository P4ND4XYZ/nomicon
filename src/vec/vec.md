<a id="example-implementing-vec"></a>

# 例: Vec の実装

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

これまでの内容をまとめるために、`std::Vec` を一から書いていきます。
使用するのは安定版の Rust に限ります。特に、コードを少しきれいにしたり効率化したりできる
組み込み関数（intrinsics）は使いません。組み込み関数は恒久的に不安定だからです。
もっとも、多くの組み込み関数は別の場所で*実際に*安定化されています
（`std::ptr` と `std::mem` は多くの組み込み関数から構成されています）。

結局、私たちの実装では可能な最適化をすべて活用できないかもしれませんが、
決して*素朴な*実装にはなりません。問題に*本当に*そこまでする価値がない場合でも、
細かな実装の詳細に深く踏み込んでいきます。

高度な内容を求めていましたね。では、高度な内容に進みましょう。
