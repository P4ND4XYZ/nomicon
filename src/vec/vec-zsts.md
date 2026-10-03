<a id="handling-zero-sized-types"></a>

# サイズ0の型の扱い

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../../README.md for attribution and licenses. -->

いよいよです。サイズ0の型という幽霊と戦います。安全な Rust ではこれを気にする必要は
*決して*ありませんが、Vec は生ポインタと生のアロケーションを多用します。
まさにこの2つで、サイズ0の型を気にする必要があるのです。注意点は2つあります。

* 生のアロケータ API にアロケーションのサイズとして0を渡すと、未定義動作になります。
* サイズ0の型に対する生ポインタのオフセットは no-op（何もしない操作）なので、
  C 形式のポインタイテレータが壊れます。

ありがたいことに、ポインタイテレータとアロケーションの処理は、それぞれ
`RawValIter` と `RawVec` に抽象化して切り出してあります。不思議なほど都合がよいですね。

<a id="allocating-zero-sized-types"></a>

## サイズ0の型のアロケート

アロケータ API がサイズ0のアロケーションをサポートしないなら、いったい何を
アロケーションとして保存するのでしょうか？もちろん `NonNull::dangling()` です！
ZST はちょうど1つの値を持つため、ほぼすべての操作は no-op です。したがって、
保存や読み込みのために考慮すべき状態もありません。これは `ptr::read` と `ptr::write` にも
当てはまります。実際にはポインタをまったく見ません。そのため、ポインタを変更する必要は
決してありません。

ただし、サイズ0の型では、オーバーフローする前にメモリ不足になるという、これまでの
前提がもはや有効でないことに注意してください。サイズ0の型については、容量の
オーバーフローを明示的に防がなければなりません。

