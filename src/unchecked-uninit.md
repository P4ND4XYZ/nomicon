<a id="unchecked-uninitialized-memory"></a>

# チェックされない未初期化メモリ

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

この規則の興味深い例外の1つは、配列を扱う場合です。安全な Rust は配列の部分的な初期化を許しません。配列を初期化するときは、`let x = [val; N]` ですべての値を同じにするか、`let x = [val1, val2, val3]` で各要素を個別に指定できます。残念ながら、特に配列を段階的または動的に初期化する必要がある場合、これはかなり融通が利きません。

アンセーフな Rust は、この問題を扱う強力な道具として [`MaybeUninit`] を提供します。この型は、まだ完全には初期化されていないメモリを扱うために使えます。

`MaybeUninit` を使うと、次のように配列を要素ごとに初期化できます。

```rust
use std::mem::{self, MaybeUninit};

// Size of the array is hard-coded but easy to change (meaning, changing just
// the constant is sufficient). This means we can't use [a, b, c] syntax to
// initialize the array, though, as we would have to keep that in sync
// with `SIZE`!
const SIZE: usize = 10;

let x = {
    // Create an uninitialized array of `MaybeUninit`.
    let mut x = [const { MaybeUninit::uninit() }; SIZE];

    // Dropping a `MaybeUninit` does nothing. Thus using raw pointer
    // assignment instead of `ptr::write` does not cause the old
    // uninitialized value to be dropped.
    // Exception safety is not a concern because Box can't panic
    for i in 0..SIZE {
        x[i] = MaybeUninit::new(Box::new(i as u32));
    }

    // Everything is initialized. Transmute the array to the
    // initialized type.
    unsafe { mem::transmute::<_, [Box<u32>; SIZE]>(x) }
};

println!("{x:?}");
```

このコードは3つの手順で進みます。

1. `MaybeUninit<T>` の配列を作ります。

2. 配列を初期化します。ここで微妙なのは、通常、Rust の型チェッカーが既に初期化済みとみなす値（`x[i]` など）に `=` で代入すると、左辺に格納されていた古い値がドロップされることです。これは大惨事になります。しかし、この場合の左辺の型は `MaybeUninit<Box<u32>>` であり、それをドロップしても何も起こりません！ この `drop` の問題については、以下でもう少し説明します。

3. 最後に、配列の型を変更して `MaybeUninit` を取り除かなければなりません。現在の安定版 Rust では、これには `transmute` が必要です。メモリ上で `MaybeUninit<T>` は `T` と同じ姿をしているので、このトランスミュートは正当です。

    ただし、一般に `Container<MaybeUninit<T>>>` は `Container<T>` と同じ姿では*ない*ことに注意してください！ `Container` が `Option`、`T` が `bool` だと考えてみましょう。`Option<bool>` は `bool` に有効な値が2つしかないことを利用しますが、`Option<MaybeUninit<bool>>` では `bool` が初期化済みである必要がないため、それを利用できません。

    したがって、トランスミュートによって `MaybeUninit` を取り除いてよいかどうかは、`Container` によります。配列では許されます（そしていずれ標準ライブラリも、適切なメソッドを提供することでそれを認めるでしょう）。

途中のループ、特に代入演算子と `drop` の相互作用について、もう少し考えてみる価値があります。次のように書いたとすると、

<!-- ignore: simplified code -->
```rust,ignore
*x[i].as_mut_ptr() = Box::new(i as u32); // WRONG!
```

実際には `Box<u32>` を上書きしてしまい、未初期化データの `drop` につながるため、大きな悲しみと苦痛を招きます。

何らかの理由で `MaybeUninit::new` を使えない場合の正しい代替手段は、[`ptr`] モジュールを使うことです。特に、このモジュールは古い値をドロップせずにメモリ位置へバイトを代入できる3つの関数、[`write`]、[`copy`]、[`copy_nonoverlapping`] を提供します。

