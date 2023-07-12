import { createBrowserRouter } from 'react-router-dom';

import Demo from '@/components/VirtualScroll/demo';
import Home from '@/pages/home';

export const routerConfig = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/virtualScroll',
    element: <Demo />,
  },
]);
