import {
    connect
} from 'cloudflare:sockets';

export default {
    async fetch(req, env) {
        const UUID = env.UUID || 'ef9d104e-ca0e-4202-ba4b-a0afb969c747';
        const textEncoder = new TextEncoder();
        const textDecoder = new TextDecoder();

        if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
            const [client, ws] = Object.values(new WebSocketPair());
            ws.accept();
            try { ws.binaryType = 'arraybuffer'; } catch {}

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

            const mode = u.searchParams.get('mode') || 'auto';
            const s5Param = u.searchParams.get('s5');
            const proxyParam = u.searchParams.get('proxyip');
            const path = s5Param ? s5Param : u.pathname.slice(1);

            // 解析SOCKS5和ProxyIP
            const socks5 = path.includes('@') ? (() => {
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
            const PROXY_IP = proxyParam ? String(proxyParam) : null;

            // 预计算 UUID 字节以避免每个数据包重复解析
            const uuidHex = UUID.replace(/-/g, '');
            const expectedUUIDBytes = new Uint8Array(16);
            for (let i = 0; i < 16; i++) expectedUUIDBytes[i] = parseInt(uuidHex.substr(i * 2, 2), 16);

            // auto模式参数顺序（按URL参数位置）
            const getOrder = () => {
                if (mode === 'proxy') return ['direct', 'proxy'];
                if (mode !== 'auto') return [mode];
                const order = [];
                const searchStr = u.search.slice(1);
                for (const pair of searchStr.split('&')) {
                    const key = pair.split('=')[0];
                    if (key === 'direct') order.push('direct');
                    else if (key === 's5') order.push('s5');
                    else if (key === 'proxyip') order.push('proxy');
                }
                // 没有参数时默认direct
                return order.length ? order : ['direct'];
            };

            let remote = null,
                remoteWriter = null,
                udpWriter = null,
                isDNS = false;

            // SOCKS5连接
            const socks5Connect = async (targetHost, targetPort) => {
                const sock = connect({
                    hostname: socks5.host,
                    port: socks5.port
                });
                await sock.opened;
                const w = sock.writable.getWriter();
                const r = sock.readable.getReader();
                await w.write(new Uint8Array([5, 2, 0, 2]));
                const auth = (await r.read()).value;
                if (auth[1] === 2 && socks5.user) {
                    const user = textEncoder.encode(socks5.user);
                    const pass = textEncoder.encode(socks5.pass);
                    await w.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
                    await r.read();
                }
                const domain = textEncoder.encode(targetHost);
                await w.write(new Uint8Array([5, 1, 0, 3, domain.length, ...domain, targetPort >> 8,
                    targetPort & 0xff
                ]));
                await r.read();
                w.releaseLock();
                r.releaseLock();
                return sock;
            };

            new ReadableStream({
                start(ctrl) {
                    ws.addEventListener('message', e => ctrl.enqueue(e.data));
                    ws.addEventListener('close', () => {
                        remote?.close();
                        ctrl.close();
                    });
                    ws.addEventListener('error', () => {
                        remote?.close();
                        ctrl.error();
                    });

                    const early = req.headers.get('sec-websocket-protocol');
                    if (early) {
                        try {
                            ctrl.enqueue(Uint8Array.from(atob(early.replace(/-/g, '+').replace(/_/g, '/')),
                                c => c.charCodeAt(0)).buffer);
                        } catch {}
                    }
                }
            }).pipeTo(new WritableStream({
                async write(data) {
                    if (isDNS) return udpWriter?.write(data);
                    if (remote) {
                        if (!remoteWriter) remoteWriter = remote.writable.getWriter();
                        await remoteWriter.write(data);
                        return;
                    }

                    if (data.byteLength < 24) return;

                    // UUID验证
                    const uuidBytes = new Uint8Array(data.slice(1, 17));
                    for (let i = 0; i < 16; i++) {
                        if (uuidBytes[i] !== expectedUUIDBytes[i]) return;
                    }

                    const view = new DataView(data);
                    const optLen = view.getUint8(17);
                    const cmd = view.getUint8(18 + optLen);
                    if (cmd !== 1 && cmd !== 2) return;

                    let pos = 19 + optLen;
                    const port = view.getUint16(pos);
                    const type = view.getUint8(pos + 2);
                    pos += 3;

                    let addr = '';
                    if (type === 1) {
                        addr =
                            `${view.getUint8(pos)}.${view.getUint8(pos + 1)}.${view.getUint8(pos + 2)}.${view.getUint8(pos + 3)}`;
                        pos += 4;
                    } else if (type === 2) {
                        const len = view.getUint8(pos++);
                        addr = textDecoder.decode(data.slice(pos, pos + len));
                        pos += len;
                    } else if (type === 3) {
                        const ipv6 = [];
                        for (let i = 0; i < 8; i++, pos += 2) ipv6.push(view.getUint16(pos)
                            .toString(16));
                        addr = ipv6.join(':');
                    } else return;

                    const header = new Uint8Array([data[0], 0]);
                    const payload = data.slice(pos);

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
                                for (let i = 0; i < chunk.byteLength;) {
                                    const len = new DataView(chunk.slice(i, i + 2))
                                        .getUint16(0);
                                    ctrl.enqueue(chunk.slice(i + 2, i + 2 + len));
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
                                        const respBuf = new Uint8Array((sent ? 0 : header.length) + 2 + result.length);
                                        let o = 0;
                                        if (!sent) { respBuf.set(header, 0); o += header.length; }
                                        respBuf[o++] = (result.length >> 8) & 0xff;
                                        respBuf[o++] = result.length & 0xff;
                                        respBuf.set(result, o);
                                        ws.send(respBuf);
                                        sent = true;
                                    }

                            }
                        }));
                        udpWriter = writable.getWriter();
                        return udpWriter.write(payload);
                    }

                    // TCP连接
                    let sock = null;
                    for (const method of getOrder()) {
                        try {
                            if (method === 'direct') {
                                sock = connect({
                                    hostname: addr,
                                    port
                                });
                                await sock.opened;
                                break;
                            } else if (method === 's5' && socks5) {
                                sock = await socks5Connect(addr, port);
                                break;
                            } else if (method === 'proxy' && PROXY_IP) {
                                const [ph, pp = port] = PROXY_IP.split(':');
                                sock = connect({
                                    hostname: ph,
                                    port: +pp || port
                                });
                                await sock.opened;
                                break;
                            }
                        } catch {}
                    }

                    if (!sock) return;

                    remote = sock;
                    remoteWriter = sock.writable.getWriter();
                    await remoteWriter.write(payload);

                    let sent = false;
                    sock.readable.pipeTo(new WritableStream({
                        write(chunk) {
                            if (ws.readyState === 1) {
                                if (!sent) {
                                    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                                    const combined = new Uint8Array(header.length + u8.byteLength);
                                    combined.set(header, 0);
                                    combined.set(u8, header.length);
                                    ws.send(combined);
                                    sent = true;
                                } else {
                                    ws.send(chunk);
                                }
                            }
                        },
                        close: () => ws.readyState === 1 && ws.close(),
                        abort: () => ws.readyState === 1 && ws.close()
                    })).catch(() => {});

            })).catch(() => {});

            return new Response(null, {
                status: 101,
                webSocket: client
            });
        }

        const url = new URL(req.url);
        url.hostname = 'example.com';
        return fetch(new Request(url, req));
    }
};
