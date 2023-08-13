//预处理AST
import { assert, isPointType } from './codeGen.js';
import { program, globalVariable, typeTable } from './ir.js';
import { FunctionSignWithArgumentAndRetType, TypeUsedSign, FunctionSignWithArgument } from './lib.js';
import { Scope, BlockScope, ClassScope, ProgramScope, setScopeSpaceName, getScopeSpaceName } from './scope.js';
import { ClassSpecialize, FunctionSpecialize } from './templateSpecialize.js';
let programScope: ProgramScope;
function OperatorOverLoad(scope: Scope, leftObj: ASTNode, rightObj: ASTNode | undefined, originNode: ASTNode, op: opType | opType2): { type: TypeUsed, location?: 'prop' | 'field' | 'stack' | 'array_element' } {
    let leftType = nodeRecursion(scope, leftObj, [], {}).type;
    if (leftType?.PlainType?.name == 'void') {
        throw `void类型没有重载操作符${op}`;
    }
    registerType(leftType);
    //双目运算符
    if (rightObj != undefined) {
        let rightType = nodeRecursion(scope, rightObj, [], {}).type;
        registerType(rightType);
        //如果是数组的[]运算
        if (op == '[]' && leftType.ArrayType != undefined) {
            typeCheck(rightType, { PlainType: { name: 'system.int' } }, `数组索引必须是int`);
            return { type: leftType.ArrayType.innerType, location: 'array_element' };
        } else {
            if (leftType.PlainType) {
                //null只可以赋值和做==比较
                if (op == '==' && (TypeUsedSign(leftType) == '@null' || TypeUsedSign(rightType) == '@null')) {
                    typeCheck(leftType, rightType, '');
                    //由vm实现，不生成操作符重载代码
                    return { type: { PlainType: { name: 'system.bool' } } };
                }
                else {
                    let sign = FunctionSignWithArgument([rightType]);
                    let funName = `@operatorOverload@${op}@${sign}`;
                    let opFunctionField = program.getDefinedType(leftType.PlainType!.name).property[funName];
                    if (opFunctionField == undefined) {
                        throw `类型${TypeUsedSign(leftType)}没有 ${op} (${TypeUsedSign(rightType)})的重载函数`;
                    }
                    //如果不是undefined就可以下断言了
                    assert(opFunctionField.type != undefined);
                    assert(opFunctionField.type.FunctionType != undefined);
                    assert(opFunctionField.type.FunctionType.retType != undefined);
                    if (opFunctionField.type.FunctionType.isNative == undefined || !opFunctionField.type.FunctionType.isNative) {
                        delete originNode[op];//删除原来的操作符
                        originNode.call = { functionObj: { desc: 'ASTNode', accessField: { obj: leftObj, field: `@operatorOverload@${op}@${sign}` } }, _arguments: [rightObj] };//改为函数调用
                    } else {
                        //由vm实现，不生成操作符重载代码
                    }
                    return { type: opFunctionField.type!.FunctionType!.retType! };//文法规定了操作符重载必须声明返回值类型，这里是安全的
                }
            } else {
                //是函数类型和数组类型
                throw `类型${TypeUsedSign(leftType)}没有操作符${op}`;
            }
        }
    }
    //单目运算符
    else {
        if (leftType.PlainType) {
            let sign = FunctionSignWithArgument([]);
            let funName = `@operatorOverload@${op}@${sign}`;
            let opFunctionField = program.getDefinedType(leftType.PlainType!.name).property[funName];
            if (opFunctionField != undefined) {
                assert(opFunctionField.type != undefined);
                assert(opFunctionField.type.FunctionType != undefined);
                assert(opFunctionField.type.FunctionType.retType != undefined);
                if (opFunctionField.type.FunctionType.isNative == undefined || !opFunctionField.type.FunctionType.isNative) {
                    delete originNode[op];//删除原来的操作符
                    originNode.call = { functionObj: { desc: 'ASTNode', accessField: { obj: leftObj, field: `@operatorOverload@${op}@${sign}` } }, _arguments: [] };
                } else {
                    //由vm实现
                }
            }
            else {
                throw `类型${TypeUsedSign(leftType)}没有操作符${op}`;
            }
            return { type: opFunctionField.type.FunctionType.retType! };//文法规定了操作符重载必须声明返回值类型，这里是安全的
        }
        else {
            throw `类型${TypeUsedSign(leftType)}没有操作符${op}`;
        }
    }
}
/**
 * 类型检查,a、b类型必须相同，exception可以匹配任意类型
 * @param a 
 * @param b 
 */
function typeCheck(a: TypeUsed, b: TypeUsed, msg: string): void {
    let ta = TypeUsedSign(a);
    let tb = TypeUsedSign(b);
    if (ta == '@exception' || tb == '@exception') {//遇到exception不作判断，因为throw语句可以结束代码块
        return;
    }
    if (ta == '@null') {
        if (!isPointType(b) && TypeUsedSign(b) != 'system.object') {
            throw `只有引用类型或者system.object才能和null运算`;
        }
    }
    else if (tb == '@null') {
        if (!isPointType(a) && TypeUsedSign(a) != 'system.object') {
            throw `只有引用类型或者system.object才能和null运算`;
        }
    }
    else if (ta != tb) {
        throw `类型不匹配:${ta} - ${tb}:   ${msg}`;
    }
}
/**
 * 推导AST类型
 * @param scope 
 * @param node 
 * @param assignmentObj 赋值语句a=b中的b
 * @param declareRetType 保存返回值类型的地方
 * type表示AST推导出来的类型
 * retType表示返回值类型
 * 
 */
