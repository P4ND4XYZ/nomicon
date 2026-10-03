<a id="drop-check"></a>

# ドロップチェック

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

ライフタイムによって、ダングリング参照を決して読まないための、比較的単純な規則が得られることを見てきました。しかし、ここまでは、同じ長さを含む意味での*長く存続する*という関係しか扱っていませんでした。つまり、`'a: 'b` について話したとき、`'a` は `'b` と*まったく同じ長さだけ*存続しても構いませんでした。一見すると、これは意味のない区別に思えます。あるものが別のものと同時にドロップされることなどありませんよね。そのため、`let` 文を次のように脱糖していました。

<!-- ignore: simplified code -->
```rust,ignore
let x;
let y;
```

これは次のように脱糖されます。

<!-- ignore: desugared code -->
```rust,ignore
{
    let x;
    {
        let y;
    }
}
```

スコープを使って脱糖できない、より複雑な状況もありますが、順序はそれでも定義されています。変数は定義と逆の順序で、構造体とタプルのフィールドは定義された順序でドロップされます。ドロップ順序の詳細は [RFC 1857][rfc1857] にあります。

次のようにしてみましょう。

<!-- ignore: simplified code -->
```rust,ignore
let tuple = (vec![], vec![]);
```

左のベクタが先にドロップされます。しかし、これは借用チェッカーから見て、右のベクタが左のベクタより厳密に長く存続するという意味でしょうか。答えは*いいえ*です。借用チェッカーがタプルのフィールドを個別に追跡できたとしても、ベクタの要素では、どれがどれより長く存続するかを判断できません。要素は、借用チェッカーが理解しない、純粋にライブラリ側のコードによって手動でドロップされるからです。

なぜこれが重要なのでしょうか。型システムが注意しないと、誤ってダングリングポインタを作りかねないからです。次の単純なプログラムを考えてみましょう。

```rust
struct Inspector<'a>(&'a u8);

struct World<'a> {
    inspector: Option<Inspector<'a>>,
    days: Box<u8>,
}

fn main() {
    let mut world = World {
        inspector: None,
        days: Box::new(1),
    };
    world.inspector = Some(Inspector(&world.days));
}
```

このプログラムは完全に健全で、現在の Rust でコンパイルできます。`days` が `inspector` より厳密に長く存続しないことは問題になりません。`inspector` が生存している間は、`days` も生存しているからです。

しかし、デストラクタを追加すると、このプログラムはコンパイルできなくなります！

```rust,compile_fail
struct Inspector<'a>(&'a u8);

impl<'a> Drop for Inspector<'a> {
    fn drop(&mut self) {
        println!("I was only {} days from retirement!", self.0);
    }
}

struct World<'a> {
    inspector: Option<Inspector<'a>>,
    days: Box<u8>,
}

fn main() {
    let mut world = World {
        inspector: None,
        days: Box::new(1),
    };
    world.inspector = Some(Inspector(&world.days));
    // `days` が先にドロップされるとしましょう。
    // すると Inspector のドロップ時に、解放済みメモリを読もうとします！
}
```

```text
error[E0597]: `world.days` does not live long enough
  --> src/main.rs:19:38
   |
19 |     world.inspector = Some(Inspector(&world.days));
   |                                      ^^^^^^^^^^^ borrowed value does not live long enough
...
22 | }
   | -
   | |
   | `world.days` dropped here while still borrowed
   | borrow might be used here, when `world` is dropped and runs the destructor for type `World<'_>`
```

フィールドの順序を変えたり、構造体の代わりにタプルを使ったりしても、やはりコンパイルできません。

`Drop` を実装すると、`Inspector` は消滅するときに任意のコードを実行できます。そのため、自分と同じ長さだけ存続するはずの型が、実際には先に破棄されたことを観測できる可能性があります。

興味深いことに、これを心配する必要があるのはジェネリック型だけです。ジェネリックでなければ、内包できるライフタイムは、本当に*永遠に*存続する `'static` だけだからです。このため、この問題は*健全なジェネリックドロップ*と呼ばれます。健全なジェネリックドロップは、*ドロップチェッカー*によって強制されます。本書の執筆時点では、ドロップチェッカー（dropck とも呼ばれます）が型を検証する方法の細部には、まだまったく定まっていないものがあります。しかし、重要な規則は、この節全体で注目してきた微妙な点です。

