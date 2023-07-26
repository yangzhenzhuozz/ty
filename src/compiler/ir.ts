/**
 * 本文件存放一些全局使用的对象和变量
 */

import { Program } from "./program.js";

export let irAbsoluteAddressRelocationTable: { sym: string, ir: IR }[] = [];//指令地址重定位表
export let typeRelocationTable: { t1?: string, t2?: string, t3?: string, ir: IR }[] = [];//type重定向表
export let stackFrameRelocationTable: { sym: string, ir: IR }[] = [];//stackFrame重定向表
export let irContainerList: IRContainer[] = [];//符号表
export let stackFrameTable: { [key: string]: { baseOffset: number, size: number, isTryBlock: boolean, isFunctionBlock: boolean, autoUnwinding: number, frame: { name: string, type: TypeUsed }[] } } = {};//栈布局记录
export let typeTable: { [key: string]: { index: number, type: TypeUsed } } = {};//类型表

export const globalVariable = {
    pointSize: 8,//指针大小
    stackFrameMapIndex: 1,//栈帧序号,从1开始，0预留给class_init保存this指针
    functionIndex: 0
}
export let program: Program;
export function setProgram(p: Program) {
    program = p;
}
export function typeTableToBin(): ArrayBuffer {
    let length: BigUint64Array;
    let zero = new Uint8Array(1).fill(0);
    length = new BigUint64Array(1);
    length[0] = BigInt(Object.keys(typeTable).length)
    let table: BigUint64Array = new BigUint64Array(Object.keys(typeTable).length);
    let buffer: Uint8Array[] = [];
    let offset = 8 + table.byteLength;
    let encoder = new TextEncoder()
    let index = 0;
    for (let k in typeTable) {
        table[index] = BigInt(offset);
        let bytes = encoder.encode(k);
        buffer.push(bytes);
        buffer.push(zero);
        offset += bytes.byteLength + 1;
        index++;
    }
    let ret = new Uint8Array(offset);
    let view = new DataView(ret.buffer);
    view.setBigUint64(0, length[0]);
    offset = 8;
    for (let item of table) {
        view.setBigUint64(offset, item);
        offset += 8;
    }
    for (let item of buffer) {
        for (let index = 0; index < item.byteLength; index++) {
            view.setUint8(offset, item[index]);
            offset += 1;
        }
    }
    return ret.buffer;
}
export enum OPCODE {
    _new = 0,//创建一个普通对象
    newFunc,//创建一个函数对象,op1是text,op2是函数类型名字，op3是函数包裹类在typeTable中的类型
    newArray,//op1 数组类型，op2 维度层级(从计算栈中取)
    program_load,//将program指针压入表达式栈
    program_store,//将program从栈存入program指针
    push_stack_map,//压入栈帧布局，同时给这片局部变量空间置0
    pop_stack_map,//弹出栈帧布局
    p_getfield,//从计算栈顶弹出一个指针，以指针作为obj基础地址，读取一个指针成员到计算栈顶
    p_putfield,//从计算栈顶弹出一个指针，接着再弹出一个指针，以指针作为obj的基础地址，把指针写入成员区域
    valueType_getfield,//从计算栈顶弹出一个指针，以指针作为obj基础地址，读取一个valueType成员到计算栈顶
    valueType_putfield,//从计算栈顶弹出一个valueType，接着再弹出一个指针，以指针作为obj的基础地址，把valueType写入成员区域 op1:offset ,op2:size

    /**
     * array相关的,operand1是系数(即每个element的size)
     */
    array_get_element_address,//先从计算栈弹出一个i32作为下标，再从计算栈弹出一个指针,以该指针为基础地址加上i32*element_size压入计算栈,op1是size
    array_get_point,//先从计算栈弹出一个i32作为下标，再从计算栈弹出一个指针，以读取指针的方式读取元素值
    array_get_valueType,//先从计算栈弹出一个i32作为下标，再从计算栈弹出一个指针，以读取valueType的方式读取元素值,op1是值类型的size
    /**
     * arr_set少一个address，见getfield_address和load_address的说明
     */
    array_set_point,//先从计算栈弹出一个指针,再从计算栈弹出一个i32作为下标，再从计算栈弹出一个指针，以设置指针的方式设置元素值，3个操作数都没有意义
    array_set_valueType,//先从计算栈弹出一个value,再从计算栈弹出一个i32作为下标，再从计算栈弹出一个指针，以设置valueType的方式设置元素值,op1是值类型的size

