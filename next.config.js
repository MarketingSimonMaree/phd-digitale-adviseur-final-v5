/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore specific module warnings
    config.ignoreWarnings = [
      { module: /@heygen\/streaming-avatar/ }
    ];
    return config;
  }
}

module.exports = nextConfig
