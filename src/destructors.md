<a id="destructors"></a>

# デストラクタ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

言語が*実際に*提供するのは、`Drop` トレイトを通じた本格的な自動デストラクタです。このトレイトは次のメソッドを提供します。

<!-- ignore: function header -->
```rust,ignore
fn drop(&mut self);
```

このメソッドは、型が行っていたことを何らかの方法で終わらせるための時間を与えます。

**`drop` の実行後、Rust は `self` のすべてのフィールドを再帰的にドロップしようとします。**

これは、子をドロップするための「デストラクタの定型コード」を書かずに済む便利な機能です。構造体がドロップされる際に、子をドロップする以外の特別なロジックがなければ、`Drop` をまったく実装する必要がないということです！

**Rust 1.0 では、この挙動を防ぐ安定版の方法はありません。**

`&mut self` を受け取るので、たとえ再帰的な Drop を抑止できても、たとえば self からフィールドをムーブして取り出すことは Rust によって防がれる点に注意してください。ほとんどの型では、これはまったく問題ありません。

たとえば、独自の `Box` 実装では `Drop` を次のように書くかもしれません。

```rust
#![feature(ptr_internals, allocator_api)]

use std::alloc::{Allocator, Global, GlobalAlloc, Layout};
use std::mem;
use std::ptr::{drop_in_place, NonNull, Unique};

struct Box<T>{ ptr: Unique<T> }

impl<T> Drop for Box<T> {
    fn drop(&mut self) {
        unsafe {
            drop_in_place(self.ptr.as_ptr());
            let c: NonNull<T> = self.ptr.into();
            Global.deallocate(c.cast(), Layout::new::<T>())
        }
    }
}
# fn main() {}
```

これは問題なく動作します。Rust が `ptr` フィールドをドロップする際、実際の `Drop` 実装を持たない [Unique] があるだけだからです。同様に、drop を抜けると `ptr` にアクセスできなくなるため、何も `ptr` の解放後使用を起こせません。

しかし、次のコードはうまく動きません。

```rust
#![feature(allocator_api, ptr_internals)]

use std::alloc::{Allocator, Global, GlobalAlloc, Layout};
use std::ptr::{drop_in_place, Unique, NonNull};
use std::mem;

struct Box<T>{ ptr: Unique<T> }

impl<T> Drop for Box<T> {
    fn drop(&mut self) {
        unsafe {
            drop_in_place(self.ptr.as_ptr());
            let c: NonNull<T> = self.ptr.into();
            Global.deallocate(c.cast(), Layout::new::<T>());
        }
    }
}

struct SuperBox<T> { my_box: Box<T> }

impl<T> Drop for SuperBox<T> {
    fn drop(&mut self) {
        unsafe {
            // Hyper-optimized: deallocate the box's contents for it
            // without `drop`ing the contents
            let c: NonNull<T> = self.my_box.ptr.into();
            Global.deallocate(c.cast::<u8>(), Layout::new::<T>());
        }
    }
}
# fn main() {}
```

SuperBox のデストラクタで `box` の ptr をデアロケートした後も、Rust は構わず box 自身に Drop するよう指示するので、解放後使用と二重解放によってすべてが破綻します。

再帰的なドロップの挙動は、Drop を実装しているかどうかにかかわらず、すべての構造体と enum に適用される点に注意してください。したがって、次のようなものは、

```rust
struct Boxy<T> {
    data1: Box<T>,
    data2: Box<T>,
    info: u32,
}
```

自身が Drop を実装していなくても、ドロップ「されるはず」のときには毎回 `data1` と `data2` フィールドのデストラクタが呼ばれます。このような型は、それ自体は Drop でなくても、*Drop を必要とする*と言います。

同様に、

```rust
enum Link {
    Next(Box<Link>),
    None,
}
```

では、インスタンスが Next バリアントを格納している場合に、かつその場合に限って、内部の Box フィールドがドロップされます。

一般にこれは非常にうまく機能します。データレイアウトをリファクタリングする際に、ドロップの追加や削除を気にする必要がないからです。それでも、デストラクタでもっと複雑なことをする必要がある、妥当な用途は確かにたくさんあります。

再帰的なドロップを上書きし、`drop` の間に Self からムーブして取り出せるようにする、古典的で安全な解決策は Option を使うことです。

```rust
#![feature(allocator_api, ptr_internals)]

use std::alloc::{Allocator, GlobalAlloc, Global, Layout};
use std::ptr::{drop_in_place, Unique, NonNull};
use std::mem;

struct Box<T>{ ptr: Unique<T> }

impl<T> Drop for Box<T> {
    fn drop(&mut self) {
        unsafe {
            drop_in_place(self.ptr.as_ptr());
            let c: NonNull<T> = self.ptr.into();
            Global.deallocate(c.cast(), Layout::new::<T>());
        }
    }
}

struct SuperBox<T> { my_box: Option<Box<T>> }

impl<T> Drop for SuperBox<T> {
    fn drop(&mut self) {
        unsafe {
            // Hyper-optimized: deallocate the box's contents for it
            // without `drop`ing the contents. Need to set the `box`
            // field as `None` to prevent Rust from trying to Drop it.
            let my_box = self.my_box.take().unwrap();
            let c: NonNull<T> = my_box.ptr.into();
            Global.deallocate(c.cast(), Layout::new::<T>());
            mem::forget(my_box);
        }
    }
}
# fn main() {}
```

しかし、これはかなり奇妙なセマンティクスです。デストラクタで起こることだけを理由に、常に Some である*べき*フィールドが None である*可能性がある*と言っているからです。もちろん、逆にこれは十分理にかなっています。デストラクタの中では self の任意のメソッドを呼べますが、この仕組みはフィールドを未初期化状態に戻した後にそれを行うことを防ぐはずです。ただし、その中でほかの任意の不正な状態を作り出すことまで防ぐわけではありません。

総合的に見れば、これはまずまずの選択肢です。標準的な選択として使うべき方法であることは確かです。しかし、将来はフィールドを自動的にドロップすべきでないと宣言するための、正式にサポートされた方法が用意されると期待しています。

[Unique]: phantom-data.html
