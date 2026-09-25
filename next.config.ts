import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "*": ["./lib/ai/references/*.md"],
  },
};

export default nextConfig;
