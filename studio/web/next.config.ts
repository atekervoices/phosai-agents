import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "localhost:3000",
    "127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "studio.phosaico.com",
    "agents.phosaico.com",
    "api.phosaico.com",
    "voice.phosaico.com",
    "https://agents.phosaico.com",
    "*.phosaico.com",
    "*.phosai.com",
  ],
};

export default nextConfig;