function nodeRecursion(scope: Scope, node: ASTNode, label: string[], declareRetType: { retType?: TypeUsed }, assignmentAST?: ASTNode): { type: TypeUsed, retType?: TypeUsed, hasRet: boolean, location?: 'prop' | 'field' | 'stack' | 'array_element' } {
    let result: { type: TypeUsed, retType?: TypeUsed, hasRet: boolean, location?: 'prop' | 'field' | 'stack' | 'array_element' };
    //因为有的指令在本阶段不出现，所以下面的分支没有列出全部的AST操作码
    if (node['def'] != undefined) {
        let blockScope = (scope as BlockScope);//def节点是block专属
        let name = Object.keys(node['def'])[0];
        blockScope.setProp(name, node['def'][name], node);
        let prop = node['def'][name];
        let initType: TypeUsed | undefined;
        if (prop.initAST != undefined) {
            //使用了零长数组，则把已经声明类型向下传递
            if (prop.initAST.immediateArray != undefined && prop.initAST.immediateArray.length == 0) {
                prop.initAST.type = prop.type;
            }
            initType = nodeRecursion(scope, node['def'][name].initAST!, label, declareRetType).type;
        }
        if (prop.type == undefined) {//如果是需要进行类型推导，则推导类型
            //prop.type为undefined的时候initType必定有值
            assert(initType != undefined);
            if (TypeUsedSign(initType) == '@null') {
                /**
                 * 如下代码会命中条件
                 * var a=null;
                 * 此时无法推导a的类型
                 */
                throw `无法推导类型`;
            }
            prop.type = initType;
        } else {//否则检查initialization的类型和声明类型是否一致
            if (initType != undefined) {
                typeCheck(initType!, prop.type!, `声明类型和初始化类型不匹配`);
            }
            if (node['def'][name].type!.FunctionType?.body != undefined) {
                /**
                 * 下面两种代码
                 * function f1():int{};
                 * var f1:()=>int;
                 * 都会生成一个def节点,一个有body，一个没有(函数声明没有，函数定义有)
                 * 所以遇到这种情况，通通扫描一次，在functionScan中，如果function.body==undefined,则直接放弃扫描
                */
                functionScan(new BlockScope(scope, node['def'][name].type!.FunctionType!, node['def'][name].type!.FunctionType!.body!, {}), node['def'][name].type!.FunctionType!);//如果是定义了函数，则扫描一下
            }
        }
        if (prop.type?.PlainType?.name == 'void') {
            throw `void无法计算大小,任何成员都不能是void类型`;
        }
        result = { type: prop.type!, hasRet: false };//经过推导，类型已经确定
    }
    else if (node['load'] != undefined) {
        let name = node['load'];
        let propDesc = scope.getProp(name);
        if (propDesc.scope instanceof ClassScope) {
            delete node.load;//把load改为access
            node.accessField = { obj: { desc: 'ASTNode', _this: '' }, field: name };//load阶段还不知道是不是property,由access节点处理进行判断
            return nodeRecursion(scope, node, label, declareRetType, assignmentAST);//处理access节点需要附带这个参数
        } else if (propDesc.scope instanceof ProgramScope) {
            delete node.load;//把load改为access
            node.accessField = { obj: { desc: 'ASTNode', _program: '' }, field: name };//load阶段还不知道是不是property,由access节点处理进行判断
            return nodeRecursion(scope, node, label, declareRetType, assignmentAST);//处理access节点需要附带这个参数
        } else if (propDesc.scope instanceof BlockScope) {//blockScope
            if (assignmentAST != undefined) {
                if (propDesc.prop.variable == 'val') {//load不可能变成access
                    throw `变量${name}声明为val,禁止赋值`;
                }
            }
            if (propDesc.crossFunction) {
                propDesc.scope.defNodes[name].crossFunctionLoad.push(node);//跨函数的load节点
            } else {
                propDesc.scope.defNodes[name].loads.push(node);//记录下bolck有多少def节点需要被打包到闭包类,每个prop被那些地方load的,block扫描完毕的时候的时候把这些load节点全部替换
            }
            result = { type: propDesc.prop.type!, hasRet: false, location: 'stack' };//如果是读取block内部定义的变量,则这个变量一点是已经被推导出类型的，因为代码区域的变量是先定义后使用的
        } else {
            throw `未定义的其他类型Scope`;
        }

    }
    else if (node['call'] != undefined) {
        let nodeType = nodeRecursion(scope, node['call'].functionObj, label, declareRetType).type!;//FunctionType不可能为undefined;
        if (!nodeType.FunctionType) {
            throw `必须call一个函数`;
        }
        let funType = nodeType.FunctionType;
        if (funType.retType == undefined) {//说明函数没有被推导过
            functionScan(new BlockScope(scope, funType, funType.body!, {}), funType);
        }
        if (funType == undefined) {
            throw `必须调用一个函数`;
        }
        let keyOfDeclare = Object.keys(funType._arguments);
        if (keyOfDeclare.length != node['call']._arguments.length) {
            throw `函数需要${keyOfDeclare.length}个参数，实际传递了${node['call']._arguments.length}个参数`;
        } else {
            for (let i = 0; i < node['call']._arguments.length; i++) {
                let argNode = node['call']._arguments[i];
                let arg_type = nodeRecursion(scope, argNode, label, declareRetType).type;
                typeCheck(arg_type, funType._arguments[keyOfDeclare[i]].type!, `函数调用的参数类型不匹配`);//参数类型检查
            }
        }
        result = { type: funType.retType!, hasRet: false };
    }
    else if (node['accessField'] != undefined) {
        let accessName = node['accessField'].field;
        let accessedType = nodeRecursion(scope, node['accessField'].obj, label, declareRetType).type;
        let type: undefined | TypeUsed;
        //允许访问数组的length属性
        if (accessedType.ArrayType != undefined) {
            if (node['accessField'].field != 'length') {
                throw `数组只有length属性可访问`;
            } else {
                result = { type: { PlainType: { name: 'system.int' } }, hasRet: false };
            }
        } else if (accessedType.FunctionType != undefined) {
            throw `函数目前没有任何属性可访问`;
        } else if (accessedType.ProgramType != undefined) {
            let prop = programScope.getProp(accessName).prop;
            if (prop == undefined) {
                throw `访问了program中不存在的属性${accessName}`;
            }
            type = prop.type;
            if (type == undefined) {
                let initAST = prop.initAST!;
                if ((initAST).hasTypeInferRecursion) {
                    throw `类型推导出现了循环:${getScopeSpaceName()}.${accessName}`;
                }
                (initAST).hasTypeInferRecursion = true;//标记一下这个属性已经在推导路径中被使用过了
                type = nodeRecursion(programScope, initAST, label, declareRetType).type;
                delete (initAST).hasTypeInferRecursion;//删除标记,回溯常用手法
            }
            if (assignmentAST != undefined) {
                if (prop.variable == 'val') {
                    throw `${getScopeSpaceName()}.${accessName}声明为val,禁止赋值`;
                }
            }
            result = { type: type, hasRet: false, location: 'field' };
        }
        //最后剩下的就是访问class中的成员了
        else {
            let className = accessedType.PlainType!.name;
            /**
             * 如果现在还是load节点，说明是读取局部变量，可以开始做成员变量判断了
             * 访问局部变量的成员函数时，通通用闭包捕获起来
             *  function f(para:int){
             *      var i=5;
             *      var j=6;
             *      var f1=i.toString;
             *      var f2=j.toString;
             *      if(para>5)
             *          return f1;
             *      else
             *          return f2;
             *  }
             *  这种情况下根本无法追踪toString被哪个变量使用了,如果不捕获这个变量，函数返回之后，这个变量将会不可控
             *
             * 
             *  经过前面行的nodeRecursion之后，如果是load program或者class成员，load节点会被替换成accessField节点
             */

            if (node['accessField'].obj.load != undefined) {
                let definedType = program.getDefinedType(className);
                let accessValueTypeFucntionMemberOrextensionMethod = false;//是否访问了值类型的成员函数或者扩展方法
                //正在尝试访问一个值类型的成员
                if (definedType.modifier == 'valuetype') {
                    if (definedType.property[accessName] != undefined && definedType.property[accessName].type?.FunctionType != undefined) {
                        accessValueTypeFucntionMemberOrextensionMethod = true;//访问了成员函数
                    } else if (program.extensionMethodsDef[className]?.[accessName] != undefined) {
                        accessValueTypeFucntionMemberOrextensionMethod = true;//访问了扩展方法
                    }
                }
                if (accessValueTypeFucntionMemberOrextensionMethod) {
                    let socureScope = (scope as BlockScope).getProp(node['accessField'].obj.load).scope;//变量的来源scope
                    if (socureScope instanceof BlockScope) {//如果是来自于blockScope
                        socureScope.captured.add(node['accessField'].obj.load);//把这个变量捕获
                    }
                }
            }

            if (program.extensionMethodsDef[className]?.[accessName] != undefined) {
                //把accessField改成callEXM
                node.callEXM = {
                    obj: node['accessField'].obj,
                    extendFuntionRealname: `@extension@${className}@${accessName}`
                };
                delete node.accessField;
                //类型扫描的时候仍然用extensionMethodsDef，因为在类型检查的第一步就是扫描扩展方法，可以保证扩展方法已经被functionScan检查过
                result = { type: { FunctionType: program.extensionMethodsDef[className][accessName].fun }, hasRet: false, location: 'field' };
            }
            else {
                let prop = program.getDefinedType(className).property[accessName];
                let classScope = programScope.getClassScope(className);//切换scope
                if (prop == undefined) {
                    //尝试进行get或者set判断
                    let hasGetterOrSetter = true;
                    if (assignmentAST) {//
                        if (program.getDefinedType(className).property[`@set_${accessName}`] != undefined) {
                            //改成set调用
                            let fun = program.getDefinedType(className).property[`@set_${accessName}`].type!.FunctionType!;
                            functionScan(new BlockScope(classScope, fun, fun.body!, {}), fun);
                            let argName = Object.keys(fun._arguments)[0];
                            type = fun._arguments[argName].type!;//argument已经定义了类型
                            assignmentAST.call = { functionObj: { desc: 'ASTNode', accessField: { obj: node['accessField'].obj, field: `@set_${node['accessField'].field}` } }, _arguments: [assignmentAST['=']!.rightChild] };
                            delete assignmentAST['='];//删除赋值节点
                        } else {
                            hasGetterOrSetter = false;
                        }
                    } else {
                        if (program.getDefinedType(className).property[`@get_${accessName}`] != undefined) {
                            //改成get调用
                            let fun = program.getDefinedType(className).property[`@get_${accessName}`].type!.FunctionType!;
                            type = functionScan(new BlockScope(classScope, fun, fun.body!, {}), fun);
                            node.call = { functionObj: { desc: 'ASTNode', accessField: { obj: node['accessField'].obj, field: `@get_${node['accessField'].field}` } }, _arguments: [] };//改为get
                            delete node.accessField;//删除accessField节点
                        } else {
                            hasGetterOrSetter = false;
                        }
                    }
                    if (!hasGetterOrSetter) {
                        throw `访问了类型${className}中不存在的属性${accessName}`;
                    } else {
                        assert(type != undefined);
                        result = { type: type, location: 'prop', hasRet: false };
                    }
                } else {
                    //文法规定get set 扩展函数不受private限制,所以只需要在这里检测就行
                    if (prop.accessModifier == 'private') {
                        let nowClassCope: ClassScope | undefined;//寻找当前作用域对应的classCope
                        if (scope instanceof BlockScope) {
                            nowClassCope = scope.classScope;
                        } else if (scope instanceof ClassScope) {
                            nowClassCope = scope;
                        }
                        if (nowClassCope?.className != classScope.className) {
                            throw `禁止外部访问private属性:${className}.${accessName}`;
                        }
                    }

                    type = prop.type;
                    if (type == undefined) {
                        let initAST = prop.initAST!;
                        if ((initAST).hasTypeInferRecursion) {
                            throw `类型推导出现了循环:${className}.${accessName}`;
                        }
                        (initAST).hasTypeInferRecursion = true;//标记一下这个属性已经在推导路径中被使用过了
                        type = nodeRecursion(classScope, initAST, label, declareRetType).type;
                        delete (initAST).hasTypeInferRecursion;//删除标记,回溯常用手法
                    }
                    if (assignmentAST != undefined) {
                        if (prop.variable == 'val') {
                            throw `${className}.${accessName}声明为val,禁止赋值`;
                        }
                    }
                    result = { type: type, hasRet: false, location: 'field' };
                }
            }
        }
    }
    else if (node['_super'] != undefined) {
        throw `不支持super`;
    }
    else if (node['_this'] != undefined) {
        if (scope instanceof BlockScope) {
            if (scope.classScope != undefined) {
                result = { type: { PlainType: { name: scope.classScope.className } }, hasRet: false };
            } else {
                throw `不在class内部不能使用this`;
            }
        } else if (scope instanceof ClassScope) {
            result = { type: { PlainType: { name: scope.className } }, hasRet: false };
        } else {
            throw `不在class内部不能使用this`;
        }
    }
    else if (node['_program'] != undefined) {
        result = { type: { ProgramType: '' }, hasRet: false };
    }
    else if (node['immediate'] != undefined) {
        if (node['immediate'].primiviteValue != undefined) {
            let immediate_val = node['immediate'].primiviteValue;
            if (/^(true)|(false)$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.bool' } }, hasRet: false };
            } else if (/^[0-9]+b$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.byte' } }, hasRet: false };
            } else if (/^[0-9]+s$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.short' } }, hasRet: false };
            } else if (/^[0-9]+$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.int' } }, hasRet: false };
            } else if (/^[0-9]+l$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.long' } }, hasRet: false };
            } else if (/^[0-9]+\.[0-9]+$/.test(immediate_val)) {
                result = { type: { PlainType: { name: 'system.double' } }, hasRet: false };
            } else if (immediate_val == 'null') {
                result = { type: { PlainType: { name: '@null' } }, hasRet: false };
            } else {
                throw `还未支持的immediate类型${node['immediate'].primiviteValue}`
            }
        } else {//是一个函数体
            functionScan(new BlockScope(scope, node['immediate'].functionValue!, node['immediate'].functionValue!.body!, {}), node['immediate'].functionValue!);
            let functionType: FunctionType = {
                namespace: getScopeSpaceName(),
                isNative: node['immediate'].functionValue!.isNative,
                _arguments: node['immediate'].functionValue!._arguments,
                retType: node['immediate'].functionValue!.retType,
                capture: node['immediate'].functionValue!.capture,
                templates: node['immediate'].functionValue!.templates,
            };
            /**
             * 这里返回一个函数类型，不带body，因为只用于类型声明
             * 因为下面这中代码:
             * var a=(){body};
             * a.type就不用带body了，如果是
             * function a(){body}
             * 这种代码，a.type中带有body
             * 在代码生成阶段注意判断是类型声明还是函数定义
             * var a=()=>{body}  -- a只是一个类型
             * function a(){body} -- a是一个函数定义
             */
            result = { type: { FunctionType: functionType }, hasRet: false };
        }
    }
    else if (node['='] != undefined) {
        let right = nodeRecursion(scope, node['='].rightChild, label, declareRetType);//计算右节点
        let left = nodeRecursion(scope, node['='].leftChild, label, declareRetType, node);
        if (left.location != undefined && left.location == 'prop') {
            //已经在access节点的处理阶段被更改为call prop_set了,类型检查也做了,无需做任何处理
        } else if (left.location != undefined && (left.location == 'stack' || left.location == 'field' || left.location == 'array_element')) {//数组元素、field以及stack都是左值
            typeCheck(left.type, right.type, `赋值语句左右类型不一致`);//类型检查
        } else {
            throw `只有左值才能赋值`;
        }
        result = { type: { PlainType: { name: 'void' } }, hasRet: false };
    }
    else if (node['%'] != undefined) {
        let op = '%' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['~'] != undefined) {
        let opRet = OperatorOverLoad(scope, node['~'], undefined, node, '~');
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['^'] != undefined) {
        let op = '^' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['&'] != undefined) {
        let op = '&' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['|'] != undefined) {
        let op = '|' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['>>'] != undefined) {
        let op = '>>' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['<<'] != undefined) {
        let op = '<<' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['+'] != undefined) {
        let op = '+' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['-'] != undefined) {
        let op = '-' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['*'] != undefined) {
        let op = '*' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['/'] != undefined) {
        let op = '/' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['<'] != undefined) {
        let op = '<' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['<='] != undefined) {
        let op = '<=' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['>'] != undefined) {
        let op = '>' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['>='] != undefined) {
        let op = '>=' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['=='] != undefined) {
        let op = '==' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['!='] != undefined) {
        let op = '!=' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['||'] != undefined) {
        let op = '||' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['&&'] != undefined) {
        let op = '&&' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['trycatch'] != undefined) {
        let tryScope = new BlockScope(scope, undefined, node['trycatch'].tryBlock, {});//catch语句只能出现在block内部
        let tryBlockRet = BlockScan(tryScope, label, declareRetType);//此时的block一定是BlockScope
        let hasRet: boolean = tryBlockRet.hasRet;
        let firstRetType: TypeUsed | undefined;
        if (firstRetType == undefined && tryBlockRet.retType != undefined) {
            firstRetType = tryBlockRet.retType;
        }
        for (let _catch of node['trycatch'].catch_list) {
            let varialbe: VariableDescriptor = {};
            varialbe[_catch.catchVariable] = { variable: 'var', type: _catch.catchType, initAST: { desc: 'ASTNode', loadException: _catch.catchType } };
            let def: ASTNode = { desc: 'ASTNode', def: varialbe };
            let catchBlock = _catch.catchBlock;
            catchBlock.body.unshift(def);//插入一个读取exception指令
            let catchScope = new BlockScope(scope, undefined, catchBlock, {});//catch语句只能出现在block内部
            let catchBlockRet = BlockScan(catchScope, label, declareRetType ?? firstRetType);//优先使用声明的返回值类型
            if (!catchBlockRet.hasRet) {
                hasRet = false;
            }
            if (firstRetType == undefined && catchBlockRet.retType != undefined) {
                firstRetType = catchBlockRet.retType;
            }
        }
        result = { hasRet: hasRet, retType: firstRetType, type: { PlainType: { name: 'void' } } };
    }
    else if (node['throwStmt'] != undefined) {
        nodeRecursion(scope, node['throwStmt'], label, declareRetType);
        //throw不像ret那样修改retType，所以对于后续的分析无影响
        result = { hasRet: true, type: { PlainType: { name: 'void' } }, retType: { PlainType: { name: '@exception' } } };//throw可以作为任意类型的返回值
    }
    else if (node['ret'] != undefined) {
        let type: TypeUsed;
        if (node['ret'] == '') {
            type = { PlainType: { name: 'void' } };
        } else {
            type = nodeRecursion(scope, node['ret'], label, declareRetType).type;
            if (declareRetType.retType != undefined) {
                typeCheck(type, declareRetType.retType, '返回语句和声明的返回值类型不同');
            } else {
                declareRetType.retType = type;//更新返回值类型
            }
        }
        result = { hasRet: true, type: type, retType: type };
    }
    else if (node['ifStmt'] != undefined) {
        let conditionType = nodeRecursion(scope, node['ifStmt'].condition, label, declareRetType).type;
        typeCheck(conditionType, { PlainType: { name: 'system.bool' } }, `if条件只能是bool值`);
        let blockScope = new BlockScope(scope, undefined, node['ifStmt'].stmt, {});//ifStmt语句只能出现在block内部
        let blockRet = BlockScan(blockScope, label, declareRetType);
        result = { hasRet: false, retType: undefined, type: { PlainType: { name: 'void' } } };
    }
    else if (node['ifElseStmt'] != undefined) {
        let type = nodeRecursion(scope, node['ifElseStmt'].condition, label, declareRetType).type;
        typeCheck(type, { PlainType: { name: 'system.bool' } }, `if条件只能是bool值`);
        let blockScope_1 = new BlockScope(scope, undefined, node['ifElseStmt'].stmt1, {});//ifElseStmt语句只能出现在block内部
        let if_stmt_ret = BlockScan(blockScope_1, label, declareRetType);
        let blockScope_2 = new BlockScope(scope, undefined, node['ifElseStmt'].stmt2, {});//ifElseStmt语句只能出现在block内部
        let else_stmt_ret = BlockScan(blockScope_2, label, declareRetType ?? if_stmt_ret.retType);
        let hasRet = if_stmt_ret.hasRet && else_stmt_ret.hasRet;
        result = { hasRet: hasRet, retType: hasRet ? if_stmt_ret.retType : undefined, type: { PlainType: { name: 'void' } } };
    }
    else if (node['do_while'] != undefined) {
        if (node['do_while'].label != undefined) {
            label.push(node['do_while'].label)
        }
        let type = nodeRecursion(scope, node['do_while'].condition, label, declareRetType).type;
        typeCheck(type, { PlainType: { name: 'system.bool' } }, `do while条件只能是bool值`);
        let blockScope = new BlockScope(scope, undefined, node['do_while'].stmt, {});//do_while语句只能出现在block内部
        let blockRet = BlockScan(blockScope, label, declareRetType);
        label.pop();
        result = { hasRet: false, retType: undefined, type: { PlainType: { name: 'void' } } };
    }
    else if (node['_while'] != undefined) {
        if (node['_while'].label != undefined) {
            label.push(node['_while'].label)
        }
        let type = nodeRecursion(scope, node['_while'].condition, label, declareRetType).type;
        typeCheck(type, { PlainType: { name: 'system.bool' } }, `while条件只能是bool值`);
        let blockScope = new BlockScope(scope, undefined, node['_while'].stmt, {});//while语句只能出现在block内部
        let blockRet = BlockScan(blockScope, label, declareRetType);
        label.pop();
        result = { hasRet: false, retType: undefined, type: { PlainType: { name: 'void' } } };
    }
    else if (node['_for'] != undefined) {
        if (node['_for'].label != undefined) {
            label.push(node['_for'].label)
        }
        if (node['_for'].init) {
            nodeRecursion(scope, node['_for'].init, label, declareRetType);
        }
        if (node['_for'].condition) {
            let type = nodeRecursion(scope, node['_for'].condition, label, declareRetType).type;
            typeCheck(type, { PlainType: { name: 'system.bool' } }, `for条件只能是bool值或者空`);
        }
        if (node['_for'].step) {
            nodeRecursion(scope, node['_for'].step, label, declareRetType);
        }
        if (node['_for'].stmt.desc == 'ASTNode') {
            nodeRecursion(scope, node['_for'].stmt as ASTNode, label, declareRetType);
        } else {
            let blockScope = new BlockScope(scope, undefined, node['_for'].stmt, {});//for语句只能出现在block内部
            BlockScan(blockScope, label, declareRetType);
        }
        label.pop();
        result = { hasRet: false, type: { PlainType: { name: 'void' } } };
    }
    else if (node['_break'] != undefined) {
        if (node['_break'].label != '') {
            if (label.indexOf(node['_break'].label) == -1) {
                throw `break使用了未定义的label:${node['_break'].label}`;
            }
        }
        result = { hasRet: false, type: { PlainType: { name: 'void' } } };
    }
    else if (node['_continue'] != undefined) {
        if (node['_continue'].label != '') {
            if (label.indexOf(node['_continue'].label) == -1) {
                throw `break使用了未定义的label:${node['_continue'].label}`;
            }
        }
        result = { hasRet: false, type: { PlainType: { name: 'void' } } };
    }
    else if (node['_instanceof'] != undefined) {
        registerType(node['_instanceof'].type);//这里需要额外注册一下，这个类型不会被nodeRecursion推导，如:obj instanceof ()=>int; obj会被nodeRecursion注册，但是()=>int就不会被注册
        let objType = nodeRecursion(scope, node['_instanceof'].obj, label, declareRetType).type;
        if (objType.PlainType?.name != 'system.object') {
            throw `只有object类型可以用instanceof`;
        }
        result = { hasRet: false, type: { PlainType: { name: 'system.bool' } } };
    }
    else if (node['not'] != undefined) {
        let opRet = OperatorOverLoad(scope, node['not'], undefined, node, '!');
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['++'] != undefined) {
        let opRet = OperatorOverLoad(scope, node['++'], undefined, node, '++');
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['--'] != undefined) {
        let opRet = OperatorOverLoad(scope, node['--'], undefined, node, '--');
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['[]'] != undefined) {
        let op = '[]' as opType;
        let opRet = OperatorOverLoad(scope, node[op]!.leftChild, node[op]!.rightChild, node, op);
        result = { type: opRet.type, location: opRet.location, hasRet: false };
    }
    else if (node['ternary'] != undefined) {
        let conditionType = nodeRecursion(scope, node['ternary'].condition, label, declareRetType).type;
        typeCheck(conditionType, { PlainType: { name: 'system.bool' } }, `三目运算符的条件必须是bool值`);
        let t1 = nodeRecursion(scope, node['ternary'].obj1, label, declareRetType).type;
        let t2 = nodeRecursion(scope, node['ternary'].obj2, label, declareRetType).type;
        typeCheck(t1, t2, `三目运算符左右类型不一致`);
        result = { type: t1, hasRet: false };
    }
    else if (node['cast'] != undefined) {
        /**
         * 一共有9种情况
         * 
         * ref->obj  允许  + 无需生成指令
         * ref->val  禁止  
         * ref->ref  禁止
         * 
         * obj->obj  禁止  + 无需生成指令
         * obj->ref  允许  +
         * obj->val  允许  +
         * 
         * val->obj  允许  +
         * val->ref  禁止
         * val->val  允许
         */
        let srcType = nodeRecursion(scope, node['cast'].obj, label, declareRetType).type;
        let targetType = node['cast'].type;
        if (isPointType(srcType)) {//对应ref->xx的三种情况
            if (targetType.PlainType?.name == 'system.object') {
                node['castRefToObj'] = node['cast'];
                delete node['cast'];
            } else {
                throw `引用类型只能转换成object`;
            }
        } else {
            if (srcType.PlainType?.name == 'system.object') {//对应obj->xx的三种情况
                if (isPointType(targetType)) {
                    node['castObjToRef'] = node['cast'];
                    delete node['cast'];
                } else {
                    if (targetType.PlainType?.name != 'system.object') {
                        node['unbox'] = node['cast'];//拆箱
                        delete node['cast'];
                    } else {
                        throw `不必要的类型转换:object->object`;
                    }
                }
            } else {//对应val->xx的三种情况
                if (isPointType(targetType)) {
                    throw `值类型不能转换为引用类型`;
                } else {
                    if (targetType.PlainType?.name == 'system.object') {
                        node['box'] = node['cast'];//装箱
                        delete node['cast'];
                    } else {
                        if (TypeUsedSign(targetType) == TypeUsedSign(srcType)) {
                            throw `不必要的类型转换${TypeUsedSign(targetType)}<-->${TypeUsedSign(targetType)}`;
                        } else {
                            node['castValueType'] = node['cast'];
                            delete node['cast'];
                        }
                    }
                }
            }
        }

        result = { type: targetType, hasRet: false };
    }
    else if (node['_new'] != undefined) {
        //进行模板检查
        TempalteCheck(node['_new'].type);
        if (!program.getDefinedType(node['_new'].type.PlainType.name)) {
            throw `new一个未知类型:${node['_new'].type.PlainType.name}，请检查代码`;
        }
        if (program.getDefinedType(node['_new'].type.PlainType!.name).modifier == 'valuetype') {
            throw `值类型不能new`;
        }
        let ts: TypeUsed[] = [];
        for (let n of node['_new']._arguments) {
            ts.push(nodeRecursion(scope, n, label, declareRetType).type);
        }
        let callsign: string = FunctionSignWithArgumentAndRetType(ts, { PlainType: { name: 'void' } });//根据调用参数生成一个签名,构造函数没有返回值
        if (program.getDefinedType(node['_new'].type.PlainType!.name)._constructor[callsign] == undefined) {
            throw `无法找到合适的构造函数:${node['_new'].type.PlainType!.name}`
        }
        result = { type: node['_new'].type, hasRet: false };
    }
    else if (node['_newArray'] != undefined) {
        for (let n of node['_newArray'].initList) {
            let astRet = nodeRecursion(scope, n, label, declareRetType);
            typeCheck(astRet.type, { PlainType: { name: 'system.int' } }, '数组创建参数只能是int');
        }
        let type: TypeUsed = node['_newArray'].type;
        for (let i = 0; i < node['_newArray'].initList.length + node['_newArray'].placeholder; i++) {
            type = { ArrayType: { innerType: type } };
            registerType(type);//这里需要额外注册一下，这个类型不会被nodeRecursion推导，如:var arr:int[][][]; int[][][]会被注册，但是内部的int[]和int[][]就不会被注册
        }
        result = { type: type, hasRet: false };
    }
    else if (node['_switch'] != undefined) {
        let allCaseHasRet = true;
        let defaultRetType: TypeUsed | undefined;//直接从default语句取返回值类型
        for (let caseStmt of node['_switch'].matchList) {
            let leftObj = node['_switch'].pattern;
            let rightObj = caseStmt.matchObj!;
            caseStmt.condition = { desc: 'ASTNode', '==': { leftChild: leftObj, rightChild: rightObj } };//把switch的case改为if判断
            delete caseStmt.matchObj;//删除matchobj
            let conditionType = OperatorOverLoad(scope, leftObj, rightObj, caseStmt.condition, '==').type;
            if (conditionType.PlainType?.name != 'system.bool') {
                throw `case列表和switch object必须可以进行==操作，且返回值必须为bool`;
            }
            let caseRet = BlockScan(new BlockScope(scope, undefined, caseStmt.stmt, {}), label, declareRetType);
            if (!caseRet.hasRet) {
                allCaseHasRet = false;
            }
        }
        if (node['_switch'].defalutStmt != undefined) {
            let defaultRet = BlockScan(new BlockScope(scope, undefined, node['_switch'].defalutStmt, {}), label, declareRetType);
            defaultRetType = defaultRet.retType;
            if (!defaultRet.hasRet) {
                allCaseHasRet = false;
            }
        } else {
            allCaseHasRet = false;//如果没有default分支，则认为不是一个返回语句
        }
        result = { type: { PlainType: { name: 'void' } }, hasRet: allCaseHasRet, retType: defaultRetType };
    }
    else if (node['loadException'] != undefined) {
        result = { type: node['loadException'], hasRet: false };
    }
    else if (node['loadArgument'] != undefined) {
        result = { type: node.type!, hasRet: false };
    }
    else if (node['specializationObj'] != undefined) {
        let spce = node['specializationObj'];
        let fieldName = spce.obj['load']!;
        let realObjName = fieldName + '<' + spce.types!.map((type) => TypeUsedSign(type)).reduce((p, c) => `${p},${c}`) + '>';
        if (spce.obj['load'] != undefined) {
            if (program.getProgramProp(realObjName, getScopeSpaceName()) == undefined) {
                //如果这个模板对象的特化对象，则进行特化
                if (program.getProgramTemplateProp(fieldName, getScopeSpaceName()) != undefined) {
                    let tmpFunObj = JSON.parse(JSON.stringify(program.getProgramTemplateProp(fieldName, getScopeSpaceName()))) as VariableProperties;//拷贝一份，避免修改掉原来的数据
                    let map: { [key: string]: TypeUsed } = {};
                    for (let i = 0; i < tmpFunObj.type!.FunctionType!.templates!.length; i++) {
                        let k = tmpFunObj.type!.FunctionType!.templates![i];
                        map[k] = spce.types[i];
                    }

                    tmpFunObj.type!.FunctionType!.templates = undefined;//已经特化了，移除模板定义
                    FunctionSpecialize(tmpFunObj.type!.FunctionType!, map);
                    let nameWithOutName=realObjName.slice(tmpFunObj.type!.FunctionType!.namespace.length + 1);//移除命名空间前缀的名字
                    program.setProp(nameWithOutName, tmpFunObj.type!.FunctionType!.namespace, tmpFunObj);//注册的时候移除命名空间前缀
                    programScope.setPropForTemplateSpecialize(realObjName, tmpFunObj);
                    //把函数对象注入到program中
                    let blockScope = new BlockScope(programScope, tmpFunObj.type!.FunctionType, tmpFunObj.type!.FunctionType!.body!, {});
                    functionScan(blockScope, tmpFunObj.type!.FunctionType!);
                } else {
                    throw `尝试特化一个未定义的模板对象`;
                }
            }
        } else {
            throw `特化对象仅仅能特化program作用域的函数对象`;
        }
        delete node.specializationObj;//把specializationObj改为program
        node.accessField = { obj: { desc: 'ASTNode', _program: '' }, field: realObjName };//load阶段还不知道是不是property,由access节点处理进行判断
        result = nodeRecursion(scope, node, label, declareRetType, assignmentAST);//处理access节点需要附带这个参数
    }
    else if (node['autounwinding'] != undefined) {
        //检查这些类型是否都实现了unwinded接口
        //循环步长为2，因为一个def节点，一个pushUnwindHandler节点
        for (let i = 0; i < node['autounwinding'].unwinded; i += 2) {
            let defType = nodeRecursion(scope, node['autounwinding'].stmt.body[i] as ASTNode, label, declareRetType).type;
            if (defType.PlainType == undefined) {
                throw `autounwinding只支持PlainType类型，不支持数组和函数`;
            }
            let className = defType.PlainType.name;
            let unwinded = program.getDefinedType(className).property['unwinded'];
            if (unwinded == undefined) {
                throw `类型${className}没有实现unwinded函数`;
            }
            //经过上面的推导，accessedType已经可以确认里面的类型了,所以可以对prop.type下非空断言
            if (TypeUsedSign(unwinded.type!) != `args:() retType:void`) {
                throw `类型${className}没有正确实现unwinded函数,需要的函数签名为'args:() retType:void',已经实现的函数签名为:${TypeUsedSign(unwinded.type!)}`;
            }
            if (isPointType(defType)) {
                let defName = Object.keys((node['autounwinding'].stmt.body[i] as ASTNode).def!)[0];
                if ((node['autounwinding'].stmt.body[i] as ASTNode).def![defName].initAST == undefined) {
                    throw `引用类型的autoUnwinding必须在声明的时候初始化:${defName}`;
                }
            }
            nodeRecursion(scope, node['autounwinding'].stmt.body[i + 1] as ASTNode, label, declareRetType).type;
        }
        let blockRet = BlockScan(new BlockScope(scope, undefined, node['autounwinding'].stmt, {}), label, declareRetType);
        result = { hasRet: blockRet.hasRet, retType: blockRet.retType, type: { PlainType: { name: 'void' } } };
    }
    else if (node['pushUnwindHandler'] != undefined) {
        nodeRecursion(scope, node['pushUnwindHandler'], label, declareRetType).type;
        result = { hasRet: false, retType: undefined, type: { PlainType: { name: 'void' } } };
    }
    else if (node['immediateArray'] != undefined) {
        if (node['immediateArray'].length > 0) {
            let firstElementType = nodeRecursion(scope, node['immediateArray'][0], label, declareRetType).type;
            for (let i = 1; i < node['immediateArray'].length; i++) {
                let elementType = nodeRecursion(scope, node['immediateArray'][i], label, declareRetType).type;
                typeCheck(firstElementType, elementType, '数组元素类型不一致');
            }
            result = { hasRet: false, retType: undefined, type: { ArrayType: { innerType: firstElementType } } };
        } else {
            if (node.type == undefined) {
                /**
                 * 只能在初始化语句中使用零长数组，且要求变量的类型已经定义，如下
                 * var a:int[]={[]};
                 * 而下面这种用法是非法的
                 * 1.var a={[]};
                 * 2.fun({[]});
                 * 其实2这种情况是能做类型推导的，懒得做了
                 */
                throw `无法推导类型的零长数组`;
            } else {
                if (node.type.ArrayType == undefined) {
                    throw `零长数组声明的类型必须是数组类型`;
                } else {
                    result = { hasRet: false, retType: undefined, type: node.type };
                }
            }
        }
    }
    else if (node['negative'] != undefined) {
        let type = nodeRecursion(scope, node['negative'], label, declareRetType).type;
        let typeName = TypeUsedSign(type);
        if (
            typeName != 'system.byte' &&
            typeName != 'system.short' &&
            typeName != 'system.int' &&
            typeName != 'system.long' &&
            typeName != 'system.double'
        ) {
            throw `只有 byte、short、int、long、double才能取负号`;
        }
        result = { hasRet: false, retType: undefined, type };
    }
    else if (node['positive'] != undefined) {
        let type = nodeRecursion(scope, node['positive'], label, declareRetType).type;
        let typeName = TypeUsedSign(type);
        if (
            typeName != 'system.byte' &&
            typeName != 'system.short' &&
            typeName != 'system.int' &&
            typeName != 'system.long' &&
            typeName != 'system.double'
        ) {
            throw `只有 byte、short、int、long、double才能取正号`;
        }
        result = { hasRet: false, retType: undefined, type };
    }
    else {
        throw new Error(`未知节点`);
    }
    node.type = result.type;//给node设置类型
    registerType(result.type);//注册类型，除了instanceof之外的类型都会在这里注册
    return result;
}
let captureWrapIndex = 0;
/**
 * 返回值表示是否为一个ret block
 * declareRetType 声明的返回值
 * 为了能够修改入参的retType，所以传入了一个对象
 * @returns hasRet  这个block是否为一个必定有return的block，如:
 *                  {
    *                  if(a)
    *                      return 1;
    *                  else
    *                      return 0;
 *                  }
 *                  xxxxx
 * 
 *                  这个block就是必定返回的block，后面的语句将没有意义，检查时会进行提示
 */
