import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Edge, Node, THEME } from '../data/themeConstants';
import { formatNodeLabel } from '../data/nodeLabels';

export interface TraceStepSceneState {
  step: number;
  totalSteps: number;
  currentSettledNode: string | null;
  settledNodes: string[];
  frontierNodes: string[];
  relaxedEdges: string[];
  distances: ReadonlyArray<{ node: string; distance: number }>;
  finished: boolean;
}

export interface RouteScene3DProps {
  nodes: Node[];
  edges: Edge[];
  campusEdges?: Edge[];
  activePath: string[];
  avoidNodes: string[];
  stepIndex: number;
  zoomLevel?: number;
  isThreeDimensional?: boolean;
  variant?: 'framed' | 'background';
  showHud?: boolean;
  traceState?: TraceStepSceneState | null;
  traceEndpoints?: string[];
  showWeightLabels?: boolean;
  onNodeClick?: (nodeName: string) => void;
}

const WORLD_WIDTH = 22;
const WORLD_DEPTH = 14.5;
const PRIMARY_COLOR = new THREE.Color(THEME.primaryAccent);
const BASE_LINE_COLOR = new THREE.Color('#52606D');
const TRACE_COLOR = new THREE.Color('#38BDF8');
const CAMPUS_BUILDINGS = [
  { x: 38, y: 13, width: 15, height: 10, rotate: -4, windows: 10 },
  { x: 74, y: 12, width: 15, height: 12, rotate: 4, windows: 12 },
  { x: 26, y: 32, width: 13, height: 9, rotate: -7, windows: 8 },
  { x: 71, y: 61, width: 14, height: 10, rotate: -5, windows: 10 },
  { x: 39, y: 70, width: 12, height: 8, rotate: 5, windows: 8 },
  { x: 55, y: 37, width: 9, height: 6, rotate: 3, windows: 5 },
] as const;
const VISUAL_NODE_POINTS: Record<string, { x: number; y: number }> = {
  Main_Gate: { x: 31, y: 67 },
  Auditorium: { x: 47, y: 55 },
  Hostel_A: { x: 59, y: 46 },
  Library: { x: 80, y: 23 },
  Cafeteria: { x: 40, y: 30 },
  Science_Lab: { x: 64, y: 63 },
};
const CAMPUS_MAP_POINTS = [
  { id: 'p1', x: 27, y: 23 },
  { id: 'p2', x: 33, y: 36 },
  { id: 'p3', x: 42, y: 40 },
  { id: 'p4', x: 52, y: 28 },
  { id: 'p5', x: 63, y: 25 },
  { id: 'p6', x: 73, y: 34 },
  { id: 'p7', x: 82, y: 37 },
  { id: 'p8', x: 88, y: 50 },
  { id: 'p9', x: 76, y: 52 },
  { id: 'p10', x: 69, y: 59 },
  { id: 'p11', x: 59, y: 64 },
  { id: 'p12', x: 49, y: 70 },
  { id: 'p13', x: 39, y: 62 },
  { id: 'p14', x: 31, y: 52 },
  { id: 'p15', x: 24, y: 43 },
  { id: 'p16', x: 22, y: 58 },
  { id: 'p17', x: 66, y: 42 },
  { id: 'p18', x: 72, y: 26 },
  { id: 'p19', x: 85, y: 64 },
] as const;
const CAMPUS_MAP_POINT_LOOKUP: Map<string, { x: number; y: number }> = new Map(
  CAMPUS_MAP_POINTS.map((point) => [point.id, point])
);
const DECORATIVE_LINKS = [
  ['p1', 'p2'],
  ['p2', 'p3'],
  ['p3', 'p4'],
  ['p4', 'p5'],
  ['p5', 'p6'],
  ['p6', 'p7'],
  ['p7', 'p8'],
  ['p8', 'p9'],
  ['p9', 'p10'],
  ['p10', 'p11'],
  ['p11', 'p12'],
  ['p12', 'p13'],
  ['p13', 'p14'],
  ['p14', 'p15'],
  ['p15', 'p2'],
  ['p16', 'p14'],
  ['p3', 'p13'],
  ['p4', 'p17'],
  ['p17', 'p10'],
  ['p18', 'p6'],
  ['p18', 'Library'],
  ['p19', 'p9'],
  ['Science_Lab', 'p11'],
  ['Cafeteria', 'p2'],
] as const;
const CAMPUS_TREES = [
  { x: 31, y: 18 },
  { x: 45, y: 18 },
  { x: 58, y: 20 },
  { x: 68, y: 18 },
  { x: 84, y: 27 },
  { x: 22, y: 33 },
  { x: 35, y: 49 },
  { x: 51, y: 49 },
  { x: 63, y: 49 },
  { x: 73, y: 45 },
  { x: 82, y: 55 },
  { x: 45, y: 82 },
  { x: 57, y: 75 },
  { x: 68, y: 73 },
  { x: 77, y: 72 },
  { x: 88, y: 43 },
] as const;
const CAMPUS_LAWNS = [
  { x: 88, y: 43, width: 11, depth: 8, rotate: -3 },
  { x: 66, y: 55, width: 8, depth: 7, rotate: 7 },
  { x: 76, y: 30, width: 9, depth: 5, rotate: 2 },
] as const;

