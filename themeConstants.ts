export const THEME = {
  background: '#0B0E11',
  primaryAccent: '#00FF9D',
  surfaceLayer: 'rgba(255, 255, 255, 0.05)',
  surfaceBackdropBlur: '12px',
} as const;

export interface Node {
  name: string;
  x: number;
  y: number;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
  tags?: string[];
}

export const CAMPUS_NODES: Node[] = [
  { name: 'Library', x: 15, y: 30 },
  { name: 'Cafeteria', x: 45, y: 20 },
  { name: 'Science_Lab', x: 50, y: 55 },
  { name: 'Hostel_A', x: 20, y: 75 },
  { name: 'Auditorium', x: 75, y: 80 },
  { name: 'Main_Gate', x: 85, y: 40 },
];

export const CAMPUS_EDGES: Edge[] = [
  { from: 'Library', to: 'Cafeteria', weight: 2, tags: ['standard-route'] },
  { from: 'Cafeteria', to: 'Science_Lab', weight: 3, tags: ['standard-route'] },
  { from: 'Science_Lab', to: 'Main_Gate', weight: 4, tags: ['standard-route'] },
  { from: 'Library', to: 'Hostel_A', weight: 5, tags: ['standard-route'] },
  { from: 'Hostel_A', to: 'Auditorium', weight: 2, tags: ['standard-route'] },
  { from: 'Auditorium', to: 'Main_Gate', weight: 1, tags: ['standard-route'] },
];
