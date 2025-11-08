export default {
  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/":
        return getIP(request);
      default:
        return new Response("Not Found", { status: 404 });
    }
  },
};

function getIP(request) {
  const cf = request.cf || {};
  const {
    country = "Unknown",
    asOrganization = "Unknown ISP",
  } = cf;

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "Unknown";

  const getFlag = (countryCode) => {
    if (!countryCode || countryCode.length !== 2) return "🏳️";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt());
    return String.fromCodePoint(...codePoints);
  };

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>IP 信息显示</title>
<style>
body {
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  padding: 40px 20px;
  background: #f8fafc;
  color: #111827;
  display: flex;
  flex-direction: column;
  align-items: center;
}
h2 { margin-bottom: 24px; color: #111827; }
.table-container {
  width: 100%;
  max-width: 1000px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.1);
}
table { width: 100%; border-collapse: collapse; }
thead { background: #e5e7eb; }
th, td { padding: 16px; text-align: left; vertical-align: middle; }
th { font-weight: 600; font-size: 1em; }
td { background: #ffffff; border-bottom: 1px solid #d1d5db; font-size: 0.95em; }
tr:hover td { background: #f3f4f6; transition: 0.3s; }

.source-cell {
  display:flex;
  align-items:center;
  gap:10px;
}
.site-icon {
  width:24px;
  height:24px;
  border-radius:4px;
  object-fit:cover;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.site-label {
  font-weight:500;
  color:#0f172a;
  text-decoration: none;
}
.domain-sub {
  display:block;
  font-size:0.85em;
  color:#6b7280;
}
.footer {
  margin-top: 40px;
  font-size: 0.9em;
  opacity: 0.6;
  color: #6b7280;
}
</style>
</head>
<body>
<h2>IP 信息显示</h2>
<div class="table-container">
<table>
  <thead>
    <tr>
      <th>来源</th>
      <th>IP</th>
      <th>ISP</th>
      <th>国家</th>
    </tr>
  </thead>
  <tbody id="ip-table">
    <tr>
      <td class="source-cell">
        <img class="site-icon" src="https://www.cloudflare.com/favicon.ico" alt="Cloudflare">
        <div>
          <a class="site-label" href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">Cloudflare</a>
          <span class="domain-sub">cloudflare.com</span>
        </div>
      </td>
      <td>${ip}</td>
      <td>${asOrganization}</td>
      <td><span class="flag">${getFlag(country)}</span>${country}</td>
    </tr>

    <tr id="chatgpt-row">
      <td class="source-cell">
        <img class="site-icon" src="https://chatgpt.com/favicon.ico" alt="ChatGPT">
        <div>
          <a class="site-label" href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">ChatGPT</a>
          <span class="domain-sub">chatgpt.com</span>
        </div>
      </td>
      <td id="chatgpt-ip">加载中...</td>
      <td id="chatgpt-isp">-</td>
      <td id="chatgpt-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>

    <tr id="openai-row">
      <td class="source-cell">
        <img class="site-icon" src="https://openai.com/favicon.ico" alt="OpenAI">
        <div>
          <a class="site-label" href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>
          <span class="domain-sub">openai.com</span>
        </div>
      </td>
      <td id="openai-ip">加载中...</td>
      <td id="openai-isp">-</td>
      <td id="openai-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>

    <tr id="ipv4-row">
      <td class="source-cell">
        <img class="site-icon" src="https://ip.sb/favicon.ico" alt="ip.sb">
        <div>
          <a class="site-label" href="https://ip.sb" target="_blank" rel="noopener noreferrer">ip.sb IPv4</a>
          <span class="domain-sub">api-ipv4.ip.sb</span>
        </div>
      </td>
      <td id="ipv4-ip">加载中...</td>
      <td id="ipv4-isp">加载中...</td>
      <td id="ipv4-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>

    <tr id="ipv6-row">
      <td class="source-cell">
        <img class="site-icon" src="https://ip.sb/favicon.ico" alt="ip.sb">
        <div>
          <a class="site-label" href="https://ip.sb" target="_blank" rel="noopener noreferrer">ip.sb IPv6</a>
          <span class="domain-sub">api-ipv6.ip.sb</span>
        </div>
      </td>
      <td id="ipv6-ip">加载中...</td>
      <td id="ipv6-isp">加载中...</td>
      <td id="ipv6-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>

    <tr id="ipapi-row">
      <td class="source-cell">
        <img class="site-icon" src="https://ipapi.is/img/favicon/favicon-32x32.png" alt="ipapi.is">
        <div>
          <a class="site-label" href="https://ipapi.is" target="_blank" rel="noopener noreferrer">ipapi.is</a>
          <span class="domain-sub">ipapi.is</span>
        </div>
      </td>
      <td id="ipapi-ip">加载中...</td>
      <td id="ipapi-isp">加载中...</td>
      <td id="ipapi-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>
  </tbody>
</table>
</div>

<div class="footer"> Cloudflare Worker 🌐</div>

<script>
function getFlag(countryCode) {
  if(!countryCode || countryCode.length!==2) return '🏳️';
  const codePoints = countryCode.toUpperCase().split('').map(c=>127397+c.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

function addRow(id, ip, isp, countryCode, countryName) {
  document.getElementById(id + '-ip').textContent = ip || '-';
  document.getElementById(id + '-isp').textContent = isp || '-';
  document.getElementById(id + '-country').innerHTML =
    '<span class="flag">' + getFlag(countryCode) + '</span>' + (countryName || countryCode || '-');
}

// ChatGPT
async function loadChatGPT() {
  try {
    const res = await fetch('https://chatgpt.com/cdn-cgi/trace');
    const text = await res.text();
    const ip = text.match(/ip=([^\\n]+)/)?.[1] || '-';
    const country = text.match(/loc=([^\\n]+)/)?.[1] || '-';
    addRow('chatgpt', ip, '', country, country);
  } catch {
    addRow('chatgpt', '加载失败', '-', '-', '-');
  }
}

// OpenAI
async function loadOpenAI() {
  try {
    const res = await fetch('https://openai.com/cdn-cgi/trace');
    const text = await res.text();
    const ip = text.match(/ip=([^\\n]+)/)?.[1] || '-';
    const country = text.match(/loc=([^\\n]+)/)?.[1] || '-';
    addRow('openai', ip, '', country, country);
  } catch {
    addRow('openai', '加载失败', '-', '-', '-');
  }
}

// IPv4
async function loadIPSBv4() {
  try {
    const res = await fetch('https://api-ipv4.ip.sb/geoip');
    const data = await res.json();
    addRow('ipv4', data.ip, data.isp, data.country_code, data.country);
  } catch {
    addRow('ipv4', '加载失败', '-', '-', '-');
  }
}

// IPv6
async function loadIPSBv6() {
  try {
    const res = await fetch('https://api-ipv6.ip.sb/geoip');
    const data = await res.json();
    addRow('ipv6', data.ip, data.isp, data.country_code, data.country);
  } catch {
    addRow('ipv6', '加载失败', '-', '-', '-');
  }
}

// IPAPI
async function loadIPAPI() {
  try {
    const res = await fetch('https://api.ipapi.is');
    const data = await res.json();
    const country = data.location?.country || '-';
    addRow('ipapi', data.ip, data.asn?.org, data.location?.country_code, country);
  } catch {
    addRow('ipapi', '加载失败', '-', '-', '-');
  }
}

loadChatGPT();
loadOpenAI();
loadIPSBv4();
loadIPSBv6();
loadIPAPI();
</script>
</body>
</html>
`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
