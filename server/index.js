import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.js';
import { Leaderboard } from './leaderboard.js';
import { createPwaBuild, validateWebSocketURL } from '../scripts/build-pwa.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};

export function createServer({port=0,host='127.0.0.1',tls=null,allowedOrigins=[],allowMissingOrigin=true,wsUrl='',peerMode=true,leaderboardPath=null,leaderboardOnError}={}){
  const originSet=new Set(allowedOrigins.map(value=>{
    let url;try{url=new URL(value);}catch{throw new Error('Invalid allowed origin');}
    if(!['http:','https:'].includes(url.protocol)||value!==url.origin)throw new Error('Allowed origin must include only scheme and host (no path or wildcard)');
    return url.origin;
  }));
  wsUrl=validateWebSocketURL(wsUrl);
  let build;
  const leaderboard=new Leaderboard({filePath:leaderboardPath,onError:leaderboardOnError});
  const rooms=new Rooms({leaderboard});
  const handler=async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
    if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.rooms.size}));return;}
    if(pathname==='/api/leaderboard'){
      res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
      const origin=req.headers.origin;
      if(origin){
        const sameOrigin=`${tls?'https':'http'}://${req.headers.host}`;
        if(!(originSet.size?originSet.has(origin):origin===sameOrigin)){res.writeHead(403);res.end();return;}
        res.setHeader('Access-Control-Allow-Origin',origin);
      }
      const body=JSON.stringify(leaderboard.list());
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
      res.end(req.method==='HEAD'?undefined:body);return;
    }
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const body=pathname==='/sw.js'?build?.worker:build?.assets.get(pathname);
    if(!body){res.writeHead(404);res.end('Not found');return;}
    if(pathname==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
    res.writeHead(200,{'Content-Type':pathname==='/'?mime['.html']:mime[path.extname(pathname)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-cache','ETag':`"${build.version}-${pathname}"`});
    res.end(req.method==='HEAD'?undefined:body);
  };
  const server=tls?https.createServer(tls,handler):http.createServer(handler);
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'){socket.destroy();return;}
    // Reverse proxy origins must be configured explicitly. Never trust arbitrary
    // X-Forwarded-* headers for access control; scheme is part of an origin.
    const origin=req.headers.origin;
    if(origin){
      try{
        const parsed=new URL(origin);
        const sameOrigin=`${tls?'https':'http'}://${req.headers.host}`;
        if(origin!==parsed.origin||!['http:','https:'].includes(parsed.protocol)||!(originSet.size?originSet.has(origin):origin===sameOrigin)){socket.destroy();return;}
      }catch{socket.destroy();return;}
    }else if(!allowMissingOrigin){socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',socket=>rooms.attach(socket));
  return {server,rooms,leaderboard,
    get url(){const address=server.address();return address?`${tls?'https':'http'}://${host==='0.0.0.0'?'127.0.0.1':host}:${address.port}`:null;},
    async listen(){build=await createPwaBuild({root,wsUrl,peerMode});return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});},
    async close(){rooms.close();await leaderboard.flush();await new Promise(resolve=>wss.close(()=>resolve()));server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PORT)||3000;
  const keyPath=process.env.TLS_KEY_PATH,certPath=process.env.TLS_CERT_PATH;
  if(Boolean(keyPath)!==Boolean(certPath))throw new Error('TLS_KEY_PATH and TLS_CERT_PATH must both be configured');
  const tls=keyPath?{key:await readFile(keyPath),cert:await readFile(certPath)}:null;
  const app=createServer({port,host:process.env.HOST||'0.0.0.0',tls,
    allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean),
    allowMissingOrigin:process.env.ALLOW_MISSING_ORIGIN==='1',wsUrl:process.env.PUBLIC_WS_URL||'',peerMode:process.env.PUBLIC_PEER_MODE!=='0',
    leaderboardPath:path.resolve(process.env.LEADERBOARD_PATH||path.join(root,'data','leaderboard.json'))});
  app.listen().then(()=>{
    console.log(`开拍 RALLY 已启动：${app.url}`);
    if(!tls)for(const list of Object.values(networkInterfaces()))for(const address of list||[])if(address.family==='IPv4'&&!address.internal)console.log(`同一局域网手机访问：http://${address.address}:${port}（HTTP 可玩，离线缓存需 HTTPS）`);
  }).catch(error=>{console.error(error);process.exit(1);});
  const stop=()=>app.close().then(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
