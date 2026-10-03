<a id="type-conversions"></a>

# 型変換

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

結局のところ、すべてはどこかにあるビットの集まりにすぎず、型システムはそのビットを正しく使うための手助けとして存在します。ビットに型を与える際には、よくある問題が2つあります。同じビットをそのまま別の型として再解釈する必要があることと、別の型で同等の意味を持つようにビットを変更する必要があることです。Rust は重要な性質を型システムに組み込むことを推奨しているので、これらの問題は非常に広く現れます。そのため、Rust はこれらを解決する方法をいくつか用意しています。

まず、安全な Rust が提供する、値を再解釈する方法を見ていきます。最も単純な方法は、値を構成要素に分解し、それらから新しい型の値を組み立てることです。例えば、次のようにします。

```rust
struct Foo {
    x: u32,
    y: u16,
}

struct Bar {
    a: u32,
    b: u16,
}

fn reinterpret(foo: Foo) -> Bar {
    let Foo { x, y } = foo;
    Bar { a: x, b: y }
}
```

しかし、これはよくても煩わしい方法です。よくある変換については、Rust はもっと扱いやすい代替手段を提供しています。