    /**
     * 只有读取需要用到address，设置不需要
     */
    getfield_address,//从计算栈弹出一个指针，加上偏移压入计算栈(获取成员的地址(不是获取成员的值))
    load_address,//读取局部变量区域的基础地址(bp指针),然后加上偏移压入计算栈
    valueType_load,//从局部变量加载一个value到计算栈
    valueType_store,//从计算栈存储到局部变量,op1是offset,op2是size
    init_valueType_store,//从计算栈存储到局部变量(用于初始化局部变量),op1是offset,op2是size,frame自动增长size
    p_load,//从局部变量加载一个指针到计算栈
    p_store,//从计算栈顶弹出一个指针到局部变量
    init_p_store,//从计算栈顶弹出一个指针到局部变量(用于初始化局部变量),frame自动增长size


    const_i8_load,//加载一个立即数(i8)到计算栈
    const_i16_load,//加载一个立即数(i16)到计算栈
    const_i32_load,//加载一个立即数(i32)到计算栈
    const_i64_load,//加载一个立即数(i64)到计算栈
    const_double_load,//加载一个立即数(double)到计算栈


    i8_add,//从计算栈中弹出两个数，结果相加之后压入计算栈
    i8_sub,//....
    i8_mul,//....
    i8_div,//....
    i8_inc,//从计算栈顶弹出一个数，自增后压入
    i8_dec,//从计算栈顶弹出一个数，自减后压入
    i8_mod,
    i8_not,
    i8_xor,
    i8_and,
    i8_or,
    i8_shl,
    i8_shr,
    i8_negative,

    i16_add,//从计算栈中弹出两个数，结果相加之后压入计算栈
    i16_sub,//....
    i16_mul,//....
    i16_div,//....
    i16_inc,//从计算栈顶弹出一个数，自增后压入
    i16_dec,//从计算栈顶弹出一个数，自减后压入
    i16_mod,
    i16_not,
    i16_xor,
    i16_and,
    i16_or,
    i16_shl,
    i16_shr,
    i16_negative,

    i32_add,//从计算栈中弹出两个数，结果相加之后压入计算栈
    i32_sub,//....
    i32_mul,//....
    i32_div,//....
    i32_inc,//从计算栈顶弹出一个数，自增后压入
    i32_dec,//从计算栈顶弹出一个数，自减后压入
    i32_mod,
    i32_not,
    i32_xor,
    i32_and,
    i32_or,
    i32_shl,
    i32_shr,
    i32_negative,

    i64_add,//从计算栈中弹出两个数，结果相加之后压入计算栈
    i64_sub,//....
    i64_mul,//....
    i64_div,//....
    i64_inc,//从计算栈顶弹出一个数，自增后压入
    i64_dec,//从计算栈顶弹出一个数，自减后压入
    i64_mod,
    i64_not,
    i64_xor,
    i64_and,
    i64_or,
    i64_shl,
    i64_shr,
    i64_negative,

    double_add,//从计算栈中弹出两个数，结果相加之后压入计算栈
    double_sub,//....
    double_mul,//....
    double_div,//....
    double_inc,//从计算栈顶弹出一个数，自增后压入
    double_dec,//从计算栈顶弹出一个数，自减后压入
    double_negative,


    i8_if_gt,//大于则跳转
    i8_if_ge,//大于等于则跳转
    i8_if_lt,//小于则跳转
    i8_if_le,//小于等于则跳转
    i8_if_cmp_eq,//相等则跳转
    i8_if_cmp_ne,//不相等则跳转

    i16_if_gt,//大于则跳转
    i16_if_ge,//大于等于则跳转
    i16_if_lt,//小于则跳转
    i16_if_le,//小于等于则跳转
    i16_if_cmp_eq,//相等则跳转
    i16_if_cmp_ne,//不相等则跳转

    i32_if_gt,//大于则跳转
    i32_if_ge,//大于等于则跳转
    i32_if_lt,//小于则跳转
    i32_if_le,//小于等于则跳转
    i32_if_cmp_eq,//相等则跳转
    i32_if_cmp_ne,//不相等则跳转

    i64_if_gt,//大于则跳转
    i64_if_ge,//大于等于则跳转
    i64_if_lt,//小于则跳转
    i64_if_le,//小于等于则跳转
    i64_if_cmp_eq,//相等则跳转
    i64_if_cmp_ne,//不相等则跳转

