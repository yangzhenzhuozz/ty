import fs from 'fs';
import path from 'path'
/**
 * 用于监视"./src/compiler/lib"中的文件变化，自动拷贝到"./dist/compiler/lib"中
 * 在调试的时候有用
 */
let src = './src/compiler/lib';
let dest = './dist/compiler/lib';
console.log(`开始监听:${src}`);
let changedFile = new Set<string>();//在windows上面会重复触发(一次保存文件的动作可能需要多次调用文件操作API)
fs.watch('./src/compiler/lib',
    (eventType, fileName) => {
        if (fileName && eventType === "change") {
            if (!changedFile.has(fileName)) {
                changedFile.add(fileName);
                setTimeout(() => {
                    let srcFile = path.join(src, fileName);
                    let destFile = path.join(dest, fileName);
                    fs.copyFileSync(srcFile, destFile);
                    console.log(`复制文件:${srcFile} -> ${destFile}`);
                    changedFile.delete(fileName);
                }, 500);
            }
        }
    }
);