import { assert } from "./codeGen.js";
import { IR, IRContainer, OPCODE, stackFrameRelocationTable, irAbsoluteAddressRelocationTable, irContainerList, typeRelocationTable, typeTable as irTypeTable } from "./ir.js";
import { TypeUsedSign } from "./lib.js";
import { ProgramScope } from "./scope.js";

(BigInt as any).prototype.toJSON = function () { return this.toString(); }//序列化钩子

class Buffer {
    private buffer: number[] = [];
    public appendInt8(n: number): number {
        let ret = this.buffer.length;
        this.buffer.push(n);
        return ret;
    }
    public appendUInt8(n: number): number {
        let ret = this.buffer.length;
        this.buffer.push(n & 0xff);
        return ret;
    }
    public appendInt64(n: bigint): number {
        let ret = this.buffer.length;
        this.buffer.push(Number((n >> 0n) & 0xffn));
        this.buffer.push(Number((n >> 8n) & 0xffn));
        this.buffer.push(Number((n >> 16n) & 0xffn));
        this.buffer.push(Number((n >> 24n) & 0xffn));
        this.buffer.push(Number((n >> 32n) & 0xffn));
        this.buffer.push(Number((n >> 40n) & 0xffn));
        this.buffer.push(Number((n >> 48n) & 0xffn));
        this.buffer.push(Number((n >> 56n) & 0xffn));
        return ret;
    }
    public appendStringUTF8(str: string): number {
        let ret = this.buffer.length;
        let encoder = new TextEncoder();
        let bytes = encoder.encode(str);
        for (let byte of bytes) {
            this.buffer.push(byte);
        }
        this.buffer.push(0);//写\0
        return ret;
    }
    public setInt64(n: bigint, offset: number) {
        this.buffer[offset + 0] = Number((n >> 0n) & 0xffn);
        this.buffer[offset + 1] = Number((n >> 8n) & 0xffn);
        this.buffer[offset + 2] = Number((n >> 16n) & 0xffn);
        this.buffer[offset + 3] = Number((n >> 24n) & 0xffn);
        this.buffer[offset + 4] = Number((n >> 32n) & 0xffn);
        this.buffer[offset + 5] = Number((n >> 40n) & 0xffn);
        this.buffer[offset + 6] = Number((n >> 48n) & 0xffn);
        this.buffer[offset + 7] = Number((n >> 56n) & 0xffn);
    }
    public toBinary(): ArrayBuffer {
        return Uint8Array.from(this.buffer).buffer;
    }
}
class StringPool {
    private pool: Map<string, number> = new Map();
    public items: string[] = [];
    private index = 0;
    public register(str: string): number {
        if (this.pool.has(str)) {
            return this.pool.get(str)!;
        } else {
            let ret = this.index;
            this.pool.set(str, this.index++);
            this.items.push(str);
            return ret;
        }
    }
    public toBinary() {
        let buffer: Buffer = new Buffer();
        buffer.appendInt64(BigInt(this.pool.size));//写入长度
        for (let i = 0; i < this.pool.size; i++) {
            buffer.appendInt64(0n);//指针暂时置0
        }
        for (let i = 0; i < this.items.length; i++) {
            let stringOffset = buffer.appendStringUTF8(this.items[i]);
            buffer.setInt64(BigInt(stringOffset), (i + 1) * 8);
        }
        return buffer.toBinary();
    }
}
class ClassTable {
    private classNameMap: Map<number, number> | undefined;
    public items: { size: number, name: number, isValueType: boolean, props: { name: number, type: number }[] }[] = [];
    public getClassIndex(className: string): number {
        if (!this.classNameMap) {
            this.classNameMap = new Map();
            for (let i = 0; i < this.items.length; i++) {
                let item = this.items[i];
                this.classNameMap!.set(item.name, i);
            }
        }
        return this.classNameMap!.get(stringPool.register(className))!;
    }
    public toBinary() {
        let buffer = new Buffer();
        buffer.appendInt64(BigInt(this.items.length));//写ClassTable.length
        //预留ClassTable.items
        for (let i = 0; i < this.items.length; i++) {
            buffer.appendInt64(0n);//指针暂时置0
        }
        for (let i = 0; i < this.items.length; i++) {
            let classDesc = this.items[i];
            let classOffset = buffer.appendInt64(BigInt(classDesc.size));//写PropertyDesc的属性
            buffer.setInt64(BigInt(classOffset), (i + 1) * 8);
            buffer.appendInt64(BigInt(classDesc.name));
            buffer.appendInt64(BigInt(classDesc.isValueType));
            buffer.appendInt64(BigInt(classDesc.props.length));
            let propLocs = [] as number[];
            //预留PropertyDesc.items
            for (let j = 0; j < classDesc.props.length; j++) {
                let propLoc = buffer.appendInt64(0n);//指针暂时置0
                propLocs.push(propLoc);
            }
            for (let j = 0; j < classDesc.props.length; j++) {
                let prop = classDesc.props[j];
                let propOffset = buffer.appendInt64(BigInt(prop.name));
                buffer.setInt64(BigInt(propOffset), propLocs[j]);
                buffer.appendInt64(BigInt(prop.type));
            }
        }
        return buffer.toBinary();
    }
}
class StackFrameTable {
    private items: { baseOffset: number, autoUnwinding: number, size: number, isFunctionBlock: boolean, isTryBlock: boolean, props: { name: number, type: number }[] }[] = [];
    public nameMap: Map<string, bigint> = new Map();
    public push(item: { baseOffset: number, autoUnwinding: number, size: number, isFunctionBlock: boolean, isTryBlock: boolean, props: { name: number, type: number }[] }, name: string) {
        this.nameMap.set(name, BigInt(this.items.length));
        this.items.push(item);
    }
    public getItems() {
        return this.items;
    }
    public toBinary() {
        let buffer = new Buffer();
        buffer.appendInt64(BigInt(this.items.length));//写length
        //预留StackFrameTable.items
        for (let i = 0; i < this.items.length; i++) {
            buffer.appendInt64(0n);//指针暂时置0
        }
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            let itemOffset = buffer.appendInt64(BigInt(item.baseOffset));//写StackFrameItem.baseOffset(写item的第一个属性的时候，这个偏移也是item的起始偏移)
            buffer.setInt64(BigInt(itemOffset), (i + 1) * 8);//写baseOffset
            buffer.appendInt64(BigInt(item.autoUnwinding));//写autoUnwinding
            buffer.appendInt64(item.isTryBlock ? 1n : 0n);
            buffer.appendInt64(item.isFunctionBlock ? 1n : 0n);
            buffer.appendInt64(BigInt(item.size));
            buffer.appendInt64(BigInt(item.props.length));//写StackFrameItem.length
            let propItemLocs = [] as number[];
            //预留StackFrameItem.items
            for (let j = 0; j < item.props.length; j++) {
                let propLoc = buffer.appendInt64(0n);//指针暂时置0
                propItemLocs.push(propLoc);
            }
            for (let j = 0; j < item.props.length; j++) {
                let prop = item.props[j];
                let propOffset = buffer.appendInt64(BigInt(prop.name));
                buffer.setInt64(BigInt(propOffset), propItemLocs[j]);
                buffer.appendInt64(BigInt(prop.type));
            }
        }
        return buffer.toBinary();
    }
}
//和ir.ts中的typeTable不同
class TypeTable {
    /**
     * innerType:对于array是数组元素类型在TypeTable中的位置，对于plainObj是classTable的类型，对于function则表示函数签名对应的类型(即在typeTable中的位置)
     */
    public items: { name: number, desc: typeItemDesc, innerType: number }[] = [];
    public toBinary(): ArrayBuffer {
        let buffer = new Buffer();
        for (let item of this.items) {
            buffer.appendInt64(BigInt(item.desc));
            buffer.appendInt64(BigInt(item.innerType));
            buffer.appendInt64(BigInt(item.name));
        }
        return buffer.toBinary();
    }
}
class NativeTalbe {
    private items: { name: string, argList: { size: number, isValueType: boolean }[], retSize: number, resultIsValueType: boolean }[] = [];//argSizeList每一项是参数大小,retSize是返回值大小,resultIsValueType表示返回的值是否交给vm管理
    private cache: Set<string> = new Set();
    public push(item: { name: string, argList: { size: number, isValueType: boolean }[], retSize: number, resultIsValueType: boolean }): number {
        if (this.cache.has(item.name)) {
            throw `重复的native函数${item.name}`;
        } else {
            this.cache.add(item.name);
        }
        let ret = this.items.length;
        this.items.push(item);
        return ret;
    }
    public toString() {
        return JSON.stringify(this.items);
    }
    public toBinary(): ArrayBuffer {
        let buffer = new Buffer();
        for (let item of this.items) {
            buffer.appendInt64(BigInt(stringPool.register(item.name)));
            buffer.appendInt64(BigInt(item.retSize));
            buffer.appendInt64(BigInt(item.resultIsValueType));
            buffer.appendInt64(BigInt(item.argList.length));
            for (let arg of item.argList) {
                buffer.appendInt64(BigInt(arg.size));
                buffer.appendInt64(BigInt(arg.isValueType));
            }
        }
        return buffer.toBinary();
    }
}
export let nativeTable = new NativeTalbe();
function assertion(obj: any, name: string) {
    if (obj == undefined || obj == null) {
        throw `link失败,找不到符号:${name}`;
    }
}
export function link(programScope: ProgramScope) {
    let main = programScope.getProp('main').prop.type?.FunctionType;
    if (main == undefined || Object.keys(main._arguments).length != 0 || TypeUsedSign(main.retType!) != 'void') {
        throw `必须在program域定义一个函数main,类型为: ()=>void (无参,无返回值),后续再考虑有参数和返回值的情况`;
    }

    /**
     * VMExceptionGen的两行指令和VMThrow的一条指令操作码由VM运行时动态更改
     */

    let VMExceptionGen = new IRContainer('@VMExceptionGen', 'begin');//在代码的最前面生成@vmExceptionGen
    IRContainer.setContainer(VMExceptionGen);
    new IR('abs_call', undefined, undefined, undefined);
    new IR('abs_call', undefined, undefined, undefined);
    new IR('ret');

    let vmThrow = new IRContainer('@VMThrow', 'begin');//在代码的最前面生成@VMThrow
    IRContainer.setContainer(vmThrow);
    new IR('clear_VM_Error_flag');
    new IR('store_VM_Error');
    new IR('_throw', undefined, undefined, undefined);

    let unwind = new IRContainer('@unwind', 'begin');//在代码的最前面生成@unwind
    IRContainer.setContainer(unwind);
    let unwind_start = new IR('if_unneed_unwind');
    new IR('pop_unwind');
    new IR('call');
    let unwind_loop = new IR('jmp');
    unwind_loop.operand1 = unwind_start.index - unwind_loop.index;
    let unwind_ret = new IR('ret');
    unwind_start.operand1 = unwind_ret.index - unwind_start.index;

    let start = new IRContainer('@start', 'begin');//在代码的最前面生成@start
    IRContainer.setContainer(start);
    let new_p = new IR('_new', undefined, undefined, undefined);
    typeRelocationTable.push({ t1: '@program', ir: new_p });
    new IR('program_store');
    let call = new IR('abs_call', undefined, undefined, undefined);//初始化@program
    irAbsoluteAddressRelocationTable.push({ sym: '@program_init', ir: call });
    new IR('program_load');
    new IR('p_getfield', programScope.getPropOffset('main'));
    new IR('call');
    new IR('__exit');


    let irTable: Map<string, bigint> = new Map();//用于调试的符号表
    let debugIRS: IR[] = [];//用于调试的ir列条
    let irIndex = 0n;
    //重新计算符号表
    for (let ircontainer of irContainerList) {
        if (irTable.has(ircontainer.name)) {
            throw `符号:${ircontainer.name}重复`;
        }
        irTable.set(ircontainer.name, irIndex);
        irIndex += BigInt(ircontainer.irs.length);
    }
    //push_stack_map重定位
    for (let item of stackFrameRelocationTable) {
        item.ir.operand1 = stackFrameTable.nameMap.get(item.sym);
        assertion(item.ir.operand1, item.sym);
    }
    //修改需要重定位的指令
    for (let item of irAbsoluteAddressRelocationTable) {
        item.ir.operand1 = irTable.get(item.sym);
        assertion(item.ir.operand1, item.sym);
    }
    //类型重定位
    for (let item of typeRelocationTable) {
        if (item.t1) {
            item.ir.operand1 = BigInt(irTypeTable[item.t1].index);
            assertion(item.ir.operand1, item.t1);
        }
        if (item.t2) {
            item.ir.operand2 = BigInt(irTypeTable[item.t2].index);
            assertion(item.ir.operand2, item.t2);
        }
        if (item.t3) {
            item.ir.operand3 = BigInt(irTypeTable[item.t3].index);
            assertion(item.ir.operand3, item.t3);
        }
    }
    //将ir变成二进制
    let irBuffer = new Buffer();

    irBuffer.appendInt64(1021n);//magic number
    irBuffer.appendInt64(irTable.get('@start')!);
    irBuffer.appendInt64(irTable.get('@unwind')!);
    irBuffer.appendInt64(irTable.get('@VMThrow')!);
    irBuffer.appendInt64(irTable.get('@VMExceptionGen')!);

    //vm必备异常
    irBuffer.appendInt64(irTable.get('system.NullPointerException_init')!);
    irBuffer.appendInt64(irTable.get(`@constructor:system.NullPointerException args:() retType:void`)!);
    irBuffer.appendInt64(irTable.get('system.ArithmeticException_init')!);
    irBuffer.appendInt64(irTable.get(`@constructor:system.ArithmeticException args:() retType:void`)!);
    irBuffer.appendInt64(irTable.get('system.CastException_init')!);
    irBuffer.appendInt64(irTable.get(`@constructor:system.CastException args:() retType:void`)!);
    irBuffer.appendInt64(irTable.get('system.ArrayIndexOutOfBoundsException_init')!);
    irBuffer.appendInt64(irTable.get(`@constructor:system.ArrayIndexOutOfBoundsException args:() retType:void`)!);

    for (let ircontainer of irContainerList) {
        for (let ir of ircontainer.irs) {
            if (ir.opCode == 'push_catch_block') {
                let symbolIndex = irTable.get(ircontainer.name);
                assert(ir.operand1 != undefined);
                assert(symbolIndex != undefined);
                ir.operand1 = ir.operand1 + symbolIndex;
            }
            debugIRS.push(ir);
            irBuffer.appendInt64(BigInt(OPCODE[ir.opCode]));
            irBuffer.appendInt64(BigInt(ir.operand1 ?? 0));
            irBuffer.appendInt64(BigInt(ir.operand2 ?? 0));
            irBuffer.appendInt64(BigInt(ir.operand3 ?? 0));
        }
    }
    //指令参照表
    let irTableBuffer = new Buffer();
    for (let item of irTable) {
        irTableBuffer.appendInt64(BigInt(stringPool.register(item[0])));
        irTableBuffer.appendInt64(BigInt(item[1]));
    }
    return { text: irBuffer.toBinary(), irTableBuffer: irTableBuffer.toBinary(), irTable, debugIRS };
}
export enum typeItemDesc {
    PlaintObj = 0,
    Array,
    Function
};
export const stackFrameTable = new StackFrameTable();
export const typeTable = new TypeTable();
export const classTable = new ClassTable();
export const stringPool = new StringPool();