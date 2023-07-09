import { createBrowserRouter } from 'react-router-dom';

import Demo from '@/components/VirtualScroll/demo';

export const routerConfig = createBrowserRouter([
  {
    path: '/',
  },
  {
    path: '/virtualScroll',
    element: <Demo />,
  },
]);
