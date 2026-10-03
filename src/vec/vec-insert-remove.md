<a id="insert-and-remove"></a>

# 挿入と削除

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

スライスが提供*しない*機能に `insert` と `remove` があるので、次はこれらを実装しましょう。

挿入では、対象のインデックス以降の全要素を右へ1つずらす必要があります。
そのために、C の `memmove` の Rust 版である `ptr::copy` を使います。
これはメモリのかたまりをある場所から別の場所へコピーし、コピー元とコピー先が
重なる場合も正しく扱います（ここでは確実に重なります）。

インデックス `i` に挿入するなら、古い len を使って `[i .. len]` を
`[i+1 .. len+1]` にずらしたいところです。

<!-- ignore: simplified code -->
```rust,ignore
pub fn insert(&mut self, index: usize, elem: T) {
    // Note: `<=` because it's valid to insert after everything
    // which would be equivalent to push.
    assert!(index <= self.len, "index out of bounds");
    if self.len == self.cap { self.grow(); }

    unsafe {
        // ptr::copy(src, dest, len): "copy from src to dest len elems"
        ptr::copy(
            self.ptr.as_ptr().add(index),
            self.ptr.as_ptr().add(index + 1),
            self.len - index,
        );
        ptr::write(self.ptr.as_ptr().add(index), elem);
    }

    self.len += 1;
}
```

削除は逆の動作をします。*新しい* len を使い、`[i+1 .. len + 1]` のすべての要素を
`[i .. len]` へずらす必要があります。

<!-- ignore: simplified code -->
```rust,ignore
pub fn remove(&mut self, index: usize) -> T {
    // Note: `<` because it's *not* valid to remove after everything
    assert!(index < self.len, "index out of bounds");
    unsafe {
        self.len -= 1;
        let result = ptr::read(self.ptr.as_ptr().add(index));
        ptr::copy(
            self.ptr.as_ptr().add(index + 1),
            self.ptr.as_ptr().add(index),
            self.len - index,
        );
        result
    }
}
```
