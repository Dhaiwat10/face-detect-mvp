import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";

function App() {
  const [results, setResults] = useState<string>('No actions performed yet.');
  const [gallery, setGallery] = useState<string>('<h2>Gallery will appear here</h2>');

  useEffect(() => {
    if (!window.electronAPI) {
      console.error("Electron API not found! Check your preload script.");
      setResults("Error: Could not connect to the backend. Please restart the application.");
      return;
    }

    window.electronAPI.onUpdateResults((message: string) => {
      setResults(message);
    });
    
    window.electronAPI.onUpdateGallery((html: string) => {
      setGallery(html);
    });

  }, []);

  const handleIndexFolder = () => {
    if (window.electronAPI) {
      window.electronAPI.indexFolder();
    }
  };

  const handleQueryByImage = () => {
    if (window.electronAPI) {
      window.electronAPI.queryByImage();
    }
  };

  return (
    <div className={cn("bg-background text-foreground min-h-screen", "dark")}>
      <div className="container mx-auto p-4">
        <header className="text-center py-4">
          <h1 className="text-4xl font-bold">Face Recognition MVP</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Controls */}
          <div className="md:col-span-1 bg-card p-4 rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Controls</h2>
            <div className="flex flex-col space-y-4">
              <Button onClick={handleIndexFolder}>Index a Folder of Images</Button>
              <Button onClick={handleQueryByImage} variant="secondary">Query by Image</Button>
            </div>
            <div className="mt-6">
              <h3 className="text-lg font-semibold">Status</h3>
              <div
                className="mt-2 p-2 bg-muted rounded-md text-sm whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: results }}
              />
            </div>
          </div>

          {/* Results Gallery */}
          <div className="md:col-span-2 bg-card p-4 rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Results</h2>
            <div
              className="gallery-container"
              dangerouslySetInnerHTML={{ __html: gallery }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 