function getContainerClass(variant: RouteScene3DProps['variant']): string {
  return variant === 'background'
    ? 'absolute inset-0 overflow-hidden bg-[#02080B]'
    : 'relative min-h-[520px] overflow-hidden rounded-[22px] border border-emerald-300/15 bg-[#06110D] shadow-2xl shadow-emerald-950/30 lg:min-h-[660px]';
}

function getScenePoint(node: Node, variant: RouteScene3DProps['variant']): { x: number; y: number } {
  if (variant === 'background') {
    return VISUAL_NODE_POINTS[node.name] ?? { x: 100 - node.x, y: node.y };
  }

  return {
    x: node.x,
    y: node.y,
  };
}

function getLabelPoint(
  node: Node,
  variant: RouteScene3DProps['variant'],
  activePath: string[]
): { x: number; y: number } {
  const point = getScenePoint(node, variant);

  if (variant === 'background' && activePath[0] === node.name && point.x < 32) {
    return { x: 31, y: 59 };
  }

  if (variant === 'background' && activePath[activePath.length - 1] === node.name) {
    return { x: Math.min(point.x, 83), y: Math.max(point.y - 7, 12) };
  }

  return point;
}

function getCampusMapPoint(id: string, nodes: Node[], variant: RouteScene3DProps['variant']): { x: number; y: number } | null {
  const decorativePoint = CAMPUS_MAP_POINT_LOOKUP.get(id);
  if (decorativePoint) {
    return decorativePoint;
  }

  const graphNode = nodes.find((node) => node.name === id);
  return graphNode ? getScenePoint(graphNode, variant) : null;
}

function getWorldPosition(point: { x: number; y: number }, y = 0): THREE.Vector3 {
  return new THREE.Vector3(
    ((point.x - 50) / 100) * WORLD_WIDTH,
    y,
    ((point.y - 50) / 100) * WORLD_DEPTH
  );
}

function getNodePosition(node: Node, variant: RouteScene3DProps['variant'], y = 0.42): THREE.Vector3 {
  return getWorldPosition(getScenePoint(node, variant), y);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function clearGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function createSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  material: THREE.Material,
  radius: number
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 18);
  const segment = new THREE.Mesh(geometry, material);

  segment.position.copy(start).add(end).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

  return segment;
}

function createBuilding(building: (typeof CAMPUS_BUILDINGS)[number]): THREE.Group {
  const group = new THREE.Group();
  const buildingCenter = getWorldPosition({ x: building.x + building.width / 2, y: building.y + building.height / 2 });
  const width = building.width * 0.2;
  const depth = building.height * 0.16;
  const height = 1.12 + building.height * 0.055;
  const rotationY = THREE.MathUtils.degToRad(building.rotate * 1.8);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#17242D',
    roughness: 0.58,
    metalness: 0.08,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: '#263844',
    roughness: 0.5,
    metalness: 0.16,
  });
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: '#FFD777',
    transparent: true,
    opacity: 0.88,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.08, depth * 1.04), roofMaterial);
  roof.position.y = height + 0.04;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  for (let index = 0; index < building.windows; index += 1) {
    const column = index % 6;
    const row = Math.floor(index / 6);
    const localX = -width * 0.38 + column * (width * 0.15);
    const localY = 0.36 + row * 0.24;
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.02), windowMaterial.clone());
    windowMesh.position.set(localX, localY, depth / 2 + 0.012);
    group.add(windowMesh);
  }

  group.position.set(buildingCenter.x, 0, buildingCenter.z);
  group.rotation.y = rotationY;

  return group;
}

function createTree(tree: { x: number; y: number }): THREE.Group {
  const group = new THREE.Group();
  const position = getWorldPosition(tree);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: '#243428', roughness: 0.9 })
  );
  trunk.position.y = 0.11;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#234C3A', roughness: 0.85 })
  );
  canopy.position.y = 0.42;
  trunk.castShadow = true;
  canopy.castShadow = true;
  group.add(trunk, canopy);
  group.position.copy(position);
  return group;
}

