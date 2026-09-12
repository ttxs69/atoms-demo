/**
 * The deterministic project scaffold.
 *
 * Boilerplate (package.json, vite config, tsconfig, entry point, css) has zero
 * decisions in it, so the orchestrator writes it directly instead of asking
 * the model to. This removes ~2k tokens from the generation turn and — more
 * importantly — removes the failure mode where the model runs out of output
 * tokens before reaching the boilerplate, leaving a project that cannot build.
 *
 * The model's job shrinks to what only the model can do: src/App.tsx and the
 * app's own components/hooks.
 */

export const SCAFFOLD_FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify(
    {
      name: 'forge-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc -b && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^19.1.0',
        'react-dom': '^19.1.0',
      },
      devDependencies: {
        '@tailwindcss/vite': '^4.1.0',
        '@types/react': '^19.1.0',
        '@types/react-dom': '^19.1.0',
        '@vitejs/plugin-react': '^4.5.0',
        tailwindcss: '^4.1.0',
        typescript: '~5.8.0',
        vite: '^6.3.0',
      },
    },
    null,
    2,
  ),
  'vite.config.ts': `import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The preview iframe loads the dev server through E2B's public URL
    // (3000-<sandboxId>.e2b.app). Vite rejects unknown Host headers by
    // default (DNS-rebinding protection) with a bare 403 — allow it.
    allowedHosts: true,
  },
})
`,
  'index.html': `<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  'src/index.css': `@import "tailwindcss";
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    // Deliberately no noUnusedLocals/noUnusedParameters: generated code
    // routinely carries unused imports, and build reliability beats
    // lint-grade strictness for a throwaway app.
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "vite.config.ts"],
}
`,
};
