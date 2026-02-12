export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 API 中转请求
    if (url.pathname === '/api/ipapi') {
      const ip = url.searchParams.get('q');
      const apiUrl = `https://api.ipapi.is${ip ? `?q=${ip}` : ''}`;
      
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
          },
        });
        
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // 获取 Cloudflare 识别的访问者信息
    const cf = request.cf || {};
    const clientIp = request.headers.get("cf-connecting-ip") ||
                     request.headers.get("x-forwarded-for") ||
                     "未知";
    const country = cf.country || "XX";
    const city = cf.city || "Unknown City";
    const isp = cf.asOrganization || "Unknown ISP";

    // 将这些数据注入到 HTML 中
    const initData = {
      ip: clientIp,
      country: country,
      city: city,
      isp: isp
    };

    return new Response(renderHtml(initData), {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
      },
    });
  },
};

function renderHtml(initData) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IP 哨兵 - 网络身份分析</title>

    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- React & Babel -->
    <script src="https://unpkg.com/react@18.2.0/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <script>
      // 注入服务端获取的初始数据
      window.CF_DATA = ${JSON.stringify(initData)};

      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              // 使用对中文友好的系统字体栈，移除 Google Fonts 依赖
              sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
              mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
            },
            animation: {
              'fade-in': 'fadeIn 0.3s ease-out',
              'slide-up': 'slideUp 0.4s ease-out',
            },
            keyframes: {
              fadeIn: {
                '0%': { opacity: '0' },
                '100%': { opacity: '1' },
              },
              slideUp: {
                '0%': { opacity: '0', transform: 'translateY(10px)' },
                '100%': { opacity: '1', transform: 'translateY(0)' },
              }
            }
          },
        },
      }
    </script>
    <style>
      body { background-color: #f8fafc; }
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
  </head>
  <body>
    <div id="root"></div>

    <!-- 应用程序逻辑 -->
    <script type="text/babel" data-presets="react">
      const { useState, useEffect, useCallback } = React;
      const { createRoot } = ReactDOM;
      
      // 简化图标实现，避免依赖 lucide-react
      const ShieldCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path></svg>;
      const Github = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>;
      const Globe = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>;
      const Search = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>;
      const RefreshCcw = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"></path><path d="M21 12A9 9 0 0 0 6 5.3L3 8"></path><path d="M21 22v-6h-6"></path><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"></path></svg>;
      const ExternalLink = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>;
      const X = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>;
      const Shield = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>;
      const Server = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>;
      const Activity = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>;
      const MapPin = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
      const AlertTriangle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" x2="12" y1="9" y2="13"></line><line x1="12" x2="12.01" y1="17" y2="17"></line></svg>;
      const CheckCircle2 = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;
      const Info = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>;

      // --- 图标 Data URIs (内嵌 SVG) ---
      const ICONS = {
        cloudflare: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%23F48120' d='M35.1 14.8c-1.1 0-2.1.3-3.1.8-1.4-5.2-6.2-9-11.8-9-5.9 0-10.9 4.2-12.1 9.8C3.5 17 0 21.6 0 27s3.5 10 8.1 10.5h26.8c7.2 0 13.1-5.9 13.1-13.1 0-5.2-3-9.7-7.5-11.9-.6.2-1.1.3-1.7.3z'/%3E%3Cpath fill='%23F48120' d='M28.8 13.8c.8 0 1.6.1 2.3.4C29.7 9.9 25.4 6.8 20.2 6.8c-5.5 0-10.1 3.6-11.6 8.6 2.8-.8 5.8-1.3 9-1.3 4.2-.1 8.2.9 11.2 2.7z'/%3E%3C/svg%3E",
        ipsb: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M2 12h20'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E",
        chatgpt: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310a37f'%3E%3Cpath d='M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.0462 6.0462 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.3829a.071.071 0 0 1-.038-.052V2.7482a4.4992 4.4992 0 0 1 4.4945 4.4944v5.8403a.7853.7853 0 0 0-.3832-.6813l-.2399-.6498zM6.803 3.3029l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7865a4.504 4.504 0 0 1 2.1461 3.8257l-.1466-.0852-4.783-2.7629a.7759.7759 0 0 0-.7854 0L4.3126 9.267V6.9346a.0804.0804 0 0 1 .0332-.0615l4.9522-3.2902a4.485 4.485 0 0 1-2.495 3.72zm8.1174 9.3485a4.4992 4.4992 0 0 1-6.1408 1.6511l-.1466-.0852 4.783-2.7582a.7759.7759 0 0 0 .3927-.6813v-6.7369l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7865a4.504 4.504 0 0 1-2.1461 3.8257zM11.9996 11.9996a1.1685 1.1685 0 1 1 1.1685-1.1685 1.1685 1.1685 0 0 1-1.1685 1.1685z'/%3E%3C/svg%3E",
        openai: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.0462 6.0462 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.3829a.071.071 0 0 1-.038-.052V2.7482a4.4992 4.4992 0 0 1 4.4945 4.4944v5.8403a.7853.7853 0 0 0-.3832-.6813l-.2399-.6498zM6.803 3.3029l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7865a4.504 4.504 0 0 1 2.1461 3.8257l-.1466-.0852-4.783-2.7629a.7759.7759 0 0 0-.7854 0L4.3126 9.267V6.9346a.0804.0804 0 0 1 .0332-.0615l4.9522-3.2902a4.485 4.485 0 0 1-2.495 3.72zm8.1174 9.3485a4.4992 4.4992 0 0 1-6.1408 1.6511l-.1466-.0852 4.783-2.7582a.7759.7759 0 0 0 .3927-.6813v-6.7369l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7865a4.504 4.504 0 0 1-2.1461 3.8257zM11.9996 11.9996a1.1685 1.1685 0 1 1 1.1685-1.1685 1.1685 1.1685 0 0 1-1.1685 1.1685z'/%3E%3C/svg%3E",
        ipapi: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237c3aed' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='2' width='20' height='20' rx='5' ry='5'/%3E%3Cpath d='M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'/%3E%3C/svg%3E"
      };

      // --- 枚举与工具函数 ---
      const RiskLevel = {
        VERY_LOW: '极度纯净',
        LOW: '纯净',
        ELEVATED: '轻微风险',
        HIGH: '高风险',
        CRITICAL: '极度危险',
        UNKNOWN: '未知'
      };

      function getFlagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '🏳️';
        const codePoints = countryCode
          .toUpperCase()
          .split('')
          .map((c) => 127397 + c.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
      }

      function calculateAbuseScore(data) {
        const companyScoreStr = data.company?.abuser_score;
        const asnScoreStr = data.asn?.abuser_score;

        let company = 0;
        let asn = 0;

        if (companyScoreStr && companyScoreStr !== 'Unknown') company = parseFloat(companyScoreStr) || 0;
        if (asnScoreStr && asnScoreStr !== 'Unknown') asn = parseFloat(asnScoreStr) || 0;

        // 基础分公式: (运营商分 + ASN分) / 2 * 5
        let baseScore = ((company + asn) / 2) * 5;

        const riskFlags = [
          data.is_crawler, data.is_proxy, data.is_vpn,
          data.is_tor, data.is_abuser, data.is_bogon
        ];

        // 每个风险项增加 15%
        const riskCount = riskFlags.filter(flag => flag === true).length;
        const riskAddition = riskCount * 0.15;

        const finalScore = baseScore + riskAddition;

        if (baseScore === 0 && riskAddition === 0) {
          return { score: null, level: RiskLevel.UNKNOWN, percentage: null };
        }

        const percentage = finalScore * 100;
        let level = RiskLevel.VERY_LOW;

        // 按照你要求的阈值判断等级
        if (percentage >= 100) level = RiskLevel.CRITICAL;
        else if (percentage >= 20) level = RiskLevel.HIGH;
        else if (percentage >= 5) level = RiskLevel.ELEVATED;
        else if (percentage >= 0.25) level = RiskLevel.LOW;

        return { score: finalScore, level, percentage };
      }

      function getRiskBadgeColor(level) {
        switch (level) {
          case RiskLevel.CRITICAL: return 'bg-red-100 text-red-800 border-red-200';
          case RiskLevel.HIGH: return 'bg-orange-100 text-orange-800 border-orange-200';
          case RiskLevel.ELEVATED: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
          case RiskLevel.LOW: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
          case RiskLevel.VERY_LOW: return 'bg-green-100 text-green-800 border-green-200';
          default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
      }

      function getThreatColor(scoreStr) {
          if (!scoreStr) return 'bg-blue-50 text-blue-700';
          const score = parseFloat(scoreStr);
          if (isNaN(score)) return 'bg-gray-100 text-gray-600';
          if (score < 0.001) return 'bg-green-100 text-green-700';
          if (score < 0.01) return 'bg-blue-100 text-blue-700';
          if (score < 0.1) return 'bg-yellow-100 text-yellow-700';
          return 'bg-red-100 text-red-700';
      }

      // 格式化 IP 类型 (住宅/机房/商用)
      const IpTypeBadge = ({ type }) => {
        if (!type) return <span className="text-slate-400">未知</span>;
        const lowerType = type.toLowerCase();
        let label = type;
        let colorClass = "text-slate-900 font-bold";

        if (lowerType === 'isp') {
            label = '住宅';
            colorClass = "text-green-600 font-bold";
        } else if (lowerType === 'hosting') {
            label = '机房';
            colorClass = "text-slate-800 font-bold";
        } else if (lowerType === 'business') {
            label = '商用';
            colorClass = "text-amber-600 font-bold";
        }

        return <span className={colorClass}>{label}</span>;
      };

      // --- 网络请求辅助函数 (超时控制) ---
      const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(id);
          return response;
        } catch (error) {
          clearTimeout(id);
          throw error;
        }
      };

      // --- 组件 ---
      const SectionTitle = ({ icon: Icon, title }) => (
        <div className="flex items-center gap-2 mb-3 text-slate-800 pb-2 border-b border-slate-100">
            <Icon className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-base">{title}</h3>
        </div>
      );

      const InfoItem = ({ label, value, highlight = false }) => (
        <div className="flex flex-col sm:flex-row justify-between py-2">
          <span className="text-slate-500 text-sm font-medium min-w-[120px]">{label}</span>
          <span className={\`text-sm sm:text-right mt-1 sm:mt-0 break-words \${highlight ? 'font-bold text-slate-900' : 'text-slate-700'}\`}>
            {value}
          </span>
        </div>
      );

      const BoolBadge = ({ value, trueLabel = '是', falseLabel = '否' }) => {
        if (value) {
          return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100"><AlertTriangle className="w-3 h-3" /> {trueLabel}</span>;
        }
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100"><CheckCircle2 className="w-3 h-3" /> {falseLabel}</span>;
      };

      const IpDetailModal = ({ isOpen, onClose, data, loading, error }) => {
        if (!isOpen) return null;

        const handleBackdropClick = (e) => {
          if (e.target === e.currentTarget) onClose();
        };

        let content;
        let riskInfo = { score: null, level: RiskLevel.UNKNOWN, percentage: null };
        if (data) riskInfo = calculateAbuseScore(data);

        if (loading) {
          content = (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-slate-500 font-medium">正在深入分析 IP 情报...</p>
            </div>
          );
        } else if (error) {
          content = (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="bg-red-50 p-4 rounded-full mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">获取详情失败</h3>
              <p className="text-slate-500 mt-2 max-w-xs">{error}</p>
              <button onClick={onClose} className="mt-6 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition">关闭</button>
            </div>
          );
        } else if (data) {
          content = (
            <div className="space-y-6 animate-slide-up">
              {/* 标题区 */}
              <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        🔍 IP 详细信息
                    </h2>
                    <span className="text-xs text-slate-400 mt-1 block">数据来源: ipapi.is</span>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition">
                      <X className="w-5 h-5 text-slate-500" />
                  </button>
              </div>

              {/* 1. 基本信息 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <SectionTitle icon={Info} title="基本信息" />
                  <div className="space-y-1">
                      <div className="flex flex-col sm:flex-row justify-between py-2 border-b border-slate-50">
                          <span className="text-slate-500 text-sm font-medium">IP 地址</span>
                          <span className="text-lg font-mono font-bold text-slate-900 break-all text-right">{data.ip}</span>
                      </div>
                      <InfoItem label="区域注册机构" value={data.rir || '未知'} highlight />
                      <InfoItem
                        label="运营商 / ASN 类型"
                        value={
                            <span>
                                <IpTypeBadge type={data.company?.type} /> / <IpTypeBadge type={data.asn?.type} />
                            </span>
                        }
                      />
                      <div className="flex flex-col sm:flex-row justify-between py-2 items-center">
                          <span className="text-slate-500 text-sm font-medium flex items-center gap-1">
                             综合滥用评分
                             <div className="group relative">
                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] flex items-center justify-center cursor-help font-bold">?</span>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    算法: (运营商分+ASN分)/2 * 5 + 风险项加成
                                </div>
                             </div>
                          </span>
                          <div className="text-right mt-1 sm:mt-0">
                              {riskInfo.score !== null ? (
                                  <span className={\`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold border \${getRiskBadgeColor(riskInfo.level)}\`}>
                                      {riskInfo.percentage?.toFixed(2)}% {riskInfo.level}
                                  </span>
                              ) : <span className="text-slate-400">未知</span>}
                          </div>
                      </div>
                  </div>
              </div>

              {/* 2. 安全检测 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                   <SectionTitle icon={ShieldCheck} title="安全检测" />
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8">
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">移动流量</span>
                            <BoolBadge value={data.is_mobile} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">数据中心</span>
                            <BoolBadge value={data.is_datacenter} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">卫星网络</span>
                            <BoolBadge value={data.is_satellite} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">爬虫</span>
                            <BoolBadge value={data.is_crawler} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">代理服务器</span>
                            <BoolBadge value={data.is_proxy} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">VPN</span>
                            <BoolBadge value={data.is_vpn} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">Tor 网络</span>
                            <BoolBadge value={data.is_tor} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">滥用 IP</span>
                            <BoolBadge value={data.is_abuser} trueLabel="是" falseLabel="否" />
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-600 text-sm">虚假 IP</span>
                            <BoolBadge value={data.is_bogon} trueLabel="是" falseLabel="否" />
                        </div>
                   </div>
              </div>

              {/* 3. 位置信息 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <SectionTitle icon={MapPin} title="位置信息" />
                  <div className="space-y-1">
                      <InfoItem label="国家" value={\`\${data.location?.country || '未知'} (\${data.location?.country_code || '-'}) \${data.location?.is_eu_member ? '🇪🇺' : ''}\`} />
                      {data.location?.state && <InfoItem label="省份/州" value={data.location.state} />}
                      {data.location?.city && <InfoItem label="城市" value={data.location.city} />}
                      {data.location?.zip && <InfoItem label="邮编" value={data.location.zip} />}
                      <InfoItem label="坐标" value={\`\${data.location?.latitude || '-'}, \${data.location?.longitude || '-'}\`} />
                      <InfoItem label="时区" value={data.location?.timezone || '-'} />
                      <InfoItem label="当地时间" value={data.location?.local_time || '-'} />
                  </div>
              </div>

              {/* 4. 运营商信息 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                   <SectionTitle icon={Server} title="运营商信息" />
                   <div className="space-y-1">
                       <InfoItem label="运营商名称" value={data.company?.name || '未知'} highlight />
                       <InfoItem label="域名" value={data.company?.domain || '-'} />
                       <InfoItem label="类型" value={<IpTypeBadge type={data.company?.type} />} />
                       <InfoItem label="网络范围" value={data.company?.network || '-'} />
                       <div className="flex flex-col sm:flex-row justify-between py-2">
                          <span className="text-slate-500 text-sm font-medium">滥用评分</span>
                          <span className="mt-1 sm:mt-0">
                            {data.company?.abuser_score ? (
                                <span className={\`px-2 py-0.5 rounded text-xs font-bold \${getThreatColor(data.company.abuser_score)}\`}>
                                    {data.company.abuser_score}
                                </span>
                            ) : '-'}
                          </span>
                       </div>
                   </div>
              </div>

              {/* 5. ASN 信息 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                   <SectionTitle icon={Activity} title="ASN 信息" />
                   <div className="space-y-1">
                       <InfoItem label="ASN 编号" value={data.asn?.asn ? \`AS\${data.asn.asn}\` : '未知'} highlight />
                       <InfoItem label="组织" value={data.asn?.org || '-'} />
                       <InfoItem label="路由" value={data.asn?.route || '-'} />
                       <InfoItem label="类型" value={<IpTypeBadge type={data.asn?.type} />} />
                       <InfoItem label="国家代码" value={data.asn?.country || '-'} />
                       <div className="flex flex-col sm:flex-row justify-between py-2">
                          <span className="text-slate-500 text-sm font-medium">滥用评分</span>
                          <span className="mt-1 sm:mt-0">
                            {data.asn?.abuser_score ? (
                                <span className={\`px-2 py-0.5 rounded text-xs font-bold \${getThreatColor(data.asn.abuser_score)}\`}>
                                    {data.asn.abuser_score}
                                </span>
                            ) : '-'}
                          </span>
                       </div>
                   </div>
              </div>

              {/* 6. 滥用举报联系方式 */}
              {data.abuse && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-sm">
                      <SectionTitle icon={Shield} title="滥用举报联系方式" />
                      <div className="space-y-1 text-sm">
                          {data.abuse.name && <InfoItem label="联系人" value={data.abuse.name} />}
                          {data.abuse.email && <InfoItem label="邮箱" value={data.abuse.email} />}
                          {data.abuse.phone && <InfoItem label="电话" value={data.abuse.phone} />}
                          {data.abuse.address && <InfoItem label="地址" value={data.abuse.address} />}
                      </div>
                  </div>
              )}
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity" onClick={handleBackdropClick}></div>
            <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-hide">
                <div className="absolute top-4 right-4 z-10 md:hidden">
                  <button type="button" className="rounded-full bg-white/80 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition focus:outline-none" onClick={onClose}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 sm:p-8 bg-[#f8fafc]">{content}</div>
              </div>
            </div>
          </div>
        );
      };

      const StatusCard = ({ data, onViewDetails, onRetry }) => {
        const { sourceName, sourceUrl, sourceIcon, ip, isp, countryCode, countryName, isLoading, error } = data;

        return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {sourceIcon ? (
                  <img src={sourceIcon} alt={sourceName} className="w-6 h-6 rounded-md shadow-sm object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                    {sourceName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <h3 className="font-semibold text-slate-800 text-sm">{sourceName}</h3>
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-indigo-500 flex items-center gap-1 truncate max-w-[150px]">
                      {new URL(sourceUrl).hostname}
                      <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              {isLoading && <RefreshCcw className="w-4 h-4 text-indigo-400 animate-spin" />}
            </div>

            <div className="p-5 flex-1 flex flex-col justify-center">
              {error ? (
                <div className="text-center">
                  <p className="text-red-500 text-sm mb-2">{error}</p>
                  {onRetry && (
                      <button onClick={onRetry} className="text-xs text-slate-500 hover:text-slate-800 underline">重试</button>
                  )}
                </div>
              ) : isLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-6 bg-slate-100 rounded w-3/4 mx-auto"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto"></div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="group relative inline-block cursor-pointer" onClick={() => onViewDetails(ip)}>
                      <div className="text-xl sm:text-2xl font-mono font-bold text-indigo-600 hover:text-indigo-700 transition-colors break-all">
                          {ip}
                      </div>
                      <div className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 left-1/2 transform -translate-x-1/2 whitespace-nowrap">点击查看详情</div>
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600">
                      <span className="text-xl">{getFlagEmoji(countryCode)}</span>
                      <span className="font-medium">{countryName || '未知位置'}</span>
                  </div>

                  {isp && isp !== '-' && (
                      <div className="mt-2 text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-lg inline-block max-w-full truncate">
                          {isp}
                      </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-100 w-full">
                      <button onClick={() => onViewDetails(ip)} className="w-full py-2 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition flex items-center justify-center gap-2">
                          <Search className="w-4 h-4" />
                          风险分析
                      </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };

      // --- 数据服务层 (客户端直接请求) ---
      const ipService = {
        // 改回直接请求 ChatGPT 官方接口
        fetchChatGPT: async () => {
          try {
            const res = await fetchWithTimeout('https://chatgpt.com/cdn-cgi/trace');
            if (!res.ok) throw new Error('网络响应错误');
            const text = await res.text();
            const ip = text.match(/ip=([^\\n]+)/)?.[1] || '-';
            const country = text.match(/loc=([^\\n]+)/)?.[1] || '-';
            return { ip, countryCode: country, countryName: country, error: undefined };
          } catch (e) {
            console.error("ChatGPT Fetch Error:", e);
            return { error: '连接超时或被拦截' };
          }
        },
        // 改回直接请求 OpenAI 官方接口
        fetchOpenAI: async () => {
          try {
            const res = await fetchWithTimeout('https://openai.com/cdn-cgi/trace');
            if (!res.ok) throw new Error('网络响应错误');
            const text = await res.text();
            const ip = text.match(/ip=([^\\n]+)/)?.[1] || '-';
            const country = text.match(/loc=([^\\n]+)/)?.[1] || '-';
            return { ip, countryCode: country, countryName: country, error: undefined };
          } catch (e) {
            return { error: '连接超时或被拦截' };
          }
        },
        // IPv4
        fetchIpSbV4: async () => {
          try {
            const res = await fetchWithTimeout('https://api-ipv4.ip.sb/geoip');
            if (!res.ok) throw new Error('Error');
            const data = await res.json();
            return { ip: data.ip, isp: data.isp, countryCode: data.country_code, countryName: data.country, error: undefined };
          } catch (e) { return { error: '加载失败' }; }
        },
        // IPv6
        fetchIpSbV6: async () => {
          try {
            const res = await fetchWithTimeout('https://api-ipv6.ip.sb/geoip');
            if (!res.ok) throw new Error('Error');
            const data = await res.json();
            return { ip: data.ip, isp: data.isp, countryCode: data.country_code, countryName: data.country, error: undefined };
          } catch (e) { return { error: '加载失败' }; }
        },
        // IPAPI.is 基础信息查询 (优先使用官方 API，失败后回退备用端点)
        fetchIpApi: async () => {
          const parseIpApiResponse = (data) => ({
            ip: data.ip,
            isp: data.asn?.org,
            countryCode: data.location?.country_code,
            countryName: data.location?.country,
            error: undefined
          });
          try {
            const res = await fetchWithTimeout('https://api.ipapi.is/', {}, 5000);
            if (!res.ok) throw new Error('Error');
            const data = await res.json();
            return parseIpApiResponse(data);
          } catch (e) {
            try {
              const res = await fetchWithTimeout('https://api.ipapi.cmliussss.net/');
              if (!res.ok) throw new Error('Error');
              const data = await res.json();
              return parseIpApiResponse(data);
            } catch (e2) { return { error: '加载失败' }; }
          }
        },
        // 详情查询 (使用 Worker 中转)
        fetchIpDetails: async (ip) => {
          const res = await fetchWithTimeout(\`/api/ipapi?q=\${ip}\`);
          if (!res.ok) throw new Error('详情查询失败');
          return await res.json();
        }
      };

      const App = () => {
        // 使用服务端注入的 Cloudflare 数据初始化第一张卡片
        const [rows, setRows] = useState([
          {
            id: 'current',
            sourceName: '当前连接 (Worker)',
            sourceUrl: 'https://cloudflare.com',
            sourceIcon: ICONS.cloudflare,
            ip: window.CF_DATA.ip,
            isp: window.CF_DATA.isp,
            countryCode: window.CF_DATA.country,
            countryName: window.CF_DATA.country,
            isLoading: false, // 数据已注入，无需加载
          },
          {
            id: 'ipv4',
            sourceName: 'IP.SB IPv4',
            sourceUrl: 'https://ip.sb',
            sourceIcon: ICONS.ipsb,
            ip: '加载中...', isp: '...', countryCode: '', countryName: '...', isLoading: true,
          },
          {
            id: 'ipv6',
            sourceName: 'IP.SB IPv6',
            sourceUrl: 'https://ip.sb',
            sourceIcon: ICONS.ipsb,
            ip: '加载中...', isp: '...', countryCode: '', countryName: '...', isLoading: true,
          },
          {
            id: 'ipapi',
            sourceName: 'IPAPI.is',
            sourceUrl: 'https://ipapi.is',
            sourceIcon: ICONS.ipapi,
            ip: '加载中...', isp: '...', countryCode: '', countryName: '...', isLoading: true,
          },
          {
            id: 'chatgpt',
            sourceName: 'ChatGPT',
            sourceUrl: 'https://chatgpt.com',
            sourceIcon: ICONS.chatgpt,
            ip: '加载中...', isp: '-', countryCode: '', countryName: '...', isLoading: true,
          },
          {
            id: 'openai',
            sourceName: 'OpenAI',
            sourceUrl: 'https://openai.com',
            sourceIcon: ICONS.openai,
            ip: '加载中...', isp: '-', countryCode: '', countryName: '...', isLoading: true,
          }
        ]);

        const [modalOpen, setModalOpen] = useState(false);
        const [selectedIp, setSelectedIp] = useState(null);
        const [detailData, setDetailData] = useState(null);
        const [detailLoading, setDetailLoading] = useState(false);
        const [detailError, setDetailError] = useState(null);

        const updateRow = useCallback((id, data) => {
          setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...data, isLoading: false } : row)));
        }, []);

        const loadData = useCallback(() => {
          // 不重新加载 'current'，因为它来自服务端注入，永远是准确的 Inbound IP
          ipService.fetchIpSbV4().then((data) => updateRow('ipv4', data));
          ipService.fetchIpSbV6().then((data) => updateRow('ipv6', data));
          ipService.fetchIpApi().then((data) => updateRow('ipapi', data));
          ipService.fetchChatGPT().then((data) => updateRow('chatgpt', data));
          ipService.fetchOpenAI().then((data) => updateRow('openai', data));
        }, [updateRow]);

        useEffect(() => {
          loadData();
        }, [loadData]);

        const handleViewDetails = async (ip) => {
          if (!ip || ip.includes('加载') || ip.includes('失败') || ip === '未知') return;
          setSelectedIp(ip);
          setModalOpen(true);
          setDetailLoading(true);
          setDetailError(null);
          setDetailData(null);
          try {
            const data = await ipService.fetchIpDetails(ip);
            setDetailData(data);
          } catch (err) {
            setDetailError(err instanceof Error ? err.message : '发生未知错误');
          } finally {
            setDetailLoading(false);
          }
        };

        return (
          <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 bg-opacity-80 backdrop-blur-md">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-600 p-1.5 rounded-lg text-white shadow-sm shadow-indigo-200">
                      <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">IP 哨兵</h1>
                </div>
                <div className="flex items-center gap-4">
                   <a href="https://github.com" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-800 transition">
                      <Github className="w-5 h-5" />
                   </a>
                </div>
              </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="mb-8 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">网络身份分析</h2>
                  <p className="text-slate-500 max-w-2xl">
                      分析各服务商下的连接可见性。检测 IP 暴露情况，通过实时风控评分检查代理/VPN 泄漏。
                  </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rows.map((row) => (
                  <StatusCard
                    key={row.id}
                    data={row}
                    onViewDetails={handleViewDetails}
                    onRetry={() => {
                        if (row.id === 'current') return; // 无需重试
                        updateRow(row.id, { isLoading: true, error: undefined });
                        if (row.id === 'ipv4') ipService.fetchIpSbV4().then(d => updateRow('ipv4', d));
                        if (row.id === 'ipv6') ipService.fetchIpSbV6().then(d => updateRow('ipv6', d));
                        if (row.id === 'ipapi') ipService.fetchIpApi().then(d => updateRow('ipapi', d));
                        if (row.id === 'chatgpt') ipService.fetchChatGPT().then(d => updateRow('chatgpt', d));
                        if (row.id === 'openai') ipService.fetchOpenAI().then(d => updateRow('openai', d));
                    }}
                  />
                ))}
              </div>

              <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between text-sm text-slate-400 gap-4">
                  <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      <span>基于 Cloudflare & React 构建</span>
                  </div>
                  <div>数据源包括 ipapi.is, ip.sb 等。</div>
              </div>
            </main>

            <IpDetailModal
              isOpen={modalOpen}
              onClose={() => setModalOpen(false)}
              data={detailData}
              loading={detailLoading}
              error={detailError}
            />
          </div>
        );
      };

      const root = createRoot(document.getElementById('root'));
      root.render(<App />);
    </script>
  </body>
</html>
`;
}
