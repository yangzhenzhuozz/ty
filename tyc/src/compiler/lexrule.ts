import Lexer from "../lexer/lexer.js";
export let userTypeDictionary = new Map<string, string>();
//词法规则
let lexer = new Lexer();
lexer.addRule(['( |\t|\r|\n)( |\t|\r|\n)*', undefined]);//忽略空格、制表、回车、换行
lexer.addRule(['//( |\t|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z|1|2|3|4|5|6|7|8|9|0)*(\r|\n)|(\r\n)', undefined]);//忽略注释
lexer.addRule([`"(-|_|\\\\| |:|/|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z|1|2|3|4|5|6|7|8|9|0)*"`, (arg) => { arg.value = arg.yytext.slice(1, arg.yytext.length - 1); return "immediate_string"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*b', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*s', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*l', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*d', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*.(1|2|3|4|5|6|7|8|9|0)(1|2|3|4|5|6|7|8|9|0)*', (arg) => { arg.value = arg.yytext; return "immediate_val"; }]);
lexer.addRule(['(_|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z)(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z|1|2|3|4|5|6|7|8|9|0)*',
    (arg) => {
        //在解析模板的时候会用到
        if (userTypeDictionary.has(arg.yytext)) {
            (arg.value as TypeUsed) = { PlainType: { name: userTypeDictionary.get(arg.yytext)! } };
            return "basic_type";
        } else {
            arg.value = arg.yytext;
            return 'id';
        }
    }]);
lexer.addRule(['=>', (arg) => { arg.value = arg.yytext; return `=>`; }]);
lexer.addRule(['...', (arg) => { arg.value = arg.yytext; return `...`; }]);
lexer.addRule([',', (arg) => { arg.value = arg.yytext; return `,`; }]);
lexer.addRule([';', (arg) => { arg.value = arg.yytext; return `;`; }]);
lexer.addRule([':', (arg) => { arg.value = arg.yytext; return `:`; }]);
lexer.addRule(['++', (arg) => { arg.value = arg.yytext; return `++`; }]);
lexer.addRule(['--', (arg) => { arg.value = arg.yytext; return `--`; }]);
lexer.addRule(['%', (arg) => { arg.value = arg.yytext; return `%`; }]);
lexer.addRule(['~', (arg) => { arg.value = arg.yytext; return `~`; }]);
lexer.addRule(['^', (arg) => { arg.value = arg.yytext; return `^`; }]);
lexer.addRule(['&', (arg) => { arg.value = arg.yytext; return `&`; }]);
lexer.addRule(['\\|', (arg) => { arg.value = arg.yytext; return `|`; }]);
lexer.addRule(['>>', (arg) => { arg.value = arg.yytext; return `>>`; }]);
lexer.addRule(['<<', (arg) => { arg.value = arg.yytext; return `<<`; }]);
lexer.addRule(['+', (arg) => { arg.value = arg.yytext; return `+`; }]);
lexer.addRule(['-', (arg) => { arg.value = arg.yytext; return `-`; }]);
lexer.addRule(['\\*', (arg) => { arg.value = arg.yytext; return `*`; }]);
lexer.addRule(['/', (arg) => { arg.value = arg.yytext; return `/`; }]);
lexer.addRule(['=', (arg) => { arg.value = arg.yytext; return `=`; }]);
lexer.addRule(['\\(', (arg) => { arg.value = arg.yytext; return `(`; }]);
lexer.addRule(['\\)', (arg) => { arg.value = arg.yytext; return `)`; }]);
lexer.addRule(['?', (arg) => { arg.value = arg.yytext; return `?`; }]);
lexer.addRule(['[', (arg) => { arg.value = arg.yytext; return `[`; }]);
lexer.addRule([']', (arg) => { arg.value = arg.yytext; return `]`; }]);
lexer.addRule(['{', (arg) => { arg.value = arg.yytext; return `{`; }]);
lexer.addRule(['}', (arg) => { arg.value = arg.yytext; return `}`; }]);
lexer.addRule(['==', (arg) => { arg.value = arg.yytext; return `==`; }]);
lexer.addRule(['!=', (arg) => { arg.value = arg.yytext; return `!=`; }]);
lexer.addRule(['>=', (arg) => { arg.value = arg.yytext; return `>=`; }]);
lexer.addRule(['<=', (arg) => { arg.value = arg.yytext; return `<=`; }]);
lexer.addRule(['>', (arg) => { arg.value = arg.yytext; return `>`; }]);
lexer.addRule(['<', (arg) => { arg.value = arg.yytext; return `<`; }]);
lexer.addRule(['&&', (arg) => { arg.value = arg.yytext; return `&&`; }]);
lexer.addRule(['\\|\\|', (arg) => { arg.value = arg.yytext; return `||`; }]);
lexer.addRule(['!', (arg) => { arg.value = arg.yytext; return `!`; }]);
lexer.addRule(['.', (arg) => { arg.value = arg.yytext; return `.`; }]);
lexer.addRule(['extension', (arg) => { arg.value = arg.yytext; return `extension`; }]);
lexer.addRule(['native', (arg) => { arg.value = arg.yytext; return `native`; }]);
lexer.addRule(['var', (arg) => { arg.value = arg.yytext; return `var`; }]);
lexer.addRule(['val', (arg) => { arg.value = arg.yytext; return `val`; }]);
lexer.addRule(['function', (arg) => { arg.value = arg.yytext; return `function`; }]);
lexer.addRule(['operator', (arg) => { arg.value = arg.yytext; return `operator`; }]);
lexer.addRule(['class', (arg) => { arg.value = arg.yytext; return `class`; }]);
lexer.addRule(['new', (arg) => { arg.value = arg.yytext; return `new`; }]);
lexer.addRule(['extends', (arg) => { arg.value = arg.yytext; return `extends`; }]);
lexer.addRule(['do', (arg) => { arg.value = arg.yytext; return `do`; }]);
lexer.addRule(['while', (arg) => { arg.value = arg.yytext; return `while`; }]);
lexer.addRule(['if', (arg) => { arg.value = arg.yytext; return `if`; }]);
lexer.addRule(['else', (arg) => { arg.value = arg.yytext; return `else`; }]);
lexer.addRule(['for', (arg) => { arg.value = arg.yytext; return `for`; }]);
lexer.addRule(['switch', (arg) => { arg.value = arg.yytext; return `switch`; }]);
lexer.addRule(['case', (arg) => { arg.value = arg.yytext; return `case`; }]);
lexer.addRule(['break', (arg) => { arg.value = arg.yytext; return `break`; }]);
lexer.addRule(['continue', (arg) => { arg.value = arg.yytext; return `continue`; }]);
lexer.addRule(['as', (arg) => { arg.value = arg.yytext; return `as`; }]);
lexer.addRule(['import', (arg) => { arg.value = arg.yytext; return `import`; }]);
lexer.addRule(['default', (arg) => { arg.value = arg.yytext; return `default`; }]);
lexer.addRule(['valuetype', (arg) => { arg.value = arg.yytext; return `valuetype`; }]);
lexer.addRule(['this', (arg) => { arg.value = arg.yytext; return `this`; }]);
lexer.addRule(['return', (arg) => { arg.value = arg.yytext; return `return`; }]);
lexer.addRule(['get', (arg) => { arg.value = arg.yytext; return `get`; }]);
lexer.addRule(['set', (arg) => { arg.value = arg.yytext; return `set`; }]);
lexer.addRule(['try', (arg) => { arg.value = arg.yytext; return `try`; }]);
lexer.addRule(['catch', (arg) => { arg.value = arg.yytext; return `catch`; }]);
lexer.addRule(['throw', (arg) => { arg.value = arg.yytext; return `throw`; }]);
lexer.addRule(['super', (arg) => { arg.value = arg.yytext; return `super`; }]);
lexer.addRule(['private', (arg) => { arg.value = arg.yytext; return `private`; }]);
lexer.addRule(['instanceof', (arg) => { arg.value = arg.yytext; return `instanceof`; }]);
lexer.addRule(['autounwinding', (arg) => { arg.value = arg.yytext; return `autounwinding`; }]);
lexer.addRule(['(true)|(false)', (arg) => { arg.value = 'true'; return "immediate_val"; }]);
lexer.addRule(['null', (arg) => { arg.value = 'null'; return "immediate_val"; }]);
export default lexer;
