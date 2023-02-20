import Parse from "./parser.js";
import { YYTOKEN, State, Automaton, ruleResolver } from './automaton.js'
//解析正则表达式的分析器
class LexForREG {
    private source: string = '';
    private char_index = 0;
    private lineNumber = 1;//行号
    private keyWord = new Set<string>(['(', ')', '|', '*']);
    public setSource(src: string) {
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
                yytext: "",
                lineNumber: this.lineNumber
            };
        }
        let ch = this.source.charAt(this.char_index++);
        if (ch == '\n') {
            this.lineNumber++;
        }
        if (this.keyWord.has(ch)) {
            return {
                type: ch,
                value: ch,
                yytext: ch,
                lineNumber: this.lineNumber
            };
        }
        else if (ch == '\\') {//遇到反斜杠，需要对后面字符进行转义
            if (this.char_index > this.source.length - 1) {
                throw `反斜杠'\\'后面没有任何字符`;
            }
            ch = this.source.charAt(this.char_index++);//取后面一个字符
            return {
                type: "normal_ch",
                value: ch,
                yytext: ch,
                lineNumber: this.lineNumber
            };
        } else {
            return {
                type: "normal_ch",
                value: ch,
                yytext: ch,
                lineNumber: this.lineNumber
            };
        }
    }
}

