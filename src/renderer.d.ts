export {};

declare global {
  interface Window {
    electronAPI: {
      indexFolder: () => void;
      queryByImage: () => void;
      onUpdateGallery: (callback: (html: string) => void) => void;
      onUpdateResults: (callback: (html: string) => void) => void;
    };
  }
} 