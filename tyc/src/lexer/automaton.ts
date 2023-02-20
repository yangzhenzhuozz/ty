interface Token {
    type: string;
    value: any;
}
interface YYTOKEN extends Token {
    yytext: string;
    lineNumber:number;
}
//当成功将字符串解析到一个规则之后调用的处理器，处理器返回值将会被设置到yytype,如果没有定义resolver，则表示本规则被忽略
type ruleResolver = ((arg: YYTOKEN) => string) | undefined;
class State {
    private static GLOBAL_INDEX = 0;//用于给State编号，在计算闭包的时候用到
    public isFinal;//是否为结束状态
    public gotoTable: Map<string, State[]> = new Map();//跳转表
    public index: number;
    public resolver: ruleResolver;
    constructor(final: boolean = false) {
        this.index = State.GLOBAL_INDEX++;
        this.isFinal = final;
    }
    public addEdge(edge: string, dest: State) {
        let table = this.gotoTable.get(edge);
        if (table == undefined) {
            table = [];
            this.gotoTable.set(edge, table);
        }
        table.push(dest);
    }
}
//状态机
class Automaton {
    public start: State;
    public end: State;
    constructor(s: State, e: State) {
        this.start = s;
        this.end = e;
    }
}
export {YYTOKEN,State,Automaton,ruleResolver}