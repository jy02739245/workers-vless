import {
	connect
} from 'cloudflare:sockets';

export default {
	async fetch(req) {
		const myID = '78f2c50b-9062-4f73-823d-f2c15d3e332c';
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


			let remote = null, udpWriter = null, isDNS = false;

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
						} catch { }
					}
				}
			}).pipeTo(new WritableStream({
				async write(data) {
					if (isDNS) return udpWriter?.write(data);
					if (remote) {
						const w = remote.writable.getWriter();
						await w.write(data);
						w.releaseLock();
						return;
					}

					if (data.byteLength < 24) return;

					// myID验证
					const myIDBytes = new Uint8Array(data.slice(1, 17));
					const expectedmyID = myID.replace(/-/g, '');
					for (let i = 0; i < 16; i++) {
						if (myIDBytes[i] !== parseInt(expectedmyID.substr(i * 2, 2), 16)) return;
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
						addr = new TextDecoder().decode(data.slice(pos, pos + len));
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
										const result = new Uint8Array(await resp
											.arrayBuffer());
										ws.send(new Uint8Array([...(sent ? [] :
											header), result
												.length >> 8, result
													.length & 0xff, ...result
										]));
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
					const w = conn.writable.getWriter();
					await w.write(payload);
					w.releaseLock();

					let sent = false;
					conn.readable.pipeTo(new WritableStream({
						write(chunk) {
							if (ws.readyState === 1) {
								ws.send(sent ? chunk : new Uint8Array([...header, ...
									new Uint8Array(chunk)
								]));
								sent = true;
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
	return "d";
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
		const user = new TextEncoder().encode(skJson.user);
		const pass = new TextEncoder().encode(skJson.pass);
		await w.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
		await r.read();
	}
	const domain = new TextEncoder().encode(targetHost);
	await w.write(new Uint8Array([5, 1, 0, 3, domain.length, ...domain, targetPort >> 8,
		targetPort & 0xff
	]));
	await r.read();
	w.releaseLock();
	r.releaseLock();
	return conn;
};
