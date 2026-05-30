const CFG = { id: '78f2c50b-9062-4f73-823d-f2c15d3e332c', chunk: 64 * 1024, dnPack: 32 * 1024, dnTail: 512, dnMs: 0, upPack: 16 * 1024, upQMax: 256 * 1024, maxED: 8 * 1024, concur: 1 };
export default { fetch: req => req.headers.get('Upgrade')?.toLowerCase() === 'websocket' ? ws(req) : new Response('Hello world!') };
const hex = c => (c > 64 ? c + 9 : c) & 0xF;
const idB = new Uint8Array(16), dec = new TextDecoder();
for (let i = 0, p = 0, c, h; i < 16; i++) { c = CFG.id.charCodeAt(p++); c === 45 && (c = CFG.id.charCodeAt(p++)); h = hex(c); c = CFG.id.charCodeAt(p++); c === 45 && (c = CFG.id.charCodeAt(p++)); idB[i] = h << 4 | hex(c); }
const [I0, I1, I2, I3, I4, I5, I6, I7, I8, I9, I10, I11, I12, I13, I14, I15] = idB;
const matchID = c => c[1] === I0 && c[2] === I1 && c[3] === I2 && c[4] === I3 && c[5] === I4 && c[6] === I5 && c[7] === I6 && c[8] === I7 && c[9] === I8 && c[10] === I9 && c[11] === I10 && c[12] === I11 && c[13] === I12 && c[14] === I13 && c[15] === I14 && c[16] === I15;
const ipv6 = b => Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':');
const addr = (t, b) => t === 1 ? `${b[0]}.${b[1]}.${b[2]}.${b[3]}` : t === 3 ? dec.decode(b) : `[${ipv6(b)}]`;
const hostAddr = (t, b) => t === 4 ? ipv6(b) : t === 1 ? `${b[0]}.${b[1]}.${b[2]}.${b[3]}` : dec.decode(b);
const parseAddr = (b, o, t) => { const l = t === 3 ? b[o++] : t === 1 ? 4 : t === 4 ? 16 : null; if (l === null) return null; const n = o + l; return n > b.length ? null : { targetAddrBytes: b.subarray(o, n), dataOffset: n }; };
const vlArr = c => { if (c.length < 24 || !matchID(c)) return null; const o = 18 + c[17]; const cmd = c[o]; if (cmd !== 1 && cmd !== 2) return null; const p = (c[o + 1] << 8) | c[o + 2]; let t = c[o + 3]; if (t !== 1) t += 1; const a = parseAddr(c, o + 4, t); return a ? { cmd, addrType: t, ...a, port: p } : null; };
const openWithTimeout = async (s, ms = 5000) => { let t; try { await Promise.race([s.opened, new Promise((_, r) => { t = setTimeout(() => r(new Error('opened timeout')), ms); })]); } finally { clearTimeout(t); } };
const sprout = async (f, h, p) => { const s = f.connect({ hostname: h, port: p }); try { await openWithTimeout(s); return s; } catch (e) { try { s.close(); } catch {} throw e; } };
const raceSprout = (f, h, p) => { if (!f?.connect) return Promise.reject(new Error('connect unavailable')); if (CFG.concur <= 1) return sprout(f, h, p); const ts = Array(CFG.concur).fill().map(() => sprout(f, h, p)); return Promise.any(ts).then(w => { ts.forEach(t => t.then(s => s !== w && s.close(), () => {})); return w; }); };

const splitHostPort = (s, d = 443) => { if (!s) return ['', d]; if (s[0] === '[') { const e = s.indexOf(']'); if (e < 0) return null; if (s[e + 1] === ':') { const p = +s.slice(e + 2); return Number.isInteger(p) && p > 0 && p <= 65535 ? [s.slice(1, e), p] : null; } return [s.slice(1, e), d]; } const i = s.lastIndexOf(':'); if (i > -1 && s.indexOf(':') === i) { const p = +s.slice(i + 1); return Number.isInteger(p) && p > 0 && p <= 65535 ? [s.slice(0, i), p] : null; } return [s, d]; };
const b64UrlToU8 = s => { try { const b64 = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0)); } catch { return null; } };
const orderCache = { 'p': ['d', 'p'], 'default': ['d'] };
const getOrder = mode => orderCache[mode] || orderCache['default'];

