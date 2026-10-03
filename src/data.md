<a id="data-representation-in-rust"></a>

# Rust のデータ表現

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

低レベルプログラミングでは、データレイアウトがとても重要です。大きな意味を持つ問題です。また、言語のほかの部分にも広く影響するため、まず Rust でデータがどのように表現されるかを詳しく見ていきます。

理想的には、本章の内容は [Rust Reference の型レイアウトの節][ref-type-layout]と整合し、そちらの記述によって不要になっているべきです。この本が最初に書かれた当時、Reference は完全に整備不良の状態で、Rustonomicon が Reference の部分的な代替を試みていました。現在はそうではないため、理想を言えば本章全体を削除できます。

もうしばらくは本章を残しておきますが、新しい事実や改善点があれば、理想的には Reference に寄稿してください。

[ref-type-layout]: ../reference/type-layout.html
