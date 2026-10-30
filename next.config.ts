import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // zca-js và libsql là thư viện Node thuần, không bundle vào route handler.
  serverExternalPackages: ["zca-js", "@libsql/client"],
  poweredByHeader: false,
};

export default nextConfig;

