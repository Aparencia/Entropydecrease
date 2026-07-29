// @ai-context
// 主题注册器：封装 next-themes Provider，默认深色（深海意识）。Theme registry wrapping next-themes.
// Why: storageKey 独立命名，避免与其他应用的 localStorage 冲突。
"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="ed-theme"
    >
      {children}
    </ThemeProvider>
  );
}
