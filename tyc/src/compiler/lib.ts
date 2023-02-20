//函数签名
export function FunctionSign(functionType: FunctionType): string {
    let types: string[] = [];
    for (let k in functionType._arguments) {
        types.push(TypeUsedSign(functionType._arguments[k].type!));
    }
    return `args:(${types.length > 0 ? types.reduce((p, c) => `${p},${c}`) : ''}) retType:${functionType.retType == undefined ? '' : TypeUsedSign(functionType.retType)}`;
}
//函数签名,使用参数类型和返回值类型
export function FunctionSignWithArgumentAndRetType(argumentsType: TypeUsed[], retType: TypeUsed): string {
    let types: string[] = [];
    for (let type of argumentsType) {
        types.push(TypeUsedSign(type));
    }
    return `args:(${types.length > 0 ? types.reduce((p, c) => `${p},${c}`) : ''}) retType:${TypeUsedSign(retType)}`;
}
//不带返回值的函数签名
export function FunctionSignWithoutRetType(functionType: FunctionType): string {
    let types: string[] = [];
    for (let k in functionType._arguments) {
        types.push(TypeUsedSign(functionType._arguments[k].type!));
    }
    return `args:(${types.length > 0 ? types.reduce((p, c) => `${p},${c}`) : ''})`;
}
//根据调用参数生成一个函数签名
export function FunctionSignWithArgument(ts: TypeUsed[]) {
    let types: string[] = [];
    for (let t of ts) {
        types.push(TypeUsedSign(t));
    }
    return `args:(${types.length > 0 ? types.reduce((p, c) => `${p},${c}`) : ''})`;
}

//类型签名
export function TypeUsedSign(type: TypeUsed): string {
    if (type.PlainType != undefined) {
        let templateSpecializationStr = '';
        if (type.PlainType.templateSpecialization) {
            templateSpecializationStr = '<' + type.PlainType.templateSpecialization.map((type) => TypeUsedSign(type)).reduce((p, c) => `${p},${c}`) + '>';
        }
        return type.PlainType.name + templateSpecializationStr;
    } else if (type.ArrayType != undefined) {
        return `@Array<${TypeUsedSign(type.ArrayType.innerType)}>`;
    } else if (type.ProgramType != undefined) {
        return `@program`;
    }
    else {
        //函数类型
        return `${FunctionSign(type.FunctionType!)}`;
    }
}