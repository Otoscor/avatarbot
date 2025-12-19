import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // VRM 파일과 기타 정적 파일을 위한 설정
  experimental: {
    // 큰 파일(VRM)을 위한 최적화
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei"],
  },
};

export default nextConfig;