* `ptr::write(ptr, val)` は `val` を受け取り、`ptr` が指すアドレスへムーブします。
* `ptr::copy(src, dest, count)` は、`count` 個の T の要素が占めるビットを src から dest へコピーします（C の memmove に相当します。引数の順序が逆であることに注意してください！）。
* `ptr::copy_nonoverlapping(src, dest, count)` は `copy` と同じことをしますが、2つのメモリ範囲が重ならないという仮定のもと、少し高速です（C の memcpy に相当します。引数の順序が逆であることに注意してください！）。

言うまでもなく、これらの関数を誤用すると、深刻な混乱や、まさに未定義動作を引き起こします。これらの関数*自体*の唯一の要件は、読み書きしたい場所がアロケートされ、適切なアラインメントを満たしていることです。しかし、任意のメモリ位置に任意のビットを書き込むことで物事を壊す方法は、ほとんど数え切れません！

`Drop` を実装せず、`Drop` 型も含まない型については、`ptr::write` のような小細工を心配する必要がないことも重要です。Rust は、それらをドロップしようとしないことを知っているためです。上の例はこの性質に依存しています。

しかし、未初期化メモリを扱う際は、このように作った値が完全に初期化される前に Rust がドロップしようとしないか、常に警戒する必要があります。値にデストラクタがあるなら、その変数のスコープを通るすべての制御経路は、終了する前にその値を初期化しなければなりません。
*[コードがパニックする場合も含まれます](unwinding.html)*。`MaybeUninit` は内容を暗黙にドロップしないので、ここで少し役立ちます。ただし、パニック時にこれが実際に意味するのは、まだ初期化されていない部分の二重解放の代わりに、既に初期化された部分のメモリリークが生じるということだけです。

`ptr` のメソッドを使うには、まず初期化したいデータへの*生ポインタ*を取得する必要があることに注意してください。未初期化データへの*参照*を作ることは不正です。そのため、生ポインタの取得には注意が必要です。

* `T` の配列では、`base_ptr: *mut T` に対して `base_ptr.add(idx)` を使い、配列のインデックス `idx` のアドレスを計算できます。これは、メモリ上での配列のレイアウトに依存しています。
* しかし、構造体では一般にレイアウトが分かりません。また、`&mut base_ptr.field` は参照を作ってしまうため使えません。そのため、[生参照][raw_reference]の構文を注意深く使わなければなりません。これなら中間の参照を作らずに、フィールドへの生ポインタを作れます。

```rust
use std::{ptr, mem::MaybeUninit};

struct Demo {
    field: bool,
}

let mut uninit = MaybeUninit::<Demo>::uninit();
// `&uninit.as_mut().field` would create a reference to an uninitialized `bool`,
// and thus be Undefined Behavior!
let f1_ptr = unsafe { &raw mut (*uninit.as_mut_ptr()).field };
unsafe { f1_ptr.write(true); }

let init = unsafe { uninit.assume_init() };
```

最後に1つ注意しておきます。古い Rust コードを読むと、非推奨の `mem::uninitialized` 関数に出会うかもしれません。この関数はかつて、スタック上の未初期化メモリを扱う唯一の方法でしたが、言語の他の部分と適切に統合することは不可能だと分かりました。新しいコードでは常に代わりに `MaybeUninit` を使い、機会があれば古いコードも移行してください。

未初期化メモリの扱いについては、だいたい以上です！ 基本的に、どこでも何も未初期化メモリを渡されるとは想定していません。そのため、それを受け渡すのであれば、必ず*本当に*注意深く行ってください。

[`MaybeUninit`]: ../core/mem/union.MaybeUninit.html
[`ptr`]: ../core/ptr/index.html
[raw_reference]: ../reference/types/pointer.html#r-type.pointer.raw.constructor
[`write`]: ../core/ptr/fn.write.html
[`copy`]: ../std/ptr/fn.copy.html
[`copy_nonoverlapping`]: ../std/ptr/fn.copy_nonoverlapping.html
