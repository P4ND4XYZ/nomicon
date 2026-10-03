<a id="foreign-function-interface"></a>

# 外部関数インターフェース

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

<a id="introduction"></a>

## はじめに

このガイドでは、外部コードのバインディングを書くための入門として、圧縮・展開ライブラリ [snappy](https://github.com/google/snappy) を使用します。Rust は現在 C++ ライブラリを直接呼び出せませんが、snappy には C インターフェースが含まれています（[`snappy-c.h`](https://github.com/google/snappy/blob/master/snappy-c.h) に記載されています）。

<a id="a-note-about-libc"></a>

## libc についての注意

これらの例の多くは [`libc` クレート][libc] を使用します。このクレートは、C の型に対応するさまざまな型定義などを提供します。自分でこれらの例を試す場合は、`Cargo.toml` に `libc` を追加する必要があります。

```toml
[dependencies]
libc = "0.2.0"
```

[libc]: https://crates.io/crates/libc

<a id="prepare-the-build-script"></a>

## ビルドスクリプトの準備

[snappy](https://github.com/google/snappy) はデフォルトで静的ライブラリなので、出力成果物には stdc++ がリンクされていません。
この外部ライブラリを Rust で使用するには、stdc++ std をプロジェクトにリンクすることを手動で指定する必要があります。
最も簡単な方法は、ビルドスクリプトを用意することです。

まず `Cargo.toml` を編集し、`package` 内に `build = "build.rs"` を追加します。
```toml
[package]
...
build = "build.rs"
```

次に、ワークスペースのルートに `build.rs` という新しいファイルを作成します。
```rust
// build.rs
fn main() {
    println!("cargo:rustc-link-lib=dylib=stdc++"); // This line may be unnecessary for some environments.
    println!("cargo:rustc-link-search=<YOUR SNAPPY LIBRARY PATH>");
}
```

詳細は [The Cargo Book - ビルドスクリプト](https://doc.rust-lang.org/cargo/reference/build-scripts.html) をお読みください。


<a id="calling-foreign-functions"></a>

## 外部関数の呼び出し

以下は外部関数を呼び出す最小限の例で、snappy がインストールされていればコンパイルできます。

<!-- ignore: requires libc crate -->
```rust,ignore
use libc::size_t;

#[link(name = "snappy")]
unsafe extern "C" {
    fn snappy_max_compressed_length(source_length: size_t) -> size_t;
}

fn main() {
    let x = unsafe { snappy_max_compressed_length(100) };
    println!("max compressed length of a 100 byte buffer: {}", x);
}
```

`extern` ブロックは外部ライブラリの関数シグネチャの一覧であり、この場合はプラットフォームの C ABI を使用します。`#[link(...)]` 属性は、シンボルを解決できるように snappy ライブラリをリンクするようリンカーに指示するために使用します。

外部関数はアンセーフと想定されるため、その呼び出しは `unsafe {}` で囲む必要があります。これは、その中のすべてが本当に安全であるというコンパイラへの約束です。C ライブラリはスレッドセーフでないインターフェースを公開することが多く、ポインタを引数に取るほぼすべての関数は、あらゆる入力に対して有効というわけではありません。ポインタがダングリングである可能性があり、生ポインタは Rust の安全なメモリモデルの範囲外だからです。

外部関数の引数の型を宣言する際、Rust コンパイラはその宣言が正しいかどうかを検査できません。そのため、正しく指定することも、実行時にバインディングの正しさを保つための一部です。

`extern` ブロックは、snappy API 全体を網羅するように拡張できます。

<!-- ignore: requires libc crate -->
```rust,ignore
use libc::{c_int, size_t};

#[link(name = "snappy")]
unsafe extern "C" {
    fn snappy_compress(input: *const u8,
                       input_length: size_t,
                       compressed: *mut u8,
                       compressed_length: *mut size_t) -> c_int;
    fn snappy_uncompress(compressed: *const u8,
                         compressed_length: size_t,
                         uncompressed: *mut u8,
                         uncompressed_length: *mut size_t) -> c_int;
    fn snappy_max_compressed_length(source_length: size_t) -> size_t;
    fn snappy_uncompressed_length(compressed: *const u8,
                                  compressed_length: size_t,
                                  result: *mut size_t) -> c_int;
    fn snappy_validate_compressed_buffer(compressed: *const u8,
                                         compressed_length: size_t) -> c_int;
}
# fn main() {}
```

<a id="creating-a-safe-interface"></a>

## 安全なインターフェースの作成

メモリ安全性を提供し、ベクタなどの高水準の概念を利用するには、生の C API をラップする必要があります。ライブラリは、安全な高水準のインターフェースだけを公開し、アンセーフな内部の詳細を隠すことを選べます。

バッファを受け取る関数をラップするには、`slice::raw` モジュールを使用して、Rust のベクタをメモリへのポインタとして操作します。Rust のベクタは、連続したメモリブロックであることが保証されています。長さは現在含まれている要素の数であり、容量はアロケートされたメモリ全体のサイズを要素数で表したものです。長さは容量以下です。

<!-- ignore: requires libc crate -->
```rust,ignore
# use libc::{c_int, size_t};
# unsafe fn snappy_validate_compressed_buffer(_: *const u8, _: size_t) -> c_int { 0 }
# fn main() {}
pub fn validate_compressed_buffer(src: &[u8]) -> bool {
    unsafe {
        snappy_validate_compressed_buffer(src.as_ptr(), src.len() as size_t) == 0
    }
}
```

上の `validate_compressed_buffer` ラッパーは `unsafe` ブロックを使用していますが、関数シグネチャから `unsafe` を省くことで、すべての入力について呼び出しが安全であることを保証しています。

`snappy_compress` と `snappy_uncompress` は、出力を保持するバッファもアロケートする必要があるため、より複雑です。

`snappy_max_compressed_length` 関数を使用すると、圧縮された出力を保持するのに必要な最大容量を持つベクタをアロケートできます。そのベクタを出力引数として `snappy_compress` 関数に渡せます。また、長さを設定するために圧縮後の実際の長さを取得する出力引数も渡します。

<!-- ignore: requires libc crate -->
```rust,ignore
# use libc::{size_t, c_int};
# unsafe fn snappy_compress(a: *const u8, b: size_t, c: *mut u8,
#                           d: *mut size_t) -> c_int { 0 }
# unsafe fn snappy_max_compressed_length(a: size_t) -> size_t { a }
# fn main() {}
pub fn compress(src: &[u8]) -> Vec<u8> {
    unsafe {
        let srclen = src.len() as size_t;
        let psrc = src.as_ptr();

        let mut dstlen = snappy_max_compressed_length(srclen);
        let mut dst = Vec::with_capacity(dstlen as usize);
        let pdst = dst.as_mut_ptr();

        snappy_compress(psrc, srclen, pdst, &mut dstlen);
        dst.set_len(dstlen as usize);
        dst
    }
}
```

展開も同様です。snappy は圧縮形式の一部として展開後のサイズを格納しており、`snappy_uncompressed_length` が必要なバッファの正確なサイズを取得するためです。

<!-- ignore: requires libc crate -->
```rust,ignore
# use libc::{size_t, c_int};
# unsafe fn snappy_uncompress(compressed: *const u8,
#                             compressed_length: size_t,
#                             uncompressed: *mut u8,
#                             uncompressed_length: *mut size_t) -> c_int { 0 }
# unsafe fn snappy_uncompressed_length(compressed: *const u8,
#                                      compressed_length: size_t,
#                                      result: *mut size_t) -> c_int { 0 }
# fn main() {}
pub fn uncompress(src: &[u8]) -> Option<Vec<u8>> {
    unsafe {
        let srclen = src.len() as size_t;
        let psrc = src.as_ptr();

        let mut dstlen: size_t = 0;
        snappy_uncompressed_length(psrc, srclen, &mut dstlen);

        let mut dst = Vec::with_capacity(dstlen as usize);
        let pdst = dst.as_mut_ptr();

        if snappy_uncompress(psrc, srclen, pdst, &mut dstlen) == 0 {
            dst.set_len(dstlen as usize);
            Some(dst)
        } else {
            None // SNAPPY_INVALID_INPUT
        }
    }
}
```

次に、使い方を示すテストをいくつか追加できます。

<!-- ignore: requires libc crate -->
```rust,ignore
# use libc::{c_int, size_t};
# unsafe fn snappy_compress(input: *const u8,
#                           input_length: size_t,
#                           compressed: *mut u8,
#                           compressed_length: *mut size_t)
#                           -> c_int { 0 }
# unsafe fn snappy_uncompress(compressed: *const u8,
#                             compressed_length: size_t,
#                             uncompressed: *mut u8,
#                             uncompressed_length: *mut size_t)
#                             -> c_int { 0 }
# unsafe fn snappy_max_compressed_length(source_length: size_t) -> size_t { 0 }
# unsafe fn snappy_uncompressed_length(compressed: *const u8,
#                                      compressed_length: size_t,
#                                      result: *mut size_t)
#                                      -> c_int { 0 }
# unsafe fn snappy_validate_compressed_buffer(compressed: *const u8,
#                                             compressed_length: size_t)
#                                             -> c_int { 0 }
# fn main() { }
#
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid() {
        let d = vec![0xde, 0xad, 0xd0, 0x0d];
        let c: &[u8] = &compress(&d);
        assert!(validate_compressed_buffer(c));
        assert!(uncompress(c) == Some(d));
    }

    #[test]
    fn invalid() {
        let d = vec![0, 0, 0, 0];
        assert!(!validate_compressed_buffer(&d));
        assert!(uncompress(&d).is_none());
    }

    #[test]
    fn empty() {
        let d = vec![];
        assert!(!validate_compressed_buffer(&d));
        assert!(uncompress(&d).is_none());
        let c = compress(&d);
        assert!(validate_compressed_buffer(&c));
        assert!(uncompress(&c) == Some(d));
    }
}
```

<a id="destructors"></a>

## デストラクタ

外部ライブラリは、リソースの所有権を呼び出し側のコードに渡すことがよくあります。
その場合、安全性を提供し、これらのリソースの解放を保証するために（特にパニックの場合）、Rust のデストラクタを使用しなければなりません。

デストラクタの詳細は、[Drop トレイト](../std/ops/trait.Drop.html) を参照してください。

<a id="calling-rust-code-from-c"></a>

## C から Rust コードを呼び出す

C から呼び出せる形で Rust コードをコンパイルしたい場合もあるでしょう。
これは比較的簡単ですが、いくつか必要なことがあります。

<a id="rust-side"></a>

### Rust 側

まず、`rust_from_c` という名前の lib クレートがあると仮定します。
`lib.rs` には次のような Rust コードを記述します。

```rust
#[unsafe(no_mangle)]
pub extern "C" fn hello_from_rust() {
    println!("Hello from Rust!");
}
# fn main() {}
```

`extern "C"` によって、この関数は後述の「[外部の呼び出し規約][Foreign Calling Conventions]」で説明する C の呼び出し規約に従います。
`no_mangle` 属性は Rust の名前マングリングを無効にして、リンク先となる明確に定義されたシンボルを持たせます。

次に、C から呼び出せる共有ライブラリとして Rust コードをコンパイルするため、`Cargo.toml` に以下を追加します。

```toml
[lib]
crate-type = ["cdylib"]
```

（注意: `staticlib` クレート型も使用できますが、その場合はいくつかのリンクフラグの調整も必要です。）

`cargo build` を実行すれば、Rust 側の準備は完了です。

[Foreign Calling Conventions]: ffi.md#foreign-calling-conventions

<a id="c-side"></a>

### C 側

`hello_from_rust` 関数を呼び出す C ファイルを作成し、`gcc` でコンパイルします。

C ファイルは次のようになります。

```c
extern void hello_from_rust();

int main(void) {
    hello_from_rust();
    return 0;
}
```

このファイルを `call_rust.c` と名付け、クレートのルートに置きます。
コンパイルするには以下を実行します。

```sh
gcc call_rust.c -o call_rust -lrust_from_c -L./target/debug
```

`-l` と `-L` は、Rust ライブラリを探すよう gcc に指示します。

最後に、`LD_LIBRARY_PATH` を指定して C から Rust コードを呼び出せます。

```sh
$ LD_LIBRARY_PATH=./target/debug ./call_rust
Hello from Rust!
```

これで完了です！
より現実的な例については、[`cbindgen`] を確認してください。

[`cbindgen`]: https://github.com/eqrion/cbindgen

<a id="callbacks-from-c-code-to-rust-functions"></a>

## C コードから Rust 関数へのコールバック

外部ライブラリの中には、現在の状態や中間データを呼び出し側に報告するためにコールバックの使用を要求するものがあります。
Rust で定義した関数を外部ライブラリに渡すことは可能です。
そのためには、C コードから呼び出せるように、コールバック関数を正しい呼び出し規約の `extern` として指定する必要があります。

そうすれば、登録の呼び出しを通してコールバック関数を C ライブラリに送信し、後でそこから呼び出せます。

基本的な例を示します。

Rust コード:

```rust,no_run
extern fn callback(a: i32) {
    println!("I'm called from C with value {0}", a);
}

#[link(name = "extlib")]
unsafe extern "C" {
   fn register_callback(cb: extern fn(i32)) -> i32;
   fn trigger_callback();
}

fn main() {
    unsafe {
        register_callback(callback);
        trigger_callback(); // Triggers the callback.
    }
}
```

C コード:

```c
typedef void (*rust_callback)(int32_t);
rust_callback cb;

int32_t register_callback(rust_callback callback) {
    cb = callback;
    return 1;
}

void trigger_callback() {
  cb(7); // Will call callback(7) in Rust.
}
```

この例では、Rust の `main()` が C の `trigger_callback()` を呼び出し、それが今度は Rust の `callback()` を呼び返します。

<a id="targeting-callbacks-to-rust-objects"></a>

## Rust オブジェクトを対象とするコールバック

前の例では、C コードからグローバル関数を呼び出す方法を示しました。
しかし、特定の Rust オブジェクトをコールバックの対象にしたいこともよくあります。これは、対応する C オブジェクトのラッパーを表すオブジェクトかもしれません。

これは、そのオブジェクトへの生ポインタを C ライブラリに渡すことで実現できます。C ライブラリは、通知に Rust オブジェクトへのポインタを含めることができます。これにより、コールバックは参照先の Rust オブジェクトにアンセーフにアクセスできます。

Rust コード:

```rust,no_run
struct RustObject {
    a: i32,
    // Other members...
}

unsafe extern "C" fn callback(target: *mut RustObject, a: i32) {
    println!("I'm called from C with value {0}", a);
    unsafe {
        // Update the value in RustObject with the value received from the callback:
        (*target).a = a;
    }
}

#[link(name = "extlib")]
unsafe extern "C" {
   fn register_callback(target: *mut RustObject,
                        cb: unsafe extern "C" fn(*mut RustObject, i32)) -> i32;
   fn trigger_callback();
}

fn main() {
    // Create the object that will be referenced in the callback:
    let mut rust_object = Box::new(RustObject { a: 5 });

    unsafe {
        register_callback(&mut *rust_object, callback);
        trigger_callback();
    }
}
```

C コード:

```c
typedef void (*rust_callback)(void*, int32_t);
void* cb_target;
rust_callback cb;

int32_t register_callback(void* callback_target, rust_callback callback) {
    cb_target = callback_target;
    cb = callback;
    return 1;
}

void trigger_callback() {
  cb(cb_target, 7); // Will call callback(&rustObject, 7) in Rust.
}
```

<a id="asynchronous-callbacks"></a>

## 非同期コールバック

これまでの例では、外部 C ライブラリへの関数呼び出しに直接反応してコールバックが呼び出されます。
コールバックを実行するため、現在のスレッドの制御は Rust から C、そして Rust へと切り替わりますが、結局コールバックは、それを引き起こした関数を呼び出したのと同じスレッドで実行されます。

外部ライブラリが独自のスレッドを生成し、そこからコールバックを呼び出す場合、事情はより複雑になります。
この場合、コールバック内での Rust データ構造へのアクセスは特にアンセーフであり、適切な同期機構を使用しなければなりません。
ミューテックスなどの従来の同期機構に加えて、Rust では（`std::sync::mpsc` の）チャネルを使い、コールバックを呼び出した C スレッドから Rust スレッドへデータを転送する方法もあります。

非同期コールバックが Rust のアドレス空間内の特定のオブジェクトを対象とする場合、対応する Rust オブジェクトの破棄後に C ライブラリがそれ以上コールバックを実行しないことも、絶対に必要です。
これは、オブジェクトのデストラクタでコールバックの登録を解除し、登録解除後にはコールバックが実行されないことを保証するようライブラリを設計することで実現できます。

<a id="linking"></a>

## リンク

`extern` ブロックの `link` 属性は、ネイティブライブラリへのリンク方法を rustc に指示するための基本的な構成要素です。現在、link 属性には次の 2 つの形式が認められています。

* `#[link(name = "foo")]`
* `#[link(name = "foo", kind = "bar")]`

どちらの場合も `foo` はリンク先のネイティブライブラリの名前であり、2 番目の形式では `bar` がコンパイラのリンク先となるネイティブライブラリの種類です。現在、ネイティブライブラリには 3 種類が知られています。

* 動的 - `#[link(name = "readline")]`
* 静的 - `#[link(name = "my_build_dependency", kind = "static")]`
* フレームワーク - `#[link(name = "CoreFoundation", kind = "framework")]`

フレームワークは macOS ターゲットでのみ利用できることに注意してください。

異なる `kind` の値は、ネイティブライブラリがリンクに関与する方法を区別するためのものです。リンクの観点では、Rust コンパイラは部分的な成果物（rlib/staticlib）と最終成果物（dylib/バイナリ）の 2 種類を作成します。ネイティブの動的ライブラリとフレームワークへの依存は最終成果物の境界まで伝播しますが、静的ライブラリへの依存はまったく伝播しません。静的ライブラリは後続の成果物に直接組み込まれるためです。

このモデルの利用例をいくつか示します。

* ネイティブのビルド依存関係。Rust コードを書く際に C/C++ の接着コードが必要になることがありますが、C/C++ コードをライブラリ形式で配布するのは負担になります。この場合、コードを `libfoo.a` にアーカイブし、Rust クレートで `#[link(name = "foo", kind =
  "static")]` を通して依存関係を宣言します。

  クレートの出力の種類にかかわらず、ネイティブの静的ライブラリは出力に含まれます。つまり、ネイティブの静的ライブラリを配布する必要はありません。

* 通常の動的依存関係。一般的なシステムライブラリ（`readline` など）は多数のシステムで利用できますが、その静的なコピーが見つからないこともよくあります。この依存関係が Rust クレートに含まれる場合、部分的なターゲット（rlib など）はそのライブラリにリンクしませんが、rlib が最終ターゲット（バイナリなど）に含まれると、ネイティブライブラリがリンクされます。

macOS では、フレームワークは動的ライブラリと同じ意味論で動作します。

<a id="unsafe-blocks"></a>

## アンセーフブロック

生ポインタの参照外しや、アンセーフと指定された関数の呼び出しなどの操作は、アンセーフブロック内でのみ許可されます。アンセーフブロックはアンセーフ性を隔離し、それがブロックの外に漏れないというコンパイラへの約束になります。

一方、アンセーフ関数はそれを外部に明示します。アンセーフ関数は次のように記述します。

```rust
unsafe fn kaboom(ptr: *const i32) -> i32 { *ptr }
```

この関数は、`unsafe` ブロックまたは別の `unsafe` 関数からのみ呼び出せます。

<a id="accessing-foreign-globals"></a>

## 外部のグローバル変数へのアクセス

外部 API は、グローバルな状態の追跡などに使うグローバル変数をエクスポートすることがよくあります。これらの変数にアクセスするには、`extern` ブロック内で `static` キーワードを使って宣言します。

<!-- ignore: requires libc crate -->
```rust,ignore
#[link(name = "readline")]
unsafe extern "C" {
    static rl_readline_version: libc::c_int;
}

fn main() {
    println!("You have readline version {} installed.",
             unsafe { rl_readline_version as i32 });
}
```

また、外部インターフェースが提供するグローバルな状態を変更する必要があるかもしれません。そのためには、static を `mut` 付きで宣言して変更できるようにします。

<!-- ignore: requires libc crate -->
```rust,ignore
use std::ffi::CString;
use std::ptr;

#[link(name = "readline")]
unsafe extern "C" {
    static mut rl_prompt: *const libc::c_char;
}

fn main() {
    let prompt = CString::new("[my-awesome-shell] $").unwrap();
    unsafe {
        rl_prompt = prompt.as_ptr();

        println!("{:?}", rl_prompt);

        rl_prompt = ptr::null();
    }
}
```

`static mut` とのやり取りは、読み取りも書き込みもすべてアンセーフであることに注意してください。グローバルな可変状態を扱うには、細心の注意が必要です。

<a id="foreign-calling-conventions"></a>

## 外部の呼び出し規約

ほとんどの外部コードは C ABI を公開し、Rust は外部関数を呼び出す際、デフォルトでプラットフォームの C 呼び出し規約を使用します。一部の外部関数、特に Windows API は別の呼び出し規約を使用します。Rust には、どの規約を使用するかをコンパイラに伝える方法があります。

<!-- ignore: requires libc crate -->
```rust,ignore
#[cfg(all(target_os = "win32", target_arch = "x86"))]
#[link(name = "kernel32")]
#[allow(non_snake_case)]
unsafe extern "stdcall" {
    fn SetEnvironmentVariableA(n: *const u8, v: *const u8) -> libc::c_int;
}
# fn main() { }
```

これは `extern` ブロック全体に適用されます。サポートされる ABI 指定の一覧は次のとおりです。

* `stdcall`
* `aapcs`
* `cdecl`
* `fastcall`
* `thiscall`
* `vectorcall`
これは現在 `abi_vectorcall` ゲートの背後にあり、変更される可能性があります。
* `Rust`
* `system`
* `C`
* `win64`
* `sysv64`

この一覧の ABI の多くは名前から意味が分かりますが、`system` ABI は少し奇妙に見えるかもしれません。この指定は、ターゲットのライブラリとの相互運用に適切な ABI を選択します。たとえば、x86 アーキテクチャの win32 では `stdcall` が使用されます。しかし x86_64 では Windows が `C` 呼び出し規約を使用するため、`C` が使用されます。つまり、前の例では `extern "system" { ... }` を使用して、x86 だけでなくすべての Windows システム向けのブロックを定義できたということです。

<a id="interoperability-with-foreign-code"></a>

## 外部コードとの相互運用

Rust が `struct` のレイアウトとプラットフォーム上の C の表現との互換性を保証するのは、`#[repr(C)]` 属性を適用した場合だけです。
`#[repr(C, packed)]` を使用すると、構造体のメンバをパディングなしで配置できます。
`#[repr(C)]` は enum にも適用できます。

Rust の所有権を持つボックス（`Box<T>`）は、格納したオブジェクトを指すハンドルとして、ヌルにならないポインタを使用します。ただし、内部のアロケータによって管理されるため、手動で作成すべきではありません。参照は、その型を直接指すヌルにならないポインタだと安全に仮定できます。しかし、借用検査や可変性の規則を破ることが安全であるとは保証されません。その必要がある場合は、生ポインタ（`*`）の使用を優先してください。コンパイラは生ポインタについて、それほど多くの仮定を置けないためです。

ベクタと文字列は同じ基本的なメモリレイアウトを共有し、C API を扱うためのユーティリティが `vec` と `str` モジュールに用意されています。ただし、文字列は `\0` で終端されません。C との相互運用に NUL 終端文字列が必要な場合は、`std::ffi` モジュールの `CString` 型を使用すべきです。

[crates.io の `libc` クレート][libc] は、`libc` モジュールに C 標準ライブラリの型エイリアスと関数定義を含んでおり、Rust はデフォルトで `libc` と `libm` にリンクします。

<a id="variadic-functions"></a>

## 可変長引数関数

C では関数を「可変長引数」にできます。つまり、可変個数の引数を受け取れます。Rust では、外部関数の宣言の引数リスト内に `...` を指定することで実現できます。

```no_run
unsafe extern "C" {
    fn foo(x: i32, ...);
}

fn main() {
    unsafe {
        foo(10, 20, 30, 40, 50);
    }
}
```

通常の Rust 関数を可変長引数にすることは*できません*。

```rust,compile_fail
// This will not compile

fn foo(x: i32, ...) {}
```

<a id="the-nullable-pointer-optimization"></a>

## 「ヌルポインタ最適化」

Rust の一部の型は、決して `null` にならないと定義されています。参照（`&T`、`&mut T`）、ボックス（`Box<T>`）、関数ポインタ（`extern "abi" fn()`）がこれに含まれます。C とやり取りする際は、`null` になり得るポインタがよく使われるため、Rust の型との相互変換には複雑な `transmute` やアンセーフなコードが必要に思えるかもしれません。しかし、こうした無効な値を構築したり扱ったりしようとすることは**未定義動作です**。そのため、代わりに以下の回避策を使用すべきです。

特別な場合として、`enum` がちょうど 2 つのバリアントを持ち、その一方がデータを持たず、もう一方が上に挙げたヌルにならない型のいずれかのフィールドを持つ場合、「ヌルポインタ最適化」の対象になります。つまり、判別子のための追加領域は必要ありません。代わりに、ヌルにならないフィールドに `null` 値を入れることで空のバリアントを表現します。これは「最適化」と呼ばれますが、他の最適化と異なり、対象となる型への適用が保証されています。

ヌルポインタ最適化を利用する最も一般的な型は `Option<T>` で、`None` が `null` に対応します。したがって、`Option<extern "C" fn(c_int) -> c_int>` は、C ABI を使用するヌル許容の関数ポインタを正しく表現する方法です（C の型 `int (*)(int)` に対応します）。

ここでは説明のための例を示します。ある C ライブラリに、特定の状況で呼び出されるコールバックを登録する機能があるとします。コールバックは関数ポインタと整数を受け取り、その整数を引数として関数を実行することになっています。そのため、関数ポインタが FFI 境界を双方向に行き来します。

<!-- ignore: requires libc crate -->
```rust,ignore
use libc::c_int;

# #[cfg(hidden)]
unsafe extern "C" {
    /// Registers the callback.
    fn register(cb: Option<extern "C" fn(Option<extern "C" fn(c_int) -> c_int>, c_int) -> c_int>);
}
# unsafe fn register(_: Option<extern "C" fn(Option<extern "C" fn(c_int) -> c_int>,
#                                            c_int) -> c_int>)
# {}

/// This fairly useless function receives a function pointer and an integer
/// from C, and returns the result of calling the function with the integer.
/// In case no function is provided, it squares the integer by default.
extern "C" fn apply(process: Option<extern "C" fn(c_int) -> c_int>, int: c_int) -> c_int {
    match process {
        Some(f) => f(int),
        None    => int * int
    }
}

fn main() {
    unsafe {
        register(Some(apply));
    }
}
```

C 側のコードは次のようになります。

```c
void register(int (*f)(int (*)(int), int)) {
    ...
}
```

`transmute` は必要ありません！

<a id="ffi-and-unwinding"></a>

## FFI と巻き戻し

FFI を扱う際には、巻き戻しに注意することが重要です。ほとんどの ABI 文字列には、`-unwind` 接尾辞が付くものと付かないものの 2 種類があります。
`Rust` ABI は常に巻き戻しを許可するため、`Rust-unwind` ABI はありません。

Rust の `panic` や外部（C++ など）の例外が FFI 境界を越えると想定する場合、その境界には適切な `-unwind` ABI 文字列を使用しなければなりません。
逆に、巻き戻しが ABI 境界を越えると想定しない場合は、`unwind` の付かない ABI 文字列のいずれかを使用してください。

> 注意: `panic=abort` でコンパイルすると、`panic` する関数がどの ABI を指定していても、`panic!` はやはり即座にプロセスをアボートします。

巻き戻し操作が、巻き戻しを許可しない ABI 境界に実際に遭遇した場合、その動作は巻き戻しの発生源（Rust の `panic` か外部の例外か）によって異なります。

* `panic` はプロセスを安全にアボートさせます。
* 外部の例外が Rust に入ると、未定義動作を引き起こします。

`catch_unwind` と外部の例外との相互作用は**未定義です**。`panic` と外部の例外捕捉機構（特に C++ の `try`/`catch`）との相互作用も同様です。

<a id="rust-panic-with-c-unwind"></a>

### `"C-unwind"` での Rust の `panic`

<!-- ignore: using unstable feature -->
```rust,ignore
#[unsafe(no_mangle)]
unsafe extern "C-unwind" fn example() {
    panic!("Uh oh");
}
```

この関数は（`panic=unwind` でコンパイルした場合）、C++ のスタックフレームを巻き戻すことが許可されます。

```text
[Rust function with `catch_unwind`, which stops the unwinding]
      |
     ...
      |
[C++ frames]
      |                           ^
      | (calls)                   | (unwinding
      v                           |  goes this
[Rust function `example`]         |  way)
      |                           |
      +--- rust function panics --+
```

C++ のフレームにオブジェクトがある場合、そのデストラクタが呼び出されます。

<a id="c-throw-with-c-unwind"></a>

### `"C-unwind"` での C++ の `throw`

<!-- ignore: using unstable feature -->
```rust,ignore
#[link(...)]
unsafe extern "C-unwind" {
    // A C++ function that may throw an exception
    fn may_throw();
}

#[unsafe(no_mangle)]
unsafe extern "C-unwind" fn rust_passthrough() {
    let b = Box::new(5);
    unsafe { may_throw(); }
    println!("{:?}", &b);
}
```

`try` ブロックを持つ C++ 関数は、`rust_passthrough` を呼び出して、`may_throw` が送出した例外を `catch` できます。

```text
[C++ function with `try` block that invokes `rust_passthrough`]
      |
     ...
      |
[Rust function `rust_passthrough`]
      |                            ^
      | (calls)                    | (unwinding
      v                            |  goes this
[C++ function `may_throw`]         |  way)
      |                            |
      +--- C++ function throws ----+
```

`may_throw` が実際に例外を送出すると、`b` はドロップされます。そうでなければ、`5` が出力されます。

<a id="panic-can-be-stopped-at-an-abi-boundary"></a>

### `panic` は ABI 境界で停止できる

```rust
#[unsafe(no_mangle)]
extern "C" fn assert_nonzero(input: u32) {
    assert!(input != 0)
}
```

`assert_nonzero` が引数 `0` で呼び出されると、`panic=abort` でコンパイルしたかどうかにかかわらず、ランタイムがプロセスを（安全に）アボートすることが保証されています。

<a id="catching-panic-preemptively"></a>

### `panic` を先回りして捕捉する

パニックする可能性のある Rust コードを書いていて、パニックした場合にプロセスをアボートさせたくないなら、[`catch_unwind`] を使用しなければなりません。

```rust
use std::panic::catch_unwind;

#[unsafe(no_mangle)]
pub extern "C" fn oh_no() -> i32 {
    let result = catch_unwind(|| {
        panic!("Oops!");
    });
    match result {
        Ok(_) => 0,
        Err(_) => 1,
    }
}

fn main() {}
```

[`catch_unwind`] が捕捉するのは巻き戻しを行うパニックだけであり、プロセスをアボートするパニックは捕捉しないことに注意してください。詳細は [`catch_unwind`] のドキュメントを参照してください。

[`catch_unwind`]: ../std/panic/fn.catch_unwind.html

<a id="representing-opaque-structs"></a>

## 不透明な構造体の表現

C ライブラリが何かへのポインタを提供したいものの、その対象の内部の詳細を公開したくない場合があります。
安定した簡単な方法は、`void *` 引数を使用することです。

```c
void foo(void *arg);
void bar(void *arg);
```

Rust では `c_void` 型でこれを表現できます。

<!-- ignore: requires libc crate -->
```rust,ignore
unsafe extern "C" {
    pub fn foo(arg: *mut libc::c_void);
    pub fn bar(arg: *mut libc::c_void);
}
# fn main() {}
```

これは、この状況に対処する完全に有効な方法です。しかし、もう少し改善できます。この問題を解決するため、一部の C ライブラリは代わりに、詳細とメモリレイアウトを非公開にした `struct` を作成します。これによって、ある程度の型安全性が得られます。これらの構造体は「不透明」と呼ばれます。C の例を示します。

```c
struct Foo; /* Foo is a structure, but its contents are not part of the public interface */
struct Bar;
void foo(struct Foo *arg);
void bar(struct Bar *arg);
```

Rust でこれを行うために、独自の不透明な型を作成しましょう。

```rust
#[repr(C)]
pub struct Foo {
    _data: (),
    _marker:
        core::marker::PhantomData<(*mut u8, core::marker::PhantomPinned)>,
}
#[repr(C)]
pub struct Bar {
    _data: (),
    _marker:
        core::marker::PhantomData<(*mut u8, core::marker::PhantomPinned)>,
}

unsafe extern "C" {
    pub fn foo(arg: *mut Foo);
    pub fn bar(arg: *mut Bar);
}
# fn main() {}
```

少なくとも 1 つの非公開フィールドを含め、コンストラクタを用意しないことで、このモジュールの外からはインスタンス化できない不透明な型を作成します。
（フィールドのない構造体は誰でもインスタンス化できます。）
この型を FFI でも使用したいので、`#[repr(C)]` を追加する必要があります。
マーカーは、コンパイラがこの構造体を `Send`、`Sync`、`Unpin` として扱わないことを保証します。（`*mut u8` は `Send` でも `Sync` でもなく、`PhantomPinned` は `Unpin` ではありません。）

しかし、`Foo` と `Bar` は異なる型なので、両者の間で型安全性が得られ、誤って `Foo` へのポインタを `bar()` に渡すことはできません。

FFI の型として空の enum を使用するのは、非常に悪い考えであることに注意してください。
コンパイラは空の enum が値を持たないことに依存しているため、`&Empty` 型の値を扱うことは非常に大きな落とし穴であり、（未定義動作を引き起こすことで）プログラムの誤った動作につながる可能性があります。

> **注意:** 最も簡単な方法は「extern 型」を使用することでしょう。
しかし、現在（2021 年 6 月時点）これは不安定であり、未解決の疑問もいくつかあります。詳細は [RFC ページ][extern-type-rfc] と [追跡 issue][extern-type-issue] を参照してください。

[extern-type-issue]: https://github.com/rust-lang/rust/issues/43467
[extern-type-rfc]: https://rust-lang.github.io/rfcs/1861-extern-types.html
