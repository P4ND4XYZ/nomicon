<a id="deallocating"></a>

# デアロケート

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

次は、大量のリソースをリークしないよう Drop を実装するべきです。最も簡単な方法は、
None が返るまで `pop` を呼び、その後バッファをデアロケートすることです。
`T: !Drop` なら `pop` の呼び出しは不要であることに注意してください。理論上は、
`T` が `needs_drop` かを Rust に問い合わせ、`pop` の呼び出しを省略できます。
しかし実際には、LLVM はこのような副作用のない単純なコードの除去に*非常に*優れているので、
除去されていないと気付かない限り、わざわざそうしません（この場合は除去されます）。

`self.cap == 0` のときは `alloc::dealloc` を呼んではいけません。
この場合、実際にはメモリをアロケートしていないからです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Drop for Vec<T> {
    fn drop(&mut self) {
        if self.cap != 0 {
            while let Some(_) = self.pop() { }
            let layout = Layout::array::<T>(self.cap).unwrap();
            unsafe {
                alloc::dealloc(self.ptr.as_ptr() as *mut u8, layout);
            }
        }
    }
}
```
