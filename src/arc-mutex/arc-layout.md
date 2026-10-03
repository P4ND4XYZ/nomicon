<a id="layout"></a>

# レイアウト

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

まず、`Arc` の実装のレイアウトを作りましょう。

`Arc<T>` は、ヒープにアロケートされた型 `T` の値に対して、スレッド安全な共有所有権を提供します。
Rust では共有は不変性を意味するので、その値へのアクセスを管理する仕組みを設計する必要はありませんよね？
Mutex のような内部可変性を持つ型により Arc の利用者は共有された可変性を実現できますが、Arc 自体はこの問題を気にする必要はありません。

しかし、Arc が変更を気にする必要のある箇所が一つ_あります_。破棄です。
Arc の所有者がすべていなくなったとき、その内容を `drop` し、アロケーションを解放できなければなりません。
そのため、所有者が自分は_最後の_所有者なのかを知る方法が必要です。その最も単純な方法は、所有者の数を数えること、つまり参照カウントです。

残念ながら、この参照カウントは本質的に共有された可変状態なので、Arc は同期を考える_必要があります_。
これには Mutex を使う_こともできます_が、それは大げさです。代わりにアトミックを使います。
また、誰もがすでに T のアロケーションへのポインタを必要としているので、参照カウントも同じアロケーションに置くことにしましょう。

素朴に実装すると、次のようになります。

```rust
use std::sync::atomic;

pub struct Arc<T> {
    ptr: *mut ArcInner<T>,
}

pub struct ArcInner<T> {
    rc: atomic::AtomicUsize,
    data: T,
}
```

これはコンパイルできますが、正しくありません。まず、コンパイラが与える変性が厳しすぎます。
例えば、`Arc<&'a str>` が期待される場所で `Arc<&'static str>` を使えなくなります。
さらに重要なのは、型 `T` の値を何も所有していないと見なされるため、ドロップチェッカーに誤った所有権情報を与えることです。
これは値の共有所有権を提供する構造体なので、いずれかの時点で、そのデータを完全に所有するこの構造体のインスタンスが存在します。
変性とドロップチェックの詳細は、[所有権とライフタイムの章](../ownership.md)を参照してください。

最初の問題を解決するために、`NonNull<T>` を使えます。`NonNull<T>` は、次のことを宣言する生ポインタのラッパーであることに注意してください。

* `T` に関して共変です
* ポインタがヌルになることはありません

二つ目の問題を解決するために、`ArcInner<T>` を含む `PhantomData` マーカーを加えられます。
これにより、`ArcInner<T>` の値（それ自体が何らかの `T` を含みます）について、何らかの所有権を持つことをドロップチェッカーに伝えます。

これらの変更によって、最終的な構造体が得られます。

```rust
use std::marker::PhantomData;
use std::ptr::NonNull;
use std::sync::atomic::AtomicUsize;

pub struct Arc<T> {
    ptr: NonNull<ArcInner<T>>,
    phantom: PhantomData<ArcInner<T>>,
}

pub struct ArcInner<T> {
    rc: AtomicUsize,
    data: T,
}
```
