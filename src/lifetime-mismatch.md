<a id="limits-of-lifetimes"></a>

# ライフタイムシステムの限界

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

次のコードを考えてみましょう。

```rust,compile_fail
#[derive(Debug)]
struct Foo;

impl Foo {
    fn mutate_and_share(&mut self) -> &Self { &*self }
    fn share(&self) {}
}

fn main() {
    let mut foo = Foo;
    let loan = foo.mutate_and_share();
    foo.share();
    println!("{:?}", loan);
}
```

これはコンパイルできると思うかもしれません。`mutate_and_share` を呼び出すと、`foo` は一時的に可変借用されますが、返されるのは共有参照だけです。したがって、`foo` は可変借用されていないはずなので、`foo.share()` は成功すると期待します。

しかし、コンパイルしようとすると、次のようになります。

```text
error[E0502]: cannot borrow `foo` as immutable because it is also borrowed as mutable
  --> src/main.rs:12:5
   |
11 |     let loan = foo.mutate_and_share();
   |                --- mutable borrow occurs here
12 |     foo.share();
   |     ^^^ immutable borrow occurs here
13 |     println!("{:?}", loan);
```

何が起こったのでしょうか。[前の節の2つ目の例][ex2]とまったく同じ推論が行われたのです。プログラムを脱糖すると、次のようになります。

<!-- ignore: desugared code -->
```rust,ignore
struct Foo;

impl Foo {
    fn mutate_and_share<'a>(&'a mut self) -> &'a Self { &'a *self }
    fn share<'a>(&'a self) {}
}

fn main() {
    'b: {
        let mut foo: Foo = Foo;
        'c: {
            let loan: &'c Foo = Foo::mutate_and_share::<'c>(&'c mut foo);
            'd: {
                Foo::share::<'d>(&'d foo);
            }
            println!("{:?}", loan);
        }
    }
}
```

`loan` のライフタイムと `mutate_and_share` のシグネチャにより、ライフタイムシステムは `&mut foo` のライフタイムを `'c` まで延長せざるを得ません。そこで `share` を呼び出そうとすると、その `&'c mut foo` に別名を作ろうとしていると判断され、コンパイラがエラーを出します！

このプログラムは、私たちが実際に重視している参照の意味論に照らせば明らかに正しいのですが、ライフタイムシステムはそれを扱うには粗すぎるのです。

[ex2]: lifetimes.html#example-aliasing-a-mutable-reference
