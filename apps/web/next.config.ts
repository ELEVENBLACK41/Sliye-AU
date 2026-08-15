/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-05-15 15:15:00
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-31 16:53:36
 * @FilePath: \NextNest\apps\web\next.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 允许当前临时公网预览域名访问开发模式的客户端资源与 HMR 通道。 */
  allowedDevOrigins: ['irrigation-describes-chef-shall.trycloudflare.com'],
};

export default nextConfig;
