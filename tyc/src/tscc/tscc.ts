class Tools {//提供类似sprintf的功能
    static sprintf(format: string, ...args: any): string {
        let index = 0;
        return format.replace(/(%d)|(%s)/g, (): string => {
            return args[index++];
        });
    }
}

interface Tips {
    tips1: string;
    tips2: string;
    tips3: string;
    tips4: string;
    tips5: string;
    tips6: string;
    tips7: string;
    tips8: string;
    tips9: string;
    tips10: string;
    tips11: string;
    tips12: string;
    tips13: string;
    tips14: string;
    tips15: string;
    tips16: string;
    tips17: string;
    tips18: string;
    tips19: string;
    tips20: string;
    tips21: string;
    tips22: string;
    tips23: string;
    tips24: string;
    tips25: string;
    conflict: string;
    symbol: string;
    ShiftRedueceError: string;
    ReduceRedueceError: string;
}
interface MultiLanguage {
    [key: string]: Tips;
}
let MultipleLanguage: MultiLanguage = {
    "en-us": {
        tips1: "redefinition association of symbol:%s",
        tips2: "head of syntax can not be terminal-symbol:%s",
        tips3: "symbol error,the name must match the regular expression \"[^\\s`\"$@#]+\":%s",
        tips4: "grammar is empty",
        tips5: "──────────state %d──────────\n",
        tips6: "\nsignature:%s\n",
        tips7: "─────────detail of state:%d──────────",
        tips8: "the non-terminal-symbol can not derivation:%s",
        tips9: "a symbol of string does not derive any sentence:[%s]",
        tips10: "the item is repeated of items:%s",
        tips11: "the non-terminal-symbol can not speculate a syntax:%s",
        tips12: "can not identify symbol:%s:%s",
        tips13: "syntax error:%s is not expectation",
        tips14: "a object has key that is named \"left\" or \"right\" or \"nonassoc\" only one to descript terminal-symbol",
        tips15: "a object has key to descript syntax only one",
        tips16: "reduce-reduce conflict",
        tips17: "fatal: the conflictive syntaxs can not resolve,because both of the syntax and terminal-symbol have not priority and association",
        tips18: "the syntax have not priority",
        tips19: "the tips have been used",
        tips20: "the terminal-symbol have not priority",
        tips21: "list of syntax:",
        tips22: "goto table:",
        tips23: "rules useless in grammar:",
        tips24: "start symbol %s does not derive any sentence",
        tips25: "the source is not match grammar",
        conflict: "conflict:",
        symbol: "symbol",
        ShiftRedueceError: "────────shift-reduce conflict────────",
        ReduceRedueceError: "────────reduce-reduce confilct────────",
    },
    "zh-cn": {
        tips1: "th:%s",
        tips2: "不能使用终结符作为产生式头:%s",
        tips3: "产生式%s符号错误,所有符名必须匹配正则\"[^\\s`\"$@#]+\"",
        tips4: "文法中没有任何产生式",
        tips5: "──────────状态%d──────────\n",
        tips6: "\n签名:%s\n",
        tips7: "─────────状态详情:%d──────────",
        tips8: "存在无法推导的非终结符:%s",
        tips9: "存在无法计算first集合的符号串:[%s]",
        tips10: "项集中存在重复的项:%s",
        tips11: "非终结符:%s 没有推导出产生式",
        tips12: "无法识别的符号:%s:%s",
        tips13: "语法错误:此处不能接受%s",
        tips14: "每个对象仅仅能拥有一个名为left或者right的key",
        tips15: "每个对象仅仅能拥有一条描述产生式的key",
        tips16: "规约-规约冲突",
        tips17: "致命错误:无法解决的移入-规约冲突,终结符和产生式都没有优先级",
        tips18: "产生式没有定义优先级",
        tips19: "没有使用的提示",
        tips20: "符号没有定义优先级",
        tips21: "产生式列表:",
        tips22: "跳转表:",
        tips23: "下面这些产生式没有被使用(归约)过:",
        tips24: "起始符号%s没有推导出任何句子",
        tips25: "源码不符合文法",
        conflict: "冲突:",
        symbol: "符号",
        ShiftRedueceError: "────────移入-规约冲突────────",
        ReduceRedueceError: "────────规约-规约冲突────────",
    }
};
interface Grammar {
    userCode?: string,
    association?: { [key: string]: string[] }[],//终结符优先级和结合性,优先级取的是在数组association中的下标,所以最低是0
    tokens?: string[];//终结符号表
    accept?: (args: any[], symbolStack: any[]) => any;//最终规约成增广文法第一条产生式时调用的函数
    BNF: {
        //key为一个产生式 A:B C D
        [key: string]: {
            action?: ((args: any[], symbolStack: any[]) => any);//产生式规约动作,产生式体下标从0记起,返回值被赋予产生式头,可以为undefine
            priority?: string;//产生式指定结合性和优先级,覆盖默认的产生式优先级和结合性规则(使用产生式最右侧终结符的结合性)
        };
    }[];
}
interface TSCCParameter {
    debug: boolean;//是否显示状态信息用于调试
    language: "zh-cn" | "en-us";//多语言支持
}
enum ActionType {
    shift, reduce, err
}
interface Action {
    actionType: ActionType//移入或者规约
    target: number//如果是移入,则表示状态,如果是规约,则表示产生式序号
    ReducePad?: PriorityAndAssociationDescription;//如果是规约，则记录产生式的优先级和结合性
    shiftPriory?: number;//如果是移入，则只记录符号的优先级
}
/**
 * 结合性优先级符描述
 */
interface PriorityAndAssociationDescription {
    association: "left" | "right" | "nonassoc";//结合性
    priority: number;//优先级
}
/**
 * 项
 */