**ジェネリック型が健全にドロップを実装するには、ジェネリック引数が、その型より厳密に長く存続しなければなりません。**

この規則に従うことは、借用チェッカーを満足させるためには（通常）必要です。一方、健全性に対しては十分条件ですが、必要条件ではありません。つまり、型がこの規則に従っていれば、その型をドロップすることは確実に健全です。

この規則に従うことが常に必要とは限らないのは、型としてはアクセスできても、借用データにアクセスしない `Drop` 実装があるからです。また、借用チェッカーは知らなくても、具体的なドロップ順序が分かっていて、借用データが依然として有効な場合もあります。

たとえば、先ほどの `Inspector` の次の変形例は、借用データに決してアクセスしません。

```rust,compile_fail
struct Inspector<'a>(&'a u8, &'static str);

impl<'a> Drop for Inspector<'a> {
    fn drop(&mut self) {
        println!("Inspector(_, {}) knows when *not* to inspect.", self.1);
    }
}

struct World<'a> {
    inspector: Option<Inspector<'a>>,
    days: Box<u8>,
}

fn main() {
    let mut world = World {
        inspector: None,
        days: Box::new(1),
    };
    world.inspector = Some(Inspector(&world.days, "gadget"));
    // `days` が先にドロップされるとしましょう。
    // Inspector がドロップされても、そのデストラクタは
    // 借用した `days` にアクセスしません。
}
```

同様に、次の変形例も借用データに決してアクセスしません。

```rust,compile_fail
struct Inspector<T>(T, &'static str);

impl<T> Drop for Inspector<T> {
    fn drop(&mut self) {
        println!("Inspector(_, {}) knows when *not* to inspect.", self.1);
    }
}

struct World<T> {
    inspector: Option<Inspector<T>>,
    days: Box<u8>,
}

fn main() {
    let mut world = World {
        inspector: None,
        days: Box::new(1),
    };
    world.inspector = Some(Inspector(&world.days, "gadget"));
    // `days` が先にドロップされるとしましょう。
    // Inspector がドロップされても、そのデストラクタは
    // 借用した `days` にアクセスしません。
}
```

しかし、上の*両方*の変形例は、`fn main` の解析中に借用チェッカーから拒否されます。`days` が十分に長く存続しないと言われるのです。

これは、`main` の借用検査の解析が、それぞれの `Inspector` の `Drop` 実装の内部を知らないためです。`main` を解析する借用チェッカーに分かる範囲では、`Inspector` のデストラクタの本体が、その借用データにアクセスする可能性があります。

そのため、ドロップチェッカーは、値の中のすべての借用データが、その値より厳密に長く存続することを要求します。

<a id="an-escape-hatch"></a>

## 抜け道

ドロップ検査を制御する正確な規則は、将来、制約が緩くなるかもしれません。

現在の解析は意図的に保守的です。値の中のすべての借用データがその値より長く存続することを要求するため、確実に健全です。

言語の将来のバージョンでは解析がより精密になり、健全なコードが安全でないとして拒否されるケースを減らせるかもしれません。これは、破棄時には調べるべきでないと分かっている、上の2つの `Inspector` のようなケースへの対処に役立ちます。

その間は、不安定な属性を使って、ジェネリック型のデストラクタが、型としては可能でも、期限切れのデータには決してアクセスしないと*保証*することを、アンセーフに表明できます。

この属性は `may_dangle` と呼ばれ、[RFC 1327][rfc1327] で導入されました。先ほどの `Inspector` に適用するには、次のように書きます。

```rust
#![feature(dropck_eyepatch)]

struct Inspector<'a>(&'a u8, &'static str);

unsafe impl<#[may_dangle] 'a> Drop for Inspector<'a> {
    fn drop(&mut self) {
        println!("Inspector(_, {}) knows when *not* to inspect.", self.1);
    }
}

struct World<'a> {
    days: Box<u8>,
    inspector: Option<Inspector<'a>>,
}

fn main() {
    let mut world = World {
        inspector: None,
        days: Box::new(1),
    };
    world.inspector = Some(Inspector(&world.days, "gadget"));
}
```

