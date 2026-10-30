import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thư ký AI Zalo",
  description: "Tóm tắt và trích xuất việc cần làm từ nhóm Zalo bằng Gemini",
  appleWebApp: { capable: true, title: "Thư ký AI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

