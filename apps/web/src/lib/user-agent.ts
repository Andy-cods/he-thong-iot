/**
 * Parser User-Agent nhẹ — không dùng `ua-parser-js` (tránh bundle size).
 * Trích xuất device type + browser + OS ở mức đủ hiển thị UI.
 *
 * Output format: "Chrome 120 trên Windows 10" / "Safari trên iPhone" / v.v.
 */

export interface ParsedUA {
  browser: string;
  os: string;
  isMobile: boolean;
  summary: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua || ua.trim() === "") {
    return {
      browser: "Không rõ",
      os: "Không rõ",
      isMobile: false,
      summary: "Thiết bị không xác định",
    };
  }
  const s = ua;

  // Browser
  let browser = "Không rõ";
  if (/\bEdg\/([\d.]+)/.test(s)) browser = `Edge ${RegExp.$1.split(".")[0]}`;
  else if (/\bOPR\/([\d.]+)/.test(s)) browser = `Opera ${RegExp.$1.split(".")[0]}`;
  else if (/\bFirefox\/([\d.]+)/.test(s))
    browser = `Firefox ${RegExp.$1.split(".")[0]}`;
  else if (/\bChrome\/([\d.]+)/.test(s))
    browser = `Chrome ${RegExp.$1.split(".")[0]}`;
  else if (/\bSafari\/([\d.]+)/.test(s) && /Version\/([\d.]+)/.test(s))
    browser = `Safari ${RegExp.$1.split(".")[0]}`;

  // OS
  let os = "Không rõ";
  if (/Windows NT 10/.test(s)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(s)) os = "Windows 8.1";
  else if (/Windows NT 6\.1/.test(s)) os = "Windows 7";
  else if (/Mac OS X ([\d_]+)/.test(s))
    os = `macOS ${RegExp.$1.replace(/_/g, ".").split(".").slice(0, 2).join(".")}`;
  else if (/Android ([\d.]+)/.test(s)) os = `Android ${RegExp.$1}`;
  else if (/iPhone OS ([\d_]+)/.test(s))
    os = `iOS ${RegExp.$1.replace(/_/g, ".")}`;
  else if (/iPad.*OS ([\d_]+)/.test(s))
    os = `iPadOS ${RegExp.$1.replace(/_/g, ".")}`;
  else if (/Linux/.test(s)) os = "Linux";

  const isMobile =
    /Mobile|Android|iPhone|iPod|Opera Mini|IEMobile/i.test(s) === true;

  const summary = `${browser} · ${os}`;

  return { browser, os, isMobile, summary };
}
