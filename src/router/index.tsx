import { createBrowserRouter } from 'react-router-dom';

import VirtualScroll from '@/components/VirtualScroll';
import Home from '@/pages/home';
import Download from '@/pages/upload_download/download';
import Upload from '@/pages/upload_download/upload';

export const routerConfig = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/virtualScroll',
    element: <VirtualScroll />,
  },
  {
    path: '/download',
    element: <Download />,
  },
  {
    path: '/upload',
    element: <Upload />,
  },
]);
