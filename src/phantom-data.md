# PhantomData

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

アンセーフなコードを扱っていると、型やライフタイムが構造体と論理的には関連しているのに、実際にはフィールドの一部になっていない状況によく出会います。最もよくあるのはライフタイムの場合です。たとえば、`&'a [T]` の `Iter` は、おおむね次のように定義されます。

```rust,compile_fail
struct Iter<'a, T: 'a> {
    ptr: *const T,
    end: *const T,
}
```

しかし、`'a` は構造体の本体で使われていないため、*無制限*です。[これによって過去に問題が起きた][unused-param]ため、構造体の定義では、無制限のライフタイムと型は*禁止されています*。そのため、本体の中で何らかの形でこれらの型に言及しなければなりません。正しい変性とドロップ検査を得るには、これを正しく行う必要があります。

[unused-param]: https://rust-lang.github.io/rfcs/0738-variance.html#the-corner-case-unused-parameters-and-parameters-that-are-only-used-unsafely

これには、特殊なマーカー型である `PhantomData` を使います。`PhantomData` は領域を占めませんが、静的解析のために、指定した型のフィールドを模擬します。これは、欲しい変性の種類を型システムに明示的に伝えるよりも誤りを招きにくいと考えられました。同時に、自動トレイトやドロップチェックに必要な情報など、ほかの有用なものも提供します。

`Iter` は論理的には多数の `&'a T` を含むので、`PhantomData` にもまさにそれを模擬するよう伝えます。

```rust
use std::marker;

struct Iter<'a, T: 'a> {
    ptr: *const T,
    end: *const T,
    _marker: marker::PhantomData<&'a T>,
}
```

これだけです。ライフタイムは制限され、イテレータは `'a` と `T` に関して共変になります。すべてがそのまま動作します。

<a id="generic-parameters-and-drop-checking"></a>

## ジェネリックパラメータとドロップ検査

以前は、ほかにも考慮すべきことがありました。

このドキュメント自体、かつては次のように述べていました。

> もう1つ重要な例は `Vec` です。おおむね次のように定義されます。
>
> ```rust
> struct Vec<T> {
>     data: *const T, // 変性のために *const を使います！
>     len: usize,
>     cap: usize,
> }
> ```
>
> 前の例とは異なり、すべてが望みどおりになっている*ように見えます*。`Vec` のすべてのジェネリック引数が、少なくとも1つのフィールドに現れています。これで大丈夫です！
>
> いいえ。
>
> ドロップチェッカーは寛大にも、`Vec<T>` は型 `T` の値を何も所有していないと判断します。その結果、ドロップ検査の健全性を判断するとき、`Vec` がデストラクタで `T` をドロップすることを心配する必要はないと結論します。これにより、`Vec` のデストラクタを使って不健全性を引き起こせるようになります。
>
> 型 `T` の値を*実際に*所有し、そのため*自分が*ドロップされるときに `T` をドロップする可能性があることをドロップチェッカーに伝えるには、まさにそのことを表す `PhantomData` を追加しなければなりません。
>
> ```rust
> use std::marker;
>
> struct Vec<T> {
>     data: *const T, // 変性のために *const を使います！
>     len: usize,
>     cap: usize,
>     _owns_T: marker::PhantomData<T>,
> }
> ```

