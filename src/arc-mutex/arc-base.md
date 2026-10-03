<a id="base-code"></a>

# 基本コード

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

`Arc` の実装のレイアウトが決まったので、基本的なコードを作りましょう。

<a id="constructing-the-arc"></a>

## Arc の構築

まず、`Arc<T>` を構築する方法が必要です。

これはとても単純です。`ArcInner<T>` を Box に入れ、それを指す `NonNull<T>` ポインタを取得するだけです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Arc<T> {
    pub fn new(data: T) -> Arc<T> {
        // We start the reference count at 1, as that first reference is the
        // current pointer.
        let boxed = Box::new(ArcInner {
            rc: AtomicUsize::new(1),
            data,
        });
        Arc {
            // It is okay to call `.unwrap()` here as we get a pointer from
            // `Box::into_raw` which is guaranteed to not be null.
            ptr: NonNull::new(Box::into_raw(boxed)).unwrap(),
            phantom: PhantomData,
        }
    }
}
```

<a id="send-and-sync"></a>

## Send と Sync

並行処理のプリミティブを作っているので、スレッド間で送信できる必要があります。
そこで、`Send` と `Sync` のマーカートレイトを実装できます。
詳細は、[`Send` と `Sync` の節](../send-and-sync.md)を参照してください。

これが問題ない理由は次のとおりです。
* `Arc` 内の値への可変参照を取得できるのは、そのデータを参照する `Arc` がそれ一つだけの場合、かつその場合に限ります（これは `Drop` 内でのみ起こります）
* 共有された可変の参照カウントにはアトミックを使います

<!-- ignore: simplified code -->
```rust,ignore
unsafe impl<T: Sync + Send> Send for Arc<T> {}
unsafe impl<T: Sync + Send> Sync for Arc<T> {}
```

`T: Sync + Send` という境界が必要です。これらの境界を設けなければ、スレッド安全でない値を `Arc` 経由でスレッド境界を越えて共有でき、データ競合や不健全性を引き起こす可能性があるからです。

例えば、これらの境界がなければ、`Arc<Rc<u32>>` は `Sync` または `Send` になります。
つまり、`Arc` から `Rc` をクローンして（まったく新しい `Rc` を作らずに）別のスレッドへ送信できます。
`Rc` はスレッド安全ではないので、これはデータ競合を引き起こします。

<a id="getting-the-arcinner"></a>

## `ArcInner` の取得

`NonNull<T>` ポインタを参照外しして `&T` にするには、`NonNull::as_ref` を呼び出せます。
これは通常の `as_ref` 関数とは異なりアンセーフなので、次のように呼び出さなければなりません。

<!-- ignore: simplified code -->
```rust,ignore
unsafe { self.ptr.as_ref() }
```

このコードでは、この断片を何度か使います（通常は対応する `let` 束縛とともに使います）。

この `Arc` が生きている間、内部のポインタが有効であることが保証されるため、このアンセーフな操作は問題ありません。

## Deref

さて、`Arc` を作れるようになりました（まもなく正しくクローンし、破棄できるようにもなります）が、中のデータにはどうアクセスするのでしょうか？

今必要なのは `Deref` の実装です。

このトレイトをインポートする必要があります。

<!-- ignore: simplified code -->
```rust,ignore
use std::ops::Deref;
```

実装は次のとおりです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Deref for Arc<T> {
    type Target = T;

    fn deref(&self) -> &T {
        let inner = unsafe { self.ptr.as_ref() };
        &inner.data
    }
}
```

とても単純ですね。`ArcInner<T>` を指す `NonNull` ポインタを参照外しし、中のデータへの参照を取得するだけです。

<a id="code"></a>

## コード

この節のコード全体は次のとおりです。

<!-- ignore: simplified code -->
```rust,ignore
use std::ops::Deref;

impl<T> Arc<T> {
    pub fn new(data: T) -> Arc<T> {
        // We start the reference count at 1, as that first reference is the
        // current pointer.
        let boxed = Box::new(ArcInner {
            rc: AtomicUsize::new(1),
            data,
        });
        Arc {
            // It is okay to call `.unwrap()` here as we get a pointer from
            // `Box::into_raw` which is guaranteed to not be null.
            ptr: NonNull::new(Box::into_raw(boxed)).unwrap(),
            phantom: PhantomData,
        }
    }
}

unsafe impl<T: Sync + Send> Send for Arc<T> {}
unsafe impl<T: Sync + Send> Sync for Arc<T> {}


impl<T> Deref for Arc<T> {
    type Target = T;

    fn deref(&self) -> &T {
        let inner = unsafe { self.ptr.as_ref() };
        &inner.data
    }
}
```
