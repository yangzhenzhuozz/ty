import Lexer from "./lexer.js";
import { YYTOKEN } from "./parser.js";
function main() {
    let lexRule: ([string, ((arg: YYTOKEN) => any)] | [string, ((arg: YYTOKEN) => any), boolean])[] = [
        [`"(([^\\\\][^"])|[^"])*"`,
            (arg) => {
                console.log(arg.yytext);
                return "comment";
            }, true]
    ];
    let EOF = () => { return '文件结束'; };
    let lexer = new Lexer(lexRule, EOF);
    lexer.setSource(`"你好\\"啊"`);
    lexer.yyerror('err');
    console.log(lexer.yylex());
    console.log(lexer.yylex());
    console.log(lexer.yylex());
    let r = lexer.addRule(['\\+', (str) => { return str; }]);
    console.log(lexer.yylex());//第一个+能解析，后面的解析失败
    lexer.removeRule(r);
    console.log(lexer.yylex());
}
main();