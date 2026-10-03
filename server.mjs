import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Set(['index.html','style.css','app.js','engine.js','data.js']);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8'};
const port=Number(process.env.PORT||8793);
createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!files.has(name)){res.writeHead(404);res.end('Not found');return;}const bytes=await readFile(new URL(name,import.meta.url));res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}catch{res.writeHead(500);res.end('Server error');}}).listen(port,'127.0.0.1',()=>console.log(`和風字旅：http://localhost:${port}`));
