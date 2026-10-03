<a id="leaking"></a>

# リーク

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

所有権に基づくリソース管理は、組み合わせを単純にすることを意図しています。オブジェクトを作成するときにリソースを獲得し、破棄されるときにリソースを解放します。破棄は自動で処理されるため、リソースの解放を忘れることはなく、しかもできるだけ早く行われます！ きっとこれは完璧で、すべての問題が解決するはずです。

すべてがひどいことになり、新しく風変わりな問題を解決しなければならなくなります。

多くの人は、Rust がリソースリークを排除すると信じたがります。実際上は、これは基本的に正しいです。安全な Rust のプログラムが制御不能な形でリソースをリークするのを見れば、驚くでしょう。

しかし、理論的な観点では、どのように見てもこれはまったく正しくありません。最も厳密な意味では、「リーク」はあまりに抽象的で、防ぐことはできません。プログラムの開始時にコレクションを初期化し、デストラクタを持つ大量のオブジェクトで埋め、そのコレクションを一度も参照しない無限イベントループに入ることは、ごく簡単です。コレクションは無駄に居座り、プログラムが終了するまで貴重なリソースを保持し続けます（終了時には、いずれにせよそれらのリソースはすべて OS が回収するでしょう）。

もっと限定された形のリークを考えることもできます。到達不能な値をドロップし損ねることです。Rust はこれも防ぎません。実際、Rust には*これを行う関数があります*。`mem::forget` です。この関数は渡された値を消費し、*その後、そのデストラクタを実行しません*。

以前、`mem::forget` は、その使用に対する一種のリントとして unsafe とされていました。デストラクタを呼ばないのは、一般に行儀のよいことではないからです（ただし、特殊なアンセーフコードでは役立ちます）。しかし、この立場は維持できないと広く判断されました。安全なコードにも、デストラクタを呼ばない方法がたくさんあるからです。最も有名な例は、内部可変性を使って参照カウント方式のポインタの循環を作ることです。

安全なコードがデストラクタのリークは起こらないと仮定するのは妥当です。デストラクタをリークするプログラムは、おそらくどれも間違っているからです。しかし、*アンセーフ*コードは、安全性を保つためにデストラクタの実行を当てにすることはできません。ほとんどの型ではこれは問題になりません。デストラクタをリークすれば、その型は定義上アクセス不能なので、問題ないでしょう？ たとえば `Box<u8>` をリークすると、多少のメモリは無駄になりますが、メモリ安全性を侵害することはまずありません。

しかし、デストラクタのリークに注意しなければならないのは、*プロキシ*型です。これらは別のオブジェクトへのアクセスを管理しますが、実際にはそれを所有しない型です。プロキシオブジェクトはかなりまれです。注意を払う必要のあるプロキシオブジェクトはさらにまれです。それでも、ここでは標準ライブラリの3つの興味深い例に注目します。

* `vec::Drain`
* `Rc`
* `thread::scoped::JoinGuard`

## Drain

`drain` は、コンテナを消費せずに、コンテナからデータをムーブして取り出すコレクションの API です。これにより、`Vec` の内容すべての所有権を獲得した後も、そのアロケーションを再利用できます。これは Vec の内容を値で返すイテレータ（Drain）を生成します。

ここで、イテレーションの途中にある Drain を考えましょう。一部の値はムーブして取り出されていますが、ほかはまだです。つまり、Vec の一部は今や論理的に未初期化のデータで埋まっています！ 値を取り除くたびに Vec 内のすべての要素を前に詰めることもできますが、これは性能にかなり壊滅的な影響を与えるでしょう。

その代わりに、Drain がドロップされるときに Vec の背後のストレージを修復するようにしたいところです。自身を最後まで実行し、取り除かれなかった要素をすべて前に詰め（drain は部分範囲をサポートします）、その後 Vec の `len` を修正すべきです。巻き戻しに対しても安全です！ 簡単です！

では、次の例を考えましょう。

<!-- ignore: simplified code -->
```rust,ignore
let mut vec = vec![Box::new(0); 4];

{
    // start draining, vec can no longer be accessed
    let mut drainer = vec.drain(..);

    // pull out two elements and immediately drop them
    drainer.next();
    drainer.next();

    // get rid of drainer, but don't call its destructor
    mem::forget(drainer);
}

// Oops, vec[0] was dropped, we're reading a pointer into free'd memory!
println!("{}", vec[0]);
```

これは明らかに良くありません。残念ながら、板挟みのような状態です。各ステップで整合した状態を維持するには莫大なコストがかかります（そして API の利点をすべて打ち消してしまうでしょう）。整合した状態を維持しなければ、安全なコードで未定義動作が起こります（API が不健全になります）。

では、何ができるでしょうか？ 自明に整合した状態を選べます。イテレーションの開始時に Vec の len を 0 にし、必要ならデストラクタ内で修正します。こうすれば、すべてが通常どおり実行された場合、最小限のオーバーヘッドで望む挙動を得られます。しかし、誰かが*大胆にも*イテレーションの途中でこちらを mem::forget した場合、それは*さらに多くをリークする*だけです（そして Vec を予想外ではあるものの、それ以外は整合した状態に残す可能性があります）。mem::forget が安全であると認めた以上、これは確実に安全です。リークがさらなるリークを引き起こすことを、*リークの増幅*と呼びます。

