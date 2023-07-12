import { RouterProvider } from 'react-router-dom';
import { routerConfig } from '@/router';

import './App.css';

function App() {
  return (
    <div className="App">
      <RouterProvider router={routerConfig}></RouterProvider>
    </div>
  );
}

export default App;
