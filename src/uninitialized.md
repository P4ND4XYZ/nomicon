<a id="working-with-uninitialized-memory"></a>

# 未初期化メモリを扱う

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

Rust プログラムで実行時にアロケートされるすべてのメモリは、*未初期化*の状態で始まります。この状態のメモリの値は不定のビットの集まりであり、そのメモリ位置に存在するはずの型の有効な状態を表しているかどうかさえ分かりません。このメモリを*どのような*型の値として解釈しようとしても、未定義動作を引き起こします。絶対に行わないでください。

Rust は、チェックされる（安全な）方法と、チェックされない（アンセーフな）方法で未初期化メモリを扱う仕組みを提供しています。
