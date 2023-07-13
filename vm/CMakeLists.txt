if(WIN32)
    add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/source-charset:utf-8>")
    add_compile_options("$<$<C_COMPILER_ID:MSVC>:/source-charset:utf-8>")
endif()

SET(projectName ty)
project(${projectName}) #指定项目名为projectName

SET(Libffi_HOME "C:/vcpkg/packages/libffi_x64-windows-static") #设置libffi的目录

file(GLOB HPP_LIST "./hpp/*.hpp")#把文件名放入全局变量中
file(GLOB SRC_LIST "./cpp/*.cpp") #把文件名放入全局变量中

source_group("Sources" FILES ${SRC_LIST})#给ide使用的分组
source_group("Headers" FILES ${HPP_LIST})
source_group("Main" "main.cpp")

include_directories("${Libffi_HOME}/include") #libffi的头文件位置

add_executable(${projectName} ${SRC_LIST} "main.cpp") #增加可执行文件输出

target_link_libraries(${projectName} "${Libffi_HOME}/lib/libffi.lib") #把libffi.lib添加到连接器