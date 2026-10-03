# レイアウト

まず、構造体のレイアウトを決める必要があります。`Vec` は、アロケーションへのポインタ、アロケーションのサイズ、初期化済みの要素数という 3 つの部分から成ります。

単純に考えると、次の設計がよさそうです。

<!-- ignore: simplified code -->
```rust,ignore
pub struct Vec<T> {
    ptr: *mut T,
    cap: usize,
    len: usize,
}
```

実際、これはコンパイルできます。しかし、制約が厳しすぎます。コンパイラによって変性も厳しすぎるものになります。たとえば、`&Vec<&'static str>` は、`&Vec<&'a str>` が期待される場所では使えません。変性について詳しくは、[所有権とライフタイムの章][ownership]を参照してください。

所有権の章で見たように、標準ライブラリは、自ら所有するアロケーションへの生ポインタを持つ場合、`*mut T` の代わりに `Unique<T>` を使います。ただし、`Unique` は不安定なので、可能なら使わずに済ませたいところです。

要点を振り返ると、`Unique` は生ポインタを包むラッパで、次のことを宣言します。

* `T` に対して共変である
* 型 `T` の値を所有する可能性がある（ここでの例には関係ありませんが、実際の `std::vec::Vec<T>` がこれを必要とする理由は[PhantomData の章][phantom-data]を参照してください）
* `T` が `Send`／`Sync` なら、自身もそれぞれ `Send`／`Sync` である
* ポインタは決してヌルではない（そのため `Option<Vec<T>>` はヌルポインタ最適化される）

これらの要件は、安定版 Rust でもすべて実装できます。そのために、`Unique<T>` の代わりに、同じく生ポインタを包む別のラッパである [`NonNull<T>`][NonNull] を使います。`NonNull<T>` は、上記の性質のうち 2 つ、つまり `T` に対して共変であることと、ヌルではないと宣言されていることを備えています。`T` が `Send`／`Sync` なら `Send`／`Sync` を実装することで、`Unique<T>` を使った場合と同じ結果になります。

```rust
use std::ptr::NonNull;

pub struct Vec<T> {
    ptr: NonNull<T>,
    cap: usize,
    len: usize,
}

unsafe impl<T: Send> Send for Vec<T> {}
unsafe impl<T: Sync> Sync for Vec<T> {}
# fn main() {}
```

[ownership]: ../ownership.html
[phantom-data]: ../phantom-data.md
[NonNull]: ../../std/ptr/struct.NonNull.html
