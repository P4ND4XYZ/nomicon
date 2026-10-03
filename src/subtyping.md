<a id="subtyping-and-variance"></a>

# サブタイピングと変性

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

Rust は、借用と所有権の関係を追跡するためにライフタイムを使います。しかし、ライフタイムを素朴に実装すると、制約が厳しすぎるか、未定義動作を許してしまうかのどちらかになります。

ライフタイムを柔軟に使えるようにしつつ、誤用も防ぐために、Rust は**サブタイピング**と**変性**を使います。

まず例を見てみましょう。

```rust
// 注: debug は、*同じ*ライフタイムを持つ2つの引数を期待します
fn debug<'a>(a: &'a str, b: &'a str) {
    println!("a = {a:?} b = {b:?}");
}

fn main() {
    let hello: &'static str = "hello";
    {
        let world = String::from("world");
        let world = &world; // 'world は 'static より短いライフタイムです
        debug(hello, world);
    }
}
```

保守的なライフタイムの実装では、`hello` と `world` のライフタイムが異なるため、次のようなエラーが出るかもしれません。

```text
error[E0308]: mismatched types
 --> src/main.rs:10:16
   |
10 |         debug(hello, world);
   |                      ^
   |                      |
   |                      expected `&'static str`, found struct `&'world str`
```

これは困ります。この場合に受け入れたいのは、`'world` と*少なくとも同じ長さだけ*存続するあらゆる型です。ライフタイムにサブタイピングを使ってみましょう。

<a id="subtyping"></a>

## サブタイピング

サブタイピングとは、ある型を別の型の代わりに使えるという考え方です。

`Sub` は `Super` のサブタイプであると定義しましょう（この章では `Sub <: Super` という記法を使います）。

これは、`Super` が定義する*要件*の集合を `Sub` が完全に満たしているということです。`Sub` は、さらに多くの要件を持つこともあります。

ライフタイムでサブタイピングを使うには、ライフタイムの要件を定義する必要があります。

> `'a` はコードの領域を定義します。

ライフタイムの要件の集合を定義できたので、ライフタイム同士の関係を定義できます。

> `'long <: 'short` であるのは、`'long` が定義するコード領域が `'short` を**完全に含む**場合、かつその場合に限ります。

`'long` が `'short` より大きい領域を定義していても、この定義に当てはまります。

> この章の残りで見ていくように、サブタイピングは実際にはもっと複雑で微妙なものです。しかし、この単純な規則は、99%の場面でとても役立つ直感を与えてくれます。アンセーフなコードを書かない限り、コンパイラがすべての境界的なケースを自動的に処理してくれます。

> しかし、これは Rustonomicon です。私たちはアンセーフなコードを書くので、これらが実際にどう動くのか、そしてどうすれば間違えてしまうのかを理解する必要があります。

