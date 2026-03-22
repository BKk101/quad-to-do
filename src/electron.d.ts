export {};

declare global {
  interface Window {
    electronAPI?: {
      saveJsonFile: (payload: {
        defaultPath: string;
        content: string;
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      openJsonFile: () => Promise<{ canceled: boolean; filePath?: string; content?: string }>;
    };
  }
}
