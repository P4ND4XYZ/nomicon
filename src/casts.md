<a id="casts"></a>

# キャスト

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

キャストは強制変換の上位集合です。すべての強制変換は、キャストによって明示的に実行できます。
ただし、一部の変換にはキャストが必要です。
強制変換は広く使われ、大部分は無害ですが、これらの「真のキャスト」はまれで、潜在的に危険です。
そのため、キャストは `as` キーワードを使って明示的に実行しなければなりません。`expr as Type` と書きます。

リファレンスには、[すべての真のキャスト][cast list]の網羅的な一覧と、[キャストの意味論][semantics list]があります。

<a id="safety-of-casting"></a>

## キャストの安全性

真のキャストは一般に、生ポインタとプリミティブな数値型に関するものです。
これらのキャストは危険ですが、実行時に失敗することはありません。
キャストが微妙なコーナーケースを引き起こしても、その発生を知らせるものはありません。
キャストは単に成功します。
とはいえ、キャストは型レベルでは有効でなければならず、そうでなければ静的に阻止されます。
例えば、`7u8 as bool` はコンパイルできません。

とはいえ、キャストは一般に*それ自体では*メモリ安全性を侵害できないため、`unsafe` ではありません。
例えば、整数を生ポインタに変換することは、ひどい事態に非常につながりやすいものです。
しかし、実際に生ポインタを使用することは既に `unsafe` とされているため、ポインタを作る行為自体は安全です。

<a id="some-notes-about-casting"></a>

## キャストに関する注意点

<a id="lengths-when-casting-raw-slices"></a>

### 生スライスをキャストするときの長さ

生スライスをキャストしても長さは調整されないことに注意してください。`*const [u16] as *const [u8]` は、元のメモリの半分しか含まないスライスを作ります。

<a id="transitivity"></a>

### 推移性

キャストは推移的ではありません。つまり、`e as U1 as U2` が有効な式でも、`e as U2` が必ずしも有効とは限りません。

[cast list]: ../reference/expressions/operator-expr.html#type-cast-expressions
[semantics list]: ../reference/expressions/operator-expr.html#semantics
