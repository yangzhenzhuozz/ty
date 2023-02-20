export function strPadding(str: string, len: number, fill: string) {
    if (str.length > len) {
        return str;
    } else {
        return (new Array(len - str.length).fill(fill)).join('') + str;
    }
}