function BlockScan(blockScope: BlockScope, label: string[], declareRetType: { retType?: TypeUsed }): { hasRet: boolean, retType?: TypeUsed } {
    let ret: { hasRet: boolean, retType?: TypeUsed } | undefined = undefined;
    for (let i = 0; i < blockScope.block!.body.length; i++) {
        let nodeOrBlock = blockScope.block!.body[i];
        if (nodeOrBlock.desc == 'ASTNode') {
            let node = nodeOrBlock as ASTNode;
            let nodeRet = nodeRecursion(blockScope, node, label, declareRetType);
            ret = { hasRet: nodeRet.hasRet, retType: nodeRet.retType };
        } else {
            let block = nodeOrBlock as Block;
            ret = BlockScan(new BlockScope(blockScope, undefined, block, {}), label, declareRetType);
        }
        if (ret.hasRet) {
            if (i != blockScope.block!.body.length - 1) {
                throw 'return之后不能再有语句';
            }
        }
    }
    if (blockScope.captured.size > 0) {
        for (let k of [...blockScope.captured]) {
            //为每个被捕获的变量创建一个包裹类型
            let sourceType = blockScope.defNodes[k].defNode!.def![k].type!;//到这里type已经推导出来了
            let variable = blockScope.defNodes[k].defNode!.def![k].variable;
            let initAST = blockScope.defNodes[k].defNode!.def![k].initAST;
            let wrapClassName = `@captureWrapClass_${captureWrapIndex++}`;
            let wrapTypeUsed: { PlainType: PlainType; } = { PlainType: { name: wrapClassName } };
            let wrapTypeDef: TypeDef = {
                namespace: '',
                _constructor: {},
                property: {
                    'value': {
                        variable: variable,
                        type: sourceType
                    }
                }
            };
            //注册闭包
            program.setDefinedType(wrapClassName, wrapTypeDef);
            programScope.registerClass(wrapClassName);//因为包裹类不会用到其他未注册的类型，所以可以边注册边使用
            ClassScan(programScope.getClassScope(wrapClassName));
            registerType({ PlainType: { name: wrapClassName } });

            delete blockScope.defNodes[k].defNode!.def![k];//删除原来的def节点
            blockScope.defNodes[k].defNode!.def![k] = {
                variable: variable,
                type: wrapTypeUsed
            };//重新定义def节点

            if (initAST != undefined) {//如果有初始化部分，则为其创建构造函数,并调用构造函数
                let constructorSign = FunctionSignWithArgumentAndRetType([sourceType], { PlainType: { name: 'void' } });
                let _arguments: VariableDescriptor = {};
                _arguments['initVal'] = {
                    variable: 'var',
                    type: sourceType
                };
                wrapTypeDef._constructor[constructorSign] = {
                    namespace: getScopeSpaceName(),
                    capture: {},
                    _construct_for_type: wrapClassName,
                    _arguments: _arguments,
                    body: {
                        desc: 'Block',
                        body: [{
                            desc: 'ASTNode',
                            '=': {
                                leftChild: {
                                    desc: 'ASTNode',
                                    load: 'value',
                                    type: sourceType
                                },
                                rightChild: {
                                    desc: 'ASTNode',
                                    load: 'initVal',
                                    type: sourceType
                                }
                            }
                        }]
                    }
                };
                blockScope.defNodes[k].defNode!.def![k].initAST = { desc: 'ASTNode', _new: { type: wrapTypeUsed, _arguments: [initAST] } };
            } else {
                //被捕获的变量在没有initAST情况下也需要做一些处理
                if (!isPointType(sourceType)) {
                    /**
                     * 如果被捕获的变量没有initAST，但是是一个值类型，则仍然需要为其生成一个init指令
                     * 这里相当于这样的代码
                     * var obj:MyClass;//值类型
                     * function f(){
                     *     print(obj.i);//捕获obj
                     * }
                     * 虽然obj被改造成如下代码
                     * var obj:capture_class;//引用类型
                     * function f(){
                     *     print(obj.i);//捕获obj
                     * }
                     * 虽然对于指针来说没有初始化的情况默认指向null，但是从语义上面对于值类型应该默认调用其_init相关代码
                     * 所以需要调用new capture_class，也需要为其创建一个无参构造函数
                     */
                    let constructorSign = FunctionSignWithArgumentAndRetType([], { PlainType: { name: 'void' } });
                    wrapTypeDef._constructor[constructorSign] = {
                        namespace: getScopeSpaceName(),
                        capture: {},
                        _construct_for_type: wrapClassName,
                        _arguments: {},//无参构造函数
                        body: {
                            desc: 'Block',
                            body: []//函数体是空白的
                        }
                    };
                    blockScope.defNodes[k].defNode!.def![k].initAST = { desc: 'ASTNode', type: wrapTypeUsed, _new: { type: wrapTypeUsed, _arguments: [] } };
                }
                else {
                    /**
                     * 这里相当于这样的代码
                     * var obj:MyClass;//引用类型,但是没有初始化，自然就是null
                     * function f(){
                     *     print(obj.i);//捕获obj,并且试图访问obj的属性i，肯定会抛出空指针异常
                     * }
                     */
                }
            }
            //捕获包裹类已经创建完毕，进行注册
            program.setDefinedType(wrapClassName, wrapTypeDef);
            programScope.registerClass(wrapClassName);//因为包裹类不会用到其他未注册的类型，所以可以边注册边使用
            ClassScan(programScope.getClassScope(wrapClassName));
            registerType({ PlainType: { name: wrapClassName } });


            //处理load节点
            for (let loadNode of blockScope.defNodes[k].loads) {
                loadNode['accessField'] = {
                    obj: {
                        desc: 'ASTNode',
                        load: k,
                        type: wrapTypeUsed
                    },
                    field: 'value'
                };
                delete loadNode.load;//把load改成accessField
            }
            //处理跨函数的load节点
            for (let loadNode of blockScope.defNodes[k].crossFunctionLoad) {
                loadNode['accessField'] = {
                    obj: {
                        desc: 'ASTNode',
                        accessField: {
                            obj: {
                                desc: 'ASTNode',
                                getFunctionWrapName: '',
                                type: {
                                    PlainType: {
                                        name: '@uncreated_function_wrap'//在这里还没有创建函数包裹类的类型，需要在codeGen阶段才创建，这里先留空吧
                                    }
                                }
                            },
                            field: k,
                        },
                        type: wrapTypeUsed
                    },
                    field: 'value'
                };
                delete loadNode.load;//把load改成accessField
            }
        }
    }
    if (ret == undefined) {//bolck是个空的
        ret = { hasRet: false };
    }
    return ret;
}
function functionScan(blockScope: BlockScope, fun: FunctionType): TypeUsed {
    let lastNameSpace = getScopeSpaceName();
    setScopeSpaceName(fun.namespace);
    if (fun.templates) {
        //因为在program中定义的模板类和模板函数已经被移除了，所以这里不允许出现任何模板函数定义
        throw `不允许在class内部或者block内部定义模板函数`;
    }
    if ((fun).hasFunctionScan) {//避免已经处理过的函数被重复处理
        /**
         *  var g:bool;
         *  function f1(){
         *      var a=f1();
         *      if(g)
         *          return f1();
         *      else
         *          return 0;
         *  };
         * 这种类型推导需要向后看，直接放弃推导
         */
        if (fun.retType == undefined) {
            throw `无法推导函数返回值类型`;
        }
        setScopeSpaceName(lastNameSpace);//还原命名空间
        return fun.retType;
    } else {
        (fun).hasFunctionScan = true;
    }
    if (fun.isNative || fun.body == undefined) {//函数体,根据有无body判断是函数类型声明还是定义，声明语句不做扫描
        if (fun.retType == undefined) {
            throw `函数声明一定有返回值声明`;
        }
        setScopeSpaceName(lastNameSpace);//还原命名空间
        return fun.retType;
    }
    //为所有参数创建一个def节点，要把参数按顺序压入block最前面,因为是用unshift压入的，所以遍历参数的时候要逆序
    let argIndex = 0;
    let argNames = Object.keys(fun._arguments);
    for (let i = argNames.length - 1; i >= 0; i--) {
        let argumentName = argNames[i];
        let defNode: ASTNode = { desc: 'ASTNode', def: {} };
        defNode.def![argumentName] = { variable: 'var', initAST: { desc: 'ASTNode', loadArgument: { index: argIndex }, type: fun._arguments[argumentName].type } };
        fun.body!.body.unshift(defNode);//插入args的def指令
        argIndex++;
    }
    let blockRet = BlockScan(blockScope, [], fun);
    if (blockRet.retType == undefined) {//函数声明返回void，block没有返回语句，则设置block返回值为void
        blockRet.retType = { PlainType: { name: 'void' } };
    }
    if (fun.retType == undefined && (blockRet.retType == undefined || blockRet.retType?.PlainType?.name == '@exception')) {
        throw `无法推导返回值`;
    } else {
        if (fun.retType != undefined) {
            typeCheck(fun.retType, blockRet.retType!, `函数声明返回值类型和语句实际返回值类型不一致`);
        } else {
            fun.retType = blockRet.retType;
        }
    }
    setScopeSpaceName(lastNameSpace);//还原命名空间
    return fun.retType!;
}
function ClassScan(classScope: ClassScope) {
    let lastNameSpace = getScopeSpaceName();
    let nowNameSpace=classScope.className.split('.')[0];
    setScopeSpaceName(nowNameSpace);//设置命名空间
    for (let propName of classScope.getPropNames()) {//扫描所有成员
        let prop = classScope.getProp(propName).prop;
        if (prop.initAST != undefined) {

            //使用了零长数组，则把已经声明类型向下传递
            if (prop.initAST.immediateArray != undefined && prop.initAST.immediateArray.length == 0) {
                prop.initAST.type = prop.type;
            }

            let initType = nodeRecursion(classScope, prop.initAST, [], {}).type;
            if (prop.type != undefined) {
                typeCheck(initType, prop.type, `属性${propName}声明类型和初始化类型不一致`);
            } else {
                if (TypeUsedSign(initType) == '@null') {
                    /**
                     * 如下代码会命中条件
                     * var a=null;
                     * 此时无法推导a的类型
                     */
                    throw `无法推导类型`;
                }
                prop.type = initType;//如果是需要推导的类型，进行填充
            }
        } else if (prop.type?.FunctionType) {
            let blockScope = new BlockScope(classScope, prop.type?.FunctionType, prop.type?.FunctionType.body!, {});
            functionScan(blockScope, prop.type?.FunctionType);
        }
        if (prop.type?.PlainType?.name == 'void') {
            throw `void无法计算大小,任何成员都不能是void类型`;
        }
        registerType(prop.type!);//经过推导，类型已经确定了
        setScopeSpaceName(lastNameSpace);//还原命名空间
    }
    //扫描构造函数
    for (let constructorName in program.getDefinedType(classScope.className)._constructor) {
        let _constructor = program.getDefinedType(classScope.className)._constructor[constructorName];
        _constructor.retType = { PlainType: { name: 'void' } };//所有构造函数不允许有返回值
        let blockScope = new BlockScope(classScope, _constructor, _constructor.body!, {});
        functionScan(blockScope, _constructor);
    }
}
//深度优先搜索，检查是否有值类型直接或者间接包含自身
function valueTypeRecursiveCheck(typeName: string) {
    if (program.getDefinedType(typeName).recursiveFlag == true) {
        throw `值类型${typeName}直接或者间接包含自身`
    } else {
        program.getDefinedType(typeName).recursiveFlag = true;
        for (let fieldName in program.getDefinedType(typeName).property) {//遍历所有成员
            if (program.getDefinedType(typeName).property[fieldName].type!.PlainType != undefined) {
                let fieldTypeName = program.getDefinedType(typeName).property[fieldName].type!.PlainType?.name!;
                if (program.getDefinedType(fieldTypeName).recursiveChecked != true && fieldTypeName != undefined && program.getDefinedType(fieldTypeName).modifier == 'valuetype') {//如果有值类型的成员，则递归遍历
                    valueTypeRecursiveCheck(fieldTypeName);
                }
            }
        }
        program.getDefinedType(typeName).recursiveChecked = true;
    }
}
function sizeof(typeName: string): number {
    let ret = 0;
    switch (typeName) {
        case 'void': throw `void无法计算大小,任何成员都不能是void类型`;
        case 'system.bool': ret = 1; break;
        case 'system.byte': ret = 1; break;
        case 'system.short': ret = 2; break;
        case 'system.int': ret = 4; break;
        case 'system.long': ret = 8; break;
        case 'system.double': ret = 8; break;
        case 'system.object': ret = globalVariable.pointSize; break;
        case '@null': ret = globalVariable.pointSize; break;
        default:
            for (let fieldName in program.getDefinedType(typeName).property) {
                let field = program.getDefinedType(typeName).property[fieldName];
                if (field.type!.PlainType != undefined) {
                    let fieldTypeName = field.type!.PlainType.name;
                    if (program.getDefinedType(fieldTypeName).modifier != 'valuetype') {
                        ret += globalVariable.pointSize;//非值类型
                    } else {
                        ret += sizeof(fieldTypeName);
                    }
                } else {
                    ret += globalVariable.pointSize;//不是普通类型就只能用指针表示
                }
            }
            break;
    }
    return ret;
}
/**
 * 模板检查，目前只有两个地方用到
 * 1. var obj:MyClass<T>;//第一次用到这个类型会进行注册(第一次进行注册一定是第一次用到,因为nodeRecursion是深度优先搜索，最先搜索到的节点一定是AST最先需要使用该类型的地方)
 * 2. var obj=new MyClass<T>();
 * 在new操作符和类型注册的时候各做一次
 * @param type 
 */
