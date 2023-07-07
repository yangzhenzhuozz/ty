import { Lex, YYTOKEN } from './parser.js'
export class LexerForREG implements Lex {
    private source: string;
    private char_index;
    private keyWord = new Set<string>(['(', ')', '|', '*', '.', '[', ']', '-', '^']);
    constructor(src: string) {
        this.char_index = 0;
        this.source = src;
    }
    public yyerror(msg: string) {
        console.error(`正则表达式编译错误:"${this.source}"`);
        console.error(msg);
    }
    public yylex(): YYTOKEN {
        if (this.char_index >= this.source.length) {
            return {
                type: "$",
                value: "",
                yytext: ""
            };
        }
        let ch = this.source.charAt(this.char_index++);
        if (this.keyWord.has(ch)) {
            return {
                type: ch,
                value: ch,
                yytext: ch
            };
        }
        else if (ch == '\\') {//遇到反斜杠，需要对后面字符进行转义
            if (this.char_index > this.source.length - 1) {
                throw `反斜杠'\\'后面没有任何字符`;
            }
            ch = this.source.charAt(this.char_index++);//取后面一个字符
            switch (ch) {
                case 'r': ch = '\r'; break;
                case 'n': ch = '\n'; break;
                case 't': ch = '\t'; break;
            }
            return {
                type: "char",
                value: ch,
                yytext: ch
            };
        } else {
            return {
                type: "char",
                value: ch,
                yytext: ch
            };
        }
    }
}