import React from 'react';
import { Providers } from './components/providers';
import HomePage from './app/page';

function App() {
  return (
    <Providers>
      <HomePage />
    </Providers>
  );
}

export default App;