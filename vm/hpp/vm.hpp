#ifndef _VM
#define _VM
#include "./environment.hpp"
#include "./ir.hpp"
#include "./stack.hpp"
#include "./stringPool.hpp"
#include "./classTable.hpp"
#include "./stackFrameTable.hpp"
#include "./symbolTable.hpp"
#include "./typeTable.hpp"
#include "./vm.hpp"
#include "./heap.hpp"
#include "./nativeTable.hpp"
#include <stack>
#include <list>
#include <winsock2.h>
#include <ws2tcpip.h>
struct Catch_item
{
    u64 irAddress = 0;
    u64 type = 0;
};
class Catch_point
{
public:
    std::list<Catch_item> type_list;//能捕获的异常类型表
    u64 varBP = 0;
    u64 varSP = 0;
    u64 frameLevel = 0;
    u64 callStackSP = 0;//函数调用栈
};
struct FrameItem
{
    u64 frameSP;//当前栈帧的SP指针(不是varStack的SP)，用于记录已经分配了多少变量(以varStack的BP作为基地址)
    u64 lastBP;//上一帧的BP
    u64 frameIndex;//在frameTable的下标
    u64 isTryBlock;//是否为tryFrame
};
class VM
{
private:
    StringPool& stringPool;
    ClassTable& classTable;
    StackFrameTable& stackFrameTable;
    SymbolTable& symbolTable;
    TypeTable& typeTable;
    IRs& irs;
    NativeTable& nativeTable;

    Stack varStack;
    Stack calculateStack;
    Stack callStack;
    std::list<FrameItem> frameStack;//因为需要遍历，所以用list完成stack的功能
    Stack unwindHandler;//函数
    Stack unwindNumStack;//当前需要回退的数量

    std::stack<Catch_point> catchStack;

    i32 gcCounter = 0;//允许溢出，每次执行gc的时候，计数器+1
    std::list<HeapItem*> heap;//因为要删除中间的对象，所以用list
    u64 pc = 0;
    u64 program = 0;

    int GCcondition;//触发GC的对象数量

    bool VMError = false;

    u64 newArray(u64 elementType, u32* param, u64 levelLen, u64 level);
    void _throw(u64 type);
    void _VMThrowError(u64 type, u64 init, u64 constructor);
    void pop_stack_map(u64 level, bool isThrowPopup);
    void _new(u64 type);
    void _NativeCall(u64 index);
    void gc(bool force = false);
    void GCRootsSearch(std::list<HeapItem*>& GCRoots);//使用广度优先搜索标记对象
    bool mark(std::list<HeapItem*>& GCRoots,HeapItem* pointer);
    void sweep();//清除garbage
    void GCClassFieldAnalyze(std::list<HeapItem*>& GCRoots, u64 dataAddress, u64 classIndex);//分析一个对象，把内部的所有引用类型添加到GCRoots
    void GCArrayAnalyze(std::list<HeapItem*>& GCRoots, u64 dataAddress);//分析一个数组，把内部的所有引用类型添加到GCRoots
public:
    VM(StringPool& stringPool, ClassTable& classTable, StackFrameTable& stackFrameTable, SymbolTable& symbolTable, TypeTable& typeTable, IRs& irs, NativeTable& nativeTable, bool isDebug,int GCcondition);
    void run();
    ~VM();
};
#endif