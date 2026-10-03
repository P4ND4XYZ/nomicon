<a id="higher-rank-trait-bounds-hrtbs"></a>

# 高階トレイト境界（HRTB）

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

Rust の `Fn` トレイトには、ちょっとした魔法があります。たとえば、次のコードを書けます。

```rust
struct Closure<F> {
    data: (u8, u16),
    func: F,
}

impl<F> Closure<F>
    where F: Fn(&(u8, u16)) -> &u8,
{
    fn call(&self) -> &u8 {
        (self.func)(&self.data)
    }
}

fn do_it(data: &(u8, u16)) -> &u8 { &data.0 }

fn main() {
    let clo = Closure { data: (0, 1), func: do_it };
    println!("{}", clo.call());
}
```

このコードを[ライフタイムの節][lt]と同じように素朴に脱糖しようとすると、問題が起こります。

<!-- ignore: desugared code -->
```rust,ignore
// 注意: `&'b data.0` と `'x: {` は正当な構文ではありません！
struct Closure<F> {
    data: (u8, u16),
    func: F,
}

impl<F> Closure<F>
    // where F: Fn(&'??? (u8, u16)) -> &'??? u8,
{
    fn call<'a>(&'a self) -> &'a u8 {
        (self.func)(&self.data)
    }
}

fn do_it<'b>(data: &'b (u8, u16)) -> &'b u8 { &'b data.0 }

fn main() {
    'x: {
        let clo = Closure { data: (0, 1), func: do_it };
        println!("{}", clo.call());
    }
}
```

`F` のトレイト境界にあるライフタイムを、いったいどう表現すればよいのでしょうか。そこには何らかのライフタイムを指定しなければなりませんが、必要なライフタイムは `call` の本体に入るまで名前を付けられません！また、これは固定されたライフタイムでもありません。`call` は、その時点で `&self` が持つ*どんな*ライフタイムでも動作します。

ここでは、高階トレイト境界（Higher-Rank Trait Bounds、HRTB）という魔法が必要です。次のように脱糖します。

<!-- ignore: simplified code -->
```rust,ignore
where for<'a> F: Fn(&'a (u8, u16)) -> &'a u8,
```

別の書き方もあります。

<!-- ignore: simplified code -->
```rust,ignore
where F: for<'a> Fn(&'a (u8, u16)) -> &'a u8,
```

（ここで `Fn(a, b, c) -> d` 自体も、不安定な*本当の* `Fn` トレイトのシンタックスシュガーです。）

`for<'a>` は「`'a` に何を選んでも」と読めます。基本的には、`F` が満たさなければならないトレイト境界の*無限のリスト*を生成します。強烈ですね。`Fn` トレイト以外で HRTB に出会う場所は多くありませんし、`Fn` トレイトでも、よくあるケースには便利な魔法のシンタックスシュガーがあります。

まとめると、もとのコードは、より明示的に次のように書き直せます。

```rust
struct Closure<F> {
    data: (u8, u16),
    func: F,
}

impl<F> Closure<F>
    where for<'a> F: Fn(&'a (u8, u16)) -> &'a u8,
{
    fn call(&self) -> &u8 {
        (self.func)(&self.data)
    }
}

fn do_it(data: &(u8, u16)) -> &u8 { &data.0 }

fn main() {
    let clo = Closure { data: (0, 1), func: do_it };
    println!("{}", clo.call());
}
```

[lt]: lifetimes.html
