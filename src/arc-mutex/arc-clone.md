<a id="cloning"></a>

# クローン

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

基本的なコードができたので、`Arc` をクローンする方法が必要です。

基本的には、次のことが必要です。

1. アトミックな参照カウントを増やします
2. 内部のポインタから `Arc` の新しいインスタンスを構築します

まず、`ArcInner` にアクセスする必要があります。

<!-- ignore: simplified code -->
```rust,ignore
let inner = unsafe { self.ptr.as_ref() };
```

アトミックな参照カウントは次のように更新できます。

<!-- ignore: simplified code -->
```rust,ignore
let old_rc = inner.rc.fetch_add(1, Ordering::???);
```

しかし、ここではどの順序付けを使うべきでしょうか？ クローン中に内部の値を変更しないので、クローン時にアトミックな同期を必要とするコードは特にありません。
したがって、ここでは Relaxed 順序付けを使えます。これは happens-before 関係を含意しませんが、アトミックです。
しかし、Arc を `Drop` するときには、参照カウントを減らす際にアトミックに同期する必要があります。
これについては、[`Arc` の `Drop` 実装の節](arc-drop.md)で詳しく説明します。
アトミックの関係と Relaxed 順序付けの詳細は、[アトミックの節](../atomics.md)を参照してください。

したがって、コードは次のようになります。

<!-- ignore: simplified code -->
```rust,ignore
let old_rc = inner.rc.fetch_add(1, Ordering::Relaxed);
```

`Ordering` を使うために、もう一つインポートを追加する必要があります。

```rust
use std::sync::atomic::Ordering;
```

しかし、現時点のこの実装には一つ問題があります。誰かが大量の Arc を `mem::forget` することにしたらどうなるでしょうか？
これまで書いた（そしてこれから書く）コードは、参照カウントがメモリ内の Arc の数を正確に表すと仮定していますが、`mem::forget` を使うとこれは成り立ちません。
したがって、この Arc から次々に Arc がクローンされ、それらが `Drop` されず参照カウントも減らされなければ、オーバーフローする可能性があります！
これは解放後使用を引き起こし、**極めて深刻な問題です！**

これに対処するには、参照カウントが任意に決めた値（参照カウントを `AtomicUsize` として保存するので `usize::MAX` 未満の値）を超えないことを確認し、*何か*をする必要があります。

標準ライブラリの実装では、どのスレッドであれ参照カウントが `isize::MAX`（`usize::MAX` の約半分）に達したら、単にプログラムを異常終了させることにしています
（通常のコードでは極めて起こりにくいケースであり、もし起これば、そのプログラムはおそらく極めて異常な状態だからです）。
これは、約 20 億のスレッド（ある種の 64 ビットマシンでは約 **900 京**）が同時に参照カウントを増やすことはおそらくない、という仮定に基づきます。ここでも同じことをします。

この動作の実装はとても単純です。

<!-- ignore: simplified code -->
```rust,ignore
if old_rc >= isize::MAX as usize {
    std::process::abort();
}
```

次に、`Arc` の新しいインスタンスを返す必要があります。

<!-- ignore: simplified code -->
```rust,ignore
Self {
    ptr: self.ptr,
    phantom: PhantomData
}
```

では、これらすべてを `Clone` の実装にまとめましょう。

<!-- ignore: simplified code -->
```rust,ignore
use std::sync::atomic::Ordering;

impl<T> Clone for Arc<T> {
    fn clone(&self) -> Arc<T> {
        let inner = unsafe { self.ptr.as_ref() };
        // Using a relaxed ordering is alright here as we don't need any atomic
        // synchronization here as we're not modifying or accessing the inner
        // data.
        let old_rc = inner.rc.fetch_add(1, Ordering::Relaxed);

        if old_rc >= isize::MAX as usize {
            std::process::abort();
        }

        Self {
            ptr: self.ptr,
            phantom: PhantomData,
        }
    }
}
```
