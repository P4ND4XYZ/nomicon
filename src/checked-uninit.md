<a id="checked-uninitialized-memory"></a>

# チェックされる未初期化メモリ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

C と同様に、Rust のすべてのスタック変数は、明示的に値を代入するまで未初期化です。C と異なり、Rust は代入するまでそれらを読み出すことを静的に防ぎます。

```rust,compile_fail
fn main() {
    let x: i32;
    println!("{}", x);
}
```

```text
  |
3 |     println!("{}", x);
  |                    ^ use of possibly uninitialized `x`
```

これは基本的な分岐解析に基づいています。どの分岐でも、`x` が初めて使われる前に値を代入しなければなりません。略して「`x` は init（初期化済み）」や「`x` は uninit（未初期化）」とも言います。

興味深いことに、すべての分岐でちょうど1回代入する場合、Rust は遅延初期化のために変数を可変にすることを要求しません。ただし、この解析は定数解析やそれに類するものを利用しません。そのため、次のコードはコンパイルできます。

```rust
fn main() {
    let x: i32;

    if true {
        x = 1;
    } else {
        x = 2;
    }

    println!("{}", x);
}
```

しかし、次のコードはコンパイルできません。

```rust,compile_fail
fn main() {
    let x: i32;
    if true {
        x = 1;
    }
    println!("{}", x);
}
```

```text
  |
6 |     println!("{}", x);
  |                    ^ use of possibly uninitialized `x`
```

一方、次のコードはコンパイルできます。

```rust
fn main() {
    let x: i32;
    if true {
        x = 1;
        println!("{}", x);
    }
    // Don't care that there are branches where it's not initialized
    // since we don't use the value in those branches
}
```

もちろん、この解析は実際の値を考慮しませんが、依存関係や制御フローを比較的高度に理解しています。例えば、次のコードは動作します。

```rust
let x: i32;

loop {
    // Rust doesn't understand that this branch will be taken unconditionally,
    // because it relies on actual values.
    if true {
        // But it does understand that it will only be taken once because
        // we unconditionally break out of it. Therefore `x` doesn't
        // need to be marked as mutable.
        x = 0;
        break;
    }
}
// It also knows that it's impossible to get here without reaching the break.
// And therefore that `x` must be initialized here!
println!("{}", x);
```

変数から値がムーブされると、その値の型が `Copy` でない場合、変数は論理的に未初期化になります。つまり、次のようになります。

```rust
fn main() {
    let x = 0;
    let y = Box::new(0);
    let z1 = x; // x is still valid because i32 is Copy
    let z2 = y; // y is now logically uninitialized because Box isn't Copy
}
```

ただし、この例で `y` に再代入するには、`y` を可変とする必要が*あります*。安全な Rust プログラムでも、`y` の値が変わったことを観測できるためです。

```rust
fn main() {
    let mut y = Box::new(0);
    let z = y; // y is now logically uninitialized because Box isn't Copy
    y = Box::new(1); // reinitialize y
}
```

それ以外の点では、`y` はまったく新しい変数のように扱われます。
