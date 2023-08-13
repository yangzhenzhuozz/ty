import fs from 'fs';
import { irAbsoluteAddressRelocationTable, stackFrameTable, stackFrameRelocationTable, typeRelocationTable, tmp, typeTable, nowIRContainer, OPCODE, globalVariable, program } from './ir.js';
import { Scope, BlockScope, ClassScope, ProgramScope, setScopeSpaceName, getScopeSpaceName } from './scope.js';
import { IR, IRContainer } from './ir.js'
import { FunctionSign, FunctionSignWithArgumentAndRetType, TypeUsedSign } from './lib.js';
import { classTable, stringPool, typeItemDesc, typeTable as binTypeTable, stackFrameTable as binStackFrameTable, link, nativeTable } from './binaryTools.js'
import { registerType } from './semanticCheck.js';

export function assert(condition: any): asserts condition {
    if (!condition) {
        throw `断言失败`;
    }
}
/**
 * 经过几轮扫描，有一些步骤是重复的，为了能清晰掌握每个步骤的顺序(其实就是在设计前一步的时候不知道后面应该怎么做，要做什么，想起来已经晚了)，先将就用着吧
 */
let programScope: ProgramScope;
/**
 * 
 * @param list 
 * @param target 
 * @param offset 补偿，默认为0
 */
function backPatch(list: IR[], targetIndex: bigint) {
    for (let ir of list) {
        ir.operand1 = targetIndex - ir.index;
    }
}
function merge(a: IR[], b: IR[]) {
    return a.concat(b);
}
/**
 * 判断类型是否为指针类型
 * @param type 
 * @returns 
 */
export function isPointType(type: TypeUsed): boolean {
    if (type.PlainType?.name) {
        if (type.PlainType!.name == '@null') {
            return true;
        } else if (program.getDefinedType(type.PlainType!.name).modifier == 'valuetype') {
            return false;
        } else {
            return true;
        }
    } else {
        return true;
    }
}
/**
 * 有的参数需要向下传递，但是不是每个nodeRecursion都必须要传
 * 比如label是给ret、break、continue使用的，但是accessField节点的子节点不可能是这三个指令
 * 所以accessField可以不向下传递label参数
 * 
 * functionWrapName用于accessField的子节点，所以凡是子节点有可能是accessField的，都需要向下传递
 * @param scope 
 * @param node 
 * @param option 
 * @returns 
 */
