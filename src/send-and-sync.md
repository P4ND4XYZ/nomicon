<a id="send-and-sync"></a>

# Send と Sync

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

ただし、すべてが継承された可変性に従うわけではありません。メモリ上のある場所を変更しながら、その複数の別名を持てる型もあります。これらの型が同期によってこのアクセスを管理しない限り、絶対にスレッド安全ではありません。Rust はこれを `Send` と `Sync` トレイトで表します。

* 別のスレッドへ安全に送れる型は Send です。
* スレッド間で安全に共有できる型は Sync です（T が Sync であることと `&T` が Send であることは同値です）。

Send と Sync は Rust の並行性の基礎です。そのため、これらを正しく機能させる特別な仕組みが数多くあります。何よりもまず、これらは[アンセーフなトレイト][unsafe traits]です。つまり、実装することがアンセーフであり、他のアンセーフなコードはこれらが正しく実装されていると仮定できます。これらは*マーカートレイト*（メソッドなどの関連アイテムを持ちません）なので、正しく実装されているとは、単に実装する型が持つべき本質的な性質を持っているという意味です。Send や Sync を不正に実装すると、未定義動作を引き起こし得ます。

Send と Sync は自動的に導出されるトレイトでもあります。つまり、他のすべてのトレイトとは異なり、ある型がすべて Send または Sync の型から構成されていれば、その型もそれぞれ Send または Sync になります。ほぼすべてのプリミティブは Send かつ Sync であり、その結果、皆さんが扱う型のほとんどすべてが Send かつ Sync です。

主な例外には次のものがあります。

* 生ポインタは Send でも Sync でもありません（安全性を守る仕組みがないためです）。
* `UnsafeCell` は Sync ではありません（したがって `Cell` と `RefCell` もそうです）。
* `Rc` は Send でも Sync でもありません（参照カウントが共有され、同期されていないためです）。

`Rc` と `UnsafeCell` は根本的にスレッド安全ではありません。同期されない共有可変状態を可能にするからです。しかし、生ポインタがスレッド安全ではないとされるのは、厳密にはむしろ *lint* としての意味合いがあります。生ポインタで有用なことをするには参照外しが必要で、それはすでにアンセーフです。その意味では、これらをスレッド安全としても「問題ない」と主張することもできます。

しかし、生ポインタを含む型が自動的にスレッド安全とされるのを防ぐために、生ポインタがスレッド安全ではないことは重要です。これらの型には、追跡されていない複雑な所有権があり、作者が必ずしもスレッド安全性について十分に考えていたとは期待できません。`Rc` は、`*mut` を含み、確実にスレッド安全ではない型の良い例です。

自動的に導出されない型でも、必要なら単にこれらを実装できます。

```rust
struct MyBox(*mut u8);

unsafe impl Send for MyBox {}
unsafe impl Sync for MyBox {}
```

型が不適切に Send または Sync として自動導出されるという*非常にまれな*場合には、Send と Sync を実装しないことを明示することもできます。

```rust
#![feature(negative_impls)]

// I have some magic semantics for some synchronization primitive!
struct SpecialThreadToken(u8);

impl !Send for SpecialThreadToken {}
impl !Sync for SpecialThreadToken {}
```

Send と Sync の導出は、*それ自体では*不正になり得ないことに注意してください。他のアンセーフなコードによって特別な意味を与えられた型だけが、不正に Send または Sync となることで問題を起こす可能性があります。

生ポインタのほとんどの用途は、Send と Sync を導出できる十分な抽象化の内側にカプセル化するべきです。たとえば Rust の標準コレクションはすべて、アロケーションや複雑な所有権を管理するために生ポインタを広く使っているにもかかわらず、（Send かつ Sync の型を含む場合は）Send かつ Sync です。同様に、これらのコレクションのほとんどのイテレータも、概ねコレクションへの `&` や `&mut` のように振る舞うので、Send かつ Sync です。

<a id="example"></a>

## 例

[`Box`][box-doc] は[さまざまな理由][box-is-special]から、コンパイラによって特別な組み込み型として実装されています。しかし、似たような振る舞いをするものを自分で実装して、Send と Sync の実装が健全となる例を見ることができます。これを `Carton` と呼びましょう。

まず、スタック上にアロケートされた値を取り、ヒープへ移すコードを書きます。

```rust
# pub mod libc {
#    pub use ::std::os::raw::{c_int, c_void};
#    #[allow(non_camel_case_types)]
#    pub type size_t = usize;
#    unsafe extern "C" { pub fn posix_memalign(memptr: *mut *mut c_void, align: size_t, size: size_t) -> c_int; }
# }
use std::{
    mem::{align_of, size_of},
    ptr,
    cmp::max,
};

struct Carton<T>(ptr::NonNull<T>);

impl<T> Carton<T> {
    pub fn new(value: T) -> Self {
        // Allocate enough memory on the heap to store one T.
        assert_ne!(size_of::<T>(), 0, "Zero-sized types are out of the scope of this example");
        let mut memptr: *mut T = ptr::null_mut();
        unsafe {
            let ret = libc::posix_memalign(
                (&mut memptr as *mut *mut T).cast(),
                max(align_of::<T>(), size_of::<usize>()),
                size_of::<T>()
            );
            assert_eq!(ret, 0, "Failed to allocate or invalid alignment");
        };

        // NonNull is just a wrapper that enforces that the pointer isn't null.
        let ptr = {
            // Safety: memptr is dereferenceable because we created it from a
            // reference and have exclusive access.
            ptr::NonNull::new(memptr)
                .expect("Guaranteed non-null if posix_memalign returns 0")
        };

        // Move value from the stack to the location we allocated on the heap.
        unsafe {
            // Safety: If non-null, posix_memalign gives us a ptr that is valid
            // for writes and properly aligned.
            ptr.as_ptr().write(value);
        }

        Self(ptr)
    }
}
```

