import { FiniteAutomaton, State } from "./automaton.js";
import { Edge } from "./edge.js";
import { LexerForREG } from "./lexerForREG.js";
import Parse, { YYTOKEN } from "./parser.js";
interface LEX_TOKEN extends YYTOKEN {
    index: number;
}
export default class Lexer {
    private rule: ([string, ((arg: YYTOKEN) => any)] | [string, ((arg: YYTOKEN) => any), boolean])[];//第一个参数是正则，第二个是回调,第三个是是否最短匹配
    private nfa: FiniteAutomaton;
    private idx = 0;//当前下标
    private source: string = '';
    public endOfFile: ((arg: YYTOKEN) => any);
    private priorityIdx = 0;

    //----服务于yyerror----
    private lastWord = '';//上次解析的单词,用于错误提示
    private errorTipsWidth = 50;//错误提示的字符数量(最后要*2)
    private lastWordIndex = 0;//上次解析字符的下标
    //----服务于yyerror----

    constructor(rule: ([string, ((arg: YYTOKEN) => any)] | [string, ((arg: YYTOKEN) => any), boolean])[], EOF: ((arg: YYTOKEN) => any)) {
        this.rule = rule;
        this.endOfFile = EOF;

        let nfas: FiniteAutomaton[] = [];
        for (let r of this.rule) {
            let lexer = new LexerForREG(r[0]);
            let nfa = Parse(lexer) as FiniteAutomaton;
            nfa.end.rule = r[1];
            nfa.end.short = r[2] == undefined ? false : r[2];
            nfa.end.priority = this.priorityIdx++;
            nfas.push(nfa);
        }
        let start = new State();
        let end = new State();
        for (let nfa of nfas) {
            let edge = new Edge(-1, -1, nfa.start);
            start.edges.push(edge);
        }
        this.nfa = new FiniteAutomaton(start, end);
    }
    public setSource(src: string) {
        this.source = src;
        this.lastWord = '';
        this.errorTipsWidth = 50;
        this.lastWordIndex = 0;
        this.idx = 0;
    }
    /**
     * 返回值用于后续移除规则,只需要从start移除这条边就行了
     */
    public addRule(r: ([string, ((arg: YYTOKEN) => any)] | [string, ((arg: YYTOKEN) => any), boolean])): Edge {
        let lexer = new LexerForREG(r[0]);
        let nfa = Parse(lexer) as FiniteAutomaton;
        nfa.end.rule = r[1];
        nfa.end.short = r[2] == undefined ? false : r[2];
        nfa.end.priority = this.priorityIdx++;
        let edge = new Edge(-1, -1, nfa.start);
        this.nfa.start.edges.push(edge);
        return edge;
    }
    public compile() {
        console.log('使用NFA进行词法分析');
    }
    public removeRule(edge: Edge) {
        let idx = this.nfa.start.edges.indexOf(edge);
        if (idx != -1) {
            this.nfa.start.edges.splice(idx, 1);
        }
    }

    public yyerror(msg: string): any {
        let left = Math.max(0, this.lastWordIndex - this.errorTipsWidth);
        let right = Math.min(this.source.length - 1, this.lastWordIndex + this.errorTipsWidth);
        let output = '';
        for (let i = left; i < this.lastWordIndex; i++) {
            output += this.source.charAt(i);
        }
        output += "\x1b[41;37m"
        for (let i = this.lastWordIndex; i < this.lastWordIndex + this.lastWord.length; i++) {
            output += this.source.charAt(i);
        }
        output += "\x1b[0m";
        for (let i = this.lastWordIndex + this.lastWord.length; i < right; i++) {
            output += this.source.charAt(i);
        }
        console.error(msg);
        console.error(output);
    }
    public yylex(): LEX_TOKEN {
        if (this.nfa == undefined) {
            throw `has not compiled`;
        }
        for (; ;) {
            let ret: LEX_TOKEN;
            if (this.idx >= this.source.length) {
                ret = { type: '', yytext: '', value: '', index: this.idx };
                let type = this.endOfFile(ret);
                ret.type = type;
                return ret;
            }
            let nfaTestRet = this.nfa.test(this.source, this.idx);
            if (nfaTestRet == undefined) {
                throw `词法分析失败`;
            }
            let word: string = this.source.slice(nfaTestRet.start, nfaTestRet.end);

            this.lastWordIndex = this.idx;
            this.lastWord = word;

            this.idx += word.length;
            ret = { type: '', yytext: word, value: '', index: this.idx };
            let type = nfaTestRet.rule(ret);
            if (type == undefined) {
                continue;
            }
            ret.type = type;
            return ret;
        }
    }
}