<a id="dropping"></a>

# ドロップ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

今度は、参照カウントを減らし、それが十分に小さくなったらデータをドロップする方法が必要です。そうしなければ、データはヒープ上に永久に残ります。

このために、`Drop` を実装できます。

基本的には、次のことが必要です。

1. 参照カウントを減らします
2. データへの参照が一つだけ残っている場合は、次の処理を行います。
3. データの使用と削除の並べ替えを防ぐため、データにアトミックなフェンスを設けます
4. 内部のデータをドロップします

まず、`ArcInner` にアクセスする必要があります。

<!-- ignore: simplified code -->
```rust,ignore
let inner = unsafe { self.ptr.as_ref() };
```

次に、参照カウントを減らす必要があります。コードを簡潔にするため、`fetch_sub` の戻り値（減らす前の参照カウントの値）が `1` と等しくなければ、そのままリターンすることもできます（これは、データへの最後の参照ではない場合に起こります）。

<!-- ignore: simplified code -->
```rust,ignore
if inner.rc.fetch_sub(1, Ordering::Release) != 1 {
    return;
}
```

その後、データの使用と削除の並べ替えを防ぐために、アトミックなフェンスを作る必要があります。
[標準ライブラリの `Arc` の実装][3]では、次のように説明されています。
> このフェンスは、データの使用と削除の並べ替えを防ぐために必要です。
> `Release` と指定されているため、参照カウントの減算はこの `Acquire` フェンスと同期します。
> これは、データの使用が参照カウントの減算より前に起こり、減算がこのフェンスより前に起こり、
> フェンスがデータの削除より前に起こることを意味します。
>
> [Boost のドキュメント][1]で説明されているように、
>
> > あるスレッドでの（既存の参照を通じた）オブジェクトへのあらゆるアクセスが、
> > 別のスレッドでのオブジェクトの削除よりも*前に起こる*ことを強制するのが重要です。
> > これは、参照をドロップした後の "release" 操作（この参照を通じたオブジェクトへの
> > あらゆるアクセスは、当然それより前に起きていなければなりません）と、
> > オブジェクトを削除する前の "acquire" 操作によって実現されます。
>
> 特に、Arc の内容は通常不変ですが、`Mutex<T>` のようなものへの内部的な書き込みは可能です。
> Mutex は削除時に獲得されないため、スレッド A での書き込みをスレッド B で実行される
> デストラクタから見えるようにするために、その同期ロジックに頼ることはできません。
>
> また、ここでの Acquire フェンスはおそらく Acquire ロードに置き換えられ、
> 競合の激しい状況で性能を改善できる可能性があることにも注意してください。
> [2] を参照してください。
>
> [1]: https://www.boost.org/doc/libs/1_55_0/doc/html/atomic/usage_examples.html
> [2]: https://github.com/rust-lang/rust/pull/41714
[3]: https://github.com/rust-lang/rust/blob/e1884a8e3c3e813aada8254edfa120e85bf5ffca/library/alloc/src/sync.rs#L1440-L1467

このために、次のようにします。

```rust
# use std::sync::atomic::Ordering;
use std::sync::atomic;
atomic::fence(Ordering::Acquire);
```

最後に、データ自体をドロップできます。Box に入った `ArcInner<T>` とそのデータをドロップするために、`Box::from_raw` を使います。
これは `NonNull<T>` ではなく `*mut T` を受け取るので、`NonNull::as_ptr` を使って変換しなければなりません。

<!-- ignore: simplified code -->
```rust,ignore
unsafe { Box::from_raw(self.ptr.as_ptr()); }
```

`ArcInner` への最後のポインタを持っていて、そのポインタが有効であるとわかっているため、これは安全です。

では、これらすべてを `Drop` の実装にまとめましょう。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Drop for Arc<T> {
    fn drop(&mut self) {
        let inner = unsafe { self.ptr.as_ref() };
        if inner.rc.fetch_sub(1, Ordering::Release) != 1 {
            return;
        }
        // This fence is needed to prevent reordering of the use and deletion
        // of the data.
        atomic::fence(Ordering::Acquire);
        // This is safe as we know we have the last pointer to the `ArcInner`
        // and that its pointer is valid.
        unsafe { Box::from_raw(self.ptr.as_ptr()); }
    }
}
```
