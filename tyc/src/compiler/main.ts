#!/usr/bin/env node
import Parser, { YYTOKEN, setParserNameSpace } from "./parser.js";
import lexer from './lexrule.js';
import fs from 'fs';
import semanticCheck from './semanticCheck.js'
import codeGen from './codeGen.js'
import { setProgram } from "./ir.js";
import { Program } from "./program.js";
import { userTypeDictionary } from "./lexrule.js";
import path, { dirname } from "path";
import { fileURLToPath } from 'node:url';
/**
 * 1.把nameSpace.xxx先注册成id
 * 2.识别出所有class id中的id(剔除字符串、注释)
 * 3.然后注册userTypeDictionary
 * 4.把源码中所有userType替换成 nameSpace.userType(剔除字符串、注释)
 */
function main(inputFiles: string[]) {
    try {
        let sources: { namespace: string, source: string }[] = [];
        let className: string[] = [];//所有用户自定义的类型
        let fileNamesSet = new Set<string>();
        for (let input of inputFiles) {
            let filePathArray = input.split(/\\|\//);
            if (!/[a-z0-9]+\.ty/.test(filePathArray[filePathArray.length - 1])) {
                throw `文件${input}不满足要求xxx/[a-z0-9]+\.ty的命名规则`
            }
            if (!fileNamesSet.has(path.basename(input, '.ty'))) {
                fileNamesSet.add(path.basename(input, '.ty'));
            } else {
                throw `文件名${path.basename(input, '.ty')}重复`
            }
            sources.push({ namespace: path.basename(input, '.ty'), source: fs.readFileSync(input, 'utf-8').toString() });
        }
        //添加id解析规则,假设有个命名空间叫做system，则把system.int 解析成id，下一个循环会添加规则把system.int解析成base_type，后添加的优先级较高，所以不影响结果
        for (let sourceItem of sources) {
            lexer.addRule([`${sourceItem.namespace.replaceAll(/\./g, '\\.')}\\.[_a-zA-Z][_a-zA-Z0-9]*`,
            (arg) => {
                if (userTypeDictionary.has(arg.yytext)) {
                    (arg.value as TypeUsed) = { PlainType: { name: arg.yytext } };
                    return "basic_type";
                } else {
                    arg.value = arg.yytext;
                    return 'id';
                }
            }]);
        }
        //源码替换阶段
        for (let sourceItem of sources) {
            // let reg = /class[\s\r\n]+([a-zA-Z_][a-zA-Z_0-9]*)/g;
            //收集所有的class name
            lexer.setSource(sourceItem.source);
            let lastToken: YYTOKEN | undefined;
            let classNamesInThisFile: string[] = [];//当前文件中定义的class
            for (; ;) {
                let nowToken = lexer.yylex();
                if (nowToken.type == '$') {
                    break;
                }
                if (lastToken?.type == 'class' && nowToken.type == 'id') {
                    classNamesInThisFile.push(nowToken.value);
                }
                lastToken = nowToken;
            }
            for (let classNamesInThisFileItem of classNamesInThisFile) {
                if (sourceItem.namespace != 'system' && ['void', 'byte', 'short', 'int', 'long', 'double', 'bool', 'string', 'object'].indexOf(classNamesInThisFileItem) != -1) {
                    /**
                     * 如果是用户自定义命名空间(自己的代码)，且使用了内置类型名字做自己的类型名做类型名，则报错
                     * 如用户定义了 class int{}
                     */
                    throw `不允许自定义类型的名字为${classNamesInThisFileItem}`;
                }
                className.push(`${sourceItem.namespace}.${classNamesInThisFileItem}`);
                userTypeDictionary.set(`${sourceItem.namespace}.${classNamesInThisFileItem}`, `${sourceItem.namespace}.${classNamesInThisFileItem}`);//给词法分析添加class名字
            }
            if (classNamesInThisFile.length > 0) {
                //在本文件内部替换
                let classRepalceReg = new RegExp(`(?<![a-zA-Z_\.])(${classNamesInThisFile.map(v => `(${v})`).reduce((p, c) => `${p}|${c}`)})(?![a-zA-Z_0-9])`, 'g');//替换类型,如果有一个类型是myClass，则所有的myClass都替换成namespace.myClass
                sourceItem.source = sourceItem.source.replace(classRepalceReg, `${sourceItem.namespace}.$1`);
            }
            sourceItem.source = sourceItem.source.replace(/toString/g, '_toString');//把所有的toString统统换成_toString，避免js自带原型链已经有这些内容
        }

        //给词法分析添加class名字
        userTypeDictionary.set('void', 'void');
        userTypeDictionary.set('byte', 'system.byte');
        userTypeDictionary.set('short', 'system.short');
        userTypeDictionary.set('int', 'system.int');
        userTypeDictionary.set('long', 'system.long');
        userTypeDictionary.set('double', 'system.double');
        userTypeDictionary.set('bool', 'system.bool');
        userTypeDictionary.set('string', 'system.string');
        userTypeDictionary.set('object', 'system.object');

        lexer.compile();

        console.time("解析源码耗时");
        let program: Program = new Program();
        //开始解析
        for (let sourceItem of sources) {
            lexer.setSource(sourceItem.source);
            setParserNameSpace(sourceItem.namespace);
            let programPartial = Parser(lexer) as Program;
            /**
             * 把解析到的内容合并到program中
             */
            //合并class定义
            for (let classInThisFile of programPartial.getDefinedTypeNames()) {
                program.setDefinedType(classInThisFile, programPartial.getDefinedType(classInThisFile));
            }
            //合并prop
            for (let propName in programPartial.propertySpace[sourceItem.namespace]) {
                program.setProp(propName, sourceItem.namespace, programPartial.propertySpace[sourceItem.namespace][propName]);
            }
            //合并扩展方法
            for (let typeName in programPartial.extensionMethodsDef) {
                if (program.extensionMethodsDef[typeName] == undefined) {
                    program.extensionMethodsDef[typeName] = {};
                }
                for (let funName in programPartial.extensionMethodsDef[typeName]) {
                    if (program.extensionMethodsDef[typeName][funName] != undefined) {
                        throw `重复定义扩展方法${typeName}.${funName}`;
                    }
                    program.extensionMethodsDef[typeName][funName] = programPartial.extensionMethodsDef[typeName][funName];
                }
            }
        }

        setProgram(program);
        console.timeEnd("解析源码耗时");
        if (!fs.existsSync('output')) {//如果没有output目录，则创建
            fs.mkdirSync('output');//创建目录
        }
        fs.writeFileSync(`output/stage-1.json`, JSON.stringify(program, null, 4));
        console.time(`类型推导耗时`);
        semanticCheck();
        console.timeEnd(`类型推导耗时`);
        fs.writeFileSync(`output/stage-2.json`, JSON.stringify(program, null, 4));
        console.time(`IR生成耗时`);
        codeGen();
        console.timeEnd(`IR生成耗时`);
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error(e.stack);
        }
        console.error(`${e}`);
    }
}
//先把内置ty文件添加到待编译文件列表中
let libPath = path.join(dirname(fileURLToPath(import.meta.url)), 'lib');
let libFiles = fs.readdirSync(libPath);
let builtinSource: string[] = [];
for (let file of libFiles) {
    let fileInfo = fs.statSync(path.join(libPath, file));
    if (fileInfo.isFile()) {
        builtinSource.push(path.join(libPath, file))
    }
}
main([...builtinSource, ...process.argv.slice(2)]);//将lib/system.ty和其他用户的输入放进待编译文件列表中
