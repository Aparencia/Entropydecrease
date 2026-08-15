// PostCSS 配置（CJS：package.json 无 "type": "module"，与 tailwind.config.js 保持一致，
// 避免 Node 的 MODULE_TYPELESS_PACKAGE_JSON 警告）
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