## Rc

Rc は興味深い例です。一見したところ、プロキシ値にはまったく見えないからです。結局、指しているデータを管理し、ある値に対するすべての Rc をドロップすれば、その値もドロップされます。Rc のリークは特に危険には思えません。参照カウントを永久に増やしたままにして、データの解放やドロップを妨げますが、それは Box と同じに見えますよね？

いいえ。

単純化した Rc の実装を考えましょう。

<!-- ignore: simplified code -->
```rust,ignore
struct Rc<T> {
    ptr: *mut RcBox<T>,
}

struct RcBox<T> {
    data: T,
    ref_count: usize,
}

impl<T> Rc<T> {
    fn new(data: T) -> Self {
        unsafe {
            // Wouldn't it be nice if heap::allocate worked like this?
            let ptr = heap::allocate::<RcBox<T>>();
            ptr::write(ptr, RcBox {
                data,
                ref_count: 1,
            });
            Rc { ptr }
        }
    }

    fn clone(&self) -> Self {
        unsafe {
            (*self.ptr).ref_count += 1;
        }
        Rc { ptr: self.ptr }
    }
}

impl<T> Drop for Rc<T> {
    fn drop(&mut self) {
        unsafe {
            (*self.ptr).ref_count -= 1;
            if (*self.ptr).ref_count == 0 {
                // drop the data and then free it
                ptr::read(self.ptr);
                heap::deallocate(self.ptr);
            }
        }
    }
}
```

このコードには暗黙の微妙な仮定があります。メモリ内に `usize::MAX` 個より多くの Rc は存在できないため、`ref_count` は `usize` に収まるというものです。しかし、これ自体が、`ref_count` はメモリ内の Rc の数を正確に反映すると仮定しています。`mem::forget` があれば、それが誤りであることはわかっています。`mem::forget` を使えば `ref_count` をオーバーフローさせ、まだ Rc が存在するのに 0 まで減らせます。すると、内部データの解放後使用があっさり起こせます。だめです、だめです、良くありません。

これは、単に `ref_count` を確認して*何か*をすることで解決できます。標準ライブラリの方針は、単にアボートすることです。プログラムがひどく異常な状態になっているからです。それに、*なんということでしょう*、これは実にばかげたコーナーケースです。

## thread::scoped::JoinGuard

> 注: この API はすでに std から削除されています。詳しくは
> [issue #24292](https://github.com/rust-lang/rust/issues/24292) を参照してください。
>
> この節を残しているのは、std の一部であるかどうかにかかわらず、
> この例が今も重要だと考えているからです。

thread::scoped API は、共有データのどれかがスコープを抜ける前に親がそのスレッドを join することを保証することで、親のスタック上のデータを、そのデータに対する同期なしに参照するスレッドを生成できるようにすることを意図していました。

<!-- ignore: simplified code -->
```rust,ignore
pub fn scoped<'a, F>(f: F) -> JoinGuard<'a>
    where F: FnOnce() + Send + 'a
```

ここで `f` は、もう一方のスレッドが実行するクロージャです。`F: Send + 'a` とは、`'a` の間生存するデータをキャプチャし、そのデータを所有するか、あるいはそのデータが Sync である（したがって `&data` が Send である）ことを意味します。

JoinGuard はライフタイムを持つため、キャプチャしたすべてのデータを、親スレッドで借用されたままにします。これは JoinGuard が、もう一方のスレッドで扱うデータより長く生存できないことを意味します。JoinGuard が*実際に*ドロップされると、親スレッドをブロックし、キャプチャしたデータのどれかが親でスコープを抜ける前に、子が終了することを保証します。

使い方は次のようなものでした。

<!-- ignore: simplified code -->
```rust,ignore
let mut data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
{
    let mut guards = vec![];
    for x in &mut data {
        // Move the mutable reference into the closure, and execute
        // it on a different thread. The closure has a lifetime bound
        // by the lifetime of the mutable reference `x` we store in it.
        // The guard that is returned is in turn assigned the lifetime
        // of the closure, so it also mutably borrows `data` as `x` did.
        // This means we cannot access `data` until the guard goes away.
        let guard = thread::scoped(move || {
            *x *= 2;
        });
        // store the thread's guard for later
        guards.push(guard);
    }
    // All guards are dropped here, forcing the threads to join
    // (this thread blocks here until the others terminate).
    // Once the threads join, the borrow expires and the data becomes
    // accessible again in this thread.
}
// data is definitely mutated here.
```

原理的には、これは完全に機能します！ Rust の所有権システムが完璧に保証します！
……安全性を保つためにデストラクタが呼ばれることを当てにしている点を除けば、です。

<!-- ignore: simplified code -->
```rust,ignore
let mut data = Box::new(0);
{
    let guard = thread::scoped(|| {
        // This is at best a data race. At worst, it's also a use-after-free.
        *data += 1;
    });
    // Because the guard is forgotten, expiring the loan without blocking this
    // thread.
    mem::forget(guard);
}
// So the Box is dropped here while the scoped thread may or may not be trying
// to access it.
```

なんということでしょう。ここではデストラクタの実行が API の根幹をなしていたので、この API を破棄して、まったく異なる設計に置き換えなければなりませんでした。
