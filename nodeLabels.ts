export function formatNodeLabel(nodeName: string): string {
  if (nodeName === 'Main_Gate') {
    return 'Main Entrance';
  }

  return nodeName.replace(/_/g, ' ');
}

export function getDisplayLabel(nodeName: string): string {
  return nodeName.replace(/_/g, ' ');
}