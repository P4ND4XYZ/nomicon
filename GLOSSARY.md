# 用語集

対訳表は [`Translation Guide`](TRANSLATION_GUIDE.md) に記載した固定コミットを参照します。Rust の構文・API 識別子は翻訳せず、本文中の一般用語は以下に統一します。

| English | 日本語 | 用法・判断 |
| --- | --- | --- |
| safe | 安全 | 対訳表に従います。 |
| soundness | 健全性 | 安全なクライアントが未定義動作を起こせない性質。`safety`／「安全」と区別します。 |
| sound / unsound | 健全な／不健全な | 抽象化や実装の性質です。`safe`／`unsafe` と同一視しません。 |
| invariant | 不変条件 | 型・データ構造が常に保つべき条件です。 |
| contract | 契約 | アンセーフな操作・API が要求または保証する条件を指します。 |
| privacy | 非公開性 | モジュール境界におけるアクセス制御を指します。 |
| marker trait | マーカートレイト | API を持たず、性質を示すトレイトです。 |
| ergonomic | 扱いやすい／エルゴノミック | 人間工学的な使いやすさを指します。 |
| safety / (un)safety | 安全性／アンセーフ性 | `(un)safety` の対比が必要な箇所では、両方の概念を省かずに示します。 |
| unsafe | アンセーフ | 概念を表す本文で使用します。`unsafe` キーワードや識別子は原文のままです。「危険」と混用しません。 |
| Undefined Behavior (UB) | 未定義動作 | `Undefined Behavior` の大文字・小文字は原文に従います。 |
| aliasing | エイリアシング | メモリ領域の重なりを指す概念です。 |
| alias analysis | エイリアス解析 | コンパイラの解析を指します。`aliasing` と区別します。 |
| pointer aliasing rules | ポインタのエイリアシング規則 | リンク文言にも使用します。 |
| liveness | 生存性 | 解析上の値・アクセスの生存性です。Rust の `lifetime` と区別します。 |
| lifetime | ライフタイム | Rust の型・借用におけるライフタイムです。 |
| variance | 変性 | 型の variance を指します。 |
| covariant | 共変 | variance の具体的な性質です。 |
| ownership | 所有権 | 対訳表に従います。 |
| allocation | アロケーション | メモリ領域・割り当てを指します。動詞 `allocate` は「アロケートする」。 |
| deallocate | デアロケートする | メモリの解放を指します。 |
| raw pointer | 生ポインタ | 対訳表に従います。 |
| type punning | 型パンニング | 初出では「型パンニング（型の再解釈）」と補います。 |
| reference | 参照 | Rust の `&T`／`&mut T` を指します。 |
| dereference / dereferencing | 参照外し | ポインタを参照外しする、のように用います。 |
| uninitialized memory | 未初期化メモリ | 初期化済みの値と区別します。 |
| initialized | 初期化済み | `initialized elements` は「初期化済みの要素」。 |
| dangling | ダングリング | ポインタ・参照の性質を指します。 |
| unaligned | アラインメントを満たさない | ポインタが必要なアラインメントを満たさない場合に用います。 |
| data race | データ競合 | `race condition` と区別します。 |
| race condition | 競合状態 | データ競合と同一視しません。 |
| atomic | アトミック | 対訳表に従います。 |
| unwinding | unwind / 巻き戻し | Rust の用語 `unwind` は ABI など識別子を含む文脈では原語も残し、一般説明では「巻き戻し」を用います。 |
| layout | レイアウト | 型・データの配置を指します。 |
| alignment | アラインメント | 型や値を配置できるアドレスの制約です。 |
| padding | パディング | アラインメントやサイズ要件を満たすための余白です。 |
| product type | 直積型 | フィールドを組み合わせた型を指します。 |
| sum type | 直和型 | バリアントの選択で表す型を指します。 |
| fieldless enum | フィールドレス enum | 関連データを持たないバリアントだけからなる enum です。 |
| monomorphization | 単相化 | ジェネリックな型・関数を具体的な型引数に対して生成することです。 |
| discriminant | 判別子 | enum のバリアントを識別する値です。 |
| null pointer optimization | ヌルポインタ最適化 | ヌルにならないポインタ型を利用した enum レイアウト最適化です。 |
| non-nullable | ヌルにならない | ポインタが null にならない性質を指します。 |
| dynamically sized type (DST) | 動的サイズ型（DST） | サイズがコンパイル時に決まらない型です。 |
| zero-sized type (ZST) | サイズ0の型（ZST） | サイズが0の型です。 |
| empty type | 空型 | 値を1つも持たず、インスタンス化できない型です。 |
| wide pointer | ワイドポインタ | DST のメタデータを伴うポインタです。 |
| pointee | ポインタの指示先 | ポインタが指す値・型を指します。 |
| trait object | トレイトオブジェクト | `dyn Trait` の形で使う型消去された値です。 |
| unsizing coercion | アンサイズ化強制変換 | サイズ付き型から DST への coercion です。 |
| no-op | no-op（何もしない操作） | 実行しても効果のない操作です。 |
| extern type | extern 型 | 外部で定義されるサイズ不明の型です。 |
| irrefutable pattern | 反駁不能パターン | 常にマッチするパターンです。 |
| tagged union | タグ付き共用体 | タグでバリアントを識別する共用体です。 |
| FFI-safe | FFI 安全 | FFI 境界で安全に受け渡せる性質です。 |
| cache line | キャッシュライン | キャッシュが一度に扱うメモリ領域です。 |
| public ABI | 公開 ABI | 他クレートとの互換性に関わる型の ABI です。 |
| natural alignment | 自然なアラインメント | 型が通常要求するアラインメントです。 |
| vector / Vec | ベクタ / `Vec` | 一般名は「ベクタ」、Rust の型名は `Vec` のままです。 |

## 表記上の注意

- `Send`、`Sync`、`NonNull`、`UnsafeCell`、`Box`、`Vec`、`Trait` などは識別子として維持します。
- `call ABI`、`unwind ABI`、`target feature` など、識別子か一般用語かが文脈で異なる表現は、誤読を避けるため原語を残します。
- 章を進める中で新しい用語判断が生じた場合は、理由や区別も含めてここに追加します。
