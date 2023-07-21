# 目录说明
> |目录|内容|编译运行指导|
> |-|-|-|
> |debugger|vm调试器，配合vm启动参数-D使用|client是用vue写的,server是用typescript写的，很容易就跑起来了(现在已经移除了VM的调试功能,但是仍然可以用debugger看生成的字节码)|
> |doc|文档|无|
> |tyc|编译器|查看readme.md|
> |vm|vm|查看readme.md(已经移除，在新的VM仓库下,旧版VM支持和debugger调试字节码，但是调试器不支持多线程，所以已经被移除了)|
---
+ tyc用了自己写的LR(1)分析器(tscc)实现，这个LR(1)文法分析器在TSCC项目里
---
