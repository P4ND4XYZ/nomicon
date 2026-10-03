# #[panic_handler]

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

`#[panic_handler]` は、`#![no_std]` アプリケーションでの `panic!` の動作を定義するために使用します。
`#[panic_handler]` 属性は、シグネチャが `fn(&PanicInfo)
-> !` の関数に適用しなければならず、そのような関数は binary / dylib / cdylib クレートの依存関係グラフに*一度だけ*現れなければなりません。`PanicInfo` の API は [API ドキュメント][API docs]で確認できます。

[API docs]: ../core/panic/struct.PanicInfo.html

`#![no_std]` アプリケーションには*標準*出力がなく、また、組み込みアプリケーションなど一部の `#![no_std]` アプリケーションでは、開発時とリリース時で異なるパニック動作が必要なので、パニッククレート、すなわち `#[panic_handler]` だけを含むクレートを用意すると便利な場合があります。
こうすれば、アプリケーションは別のパニッククレートにリンクするだけで、パニック時の動作を簡単に切り替えられます。

以下に、dev プロファイル（`cargo build`）でコンパイルするか、release プロファイル（`cargo build
--release`）でコンパイルするかによって、アプリケーションのパニック時の動作が異なる例を示します。

`panic-semihosting` クレート -- セミホスティングを使ってホストの stderr にパニックメッセージを記録します。

<!-- ignore: simplified code -->
```rust,ignore
#![no_std]

use core::fmt::{Write, self};
use core::panic::PanicInfo;

struct HStderr {
    // ..
#     _0: (),
}
#
# impl HStderr {
#     fn new() -> HStderr { HStderr { _0: () } }
# }
#
# impl fmt::Write for HStderr {
#     fn write_str(&mut self, _: &str) -> fmt::Result { Ok(()) }
# }

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    let mut host_stderr = HStderr::new();

    // logs "panicked at '$reason', src/main.rs:27:4" to the host stderr
    writeln!(host_stderr, "{}", info).ok();

    loop {}
}
```

`panic-halt` クレート -- パニック時にスレッドを停止します。メッセージは破棄されます。

<!-- ignore: simplified code -->
```rust,ignore
#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}
```

`app` クレート:

<!-- ignore: requires the above crates -->
```rust,ignore
#![no_std]

// dev profile
#[cfg(debug_assertions)]
extern crate panic_semihosting;

// release profile
#[cfg(not(debug_assertions))]
extern crate panic_halt;

fn main() {
    // ..
}
```
