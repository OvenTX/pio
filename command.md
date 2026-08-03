编译命令：

 ```bash
   npm run build
 ```

 这会按依赖顺序构建：tui → ai → agent → storage/sqlite-node → protocol → client →
 coding-agent → server。

各包的编译产物在各自的 dist/ 目录里。CLI 入口主要是：

 ```bash
   packages/coding-agent/dist/cli.js
 ```

 加到 PATH 使用的几种方式：

 ### 方式 1：临时直接用（不修改 PATH）

 ```bash
   ./packages/coding-agent/dist/cli.js --help
 ```

 ### 方式 4：手动创建 symlink 到已有 PATH 目录

 ```bash
   ln -s /Users/chenxiaoguang/Desktop/Code/github/pi/packages/coding-agent/dist/cli.js
 /usr/local/bin/pi
 ```

 或放到任意已在 PATH 的目录，比如 ~/.local/bin：

 ```bash
   ln -s /Users/chenxiaoguang/Desktop/Code/github/pi/packages/coding-agent/dist/cli.js ~/.local/bin/pio
   ln -s /home/ubuntu/codetest/github/pi/packages/coding-agent/dist/cli.js ~/.local/bin/pio
 ```

 然后：

 ```bash
   pio --help
 ```

 ### 方式 5：构建独立发布包

 如果需要不依赖源码的独立可执行文件，用：

 ```bash
   npm run release:local -- --out /tmp/pi-local-release
 ```

 会生成：

 ```bash
   /tmp/pi-local-release/node/pi
   /tmp/pi-local-release/bun/pi
 ```

 直接把对应目录加到 PATH 即可。
 或者将pi-local-release目录下的压缩包，拷贝到其他设备上解压运行。

 常用相关命令：

 ```bash
   # 类型检查 + 格式化 + 各类校验（不跑测试，不跑完整 build）
   npm run check

   # 清理构建产物
   npm run clean

   # 跑测试（注意会包含 e2e，除非有 endpoint/auth 环境变量才触发）
   npm run test
 ```

 如果还没装依赖，先执行：

 ```bash
   npm install --ignore-scripts
 ```