const dial = async (f, mode, addrType, targetAddrBytes, port, pParam) => {
  for (const method of getOrder(mode)) {
    try {
      if (method === 'd') return await raceSprout(f, hostAddr(addrType, targetAddrBytes), port);
      if (method === 'p' && pParam) {
        const hp = splitHostPort(pParam, port);
        if (!hp) return null;
        const [ph, pp] = hp;
        return await raceSprout(f, ph, pp);
      }
    } catch {}
  }
  return null;
};

const mkQ = (cap, qCap = cap, itemsMax = Math.max(1, qCap >> 8)) => {
  let q = [], h = 0, qB = 0, buf = null;
  const trim = () => { h > 32 && h * 2 >= q.length && (q = q.slice(h), h = 0); };
  const take = () => { if (h >= q.length) return null; const d = q[h]; q[h++] = undefined; qB -= d.byteLength; trim(); return d; };
  return { get bytes() { return qB; }, get size() { return q.length - h; }, get empty() { return h >= q.length; }, clear() { q = []; h = 0; qB = 0; },
    sow(d) { const n = d?.byteLength || 0; if (!n) return 1; if (qB + n > qCap || q.length - h >= itemsMax) return 0; q.push(d); qB += n; return 1; },
    bundle(d) {
      d ||= take(); if (!d || h >= q.length || d.byteLength >= cap) return [d, 0];
      let n = d.byteLength, e = h; while (e < q.length) { const x = q[e], nn = n + x.byteLength; if (nn > cap) break; n = nn; e++; }
      if (e === h) return [d, 0]; const out = buf ||= new Uint8Array(cap); out.set(d);
      for (let o = d.byteLength; h < e;) { const x = q[h]; q[h++] = undefined; qB -= x.byteLength; out.set(x, o); o += x.byteLength; } trim(); return [out.subarray(0, n), 1]; } }; };

const mkDn = w => {
  const cap = CFG.dnPack, tail = CFG.dnTail, low = Math.max(4096, tail << 3);
  let pb = new Uint8Array(cap), p = 0, tp = 0, mq = 0, gen = 0, qk = 0, qr = 0;
  const reap = () => { tp && clearTimeout(tp); tp = 0; mq = 0; if (!p) return; w.send(pb.subarray(0, p)); pb = new Uint8Array(cap); p = 0; qr = 0; };
  const ripen = () => { if (tp || mq) return; mq = 1; qk = gen; queueMicrotask(() => { mq = 0; if (!p || tp) return; if (cap - p < tail) return reap(); tp = setTimeout(() => { tp = 0; if (!p) return; if (cap - p < tail) return reap(); if (qr < 2 && (gen !== qk || p < low)) { qr++; qk = gen; return ripen(); } reap(); }, Math.max(CFG.dnMs, 1)); }); };
  return {
    send(u) { let o = 0, n = u?.byteLength || 0; if (!n) return; while (o < n) { if (!p && n - o >= cap) { const m = Math.min(cap, n - o); w.send(o || m !== n ? u.subarray(o, o + m) : u); o += m; continue; } const m = Math.min(cap - p, n - o); pb.set(u.subarray(o, o + m), p); p += m; o += m; gen++; if (p === cap || cap - p < tail) reap(); else ripen(); } }, reap }; };

const mill = async (rd, w) => { const r = rd.getReader({ mode: 'byob' }), tx = mkDn(w); let buf = new ArrayBuffer(CFG.chunk);
  try { for (;;) { const { done, value: v } = await r.read(new Uint8Array(buf, 0, CFG.chunk)); if (done) break; if (!v?.byteLength) continue; if (v.byteLength >= (CFG.chunk >> 1)) tx.reap(), w.send(v), buf = new ArrayBuffer(CFG.chunk); else tx.send(v), buf = v.buffer; } tx.reap(); } catch {} finally { try { tx.reap(); } catch {} try { r.releaseLock(); } catch {} } };

