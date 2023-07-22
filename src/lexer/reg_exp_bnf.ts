import fs from "fs";
import { Grammar } from "../tscc/tscc.js";
import TSCC from "../tscc/tscc.js";
import { Edge, EdgeTools } from "./edge.js";
import { State, FiniteAutomaton } from "./automaton.js";
let grammar: Grammar = {
    userCode: `
import { Edge, EdgeTools } from "./edge.js";
import { State, FiniteAutomaton } from "./automaton.js";
`,
    accept: ($: any[]) => { return $[0]; },
    tokens: ['(', ')', '[', ']', '*', '.', '-', '|', '^', 'char'],//normal表示没有在前面单独指定的字符
    association: [
        { "nonassoc": ['['] },
        { "nonassoc": ['('] },
        { "left": ['|'] },
        { "left": ['link'] },//link优先级高于union
        { "left": ['*'] },
        { "nonassoc": ['^'] },
        { "nonassoc": ['-'] },
        { "nonassoc": ['.'] },
        { "nonassoc": ['char'] },
    ],
    BNF: [
        {
            "exp:( exp )": {
                action: function ($, s): FiniteAutomaton {
                    return $[1] as FiniteAutomaton;
                }
            }//group
        },
        {
            "exp:exp exp": {
                priority: "link",
                action: function ($, s): FiniteAutomaton {
                    //link
                    let exp1 = $[0] as FiniteAutomaton;
                    let exp2 = $[1] as FiniteAutomaton;
                    let start = exp1.start;
                    let end = exp2.end;
                    let tmpEdge = new Edge(-1, -1, exp2.start);
                    exp1.end.edges.push(tmpEdge);
                    return new FiniteAutomaton(start, end);
                }
            }//link
        },
        {
            "exp:exp | exp": {
                action: function ($, s): FiniteAutomaton {
                    //union
                    let start = new State();
                    let end = new State();
                    let exp1 = $[0] as FiniteAutomaton;
                    let exp2 = $[2] as FiniteAutomaton;
                    let tmpEdge: Edge;
                    tmpEdge = new Edge(-1, -1, exp1.start);
                    start.edges.push(tmpEdge);
                    tmpEdge = new Edge(-1, -1, exp2.start);
                    start.edges.push(tmpEdge);

                    tmpEdge = new Edge(-1, -1, end);
                    exp1.end.edges.push(tmpEdge);
                    tmpEdge = new Edge(-1, -1, end);
                    exp2.end.edges.push(tmpEdge);
                    return new FiniteAutomaton(start, end);
                }
            }//union
        },
        {
            "exp:exp *": {
                //闭包
                action: function ($, s): FiniteAutomaton {
                    //closure
                    let exp = $[0] as FiniteAutomaton;
                    let start = new State();
                    let end = new State();
                    let tmpEdge: Edge;
                    tmpEdge = new Edge(-1, -1, exp.start);
                    start.edges.push(tmpEdge);
                    tmpEdge = new Edge(-1, -1, end);
                    start.edges.push(tmpEdge);
                    tmpEdge = new Edge(-1, -1, end);
                    exp.end.edges.push(tmpEdge);
                    tmpEdge = new Edge(-1, -1, exp.start);
                    exp.end.edges.push(tmpEdge);
                    return new FiniteAutomaton(start, end);
                }
            }//closure
        },
        {
            "exp:element": {
                action: function ($, s): FiniteAutomaton {
                    return $[0] as FiniteAutomaton;
                }
            }
        },
        {
            "element:char": {
                action: function ($, s): FiniteAutomaton {
                    let start = new State();
                    let end = new State();
                    let ch = ($[0] as string).charCodeAt(0);
                    let edge = new Edge(ch, ch, end);
                    start.edges.push(edge);
                    return new FiniteAutomaton(start, end);
                }
            }
        },
        {
            "element:.": {
                action: function ($, s): FiniteAutomaton {
                    let start = new State();
                    let end = new State();
                    let edge = new Edge(0, Number.MAX_SAFE_INTEGER, end);
                    start.edges.push(edge);
                    return new FiniteAutomaton(start, end);
                }
            }
        },
        {
            "element:set": {
                action: function ($, s): FiniteAutomaton {
                    return $[0] as FiniteAutomaton;
                }
            }
        },
        {
            //positive set
            "set:[ set_items ]": {
                action: function ($, s): FiniteAutomaton {
                    //positive set
                    let set = $[1] as FiniteAutomaton[];
                    let start = new State();
                    let end = new State();
                    let ret = new FiniteAutomaton(start, end);
                    for (let nfa of set) {
                        let s_edge = new Edge(-1, -1, nfa.start);
                        start.edges.push(s_edge);

                        let e_edge = new Edge(-1, -1, end);
                        nfa.end.edges.push(e_edge);
                    }
                    return ret;
                }
            }
        },
        {
            //negative set
            "set:[ ^ set_items ]": {
                //有点麻烦,需要把 c-f拆分成两个部分
                action: function ($, s) {
                    //negative set
                    let set = $[2] as FiniteAutomaton[];
                    let start = new State();
                    let end = new State();
                    let ret = new FiniteAutomaton(start, end);
                    let edges: Edge[] = [];
                    for (let nfa of set) {
                        edges.push(nfa.start.edges[0]);//这里可以保证只有一条边
                    }
                    let reverseEdges = EdgeTools.reverse(edges);
                    for (let e of reverseEdges) {
                        e.target.push(end);
                        start.edges.push(e);
                    }
                    return ret;
                }
            }
        },
        {
            "set_items:set_items set_item": {
                action: function ($, s): FiniteAutomaton[] {
                    let A = $[0] as FiniteAutomaton[];
                    let B = $[1] as FiniteAutomaton;
                    return [...A, B];
                }
            }
        },
        {
            "set_items:set_item": {
                action: function ($, s): FiniteAutomaton[] {
                    return [$[0] as FiniteAutomaton];
                }
            }
        },
        {
            "set_item:char": {
                action: function ($, s): FiniteAutomaton {
                    let start = new State();
                    let end = new State();
                    start.edges.push(new Edge(($[0] as string).charCodeAt(0), ($[0] as string).charCodeAt(0), end));
                    return new FiniteAutomaton(start, end);
                }
            }
        },
        {
            "set_item:char - char": {
                action: function ($, s): FiniteAutomaton {
                    let start = new State();
                    let end = new State();
                    start.edges.push(new Edge(($[0] as string).charCodeAt(0), ($[2] as string).charCodeAt(0), end));
                    return new FiniteAutomaton(start, end);
                }
            }
        }
    ]
};
let tscc = new TSCC(grammar, { language: "zh-cn", debug: false });
let str = tscc.generate();//构造编译器代码
fs.writeFileSync('./src/lexer/parser.ts', str!);