function TempalteCheck(type: { PlainType: PlainType }) {
    let sign = TypeUsedSign(type);
    //如果目标类型是一个模板类
    if (program.tempalteType[type.PlainType.name]) {
        //没有写特化代码
        if (!type.PlainType.templateSpecialization) {
            throw `模板类:${type.PlainType.name}必须特化之后才能使用`;
        }
        //检查该模板类是否已经特化，如果没有特化则进行特化
        if (program.getDefinedType(sign) == undefined) {
            let realTypeName = type.PlainType!.name;
            if (programScope.program.tempalteType[realTypeName].templates?.length != type.PlainType.templateSpecialization.length) {
                throw `类型${type.PlainType!.name}声明的模板类型数量和实例化的数量不匹配`;
            } else {
                let map: { [key: string]: TypeUsed } = {};
                for (let i = 0; i < programScope.program.tempalteType[realTypeName].templates!.length; i++) {
                    let k = programScope.program.tempalteType[realTypeName].templates![i];
                    map[k] = type.PlainType.templateSpecialization[i];
                }
                let className = realTypeName + '<' + type.PlainType!.templateSpecialization!.map((type) => TypeUsedSign(type)).reduce((p, c) => `${p},${c}`) + '>';
                let templateClass = JSON.parse(JSON.stringify(programScope.program.tempalteType[type.PlainType!.name])) as TypeDef;
                ClassSpecialize(templateClass, map);
                programScope.program.setDefinedType(className, templateClass);//深拷贝，避免污染原来的模板类
                programScope.registerClassUnInference(className);
                ClassScan(programScope.getClassScope(className));
            }

        }
        type.PlainType.name = sign;//强制更新类型名
        type.PlainType.templateSpecialization = undefined;//移除特化参数
        /**
         * 这样更新没有问题，特化模板类的时候一定是一个PlainType，这时候直接更新他的name即可
         */

    } else if (!program.tempalteType[type.PlainType.name] && type.PlainType.templateSpecialization) {
        throw `非模板类:${type.PlainType.name}不能特化`;
    }
}