const ws = async req => {
  const u = new URL(req.url);
  let mode = 'd', pParam;
  const pathParam = k => { const i = u.pathname.indexOf('/' + k + '='); return i < 0 ? null : u.pathname.slice(i + 3); };
  if (u.pathname.includes('%3F')) {
    const decoded = decodeURIComponent(u.pathname);
    const queryIndex = decoded.indexOf('?');
    if (queryIndex !== -1) {
      u.search = decoded.substring(queryIndex);
      u.pathname = decoded.substring(0, queryIndex);
    }
  }
  pParam = pathParam('p'); if (pParam) mode = 'p';

  const [client, server] = Object.values(new WebSocketPair()); server.accept(); server.binaryType = 'arraybuffer';
  const fetcher = req.fetcher;
  const edStr = req.headers.get('sec-websocket-protocol'); const ed = edStr && edStr.length <= CFG.maxED * 4 / 3 + 4 ? b64UrlToU8(edStr) : null;
  let curW = null, sock = null, closed = false, busy = false, udpWriter = null, isDNS = false, dnsHead = null;
  const uq = mkQ(CFG.upPack, CFG.upQMax, CFG.upQMax >> 8);
  const closeServer = () => { try { server.close(); } catch {} };
  const wither = () => { if (closed) return closeServer(); closed = true; uq.clear(); try { curW?.releaseLock(); } catch {} try { udpWriter?.close().catch(() => {}); } catch {} try { sock?.close(); } catch {} closeServer(); };
  const toU8 = d => d instanceof Uint8Array ? d : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
  const sow = d => { const u = toU8(d), n = u.byteLength; if (!n) return 1; if (uq.sow(u)) return 1; wither(); return 0; };

  const thresh = async () => {
    if (busy || closed) return; busy = true;
    try {
      for (;;) {
        if (closed) break;
        if (isDNS) { const [d] = uq.bundle(); if (!d) break; await udpWriter.write(d); continue; }
        if (!sock) {
          const [d] = uq.bundle(); if (!d) break;
          const r = vlArr(d); if (!r) throw wither();
          const host = addr(r.addrType, r.targetAddrBytes), port = r.port, payload = d.subarray(r.dataOffset);

          if (r.cmd === 2) {
            if (port !== 53) throw wither();
            isDNS = true; dnsHead = new Uint8Array([d[0], 0]); let sent = false;
            let carry = new Uint8Array(0);
            const { readable, writable } = new TransformStream({
              transform(chunk, ctrl) {
                const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                let buf = u8;
                if (carry.byteLength) { buf = new Uint8Array(carry.byteLength + u8.byteLength); buf.set(carry); buf.set(u8, carry.byteLength); carry = new Uint8Array(0); }
                let i = 0;
                while (i + 2 <= buf.byteLength) {
                  const len = (buf[i] << 8) | buf[i + 1];
                  if (i + 2 + len > buf.byteLength) break;
                  ctrl.enqueue(buf.subarray(i + 2, i + 2 + len));
                  i += 2 + len;
                }
                carry = i < buf.byteLength ? buf.subarray(i).slice() : new Uint8Array(0);
              },
              flush() { carry = new Uint8Array(0); }
            });
            readable.pipeTo(new WritableStream({
              async write(query) {
                try {
                  const resp = await fetch('https://1.1.1.1/dns-query', { method: 'POST', headers: { 'content-type': 'application/dns-message' }, body: query });
                  if (closed) return;
                  const result = new Uint8Array(await resp.arrayBuffer());
                  const headLen = sent ? 0 : dnsHead.length;
                  const out = new Uint8Array(headLen + 2 + result.length);
                  if (!sent) { out.set(dnsHead); sent = true; }
                  out[headLen] = result.length >> 8; out[headLen + 1] = result.length & 0xff;
                  out.set(result, headLen + 2);
                  if (!closed && server.readyState === 1) server.send(out);
                } catch {}
              }
            })).catch(() => {});
            udpWriter = writable.getWriter();
            if (payload.byteLength) await udpWriter.write(payload);
            continue;
          }

          server.send(new Uint8Array([d[0], 0]));
          sock = await dial(fetcher, mode, r.addrType, r.targetAddrBytes, port, pParam);
          if (!sock) { console.log('[connect.fail] mode=' + mode + ' addr=' + host + ' port=' + port); throw wither(); }
          curW = sock.writable.getWriter();
          const [first] = uq.bundle(payload); first?.byteLength && await curW.write(first);
          mill(sock.readable, server).finally(() => wither());
          continue;
        }
        const [d] = uq.bundle(); if (!d) break; await curW.write(d);
      }
    } catch { wither(); } finally { busy = false; !uq.empty && !closed && queueMicrotask(thresh); }
  };

  if (ed && sow(ed)) thresh();
  server.addEventListener('message', e => { closed || typeof e.data === 'string' || (sow(e.data) && thresh()); });
  server.addEventListener('close', () => wither());
  server.addEventListener('error', () => wither());
  return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Extensions': '' } });
};
