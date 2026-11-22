import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server-app.ts';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const vp = urlObj.searchParams.get('__vp');
      if (vp) {
        urlObj.searchParams.delete('__vp');
        const remainingQs = urlObj.searchParams.toString();
        req.url = remainingQs ? `${vp}?${remainingQs}` : vp;
      }
    } catch {
      // Keep original req.url if URL parsing fails
    }
  }
  return app(req, res);
}
