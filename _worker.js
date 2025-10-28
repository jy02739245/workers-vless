import {
  connect
} from 'cloudflare:sockets';

// 常量定义
const DNS_ENDPOINT = 'https://1.1.1.1/dns-query';

// 重用编码器/解码器以避免每次请求都创建新的实例
const te = new TextEncoder();
const td = new TextDecoder();

// 缓存解码后的myID以避免重复计算
const MY_ID_BYTES = (() => {
  const myID = '78f2c50b-9062-4f73-823d-f2c15d3e332c';
  const expectedmyID = myID.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(expectedmyID.substr(i * 2, 2), 16);
  }
  return bytes;
})();

const FLOW_CONTROL_DEFAULT_DELAY = 300;
const FLOW_CONTROL_THRESHOLD = 24 * 1024 * 1024; //最大速度24M
const FLOW_CONTROL_EXTRA_DELAY = 500;
const FLOW_CONTROL_CLEANUP_DELAY = 1000;

// 辅助函数：安全转换为 Uint8Array
function toUint8Array(data) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

// 构建DNS响应 - 预分配缓冲区优化
function buildDnsResponse(header, result, sent) {
  if (sent) {
      const buffer = new Uint8Array(2 + result.length);
      buffer[0] = result.length >> 8;
      buffer[1] = result.length & 0xff;
      buffer.set(result, 2);
      return buffer;
  }
  const buffer = new Uint8Array(header.length + 2 + result.length);
  buffer.set(header);
  buffer[header.length] = result.length >> 8;
  buffer[header.length + 1] = result.length & 0xff;
  buffer.set(result, header.length + 2);
  return buffer;
}

const FLOW_CONTROL_DELAY_STEPS = [
  { size: 1 * 1024 * 1024, delay: 320 },
  { size: 50 * 1024 * 1024, delay: 340 },
  { size: 100 * 1024 * 1024, delay: 360 },
  { size: 200 * 1024 * 1024, delay: 400 }
];


