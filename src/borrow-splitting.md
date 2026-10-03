<a id="splitting-borrows"></a>

# 借用の分割

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

複合構造を扱うとき、可変参照の相互排他性は大きな制約になり得ます。借用チェッカー（borrowck とも呼ばれます）は、いくつかの基本的なことを理解していますが、かなり簡単に行き詰まります。ただし、構造体については、重ならないフィールドを同時に借用できると分かる程度には理解しています。したがって、次のコードは現在の Rust で動作します。

```rust
struct Foo {
    a: i32,
    b: i32,
    c: i32,
}

let mut x = Foo {a: 0, b: 0, c: 0};
let a = &mut x.a;
let b = &mut x.b;
let c = &x.c;
*b += 1;
let c2 = &x.c;
*a += 10;
println!("{} {} {} {}", a, b, c, c2);
```

しかし、借用チェッカーは配列やスライスについてはまったく理解していないため、次のコードは動作しません。

```rust,compile_fail
let mut x = [1, 2, 3];
let a = &mut x[0];
let b = &mut x[1];
println!("{} {}", a, b);
```

```text
error[E0499]: cannot borrow `x[..]` as mutable more than once at a time
 --> src/lib.rs:4:18
  |
3 |     let a = &mut x[0];
  |                  ---- first mutable borrow occurs here
4 |     let b = &mut x[1];
  |                  ^^^^ second mutable borrow occurs here
5 |     println!("{} {}", a, b);
6 | }
  | - first borrow ends here

error: aborting due to previous error
```

この単純なケースなら借用チェッカーが理解できてもよさそうですが、木のような一般的なコンテナ型で、領域が重ならないことを理解するのは、明らかに望み薄です。特に、異なるキーが実際に同じ値に*対応する*場合はそうです。

していることに問題がないと借用チェッカーに「教える」には、アンセーフなコードに降りる必要があります。たとえば、可変スライスは、スライスを消費して2つの可変スライスを返す `split_at_mut` 関数を公開しています。1つはインデックスより左側のすべて、もう1つは右側のすべてを表します。これらのスライスは重ならず、したがってエイリアシングも起こらないので、安全だと直感的に分かります。しかし、実装にはアンセーフな操作が必要です。

```rust
# use std::slice::from_raw_parts_mut;
# struct FakeSlice<T>(T);
# impl<T> FakeSlice<T> {
# fn len(&self) -> usize { unimplemented!() }
# fn as_mut_ptr(&mut self) -> *mut T { unimplemented!() }
pub fn split_at_mut(&mut self, mid: usize) -> (&mut [T], &mut [T]) {
    let len = self.len();
    let ptr = self.as_mut_ptr();

    unsafe {
        assert!(mid <= len);

        (from_raw_parts_mut(ptr, mid),
         from_raw_parts_mut(ptr.add(mid), len - mid))
    }
}
# }
```

これは実際、少し微妙です。同じ値への2つの `&mut` を決して作らないように、生ポインタを介して、まったく新しいスライスを明示的に構築します。

しかし、もっと微妙なのは、可変参照を返すイテレータがどう動くかです。イテレータのトレイトは、次のように定義されます。

```rust
trait Iterator {
    type Item;

    fn next(&mut self) -> Option<Self::Item>;
}
```

この定義では、`Self::Item` は `self` と*何の*つながりも持ちません。つまり、`next` を続けて何度も呼び出し、その結果をすべて*同時に*保持できます。値を返すイテレータでは、まさにこの意味論を持つため、まったく問題ありません。共有参照でも、同じものへの任意の数の参照を認めるので、実際には問題ありません（ただし、イテレータは共有されるものとは別のオブジェクトである必要があります）。

しかし、可変参照では話が複雑になります。一見すると、この API は同じオブジェクトへの可変参照を複数生成してしまうため、可変参照とはまったく両立しないように思えるかもしれません！

しかし、実際には*動作します*。まさに、イテレータが一度きりのオブジェクトだからです。`IterMut` が返すものはどれも、高々1回しか返されません。そのため、同じデータへの可変参照を複数返すことは、実際には決してありません。

驚くかもしれませんが、多くの型では、可変イテレータの実装にアンセーフなコードは必要ありません！

たとえば、次は単方向連結リストです。

