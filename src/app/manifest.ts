import type { MetadataRoute } from "next";

/** PWA: trên Android mở bằng Chrome -> "Thêm vào màn hình chính" để dùng như app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thư ký AI Zalo",
    short_name: "Thư ký AI",
    description: "Tóm tắt và trích xuất việc cần làm từ nhóm Zalo",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    lang: "vi",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

