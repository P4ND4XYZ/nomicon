<a id="the-perils-of-ownership-based-resource-management-obrm"></a>

# 所有権に基づくリソース管理（OBRM）の危険性

<!-- Japanese translation of rust-lang/nomicon at 5791ca9f5d671328af7a8fe87b42ca90c7211d28; prose modified. See ../README.md for attribution and licenses. -->

OBRM（別名 RAII: Resource Acquisition Is Initialization）は、Rust で頻繁に関わるものです。特に標準ライブラリを使う場合はそうです。

大まかに言うと、このパターンは次のようなものです。リソースを獲得するには、それを管理するオブジェクトを作成します。リソースを解放するには、単にそのオブジェクトを破棄すれば、リソースを後始末してくれます。このパターンで管理する最も一般的な「リソース」は、単に*メモリ*です。`Box`、`Rc`、そして基本的に `std::collections` のすべては、メモリを正しく管理できるようにする便利な仕組みです。これは Rust では特に重要です。メモリ管理を頼れる、全般的に働く GC がないからです。実のところ、それこそが要点です。Rust では制御を重視します。しかし、対象はメモリだけに限りません。スレッド、ファイル、ソケットなど、ほぼすべてのほかのシステムリソースも、この種の API を通して公開されます。
