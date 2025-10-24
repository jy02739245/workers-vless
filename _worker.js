const FIXED_UUID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';// stallTCP.js from https://t.me/Enkelte_notif/784
import { connect } from "cloudflare:sockets";
let 反代IP = '';
let 启用SOCKS5反代 = null;
let 启用SOCKS5全局反代 = false;
let 我的SOCKS5账号 = '';
//////////////////////////////////////////////////////////////////////////stall参数////////////////////////////////////////////////////////////////////////
// 15秒心跳, 8秒无数据认为stall, 连续8次stall重连, 最多重连24次
const KEEPALIVE = 15000, STALL_TIMEOUT = 8000, MAX_STALL = 12, MAX_RECONNECT = 24;
//////////////////////////////////////////////////////////////////////////主要架构////////////////////////////////////////////////////////////////////////
export default {
    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('Hello World!', { status: 200 });
        const url = new URL(request.url);
        我的SOCKS5账号 = url.searchParams.get('s5');
        if(我的SOCKS5账号){
            启用SOCKS5反代 = 's5';
        }
        启用SOCKS5全局反代 = url.searchParams.has('gs5') || 启用SOCKS5全局反代;

        if (启用SOCKS5全局反代) {
            我的SOCKS5账号 = url.searchParams.get('gs5');
        }

        if (url.searchParams.has('ip')) {
            反代IP = url.searchParams.get('ip');
            启用SOCKS5反代 = null;
        }

        const { 0: client, 1: server } = new WebSocketPair();
        server.accept(); handleConnection(server);
        return new Response(null, { status: 101, webSocket: client });
    }
};
function buildUUID(arr, start) {
    return Array.from(arr.slice(start, start + 16)).map(n => n.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}
function isLinkLocalAddress(host) {
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = host.match(ipv4Pattern);
    if (ipv4Match) {
        const octets = ipv4Match.slice(1, 5).map(Number);
        if (octets[0] === 169 && octets[1] === 254) {
            return true;
        }
    }
    const ipv6Pattern = /^\[?fe80:/i;
    if (ipv6Pattern.test(host)) {
        return true;
    }
    return false;
}
function handleConnection(ws) {
    let socket, writer, reader, info;
    let isFirstMsg = true, bytesReceived = 0, stallCount = 0, reconnectCount = 0;
    let lastData = Date.now(); const timers = {}; const dataBuffer = [];
    async function processHandshake(data) {
        const bytes = new Uint8Array(data);
        ws.send(new Uint8Array([bytes[0], 0]));
        if (FIXED_UUID && buildUUID(bytes, 1) !== FIXED_UUID) throw new Error('Auth failed');
        const { host, port, payload } = extractAddress(bytes);
        if (host.includes(atob('c3BlZWQuY2xvdWRmbGFyZS5jb20='))) throw new Error('Access');
        if (isLinkLocalAddress(host)) throw new Error('Link-local address not allowed');
        let sock;
        if (启用SOCKS5全局反代) {
            sock = await socks5Connect(host, port);
        } else {
            try {
                sock = connect({ hostname: host, port });
                await sock.opened;
            } catch {
                if (启用SOCKS5反代 == 's5') {
                    sock = await socks5Connect(host, port);
                } else {
                    const [反代IP地址, 反代IP端口] = await 解析地址端口(反代IP);
                    sock = connect({ hostname: 反代IP地址, port: 反代IP端口 });
                }
            }
        }
        await sock.opened; const w = sock.writable.getWriter();
        if (payload.length) await w.write(payload);
        return { socket: sock, writer: w, reader: sock.readable.getReader(), info: { host, port } };
    }
    async function readLoop() {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (value?.length) {
                    bytesReceived += value.length;
                    lastData = Date.now();
                    stallCount = reconnectCount = 0;
                    if (ws.readyState === 1) {
                        try {
                            await ws.send(value);
                        } catch (e) {
                            dataBuffer.length = 0;
                            break;
                        }
                    }
                }
                if (done) {
                    await reconnect();
                    break;
                }
            }
        } catch (err) {
            if (err.message.includes('reset') || err.message.includes('broken') || err.message.includes('closed')) {
                await reconnect();
            } else {
                cleanup(); ws.close(1006, 'Connection abnormal');
            }
        }
    }
    async function reconnect() {
        if (!info || ws.readyState !== 1 || reconnectCount >= MAX_RECONNECT) {
            cleanup(); 
            if (ws.readyState === 1) {
                ws.close(1000, 'Connection closed');
            }
            return;
        }
        reconnectCount++;
        try {
            cleanupSocket();
            const backoffDelay = Math.min(30 * Math.pow(2, reconnectCount) + Math.random() * 100, 5000);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            
            if (ws.readyState !== 1) {
                return;
            }
            
            const sock = 启用SOCKS5全局反代 
                ? await socks5Connect(info.host, info.port)
                : connect({ hostname: info.host, port: info.port });
            await sock.opened;
            socket = sock;
            writer = sock.writable.getWriter();
            reader = sock.readable.getReader();
            lastData = Date.now(); stallCount = 0;
            readLoop();
        } catch (err) {
            if (ws.readyState === 1 && reconnectCount < MAX_RECONNECT) {
                setTimeout(reconnect, 1000);
            } else {
                cleanup();
            }
        }
    }
    function startTimers() {
        timers.keepalive = setInterval(async () => {
            if (Date.now() - lastData > KEEPALIVE && writer && socket) {
                try {
                    await writer.write(new Uint8Array(0)); 
                    lastData = Date.now();
                } catch (e) {
                    clearInterval(timers.keepalive);
                }
            }
        }, KEEPALIVE / 3);
        timers.health = setInterval(() => {
            if (bytesReceived && Date.now() - lastData > STALL_TIMEOUT && ws.readyState === 1) {
                stallCount++;
                if (stallCount >= MAX_STALL) {
                    reconnect();
                }
            }
        }, STALL_TIMEOUT / 2);
    }
    function cleanupSocket() {
        try {
            writer?.releaseLock();
            reader?.releaseLock();
            socket?.close();
        } catch { }
    }
    function cleanup() {
        Object.values(timers).forEach(clearInterval);
        cleanupSocket();
    }
    ws.addEventListener('message', async evt => {
        try {
            if (isFirstMsg) {
                isFirstMsg = false;
                ({ socket, writer, reader, info } = await processHandshake(evt.data));
                startTimers();
                readLoop();
            } else {
                lastData = Date.now();
                if (socket && writer) {
                    const data = evt.data instanceof ArrayBuffer ? new Uint8Array(evt.data) : evt.data;
                    await writer.write(data);
                } else {
                    const data = evt.data instanceof ArrayBuffer ? new Uint8Array(evt.data) : evt.data;
                    dataBuffer.push(data);
                }
            }
        } catch (err) {
            cleanup();
            if (ws.readyState === 1) {
                ws.close(1006, 'Connection abnormal');
            }
        }
    });
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
}
function extractAddress(bytes) {
    const offset1 = 18 + bytes[17] + 1;
    const port = (bytes[offset1] << 8) | bytes[offset1 + 1];
    const addrType = bytes[offset1 + 2];
    let offset2 = offset1 + 3, host, length;
    switch (addrType) {
        case 1:
            length = 4;
            host = bytes.slice(offset2, offset2 + length).join('.');
            break;
        case 2:
            length = bytes[offset2++];
            host = new TextDecoder().decode(bytes.slice(offset2, offset2 + length));
            break;
        case 3:
            length = 16;
            host = `[${Array.from({ length: 8 }, (_, i) =>
                ((bytes[offset2 + i * 2] << 8) | bytes[offset2 + i * 2 + 1]).toString(16)
            ).join(':')}]`;
            break;
        default: throw new Error('Invalid address type.');
    }
    return { host, port, payload: bytes.slice(offset2 + length) };
}

