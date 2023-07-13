# GC
拙劣的实现了mark-sweep算法,效率有点感人，测试了一下，有很大一部分时间都在GC，能跑就行了，不是吗？


# 编译过程
因为自己实现ffi太麻烦了，要考虑不同CPU和编译器的ABI，所以使用了libffi这个库，导致vm项目编译起来略微麻烦,当然如果自己已经搞定libffi的安装，也可以忽略下面教程  
下面教程是windows上使用msvc编译成64位程序，不支持32位程序
1. 安装vcpkg
1. 执行命令:vcpkg install libffi --triplet x64-windows-static 安装libffi
1. 找到libffi目录(vcpkg会把libffi安装到它自己目录的\packages下面),并修改CMakeList.txt中的"SET Libffi_HOME"命令,使其正确指向libffi的根目录
1. 用cmake构建vm项目
1. 双击打开ty.sln