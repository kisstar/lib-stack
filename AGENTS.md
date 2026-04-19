# Lib Stack 项目开发指南

## 概述

Lib Stack 是一个基于 pnpm workspace 的 TypeScript monorepo 项目，使用 rolldown 作为打包工具，包含完整的代码质量工具链、测试框架、CI/CD 和版本发布流程。

## 技术栈

| 类别 | 工具 |
|------|------|
| 包管理 | pnpm (workspace + catalog) |
| 语言 | TypeScript |
| 打包 | rolldown |
| 代码校验 | @antfu/eslint-config |
| 提交规范 | husky + lint-staged + commitlint |
| 测试 | Vitest |
| CI/CD | GitHub Actions |
| 版本发布 | changesets |
| Node.js | >= 20 |

## 项目结构

```
lib-stack/
├── .changeset/             # changesets 配置
│   └── config.json
├── .github/
│   └── workflows/
│       └── ci.yml          # CI 工作流 (lint + test + build)
├── .husky/
│   ├── pre-commit          # lint-staged 钩子
│   └── commit-msg          # commitlint 钩子
├── packages/
│   └── utils/              # 示例工具包 @lib-stack/utils
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       ├── rolldown.config.ts
│       └── tsconfig.json
├── .gitignore
├── .npmrc
├── commitlint.config.ts
├── eslint.config.ts
├── package.json            # 根 package.json（workspace 脚本）
├── pnpm-workspace.yaml     # workspace + catalog 配置
├── tsconfig.json           # 根 tsconfig（项目引用）
└── vitest.config.ts        # 根 vitest 配置
```

## 工作原则

- 工具函数优先使用 [@lib-stack/shared](./packages/shared/) 包提供的函数，新增工具函数时先在 [@lib-stack/shared](./packages/shared/) 包中添加，再在其他包中使用

## 详细设计

### 1. 根目录 package.json

- 定义 workspace 级别的脚本：`lint`、`test`、`build`、`typecheck`、`changeset`、`release`
- 使用 `--filter` 或 `--recursive` 管理子包命令

### 2. pnpm-workspace.yaml

使用 `packages` 字段声明工作区，使用 `catalog` 字段集中管理所有依赖版本

### 3. TypeScript 配置

根目录 `tsconfig.json` 作为基础配置，子包通过 `extends` 继承

### 4. Rolldown 打包配置

每个子包有独立的 `rolldown.config.ts`，输出 ESM + CJS + IIFE 三种格式：

```ts
import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      format: 'esm',
      dir: 'dist',
      entryFileNames: '[name].mjs',
    },
    {
      format: 'cjs',
      dir: 'dist',
      entryFileNames: '[name].cjs',
    },
    {
      format: 'iife',
      dir: 'dist',
      entryFileNames: '[name].iife.js',
      name: 'LibStackUtils',
    },
  ],
})
```

### 5. Vitest 配置

根目录 `vitest.config.ts`，workspace 模式自动发现子包测试：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.{test,spec}.ts'],
  },
})
```

### 6. 示例包 @lib-stack/utils

**packages/utils/package.json：**
```jsonc
{
  "name": "@lib-stack/utils",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "rolldown -c",
    "dev": "rolldown -c --watch"
  }
}
```

**packages/utils/src/index.ts：**
```ts
/**
 * Check if a value is defined (not undefined and not null).
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}
```

## 边界条件与注意事项

- IIFE 格式需要为每个包指定全局变量名（`name` 字段）
- 子包的 `files` 字段确保只发布 `dist` 目录

## 预期结果

- 完整的 monorepo 基础设施，可直接开始开发新工具包
- 运行 `pnpm install` 安装依赖
- 运行 `pnpm build` 构建所有子包
- 运行 `pnpm test` 执行所有测试
- 运行 `pnpm lint` 校验代码
- 提交代码时自动 lint 和校验 commit message
- 通过 changesets 管理版本发布