let globalTypeIndexInTypeTable = 0;
/**
 * 源码中所有的类型在sematicChecK中都会调用registerType注册一遍，所以在这个函数中可以实例化模板
 * @param type 
 * @returns 
 */
export function registerType(type: TypeUsed): number {
    if (type.PlainType != undefined) {
        TempalteCheck(type as { PlainType: PlainType });
    }
    let sign = TypeUsedSign(type);
    let ret: number;
    //如果已经注册了，则直接返回注册结果
    if (typeTable[sign] != undefined) {
        ret = typeTable[sign].index;
    } else {
        typeTable[sign] = { index: globalTypeIndexInTypeTable, type: type };
        ret = globalTypeIndexInTypeTable++;
    }
    if (type.ArrayType != undefined) {//如果是数组类型，注册内部类型
        registerType(type.ArrayType.innerType);
    }
    //这样做只影响typeTable的数据，对原来的program无影响
    if (type.FunctionType != undefined) {
        type = JSON.parse(JSON.stringify({
            FunctionType: {
                namespace: type.FunctionType.namespace,
                hasFunctionScan: type.FunctionType.hasFunctionScan,
                isNative: type.FunctionType.isNative,
                _arguments: type.FunctionType._arguments,
                //body: type.FunctionType.body,  //不拷贝body,避免循环引用
                retType: type.FunctionType.retType,
                capture: type.FunctionType.capture,
                templates: type.FunctionType.templates,
                _construct_for_type: type.FunctionType._construct_for_type
            }
        }));//避免修改到program中的对象
    }
    return ret;
}
/**
 * 把下面代码中的isLess
 * class myClass{
 *      var i=0;
 *      myClass(){}
 *  }
 *  extension function isLess(this myClass v,a:int):bool{
 *      return v.i<a;
 *  }
 * 替换成
 * @extension@myClass@isLess(v:myClass){
 *      return (a:int)=>{
 *          return v.i<a;
 *      };
 *  }
 * 
 * 如下的扩展函数调用
 * var obj:myClass;
 * obj.isLess(2);
 * 会被改造成
 * obj.callEXM(@extension@myClass@isLess)(2);
 * 变成链式调用
 */
