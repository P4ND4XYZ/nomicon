<a id="data-races-and-race-conditions"></a>

# データ競合と競合状態

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

安全な Rust はデータ競合が存在しないことを保証します。データ競合は次のように定義されます。

* 2 つ以上のスレッドがメモリ上のある場所に並行してアクセスしています
* そのうち 1 つ以上が書き込みです
* そのうち 1 つ以上が同期されていません

データ競合は未定義動作であり、そのため安全な Rust では起こせません。データ競合は、*ほとんどの場合* Rust の所有権システムだけで防がれます。可変参照の別名を作ることは不可能なので、データ競合を起こすことも不可能です。内部可変性がこれを複雑にすることが、Send と Sync トレイトが存在する主な理由です（詳しくは次の節を参照してください）。

**しかし、Rust は一般的な競合状態を防ぎません。**

スケジューラを制御できない状況では、これは数学的に不可能です。通常の OS 環境がこの状況に当たります。プリエンプションを制御できるなら、一般的な競合を防ぐことが_可能な場合もあります_。この手法は [RTIC](https://github.com/rtic-rs/rtic) などのフレームワークで使われています。しかし、実際にスケジューリングを制御できるケースは非常にまれです。

このため、Rust がデッドロックに陥ったり、不正な同期によって意味のないことをしたりしても「安全」とみなされます。これは一般的な競合状態、あるいはリソース競合と呼ばれます。明らかに、そのようなプログラムはあまり良くありませんが、もちろん Rust はすべての論理エラーを防ぐことはできません。

いずれにせよ、競合状態だけで Rust プログラムのメモリ安全性を侵害することはできません。他のアンセーフなコードと組み合わさった場合に限り、競合状態は実際にメモリ安全性を侵害し得ます。たとえば、正しいプログラムは次のようになります。

```rust,no_run
use std::thread;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

let data = vec![1, 2, 3, 4];
// Arc so that the memory the AtomicUsize is stored in still exists for
// the other thread to increment, even if we completely finish executing
// before it. Rust won't compile the program without it, because of the
// lifetime requirements of thread::spawn!
let idx = Arc::new(AtomicUsize::new(0));
let other_idx = idx.clone();

// `move` captures other_idx by-value, moving it into this thread
thread::spawn(move || {
    // It's ok to mutate idx because this value
    // is an atomic, so it can't cause a Data Race.
    other_idx.fetch_add(10, Ordering::SeqCst);
});

// Index with the value loaded from the atomic. This is safe because we
// read the atomic memory only once, and then pass a copy of that value
// to the Vec's indexing implementation. This indexing will be correctly
// bounds checked, and there's no chance of the value getting changed
// in the middle. However our program may panic if the thread we spawned
// managed to increment before this ran. A race condition because correct
// program execution (panicking is rarely correct) depends on order of
// thread execution.
println!("{}", data[idx.load(Ordering::SeqCst)]);
```

代わりに境界チェックを先に行い、その後、未チェックの値でデータにアンセーフにアクセスすると、競合状態によってメモリ安全性を侵害することができます。

```rust,no_run
use std::thread;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

let data = vec![1, 2, 3, 4];

let idx = Arc::new(AtomicUsize::new(0));
let other_idx = idx.clone();

// `move` captures other_idx by-value, moving it into this thread
thread::spawn(move || {
    // It's ok to mutate idx because this value
    // is an atomic, so it can't cause a Data Race.
    other_idx.fetch_add(10, Ordering::SeqCst);
});

if idx.load(Ordering::SeqCst) < data.len() {
    unsafe {
        // Incorrectly loading the idx after we did the bounds check.
        // It could have changed. This is a race condition, *and dangerous*
        // because we decided to do `get_unchecked`, which is `unsafe`.
        println!("{}", data.get_unchecked(idx.load(Ordering::SeqCst)));
    }
}
```
