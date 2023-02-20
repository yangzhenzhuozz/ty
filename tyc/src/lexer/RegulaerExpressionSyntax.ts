import fs from "fs";
import TSCC from "../tscc/tscc.js";
import { Grammar } from "../tscc/tscc.js";
import {State,Automaton} from './automaton.js'
let grammar: Grammar = {
    userCode: `import {State,Automaton} from './automaton.js'`,
    accept: ($: any[]) => {
        return $[0];
    },
    tokens: ['(', ')', '*', '|', 'normal_ch'],
    association: [
        { "nonassoc": ['('] },
        { "left": ['|'] },
        { "left": ['link'] },
        { "left": ['*'] },
        { "nonassoc": ['normal_ch'] }
    ],
    BNF: [
        {
            "exp:( exp )": {
                action: function ($, stack) {
                    return $[1];
                }
            }
        },
        {
            "exp:exp | exp": {
                action: function ($, stack) {
                    let s = new State();
                    let e = new State();
                    let exp1: Automaton = $[0];
                    let exp2: Automaton = $[2];
                    s.addEdge("", exp1.start);
                    s.addEdge("", exp2.start);
                    exp1.end.addEdge("", e);
                    exp2.end.addEdge("", e);
                    return new Automaton(s, e);
                }
            }
        },
        {
            "exp:exp exp": {
                action: function ($, stack) {
                    let exp1: Automaton = $[0];
                    let exp2: Automaton = $[1];
                    exp1.end.addEdge("", exp2.start);
                    return new Automaton(exp1.start, exp2.end);
                }, priority: "link"
            }
        },
        {
            "exp:exp *": {
                action: function ($, stack) {
                    let s = new State();
                    let e = new State();
                    let exp1: Automaton = $[0];
                    exp1.end.addEdge("", e);
                    exp1.end.addEdge("", exp1.start);
                    s.addEdge("", exp1.start);
                    s.addEdge("", e);
                    return new Automaton(s, e);
                }
            }
        },
        {
            "exp:normal_ch": {
                action: function ($, stack) {
                    let ch = $[0];
                    let s = new State();
                    let e = new State();
                    s.addEdge(ch, e);
                    return new Automaton(s, e);
                }
            }
        }
    ]
};
let tscc = new TSCC(grammar, { language: "zh-cn", debug: false });
let str = tscc.generate();//构造编译器代码
if (str != null) {//如果构造成功,往代码中添加调用代码
    fs.writeFileSync('./src/lexer/parser.ts', str);//输出typescript源码,然后用node运行即可
}
