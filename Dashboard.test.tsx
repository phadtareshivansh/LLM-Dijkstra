import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  it('renders the route planning controls', () => {
    render(<Dashboard />);

    expect(screen.getByLabelText('Source')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask AI to plan a route')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start route' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip animation' })).toBeInTheDocument();
  });

  it('switches to Dijkstra trace mode with legend, log, and step badges', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Dijkstra trace' }));

    expect(screen.getByText('Algorithm legend')).toBeInTheDocument();
    expect(screen.getByText('Algorithm step log')).toBeInTheDocument();
    expect(screen.getByText(/Settle Main Entrance at 0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run trace' })).toBeInTheDocument();
  });

  it('cannot avoid the start or end point', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Avoid Main Entrance' }));

    expect(screen.getByText('You cannot avoid the start or end point.')).toBeInTheDocument();
  });

  it('toggles a neutral node as avoided from the map', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Avoid Hostel A' }));

    expect(screen.getByRole('button', { name: 'Unavoid Hostel A' })).toBeInTheDocument();
    expect(screen.getByText(/Skipping Hostel A/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unavoid Hostel A' }));
    expect(screen.getByRole('button', { name: 'Avoid Hostel A' })).toBeInTheDocument();
  });

  it('swaps source and destination', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByLabelText('Swap source and destination'));

    const sourceSelect = screen.getByLabelText('Source') as HTMLSelectElement;
    const destinationSelect = screen.getByLabelText('Destination') as HTMLSelectElement;
    expect(sourceSelect.value).toBe('Library');
    expect(destinationSelect.value).toBe('Main_Gate');
  });
});