function getFlowControlDelay(totalBytes) {
  for (let i = FLOW_CONTROL_DELAY_STEPS.length - 1; i >= 0; i--) {
      const step = FLOW_CONTROL_DELAY_STEPS[i];
      if (totalBytes >= step.size) {
          return step.delay;
      }
  }
  return FLOW_CONTROL_DEFAULT_DELAY;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const SOCKS5_METHODS = new Uint8Array([5, 2, 0, 2]);
const SOCKS5_REQUEST_PREFIX = new Uint8Array([5, 1, 0, 3]);

export default {
  async fetch(req, env) {
      if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
          const [client, ws] = Object.values(new WebSocketPair());
          ws.accept();
          ws.binaryType = 'arraybuffer';

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

          const releaseRemoteWriter = () => {
              if (remoteWriter) {
                  try {
                      remoteWriter.releaseLock();
                  } catch { }
                  remoteWriter = null;
              }
          };

          const releaseUdpWriter = () => {
              if (udpWriter) {
                  try {
                      udpWriter.releaseLock();
                  } catch { }
                  udpWriter = null;
              }
          };

          const terminateRemote = () => {
              if (remote) {
                  try {
                      remote.close();
                  } catch { }
                  remote = null;
              }
              releaseRemoteWriter();
          };

          new ReadableStream({
              start(ctrl) {
                  ws.addEventListener('message', e => {
                      const { data } = e;
                      if (typeof data === 'string') {
                          ctrl.enqueue(te.encode(data));
                      } else {
                          ctrl.enqueue(data);
                      }
                  });
                  ws.addEventListener('close', () => {
                      terminateRemote();
                      releaseUdpWriter();
                      ctrl.close();
                  });
                  ws.addEventListener('error', () => {
                      terminateRemote();
                      releaseUdpWriter();
                      ctrl.error();
                  });

                  const early = req.headers.get('sec-websocket-protocol');
                  if (early) {
                      try {
                          // 优化Base64解码，使用预定义的编码器
                          const binStr = atob(early.replace(/-/g, '+').replace(/_/g, '/'));
                          const buffer = new ArrayBuffer(binStr.length);
                          const arr = new Uint8Array(buffer);
                          for (let i = 0; i < binStr.length; i++) {
                              arr[i] = binStr.charCodeAt(i);
                          }
                          ctrl.enqueue(buffer);
                      } catch { }
                  }
              }
          }).pipeTo(new WritableStream({
              async write(data) {
                  const chunk = toUint8Array(data);
                  if (!chunk) return;

                  if (isDNS) {
                      if (udpWriter) {
                          try {
                              await udpWriter.write(chunk);
                          } catch {
                              releaseUdpWriter();
                          }
                      }
                      return;
                  }

                  if (remoteWriter) {
                      try {
                          await remoteWriter.write(chunk);
                      } catch {
                          terminateRemote();
                      }
                      return;
                  }

                  if (chunk.length < 24) return;

                  for (let i = 0; i < 16; i++) {
                      if (chunk[1 + i] !== MY_ID_BYTES[i]) return;
                  }

                  const optLen = chunk[17];
                  const cmdIndex = 18 + optLen;
                  if (cmdIndex >= chunk.length) return;

                  const cmd = chunk[cmdIndex];
                  if (cmd !== 1 && cmd !== 2) return;

                  let pos = 19 + optLen;
                  if (pos + 3 > chunk.length) return;

                  const port = (chunk[pos] << 8) | chunk[pos + 1];
                  const type = chunk[pos + 2];
                  pos += 3;

                  let addr = '';
                  if (type === 1) {
                      if (pos + 4 > chunk.length) return;
                      addr = `${chunk[pos]}.${chunk[pos + 1]}.${chunk[pos + 2]}.${chunk[pos + 3]}`;
                      pos += 4;
                  } else if (type === 2) {
                      if (pos >= chunk.length) return;
                      const len = chunk[pos++];
                      if (pos + len > chunk.length) return;
                      addr = td.decode(chunk.subarray(pos, pos + len));
                      pos += len;
                  } else if (type === 3) {
                      if (pos + 16 > chunk.length) return;
                      const ipv6 = new Array(8);
                      for (let i = 0; i < 8; i++, pos += 2) {
                          ipv6[i] = ((chunk[pos] << 8) | chunk[pos + 1]).toString(16);
                      }
                      addr = ipv6.join(':');
                  } else {
                      return;
                  }

                  const header = new Uint8Array([chunk[0], 0]);
                  const payload = chunk.subarray(pos);

                  if (cmd === 2) {
                      if (port !== 53) return;
                      isDNS = true;
                      let sent = false;
                      const { readable, writable } = new TransformStream({
                          transform(chunkData, ctrl) {
                              const chunkView = toUint8Array(chunkData);
                              if (!chunkView || chunkView.length < 2) return;
                              let offset = 0;
                              while (offset + 2 <= chunkView.length) {
                                  const len = (chunkView[offset] << 8) | chunkView[offset + 1];
                                  offset += 2;
                                  if (offset + len > chunkView.length) break;
                                  ctrl.enqueue(chunkView.subarray(offset, offset + len));
                                  offset += len;
                              }
                          }
                      });

                      readable.pipeTo(new WritableStream({
                          async write(query) {
                              try {
                                  const resp = await fetch(DNS_ENDPOINT, {
                                      method: 'POST',
                                      headers: {
                                          'content-type': 'application/dns-message'
                                      },
                                      body: query
                                  });
                                  if (ws.readyState !== 1) return;
                                  const result = toUint8Array(await resp.arrayBuffer());
                                  if (!result) return;
                                  ws.send(buildDnsResponse(header, result, sent));
                                  sent = true;
                              } catch { }
                          }
                      }));
                      udpWriter = writable.getWriter();
                      try {
                          await udpWriter.write(payload);
                      } catch {
                          releaseUdpWriter();
                      }
                      return;
                  }

                  let conn = null;
                  const connectionMethods = getOrder(mode);
                  const connectionPromises = [];
                  for (const method of connectionMethods) {
                      if (method === 'd') {
                          connectionPromises.push(connectDirect(addr, port));
                      } else if (method === 's' && skJson) {
                          connectionPromises.push(sConnect(addr, port, skJson));
                      } else if (method === 'p' && pParam) {
                          const [ph, pp = port] = pParam.split(':');
                          if (ph) {
                              connectionPromises.push(connectDirect(ph, +pp || port));
                          }
                      }
                  }

                  try {
                      if (connectionPromises.length) {
                          conn = await Promise.any(connectionPromises);
                      }
                  } catch {
                      return;
                  }

                  if (!conn) return;

                  remote = conn;
                  try {
                      remoteWriter = conn.writable.getWriter();
                      await remoteWriter.write(payload);
                  } catch {
                      terminateRemote();
                      return;
                  }

                  let sent = false;
                  let totalBytesReceived = 0;
                  let lastDelayCheckpoint = 0;
                  let shouldCloseWS = false;
                  const reader = conn.readable.getReader();

                  (async () => {
                      try {
                          while (true) {
                              const { done, value } = await reader.read();

                              if (done) {
                                  sent = true;
                                  shouldCloseWS = ws.readyState === 1;
                                  break;
                              }

                              const chunkView = toUint8Array(value);
                              if (!chunkView || !chunkView.length) continue;

                              if (ws.readyState !== 1) break;

                              totalBytesReceived += chunkView.length;

                              if (!sent) {
                                  const combined = new Uint8Array(header.length + chunkView.length);
                                  combined.set(header);
                                  combined.set(chunkView, header.length);
                                  ws.send(combined);
                                  sent = true;
                              } else {
                                  ws.send(chunkView);
                              }

                              if ((totalBytesReceived - lastDelayCheckpoint) > FLOW_CONTROL_THRESHOLD) {
                                  const currentDelay = getFlowControlDelay(totalBytesReceived);
                                  await sleep(currentDelay + FLOW_CONTROL_EXTRA_DELAY);
                                  lastDelayCheckpoint = totalBytesReceived;
                              }
                          }
                      } catch (error) {
                          sent = true;
                          shouldCloseWS = ws.readyState === 1;
                      } finally {
                          await sleep(FLOW_CONTROL_CLEANUP_DELAY);
                          if (shouldCloseWS && ws.readyState === 1) {
                              ws.close();
                          }
                          try {
                              reader.releaseLock();
                          } catch {}
                          terminateRemote();
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

// 优化：直接连接函数
async function connectDirect(hostname, port) {
  const conn = connect({ hostname, port });
  await conn.opened;
  return conn;
}

const SK_CACHE = new Map();

function getSKJson(path) {
  if (!path.includes('@')) return null;

  const cached = SK_CACHE.get(path);
  if (cached) return cached;

  const [cred, server] = path.split('@');
  const [user, pass] = cred.split(':');
  const [host, port = 443] = server.split(':');
  const hasUser = typeof user === 'string' && user.length > 0;
  const result = {
      user,
      pass,
      host,
      port: +port,
      userEncoded: hasUser ? te.encode(user) : null,
      passEncoded: hasUser ? te.encode(pass ?? '') : null
  };

  SK_CACHE.set(path, result);
  return result;
}

// 优化getOrder函数 - 使用缓存避免重复创建数组
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
  const conn = connect({
      hostname: skJson.host,
      port: skJson.port
  });
  await conn.opened;
  const w = conn.writable.getWriter();
  const r = conn.readable.getReader();

  try {
      await w.write(SOCKS5_METHODS);
      const authResp = await r.read();
      const auth = toUint8Array(authResp.value);
      if (!auth || auth.length < 2) {
          throw new Error('Invalid SOCKS5 auth response');
      }

      if (auth[1] === 2 && skJson.userEncoded) {
          const passBytes = skJson.passEncoded ?? new Uint8Array(0);
          const authBuffer = new Uint8Array(3 + skJson.userEncoded.length + passBytes.length);
          authBuffer[0] = 1;
          authBuffer[1] = skJson.userEncoded.length;
          authBuffer.set(skJson.userEncoded, 2);
          authBuffer[2 + skJson.userEncoded.length] = passBytes.length;
          authBuffer.set(passBytes, 3 + skJson.userEncoded.length);
          await w.write(authBuffer);
          await r.read();
      }

      const domain = te.encode(targetHost);
      const reqBuffer = new Uint8Array(SOCKS5_REQUEST_PREFIX.length + 1 + domain.length + 2);
      reqBuffer.set(SOCKS5_REQUEST_PREFIX);
      reqBuffer[SOCKS5_REQUEST_PREFIX.length] = domain.length;
      reqBuffer.set(domain, SOCKS5_REQUEST_PREFIX.length + 1);
      reqBuffer[reqBuffer.length - 2] = targetPort >> 8;
      reqBuffer[reqBuffer.length - 1] = targetPort & 0xff;
      await w.write(reqBuffer);
      await r.read();

      return conn;
  } catch (err) {
      try {
          conn.close();
      } catch { }
      throw err;
  } finally {
      w.releaseLock();
      r.releaseLock();
  }
}
