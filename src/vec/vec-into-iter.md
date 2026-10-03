# IntoIter

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

イテレータの実装に進みましょう。Deref の魔法のおかげで、`iter` と `iter_mut` は
すでに用意されています。しかし、Vec が提供し、スライスでは提供できない興味深い
イテレータが2つあります。`into_iter` と `drain` です。

IntoIter は Vec を値渡しで消費するため、その要素も値として返せます。
これを可能にするには、IntoIter が Vec のアロケーションの管理を引き継ぐ必要があります。

IntoIter は両端から読み出せるよう、DoubleEnded でもある必要があります。
後ろからの読み出しは単に `pop` を呼ぶことで実装できますが、前からは難しくなります。
`remove(0)` を呼ぶこともできますが、途方もなく高コストです。代わりに ptr::read を使い、
バッファをまったく変更せずに Vec のどちらの端からも値をコピーして取り出します。

そのために、配列の反復処理でよく使われる C のイディオムを使います。
配列の先頭を指すポインタと、末尾の1要素先を指すポインタを作ります。
片方の端から要素が欲しいときは、その端のポインタが指す値を読み出し、ポインタを1つ
進めます。2つのポインタが等しくなれば、完了したと分かります。

`next` と `next_back` では読み出しとオフセットの順序が逆になることに注意してください。
`next_back` のポインタは常に次に読みたい要素の後ろにあり、`next` のポインタは常に
次に読みたい要素を指しています。理由を理解するため、1つを除くすべての要素を
返した場合を考えてみましょう。

配列は次のようになっています。

```text
          S  E
[X, X, X, O, X, X, X]
```

もし E が次に返したい要素を直接指していたら、もう返す要素がない場合と
区別できなくなります。

反復処理中には実際に使いませんが、IntoIter がドロップされたときに解放できるよう、
Vec のアロケーション情報も保持する必要があります。

そこで次の構造体を使います。

<!-- ignore: simplified code -->
```rust,ignore
pub struct IntoIter<T> {
    buf: NonNull<T>,
    cap: usize,
    start: *const T,
    end: *const T,
}
```

初期化のコードは次のようになります。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> IntoIterator for Vec<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;
    fn into_iter(self) -> IntoIter<T> {
        // Make sure not to drop Vec since that would free the buffer
        let vec = ManuallyDrop::new(self);

        // Can't destructure Vec since it's Drop
        let ptr = vec.ptr;
        let cap = vec.cap;
        let len = vec.len;

        IntoIter {
            buf: ptr,
            cap,
            start: ptr.as_ptr(),
            end: if cap == 0 {
                // can't offset off this pointer, it's not allocated!
                ptr.as_ptr()
            } else {
                unsafe { ptr.as_ptr().add(len) }
            },
        }
    }
}
```

前方への反復処理は次のとおりです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Iterator for IntoIter<T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        if self.start == self.end {
            None
        } else {
            unsafe {
                let result = ptr::read(self.start);
                self.start = self.start.offset(1);
                Some(result)
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = (self.end as usize - self.start as usize)
                  / mem::size_of::<T>();
        (len, Some(len))
    }
}
```

後方への反復処理は次のとおりです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> DoubleEndedIterator for IntoIter<T> {
    fn next_back(&mut self) -> Option<T> {
        if self.start == self.end {
            None
        } else {
            unsafe {
                self.end = self.end.offset(-1);
                Some(ptr::read(self.end))
            }
        }
    }
}
```

IntoIter はアロケーションの所有権を引き継ぐため、解放のために Drop を実装する必要が
あります。また、返されずに残ったすべての要素をドロップするためにも Drop を実装したいところです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Drop for IntoIter<T> {
    fn drop(&mut self) {
        if self.cap != 0 {
            // drop any remaining elements
            for _ in &mut *self {}
            let layout = Layout::array::<T>(self.cap).unwrap();
            unsafe {
                alloc::dealloc(self.buf.as_ptr() as *mut u8, layout);
            }
        }
    }
}
```