function extensionMethodReplace(exm: ExtensionMethod) {
    let typeName = TypeUsedSign(exm.extensionType);
    if (program.extensionMethodsImpl[typeName] == undefined) {
        program.extensionMethodsImpl[typeName] = {};
    }
    program.extensionMethodsImpl[typeName][exm.extendFunName] = {
        namespace: getScopeSpaceName(),
        capture: {},
        _arguments: {
            [exm.thisName]: {
                variable: 'var',
                type: exm.extensionType
            }
        },
        body: {
            desc: 'Block',
            body: [
                {
                    desc: 'ASTNode',
                    ret: {
                        desc: 'ASTNode',
                        immediate: {
                            functionValue: exm.fun
                        }
                    }
                }
            ]
        }
    };
}

function necessaryClassCheck() {
    let hasVMLoadNativeLib = false;
    if (program.getProgramProp('system.VMLoadNativeLib')?.type?.FunctionType != undefined) {
        let VMLoadNativeLibFun = program.getProgramProp('system.VMLoadNativeLib').type?.FunctionType!;
        let argNames = Object.keys(VMLoadNativeLibFun._arguments);
        if (argNames.length == 2) {
            let arg0Sign = TypeUsedSign(VMLoadNativeLibFun._arguments[argNames[0]].type!);
            let arg1Sign = TypeUsedSign(VMLoadNativeLibFun._arguments[argNames[1]].type!);
            let retTypeSign = TypeUsedSign(VMLoadNativeLibFun.retType!);
            if (arg0Sign == '@Array<system.byte>' && arg1Sign == '@Array<@Array<system.byte>>' && retTypeSign == 'void') {
                hasVMLoadNativeLib = true;
            }
        }
    }
    if (!hasVMLoadNativeLib) {
        throw `VM运行必须定义一个名为system.VMLoadNativeLib的native函数,类型如下  参数1:byte[],参数2:byte[][] 返回值类型:void`;
    }

    if (program.getDefinedType('system.exception.NullPointerException') == undefined) {
        throw `VM运行必备类型NullPointerException未定义`;
    } else {
        if (!isPointType({ PlainType: { name: 'system.exception.NullPointerException' } })) {
            throw `NullPointerException必须是引用类型`;
        } else {
            if (program.getDefinedType('system.exception.NullPointerException')._constructor[`args:() retType:void`] == undefined) {
                throw `NullPointerException必须有一个无参构造函数`;
            }
        }
    }

    if (program.getDefinedType('system.exception.ArithmeticException') == undefined) {
        throw `VM运行必备类型ArithmeticException未定义`;
    } else {
        if (!isPointType({ PlainType: { name: 'system.exception.ArithmeticException' } })) {
            throw `ArithmeticException必须是引用类型`;
        } else {
            if (program.getDefinedType('system.exception.ArithmeticException')._constructor[`args:() retType:void`] == undefined) {
                throw `ArithmeticException必须有一个无参构造函数`;
            }
        }
    }

    if (program.getDefinedType('system.exception.CastException') == undefined) {
        throw `VM运行必备类型CastException未定义`;
    } else {
        if (!isPointType({ PlainType: { name: 'system.exception.CastException' } })) {
            throw `CastException必须是引用类型`;
        } else {
            if (program.getDefinedType('system.exception.CastException')._constructor[`args:() retType:void`] == undefined) {
                throw `CastException必须有一个无参构造函数`;
            }
        }
    }

    if (program.getDefinedType('system.exception.ArrayIndexOutOfBoundsException') == undefined) {
        throw `VM运行必备类型ArrayIndexOutOfBoundsException未定义`;
    } else {
        if (!isPointType({ PlainType: { name: 'system.exception.ArrayIndexOutOfBoundsException' } })) {
            throw `ArrayIndexOutOfBoundsException必须是引用类型`;
        } else {
            if (program.getDefinedType('system.exception.ArrayIndexOutOfBoundsException')._constructor[`args:() retType:void`] == undefined) {
                throw `ArrayIndexOutOfBoundsException必须有一个无参构造函数`;
            }
        }
    }

    if (program.getDefinedType('system.string') == undefined) {
        throw `VM运行必备类型string未定义`;
    } else {
        if (!isPointType({ PlainType: { name: 'system.string' } })) {
            throw `string必须是引用类型`;
        } else {
            if (program.getDefinedType('system.string')._constructor[`args:(@Array<system.byte>) retType:void`] == undefined) {
                throw `string必须有一个接受byte[]的构造函数`;
            }
            //此时program.getDefinedType('system.string').property['buffer'].type已经经过类型推导，type不可能为undefined
            let bufferType = program.getDefinedType('system.string').property['buffer'].type;
            assert(bufferType != undefined);
            if (program.getDefinedType('system.string').property['buffer'] == undefined || TypeUsedSign(bufferType) != '@Array<system.byte>') {
                throw `string必须有一个类型为byte[]的buffer成员变量`;
            }
        }
    }
}

