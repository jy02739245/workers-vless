import {connect} from 'cloudflare:sockets';

const te = new TextEncoder();
const td = new TextDecoder();
const myID = '78f2c50b-9062-4f73-823d-f2c15d3e332c';
const EXPECTED_MyID_BYTES = new Uint8Array(16);
{
	const myidHex = myID.replace(/-/g, '');
	for (let i = 0; i < 16; i++) {
		EXPECTED_MyID_BYTES[i] = parseInt(myidHex.substring(i * 2, i * 2 + 2), 16);
	}
}

function verifyMyID(data) {
	if (data.byteLength < 17) return false;

	const myidBytes = new Uint8Array(data, 1, 16);

	for (let i = 0; i < 16; i++) {
		if (myidBytes[i] !== EXPECTED_MyID_BYTES[i]) {
			return false;
		}
	}
	return true;
}
export default {
	async fetch(req, env) {

		if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			const u = new URL(req.url);
			let mode = 'd';
			let skJson;
			if (u.pathname.includes('%3F')) {
				const decoded = decodeURIComponent(u.pathname);
				const queryIndex = decoded.indexOf('?');
				if (queryIndex !== -1) {
					u.search = decoded.substring(queryIndex);
					u.pathname = decoded.substring(0, queryIndex);
				}
			}
			let sParam = u.pathname.split('/s=')[1];
			let pParam;
			if (sParam) {
				mode = 's';
				skJson = getSKJson(sParam);
			} else {
				const gParam = u.pathname.split('/g=')[1];
				if (gParam) {
					sParam = gParam;
					skJson = getSKJson(gParam);
					mode = 'g';
				} else {
					pParam = u.pathname.split('/p=')[1];
					if (pParam) {
						mode = 'p';
					}
				}
			}
			const [client, ws] = Object.values(new WebSocketPair());
			ws.accept();


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
			}, { highWaterMark: 65536 }).pipeTo(new WritableStream({
				async write(data) {
					if (isDNS) return udpWriter?.write(data);
					if (remote) {
						const w = remote.writable.getWriter();
						await w.write(data);
						w.releaseLock();
						return;
					}

					if (data.byteLength < 24) return;

					if (!verifyMyID(data)) return;

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
						addr = td.decode(data.slice(pos, pos + len));
						pos += len;
					} else if (type === 3) {
						const ipv6 = [];
						for (let i = 0; i < 8; i++, pos += 2) ipv6.push(view.getUint16(pos)
							.toString(16));
						addr = ipv6.join(':');
					} else return;

					const header = new Uint8Array([data[0], 0]);
					const payload = data.slice(pos);

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

					let sock = null;
					for (const method of getOrder(mode)) {
						try {
							if (method === 'd') {
								sock = connect({
									hostname: addr,
									port
								});
								await sock.opened;
								break;
							} else if (method === 's' && skJson) {
								sock = await sConnect(addr, port, skJson);
								break;
							} else if (method === 'p' && pParam) {
								const [ph, pp = port] = pParam.split(':');
								sock = connect({
									hostname: ph,
									port: +pp || port
								});
								await sock.opened;
								break;
							}
						} catch { }
					}

					if (!sock) return;

					remote = sock;
					const w = sock.writable.getWriter();
					await w.write(payload);
					w.releaseLock();

					const INITIAL_THRESHOLD = 6 * 1024 * 1024;
					let controlThreshold = INITIAL_THRESHOLD;
					let lastCount = 0;

					const reader = sock.readable.getReader();
					let totalBytes = 0;
					let sent = false;
					let writeQueue = Promise.resolve();

					(async () => {
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								if (!value || !value.byteLength) continue;

								totalBytes += value.byteLength;

								writeQueue = writeQueue.then(() => {
									if (ws.readyState === 1) {
										if (!sent) {
											const combined = new Uint8Array(header.length + value.length);
											combined.set(header);
											combined.set(value, header.length);
											ws.send(combined);
											sent = true;
										} else {
											ws.send(value);
										}
									}
								});
								await writeQueue;

								const delta = totalBytes - lastCount;

								if (delta > controlThreshold) {
									controlThreshold = delta;
								} else if (delta > INITIAL_THRESHOLD) {
									await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
									controlThreshold = controlThreshold - 2 * 1024 * 1024;
									if (controlThreshold < INITIAL_THRESHOLD) {
										controlThreshold = INITIAL_THRESHOLD;
									}
								}
								lastCount = totalBytes;
							}
						} catch (_) {
						} finally {
							try { reader.releaseLock(); } catch { }
							if (ws.readyState === 1) ws.close();
						}
					})();

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

const SK_CACHE = new Map();

function getSKJson(path) {

	const cached = SK_CACHE.get(path);
	if (cached) return cached;


    const hasAuth = path.includes('@');
    const [cred, server] = hasAuth ? path.split('@') : [null, path];
    const [user = null, pass = null] = hasAuth ? cred.split(':') : [null, null];
	const [host, port = 443] = server.split(':');
	const result = {
		user,
		pass,
		host,
		port: +port
	};

	SK_CACHE.set(path, result);
	return result;
}

const orderCache = {
	'p': ['d', 'p'],
	's': ['d', 's'],
	'g': ['s'],
	'default': ['d']
};

function getOrder(mode) {
	return orderCache[mode] || orderCache['default'];
}

async function sConnect(targetHost, targetPort, skJson) {
	const sock = connect({
		hostname: skJson.host,
		port: skJson.port
	});
	await sock.opened;
	const w = sock.writable.getWriter();
	const r = sock.readable.getReader();
	await w.write(new Uint8Array([5, 2, 0, 2]));
	const auth = (await r.read()).value;
	if (auth[1] === 2 && skJson.user) {
		const user = te.encode(skJson.user);
		const pass = te.encode(skJson.pass);
		await w.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
		await r.read();
	}
	const domain = te.encode(targetHost);
	await w.write(new Uint8Array([5, 1, 0, 3, domain.length, ...domain, targetPort >> 8,
		targetPort & 0xff
	]));
	await r.read();
	w.releaseLock();
	r.releaseLock();
	return sock;
};
