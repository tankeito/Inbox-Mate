import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BackyardApp } from './backyard/BackyardApp';
import './styles.css';

function RootRouter() {
  const [isBackyard, setIsBackyard] = useState(
    window.location.pathname.startsWith('/backyard')
  );

  useEffect(() => {
    const handlePopState = () => {
      setIsBackyard(window.location.pathname.startsWith('/backyard'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (isBackyard) {
    return <BackyardApp />;
  }

  return <App />;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('The application root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);
