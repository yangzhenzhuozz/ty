编译步骤
1. 执行 "npm i @types/node"，用到了node的fs模块读文件，不引入tsc会报错
2. 设置tsc为监视模式，开始监视文件，因为lexer和compiler的parser都还没有生成，这时候会报一些错误
3. 在根目录执行"node .\dist\lexer\RegulaerExpressionSyntax.js"生成lexer的parser,执行成功之后会在"src/lexer/"目录下生成一个文件"parser.ts"
4. 在根目录执行"node .\dist\compiler\parser-bnf.js"生成compiler的parser,执行成功之后会在"src/compiler/"目录下生成一个文件"parser.ts"
5. 因为tsc设置成了监视模式，等待tsc编译步骤3、4生成的两个parser(步骤3、4先后顺序不限)
6. 把"src/compiler/"下面的"lib"目录复制到/dist/compiler下面
7. 在根目录执行"npm i -g ./"安装
8. cd 到 example目录
8. 执行"tyc test1.ty test2.ty"即可编译