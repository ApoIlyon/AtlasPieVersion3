import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App shell', () => {
  it('renders Kando layout panels', async () => {
    render(<App />);

    const menuHeading = await screen.findByRole('heading', { name: /menus/i });
    const propertiesHeading = await screen.findByRole('heading', { name: /properties/i });
    const previewTitle = await screen.findByRole('heading', {
      name: /default/i,
      level: 1,
    });

    expect(menuHeading).toBeInTheDocument();
    expect(propertiesHeading).toBeInTheDocument();
    expect(previewTitle).toBeInTheDocument();
  });
});
