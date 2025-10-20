import {
    connect
} from 'cloudflare:sockets';

// Reuse encoders/decoders to avoid per-request allocations
const te = new TextEncoder();
const td = new TextDecoder();

// Precompute UUID bytes for faster validation
const MY_ID = '78f2c50b-9062-4f73-823d-f2c15d3e332c';
const MY_ID_BYTES = (() => {
    const hex = MY_ID.replace(/-/g, '');
    const arr = new Uint8Array(16);
    for (let i = 0; i < 16; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    return arr;
})();

function toU8(buf) {
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export default {
    async fetch(req) {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return new Response("Hello World", {
                status: 200
            });
        }

        const [client, ws] = Object.values(new WebSocketPair());
        ws.accept();

        const u = new URL(req.url);
        // 修复处理URL编码的查询参数
        if (u.pathname.includes('%3F')) {
            const decoded = decodeURIComponent(u.pathname);
            const queryIndex = decoded.indexOf('?');
            if (queryIndex !== -1) {
                u.search = decoded.substring(queryIndex);
                u.pathname = decoded.substring(0, queryIndex);
            }
        }

        const earlyData = req.headers.get('sec-websocket-protocol');
        const earlyDataU8 = earlyData ?
            Uint8Array.from(atob(earlyData.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) :
            null;

        const state = {
            ws,
            remote: null,
            remoteWriter: null,
            udpWriter: null,
            isDNS: false,
            mode: 'd',
            skJson: null,
            pParam: null,
        };

        const sParam = u.searchParams.get('s');
        if (sParam) {
            state.mode = 's';
            state.skJson = getSKJson(sParam);
        } else {
            const gParam = u.searchParams.get('g');
            if (gParam) {
                state.mode = 'g';
                state.skJson = getSKJson(gParam);
            } else {
                state.pParam = u.searchParams.get('p');
                if (state.pParam) {
                    state.mode = 'p';
                }
            }
        }

        ws.addEventListener('message', e => handleMessage(e.data, state));
        ws.addEventListener('close', () => closeConnections(state));
        ws.addEventListener('error', () => closeConnections(state));

        if (earlyDataU8) {
            handleMessage(earlyDataU8.buffer, state);
        }

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }
};

function closeConnections(state) {
    state.remote?.close();
    try {
        state.remoteWriter?.releaseLock();
    } catch {}
    try {
        state.udpWriter?.releaseLock?.();
    } catch {}
    state.remoteWriter = null;
}

async function handleMessage(data, state) {
    const u8 = toU8(data);
    if (state.isDNS) return state.udpWriter?.write(u8);
    if (state.remoteWriter) {
        return state.remoteWriter.write(u8);
    }

    if (u8.byteLength < 24) return;

    const myIDBytes = u8.subarray(1, 17);
    for (let i = 0; i < 16; i++) {
        if (myIDBytes[i] !== MY_ID_BYTES[i]) return;
    }

    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const optLen = view.getUint8(17);
    const cmd = view.getUint8(18 + optLen);
    if (cmd !== 1 && cmd !== 2) return;

    let pos = 19 + optLen;
    const port = view.getUint16(pos);
    const type = view.getUint8(pos + 2);
    pos += 3;

    let addr = '';
    if (type === 1) {
        addr = `${view.getUint8(pos)}.${view.getUint8(pos + 1)}.${view.getUint8(pos + 2)}.${view.getUint8(pos + 3)}`;
        pos += 4;
    } else if (type === 2) {
        const len = view.getUint8(pos++);
        addr = td.decode(u8.subarray(pos, pos + len));
        pos += len;
    } else if (type === 3) {
        const ipv6 = [];
        for (let i = 0; i < 8; i++, pos += 2) ipv6.push(view.getUint16(pos).toString(16));
        addr = ipv6.join(':');
    } else return;

    const header = new Uint8Array([u8[0], 0]);
    const payload = u8.subarray(pos);

    if (cmd === 2) {
        if (port !== 53) return;
        state.isDNS = true;
        return handleDNSQuery(payload, header, state);
    }

    const conn = await establishConnection(addr, port, state);
    if (!conn) return;

    state.remote = conn;
    state.remoteWriter = conn.writable.getWriter();
    await state.remoteWriter.write(payload);

    pipeRemoteToWS(conn, header, state.ws);
}

async function establishConnection(addr, port, state) {
    for (const method of getOrder(state.mode)) {
        try {
            if (method === 'd') {
                const conn = connect({
                    hostname: addr,
                    port
                });
                await conn.opened;
                return conn;
            } else if (method === 's' && state.skJson) {
                return await sConnect(addr, port, state.skJson);
            } else if (method === 'p' && state.pParam) {
                const [ph, pp = port] = state.pParam.split(':');
                const conn = connect({
                    hostname: ph,
                    port: +pp || port
                });
                await conn.opened;
                return conn;
            }
        } catch {}
    }
    return null;
}

async function pipeRemoteToWS(conn, header, ws) {
    // This is the most compatible version that works with VLESS.
    // It's more performant than a WritableStream but may still hit CPU limits on high-bandwidth streams like 4K video.
    let firstChunk = true;
    const reader = conn.readable.getReader();
    try {
        while (true) {
            const {
                done,
                value
            } = await reader.read();
            if (done) {
                break;
            }
            if (ws.readyState !== 1) {
                break;
            }
            if (firstChunk) {
                const out = new Uint8Array(header.length + value.length);
                out.set(header, 0);
                out.set(value, header.length);
                ws.send(out);
                firstChunk = false;
            } else {
                ws.send(value);
            }
        }
    } catch (e) {
        // Connection closed, etc.
    } finally {
        reader.releaseLock();
        if (ws.readyState === 1) {
            ws.close();
        }
    }
}


async function handleDNSQuery(payload, header, state) {
    const {
        readable,
        writable
    } = new TransformStream({
        transform(chunk, ctrl) {
            const u = toU8(chunk);
            for (let i = 0; i < u.byteLength;) {
                const len = (u[i] << 8) | u[i + 1];
                ctrl.enqueue(u.subarray(i + 2, i + 2 + len));
                i += 2 + len;
            }
        }
    });

    const dnsQueryStream = new WritableStream({
        async write(query) {
            try {
                const resp = await fetch('https://1.1.1.1/dns-query', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/dns-message'
                    },
                    body: query
                });
                if (state.ws.readyState === 1) {
                    const result = new Uint8Array(await resp.arrayBuffer());
                    const out = new Uint8Array(header.length + 2 + result.length);
                    out.set(header, 0);
                    out[header.length] = (result.length >> 8) & 0xff;
                    out[header.length + 1] = result.length & 0xff;
                    out.set(result, header.length + 2);
                    state.ws.send(out);
                }
            } catch {}
        }
    });

    readable.pipeTo(dnsQueryStream).catch(() => {});
    const writer = writable.getWriter();
    writer.write(payload);
    state.udpWriter = writer;
}

