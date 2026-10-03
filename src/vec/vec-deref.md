# Deref

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

これで、まずまずの最小限のスタックを実装できました！プッシュもポップもでき、
後片付けもできます。しかし、当然欲しくなる機能がまだたくさんあります。
特に、ちゃんとした配列はあるのに、スライスの機能がまったくありません。
実はこれは簡単に解決できます。`Deref<Target=[T]>` を実装すればよいのです。
これで Vec は、さまざまな状況で魔法のようにスライスへ強制変換され、スライスのように振る舞います。

必要なのは `slice::from_raw_parts` だけです。空のスライスも正しく扱ってくれます。
後でサイズ0の型をサポートすれば、それらについてもそのまま動作します。

<!-- ignore: simplified code -->
```rust,ignore
use std::ops::Deref;

impl<T> Deref for Vec<T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        unsafe {
            std::slice::from_raw_parts(self.ptr.as_ptr(), self.len)
        }
    }
}
```

DerefMut も実装しましょう。

<!-- ignore: simplified code -->
```rust,ignore
use std::ops::DerefMut;

impl<T> DerefMut for Vec<T> {
    fn deref_mut(&mut self) -> &mut [T] {
        unsafe {
            std::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len)
        }
    }
}
```

これで `len`、`first`、`last`、インデックス操作、スライス操作、ソート、`iter`、
`iter_mut`、そしてスライスが提供するその他のさまざまな便利な機能が手に入りました。いいですね！
