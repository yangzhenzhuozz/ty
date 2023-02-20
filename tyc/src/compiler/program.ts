export class Program {
    private definedType: {//已经定义了的类型
        [key: string]: TypeDef
    } = {};
    private prop: VariableDescriptor = {};
    private templateProp: VariableDescriptor = {};
    propertySpace: { [namespace: string]: VariableDescriptor } = {};
    extensionMethodsImpl: { [key: string]: { [key: string]: FunctionType } } = {};//扩展方法实现,第一层key是类型名，第二层是方法名
    extensionMethodsDef: { [key: string]: { [key: string]: ExtensionMethod } } = {};//扩展方法定义,第一层key是类型名，第二层是方法名
    templatePropSpace: { [namespace: string]: VariableDescriptor } = {};//模板成员(模板函数),在类型检测阶段会把模板函数移入这里
    tempalteType: {//已经定义了的模板类型,在类型检测阶段会把模板类型移入这里
        [key: string]: TypeDef
    } = {};
    size?: number;
    public getDefinedType(name: string): TypeDef {
        return this.definedType[name];
    }
    public setDefinedType(name: string, defType: TypeDef) {
        this.definedType[name] = defType;;
    }
    public getDefinedTypeNames(): string[] {
        return Object.keys(this.definedType);
    }
    public moveDefinedTypeToTemplateType(name: string) {
        this.tempalteType[name] = this.definedType[name];
        delete this.definedType[name];
    }
    public movePropToTemplateProp(space: string, name: string) {
        this.templatePropSpace[space][name] = this.propertySpace[space][name];
        this.templateProp[`${space}.${name}`] = this.propertySpace[space][name];
        delete this.propertySpace[space][name];
    }
    public getProgramProp(name: string, space?: string): VariableProperties {
        if (this.prop[name] == undefined) {
            name = `${space}.${name}`;//如果默认名字搜索不到，则加上命名空间前缀
        }
        return this.prop[name];
    }
    public setProp(name: string, space: string, prop: VariableProperties) {
        if (this.propertySpace[space] == undefined) {
            this.propertySpace[space] = {};
        }
        this.propertySpace[space][name] = prop;
        this.prop[`${space}.${name}`] = prop;
    }
    public getProgramTemplateProp(name: string, space?: string) {
        if (this.templateProp[name] == undefined) {
            name = `${space}.${name}`;//如果默认名字搜索不到，则加上命名空间前缀
        }
        return this.templateProp[name];
    }
}