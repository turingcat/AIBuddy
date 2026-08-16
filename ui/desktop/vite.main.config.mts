import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    'process.env.GITHUB_OWNER': JSON.stringify(process.env.GITHUB_OWNER || 'aaif-goose'),
    'process.env.GITHUB_REPO': JSON.stringify(process.env.GITHUB_REPO || 'goose'),
    'process.env.GOOSE_BUNDLE_NAME': JSON.stringify(process.env.GOOSE_BUNDLE_NAME || 'Goose'),
    // 登录服务尚未线上部署，默认指向本地开发服务（与 src/authConfig.ts 的回退值保持一致）；
    // 线上部署后构建时设置 HEYBUDDY_AUTH_API_BASE_URL 即可，无需改代码
    // @author logic
    // @date 2026-08-15
    'process.env.HEYBUDDY_AUTH_API_BASE_URL': JSON.stringify(
      process.env.HEYBUDDY_AUTH_API_BASE_URL || 'http://localhost:3001'
    ),
  },
});
