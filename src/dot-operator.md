<a id="the-dot-operator"></a>

# ドット演算子

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

ドット演算子は型を変換するために多くの魔法を使います。
型が一致するまで、自動参照、自動参照外し、強制変換を行います。
メソッド探索の詳しい仕組みは[こちら][method_lookup]に定義されていますが、ここでは主要な手順を簡単に説明します。

レシーバ（`self`、`&self`、または `&mut self` パラメータ）を持つ関数 `foo` があるとします。
`value.foo()` を呼び出すと、コンパイラは関数の正しい実装を呼び出す前に、`Self` がどの型かを決定する必要があります。
この例では、`value` の型を `T` とします。

どの型に対して関数を呼び出しているかを明確にするため、[完全修飾構文][fqs]を使います。

- まず、コンパイラは `T::foo(value)` を直接呼び出せるか確認します。
これは「値渡し」のメソッド呼び出しと呼ばれます。
- この関数を呼び出せない場合（例えば、関数の型が違う場合や、`Self` にトレイトが実装されていない場合）、コンパイラは自動的に参照を追加しようとします。
つまり、`<&T>::foo(value)` と `<&mut T>::foo(value)` を試します。
これは「autoref」のメソッド呼び出しと呼ばれます。
- これらの候補がどれもうまくいかなければ、`T` を参照外しして再び試します。
ここでは `Deref` トレイトを使います。`T: Deref<Target = U>` なら、`T` の代わりに型 `U` で再び試します。
`T` を参照外しできなければ、`T` の_アンサイズ化_を試すこともできます。
これは単に、`T` にコンパイル時に既知のサイズパラメータがある場合、メソッドを解決するためにそれを「忘れる」ということです。
例えば、このアンサイズ化の手順では、配列のサイズを「忘れる」ことで `[i32; 2]` を `[i32]` に変換できます。

メソッド探索アルゴリズムの例を見てみましょう。

```rust,ignore
let array: Rc<Box<[T; 3]>> = ...;
let first_entry = array[0];
```

配列がこれほど多くの間接参照の奥にあるとき、コンパイラは実際にどうやって `array[0]` を計算するのでしょうか？
まず、`array[0]` は実際には [`Index`][index] トレイトのシンタックスシュガーにすぎません。
コンパイラは `array[0]` を `array.index(0)` に変換します。
そして、関数を呼び出せるように、`array` が `Index` を実装しているか確認します。

そこでコンパイラは `Rc<Box<[T; 3]>>` が `Index` を実装しているか確認しますが、実装していません。`&Rc<Box<[T; 3]>>` も `&mut Rc<Box<[T; 3]>>` も同様です。
どれもうまくいかなかったので、コンパイラは `Rc<Box<[T; 3]>>` を参照外しして `Box<[T; 3]>` にし、再び試します。
`Box<[T; 3]>`、`&Box<[T; 3]>`、`&mut Box<[T; 3]>` は `Index` を実装していないので、さらに参照外しします。
`[T; 3]` とその自動参照も `Index` を実装していません。
`[T; 3]` は参照外しできないので、コンパイラはアンサイズ化して `[T]` にします。
ついに `[T]` は `Index` を実装しているので、実際の `index` 関数を呼び出せます。

ドット演算子が働く、次のより複雑な例を考えてみましょう。

```rust
fn do_stuff<T: Clone>(value: &T) {
    let cloned = value.clone();
}
```

`cloned` はどの型でしょうか？
まず、コンパイラは値渡しで呼び出せるか確認します。
`value` の型は `&T` なので、`clone` 関数のシグネチャは `fn clone(&T) -> T` です。
`T: Clone` であることが分かっているので、コンパイラは `cloned: T` と判断します。

`T: Clone` という制約を取り除くとどうなるでしょうか？ `T` に対する `Clone` の実装がないので、値渡しでは呼び出せません。
そこでコンパイラは自動参照による呼び出しを試します。
この場合、`Self = &T` なので、関数のシグネチャは `fn clone(&&T) -> &T` になります。
コンパイラは `&T: Clone` を確認し、`cloned: &T` と推論します。

自動参照の挙動が微妙な効果を生む、別の例を見てみましょう。

```rust
# use std::sync::Arc;
#
#[derive(Clone)]
struct Container<T>(Arc<T>);

fn clone_containers<T>(foo: &Container<i32>, bar: &Container<T>) {
    let foo_cloned = foo.clone();
    let bar_cloned = bar.clone();
}
```

`foo_cloned` と `bar_cloned` はどの型でしょうか？
`Container<i32>: Clone` であることが分かっているので、コンパイラは値渡しで `clone` を呼び出し、`foo_cloned: Container<i32>` を得ます。
しかし、`bar_cloned` の型は実際には `&Container<T>` です。
これはおかしいはずです。`Container` に `#[derive(Clone)]` を追加したのですから、`Clone` を実装しているはずではないでしょうか！
よく見ると、`derive` マクロが生成するコードは（おおよそ）次のようになります。

```rust,ignore
impl<T> Clone for Container<T> where T: Clone {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}
```

導出された `Clone` の実装は [`T: Clone` の場合にのみ定義される][clone]ので、一般の `T` について `Container<T>: Clone` を満たす実装はありません。
そこでコンパイラは `&Container<T>` が `Clone` を実装しているか確認し、実装されていると分かります。
したがって `clone` は自動参照で呼び出されると推論し、`bar_cloned` の型は `&Container<T>` になります。

`T: Clone` を要求せずに `Clone` を手動で実装すれば、これを修正できます。

```rust,ignore
impl<T> Clone for Container<T> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}
```

これで型チェッカーは `bar_cloned: Container<T>` と推論します。

[fqs]: ../book/ch19-03-advanced-traits.html#fully-qualified-syntax-for-disambiguation-calling-methods-with-the-same-name
[method_lookup]: https://rustc-dev-guide.rust-lang.org/hir-typeck/method-lookup.html
[index]: ../std/ops/trait.Index.html
[clone]: ../std/clone/trait.Clone.html#derivable