interface Item {
    syntax: number;//产生式
    dot: number;//点的位置,从1开始
    expectation: string;//后续符号
}
class Syntax extends Array<string>{
    resolver?: (...args: any) => any;
    pad: PriorityAndAssociationDescription | undefined;//从最右侧的终结符获得的优先级和结合性
    syntaxLength: number = 0;//产生式体长度,不统计ε
    constructor(array: string[], resolve?: (...args: any) => any) {
        super(...array);
        this.resolver = resolve;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, Array.prototype);
    }
    public slice(start?: number, end?: number): string[] {
        return super.slice(start, end);
    }
}
/**
 * A:等价于A:ε,解析产生式时自动为空产生式添加ε作为产生式体
 * 用冒号代替->符号,产生式的任何符号不能使用包含[`$`,`@`,`#`]的字符,第一个冒号以后的冒号会被当做一个符号,如 A::B会被当成 A-> :B
 * 内置终结符ε和$,分别表示空和文件结束,ε为内置符,εε就不是了,εε为一个合法符号
 * startSymbol为第一个产生式的头部
 * 会自动加上S'->startSymbol以生成增广文法
 * BNF解析规则目前不能使用@和#作为符号,这两个已经被用于将项和项集转换成字符串了
 */
class TSCC {
    private TerminalSymbols: Map<string, PriorityAndAssociationDescription | undefined>;//终结符记录集合
    private syntaxs: Syntax[];//产生式,A->B C会被转换成 ["A","B","C"]
    private syntaxSource: string[];//产生式原始字符串,报错时使用
    private NTSSyntax: Map<string, number[]>;//非终结符可以推导出来的产生式下标NTS non terminal symbol
    private argument: TSCCParameter;//调用的一些参数
    private localTips: Tips;
    private actionTable: {}[] | undefined;//动作表
    private userCode?: string;//用户自定义代码
    constructor(grammar: Grammar, argument: TSCCParameter) {
        this.localTips = MultipleLanguage[argument.language];
        this.argument = argument;
        this.TerminalSymbols = new Map();
        this.syntaxs = new Array();
        this.syntaxSource = new Array();
        this.NTSSyntax = new Map();
        this.TerminalSymbols.set(`$`, undefined);//定义ε和$,允许被Grammar中的symbols覆盖
        this.userCode = grammar.userCode;

        //先把所有终结符读取
        grammar.tokens?.forEach((v) => {
            this.TerminalSymbols.set(v, undefined);
        });

        //设置终结符的结合性和优先级
        grammar.association?.forEach((v, i, a) => {
            if (Object.getOwnPropertyNames(v).length != 1) {//一个对象只能有一个key名为"right"或者"left"
                throw this.localTips.tips14;
            }
            if (v['left'] != undefined) {
                for (let symbol of v['left']) {
                    this.TerminalSymbols.set(symbol, {
                        association: "left",//结合性
                        priority: i//优先级
                    });
                }
            } else if (v['right'] != undefined) {
                for (let symbol of v['right']) {
                    this.TerminalSymbols.set(symbol, {
                        association: "right",//结合性
                        priority: i//优先级
                    });
                }
            } else if (v['nonassoc'] != undefined) {
                for (let symbol of v['nonassoc']) {
                    this.TerminalSymbols.set(symbol, {
                        association: "nonassoc",//结合性
                        priority: i//优先级
                    });
                }
            }
            else {
                throw this.localTips.tips14;
            }
        });

        if (grammar.BNF.length > 0) {
            for (let i = 0; i < grammar.BNF.length; i++) {
                let keys = Object.getOwnPropertyNames(grammar.BNF[i]);
                if (keys.length == 1) {//一个对象仅能有一个key用于描述产生式
                    if (/^\s*[^"`:\s$@#]+\s*:\s*([^\s`"$@#]+\s*)*$/.test(keys[0])) {
                        let syntax = new Syntax([], grammar.BNF[i][keys[0]].action);//创建产生式
                        let length = 0;
                        let description: PriorityAndAssociationDescription | undefined;//本产生式的优先级

                        let headReg = /^\s*([^:\s$@#]+)\s*:/y;
                        let bodyReg = /([^\s$@#]+)/g;
                        syntax.push(headReg.exec(keys[0])![1]);//获取产生式头
                        if (i == 0) {//如果是输入第一条产生式
                            //插入增广文法第一条产生式
                            this.syntaxs.push(new Syntax([`${syntax[0]}'`, syntax[0]], grammar.accept));//如果第一个产生式头为X,插入产生式的头为X'
                            this.syntaxs[0].syntaxLength = 1;
                            this.NTSSyntax.set(`${syntax[0]}'`, [0]);
                        }
                        bodyReg.lastIndex = headReg.lastIndex;
                        let bodySym: RegExpExecArray | null;//产生式体符号

                        while ((bodySym = bodyReg.exec(keys[0])) != null) {
                            syntax.push(bodySym[1]);
                            if (this.TerminalSymbols.has(bodySym[1])) {//在终结符表中尝试取得当前符号的结合性描述
                                description = this.TerminalSymbols.get(bodySym[1]);
                            }
                            if (bodySym[1] == `error`) {//如果当前符号为'error',则将'error'添加到终结符表中
                                if (!this.TerminalSymbols.has(`error`)) {
                                    this.TerminalSymbols.set(`error`, undefined);
                                }
                            }
                            if (bodySym[1] != `ε`) {//如果当前符号不是ε,产生式长度+1
                                length++;
                            }
                            else {
                                if (!this.TerminalSymbols.has(`ε`)) {//如果终结符表中没有定义ε则添加ε
                                    this.TerminalSymbols.set(`ε`, undefined);
                                    description = undefined;//系统自动添加的ε没有优先级
                                }
                            }
                        }



                        if (this.TerminalSymbols.has(syntax[0])) {//如果产生式头是一个非终结符,报错
                            throw Tools.sprintf(this.localTips.tips2, syntax[0]);
                        }
                        syntax.syntaxLength = length;//统计产生式体长度,因为这个长度包含了头部,所以-1
                        if (syntax.length == 1) {//如果没有写产生式体,则默认添加一个ε作为产生式体
                            syntax.push(`ε`);
                            if (!this.TerminalSymbols.has(`ε`)) {//如果终结符表中没有定义ε则添加ε
                                this.TerminalSymbols.set(`ε`, undefined);
                                description = undefined;//系统自动添加的ε没有优先级
                            }
                        }
                        if (!this.NTSSyntax.has(syntax[0])) {//记录该非终结符可以推导出的产生式
                            this.NTSSyntax.set(syntax[0], new Array());
                        }
                        if (grammar.BNF[i][keys[0]].priority != undefined) {//如果指定了priority则使用该符号指定的优先级和结合性
                            syntax.pad = this.TerminalSymbols.get(grammar.BNF[i][keys[0]].priority!);
                        } else {//否则使用产生式最右侧终结符的优先级和结合性
                            syntax.pad = description;
                        }
                        this.NTSSyntax.get(syntax[0])?.push(this.syntaxs.length);
                        this.syntaxs.push(syntax);//得到一条产生式
                        this.syntaxSource.push(keys[0]);
                    } else {
                        throw Tools.sprintf(this.localTips.tips3, keys[0]);
                    }
                }
                else {
                    throw this.localTips.tips15;
                }
            }
        } else {
            throw Tools.sprintf(this.localTips.tips4);
        }

        //起始项
        let st = {
            syntax: 0,//产生式
            dot: 1,//点的位置,从1开始
            expectation: `$`//后续符号
        };
        try {
            this.first_wrapper([this.syntaxs[1][0]]);//如果这个符号不能求出任何终结符,first集合会抛出异常,捕获这个异常并转换提示
        } catch (err) {
            console.error(this.localTips.tips24, this.syntaxs[1][0]);
        }
        this.actionTable = this.itemsFamily(st);
    }
    /**
     * 生成自动机代码,如果失败则返回null
     * @returns 编译器代码
     */
    public generate(): string | null {
        if (this.actionTable != undefined) {//如果构造项集族成功则生成自动机
            return this.generateStateMachine(this.actionTable);//生成自动机
        } else {
            return null;
        }
    }
    /**
     * 手动推导下面的文法的first集,把人脑推导过程变成代码真的好难
     * S:B b
     * S:B d
     * S:ε
     * B:S S S
     * B:c
     */

    /*
    参数:
        symbol:需要计算first的符号串
        result:用于记录first结果集,建议使用Set或者Map这种数据结构,可以避免元素重复
        expands:用于记录正在计算的串是由哪个非终结符展开得到的,用于避免递归计算,建议使用Set或者Map这种数据结构,可以避免元素重复,也可以快速判断集合中是否包含某个元素
    first(symbol,result,expands)
    {
        for(s属于symobs中的每个符号)
        {
            如果s是终结符
            {
                将s添加到result
            }
            否则
            {
                如果expand中没有s,表示s能展开的产生式没有在外层first函数中处理过
                {
                    for(syntax属于非终结符s推导出来的每个产生式)
                    {
                        往expand中添加s
                        first(syntax,result,expands)
                        在expand中移除s
                    }
                }
            }
            从result移除ε
            如果nullalbe(s)为假,表示符号s不可以推导出ε
            {
                结束循环
            }
            否则
            {
                s是串symbols的最后一个符号
                {
                    往result中添加ε
                }
            }
        }
    }
    
    
    参数:
        symbol:需要计算first的符号串
        expands:用于记录正在计算的串是由哪个非终结符展开得到的,用于避免递归计算,建议使用Set或者Map这种数据结构,可以避免元素重复,也可以快速判断集合中是否包含某个元素
    nullable(symbol,expands)
    {
         for(s属于symobs中的每个符号)
         {
             如果s是终结符
             {
                 如果s不是ε
                 {
                     返回false
                 }
             }
             否则
             {
                 如果expand中没有s,表示s能展开的产生式没有在外层nullable函数中处理过
                 {
                     用hasNull记录某个s展开的产生式是否能推导出ε
                     for(syntax属于非终结符s推导出来的每个产生式)
                     {
                         往expand中添加s
                         hasNull=nullable(syntax,expands)
                         在expand中移除s
                         如果hasNull为真①
                         {
                             因为s展开过的某个产生式已经能推导出ε,所以跳出循环
                         }
                         如果hasNull为假,表示符号s不能推导出ε,不需要判断symbols串的后续符号了
                         {
                             直接返回false
                         }
                     }
                 }
                 否则②
                 {
                     因为外层nullable函数已经处理过符号s,如果本符号串能够推导出ε,则表示s一定通过其他的直接推导得到ε,所以这里直接返回false
                 }
             }
         }
         因为如果串中间的某个符号推导不出ε的话就已经返回false了,所以此处直接返回true即可
    }
    上面的算法用的就是下面两个规则:(直接推导:表示没有经过任何递归的产生式推导) 
    1. 递归对nullable(X)没有任何影响,nullable(X)=true或者false一定是通过直接推导得到的  
    2. 递归对first(X)没有任何帮助,first sets的所有符号都是可以通过直接推导得到的
    
    仔细看这两个函数,会发现处理逻辑几乎是一样的,除了有两个地方不同(在nullable函数中标注①②的地方),不同点①应该很容易理解,如果有S:α|β|γ,如果判断nullable(α)为真,自然不需要再继续判断nullable(β)和nullable(γ)了。不同点②理解起来可能有点绕,所以我用一个文法举例说明:
    S:S A|ε
    A:ε

    nullable函数
    ┌──────────┬────────────────────────────────────────────────────────┬──────────┬─────────────────────────────────────────────────┐
    │ 调用层次 │                        计算过程                         │ expands  │                      处理策略                   │
    ├──────────┼────────────────────────────────────────────────────────┼──────────┼─────────────────────────────────────────────────┤
    │     0    │                             nullable(S)                │          │                       展开S                     │
    ├──────────┼──────────────────────────────────────────┬─────────────┼──────────┼─────────────────────────────────────────────────┤
    │     1    │                  nullable(S A)           │ nullable(ε) │          │ 第2层nullalbe(S A)返回false,继续计算nullable(ε)  │
    ├──────────┼───────────────────────────┬──────────────┼─────────────┼──────────┼─────────────────────────────────────────────────┤
    │     2    │ nullable(S)->nullable(A)  │ nullable(ε)  │             │    S     │ 因为S的递归放弃本轮所有计算                      │
    └──────────┴───────────────────────────┴──────────────┴─────────────┴──────────┴─────────────────────────────────────────────────┘
    
    first函数
    ┌──────────┬───────────────────────────────────────────┬──────────┬──────────────────────────────────────────────────────────────────┐
    │ 调用层次 │                        计算过程            │ expands  │                      处理策略                                    │
    ├──────────┼───────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────────┤
    │     0    │                     first(S)              │          │             展开S                                                │
    ├──────────┼────────────────────────────────┬──────────┼──────────┼──────────────────────────────────────────────────────────────────┤
    │     1    │               first(S A)       │ first(ε) │          │ 第2层nullalbe(S A)返回false,继续计算nullable(ε)                   │
    ├──────────┼─────────────────────┬──────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────┤
    │     2    │ first(S)->first(A)  │ first(ε) │          │    S     │ 因为S的递归，跳过first(S)的计算,根据nullalbe(S)决定是否计算first(A)│
    └──────────┴─────────────────────┴──────────┴──────────┴──────────┴──────────────────────────────────────────────────────────────────┘
    如果表格显示错乱,建议使用vscode查看,不同文本编辑器对字符宽度处理不同
    */



    /**
     * 判断一个串是否能推到出ε
     * @param str 需要判断的串
     * @param expands 展开过的非终结符
     */
    private nullable(str: string[], expands: Set<string>): boolean {
        for (let i = 0; i < str.length; i++) {
            if (this.TerminalSymbols.has(str[i])) {//当前符号是终结符
                if (str[i] != 'ε') {//如果当前符号不是ε则不需要看后面的符号
                    return false;
                }
            }
            else {
                if (!expands.has(str[i])) {//如果这个非终结符没有被展开过,则找到这个非终结符能推导的串
                    let derivations = this.NTSSyntax.get(str[i]);
                    if (derivations == undefined) {//该非终结符没有任何推导
                        throw Tools.sprintf(this.localTips.tips8, str[i]);//形如 S->A这种悬空文法,非终结符A没有后续推导,S和A都无法计算first集合
                    }
                    let hasNull = false;
                    for (let j = 0; j < derivations.length; j++) {//开始遍历
                        expands.add(str[i]);//标记该非终结符已经被展开过
                        let r = this.nullable(this.syntaxs[derivations[j]].slice(1), expands);
                        expands.delete(str[i]);//还原标记
                        if (r) {
                            /**
                             * 如果非终结符的某个推导得到ε,则表示这个符号可以推导出ε
                             * 即表示在计算 A B C d中A的时候nullable(A)=true,可以往后继续判断nullalbe(B)了
                             */
                            hasNull = true;
                            break;
                        }
                    }
                    if (!hasNull) {//如果当前符号不能推导出ε则不需要看后面的符号
                        return false;
                    }
                }
                else {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * 计算first集合
     * 1.如果a是一个终结符,则first(a)=a
     * 2.如果S是非终结符,且存在S->a b c d,则first(S)=first(S)∪first(a b c d),最初的first(S)可以是一个空集
     * 3.在计算first(a1 a2 a3 a4 ... ak)时,如果first(a1)包含ε,则first(a1...ak)=first(a1)并first(a2...ak),否则first(a1...ak)=first(a1),这种方式可以理解成如果first(ai)包含ε,则并上first(ai+1),依此类推.如果一直到first(ak)任然包含ε,则将ε加入first(a1 a2...ak)中
     * @param str 需要计算first集的串
     * @param expands 记录被展开过的非终结符
     * @param first_sets 结果集
     * @returns 
     */
    private first(str: string[], expands: Set<string>, first_sets: Set<string>) {
        let nowSymbolHasEpsilon = false;//当前符号是否有ε
        for (let i = 0; i < str.length; i++) {
            if (this.TerminalSymbols.has(str[i])) {//当前符号是终结符
                first_sets.add(str[i]);
            }
            else {
                if (!expands.has(str[i])) {//如果这个非终结符没有被展开过,则找到这个非终结符能推导的串
                    let derivations = this.NTSSyntax.get(str[i]);
                    if (derivations == undefined) {//该非终结符没有任何推导
                        throw Tools.sprintf(this.localTips.tips8, str[i]);//形如 S->A这种悬空文法,非终结符A没有后续推导,S和A都无法计算first集合
                    }
                    for (let j = 0; j < derivations.length; j++) {//开始遍历
                        expands.add(str[i]);//标记该非终结符已经被展开过
                        this.first(this.syntaxs[derivations[j]].slice(1), expands, first_sets);
                        expands.delete(str[i]);//还原标记
                    }
                } else {
                    //什么也不用做,因为递归不会新增任何符号
                }
            }
            first_sets.delete('ε');//不管怎么样,先移除ε
            if (this.nullable([str[i]], new Set())) {//如果当前符号能推导出ε则继续计算下一个符号
                nowSymbolHasEpsilon = true;
            } else {
                nowSymbolHasEpsilon = false;
                break;
            }
        }
        if (nowSymbolHasEpsilon) {//如果计算到串中最后一个符号还有ε则添加
            first_sets.add('ε');
        }
    }
    /**
     * first包裹方法,把first的计算结果变成数组
     * @param str first sets
     */
    private first_wrapper(str: string[]): string[] {
        let result = new Set<string>();
        this.first(str, new Set(), result)
        if (result.size == 0) {
            throw Tools.sprintf(this.localTips.tips9, str);
        }
        return [...result];
    }
    /**
     * 生成自动机,自动生成ts代码
     * @param gotoTable 移入规约表
     */
    private generateStateMachine(gotoTable: {}[]): string {
        let str = '';
        if (this.userCode != undefined || this.userCode != null) {
            str += this.userCode;
        }
        str += `
interface Token {
    type: string;
    value: any;
}
interface YYTOKEN extends Token{
    yytext:string;
}
interface Lex {
    yylex(): YYTOKEN;
    yyerror(msg: string): any;
}
class ParseException extends Error{
    constructor(msg:string){
        super(msg);
        super.name='ParseException';
    }
}
function Parse(lexer: Lex):any {
    let state: { [key: string]: string | undefined }[] = JSON.parse(\`${JSON.stringify(gotoTable)}\`);
    let syntaxHead: string[] = [`;
    for (let i = 0; i < this.syntaxs.length; i++) {
        if (i != 0) {
            str += `,`;
        }
        str += `\`${this.syntaxs[i][0]}\``;
    }
    str += `];//每个产生式的头部,规约的时候使用
    let syntaxLength = [`;
    for (let i = 0; i < this.syntaxs.length; i++) {
        if (i != 0) {
            str += `,`;
        }
        str += `${this.syntaxs[i].syntaxLength}`;
    }
    str += `];
    let functionArray:(((args:any[],stack:any[])=>any)|undefined)[]=[
        `;
    for (let i = 0; i < this.syntaxs.length; i++) {
        if (i != 0) {
            str += `,`;
        }
        if (this.syntaxs[i].resolver != undefined) {//如果函数不是未定义,则输出到源码
            str += `${this.syntaxs[i].resolver!.toString()}`;
        }
    }
    str += `];
    let result;//最终规约之后的返回值,由accept动作提供
    let yytoken:YYTOKEN | undefined;
    let errorRollback = false;//是否处于错误恢复模式
    let hasError=false;//是否曾经出现过错误
    //如龙书所说:"S0(即分析器的开始状态)不代表任何文法符号，它只是作为栈底标记，同时也在语法分析过程中担负了重要的角色。"
    //自己标注的:用于规约成增广文法初始符号S'
    let symbolStack: Token[] = [{ type: syntaxHead[0], value: undefined }];//符号栈
    let symbolValStack: any[] = [undefined];//符号值栈，是symbolStack的value构成的栈，用于插入动作
    let stateStack: number[] = [0];//状态栈
    let reduceToken: Token | null = null;
    let lexBuffer: Token | null = null;//lex输入缓冲,如果遇到规约,则上次从lex读取到的数据还没有被使用
    L0:
    for (; ;) {
        let nowState = stateStack[stateStack.length - 1];
        let sym: Token;
        /**
         * 如果没有规约出来的符号,则使用lex读取输入,因为不可能出现连写的规约,所以用一个变量reduceToken保存规约而 成的符号就够了
         * 对于LR(1)分析器来说,规约要求输入符号必须是一个终结符,而规约必定是得到一个非终结符,所以不可能出现不读取输入而连续多次规约的情况
         */
        if (reduceToken == null) {
            if (lexBuffer == null) {
                yytoken = lexer.yylex();
                lexBuffer = yytoken;
            }
            sym = lexBuffer;
            lexBuffer = null;
        } else {
            sym = reduceToken;
            reduceToken = null;
        }
        let actionString = state[nowState][sym.type];
        if (actionString != undefined&&actionString != 'err') {
            if (sym.type != \`error\`) {//不是因为error符号产生的移入则解除错误回滚标志
                errorRollback = false;
            }
            let action = actionString.substring(0, 1);
            let target = Number(actionString.substring(1, actionString.length));
            if (action == "s") {//移入
                symbolStack.push(sym);
                symbolValStack.push(sym.value);//保持和stateStack一致
                stateStack.push(target);
            } else {//规约
                let args: any[] = [];
                for (let i = 0; i < syntaxLength[target]; i++) {
                    args.unshift(symbolStack.pop()!.value);
                    symbolValStack.pop();//保持和stateStack一致
                    stateStack.pop();
                }
                reduceToken = {
                    type: syntaxHead[target],
                    value: undefined//规约动作的返回值
                };
                if(functionArray[target]!=undefined){
                    reduceToken.value=functionArray[target]!(args,symbolValStack);//调用规约动作
                }
                if (target == 0) {
                    result=reduceToken.value;//增广文法的返回值
                    break;//文法分析结束
                }
                lexBuffer = sym;//把读取到的符号暂时退回去
            }
        } else {
            hasError=true;
            if (errorRollback) { //已经在错误处理状态中了
                //什么都不用做,消耗lex中的token就行了
                if (sym.type == \`$\`) {//因为EOF导致的错误,不需要回溯了
                    break;
                }
            }
            else {//如果不处于错误恢复状态,则进行一些操作
                lexer.yyerror(\`语法错误:此处不能接受\${sym.type}\`);
                if (sym.type == \`$\`) {//因为EOF导致的错误,不需要回溯了
                    break;
                }
                errorRollback = true;
                //状态栈中默认包含一个状态0,如果回溯到这个位置还不能移入error,则放弃回溯
                for (; stateStack.length > 0;) {//尝试回退栈中状态,直到状态包含一个形如 A->.error any,any的项,简单来说就是这个状态可以接收error
                    if (state[stateStack[stateStack.length-1]][\`error\`] != undefined) {
                        reduceToken = {
                            type: \`error\`,
                            value: undefined
                        };
                        lexBuffer = sym;//把读取到的符号暂时退回去
                        continue L0;//假装已经把所有的错误符号规约成了error,进行下一轮操作
                    } else {
                        stateStack.pop();
                        symbolValStack.pop();//保持和stateStack一致
                        symbolStack.pop();
                    }
                }
                break;//弹出栈中的所有符号都不能处理错误,结束语法分析,在函数末尾抛出异常
            }
        }
    }
    if(hasError){
        throw new ParseException(\`${this.localTips.tips25}\`);
    }else{
        return result;
    }
}
export {ParseException};
export default Parse;`;
        return str;
    }

    private sprintfItems(items: Item[]) {
        let str = ``;
        for (let item of items) {
            str += `${this.sprintfItem(item)}\n`;
        }
        str += Tools.sprintf(this.localTips.tips6, this.items2string(items));
        return str;
    }
    /**
     * 构造项集族
     * @param startItem 初始项
     * @returns 
     */
    private itemsFamily(startItem: Item): {}[] | undefined {
        let stateSet: Map<string, number> = new Map();//记录项集是否重复的集合
        let state: Item[][] = new Array();//项集族
        let gotoTable = new Array<Map<string, Action>>();//移入规约表
        let result: {}[] | undefined;
        state.push([startItem]);//S0
        this.closure(state[0]);//求S0闭包
        let fatal = false;//分析是否有致命错误,无法继续进行,false表示无致命错误
        L0: for (let i = 0; i < state.length; i++) {//遍历所有项集,处理移入规约操作,暂时不管移入-规约冲突和规约-规约冲突,先报错
            let actionItem = new Map<string, Action>();//当前状态的移入规约项
            let nowState = state[i];
            //提示信息用set，这样一个归约项和多个移入项冲突时，只会
            let SRErrorTips = new Map<string, string>();//当前状态移入-规约错误的符号,key为冲突的符号,value为冲突原因
            let RRErrorTips = new Map<string, string>();//当前态规约-规约错误的符号,key为冲突的符号,value为冲突原因
            let tipMessageInThisState = false;//本状态处理中是否需要提示错误信息
            /**
             * LR(1)的冲突条件比起LR(0)要宽松一点,如:
             * S->U|V
             * U->XaY
             * V->X
             * 在LR(0)中会产生如下状态:
             * U->X.aY
             * V->X.
             * 这样会出现移入-规约冲突,但是在LR(1)分析器下面,这个文法没有冲突
             * 如果文法出现冲突,需要对错误信息进行分析,修改文法
             */
            for (let j = 0; j < nowState.length; j++) {//遍历状态中的每一项,决定应该采取移入还是规约操作
                let SRCMessage = ``;//当前项移入-规约冲突提示语
                let RRCMessage = ``;//当前项规约-规约冲突提示语,S-Shift,R-Reduce,C-conflice
                let nowitem = nowState[j];
                let followSymbol;//当前项可以接收的符号,根据项可移入或者规约而不同
                if (nowitem.dot < this.syntaxs[nowitem.syntax].length) {//点没有在最后一个位置,本次移入
                    followSymbol = this.syntaxs[nowitem.syntax][nowitem.dot];//当前项可以移入,取得点后面的符号
                    //如果之前因为某个项得到了规约或者err动作
                    //归类为移入-规约冲突
                    if (actionItem.has(followSymbol) && (actionItem.get(followSymbol)?.actionType == ActionType.reduce || actionItem.get(followSymbol)?.actionType == ActionType.err)) {
                        let syntaxPad = actionItem.get(followSymbol)?.ReducePad;//得到之前归约产生式的pad,之前在进行规约操作时存入的
                        let symbolPriority = this.TerminalSymbols.get(followSymbol)?.priority;//得到符号的pad(能导致移入规约冲突的followSymbol一定是一个非终结符)
                        if (syntaxPad != undefined && symbolPriority != undefined) {//产生式和符号都定义了优先级和结合性
                            if (syntaxPad.priority > symbolPriority) {
                                //产生式的优先级比符号更大
                                //选择规约
                                //保留原样
                            }
                            else if (syntaxPad.priority == symbolPriority) {//产生式和符号的优先级一样
                                if (syntaxPad.association == 'left') {
                                    //产生式结合性为left
                                    //选择规约
                                    //动作保留原样
                                }
                                else if (syntaxPad.association == 'right') {
                                    //选择移入
                                    //syntaxPad.priority和symbolPriority一样，随便选一个就行
                                    actionItem.set(followSymbol, { actionType: ActionType.shift, target: 0, shiftPriory: syntaxPad.priority });//移入可以使用target:0,后面会自动填充该值
                                }
                                else {
                                    //无结合性的
                                    actionItem.set(followSymbol, { actionType: ActionType.err, target: 0, ReducePad: syntaxPad });//将动作设置为err，优先级和结合性保持和产生式一致
                                }
                            }
                            else {
                                //产生式的优先级比符号小
                                //选择移入
                                actionItem.set(followSymbol, { actionType: ActionType.shift, target: 0, shiftPriory: symbolPriority });//移入可以使用target:0,后面会自动填充该值
                            }
                        }
                        else if (syntaxPad == undefined && symbolPriority != undefined) {//产生式没有pad,符号有,E:E + E < E,如果<没有定义pad,则该产生式也没有pad
                            //选择移入
                            actionItem.set(followSymbol, { actionType: ActionType.shift, target: 0, shiftPriory: symbolPriority });//移入可以使用target:0,后面会自动填充该值
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips18}`;
                        }
                        else if (syntaxPad != undefined && symbolPriority == undefined) {//产生式有pad,符号没有
                            //选择规约
                            //动作保留原样
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips20}`;
                        }
                        else {//产生式和者符号都没有定义pad
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips17}`;
                            fatal = true;//产生式和符号都没有定义优先级,做不下去了,放弃
                        }
                        if (SRCMessage != '') {//如果当前项处理有冲突信息则记录下来
                            SRErrorTips.set(followSymbol, SRCMessage);
                        }
                    }
                    else if (actionItem.has(followSymbol) && actionItem.get(followSymbol)?.actionType == ActionType.shift) {
                        //之前记录的也是移入,不需要任何操作
                    }
                    else {
                        //之前没有过任何操作,这是本状态第一次记录followSymbol的动作为移入
                        actionItem.set(followSymbol, { actionType: ActionType.shift, target: 0, shiftPriory: this.TerminalSymbols.get(followSymbol)?.priority });//移入可以使用target:0,后面会自动填充该值
                    }
                }
                else {//本次规约
                    followSymbol = nowitem.expectation;//如果当前项需要规约,则follwSymbol为产生式预期符号
                    //如果之前因为某个项得到了规约或者err动作
                    //归类为规约-规约冲突
                    if (actionItem.has(followSymbol) && (actionItem.get(followSymbol)?.actionType == ActionType.reduce || actionItem.get(followSymbol)?.actionType == ActionType.err)) {//规约-规约冲突

                        tipMessageInThisState = true;
                        let index_a = actionItem.get(followSymbol)!.target;
                        let index_b = nowitem.syntax;
                        RRCMessage = `${this.localTips.tips16}\n${index_a}: ${this.convertSyntax(this.syntaxs[index_a]).body}\n${index_b}: ${this.convertSyntax(this.syntaxs[index_b]).body}\n\n`;

                        RRErrorTips.set(followSymbol, RRCMessage);

                        let syntaxPad = this.syntaxs[nowitem.syntax].pad;//现在产生式的pad
                        let nowPriority: number;
                        if (syntaxPad == undefined) {
                            nowPriority = -1;//因为定义的优先级最小为0(数组下标),所以这里取-1
                        } else {
                            nowPriority = syntaxPad.priority;
                        }
                        let lastReductPad = actionItem.get(followSymbol)!.ReducePad;//上次规约使用的pad
                        let lastPriority: number;
                        if (lastReductPad == undefined) {
                            lastPriority = -1;
                        } else {
                            lastPriority = lastReductPad.priority;
                        }
                        if (lastPriority < nowPriority) {//选择优先级高的产生式进行规约,如果当前优先级大于之前项对应产生式的优先级则更改ActionItme，否则不需要变更
                            actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: syntaxPad });//指明规约产生式
                        } else if (lastPriority == nowPriority) {//产生式优先级一致
                            if (actionItem.get(followSymbol)!.target > nowitem.syntax) {//选择序号较小的产生式进行规约
                                actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: syntaxPad });//指明规约产生式
                            }
                        }
                    }
                    else if (actionItem.has(followSymbol) && actionItem.get(followSymbol)?.actionType == ActionType.shift) {//移入-规约冲突
                        let syntaxPad = this.syntaxs[nowitem.syntax].pad;//得到当前产生式的pad
                        let symbolPriority = actionItem.get(followSymbol)?.shiftPriory!;//得到符号的pad,因为本符号的上个操作记录是移入,所以直接使用action中记录的信息也能得到符号的pad,为什么不直接取TerminalSymbols中的值,实际上用this.TerminalSymbols.get(followSymbol)是一样的,但是这两行代码是我从上面移入-规约处理中复制下来的,所以就简单的交换了一下取产生式优先级和符号优先级的两行代码
                        if (syntaxPad != undefined && symbolPriority != undefined) {//产生式和符号都定义了优先级和结合性
                            if (syntaxPad.priority > symbolPriority) {
                                //产生式的优先级比符号更大
                                //选择规约
                                actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: syntaxPad });//指明规约产生式
                            }
                            else if (syntaxPad.priority == symbolPriority) {//产生式和符号的优先级一样
                                if (syntaxPad.association == 'left') {
                                    //产生式结合性为left
                                    //选择规约
                                    actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: syntaxPad });//指明规约产生式
                                }
                                else if (syntaxPad.association == 'right') {
                                    //选择移入
                                }
                                else {
                                    //无结合性的
                                    actionItem.set(followSymbol, { actionType: ActionType.err, target: 0, ReducePad: syntaxPad });//将动作设置为err，优先级和结合性保持和产生式一致
                                }
                            }
                            else {
                                //产生式的优先级比符号小
                                //选择移入
                            }
                        }
                        else if (syntaxPad == undefined && symbolPriority != undefined) {//产生式没有pad,符号有,E:E + E < E,如果<没有定义pad,则该产生式也没有pad
                            //选择移入
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips18}`;
                        }
                        else if (syntaxPad != undefined && symbolPriority == undefined) {//产生式有pad,符号没有
                            //选择规约
                            actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: syntaxPad });//指明规约产生式
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips20}`;
                        }
                        else {//产生式和者符号都没有定义pad
                            tipMessageInThisState = true;
                            SRCMessage = `${this.localTips.tips17}`;

                            fatal = true;//产生式和符号都没有定义优先级,做不下去了,放弃
                        }
                        if (SRCMessage != '') {//如果当前项处理有冲突信息则记录下来
                            SRErrorTips.set(followSymbol, SRCMessage);
                        }
                    }
                    else {
                        //之前没有过任何操作,这是本状态第一次记录followSymbol的动作为规约
                        actionItem.set(followSymbol, { actionType: ActionType.reduce, target: nowitem.syntax, ReducePad: this.syntaxs[nowitem.syntax].pad });//指明规约产生式
                    }
                }
            }
            if (tipMessageInThisState) {//当前状态处理中需要提示信息
                console.error(this.localTips.conflict);
                if (SRErrorTips.size != 0) {
                    console.error(this.localTips.ShiftRedueceError);
                    let errTips = ``;
                    for (let err of SRErrorTips) {
                        errTips += `${this.localTips.symbol}:${err[0]}\n`;//分别为key:symbool和val:SRError[]
                        errTips += `${err[1]}\n`;
                    }
                    console.error(errTips);
                }
                if (RRErrorTips.size != 0) {
                    console.error(this.localTips.ReduceRedueceError);
                    let errSymbol = ``;
                    for (let err of RRErrorTips) {
                        errSymbol += `${err[0]}:${err[1]}`;//分别为key和val
                    }
                    console.error(errSymbol);
                }
                console.error(Tools.sprintf(this.localTips.tips7, i));
                console.error(this.sprintfItems(nowState));
            }
            if (fatal) {
                break L0;//停止后续项集的计算
            }
            for (let key of actionItem.keys()) {
                let action = actionItem.get(key)!;
                if (action.actionType == ActionType.shift) {
                    let tmpState = this.goto(nowState, key);
                    let signature = this.items2string(tmpState);
                    let targetState = stateSet.get(signature);
                    if (targetState != undefined) {//如果该项集在族中出现过,使用之前的集合
                        action.target = targetState;
                    } else {//新增项集
                        state.push(tmpState);
                        stateSet.set(signature, state.length - 1);
                        action.target = state.length - 1;
                    }
                }
            }
            gotoTable.push(actionItem);
        }
        //记录那些产生式被使用过了,如果没有被使用过则进行提示,按照yacc的方式提示
        let rules_use = new Array<boolean>(this.syntaxs.length);
        for (let goto_state of gotoTable) {
            for (let [k, v] of goto_state) {
                if (v.actionType == ActionType.reduce) {
                    rules_use[v.target] = true;
                }
            }
        }
        let has_rules_useless_tips = false;//是否已经提示过了
        for (let i = 0; i < rules_use.length; i++) {//检查没有被归约过的产生式
            if (rules_use[i] == undefined) {
                if (!has_rules_useless_tips) {
                    console.error(this.localTips.tips23);
                    has_rules_useless_tips = true;
                }
                console.error(`${this.convertSyntax(this.syntaxs[i]).body}`);
            }
        }
        result = this.convertGotoTable(gotoTable);
        if (this.argument.debug) {
            let syntaxs = new Array<{
                length: number;
                body: string;
            }>();
            for (let syntax of this.syntaxs) {
                syntaxs.push(this.convertSyntax(syntax));
            }
            console.log(this.localTips.tips21);
            console.table(syntaxs);
            console.log(this.localTips.tips22);
            console.table(result);
            let stateStr = ``;
            for (let i = 0; i < state.length; i++) {
                stateStr += Tools.sprintf(this.localTips.tips5, i);
                stateStr += this.sprintfItems(state[i]);
            }
            console.log(stateStr);
        }
        if (!fatal) {
            return result;
        } else {
            return undefined;
        }
    }

    /**
     * 将跳转表转换成对象数组
     * @param talbe 表
     */
    private convertGotoTable(talbe: Map<string, Action>[]): {}[] {
        let arr = new Array();
        for (let i = 0; i < talbe.length; i++) {
            let obj = new Object();
            for (let [k, v] of talbe[i]) {
                let str = ``;
                if (v.actionType == ActionType.shift) {
                    str = `s`;
                    str += v.target;
                } else if (v.actionType == ActionType.reduce) {
                    str = `r`;
                    str += v.target;
                } else {
                    str = `err`;
                }
                Object.defineProperty(obj, k, {
                    enumerable: true,
                    writable: false,
                    configurable: false,
                    value: str
                });
            }
            arr[i] = obj;
        }
        return arr;
    }

    /**
     * 生成一个项,并且如果点后面符号为ε,自动将点后移,如 S->.ε ε A或者S->.ε会自动调整成S-> ε ε .A和S->ε.
     * @param syntax 产生式
     * @param dot 点位置
     * @param expectation 预期符号
     * @returns 
     */
    private generateItem(syntax: number, dot: number, expectation: string): Item {
        for (let i = dot; i < this.syntaxs[syntax].length; i++) {
            if (this.syntaxs[syntax][dot] == `ε`) {//如果点后面的符号为ε,dot后移一位
                dot++;
            }
        }
        let result = {
            syntax: syntax, dot: dot, expectation: expectation
        };
        return result;
    }

    /**
     * 将项格式化成可便于查看的字符串,和item2string功能不同
     * @param item 被打印的项
     */
    private sprintfItem(item: Item) {
        let str = `${this.syntaxs[item.syntax][0]}->`;
        for (let i = 1; i < item.dot; i++) {
            str = `${str}${this.syntaxs[item.syntax][i]} `;
        }
        str += `.`;
        for (let i = item.dot; i < this.syntaxs[item.syntax].length; i++) {
            str = `${str}${this.syntaxs[item.syntax][i]} `;
        }
        str += `,${item.expectation}`;
        return str;
    }

    /**
     * 把产生式转换成对象,方便打印
     * @param syntax 产生式
     * @returns 
     */
    private convertSyntax(syntax: Syntax): { length: number, body: string } {
        let length = syntax.syntaxLength;
        let body = `${syntax[0]}->`;
        for (let i = 1; i < syntax.length; i++) {
            body += ` ${syntax[i]}`;
        }
        return {
            length: length,
            body: body
        };
    }

    /**
     * 把项转换成字符串,因为js的Map和Set使用===比较对象,所以需要将Item类型转换成可以用===对比的类型,这里就用string来处理了
     * @param item 项
     * @returns 字符串
     */
    private item2string(item: Item): string {
        return `${item.syntax}#${item.dot}#${item.expectation}`;
    }

    /**
     * 对项集计算闭包
     * @param items 需要计算闭包的项集
     */
    private closure(items: Item[]) {
        let set = new Set<string>();//用于标记项是否重复
        for (let i = 0; i < items.length; i++) {
            if (set.has(this.item2string(items[i]))) {
                throw Tools.sprintf(this.localTips.tips10, this.item2string(items[i]));
            } else {
                set.add(this.item2string(items[i]))
            }
        }

        //i,j,k三层循环,头都给你转晕
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            if (item.dot < this.syntaxs[item.syntax].length) {//点没有在最后一个位置
                let followSymbol = this.syntaxs[item.syntax][item.dot];//取得点后面的符号
                if (!this.TerminalSymbols.has(followSymbol)) {//点后面符号不是终结符则展开
                    if (this.NTSSyntax.has(followSymbol)) {
                        let syntaxs = this.NTSSyntax.get(followSymbol)!;//得到点后面非终结符所推导的产生式
                        let firstSet = this.first_wrapper([... this.syntaxs[item.syntax].slice(item.dot + 1), item.expectation]);//得到点后移一位之后的first集合
                        for (let j = 0; j < firstSet.length; j++) {
                            for (let k = 0; k < syntaxs.length; k++) {
                                let item_new = this.generateItem(syntaxs[k], 1, firstSet[j]);
                                if (!set.has(this.item2string(item_new))) {//如果项集中没有该项,则添加到项集中
                                    items.push(item_new);
                                    set.add(this.item2string(item_new));
                                }
                            }
                        }
                    } else {
                        throw Tools.sprintf(this.localTips.tips11, followSymbol);
                    }
                }
            }
        }
    }

    /**
     * 计算一个项集接收到某个符号后得到的新闭包
     * S-> . A,$ goto(S,A)=S-> A .,$
     * @param items 已经求过闭包的项集
     * @param symbol 接收的符号
     */
    private goto(items: Item[], symbol: string): Item[] {
        let result = new Array<Item>();
        for (let i = 0; i < items.length; i++) {//遍历项集
            let item = items[i];
            let syntax = item.syntax;
            let dot = item.dot;
            let expectation = item.expectation;
            if (dot < this.syntaxs[syntax].length) {//点后面还有符号
                if (this.syntaxs[syntax][dot] == symbol)//如果点后面的符号和symbol一样,则将其添加到目标项集中
                {
                    let item_new = this.generateItem(syntax, dot + 1, expectation);//理论上来说item_new不可能在result存在过,所以这里就不检测目标项集中是否已经包含item_new了,如果出错,在计算闭包的时候会跑出异常的
                    result.push(item_new);
                }
            }
        }
        this.closure(result);
        return result;
    }

    /**
     * 将项集排序之后再转换为字符串,这样可以保证两个一样的项集不会因为项顺序不一样而被认为不同
     * @param items 项集
     * @returns 转换后的字符串
     */
    private items2string(items: Item[]): string {
        //对项进行排序
        items.sort((a, b) => {
            if (a.syntax == b.syntax) {
                if (a.dot == b.dot) {
                    return a.expectation.localeCompare(b.expectation);
                } else {
                    return a.dot - b.dot;
                }
            }
            else {
                return a.syntax - b.syntax;
            }
        });
        let result = ``;
        for (let i = 0; i < items.length; i++) {
            if (i == 0) {
                result = result + this.item2string(items[i]);
            } else {
                result = result + `@` + this.item2string(items[i]);
            }
        }
        return result;
    }
}
export { Grammar, TSCCParameter };
export default TSCC;
