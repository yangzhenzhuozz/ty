# 目录说明
> |目录|内容|编译运行指导|
> |-|-|-|
> |debugger|vm调试器，配合vm启动参数-D使用|client是用vue写的,server是用typescript写的，很容易就跑起来了|
> |dll|外部函数库，实现了main.NativePrintBytesString|一个vs项目，打开sln就可以了|
> |doc|文档|无|
> |tyc|编译器|查看readme.md|
> |vm|vm|查看readme.md|
---
+ tyc用了自己写的LR(1)分析器实现，这个LR(1)文法分析器在TSCC项目里
+ tyc和vm分别是编译器和vm，dll实现了printf，这三个目录的内容是必备的
+ debugger不是程序运行必备软件
---
