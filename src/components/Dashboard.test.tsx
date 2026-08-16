import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

vi.mock('./RouteScene3D', () => {
  const nodeLabel = (name: string) =>
    name === 'Main_Gate' ? 'Main Entrance' : name.replace(/_/g, ' ');

  return {
    default: ({
      nodes,
      avoidNodes,
      onNodeClick,
    }: {
      nodes: { name: string }[];
      avoidNodes: string[];
      onNodeClick?: (nodeName: string) => void;
    }) => (
      <div data-testid="mock-scene">
        {nodes.map((node) => {
          const isAvoided = avoidNodes.includes(node.name);
          return (
            <button
              key={node.name}
              type="button"
              onClick={() => onNodeClick?.(node.name)}
              aria-label={`${isAvoided ? 'Unavoid' : 'Avoid'} ${nodeLabel(node.name)}`}
            />
          );
        })}
      </div>
    ),
  };
});

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

  it('cannot avoid the start or end point', async () => {
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Avoid Main Entrance' }));

    expect(screen.getByText('You cannot avoid the start or end point.')).toBeInTheDocument();
  });

  it('toggles a neutral node as avoided from the map', async () => {
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Avoid Hostel A' }));

    expect(await screen.findByRole('button', { name: 'Unavoid Hostel A' })).toBeInTheDocument();
    expect(screen.getByText(/Skipping Hostel A/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unavoid Hostel A' }));
    expect(await screen.findByRole('button', { name: 'Avoid Hostel A' })).toBeInTheDocument();
  });

  it('swaps source and destination', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByLabelText('Swap source and destination'));

    const sourceSelect = screen.getByLabelText('Source') as HTMLSelectElement;
    const destinationSelect = screen.getByLabelText('Destination') as HTMLSelectElement;
    expect(sourceSelect.value).toBe('Library');
    expect(destinationSelect.value).toBe('Main_Gate');
  });

  it('applies speed presets with the 1/2/3 keyboard shortcuts', () => {
    render(<Dashboard />);

    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByRole('button', { name: 'Slow' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByRole('button', { name: 'Fast' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores keyboard shortcuts while typing in a text field', () => {
    render(<Dashboard />);

    const aiInput = screen.getByLabelText('Ask AI to plan a route');
    fireEvent.keyDown(aiInput, { key: '3' });

    expect(screen.getByRole('button', { name: 'Fast' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the search algorithm to A*', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'A*' }));

    expect(screen.getByRole('button', { name: 'A*' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dijkstra' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the search algorithm to bidirectional Dijkstra', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Bi-Dijkstra' }));

    expect(screen.getByRole('button', { name: 'Bi-Dijkstra' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A*' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to peak-time weights and reroutes the trip', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Peak' }));

    expect(await screen.findAllByText(/14\.4 units/)).not.toHaveLength(0);
  });

  it('closes the cafeteria route at night', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Night' }));

    expect(await screen.findByText(/stops · 8 units/)).toBeTruthy();
  });

  it('reports expansion counts for every algorithm', () => {
    render(<Dashboard />);

    const panel = screen.getByText('Nodes expanded').parentElement;

    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText('Dijkstra')).toBeTruthy();
    expect(within(panel as HTMLElement).getByText('A*')).toBeTruthy();
    expect(within(panel as HTMLElement).getByText('Bi-Dijkstra')).toBeTruthy();
  });
});