これでは、ユーザーが一度値を渡すと、その値にアクセスする方法がないため、あまり役に立ちません。[`Box`][box-doc] は内部の値にアクセスできるように [`Deref`][deref-doc] と [`DerefMut`][deref-mut-doc] を実装しています。同じことをしましょう。

```rust
use std::ops::{Deref, DerefMut};

# struct Carton<T>(std::ptr::NonNull<T>);
#
impl<T> Deref for Carton<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        unsafe {
            // Safety: The pointer is aligned, initialized, and dereferenceable
            //   by the logic in [`Self::new`]. We require readers to borrow the
            //   Carton, and the lifetime of the return value is elided to the
            //   lifetime of the input. This means the borrow checker will
            //   enforce that no one can mutate the contents of the Carton until
            //   the reference returned is dropped.
            self.0.as_ref()
        }
    }
}

impl<T> DerefMut for Carton<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        unsafe {
            // Safety: The pointer is aligned, initialized, and dereferenceable
            //   by the logic in [`Self::new`]. We require writers to mutably
            //   borrow the Carton, and the lifetime of the return value is
            //   elided to the lifetime of the input. This means the borrow
            //   checker will enforce that no one else can access the contents
            //   of the Carton until the mutable reference returned is dropped.
            self.0.as_mut()
        }
    }
}
```

最後に、作成した `Carton` が Send かつ Sync かどうか考えましょう。可変状態への排他的アクセスを強制せずに他のものとその状態を共有しているのでなければ、安全に Send にできます。各 `Carton` のポインタは一意なので、問題ありません。

```rust
# struct Carton<T>(std::ptr::NonNull<T>);
// Safety: No one besides us has the raw pointer, so we can safely transfer the
// Carton to another thread if T can be safely transferred.
unsafe impl<T> Send for Carton<T> where T: Send {}
```

Sync はどうでしょうか。`Carton` が Sync となるには、ある `&Carton` に格納されたものが別の `&Carton` から読み書きできる間は、それに書き込めないことを強制する必要があります。ポインタへの書き込みには `&mut Carton` が必要で、借用チェッカーが可変参照の排他性を強制するので、`Carton` を Sync にすることにも健全性の問題はありません。

```rust
# struct Carton<T>(std::ptr::NonNull<T>);
// Safety: Since there exists a public way to go from a `&Carton<T>` to a `&T`
// in an unsynchronized fashion (such as `Deref`), then `Carton<T>` can't be
// `Sync` if `T` isn't.
// Conversely, `Carton` itself does not use any interior mutability whatsoever:
// all the mutations are performed through an exclusive reference (`&mut`). This
// means it suffices that `T` be `Sync` for `Carton<T>` to be `Sync`:
unsafe impl<T> Sync for Carton<T> where T: Sync  {}
```

自分の型が Send かつ Sync だと表明するときは、通常、含まれる型すべてが Send かつ Sync であることを強制する必要があります。標準ライブラリの型のように振る舞う独自の型を書く場合には、同じ要件を持つことを表明できます。たとえば次のコードは、同じ種類の Box が Send となるなら Carton も Send であることを表明します。この場合、それは T が Send であると言うのと同じです。

```rust
# struct Carton<T>(std::ptr::NonNull<T>);
unsafe impl<T> Send for Carton<T> where Box<T>: Send {}
```

現時点では、`Carton<T>` はアロケートしたメモリを決して解放しないため、メモリリークがあります。これを修正すると、Send となるために満たすことを保証しなければならない新たな要件が生じます。別のスレッドで行われたアロケーションから得られたポインタに対して `free` を呼べることを知る必要があります。これが成り立つことは [`libc::free`][libc-free-docs] のドキュメントで確認できます。

```rust
# struct Carton<T>(std::ptr::NonNull<T>);
# mod libc {
#     pub use ::std::os::raw::c_void;
#     unsafe extern "C" { pub fn free(p: *mut c_void); }
# }
impl<T> Drop for Carton<T> {
    fn drop(&mut self) {
        unsafe {
            libc::free(self.0.as_ptr().cast());
        }
    }
}
```

これが成り立たない良い例が MutexGuard です。[Send ではない][mutex-guard-not-send-docs-rs]ことに注目してください。MutexGuard の実装は、別のスレッドで獲得したロックを解放しようとしないことを保証する必要がある[ライブラリを使っています][mutex-guard-not-send-comment]。MutexGuard を別のスレッドへ Send できるなら、送り先のスレッドでデストラクタが実行され、この要件に違反します。それでも MutexGuard は Sync になれます。別のスレッドへ送れるのは `&MutexGuard` だけで、参照をドロップしても何も起きないからです。

TODO: 何が Send や Sync になれて、何がなれないかをもっと詳しく説明します。データ競合だけに訴える説明で十分でしょうか。

[unsafe traits]: safe-unsafe-meaning.html
[box-doc]: https://doc.rust-lang.org/std/boxed/struct.Box.html
[box-is-special]: https://manishearth.github.io/blog/2017/01/10/rust-tidbits-box-is-special/
[deref-doc]: https://doc.rust-lang.org/core/ops/trait.Deref.html
[deref-mut-doc]: https://doc.rust-lang.org/core/ops/trait.DerefMut.html
[mutex-guard-not-send-docs-rs]: https://doc.rust-lang.org/std/sync/struct.MutexGuard.html#impl-Send-for-MutexGuard%3C'_,+T%3E
[mutex-guard-not-send-comment]: https://github.com/rust-lang/rust/issues/23465#issuecomment-82730326
[libc-free-docs]: https://linux.die.net/man/3/free
