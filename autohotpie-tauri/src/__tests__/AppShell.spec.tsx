import { render, screen } from '@testing-library/react';
import { App } from '@/App';

describe('App shell', () => {
  it('renders header and navigation', () => {
    render(<App />);

    expect(screen.getByText(/Pie Menu Studio/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Dashboard/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Profiles/i)[0]).toBeInTheDocument();
  });
});
