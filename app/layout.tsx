import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "创业板与科创板收盘筛选",
  description: "根据交易所官方收盘行情筛选创业板与科创板股票，并查看近一个月日K线。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