この属性を使うには、`Drop` の実装に `unsafe` を付ける必要があります。期限切れかもしれないデータ（たとえば上の `self.0`）にアクセスしないという暗黙の表明を、コンパイラは検査しないからです。

この属性は、任意の数のライフタイムパラメータと型パラメータに適用できます。次の例では、ライフタイム `'b` の参照の背後にあるデータにアクセスせず、`T` はムーブまたはドロップにしか使わないと表明しています。一方、`'a` と `U` には属性を付けません。そのライフタイムと型のデータにはアクセスするからです。

```rust
#![feature(dropck_eyepatch)]
use std::fmt::Display;

struct Inspector<'a, 'b, T, U: Display>(&'a u8, &'b u8, T, U);

unsafe impl<'a, #[may_dangle] 'b, #[may_dangle] T, U: Display> Drop for Inspector<'a, 'b, T, U> {
    fn drop(&mut self) {
        println!("Inspector({}, _, _, {})", self.0, self.3);
    }
}
```

上の例のように、そのようなアクセスが起こらないことが明らかな場合もあります。しかし、ジェネリック型パラメータを扱うときには、間接的にアクセスが起こることがあります。たとえば、次のような間接アクセスです。

- コールバックの呼び出し
- トレイトメソッドの呼び出しを介したアクセス

（実装の特殊化など、言語の将来の変更によって、そのような間接アクセスの経路がほかにも増える可能性があります。）

コールバックを呼び出す例を示します。

```rust
struct Inspector<T>(T, &'static str, Box<for <'r> fn(&'r T) -> String>);

impl<T> Drop for Inspector<T> {
    fn drop(&mut self) {
        // `self.2` の呼び出しは、たとえば `T` が `&'a _` なら、借用にアクセスし得ます。
        println!("Inspector({}, {}) unwittingly inspects expired data.",
                 (self.2)(&self.0), self.1);
    }
}
```

トレイトメソッドを呼び出す例を示します。

```rust
use std::fmt;

struct Inspector<T: fmt::Display>(T, &'static str);

impl<T: fmt::Display> Drop for Inspector<T> {
    fn drop(&mut self) {
        // 下には `<T as Display>::fmt` の隠れた呼び出しがあります。
        // たとえば `T` が `&'a _` なら、借用にアクセスし得ます。
        println!("Inspector({}, {}) unwittingly inspects expired data.",
                 self.0, self.1);
    }
}
```

もちろん、これらのアクセスはすべて、デストラクタ内に直接書かれるのではなく、デストラクタが呼び出す別のメソッドの内部にさらに隠れている可能性もあります。

上の、デストラクタ内で `&'a u8` にアクセスするすべてのケースで、`#[may_dangle]` 属性を追加すると、借用チェッカーが検出できない誤用に対して型が脆弱になり、大混乱を招きます。この属性の追加は避けたほうがよいでしょう。

<a id="a-related-side-note-about-drop-order"></a>

## ドロップ順序に関する補足

構造体内のフィールドのドロップ順序は定義されていますが、それに依存するのは壊れやすく、微妙です。順序が重要な場合は、[`ManuallyDrop`] ラッパーを使うほうがよいでしょう。

<a id="is-that-all-about-drop-checker"></a>

## ドロップチェッカーについてはこれで全部でしょうか？

実のところ、アンセーフなコードを書くとき、一般にはドロップチェッカーに対して正しい対応をすることを、まったく心配する必要はありません。ただし、注意しなければならない特別なケースが1つあります。次の節ではそれを見ていきます。

[rfc1327]: https://github.com/rust-lang/rfcs/blob/master/text/1327-dropck-param-eyepatch.md
[rfc1857]: https://github.com/rust-lang/rfcs/blob/master/text/1857-stabilize-drop-order.md
[`manuallydrop`]: ../std/mem/struct.ManuallyDrop.html
