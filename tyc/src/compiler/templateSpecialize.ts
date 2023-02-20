import { FunctionSign, TypeUsedSign } from "./lib.js";
import { ClassScope, ProgramScope } from "./scope.js";

/**
 * 模板替换的时候只需要考虑源码可能出现的情况，所以只有源码中可能出现类型的时候才扫描并替换，替换完成之后才进入类型推导
 */

function typeTypeUsedReplace(srcType: TypeUsed, map: { [key: string]: TypeUsed }) {
    //是一个需要替换的PlainType
    if (srcType.PlainType != undefined) {
        if (map[srcType.PlainType.name] != undefined) {
            let srcTypeName = srcType.PlainType.name;
            delete srcType.PlainType;
            //map[srcTypeName]不可能为空
            if (map[srcTypeName].PlainType != undefined) {
                srcType.PlainType = map[srcTypeName].PlainType;
            } else if (map[srcTypeName].ArrayType != undefined) {
                srcType.ArrayType = map[srcTypeName].ArrayType;
            } else {
                srcType.FunctionType = map[srcTypeName].FunctionType;
            }
        }
    } else if (srcType.ArrayType != undefined) {
        typeTypeUsedReplace(srcType.ArrayType.innerType, map);
    } else {
        FunctionSpecialize(srcType.FunctionType!, map);
    }
}
/**
 * 所有包含ASTNode和Type的节点都需要扫描，因为被包含的AST可能是一个specializationObj节点
 * 比如:
 * function add<T>(a:T,b:T){return a+b;};
 * main(){
 *  var a=add<int>(1,2);
 *  var a=add<int>(add<int>(1,2),3);
 * }
 * 如果没有specializationObj节点，源码中可能出现T的位置就只有new,def,catch这几个节点，都不需要递归处理了
 */