```rust
# fn main() {}
type Link<T> = Option<Box<Node<T>>>;

struct Node<T> {
    elem: T,
    next: Link<T>,
}

pub struct LinkedList<T> {
    head: Link<T>,
}

pub struct IterMut<'a, T: 'a>(Option<&'a mut Node<T>>);

impl<T> LinkedList<T> {
    fn iter_mut(&mut self) -> IterMut<T> {
        IterMut(self.head.as_mut().map(|node| &mut **node))
    }
}

impl<'a, T> Iterator for IterMut<'a, T> {
    type Item = &'a mut T;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.take().map(|node| {
            self.0 = node.next.as_mut().map(|node| &mut **node);
            &mut node.elem
        })
    }
}
```

次は可変スライスです。

```rust
# fn main() {}
use std::mem;

pub struct IterMut<'a, T: 'a>(&'a mut[T]);

impl<'a, T> Iterator for IterMut<'a, T> {
    type Item = &'a mut T;

    fn next(&mut self) -> Option<Self::Item> {
        let slice = mem::take(&mut self.0);
        if slice.is_empty() { return None; }

        let (l, r) = slice.split_at_mut(1);
        self.0 = r;
        l.get_mut(0)
    }
}

impl<'a, T> DoubleEndedIterator for IterMut<'a, T> {
    fn next_back(&mut self) -> Option<Self::Item> {
        let slice = mem::take(&mut self.0);
        if slice.is_empty() { return None; }

        let new_len = slice.len() - 1;
        let (l, r) = slice.split_at_mut(new_len);
        self.0 = l;
        r.get_mut(0)
    }
}
```

そして、次は二分木です。

```rust
# fn main() {}
use std::collections::VecDeque;

type Link<T> = Option<Box<Node<T>>>;

struct Node<T> {
    elem: T,
    left: Link<T>,
    right: Link<T>,
}

pub struct Tree<T> {
    root: Link<T>,
}

struct NodeIterMut<'a, T: 'a> {
    elem: Option<&'a mut T>,
    left: Option<&'a mut Node<T>>,
    right: Option<&'a mut Node<T>>,
}

enum State<'a, T: 'a> {
    Elem(&'a mut T),
    Node(&'a mut Node<T>),
}

pub struct IterMut<'a, T: 'a>(VecDeque<NodeIterMut<'a, T>>);

impl<T> Tree<T> {
    pub fn iter_mut(&mut self) -> IterMut<T> {
        let mut deque = VecDeque::new();
        if let Some(root) = self.root.as_mut() {
            deque.push_front(root.iter_mut());
        }
        IterMut(deque)
    }
}

impl<T> Node<T> {
    pub fn iter_mut(&mut self) -> NodeIterMut<T> {
        NodeIterMut {
            elem: Some(&mut self.elem),
            left: self.left.as_deref_mut(),
            right: self.right.as_deref_mut(),
        }
    }
}

impl<'a, T> Iterator for NodeIterMut<'a, T> {
    type Item = State<'a, T>;

    fn next(&mut self) -> Option<Self::Item> {
        self.left.take().map(State::Node).or_else(|| {
            self.elem
                .take()
                .map(State::Elem)
                .or_else(|| self.right.take().map(State::Node))
        })
    }
}

impl<'a, T> DoubleEndedIterator for NodeIterMut<'a, T> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.right.take().map(State::Node).or_else(|| {
            self.elem
                .take()
                .map(State::Elem)
                .or_else(|| self.left.take().map(State::Node))
        })
    }
}

impl<'a, T> Iterator for IterMut<'a, T> {
    type Item = &'a mut T;
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            match self.0.front_mut().and_then(Iterator::next) {
                Some(State::Elem(elem)) => return Some(elem),
                Some(State::Node(node)) => self.0.push_front(node.iter_mut()),
                None => {
                    self.0.pop_front()?;
                }
            }
        }
    }
}

impl<'a, T> DoubleEndedIterator for IterMut<'a, T> {
    fn next_back(&mut self) -> Option<Self::Item> {
        loop {
            match self.0.back_mut().and_then(DoubleEndedIterator::next_back) {
                Some(State::Elem(elem)) => return Some(elem),
                Some(State::Node(node)) => self.0.push_back(node.iter_mut()),
                None => {
                    self.0.pop_back()?;
                }
            }
        }
    }
}
```

これらはすべて完全に安全で、安定版の Rust で動作します！これは結局、先ほど見た単純な構造体のケースから導かれます。Rust は、可変参照を内部のフィールドへの参照に安全に分割できると理解しているのです。そのうえで、`Option` を介して（スライスの場合は空のスライスで置き換えて）、参照を恒久的に消費することを表現できます。
