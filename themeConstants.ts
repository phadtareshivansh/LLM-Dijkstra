export const THEME = {
  background: '#0B0E11',
  primaryAccent: '#00FF9D',
  originAccent: '#38BDF8',
  destinationAccent: '#FBBF24',
  dangerAccent: '#F87171',
  surfaceLayer: 'rgba(255, 255, 255, 0.05)',
  surfaceBackdropBlur: '12px',
} as const;

export interface Node {
  name: string;
  x: number;
  y: number;
  elevation: number;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
  tags?: string[];
}

export const ACCESSIBLE_TAG = 'accessible';

export const CAMPUS_NODES: Node[] = [
  { name: 'Library', x: 15, y: 30, elevation: 22 },
  { name: 'Cafeteria', x: 45, y: 20, elevation: 18 },
  { name: 'Science_Lab', x: 50, y: 55, elevation: 34 },
  { name: 'Hostel_A', x: 20, y: 75, elevation: 41 },
  { name: 'Auditorium', x: 75, y: 80, elevation: 36 },
  { name: 'Main_Gate', x: 85, y: 40, elevation: 28 },
];

export const CAMPUS_EDGES: Edge[] = [
  { from: 'Library', to: 'Cafeteria', weight: 2, tags: ['standard-route', 'accessible'] },
  { from: 'Cafeteria', to: 'Science_Lab', weight: 3, tags: ['standard-route', 'accessible'] },
  { from: 'Science_Lab', to: 'Main_Gate', weight: 4, tags: ['standard-route', 'accessible'] },
  { from: 'Library', to: 'Hostel_A', weight: 5, tags: ['standard-route', 'accessible'] },
  { from: 'Hostel_A', to: 'Auditorium', weight: 2, tags: ['standard-route', 'accessible'] },
  { from: 'Auditorium', to: 'Main_Gate', weight: 1, tags: ['standard-route', 'stairs'] },
];