async function 获取SOCKS5账号(address) {
    const lastAtIndex = address.lastIndexOf("@");
    let [latter, former] = lastAtIndex === -1 ? [address, undefined] : [address.substring(lastAtIndex + 1), address.substring(0, lastAtIndex)];
    let username, password, hostname, port;
    if (former) {
        const formers = former.split(":");
        if (formers.length !== 2) {
            throw new Error('无效的 SOCKS 地址格式：认证部分必须是 "username:password" 的形式');
        }
        [username, password] = formers;
    }
    const latters = latter.split(":");
    if (latters.length > 2 && latter.includes("]:")) {
        port = Number(latter.split("]:")[1].replace(/[^\d]/g, ''));
        hostname = latter.split("]:")[0] + "]";
    } else if (latters.length === 2) {
        port = Number(latters.pop().replace(/[^\d]/g, ''));
        hostname = latters.join(":");
    } else {
        port = 80;
        hostname = latter;
    }

    if (isNaN(port)) {
        throw new Error('无效的 SOCKS 地址格式：端口号必须是数字');
    }
    const regex = /^\[.*\]$/;
    if (hostname.includes(":") && !regex.test(hostname)) {
        throw new Error('无效的 SOCKS 地址格式：IPv6 地址必须用方括号括起来，如 [2001:db8::1]');
    }
    return { username, password, hostname, port };
}
async function 解析地址端口(proxyIP) {
    proxyIP = proxyIP.toLowerCase();
    let 地址 = proxyIP, 端口 = 443;
    if (proxyIP.includes(']:')) {
        const parts = proxyIP.split(']:');
        地址 = parts[0] + ']';
        端口 = parseInt(parts[1], 10) || 端口;
    } else if (proxyIP.includes(':') && !proxyIP.startsWith('[')) {
        const colonIndex = proxyIP.lastIndexOf(':');
        地址 = proxyIP.slice(0, colonIndex);
        端口 = parseInt(proxyIP.slice(colonIndex + 1), 10) || 端口;
    }
    return [地址, 端口];
}

async function socks5Connect(targetHost, targetPort) {
    const parsedSocks5Address = await 获取SOCKS5账号(我的SOCKS5账号);
    const { username, password, hostname, port } = parsedSocks5Address;
    const sock = connect({
        hostname: hostname,
        port: port
    });
    await sock.opened;
    const w = sock.writable.getWriter();
    const r = sock.readable.getReader();
    await w.write(new Uint8Array([5, 2, 0, 2]));
    const auth = (await r.read()).value;
    if (auth[1] === 2 && username) {
        const user = new TextEncoder().encode(username);
        const pass = new TextEncoder().encode(password);
        await w.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
        await r.read();
    }
    const domain = new TextEncoder().encode(targetHost);
    await w.write(new Uint8Array([5, 1, 0, 3, domain.length, ...domain,
        targetPort >> 8, targetPort & 0xff
    ]));
    await r.read();
    w.releaseLock();
    r.releaseLock();
    return sock;
}
