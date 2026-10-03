<a id="beneath-std"></a>

# `std` の下で

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

この節では、通常は `std` クレートが提供する機能のうち、`#![no_std]` の開発者が `#![no_std]` バイナリクレートをビルドするために対処しなければならない（つまり、自分で提供しなければならない）ものを説明します。

<a id="using-libc"></a>

## `libc` の使用

`#[no_std]` 実行可能ファイルをビルドするには、依存関係として `libc` が必要です。
これは `Cargo.toml` ファイルで指定できます。

```toml
[dependencies]
libc = { version = "0.2.146", default-features = false }
```

デフォルト機能を無効にしていることに注意してください。これは極めて重要な手順です。**`libc` のデフォルト機能には `std` クレートが含まれるため、無効にしなければなりません。**

代わりに、以下の例のように、不安定な非公開機能 `rustc_private` を `extern crate libc;` 宣言とともに使用することもできます。windows-msvc ターゲットは libc を必要とせず、それに対応して sysroot に `libc` クレートがないことに注意してください。この場合、以下の `extern crate libc;` は不要であり、windows-msvc ターゲットで記述するとコンパイルエラーになります。

<a id="writing-an-executable-without-std"></a>

## `std` なしで実行可能ファイルを書く

`#![no_std]` 実行可能ファイルを生成するには、おそらく nightly 版のコンパイラが必要になります。多くのプラットフォームでは、不安定な[言語項目][lang item]である `eh_personality` を提供しなければならないためです。

ターゲットに適したエントリポイントのシンボルを定義する必要があります。たとえば `main`、`_start`、`WinMain`、あるいはターゲットに対応するその他の開始点です。
また、コンパイラが自らエントリポイントを生成しようとするのを防ぐため、`#![no_main]` 属性を使用する必要があります。

さらに、[パニックハンドラ関数](panic-handler.html)の定義も必要です。

```rust
#![feature(lang_items, core_intrinsics, rustc_private)]
#![allow(internal_features)]
#![no_std]
#![no_main]

// Necessary for `panic = "unwind"` builds on cfg(unix) platforms.
#![feature(panic_unwind)]
extern crate unwind;

// Pull in the system libc library for what crt0.o likely requires.
#[cfg(not(windows))]
extern crate libc;

use core::ffi::{c_char, c_int};
use core::panic::PanicInfo;

// Entry point for this program.
#[unsafe(no_mangle)] // ensure that this symbol is included in the output as `main`
extern "C" fn main(_argc: c_int, _argv: *const *const c_char) -> c_int {
    0
}

// These functions are used by the compiler, but not for an empty program like this.
// They are normally provided by `std`.
#[lang = "eh_personality"]
fn rust_eh_personality() {}
#[panic_handler]
fn panic_handler(_info: &PanicInfo) -> ! { core::intrinsics::abort() }
```

rustup 経由で標準ライブラリのバイナリリリースを利用できないターゲットを扱っていて（おそらく `core` クレートを自分でビルドしているということです）、compiler-rt の組み込み関数が必要な場合（つまり、おそらく実行可能ファイルのビルド時に ``undefined reference to `__aeabi_memcpy'`` というリンカーエラーが発生している場合）、これらの組み込み関数を取得し、リンカーエラーを解消するために、[`compiler_builtins` クレート][`compiler_builtins` crate] に手動でリンクする必要があります。

[`compiler_builtins` crate]: https://crates.io/crates/compiler_builtins
[lang item]: https://doc.rust-lang.org/nightly/unstable-book/language-features/lang-items.html
