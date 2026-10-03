<a id="exception-safety"></a>

# 例外安全性

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

プログラムでは巻き戻しを控えめに使うべきですが、パニックする*可能性のある*コードはたくさんあります。None をアンラップしたり、範囲外のインデックスでアクセスしたり、0 で割ったりすると、プログラムはパニックします。デバッグビルドでは、どの算術演算もオーバーフローすればパニックする可能性があります。細心の注意を払い、どのコードを実行するか厳密に制御しない限り、ほぼ何でも巻き戻す可能性があり、それに備える必要があります。

巻き戻しに備えていることは、より広いプログラミングの世界では、しばしば*例外安全性*と呼ばれます。Rust には、考慮すべき例外安全性のレベルが2つあります。

* アンセーフコードでは、メモリ安全性を侵害しない程度の例外安全性を*必ず*備えなければなりません。
  これを*最小限の*例外安全性と呼びます。

* 安全なコードでは、プログラムが正しいことを行う程度の例外安全性を備えるのが*望ましい*です。
  これを*最大限の*例外安全性と呼びます。

Rust の多くの場面と同じく、巻き戻しについても、アンセーフコードは誤った安全なコードに対処する準備が必要です。一時的に不健全な状態を作るコードは、パニックによってその状態が使われないよう注意しなければなりません。一般には、そのような状態が存在する間はパニックしないコードだけが実行されることを保証するか、パニック時に状態を後始末するガードを作ることを意味します。これは、パニック時に見える状態が完全に整合した状態であることを必ずしも意味しません。*安全な*状態であることだけを保証すればよいのです。

ほとんどのアンセーフコードは葉に相当するため、例外安全にするのは比較的簡単です。実行されるコードをすべて制御しており、その大部分はパニックしません。しかし、アンセーフコードが呼び出し側の提供するコードを繰り返し呼び出しながら、一時的に未初期化のデータの配列を扱うことも珍しくありません。そのようなコードは注意を払い、例外安全性を考慮する必要があります。

## Vec::push_all

`Vec::push_all` は、特殊化なしに、スライスによる Vec の拡張を確実に効率よく行うための一時的なハックです。単純な実装を示します。

<!-- ignore: simplified code -->
```rust,ignore
impl<T: Clone> Vec<T> {
    fn push_all(&mut self, to_push: &[T]) {
        self.reserve(to_push.len());
        unsafe {
            let end_ptr = self.as_mut_ptr().add(self.len());

            // can't overflow because we just reserved this
            self.set_len(self.len() + to_push.len());

            for (i, x) in to_push.iter().enumerate() {
                end_ptr.add(i).write(x.clone());
            }
        }
    }
}
```

容量があると確実にわかっている Vec に対する、冗長な容量と `len` の検査を避けるため、`push` を経由しません。ロジックは完全に正しいのですが、コードには微妙な問題があります。例外安全ではないのです！ `set_len`、`add`、`write` はすべて問題ありません。`clone` が、見落としていたパニックの爆弾です。

Clone はまったくこちらの制御下になく、自由にパニックできます。そうなると、この関数は Vec の長さを大きすぎる値に設定したまま早期に終了します。Vec が参照されたりドロップされたりすると、未初期化メモリが読み出されます！

この場合の修正は比較的簡単です。*実際に*クローンした値がドロップされることを保証したければ、ループの各イテレーションで `len` を設定できます。未初期化メモリが観測できないことだけを保証したければ、ループの後で `len` を設定できます。

## BinaryHeap::sift_up

要素をヒープ内で上に移動させるのは、Vec を拡張するより少し複雑です。擬似コードは次のとおりです。

```text
bubble_up(heap, index):
    while index != 0 && heap[index] < heap[parent(index)]:
        heap.swap(index, parent(index))
        index = parent(index)
```

このコードをそのまま Rust に書き換えても問題ありませんが、厄介な性能上の特性があります。`self` の要素が無駄に何度も交換されます。むしろ次のようにしたいところです。

```text
bubble_up(heap, index):
    let elem = heap[index]
    while index != 0 && elem < heap[parent(index)]:
        heap[index] = heap[parent(index)]
        index = parent(index)
    heap[index] = elem
```

