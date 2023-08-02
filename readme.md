编译步骤
1. 执行 "npm i -D"
1. 执行 "npm run build"

四个依赖作用如下:
|      模块    | 作用  |
|  ----        | ----  |
| @types/node  | 给typescript提供node的lib.d.ts,用于提供类型说明      |
| copyfiles    | 把src/compiler/lib目录下的几个ty文件复制到dist目录下 |
| typescript   | ts编译器                                            |

build命令执行情况如下：
```
tsc --先用tsconfig.json编译一部分ts代码到js
node dist\lexer\reg_exp_bnf.js --生成正则的parser.ts
tsc --把刚刚生成的正则parser.ts编译到js
node dist\compiler\parser-bnf.js --生成编译器的parser.ts
tsc --把刚刚生成的编译器parser.ts编译到js
copyfiles -u 2 src/compiler/lib/* dist/compiler --把lib目录复制到 dist/compiler目录
```
script中的watch是为了把src/compiler/lib目录拷贝到dist/compiler/lib目录，实际使用的时候没什么用,在开发lib的时候有用