function nodeRecursion(scope: Scope, node: ASTNode, option: {
    label: undefined | { name: string, frameLevel: number, breakIRs: IR[], continueIRs: IR[] }[],//for while的label,jmpIRs:break或者continue的列表，需要向下传递
    frameLevel: undefined | number,//给ret、break、continue提供popup_stackFrame参数，需要向下传递,并且遇到新block的时候要+1
    isGetAddress: undefined | boolean,//是否读取地址,比如 class test{ valueType v},如果需要访问值类型v，则需要获取地址，只有accessField的子节点取true，影响accessField和load节点
    /**
     * 因为机器码的if指令如果命中则跳转，不命中则执行下一条指令，所以要想实现分支就要利用这个特性,
     * bool反向的时候，jmp目标是falseIR，所以下一条应该是trueIR，不反向的时候，目标是trueIR，所以下一条指令是falseIR
     * 因为&&指令流如下:
     *      trueIR
     *      jmp
     *      false
     * 
     * ||指令流如下:
     *      false
     *      jmp
     *      true
     * 
     * do_while指令流如下:
     * loop_body_start
     * xxxx
     * loop_body_end
     * if_指令为真 loop_body_start
     * other_ir
     * 
     * 所以目前只有下面两种情况取true
     * 1.||的直接左子节点条件跳转指令是正常生成的true，其他都是false
     * 2.do_while的condition指令
     */
    boolForward: undefined | boolean,
    isAssignment: undefined | boolean,//是否是对某个成员或者局部变量赋值，在处理=的时候有用到,如果是左值节点，则load、getField、[]不生成真实指令，默认false，只有=左子节点取true
    singleLevelThis: undefined | boolean, //是否为普通函数(影响block内部对this的取值方式)，需要向下传递,用于calss的init和construct
    inContructorRet: undefined | boolean,//是否处于构造函数中，影响Ret指令的生成
    functionWrapName: string,//函数包裹类的名字，给loadFunctionWrap节点提取函数包裹类名字，从functionObjGen向下传递,只有immediate在创建函数的时候可能需要读取本scope的内容，所以也要传递
}): {
    startIR: IR, endIR: IR, truelist: IR[], falselist: IR[], jmpToFunctionEnd?: IR[],
    isRightValueTypeVariable?: boolean,//是否为右值值类型,在某些地方使用右值值类型的时候需要装箱(accessField或者callEXM)
    virtualIR?: {
        opCode: keyof typeof OPCODE,
        operand1?: number,
        operand2?: number,
        operand3?: number,
    }
} {
    if (node['_program'] != undefined) {
        let ir = new IR('program_load');
        return { startIR: ir, endIR: ir, truelist: [], falselist: [] };
    }
    else if (node['accessField'] != undefined) {
        let irs = nodeRecursion(scope, node['accessField']!.obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: true,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option?.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        //访问一个值类型右值的成员时
        if (!isPointType(node['accessField'].obj.type!) && irs.isRightValueTypeVariable) {
            /**
             * 为什么要装箱？
             * valueType class MyClass{
             *    var i=10;
             *    function a(){
             *         return b;
             *    };
             *    function b(){
             *         if(xxx)
             *              return c;
             *         else
             *              return 其他非成员函数
             *    }
             *    function c(){
             *        printI32(i);
             *    }
             * }
             * function gen(){
             *    var ret:MyClass;
             *    return ;
             * }
             * gen().a()()();
             * 如果不装箱的话，需要在栈中取地址,还要分析这个右值什么时候被使用完毕
             * 因为成员函数持有自己这个对象，也就是经过一系列的分析，可以在某种情况下避免装箱
             * (成员函数没有逃逸出去，比如上面的代码经过静态检查，在调用b时不可能命中xxx，则整个右值对象的持有就结束了，但是这个是我这种水平该考虑的事??)
             * 需要从栈中取地址，实现起来更麻烦
             * 
             */
            let box = new IR('box');
            //装箱的情况下，一定是一个PlainType
            typeRelocationTable.push({ t1: node['accessField'].obj.type!.PlainType!.name, ir: box });
        }
        let objType = node['accessField']!.obj.type!;
        if (objType.ArrayType != undefined) {
            if (node['accessField'].field != 'length') {
                //这里不会命中，在阶段二进行类型检查的时候已经处理了
                throw `数组只有length属性可访问`;
            } else {
                let ir = new IR('access_array_length');
                return { startIR: irs.startIR, endIR: ir, truelist: [], falselist: [] };
            }
        } else {
            let baseScope: Scope;
            if (objType.ProgramType != undefined) {
                baseScope = programScope;
            } else if (objType.PlainType != undefined) {
                baseScope = programScope.getClassScope(objType.PlainType.name);
            } else {
                //此处条件不可能命中
                throw `其他类型暂时不能访问成员`;//还有啥其他类型?先抛个异常再说
            }
            let offset = baseScope.getPropOffset(node['accessField']!.field);
            let size = baseScope.getPropSize(node['accessField']!.field);
            let accessFieldType = baseScope.getProp(node['accessField']!.field).prop.type!;
            let ir: IR;
            let virtualIR: {
                opCode: keyof typeof OPCODE,
                operand1?: number,
                operand2?: number,
                operand3?: number,
            } | undefined;
            if (!option.isAssignment) {
                if (isPointType(accessFieldType)) {
                    ir = new IR('p_getfield', offset);
                } else {
                    if (option.isGetAddress) {
                        ir = new IR('getfield_address', offset);//读取成员地址
                    } else {
                        ir = new IR('valueType_getfield', offset, size);//读取成员
                    }
                }
            } else {
                if (isPointType(accessFieldType)) {
                    virtualIR = { opCode: 'p_putfield', operand1: offset };
                } else {
                    if (option.isGetAddress) {
                        /**
                         * var m:valType;
                         * m.a.b; //且a是值类型
                         * 这里的 .a就是isGetAddress,因为getField(m.a).b 和 a 是值类型决定了isGetAddress=true
                         * 而
                         * var m:valType;
                         * m.a=10; //且a是值类型
                         * 这里并不是对a的属性进行访问，所以这个条件永远不可到达
                         */
                        //先抛个异常，万一真的命中条件方便定位
                        throw `这里是不可能到达的`;
                    } else {
                        virtualIR = { opCode: 'valueType_putfield', operand1: offset, operand2: size };//设置成员
                    }
                }
                ir = irs.endIR;
            }
            return { startIR: irs.startIR, endIR: ir, truelist: [], falselist: [], virtualIR };
        }
    }
    else if (node['immediate'] != undefined) {
        if (node['immediate'].functionValue) {
            let functionScope = new BlockScope(scope, node['immediate'].functionValue, node['immediate'].functionValue.body!, { program });
            let fun = functionObjGen(functionScope, node['immediate'].functionValue);
            let functionWrapScpoe = programScope.getClassScope(fun.wrapClassName);
            let startIR = new IR('newFunc', undefined, undefined, undefined);
            let endIR: IR | undefined;
            irAbsoluteAddressRelocationTable.push({ sym: fun.text, ir: startIR });
            typeRelocationTable.push({ t2: fun.realTypeName, t3: fun.wrapClassName, ir: startIR });
            //判断当前否处于class中
            if (functionScope.classScope != undefined) {
                //如果是在class中定义的函数，设置this
                new IR('p_dup');//复制函数对象
                nodeRecursion(scope, { desc: 'ASTNode', _this: '' }, {
                    label: undefined,
                    frameLevel: undefined,
                    isGetAddress: undefined,
                    boolForward: undefined,
                    isAssignment: undefined,
                    singleLevelThis: option.singleLevelThis,
                    inContructorRet: undefined,
                    functionWrapName: option.functionWrapName
                });//读取this指针
                endIR = new IR('p_putfield', 0);//把this指针设置到包裹类的@this中
            }
            let capture = node['immediate'].functionValue.capture;
            for (let capturedName in capture) {//设置捕获变量
                let capturedOffset = scope.getPropOffset(capturedName);//当前scope被捕获对象的描述符(一定是一个指针对象)
                let capturedType = scope.getProp(capturedName).prop.type!;//被捕获对象的类型(已经是包裹类)
                let targetOffset = functionWrapScpoe.getPropOffset(capturedName);//捕获对象在被包裹类中的描述符
                new IR('p_dup');//复制函数对象
                new IR('p_load', capturedOffset);//读取被捕获变量
                endIR = putfield(capturedType, targetOffset, [], []);//把被捕获对象设置给函数对象的包裹类中
            }
            return { startIR: startIR, endIR: endIR ?? startIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
        } else {
            assert(node['immediate'].primiviteValue != undefined);
            let immediate_val = node['immediate'].primiviteValue;
            let ir: IR;
            if (/^(true)|(false)$/.test(immediate_val)) {
                if (immediate_val == 'true') {
                    ir = new IR('const_i8_load', 1);
                } else {
                    ir = new IR('const_i8_load', 0);
                }
            } else if (/^[0-9]+b$/.test(immediate_val)) {
                ir = new IR('const_i8_load', Number(immediate_val.substring(0, immediate_val.length - 1)));
            } else if (/^[0-9]+s$/.test(immediate_val)) {
                ir = new IR('const_i16_load', Number(immediate_val.substring(0, immediate_val.length - 1)));
            } else if (/^[0-9]+$/.test(immediate_val)) {
                ir = new IR('const_i32_load', Number(immediate_val));
            } else if (/^[0-9]+l$/.test(immediate_val)) {
                ir = new IR('const_i64_load', Number(immediate_val.substring(0, immediate_val.length - 1)));
            } else if (/^[0-9]+\.[0-9]+$/.test(immediate_val)) {
                let buffer = new ArrayBuffer(8);
                let dv = new DataView(buffer);
                dv.setFloat64(0, Number(immediate_val), true);
                ir = new IR('const_double_load', dv.getBigInt64(0, true));
            } else if (immediate_val == 'null') {
                ir = new IR('const_i64_load', 0);
            } else {
                throw `还未支持的immediate类型${node['immediate'].primiviteValue}`
            }
            return { startIR: ir, endIR: ir, truelist: [], falselist: [], isRightValueTypeVariable: true };
        }
    }
    else if (node['~'] != undefined) {
        let left = nodeRecursion(scope, node['~'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['~'].type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_not');
        }
        else if (node['~'].type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_not');
        }
        else if (node['~'].type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_not');
        }
        else if (node['~'].type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_not');
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['~'].type!)}的~操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['+'] != undefined) {
        let left = nodeRecursion(scope, node['+'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['+'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['+'].leftChild.type?.PlainType?.name == 'system.byte' && node['+'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_add');
        }
        else if (node['+'].leftChild.type?.PlainType?.name == 'system.short' && node['+'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_add');
        }
        else if (node['+'].leftChild.type?.PlainType?.name == 'system.int' && node['+'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_add');
        }
        else if (node['+'].leftChild.type?.PlainType?.name == 'system.long' && node['+'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_add');
        }
        else if (node['+'].leftChild.type?.PlainType?.name == 'system.double' && node['+'].rightChild.type?.PlainType?.name == 'system.double') {
            opIR = new IR('double_add');
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['+'].leftChild.type!)}的+操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['^'] != undefined) {
        let left = nodeRecursion(scope, node['^'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['^'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['^'].leftChild.type?.PlainType?.name == 'system.byte' && node['^'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_xor');
        }
        else if (node['^'].leftChild.type?.PlainType?.name == 'system.short' && node['^'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_xor');
        }
        else if (node['^'].leftChild.type?.PlainType?.name == 'system.int' && node['^'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_xor');
        }
        else if (node['^'].leftChild.type?.PlainType?.name == 'system.long' && node['^'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_xor');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['^'].leftChild.type!)}的^操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['&'] != undefined) {
        let left = nodeRecursion(scope, node['&'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['&'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['&'].leftChild.type?.PlainType?.name == 'system.byte' && node['&'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_and');
        }
        else if (node['&'].leftChild.type?.PlainType?.name == 'system.short' && node['&'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_and');
        }
        else if (node['&'].leftChild.type?.PlainType?.name == 'system.int' && node['&'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_and');
        }
        else if (node['&'].leftChild.type?.PlainType?.name == 'system.long' && node['&'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_and');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['&'].leftChild.type!)}的&操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['|'] != undefined) {
        let left = nodeRecursion(scope, node['|'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['|'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['|'].leftChild.type?.PlainType?.name == 'system.byte' && node['|'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_or');
        }
        else if (node['|'].leftChild.type?.PlainType?.name == 'system.short' && node['|'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_or');
        }
        else if (node['|'].leftChild.type?.PlainType?.name == 'system.int' && node['|'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_or');
        }
        else if (node['|'].leftChild.type?.PlainType?.name == 'system.long' && node['|'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_or');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['|'].leftChild.type!)}的|操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['<<'] != undefined) {
        let left = nodeRecursion(scope, node['<<'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['<<'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['<<'].leftChild.type?.PlainType?.name == 'system.byte' && node['<<'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i8_shl');
        }
        else if (node['<<'].leftChild.type?.PlainType?.name == 'system.short' && node['<<'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i16_shl');
        }
        else if (node['<<'].leftChild.type?.PlainType?.name == 'system.int' && node['<<'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_shl');
        }
        else if (node['<<'].leftChild.type?.PlainType?.name == 'system.long' && node['<<'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i64_shl');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['<<'].leftChild.type!)}的<<操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['>>'] != undefined) {
        let left = nodeRecursion(scope, node['>>'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['>>'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        if (node['>>'].leftChild.type?.PlainType?.name == 'system.byte' && node['>>'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i8_shr');
        }
        else if (node['>>'].leftChild.type?.PlainType?.name == 'system.short' && node['>>'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i16_shr');
        }
        else if (node['>>'].leftChild.type?.PlainType?.name == 'system.int' && node['>>'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_shr');
        }
        else if (node['>>'].leftChild.type?.PlainType?.name == 'system.long' && node['>>'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i64_shr');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['>>'].leftChild.type!)}的>>操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['ternary'] != undefined) {
        let condition = node['ternary']!.condition;
        let a = nodeRecursion(scope, condition, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (a.truelist.length == 0 && a.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            let ir = new IR('i8_if_false');
            a.falselist.push(ir);
            a.endIR = ir;
        }
        let b = nodeRecursion(scope, node['ternary']!.obj1, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let ir = new IR('jmp');
        let c = nodeRecursion(scope, node['ternary']!.obj2, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        ir.operand1 = c.endIR.index - ir.index + c.endIR.length;
        backPatch(a.truelist, b.startIR.index);//回填trueList
        backPatch(a.falselist, c.startIR.index);//回填falseList
        return { startIR: a.startIR, endIR: c.endIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    } else if (node['_this'] != undefined) {
        let loadFunctionBase = new IR('p_load', 0);
        if (option.singleLevelThis) {
            return { startIR: loadFunctionBase, endIR: loadFunctionBase, truelist: [], falselist: [] };;
        } else {
            let loadThis = new IR('p_getfield', 0);//如果是在函数对象中，需要再取一次值才能拿到正确的this
            return { startIR: loadFunctionBase, endIR: loadThis, truelist: [], falselist: [] };
        }
    } else if (node['def'] != undefined) {
        let blockScope = (scope as BlockScope);//def节点是block专属
        let name = Object.keys(node['def'])[0];
        blockScope.setProp(name, node['def'][name]);
        let varOffset = blockScope.getPropOffset(name);//def变量
        let size = blockScope.getPropSize(name);
        let startIR: IR | undefined;
        let endIR: IR | undefined;
        
        if (node['def'][name].initAST != undefined) {
            let nr = nodeRecursion(blockScope, node['def'][name].initAST!, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            startIR = nr.startIR;
            if (nr.truelist.length > 0 || nr.falselist.length > 0) {
                let trueIR = new IR('const_i8_load', 1);
                let jmp = new IR('jmp');
                let falseIR = new IR('const_i8_load', 0);
                jmp.operand1 = falseIR.index - jmp.index + falseIR.length
                backPatch(nr.truelist, trueIR.index);//回填true
                backPatch(nr.falselist, falseIR.index);//回填false
            }
            if (isPointType(node['def'][name].type!)) {
                endIR = new IR('init_p_store', varOffset);
            } else {
                endIR = new IR('init_valueType_store', varOffset, size);
            }
        } else if (node['def'][name].type?.FunctionType && node['def'][name].type?.FunctionType?.body) {//如果是函数定义则生成函数
            let functionScope = new BlockScope(scope, node['def'][name].type?.FunctionType, node['def'][name].type?.FunctionType?.body!, { program });
            let fun = functionObjGen(functionScope, node['def'][name].type?.FunctionType!);
            let functionWrapScpoe = programScope.getClassScope(fun.wrapClassName);
            startIR = new IR('newFunc', undefined, undefined, undefined);
            irAbsoluteAddressRelocationTable.push({ sym: fun.text, ir: startIR });
            typeRelocationTable.push({ t2: fun.realTypeName, t3: fun.wrapClassName, ir: startIR });
            //判断创建的函数是否处于class中
            if (functionScope.classScope != undefined) {
                //如果是在class中定义的函数，设置this
                new IR('p_dup');//复制函数对象
                nodeRecursion(scope, { desc: 'ASTNode', _this: '' }, {
                    label: undefined,
                    frameLevel: undefined,
                    isGetAddress: undefined,
                    boolForward: undefined,
                    isAssignment: undefined,
                    singleLevelThis: option.singleLevelThis,
                    inContructorRet: undefined,
                    functionWrapName: option.functionWrapName
                });//读取this指针
                new IR('p_putfield', 0);//把this指针设置到包裹类的@this中
            }
            let capture = node['def'][name].type!.FunctionType!.capture;
            for (let capturedName in capture) {//设置捕获变量
                let capturedOffset = scope.getPropOffset(capturedName);//当前scope被捕获对象的描述符(一定是一个指针对象)
                let capturedType = scope.getProp(capturedName).prop.type!;//被捕获对象的类型(已经是包裹类)
                let targetOffset = functionWrapScpoe.getPropOffset(capturedName);//捕获对象在被包裹类中的描述符
                new IR('p_dup');//复制函数对象
                new IR('p_load', capturedOffset);//读取被捕获变量
                putfield(capturedType, targetOffset, [], []);//把被捕获对象设置给函数对象的包裹类中
            }
            endIR = new IR('init_p_store', varOffset);//保存函数对象到指定位置
        } else {
            //如果是值类型，调用init方法
            if (!isPointType(node['def'][name].type!)) {
                let typeName = TypeUsedSign(node['def'][name].type!);
                //系统内置值类型不调用_init函数
                switch (typeName) {
                    case 'system.bool': {
                        startIR = new IR('const_i8_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.byte': {
                        startIR = new IR('const_i8_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.short': {
                        startIR = new IR('const_i16_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.int': {
                        startIR = new IR('const_i32_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.long': {
                        startIR = new IR('const_i64_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.double': {
                        let buffer = new ArrayBuffer(8);
                        let dv = new DataView(buffer);
                        dv.setFloat64(0, 0, true);
                        startIR = new IR('const_double_load', dv.getBigInt64(0, true));
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    case 'system.object': {
                        startIR = new IR('const_i64_load', 0);
                        endIR = new IR('valueType_store', varOffset, size);
                        break;
                    }
                    default: {
                        startIR = new IR('load_address', varOffset);
                        let initCall = new IR('abs_call', undefined, undefined, undefined);
                        irAbsoluteAddressRelocationTable.push({ sym: `${node['def'][name].type?.PlainType!.name}_init`, ir: initCall });
                        new IR('alloc', propSize(node['def'][name].type!));
                        endIR = new IR('p_pop');//弹出init创建的指针
                        break;
                    }
                }
            } else {
                endIR = new IR('alloc_null_pointer');
            }
        }
        return { startIR: startIR ?? endIR, endIR, truelist: [], falselist: [] };
    }
    else if (node['load'] != undefined) {
        let type = (scope as BlockScope).getProp(node['load']).prop.type!;
        let offset = (scope as BlockScope).getPropOffset(node['load']);
        let size = (scope as BlockScope).getPropSize(node['load']);
        let ir: IR;
        let virtualIR: {
            opCode: keyof typeof OPCODE,
            operand1?: number,
            operand2?: number,
            operand3?: number,
        } | undefined;
        if (!option.isAssignment) {
            if (isPointType(type)) {
                ir = new IR('p_load', offset);
            } else {
                if (option.isGetAddress) {
                    ir = new IR('load_address', offset);
                }
                else {
                    ir = new IR('valueType_load', offset, size);
                }
            }
        } else {
            if (isPointType(type)) {
                virtualIR = { opCode: 'p_store', operand1: offset }
            } else {
                if (option.isGetAddress) {
                    //见accessField的注释
                    throw `这里是不可能到达的`;
                }
                else {
                    virtualIR = { opCode: 'valueType_store', operand1: offset, operand2: size }
                }
            }
            /**
             * 这里的startIR和endIR不会被使用到
             * 因为命中这里的代码如下
             * var a:int;
             * a=10;//尝试解析['=']节点的左子节点时命中
             * 所以作为jmp之类的跳转指令要使用也只能对整个['=']进行跳转
             */
            ir = nowIRContainer.irs[nowIRContainer.irs.length - 1];
        }
        return { startIR: ir, endIR: ir, truelist: [], falselist: [], virtualIR };
    }
    else if (node['_new'] != undefined) {
        let argTypes: TypeUsed[] = [];
        let args = node['_new']._arguments;
        //先处理参数
        for (let i = args.length - 1; i >= 0; i--) {
            argTypes.push(args[args.length - 1 - i].type!);//顺序获取type
            let nrRet = nodeRecursion(scope, args[i], {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });//逆序压参
            if (args[i].type!.PlainType && args[i].type!.PlainType!.name == 'system.bool') {
                if (nrRet.truelist.length > 0 || nrRet.falselist.length > 0) {//如果bool值需要回填
                    let trueIR = new IR('const_i8_load', 1);
                    let jmp = new IR('jmp');
                    let falseIR = new IR('const_i8_load', 0);
                    jmp.operand1 = falseIR.index - jmp.index + falseIR.length;
                    backPatch(nrRet.truelist, trueIR.index);//回填true
                    backPatch(nrRet.falselist, falseIR.index);//回填false
                }
            }
        }
        let ir = new IR('_new', undefined, undefined, undefined);
        typeRelocationTable.push({ t1: node['_new'].type.PlainType.name, ir: ir });
        let initCall = new IR('abs_call', undefined, undefined, undefined);
        irAbsoluteAddressRelocationTable.push({ sym: `${node['_new'].type.PlainType.name}_init`, ir: initCall });
        let constructorCall = new IR('abs_call', undefined, undefined, undefined);//执行调用
        let sign = `@constructor:${node['_new'].type.PlainType.name} ${FunctionSignWithArgumentAndRetType(argTypes, { PlainType: { name: 'void' } })}`;//构造函数的签名
        irAbsoluteAddressRelocationTable.push({ sym: sign, ir: constructorCall });
        return { startIR: ir, endIR: constructorCall, truelist: [], falselist: [] };
    }
    else if (node['not'] != undefined) {
        let nrRet = nodeRecursion(scope, node['not'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: true,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (nrRet.truelist.length == 0 && nrRet.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            let ir = new IR('i8_if_true');
            nrRet.endIR = ir;
            return { startIR: nrRet.startIR, endIR: ir, truelist: [], falselist: [ir] };
        } else {
            return { startIR: nrRet.startIR, endIR: nrRet.endIR, truelist: nrRet.falselist, falselist: nrRet.truelist };//交换trueList和falseList
        }
    }
    else if (node['||'] != undefined) {
        let left = nodeRecursion(scope, node['||'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: true,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (left.falselist.length == 0 && left.truelist.length == 0) {//如果没有回填，则为其创建回填指令
            //因为||的左子节点要取boolFward，所以用if_true
            let ir = new IR('i8_if_true');
            left.truelist.push(ir);
            left.endIR = ir;
        }
        let right = nodeRecursion(scope, node['||'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let endIR: IR;
        if (right.falselist.length == 0 && right.truelist.length == 0) {//如果没有回填，则为其创建回填指令
            if (option.boolForward) {
                let ir = new IR('i8_if_true');
                right.truelist.push(ir);
                right.endIR = ir;
            } else {
                let ir = new IR('i8_if_false')
                right.falselist.push(ir);
                right.endIR = ir;
            }
        }
        endIR = right.endIR;

        backPatch(left.falselist, right.startIR.index);
        let truelist = merge(left.truelist, right.truelist);
        return { startIR: left.startIR, endIR: endIR, truelist: truelist, falselist: right.falselist, isRightValueTypeVariable: true };
    }
    else if (node['&&'] != undefined) {
        let left = nodeRecursion(scope, node['&&'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (left.falselist.length == 0 && left.truelist.length == 0) {//如果没有回填，则为其创建回填指令
            let ir = new IR('i8_if_false');
            left.falselist.push(ir);
            left.endIR = ir;
        }
        let right = nodeRecursion(scope, node['&&'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let endIR: IR;
        if (right.falselist.length == 0 && right.truelist.length == 0) {//如果没有回填，则为其创建回填指令
            if (option.boolForward) {
                let ir = new IR('i8_if_true');
                right.truelist.push(ir);
                right.endIR = ir;
            } else {
                let ir = new IR('i8_if_false');
                right.falselist.push(ir);
                right.endIR = ir;
            }
        }
        endIR = right.endIR;

        backPatch(left.truelist, right.startIR.index);
        let falselist = merge(left.falselist, right.falselist);
        return { startIR: left.startIR, endIR: endIR, truelist: right.truelist, falselist: falselist, isRightValueTypeVariable: true };
    }
    else if (node['ifElseStmt'] != undefined) {
        let condition = nodeRecursion(scope, node['ifElseStmt'].condition, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (condition.truelist.length == 0 && condition.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            let ir = new IR('i8_if_false');
            condition.falselist.push(ir);
            condition.endIR = ir;
        }
        assert(typeof option.frameLevel == 'number');
        let block1Ret = BlockScan(new BlockScope(scope, undefined, node['ifElseStmt'].stmt1, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        let jmp = new IR('jmp');
        let block2Ret = BlockScan(new BlockScope(scope, undefined, node['ifElseStmt'].stmt2, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        jmp.operand1 = block2Ret.endIR.index - jmp.index + block2Ret.endIR.length;
        backPatch(condition.truelist, block1Ret.startIR.index);
        backPatch(condition.falselist, block2Ret.startIR.index);
        return { startIR: condition.startIR, endIR: block2Ret.endIR, truelist: [], falselist: [], jmpToFunctionEnd: block1Ret.jmpToFunctionEnd.concat(block2Ret.jmpToFunctionEnd) };
    }
    else if (node['ifStmt'] != undefined) {
        let condition = nodeRecursion(scope, node['ifStmt'].condition, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (condition.truelist.length == 0 && condition.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            let ir = new IR('i8_if_false');
            condition.falselist.push(ir);
            condition.endIR = ir;
        }
        assert(typeof option.frameLevel == 'number');
        let blockRet = BlockScan(new BlockScope(scope, undefined, node['ifStmt'].stmt, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        backPatch(condition.truelist, blockRet.startIR.index);
        backPatch(condition.falselist, blockRet.endIR.index + 1n);
        return { startIR: condition.startIR, endIR: blockRet.endIR, truelist: [], falselist: [], jmpToFunctionEnd: blockRet.jmpToFunctionEnd };
    }
    else if (node['ret'] != undefined) {
        let startIR: IR;
        let jmpToFunctionEnd: IR[] = [];
        if (node['ret'] != '') {
            let ret = nodeRecursion(scope, node['ret'], {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            startIR = ret.startIR;
            if (ret.truelist.length > 0 || ret.falselist.length > 0) {//如果需要回填，则说明是一个bool表达式
                let trueIR = new IR('const_i8_load', 1);
                let jmp = new IR('jmp');
                let falseIR = new IR('const_i8_load', 0);
                jmp.operand1 = falseIR.index - jmp.index + falseIR.length;
                backPatch(ret.truelist, trueIR.index);//回填true
                backPatch(ret.falselist, falseIR.index);//回填false
            }
            assert(typeof option.inContructorRet == 'boolean');
            if (option.inContructorRet) {
                new IR('p_load', 0);//读取this指针到计算栈
            }
            assert(typeof option.frameLevel == 'number');
            new IR('pop_stack_map', option.frameLevel);
            let jmp = new IR('jmp');
            jmpToFunctionEnd.push(jmp);
        } else {//无条件返回语句
            assert(typeof option.inContructorRet == 'boolean');
            if (option.inContructorRet) {
                new IR('p_load', 0);//读取this指针到计算栈
            }
            assert(typeof option.frameLevel == 'number');
            new IR('pop_stack_map', option.frameLevel);
            startIR = new IR('jmp');
            jmpToFunctionEnd.push(startIR);
        }
        return { startIR: startIR, endIR: jmpToFunctionEnd[0], truelist: [], falselist: [], jmpToFunctionEnd: jmpToFunctionEnd };
    } else if (node['call'] != undefined) {
        let startIR: IR | undefined = undefined;
        //参数逆序压栈
        for (let i = node['call']._arguments.length - 1; i >= 0; i--) {
            let nodeRet = nodeRecursion(scope, node['call']._arguments[i], {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (node['call']._arguments[i].type!.PlainType && node['call']._arguments[i].type!.PlainType!.name == 'system.bool') {
                if (nodeRet.truelist.length > 0 || nodeRet.falselist.length > 0) {//如果bool值需要回填
                    let trueIR = new IR('const_i8_load', 1);
                    let jmp = new IR('jmp');
                    let falseIR = new IR('const_i8_load', 0);
                    jmp.operand1 = falseIR.index - jmp.index + falseIR.length;
                    backPatch(nodeRet.truelist, trueIR.index);//回填true
                    backPatch(nodeRet.falselist, falseIR.index);//回填false
                }
            }
            if (startIR == undefined) {
                startIR = nodeRet.startIR;
            }
        }
        //获取函数对象
        let nodeRet = nodeRecursion(scope, node['call'].functionObj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (startIR == undefined) {
            startIR = nodeRet.startIR;
        }
        let call = new IR('call');
        return { startIR: startIR, endIR: call, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    /**
     * 这里什么指令都不需要生成 
     * 假如执行一个函数调用  f1(1,2,3);
     * 此时栈中是这样的布局
     *        ┌─────────┐
     *        │    3    │
     *        ├─────────┤
     *        │    2    │
     *        ├─────────┤
     *   sp-> │    1    │
     *        └─────────┘
     * 其他要使用参数的代码(有且仅有这些参数的def节点)依次从栈顶消费即可
     */
    else if (node['loadArgument'] != undefined) {
        return { startIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], endIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['_newArray'] != undefined) {
        let startIR: IR | undefined = undefined;
        let initList = node['_newArray'].initList;
        let placeholder = node['_newArray'].placeholder;
        let type: TypeUsed = node['_newArray'].type;
        for (let i = 0; i < initList.length + placeholder; i++) {
            type = { ArrayType: { innerType: type } };
        }
        for (let ast of initList) {
            let astRet = nodeRecursion(scope, ast, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (startIR == undefined) {
                startIR = astRet.startIR;
            }
        }
        let typeName = TypeUsedSign(type);
        let newArray = new IR('newArray', undefined, initList.length, undefined);
        typeRelocationTable.push({ t1: typeName, ir: newArray });
        return { startIR: startIR!, endIR: newArray, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['='] != undefined) {
        let leftObj = nodeRecursion(scope, node['='].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: true,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let rightObj = nodeRecursion(scope, node['='].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });

        let type = node['='].leftChild.type!;
        if (type!.PlainType?.name == 'system.bool') {
            if (rightObj.truelist.length > 0 || rightObj.falselist.length > 0) {//如果bool值需要回填
                let trueIR = new IR('const_i8_load', 1);
                let jmp = new IR('jmp');
                let falseIR = new IR('const_i8_load', 0);
                jmp.operand1 = falseIR.index - jmp.index + falseIR.length;
                backPatch(rightObj.truelist, trueIR.index);//回填true
                backPatch(rightObj.truelist, falseIR.index);//回填false
            }
        }
        let virtualIR = leftObj.virtualIR!;
        let endIR = new IR(virtualIR.opCode, virtualIR.operand1, virtualIR.operand2, virtualIR.operand3);
        return { startIR: rightObj.startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['++'] != undefined) {
        let left = nodeRecursion(scope, node['++'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: true,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });//取得location
        let nrRet = nodeRecursion(scope, node['++'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (nrRet.isRightValueTypeVariable) {
            throw `右值类型的${node['++'].type!.PlainType!.name}不能执行++操作`;
        }
        let endIR: IR;
        assert(left.virtualIR != undefined);
        let virtualIR = left.virtualIR;

        if (node['++'].type!.PlainType?.name == 'system.byte') {
            new IR('i8_inc');
        } else if (node['++'].type!.PlainType?.name == 'system.short') {
            new IR('i16_inc');
        } else if (node['++'].type!.PlainType?.name == 'system.int') {
            new IR('i32_inc');
        } else if (node['++'].type!.PlainType?.name == 'system.long') {
            new IR('i64_inc');
        } else if (node['++'].type!.PlainType?.name == 'system.double') {
            new IR('double_inc');
        } else {
            throw `暂时不支持类型:${node['++'].type!.PlainType?.name}的++`;
        }

        endIR = new IR(virtualIR.opCode, virtualIR.operand1, virtualIR.operand2, virtualIR.operand3);
        return { startIR: left.startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['--'] != undefined) {
        let left = nodeRecursion(scope, node['--'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: true,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });//取得location
        let nrRet = nodeRecursion(scope, node['--'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (nrRet.isRightValueTypeVariable) {
            throw `右值类型的${node['--'].type!.PlainType!.name}不能执行--操作`;
        }
        let endIR: IR;
        assert(left.virtualIR != undefined);
        let virtualIR = left.virtualIR;


        if (node['--'].type!.PlainType?.name == 'system.byte') {
            new IR('i8_dec');
        } else if (node['--'].type!.PlainType?.name == 'system.short') {
            new IR('i16_dec');
        } else if (node['--'].type!.PlainType?.name == 'system.int') {
            new IR('i32_dec');
        } else if (node['--'].type!.PlainType?.name == 'system.long') {
            new IR('i64_dec');
        } else if (node['--'].type!.PlainType?.name == 'system.double') {
            new IR('double_dec');
        } else {
            throw `暂时不支持类型:${node['--'].type!.PlainType?.name}的--`;
        }

        endIR = new IR(virtualIR.opCode, virtualIR.operand1, virtualIR.operand2, virtualIR.operand3);
        return { startIR: left.startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['_for'] != undefined) {
        let startIR: IR | undefined;
        if (node['_for'].init) {
            let initRet = nodeRecursion(scope, node['_for'].init, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            startIR = initRet.startIR;
        }
        let conditionStartIR: IR | undefined;
        let trueList: IR[] = [];
        let falseList: IR[] = [];
        if (node['_for'].condition) {
            let conditionRet = nodeRecursion(scope, node['_for'].condition, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (conditionRet.truelist.length == 0 && conditionRet.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
                let ir = new IR('i8_if_false');
                conditionRet.falselist.push(ir);
                conditionRet.endIR = ir;
            }
            trueList = conditionRet.truelist;
            falseList = conditionRet.falselist;
            conditionStartIR = conditionRet.startIR;
            if (!startIR) {
                startIR = conditionRet.startIR;
            }
        }
        let breakIRs: IR[] = [];
        let continueIRs: IR[] = [];
        if (option.label == undefined) {
            option.label = [];
        }
        assert(typeof option.frameLevel == 'number');
        if (node['_for'].label) {
            option.label.push({ name: node['_for'].label, frameLevel: option.frameLevel, breakIRs, continueIRs });
        } else {
            option.label.push({ name: '', frameLevel: option.frameLevel, breakIRs, continueIRs });
        }
        let jmpToFunctionEnd: IR[] = [];
        let forLoopBodyStratIR: IR | undefined;
        if (node['_for'].stmt.desc == 'ASTNode') {
            let nr = nodeRecursion(scope, node['_for'].stmt as ASTNode, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (!startIR) {
                startIR = nr.startIR;
            }
            forLoopBodyStratIR = nr.startIR;
            jmpToFunctionEnd = nr.jmpToFunctionEnd ?? [];
        } else {
            let blockRet = BlockScan(new BlockScope(scope, undefined, node['_for'].stmt, { program }), {
                label: option.label,
                frameLevel: option.frameLevel + 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                autoUnwinding: undefined,
                isTryBlock: undefined,
                functionWrapName: option.functionWrapName
            });
            if (!startIR) {
                startIR = blockRet.startIR;
            }
            forLoopBodyStratIR = blockRet.startIR;
            jmpToFunctionEnd = blockRet.jmpToFunctionEnd;
        }
        option.label.pop();//清理刚刚新增的label

        if (node['_for'].step) {
            nodeRecursion(scope, node['_for'].step, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
        }
        let loop = new IR('jmp');
        backPatch(breakIRs, loop.index + 1n);
        if (conditionStartIR) {
            loop.operand1 = conditionStartIR.index - loop.index;
            if (trueList.length > 0 || falseList.length > 0) {
                backPatch(falseList, loop.index + 1n);//for语句后面一定会有指令(至少一定会有一条ret或者pop_stackFrame指令,因为for一定是定义在functio或者block中的)
                backPatch(trueList, forLoopBodyStratIR.index);
            }
            backPatch(continueIRs, conditionStartIR.index);
        } else {
            loop.operand1 = forLoopBodyStratIR.index - loop.index;
            backPatch(continueIRs, forLoopBodyStratIR.index);
        }
        return { startIR: startIR, endIR: loop, truelist: [], falselist: [], jmpToFunctionEnd };
    }
    else if (node['_break'] != undefined) {
        let lab: {
            name: string;
            frameLevel: number;
            breakIRs: IR[];
            continueIRs: IR[];
        } | undefined;
        let startIR: IR;
        let endIR: IR;
        assert(typeof option.frameLevel == 'number');
        assert(Array.isArray(option.label));
        if (!node['_break'].label) {//如果没有指明label，则寻找最近的一个label break
            lab = option.label[option.label.length - 1];
        } else {
            for (let i = option.label.length - 1; i >= 0; i--) {
                if (option.label[i].name == node['_break'].label) {
                    lab = option.label[i];
                    break;
                }
            }
        }
        assert(lab != undefined);
        startIR = new IR('pop_stack_map', option.frameLevel - lab.frameLevel);
        let jmp = new IR('jmp');
        lab!.breakIRs.push(jmp);
        endIR = jmp;
        return { startIR: startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['_continue'] != undefined) {
        let lab: {
            name: string;
            frameLevel: number;
            breakIRs: IR[];
            continueIRs: IR[];
        } | undefined;
        let startIR: IR;
        let endIR: IR;
        assert(typeof option.frameLevel == 'number');
        assert(Array.isArray(option.label));
        if (!node['_continue'].label) {//如果没有指明label，则寻找最近的一个label break
            lab = option.label[option.label.length - 1];
        } else {
            for (let i = option.label.length - 1; i >= 0; i--) {
                if (option.label[i].name == node['_continue'].label) {
                    lab = option.label[i];
                    break;
                }
            }
        }
        assert(lab != undefined);
        startIR = new IR('pop_stack_map', option.frameLevel - lab.frameLevel);
        let jmp = new IR('jmp');
        lab!.continueIRs.push(jmp);
        endIR = jmp;
        return { startIR: startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['[]'] != undefined) {
        let left = nodeRecursion(scope, node['[]'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['[]'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let innerType = node['[]'].leftChild.type!.ArrayType!.innerType;
        let ir: IR;
        let virtualIR: {
            opCode: keyof typeof OPCODE,
            operand1?: number,
            operand2?: number,
            operand3?: number,
        } | undefined;
        if (!option.isAssignment) {
            if (isPointType(innerType)) {
                ir = new IR('array_get_point', globalVariable.pointSize);
            } else {
                let elementSize = propSize(innerType);
                if (option.isGetAddress) {
                    ir = new IR('array_get_element_address', elementSize);//地址
                } else {
                    ir = new IR('array_get_valueType', elementSize);
                }
            }
        } else {
            if (isPointType(innerType)) {
                virtualIR = { opCode: 'array_set_point', operand1: globalVariable.pointSize };
            } else {
                let elementSize = propSize(innerType);
                if (option.isGetAddress) {
                    //见accessField的注释
                    throw `这里是不可能到达的`;
                } else {
                    virtualIR = { opCode: 'array_set_valueType', operand1: elementSize };
                }
            }
            ir = right.endIR;
        }
        //数组的元素不是右值,和局部变量一样，是有存访位置的，局部变量的容器是block，数组元素的容器就是这个数组
        return { startIR: left.startIR, endIR: ir, truelist: [], falselist: [], jmpToFunctionEnd: [], virtualIR, isRightValueTypeVariable: false };
    }
    else if (node['getFunctionWrapName'] != undefined) {
        assert(typeof option.functionWrapName == 'string');
        node.type!.PlainType!.name = option.functionWrapName;//更新functionWrap的名字
        let ir = new IR('p_load', 0);
        return { startIR: ir, endIR: ir, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['callEXM'] != undefined) {
        let nrRet = nodeRecursion(scope, node['callEXM'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: false,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        /**
         * 见accessField节点对装箱的解释
         */
        //访问一个值类型右值的扩展函数时
        /*
        if (!isPointType(node['callEXM'].obj.type!) && nrRet.isRightValueTypeVariable) {
            let box = new IR('box');
            typeRelocationTable.push({ t1: node['callEXM'].obj.type!.PlainType!.name, ir: box });
        }*/

        let endIR = new IR('abs_call');
        irAbsoluteAddressRelocationTable.push({ sym: `${node['callEXM'].extendFuntionRealname}`, ir: endIR });
        return { startIR: nrRet.startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['-'] != undefined) {
        let left = nodeRecursion(scope, node['-'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['-'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;

        if (node['-'].leftChild.type?.PlainType?.name == 'system.byte' && node['-'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_sub');
        }
        else if (node['-'].leftChild.type?.PlainType?.name == 'system.short' && node['-'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_sub');
        }
        else if (node['-'].leftChild.type?.PlainType?.name == 'system.int' && node['-'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_sub');
        }
        else if (node['-'].leftChild.type?.PlainType?.name == 'system.long' && node['-'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_sub');
        }
        else if (node['-'].leftChild.type?.PlainType?.name == 'system.double' && node['-'].rightChild.type?.PlainType?.name == 'system.double') {
            opIR = new IR('double_sub');
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['-'].leftChild.type!)}的-操作`;
        }

        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['%'] != undefined) {
        let left = nodeRecursion(scope, node['%'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['%'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;

        if (node['%'].leftChild.type?.PlainType?.name == 'system.byte' && node['%'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_mod');
        }
        else if (node['%'].leftChild.type?.PlainType?.name == 'system.short' && node['%'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_mod');
        }
        else if (node['%'].leftChild.type?.PlainType?.name == 'system.int' && node['%'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_mod');
        }
        else if (node['%'].leftChild.type?.PlainType?.name == 'system.long' && node['%'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_mod');
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['%'].leftChild.type!)}的%操作`;
        }

        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['*'] != undefined) {
        let left = nodeRecursion(scope, node['*'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['*'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;


        if (node['*'].leftChild.type?.PlainType?.name == 'system.byte' && node['*'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_mul');
        }
        else if (node['*'].leftChild.type?.PlainType?.name == 'system.short' && node['*'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_mul');
        }
        else if (node['*'].leftChild.type?.PlainType?.name == 'system.int' && node['*'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_mul');
        }
        else if (node['*'].leftChild.type?.PlainType?.name == 'system.long' && node['*'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_mul');
        }
        else if (node['*'].leftChild.type?.PlainType?.name == 'system.double' && node['*'].rightChild.type?.PlainType?.name == 'system.double') {
            opIR = new IR('double_mul');
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['*'].leftChild.type!)}的*操作`;
        }


        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['/'] != undefined) {
        let left = nodeRecursion(scope, node['/'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['/'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;

        if (node['/'].leftChild.type?.PlainType?.name == 'system.byte' && node['/'].rightChild.type?.PlainType?.name == 'system.byte') {
            opIR = new IR('i8_div');
        }
        else if (node['/'].leftChild.type?.PlainType?.name == 'system.short' && node['/'].rightChild.type?.PlainType?.name == 'system.short') {
            opIR = new IR('i16_div');
        }
        else if (node['/'].leftChild.type?.PlainType?.name == 'system.int' && node['/'].rightChild.type?.PlainType?.name == 'system.int') {
            opIR = new IR('i32_div');
        }
        else if (node['/'].leftChild.type?.PlainType?.name == 'system.long' && node['/'].rightChild.type?.PlainType?.name == 'system.long') {
            opIR = new IR('i64_div');
        }
        else if (node['/'].leftChild.type?.PlainType?.name == 'system.double' && node['/'].rightChild.type?.PlainType?.name == 'system.double') {
            opIR = new IR('double_div');
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['/'].leftChild.type!)}的/操作`;
        }

        return { startIR: left.startIR, endIR: opIR, truelist: [], falselist: [], isRightValueTypeVariable: true };
    }
    else if (node['<'] != undefined) {
        let left = nodeRecursion(scope, node['<'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['<'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['<'].leftChild.type?.PlainType?.name == 'system.byte' && node['<'].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_lt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_ge');
                falseList.push(opIR)
            }
        }
        else if (node['<'].leftChild.type?.PlainType?.name == 'system.short' && node['<'].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_lt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_ge');
                falseList.push(opIR)
            }
        } else if (node['<'].leftChild.type?.PlainType?.name == 'system.int' && node['<'].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_lt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_ge');
                falseList.push(opIR)
            }
        } else if (node['<'].leftChild.type?.PlainType?.name == 'system.long' && node['<'].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_lt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_ge');
                falseList.push(opIR)
            }
        } else if (node['<'].leftChild.type?.PlainType?.name == 'system.double' && node['<'].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_lt');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_ge');
                falseList.push(opIR)
            }
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['<'].leftChild.type!)}的<操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['<='] != undefined) {
        let left = nodeRecursion(scope, node['<='].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['<='].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['<='].leftChild.type?.PlainType?.name == 'system.byte' && node['<='].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_le');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_gt');
                falseList.push(opIR)
            }
        }
        else if (node['<='].leftChild.type?.PlainType?.name == 'system.short' && node['<='].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_le');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_gt');
                falseList.push(opIR)
            }
        }
        else if (node['<='].leftChild.type?.PlainType?.name == 'system.int' && node['<='].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_le');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_gt');
                falseList.push(opIR)
            }
        } else if (node['<='].leftChild.type?.PlainType?.name == 'system.long' && node['<='].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_le');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_gt');
                falseList.push(opIR)
            }
        } else if (node['<='].leftChild.type?.PlainType?.name == 'system.double' && node['<='].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_le');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_gt');
                falseList.push(opIR)
            }
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['<='].leftChild.type!)}的<=操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['>'] != undefined) {
        let left = nodeRecursion(scope, node['>'].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['>'].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['>'].leftChild.type?.PlainType?.name == 'system.byte' && node['>'].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_gt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_le');
                falseList.push(opIR)
            }
        } else if (node['>'].leftChild.type?.PlainType?.name == 'system.short' && node['>'].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_gt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_le');
                falseList.push(opIR)
            }
        } else if (node['>'].leftChild.type?.PlainType?.name == 'system.int' && node['>'].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_gt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_le');
                falseList.push(opIR)
            }
        } else if (node['>'].leftChild.type?.PlainType?.name == 'system.long' && node['>'].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_gt');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_le');
                falseList.push(opIR)
            }
        } else if (node['>'].leftChild.type?.PlainType?.name == 'system.double' && node['>'].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_gt');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_le');
                falseList.push(opIR)
            }
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['>'].leftChild.type!)}的>操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['>='] != undefined) {
        let left = nodeRecursion(scope, node['>='].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let right = nodeRecursion(scope, node['>='].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['>='].leftChild.type?.PlainType?.name == 'system.byte' && node['>='].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_ge');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_lt');
                falseList.push(opIR)
            }
        } else if (node['>='].leftChild.type?.PlainType?.name == 'system.short' && node['>='].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_ge');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_lt');
                falseList.push(opIR)
            }
        } else if (node['>='].leftChild.type?.PlainType?.name == 'system.int' && node['>='].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_ge');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_lt');
                falseList.push(opIR)
            }
        } else if (node['>='].leftChild.type?.PlainType?.name == 'system.long' && node['>='].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_ge');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_lt');
                falseList.push(opIR)
            }
        } else if (node['>='].leftChild.type?.PlainType?.name == 'system.double' && node['>='].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_ge');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_lt');
                falseList.push(opIR)
            }
        } else {
            throw `vm 暂未支持${TypeUsedSign(node['>='].leftChild.type!)}的>=操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['=='] != undefined) {
        let left = nodeRecursion(scope, node['=='].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (left.truelist.length > 0 || left.falselist.length > 0) {
            let trueIR = new IR('const_i8_load', 1);
            let jmp = new IR('jmp');
            let falseIR = new IR('const_i8_load', 0);
            jmp.operand1 = BigInt(falseIR.index - jmp.index + falseIR.length);
            backPatch(left.truelist, trueIR.index);//回填true
            backPatch(left.falselist, falseIR.index);//回填false
        }

        let right = nodeRecursion(scope, node['=='].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });

        if (right.truelist.length > 0 || right.falselist.length > 0) {
            let trueIR = new IR('const_i8_load', 1);
            let jmp = new IR('jmp');
            let falseIR = new IR('const_i8_load', 0);
            jmp.operand1 = falseIR.index - jmp.index + falseIR.length
            backPatch(right.truelist, trueIR.index);//回填true
            backPatch(right.falselist, falseIR.index);//回填false
        }

        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['=='].leftChild.type?.PlainType?.name == 'system.bool' && node['=='].rightChild.type?.PlainType?.name == 'system.bool') {
            if (option.boolForward) {
                opIR = new IR('i8_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_cmp_ne');
                falseList.push(opIR)
            }
        }
        else if (node['=='].leftChild.type?.PlainType?.name == 'system.byte' && node['=='].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_cmp_ne');
                falseList.push(opIR)
            }
        } else if (node['=='].leftChild.type?.PlainType?.name == 'system.short' && node['=='].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_cmp_ne');
                falseList.push(opIR)
            }
        } else if (node['=='].leftChild.type?.PlainType?.name == 'system.int' && node['=='].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_cmp_ne');
                falseList.push(opIR)
            }
        } else if (node['=='].leftChild.type?.PlainType?.name == 'system.long' && node['=='].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_cmp_ne');
                falseList.push(opIR)
            }
        } else if (node['=='].leftChild.type?.PlainType?.name == 'system.double' && node['=='].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_cmp_ne');
                falseList.push(opIR)
            }
        }
        //null判断被处理为i64
        else if (node['=='].leftChild.type?.PlainType?.name == '@null' || node['=='].rightChild.type?.PlainType?.name == '@null') {
            if (option.boolForward) {
                opIR = new IR('i64_if_cmp_eq');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_cmp_ne');
                falseList.push(opIR)
            }
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['=='].leftChild.type!)}的==操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['!='] != undefined) {
        let left = nodeRecursion(scope, node['!='].leftChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (left.truelist.length > 0 || left.falselist.length > 0) {
            let trueIR = new IR('const_i8_load', 1);
            let jmp = new IR('jmp');
            let falseIR = new IR('const_i8_load', 0);
            jmp.operand1 = BigInt(falseIR.index - jmp.index + falseIR.length);
            backPatch(left.truelist, trueIR.index);//回填true
            backPatch(left.falselist, falseIR.index);//回填false
        }

        let right = nodeRecursion(scope, node['!='].rightChild, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });

        if (right.truelist.length > 0 || right.falselist.length > 0) {
            let trueIR = new IR('const_i8_load', 1);
            let jmp = new IR('jmp');
            let falseIR = new IR('const_i8_load', 0);
            jmp.operand1 = falseIR.index - jmp.index + falseIR.length
            backPatch(right.truelist, trueIR.index);//回填true
            backPatch(right.falselist, falseIR.index);//回填false
        }

        let opIR: IR;
        let tureList: IR[] = [];
        let falseList: IR[] = [];
        if (node['!='].leftChild.type?.PlainType?.name == 'system.bool' && node['!='].rightChild.type?.PlainType?.name == 'system.bool') {
            if (option.boolForward) {
                opIR = new IR('i8_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_cmp_eq');
                falseList.push(opIR)
            }
        }
        else if (node['!='].leftChild.type?.PlainType?.name == 'system.byte' && node['!='].rightChild.type?.PlainType?.name == 'system.byte') {
            if (option.boolForward) {
                opIR = new IR('i8_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i8_if_cmp_eq');
                falseList.push(opIR)
            }
        } else if (node['!='].leftChild.type?.PlainType?.name == 'system.short' && node['!='].rightChild.type?.PlainType?.name == 'system.short') {
            if (option.boolForward) {
                opIR = new IR('i16_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i16_if_cmp_eq');
                falseList.push(opIR)
            }
        } else if (node['!='].leftChild.type?.PlainType?.name == 'system.int' && node['!='].rightChild.type?.PlainType?.name == 'system.int') {
            if (option.boolForward) {
                opIR = new IR('i32_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i32_if_cmp_eq');
                falseList.push(opIR)
            }
        } else if (node['!='].leftChild.type?.PlainType?.name == 'system.long' && node['!='].rightChild.type?.PlainType?.name == 'system.long') {
            if (option.boolForward) {
                opIR = new IR('i64_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_cmp_eq');
                falseList.push(opIR)
            }
        } else if (node['!='].leftChild.type?.PlainType?.name == 'system.double' && node['!='].rightChild.type?.PlainType?.name == 'system.double') {
            if (option.boolForward) {
                opIR = new IR('double_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('double_if_cmp_eq');
                falseList.push(opIR)
            }
        }
        //null判断被处理为i64
        else if (node['!='].leftChild.type?.PlainType?.name == '@null' || node['!='].rightChild.type?.PlainType?.name == '@null') {
            if (option.boolForward) {
                opIR = new IR('i64_if_cmp_ne');
                tureList.push(opIR)
            } else {
                opIR = new IR('i64_if_cmp_eq');
                falseList.push(opIR)
            }
        }
        else {
            throw `vm 暂未支持${TypeUsedSign(node['!='].leftChild.type!)}的!=操作`;
        }
        return { startIR: left.startIR, endIR: opIR, truelist: tureList, falselist: falseList, isRightValueTypeVariable: true };
    }
    else if (node['_while'] != undefined) {
        let startIR: IR | undefined;
        let conditionStartIR: IR;
        let trueList: IR[] = [];
        let falseList: IR[] = [];
        let breakIRs: IR[] = [];
        let continueIRs: IR[] = [];
        let jmpToFunctionEnd: IR[] = [];

        if (option.label == undefined) {
            option.label = [];
        }
        assert(typeof option.frameLevel == 'number');
        if (node['_while'].label) {
            option.label.push({ name: node['_while'].label, frameLevel: option.frameLevel, breakIRs, continueIRs });
        } else {
            option.label.push({ name: '', frameLevel: option.frameLevel, breakIRs, continueIRs });
        }


        let conditionRet = nodeRecursion(scope, node['_while'].condition, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (conditionRet.truelist.length == 0 && conditionRet.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            let ir = new IR('i8_if_false');
            conditionRet.falselist.push(ir);
            conditionRet.endIR = ir;
        }
        trueList = conditionRet.truelist;
        falseList = conditionRet.falselist;
        conditionStartIR = conditionRet.startIR;
        startIR = conditionRet.startIR;

        let loopBody = BlockScan(new BlockScope(scope, undefined, node['_while'].stmt, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        jmpToFunctionEnd = loopBody.jmpToFunctionEnd;
        option.label.pop();//清理刚刚新增的label

        let loop = new IR('jmp');
        loop.operand1 = startIR.index - loop.index;

        backPatch(breakIRs, loop.index + 1n);
        backPatch(continueIRs, conditionStartIR.index);
        backPatch(trueList, loopBody.startIR.index);
        backPatch(falseList, loop.index + 1n);//for语句后面一定会有指令(至少一定会有一条ret或者pop_stackFrame指令,因为for一定是定义在functio或者block中的)

        return { startIR: startIR, endIR: loop, truelist: [], falselist: [], jmpToFunctionEnd };

    }
    else if (node['do_while'] != undefined) {
        let startIR: IR | undefined;
        let conditionStartIR: IR;
        let trueList: IR[] = [];
        let falseList: IR[] = [];
        let breakIRs: IR[] = [];
        let continueIRs: IR[] = [];
        let jmpToFunctionEnd: IR[] = [];

        if (option.label == undefined) {
            option.label = [];
        }
        assert(typeof option.frameLevel == 'number');
        if (node['do_while'].label) {
            option.label.push({ name: node['do_while'].label, frameLevel: option.frameLevel, breakIRs, continueIRs });
        } else {
            option.label.push({ name: '', frameLevel: option.frameLevel, breakIRs, continueIRs });
        }

        let loopBody = BlockScan(new BlockScope(scope, undefined, node['do_while'].stmt, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        startIR = loopBody.startIR;
        jmpToFunctionEnd = loopBody.jmpToFunctionEnd;
        option.label.pop();//清理刚刚新增的label

        let conditionRet = nodeRecursion(scope, node['do_while'].condition, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: true,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        if (conditionRet.truelist.length == 0 && conditionRet.falselist.length == 0) {//如果bool值不是通过布尔运算得到的，则为其插入一个判断指令
            //和||的左子节点一样，因为要用boolFard，所以取if_true
            let ir = new IR('i8_if_true');
            conditionRet.truelist.push(ir);
            conditionRet.endIR = ir;
        }

        trueList = conditionRet.truelist;
        falseList = conditionRet.falselist;

        backPatch(breakIRs, conditionRet.endIR.index + 1n);
        backPatch(continueIRs, startIR.index);
        backPatch(trueList, startIR.index);
        backPatch(falseList, conditionRet.endIR.index + 1n);//语句后面一定会有指令(至少一定会有一条ret或者pop_stackFrame指令,因为for一定是定义在functio或者block中的)

        return { startIR: startIR, endIR: conditionRet.endIR, truelist: [], falselist: [], jmpToFunctionEnd };
    }
    else if (node['castRefToObj'] != undefined) {
        let nrRet = nodeRecursion(scope, node['castRefToObj'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        return { startIR: nrRet.startIR, endIR: nrRet.endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['castObjToRef'] != undefined) {
        let nrRet = nodeRecursion(scope, node['castObjToRef'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let typeCheck = new IR('castCheck');
        typeRelocationTable.push({ t1: TypeUsedSign(node['castObjToRef'].type), ir: typeCheck });
        return { startIR: nrRet.startIR, endIR: typeCheck, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['castValueType'] != undefined) {
        let builtinValueType = ['system.byte', 'system.short', 'system.int', 'system.long', 'system.double'];//内置值类型
        let srcType = TypeUsedSign(node['castValueType'].obj.type!);
        let targetType = TypeUsedSign(node['castValueType'].type);
        //检查是否为内置类型，否则不准转换
        if (builtinValueType.indexOf(srcType) != -1 && builtinValueType.indexOf(targetType) != -1) {
            let nrRet = nodeRecursion(scope, node['castValueType'].obj, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            let castIR: IR;
            switch (srcType) {
                case 'system.byte':
                    {
                        switch (targetType) {
                            case 'system.short':
                                castIR = new IR('b2s');
                                break;
                            case 'system.int':
                                castIR = new IR('b2i');
                                break;
                            case 'system.long':
                                castIR = new IR('b2l');
                                break;
                            case 'system.double':
                                castIR = new IR('b2d');
                                break;
                        }
                    }
                    break;
                case 'system.short':
                    {
                        switch (targetType) {
                            case 'system.byte':
                                castIR = new IR('s2b');
                                break;
                            case 'system.int':
                                castIR = new IR('s2i');
                                break;
                            case 'system.long':
                                castIR = new IR('s2l');
                                break;
                            case 'system.double':
                                castIR = new IR('s2d');
                                break;
                        }
                    }
                    break;
                case 'system.int':
                    {
                        switch (targetType) {
                            case 'system.byte':
                                castIR = new IR('i2b');
                                break;
                            case 'system.short':
                                castIR = new IR('i2s');
                                break;
                            case 'system.long':
                                castIR = new IR('i2l');
                                break;
                            case 'system.double':
                                castIR = new IR('i2d');
                                break;
                        }
                    }
                    break;
                case 'system.long':
                    {
                        switch (targetType) {
                            case 'system.byte':
                                castIR = new IR('l2b');
                                break;
                            case 'system.short':
                                castIR = new IR('l2s');
                                break;
                            case 'system.int':
                                castIR = new IR('l2i');
                                break;
                            case 'system.double':
                                castIR = new IR('l2d');
                                break;
                        }
                    }
                    break;
                case 'system.double':
                    {
                        switch (targetType) {
                            case 'system.byte':
                                castIR = new IR('d2b');
                                break;
                            case 'system.short':
                                castIR = new IR('d2s');
                                break;
                            case 'system.int':
                                castIR = new IR('d2i');
                                break;
                            case 'system.long':
                                castIR = new IR('d2l');
                                break;
                        }
                    }
                    break;
            }
            return { startIR: nrRet.startIR, endIR: castIR!, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
        } else {
            throw `非法的类型转换${srcType}-->${targetType}`;
        }
    }
    else if (node['box'] != undefined) {
        let nrRet = nodeRecursion(scope, node['box'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let box = new IR('box');
        typeRelocationTable.push({ t1: node['box'].obj.type!.PlainType!.name, ir: box });
        return { startIR: nrRet.startIR, endIR: box, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['unbox'] != undefined) {
        let nrRet = nodeRecursion(scope, node['unbox'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let unbox = new IR('unbox');
        typeRelocationTable.push({ t1: node['unbox'].type.PlainType!.name, ir: unbox });
        return { startIR: nrRet.startIR, endIR: unbox, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['_switch'] != undefined) {
        if (node['_switch'].defalutStmt == undefined && node['_switch'].matchList.length == 0) {
            //没有default和case分支的时候，不生成任何代码
            return { startIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], endIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], truelist: [], falselist: [], jmpToFunctionEnd: [] };
        }
        let startIR: IR | undefined;
        let endIR: IR | undefined;
        let lastFalseList: IR[] = [];
        let jumpToswitchEndIRs: IR[] = [];//任何一个分支执行完毕后都需要跳出switch
        let jmpToFunctionEnd: IR[] = [];

        assert(option.frameLevel != undefined);

        //处理matchList
        for (let matchItem of node['_switch'].matchList) {
            let conditon = nodeRecursion(scope, matchItem.condition!, {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (startIR == undefined) {
                startIR = conditon.startIR;
            }


            //如果当前不是第一个分支，则将上一个分支的falselist指向本分支的条件判断语句
            if (lastFalseList.length != 0) {
                backPatch(lastFalseList, conditon.startIR.index);
            }
            lastFalseList = conditon.falselist;

            let caseBody = BlockScan(new BlockScope(scope, undefined, matchItem.stmt, { program }), {
                label: option.label,
                frameLevel: option.frameLevel + 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                autoUnwinding: undefined,
                isTryBlock: undefined,
                functionWrapName: option.functionWrapName
            });
            jmpToFunctionEnd = jmpToFunctionEnd.concat(caseBody.jmpToFunctionEnd);

            let jumpToswitchEnd = new IR('jmp');
            jumpToswitchEndIRs.push(jumpToswitchEnd);

            endIR = jumpToswitchEnd;

            if (conditon.truelist.length != 0) {
                backPatch(conditon.truelist, caseBody.startIR.index);
            }
        }
        if (node['_switch'].defalutStmt != undefined) {
            let defaultBody = BlockScan(new BlockScope(scope, undefined, node['_switch'].defalutStmt, { program }), {
                label: option.label,
                frameLevel: option.frameLevel + 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                autoUnwinding: undefined,
                isTryBlock: undefined,
                functionWrapName: option.functionWrapName
            });

            jmpToFunctionEnd = jmpToFunctionEnd.concat(defaultBody.jmpToFunctionEnd);

            //如果default之前有分支，则回填falseList之后清空
            if (lastFalseList.length != 0) {
                backPatch(lastFalseList, defaultBody.startIR.index);
            }
            lastFalseList = [];

            if (startIR == undefined) {
                startIR = defaultBody.startIR;
            }

            let jumpToswitchEnd = new IR('jmp');
            jumpToswitchEndIRs.push(jumpToswitchEnd);
            endIR = jumpToswitchEnd;
        }

        assert(startIR != undefined);
        assert(endIR != undefined);

        //如果最后一个分支的falseList没有被回填(即没有被default处理掉)
        if (lastFalseList.length != 0) {
            backPatch(lastFalseList, endIR.index + 1n);
        }

        backPatch(jumpToswitchEndIRs, endIR.index + 1n);

        return { startIR: startIR, endIR: endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['_instanceof'] != undefined) {
        let nrRet = nodeRecursion(scope, node['_instanceof'].obj, {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let _instanceof = new IR('instanceof');
        typeRelocationTable.push({ t1: TypeUsedSign(node['_instanceof'].type), ir: _instanceof });
        return { startIR: nrRet.startIR, endIR: _instanceof, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['autounwinding'] != undefined) {
        assert(option.frameLevel != undefined);
        let autounwindingBody = BlockScan(new BlockScope(scope, undefined, node['autounwinding'].stmt, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: node['autounwinding'].unwinded,
            isTryBlock: undefined,
            functionWrapName: option.functionWrapName
        });
        return { startIR: autounwindingBody.startIR, endIR: autounwindingBody.endIR, truelist: [], falselist: [], jmpToFunctionEnd: autounwindingBody.jmpToFunctionEnd };
    }
    else if (node['pushUnwindHandler'] != undefined) {
        let nrRet = nodeRecursion(scope, node['pushUnwindHandler'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let endIR = new IR('push_unwind');
        return { startIR: nrRet.startIR, endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['trycatch'] != undefined) {
        let jmpToTryCatchEnds: IR[] = [];
        let push_catch_blocks: IR[] = [];
        let jmpToFunctionEnd: IR[] = [];
        let endIR: IR | undefined;
        assert(option.frameLevel != undefined);
        let startIR: IR | undefined;
        //逆序压入catch，保证前面的catch块在栈的前面
        for (let i = node['trycatch'].catch_list.length - 1; i >= 0; i--) {
            let item = node['trycatch'].catch_list[i];
            let ir = new IR('push_catch_block');
            typeRelocationTable.push({ t2: TypeUsedSign(item.catchType), ir });
            push_catch_blocks.push(ir);
            if (startIR == undefined) {
                startIR = ir;
            }
        }
        new IR('save_catch_point', node['trycatch'].catch_list.length);
        let tryBlockRet = BlockScan(new BlockScope(scope, undefined, node['trycatch'].tryBlock, { program }), {
            label: option.label,
            frameLevel: option.frameLevel + 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: option.inContructorRet,
            autoUnwinding: undefined,
            isTryBlock: true,
            functionWrapName: option.functionWrapName
        });
        jmpToFunctionEnd = jmpToFunctionEnd.concat(tryBlockRet.jmpToFunctionEnd);

        let jmpToTryCatchEnd = new IR('jmp');
        jmpToTryCatchEnds.push(jmpToTryCatchEnd);

        //顺序处理
        for (let i = 0; i < node['trycatch'].catch_list.length; i++) {
            let item = node['trycatch'].catch_list[i];
            let catchBlockRet = BlockScan(new BlockScope(scope, undefined, item.catchBlock, { program }), {
                label: option.label,
                frameLevel: option.frameLevel + 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                autoUnwinding: undefined,
                isTryBlock: undefined,
                functionWrapName: option.functionWrapName
            });
            push_catch_blocks[push_catch_blocks.length - 1 - i].operand1 = catchBlockRet.startIR.index;
            jmpToFunctionEnd = jmpToFunctionEnd.concat(catchBlockRet.jmpToFunctionEnd);
            //最后一个不需要jmp
            if (i != node['trycatch'].catch_list.length - 1) {
                let jmpToTryCatchEnd = new IR('jmp');
                jmpToTryCatchEnds.push(jmpToTryCatchEnd);
                endIR = jmpToTryCatchEnd;
            } else {
                endIR = catchBlockRet.endIR;
            }
        }
        assert(startIR != undefined);
        assert(endIR != undefined);
        backPatch(jmpToTryCatchEnds, endIR.index + 1n);
        return { startIR, endIR, truelist: [], falselist: [], jmpToFunctionEnd };
    }
    else if (node['loadException'] != undefined) {
        return { startIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], endIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['throwStmt'] != undefined) {
        let startIR = new IR('clear_calculate_stack');
        nodeRecursion(scope, node['throwStmt'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        assert(node['throwStmt'].type != undefined);
        let _throw = new IR('_throw');
        typeRelocationTable.push({ t1: TypeUsedSign(node['throwStmt'].type), ir: _throw });
        return { startIR, endIR: _throw, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['immediateArray'] != undefined) {
        assert(node.type != undefined);
        assert(node.type.ArrayType != undefined);
        let arrayLength = new IR('const_i32_load', node['immediateArray'].length);
        let endIR = new IR('newArray', undefined, 1, undefined);
        typeRelocationTable.push({ t1: TypeUsedSign(node.type), ir: endIR });

        for (let i = 0; i < node['immediateArray'].length; i++) {
            new IR('p_dup');//复制数组
            new IR('const_i32_load', i);//生成下标
            //计算元素值
            nodeRecursion(scope, node['immediateArray'][i], {
                label: undefined,
                frameLevel: undefined,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: undefined,
                functionWrapName: option.functionWrapName
            });
            if (isPointType(node.type.ArrayType.innerType)) {
                endIR = new IR('array_set_point');//设置值
            } else {
                endIR = new IR('array_set_valueType', propSize(node.type.ArrayType.innerType));//设置值
            }
        }
        return { startIR: arrayLength, endIR, truelist: [], falselist: [], jmpToFunctionEnd: [] };
    }
    else if (node['negative'] != undefined) {
        nodeRecursion(scope, node['negative'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let typeName = TypeUsedSign(node.type!);
        let ir: IR;
        switch (typeName) {
            case 'system.byte':
                ir = new IR('i8_negative');
                break;
            case 'system.short':
                ir = new IR('i16_negative');
                break;
            case 'system.int':
                ir = new IR('i32_negative');
                break;
            case 'system.long':
                ir = new IR('i64_negative');
                break;
            case 'system.double':
                ir = new IR('double_negative');
                break;
            default: throw `无法取负号的类型${typeName}`;
        }
        return { startIR: ir, endIR: ir, truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else if (node['positive'] != undefined) {
        nodeRecursion(scope, node['positive'], {
            label: undefined,
            frameLevel: undefined,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: option.singleLevelThis,
            inContructorRet: undefined,
            functionWrapName: option.functionWrapName
        });
        let typeName = TypeUsedSign(node.type!);
        if (
            typeName != 'system.byte' &&
            typeName != 'system.short' &&
            typeName != 'system.int' &&
            typeName != 'system.long' &&
            typeName != 'system.double'
        ) {
            throw `只有 byte、short、int、long、double才能取负号`;
        }
        //positive不需要生成指令，计算栈中的数据原样保留即可
        return { startIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], endIR: nowIRContainer.irs[nowIRContainer.irs.length - 1], truelist: [], falselist: [], jmpToFunctionEnd: [], isRightValueTypeVariable: true };
    }
    else { throw `未支持的AST类型` };
}
function putfield(type: TypeUsed, offset: number, truelist: IR[], falselist: IR[]): IR {
    if (truelist.length > 0 || falselist.length > 0) {
        let trueIR = new IR('const_i8_load', 1);
        let jmp = new IR('jmp');
        let falseIR = new IR('const_i8_load', 0);
        jmp.operand1 = falseIR.index - jmp.index + falseIR.length;
        backPatch(truelist, trueIR.index);//回填true
        backPatch(falselist, falseIR.index);//回填false
    }
    let endIR: IR;
    if (isPointType(type)) {
        endIR = new IR('p_putfield', offset);
    } else {
        endIR = new IR('valueType_putfield', offset, propSize(type));
    }
    return endIR;
}
/**
 * 扫描函数对象中的block
 * @param blockScope 
 * @param label 
 * @param argumentMap 
 * @param frameLevel block的层级，从function开始为1，每次遇到嵌套的block则加一
 * @param singleLevelThis 在构造函数和init代码遇到this节点只需要取一层，成员函数中需要取两层，要向下传递(函数中定义的函数也要保持一致)，program中的函数和扩展函数不允许使用this,取值无所谓
 * @returns 
 */
function BlockScan(blockScope: BlockScope,
    option: {
        label: undefined | { name: string, frameLevel: number, breakIRs: IR[], continueIRs: IR[] }[],//for while的label,jmpIRs:break或者continue的列表，需要向下传递
        frameLevel: number,//给ret、break、continue提供popup_stackFrame参数，需要向下传递,并且遇到新block的时候要+1
        isGetAddress: undefined | boolean,//是否读取地址,比如 int a; a.toString(); 这里的load a就是读取a的地址而不是值，只有accessField和callEXM的子节点取true，影响accessField和load节点
        /**
         * 因为机器码的if指令如果命中则跳转，不命中则执行下一条指令，所以要想实现分支就要利用这个特性，bool反向的时候，jmp目标是falseIR，所以下一条应该是trueIR，不反向的时候，目标是trueIR，所以下一条指令是falseIR
         * 因为&&指令流如下:
         *      trueIR
         *      jmp
         *      false
         * ||指令流如下:
         *      false
         *      jmp
         *      true
         * 所以只有||的直接左子节点条件跳转指令是正常生成的true，其他都是false
         */
        boolForward: undefined | boolean,
        isAssignment: undefined | boolean,//是否是对某个成员或者局部变量赋值，在处理=的时候有用到,如果是左值节点，则load、getField、[]不生成真实指令，默认false，只有=左子节点取true
        singleLevelThis: undefined | boolean, //是否为普通函数(影响block内部对this的取值方式)，需要向下传递,用于calss的init和construct
        inContructorRet: undefined | boolean,//是否处于构造函数中，影响Ret指令的生成
        autoUnwinding: undefined | number,//需要自动释放的变量数量,有且仅有autounwinding节点才用到
        isTryBlock: undefined | boolean,//是否是tryCatch的Block
        functionWrapName: string,//函数包裹类的名字，给loadFunctionWrap节点提取函数包裹类名字，从functionObjGen向下传递
    }
): { startIR: IR, endIR: IR, jmpToFunctionEnd: IR[], stackFrame: { name: string, type: TypeUsed }[] } {

    assert(typeof option.frameLevel == 'number');
    assert(typeof option.singleLevelThis == 'boolean');
    assert(typeof option.inContructorRet == 'boolean');
    assert(typeof option.functionWrapName == 'string');


    let stackFrameMapIndex = globalVariable.stackFrameMapIndex++;
    let startIR: IR = new IR('push_stack_map', undefined, undefined, undefined);
    stackFrameRelocationTable.push({ sym: `@StackFrame_${stackFrameMapIndex}`, ir: startIR });

    if (option.frameLevel == 1) {//处于函数scope中
        //任何函数(除了扩展函数)都需要这个变量，这个变量保存着this指针或者包裹类指针的值
        new IR('init_p_store', 0);//保存this或者包裹类指针
    }
    let endIR: IR;
    let jmpToFunctionEnd: IR[] = [];//记录所有返回指令;
    for (let i = 0; i < blockScope.block!.body.length; i++) {
        let nodeOrBlock = blockScope.block!.body[i];
        if (nodeOrBlock.desc == 'ASTNode') {
            let nodeRet = nodeRecursion(blockScope, nodeOrBlock as ASTNode, {
                label: option.label,
                frameLevel: option.frameLevel,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                functionWrapName: option.functionWrapName
            });
            endIR = nodeRet.endIR;
            if (nodeRet.jmpToFunctionEnd) {
                jmpToFunctionEnd = jmpToFunctionEnd.concat(nodeRet.jmpToFunctionEnd);
            }

            /**
             * 下面这两种stmt需要清理栈
             * new obj();
             * fun();
            */
            let stmtType = (nodeOrBlock as ASTNode).type!;
            if ((stmtType?.PlainType?.name != 'void') && ((nodeOrBlock as ASTNode)['_new'] != undefined || (nodeOrBlock as ASTNode)['call'] != undefined)) {
                if (isPointType(stmtType)) {
                    endIR = new IR('p_pop');
                } else {
                    new IR('valueType_pop', propSize(stmtType));
                }
            }
        } else {
            let block = nodeOrBlock as Block;
            let blockRet = BlockScan(new BlockScope(blockScope, undefined, block, { program }), {
                label: option.label,
                frameLevel: option.frameLevel + 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: option.singleLevelThis,
                inContructorRet: option.inContructorRet,
                autoUnwinding: undefined,
                isTryBlock: undefined,
                functionWrapName: option.functionWrapName
            });
            endIR = blockRet.endIR;
            for (let ir of blockRet.jmpToFunctionEnd) {
                jmpToFunctionEnd.push(ir);
            }
        }
    }



    let lastNode = blockScope.block!.body[blockScope.block!.body.length - 1];
    let needPopupStackFrame = true;//本block最后一条指令是否需要弹出stackFrame
    //最后一个节点是AST而不是block
    if (lastNode?.desc == 'ASTNode') {
        let lastASTNode: ASTNode = lastNode as ASTNode;
        if (lastASTNode.ret != undefined || lastASTNode._continue != undefined || lastASTNode._break != undefined) {
            needPopupStackFrame = false;
        }
    }
    if (needPopupStackFrame) {
        if (option.frameLevel == 1 && option.inContructorRet) {//当前Block是函数最外层block，且在构造函数中
            new IR('p_load', 0);//读取this指针到计算栈
        }
        endIR = new IR('pop_stack_map', 1);
    }


    //到这里scope的所有def已经解析完毕，可以保存了
    let stackFrame: { name: string, type: TypeUsed }[] = [];
    if (option.frameLevel == 1) {//处于函数scope中
        stackFrame.push({ name: '@this_or_funOjb', type: { PlainType: { name: 'system.object' } } });
    }

    for (let k in blockScope.property) {
        stackFrame.push({ name: k, type: blockScope.getProp(k).prop.type! });
    }

    let frameSize = 0;
    for (let frameItem of stackFrame) {
        frameSize += propSize(frameItem.type);
    }
    stackFrameTable[`@StackFrame_${stackFrameMapIndex}`] = { baseOffset: blockScope.baseOffset, size: frameSize, isFunctionBlock: option.frameLevel == 1, isTryBlock: option.isTryBlock ?? false, autoUnwinding: option.autoUnwinding ?? 0, frame: stackFrame };
    return { startIR: startIR, endIR: endIR!, jmpToFunctionEnd: jmpToFunctionEnd, stackFrame };
}
function propSize(type: TypeUsed): number {
    if (type.PlainType != undefined) {
        if (!isPointType(type)) {
            return program.getDefinedType(type.PlainType.name).size!;
        } else {
            return globalVariable.pointSize;
        }
    } else {
        return globalVariable.pointSize;
    }
}
/**
 * 生成函数对象
 * @param blockScope 
 * @param fun 
 * @param nativeName native名字
 * @returns wrapClassName:函数包裹类型名、realTypeName:函数真实类型名、text:函数代码的符号名
 */
function functionObjGen(blockScope: BlockScope, fun: FunctionType, option?: { nativeName?: string }): { wrapClassName: string, realTypeName: string, text: string, irContainer: IRContainer } {
    let lastSymbol = IRContainer.getContainer();//类似回溯，保留现场
    let functionIndex = globalVariable.functionIndex++;
    let functionWrapName = `@functionWrap_${functionIndex}`;
    let property: VariableDescriptor = {};
    //为函数对象创建一些必要值(this和捕获变量)
    property['@this'] = {
        variable: 'val',
        type: {
            PlainType: { name: 'system.object' }
        }
    };
    for (let c in fun.capture) {
        property[c] = {
            variable: 'val',
            type: blockScope.getProp(c).prop.type//向上查找闭包包裹类的类型
        };
    }
    blockScope.parent = undefined;//查询完捕获变量之后切断和外层函数的联系
    //注册函数容器
    program.setDefinedType(functionWrapName, {
        namespace: '',
        _constructor: {},
        property: property,
        size: globalVariable.pointSize + Object.keys(fun.capture).length * globalVariable.pointSize
    });
    programScope.registerClass(functionWrapName);//注册类型
    registerType({ PlainType: { name: functionWrapName } });//在类型表中注册函数包裹类的类型
    let functionIRContainer = new IRContainer(`@function_${functionIndex}`);
    IRContainer.setContainer(functionIRContainer);
    if (!fun.isNative) {
        let BlockScanRet = BlockScan(blockScope, {
            label: [],
            frameLevel: 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: false,
            inContructorRet: false,
            autoUnwinding: undefined,
            isTryBlock: undefined,
            functionWrapName: functionWrapName
        });
        let retIR = new IR('ret');
        for (let ir of BlockScanRet.jmpToFunctionEnd) {
            ir.operand1 = retIR.index - ir.index;//处理所有ret jmp
        }
    } else {
        if (option?.nativeName == undefined) {
            /**
             * 其实也是可以生成的，但是有点麻烦，所以暂时不做
             * 比如:
             * function Add():void{navie};
             * def:
             * {
             *      Add:{
             *          type:{
             *              FunctionType:{
             *                  isNative:true
             *              }
             *          }
             *      }
             * }
             * 在解析到type:{functionType}这个AST的时候还要向上查找函数名字Add,太麻烦了，先不做
             */
            throw `暂时只支持定义在program空间的native函数`;
        }
        let argList: { size: number, isValueType: boolean }[] = [];
        let argNames = Object.keys(fun._arguments);
        for (let arg of argNames) {
            argList.push({ size: propSize(fun._arguments[arg].type!), isValueType: !isPointType(fun._arguments[arg].type!) })
        }
        let resultIsValueType = true;//默认为true,void对应的也是true，不需要VM托管
        let retSize = 0;
        if (fun.retType?.PlainType?.name != 'void') {
            retSize = propSize(fun.retType!);
            resultIsValueType = !isPointType(fun.retType!);
        }
        let index = nativeTable.push({ name: option?.nativeName!, argList, retSize, resultIsValueType });
        new IR('native_call', index);//调用native函数
        new IR('ret');
    }
    IRContainer.setContainer(lastSymbol);//回退
    return { wrapClassName: functionWrapName, realTypeName: FunctionSign(fun), text: functionIRContainer.name, irContainer: functionIRContainer };
}

/**
 * 生成一个普通函数(构造函数和操作符重载函数)，这些函数不能作为函数对象返回，因为没有函数包裹类
 * @param blockScope 
 * @param fun 
 * @param functionName 函数在符号表中的名字
 * @returns 
 */
function constructorFunctionGen(blockScope: BlockScope, fun: FunctionType, functionName: string): { text: string, irContainer: IRContainer } {
    let lastSymbol = IRContainer.getContainer();//类似回溯，保留现场
    let functionIRContainer = new IRContainer(functionName);
    IRContainer.setContainer(functionIRContainer);
    let blockScanRet = BlockScan(blockScope, {
        label: [],
        frameLevel: 1,
        isGetAddress: undefined,
        boolForward: undefined,
        isAssignment: undefined,
        singleLevelThis: true,
        inContructorRet: true,
        autoUnwinding: undefined,
        isTryBlock: undefined,
        functionWrapName: '@unknow'
    });
    let retIR = new IR('ret');
    for (let ir of blockScanRet.jmpToFunctionEnd) {
        ir.operand1 = retIR.index - ir.index;//处理所有ret jmp
    }
    IRContainer.setContainer(lastSymbol);//回退
    return { text: functionIRContainer.name, irContainer: functionIRContainer };
}
/**
 * 这个函数用于创建一个扩展函数对象
 * 里面代码和constructorFunctionGen基本一样，两个区别
 * 1.因为不是构造调用，所以返回的时候不需要往计算栈写指针了
 * 2.因为没有this和包裹类,所以最前面的代码省略了alloc 8和p_store这两条
 * @param blockScope 
 * @param fun 
 * @param functionName 函数在符号表中的名字
 * @returns 
 */
function extensionMethodWrapFunctionGen(blockScope: BlockScope, fun: FunctionType, functionName: string, extendTypeName: string): { text: string, irContainer: IRContainer } {
    let lastSymbol = IRContainer.getContainer();//类似回溯，保留现场
    let functionIRContainer = new IRContainer(functionName);
    IRContainer.setContainer(functionIRContainer);

    let stackFrameMapIndex = globalVariable.stackFrameMapIndex++;
    let startIR: IR = new IR('push_stack_map', undefined, undefined, undefined);
    stackFrameRelocationTable.push({ sym: `@StackFrame_${stackFrameMapIndex}`, ir: startIR });
    /**
     * 扩展函数体只有两个节点，第一个是定义捕获闭包类，第二个是ret一个函数
     * 这个捕获闭包类只有一个成员，就是扩展的this,所以强制cast，使得这个闭包类和原来对象重叠即可
     * 所以如果是值类型，是不需要初始化这个闭包了，否则这个闭包持有的对象就是新的值了
     * 通过忽略第一个节点，伪装成已经把值类型变量捕获了(这种方式可以让这个扩展函数操作变量时,实际操作的是原来的变量,但是会带来GC无法识别的问题)
     * 因为GC问题，不伪装了
     * 
     * 下面是伪装代码：
     * 同时还要配合callEXM节点的伪装代码进行，把isGetAddress改为true，同时对右值的值类型装箱
     * 现在直接放弃，估计C#也是有类似的考虑，本来想秒了C#的，因为GC问题，秒不了了
     */
    //值类型的话，第一个AST直接忽略
    /*
    if (program.getDefinedType(extendTypeName)?.modifier == 'valuetype') {
        new IR('init_p_store', 0);

        let name = Object.keys((fun.body!.body[0] as ASTNode).def!)[0];
        blockScope.setProp(name, (fun.body!.body[0] as ASTNode).def![name]);


        let nrRet = nodeRecursion(blockScope, (fun.body!.body[1] as ASTNode), {
            label: undefined,
            frameLevel: 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: true,
            inContructorRet: false,
            functionWrapName: '@unknow'
        });
        let retIR = new IR('ret');
        nrRet.jmpToFunctionEnd![0].operand1 = retIR.index - nrRet.jmpToFunctionEnd![0].index;// 有且仅有一个ret语句
    } else {
        nodeRecursion(blockScope, (fun.body!.body[0] as ASTNode), {
            label: undefined,
            frameLevel: 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: true,
            inContructorRet: false,
            functionWrapName: '@unknow'
        });
        let nrRet2 = nodeRecursion(blockScope, (fun.body!.body[1] as ASTNode), {
            label: undefined,
            frameLevel: 1,
            isGetAddress: undefined,
            boolForward: undefined,
            isAssignment: undefined,
            singleLevelThis: true,
            inContructorRet: false,
            functionWrapName: '@unknow'
        });
        let retIR = new IR('ret');
        nrRet2.jmpToFunctionEnd![0].operand1 = retIR.index - nrRet2.jmpToFunctionEnd![0].index;// 有且仅有一个ret语句
    }
    */

    nodeRecursion(blockScope, (fun.body!.body[0] as ASTNode), {
        label: undefined,
        frameLevel: 1,
        isGetAddress: undefined,
        boolForward: undefined,
        isAssignment: undefined,
        singleLevelThis: true,
        inContructorRet: false,
        functionWrapName: '@unknow'
    });
    let nrRet2 = nodeRecursion(blockScope, (fun.body!.body[1] as ASTNode), {
        label: undefined,
        frameLevel: 1,
        isGetAddress: undefined,
        boolForward: undefined,
        isAssignment: undefined,
        singleLevelThis: true,
        inContructorRet: false,
        functionWrapName: '@unknow'
    });
    let retIR = new IR('ret');
    nrRet2.jmpToFunctionEnd![0].operand1 = retIR.index - nrRet2.jmpToFunctionEnd![0].index;// 有且仅有一个ret语句

    //都不加stackFrame_popup了,因为第二个AST就是ret语句，已经有了
    let stackFrame: { name: string, type: TypeUsed }[] = [];
    stackFrame.push({ name: '@this_or_funOjb', type: { PlainType: { name: 'system.object' } } });

    let frameSize = 0;
    for (let frameItem of stackFrame) {
        frameSize += propSize(frameItem.type);
    }

    stackFrameTable[`@StackFrame_${stackFrameMapIndex}`] = { baseOffset: blockScope.baseOffset, size: frameSize, isFunctionBlock: true, isTryBlock: false, autoUnwinding: 0, frame: stackFrame };

    IRContainer.setContainer(lastSymbol);//回退
    return { text: functionIRContainer.name, irContainer: functionIRContainer };
}
function classScan(classScope: ClassScope) {
    let lastSymbol = IRContainer.getContainer();//类似回溯，保留现场
    let symbol = new IRContainer(`${classScope.className}_init`);
    IRContainer.setContainer(symbol);
    let startIR: IR = new IR('push_stack_map', undefined, undefined, undefined);
    stackFrameRelocationTable.push({ sym: `@StackFrame_0`, ir: startIR });
    new IR('init_p_store', 0);//保存this指针
    //扫描property
    for (let propName of classScope.getPropNames()) {
        let prop = classScope.getProp(propName).prop;
        let offset = classScope.getPropOffset(propName);
        if (prop.initAST != undefined) {
            new IR('p_load', 0);
            let nr = nodeRecursion(classScope, prop.initAST, {
                label: undefined,
                frameLevel: 1,
                isGetAddress: undefined,
                boolForward: undefined,
                isAssignment: undefined,
                singleLevelThis: true,
                inContructorRet: false,
                functionWrapName: '@unknow'
            });
            putfield(prop.type!, offset, nr.truelist, nr.falselist);
        } else if (prop.type?.FunctionType && (prop.type?.FunctionType.body || prop.type?.FunctionType.isNative)) {//后面两个条件表示函数定义
            if (prop.type?.FunctionType.isNative && propName.startsWith('@operatorOverload')) {
                //native运算符重载不生成代码，表示虚拟机自带指令可以实现，比如int的+操作
            } else {
                let blockScope = new BlockScope(classScope, prop.type?.FunctionType, prop.type?.FunctionType.body!, { program });
                let fun = functionObjGen(blockScope, prop.type?.FunctionType);
                new IR('p_load', 0);
                let newIR = new IR('newFunc', undefined, undefined, undefined);
                irAbsoluteAddressRelocationTable.push({ sym: fun.text, ir: newIR });
                typeRelocationTable.push({ t2: fun.realTypeName, t3: fun.wrapClassName, ir: newIR });
                new IR('p_dup');//复制一份functionWrap，用来设置this
                new IR('p_load', 0);//读取this
                new IR('p_putfield', 0);//设置this
                new IR('p_putfield', offset);//设置函数对象
            }
        } else {
            if (!isPointType(prop.type!)) {
                let typeName = TypeUsedSign(prop.type!);
                //系统内置值类型不调用_init函数
                switch (typeName) {
                    case 'system.bool': {
                        new IR('p_load', 0);
                        new IR('const_i8_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.byte': {
                        new IR('p_load', 0);
                        new IR('const_i8_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.short': {
                        new IR('p_load', 0);
                        new IR('const_i16_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.int': {
                        new IR('p_load', 0);
                        new IR('const_i32_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.long': {
                        new IR('p_load', 0);
                        new IR('const_i64_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.double': {
                        let buffer = new ArrayBuffer(8);
                        let dv = new DataView(buffer);
                        dv.setFloat64(0, 0, true);
                        new IR('p_load', 0);
                        new IR('const_double_load', dv.getBigInt64(0, true));
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    case 'system.object': {
                        new IR('p_load', 0);
                        new IR('const_i64_load', 0);
                        new IR('valueType_putfield', offset, propSize(prop.type!));
                        break;
                    }
                    default: {
                        new IR('p_load', 0);
                        new IR('getfield_address', offset);
                        let initCall = new IR('abs_call', undefined, undefined, undefined);
                        irAbsoluteAddressRelocationTable.push({ sym: `${prop.type!.PlainType!.name}_init`, ir: initCall });
                        new IR('p_pop');//弹出init创建的指针
                        break;
                    }
                }
            }
        }
    }
    //扫描构造函数
    for (let constructorName in program.getDefinedType(classScope.className)._constructor) {
        let _constructor = program.getDefinedType(classScope.className)._constructor[constructorName];
        _constructor.retType = { PlainType: { name: 'void' } };//所有构造函数不允许有返回值
        let blockScope = new BlockScope(classScope, _constructor, _constructor.body!, { program });
        let sign = `@constructor:${classScope.className} ${constructorName}`;//构造函数的签名
        constructorFunctionGen(blockScope, _constructor, sign);
    }
    new IR('p_load', 0);//读取this指针到计算栈
    new IR('pop_stack_map', 1);
    new IR('ret');//classInit返回
    IRContainer.setContainer(lastSymbol);//回退
}
/**
 * 创建propertyDescriptor，program和每个class都创建一个，成员的tpye引用typeTable的序号
 * @param property 
 */
function ClassTableItemGen(property: VariableDescriptor, size: number, className: string, isValueType: boolean) {
    let classNamePoint = stringPool.register(className);
    let props: { name: number, type: number }[] = [];
    for (let k in property) {
        let name = stringPool.register(k);
        let typeSign = TypeUsedSign(property[k].type!);
        let type = typeTable[typeSign].index;
        props.push({ name, type });
    }
    classTable.items.push({ name: classNamePoint, size: size, isValueType: isValueType, props: props });
}
function TypeTableGen() {
    let innerType: number;
    for (let name in typeTable) {
        let namePoint = stringPool.register(name);
        let typeDesc: typeItemDesc;
        if (typeTable[name].type.ArrayType != undefined) {
            typeDesc = typeItemDesc.Array;
            innerType = typeTable[TypeUsedSign(typeTable[name].type.ArrayType?.innerType!)].index
        } else if (typeTable[name].type.FunctionType != undefined) {
            typeDesc = typeItemDesc.Function;
            innerType = typeTable[name].index;
        } else if (typeTable[name].type.PlainType != undefined) {
            typeDesc = typeItemDesc.PlaintObj;
            if (typeTable[name].type.PlainType?.name == 'void') {
                innerType = -1;
            } else {
                innerType = classTable.getClassIndex(typeTable[name].type.PlainType?.name!);
            }
        } else {
            typeDesc = typeItemDesc.PlaintObj;
            innerType = classTable.getClassIndex('@program');
        }
        binTypeTable.items.push({ name: namePoint, desc: typeDesc, innerType });
    }
}
function stackFrameTableGen() {
    for (let itemKey in stackFrameTable) {
        let frame: { baseOffset: number, isTryBlock: boolean, size: number, isFunctionBlock: boolean, autoUnwinding: number, props: { name: number, type: number }[] } = {
            baseOffset: stackFrameTable[itemKey].baseOffset,
            autoUnwinding: stackFrameTable[itemKey].autoUnwinding,
            isTryBlock: stackFrameTable[itemKey].isTryBlock,
            isFunctionBlock: stackFrameTable[itemKey].isFunctionBlock,
            size: stackFrameTable[itemKey].size,
            props: []
        };
        for (let variable of stackFrameTable[itemKey].frame) {
            frame.props.push({
                name: stringPool.register(variable.name),
                type: typeTable[TypeUsedSign(variable.type)].index
            });
        }
        binStackFrameTable.push(frame, itemKey);
    }
}
//输出所有需要的文件
function finallyOutput() {
    //注册@program
    ClassTableItemGen(programScope.realProp, program.size!, '@program', false);
    registerType({ PlainType: { name: '@program' } });
    for (let k of program.getDefinedTypeNames()) {
        ClassTableItemGen(program.getDefinedType(k).property, program.getDefinedType(k).size!, k, program.getDefinedType(k).modifier == 'valuetype');
    }
    fs.writeFileSync(`output/classTable.bin`, Buffer.from(classTable.toBinary()));
    fs.writeFileSync(`output/classTable.json`, JSON.stringify(classTable.items, null, 4));

    TypeTableGen();
    fs.writeFileSync(`output/typeTable.bin`, Buffer.from(binTypeTable.toBinary()));
    fs.writeFileSync(`output/typeTable.json`, JSON.stringify(binTypeTable.items, null, 4));
    // fs.writeFileSync(`output/typeTableForDebug.json`, JSON.stringify(typeTable, null, 4));//避免出现循环引用

    stackFrameTableGen();
    fs.writeFileSync(`output/stackFrameTable.bin`, Buffer.from(binStackFrameTable.toBinary()));
    fs.writeFileSync(`output/stackFrameTable.json`, JSON.stringify(binStackFrameTable.getItems(), null, 4));

    let linkRet = link(programScope);
    fs.writeFileSync(`output/text.bin`, Buffer.from(linkRet.text));
    fs.writeFileSync(`output/text.json`, JSON.stringify(linkRet.debugIRS));
    fs.writeFileSync(`output/irTable.bin`, Buffer.from(linkRet.irTableBuffer));
    fs.writeFileSync(`output/irTable.json`, JSON.stringify([...linkRet.irTable]));

    fs.writeFileSync(`output/nativeTable.bin`, Buffer.from(nativeTable.toBinary()));
    fs.writeFileSync(`output/nativeTable.json`, nativeTable.toString());

    fs.writeFileSync(`output/stringPool.bin`, Buffer.from(stringPool.toBinary()));//字符串池最后输出
    fs.writeFileSync(`output/stringPool.json`, JSON.stringify(stringPool.items, null, 4));
}
export default function programScan() {
    programScope = new ProgramScope(program, { program: program });

    //给class_init分配的frame
    let stackFrame = [{ name: '@this', type: { PlainType: { name: `system.object` } } }];
    let frameSize = 0;
    for (let frameItem of stackFrame) {
        frameSize += propSize(frameItem.type);
    }

    stackFrameTable[`@StackFrame_0`] = { baseOffset: 0, size: frameSize, isTryBlock: false, isFunctionBlock: true, autoUnwinding: 0, frame: stackFrame };

    let symbol = new IRContainer('@program_init');
    IRContainer.setContainer(symbol);
    let startIR: IR = new IR('push_stack_map', undefined, undefined, undefined);
    stackFrameRelocationTable.push({ sym: `@StackFrame_0`, ir: startIR });

    //扫描property
    for (let spaceName in program.propertySpace) {
        setScopeSpaceName(spaceName);
        for (let variableName in program.propertySpace[spaceName]) {
            var prop = program.propertySpace[spaceName][variableName];
            let offset = programScope.getPropOffset(variableName);
            if (prop.initAST != undefined) {
                new IR('program_load');
                let nr = nodeRecursion(programScope, prop.initAST, {
                    label: undefined,
                    frameLevel: 1,
                    isGetAddress: undefined,
                    boolForward: undefined,
                    isAssignment: undefined,
                    singleLevelThis: false,
                    inContructorRet: false,
                    functionWrapName: '@unknow'
                });
                putfield(prop.type!, offset, nr.truelist, nr.falselist);
            } else if (prop.type?.FunctionType && (prop.type?.FunctionType.body || prop.type?.FunctionType.isNative)) {//如果是函数定义则生成函数
                let blockScope = new BlockScope(programScope, prop.type.FunctionType, prop.type?.FunctionType.body!, { program });
                let fun = functionObjGen(blockScope, prop.type.FunctionType, { nativeName: `${spaceName}.${variableName}`.replaceAll('.', '_') });//把所有nativeFunctioin的.全部换成下划线
                new IR('program_load');
                let newIR = new IR('newFunc', undefined, undefined, undefined);
                irAbsoluteAddressRelocationTable.push({ sym: fun.text, ir: newIR });
                typeRelocationTable.push({ t2: fun.realTypeName, t3: fun.wrapClassName, ir: newIR });
                putfield(prop.type, offset, [], []);
            } else {
                if (!isPointType(prop.type!)) {

                    let typeName = TypeUsedSign(prop.type!);
                    //系统内置值类型不调用_init函数
                    switch (typeName) {
                        case 'system.bool': {
                            new IR('program_load');
                            new IR('const_i8_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.byte': {
                            new IR('program_load');
                            new IR('const_i8_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.short': {
                            new IR('program_load');
                            new IR('const_i16_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.int': {
                            new IR('program_load');
                            new IR('const_i32_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.long': {
                            new IR('program_load');
                            new IR('const_i64_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.double': {
                            let buffer = new ArrayBuffer(8);
                            let dv = new DataView(buffer);
                            dv.setFloat64(0, 0, true);
                            new IR('program_load');
                            new IR('const_double_load', dv.getBigInt64(0, true));
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        case 'system.object': {
                            new IR('program_load');
                            new IR('const_i64_load', 0);
                            new IR('valueType_putfield', offset, propSize(prop.type!));
                            break;
                        }
                        default: {
                            new IR('program_load');
                            new IR('getfield_address', offset);
                            let initCall = new IR('abs_call', undefined, undefined, undefined);
                            irAbsoluteAddressRelocationTable.push({ sym: `${prop.type!.PlainType!.name}_init`, ir: initCall });
                            new IR('p_pop');//弹出init创建的指针
                            break;
                        }
                    }
                }
            }
        }
    }
    new IR('pop_stack_map', 1);
    new IR('ret');//programInit返回
    for (let typeName of program.getDefinedTypeNames()) {
        //系统内置类型不生成代码
        if (
            typeName == "system.bool" ||
            typeName == "system.byte" ||
            typeName == "system.short" ||
            typeName == "system.int" ||
            typeName == "system.long" ||
            typeName == "system.double" ||
            typeName == "system.object" ||
            typeName == "@null"
        ) {
            continue;
        } else {
            let lastNameSpace = getScopeSpaceName();
            setScopeSpaceName(program.getDefinedType(typeName).namespace);
            classScan(programScope.getClassScope(typeName));
            setScopeSpaceName(lastNameSpace);
        }
    }
    //为所有类生成扩展方法
    for (let extendTypeName in program.extensionMethodsImpl) {
        for (let methodName in program.extensionMethodsImpl[extendTypeName]) {
            let funType = program.extensionMethodsImpl[extendTypeName][methodName];
            let blockScope = new BlockScope(programScope, funType, funType.body!, { program, isEXM: true });
            extensionMethodWrapFunctionGen(blockScope, funType, `@extension@${extendTypeName}@${methodName}`, extendTypeName);
        }
    }

    finallyOutput();
}