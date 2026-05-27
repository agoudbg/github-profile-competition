import type { Metadata, Viewport } from "next";
import { AppHeader } from "@/components/AppHeader";
import { zhCN } from "@/i18n/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: zhCN.metadata.title,
  description: zhCN.metadata.description
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