function AstTypeReplace(node: ASTNode, map: { [key: string]: TypeUsed }) {
    if (node['loadException'] != undefined) {
        typeTypeUsedReplace(node['loadException'], map);
    } else if (node['specializationObj'] != undefined) {
        AstTypeReplace(node['specializationObj'].obj, map);
        for (let t of node['specializationObj'].types) {
            typeTypeUsedReplace(t, map);
        }
    } else if (node['def'] != undefined) {
        let name = Object.keys(node['def'])[0];
        let prop = node['def'][name];
        if (prop.type != undefined) {
            typeTypeUsedReplace(prop.type, map);
        }
        if (prop.initAST != undefined) {
            AstTypeReplace(prop.initAST, map);
        } else if (prop.type?.FunctionType?.body) {//如果是函数定义才扫描，否则不处理了，在prop.type处已经被扫描过了
            FunctionSpecialize(prop.type.FunctionType, map);
        }
    } else if (node['accessField'] != undefined) {
        AstTypeReplace(node['accessField'].obj, map);
    }
    else if (node['call'] != undefined) {
        AstTypeReplace(node['call'].functionObj, map);
        for (let arg of node['call']._arguments) {
            AstTypeReplace(arg, map);
        }
    }
    else if (node['immediate'] != undefined) {
        if (node['immediate'].functionValue != undefined) {
            FunctionSpecialize(node['immediate'].functionValue, map);
        }
    }
    else if (node['trycatch'] != undefined) {
        blockTypeReplace(node['trycatch'].tryBlock, map);
        for (let catchItem of node['trycatch'].catch_list) {
            typeTypeUsedReplace(catchItem.catchType, map);
            blockTypeReplace(catchItem.catchBlock, map);
        }
    }
    else if (node['throwStmt'] != undefined) {
        AstTypeReplace(node['throwStmt'], map);
    }
    else if (node['ret'] != undefined) {
        if (node['ret'] != '') {
            AstTypeReplace(node['ret'], map);
        }
    }
    else if (node['ifStmt'] != undefined) {
        AstTypeReplace(node['ifStmt'].condition, map);
        blockTypeReplace(node['ifStmt'].stmt, map);
    }
    else if (node['ifElseStmt'] != undefined) {
        AstTypeReplace(node['ifElseStmt'].condition, map);
        blockTypeReplace(node['ifElseStmt'].stmt1, map);
        blockTypeReplace(node['ifElseStmt'].stmt2, map);
    }
    else if (node['do_while'] != undefined) {
        AstTypeReplace(node['do_while'].condition, map);
        blockTypeReplace(node['do_while'].stmt, map);
    }
    else if (node['_while'] != undefined) {
        AstTypeReplace(node['_while'].condition, map);
        blockTypeReplace(node['_while'].stmt, map);
    }
    else if (node['_for'] != undefined) {
        if (node['_for'].init != undefined) {
            AstTypeReplace(node['_for'].init, map);
        }
        if (node['_for'].condition != undefined) {
            AstTypeReplace(node['_for'].condition, map);
        }
        if (node['_for'].step != undefined) {
            AstTypeReplace(node['_for'].step, map);
        }
        if (node['_for'].stmt.desc == 'ASTNode') {
            AstTypeReplace(node['_for'].stmt as ASTNode, map);
        } else {
            blockTypeReplace(node['_for'].stmt, map);
        }
    }
    else if (node['_instanceof'] != undefined) {
        AstTypeReplace(node['_instanceof'].obj, map);
        typeTypeUsedReplace(node['_instanceof'].type, map);
    }
    else if (node['not'] != undefined) {
        AstTypeReplace(node['not'], map);
    }
    else if (node['++'] != undefined) {
        AstTypeReplace(node['++'], map);
    }
    else if (node['--'] != undefined) {
        AstTypeReplace(node['--'], map);
    }
    else if (node['ternary'] != undefined) {
        AstTypeReplace(node['ternary'].condition, map);
        AstTypeReplace(node['ternary'].obj1, map);
        AstTypeReplace(node['ternary'].obj2, map);
    }
    else if (node['cast'] != undefined) {
        AstTypeReplace(node['cast'].obj, map);
        typeTypeUsedReplace(node['cast'].type, map);
    }
    else if (node['box'] != undefined) {
        //在源码中不会出现,是经过类型推导之后生成的节点
        throw `unimplemented`;
    }
    else if (node['unbox'] != undefined) {
        //在源码中不会出现,是经过类型推导之后生成的节点
        throw `unimplemented`;
    }
    else if (node['_new'] != undefined) {
        typeTypeUsedReplace(node['_new'].type, map);
        for (let arg of node['_new']._arguments) {
            AstTypeReplace(arg, map);
        }
    }
    else if (node['_newArray'] != undefined) {
        typeTypeUsedReplace(node['_newArray'].type, map);
        for (let n of node['_newArray'].initList) {
            AstTypeReplace(n, map);
        }
    }
    else if (node['[]'] != undefined) {
        AstTypeReplace(node['[]'].leftChild, map);
        AstTypeReplace(node['[]'].rightChild, map);
    }
    else if (node['='] != undefined) {
        AstTypeReplace(node['='].leftChild, map);
        AstTypeReplace(node['='].rightChild, map);
    }
    else if (node['+'] != undefined) {
        AstTypeReplace(node['+'].leftChild, map);
        AstTypeReplace(node['+'].rightChild, map);
    }
    else if (node['-'] != undefined) {
        AstTypeReplace(node['-'].leftChild, map);
        AstTypeReplace(node['-'].rightChild, map);
    }
    else if (node['*'] != undefined) {
        AstTypeReplace(node['*'].leftChild, map);
        AstTypeReplace(node['*'].rightChild, map);
    }
    else if (node['/'] != undefined) {
        AstTypeReplace(node['/'].leftChild, map);
        AstTypeReplace(node['/'].rightChild, map);
    }
    else if (node['<'] != undefined) {
        AstTypeReplace(node['<'].leftChild, map);
        AstTypeReplace(node['<'].rightChild, map);
    }
    else if (node['<='] != undefined) {
        AstTypeReplace(node['<='].leftChild, map);
        AstTypeReplace(node['<='].rightChild, map);
    }
    else if (node['>'] != undefined) {
        AstTypeReplace(node['>'].leftChild, map);
        AstTypeReplace(node['>'].rightChild, map);
    }
    else if (node['>='] != undefined) {
        AstTypeReplace(node['>='].leftChild, map);
        AstTypeReplace(node['>='].rightChild, map);
    }
    else if (node['=='] != undefined) {
        AstTypeReplace(node['=='].leftChild, map);
        AstTypeReplace(node['=='].rightChild, map);
    }
    else if (node['||'] != undefined) {
        AstTypeReplace(node['||'].leftChild, map);
        AstTypeReplace(node['||'].rightChild, map);
    }
    else if (node['&&'] != undefined) {
        AstTypeReplace(node['&&'].leftChild, map);
        AstTypeReplace(node['&&'].rightChild, map);
    }
    else if (node['_switch'] != undefined) {
        AstTypeReplace(node['_switch'].pattern, map);
        if (node['_switch'].defalutStmt) {
            blockTypeReplace(node['_switch'].defalutStmt, map);
        }
        for (let matchItem of node['_switch'].matchList) {
            AstTypeReplace(matchItem.matchObj!, map);//源码阶段一定有matchObj
            blockTypeReplace(matchItem.stmt, map);
        }
    }
}
function blockTypeReplace(block: Block, map: { [key: string]: TypeUsed }) {
    for (let bodyItem of block.body) {
        if (bodyItem.desc == 'ASTNode') {
            AstTypeReplace(bodyItem as ASTNode, map);
        } else {
            blockTypeReplace(bodyItem, map);
        }
    }
}
export function FunctionSpecialize(func: FunctionType, map: { [key: string]: TypeUsed }) {
    //替换掉函数的所有参数类型声明
    for (let k in func._arguments) {
        if (!func._arguments[k].type) {
            throw `functionType没有类型声明，目前语法不允许这样写`;
        }
        typeTypeUsedReplace(func._arguments[k].type!, map);
    }
    if (func.retType) {
        typeTypeUsedReplace(func.retType, map);
    }
    if (func.body) {
        blockTypeReplace(func.body, map);
    }
}
/**
 * 特化模板类
 * @param typedef 
 * @param map 
 */
export function ClassSpecialize(typedef: TypeDef, map: { [key: string]: TypeUsed }) {
    for (let propName in typedef.property) {//扫描所有成员
        let prop = typedef.property[propName];
        if (prop.type != undefined) {
            typeTypeUsedReplace(prop.type, map);
        }

        if (prop.initAST != undefined) {
            AstTypeReplace(prop.initAST, map);
        } else if (prop.type?.FunctionType?.body) {//如果是函数定义才扫描，否则不处理了，在prop.type处已经被扫描过了
            FunctionSpecialize(prop.type.FunctionType, map);
        }
        if (prop.type?.PlainType?.name == 'void') {
            throw `void无法计算大小,任何成员都不能是void类型`;
        }
    }
    //扫描构造函数
    for (let constructorName in typedef._constructor) {
        let _constructor = typedef._constructor[constructorName];
        FunctionSpecialize(_constructor, map);
        let newSign = FunctionSign(_constructor);
        typedef._constructor[newSign] = typedef._constructor[constructorName];
        if (constructorName != newSign) {//当构造函数的参数没有使用模板类型，签名会保持一致
            delete typedef._constructor[constructorName];//移除之前的构造函数，改用新构造函数
        }
    }
}