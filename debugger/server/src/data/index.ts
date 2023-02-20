import express from 'express';
import fs from 'fs';
import { fileDir } from '../start.js';
let router = express.Router();
router.get('/data/:filename', function (request, response) {
    response.send(fs.readFileSync(`${fileDir}\\${request.params.filename}`).toString());
});
export default router;