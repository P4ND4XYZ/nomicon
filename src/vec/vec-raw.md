# RawVec

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

ここで興味深い状況になりました。Vec と IntoIter で、バッファを指定し、そのメモリを
解放するロジックが重複しています。実装して*実際の*ロジックの重複を特定できたので、
今こそロジックをまとめるよい機会です。

`(ptr, cap)` の組を抽象化して切り出し、アロケート、伸長、解放のロジックを与えます。

<!-- ignore: simplified code -->
```rust,ignore
struct RawVec<T> {
    ptr: NonNull<T>,
    cap: usize,
}

unsafe impl<T: Send> Send for RawVec<T> {}
unsafe impl<T: Sync> Sync for RawVec<T> {}

impl<T> RawVec<T> {
    fn new() -> Self {
        assert!(mem::size_of::<T>() != 0, "TODO: implement ZST support");
        RawVec {
            ptr: NonNull::dangling(),
            cap: 0,
        }
    }

    fn grow(&mut self) {
        // This can't overflow because we ensure self.cap <= isize::MAX.
        let new_cap = if self.cap == 0 { 1 } else { 2 * self.cap };

        // Layout::array checks that the number of bytes is <= usize::MAX,
        // but this is redundant since old_layout.size() <= isize::MAX,
        // so the `unwrap` should never fail.
        let new_layout = Layout::array::<T>(new_cap).unwrap();

        // Ensure that the new allocation doesn't exceed `isize::MAX` bytes.
        assert!(new_layout.size() <= isize::MAX as usize, "Allocation too large");

        let new_ptr = if self.cap == 0 {
            unsafe { alloc::alloc(new_layout) }
        } else {
            let old_layout = Layout::array::<T>(self.cap).unwrap();
            let old_ptr = self.ptr.as_ptr() as *mut u8;
            unsafe { alloc::realloc(old_ptr, old_layout, new_layout.size()) }
        };

        // If allocation fails, `new_ptr` will be null, in which case we abort.
        self.ptr = match NonNull::new(new_ptr as *mut T) {
            Some(p) => p,
            None => alloc::handle_alloc_error(new_layout),
        };
        self.cap = new_cap;
    }
}

impl<T> Drop for RawVec<T> {
    fn drop(&mut self) {
        if self.cap != 0 {
            let layout = Layout::array::<T>(self.cap).unwrap();
            unsafe {
                alloc::dealloc(self.ptr.as_ptr() as *mut u8, layout);
            }
        }
    }
}
```

Vec は次のように変更します。

<!-- ignore: simplified code -->
```rust,ignore
pub struct Vec<T> {
    buf: RawVec<T>,
    len: usize,
}

impl<T> Vec<T> {
    fn ptr(&self) -> *mut T {
        self.buf.ptr.as_ptr()
    }

    fn cap(&self) -> usize {
        self.buf.cap
    }

    pub fn new() -> Self {
        Vec {
            buf: RawVec::new(),
            len: 0,
        }
    }

    // push/pop/insert/remove largely unchanged:
    // * `self.ptr.as_ptr() -> self.ptr()`
    // * `self.cap -> self.cap()`
    // * `self.grow() -> self.buf.grow()`
}

impl<T> Drop for Vec<T> {
    fn drop(&mut self) {
        while let Some(_) = self.pop() {}
        // deallocation is handled by RawVec
    }
}
```

最後に、IntoIter を大幅に簡略化できます。

<!-- ignore: simplified code -->
```rust,ignore
pub struct IntoIter<T> {
    _buf: RawVec<T>, // we don't actually care about this. Just need it to live.
    start: *const T,
    end: *const T,
}

// next and next_back literally unchanged since they never referred to the buf

impl<T> Drop for IntoIter<T> {
    fn drop(&mut self) {
        // only need to ensure all our elements are read;
        // buffer will clean itself up afterwards.
        for _ in &mut *self {}
    }
}

impl<T> IntoIterator for Vec<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;
    fn into_iter(self) -> IntoIter<T> {
        // need to use ptr::read to unsafely move the buf out since it's
        // not Copy, and Vec implements Drop (so we can't destructure it).
        let buf = unsafe { ptr::read(&self.buf) };
        let len = self.len;
        mem::forget(self);

        IntoIter {
            start: buf.ptr.as_ptr(),
            end: if buf.cap == 0 {
                // can't offset off of a pointer unless it's part of an allocation
                buf.ptr.as_ptr()
            } else {
                unsafe { buf.ptr.as_ptr().add(len) }
            },
            _buf: buf,
        }
    }
}
```

ずっとよくなりました。