export default function semanticCheck() {
    programScope = new ProgramScope(program, {});

    program.setDefinedType('system.object', {
        namespace: '',
        modifier: 'valuetype',
        property: {},
        _constructor: {}
    });
    programScope.registerClass('system.object');//注册point类型
    registerType({ PlainType: { name: 'system.object' } });//在类型表中注册类型

    program.setDefinedType('@null', {
        namespace: '',
        modifier: 'valuetype',
        property: {},
        _constructor: {}
    });
    programScope.registerClass('@null');//注册null类型
    registerType({ PlainType: { name: '@null' } });//在类型表中注册类型


    // 把所有的扩展函数挪到extensionMethodsImpl
    for (let extendTypeName in program.extensionMethodsDef) {
        for (let methodName in program.extensionMethodsDef[extendTypeName]) {
            extensionMethodReplace(program.extensionMethodsDef[extendTypeName][methodName]);
        }
    }
    //对扩展函数进行类型检查
    for (let extendTypeName in program.extensionMethodsImpl) {
        for (let methodName in program.extensionMethodsImpl[extendTypeName]) {
            let fun = program.extensionMethodsImpl[extendTypeName][methodName];
            let blockScope = new BlockScope(programScope, fun, fun.body!, {});
            functionScan(blockScope, fun);
        }
    }
    program.templatePropSpace = {};
    program.tempalteType = {};
    for (let spaceName in program.propertySpace) {
        setScopeSpaceName(spaceName);
        for (let variableName in program.propertySpace[spaceName]) {
            var prop = program.propertySpace[spaceName][variableName];
            if (prop.type?.FunctionType?.templates) {
                if (program.templatePropSpace[spaceName] == undefined) {
                    program.templatePropSpace[spaceName] = {};
                }
                program.templatePropSpace[spaceName][variableName] = program.propertySpace[spaceName][variableName];
                program.movePropToTemplateProp(spaceName, variableName);//移动模板函数
            }
        }
    }
    for (let typeName of program.getDefinedTypeNames()) {
        if (program.getDefinedType(typeName).templates) {
            program.tempalteType[typeName] = program.getDefinedType(typeName);
            program.moveDefinedTypeToTemplateType(typeName);//移动模板类
        }
    }

    //扫描definedType
    for (let typeName of program.getDefinedTypeNames()) {
        ClassScan(programScope.getClassScope(typeName));
    }
    //扫描property
    for (let spaceName in program.propertySpace) {
        setScopeSpaceName(spaceName);
        for (let variableName in program.propertySpace[spaceName]) {
            var prop = program.propertySpace[spaceName][variableName];
            if (prop.initAST != undefined) {

                //使用了零长数组，则把已经声明类型向下传递
                if (prop.initAST.immediateArray != undefined && prop.initAST.immediateArray.length == 0) {
                    prop.initAST.type = prop.type;
                }

                let initType = nodeRecursion(programScope, prop.initAST, [], {}).type;
                if (prop.type != undefined) {
                    typeCheck(prop.type, initType, `初始化的值类型和声明类型不一致:${variableName}`);
                } else {
                    if (TypeUsedSign(initType) == '@null') {
                        /**
                         * 如下代码会命中条件
                         * var a=null;
                         * 此时无法推导a的类型
                         */
                        throw `无法推导类型`;
                    }
                    prop.type = initType;
                }
            } if (prop.type?.FunctionType) {
                let blockScope = new BlockScope(programScope, prop.type?.FunctionType, prop.type?.FunctionType.body!, {});
                functionScan(blockScope, prop.type?.FunctionType);
            }
            registerType(prop.type!);//经过推导，类型已经确定了
        }
    }

    //检查值类型是否递归包含
    for (let typeName of program.getDefinedTypeNames()) {
        if (program.getDefinedType(typeName).recursiveChecked != true && program.getDefinedType(typeName).modifier == 'valuetype') {
            valueTypeRecursiveCheck(typeName);
        }
    }

    for (let typeName of program.getDefinedTypeNames()) {//计算每个类型的size和索引，同时注册类型
        program.getDefinedType(typeName).size = sizeof(typeName);
        registerType({ PlainType: { name: typeName } });//在类型表中注册类型
    }
    let programSize = 0;
    //计算program的size
    for (let spaceName in program.propertySpace) {
        setScopeSpaceName(spaceName);
        for (let fieldName in program.propertySpace[spaceName]) {
            let field = program.propertySpace[spaceName][fieldName];
            if (field.type!.PlainType != undefined) {
                let fieldTypeName = field.type!.PlainType.name;
                if (fieldTypeName == 'void') {
                    throw `void无法计算大小,任何成员都不能是void类型`;
                }
                if (program.getDefinedType(fieldTypeName).modifier != 'valuetype') {
                    programSize += globalVariable.pointSize;//非值类型
                } else {
                    programSize += sizeof(fieldTypeName);
                }
            } else {
                programSize += globalVariable.pointSize;//不是普通类型就只能用指针表示
            }
        }
    }
    program.size = programSize;
    necessaryClassCheck();
}