class Lexer {;
    private lexer = new LexForREG();
    private rules: Map<string, Automaton> = new Map();
    private NFAStartState: State | undefined;
    private DFAStartState: State | undefined;
    private source: string = '';
    private charIndex = 0;
    private lastWord = '';//上次解析的单词,用于错误提示
    private lastWordIndex = 0;//上次解析的单词下标
    private errorTipsWidth = 50;//错误提示的字符数量(最后要*2)
    private lineNumber = 1;//行号
    public yyerror(msg: string) {
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
    public yylex(): YYTOKEN {
        let result = {
            type: "",
            value: "",
            yytext: "",
            lineNumber: 1
        };
        do {
            if (this.DFAStartState == undefined) {
                throw '词法分析器还未编译';
            }

            if (this.charIndex >= this.source.length) {
                result.type = "$";
                break;
            }
            let nowState = this.DFAStartState!;//编译之后就不是undefined了
            let ch = '';
            let buffer = '';
            this.lastWordIndex = this.charIndex;
            for (; this.charIndex < this.source.length; this.charIndex++) {
                ch = this.source.charAt(this.charIndex);
                if (ch == '\n') {
                    this.lineNumber++;
                }
                let targets = nowState.gotoTable.get(ch);
                if (targets == undefined) {
                    break;
                } else {
                    buffer += ch;
                    nowState = targets[0];
                }
            }
            if (nowState.isFinal) {
                this.lastWord = buffer;
                if (nowState.resolver != undefined) {
                    result.yytext = buffer;
                    result.type = nowState.resolver(result);
                    break
                } else {
                    continue;//如果没有定义resolver，则表示本规则被忽略,进入下一轮解析
                }

            } else {
                throw `词法分析器:无法解析的字符:${ch}`;
            }
        } while (true)
        result.lineNumber = this.lineNumber;
        return result;
    }
    public setSource(src: string) {
        this.source = src;
        this.reset();
    }
    /**
     * 后面添加的规则优先级更高，见this.epsilon_closure()
     */
    public addRule(rule: [string, ruleResolver]) {//添加规则
        this.lexer.setSource(rule[0]);
        let automaton: Automaton = Parse(this.lexer);//如果source不符合我写的正则文法,会抛出异常
        automaton.end.isFinal = true;
        automaton.end.resolver = rule[1];
        this.rules.set(rule[0], automaton);
    }
    //移除规则
    public removeRule(rule: string) {
        this.rules.delete(rule);
    }
    //重置词法分析器之前保留的所有状态
    public reset() {
        this.charIndex = 0;
        this.lastWord = '';
        this.lastWordIndex = 0;
        this.errorTipsWidth = 50;
    }
    public compile() {
        console.time("编译词法分析器耗时")
        this.NFAStartState = new State();//创建一个开始状态，然后将该状态连接到所有规则生成的自动机
        for (let rule of this.rules) {
            this.NFAStartState.addEdge("", rule[1].start);
        }
        this.DFAStartState = this.generateDFA(this.NFAStartState);//构造DFA        
        console.timeEnd("编译词法分析器耗时");

    }
    private epsilon_closure(set: State[]) {
        //因为不知道js的容器怎么实现comparable,所以这些容器都使用cache判断重复
        let cache: Set<number> = new Set();//状态集合，保证各个State不重复
        let closure: State[] = [];//闭包集合
        let isFinal = false;//是否结束状态
        let gotoTableCache: Map<string, { cache: Set<number>, states: State[] }> = new Map();//本闭包能接受的字符以及能到达的状态
        let resolver: ruleResolver = undefined;
        let resoverIndex = -1;//下标大的resolver优先级更高
        for (let s of set) {
            if (!cache.has(s.index)) {
                cache.add(s.index);
                closure.push(s);
            }
        }
        for (let i = 0; i < closure.length; i++) {
            if (closure[i].isFinal) {
                isFinal = true;
                if (closure[i].index > resoverIndex) {
                    resoverIndex = closure[i].index;
                    resolver = closure[i].resolver;
                }
            }
            for (let edge of closure[i].gotoTable.keys()) {
                let targets = closure[i].gotoTable.get(edge)!;
                if (edge == "") {//接受epsilon
                    for (let s of targets) {
                        if (!cache.has(s.index)) {
                            cache.add(s.index);
                            closure.push(s);
                        }
                    }
                } else {//接受非空字符，记录本闭包接受该字符的可达状态集合
                    let targetsOfNonEpsilon = gotoTableCache.get(edge);
                    if (targetsOfNonEpsilon == undefined) {
                        targetsOfNonEpsilon = { cache: new Set(), states: [] };
                        gotoTableCache.set(edge, targetsOfNonEpsilon);
                    }
                    for (let s of targets) {
                        if (!targetsOfNonEpsilon!.cache.has(s.index)) {
                            targetsOfNonEpsilon!.cache.add(s.index);
                            targetsOfNonEpsilon!.states.push(s);
                        }
                    }
                }
            }
        }
        let sign = [...cache];//签名，在生成DFA时用到
        sign.sort((a, b) => {
            return a - b;
        });
        return { states: closure, isFinal: isFinal, sign: sign.toString(), gotoTable: gotoTableCache, resolver: resolver };
    }
    private generateDFA(start: State) {
        let startItems = this.epsilon_closure([start]);
        let cache = new Map<string, number>();
        let StateFamily: {
            states: State[];
            isFinal: boolean;
            sign: string;
            gotoTable: Map<string, {
                cache: Set<number>;
                states: State[];
            }>;
        }[] = [];
        let NFAStates: State[] = [];//NFA集合，保持和StateFamily同步
        cache.set(startItems.sign, 0);
        StateFamily.push(startItems);
        NFAStates.push(new State(startItems.isFinal));

        for (let i = 0; i < StateFamily.length; i++) {//处理每个闭包
            let s = StateFamily[i];
            for (let edge of s.gotoTable.keys()) {//遍历每个可接受字符
                let targetClosure = this.epsilon_closure(s.gotoTable.get(edge)!.states);//对每个可达集合计算闭包
                let targetIncache = cache.get(targetClosure.sign);
                if (targetIncache == undefined) {//如果缓存中没有该闭包
                    let NFATarget = new State(targetClosure.isFinal);//登记集合
                    NFATarget.resolver = targetClosure.resolver;
                    NFAStates[i].addEdge(edge, NFATarget);
                    StateFamily.push(targetClosure);
                    NFAStates.push(NFATarget);
                    cache.set(targetClosure.sign, NFAStates.length - 1);
                } else {
                    NFAStates[i].addEdge(edge, NFAStates[targetIncache]);
                }
            }
        }
        return NFAStates[0];
    }
}
export { State, Automaton }
export default Lexer