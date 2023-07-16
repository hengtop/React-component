import { createBrowserRouter } from 'react-router-dom';

import VirtualScroll from '@/components/VirtualScroll';
import Home from '@/pages/home';

export const routerConfig = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/virtualScroll',
    element: <VirtualScroll />,
  },
]);