先ほどの例に戻ると、`'static <: 'world` と言えます。ここでは、ライフタイムのサブタイプ関係が参照を通して引き継がれることも受け入れましょう（詳しくは[変性](#variance)で説明します）。たとえば、`&'static str` が `&'world str` のサブタイプなら、`&'static str` を `&'world str` へ「弱める」ことができます。これにより、先ほどの例はコンパイルできます。

```rust
fn debug<'a>(a: &'a str, b: &'a str) {
    println!("a = {a:?} b = {b:?}");
}

fn main() {
    let hello: &'static str = "hello";
    {
        let world = String::from("world");
        let world = &world; // 'world は 'static より短いライフタイムです
        debug(hello, world); // hello は暗黙に `&'static str` から `&'world str` へ弱められます
    }
}
```

<a id="variance"></a>

## 変性

先ほどは、`'static <: 'b` なら `&'static T <: &'b T` となるという点を詳しく説明しませんでした。ここで使われているのが、*変性*と呼ばれる性質です。ただし、いつもこの例のように単純とは限りません。それを理解するため、例を少し拡張してみましょう。

```rust,compile_fail,E0597
fn assign<T>(input: &mut T, val: T) {
    *input = val;
}

fn main() {
    let mut hello: &'static str = "hello";
    {
        let world = String::from("world");
        assign(&mut hello, &world);
    }
    println!("{hello}"); // 解放後使用 😿
}
```

`assign` では、`hello` の参照先を `world` に設定しています。しかし、その後の `println!` で `hello` を使う前に、`world` はスコープを抜けます。

これは典型的な解放後使用のバグです！

最初は `assign` の実装を疑いたくなるかもしれませんが、ここには何の問題もありません。`T` に `T` を代入したいと思うのは、当然のことです。

問題は、`&'static str` が `&mut` 参照の背後に入ると、`T` を満たすために引き続き `&'world str` へ弱められるとは仮定できないことです。つまり、`'static` が `'world` のサブタイプであっても、`&mut &'static str` は `&mut &'world str` の*サブタイプ*には**なれません**。

変性は、ジェネリックパラメータを介したサブタイプの関係を定義するために、Rust が取り入れている概念です。

> 注: 説明の便宜上、`T` について話しやすいようにジェネリック型 `F<T>` を定義します。文脈から意味が伝わればと思います。

型 `F` の*変性*は、その入力のサブタイプ関係が出力のサブタイプ関係にどう影響するかを表します。Rust には3種類の変性があります。`Sub` が `Super` のサブタイプである2つの型 `Sub` と `Super` に対して、次のように定義します。

* `F<Sub>` が `F<Super>` のサブタイプなら、`F` は**共変**です（サブタイプ関係が引き継がれます）。
* `F<Super>` が `F<Sub>` のサブタイプなら、`F` は**反変**です（サブタイプ関係が「逆転」します）。
* それ以外の場合、`F` は**不変**です（サブタイプ関係が存在しません）。

先ほどの例を思い出すと、`'a <: 'b` なら `&'a T` を `&'b T` のサブタイプとして扱っても問題ありませんでした。したがって、`&'a T` は `'a` に関して*共変*だと言えます。

また、`&mut &'a T` を `&mut &'b T` のサブタイプとして扱うことはできませんでした。したがって、`&mut T` は `T` に関して*不変*だと言えます。

ほかのジェネリック型とその変性を表に示します。

|                 | 'a | T | U |
|-----------------|:---------:|:-----------------:|:---------:|
| `&'a T `        | 共変 | 共変 | |
| `&'a mut T`     | 共変 | 不変 | |
| `Box<T>`        | | 共変 | |
| `Vec<T>`        | | 共変 | |
| `UnsafeCell<T>` | | 不変 | |
| `Cell<T>`       | | 不変 | |
| `fn(T) -> U`    | | **反**変 | 共変 |
| `*const T`      | | 共変 | |
| `*mut T`        | | 不変 | |

これらの一部は、ほかの型との関係から簡単に説明できます。

* `Vec<T>` と、ほかのすべての所有権を持つポインタやコレクションは、`Box<T>` と同じ理屈に従います。
* `Cell<T>` と、ほかのすべての内部可変性を持つ型は、`UnsafeCell<T>` と同じ理屈に従います。
* `UnsafeCell<T>` は内部可変性を持つため、`&mut T` と同じ変性の性質を持ちます。
* `*const T` は `&T` と同じ理屈に従います。
* `*mut T` は `&mut T`（または `UnsafeCell<T>`）と同じ理屈に従います。

さらに多くの型については、Reference の[「変性」の節][variance-table]を参照してください。

[variance-table]: ../reference/subtyping.html#variance

> 注: この言語で反変性が生じる*唯一*の場所は関数の引数なので、実際にはあまり登場しません。反変性を使うには、特定のライフタイムを持つ参照を受け取る関数ポインタで、高階プログラミングを行うことになります（通常の「任意のライフタイム」とは異なります。そちらは高階ライフタイムに関わるもので、サブタイピングとは独立して機能します）。

変性をより形式的に理解できたので、さらにいくつかの例を詳しく見ていきましょう。

```rust,compile_fail,E0597
fn assign<T>(input: &mut T, val: T) {
    *input = val;
}

fn main() {
    let mut hello: &'static str = "hello";
    {
        let world = String::from("world");
        assign(&mut hello, &world);
    }
    println!("{hello}");
}
```

これを実行しようとすると、どうなるでしょうか。

```text
error[E0597]: `world` does not live long enough
  --> src/main.rs:9:28
   |
6  |     let mut hello: &'static str = "hello";
   |                    ------------ type annotation requires that `world` is borrowed for `'static`
...
9  |         assign(&mut hello, &world);
   |                            ^^^^^^ borrowed value does not live long enough
10 |     }
   |     - `world` dropped here while still borrowed
```

よかった、コンパイルできません！何が起こっているのか、詳しく分解してみましょう。

まず、`assign` 関数を見ます。

```rust
fn assign<T>(input: &mut T, val: T) {
    *input = val;
}
```

この関数がするのは、可変参照と値を受け取り、その値で参照先を上書きすることだけです。重要なのは、この関数が型の等価性制約を作ることです。シグネチャは、参照先と値が*まったく同じ*型でなければならないと明確に述べています。

一方、呼び出し側では `&mut &'static str` と `&'world str` を渡します。

`&mut T` は `T` に関して不変なので、コンパイラは第1引数にサブタイピングを適用できないと判断します。したがって、`T` は厳密に `&'static str` でなければなりません。

これは `&T` の場合と対照的です。

```rust
fn debug<T: std::fmt::Debug>(a: T, b: T) {
    println!("a = {a:?} b = {b:?}");
}
```

ここでも同様に、`a` と `b` は同じ型 `T` でなければなりません。しかし `&'a T` は `'a` に関して共変*なので*、サブタイピングを適用できます。そこでコンパイラは、`&'static str` が `&'b str` のサブタイプである場合、かつその場合に限り、`&'static str` を `&'b str` にできると判断します。これは `'static <: 'b` なら成り立ちます。実際に成り立つので、コンパイラは問題なくこのコードのコンパイルを続けます。

実のところ、`Box`（や `Vec`、`HashMap` など）が共変でよい理由は、ライフタイムが共変でよい理由とよく似ています。可変参照のようなものに入れようとした時点で不変性を引き継ぎ、問題のある操作を防げるのです。

