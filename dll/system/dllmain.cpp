#include <stdio.h>
#include "bridge.hpp"

extern "C" __declspec(dllimport) void main_NativePrintBytesString(tpointer dataAdd);

void system_console_NativePrintBytesString(tpointer dataAdd)
{
    auto pointer = (HeapItem*)(dataAdd - sizeof(HeapItem));
    for (auto i = 0; i < pointer->sol.length; i++)
    {
        putc(pointer->data[i], stdout);
    }
    putc('\n', stdout);
}