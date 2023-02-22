#!/usr/bin/env node
import Parser, { setParserNameSpace } from "./parser.js";
import lexer from './lexrule.js';
import fs from 'fs';
import semanticCheck from './semanticCheck.js'
import codeGen from './codeGen.js'
import { setProgram } from "./ir.js";
import { Program } from "./program.js";
import path, { dirname } from "path";
import { fileURLToPath } from 'node:url';
function main(inputFiles: string[]) {
    try {
        let sources: { namespace: string, source: string }[] = [];
        let className: string[] = [];//所有用户自定义的类型
        let fileNamesSet = new Set<string>();
        for (let input of inputFiles) {
            if (!input.endsWith('.ty')) {
                throw `输入文件的后缀必须是以.ty结尾,文件${input}不满足要求`
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
            lexer.addRule([`${sourceItem.namespace}.(_|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z)(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z|1|2|3|4|5|6|7|8|9|0)*`,
            (arg) => {
                arg.value = arg.yytext;
                return 'id';
            }]);
        }
        lexer.addRule([`main.main`,
        (arg) => {
            arg.value = arg.yytext;
            return 'id';
        }]);
        //源码替换阶段
        for (let sourceItem of sources) {
            let reg = /class[\s\r\n]+([a-zA-Z_][a-zA-Z_0-9]*)/g;
            let classNameInFile: string[] = [];
            for (let group: RegExpExecArray | null; (group = reg.exec(sourceItem.source)) != null;) {
                classNameInFile.push(group[1]!);
                className.push(`${sourceItem.namespace}.${group[1]!}`);
                lexer.addRule([`${sourceItem.namespace}.${group[1]!}`, (arg) => { arg.value = (arg.value as TypeUsed) = { PlainType: { name: `${arg.yytext}` } }; return "basic_type"; }]);//给词法分析器新增basic_type的解析规则
            }
            if (classNameInFile.length > 0) {
                //在本文件内部替换
                let classRepalceReg = new RegExp(`(?<![a-zA-Z_\.])(${classNameInFile.map(v => `(${v})`).reduce((p, c) => `${p}|${c}`)})(?![a-zA-Z_0-9])`, 'g');//替换类型,如果有一个类型是myClass，则所有的myClass都替换成namespace.myClass
                sourceItem.source = sourceItem.source.replace(classRepalceReg, `${sourceItem.namespace}.$1`);
            }
        }
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
main([path.join(dirname(fileURLToPath(import.meta.url)), 'lib', 'system.ty'), ...process.argv.slice(2)]);//将lib/system.ty和其他用户的输入放进待编译文件列表中
