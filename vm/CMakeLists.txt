if(WIN32)
    add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/source-charset:utf-8>")
    add_compile_options("$<$<C_COMPILER_ID:MSVC>:/source-charset:utf-8>")
endif()
SET(projectName ty)
project(${projectName})
file(GLOB HPP_LIST "./hpp/*.hpp")#把文件名放入全局变量中
file(GLOB SRC_LIST "./cpp/*.cpp") #把文件名放入全局变量中
# include_directories("hpp") #暂时没有使用的必要
source_group("Sources" FILES ${SRC_LIST})#给ide使用的分组
source_group("Headers" FILES ${HPP_LIST})
source_group("Main" "main.cpp")
ADD_EXECUTABLE(${projectName} ${SRC_LIST} "main.cpp")