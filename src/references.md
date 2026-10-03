<a id="references"></a>

# 参照

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

参照には2種類あります。

* 共有参照: `&`
* 可変参照: `&mut`

参照は次の規則に従います。

* 参照は参照先より長く存続できません。
* 可変参照に別名（エイリアス）を持たせることはできません。

以上です。参照が従うモデルはこれだけです。

もちろん、*別名を持つ*とは何を意味するのか、定義する必要がありそうです。

```text
error[E0425]: cannot find value `aliased` in this scope
 --> <rust.rs>:2:20
  |
2 |     println!("{}", aliased);
  |                    ^^^^^^^ not found in this scope

error: aborting due to previous error
```

残念ながら、Rust はエイリアシングモデルを実際には定義していません。🙀

Rust の開発者が言語の意味論を定めるのを待つ間、次の節ではエイリアシングとは一般に何を指すのか、そしてなぜ重要なのかを説明します。
