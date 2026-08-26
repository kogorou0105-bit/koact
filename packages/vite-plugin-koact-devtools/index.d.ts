export interface KoactDevToolsPlugin {
  name: "vite-plugin-koact-devtools";
  apply: "serve";
  transformIndexHtml(html: string): {
    html: string;
    tags: Array<{
      tag: string;
      children: string;
      injectTo: "body";
    }>;
  };
}

export default function koactDevTools(): KoactDevToolsPlugin;