function createNodeHub(position: THREE.Vector3, active: boolean, avoided: boolean, frontier = false): THREE.Group {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: avoided ? '#7F1D1D' : frontier ? '#0C4A6E' : active ? THEME.primaryAccent : '#1A252B',
    emissive: avoided ? '#7F1D1D' : frontier ? '#38BDF8' : active ? THEME.primaryAccent : '#020B0D',
    emissiveIntensity: active ? 1.9 : frontier ? 1.1 : 0.15,
    roughness: 0.35,
    metalness: 0.12,
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: active ? '#DFFFEF' : frontier ? '#E0F2FE' : '#D7E3E6',
    emissive: active ? THEME.primaryAccent : frontier ? '#0EA5E9' : '#000000',
    emissiveIntensity: active ? 0.9 : frontier ? 0.55 : 0,
    roughness: 0.2,
    metalness: 0.35,
  });
  const isExpanded = active || frontier;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(isExpanded ? 0.42 : 0.3, isExpanded ? 0.42 : 0.3, 0.15, 28),
    ringMaterial
  );
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(isExpanded ? 0.25 : 0.17, isExpanded ? 0.25 : 0.17, 0.055, 28),
    capMaterial
  );
  base.position.y = 0.08;
  cap.position.y = 0.18;
  base.castShadow = true;
  cap.castShadow = true;
  group.add(base, cap);
  group.position.copy(position);
  return group;
}

function createRouteGlow(start: THREE.Vector3, end: THREE.Vector3, active: boolean, color = PRIMARY_COLOR): THREE.Group {
  const group = new THREE.Group();
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: active ? 0.46 : 0.05,
  });
  const coreMaterial = active
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({
        color: '#91A0A6',
        emissive: '#050B0E',
        emissiveIntensity: 0.1,
        roughness: 0.22,
        metalness: 0.18,
        transparent: true,
        opacity: 0.44,
      });
  const glow = createSegment(start, end, glowMaterial, active ? 0.42 : 0.08);
  const core = createSegment(start, end, coreMaterial, active ? 0.16 : 0.028);
  glow.castShadow = false;
  core.castShadow = true;
  group.add(glow, core);
  return group;
}

function buildActiveEdgeSet(activePath: string[], stepIndex: number): Set<string> {
  const activeEdges = new Set<string>();
  const maxSegmentIndex = Math.min(stepIndex, activePath.length - 1);

  for (let index = 0; index < maxSegmentIndex; index += 1) {
    activeEdges.add(`${activePath[index]}->${activePath[index + 1]}`);
    activeEdges.add(`${activePath[index + 1]}->${activePath[index]}`);
  }

  return activeEdges;
}

function getVisiblePath(activePath: string[], stepIndex: number): string[] {
  if (activePath.length === 0) {
    return [];
  }

  return activePath.slice(0, Math.min(stepIndex + 1, activePath.length));
}

