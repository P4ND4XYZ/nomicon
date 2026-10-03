<a id="drop-flags"></a>

# ドロップフラグ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

前の節の例は、Rust にとって興味深い問題を提起しています。
メモリ位置を条件付きで初期化したり、未初期化に戻したり、再初期化したりすることは、完全に安全に行えると分かりました。`Copy` 型については、単なるビットの集まりなので、これは特に注目することではありません。しかし、デストラクタを持つ型では事情が違います。Rust は、変数への代入や変数がスコープを抜けるたびに、デストラクタを呼び出すべきか知る必要があります。条件付きの初期化では、どうすればよいのでしょうか？

すべての代入でこの問題を心配する必要があるわけではないことに注意してください。特に、参照外しを介した代入は無条件にドロップし、`let` での代入は無条件にドロップしません。

```rust
let mut x = Box::new(0); // let makes a fresh variable, so never need to drop
let y = &mut x;
*y = Box::new(1); // Deref assumes the referent is initialized, so always drops
```

これが問題になるのは、以前に初期化された変数や、その下位のフィールドの1つを上書きするときだけです。

実は Rust は、型をドロップすべきかどうかを*実行時に*追跡します。変数が初期化済みになったり未初期化になったりすると、その変数の*ドロップフラグ*が切り替わります。変数をドロップする必要があるかもしれないときは、このフラグを評価して、ドロップすべきか判断します。

もちろん、プログラムのあらゆる地点で値の初期化状態が静的に分かることもよくあります。その場合、理論的にはコンパイラはもっと効率的なコードを生成できます！ 例えば、分岐のないコードには、このような*静的なドロップの意味論*があります。

```rust
let mut x = Box::new(0); // x was uninit; just overwrite.
let mut y = x;           // y was uninit; just overwrite and make x uninit.
x = Box::new(0);         // x was uninit; just overwrite.
y = x;                   // y was init; Drop y, overwrite it, and make x uninit!
                         // y goes out of scope; y was init; Drop y!
                         // x goes out of scope; x was uninit; do nothing.
```

同様に、初期化に関してすべての分岐が同じ挙動をする分岐のあるコードにも、静的なドロップの意味論があります。

```rust
# let condition = true;
let mut x = Box::new(0);    // x was uninit; just overwrite.
if condition {
    drop(x)                 // x gets moved out; make x uninit.
} else {
    println!("{}", x);
    drop(x)                 // x gets moved out; make x uninit.
}
x = Box::new(0);            // x was uninit; just overwrite.
                            // x goes out of scope; x was init; Drop x!
```

しかし、次のようなコードで正しくドロップするには、実行時の情報が*必要です*。

```rust
# let condition = true;
let x;
if condition {
    x = Box::new(0);        // x was uninit; just overwrite.
    println!("{}", x);
}
                            // x goes out of scope; x might be uninit;
                            // check the flag!
```

もちろん、この場合は静的なドロップの意味論を取り戻すのは簡単です。

```rust
# let condition = true;
if condition {
    let x = Box::new(0);
    println!("{}", x);
}
```

ドロップフラグはスタック上で追跡されます。
古いバージョンの Rust では、ドロップフラグは `Drop` を実装する型の隠しフィールドに格納されていました。