しかし、[RFC 1238](https://rust-lang.github.io/rfcs/1238-nonparametric-dropck.html) 以降、**この説明はもはや正しくなく、その対応も必要ありません**。

次のように書くとします。

```rust
struct Vec<T> {
    data: *const T, // 変性のために `*const` を使います！
    len: usize,
    cap: usize,
}

# #[cfg(any())]
impl<T> Drop for Vec<T> { /* … */ }
```

この `impl<T> Drop for Vec<T>` が存在することにより、Rust は、その `Vec<T>` が型 `T` の値を*所有している*とみなします（より正確には、`Drop` 実装で型 `T` の値を使う可能性があるとみなします）。したがって、`Vec<T>` がドロップされるとき、それらが*ダングリング*になることを Rust は許しません。

型がすでに `Drop` 実装を持つ場合、**`_owns_T: PhantomData<T>` フィールドを追加するのは*余分*であり**、ドロップチェックの観点では**何の効果もありません**（ただし、変性と自動トレイトには依然として影響します）。

  - （高度な境界的ケース: `PhantomData` を含む型に `Drop` 実装がまったくなくても、ドロップグルーを持つ*別の*フィールドがあるために、その型自身がドロップグルーを持つ場合は、ここで述べるドロップチェックと `#[may_dangle]` の考慮事項がやはり当てはまります。その場合、`PhantomData<T>` フィールドは、それを含む型がスコープを抜けるたびに、`T` がドロップ可能であることを要求します。）

___

しかし、この状況によって、コードへの制約が厳しすぎることもあります。そのため標準ライブラリは、不安定で `unsafe` な属性を使い、このドキュメント自体が警告していた、従来の「未検査」のドロップ検査の挙動を再び選択しています。それが `#[may_dangle]` 属性です。

<a id="an-exception-the-special-case-of-the-standard-library-and-its-unstable-may_dangle"></a>

### 例外: 標準ライブラリと不安定な `#[may_dangle]` の特別なケース

自分のライブラリコードを書くだけなら、この節は読み飛ばせます。しかし、標準ライブラリが実際の `Vec` の定義で何をしているかに興味があれば、健全性のために、そこではまだ `_owns_T: PhantomData<T>` フィールドが必要なことに気付くでしょう。

<details><summary>理由を見るにはここをクリックしてください</summary>

次の例を考えてみましょう。

```rust
fn main() {
    let mut v: Vec<&str> = Vec::new();
    let s: String = "Short-lived".into();
    v.push(&s);
    drop(s);
} // <- `v` はここでドロップされます
```

従来の `impl<T> Drop for Vec<T> {` という定義では、上のコードは[拒否されます][is denied]。

[is denied]: https://rust.godbolt.org/z/ans15Kqz3

実際、この場合は、文字列への、ライフタイムが `'s` の参照を格納したベクタ `Vec</* T = */ &'s str>` があります。しかし、`let s: String` の `s` は `Vec` より先にドロップされるため、`Vec` がドロップされて `impl<'s> Drop for Vec<&'s str> {` が使われる時点では、`'s` は**期限切れになっています**。

つまり、このような `Drop` を使うと、*期限切れ*、つまり*ダングリング*のライフタイム `'s` を扱うことになります。しかし、これは Rust の原則に反します。Rust ではデフォルトで、関数シグネチャに関わるすべての Rust の参照がダングリングではなく、参照外ししても有効だからです。

このため、Rust は保守的にこのコードを拒否しなければなりません。

しかし、実際の `Vec` の場合、`Drop` 実装は `&'s str` を気にしません。*`&'s str` 自体にはドロップグルーがない*ためで、基盤となるバッファをデアロケートしたいだけです。

言い換えると、`Vec` を特別扱いしたり、`Vec` の特別な性質を利用したりして、何らかの方法で上のコードを受け入れられるとよさそうです。`Vec` は、*ドロップ時に、保持している `&'s str` を使わないと約束する*ことができるかもしれません。

この種の `unsafe` な約束を、`#[may_dangle]` で表現できます。

```rust ,ignore
unsafe impl<#[may_dangle] 's> Drop for Vec<&'s str> { /* … */ }
```

また、より一般的に、

```rust ,ignore
unsafe impl<#[may_dangle] T> Drop for Vec<T> { /* … */ }
```

とするのは、ドロップされるインスタンスの型パラメータはダングリングになってはならない、という Rust のドロップチェッカーの保守的な仮定を、`unsafe` に解除する方法です。

標準ライブラリのようにこれを行う場合、`T` 自体がドロップグルーを持つケースには注意が必要です。ここでは、`&'s str` を `struct PrintOnDrop<'s> /* = */ (&'s str);` に置き換えることを考えてみましょう。この型は、内側の `&'s str` を参照外しして画面に出力する `Drop` 実装を持つものとします。

実際、`Drop for Vec<T> {` は、基盤となるバッファをデアロケートする前に、ドロップグルーを持つ各 `T` 要素を推移的にドロップしなければなりません。`PrintOnDrop<'s>` の場合、`Drop for Vec<PrintOnDrop<'s>>` は、基盤となるバッファをデアロケートする前に、`PrintOnDrop<'s>` の要素を推移的にドロップしなければならないということです。

したがって、`'s` が `#[may_dangle]` だと言ったのは、緩すぎる表明でした。本当に言いたいのは、「`'s` は、推移的なドロップグルーに関わらないなら、ダングリングになってもよい」ということです。より一般的には、「`T` は、推移的なドロップグルーに関わらないなら、ダングリングになってもよい」となります。この「例外に対する例外」は、**`T` を所有している**ときには広く生じます。そのため、Rust の `#[may_dangle]` は、この解除条件を理解するだけの賢さを持ち、*構造体のフィールドがジェネリックパラメータを所有する形で保持している場合*には無効になります。

このため、標準ライブラリは最終的に次のようになります。

```rust
# #[cfg(any())]
// `Vec` のドロップ時には `T` を使わないと、固く約束します……
unsafe impl<#[may_dangle] T> Drop for Vec<T> {
    fn drop(&mut self) {
        unsafe {
            if mem::needs_drop::<T>() {
                /* … except here, that is, … */
                ptr::drop_in_place::<[T]>(/* … */);
            }
            // …
            dealloc(/* … */)
            // …
        }
    }
}

struct Vec<T> {
    // ……ただし `Vec` は `T` の要素を所有しているため、
    // ドロップ時には `T` の要素をドロップする可能性があります！
    _owns_T: core::marker::PhantomData<T>,

    ptr: *const T, // 変性のための `*const`（ただし、これ自体は `T` の所有権を表しません）
    len: usize,
    cap: usize,
}
```

</details>

___

アロケーションを所有する生ポインタは、とても広く使われるパターンなので、標準ライブラリは自分自身のために `Unique<T>` というユーティリティを作りました。これは次のようなものです。

* 変性のために `*const T` をラップします。
* `PhantomData<T>` を含みます。
* `T` を含むかのように `Send`／`Sync` を自動導出します。
* ヌルポインタ最適化のために、ポインタを `NonZero` としてマークします。

<a id="table-of-phantomdata-patterns"></a>

## `PhantomData` のパターン一覧

`PhantomData` を使うさまざまな素晴らしい方法を表に示します。

| ファントム型 | `'a` の変性 | `T` の変性 | `Send`／`Sync`<br/>（またはその欠如） | ドロップグルー内での `'a` または `T` のダングリング<br/>（例: `#[may_dangle] Drop`） |
|-----------------------------|:----------------:|:-----------------:|:-----------------------------------------:|:------------------------------------------------:|
| `PhantomData<T>`            | - | **共**変 | 引き継ぎます | 不可（「`T` を所有」） |
| `PhantomData<&'a T>`        | **共**変 | **共**変 | `Send + Sync`<br/>には<br/>`T : Sync` が必要 | 可 |
| `PhantomData<&'a mut T>`    | **共**変 | **不**変 | 引き継ぎます | 可 |
| `PhantomData<*const T>`     | - | **共**変 | `!Send + !Sync` | 可 |
| `PhantomData<*mut T>`       | - | **不**変 | `!Send + !Sync` | 可 |
| `PhantomData<fn(T)>`        | - | **反**変 | `Send + Sync` | 可 |
| `PhantomData<fn() -> T>`    | - | **共**変 | `Send + Sync` | 可 |
| `PhantomData<fn(T) -> T>`   | - | **不**変 | `Send + Sync` | 可 |
| `PhantomData<Cell<&'a ()>>` | **不**変 | - | `Send + !Sync` | 可 |

  - 注: 自動トレイト `Unpin` の自動実装を解除するには、代わりに専用の [`PhantomPinned`] 型が必要です。

[`PhantomPinned`]: ../core/marker/struct.PhantomPinned.html
