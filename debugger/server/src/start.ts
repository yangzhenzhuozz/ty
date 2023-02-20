import express from 'express';
import expressWs from 'express-ws';
import DataRouter from './data/index.js';
import fileWatcher from './Messager/index.js'
export let fileDir: string = process.argv[2];
let app: expressWs.Application = expressWs(express()).app;

app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Content-Type', 'application/json;charset=utf-8');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    next();
});

app.use(DataRouter);
app.use(fileWatcher);

app.listen(8081, () => {
    console.log(`服务已启动`);
});