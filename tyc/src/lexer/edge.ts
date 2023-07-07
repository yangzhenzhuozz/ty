import { State } from "./automaton.js";
export class Edge {
    public s: number;
    public e: number;
    public target: State[] = [];
    constructor(s: number, e: number, t?: State) {
        this.s = s;
        this.e = e;
        if (s > e) {
            throw `start must less than end`;
        }
        if (t != undefined) {
            this.target.push(t);
        }
    }
    public clone(reserveTarget = true): Edge {
        let ret = new Edge(this.s, this.e);
        if (reserveTarget) {
            for (let t of this.target) {
                ret.target.push(t);
            }
        }
        return ret;
    }
    public toString() {
        return `[${this.s},${this.e}]->${this.target}`;
    }
}
export class EdgeTools {
    /**
     * 把一个边合并到已经切分且排序好的集合中
     * 用队列性能更好，因为不需要随机访问,不知道js的数组有没有这种特性
     * @param separated 已经切分好的序列
     * @param edges 待添加的序列
     * @returns 
     */
    public static mix(separated: Edge[], edges: Edge[]) {
        if (edges.length == 0) {
            return;
        }
        for (; edges.length != 0;) {
            let edge = edges.shift()!;
            if (separated.length == 0) {
                separated.push(edge);
            }
            else {
                if (this.locationTest(separated[0], edge) == 'left') {
                    //在第一个的左侧，直接在最前面插入
                    separated.unshift(edge);
                } else if (this.locationTest(separated[separated.length - 1], edge) == 'right') {
                    //在最后一个的左侧，直接在最后面插入
                    separated.push(edge);
                } else {
                    for (let i = 0; i < separated.length; i++) {
                        let reference = separated[i];
                        let loc = this.locationTest(reference, edge);
                        if (loc == 'left') {
                            //在当前节点的左侧，可以安全插入
                            separated.splice(i, 0, edge);
                            break;
                        } else if (loc == 'cross') {
                            let crossPruduct = this.mix2Edge(reference, edge);
                            let residueLeft = reference.s > edge.s;//求交之后有剩余左侧
                            let residueRight = reference.e < edge.e;//求交之后有剩余右侧
                            if (!residueLeft && !residueRight) {
                                separated.splice(i, 1, ...crossPruduct);
                            } else if (!residueLeft && residueRight) {
                                separated.splice(i, 1, ...crossPruduct.slice(0, crossPruduct.length - 1));
                                edges.unshift(crossPruduct[crossPruduct.length - 1]);
                            } else if (residueLeft && !residueRight) {
                                separated.splice(i, 1, ...crossPruduct.slice(1, crossPruduct.length));
                                edges.unshift(crossPruduct[0]);
                            } else {
                                separated.splice(i, 1, ...crossPruduct.slice(1, crossPruduct.length - 1));
                                edges.unshift(crossPruduct[0]);
                                edges.unshift(crossPruduct[crossPruduct.length - 1]);
                            }
                            break;
                        } else {
                            //在右侧则不用管，等待下一个节点的判断
                        }
                    }
                }
            }
        }
    }
    //要求a,b必须有交集，否则计算会出错
    private static mix2Edge(a: Edge, b: Edge): Edge[] {
        if (this.locationTest(a, b) != 'cross') {
            throw `a,b区间没有交集`;
        }
        let ret: Edge[];
        let arr = [a, b].sort((a, b) => {
            if (a.s != b.s) {
                return a.s - b.s;
            } else {
                return a.e - b.e;
            }
        });
        a = arr[0];
        b = arr[1];
        let common: Edge;
        let left: Edge;
        let right: Edge;
        if (a.s == b.s) {//这种返回值小于3
            if (a.e == b.e) {//返回值只有一个
                common = a.clone();
                for (let t of b.target) {
                    common.target.push(t);
                }
                ret = [common];
            } else if (a.e < b.e) {
                common = a.clone();
                for (let t of b.target) {
                    common.target.push(t);
                }
                right = new Edge(a.e + 1, b.e);
                for (let t of b.target) {
                    right.target.push(t);
                }
                ret = [common, right];
            } else {// if (a.e > b.e) 
                common = b.clone();
                for (let t of a.target) {
                    common.target.push(t);
                }
                right = new Edge(b.s + 1, a.e);
                for (let t of a.target) {
                    right.target.push(t);
                }
                ret = [common, right];
            }
        } else {
            if (a.e == b.e) {
                left = new Edge(a.s, b.s - 1);
                for (let t of a.target) {
                    left.target.push(t);
                }
                common = b.clone();
                for (let t of a.target) {
                    common.target.push(t);
                }
                ret = [left, common];
            } else if (a.e < b.e) {
                left = new Edge(a.s, b.s - 1);
                for (let t of a.target) {
                    left.target.push(t);
                }
                common = new Edge(b.s, a.e);
                for (let t of a.target) {
                    common.target.push(t);
                }
                for (let t of b.target) {
                    common.target.push(t);
                }
                right = new Edge(a.e + 1, b.e);
                for (let t of b.target) {
                    right.target.push(t);
                }
                ret = [left, common, right];
            } else {// if (a.e > b.e) 
                left = new Edge(a.s, b.s - 1);
                for (let t of a.target) {
                    left.target.push(t);
                }
                common = b.clone();
                for (let t of a.target) {
                    common.target.push(t);
                }
                right = new Edge(b.e + 1, a.e);
                for (let t of a.target) {
                    right.target.push(t);
                }
                ret = [left, common, right];
            }
        }
        return ret;
    }
    //位置判断
    private static locationTest(ref: Edge, test: Edge): 'left' | 'right' | 'cross' {
        if (test.e < ref.s) {
            return 'left';
        } else if (test.s > ref.e) {
            return 'right';
        } else {
            return 'cross';
        }
    }
    /**
     * 这里和数学上的并集略有不同，如果闭区间[1,5] union [6,10] 结果为[1,10],因为这里用的是离散点，都是整数
     * 不保留原来的target
     * @param combined 
     * @param edges 
     */
    public static union(combined: Edge[], edges: Edge[]) {
        if (combined.length != 0) {
            throw `参数错误，combined必须是空集合`;
        }
        for (; edges.length != 0;) {
            let edge = edges.shift()!;
            if (combined.length == 0) {
                combined.push(edge.clone(false));
            } else {
                if (this.locationTest(combined[combined.length - 1], edge) == 'right' && !this.canUnion(combined[combined.length - 1], edge)) {
                    combined.push(edge.clone(false));
                }
                else {
                    for (let i = 0; i < combined.length; i++) {
                        let reference = combined[i];
                        let canUnion = this.canUnion(reference, edge);
                        if (canUnion) {
                            edges.unshift(new Edge(Math.min(reference.s, edge.s), Math.max(reference.e, edge.e)));
                            combined.splice(i, 1);
                            break;
                        } else {
                            let loc = this.locationTest(reference, edge);
                            if (loc == 'left') {
                                //可以插入当前位置
                                combined.splice(i, 0, edge.clone(false));
                                break;
                            } else {
                                //右侧不用管，等待下一个节点的判断
                            }
                        }
                    }
                }
            }
        }
    }
    private static canUnion(a: Edge, b: Edge): boolean {
        let loc = this.locationTest(a, b);
        let canCross = false;
        if (loc == 'left') {
            if (b.e == a.s - 1) {
                canCross = true;
            }
        } else if (loc == 'right') {
            if (b.s == a.e + 1) {
                canCross = true;
            }
        } else {
            canCross = true;
        }
        return canCross;
    }
    /**
     * 不保留原来的target
     * @param a 
     * @param b 
     * @returns 
     */
    public static reverse(edges: Edge[]): Edge[] {
        let ret: Edge[] = [];
        let unionRet: Edge[] = [];
        this.union(unionRet, edges);
        if (unionRet[0].s > 0) {
            ret.push(new Edge(0, unionRet[0].s - 1));
        }

        //寻找每一个空洞
        for (let i = 0; i < unionRet.length - 1; i++) {
            let a = unionRet[i];
            let b = unionRet[i + 1];
            ret.push(new Edge(a.e + 1, b.s - 1));
        }

        if (unionRet[unionRet.length - 1].e < Number.MAX_SAFE_INTEGER) {
            ret.push(new Edge(unionRet[unionRet.length - 1].e + 1, Number.MAX_SAFE_INTEGER));
        }
        return ret;
    }
}