export function RouteScene3D({
  nodes,
  edges,
  activePath,
  avoidNodes,
  stepIndex,
  zoomLevel = 1,
  isThreeDimensional = true,
  variant = 'framed',
  showHud = true,
  traceState = null,
  traceEndpoints = [],
  showWeightLabels = false,
  campusEdges,
  onNodeClick,
}: RouteScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphGroupRef = useRef<THREE.Group | null>(null);
  const staticLayerGroupRef = useRef<THREE.Group | null>(null);
  const routeLayerGroupRef = useRef<THREE.Group | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const rendererCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRendererUnavailable, setIsRendererUnavailable] = useState(false);

  const sceneState = useMemo(() => {
    const activeEdges = buildActiveEdgeSet(activePath, stepIndex);
    const visiblePath = getVisiblePath(activePath, stepIndex);
    const activeNodeSet = new Set(visiblePath);
    const currentNode = activePath[Math.min(stepIndex, activePath.length - 1)];
    const avoidNodeSet = new Set(avoidNodes);

    return { activeEdges, activeNodeSet, currentNode, avoidNodeSet };
  }, [activePath, avoidNodes, stepIndex]);

  const traceSceneState = useMemo(() => {
    const relaxedEdges = new Set<string>();

    for (const key of traceState?.relaxedEdges ?? []) {
      const [from, to] = key.split('->');
      if (from && to) {
        relaxedEdges.add(`${from}->${to}`);
        relaxedEdges.add(`${to}->${from}`);
      }
    }

    return {
      settledNodes: new Set(traceState?.settledNodes ?? []),
      frontierNodes: new Set(traceState?.frontierNodes ?? []),
      relaxedEdges,
    };
  }, [traceState]);

  useEffect(() => {
    if (isRendererUnavailable) {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#02080B', 0.045);

    const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 80);
    if (isThreeDimensional) {
      camera.up.set(0, 1, 0);
      camera.position.set(-0.4, 11.2, 10.4);
    } else {
      camera.up.set(0, 0, -1);
      camera.position.set(0, 16, 0.01);
    }
    camera.lookAt(0.3, 0, 0.2);

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setIsRendererUnavailable(true);
      return undefined;
    }

    renderer.setClearColor('#02080B', 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.setAttribute('data-testid', 'route-3d-canvas');
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '18',
      width: '100%',
      height: '100%',
      opacity: '1',
      pointerEvents: 'none',
    });
    renderer.domElement.style.transform = `scale(${zoomLevel})`;
    renderer.domElement.style.transformOrigin = '58% 46%';
    rendererCanvasRef.current = renderer.domElement;
    container.appendChild(renderer.domElement);

    const graphGroup = new THREE.Group();
    graphGroupRef.current = graphGroup;
    scene.add(graphGroup);

    const staticLayer = new THREE.Group();
    staticLayerGroupRef.current = staticLayer;
    graphGroup.add(staticLayer);

    const routeLayer = new THREE.Group();
    routeLayerGroupRef.current = routeLayer;
    graphGroup.add(routeLayer);

    const grid = new THREE.GridHelper(28, 28, '#1ED99A', '#17332D');
    grid.position.y = -0.02;
    grid.material.opacity = 0.16;
    grid.material.transparent = true;
    scene.add(grid);

    const ambient = new THREE.HemisphereLight('#A7FFE2', '#06120F', 1.6);
    const keyLight = new THREE.DirectionalLight('#FFFFFF', 2.25);
    keyLight.position.set(-5, 11, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 40;
    const fillLight = new THREE.PointLight(THEME.primaryAccent, 4.2, 24);
    fillLight.position.set(2.4, 3.6, -1.2);
    scene.add(ambient, keyLight, fillLight);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const aspect = width / height;
      const viewHeight = isThreeDimensional
        ? variant === 'background'
          ? 12.4
          : 11.2
        : variant === 'background'
          ? 15.2
          : 13.8;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      renderer.setSize(width, height);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const clock = new THREE.Clock();
    let animationFrame = 0;
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      if (markerRef.current && !prefersReducedMotion) {
        markerRef.current.position.y = 0.9 + Math.sin(elapsed * 5) * 0.08;
        markerRef.current.rotation.y += 0.035;
      }

      if (!prefersReducedMotion) {
        graphGroup.rotation.y = isThreeDimensional ? Math.sin(elapsed * 0.12) * 0.018 : 0;
      }

      camera.lookAt(0.3, 0, 0.2);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      clearGroup(graphGroup);
      scene.remove(graphGroup);
      scene.remove(grid, ambient, keyLight, fillLight);
      disposeObject(grid);
      renderer.dispose();
      renderer.domElement.remove();
      graphGroupRef.current = null;
      staticLayerGroupRef.current = null;
      routeLayerGroupRef.current = null;
      markerRef.current = null;
      rendererCanvasRef.current = null;
    };
  }, [isRendererUnavailable, isThreeDimensional, variant]);

  useEffect(() => {
    const canvas = rendererCanvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.style.transform = `scale(${zoomLevel})`;
    canvas.style.transformOrigin = '58% 46%';
  }, [zoomLevel]);

  useEffect(() => {
    const graphGroup = staticLayerGroupRef.current;
    if (!graphGroup) {
      return;
    }

    clearGroup(graphGroup);

    const nodePointMap = new Map(nodes.map((node) => [node.name, getScenePoint(node, variant)]));

    const isNearNode = (point: { x: number; y: number }) =>
      Array.from(nodePointMap.values()).some(
        (nodePoint) => Math.abs(nodePoint.x - point.x) < 3 && Math.abs(nodePoint.y - point.y) < 3
      );

    const roadDeckMaterial = new THREE.MeshBasicMaterial({
      color: '#D5DEE0',
      transparent: true,
      opacity: 0.16,
    });
    const roadCoreMaterial = new THREE.MeshStandardMaterial({
      color: BASE_LINE_COLOR,
      emissive: '#101B1E',
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.78,
      roughness: 0.38,
      metalness: 0.16,
    });
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: '#071416',
      roughness: 0.82,
      metalness: 0.02,
    });
    const lawnMaterial = new THREE.MeshStandardMaterial({
      color: '#123B31',
      emissive: '#031712',
      emissiveIntensity: 0.2,
      roughness: 0.86,
    });

    const ground = new THREE.Mesh(new THREE.BoxGeometry(28, 0.08, 17.5), groundMaterial);
    ground.position.set(0, -0.08, 0.2);
    ground.receiveShadow = true;
    graphGroup.add(ground);

    for (const lawn of CAMPUS_LAWNS) {
      const lawnPosition = getWorldPosition(lawn);
      const lawnMesh = new THREE.Mesh(new THREE.BoxGeometry(lawn.width * 0.18, 0.035, lawn.depth * 0.13), lawnMaterial);
      lawnMesh.position.set(lawnPosition.x, 0.01, lawnPosition.z);
      lawnMesh.rotation.y = THREE.MathUtils.degToRad(lawn.rotate);
      lawnMesh.receiveShadow = true;
      graphGroup.add(lawnMesh);
    }

    for (const [fromId, toId] of DECORATIVE_LINKS) {
      const fromPoint = getCampusMapPoint(fromId, nodes, variant);
      const toPoint = getCampusMapPoint(toId, nodes, variant);

      if (!fromPoint || !toPoint) {
        continue;
      }

      const start = getWorldPosition(fromPoint, 0.06);
      const end = getWorldPosition(toPoint, 0.06);
      const roadDeck = createSegment(start, end, roadDeckMaterial.clone(), 0.075);
      const roadCore = createSegment(start.clone().setY(0.1), end.clone().setY(0.1), roadCoreMaterial.clone(), 0.028);
      roadDeck.receiveShadow = true;
      roadCore.receiveShadow = true;
      graphGroup.add(roadDeck, roadCore);
    }

    for (const building of CAMPUS_BUILDINGS) {
      graphGroup.add(createBuilding(building));
    }

    for (const tree of CAMPUS_TREES) {
      graphGroup.add(createTree(tree));
    }

    for (const point of CAMPUS_MAP_POINTS) {
      if (!isNearNode(point)) {
        graphGroup.add(createNodeHub(getWorldPosition(point, 0.07), false, false));
      }
    }

    for (const edge of campusEdges ?? edges) {
      const fromPoint = nodePointMap.get(edge.from);
      const toPoint = nodePointMap.get(edge.to);

      if (!fromPoint || !toPoint) {
        continue;
      }

      const segment = createRouteGlow(
        getWorldPosition(fromPoint, 0.12),
        getWorldPosition(toPoint, 0.12),
        false
      );
      graphGroup.add(segment);
    }
  }, [isRendererUnavailable, isThreeDimensional, nodes, campusEdges, variant]);

  useEffect(() => {
    const routeLayer = routeLayerGroupRef.current;
    if (!routeLayer) {
      return;
    }

    clearGroup(routeLayer);
    markerRef.current = null;

    const nodeMap = new Map(nodes.map((node) => [node.name, node]));
    const visiblePath = getVisiblePath(activePath, stepIndex);
    const activeNodes = new Set(visiblePath);

    for (const edge of campusEdges ?? edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);

      if (!fromNode || !toNode) {
        continue;
      }

      const edgeKey = `${edge.from}->${edge.to}`;
      const isActiveEdge = sceneState.activeEdges.has(edgeKey);
      const isTraceRelaxedEdge = traceSceneState.relaxedEdges.has(edgeKey);

      if (!isActiveEdge && !isTraceRelaxedEdge) {
        continue;
      }

      const segment = createRouteGlow(
        getNodePosition(fromNode, variant, 0.22),
        getNodePosition(toNode, variant, 0.22),
        true,
        isTraceRelaxedEdge ? TRACE_COLOR : PRIMARY_COLOR
      );
      routeLayer.add(segment);
    }

    for (const node of nodes) {
      const isActive = activeNodes.has(node.name) || traceSceneState.settledNodes.has(node.name);
      const isAvoided = sceneState.avoidNodeSet.has(node.name);
      const isFrontier = traceSceneState.frontierNodes.has(node.name);
      routeLayer.add(createNodeHub(getNodePosition(node, variant, 0.08), isActive, isAvoided, isFrontier));
    }

    const markerNodeName = sceneState.currentNode ?? traceState?.currentSettledNode ?? null;
    const currentNode = markerNodeName ? nodeMap.get(markerNodeName) : undefined;

    if (currentNode) {
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        emissive: traceState ? TRACE_COLOR : PRIMARY_COLOR,
        emissiveIntensity: 2.4,
        metalness: 0.2,
        roughness: 0.18,
      });
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), markerMaterial);
      marker.position.copy(getNodePosition(currentNode, variant, 0.92));
      markerRef.current = marker;
      routeLayer.add(marker);
    }

    const destinationName =
      activePath.length > 0 ? activePath[activePath.length - 1] : traceEndpoints[traceEndpoints.length - 1];
    const destinationNode = destinationName ? nodeMap.get(destinationName) : undefined;

    if (destinationNode && variant === 'background') {
      const destinationPosition = getNodePosition(destinationNode, variant, 1.1);
      const pinGroup = new THREE.Group();
      const pinHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 24, 18),
        new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          emissive: THEME.primaryAccent,
          emissiveIntensity: 1.8,
          roughness: 0.22,
        })
      );
      const pinTail = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.58, 24),
        new THREE.MeshStandardMaterial({
          color: THEME.primaryAccent,
          emissive: THEME.primaryAccent,
          emissiveIntensity: 1.8,
          roughness: 0.22,
        })
      );
      pinHead.position.y = 0.2;
      pinTail.position.y = -0.18;
      pinTail.rotation.x = Math.PI;
      pinGroup.add(pinHead, pinTail);
      pinGroup.position.copy(destinationPosition);
      pinGroup.castShadow = true;
      routeLayer.add(pinGroup);
    }
  }, [isRendererUnavailable, isThreeDimensional, nodes, edges, activePath, avoidNodes, stepIndex, sceneState, traceSceneState, traceState, traceEndpoints, variant]);

  const currentStepLabel =
    activePath.length > 0 ? `Step ${Math.min(stepIndex + 1, activePath.length)} of ${activePath.length}` : 'Preview';
  const routeEndpoints = new Set([
    ...(activePath.length > 0 ? [activePath[0], activePath[activePath.length - 1]] : []),
    ...traceEndpoints,
  ]);
  const traceDistancesByName = new Map(
    (traceState?.distances ?? []).map(({ node, distance }) => [node, distance])
  );
  const zoomedLayerStyle = {
    transform: `scale(${zoomLevel})`,
    transformOrigin: '58% 46%',
  };

  return (
    <div ref={containerRef} className={getContainerClass(variant)} data-testid="route-3d-stage">
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_67%_28%,rgba(0,255,157,0.18),transparent_25%),radial-gradient(circle_at_24%_68%,rgba(0,255,157,0.14),transparent_18%),linear-gradient(145deg,rgba(2,8,11,0.9),rgba(5,18,23,0.98)_52%,rgba(1,5,8,1))]" />
      <div className="absolute inset-x-0 top-0 z-[1] h-40 bg-[linear-gradient(180deg,rgba(0,0,0,0.56),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 z-[1] h-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.5))]" />

      {showHud ? (
        <div className="pointer-events-none absolute inset-x-5 top-5 z-30 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-white/72">
          <span>3D pathway</span>
          <span>{currentStepLabel}</span>
        </div>
      ) : null}

      <div
        className={`absolute inset-[4%] z-20 route-perspective ${isRendererUnavailable ? '' : 'route-svg-support'}`}
        style={zoomedLayerStyle}
      >
        <svg
          className={`h-full w-full ${isThreeDimensional ? 'route-plane' : 'route-plane-flat'}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter id="routeGlow" x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="floorGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,255,157,0.08)" strokeWidth="0.25" />
            </pattern>
          </defs>

          <rect width="100" height="100" fill="url(#floorGrid)" opacity="0.72" />

          {variant === 'background' ? (
            <g>
              <g opacity="0.45">
                <rect x="84" y="38" width="13" height="11" rx="0.8" fill="rgba(22,50,43,0.7)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.35" />
                <line x1="85.5" y1="43.5" x2="95.5" y2="43.5" stroke="rgba(148,163,184,0.35)" strokeWidth="0.25" />
                <line x1="90.5" y1="39" x2="90.5" y2="48.8" stroke="rgba(148,163,184,0.3)" strokeWidth="0.25" />
                <circle cx="90.5" cy="43.5" r="2.1" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="0.25" />
              </g>

              {DECORATIVE_LINKS.map(([fromId, toId]) => {
                const fromPoint = getCampusMapPoint(fromId, nodes, variant);
                const toPoint = getCampusMapPoint(toId, nodes, variant);

                if (!fromPoint || !toPoint) {
                  return null;
                }

                return (
                  <g key={`${fromId}-${toId}`}>
                    <line
                      x1={fromPoint.x}
                      y1={fromPoint.y}
                      x2={toPoint.x}
                      y2={toPoint.y}
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    <line
                      x1={fromPoint.x}
                      y1={fromPoint.y}
                      x2={toPoint.x}
                      y2={toPoint.y}
                      stroke="rgba(148,163,184,0.5)"
                      strokeWidth="0.42"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {CAMPUS_BUILDINGS.map((building, index) => (
                <g key={`${building.x}-${building.y}`} transform={`translate(${building.x} ${building.y}) rotate(${building.rotate})`}>
                  <rect
                    x={-0.7}
                    y={1.2}
                    width={building.width + 1.2}
                    height={building.height + 1.1}
                    rx="0.5"
                    fill="rgba(0,0,0,0.28)"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={building.width}
                    height={building.height}
                    rx="0.45"
                    fill="rgba(16,30,38,0.96)"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="0.28"
                  />
                  <rect
                    x="0.5"
                    y="0.5"
                    width={building.width - 1}
                    height={Math.max(2.2, building.height * 0.32)}
                    rx="0.28"
                    fill="rgba(38,52,62,0.92)"
                  />
                  {Array.from({ length: building.windows }, (_, windowIndex) => {
                    const column = windowIndex % 5;
                    const row = Math.floor(windowIndex / 5);
                    return (
                      <rect
                        key={`${index}-${windowIndex}`}
                        x={1.1 + column * 2.35}
                        y={building.height * 0.46 + row * 1.8}
                        width="1.25"
                        height="0.72"
                        rx="0.12"
                        fill="rgba(255,213,120,0.82)"
                      />
                    );
                  })}
                </g>
              ))}

              <g opacity="0.7">
                <circle cx="66" cy="55" r="4.3" fill="rgba(18,31,39,0.94)" stroke="rgba(255,255,255,0.14)" strokeWidth="0.34" />
                <circle cx="66" cy="55" r="2.8" fill="rgba(42,49,55,0.9)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.25" />
              </g>

              {CAMPUS_TREES.map((tree) => (
                <g key={`${tree.x}-${tree.y}`} opacity="0.62">
                  <circle cx={tree.x} cy={tree.y} r="1.2" fill="rgba(54,86,73,0.88)" />
                  <circle cx={tree.x + 0.65} cy={tree.y + 0.34} r="0.9" fill="rgba(34,64,54,0.9)" />
                  <circle cx={tree.x - 0.52} cy={tree.y + 0.44} r="0.8" fill="rgba(30,54,48,0.88)" />
                </g>
              ))}

              {CAMPUS_MAP_POINTS.map((point) => (
                <g key={point.id}>
                  <circle cx={point.x} cy={point.y} r="2.15" fill="rgba(0,0,0,0.34)" />
                  <circle cx={point.x} cy={point.y} r="1.55" fill="rgba(16,29,34,0.96)" stroke="rgba(226,232,240,0.7)" strokeWidth="0.28" />
                </g>
              ))}
            </g>
          ) : null}

          {edges.map((edge) => {
            const fromNode = nodes.find((node) => node.name === edge.from);
            const toNode = nodes.find((node) => node.name === edge.to);

            if (!fromNode || !toNode) {
              return null;
            }

            const isActive = sceneState.activeEdges.has(`${edge.from}->${edge.to}`);
            const isTraceRelaxed = traceSceneState.relaxedEdges.has(`${edge.from}->${edge.to}`);
            const edgeTone = isActive || isTraceRelaxed;
            const edgeColor = isTraceRelaxed ? 'rgba(56,189,248,0.85)' : THEME.primaryAccent;
            const fromPoint = getScenePoint(fromNode, variant);
            const toPoint = getScenePoint(toNode, variant);

            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={fromPoint.x}
                  y1={fromPoint.y}
                  x2={toPoint.x}
                  y2={toPoint.y}
                  stroke={edgeTone ? 'rgba(0,255,157,0.22)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={edgeTone ? 5.3 : 1.2}
                  strokeLinecap="round"
                />
                <line
                  className={edgeTone ? 'route-segment-active' : undefined}
                  x1={fromPoint.x}
                  y1={fromPoint.y}
                  x2={toPoint.x}
                  y2={toPoint.y}
                  stroke={edgeTone ? edgeColor : 'rgba(255,255,255,0.26)'}
                  strokeWidth={edgeTone ? 2.2 : 0.55}
                  strokeLinecap="round"
                  filter={edgeTone ? 'url(#routeGlow)' : undefined}
                />
              </g>
            );
          })}

          {nodes.map((node) => {
            const isActive = sceneState.activeNodeSet.has(node.name) || traceSceneState.settledNodes.has(node.name);
            const isCurrent =
              (sceneState.currentNode ?? traceState?.currentSettledNode) === node.name;
            const isFrontier = traceSceneState.frontierNodes.has(node.name);
            const isAvoided = sceneState.avoidNodeSet.has(node.name);
            const isDestination = variant === 'background' && activePath[activePath.length - 1] === node.name;
            const point = getScenePoint(node, variant);

            return (
              <g key={node.name}>
                {isDestination ? (
                  <g transform={`translate(${point.x - 2.5} ${point.y - 9.2}) scale(0.22)`}>
                    <path
                      d="M12 1.5C6.76 1.5 2.5 5.76 2.5 11c0 7.2 9.5 16.5 9.5 16.5s9.5-9.3 9.5-16.5c0-5.24-4.26-9.5-9.5-9.5Z"
                      fill="white"
                    />
                    <path
                      d="M12 4C8.14 4 5 7.14 5 11c0 4.66 4.6 10.55 7 13.25 2.4-2.7 7-8.59 7-13.25 0-3.86-3.14-7-7-7Z"
                      fill={THEME.primaryAccent}
                    />
                    <circle cx="12" cy="11" r="3.2" fill="white" />
                  </g>
                ) : null}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isCurrent ? 3.6 : isActive || isFrontier ? 2.8 : 1.8}
                  fill={
                    isAvoided
                      ? 'rgba(248,113,113,0.26)'
                      : isCurrent
                        ? 'rgba(56,189,248,0.2)'
                        : isActive
                          ? 'rgba(0,255,157,0.22)'
                          : isFrontier
                            ? 'rgba(56,189,248,0.18)'
                            : 'rgba(255,255,255,0.12)'
                  }
                />
                <circle
                  className={isCurrent ? 'route-node-current' : undefined}
                  cx={point.x}
                  cy={point.y}
                  r={isCurrent ? 1.8 : isActive ? 1.45 : isFrontier ? 1.3 : 1.05}
                  fill={
                    isAvoided ? '#F87171'
                    : isCurrent ? '#38BDF8'
                    : isFrontier ? '#38BDF8'
                    : isActive ? THEME.primaryAccent
                    : '#E5EEF2'
                  }
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30" style={zoomedLayerStyle}>
        {nodes.map((node) => {
          const isActive =
            sceneState.activeNodeSet.has(node.name) || traceSceneState.settledNodes.has(node.name);
          const isCurrent = (sceneState.currentNode ?? traceState?.currentSettledNode) === node.name;
          const isFrontier = traceSceneState.frontierNodes.has(node.name);
          const isAvoided = sceneState.avoidNodeSet.has(node.name);
          const point = getLabelPoint(node, variant, activePath);
          const shouldShowLabel =
            variant !== 'background' || routeEndpoints.has(node.name) || isCurrent || isAvoided || isFrontier;

          if (!shouldShowLabel) {
            return null;
          }

          return (
            <React.Fragment key={node.name}>
              <span
                className="absolute rounded-md border px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: isAvoided
                    ? 'rgba(248, 113, 113, 0.55)'
                    : isCurrent
                      ? 'rgba(56,189,248,0.8)'
                      : isActive
                        ? `${THEME.primaryAccent}66`
                        : 'rgba(255, 255, 255, 0.14)',
                  backgroundColor: isAvoided
                    ? 'rgba(127, 29, 29, 0.72)'
                    : isActive
                      ? 'rgba(0, 255, 157, 0.18)'
                      : isFrontier
                        ? 'rgba(14, 116, 144, 0.72)'
                        : 'rgba(3, 12, 9, 0.76)',
                  boxShadow: isCurrent ? '0 0 26px rgba(56,189,248,0.55)' : 'none',
                  color: isActive || isCurrent ? '#E9FFF6' : 'rgba(255, 255, 255, 0.84)',
                }}
              >
                {formatNodeLabel(node.name)}
              </span>
              {traceState && traceDistancesByName.has(node.name) && !isCurrent ? (
                <span
                  className="absolute rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums"
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y + 3}%`,
                    transform: 'translate(-50%, -50%)',
                    borderColor: isFrontier
                      ? 'rgba(56,189,248,0.55)'
                      : 'rgba(255,255,255,0.14)',
                    backgroundColor: isFrontier ? 'rgba(14,116,144,0.82)' : 'rgba(2,18,14,0.88)',
                    color: isFrontier ? '#BAE6FD' : 'rgba(255,255,255,0.74)',
                  }}
                >
                  d={traceDistancesByName.get(node.name)}
                </span>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      {showWeightLabels ? (
        <div className="pointer-events-none absolute inset-0 z-30" style={zoomedLayerStyle}>
          {edges.map((edge) => {
            const fromNode = nodes.find((node) => node.name === edge.from);
            const toNode = nodes.find((node) => node.name === edge.to);

            if (!fromNode || !toNode) {
              return null;
            }

            const fromPoint = getScenePoint(fromNode, variant);
            const toPoint = getScenePoint(toNode, variant);
            const isRelaxed = traceSceneState.relaxedEdges.has(`${edge.from}->${edge.to}`);
            const midX = (fromPoint.x + toPoint.x) / 2;
            const midY = (fromPoint.y + toPoint.y) / 2;

            return (
              <span
                key={`${edge.from}-${edge.to}`}
                className="absolute rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  left: `${midX}%`,
                  top: `${midY}%`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: isRelaxed ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.16)',
                  backgroundColor: isRelaxed ? 'rgba(14,116,144,0.85)' : 'rgba(3,12,9,0.82)',
                  color: isRelaxed ? '#BAE6FD' : 'rgba(255,255,255,0.72)',
                  boxShadow: isRelaxed ? `0 0 14px rgba(56,189,248,0.45)` : 'none',
                }}
              >
                {edge.weight}
              </span>
            );
          })}
        </div>
      ) : null}

      {onNodeClick ? (
        <div className="absolute inset-0 z-40" style={zoomedLayerStyle}>
          {nodes.map((node) => {
            const point = getScenePoint(node, variant);
            const isAvoided = sceneState.avoidNodeSet.has(node.name);

            return (
              <button
                key={node.name}
                type="button"
                onClick={() => onNodeClick(node.name)}
                aria-label={`${isAvoided ? 'Unavoid' : 'Avoid'} ${formatNodeLabel(node.name)}`}
                title={`${isAvoided ? 'Unavoid' : 'Avoid'} ${formatNodeLabel(node.name)}`}
                className="absolute flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#54F6BA]/70"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  width: '7%',
                  height: '7%',
                  minWidth: '30px',
                  minHeight: '30px',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: isAvoided ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: isAvoided ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
                }}
              >
                {isAvoided ? (
                  <svg className="pointer-events-none h-4 w-4 text-red-200" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
                    <path d="m7.5 7.5 9 9m-9 0 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showHud ? (
        <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-30 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">Animated trace</p>
            <p className="mt-1 text-sm font-medium text-white/82">
              {activePath.length > 0
                ? activePath.slice(0, Math.min(stepIndex + 1, activePath.length)).map(formatNodeLabel).join(' -> ')
                : 'Select a route'}
            </p>
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
            Route active
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RouteScene3D;
