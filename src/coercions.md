<a id="coercions"></a>

# 強制変換

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

特定の文脈では、暗黙の強制変換によって型を変更できます。
これらの変更は一般に型を*弱める*だけであり、主にポインタとライフタイムに関するものです。
主な目的は、より多くの場合に Rust が「そのまま動く」ようにすることであり、大部分は無害です。

強制変換の種類を網羅した一覧については、リファレンスの[強制変換の種類][Coercion types]の節を参照してください。

トレイトの照合では強制変換を行わないことに注意してください（レシーバは例外です。[次のページ][dot-operator]を参照してください）。
ある型 `U` に対する `impl` があり、`T` が `U` に強制変換されるとしても、それは `T` に対する実装にはなりません。
例えば、`t` を `&T` に強制変換でき、`&T` に対する `impl` があるにもかかわらず、次の例は型チェックに通りません。

```rust,compile_fail
trait Trait {}

fn foo<X: Trait>(t: X) {}

impl<'a> Trait for &'a i32 {}

fn main() {
    let t: &mut i32 = &mut 0;
    foo(t);
}
```

次のようなエラーになります。

```text
error[E0277]: the trait bound `&mut i32: Trait` is not satisfied
 --> src/main.rs:9:9
  |
3 | fn foo<X: Trait>(t: X) {}
  |           ----- required by this bound in `foo`
...
9 |     foo(t);
  |         ^ the trait `Trait` is not implemented for `&mut i32`
  |
  = help: the following implementations were found:
            <&'a i32 as Trait>
  = note: `Trait` is implemented for `&i32`, but not for `&mut i32`
```

[Coercion types]: ../reference/type-coercions.html#coercion-types
[dot-operator]: ./dot-operator.html
