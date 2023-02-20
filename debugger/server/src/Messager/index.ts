import express from 'express';
import expressWs from 'express-ws';
import fs from 'fs';
import net from 'net';
import { fileDir } from '../start.js';

expressWs(express());
let router = express.Router();
router.ws('/command', function (ws, req) {
    let connected = false;
    let debuggerClient = net.createConnection({
        port: 27015,
        host: '127.0.0.1'
    }, () => {
        console.log("连接服debugger成功");
        connected = true;
    });
    let msgBuf: number[] = [];
    let IsStringMsg = true;//本次发送的指令是否为字符串
    debuggerClient.on("data", (data) => {
        let dataView = new DataView(data.buffer);
        for (let i = 0; i < data.buffer.byteLength; i++) {
            msgBuf.push(dataView.getUint8(i));
        }
        //直到把缓冲区中的所有指令全部送出去才停止
        for (; ;) {
            let cmdLen = (msgBuf[0] & 0xff << 0) | (msgBuf[1] & 0xff << 8) | (msgBuf[2] & 0xff << 16) | (msgBuf[3] & 0xff << 24);
            if (msgBuf.length >= cmdLen + 4) {
                if (IsStringMsg) {
                    let msg = (new TextDecoder()).decode(Uint8Array.from(msgBuf.slice(4, cmdLen + 4)));
                    ws.send(msg);
                    if (msg == 'update calculate stack' ||
                        msg == 'update call stack' ||
                        msg == 'update var stack' ||
                        msg == 'update frame stack' ||
                        msg == 'update unwindhandler stack' ||
                        msg == 'update unwindnum stack'
                    ) {
                        IsStringMsg = false;
                    }
                } else {
                    ws.send(Buffer.from(msgBuf.slice(4, cmdLen + 4)));
                    IsStringMsg = true;
                }
                msgBuf = msgBuf.slice(cmdLen + 4);
            } else {
                break;
            }
        }
    });
    debuggerClient.on('error', (err: any) => {
        if (err.code != 'EISCONN') {
            ws.send(`vm connection error:${err}`);
            connected = false;
        }
    });
    debuggerClient.on('close', (hasError) => {
        ws.send(`vm closed connection,hasError:${hasError}`);
        connected = false;
    })

    ws.on('message', (data) => {
        let msgLen = new Int32Array(1);
        let sendBuffer: Buffer;
        if (connected) {
            if (typeof (data) != 'string') {
                sendBuffer = Buffer.from(data as Buffer | ArrayBuffer);
            } else {
                sendBuffer = Buffer.from((new TextEncoder()).encode(data as unknown as string));
            }
            msgLen[0] = sendBuffer.byteLength;
            debuggerClient.write(Buffer.from(msgLen));
            debuggerClient.write(sendBuffer);
        } else {
            ws.send('vm is closed,send failed');
        }
    });

    let updateEventHandle: NodeJS.Timeout;
    //监视文件变化
    let FSWatcher = fs.watch(fileDir, (eventType, filename) => {
        clearTimeout(updateEventHandle);//取消上次的定时任务，因为定时任务设定为1S，如果两次文件更新间隔小于1S，则上次的文件更新指令将会被取消，最后的一次将会生效
        updateEventHandle = setTimeout(() => {
            ws.send('update_file');
        }, 1000);
    });

    ws.on('close', (code, reason) => {
        debuggerClient.end();
        FSWatcher.close();
    });
});
export default router;