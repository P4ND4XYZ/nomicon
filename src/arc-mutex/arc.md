<a id="implementing-arc"></a>

# Arc の実装

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

この節では、`std::sync::Arc` の簡略版を実装します。
[先ほど作った `Vec` の実装](../vec/vec.md)と同様に、標準ライブラリが利用しうるほど多くの最適化、組み込み関数、不安定なコードは利用しません。

この実装は標準ライブラリの実装をおおまかに基にしています
（正確には、実際の実装場所である 1.49 の `alloc::sync` から取っています）が、
弱参照は実装を少し複雑にするため、現時点ではサポートしません。

この節は現在、まだかなり執筆途中であることに注意してください。
