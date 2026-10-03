# Drain

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

Drain に進みましょう。Drain はほぼ IntoIter と同じですが、Vec を消費する代わりに
借用し、そのアロケーションは変更しません。今は「基本的な」全範囲版だけを実装します。

<!-- ignore: simplified code -->
```rust,ignore
use std::marker::PhantomData;

struct Drain<'a, T: 'a> {
    // Need to bound the lifetime here, so we do it with `&'a mut Vec<T>`
    // because that's semantically what we contain. We're "just" calling
    // `pop()` and `remove(0)`.
    vec: PhantomData<&'a mut Vec<T>>,
    start: *const T,
    end: *const T,
}

impl<'a, T> Iterator for Drain<'a, T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        if self.start == self.end {
            None
```

-- 待ってください。見覚えがありますね。さらにまとめましょう。
IntoIter と Drain はまったく同じ構造なので、それを切り出しましょう。

<!-- ignore: simplified code -->
```rust,ignore
struct RawValIter<T> {
    start: *const T,
    end: *const T,
}

impl<T> RawValIter<T> {
    // unsafe to construct because it has no associated lifetimes.
    // This is necessary to store a RawValIter in the same struct as
    // its actual allocation. OK since it's a private implementation
    // detail.
    unsafe fn new(slice: &[T]) -> Self {
        RawValIter {
            start: slice.as_ptr(),
            end: if slice.len() == 0 {
                // if `len = 0`, then this is not actually allocated memory.
                // Need to avoid offsetting because that will give wrong
                // information to LLVM via GEP.
                slice.as_ptr()
            } else {
                slice.as_ptr().add(slice.len())
            }
        }
    }
}

// Iterator and DoubleEndedIterator impls identical to IntoIter.
```

IntoIter は次のようになります。

<!-- ignore: simplified code -->
```rust,ignore
pub struct IntoIter<T> {
    _buf: RawVec<T>, // we don't actually care about this. Just need it to live.
    iter: RawValIter<T>,
}

impl<T> Iterator for IntoIter<T> {
    type Item = T;
    fn next(&mut self) -> Option<T> { self.iter.next() }
    fn size_hint(&self) -> (usize, Option<usize>) { self.iter.size_hint() }
}

impl<T> DoubleEndedIterator for IntoIter<T> {
    fn next_back(&mut self) -> Option<T> { self.iter.next_back() }
}

impl<T> Drop for IntoIter<T> {
    fn drop(&mut self) {
        for _ in &mut *self {}
    }
}

impl<T> IntoIterator for Vec<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;
    fn into_iter(self) -> IntoIter<T> {
        unsafe {
            let iter = RawValIter::new(&self);

            let buf = ptr::read(&self.buf);
            mem::forget(self);

            IntoIter {
                iter,
                _buf: buf,
            }
        }
    }
}
```

Drain を任意の部分範囲で動くよう拡張しやすくするため、この設計には少し変わった点を
残していることに注意してください。特に、RawValIter がドロップ時に自身をドレインするように
することも*できます*が、より複雑な Drain では正しく動作しません。
また、Drain の初期化を簡単にするため、スライスを受け取ります。

これで Drain の実装はとても簡単になります。

<!-- ignore: simplified code -->
```rust,ignore
use std::marker::PhantomData;

pub struct Drain<'a, T: 'a> {
    vec: PhantomData<&'a mut Vec<T>>,
    iter: RawValIter<T>,
}

impl<'a, T> Iterator for Drain<'a, T> {
    type Item = T;
    fn next(&mut self) -> Option<T> { self.iter.next() }
    fn size_hint(&self) -> (usize, Option<usize>) { self.iter.size_hint() }
}

impl<'a, T> DoubleEndedIterator for Drain<'a, T> {
    fn next_back(&mut self) -> Option<T> { self.iter.next_back() }
}

impl<'a, T> Drop for Drain<'a, T> {
    fn drop(&mut self) {
        for _ in &mut *self {}
    }
}

impl<T> Vec<T> {
    pub fn drain(&mut self) -> Drain<T> {
        let iter = unsafe { RawValIter::new(&self) };

        // this is a mem::forget safety thing. If Drain is forgotten, we just
        // leak the whole Vec's contents. Also we need to do this *eventually*
        // anyway, so why not do it now?
        self.len = 0;

        Drain {
            iter,
            vec: PhantomData,
        }
    }
}
```

`mem::forget` の問題の詳細は、[リークの節][leaks]を参照してください。

[leaks]: ../leaking.html
