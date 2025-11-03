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
      region = "Unknown",
      city = "Unknown",
      asOrganization = "Unknown ISP",
      colo,
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
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
h2 {
  margin-bottom: 24px;
  color: #111827;
}
.table-container {
  width: 100%;
  max-width: 1000px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.1);
}
table {
  width: 100%;
  border-collapse: collapse;
}
thead {
  background: #e5e7eb;
}
th, td {
  padding: 16px;
  text-align: left;
}
th {
  font-weight: 600;
  font-size: 1em;
}
td {
  background: #ffffff;
  border-bottom: 1px solid #d1d5db;
  font-size: 0.95em;
}
td .flag {
  margin-right: 8px;
}
tr:hover td {
  background: #f3f4f6;
  transition: 0.3s;
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
      <td>🌏 Cloudflare</td>
      <td>${ip}</td>
      <td>${asOrganization}</td>
      <td><span class="flag">${getFlag(country)}</span>${country}</td>
    </tr>
    <tr id="chatgpt-row">
      <td>🌏 ChatGPT</td>
      <td id="chatgpt-ip">加载中...</td>
      <td id="chatgpt-isp">-</td>
      <td id="chatgpt-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>
    <tr id="ipv4-row">
      <td>🌏 ip.sb IPv4</td>
      <td id="ipv4-ip">加载中...</td>
      <td id="ipv4-isp">加载中...</td>
      <td id="ipv4-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>
    <tr id="ipv6-row">
      <td>🌏 ip.sb IPv6</td>
      <td id="ipv6-ip">加载中...</td>
      <td id="ipv6-isp">加载中...</td>
      <td id="ipv6-country"><span class="flag">🏳️</span>加载中...</td>
    </tr>
    <tr id="ipapi-row">
      <td>🌏 ipapi.is</td>
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

async function addRow(id, source, ip, isp, countryCode, countryName) {
  document.getElementById(id + '-ip').textContent = ip || '-';
  document.getElementById(id + '-isp').textContent = isp || '-';
  document.getElementById(id + '-country').innerHTML = '<span class="flag">' + getFlag(countryCode) + '</span>' + (countryName || countryCode || '-');
}

async function loadChatGPT() {
  try {
    const res = await fetch('https://chatgpt.com/cdn-cgi/trace');
    const text = await res.text();
    const ipMatch = text.match(/ip=([^\\n]+)/);
    const ip = ipMatch ? ipMatch[1] : '-';
    const locMatch = text.match(/loc=([^\\n]+)/);
    const country = locMatch ? locMatch[1] : '-';
    addRow('chatgpt', 'ChatGPT', ip, '', country, country);
  } catch(e){
    console.error('ChatGPT加载失败', e);
    addRow('chatgpt', 'ChatGPT', '加载失败', '-', '-','-');
  }
}

async function loadIPSBv4() {
  try {
    const res = await fetch('https://api-ipv4.ip.sb/geoip');
    const data = await res.json();
    addRow('ipv4', 'ip.sb IPv4', data.ip, data.isp, data.country_code, data.country);
  } catch(e){console.error('ip.sb IPv4加载失败', e);}
}

async function loadIPSBv6() {
  try {
    const res = await fetch('https://api-ipv6.ip.sb/geoip');
    const data = await res.json();
    addRow('ipv6', 'ip.sb IPv6', data.ip, data.isp, data.country_code, data.country);
  } catch(e){console.error('ip.sb IPv6加载失败', e);}
}

// ipapi
async function loadIPAPI() {
  try {
    const res = await fetch('https://api.ipapi.is');
    const data = await res.json();
    const country = data.location?.country || '-';
    addRow('ipapi', 'ipapi', data.ip, data.asn?.org, data.location?.country_code, country);
  } catch(e){console.error('ipapi加载失败', e);}
}




// 异步加载所有数据
loadChatGPT();
loadIPSBv4();
loadIPSBv6();
loadIPAPI();
</script>
</body>
</html>
`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });

}