    double_if_gt,//大于则跳转
    double_if_ge,//大于等于则跳转
    double_if_lt,//小于则跳转
    double_if_le,//小于等于则跳转
    double_if_cmp_eq,//相等则跳转
    double_if_cmp_ne,//不相等则跳转

    i8_if_true,//为true则跳转
    i8_if_false,//为false则跳转

    castCheck,//类型转换检查,如果非法则抛出异常

    push_catch_block,//在计算栈中压入异常处理模块,op1是代码地址,op2是类型
    save_catch_point,//保存异常处理点
    clear_calculate_stack,//清空计算栈
    _throw,//抛出异常
    clear_VM_Error_flag,//清理VM自身的错误标记
    store_VM_Error,//从计算栈中弹出一个指针(VM的所有异常都是引用类型)，然后清理栈，再把指针移入计算栈

    /**
     * b byte
     * s short
     * i int
     * l long
     * d double
     */
    b2s,//byte to short
    b2i,
    b2l,
    b2d,

    s2b,
    s2i,
    s2l,
    s2d,

    i2b,
    i2s,
    i2l,
    i2d,

    l2b,
    l2s,
    l2i,
    l2d,

    d2b,
    d2s,
    d2i,
    d2l,

    box,//装箱
    unbox,//拆箱

    instanceof,

    push_unwind,//压入unwind函数
    pop_unwind,//弹出unwind函数到计算栈
    if_unneed_unwind,//是否还需要unwind

    jmp,//相对跳转
    p_dup,//栈复制
    call,//以栈顶为目标，进行调用，这里不会消费计算栈
    abs_call,//call一个绝对地址
    ret,//ret
    valueType_pop,//从计算栈中弹出valueType
    p_pop,//从计算栈中弹出指针
    __exit,//退出
    alloc,//申请局部变量空间(只有初始化值类型的局部变量时用到,frame自动增长size,在这条指令之后一定有p_pop，表示这个值类型已经init完毕，可以进行GC)
    alloc_pointer,//frame自动增长8,一个指针的长度
    access_array_length,//读取数组的length
    native_call,//调用native函数
};
export let nowIRContainer: IRContainer;
export class IRContainer {
    public irs: IR[] = [];
    public name: string;
    constructor(name: string, push_direct: 'begin' | 'end' = 'end') {
        this.name = name;
        if (push_direct == 'begin') {
            irContainerList.unshift(this);
        } else {
            irContainerList.push(this);
        }
    }
    public static setContainer(container: IRContainer) {
        nowIRContainer = container;
    }
    public static getContainer() {
        return nowIRContainer;
    }
    public toBinary(): ArrayBuffer {
        let bin = new BigUint64Array(4 * this.irs.length);//每条指令32字节(是不是太浪费了，单字节指令也用这么多内存，太奢侈了)
        for (let i = 0; i < this.irs.length; i++) {
            let ir = this.irs[i];
            bin[i * 4 + 0] = BigInt(OPCODE[ir.opCode]);
            bin[i * 4 + 1] = ir.operand1 != undefined ? BigInt(ir.operand1) : BigInt(0);
            bin[i * 4 + 2] = ir.operand2 != undefined ? BigInt(ir.operand2) : BigInt(0);
            bin[i * 4 + 3] = ir.operand3 != undefined ? BigInt(ir.operand3) : BigInt(0);
        }
        return bin.buffer;
    }
}
export class IR {
    public index: bigint = BigInt(nowIRContainer.irs.length);
    public opCode: keyof typeof OPCODE;
    public operand1?: bigint;
    public operand2?: bigint;
    public operand3?: bigint;
    public length: bigint;
    constructor(opCode: keyof typeof OPCODE, operand1?: number | bigint, operand2?: number | bigint, operand3?: number | bigint/*, tag1?: string, tag2?: string, tag3?: string*/) {
        this.opCode = opCode;
        this.operand1 = operand1 != undefined ? BigInt(operand1) : 0n;
        this.operand2 = operand2 != undefined ? BigInt(operand2) : 0n;
        this.operand3 = operand3 != undefined ? BigInt(operand3) : 0n;
        this.length = 1n;
        nowIRContainer.irs.push(this);
    }
}
export let tmp = {};