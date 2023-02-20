/*
https://262.ecma-international.org/11.0/#sec-ordinary-object-internal-methods-and-internal-slots-ownpropertykeys
根据ES2015的标准，key也是有序的，不用数字做key即可
可以作为数组索引的 key 按照升序排列，例如 1、2、3。
是字符串不是 symbol 的 key，按照创建顺序排列。
symbol 类的 key 按照创建顺序排列。
Reflect.ownKeys({
  [Symbol('07akioni')]: '',
  18: '',
  star: '',
  4: '',
  kirby: '',
})
> ['4', '18', 'star', 'kirby', Symbol(07akioni)]
*/
type opType = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '||' | '&&' | '[]' | '%' | '^' | '&' | '|' | '>>' | '<<';//双目运算符
type opType2 = '++' | '--' | '!' | '~';//单目运算符
interface ExtensionMethod {
    extensionType: TypeUsed;//扩展的类型
    thisName: string;//this指针指向的名字
    extendFunName: string;//被扩展的函数名
    fun: FunctionType;//定义的函数体
}
interface TypeDef {//定义的类型
    modifier?: 'valuetype' | 'sealed';
    size?: number;
    recursiveChecked?: boolean;//是否已经进行了值类型循环包含的检查
    recursiveFlag?: boolean;//递归检查标记
    templates?: string[];//模板列表
    extends?: TypeUsed;//基类,已经不允许继承了，这个字段先留着吧
    property: VariableDescriptor;//属性列表
    _constructor: { [key: string]: FunctionType };//key为函数签名
}
//变量描述符，包含变量的名字、类型以及初始化使用的语法树
type VariableDescriptor = { [key: string]: VariableProperties };
//变量属性
interface VariableProperties {
    variable: 'var' | 'val';
    accessModifier?:'private';//标记private的则为private,否则默认public
    type?: TypeUsed;//需要类型推导的变量可以先不设置Type
    initAST?: ASTNode;//当type为undefined的时候,initAST必须存在,否则无法确定类型
    loadedNodes?: ASTNode[];//记录load本属性的node，在确定本属性为闭包捕获属性后，把这些load节点全部换成load闭包里面的属性
}
interface TypeUsed {
    PlainType?: PlainType;
    FunctionType?: FunctionType;
    ArrayType?: ArrayType;
    ProgramType?: "";//整个program对象
}
interface PlainType {
    name: string;//使用的类型
    templateSpecialization?: TypeUsed[];//特化模板的类型
}
interface ArrayType {
    innerType: TypeUsed;
}
interface FunctionType {
    hasFunctionScan?: boolean;//是否已经进行过函数扫描
    isNative?: boolean;//是否为native函数
    _arguments: VariableDescriptor;
    body?: Block;//函数体,根据有无body判断是函数类型声明还是定义
    retType?: TypeUsed;//返回类型，可选，如果为undefined则需要进行类型推导
    capture: { [key: string]: TypeUsed } = {};//捕获列表
    templates?: string[];//模板列表
    _construct_for_type?: string;//是某个类型的构造函数
}
type NodeDesc = "ASTNode" | "Block";
type Block = {
    desc: NodeDesc;
    body: Array<(ASTNode | Block)>;
};
//一条语句就是一个Noe
interface ASTNode {
    hasTypeInferRecursion?: boolean;//本AST是否已经被递归推导过类型
    desc: 'ASTNode';
    type?: TypeUsed;//表达式的类型

    autounwinding?: { unwinded: number, stmt: Block };//栈自动展开
    pushUnwindHandler?: ASTNode;//压入unwindHandler
    callEXM?: { obj: ASTNode, extendFuntionRealname: string };//调用扩展函数
    getFunctionWrapName?: '',//获取函数包裹类名称
    loadException?: TypeUsed;//读取异常
    loadArgument?: { index: number },//从栈中读取参数
    specializationObj?: { obj: ASTNode, types: TypeUsed[] },//特化模板对象
    def?: VariableDescriptor;
    accessField?: { obj: ASTNode, field: string };
    call?: { functionObj: ASTNode, _arguments: ASTNode[] };
    load?: string;//读取某个变量
    _super?: "";
    _this?: string;//this对象的类型名称
    _program?: "";//访问program对象
    immediate?: { functionValue?: FunctionType; primiviteValue?: string; };//immediate只可以是数字、字符串、函数,对应了 1、"string"、()=>{console.log("aaa")}这几种情况
    immediateArray?: ASTNode[];//立即数组
    trycatch?: { tryBlock: Block, catch_list: { catchVariable: string, catchType: TypeUsed, catchBlock: Block }[] };
    throwStmt?: ASTNode;
    ret?: ASTNode | "";
    ifStmt?: { condition: ASTNode, stmt: Block };
    ifElseStmt?: { condition: ASTNode, stmt1: Block, stmt2: Block };
    do_while?: { condition: ASTNode, stmt: Block, label?: string };
    _while?: { condition: ASTNode, stmt: Block, label?: string };
    _for?: { init?: ASTNode, condition?: ASTNode, step?: ASTNode, stmt: ASTNode | Block, label: string | undefined };
    _break?: { label: string };
    _continue?: { label: string };
    _instanceof?: { obj: ASTNode, type: TypeUsed };
    not?: ASTNode;
    '++'?: ASTNode;
    '--'?: ASTNode;
    'negative'?: ASTNode;//取反
    'positive'?: ASTNode;//取正
    '!'?: ASTNode;
    '~'?: ASTNode;
    ternary?: { condition: ASTNode, obj1: ASTNode, obj2: ASTNode };
    _new?: { type: { PlainType: PlainType; }, _arguments: ASTNode[] };
    _newArray?: { type: { PlainType?: PlainType; FunctionType?: FunctionType; }, initList: ASTNode[], placeholder: number };
    '[]'?: { rightChild: ASTNode, leftChild: ASTNode };
    "="?: { rightChild: ASTNode; leftChild: ASTNode; };//赋值操作的左节点必须是load节点或者accessField节点
    "+"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "-"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "*"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "/"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "<"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "<="?: { rightChild: ASTNode; leftChild: ASTNode; };
    ">"?: { rightChild: ASTNode; leftChild: ASTNode; };
    ">="?: { rightChild: ASTNode; leftChild: ASTNode; };
    "=="?: { rightChild: ASTNode; leftChild: ASTNode; };
    "||"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "&&"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "%"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "^"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "&"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "|"?: { rightChild: ASTNode; leftChild: ASTNode; };
    "<<"?: { rightChild: ASTNode; leftChild: ASTNode; };
    ">>"?: { rightChild: ASTNode; leftChild: ASTNode; };
    //在源码扫描阶段，会生成matchObj,代码检查阶段会生成condition，并删除matchObj
    _switch?: { pattern: ASTNode, defalutStmt?: Block, matchList: { matchObj?: ASTNode, condition?: ASTNode, stmt: Block }[] };//default没有matchObj,其他的一定有



    cast?: { obj: ASTNode, type: TypeUsed };//在阶段二被删除

    castRefToObj?: { obj: ASTNode, type: TypeUsed };//引用对象转换到object
    castObjToRef?: { obj: ASTNode, type: TypeUsed };//object转换到引用对象
    castValueType?: { obj: ASTNode, type: TypeUsed };//值类型转换
    box?: { obj: ASTNode, type: TypeUsed };//装箱
    unbox?: { obj: ASTNode, type: TypeUsed };//拆箱
}