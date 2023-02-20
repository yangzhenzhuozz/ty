#ifndef _BRIDGE
#define _BRIDGE
#include "cstdint"
enum typeItemDesc : uint64_t
{
    PlaintObj = 0,
    Array,
    Function
};
struct TypeItem
{
    typeItemDesc desc; //这个类型是数组、函数还是普通对象
    uint64_t innerType;     //对于array是数组元素类型在TypeTable中的位置，对于plainObj是classTable的类型，对于function则表示函数签名对应的类型(即在typeTable中的位置)
    uint64_t name;
};

struct HeapItem
{
    union SizeOrLength {
        uint64_t size;//对于plainObj是size
        uint64_t length;//对于数组是length
    } sol;
    TypeItem typeDesc;
    uint64_t realTypeName;
    uint64_t gcMark;//gcMark标记
    uint64_t wrapClassName;//用于函数类型
    uint64_t text;//用于函数类型
    char data[0];//0长数组sizeof不占用空间(代码中用到了这个特性),对于函数对象，这个obj的内容是包裹类
};
typedef int8_t tbyte;
typedef int16_t tshort;
typedef int32_t tint;
typedef int64_t tlong;
typedef double tdouble;
typedef int64_t tpointer;
#endif // !_BRIDGE
