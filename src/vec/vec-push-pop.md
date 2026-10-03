<a id="push-and-pop"></a>

# プッシュとポップ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

初期化もアロケートもできるようになりました。実際の機能を実装しましょう！
まずは `push` です。満杯か確認して必要なら伸長し、無条件に次のインデックスへ書き込み、
長さを増やすだけです。

書き込む際には、書き込み先のメモリを評価しないよう注意しなければなりません。
最悪の場合、それはアロケータから得た本当の未初期化メモリです。よくても、以前ポップした
値のビットが残っています。いずれにせよ、単にインデックスで指定して参照外しすることは
できません。メモリを T の有効なインスタンスとして評価してしまうからです。
さらに悪いことに、`foo[idx] = x` は `foo[idx]` の古い値に `drop` を呼ぼうとします！

正しい方法は `ptr::write` を使うことです。これは指定したアドレスを、渡した値のビットで
そのまま上書きするだけです。評価は行いません。

`push` では、古い len（push を呼ぶ前の値）が0なら、インデックス0に書き込みたいので、
古い len だけオフセットするべきです。

<!-- ignore: simplified code -->
```rust,ignore
pub fn push(&mut self, elem: T) {
    if self.len == self.cap { self.grow(); }

    unsafe {
        ptr::write(self.ptr.as_ptr().add(self.len), elem);
    }

    // Can't fail, we'll OOM first.
    self.len += 1;
}
```

簡単ですね！では `pop` はどうでしょうか？今回はアクセス先が初期化済みですが、
Rust はそのメモリ位置を単に参照外しして値をムーブして取り出すことを許しません。
メモリを未初期化のまま残してしまうからです！そのために `ptr::read` が必要です。
これは指定したアドレスのビットをコピーして取り出し、T 型の値として解釈するだけです。
実際には完全に有効な T のインスタンスがそこにあっても、そのアドレスのメモリは
論理的には未初期化となります。

`pop` では、例えば古い len が1ならインデックス0から読み出したいので、
新しい len だけオフセットするべきです。

<!-- ignore: simplified code -->
```rust,ignore
pub fn pop(&mut self) -> Option<T> {
    if self.len == 0 {
        None
    } else {
        self.len -= 1;
        unsafe {
            Some(ptr::read(self.ptr.as_ptr().add(self.len)))
        }
    }
}
```
