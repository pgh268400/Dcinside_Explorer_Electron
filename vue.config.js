/*
  메모리 제한 관련 글 - 아직 해결 못했다.
  https://stackoverflow.com/questions/55258355/vue-clis-type-checking-service-ignores-memory-limits
  https://cli.vuejs.org/guide/webpack.html#replacing-loaders-of-a-rule
  https://github.com/neutrinojs/webpack-chain
*/

// npm run electron:build -- --linux deb 리눅스 빌드 명령어
const { defineConfig } = require("@vue/cli-service");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

module.exports = defineConfig({
  transpileDependencies: ["vuetify"],
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    config.target = "electron-renderer";
  },

  pluginOptions: {
    electronBuilder: {
      // 엔트리 포인트 설정 (당연히 필수, 기본은 src/background.ts)
      mainProcessFile: "./src/main/background.ts",
      preload: "./src/main/preload.ts",
      // 여기서 ES2020 의 문법 등을 TS로 컴파일 하기 전에
      //Babel로 전처리해야지 Electron에서 제대로 동작한다.
      chainWebpackMainProcess: (config) => {
        config.module
          .rule("babel")
          .before("ts")
          // .test(/C:\\Users\\pgh26\\Lab\\JavaScript\\DCParser\\dcparser\.ts$/)
          .test(/src\\main\\modules\\dcparser\.ts$/)
          .use("babel")
          .loader("babel-loader")
          .options({
            presets: [["@babel/preset-env", { modules: false }]],
            plugins: ["@babel/plugin-proposal-class-properties"],
          });

        config
          .plugin("fork-ts-checker")
          .use(ForkTsCheckerWebpackPlugin, [
            { typescript: { memoryLimit: 14000 } },
          ]);
      },
      chainWebpackRendererProcess: (config) => {
        config
          .plugin("ts-checker")
          .use(ForkTsCheckerWebpackPlugin, [
            { typescript: { memoryLimit: 14000 } },
          ]);
      },
      nsis: {
        shortcutName: "DCExplorer", // Shortcut name
        artifactName: "DCExplorer.${ext}", // Installation package name
      },
      win: {
        target: [
          {
            target: "portable",
            arch: ["ia32", "x64"],
          },
        ],
      },
    },
  },
  // 렌더러 프로세스의 엔트리 포인트 설정 (당연히 필수)
  pages: {
    index: "./src/renderer/main.ts",
  },
});
