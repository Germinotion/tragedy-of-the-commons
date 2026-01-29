/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module 'uplot/dist/uPlot.min.css' {
  const content: string;
  export default content;
}
