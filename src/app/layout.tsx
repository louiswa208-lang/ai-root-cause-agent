import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "全链路波动归因 Agent",
  description:
    "基于 LangGraph 的内容—互动—搜索—交易全链路指标波动归因 Agent：异常识别、指标拆解、维度下钻、事件与原因匹配、证据验证。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
