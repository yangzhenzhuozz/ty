import TSCC from "../tscc/tscc.js";
import { Grammar } from "../tscc/tscc.js";
let grammar: Grammar = {
    tokens: ['private', '%', '<<', '>>', '^', '~', '&', '|', 'extension', 'immediate_string', 'native', 'var', 'val', ';', 'id', 'immediate_val', '+', '-', '++', '--', '(', ')', '?', '{', '}', '[', ']', ',', ':', 'function', 'class', '=>', 'operator', 'new', '.', 'extends', 'if', 'else', 'do', 'while', 'for', 'switch', 'case', 'default', 'valuetype', 'import', 'as', 'break', 'continue', 'this', 'return', 'get', 'set', 'sealed', 'try', 'catch', 'throw', 'super', 'basic_type', 'instanceof', 'autounwinding'],
    association: [
        { 'right': ['='] },
        { 'right': ['?'] },//三目运算
        { 'left': ['||'] },
        { 'left': ['&&'] },
        { 'left': ['|'] },
        { 'left': ['^'] },
        { 'left': ['&'] },
        { 'left': ['==', '!='] },
        { 'nonassoc': ['priority_for_plainType'] },//见"object:object instanceof type"注释的情况三，小于符号<即可
        { 'left': ['>', '<', '<=', '>='] },
        { 'left': ['>>', '<<'] },
        { 'left': ['+', '-'] },
        { 'left': ['*', '/', '%'] },
        { 'left': ['++', '--'] },
        { 'left': ['~'] },
        { 'left': ['!'] },
        { 'right': ['=>'] },
        { 'nonassoc': ['cast_priority'] },//强制转型比"("、"["、"."优先级低,比+ - * /优先级高,如(int)f()表示先执行函数调用再转型 (int) a+b表示先把a转型成int，然后+b
        { 'nonassoc': ['low_priority_for_array_placeholder'] },//见array_placeholder注释,优先级低于'['
        { 'nonassoc': ['low_priority_for_['] },//见type注释,优先级低于'['
        { 'nonassoc': ['instanceof'] },
        { 'nonassoc': ['low_priority_for_if_stmt'] },//这个符号的优先级小于else
        { 'nonassoc': ['else'] },
        { 'nonassoc': ['['] },
        { 'nonassoc': ['('] },
        { 'nonassoc': ['.'] },
    ],
    BNF: [
        { "program:import_stmts program_units": {} },//整个程序由导入语句组和程序单元组构成
        { "import_stmts:": {} },//导入语句组可以为空
        { "import_stmts:import_stmts import_stmt": {} },//导入语句组由一条或者多条导入语句组成
        { "import_stmt:import id ;": {} },//导入语句语法
        { "program_units:": {} },//程序单元组可以为空
        { "program_units:program_units program_unit": {} },//程序单元组由一个或者多个程序单元组成
        { "program_unit:declare ;": {} },//程序单元可以是一条声明语句
        { "program_unit:class_definition": {} },//程序单元可以是一个类定义语句
        { "program_unit:extension_method": {} },//扩展方法
        /**
         * var和val的区别就是一个可修改，一个不可修改,val类似于其他语言的const
         */
        { "declare:var id : type": {} },//声明语句_1，声明一个变量id，其类型为type
        { "declare:initDeclare": {} },//有初始化语句的声明
        { "initDeclare:var id : type = object": {} },//声明语句_2，声明一个变量id，并且将object设置为id的初始值，object的类型要和声明的类型一致
        { "initDeclare:var id = object": {} },//声明语句_3，声明一个变量id，并且将object设置为id的初始值，类型自动推导
        { "initDeclare:val id : type = object": {} },//声明语句_4，声明一个变量id，并且将object设置为id的初始值，object的类型要和声明的类型一致
        { "initDeclare:val id = object": {} },//声明语句_5，声明一个变量id，并且将object设置为id的初始值，类型自动推导
        { "declare:function_definition": {} },//声明语句_6，可以是一个函数定义语句
        { "class_definition:modifier class basic_type template_declare extends_declare { class_units }": {} },//class定义语句由修饰符等组成(太长了我就不一一列举)
        { "extends_declare:": {} },//继承可以为空
        { "extends_declare:extends type": {} },//继承,虽然文法是允许继承任意类型,但是在语义分析的时候再具体决定该class能不能被继承
        { "function_definition:function id template_declare ( parameter_declare ) { statements }": {} },//函数定义语句，同样太长，不列表,返回值类型可以不声明，自动推导,lambda就不用写返回值声明
        { "function_definition:function id template_declare ( parameter_declare ) : type { statements }": {} },//函数定义语句，同样太长，不列表
        { "function_definition:function id template_declare ( parameter_declare ) : type { native }": {} },//函数定义语句，native函数,返回值必须声明
        { "extension_method:extension function id ( this plainType id , parameter_declare ) { statements }": {} },//有参扩展方法
        { "extension_method:extension function id ( this plainType id ) { statements }": {} },//无参扩展方法
        { "extension_method:extension function id ( this plainType id , parameter_declare ) : type { statements }": {} },//有参扩展方法(声明了返回值)
        { "extension_method:extension function id ( this plainType id ) : type { statements }": {} },//无参扩展方法(声明了返回值)
        { "modifier:valuetype": {} },//modifier可以是"valuetype"
        { "modifier:sealed": {} },//modifier可以是"sealed"
        { "modifier:": {} },//modifier可以为空
        { "template_declare:": {} },//模板声明可以为空
        { "template_declare:template_definition": {} },//模板声明可以是一个模板定义
        { "template_definition:< template_definition_list >": {} },//模板定义由一对尖括号<>和内部的template_definition_list组成
        { "template_definition_list:id": {} },//template_definition_list可以是一个id
        { "template_definition_list:template_definition_list , id": {} },//template_definition_list可以是一个template_definition_list后面接上 , id
        /**
         * type后面的'['会导致如下二义性:
         * 所有type都有这种情况，用int作为一个type举例
         * 情况1. new int []
         * 1.1 new (int)[]  
         * 1.2 new (int[])
         * 情况2. function fun():int []
         * 2.1 (function fun():int)[] 是一个函数数组
         * 2.2 function fun():(int[]) 是一个返回数组的函数
         * 上述两种情况我们都希望取第二种语法树，所以type相关的几个产生式优先级都设置为低于'[',凡是遇到符号'['一律移入
         * question: 
         * 输入:"new int[][][3][];"和"new int[][][][]" 是否合法?
         * answer:
         * 不合法,对于输入"new int[][][3][];"来说,也许你会认为这个串会被解析成
         * new (int[][])[3][];
         * 其中int[][]会被解析成type,则这个输入对应了产生式 object:new type [3][]
         * 我们分析一下编译器的格局:
         * new int[][].[3][],此时遇到了符号'[',因为我们规定这个格局应该选择移入而不是规约,所以编译器还在type产生式还没有规约完成
         * new int[][][][],并且把(int[][][][])规约成type,则这个串会被规约成new type，然而new type的时候是必须调用构造函数的,所以输入new int[][][][]也是非法的
         * 合法的输入应该是new int[][][][](),当然这只是符合文法而已,在语义检查的时候我们会进行错误处理,有的type是不允许被new的(说的就是array_type)
         */
        { "type:( type )": {} },//type可以用圆括号包裹
        { "type:plainType": { priority: "priority_for_plainType" } },//简单类型
        { "type:functionType": {} },//函数类型
        { "type:arrayType": {} },//数组类型
        { "plainType:basic_type": { priority: "low_priority_for_[" } },//type可以是一个base_type
        { "plainType:plainType templateSpecialization": { priority: "low_priority_for_[" } },//type可以是一个base_type templateSpecialization
        { "functionType:template_definition ( parameter_declare ) => type": { priority: "low_priority_for_[" } },//泛型函数类型
        { "functionType:( parameter_declare ) => type": { priority: "low_priority_for_[" } },//函数类型
        { "arrayType:type array_type_list": { priority: "low_priority_for_[" } },//数组类型
        { "array_type_list:[ ]": {} },//array_type_list可以是一对方括号
        { "array_type_list:array_type_list [ ]": {} },//array_type_list可以是array_type_list后面再接一对方括号
        { "parameter_declare:parameter_list": {} },//parameter_declare可以由parameter_list组成
        { "parameter_declare:": {} },//parameter_declare可以为空
        { "parameter_list:id : type": {} },//parameter_list可以是一个 id : type
        { "parameter_list:parameter_list , id : type": {} },//parameter_list可以是一个parameter_list接上 , id : type
        { "class_units:class_units class_unit": {} },//class_units可以由多个class_unit组成
        { "class_units:": {} },//class_units可以为空
        { "class_unit:access_modifier declare ;": {} },//class_unit可以是一个声明语句
        { "class_unit:operator_overload": {} },//class_unit可以是一个运算符重载
        { "class_unit:get id ( ) : type { statements } ;": {} },//get
        { "class_unit:set id ( id : type ) { statements } ;": {} },//set
        { "class_unit:basic_type ( parameter_declare )  { statements }": {} },//构造函数
        { "access_modifier:": {} },//访问修饰符可以为空
        { "access_modifier:private": {} },//访问修饰符可以为private
        /**
         * 运算符重载,运算符重载实在是懒得做泛型了,以后要是有需求再讲
         * 不重载赋值运算符，因为get set实现起来略微麻烦(不知道c#是不是也是这种考虑)
         * 比如 a=b=c;
         * 在b=c阶段，用的是 call_b_set
         * 在a=b阶段，用的是 call_b_get
         * 实在是太麻烦了
         */
        { "operator_overload:operator + ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator - ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator * ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator / ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator < ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator <= ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator > ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator >= ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator == ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator || ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator && ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator [ ] ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator % ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator | ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator & ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator >> ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator << ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator ^ ( id : type ) : type { statements } ;": {} },
        { "operator_overload:operator ++ ( ) : type { statements } ;": {} },
        { "operator_overload:operator -- ( ) : type { statements } ;": {} },
        { "operator_overload:operator ! ( ) : type { statements } ;": {} },
        { "operator_overload:operator ~ ( ) : type { statements } ;": {} },
        { "operator_overload:operator + ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator - ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator * ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator / ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator < ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator <= ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator > ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator >= ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator == ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator || ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator && ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator [ ] ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator % ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator | ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator & ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator >> ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator << ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator ^ ( id : type ) : type { native } ;": {} },
        { "operator_overload:operator ++ ( ) : type { native } ;": {} },
        { "operator_overload:operator -- ( ) : type { native } ;": {} },
        { "operator_overload:operator ! ( ) : type { native } ;": {} },
        { "operator_overload:operator ~ ( ) : type { native } ;": {} },
        { "statements:statements statement": {} },//statements可以由多个statement组成
        { "statements:": {} },//statements可以为空
        { "statement:declare ;": {} },//statement可以是一条声明语句
        { "statement:try { statements } catch_list": {} },//try catch语句，允许捕获任意类型的异常
        { "catch_list:catch ( id : type ) { statements }": {} },
        { "catch_list:catch_list catch ( id : type ) { statements }": {} },
        { "statement:throw object ;": {} },//抛异常语句
        { "statement:return object ;": {} },//带返回值的返回语句
        { "statement:return ;": {} },//不带返回值的语句
        { "statement:autounwinding ( declares ) { statements }": {} },//自动回收，类似于c#的using
        { "declares:declare": {} },//配合上面的autounwinding使用
        { "declares:declares ; declare": {} },
        { "statement:if ( object ) statement": { priority: "low_priority_for_if_stmt" } },//if语句
        /**
         * 本规则会导致如下二义性:
         * if(obj)      ---1
         *   if(obj)    ---2
         *      stmt
         *   else
         *      stmt
         * 可以得到如下两种abstract syntax tree
         * if(obj)
         * {
         *      if(obj)
         *      {
         *          stmt
         *      }
         * }
         * else
         * {
         *      stmt
         * }
         * 
         * if(obj)
         * {
         *      if(obj)
         *      {
         *          stmt
         *      }
         *      else
         *      {
         *          stmt
         *      }
         * }
         * 为了和大部分的现有编程语言兼容，采用第二种抽象语法树进行规约
         * 定义两个优先级规则low_priority_for_if_stmt和else,使else的优先级高于low_priority_for_if_stmt,在产生冲突时选择移入
         */
        { "statement:if ( object ) statement else statement": {} },//if else语句
        { "statement:label_def do statement while ( object )": {} },//do-while语句，其实我是想删除while语句的，我觉得for_loop可以完全替代while,一句话,为了看起来没这么怪
        { "statement:label_def while ( object ) statement": {} },//while语句
        { "statement:label_def for ( for_init ; for_condition ; for_step ) statement": {} },//for_loop
        { "statement:block": { action: ($, s) => $[0] } },//代码块
        { "statement:break label_use ;": {} },//break语句
        { "statement:continue label_use ;": {} },//continue语句
        { "statement:switch ( object ) { switch_bodys }": {} },//switch语句,因为switch在C/C++等语言中可以用跳转表处理,gcc在处理switch语句时,如果各个case的值连续,也会生成一个jum_table,这里我就稍微扩展一下switch的用法
        { "statement:call ;": {} },//函数调用可以作为一个语句
        { "statement:assignment ;": {} },//赋值可以作为一个语句
        { "statement:increment ;": {} },//自增可以作为一个语句
        { "statement:decrement ;": {} },//自减作为一个语句
        { "statement:_new ;": {} },//new可以作为一个语句
        { "label_def:": {} },//label_def可以为空
        { "label_def:id :": {} },//label_def为 id : 组成
        { "for_init:": {} },//for_loop的init可以为空
        { "for_init:declare": {} },//init可以是一个声明
        { "for_init:assignment": {} },//也可以是一个赋值语句
        { "for_condition:": {} },//condition可以为空
        { "for_condition:object": {} },//condition可以是一个对象(必须是bool对象)
        { "for_step:": {} },//step可以为空
        { "for_step:object": {} },//step可以是一个对象
        { "block:{ statements }": {} },//代码块是一对花括号中间包裹着statements
        { "label_use:": {} },//在break和continue中被使用
        { "label_use:id": {} },//在break和continue中被使用
        { "switch_bodys:": {} },//switch_bodys可为空
        { "switch_bodys:switch_bodys switch_body": {} },//switch_bodys可以由多个switch_body组成
        { "switch_body:case object : statement": {} },//case 语句
        { "switch_body:default : statement": {} },//default语句
        { "object:call": {} },//函数调用
        { "object:_new": {} },//new对象或者数组
        { "object:( object )": {} },//括号括住的object还是一个object
        { "object:object . id": {} },//取成员
        /**
         * function add<T>(a:T,b:T){return a+b;}
         * var f=a<int>;
         */
        { "object:object templateSpecialization": {} },//模板对象实例化
        /**
        * obj_1 + obj_2  ( obj_3 )  ,中间的+可以换成 - * / < > || 等等双目运算符
        * 会出现如下二义性:
        * 1、 (obj_1 + obj_2)  ( object_3 ) ,先将obj_1和obj_2进行双目运算，然后再使用双目运算符的结果作为函数对象进行函数调用
        * 2、 obj_1 + ( obj_2  ( object_3 ) ) ,先将obj_2作为一个函数对象调用，然后再将obj_1 和函数调用的结果进行双目运算
        * 因为我们希望采取二义性的第二种解释进行语法分析,所以设置了'('优先级高于双目运算符,这些双目运算符是所在产生式的最后一个终结符，直接修改了对应产生式的优先级和结核性
        * 同样的,对于输入"(int)obj_1(obj_2)"有如下二义性:
        * 1. ((int)obj_1) (obj_2)
        * 2. (int) (obj_1(obj_2))
        * 也采用方案2，令函数调用优先级高于强制转型
        */
        { "call:object  ( arguments )": {} },//函数调用
        /**
         * 一系列的双目运算符,二义性如下:
         * a+b*c
         * 1. (a+b)*c
         * 2. a+(b*c)
         * 已经把各个操作符的优先级和结合性定义的和C/C++一致，见association中定义的各个符号优先级和结合性,双目运算符都是左结合,且+ - 优先级低于 * /
         */
        { "assignment:object = object": {} },//赋值运算
        { "increment:object ++": {} },//单目运算符++
        { "decrement:object --": {} },//单目运算符--
        { "object:increment": {} },//自增可以作为一个obj
        { "object:decrement": {} },//自减作为一个obj
        { "object:object + object": {} },
        { "object:object - object": {} },
        { "object:object * object": {} },
        { "object:object / object": {} },
        { "object:object < object": {} },
        { "object:object <= object": {} },
        { "object:object > object": {} },
        { "object:object >= object": {} },
        { "object:object == object": {} },
        { "object:object % object": {} },
        { "object:object || object": {} },
        { "object:object && object": {} },
        { "object:object | object": {} },
        { "object:object & object": {} },
        { "object:object >> object": {} },
        { "object:object << object": {} },
        { "object:object ^ object": {} },
        { "object:~ object": {} },
        { "object:- object": {} },
        { "object:+ object": {} },
        /**
         * instanceof会导致如下冲突:
         * 情况1: ! a instanceof int
         * 1.1 !(a instanceof int)
         * 1.2 (!a) instanceof int
         * 情况2: a+b instanceof int
         * 2.1 a+(b instanceof int)
         * 2.2 (a+b) instanceof int
         * 上述两种情况instanceof的优先级应该低于所有的其他运算符,对于上述情况都选择第二种AST进行规约,所以定义了instanceof的优先级低于所有的其他运算符(除了赋值符号)
         * 情况3: a instanceof set<int>
         * 3.1  (a instanceof set)<int>  这种对应了文法规则 object:object templateSpecialization,因为文法可以把a instanceof set解析成一个object
         * 3.2  a instanceof (set<int>)  这种语法树是我们想要的
         * 对于项 a instanceof set .< int >的移入规约冲突应该采用移入
         * 即对于项集中的两个项 type->plainType .,< 和 templateSpecialization->.< templateSpecialization_list >
         * 令产生式type->plainType的优先级小于符号<即可解决(优先级符号:priority_for_plainType)
         */
        { "object:object instanceof type": {} },
        /**双目运算符结束 */
        /**单目运算符 */
        { "object:! object": {} },//单目运算符-非
        /**单目运算符结束 */
        { "object:object [ object ]": {} },//[]运算符
        /**
         * 三目运算符会导致如下文法二义性
         * 情况1:a+b?c:d
         * 1.1 a+(b?c:d)
         * 1.2 (a+b)?c:d
         * 情况2:a?b:c?d:e
         * 2.1 (a?b:c)?d:e
         * 2.2 a?b:(c?d:e)
         * 根据tscc的解析规则，产生object:object ? object : object 的优先级为未定义，因为优先级取决于产生式的最后一个终结符或者强制指定的符号,该产生式的最后一个终结符':'并没有定义优先级
         * 为了解决上述两种冲突,我们将产生式的优先级符号强制指定为?,并且令?的优先级低于双目运算符,结合性为right,则针对上述两种冲突最终解决方案如下:
         * 1.因为?的优先级低于所有双目运算符所对应的产生式,所以情况1会选择1.2这种语法树进行解析
         * 2.因为?为右结合,所以情况2会选择2.2这种语法树进行解析
         */
        { "object:object ? object : object": { priority: "?" } },//三目运算
        { "object:id": {} },//id是一个对象
        { "object:immediate_val": {} },//立即数是一个object
        { "object:immediate_string": {} },//立即数是一个string
        { "object:immediate_array": {} },//立即数是一个immediate_array
        { "object:super": {} },//super是一个对象
        { "object:this": {} },//this是一个object
        { "object:template_definition ( parameter_declare ) => { statements }": {} },//模板lambda
        { "object:( parameter_declare ) => { statements }": {} },//lambda
        /**
         * 强制转型会出现如下二义性:
         * 情况1 (int)a+b;
         * 1.1 ((int)a)+b;
         * 1.2 (int)(a+b)
         * 情况2 (int)fun(b);
         * 2.1 ((int)fun)(b)
         * 2.2 (int)(fun(b))
         * 情况3 (int)arr[0]
         * 3.1 ((int)arr) [0]
         * 3.2 (int)(arr[0])
         * 参照java优先级,强制转型优先级高于+ - / * ++ 这些运算符，低于() [] .这三个运算符
         * 为其指定优先级为cast_priority
         */
        { "object:( type ) object": { priority: "cast_priority" } },//强制转型

        /**
         * 之所以不用 [1]声明数组，改用 { [1] }来声明一个数组原因如下：
         * immediate_array:[ immediate_array_elements ] 导致的二义性
         * (int)[]
         * 1. (int)[] 声明一个int数组
         * 2. 把零长数组[]转换为int类型
         *
         * 不用{}做立即数组原因如下:
         * statement:{}
         * statement:increment
         * {}++会被翻译成
         * 1:这是一个block
         * 2:对数组做++操作
         * 因为需要向前看一些符号，一直看到++这个符号才能确定是一个block还是对数组做++，LR(1)只向前看一个符号，所以做不了决策
         * 
         * 到这里我根本不知道应该取情况1还是情况2，CFG的特性就是上下文无关，而这里要做出正确的选择就必须查看上下文，所以这种文法暂时被舍弃
         */
        { "immediate_array:{ [ immediate_array_elements ] }": {} },//立即数组
        { "immediate_array_elements:immediate_array_element_list": {} },//立即数组内容可以由多个immediate_array_element组成
        { "immediate_array_elements:": {} },//立即数组内容可以为空
        { "immediate_array_element_list:immediate_array_element_list , object": {} },//列表
        { "immediate_array_element_list:object": {} },//数组元素
        { "_new:new type  ( arguments )": {} },//创建对象
        /**
         * 针对产生式array_init_list:array_inits array_placeholder 会出现如下二义性
         * new int [10][3]可以有如下两种解释:(把array_placeholder规约成ε)
         * 1. (new int[10])[3],先new 一个一维数组,然后取下标为3的元素
         * 2. (new int[10][3]),new 一个二维数组
         * 我当然希望采取第二种语法树,所以需要设置产生式优先级,即在new一个对象的时候,如果后面跟有方括号[,优先选择移入而不是规约,那么只需要把冲突的产生式优先级设置为比'['低即可
         * 设置array_placeholder作为产生式头的两个产生式优先级低于'['
         */
        { "_new:new type array_init_list": {} },//创建数组
        { "array_init_list:array_inits array_placeholder": {} },//new 数组的时候是可以这样写的 new int [2][3][][],其中[2][3]对应了array_inits,后面的[][]对应了array_placeholder(数组占位符)
        { "array_inits:array_inits [ object ]": {} },//见array_init_list一条的解释
        { "array_inits:[ object ]": {} },//见array_init_list一条的解释
        { "array_placeholder:array_placeholder_list": { priority: "low_priority_for_array_placeholder" } },//见array_init_list一条的解释
        { "array_placeholder:": { priority: "low_priority_for_array_placeholder" } },//array_placeholder可以为空
        { "array_placeholder_list:array_placeholder_list [ ]": {} },//见array_init_list一条的解释
        { "array_placeholder_list:[ ]": {} },//见array_init_list一条的解释
        { "templateSpecialization:< templateSpecialization_list >": {} },//模板实例化可以实例化为一个<templateSpecialization_list>
        { "templateSpecialization_list:type": {} },//templateSpecialization_list可以为一个type
        { "templateSpecialization_list:templateSpecialization_list , type": {} },//templateSpecialization_list可以为多个type
        { "arguments:": {} },//实参可以为空
        { "arguments:argument_list": {} },//实参可以是argument_list
        { "argument_list:object": {} },//参数列表可以是一个object
        { "argument_list:argument_list , object": {} },//参数列表可以是多个object
    ]
}
let tscc = new TSCC(grammar, { language: "zh-cn", debug: false });
let str = tscc.generate();//构造编译器代码
if (str != null) {//如果构造成功则生成编编译器代码
    console.log(`成功`);
} else {
    console.log(`失败`);
}