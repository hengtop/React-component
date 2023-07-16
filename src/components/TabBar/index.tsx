import { routerConfig } from '@/router';
import { Link } from 'react-router-dom';

export default function TabBar() {
  return (
    <>
      {routerConfig.routes.map((route) => (
        <Link key={route.id} to={route.path ?? '/'}>
          {route.path}
          <br />
        </Link>
      ))}
    </>
  );
}