このコードは、各要素ができるだけ少ない回数だけコピーされることを保証します（実際、一般には elem を2回コピーする必要があります）。しかし、今度は例外安全性の問題が現れます！ 常に、ある1つの値のコピーが2つ存在します。この関数でパニックすると、何かが二重にドロップされます。残念ながら、コードも完全には制御できません。この比較はユーザー定義なのです！

Vec と違って、ここでの修正はそれほど簡単ではありません。1つの方法は、ユーザー定義コードとアンセーフコードを、別々の2段階に分けることです。

```text
bubble_up(heap, index):
    let end_index = index;
    while end_index != 0 && heap[index] < heap[parent(end_index)]:
        end_index = parent(end_index)

    let elem = heap[index]
    while index != end_index:
        heap[index] = heap[parent(index)]
        index = parent(index)
    heap[index] = elem
```

ユーザー定義コードが破綻しても、もはや問題ありません。まだ実際にはヒープの状態に触れていないからです。ヒープの操作を始めてからは、信頼するデータと関数だけを扱うため、パニックの心配はありません。

この設計には不満があるかもしれません。確かにずるい方法です！ しかも複雑なヒープの走査を*2回*行わなければなりません！ では、覚悟を決めましょう。信頼できないコードとアンセーフコードを*本当に*混ぜてみましょう。

Rust に Java のような `try` と `finally` があれば、次のようにできるでしょう。

```text
bubble_up(heap, index):
    let elem = heap[index]
    try:
        while index != 0 && elem < heap[parent(index)]:
            heap[index] = heap[parent(index)]
            index = parent(index)
    finally:
        heap[index] = elem
```

基本的な考え方は単純です。比較がパニックしたら、取り出してある要素を論理的に未初期化のインデックスの位置に戻して、脱出するだけです。ヒープを観測すると、*整合していない*可能性のあるヒープが見えますが、少なくとも二重ドロップは起こりません！ アルゴリズムが正常に終了するなら、この操作は、いずれにしても最後に行う処理とちょうど一致します。

残念ながら Rust にはそのような構文がないので、自分で作る必要があります！ その方法は、「finally」のロジックを行うデストラクタを持つ別の構造体に、アルゴリズムの状態を格納することです。パニックしてもしなくても、そのデストラクタが実行され、後始末をしてくれます。

<!-- ignore: simplified code -->
```rust,ignore
struct Hole<'a, T: 'a> {
    data: &'a mut [T],
    /// `elt` is always `Some` from new until drop.
    elt: Option<T>,
    pos: usize,
}

impl<'a, T> Hole<'a, T> {
    fn new(data: &'a mut [T], pos: usize) -> Self {
        unsafe {
            let elt = ptr::read(&data[pos]);
            Hole {
                data,
                elt: Some(elt),
                pos,
            }
        }
    }

    fn pos(&self) -> usize { self.pos }

    fn removed(&self) -> &T { self.elt.as_ref().unwrap() }

    fn get(&self, index: usize) -> &T { &self.data[index] }

    unsafe fn move_to(&mut self, index: usize) {
        let index_ptr: *const _ = &self.data[index];
        let hole_ptr = &mut self.data[self.pos];
        ptr::copy_nonoverlapping(index_ptr, hole_ptr, 1);
        self.pos = index;
    }
}

impl<'a, T> Drop for Hole<'a, T> {
    fn drop(&mut self) {
        // fill the hole again
        unsafe {
            let pos = self.pos;
            ptr::write(&mut self.data[pos], self.elt.take().unwrap());
        }
    }
}

impl<T: Ord> BinaryHeap<T> {
    fn sift_up(&mut self, pos: usize) {
        unsafe {
            // Take out the value at `pos` and create a hole.
            let mut hole = Hole::new(&mut self.data, pos);

            while hole.pos() != 0 {
                let parent = parent(hole.pos());
                if hole.removed() <= hole.get(parent) { break }
                hole.move_to(parent);
            }
            // Hole will be unconditionally filled here; panic or not!
        }
    }
}
```