ただし、`Box` を使うと、ここまで十分には説明してこなかった、参照を値渡しするという側面に注目しやすくなります。

値がいつでも自由に別名を持てる多くの言語と異なり、Rust にはとても厳格な規則があります。値を変更またはムーブできるなら、その値にアクセスできるのは自分だけだと保証されます。

次のコードを考えてみましょう。

```rust,ignore
let hello: Box<&'static str> = Box::new("hello");

let mut world: Box<&'b str>;
world = hello;
```

`hello` が `'static` の間存続することを忘れても、まったく問題ありません。`'b` の間存続することしか知らない変数へ `hello` をムーブした時点で、**それがもっと長く存続することを覚えていた、この世で唯一のものを破棄した**からです！

あと1つだけ説明が残っています。関数ポインタです。

`fn(T) -> U` が `U` に関して共変であるべき理由を見るため、次のシグネチャを考えてみましょう。

<!-- ignore: simplified code -->
```rust,ignore
fn get_str() -> &'a str;
```

この関数は、あるライフタイム `'a` によって制限された `str` を生成すると宣言しています。そのため、代わりに次のシグネチャを持つ関数を提供しても、まったく問題ありません。

<!-- ignore: simplified code -->
```rust,ignore
fn get_static() -> &'static str;
```

関数を呼び出したとき、呼び出し側が期待しているのは、少なくともライフタイム `'a` の間存続する `&str` だけです。実際に値がもっと長く存続しても問題ありません。

しかし、同じ理屈は*引数*には当てはまりません。次の要件を、

<!-- ignore: simplified code -->
```rust,ignore
fn store_ref(&'a str);
```

次の関数で満たそうとする場合を考えてみましょう。

<!-- ignore: simplified code -->
```rust,ignore
fn store_static(&'static str);
```

最初の関数は、少なくとも `'a` の間存続する文字列参照ならどれでも受け取れます。しかし、2つ目の関数は、`'static` より短い期間しか存続しない文字列参照を受け取れません。これでは食い違いが生じます。ここでは共変性は使えません。しかし、関係を逆にすると、実際に*うまくいきます*！`&'static str` を扱える関数が必要なら、*どんな*参照のライフタイムでも扱える関数は、確実に問題なく使えます。

実際の例を見てみましょう。

```rust,compile_fail
# use std::cell::RefCell;
thread_local! {
    pub static StaticVecs: RefCell<Vec<&'static str>> = RefCell::new(Vec::new());
}

/// 渡された入力をスレッドローカルの `Vec<&'static str>` に保存します
fn store(input: &'static str) {
    StaticVecs.with_borrow_mut(|v| v.push(input));
}

/// 入力を渡して関数を呼び出します（ライフタイムが同じでなければなりません！）
fn demo<'a>(input: &'a str, f: fn(&'a str)) {
    f(input);
}

fn main() {
    demo("hello", store); // "hello" は 'static なので、問題なく `store` を呼び出せます

    {
        let smuggle = String::from("smuggle");

        // `&smuggle` は static ではありません。`&smuggle` を渡して `store` を呼び出すと、
        // 無効なライフタイムを持つ参照を `StaticVecs` に入れてしまいます。
        // したがって、`fn(&'static str)` は `fn(&'a str)` のサブタイプにはなれません
        demo(&smuggle, store);
    }

    // 解放後使用 😿
    StaticVecs.with_borrow(|v| println!("{v:?}"));
}
```

このため、関数型は、言語内のほかのどんなものとも異なり、引数に関して**反**変なのです。

標準ライブラリが提供する型についてはこれでよいとして、*自分で*定義した型の変性はどう決まるのでしょうか。形式ばらずに言うと、構造体はフィールドの変性を引き継ぎます。構造体 `MyType` にジェネリック引数 `A` があり、フィールド `a` で使われているなら、`MyType` の `A` に関する変性は、`a` の `A` に関する変性とまったく同じです。

ただし、`A` が複数のフィールドで使われる場合は、次のようになります。

* `A` の使用箇所がすべて共変なら、`MyType` は `A` に関して共変です。
* `A` の使用箇所がすべて反変なら、`MyType` は `A` に関して反変です。
* それ以外の場合、`MyType` は `A` に関して不変です。

```rust
use std::cell::Cell;

struct MyType<'a, 'b, A: 'a, B: 'b, C, D, E, F, G, H, In, Out, Mixed> {
    a: &'a A,     // 'a と A に関して共変
    b: &'b mut B, // 'b に関して共変、B に関して不変

    c: *const C,  // C に関して共変
    d: *mut D,    // D に関して不変

    e: E,         // E に関して共変
    f: Vec<F>,    // F に関して共変
    g: Cell<G>,   // G に関して不変

    h1: H,        // これだけなら H に関して共変ですが……
    h2: Cell<H>,  // 不変性はすべての衝突に優先するため、H に関して不変

    i: fn(In) -> Out,       // In に関して反変、Out に関して共変

    k1: fn(Mixed) -> usize, // これだけなら Mixed に関して反変ですが……
    k2: Mixed,              // 不変性はすべての衝突に優先するため、Mixed に関して不変
}
```