現在の設計では、これは `RawVec` の各メソッドに1つずつ、計3つのガードを書くことだけを
意味します。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> RawVec<T> {
    fn new() -> Self {
        // This branch should be stripped at compile time.
        let cap = if mem::size_of::<T>() == 0 { usize::MAX } else { 0 };

        // `NonNull::dangling()` doubles as "unallocated" and "zero-sized allocation"
        RawVec {
            ptr: NonNull::dangling(),
            cap,
        }
    }

    fn grow(&mut self) {
        // since we set the capacity to usize::MAX when T has size 0,
        // getting to here necessarily means the Vec is overfull.
        assert!(mem::size_of::<T>() != 0, "capacity overflow");

        let (new_cap, new_layout) = if self.cap == 0 {
            (1, Layout::array::<T>(1).unwrap())
        } else {
            // This can't overflow because we ensure self.cap <= isize::MAX.
            let new_cap = 2 * self.cap;

            // `Layout::array` checks that the number of bytes is <= usize::MAX,
            // but this is redundant since old_layout.size() <= isize::MAX,
            // so the `unwrap` should never fail.
            let new_layout = Layout::array::<T>(new_cap).unwrap();
            (new_cap, new_layout)
        };

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
        let elem_size = mem::size_of::<T>();

        if self.cap != 0 && elem_size != 0 {
            unsafe {
                alloc::dealloc(
                    self.ptr.as_ptr() as *mut u8,
                    Layout::array::<T>(self.cap).unwrap(),
                );
            }
        }
    }
}
```

これだけです。サイズ0の型のプッシュとポップをサポートできました。ただし、
（スライスへの Deref から提供されるもの以外の）イテレータはまだ壊れています。

<a id="iterating-zero-sized-types"></a>

## サイズ0の型の反復処理

サイズ0の型のオフセットは no-op です。つまり現在の設計では、`start` と `end` は
常に同じ値で初期化され、イテレータは何も返しません。現時点での解決策は、
ポインタを整数にキャストして増やし、その後ポインタへキャストし直すことです。

<!-- ignore: simplified code -->
```rust,ignore
impl<T> RawValIter<T> {
    unsafe fn new(slice: &[T]) -> Self {
        RawValIter {
            start: slice.as_ptr(),
            end: if mem::size_of::<T>() == 0 {
                ((slice.as_ptr() as usize) + slice.len()) as *const _
            } else if slice.len() == 0 {
                slice.as_ptr()
            } else {
                slice.as_ptr().add(slice.len())
            },
        }
    }
}
```

今度は別のバグがあります。まったく動かなかったイテレータが、今度は*永遠に*動きます。
イテレータの実装でも同じ仕掛けが必要です。また、size_hint の計算コードは ZST では
0で割ってしまいます。基本的には2つのポインタをバイトを指すかのように扱うので、
サイズ0の場合は1で割るようにします。`next` は次のようになります。

<!-- ignore: simplified code -->
```rust,ignore
fn next(&mut self) -> Option<T> {
    if self.start == self.end {
        None
    } else {
        unsafe {
            let result = ptr::read(self.start);
            self.start = if mem::size_of::<T>() == 0 {
                (self.start as usize + 1) as *const _
            } else {
                self.start.offset(1)
            };
            Some(result)
        }
    }
}
```

「バグ」が見えますか？誰も気付きませんでした！原著者も、数年後にこのページへの
リンクを張ったときにようやく気付きました。このコードは少々怪しいものです。
イテレータのポインタを*カウンタ*として流用すると、アラインメントを満たさなくなるからです！
ZST を使うときの*唯一の仕事*は、ポインタのアラインメントを保つことなのに！*額をぴしゃり*

生ポインタは常にアラインメントを満たす必要はないので、ポインタをカウンタにする
基本的な仕掛け自体は*問題ありません*。しかし `ptr::read` に渡すときは、確実に
アラインメントを満たす*べき*です！ZST の `ptr::read` は no-op なので、これは
不要な細かさ*かもしれません*が、*もう少し*責任を持って、ZST の経路では
`NonNull::dangling` から読みましょう。

（代わりに ZST の経路で `read_unaligned` を呼んでもかまいません。どちらでも、
何もないところから値を作り出しており、すべて何もしないコードにコンパイルされるため、
どちらでも問題ありません。）

<!-- ignore: simplified code -->
```rust,ignore
impl<T> Iterator for RawValIter<T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        if self.start == self.end {
            None
        } else {
            unsafe {
                if mem::size_of::<T>() == 0 {
                    self.start = (self.start as usize + 1) as *const _;
                    Some(ptr::read(NonNull::<T>::dangling().as_ptr()))
                } else {
                    let old_ptr = self.start;
                    self.start = self.start.offset(1);
                    Some(ptr::read(old_ptr))
                }
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let elem_size = mem::size_of::<T>();
        let len = (self.end as usize - self.start as usize)
                  / if elem_size == 0 { 1 } else { elem_size };
        (len, Some(len))
    }
}

impl<T> DoubleEndedIterator for RawValIter<T> {
    fn next_back(&mut self) -> Option<T> {
        if self.start == self.end {
            None
        } else {
            unsafe {
                if mem::size_of::<T>() == 0 {
                    self.end = (self.end as usize - 1) as *const _;
                    Some(ptr::read(NonNull::<T>::dangling().as_ptr()))
                } else {
                    self.end = self.end.offset(-1);
                    Some(ptr::read(self.end))
                }
            }
        }
    }
}
```

これで完了です。反復処理が動きます！

最後に考慮すべきことがもう1つあります。ベクタはドロップされると、生存中にアロケートした
メモリをデアロケートします。ZST ではメモリを何もアロケートしていません。実際、
決してしません。したがって、現時点のコードは不健全です。ベクタ内の ZST を模擬するために
使う `NonNull::dangling()` ポインタを、まだデアロケートしようとしています。
つまり、一度もアロケートしなかったものをデアロケートしようとすると、未定義動作を
引き起こします（当然であり、もっともな理由があります）。これを直すため、`RawVec` の
`Drop` トレイトの実装を調整し、サイズのある型だけをデアロケートするようにします。

```rust,ignore
impl<T> Drop for RawVec<T> {
    fn drop(&mut self) {
        println!("RawVec<T> Drop called, deallocating memory");
        if self.cap != 0 && std::mem::size_of::<T>() > 0 {
            let layout = std::alloc::Layout::array::<T>(self.cap).unwrap();
            unsafe {
                std::alloc::dealloc(self.ptr.as_ptr() as *mut _, layout);
            }
        }
    }
}
```

