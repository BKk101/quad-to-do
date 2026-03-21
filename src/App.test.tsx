import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders quad-to-do header', () => {
  render(<App />);
  const heading = screen.getByText(/urgent x important memo board/i);
  expect(heading).toBeInTheDocument();
});
