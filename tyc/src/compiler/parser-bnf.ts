import fs from "fs";
import TSCC from "../tscc/tscc.js";
import { Grammar } from "../tscc/tscc.js";
import { userTypeDictionary } from './lexrule.js';
import { FunctionSign, FunctionSignWithoutRetType, TypeUsedSign } from "./lib.js"
import { Program } from "./program.js";
export let namespaceforParser = '';
export function setParserNameSpace(name: string) {
    namespaceforParser = name;
}
let grammar: Grammar = {
    userCode: `
import { userTypeDictionary } from './lexrule.js';
import { FunctionSign, FunctionSignWithoutRetType, TypeUsedSign } from "./lib.js"
import { Program } from "./program.js";
export let namespaceforParser = '';
export function setParserNameSpace(name: string) {
    namespaceforParser = name;
}
    `,
    tokens: ['private', '%', '<<', '>>', '^', '~', '&', '|', 'extension', 'immediate_string', 'native', 'var', 'val', ';', 'id', 'immediate_val', '+', '-', '++', '--', '(', ')', '?', '{', '}', '[', ']', ',', ':', 'function', 'class', '=>', 'operator', 'new', '.', 'extends', 'if', 'else', 'do', 'while', 'for', 'switch', 'case', 'default', 'valuetype', 'import', 'as', 'break', 'continue', 'this', 'return', 'get', 'set', 'sealed', 'try', 'catch', 'throw', 'super', 'basic_type', 'instanceof', 'autounwinding'],
    association: [
        { 'right': ['='] },
        { 'right': ['?'] },//三目运算
        { 'left': ['||'] },
        { 'left': ['&&'] },
        { 'left': ['|'] },
        { 'left': ['^'] },
        { 'left': ['&'] },
        { 'left': ['==', '!='] },
        { 'nonassoc': ['priority_for_plainType'] },//见"object:object instanceof type"注释的情况三，小于符号<即可
        { 'left': ['>', '<', '<=', '>='] },
        { 'left': ['>>', '<<'] },
        { 'left': ['+', '-'] },
        { 'left': ['*', '/', '%'] },
        { 'left': ['++', '--'] },
        { 'left': ['~'] },
        { 'left': ['!'] },
        { 'right': ['=>'] },
        { 'nonassoc': ['cast_priority'] },//强制转型比"("、"["、"."优先级低,比+ - * /优先级高,如(int)f()表示先执行函数调用再转型 (int) a+b表示先把a转型成int，然后+b
        { 'nonassoc': ['low_priority_for_array_placeholder'] },//见array_placeholder注释,优先级低于'['
        { 'nonassoc': ['low_priority_for_['] },//见type注释,优先级低于'['
        { 'nonassoc': ['instanceof'] },
        { 'nonassoc': ['low_priority_for_if_stmt'] },//这个符号的优先级小于else
        { 'nonassoc': ['else'] },
        { 'nonassoc': ['['] },
        { 'nonassoc': ['('] },
        { 'nonassoc': ['.'] },
    ],
    accept: function ($, s): Program {
        return $[0] as Program;
    },
    BNF: [
        {
            "program:import_stmts program_units": {
                action: function ($, s): Program {
                    let program_units = $[1] as VariableDescriptor | { [key: string]: TypeDef } | { [key: string]: ExtensionMethod };
                    let program: Program = new Program();//为了生成的解析器不报红
                    program.propertySpace[namespaceforParser] = {};
                    for (let k in program_units) {
                        if (program_units[k].hasOwnProperty('thisName')) {//是扩展方法定义
                            let extensionMethod = (program_units[k] as ExtensionMethod);
                            let extensionTypeName = TypeUsedSign(extensionMethod.extensionType);//因为不允许扩展模板类，所以这里的名字一定和definedType一样
                            let extendFunName = extensionMethod.extendFunName;
                            if (program.getDefinedType(extensionTypeName)?.property[extendFunName] != undefined) {
                                throw `类型${extensionTypeName}扩展方法的名字和该类型已有成员${extendFunName}重复`;
                            }
                            if (program.extensionMethodsDef[extensionTypeName] == undefined) {
                                program.extensionMethodsDef[extensionTypeName] = {};
                            }
                            program.extensionMethodsDef[extensionTypeName][extendFunName] = extensionMethod;
                        }
                        else if (program_units[k].hasOwnProperty("modifier")) {//是类型定义
                            let defClass = (program_units[k] as TypeDef);
                            for (let fieldName in defClass.property) {
                                if (program.extensionMethodsDef[k]?.[fieldName] != undefined) {
                                    throw `类型${k}扩展方法的名字和该类型已有成员${fieldName}重复`;
                                }
                            }
                            program.setDefinedType(k, program_units[k] as TypeDef);
                        }
                        else {//是变量定义
                            program.propertySpace[namespaceforParser][k] = program_units[k] as VariableProperties;
                        }
                    }
                    return program;
                }
            }
        },//整个程序由导入语句组和程序单元组构成
        { "import_stmts:": {} },//导入语句组可以为空
        { "import_stmts:import_stmts import_stmt": {} },//导入语句组由一条或者多条导入语句组成
        { "import_stmt:import id ;": {} },//导入语句语法
        {
            "program_units:": {
                action: function ($, s): VariableDescriptor | { [key: string]: TypeDef } {
                    return {} as VariableDescriptor | { [key: string]: TypeDef };
                }
            }
        },//程序单元组可以为空
        {
            "program_units:program_units program_unit": {
                action: function ($, s): VariableDescriptor | { [key: string]: TypeDef } | { [key: string]: ExtensionMethod } {
                    let program_units = $[0] as VariableDescriptor | { [key: string]: TypeDef } | { [key: string]: ExtensionMethod };
                    let program_unit = $[1] as VariableDescriptor | { [key: string]: TypeDef } | { [key: string]: ExtensionMethod };
                    if (program_units[Object.keys(program_unit)[0]] != undefined) {
                        throw new Error(`重复定义变量、类型、或者扩展方法${Object.keys(program_unit)[0]}`);
                    } else {
                        program_units[Object.keys(program_unit)[0]] = program_unit[Object.keys(program_unit)[0]];
                    }
                    return program_units;
                }
            }
        },//程序单元组由一个或者多个程序单元组成
        {
            "program_unit:declare ;": {
                action: function ($, s): VariableDescriptor {
                    return $[0] as VariableDescriptor;
                }
            }
        },//程序单元可以是一条声明语句
        {
            "program_unit:extension_method": {
                action: function ($, s): { [key: string]: ExtensionMethod } {
                    return $[0] as { [key: string]: ExtensionMethod };
                }
            }
        },//扩展方法
        {
            "program_unit:class_definition": {
                action: function ($, s): { [key: string]: TypeDef } {
                    return $[0] as { [key: string]: TypeDef };
                }
            }
        },//程序单元可以是一个类定义语句
        /**
         * var和val的区别就是一个可修改，一个不可修改,val类似于其他语言的const
         * 应当保证declare生成的VariableDescriptor只有一个key
         */
        {
            "declare:var id : type": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let type = $[3] as TypeUsed;
                    let ret = JSON.parse("{}") as VariableDescriptor;//为了生成的解析器不报红
                    ret[id] = { variable: 'var', type: type };
                    return ret;
                }
            }
        },//声明语句_1，声明一个变量id，其类型为type
        {
            "declare:initDeclare": {
                action: function ($, s): VariableDescriptor {
                    return $[0] as VariableDescriptor;
                }
            }
        },//有初始化语句的声明
        {
            "initDeclare:var id : type = object": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let type = $[3] as TypeUsed;
                    let obj = $[5] as ASTNode;
                    let ret = JSON.parse("{}") as VariableDescriptor;//为了生成的解析器不报红
                    ret[id] = { variable: 'var', type: type, initAST: obj };
                    return ret;
                }
            }
        },//声明语句_2，声明一个变量id，并且将object设置为id的初始值，object的类型要和声明的类型一致
        {
            "initDeclare:var id = object": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let obj = $[3] as ASTNode;
                    let ret = JSON.parse("{}") as VariableDescriptor;//为了生成的解析器不报红
                    ret[id] = { variable: 'var', initAST: obj };
                    return ret;
                }
            }
        },//声明语句_3，声明一个变量id，并且将object设置为id的初始值，类型自动推导
        {
            "initDeclare:val id : type = object": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let type = $[3] as TypeUsed;
                    let obj = $[5] as ASTNode;
                    let ret = JSON.parse("{}") as VariableDescriptor;//为了生成的解析器不报红
                    ret[id] = { variable: 'val', type: type, initAST: obj };
                    return ret;
                }
            }
        },//声明语句_4，声明一个变量id，并且将object设置为id的初始值，object的类型要和声明的类型一致
        {
            "initDeclare:val id = object": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let obj = $[3] as ASTNode;
                    let ret = JSON.parse("{}") as VariableDescriptor;//为了生成的解析器不报红
                    ret[id] = { variable: 'val', initAST: obj };
                    return ret;
                }
            }
        },//声明语句_5，声明一个变量id，并且将object设置为id的初始值，类型自动推导
        {
            "declare:function_definition": {
                action: function ($, s): VariableDescriptor {
                    return $[0] as VariableDescriptor;
                }
            }
        },//声明语句_6，可以是一个函数定义语句
        {
            "class_definition:modifier class basic_type template_declare extends_declare { class_units }": {
                action: function ($, _s): { [key: string]: TypeDef } {
                    let template_declare = $[3] as string[] | undefined;
                    if (template_declare != undefined) {
                        for (let t of template_declare) {
                            userTypeDictionary.delete(t);
                        }
                    }
                    let basic_type = $[2] as TypeUsed;
                    let modifier = $[0] as 'valuetype' | 'sealed' | undefined;
                    let extends_declare = $[4] as TypeUsed | undefined;
                    let class_units = $[6] as {
                        operatorOverload: { [key in opType | opType2]: { [key: string]: FunctionType } },
                        property: VariableDescriptor,
                        _constructor: { [key: string]: FunctionType };
                    };
                    let property = class_units.property;
                    for (let op in class_units.operatorOverload) {
                        for (let funSign in class_units.operatorOverload[op as opType | opType2]) {
                            property[`@operatorOverload@${op}@${funSign}`] = {
                                variable: 'val',
                                type: {
                                    FunctionType: class_units.operatorOverload[op as opType | opType2][funSign]
                                }
                            };
                        }
                    }
                    for (let k in class_units._constructor) {
                        if (class_units._constructor[k]._construct_for_type != basic_type.PlainType!.name) {
                            throw new Error(`类型${basic_type.PlainType!.name}内部不能定义非${basic_type.PlainType!.name}的构造函数${class_units._constructor[k]._construct_for_type}`);
                        }
                    }
                    let ret: { [key: string]: TypeDef } = JSON.parse("{}");//为了生成的解析器不报红
                    ret[basic_type.PlainType!.name] = { modifier: modifier, templates: template_declare, property: property, extends: extends_declare, _constructor: class_units._constructor };
                    return ret;
                }
            }
        },//class定义语句由修饰符等组成(太长了我就不一一列举)
        { "extends_declare:": {} },//继承可以为空
        {
            "extends_declare:extends type": {
                action: function ($, s): TypeUsed {
                    return $[1] as TypeUsed;
                }
            }
        },//继承,虽然文法是允许继承任意类型,但是在语义分析的时候再具体决定该class能不能被继承
        {
            "function_definition:function id template_declare ( parameter_declare ) { statements }": {
                action: function ($, s): VariableDescriptor {
                    let template_declare = $[2] as string[] | undefined;
                    if (template_declare != undefined) {
                        for (let t of template_declare) {
                            userTypeDictionary.delete(t);
                        }
                    }
                    let id = $[1] as string;
                    let parameter_declare = $[4] as VariableDescriptor;
                    let statements = $[7] as Block;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    ret[id] = { variable: 'val', type: { FunctionType: { namsespace: namespaceforParser, capture: {}, _arguments: parameter_declare, body: statements, templates: template_declare } } };
                    return ret;
                }
            }
        },//函数定义语句，同样太长，不列表,返回值类型可以不声明，自动推导,lambda就不用写返回值声明
        {
            "function_definition:function id template_declare ( parameter_declare ) : type { statements }": {
                action: function ($, s): VariableDescriptor {
                    let template_declare = $[2] as string[] | undefined;
                    if (template_declare != undefined) {
                        for (let t of template_declare) {
                            userTypeDictionary.delete(t);
                        }
                    }
                    let id = $[1] as string;
                    let parameter_declare = $[4] as VariableDescriptor;
                    let ret_type = $[7] as TypeUsed;
                    let statements = $[9] as Block;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    ret[id] = { variable: 'val', type: { FunctionType: { namsespace: namespaceforParser, capture: {}, _arguments: parameter_declare, body: statements, templates: template_declare, retType: ret_type } } };
                    return ret;
                }
            }
        },//函数定义语句，同样太长，不列表
        {
            "function_definition:function id template_declare ( parameter_declare ) : type { native }": {
                action: function ($, s): VariableDescriptor {
                    let template_declare = $[2] as string[] | undefined;
                    if (template_declare != undefined) {
                        for (let t of template_declare) {
                            userTypeDictionary.delete(t);
                        }
                    }
                    let id = $[1] as string;
                    let parameter_declare = $[4] as VariableDescriptor;
                    let ret_type = $[7] as TypeUsed;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    ret[id] = { variable: 'val', type: { FunctionType: { namsespace: namespaceforParser, capture: {}, _arguments: parameter_declare, isNative: true, templates: template_declare, retType: ret_type } } };
                    return ret;
                }
            }
        },//函数定义语句，native函数
        {
            "extension_method:extension function id ( this plainType id , parameter_declare ) { statements }": {
                action: function ($, s): { [key: string]: ExtensionMethod } {
                    let extensionType = $[5] as TypeUsed;
                    if (extensionType.PlainType!.templateSpecialization) {
                        throw `不能扩展模板类的方法`;
                    }
                    let id = `@extension@${TypeUsedSign(extensionType)}@${$[2] as string}`;
                    let thisName = $[6] as string;
                    let _arguments = $[8] as VariableDescriptor;
                    let body = $[11] as Block;
                    return {
                        [id]: {
                            extensionType,
                            thisName,
                            extendFunName: $[2] as string,
                            fun: { namsespace: namespaceforParser, capture: {}, _arguments, isNative: false, body }
                        }
                    };
                }
            }
        },//有参扩展方法
        {
            "extension_method:extension function id ( this plainType id ) { statements }": {
                action: function ($, s): { [key: string]: ExtensionMethod } {
                    let extensionType = $[5] as TypeUsed;
                    if (extensionType.PlainType!.templateSpecialization) {
                        throw `不能扩展模板类的方法`;
                    }
                    let id = `@extension@${TypeUsedSign(extensionType)}@${$[2] as string}`;
                    let thisName = $[6] as string;
                    let body = $[9] as Block;
                    return {
                        [id]: {
                            extensionType,
                            thisName,
                            extendFunName: $[2] as string,
                            fun: { namsespace: namespaceforParser, capture: {}, _arguments: {}, isNative: false, body }
                        }
                    };
                }
            }
        },//无参扩展方法
        {
            "extension_method:extension function id ( this plainType id , parameter_declare ) : type { statements }": {
                action: function ($, s): { [key: string]: ExtensionMethod } {
                    let extensionType = $[5] as TypeUsed;
                    if (extensionType.PlainType!.templateSpecialization) {
                        throw `不能扩展模板类的方法`;
                    }
                    let id = `@extension@${TypeUsedSign(extensionType)}@${$[2] as string}`;
                    let thisName = $[6] as string;
                    let _arguments = $[8] as VariableDescriptor;
                    let retType = $[11] as TypeUsed;
                    let body = $[13] as Block;
                    return {
                        [id]: {
                            extensionType,
                            thisName,
                            extendFunName: $[2] as string,
                            fun: { namsespace: namespaceforParser, capture: {}, _arguments, isNative: false, retType, body }
                        }
                    };
                }
            }
        },//有参扩展方法(声明了返回值)
        {
            "extension_method:extension function id ( this plainType id ) : type { statements }": {
                action: function ($, s): { [key: string]: ExtensionMethod } {
                    let extensionType = $[5] as TypeUsed;
                    if (extensionType.PlainType!.templateSpecialization) {
                        throw `不能扩展模板类的方法`;
                    }
                    let id = `@extension@${TypeUsedSign(extensionType)}@${$[2] as string}`;
                    let thisName = $[6] as string;
                    let retType = $[9] as TypeUsed;
                    let body = $[11] as Block;
                    return {
                        [id]: {
                            extensionType,
                            thisName,
                            extendFunName: $[2] as string,
                            fun: { namsespace: namespaceforParser, capture: {}, _arguments: {}, isNative: false, retType, body }
                        }
                    };
                }
            }
        },//无参扩展方法(声明了返回值)
        {
            "modifier:valuetype": {
                action: function ($, s): string {
                    return 'valuetype';
                }
            }
        },//modifier可以是"valuetype"
        {
            "modifier:sealed": {
                action: function ($, s): string {
                    return 'sealed';
                }
            }
        },//modifier可以是"sealed"
        { "modifier:": {} },//modifier可以为空
        { "template_declare:": {} },//模板声明可以为空
        {
            "template_declare:template_definition": {
                action: function ($, s): string[] {
                    return $[0] as string[];
                }
            }
        },//模板声明可以是一个模板定义
        {
            "template_definition:< template_definition_list >": {
                action: function ($, s): string[] {
                    for (let t of $[1] as string[]) {
                        if (userTypeDictionary.has(t)) {
                            throw new Error(`不能使用已有类型作为模板类型声明`);
                        }
                        userTypeDictionary.add(t);
                    }
                    return $[1] as string[];
                }
            }
        },//模板定义由一对尖括号<>和内部的template_definition_list组成
        {
            "template_definition_list:id": {
                action: function ($, s): string[] {
                    return [$[0] as string];
                }
            }
        },//template_definition_list可以是一个id
        {
            "template_definition_list:template_definition_list , id": {
                action: function ($, s): string[] {
                    let template_definition_list = $[0] as string[];
                    template_definition_list.push($[2] as string)
                    return template_definition_list;
                }
            }
        },//template_definition_list可以是一个template_definition_list后面接上 , id
        /**
         * type后面的'['会导致如下二义性:
         * 所有type都有这种情况，用int作为一个type举例
         * 情况1. new int []
         * 1.1 new (int)[]  
         * 1.2 new (int[])
         * 情况2. function fun():int []
         * 2.1 (function fun():int)[] 是一个函数数组
         * 2.2 function fun():(int[]) 是一个返回数组的函数
         * 上述两种情况我们都希望取第二种语法树，所以type相关的几个产生式优先级都设置为低于'[',凡是遇到符号'['一律移入
         * question: 
         * 输入:"new int[][][3][];"和"new int[][][][]" 是否合法?
         * answer:
         * 不合法,对于输入"new int[][][3][];"来说,也许你会认为这个串会被解析成
         * new (int[][])[3][];
         * 其中int[][]会被解析成type,则这个输入对应了产生式 object:new type [3][]
         * 我们分析一下编译器的格局:
         * new int[][].[3][],此时遇到了符号'[',因为我们规定这个格局应该选择移入而不是规约,所以编译器还在type产生式还没有规约完成
         * new int[][][][],并且把(int[][][][])规约成type,则这个串会被规约成new type，然而new type的时候是必须调用构造函数的,所以输入new int[][][][]也是非法的
         * 合法的输入应该是new int[][][][](),当然这只是符合文法而已,在语义检查的时候我们会进行错误处理,有的type是不允许被new的(说的就是array_type)
         */
        {
            "type:( type )": {
                action: function ($, s): TypeUsed {
                    return $[1] as TypeUsed;
                }
            }
        },//type可以用圆括号包裹
        {
            "type:plainType": {
                priority: "priority_for_plainType",
                action: function ($, s): TypeUsed {
                    return $[0] as TypeUsed;
                }
            }
        },//简单类型
        {
            "type:functionType": {
                action: function ($, s): TypeUsed {
                    return $[0] as TypeUsed;
                }
            }
        },//函数类型
        {
            "type:arrayType": {
                action: function ($, s): TypeUsed {
                    return $[0] as TypeUsed;
                }
            }
        },//数组类型
        {
            "plainType:basic_type": {
                priority: "low_priority_for_[",
                action: function ($, s): { PlainType: PlainType } {
                    return $[0] as { PlainType: PlainType };
                }
            }
        },//type可以是一个base_type
        {
            "plainType:plainType templateSpecialization": {
                priority: "low_priority_for_[",
                action: function ($, s): { PlainType: PlainType } {
                    let basic_type = $[0] as TypeUsed;
                    let templateSpecialization = $[1] as TypeUsed[];
                    return { PlainType: { name: basic_type.PlainType!.name, templateSpecialization: templateSpecialization } };
                }
            }
        },//type可以是一个base_type templateSpecialization
        {
            "functionType:template_definition ( parameter_declare ) => type": {
                priority: "low_priority_for_[",
                action: function ($, s): TypeUsed {
                    /**
                     * 设计文法的时候考虑到这种情况
                     * funtion add<T>(a:T,b:T){return a+b};
                     * var f=add;
                     * f<int>(1,2);
                     * 但是实现的时候发现，这样做需要在运行时实现模板特化，太复杂了，暂时放弃
                     */
                    throw `不允许使用泛型函数类型`;

                    // let template_definition = $[0] as string[];
                    // for (let t of template_definition) {
                    //     userTypeDictionary.delete(t);
                    // }
                    // let parameter_declare = $[2] as VariableDescriptor;
                    // let ret_type = $[5] as TypeUsed;
                    // return { FunctionType: {namsespace: namespaceforParser, capture: {}, templates: template_definition, _arguments: parameter_declare, retType: ret_type } };
                }
            }
        },//泛型函数类型
        {
            "functionType:( parameter_declare ) => type": {
                priority: "low_priority_for_[",
                action: function ($, s): TypeUsed {
                    let parameter_declare = $[1] as VariableDescriptor;
                    let ret_type = $[4] as TypeUsed;
                    return { FunctionType: { namsespace: namespaceforParser, capture: {}, _arguments: parameter_declare, retType: ret_type } };
                }
            }
        },//函数类型
        {
            "arrayType:type array_type_list": {
                priority: "low_priority_for_[",
                action: function ($, s): TypeUsed {
                    let type = $[0] as TypeUsed;
                    if (type.PlainType?.name == 'void') {
                        throw `不允许创建void数组`;
                    }
                    let array_type_list = $[1] as number;
                    let ret: TypeUsed = type;
                    for (let i = 0; i < array_type_list; i++) {
                        ret = { ArrayType: { innerType: ret } };
                    }
                    return ret;
                }
            }
        },//数组类型
        {
            "array_type_list:[ ]": {
                action: function ($, s): number {
                    return 1;
                }
            }
        },//array_type_list可以是一对方括号
        {
            "array_type_list:array_type_list [ ]": {
                action: function ($, s): number {
                    let array_type_list = $[0] as number;
                    return array_type_list + 1;
                }
            }
        },//array_type_list可以是array_type_list后面再接一对方括号
        {
            "parameter_declare:parameter_list": {
                action: function ($, s): VariableDescriptor {
                    return $[0] as VariableDescriptor;
                }
            }
        },//parameter_declare可以由parameter_list组成
        {
            "parameter_declare:": {
                action: function ($, s): VariableDescriptor {
                    return {};
                }
            }
        },//parameter_declare可以为空
        {
            "parameter_list:id : type": {
                action: function ($, s): VariableDescriptor {
                    let id = $[0] as string;
                    let type = $[2] as TypeUsed;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    ret[id] = { variable: 'var', type: type };
                    return ret;
                }
            }
        },//parameter_list可以是一个 id : type
        {
            "parameter_list:parameter_list , id : type": {
                action: function ($, s): VariableDescriptor {
                    let parameter_list = $[0] as VariableDescriptor;
                    let id = $[2] as string;
                    let type = $[4] as TypeUsed;
                    if (parameter_list[id] != undefined) {
                        throw new Error(`参数${id}重复定义`);
                    }
                    parameter_list[id] = { variable: 'var', type: type };
                    return parameter_list;
                }
            }
        },//parameter_list可以是一个parameter_list接上 , id : type
        {
            "class_units:class_units class_unit": {
                action: function ($, s): { operatorOverload: { [key: string]: { [key: string]: FunctionType } }, property: VariableDescriptor, _constructor: { [key: string]: FunctionType } } {
                    let class_units = $[0] as { operatorOverload: { [key: string]: { [key: string]: FunctionType } }, property: VariableDescriptor, _constructor: { [key: string]: FunctionType } };
                    let class_unit = $[1] as { [key: string]: FunctionType } | VariableDescriptor | [{ [key: string]: FunctionType }];//{ [key: string]: FunctionType }是为了表示一个操作符重载
                    if (Array.isArray(class_unit)) {//是_constructor
                        let sign = Object.keys(class_unit[0])[0];
                        if (class_units._constructor[sign] != undefined) {
                            throw new Error(`构造函数签名${sign}重复`);
                        }
                        class_units._constructor[sign] = class_unit[0][sign];
                    } else {
                        for (let k in class_unit) {
                            if (class_unit[k].hasOwnProperty("_arguments")) {//是操作符重载,VariableDescriptor没有argument属性,k一定是'='|'+'|'-'|'*'|'/'|'<'|'<='|'>'|'>='|'=='|'||'|'&&'中的一个
                                let sign = FunctionSignWithoutRetType((class_unit as { [key: string]: FunctionType })[k]);
                                if (class_units.operatorOverload[k] == undefined) {
                                    class_units.operatorOverload[k] = {};
                                }
                                if (class_units.operatorOverload[k][sign] != undefined) {
                                    throw new Error(`重载操作符${k}->${sign}重复定义`);
                                } else {
                                    class_units.operatorOverload[k][sign] = (class_unit as { [key: string]: FunctionType })[k];
                                }
                            } else {//是普通成员
                                if (!class_units.property.hasOwnProperty(k) && !class_units.property.hasOwnProperty(`@get_${k}`) && !class_units.property.hasOwnProperty(`@set_${k}`)) {//之前没有定义过这个成员
                                    if (k.startsWith(`@get_`) || k.startsWith(`@set_`)) {//如果当前是定义一个get或者set
                                        let realName = k.substring(5);
                                        if (class_units.property.hasOwnProperty(realName)) {
                                            throw new Error(`重复定义成员${k}`);
                                        }
                                    }
                                    let prop = (class_unit as VariableDescriptor)[k];
                                    class_units.property[k] = prop;
                                } else {
                                    throw new Error(`重复定义成员${k}`);
                                }

                            }
                        }
                    }
                    return class_units;
                }
            }
        },//class_units可以由多个class_unit组成
        {
            "class_units:": {
                action: function ($, s): { operatorOverload: { [key: string]: FunctionType }, property: VariableDescriptor, _constructor: { [key: string]: FunctionType } } {
                    return { property: {}, operatorOverload: {}, _constructor: {} };
                }
            }
        },//class_units可以为空
        {
            "class_unit:access_modifier declare ;": {
                action: function ($, s): VariableDescriptor {
                    let accessModifier = $[0] as 'private' | 'public';
                    let variable = $[1] as VariableDescriptor;
                    let name = Object.keys(variable)[0];
                    if (accessModifier == 'private') {
                        variable[name].accessModifier = 'private'
                    }
                    return variable;
                }
            }
        },//class_unit可以是一个声明语句
        {
            "class_unit:operator_overload": {
                action: function ($, s): { [key: string]: FunctionType } {
                    return $[0] as { [key: string]: FunctionType };
                }
            }
        },//class_unit可以是一个运算符重载
        {
            "class_unit:get id ( ) : type { statements } ;": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let retType = $[5] as TypeUsed;
                    let statements = $[7] as Block;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    ret[`@get_${id}`] = {
                        variable: 'var',
                        type: {
                            FunctionType: {
                                namsespace: namespaceforParser,
                                capture: {},
                                _arguments: {},
                                body: statements,
                                retType: retType
                            }
                        }
                    };
                    return ret;
                }
            }
        },//get
        {
            "class_unit:set id ( id : type ) { statements } ;": {
                action: function ($, s): VariableDescriptor {
                    let id = $[1] as string;
                    let argumentId = $[3] as string;
                    let argumentIdType = $[5] as TypeUsed;
                    let statements = $[8] as Block;
                    let ret: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红
                    argument[argumentId] = {
                        variable: 'var',
                        type: argumentIdType
                    };
                    ret[`@set_${id}`] = {
                        variable: 'var',
                        type: {
                            FunctionType: {
                                namsespace: namespaceforParser,
                                capture: {},
                                _arguments: argument,
                                body: statements,
                                retType: {
                                    PlainType: {
                                        name: 'void'
                                    }
                                }
                            }
                        }
                    };
                    return ret;
                }
            }
        },//set
        {
            "class_unit:basic_type ( parameter_declare )  { statements }": {
                action: function ($, s): [{ [key: string]: FunctionType }] {
                    let basic_type = $[0] as TypeUsed;
                    let parameter_declare = $[2] as VariableDescriptor;
                    let statements = $[5] as Block;
                    let ret: { [key: string]: FunctionType } = JSON.parse("{}");//为了生成的解析器不报红
                    let functionType: FunctionType = { namsespace: namespaceforParser, capture: {}, _construct_for_type: basic_type.PlainType!.name, _arguments: parameter_declare, body: statements, retType: { PlainType: { name: 'void' } } };
                    let sign: string = FunctionSign(functionType);
                    ret[sign] = functionType;
                    return [ret];
                }
            }
        },//构造函数
        {
            "access_modifier:": {
                action: function ($, s): string {
                    return 'public';
                }
            }
        },//访问修饰符可以为空
        {
            "access_modifier:private": {
                action: function ($, s): string {
                    return 'private';
                }
            }
        },//访问修饰符可以为private
        {
            "operator_overload:operator + ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator - ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator * ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator / ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator < ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator <= ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator > ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator >= ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator == ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator || ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator && ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator [ ] ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator % ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator | ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator & ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator >> ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator << ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ^ ( id : type ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let statements = $[10] as Block;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ++ ( ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let statements = $[7] as Block;
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator -- ( ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let statements = $[7] as Block;
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ! ( ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let statements = $[7] as Block;
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ~ ( ) : type { statements } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let statements = $[7] as Block;
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        body: statements,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator + ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator - ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator * ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator / ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator < ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator <= ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator > ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator >= ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator == ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator || ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator && ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator [ ] ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator % ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator | ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator & ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator >> ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator << ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ^ ( id : type ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let id = $[3] as string;
                    let op: opType | opType2 = $[1];
                    let parameterType = $[5] as TypeUsed;
                    let retType = $[8] as TypeUsed;
                    let argument: VariableDescriptor = JSON.parse("{}");//为了生成的解析器不报红 
                    argument[id] = { variable: 'var', type: parameterType };
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: argument,
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ++ ( ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator -- ( ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ! ( ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "operator_overload:operator ~ ( ) : type { native } ;": {
                action: function ($, s): { [key: string]: FunctionType } {
                    let retType = $[5] as TypeUsed;
                    let op: opType | opType2 = $[1];
                    let fun: FunctionType = {
                        namsespace: namespaceforParser,
                        capture: {},
                        _arguments: {},
                        isNative: true,
                        retType: retType
                    };
                    let ret: { [key: string]: FunctionType } = JSON.parse('{}');
                    ret[op] = fun;
                    return ret;
                }
            }
        },
        {
            "statements:statements statement": {
                action: function ($, s): Block {
                    let statements = $[0] as Block;
                    let statement = $[1] as ASTNode;
                    statements.body.push(statement);
                    return statements;
                }
            }
        },//statements可以由多个statement组成
        {
            "statements:": {
                action: function ($, s): Block {
                    return { desc: "Block", body: [] } as Block;
                }
            }
        },//statements可以为空
        {
            "statement:declare ;": {
                action: function ($, s): ASTNode {
                    let declare: VariableDescriptor = $[0];
                    return { desc: "ASTNode", def: declare };
                }
            }
        },//statement可以是一条声明语句
        {
            "statement:try { statements } catch_list": {
                action: function ($, s): ASTNode {
                    let tryBlock = $[2] as Block;
                    let catch_list = $[4] as { catchVariable: string, catchType: TypeUsed, catchBlock: Block }[];
                    return { desc: "ASTNode", trycatch: { tryBlock: tryBlock, catch_list: catch_list } };
                }
            }
        },//try catch语句，允许捕获任意类型的异常
        {
            "catch_list:catch ( id : type ) { statements }": {
                action: function ($, s): { catchVariable: string, catchType: TypeUsed, catchBlock: Block }[] {
                    let catchVariable = $[2] as string;
                    let catchType = $[4] as TypeUsed;
                    let catchBlock = $[7] as Block;
                    return [{ catchVariable: catchVariable, catchType: catchType, catchBlock: catchBlock }];
                }
            }
        },
        {
            "catch_list:catch_list catch ( id : type ) { statements }": {
                action: function ($, s): { catchVariable: string, catchType: TypeUsed, catchBlock: Block }[] {
                    let catch_list = $[0] as { catchVariable: string, catchType: TypeUsed, catchBlock: Block }[];
                    let catchVariable = $[3] as string;
                    let catchType = $[5] as TypeUsed;
                    let catchBlock = $[8] as Block;
                    catch_list.push({ catchVariable: catchVariable, catchType: catchType, catchBlock: catchBlock });
                    return catch_list;
                }
            }
        },
        {
            "statement:throw object ;": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", throwStmt: $[1] as ASTNode };
                }
            }
        },//抛异常语句
        {
            "statement:return object ;": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ret: $[1] as ASTNode };
                }
            }
        },//带返回值的返回语句
        {
            "statement:return ;": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ret: "" };
                }
            }
        },//不带返回值的语句
        {
            "statement:autounwinding ( declares ) { statements }": {
                action: function ($, s): ASTNode {
                    let initDeclares = $[2] as VariableDescriptor[];
                    let statements = $[5] as Block;
                    for (let i = initDeclares.length - 1; i >= 0; i--) {
                        statements.body.unshift({
                            desc: "ASTNode", pushUnwindHandler: {
                                desc: 'ASTNode',
                                accessField: {
                                    obj: {
                                        desc: 'ASTNode',
                                        load: Object.keys(initDeclares[i])[0]
                                    },
                                    field: 'unwinded'
                                }
                            }
                        });//逆序压入读取unwinded的指令、def指令
                        statements.body.unshift({ desc: "ASTNode", def: initDeclares[i] });
                    }
                    return { desc: "ASTNode", autounwinding: { unwinded: initDeclares.length, stmt: statements } };
                }
            }
        },//自动回收，类似于c#的using
        {
            "declares:declare": {
                action: function ($, s): VariableDescriptor[] {
                    return [$[0] as VariableDescriptor];
                }
            }
        },//配合上面的autounwinding使用
        {
            "declares:declares ; declare": {
                action: function ($, s): VariableDescriptor[] {
                    let initDeclares = $[0] as VariableDescriptor[];
                    initDeclares.push($[2] as VariableDescriptor);
                    return initDeclares;
                }
            }
        },
        {
            "statement:if ( object ) statement": {
                priority: "low_priority_for_if_stmt",
                action: function ($, s): ASTNode {
                    let condition = $[2] as ASTNode;
                    let stmt = $[4] as Block | ASTNode;
                    if (stmt.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt = { desc: 'Block', body: [stmt] };
                    }
                    return { desc: "ASTNode", ifStmt: { condition: condition, stmt: stmt } };
                }
            }
        },//if语句
        /**
         * 本规则会导致如下二义性:
         * if(obj)      ---1
         *   if(obj)    ---2
         *      stmt
         *   else
         *      stmt
         * 可以得到如下两种abstract syntax tree
         * if(obj)
         * {
         *      if(obj)
         *      {
         *          stmt
         *      }
         * }
         * else
         * {
         *      stmt
         * }
         * 
         * if(obj)
         * {
         *      if(obj)
         *      {
         *          stmt
         *      }
         *      else
         *      {
         *          stmt
         *      }
         * }
         * 为了和大部分的现有编程语言兼容，采用第二种抽象语法树进行规约
         * 定义两个优先级规则low_priority_for_if_stmt和else,使else的优先级高于low_priority_for_if_stmt,在产生冲突时选择移入
         */
        {
            "statement:if ( object ) statement else statement": {
                action: function ($, s): ASTNode {
                    let condition = $[2] as ASTNode;
                    let stmt1 = $[4] as Block | ASTNode;
                    let stmt2 = $[6] as Block | ASTNode;
                    if (stmt1.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt1 = { desc: 'Block', body: [stmt1] };
                    }
                    if (stmt2.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt2 = { desc: 'Block', body: [stmt2] };
                    }
                    return { desc: "ASTNode", ifElseStmt: { condition: condition, stmt1: stmt1, stmt2: stmt2 } };
                }
            }
        },//if else语句
        {
            "statement:label_def do statement while ( object )": {
                action: function ($, s): ASTNode {
                    let label_def = $[0] as string | undefined;
                    let stmt = $[2] as Block | ASTNode;
                    let condition = $[5] as ASTNode;
                    if (stmt.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt = { desc: 'Block', body: [stmt] };
                    }
                    return { desc: "ASTNode", do_while: { condition: condition, stmt: stmt, label: label_def } };
                }
            }
        },//do-while语句，其实我是想删除while语句的，我觉得for_loop可以完全替代while,一句话,为了看起来没这么怪
        {
            "statement:label_def while ( object ) statement": {
                action: function ($, s): ASTNode {
                    let label_def = $[0] as string | undefined;
                    let condition = $[3] as ASTNode;
                    let stmt = $[5] as Block | ASTNode;
                    if (stmt.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt = { desc: 'Block', body: [stmt] };
                    }
                    return { desc: "ASTNode", _while: { condition: condition, stmt: stmt, label: label_def } };
                }
            }
        },//while语句
        {
            "statement:label_def for ( for_init ; for_condition ; for_step ) statement": {
                action: function ($, s): Block {
                    let label_def = $[0] as string | undefined;
                    let init = $[3] as ASTNode | undefined;
                    let condition = $[5] as ASTNode | undefined;
                    let step = $[7] as ASTNode | undefined;
                    let stmt = $[9] as Block | ASTNode;
                    return { desc: 'Block', body: [{ desc: "ASTNode", _for: { init: init, condition: condition, step: step, stmt: stmt, label: label_def } }] };
                }
            }
        },//for_loop
        {
            "statement:Block": {
                action: function ($, s): Block {
                    return $[0] as Block;
                }
            }
        },//代码块
        {
            "statement:break label_use ;": {
                action: function ($, s): ASTNode {
                    let label_use = $[1] as string | undefined;
                    return { desc: "ASTNode", _break: { label: label_use == undefined ? "" : label_use } };
                }
            }
        },//break语句
        {
            "statement:continue label_use ;": {
                action: function ($, s): ASTNode {
                    let label_use = $[1] as string | undefined;
                    return { desc: "ASTNode", _continue: { label: label_use == undefined ? "" : label_use } };
                }
            }
        },//continue语句
        {
            "statement:switch ( object ) { switch_bodys }": {
                action: function ($, s): ASTNode {
                    let pattern = $[2] as ASTNode;
                    let switch_bodys = $[5] as { matchObj: ASTNode | null, stmt: Block, isDefault: boolean }[];
                    let defalutStmt: Block | undefined;
                    let matchList: { matchObj: ASTNode, stmt: Block }[] = [];
                    let defaultCount = 0;
                    for (let i = 0; i < switch_bodys.length; i++) {
                        if (switch_bodys[i].isDefault) {
                            defaultCount++;
                            if (defaultCount > 1) {
                                throw new Error(`switch body只允许一个default`);
                            } else {
                                defalutStmt = switch_bodys[i].stmt;//此处会更改数组长度，正常结束循环
                            }
                        } else {
                            matchList.push({ matchObj: switch_bodys[i].matchObj!, stmt: switch_bodys[i].stmt });
                        }
                    }
                    return { desc: "ASTNode", _switch: { pattern: pattern, defalutStmt: defalutStmt, matchList: matchList } };
                }
            }
        },//switch语句,因为switch在C/C++等语言中可以用跳转表处理,gcc在处理switch语句时,如果各个case的值连续,也会生成一个jum_table,这里我就稍微扩展一下switch的用法
        {
            "statement:call ;": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//函数调用可以作为一个语句
        {
            "statement:assignment ;": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//赋值可以作为一个语句
        {
            "statement:increment ;": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//自增可以作为一个语句
        {
            "statement:decrement ;": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//自减可以作为一个语句
        {
            "statement:_new ;": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//new可以作为一个语句
        { "label_def:": {} },//label_def可以为空
        {
            "label_def:id :": {
                action: function ($, s): string {
                    return $[0] as string;
                }
            }
        },//label_def为 id : 组成
        { "for_init:": {} },//for_loop的init可以为空
        {
            "for_init:declare": {
                action: function ($, s): ASTNode {
                    let declare: VariableDescriptor = $[0];
                    return { desc: "ASTNode", def: declare };
                }
            }
        },//init可以是一个声明
        {
            "for_init:assignment": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//也可以是一个赋值语句
        { "for_condition:": {} },//condition可以为空
        {
            "for_condition:object": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//condition可以是一个对象(必须是bool对象)
        { "for_step:": {} },//step可以为空
        {
            "for_step:object": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//step可以是一个对象
        {
            "Block:{ statements }": {
                action: function ($, s): Block {
                    return $[1] as Block;
                }
            }
        },//代码块是一对花括号中间包裹着statements
        { "label_use:": {} },//在break和continue中被使用
        {
            "label_use:id": {
                action: function ($, s): string {
                    return $[0] as string;
                }
            }
        },//在break和continue中被使用
        {
            "switch_bodys:": {
                action: function ($, s): { matchObj: ASTNode | null, stmt: ASTNode | Block, isDefault: boolean }[] {
                    return [];
                }
            }
        },//switch_bodys可为空
        {
            "switch_bodys:switch_bodys switch_body": {
                action: function ($, s): { matchObj: ASTNode | null, stmt: Block, isDefault: boolean }[] {
                    let switch_bodys = $[0] as { matchObj: ASTNode | null, stmt: Block, isDefault: boolean }[];
                    let switch_body = $[1] as { matchObj: ASTNode | null, stmt: Block, isDefault: boolean };
                    switch_bodys.push(switch_body);
                    return switch_bodys;
                }
            }
        },//switch_bodys可以由多个switch_body组成
        {
            "switch_body:case object : statement": {
                action: function ($, s): { matchObj: ASTNode | null, stmt: Block, isDefault: boolean } {
                    let stmt = $[3] as ASTNode | Block;
                    if (stmt.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt = { desc: 'Block', body: [stmt] };
                    }
                    return {
                        matchObj: $[1] as ASTNode, stmt: stmt, isDefault: false
                    };
                }
            }
        },//case 语句
        {
            "switch_body:default : statement": {
                action: function ($, s): { matchObj: ASTNode | null, stmt: Block, isDefault: boolean } {
                    let stmt = $[2] as ASTNode | Block;
                    if (stmt.desc == 'ASTNode') {//如果stmt是单条语句，为其创建一个block
                        stmt = { desc: 'Block', body: [stmt] };
                    }
                    return { matchObj: null, stmt: stmt, isDefault: true };
                }
            }
        },//default语句
        {
            "object:call": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//函数调用
        {
            "object:_new": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//new对象或者数组
        {
            "object:( object )": {
                action: function ($, s): ASTNode {
                    return $[1] as ASTNode;
                }
            }
        },//括号括住的object还是一个object
        {
            "object:object . id": {
                action: function ($, s): ASTNode {
                    let obj = $[0] as ASTNode;
                    let id = $[2] as string;
                    return { desc: "ASTNode", accessField: { obj: obj, field: id } };//代码解析阶段还不知道是不是property
                }
            }
        },//取成员
        /**
         * function add<T>(a:T,b:T){return a+b;}
         * var f=a<int>;
         */
        {
            "object:object templateSpecialization": {
                action: function ($, s): ASTNode {
                    let obj = $[0] as ASTNode;
                    let types = $[1] as TypeUsed[];
                    return { desc: "ASTNode", specializationObj: { obj, types } };
                }
            }
        },//模板对象实例化
        /**
        * obj_1 + obj_2  ( obj_3 )  ,中间的+可以换成 - * / < > || 等等双目运算符
        * 会出现如下二义性:
        * 1、 (obj_1 + obj_2)  ( object_3 ) ,先将obj_1和obj_2进行双目运算，然后再使用双目运算符的结果作为函数对象进行函数调用
        * 2、 obj_1 + ( obj_2  ( object_3 ) ) ,先将obj_2作为一个函数对象调用，然后再将obj_1 和函数调用的结果进行双目运算
        * 因为我们希望采取二义性的第二种解释进行语法分析,所以设置了'('优先级高于双目运算符,这些双目运算符是所在产生式的最后一个终结符，直接修改了对应产生式的优先级和结核性
        * 同样的,对于输入"(int)obj_1(obj_2)"有如下二义性:
        * 1. ((int)obj_1) (obj_2)
        * 2. (int) (obj_1(obj_2))
        * 也采用方案2，令函数调用优先级高于强制转型
        */
        {
            "call:object  ( arguments )": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", call: { functionObj: $[0] as ASTNode, _arguments: $[2] as ASTNode[] } };
                }
            }
        },//函数调用
        /**
         * 一系列的双目运算符,二义性如下:
         * a+b*c
         * 1. (a+b)*c
         * 2. a+(b*c)
         * 已经把各个操作符的优先级和结合性定义的和C/C++一致，见association中定义的各个符号优先级和结合性,双目运算符都是左结合,且+ - 优先级低于 * /
         */
        {
            "assignment:object = object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "=": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },//赋值运算
        {
            "increment:object ++": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", '++': $[0] as ASTNode };
                }
            }
        },//单目运算符++
        {
            "decrement:object --": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", '--': $[0] as ASTNode };
                }
            }
        },//单目运算符--
        {
            "object:increment": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//自增可以作为一个obj
        {
            "object:decrement": {
                action: function ($, s): ASTNode {
                    return $[0] as ASTNode;
                }
            }
        },//自减作为一个obj
        {
            "object:object + object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "+": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object - object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "-": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object * object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "*": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object / object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "/": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object < object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "<": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object <= object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "<=": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object > object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ">": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object >= object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ">=": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object == object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "==": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object % object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "%": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object || object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "||": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object && object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "&&": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object | object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "|": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object & object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "&": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object >> object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ">>": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object << object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "<<": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:object ^ object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "^": { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },
        {
            "object:~ object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "~": $[1] as ASTNode };
                }
            }
        },
        {
            "object:- object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "negative": $[1] as ASTNode };
                }
            }
        },
        {
            "object:+ object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", "positive": $[1] as ASTNode };
                }
            }
        },
        /**
         * instanceof会导致如下冲突:
         * 情况1: ! a instanceof int
         * 1.1 !(a instanceof int)
         * 1.2 (!a) instanceof int
         * 情况2: a+b instanceof int
         * 2.1 a+(b instanceof int)
         * 2.2 (a+b) instanceof int
         * 上述两种情况instanceof的优先级应该低于所有的其他运算符,对于上述情况都选择第二种AST进行规约,所以定义了instanceof的优先级低于所有的其他运算符(除了赋值符号)
         * 情况3: a instanceof set<int>
         * 3.1  (a instanceof set)<int>  这种对应了文法规则 object:object templateSpecialization,因为文法可以把a instanceof set解析成一个object
         * 3.2  a instanceof (set<int>)  这种语法树是我们想要的
         * 对于项 a instanceof set .< int >的移入规约冲突应该采用移入
         * 即对于项集中的两个项 type->plainType .,< 和 templateSpecialization->.< templateSpecialization_list >
         * 令产生式type->plainType的优先级小于符号<即可解决(优先级符号:priority_for_plainType)
         */
        {
            "object:object instanceof type": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", _instanceof: { obj: $[0] as ASTNode, type: $[2] as TypeUsed } };
                }
            }
        },
        /**双目运算符结束 */
        /**单目运算符 */
        {
            "object:! object": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", not: $[1] as ASTNode };
                }
            }
        },//单目运算符-非
        /**单目运算符结束 */
        {
            "object:object [ object ]": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", '[]': { leftChild: $[0] as ASTNode, rightChild: $[2] as ASTNode } };
                }
            }
        },//[]运算符
        /**
         * 三目运算符会导致如下文法二义性
         * 情况1:a+b?c:d
         * 1.1 a+(b?c:d)
         * 1.2 (a+b)?c:d
         * 情况2:a?b:c?d:e
         * 2.1 (a?b:c)?d:e
         * 2.2 a?b:(c?d:e)
         * 根据tscc的解析规则，产生object:object ? object : object 的优先级为未定义，因为优先级取决于产生式的最后一个终结符或者强制指定的符号,该产生式的最后一个终结符':'并没有定义优先级
         * 为了解决上述两种冲突,我们将产生式的优先级符号强制指定为?,并且令?的优先级低于双目运算符,结合性为right,则针对上述两种冲突最终解决方案如下:
         * 1.因为?的优先级低于所有双目运算符所对应的产生式,所以情况1会选择1.2这种语法树进行解析
         * 2.因为?为右结合,所以情况2会选择2.2这种语法树进行解析
         */
        {
            "object:object ? object : object": {
                priority: "?",
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", ternary: { condition: $[0] as ASTNode, obj1: $[2] as ASTNode, obj2: $[4] as ASTNode } };
                }
            }
        },//三目运算
        {
            "object:id": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", load: $[0] as string };
                }
            }
        },//id是一个对象
        {
            "object:immediate_val": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", immediate: { primiviteValue: $[0] } };
                }
            }
        },//立即数是一个object
        {
            "object:immediate_string": {
                action: function ($, s): ASTNode {
                    let str = $[0] as string;
                    let ASTNodes: ASTNode[] = [];
                    for (let i = 0; i < str.length; i++) {
                        let ch = str[i];
                        if (ch == '\\') {
                            if (i == str.length - 1) {
                                throw `字符串末尾的转义符无法处理`;
                            } else {
                                i++;
                                ch = str[i];
                                switch (ch) {
                                    case 'a': ch = '\a'; break;
                                    case 'b': ch = '\b'; break;
                                    case 'f': ch = '\f'; break;
                                    case 'n': ch = '\n'; break;
                                    case 'r': ch = '\r'; break;
                                    case 't': ch = '\t'; break;
                                    case 'v': ch = '\v'; break;
                                    case '\\': ch = '\\'; break;
                                    default: break;
                                }
                            }
                        }
                        ASTNodes.push({ desc: "ASTNode", immediate: { primiviteValue: ch.charCodeAt(0) + 'b' } });//变成单个byte类型
                    }
                    let newString: ASTNode = {
                        desc: 'ASTNode',
                        _new: {
                            type: { PlainType: { name: 'system.string' } },
                            _arguments: [{ desc: "ASTNode", immediateArray: ASTNodes }]
                        }
                    };
                    return newString;
                }
            }
        },//立即数是一个string
        {
            "object:immediate_array": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", immediateArray: $[0] as ASTNode[] };
                }
            }
        },//立即数是一个immediate_array
        {
            "object:super": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", _super: "" };
                }
            }
        },//super是一个对象
        {
            "object:this": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", _this: "" };
                }
            }
        },//this是一个object
        {
            "object:template_definition ( parameter_declare ) => { statements }": {
                action: function ($, s): ASTNode {
                    /**
                     * 设计文法的时候考虑到这种情况
                     * var add=<T>(a:T,b:T)=>{return a+b};
                     * var f=add;
                     * f<int>(1,2);
                     * 但是实现的时候发现，这样做需要在运行时实现模板特化，太复杂了，暂时放弃
                     */
                    throw `不允许使用泛型lambda`;

                    // let template_definition = $[0] as string[];
                    // for (let t of template_definition) {
                    //     userTypeDictionary.delete(t);
                    // }
                    // return { desc: "ASTNode", immediate: { functionValue: {namsespace: namespaceforParser, capture: {}, _arguments: $[2] as VariableDescriptor, body: $[6] as Block, templates: $[0] as string[] } } };
                }
            }
        },//模板lambda
        {
            "object:( parameter_declare ) => { statements }": {
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", immediate: { functionValue: { namsespace: namespaceforParser, capture: {}, _arguments: $[1] as VariableDescriptor, body: $[5] as Block } } };
                }
            }
        },//lambda
        /**
         * 强制转型会出现如下二义性:
         * 情况1 (int)a+b;
         * 1.1 ((int)a)+b;
         * 1.2 (int)(a+b)
         * 情况2 (int)fun(b);
         * 2.1 ((int)fun)(b)
         * 2.2 (int)(fun(b))
         * 情况3 (int)arr[0]
         * 3.1 ((int)arr) [0]
         * 3.2 (int)(arr[0])
         * 参照java优先级,强制转型优先级高于+ - / * ++ 这些运算符，低于() [] .这三个运算符
         * 为其指定优先级为cast_priority
         */
        {
            "object:( type ) object": {
                priority: "cast_priority",
                action: function ($, s): ASTNode {
                    return { desc: "ASTNode", cast: { obj: $[3] as ASTNode, type: $[1] as TypeUsed } };
                }
            }
        },//强制转型
        {
            "immediate_array:{ [ immediate_array_elements ] }": {
                action: function ($, s): ASTNode[] {
                    return $[2] as ASTNode[];
                }
            }
        },//立即数组
        {
            "immediate_array_elements:immediate_array_element_list": {
                action: function ($, s): ASTNode[] {
                    return $[0] as ASTNode[];
                }
            }
        },//立即数组内容可以由多个immediate_array_element组成
        {
            "immediate_array_elements:": {
                action: function ($, s): ASTNode[] {
                    return [];
                }
            }
        },//立即数组内容可以为空
        {
            "immediate_array_element_list:immediate_array_element_list , object": {
                action: function ($, s): ASTNode[] {
                    let immediate_array_element_list = $[0] as ASTNode[];
                    immediate_array_element_list.push($[2] as ASTNode);
                    return immediate_array_element_list;
                }
            }
        },//列表
        {
            "immediate_array_element_list:object": {
                action: function ($, s): ASTNode[] {
                    return [$[0] as ASTNode];
                }
            }
        },//数组元素
        {
            "_new:new type  ( arguments )": {
                action: function ($, s): ASTNode {
                    let type = $[1] as TypeUsed;
                    if (type.PlainType == undefined) {
                        throw `只能new一个plainObj对象`;
                    }
                    return { desc: "ASTNode", _new: { type: $[1] as { PlainType: PlainType }, _arguments: $[3] as ASTNode[] } };
                }
            }
        },//创建对象
        /**
         * 针对产生式array_init_list:array_inits array_placeholder 会出现如下二义性
         * new int [10][3]可以有如下两种解释:(把array_placeholder规约成ε)
         * 1. (new int[10])[3],先new 一个一维数组,然后取下标为3的元素
         * 2. (new int[10][3]),new 一个二维数组
         * 我当然希望采取第二种语法树,所以需要设置产生式优先级,即在new一个对象的时候,如果后面跟有方括号[,优先选择移入而不是规约,那么只需要把冲突的产生式优先级设置为比'['低即可
         * 设置array_placeholder作为产生式头的两个产生式优先级低于'['
         */
        {
            "_new:new type array_init_list": {
                action: function ($, s): ASTNode {
                    let type = $[1] as TypeUsed;
                    if (type.ArrayType != undefined) {
                        throw `不允许new一个数组的数组,数组的创建语法如下: new int[3][2],不能写成new (int[3])[2]`;
                    }
                    let init_list = $[2] as { initList: ASTNode[], placeholder: number };
                    return { desc: "ASTNode", _newArray: { type: $[1] as { PlainType: PlainType } | { FunctionType: FunctionType }, initList: init_list.initList, placeholder: init_list.placeholder } };
                }
            }
        },//创建数组
        {
            "array_init_list:array_inits array_placeholder": {
                action: function ($, s): { initList: ASTNode[], placeholder: number } {
                    return { initList: $[0] as ASTNode[], placeholder: $[1] as number };
                }
            }
        },//new 数组的时候是可以这样写的 new int [2][3][][],其中[2][3]对应了array_inits,后面的[][]对应了array_placeholder(数组占位符)
        {
            "array_inits:array_inits [ object ]": {
                action: function ($, s): ASTNode[] {
                    let array_inits = $[0] as ASTNode[];
                    array_inits.push($[2] as ASTNode);
                    return array_inits;
                }
            }
        },//见array_init_list一条的解释
        {
            "array_inits:[ object ]": {
                action: function ($, s): ASTNode[] {
                    return [$[1] as ASTNode];
                }
            }
        },//见array_init_list一条的解释
        {
            "array_placeholder:array_placeholder_list": {
                priority: "low_priority_for_array_placeholder",
                action: function ($, s): number {
                    return $[0] as number;
                }
            }
        },//见array_init_list一条的解释
        {
            "array_placeholder:": {
                priority: "low_priority_for_array_placeholder",
                action: function ($, s): number {
                    return 0;
                }
            }
        },//array_placeholder可以为空
        {
            "array_placeholder_list:array_placeholder_list [ ]": {
                action: function ($, s) {
                    return ($[0] as number) + 1;
                }
            }
        },//见array_init_list一条的解释
        {
            "array_placeholder_list:[ ]": {
                action: function ($, s): number {
                    return 1;
                }
            }
        },//见array_init_list一条的解释
        {
            "templateSpecialization:< templateSpecialization_list >": {
                action: function ($, s): TypeUsed[] {
                    return $[1] as TypeUsed[];
                }
            }
        },//模板实例化可以实例化为一个<templateSpecialization_list>
        {
            "templateSpecialization_list:type": {
                action: function ($, s): TypeUsed[] {
                    return [$[0] as TypeUsed];
                }
            }
        },//templateSpecialization_list可以为一个type
        {
            "templateSpecialization_list:templateSpecialization_list , type": {
                action: function ($, s): TypeUsed[] {
                    let templateSpecialization_list = $[0] as TypeUsed[];
                    let type = $[2] as TypeUsed;
                    templateSpecialization_list.push(type);
                    return templateSpecialization_list;
                }
            }
        },//templateSpecialization_list可以为多个type
        {
            "arguments:": {
                action: function ($, s): ASTNode[] {
                    return [];
                }
            }
        },//实参可以为空
        {
            "arguments:argument_list": {
                action: function ($, s): ASTNode[] {
                    return $[0] as ASTNode[];
                }
            }
        },//实参可以是argument_list
        {
            "argument_list:object": {
                action: function ($, s): ASTNode[] {
                    return [$[0] as ASTNode];
                }
            }
        },//参数列表可以是一个object
        {
            "argument_list:argument_list , object": {
                action: function ($, s): ASTNode[] {
                    let argument_list = $[0] as ASTNode[];
                    let obj = $[2] as ASTNode;
                    argument_list.push(obj);
                    return argument_list;
                }
            }
        },//参数列表可以是多个object
    ]
}
let tscc = new TSCC(grammar, { language: "zh-cn", debug: false });
let str = tscc.generate();//构造编译器代码
if (str != null) {//如果构造成功则生成编编译器代码
    fs.writeFileSync('./src/compiler/parser.ts', str);
    console.log(`成功`);
} else {
    console.log(`失败`);
}