function getSKJson(path) {
    return path.includes('@') ? (() => {
        const [cred, server] = path.split('@');
        const [user, pass] = cred.split(':');
        const [host, port = 443] = server.split(':');
        return {
            user,
            pass,
            host,
            port: +port
        };
    })() : null;
}

function getOrder(mode) {
    if (mode === 'p') return ['d', 'p'];
    if (mode === 's') return ['d', 's'];
    if (mode === 'g') return ['s'];
    return ['d'];
};

// SK连接
async function sConnect(targetHost, targetPort,skJson) {
    const conn = connect({
        hostname: skJson.host,
        port: skJson.port
    });
    await conn.opened;
    const w = conn.writable.getWriter();
    const r = conn.readable.getReader();
    await w.write(new Uint8Array([5, 2, 0, 2]));
    const auth = (await r.read()).value;
    if (auth[1] === 2 && skJson.user) {
        const user = te.encode(skJson.user || '');
        const pass = te.encode(skJson.pass || '');
        const authBuf = new Uint8Array(3 + user.length + pass.length);
        authBuf[0] = 1;
        authBuf[1] = user.length;
        authBuf.set(user, 2);
        authBuf[2 + user.length] = pass.length;
        authBuf.set(pass, 3 + user.length);
        await w.write(authBuf);
        await r.read();
    }
    const domain = te.encode(targetHost);
    const req = new Uint8Array(7 + domain.length);
    req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 3; req[4] = domain.length;
    req.set(domain, 5);
    req[5 + domain.length] = (targetPort >> 8) & 0xff;
    req[6 + domain.length] = targetPort & 0xff;
    await w.write(req);
    await r.read();
    w.releaseLock();
    r.releaseLock();
    return conn;
};
