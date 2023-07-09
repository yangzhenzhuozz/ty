import { Edge } from "./edge.js";
import { YYTOKEN } from "./parser.js";

export class State {
    public edges: Edge[] = [];
    public resolver: any[] = [];
    public rule: ((text: YYTOKEN) => any) | undefined;
    public priority = -1;
    constructor() {
    }
}
//NFA和DFA是同一种数据结构
export class FiniteAutomaton {
    public start: State;
    public end: State;

    constructor(s: State, e: State) {
        this.start = s;
        this.end = e;
    }

    /**
     * 改用DFA后可以超级加速(先将就用着吧)
     * @param str 
     * @param start 
     * @returns 
     */
    public test(str: string, start: number): { rule: (arg: YYTOKEN) => any, start: number, end: number } | undefined {
        let nowStateSet: Set<State> = new Set([this.start]);
        this.closure(nowStateSet);
        let idx = start;
        let endStates: {
            rules: {
                r: (arg: YYTOKEN) => any
                priority: number
            }[], idx: number
        } | undefined = undefined;//结束状态列表，用于回退
        for (; idx < str.length; idx++) {
            let ch = str[idx];
            let charCode = ch.charCodeAt(0);
            let nextStates: Set<State> = new Set();
            for (let state of nowStateSet) {
                for (let edge of state.edges) {
                    if (charCode >= edge.s && charCode <= edge.e) {
                        for (let target of edge.target) {
                            nextStates.add(target);
                        }
                    }
                }
            }
            this.closure(nextStates);
            if (nextStates.size == 0) {
                break;
            }
            nowStateSet = nextStates;
            let tmpEnds: {
                rules: {
                    r: (arg: YYTOKEN) => any
                    priority: number
                }[], idx: number
            } = { rules: [], idx: idx + 1 };
            for (let s of nowStateSet) {
                if (s.rule != undefined) {
                    tmpEnds.rules.push({
                        r: s.rule,
                        priority: s.priority
                    });
                }
            }
            if (tmpEnds.rules.length != 0) {
                endStates = tmpEnds;
            }
        }
        if (endStates == undefined) {
            return undefined;
        } else {
            let rule = endStates.rules.sort((a, b) => b.priority - a.priority)[0];
            return { rule: rule.r, start: start, end: endStates.idx };
        }
    }
    public closure(states: Set<State>) {
        for (let state of states) {
            for (let edge of state.edges) {
                if (edge.s == -1) {
                    for (let t of edge.target) {
                        if (!states.has(t)) {
                            states.add(t);
                        }
                    }
                }
            }
        }
    }
    public toDFA(): FiniteAutomaton {
        throw `unimpliment`;
    }
}