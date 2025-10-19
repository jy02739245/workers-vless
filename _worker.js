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
        if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
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

            let mode = 'd'; // default mode
            let skJson;
            let sParam = u.searchParams.get('s');
            let pParam;
            if (sParam) {
                mode = 's';
                skJson = getSKJson(sParam);
            } else {
                const gParam = u.searchParams.get('g');
                if (gParam) {
                    sParam = gParam;
                    skJson = getSKJson(gParam);
                    mode = 'g';
                } else {
                    pParam = u.searchParams.get('p');
                    if (pParam) {
                        mode = 'p';
                    }
                }
            }


            let remote = null, remoteWriter = null, udpWriter = null, isDNS = false;

            new ReadableStream({
                start(ctrl) {
                    ws.addEventListener('message', e => ctrl.enqueue(e.data));
                    ws.addEventListener('close', () => {
                        remote?.close();
                        try { remoteWriter?.releaseLock(); } catch {}
                        try { udpWriter?.releaseLock?.(); } catch {}
                        remoteWriter = null;
                        ctrl.close();
                    });
                    ws.addEventListener('error', () => {
                        remote?.close();
                        try { remoteWriter?.releaseLock(); } catch {}
                        try { udpWriter?.releaseLock?.(); } catch {}
                        remoteWriter = null;
                        ctrl.error();
                    });

                    const early = req.headers.get('sec-websocket-protocol');
                    if (early) {
                        try {
                            ctrl.enqueue(Uint8Array.from(atob(early.replace(/-/g, '+').replace(/_/g, '/')),
                                c => c.charCodeAt(0)).buffer);
                        } catch { }
                    }
                }
            }).pipeTo(new WritableStream({
                async write(data) {
                    const u8 = toU8(data);
                    if (isDNS) return udpWriter?.write(u8);
                    if (remoteWriter) {
                        return remoteWriter.write(u8);
                    }

                    if (u8.byteLength < 24) return;

                    // myID验证
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

                    // UDP DNS
                    if (cmd === 2) {
                        if (port !== 53) return;
                        isDNS = true;
                        let sent = false;
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

                        readable.pipeTo(new WritableStream({
                            async write(query) {
                                try {
                                    const resp = await fetch(
                                        'https://1.1.1.1/dns-query', {
                                        method: 'POST',
                                        headers: {
                                            'content-type': 'application/dns-message'
                                        },
                                        body: query
                                    });
                                    if (ws.readyState === 1) {
                                        const result = new Uint8Array(await resp.arrayBuffer());
                                        const totalLen = (sent ? 0 : header.length) + 2 + result.length;
                                        const out = new Uint8Array(totalLen);
                                        let off = 0;
                                        if (!sent) {
                                            out.set(header, 0);
                                            off += header.length;
                                        }
                                        out[off] = (result.length >> 8) & 0xff;
                                        out[off + 1] = result.length & 0xff;
                                        out.set(result, off + 2);
                                        ws.send(out);
                                        sent = true;
                                    }
                                } catch { }
                            }
                        }));
                        udpWriter = writable.getWriter();
                        return udpWriter.write(payload);
                    }

                    // TCP连接
                    let conn = null;
                    for (const method of getOrder(mode)) {
                        try {
                            if (method === 'd') {
                                conn = connect({
                                    hostname: addr,
                                    port
                                });
                                await conn.opened;
                                break;
                            } else if (method === 's' && skJson) {
                                conn = await sConnect(addr, port,skJson);
                                break;
                            } else if (method === 'p' && pParam) {
                                const [ph, pp = port] = pParam.split(':');
                                conn = connect({
                                    hostname: ph,
                                    port: +pp || port
                                });
                                await conn.opened;
                                break;
                            }
                        } catch { }
                    }

                    if (!conn) return;

                    remote = conn;
                    remoteWriter = conn.writable.getWriter();
                    await remoteWriter.write(payload);

                    let sent = false;
                    conn.readable.pipeTo(new WritableStream({
                        write(chunk) {
                            if (ws.readyState === 1) {
                                if (!sent) {
                                    const cu8 = toU8(chunk);
                                    const out = new Uint8Array(header.length + cu8.length);
                                    out.set(header, 0);
                                    out.set(cu8, header.length);
                                    ws.send(out);
                                    sent = true;
                                } else {
                                    ws.send(chunk);
                                }
                            }
                        },
                        close: () => ws.readyState === 1 && ws.close(),
                        abort: () => ws.readyState === 1 && ws.close()
                    })).catch(() => { });
                }
            })).catch(() => { });

            return new Response(null, {
                status: 101,
                webSocket: client
            });
        }

        return new Response("Hello World", { status: 200 });


    }
};

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
