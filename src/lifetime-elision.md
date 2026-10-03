<a id="lifetime-elision"></a>

# ライフタイムの省略

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

よくあるパターンをより扱いやすくするため、Rust では関数シグネチャのライフタイムを*省略*できます。

*ライフタイム位置*とは、型の中でライフタイムを書ける場所のことです。

<!-- ignore: simplified code -->
```rust,ignore
&'a T
&'a mut T
T<'a>
```

ライフタイム位置は、「入力」または「出力」として現れます。

* `fn` 定義、`fn` 型、トレイト `Fn`、`FnMut`、`FnOnce` では、入力は仮引数の型を、出力は戻り値の型を指します。したがって、`fn foo(s: &str) -> (&str, &str)` では、入力位置で1つ、出力位置で2つのライフタイムが省略されています。`fn` メソッド定義の入力位置には、そのメソッドの `impl` ヘッダに現れるライフタイムは含まれません（デフォルトメソッドの場合、トレイトのヘッダに現れるライフタイムも含まれません）。

* `impl` ヘッダでは、すべての型が入力です。したがって、`impl Trait<&T> for Struct<&T>` では入力位置のライフタイムが2つ省略され、`impl Struct<&T>` では1つ省略されています。

省略の規則は次のとおりです。

* 入力位置で省略された各ライフタイムは、それぞれ別のライフタイムパラメータになります。

* 入力のライフタイム位置がちょうど1つだけの場合（省略されているかどうかは問いません）、そのライフタイムが、省略された出力ライフタイムの*すべて*に割り当てられます。

* 入力のライフタイム位置が複数あり、そのうちの1つが `&self` または `&mut self` の場合、`self` のライフタイムが、省略された出力ライフタイムの*すべて*に割り当てられます。

* それ以外の場合、出力ライフタイムを省略するとエラーになります。

例を示します。

<!-- ignore: simplified code -->
```rust,ignore
fn print(s: &str);                                      // 省略形
fn print<'a>(s: &'a str);                               // 展開形

fn debug(lvl: usize, s: &str);                          // 省略形
fn debug<'a>(lvl: usize, s: &'a str);                   // 展開形

fn substr(s: &str, until: usize) -> &str;               // 省略形
fn substr<'a>(s: &'a str, until: usize) -> &'a str;     // 展開形

fn get_str() -> &str;                                   // 不正

fn frob(s: &str, t: &str) -> &str;                      // 不正

fn get_mut(&mut self) -> &mut T;                        // 省略形
fn get_mut<'a>(&'a mut self) -> &'a mut T;              // 展開形

fn args<T: ToCStr>(&mut self, args: &[T]) -> &mut Command                  // 省略形
fn args<'a, 'b, T: ToCStr>(&'a mut self, args: &'b [T]) -> &'a mut Command // 展開形

fn new(buf: &mut [u8]) -> BufWriter;                    // 省略形
fn new(buf: &mut [u8]) -> BufWriter<'_>;                // 省略形（`rust_2018_idioms` 使用時）
fn new<'a>(buf: &'a mut [u8]) -> BufWriter<'a>          // 展開形
```
